use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Venus8Frame {
    pub message_id: u8,
    pub payload: Vec<u8>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ExtendedRawMeasurementV1 {
    pub version: u8,
    pub iod: u8,
    pub receiver_week: u16,
    pub receiver_tow_ms: u32,
    pub measurement_period_ms: u16,
    pub measurement_indicator: u8,
    pub measurements: Vec<ExtendedRawChannelMeasurement>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ExtendedRawChannelMeasurement {
    pub gnss_type: u8,
    pub signal_type: u8,
    pub svid: u8,
    pub frequency_id: u8,
    pub lock_time_indicator: u8,
    pub cn0_dbhz: u8,
    pub pseudorange_m: f64,
    pub carrier_phase_cycles: f64,
    pub doppler_hz: f32,
    pub pseudorange_stddev: u8,
    pub carrier_phase_stddev: u8,
    pub doppler_stddev: u8,
    pub channel_indicator: u16,
}

#[derive(Debug, Error)]
pub enum DecodeError {
    #[error("frame too short")]
    TooShort,
    #[error("invalid sync bytes")]
    InvalidSync,
    #[error("incomplete frame")]
    IncompleteFrame,
    #[error("frame length mismatch")]
    LengthMismatch,
    #[error("missing payload message id")]
    MissingMessageId,
    #[error("invalid frame terminator")]
    InvalidTerminator,
    #[error("checksum mismatch: expected {expected:#04x}, got {actual:#04x}")]
    ChecksumMismatch { expected: u8, actual: u8 },
}

#[derive(Debug, Error)]
pub enum RawMeasurementError {
    #[error("message {actual:#04x} is not extended raw measurements (expected 0xe5)")]
    WrongMessageId { actual: u8 },
    #[error("extended raw measurement payload too short")]
    TooShort,
    #[error("extended raw measurement payload length mismatch: expected {expected}, got {actual}")]
    LengthMismatch { expected: usize, actual: usize },
}

pub fn decode_frame(bytes: &[u8]) -> Result<Venus8Frame, DecodeError> {
    if bytes.len() < 8 {
        return Err(DecodeError::TooShort);
    }
    if bytes[0] != 0xA0 || bytes[1] != 0xA1 {
        return Err(DecodeError::InvalidSync);
    }
    let declared_length = ((bytes[2] as usize) << 8) | bytes[3] as usize;
    let expected_length = declared_length + 7;
    if bytes.len() < expected_length {
        return Err(DecodeError::IncompleteFrame);
    }
    if bytes.len() != expected_length {
        return Err(DecodeError::LengthMismatch);
    }
    if bytes[expected_length - 2] != 0x0D || bytes[expected_length - 1] != 0x0A {
        return Err(DecodeError::InvalidTerminator);
    }

    let payload = &bytes[4..4 + declared_length];
    if payload.is_empty() {
        return Err(DecodeError::MissingMessageId);
    }

    let checksum = bytes[4 + declared_length];
    let expected_checksum = payload.iter().fold(0u8, |acc, byte| acc ^ byte);
    if checksum != expected_checksum {
        return Err(DecodeError::ChecksumMismatch {
            expected: expected_checksum,
            actual: checksum,
        });
    }

    Ok(Venus8Frame {
        message_id: payload[0],
        payload: payload[1..].to_vec(),
    })
}

pub fn parse_extended_raw_measurements(
    frame: &Venus8Frame,
) -> Result<ExtendedRawMeasurementV1, RawMeasurementError> {
    if frame.message_id != 0xE5 {
        return Err(RawMeasurementError::WrongMessageId {
            actual: frame.message_id,
        });
    }
    if frame.payload.len() < 13 {
        return Err(RawMeasurementError::TooShort);
    }

    let measurement_count = frame.payload[12] as usize;
    let expected_length = 13 + (measurement_count * 31);
    if frame.payload.len() != expected_length {
        return Err(RawMeasurementError::LengthMismatch {
            expected: expected_length,
            actual: frame.payload.len(),
        });
    }

    let mut measurements = Vec::with_capacity(measurement_count);
    let mut offset = 13usize;
    while offset < frame.payload.len() {
        let descriptor = frame.payload[offset];
        let combined = frame.payload[offset + 2];
        measurements.push(ExtendedRawChannelMeasurement {
            gnss_type: descriptor & 0x0F,
            signal_type: descriptor >> 4,
            svid: frame.payload[offset + 1],
            frequency_id: combined & 0x0F,
            lock_time_indicator: combined >> 4,
            cn0_dbhz: frame.payload[offset + 3],
            pseudorange_m: f64::from_be_bytes(
                frame.payload[offset + 4..offset + 12]
                    .try_into()
                    .expect("pseudorange slice length"),
            ),
            carrier_phase_cycles: f64::from_be_bytes(
                frame.payload[offset + 12..offset + 20]
                    .try_into()
                    .expect("carrier slice length"),
            ),
            doppler_hz: f32::from_be_bytes(
                frame.payload[offset + 20..offset + 24]
                    .try_into()
                    .expect("doppler slice length"),
            ),
            pseudorange_stddev: frame.payload[offset + 24],
            carrier_phase_stddev: frame.payload[offset + 25],
            doppler_stddev: frame.payload[offset + 26],
            channel_indicator: u16::from_be_bytes(
                frame.payload[offset + 27..offset + 29]
                    .try_into()
                    .expect("indicator slice length"),
            ),
        });
        offset += 31;
    }

    Ok(ExtendedRawMeasurementV1 {
        version: frame.payload[0],
        iod: frame.payload[1],
        receiver_week: u16::from_be_bytes([frame.payload[2], frame.payload[3]]),
        receiver_tow_ms: u32::from_be_bytes([
            frame.payload[4],
            frame.payload[5],
            frame.payload[6],
            frame.payload[7],
        ]),
        measurement_period_ms: u16::from_be_bytes([frame.payload[8], frame.payload[9]]),
        measurement_indicator: frame.payload[10],
        measurements,
    })
}

#[cfg(test)]
mod tests {
    use super::{DecodeError, decode_frame, parse_extended_raw_measurements};

    fn decode_hex_fixture(contents: &str) -> Vec<u8> {
        let hex = contents.split_whitespace().collect::<String>();
        assert_eq!(hex.len() % 2, 0, "fixture hex length must be even");
        hex.as_bytes()
            .chunks(2)
            .map(|chunk| {
                let text = std::str::from_utf8(chunk).expect("fixture chunk must be utf-8");
                u8::from_str_radix(text, 16).expect("fixture chunk must be hex")
            })
            .collect()
    }

    #[test]
    fn decodes_fixture_frame_with_checksum_validation() {
        let bytes = decode_hex_fixture(include_str!("../../../../fixtures/skytraq/venus8-nav.hex"));
        let frame = decode_frame(&bytes).expect("fixture should decode");
        assert_eq!(frame.message_id, 0xDC);
        assert_eq!(frame.payload, vec![0x01, 0x02, 0x03]);
    }

    #[test]
    fn rejects_checksum_mismatch() {
        let mut bytes =
            decode_hex_fixture(include_str!("../../../../fixtures/skytraq/venus8-nav.hex"));
        let checksum_index = bytes.len() - 3;
        bytes[checksum_index] ^= 0x01;

        let error = decode_frame(&bytes).expect_err("fixture should fail checksum validation");
        assert!(matches!(error, DecodeError::ChecksumMismatch { .. }));
    }

    #[test]
    fn parses_extended_raw_measurement_fixture() {
        let bytes = decode_hex_fixture(include_str!(
            "../../../../fixtures/skytraq/venus8-ext-raw.hex"
        ));
        let frame = decode_frame(&bytes).expect("fixture should decode");
        let raw = parse_extended_raw_measurements(&frame)
            .expect("extended raw measurement fixture should parse");

        assert_eq!(frame.message_id, 0xE5);
        assert_eq!(raw.version, 1);
        assert_eq!(raw.receiver_week, 0x077C);
        assert_eq!(raw.measurement_period_ms, 1000);
        assert_eq!(raw.measurements.len(), 17);
        assert_eq!(raw.measurements[0].gnss_type, 0);
        assert_eq!(raw.measurements[0].signal_type, 0);
        assert_eq!(raw.measurements[0].svid, 0x0D);
        assert_eq!(raw.measurements[0].channel_indicator, 0x4007);
    }
}
