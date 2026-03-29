#!/usr/bin/env python3
from __future__ import annotations

import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse


def build_payload() -> dict[str, object]:
    fixture_path = os.environ.get("CLARTK_GATEWAY_FIXTURE_PATH")
    serial_port = os.environ.get("CLARTK_GATEWAY_SERIAL_PORT")
    rover_serial_port = os.environ.get("CLARTK_GATEWAY_ROVER_SERIAL_PORT")
    base_serial_port = os.environ.get("CLARTK_GATEWAY_BASE_SERIAL_PORT")
    ntrip_url = os.environ.get("CLARTK_GATEWAY_NTRIP_URL")

    active_inputs = []
    if fixture_path:
        active_inputs.append("fixture_replay")
    if rover_serial_port and base_serial_port:
        active_inputs.append("serial_pair")
    elif rover_serial_port or serial_port:
        active_inputs.append("serial")
    if ntrip_url:
        active_inputs.append("ntrip")

    return {
        "service": "rtk-gateway",
        "status": "degraded",
        "mode": os.environ.get("CLARTK_GATEWAY_MODE", "hybrid"),
        "diagnosticsPort": int(os.environ.get("CLARTK_GATEWAY_DIAGNOSTICS_PORT", "3200")),
        "runtimeDatabaseConfigured": bool(os.environ.get("CLARTK_RUNTIME_DATABASE_URL")),
        "serialProtocol": os.environ.get("CLARTK_GATEWAY_SERIAL_PROTOCOL", "nmea"),
        "serialPort": serial_port or rover_serial_port,
        "roverSerialPort": rover_serial_port,
        "baseSerialPort": base_serial_port,
        "activeInputs": active_inputs,
        "note": "Rust host prerequisites are unavailable on this machine; this stand-in preserves the diagnostics boundary."
    }


class Handler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path not in {"/health", "/v1/inputs"}:
            self.send_response(404)
            self.end_headers()
            return

        payload = build_payload()
        body = json.dumps(payload).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format: str, *args: object) -> None:
        return


def main() -> None:
    host = os.environ.get("CLARTK_GATEWAY_DIAGNOSTICS_HOST", "0.0.0.0")
    port = int(os.environ.get("CLARTK_GATEWAY_DIAGNOSTICS_PORT", "3200"))
    server = ThreadingHTTPServer((host, port), Handler)
    server.serve_forever()


if __name__ == "__main__":
    main()
