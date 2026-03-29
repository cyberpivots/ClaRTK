use anyhow::{Context, Result, anyhow};
use chrono::{DateTime, Utc};
use clartk_nmea::NmeaSentence;
use postgres::{Client, NoTls, Transaction};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::collections::HashMap;
use std::env;
use std::fs;
use std::io::{BufRead, BufReader, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::{Arc, Mutex};

#[derive(Clone)]
struct GatewayConfig {
    host: String,
    port: u16,
    mode: String,
    runtime_database_url: Option<String>,
    fixture_path: Option<String>,
    serial_port: Option<String>,
    ntrip_url: Option<String>,
}

#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
struct PersistSummary {
    devices_persisted: usize,
    telemetry_positions_persisted: usize,
    rtk_solutions_persisted: usize,
}

#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
struct CaptureSummary {
    source_kind: String,
    sessions_persisted: usize,
    samples_persisted: usize,
    telemetry_positions_persisted: usize,
}

#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
struct ReplayState {
    fixture_ready: bool,
    last_replay_at: Option<String>,
    last_error: Option<String>,
    last_summary: Option<PersistSummary>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GatewayFixture {
    #[serde(default)]
    devices: Vec<FixtureDevice>,
    #[serde(default)]
    telemetry_positions: Vec<FixtureTelemetryPosition>,
    #[serde(default)]
    rtk_solutions: Vec<FixtureRtkSolution>,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FixtureDevice {
    external_id: String,
    hardware_family: String,
    firmware_version: Option<String>,
    #[serde(default)]
    config: Value,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FixtureTelemetryPosition {
    external_id: String,
    received_at: DateTime<Utc>,
    #[serde(default)]
    payload: Value,
    hardware_family: Option<String>,
    firmware_version: Option<String>,
    #[serde(default)]
    device_config: Value,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FixtureRtkSolution {
    external_id: String,
    observed_at: DateTime<Utc>,
    quality: String,
    #[serde(default)]
    summary: Value,
    hardware_family: Option<String>,
    firmware_version: Option<String>,
    #[serde(default)]
    device_config: Value,
}

impl GatewayConfig {
    fn from_env() -> Result<Self> {
        let port = env::var("CLARTK_GATEWAY_DIAGNOSTICS_PORT")
            .unwrap_or_else(|_| "3200".to_string())
            .parse::<u16>()
            .context("invalid CLARTK_GATEWAY_DIAGNOSTICS_PORT")?;

        Ok(Self {
            host: env::var("CLARTK_GATEWAY_DIAGNOSTICS_HOST")
                .unwrap_or_else(|_| "0.0.0.0".to_string()),
            port,
            mode: env::var("CLARTK_GATEWAY_MODE").unwrap_or_else(|_| "hybrid".to_string()),
            runtime_database_url: env::var("CLARTK_RUNTIME_DATABASE_URL").ok(),
            fixture_path: env::var("CLARTK_GATEWAY_FIXTURE_PATH")
                .ok()
                .filter(|value| !value.is_empty()),
            serial_port: env::var("CLARTK_GATEWAY_SERIAL_PORT")
                .ok()
                .filter(|value| !value.is_empty()),
            ntrip_url: env::var("CLARTK_GATEWAY_NTRIP_URL")
                .ok()
                .filter(|value| !value.is_empty()),
        })
    }

    fn active_inputs(&self) -> Vec<&'static str> {
        let mut active = Vec::new();

        if self.fixture_path.is_some() {
            active.push("fixture_replay");
        }
        if self.serial_port.is_some() {
            active.push("serial");
        }
        if self.ntrip_url.is_some() {
            active.push("ntrip");
        }

        active
    }
}

fn main() -> Result<()> {
    let config = GatewayConfig::from_env()?;
    let state = Arc::new(Mutex::new(ReplayState {
        fixture_ready: config.fixture_path.is_some(),
        ..ReplayState::default()
    }));

    let address = format!("{}:{}", config.host, config.port);
    let listener =
        TcpListener::bind(&address).with_context(|| format!("unable to bind {}", address))?;

    println!("ClaRTK RTK gateway diagnostics listening on {}", address);
    println!("Mode: {}", config.mode);
    println!(
        "Runtime database configured: {}",
        config.runtime_database_url.is_some()
    );
    println!("Supported adapters: ns-raw, px1122r");

    for stream in listener.incoming() {
        match stream {
            Ok(stream) => {
                if let Err(error) = handle_connection(stream, &config, &state) {
                    eprintln!("gateway diagnostics error: {error:#}");
                }
            }
            Err(error) => eprintln!("gateway diagnostics accept error: {error:#}"),
        }
    }

    Ok(())
}

fn handle_connection(
    mut stream: TcpStream,
    config: &GatewayConfig,
    state: &Arc<Mutex<ReplayState>>,
) -> Result<()> {
    let mut request_line = String::new();
    let mut reader = BufReader::new(stream.try_clone()?);
    reader.read_line(&mut request_line)?;

    let mut request_parts = request_line.split_whitespace();
    let method = request_parts.next().unwrap_or("GET");
    let path = request_parts.next().unwrap_or("/");

    match (method, path) {
        ("GET", "/health") => {
            respond_json(&mut stream, "HTTP/1.1 200 OK", build_health_body(config, state)?)?
        }
        ("GET", "/v1/inputs") => {
            respond_json(&mut stream, "HTTP/1.1 200 OK", build_inputs_body(config, state)?)?
        }
        ("GET", "/v1/persistence/status") => respond_json(
            &mut stream,
            "HTTP/1.1 200 OK",
            build_persistence_status(config, state)?,
        )?,
        ("POST", "/v1/replay/run") => match run_fixture_replay(config, state) {
            Ok(summary) => respond_json(
                &mut stream,
                "HTTP/1.1 200 OK",
                json!({
                    "status": "ok",
                    "fixturePath": config.fixture_path,
                    "summary": summary
                }),
            )?,
            Err(error) => {
                let error_message = format!("{error:#}");
                record_replay_error(state, &error_message)?;
                respond_json(
                    &mut stream,
                    "HTTP/1.1 500 Internal Server Error",
                    json!({
                        "status": "error",
                        "error": error_message
                    }),
                )?
            }
        },
        ("POST", "/v1/serial/capture/run") => match run_serial_capture(config) {
            Ok(summary) => respond_json(
                &mut stream,
                "HTTP/1.1 200 OK",
                json!({
                    "status": "ok",
                    "serialPort": config.serial_port,
                    "summary": summary
                }),
            )?,
            Err(error) => respond_json(
                &mut stream,
                "HTTP/1.1 500 Internal Server Error",
                json!({
                    "status": "error",
                    "error": format!("{error:#}")
                }),
            )?,
        },
        ("POST", "/v1/ntrip/capture/run") => match run_ntrip_capture(config) {
            Ok(summary) => respond_json(
                &mut stream,
                "HTTP/1.1 200 OK",
                json!({
                    "status": "ok",
                    "ntripUrl": config.ntrip_url,
                    "summary": summary
                }),
            )?,
            Err(error) => respond_json(
                &mut stream,
                "HTTP/1.1 500 Internal Server Error",
                json!({
                    "status": "error",
                    "error": format!("{error:#}")
                }),
            )?,
        },
        _ => respond_json(
            &mut stream,
            "HTTP/1.1 404 Not Found",
            json!({ "error": "not found" }),
        )?,
    }

    Ok(())
}

fn respond_json(stream: &mut TcpStream, status_line: &str, body: Value) -> Result<()> {
    let payload = serde_json::to_vec(&body)?;
    write!(
        stream,
        "{status_line}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        payload.len()
    )?;
    stream.write_all(&payload)?;
    stream.flush()?;
    Ok(())
}

fn build_health_body(config: &GatewayConfig, state: &Arc<Mutex<ReplayState>>) -> Result<Value> {
    let state = lock_state(state)?;
    Ok(json!({
        "service": "rtk-gateway",
        "status": if state.last_error.is_some() { "degraded" } else { "ok" },
        "mode": config.mode,
        "diagnosticsPort": config.port,
        "runtimeDatabaseConfigured": config.runtime_database_url.is_some(),
        "activeInputs": config.active_inputs(),
        "fixtureReplayReady": state.fixture_ready,
        "lastReplayAt": state.last_replay_at,
        "lastReplaySummary": state.last_summary,
        "lastReplayError": state.last_error
    }))
}

fn build_inputs_body(config: &GatewayConfig, state: &Arc<Mutex<ReplayState>>) -> Result<Value> {
    let state = lock_state(state)?;
    Ok(json!({
        "mode": config.mode,
        "fixturePath": config.fixture_path,
        "serialPort": config.serial_port,
        "ntripUrl": config.ntrip_url,
        "activeInputs": config.active_inputs(),
        "fixtureReplayReady": state.fixture_ready
    }))
}

fn build_persistence_status(
    config: &GatewayConfig,
    state: &Arc<Mutex<ReplayState>>,
) -> Result<Value> {
    let state = lock_state(state)?;
    Ok(json!({
        "runtimeDatabaseConfigured": config.runtime_database_url.is_some(),
        "fixturePath": config.fixture_path,
        "lastReplayAt": state.last_replay_at,
        "lastReplaySummary": state.last_summary,
        "lastReplayError": state.last_error
    }))
}

fn run_fixture_replay(
    config: &GatewayConfig,
    state: &Arc<Mutex<ReplayState>>,
) -> Result<PersistSummary> {
    let fixture_path = config
        .fixture_path
        .as_ref()
        .context("CLARTK_GATEWAY_FIXTURE_PATH is required for replay ingest")?;
    let runtime_database_url = config
        .runtime_database_url
        .as_ref()
        .context("CLARTK_RUNTIME_DATABASE_URL is required for replay ingest")?;

    let fixture = load_fixture(fixture_path)?;
    let summary = persist_fixture(runtime_database_url, fixture)?;

    let mut state_guard = lock_state(state)?;
    state_guard.last_replay_at = Some(now_utc_iso_string());
    state_guard.last_error = None;
    state_guard.last_summary = Some(summary.clone());

    Ok(summary)
}

fn load_fixture(path: &str) -> Result<GatewayFixture> {
    let bytes = fs::read(path).with_context(|| format!("unable to read fixture {}", path))?;
    serde_json::from_slice(&bytes).with_context(|| format!("unable to parse fixture {}", path))
}

fn run_serial_capture(config: &GatewayConfig) -> Result<CaptureSummary> {
    let source_ref = config
        .serial_port
        .as_ref()
        .context("CLARTK_GATEWAY_SERIAL_PORT is required for serial capture ingest")?;
    let runtime_database_url = config
        .runtime_database_url
        .as_ref()
        .context("CLARTK_RUNTIME_DATABASE_URL is required for serial capture ingest")?;
    let contents =
        fs::read_to_string(source_ref).with_context(|| format!("unable to read {}", source_ref))?;

    persist_serial_capture(runtime_database_url, source_ref, &contents)
}

fn run_ntrip_capture(config: &GatewayConfig) -> Result<CaptureSummary> {
    let source_ref = config
        .ntrip_url
        .as_ref()
        .context("CLARTK_GATEWAY_NTRIP_URL is required for NTRIP capture ingest")?;
    let runtime_database_url = config
        .runtime_database_url
        .as_ref()
        .context("CLARTK_RUNTIME_DATABASE_URL is required for NTRIP capture ingest")?;
    let capture_path = resolve_capture_path(source_ref)?;
    let contents = fs::read_to_string(&capture_path)
        .with_context(|| format!("unable to read {}", capture_path))?;

    persist_ntrip_capture(runtime_database_url, source_ref, &contents)
}

fn persist_fixture(runtime_database_url: &str, fixture: GatewayFixture) -> Result<PersistSummary> {
    let mut client = Client::connect(runtime_database_url, NoTls)
        .context("unable to connect to runtime PostgreSQL")?;
    let mut transaction = client
        .transaction()
        .context("unable to begin runtime replay transaction")?;
    let mut device_ids = HashMap::new();
    let mut summary = PersistSummary::default();

    for device in &fixture.devices {
        ensure_device_id(
            &mut transaction,
            &mut device_ids,
            &device.external_id,
            &device.hardware_family,
            device.firmware_version.as_deref(),
            &device.config,
        )?;
        summary.devices_persisted += 1;
    }

    for position in &fixture.telemetry_positions {
        let device_id = ensure_device_id(
            &mut transaction,
            &mut device_ids,
            &position.external_id,
            position
                .hardware_family
                .as_deref()
                .unwrap_or("fixture_replay"),
            position.firmware_version.as_deref(),
            &position.device_config,
        )?;
        transaction
            .execute(
            "
            INSERT INTO telemetry.position_event (device_id, received_at, payload)
            VALUES ($1, $2, $3)
            ",
            &[&device_id, &position.received_at, &position.payload],
            )
            .with_context(|| {
                format!(
                    "unable to insert telemetry.position_event for external_id {}",
                    position.external_id
                )
            })?;
        summary.telemetry_positions_persisted += 1;
    }

    for solution in &fixture.rtk_solutions {
        let device_id = ensure_device_id(
            &mut transaction,
            &mut device_ids,
            &solution.external_id,
            solution
                .hardware_family
                .as_deref()
                .unwrap_or("fixture_replay"),
            solution.firmware_version.as_deref(),
            &solution.device_config,
        )?;
        transaction
            .execute(
            "
            INSERT INTO rtk.solution (device_id, observed_at, quality, summary)
            VALUES ($1, $2, $3, $4)
            ",
            &[
                &device_id,
                &solution.observed_at,
                &solution.quality,
                &solution.summary,
            ],
            )
            .with_context(|| {
                format!(
                    "unable to insert rtk.solution for external_id {}",
                    solution.external_id
                )
            })?;
        summary.rtk_solutions_persisted += 1;
    }

    transaction
        .commit()
        .context("unable to commit runtime replay transaction")?;

    Ok(summary)
}

fn persist_serial_capture(
    runtime_database_url: &str,
    source_ref: &str,
    contents: &str,
) -> Result<CaptureSummary> {
    let mut client = Client::connect(runtime_database_url, NoTls)
        .context("unable to connect to runtime PostgreSQL")?;
    let mut transaction = client
        .transaction()
        .context("unable to begin serial capture transaction")?;
    let mut summary = CaptureSummary {
        source_kind: "serial".to_string(),
        sessions_persisted: 1,
        ..CaptureSummary::default()
    };

    let session_id = create_ingest_session(
        &mut transaction,
        "serial",
        source_ref,
        &json!({
            "captureMode": "file",
            "lineCount": contents.lines().filter(|line| !line.trim().is_empty()).count()
        }),
    )?;

    let device_external_id = transport_device_external_id("serial", source_ref);
    let device_config = json!({
        "sourceKind": "serial",
        "sourceRef": source_ref
    });

    for line in contents.lines().filter(|line| !line.trim().is_empty()) {
        let parsed = clartk_nmea::parse_sentence(line)
            .with_context(|| format!("unable to parse NMEA sentence from {}", source_ref))?;
        let observed_at = Utc::now();

        insert_ingest_sample(
            &mut transaction,
            session_id,
            observed_at,
            "nmea",
            line.as_bytes().len() as i32,
            Some(line),
            &json!({
                "talker": parsed.talker,
                "sentenceType": parsed.sentence_type,
                "fieldCount": parsed.fields.len(),
                "checksum": parsed.checksum
            }),
        )?;
        summary.samples_persisted += 1;

        if parsed.sentence_type == "GGA" {
            let payload = build_gga_payload(&parsed, source_ref)?;
            let device_id = ensure_device_id(
                &mut transaction,
                &mut HashMap::new(),
                &device_external_id,
                "serial_nmea",
                None,
                &device_config,
            )?;
            transaction
                .execute(
                    "
                    INSERT INTO telemetry.position_event (device_id, received_at, payload)
                    VALUES ($1, $2, $3)
                    ",
                    &[&device_id, &observed_at, &payload],
                )
                .with_context(|| {
                    format!(
                        "unable to insert telemetry.position_event for serial source {}",
                        source_ref
                    )
                })?;
            summary.telemetry_positions_persisted += 1;
        }
    }

    finish_ingest_session(&mut transaction, session_id)?;
    transaction
        .commit()
        .context("unable to commit serial capture transaction")?;
    Ok(summary)
}

fn persist_ntrip_capture(
    runtime_database_url: &str,
    source_ref: &str,
    contents: &str,
) -> Result<CaptureSummary> {
    let mut client = Client::connect(runtime_database_url, NoTls)
        .context("unable to connect to runtime PostgreSQL")?;
    let mut transaction = client
        .transaction()
        .context("unable to begin NTRIP capture transaction")?;
    let mut summary = CaptureSummary {
        source_kind: "ntrip".to_string(),
        sessions_persisted: 1,
        ..CaptureSummary::default()
    };

    let session_id = create_ingest_session(
        &mut transaction,
        "ntrip",
        source_ref,
        &json!({
            "captureMode": "file",
            "frameCount": contents.lines().filter(|line| !line.trim().is_empty()).count()
        }),
    )?;

    for line in contents.lines().filter(|line| !line.trim().is_empty()) {
        let frame_bytes =
            decode_hex_line(line).with_context(|| format!("unable to decode RTCM hex from {}", source_ref))?;
        let parsed = clartk_rtcm::parse_frame(&frame_bytes)
            .with_context(|| format!("unable to parse RTCM frame from {}", source_ref))?;
        insert_ingest_sample(
            &mut transaction,
            session_id,
            Utc::now(),
            "rtcm",
            frame_bytes.len() as i32,
            Some(line),
            &json!({
                "messageType": parsed.message_type,
                "payloadBytes": parsed.payload.len(),
                "sourceKind": "ntrip",
                "sourceRef": source_ref
            }),
        )?;
        summary.samples_persisted += 1;
    }

    finish_ingest_session(&mut transaction, session_id)?;
    transaction
        .commit()
        .context("unable to commit NTRIP capture transaction")?;
    Ok(summary)
}

fn ensure_device_id(
    transaction: &mut Transaction<'_>,
    device_ids: &mut HashMap<String, i64>,
    external_id: &str,
    hardware_family: &str,
    firmware_version: Option<&str>,
    config: &Value,
) -> Result<i64> {
    if let Some(device_id) = device_ids.get(external_id) {
        return Ok(*device_id);
    }

    let row = transaction
        .query_one(
        "
        INSERT INTO device.registry (external_id, hardware_family, firmware_version, config)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (external_id)
        DO UPDATE SET
          hardware_family = EXCLUDED.hardware_family,
          firmware_version = COALESCE(EXCLUDED.firmware_version, device.registry.firmware_version),
          config = EXCLUDED.config
        RETURNING device_id
        ",
        &[&external_id, &hardware_family, &firmware_version, &config],
        )
        .with_context(|| format!("unable to upsert device.registry for {}", external_id))?;

    let device_id: i64 = row.get("device_id");
    device_ids.insert(external_id.to_string(), device_id);
    Ok(device_id)
}

fn create_ingest_session(
    transaction: &mut Transaction<'_>,
    source_kind: &str,
    source_ref: &str,
    metadata: &Value,
) -> Result<i64> {
    let row = transaction
        .query_one(
            "
            INSERT INTO telemetry.ingest_session (source_kind, source_ref, status, metadata, last_seen_at)
            VALUES ($1, $2, 'capturing', $3, NOW())
            RETURNING ingest_session_id
            ",
            &[&source_kind, &source_ref, &metadata],
        )
        .with_context(|| format!("unable to create ingest session for {}", source_kind))?;

    Ok(row.get("ingest_session_id"))
}

fn finish_ingest_session(transaction: &mut Transaction<'_>, session_id: i64) -> Result<()> {
    transaction
        .execute(
            "
            UPDATE telemetry.ingest_session
            SET status = 'completed',
                finished_at = NOW(),
                last_seen_at = NOW()
            WHERE ingest_session_id = $1
            ",
            &[&session_id],
        )
        .with_context(|| format!("unable to finish ingest session {}", session_id))?;
    Ok(())
}

fn insert_ingest_sample(
    transaction: &mut Transaction<'_>,
    session_id: i64,
    observed_at: DateTime<Utc>,
    parse_kind: &str,
    byte_count: i32,
    raw_payload: Option<&str>,
    summary: &Value,
) -> Result<()> {
    transaction
        .execute(
            "
            INSERT INTO telemetry.ingest_sample (
              ingest_session_id,
              observed_at,
              parse_kind,
              byte_count,
              raw_payload,
              summary
            )
            VALUES ($1, $2, $3, $4, $5, $6)
            ",
            &[&session_id, &observed_at, &parse_kind, &byte_count, &raw_payload, &summary],
        )
        .with_context(|| format!("unable to insert ingest sample for session {}", session_id))?;
    Ok(())
}

fn build_gga_payload(parsed: &NmeaSentence, source_ref: &str) -> Result<Value> {
    if parsed.fields.len() < 9 {
        return Err(anyhow!("GGA sentence from {} is missing required fields", source_ref));
    }

    let latitude = parse_nmea_coordinate(&parsed.fields[1], &parsed.fields[2], 2)
        .context("unable to parse GGA latitude")?;
    let longitude = parse_nmea_coordinate(&parsed.fields[3], &parsed.fields[4], 3)
        .context("unable to parse GGA longitude")?;
    let altitude_meters = parsed.fields[8]
        .parse::<f64>()
        .context("unable to parse GGA altitude")?;

    Ok(json!({
        "sourceKind": "serial",
        "sourceRef": source_ref,
        "talker": parsed.talker,
        "sentenceType": parsed.sentence_type,
        "ggaUtcTime": parsed.fields[0],
        "lat": latitude,
        "lon": longitude,
        "altMeters": altitude_meters,
        "fixQuality": parsed.fields[5],
        "satellites": parsed.fields[6],
        "hdop": parsed.fields[7]
    }))
}

fn parse_nmea_coordinate(value: &str, hemisphere: &str, degree_digits: usize) -> Result<f64> {
    if value.len() <= degree_digits {
        return Err(anyhow!("coordinate field is too short"));
    }

    let (degrees_text, minutes_text) = value.split_at(degree_digits);
    let degrees = degrees_text.parse::<f64>()?;
    let minutes = minutes_text.parse::<f64>()?;
    let mut decimal = degrees + (minutes / 60.0);
    if matches!(hemisphere, "S" | "W") {
        decimal *= -1.0;
    }
    Ok(decimal)
}

fn decode_hex_line(line: &str) -> Result<Vec<u8>> {
    let hex = line.split_whitespace().collect::<String>();
    if hex.len() % 2 != 0 {
        return Err(anyhow!("hex line length must be even"));
    }

    hex.as_bytes()
        .chunks(2)
        .map(|chunk| {
            let text = std::str::from_utf8(chunk)?;
            Ok(u8::from_str_radix(text, 16)?)
        })
        .collect()
}

fn resolve_capture_path(source_ref: &str) -> Result<String> {
    if let Some(path) = source_ref.strip_prefix("file://") {
        return Ok(path.to_string());
    }
    if source_ref.starts_with('/') || source_ref.starts_with("./") || source_ref.starts_with("../")
    {
        return Ok(source_ref.to_string());
    }
    Err(anyhow!(
        "live NTRIP fetch is not implemented in this slice; use CLARTK_GATEWAY_NTRIP_URL=file://<capture>"
    ))
}

fn transport_device_external_id(source_kind: &str, source_ref: &str) -> String {
    let normalized = source_ref
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() {
                character
            } else {
                '_'
            }
        })
        .collect::<String>();
    format!("{}_{}", source_kind, normalized)
}

fn now_utc_iso_string() -> String {
    Utc::now().to_rfc3339()
}

fn record_replay_error(state: &Arc<Mutex<ReplayState>>, error: &str) -> Result<()> {
    let mut state_guard = lock_state(state)?;
    state_guard.last_error = Some(error.to_string());
    state_guard.last_summary = None;
    Ok(())
}

fn lock_state(state: &Arc<Mutex<ReplayState>>) -> Result<std::sync::MutexGuard<'_, ReplayState>> {
    state
        .lock()
        .map_err(|_| anyhow!("gateway replay state lock poisoned"))
}
