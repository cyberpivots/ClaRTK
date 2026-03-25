use anyhow::{Context, Result};
use std::env;
use std::io::{BufRead, BufReader, Write};
use std::net::{TcpListener, TcpStream};

struct GatewayConfig {
    host: String,
    port: u16,
    mode: String,
    runtime_database_url: Option<String>,
    fixture_path: Option<String>,
    serial_port: Option<String>,
    ntrip_url: Option<String>,
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
                if let Err(error) = handle_connection(stream, &config) {
                    eprintln!("gateway diagnostics error: {error:#}");
                }
            }
            Err(error) => eprintln!("gateway diagnostics accept error: {error:#}"),
        }
    }

    Ok(())
}

fn handle_connection(mut stream: TcpStream, config: &GatewayConfig) -> Result<()> {
    let mut request_line = String::new();
    let mut reader = BufReader::new(stream.try_clone()?);
    reader.read_line(&mut request_line)?;

    let path = request_line.split_whitespace().nth(1).unwrap_or("/");

    match path {
        "/health" => respond(
            &mut stream,
            "HTTP/1.1 200 OK",
            build_health_body(config),
        )?,
        "/v1/inputs" => respond(
            &mut stream,
            "HTTP/1.1 200 OK",
            build_inputs_body(config),
        )?,
        _ => respond(
            &mut stream,
            "HTTP/1.1 404 Not Found",
            "{\"error\":\"not found\"}".to_string(),
        )?,
    }

    Ok(())
}

fn respond(stream: &mut TcpStream, status_line: &str, body: String) -> Result<()> {
    write!(
        stream,
        "{status_line}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        body.len(),
        body
    )?;
    stream.flush()?;
    Ok(())
}

fn build_health_body(config: &GatewayConfig) -> String {
    format!(
        "{{\"service\":\"rtk-gateway\",\"status\":\"ok\",\"mode\":{},\"diagnosticsPort\":{},\"runtimeDatabaseConfigured\":{},\"activeInputs\":{}}}",
        json_string(&config.mode),
        config.port,
        config.runtime_database_url.is_some(),
        json_array(&config.active_inputs())
    )
}

fn build_inputs_body(config: &GatewayConfig) -> String {
    format!(
        "{{\"mode\":{},\"fixturePath\":{},\"serialPort\":{},\"ntripUrl\":{},\"activeInputs\":{}}}",
        json_string(&config.mode),
        optional_json_string(&config.fixture_path),
        optional_json_string(&config.serial_port),
        optional_json_string(&config.ntrip_url),
        json_array(&config.active_inputs())
    )
}

fn optional_json_string(value: &Option<String>) -> String {
    match value {
        Some(inner) => json_string(inner),
        None => "null".to_string(),
    }
}

fn json_array(values: &[&str]) -> String {
    let body = values
        .iter()
        .map(|value| json_string(value))
        .collect::<Vec<_>>()
        .join(",");
    format!("[{}]", body)
}

fn json_string(value: &str) -> String {
    format!("\"{}\"", json_escape(value))
}

fn json_escape(value: &str) -> String {
    let mut escaped = String::new();
    for character in value.chars() {
        match character {
            '\\' => escaped.push_str("\\\\"),
            '"' => escaped.push_str("\\\""),
            '\n' => escaped.push_str("\\n"),
            '\r' => escaped.push_str("\\r"),
            '\t' => escaped.push_str("\\t"),
            _ => escaped.push(character),
        }
    }
    escaped
}
