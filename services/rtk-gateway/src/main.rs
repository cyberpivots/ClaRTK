use anyhow::{anyhow, Context, Result};
use base64::Engine;
use chrono::{DateTime, Utc};
use clartk_geo::LlaPoint;
use clartk_nmea::NmeaSentence;
use postgres::{Client, NoTls, Transaction};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::env;
use std::fs;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{TcpListener, TcpStream, ToSocketAddrs};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use url::Url;

#[derive(Clone)]
struct GatewayConfig {
    host: String,
    port: u16,
    mode: String,
    runtime_database_url: Option<String>,
    fixture_path: Option<String>,
    serial_port: Option<String>,
    rover_serial_port: Option<String>,
    base_serial_port: Option<String>,
    serial_protocol: SerialProtocol,
    ntrip_url: Option<String>,
    capture_seconds: u64,
    serial_baud: u32,
    rover_serial_baud: u32,
    base_serial_baud: u32,
    base_position: Option<ConfiguredBasePosition>,
}

#[derive(Clone, Copy)]
enum SerialProtocol {
    Nmea,
    NsRaw,
}

impl SerialProtocol {
    fn from_env(value: Option<String>) -> Result<Self> {
        match value.as_deref().unwrap_or("nmea") {
            "nmea" => Ok(Self::Nmea),
            "ns-raw" | "skytraq-venus8-raw" => Ok(Self::NsRaw),
            other => Err(anyhow!(
                "invalid CLARTK_GATEWAY_SERIAL_PROTOCOL {}; expected nmea, ns-raw, or skytraq-venus8-raw",
                other
            )),
        }
    }

    fn as_str(self) -> &'static str {
        match self {
            Self::Nmea => "nmea",
            Self::NsRaw => "ns-raw",
        }
    }
}

#[derive(Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
struct ConfiguredBasePosition {
    latitude_deg: f64,
    longitude_deg: f64,
    altitude_m: f64,
}

impl ConfiguredBasePosition {
    fn as_lla_point(self) -> LlaPoint {
        LlaPoint {
            latitude_deg: self.latitude_deg,
            longitude_deg: self.longitude_deg,
            altitude_m: self.altitude_m,
        }
    }
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
    rtk_solutions_persisted: usize,
}

#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
struct ReplayState {
    fixture_ready: bool,
    last_replay_at: Option<String>,
    last_replay_error: Option<String>,
    last_replay_summary: Option<PersistSummary>,
    serial: TransportState,
    ntrip: TransportState,
}

#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
struct TransportState {
    configured: bool,
    background_loop_enabled: bool,
    source_ref: Option<String>,
    last_capture_at: Option<String>,
    last_error: Option<String>,
    last_summary: Option<CaptureSummary>,
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

struct CapturedText {
    mode: &'static str,
    contents: String,
}

struct CapturedBytes {
    mode: &'static str,
    bytes: Vec<u8>,
}

struct CapturedFrames {
    mode: &'static str,
    frames: Vec<Vec<u8>>,
}

impl GatewayConfig {
    fn from_env() -> Result<Self> {
        let port = env::var("CLARTK_GATEWAY_DIAGNOSTICS_PORT")
            .unwrap_or_else(|_| "3200".to_string())
            .parse::<u16>()
            .context("invalid CLARTK_GATEWAY_DIAGNOSTICS_PORT")?;
        let capture_seconds = env::var("CLARTK_GATEWAY_CAPTURE_SECONDS")
            .unwrap_or_else(|_| "3".to_string())
            .parse::<u64>()
            .context("invalid CLARTK_GATEWAY_CAPTURE_SECONDS")?;
        let serial_baud = env::var("CLARTK_GATEWAY_SERIAL_BAUD")
            .unwrap_or_else(|_| "115200".to_string())
            .parse::<u32>()
            .context("invalid CLARTK_GATEWAY_SERIAL_BAUD")?;
        let rover_serial_baud = env::var("CLARTK_GATEWAY_ROVER_SERIAL_BAUD")
            .ok()
            .unwrap_or_else(|| serial_baud.to_string())
            .parse::<u32>()
            .context("invalid CLARTK_GATEWAY_ROVER_SERIAL_BAUD")?;
        let base_serial_baud = env::var("CLARTK_GATEWAY_BASE_SERIAL_BAUD")
            .ok()
            .unwrap_or_else(|| serial_baud.to_string())
            .parse::<u32>()
            .context("invalid CLARTK_GATEWAY_BASE_SERIAL_BAUD")?;
        let serial_protocol =
            SerialProtocol::from_env(env::var("CLARTK_GATEWAY_SERIAL_PROTOCOL").ok())?;
        let base_position = load_base_position_from_env()?;

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
            rover_serial_port: env::var("CLARTK_GATEWAY_ROVER_SERIAL_PORT")
                .ok()
                .filter(|value| !value.is_empty()),
            base_serial_port: env::var("CLARTK_GATEWAY_BASE_SERIAL_PORT")
                .ok()
                .filter(|value| !value.is_empty()),
            serial_protocol,
            ntrip_url: env::var("CLARTK_GATEWAY_NTRIP_URL")
                .ok()
                .filter(|value| !value.is_empty()),
            capture_seconds,
            serial_baud,
            rover_serial_baud,
            base_serial_baud,
            base_position,
        })
    }

    fn active_inputs(&self) -> Vec<&'static str> {
        let mut active = Vec::new();

        if self.fixture_path.is_some() {
            active.push("fixture_replay");
        }
        if self.serial_pair_enabled() {
            active.push("serial_pair");
        } else if self.primary_serial_port().is_some() {
            active.push("serial");
        }
        if self.ntrip_url.is_some() {
            active.push("ntrip");
        }

        active
    }

    fn capture_duration(&self) -> Duration {
        Duration::from_secs(self.capture_seconds)
    }

    fn primary_serial_port(&self) -> Option<&str> {
        match self.serial_protocol {
            SerialProtocol::Nmea => self.serial_port.as_deref(),
            SerialProtocol::NsRaw => self
                .rover_serial_port
                .as_deref()
                .or(self.serial_port.as_deref()),
        }
    }

    fn primary_serial_baud(&self) -> u32 {
        if self.rover_serial_port.is_some() {
            self.rover_serial_baud
        } else {
            self.serial_baud
        }
    }

    fn serial_pair_enabled(&self) -> bool {
        matches!(self.serial_protocol, SerialProtocol::NsRaw)
            && self.rover_serial_port.is_some()
            && self.base_serial_port.is_some()
    }

    fn serial_state_source_ref(&self) -> Option<String> {
        if self.serial_pair_enabled() {
            Some(format!(
                "rover={}, base={}",
                self.rover_serial_port.as_deref().unwrap_or(""),
                self.base_serial_port.as_deref().unwrap_or("")
            ))
        } else {
            self.primary_serial_port().map(str::to_string)
        }
    }

    fn serial_loop_sources(&self) -> Vec<&str> {
        if self.serial_pair_enabled() {
            vec![
                self.rover_serial_port.as_deref().unwrap_or(""),
                self.base_serial_port.as_deref().unwrap_or(""),
            ]
        } else {
            self.primary_serial_port().into_iter().collect()
        }
    }
}

fn load_base_position_from_env() -> Result<Option<ConfiguredBasePosition>> {
    let latitude = env::var("CLARTK_GATEWAY_BASE_POSITION_LAT_DEG")
        .ok()
        .filter(|value| !value.is_empty());
    let longitude = env::var("CLARTK_GATEWAY_BASE_POSITION_LON_DEG")
        .ok()
        .filter(|value| !value.is_empty());
    let altitude = env::var("CLARTK_GATEWAY_BASE_POSITION_ALT_M")
        .ok()
        .filter(|value| !value.is_empty());

    if latitude.is_none() && longitude.is_none() && altitude.is_none() {
        return Ok(None);
    }

    let latitude_deg = latitude
        .context("CLARTK_GATEWAY_BASE_POSITION_LAT_DEG is required when any base-position env var is set")?
        .parse::<f64>()
        .context("invalid CLARTK_GATEWAY_BASE_POSITION_LAT_DEG")?;
    let longitude_deg = longitude
        .context("CLARTK_GATEWAY_BASE_POSITION_LON_DEG is required when any base-position env var is set")?
        .parse::<f64>()
        .context("invalid CLARTK_GATEWAY_BASE_POSITION_LON_DEG")?;
    let altitude_m = altitude
        .context(
            "CLARTK_GATEWAY_BASE_POSITION_ALT_M is required when any base-position env var is set",
        )?
        .parse::<f64>()
        .context("invalid CLARTK_GATEWAY_BASE_POSITION_ALT_M")?;

    Ok(Some(ConfiguredBasePosition {
        latitude_deg,
        longitude_deg,
        altitude_m,
    }))
}

fn main() -> Result<()> {
    let config = GatewayConfig::from_env()?;
    let state = Arc::new(Mutex::new(ReplayState {
        fixture_ready: config.fixture_path.is_some(),
        serial: TransportState {
            configured: config.primary_serial_port().is_some(),
            source_ref: config.serial_state_source_ref(),
            ..TransportState::default()
        },
        ntrip: TransportState {
            configured: config.ntrip_url.is_some(),
            source_ref: config.ntrip_url.clone(),
            ..TransportState::default()
        },
        ..ReplayState::default()
    }));

    start_transport_loops(&config, &state)?;

    let address = format!("{}:{}", config.host, config.port);
    let listener =
        TcpListener::bind(&address).with_context(|| format!("unable to bind {}", address))?;

    println!("ClaRTK RTK gateway diagnostics listening on {}", address);
    println!("Mode: {}", config.mode);
    println!(
        "Runtime database configured: {}",
        config.runtime_database_url.is_some()
    );
    println!("Serial protocol: {}", config.serial_protocol.as_str());
    if config.serial_pair_enabled() {
        println!(
            "NS-RAW pair inputs: rover={} @ {}, base={} @ {}",
            config.rover_serial_port.as_deref().unwrap_or(""),
            config.rover_serial_baud,
            config.base_serial_port.as_deref().unwrap_or(""),
            config.base_serial_baud
        );
    }
    println!("Supported adapters: ns-raw, px1122r, skytraq-venus8-raw");

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
        ("GET", "/health") => respond_json(
            &mut stream,
            "HTTP/1.1 200 OK",
            build_health_body(config, state)?,
        )?,
        ("GET", "/v1/inputs") => respond_json(
            &mut stream,
            "HTTP/1.1 200 OK",
            build_inputs_body(config, state)?,
        )?,
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
            Ok(summary) => {
                record_transport_success(state, "serial", &summary)?;
                respond_json(
                    &mut stream,
                    "HTTP/1.1 200 OK",
                    json!({
                        "status": "ok",
                        "serialPort": config.primary_serial_port(),
                        "roverSerialPort": config.rover_serial_port,
                        "baseSerialPort": config.base_serial_port,
                        "serialProtocol": config.serial_protocol.as_str(),
                        "summary": summary
                    }),
                )?
            }
            Err(error) => {
                let error_message = format!("{error:#}");
                record_transport_error(state, "serial", &error_message)?;
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
        ("POST", "/v1/ntrip/capture/run") => match run_ntrip_capture(config) {
            Ok(summary) => {
                record_transport_success(state, "ntrip", &summary)?;
                respond_json(
                    &mut stream,
                    "HTTP/1.1 200 OK",
                    json!({
                        "status": "ok",
                        "ntripUrl": config.ntrip_url,
                        "summary": summary
                    }),
                )?
            }
            Err(error) => {
                let error_message = format!("{error:#}");
                record_transport_error(state, "ntrip", &error_message)?;
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
    let transport_degraded = state.serial.last_error.is_some() || state.ntrip.last_error.is_some();
    Ok(json!({
        "service": "rtk-gateway",
        "status": if state.last_replay_error.is_some() || transport_degraded { "degraded" } else { "ok" },
        "mode": config.mode,
        "diagnosticsPort": config.port,
        "runtimeDatabaseConfigured": config.runtime_database_url.is_some(),
        "serialProtocol": config.serial_protocol.as_str(),
        "activeInputs": config.active_inputs(),
        "basePosition": config.base_position,
        "fixtureReplayReady": state.fixture_ready,
        "lastReplayAt": state.last_replay_at,
        "lastReplaySummary": state.last_replay_summary,
        "lastReplayError": state.last_replay_error,
        "serial": state.serial,
        "ntrip": state.ntrip
    }))
}

fn build_inputs_body(config: &GatewayConfig, state: &Arc<Mutex<ReplayState>>) -> Result<Value> {
    let state = lock_state(state)?;
    Ok(json!({
        "mode": config.mode,
        "fixturePath": config.fixture_path,
        "serialPort": config.primary_serial_port(),
        "roverSerialPort": config.rover_serial_port,
        "baseSerialPort": config.base_serial_port,
        "serialProtocol": config.serial_protocol.as_str(),
        "basePosition": config.base_position,
        "ntripUrl": config.ntrip_url,
        "captureSeconds": config.capture_seconds,
        "serialBaud": config.primary_serial_baud(),
        "roverSerialBaud": config.rover_serial_baud,
        "baseSerialBaud": config.base_serial_baud,
        "activeInputs": config.active_inputs(),
        "fixtureReplayReady": state.fixture_ready,
        "serial": state.serial,
        "ntrip": state.ntrip
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
        "serialProtocol": config.serial_protocol.as_str(),
        "basePosition": config.base_position,
        "lastReplayAt": state.last_replay_at,
        "lastReplaySummary": state.last_replay_summary,
        "lastReplayError": state.last_replay_error,
        "serial": state.serial,
        "ntrip": state.ntrip
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
    state_guard.last_replay_error = None;
    state_guard.last_replay_summary = Some(summary.clone());

    Ok(summary)
}

fn load_fixture(path: &str) -> Result<GatewayFixture> {
    let bytes = fs::read(path).with_context(|| format!("unable to read fixture {}", path))?;
    serde_json::from_slice(&bytes).with_context(|| format!("unable to parse fixture {}", path))
}

fn run_serial_capture(config: &GatewayConfig) -> Result<CaptureSummary> {
    let primary_serial_port = config.primary_serial_port();
    let source_ref =
        primary_serial_port.context("a serial source is required for serial capture ingest")?;
    let runtime_database_url = config
        .runtime_database_url
        .as_ref()
        .context("CLARTK_RUNTIME_DATABASE_URL is required for serial capture ingest")?;
    match config.serial_protocol {
        SerialProtocol::Nmea => {
            let capture = load_serial_text_capture(
                source_ref,
                config.primary_serial_baud(),
                config.capture_duration(),
            )?;
            persist_serial_text_capture(runtime_database_url, source_ref, &capture)
        }
        SerialProtocol::NsRaw if config.serial_pair_enabled() => {
            let rover_source_ref = config
                .rover_serial_port
                .as_deref()
                .context("CLARTK_GATEWAY_ROVER_SERIAL_PORT is required for NS-RAW pair capture")?;
            let base_source_ref = config
                .base_serial_port
                .as_deref()
                .context("CLARTK_GATEWAY_BASE_SERIAL_PORT is required for NS-RAW pair capture")?;
            let rover_capture = load_serial_binary_capture(
                rover_source_ref,
                config.rover_serial_baud,
                config.capture_duration(),
            )?;
            let base_capture = load_serial_binary_capture(
                base_source_ref,
                config.base_serial_baud,
                config.capture_duration(),
            )?;
            persist_serial_raw_pair_capture(
                runtime_database_url,
                rover_source_ref,
                &rover_capture,
                base_source_ref,
                &base_capture,
                config.base_position,
            )
        }
        SerialProtocol::NsRaw => {
            let capture = load_serial_binary_capture(
                source_ref,
                config.primary_serial_baud(),
                config.capture_duration(),
            )?;
            let (correction_capture, correction_error) =
                if let Some(correction_source_ref) = config.ntrip_url.as_deref() {
                    match load_ntrip_capture(correction_source_ref, config.capture_duration()) {
                        Ok(capture) => (Some(capture), None),
                        Err(error) => (None, Some(format!("{error:#}"))),
                    }
                } else {
                    (None, None)
                };
            persist_serial_raw_capture(
                runtime_database_url,
                source_ref,
                &capture,
                config.ntrip_url.as_deref(),
                correction_capture.as_ref(),
                correction_error.as_deref(),
            )
        }
    }
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
    let capture = load_ntrip_capture(source_ref, config.capture_duration())?;

    persist_ntrip_capture(runtime_database_url, source_ref, &capture)
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

fn persist_serial_text_capture(
    runtime_database_url: &str,
    source_ref: &str,
    capture: &CapturedText,
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
            "captureMode": capture.mode,
            "lineCount": capture.contents.lines().filter(|line| !line.trim().is_empty()).count()
        }),
    )?;

    let device_external_id = transport_device_external_id("serial", source_ref);
    let device_config = json!({
        "sourceKind": "serial",
        "sourceRef": source_ref
    });

    let mut device_ids = HashMap::new();

    for line in capture
        .contents
        .lines()
        .filter(|line| !line.trim().is_empty())
    {
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
            let (payload, solution_quality, solution_summary) =
                build_gga_payload(line, &parsed, source_ref)?;
            let device_id = ensure_device_id(
                &mut transaction,
                &mut device_ids,
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

            transaction
                .execute(
                    "
                    INSERT INTO rtk.solution (device_id, observed_at, quality, summary)
                    VALUES ($1, $2, $3, $4)
                    ",
                    &[
                        &device_id,
                        &observed_at,
                        &solution_quality,
                        &solution_summary,
                    ],
                )
                .with_context(|| {
                    format!(
                        "unable to insert rtk.solution for serial source {}",
                        source_ref
                    )
                })?;
            summary.rtk_solutions_persisted += 1;
        }
    }

    finish_ingest_session(&mut transaction, session_id)?;
    transaction
        .commit()
        .context("unable to commit serial capture transaction")?;
    Ok(summary)
}

fn persist_serial_raw_capture(
    runtime_database_url: &str,
    source_ref: &str,
    capture: &CapturedBytes,
    correction_source_ref: Option<&str>,
    correction_capture: Option<&CapturedFrames>,
    correction_error: Option<&str>,
) -> Result<CaptureSummary> {
    let mut client = Client::connect(runtime_database_url, NoTls)
        .context("unable to connect to runtime PostgreSQL")?;
    let mut transaction = client
        .transaction()
        .context("unable to begin serial raw capture transaction")?;
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
            "captureMode": capture.mode,
            "serialProtocol": SerialProtocol::NsRaw.as_str(),
            "byteCount": capture.bytes.len(),
            "solver": "rtklib",
            "solverPublication": "not_attempted",
            "correctionSourceRef": correction_source_ref,
            "correctionLoadError": correction_error
        }),
    )?;

    let mut device_ids = HashMap::new();
    let device_external_id = transport_device_external_id("serial", source_ref);
    let device_config = ns_raw_device_config(source_ref, "rover");
    let frame_count = persist_ns_raw_frames(
        &mut transaction,
        session_id,
        &mut device_ids,
        &device_external_id,
        &device_config,
        source_ref,
        "rover",
        capture,
    )?;
    summary.samples_persisted += frame_count;
    merge_ingest_session_metadata(
        &mut transaction,
        session_id,
        &json!({
            "frameCount": frame_count,
            "correctionFrameCount": correction_capture.map(|capture| capture.frames.len())
        }),
    )?;

    update_serial_raw_solver_outcome(
        &mut transaction,
        session_id,
        &mut device_ids,
        &device_external_id,
        &device_config,
        source_ref,
        capture,
        correction_source_ref,
        correction_capture,
        correction_error,
        &mut summary,
    )?;

    finish_ingest_session(&mut transaction, session_id)?;
    transaction
        .commit()
        .context("unable to commit serial raw capture transaction")?;
    Ok(summary)
}

fn persist_serial_raw_pair_capture(
    runtime_database_url: &str,
    rover_source_ref: &str,
    rover_capture: &CapturedBytes,
    base_source_ref: &str,
    base_capture: &CapturedBytes,
    base_position: Option<ConfiguredBasePosition>,
) -> Result<CaptureSummary> {
    let mut client = Client::connect(runtime_database_url, NoTls)
        .context("unable to connect to runtime PostgreSQL")?;
    let mut transaction = client
        .transaction()
        .context("unable to begin serial pair capture transaction")?;
    let mut summary = CaptureSummary {
        source_kind: "serial".to_string(),
        sessions_persisted: 1,
        ..CaptureSummary::default()
    };

    let pair_source_ref = format!("rover={}, base={}", rover_source_ref, base_source_ref);
    let session_id = create_ingest_session(
        &mut transaction,
        "serial",
        &pair_source_ref,
        &json!({
            "captureMode": "pair",
            "serialProtocol": SerialProtocol::NsRaw.as_str(),
            "solver": "rtklib_skytraq_pair",
            "solverPublication": "not_attempted",
            "roverSourceRef": rover_source_ref,
            "baseSourceRef": base_source_ref,
            "roverByteCount": rover_capture.bytes.len(),
            "baseByteCount": base_capture.bytes.len(),
            "basePosition": base_position
        }),
    )?;

    let mut device_ids = HashMap::new();
    let rover_device_external_id = transport_device_external_id("serial_rover", rover_source_ref);
    let base_device_external_id = transport_device_external_id("serial_base", base_source_ref);
    let rover_device_config = ns_raw_device_config(rover_source_ref, "rover");
    let base_device_config = ns_raw_device_config(base_source_ref, "base");

    let rover_frame_count = persist_ns_raw_frames(
        &mut transaction,
        session_id,
        &mut device_ids,
        &rover_device_external_id,
        &rover_device_config,
        rover_source_ref,
        "rover",
        rover_capture,
    )?;
    let base_frame_count = persist_ns_raw_frames(
        &mut transaction,
        session_id,
        &mut device_ids,
        &base_device_external_id,
        &base_device_config,
        base_source_ref,
        "base",
        base_capture,
    )?;
    summary.samples_persisted += rover_frame_count + base_frame_count;

    merge_ingest_session_metadata(
        &mut transaction,
        session_id,
        &json!({
            "roverFrameCount": rover_frame_count,
            "baseFrameCount": base_frame_count
        }),
    )?;

    update_serial_raw_pair_solver_outcome(
        &mut transaction,
        session_id,
        &mut device_ids,
        &rover_device_external_id,
        &rover_device_config,
        rover_source_ref,
        rover_capture,
        base_source_ref,
        base_capture,
        base_position,
        &mut summary,
    )?;

    finish_ingest_session(&mut transaction, session_id)?;
    transaction
        .commit()
        .context("unable to commit serial pair capture transaction")?;
    Ok(summary)
}

fn ns_raw_device_config(source_ref: &str, device_role: &str) -> Value {
    json!({
        "sourceKind": "serial",
        "sourceRef": source_ref,
        "serialProtocol": SerialProtocol::NsRaw.as_str(),
        "deviceRole": device_role
    })
}

fn persist_ns_raw_frames(
    transaction: &mut Transaction<'_>,
    session_id: i64,
    device_ids: &mut HashMap<String, i64>,
    device_external_id: &str,
    device_config: &Value,
    source_ref: &str,
    device_role: &str,
    capture: &CapturedBytes,
) -> Result<usize> {
    let frames = extract_skytraq_frames(&capture.bytes);
    if frames.is_empty() {
        return Err(anyhow!(
            "serial raw capture from {} produced no SkyTraq frames",
            source_ref
        ));
    }

    for frame_bytes in &frames {
        let sample = clartk_ns_raw::sample_from_bytes(frame_bytes).with_context(|| {
            format!("unable to decode SkyTraq Venus8 frame from {}", source_ref)
        })?;
        let observed_at = Utc::now();
        let mut parse_kind = "ns_raw_frame";
        let mut sample_summary = json!({
            "sourceKind": "serial",
            "sourceRef": source_ref,
            "serialProtocol": SerialProtocol::NsRaw.as_str(),
            "deviceRole": device_role,
            "captureMode": capture.mode,
            "transport": sample.transport,
            "messageId": sample.frame.message_id,
            "payloadBytes": sample.frame.payload.len()
        });

        if sample.frame.message_id == 0xE5 {
            let raw = clartk_skytraq_venus8::parse_extended_raw_measurements(&sample.frame)
                .with_context(|| {
                    format!(
                        "unable to parse SkyTraq extended raw measurements from {}",
                        source_ref
                    )
                })?;
            parse_kind = "ns_raw_ext_raw";
            sample_summary = json!({
                "sourceKind": "serial",
                "sourceRef": source_ref,
                "serialProtocol": SerialProtocol::NsRaw.as_str(),
                "deviceRole": device_role,
                "captureMode": capture.mode,
                "transport": sample.transport,
                "messageId": sample.frame.message_id,
                "measurementVersion": raw.version,
                "iod": raw.iod,
                "receiverWeek": raw.receiver_week,
                "receiverTowMs": raw.receiver_tow_ms,
                "measurementPeriodMs": raw.measurement_period_ms,
                "measurementIndicator": raw.measurement_indicator,
                "measurementCount": raw.measurements.len(),
                "measurements": raw.measurements
            });

            let _device_id = ensure_device_id(
                transaction,
                device_ids,
                device_external_id,
                "ns_raw",
                None,
                device_config,
            )?;
        }

        insert_ingest_sample(
            transaction,
            session_id,
            observed_at,
            parse_kind,
            frame_bytes.len() as i32,
            Some(&encode_hex_line(frame_bytes)),
            &sample_summary,
        )?;
    }

    Ok(frames.len())
}

fn persist_ntrip_capture(
    runtime_database_url: &str,
    source_ref: &str,
    capture: &CapturedFrames,
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
            "captureMode": capture.mode,
            "frameCount": capture.frames.len()
        }),
    )?;

    for frame_bytes in &capture.frames {
        let parsed = clartk_rtcm::parse_frame(&frame_bytes)
            .with_context(|| format!("unable to parse RTCM frame from {}", source_ref))?;
        insert_ingest_sample(
            &mut transaction,
            session_id,
            Utc::now(),
            "rtcm",
            frame_bytes.len() as i32,
            Some(&encode_hex_line(frame_bytes)),
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

fn merge_ingest_session_metadata(
    transaction: &mut Transaction<'_>,
    session_id: i64,
    metadata_patch: &Value,
) -> Result<()> {
    transaction
        .execute(
            "
            UPDATE telemetry.ingest_session
            SET metadata = metadata || $2::jsonb,
                last_seen_at = NOW()
            WHERE ingest_session_id = $1
            ",
            &[&session_id, &metadata_patch],
        )
        .with_context(|| format!("unable to update ingest session {}", session_id))?;
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
            &[
                &session_id,
                &observed_at,
                &parse_kind,
                &byte_count,
                &raw_payload,
                &summary,
            ],
        )
        .with_context(|| format!("unable to insert ingest sample for session {}", session_id))?;
    Ok(())
}

fn update_serial_raw_solver_outcome(
    transaction: &mut Transaction<'_>,
    session_id: i64,
    device_ids: &mut HashMap<String, i64>,
    device_external_id: &str,
    device_config: &Value,
    source_ref: &str,
    capture: &CapturedBytes,
    correction_source_ref: Option<&str>,
    correction_capture: Option<&CapturedFrames>,
    correction_error: Option<&str>,
    summary: &mut CaptureSummary,
) -> Result<()> {
    let Some(correction_capture) = correction_capture else {
        merge_ingest_session_metadata(
            transaction,
            session_id,
            &json!({
                "solverPublication": "not_attempted",
                "solverOutcome": "no_correction_capture",
                "correctionSourceRef": correction_source_ref,
                "correctionLoadError": correction_error
            }),
        )?;
        return Ok(());
    };

    let correction_bytes = flatten_frames(&correction_capture.frames);
    let solve_summary =
        clartk_rtklib_bridge::solve_skytraq_rtcm3(&capture.bytes, &correction_bytes).with_context(
            || {
                format!(
                    "unable to analyze SkyTraq raw observations with RTKLIB for {}",
                    source_ref
                )
            },
        )?;

    let metadata_patch = json!({
        "solver": "rtklib",
        "solverPublication": if solve_summary.solution.is_some() { "rtk_solution_persisted" } else { "no_solution" },
        "solverOutcome": if solve_summary.solution.is_some() { "solution_available" } else { "insufficient_reference_or_ephemeris" },
        "correctionSourceRef": correction_source_ref,
        "correctionFrameCount": correction_capture.frames.len(),
        "roverObservationEpochs": solve_summary.rover_observation_epochs,
        "referenceObservationEpochs": solve_summary.reference_observation_epochs,
        "referenceStationPositionPresent": solve_summary.reference_station_position_present,
        "rtcmMessageCount": solve_summary.rtcm_message_count,
        "correctionLoadError": correction_error
    });
    merge_ingest_session_metadata(transaction, session_id, &metadata_patch)?;

    let Some(solution) = solve_summary.solution else {
        return Ok(());
    };

    let observed_at = Utc::now();
    let device_id = ensure_device_id(
        transaction,
        device_ids,
        device_external_id,
        "ns_raw",
        None,
        device_config,
    )?;
    let position_payload = json!({
        "sourceKind": "serial",
        "sourceRef": source_ref,
        "serialProtocol": SerialProtocol::NsRaw.as_str(),
        "correctionSourceRef": correction_source_ref,
        "solver": "rtklib",
        "lat": solution.point.latitude_deg,
        "lon": solution.point.longitude_deg,
        "altMeters": solution.point.altitude_m,
        "quality": solution.quality,
        "statusCode": solution.status_code,
        "satellites": solution.satellites,
        "ageSeconds": solution.age_s,
        "ratio": solution.ratio
    });
    transaction
        .execute(
            "
            INSERT INTO telemetry.position_event (device_id, received_at, payload)
            VALUES ($1, $2, $3)
            ",
            &[&device_id, &observed_at, &position_payload],
        )
        .with_context(|| {
            format!(
                "unable to insert fused telemetry.position_event for serial source {}",
                source_ref
            )
        })?;
    summary.telemetry_positions_persisted += 1;

    let solution_summary = json!({
        "sourceKind": "serial",
        "sourceRef": source_ref,
        "serialProtocol": SerialProtocol::NsRaw.as_str(),
        "correctionSourceRef": correction_source_ref,
        "solver": "rtklib",
        "quality": solution.quality,
        "statusCode": solution.status_code,
        "satellites": solution.satellites,
        "ageSeconds": solution.age_s,
        "ratio": solution.ratio,
        "point": solution.point,
        "ecef": solution.ecef
    });
    transaction
        .execute(
            "
            INSERT INTO rtk.solution (device_id, observed_at, quality, summary)
            VALUES ($1, $2, $3, $4)
            ",
            &[
                &device_id,
                &observed_at,
                &solution.quality,
                &solution_summary,
            ],
        )
        .with_context(|| {
            format!(
                "unable to insert fused rtk.solution for serial source {}",
                source_ref
            )
        })?;
    summary.rtk_solutions_persisted += 1;
    Ok(())
}

fn update_serial_raw_pair_solver_outcome(
    transaction: &mut Transaction<'_>,
    session_id: i64,
    device_ids: &mut HashMap<String, i64>,
    rover_device_external_id: &str,
    rover_device_config: &Value,
    rover_source_ref: &str,
    rover_capture: &CapturedBytes,
    base_source_ref: &str,
    base_capture: &CapturedBytes,
    base_position: Option<ConfiguredBasePosition>,
    summary: &mut CaptureSummary,
) -> Result<()> {
    let Some(base_position) = base_position else {
        merge_ingest_session_metadata(
            transaction,
            session_id,
            &json!({
                "solverPublication": "not_attempted",
                "solverOutcome": "base_position_missing",
                "referenceStationPositionPresent": false
            }),
        )?;
        return Ok(());
    };

    let solve_summary = clartk_rtklib_bridge::solve_skytraq_pair(
        &rover_capture.bytes,
        &base_capture.bytes,
        Some(base_position.as_lla_point()),
    )
    .with_context(|| {
        format!(
            "unable to analyze SkyTraq base/rover pair with RTKLIB for rover {} and base {}",
            rover_source_ref, base_source_ref
        )
    })?;

    merge_ingest_session_metadata(
        transaction,
        session_id,
        &json!({
            "solver": "rtklib_skytraq_pair",
            "solverPublication": if solve_summary.solution.is_some() { "rtk_solution_persisted" } else { "no_solution" },
            "solverOutcome": if solve_summary.solution.is_some() { "solution_available" } else { "insufficient_ephemeris_or_geometry" },
            "roverObservationEpochs": solve_summary.rover_observation_epochs,
            "referenceObservationEpochs": solve_summary.reference_observation_epochs,
            "referenceStationPositionPresent": solve_summary.reference_station_position_present,
            "rtcmMessageCount": solve_summary.rtcm_message_count,
            "basePosition": base_position
        }),
    )?;

    let Some(solution) = solve_summary.solution else {
        return Ok(());
    };

    let observed_at = Utc::now();
    let device_id = ensure_device_id(
        transaction,
        device_ids,
        rover_device_external_id,
        "ns_raw",
        None,
        rover_device_config,
    )?;
    let position_payload = json!({
        "sourceKind": "serial",
        "sourceRef": rover_source_ref,
        "serialProtocol": SerialProtocol::NsRaw.as_str(),
        "baseSourceRef": base_source_ref,
        "solver": "rtklib_skytraq_pair",
        "basePosition": base_position,
        "lat": solution.point.latitude_deg,
        "lon": solution.point.longitude_deg,
        "altMeters": solution.point.altitude_m,
        "quality": solution.quality,
        "statusCode": solution.status_code,
        "satellites": solution.satellites,
        "ageSeconds": solution.age_s,
        "ratio": solution.ratio
    });
    transaction
        .execute(
            "
            INSERT INTO telemetry.position_event (device_id, received_at, payload)
            VALUES ($1, $2, $3)
            ",
            &[&device_id, &observed_at, &position_payload],
        )
        .with_context(|| {
            format!(
                "unable to insert fused telemetry.position_event for NS-RAW pair rover {}",
                rover_source_ref
            )
        })?;
    summary.telemetry_positions_persisted += 1;

    let solution_summary = json!({
        "sourceKind": "serial",
        "sourceRef": rover_source_ref,
        "serialProtocol": SerialProtocol::NsRaw.as_str(),
        "baseSourceRef": base_source_ref,
        "solver": "rtklib_skytraq_pair",
        "basePosition": base_position,
        "quality": solution.quality,
        "statusCode": solution.status_code,
        "satellites": solution.satellites,
        "ageSeconds": solution.age_s,
        "ratio": solution.ratio,
        "point": solution.point,
        "ecef": solution.ecef
    });
    transaction
        .execute(
            "
            INSERT INTO rtk.solution (device_id, observed_at, quality, summary)
            VALUES ($1, $2, $3, $4)
            ",
            &[
                &device_id,
                &observed_at,
                &solution.quality,
                &solution_summary,
            ],
        )
        .with_context(|| {
            format!(
                "unable to insert fused rtk.solution for NS-RAW pair rover {}",
                rover_source_ref
            )
        })?;
    summary.rtk_solutions_persisted += 1;
    Ok(())
}

fn build_gga_payload(
    sentence: &str,
    parsed: &NmeaSentence,
    source_ref: &str,
) -> Result<(Value, String, Value)> {
    if parsed.fields.len() < 9 {
        return Err(anyhow!(
            "GGA sentence from {} is missing required fields",
            source_ref
        ));
    }

    let fix = clartk_rtklib_bridge::decode_nmea_gga(sentence).with_context(|| {
        format!(
            "unable to decode GGA sentence through RTKLIB for {}",
            source_ref
        )
    })?;

    Ok((
        json!({
            "sourceKind": "serial",
            "sourceRef": source_ref,
            "talker": parsed.talker,
            "sentenceType": parsed.sentence_type,
            "ggaUtcTime": parsed.fields[0],
            "lat": fix.point.latitude_deg,
            "lon": fix.point.longitude_deg,
            "altMeters": fix.point.altitude_m,
            "fixQuality": parsed.fields[5],
            "satellites": parsed.fields[6],
            "hdop": parsed.fields[7],
            "solver": "rtklib",
            "rtklibQuality": fix.quality,
            "rtklibStatusCode": fix.status_code
        }),
        fix.quality.to_string(),
        json!({
            "sourceKind": "serial",
            "sourceRef": source_ref,
            "solver": "rtklib",
            "quality": fix.quality,
            "statusCode": fix.status_code,
            "satellites": fix.satellites,
            "point": fix.point,
            "ecef": fix.ecef
        }),
    ))
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

fn decode_hex_blob(contents: &str) -> Result<Vec<u8>> {
    let hex = contents.split_whitespace().collect::<String>();
    if hex.is_empty() {
        return Ok(Vec::new());
    }
    if hex.len() % 2 != 0 {
        return Err(anyhow!("hex payload length must be even"));
    }

    hex.as_bytes()
        .chunks(2)
        .map(|chunk| {
            let text = std::str::from_utf8(chunk)?;
            Ok(u8::from_str_radix(text, 16)?)
        })
        .collect()
}

fn load_binary_capture_file(path: &str) -> Result<Vec<u8>> {
    let bytes = fs::read(path).with_context(|| format!("unable to read {}", path))?;
    if let Ok(contents) = std::str::from_utf8(&bytes) {
        let trimmed = contents.trim();
        if !trimmed.is_empty()
            && trimmed
                .chars()
                .all(|character| character.is_ascii_hexdigit() || character.is_ascii_whitespace())
        {
            return decode_hex_blob(trimmed)
                .with_context(|| format!("unable to decode hex capture {}", path));
        }
    }
    Ok(bytes)
}

fn read_serial_bytes(source_ref: &str, baud: u32, capture_duration: Duration) -> Result<Vec<u8>> {
    let deadline = Instant::now() + capture_duration;
    let mut port = serialport::new(source_ref, baud)
        .timeout(Duration::from_millis(250))
        .open()
        .with_context(|| format!("unable to open serial port {}", source_ref))?;
    let mut bytes = Vec::new();
    let mut buffer = [0u8; 1024];

    while Instant::now() < deadline {
        match port.read(&mut buffer) {
            Ok(size) if size > 0 => bytes.extend_from_slice(&buffer[..size]),
            Ok(_) => {}
            Err(error) if error.kind() == std::io::ErrorKind::TimedOut => {}
            Err(error) => {
                return Err(error)
                    .with_context(|| format!("unable to read serial port {}", source_ref));
            }
        }
    }

    Ok(bytes)
}

fn extract_skytraq_frames(bytes: &[u8]) -> Vec<Vec<u8>> {
    let mut frames = Vec::new();
    let mut cursor = 0usize;

    while cursor + 7 <= bytes.len() {
        if bytes[cursor] != 0xA0 || bytes[cursor + 1] != 0xA1 {
            cursor += 1;
            continue;
        }

        let declared_length = ((bytes[cursor + 2] as usize) << 8) | bytes[cursor + 3] as usize;
        let frame_length = declared_length + 7;
        if cursor + frame_length > bytes.len() {
            break;
        }

        let candidate = &bytes[cursor..cursor + frame_length];
        if clartk_ns_raw::sample_from_bytes(candidate).is_ok() {
            frames.push(candidate.to_vec());
            cursor += frame_length;
        } else {
            cursor += 1;
        }
    }

    frames
}

fn load_serial_text_capture(
    source_ref: &str,
    baud: u32,
    capture_duration: Duration,
) -> Result<CapturedText> {
    if let Some(capture_path) = resolve_local_file_source(source_ref)? {
        let contents = fs::read_to_string(&capture_path)
            .with_context(|| format!("unable to read {}", capture_path))?;
        return Ok(CapturedText {
            mode: "file",
            contents,
        });
    }

    let bytes = read_serial_bytes(source_ref, baud, capture_duration)?;
    let contents = String::from_utf8_lossy(&bytes).to_string();
    if contents.trim().is_empty() {
        return Err(anyhow!(
            "serial capture from {} produced no data",
            source_ref
        ));
    }

    Ok(CapturedText {
        mode: "serial_live",
        contents,
    })
}

fn load_serial_binary_capture(
    source_ref: &str,
    baud: u32,
    capture_duration: Duration,
) -> Result<CapturedBytes> {
    if let Some(capture_path) = resolve_local_file_source(source_ref)? {
        let bytes = load_binary_capture_file(&capture_path)?;
        if bytes.is_empty() {
            return Err(anyhow!(
                "serial raw capture file {} was empty",
                capture_path
            ));
        }
        return Ok(CapturedBytes {
            mode: "file",
            bytes,
        });
    }

    let bytes = read_serial_bytes(source_ref, baud, capture_duration)?;
    if bytes.is_empty() {
        return Err(anyhow!(
            "serial raw capture from {} produced no data",
            source_ref
        ));
    }

    Ok(CapturedBytes {
        mode: "serial_live",
        bytes,
    })
}

fn load_ntrip_capture(source_ref: &str, capture_duration: Duration) -> Result<CapturedFrames> {
    if let Some(capture_path) = resolve_local_file_source(source_ref)? {
        let contents = fs::read_to_string(&capture_path)
            .with_context(|| format!("unable to read {}", capture_path))?;
        let frames = contents
            .lines()
            .filter(|line| !line.trim().is_empty())
            .map(decode_hex_line)
            .collect::<Result<Vec<_>>>()?;
        return Ok(CapturedFrames {
            mode: "file",
            frames,
        });
    }

    let url = Url::parse(source_ref).with_context(|| format!("unable to parse {}", source_ref))?;
    if !matches!(url.scheme(), "http" | "ntrip") {
        return Err(anyhow!(
            "live NTRIP capture only supports http:// or ntrip:// URLs in this slice"
        ));
    }

    let host = url.host_str().context("NTRIP URL must include a host")?;
    let port = url.port_or_known_default().unwrap_or(2101);
    let mut addresses = (host, port)
        .to_socket_addrs()
        .with_context(|| format!("unable to resolve {}:{}", host, port))?;
    let address = addresses
        .next()
        .context("NTRIP URL resolved to no addresses")?;
    let mut stream = TcpStream::connect(address)
        .with_context(|| format!("unable to connect to {}", source_ref))?;
    stream.set_read_timeout(Some(Duration::from_millis(250)))?;
    stream.set_write_timeout(Some(Duration::from_secs(2)))?;

    let request_path = if url.path().is_empty() {
        "/"
    } else {
        url.path()
    };
    let auth_header = match (url.username(), url.password()) {
        ("", _) => String::new(),
        (username, password) => {
            let token = base64::engine::general_purpose::STANDARD.encode(format!(
                "{}:{}",
                username,
                password.unwrap_or("")
            ));
            format!("Authorization: Basic {}\r\n", token)
        }
    };
    let request = format!(
        "GET {} HTTP/1.1\r\nHost: {}\r\nUser-Agent: ClaRTK-RTK-Gateway/0.1\r\nNtrip-Version: Ntrip/2.0\r\nConnection: close\r\n{}\r\n",
        request_path, host, auth_header
    );
    stream.write_all(request.as_bytes())?;

    let deadline = Instant::now() + capture_duration;
    let mut bytes = Vec::new();
    let mut buffer = [0u8; 4096];
    while Instant::now() < deadline {
        match stream.read(&mut buffer) {
            Ok(size) if size > 0 => bytes.extend_from_slice(&buffer[..size]),
            Ok(_) => break,
            Err(error) if error.kind() == std::io::ErrorKind::TimedOut => {}
            Err(error) => {
                return Err(error)
                    .with_context(|| format!("unable to read NTRIP stream {}", source_ref));
            }
        }
    }

    let payload = strip_ntrip_headers(&bytes)?;
    let frames = extract_rtcm_frames(&payload);
    if frames.is_empty() {
        return Err(anyhow!(
            "NTRIP capture from {} produced no RTCM frames",
            source_ref
        ));
    }

    Ok(CapturedFrames {
        mode: "ntrip_live",
        frames,
    })
}

fn resolve_local_file_source(source_ref: &str) -> Result<Option<String>> {
    if let Some(path) = source_ref.strip_prefix("file://") {
        return Ok(Some(path.to_string()));
    }

    if source_ref.contains("://") {
        return Ok(None);
    }

    match fs::metadata(source_ref) {
        Ok(metadata) if metadata.is_file() => Ok(Some(source_ref.to_string())),
        Ok(_) => Ok(None),
        Err(error) if source_ref.starts_with("./") || source_ref.starts_with("../") => {
            Err(error).with_context(|| format!("unable to stat {}", source_ref))
        }
        Err(_) => Ok(None),
    }
}

fn strip_ntrip_headers(bytes: &[u8]) -> Result<Vec<u8>> {
    if bytes.starts_with(b"HTTP/1.1 200")
        || bytes.starts_with(b"HTTP/1.0 200")
        || bytes.starts_with(b"ICY 200")
    {
        if let Some(index) = bytes.windows(4).position(|window| window == b"\r\n\r\n") {
            return Ok(bytes[index + 4..].to_vec());
        }
        if let Some(index) = bytes.windows(2).position(|window| window == b"\n\n") {
            return Ok(bytes[index + 2..].to_vec());
        }
        return Err(anyhow!(
            "NTRIP response did not contain a header terminator"
        ));
    }

    if bytes.starts_with(b"HTTP/1.") || bytes.starts_with(b"ICY") {
        let first_line = bytes
            .split(|byte| *byte == b'\n')
            .next()
            .map(|line| String::from_utf8_lossy(line).trim().to_string())
            .unwrap_or_else(|| "unknown NTRIP response".to_string());
        return Err(anyhow!("NTRIP server rejected request: {}", first_line));
    }

    Ok(bytes.to_vec())
}

fn extract_rtcm_frames(bytes: &[u8]) -> Vec<Vec<u8>> {
    let mut frames = Vec::new();
    let mut cursor = 0usize;

    while cursor + 6 <= bytes.len() {
        if bytes[cursor] != 0xD3 {
            cursor += 1;
            continue;
        }

        let declared_length =
            (((bytes[cursor + 1] as usize) & 0x03) << 8) | bytes[cursor + 2] as usize;
        let frame_length = declared_length + 6;
        if cursor + frame_length > bytes.len() {
            break;
        }

        let candidate = &bytes[cursor..cursor + frame_length];
        if clartk_rtcm::parse_frame(candidate).is_ok() {
            frames.push(candidate.to_vec());
            cursor += frame_length;
        } else {
            cursor += 1;
        }
    }

    frames
}

fn encode_hex_line(bytes: &[u8]) -> String {
    bytes
        .iter()
        .map(|byte| format!("{:02X}", byte))
        .collect::<Vec<_>>()
        .join("")
}

fn flatten_frames(frames: &[Vec<u8>]) -> Vec<u8> {
    let total_len = frames.iter().map(Vec::len).sum();
    let mut bytes = Vec::with_capacity(total_len);
    for frame in frames {
        bytes.extend_from_slice(frame);
    }
    bytes
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

fn start_transport_loops(config: &GatewayConfig, state: &Arc<Mutex<ReplayState>>) -> Result<()> {
    if !config.serial_loop_sources().is_empty() {
        let mut is_file_source = false;
        for source_ref in config.serial_loop_sources() {
            if resolve_local_file_source(source_ref)?.is_some() {
                is_file_source = true;
                break;
            }
        }
        let should_start = config.runtime_database_url.is_some() && !is_file_source;
        let disabled_reason = if is_file_source {
            None
        } else if config.runtime_database_url.is_none() {
            Some("runtime database not configured; live serial loop not started")
        } else {
            None
        };
        update_transport_loop_state(state, "serial", should_start, disabled_reason)?;
        if should_start {
            spawn_transport_loop("serial", config.clone(), Arc::clone(state));
        }
    }

    if let Some(source_ref) = config.ntrip_url.as_deref() {
        let is_file_source = resolve_local_file_source(source_ref)?.is_some();
        let should_start = config.runtime_database_url.is_some() && !is_file_source;
        let disabled_reason = if is_file_source {
            None
        } else if config.runtime_database_url.is_none() {
            Some("runtime database not configured; live NTRIP loop not started")
        } else {
            None
        };
        update_transport_loop_state(state, "ntrip", should_start, disabled_reason)?;
        if should_start {
            spawn_transport_loop("ntrip", config.clone(), Arc::clone(state));
        }
    }

    Ok(())
}

fn spawn_transport_loop(
    source_kind: &'static str,
    config: GatewayConfig,
    state: Arc<Mutex<ReplayState>>,
) {
    std::thread::spawn(move || loop {
        let capture_result = match source_kind {
            "serial" => run_serial_capture(&config),
            "ntrip" => run_ntrip_capture(&config),
            _ => unreachable!("unsupported transport loop"),
        };

        match capture_result {
            Ok(summary) => {
                if let Err(error) = record_transport_success(&state, source_kind, &summary) {
                    eprintln!(
                        "unable to record {} transport success: {error:#}",
                        source_kind
                    );
                }
            }
            Err(error) => {
                let error_message = format!("{error:#}");
                eprintln!("{} transport loop error: {}", source_kind, error_message);
                if let Err(record_error) =
                    record_transport_error(&state, source_kind, &error_message)
                {
                    eprintln!(
                        "unable to record {} transport error: {record_error:#}",
                        source_kind
                    );
                }
            }
        }

        std::thread::sleep(Duration::from_secs(1));
    });
}

fn update_transport_loop_state(
    state: &Arc<Mutex<ReplayState>>,
    source_kind: &str,
    enabled: bool,
    disabled_reason: Option<&str>,
) -> Result<()> {
    let mut state_guard = lock_state(state)?;
    let transport_state = transport_state_mut(&mut state_guard, source_kind)?;
    transport_state.background_loop_enabled = enabled;
    transport_state.last_error = disabled_reason.map(str::to_string);
    Ok(())
}

fn record_transport_success(
    state: &Arc<Mutex<ReplayState>>,
    source_kind: &str,
    summary: &CaptureSummary,
) -> Result<()> {
    let mut state_guard = lock_state(state)?;
    let transport_state = transport_state_mut(&mut state_guard, source_kind)?;
    transport_state.last_capture_at = Some(now_utc_iso_string());
    transport_state.last_error = None;
    transport_state.last_summary = Some(summary.clone());
    Ok(())
}

fn record_transport_error(
    state: &Arc<Mutex<ReplayState>>,
    source_kind: &str,
    error: &str,
) -> Result<()> {
    let mut state_guard = lock_state(state)?;
    let transport_state = transport_state_mut(&mut state_guard, source_kind)?;
    transport_state.last_error = Some(error.to_string());
    Ok(())
}

fn transport_state_mut<'a>(
    state: &'a mut ReplayState,
    source_kind: &str,
) -> Result<&'a mut TransportState> {
    match source_kind {
        "serial" => Ok(&mut state.serial),
        "ntrip" => Ok(&mut state.ntrip),
        _ => Err(anyhow!("unsupported transport state {}", source_kind)),
    }
}

fn record_replay_error(state: &Arc<Mutex<ReplayState>>, error: &str) -> Result<()> {
    let mut state_guard = lock_state(state)?;
    state_guard.last_replay_error = Some(error.to_string());
    state_guard.last_replay_summary = None;
    Ok(())
}

fn lock_state(state: &Arc<Mutex<ReplayState>>) -> Result<std::sync::MutexGuard<'_, ReplayState>> {
    state
        .lock()
        .map_err(|_| anyhow!("gateway replay state lock poisoned"))
}

#[cfg(test)]
mod tests {
    use super::{
        decode_hex_blob, extract_skytraq_frames, ConfiguredBasePosition, GatewayConfig,
        SerialProtocol,
    };

    #[test]
    fn decodes_hex_blob_fixture() {
        let bytes = decode_hex_blob(include_str!("../../../fixtures/skytraq/venus8-ext-raw.hex"))
            .expect("hex fixture should decode");
        assert!(!bytes.is_empty());
        assert_eq!(bytes[0], 0xA0);
        assert_eq!(bytes[1], 0xA1);
    }

    #[test]
    fn extracts_skytraq_frames_from_fixture_bytes() {
        let bytes = decode_hex_blob(include_str!("../../../fixtures/skytraq/venus8-ext-raw.hex"))
            .expect("hex fixture should decode");
        let frames = extract_skytraq_frames(&bytes);
        assert_eq!(frames.len(), 1);
        assert_eq!(frames[0][0], 0xA0);
        assert_eq!(frames[0][1], 0xA1);
    }

    #[test]
    fn accepts_legacy_ns_raw_serial_protocol_alias() {
        assert!(matches!(
            SerialProtocol::from_env(Some("ns-raw".to_string())).expect("ns-raw should parse"),
            SerialProtocol::NsRaw
        ));
        assert!(matches!(
            SerialProtocol::from_env(Some("skytraq-venus8-raw".to_string()))
                .expect("legacy alias should parse"),
            SerialProtocol::NsRaw
        ));
    }

    #[test]
    fn reports_serial_pair_input_when_ns_raw_pair_is_configured() {
        let config = GatewayConfig {
            host: "0.0.0.0".to_string(),
            port: 3200,
            mode: "hybrid".to_string(),
            runtime_database_url: Some("postgresql://example".to_string()),
            fixture_path: None,
            serial_port: None,
            rover_serial_port: Some("/dev/ttyUSB0".to_string()),
            base_serial_port: Some("/dev/ttyUSB1".to_string()),
            serial_protocol: SerialProtocol::NsRaw,
            ntrip_url: None,
            capture_seconds: 3,
            serial_baud: 115200,
            rover_serial_baud: 230400,
            base_serial_baud: 230400,
            base_position: Some(ConfiguredBasePosition {
                latitude_deg: 47.6205,
                longitude_deg: -122.3493,
                altitude_m: 25.0,
            }),
        };

        assert_eq!(config.active_inputs(), vec!["serial_pair"]);
        assert_eq!(config.primary_serial_port(), Some("/dev/ttyUSB0"));
        assert_eq!(
            config.serial_state_source_ref().as_deref(),
            Some("rover=/dev/ttyUSB0, base=/dev/ttyUSB1")
        );
    }
}
