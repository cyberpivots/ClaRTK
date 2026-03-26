use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PhoenixFrame {
    pub message_id: u8,
    pub payload: Vec<u8>,
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

pub fn decode_frame(bytes: &[u8]) -> Result<PhoenixFrame, DecodeError> {
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

    Ok(PhoenixFrame {
        message_id: payload[0],
        payload: payload[1..].to_vec(),
    })
}

#[cfg(test)]
mod tests {
    use super::{decode_frame, DecodeError};

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
        let bytes = decode_hex_fixture(include_str!("../../../../fixtures/skytraq/phoenix-status.hex"));
        let frame = decode_frame(&bytes).expect("fixture should decode");
        assert_eq!(frame.message_id, 0xE2);
        assert_eq!(frame.payload, vec![0x10, 0x20]);
    }

    #[test]
    fn rejects_invalid_trailer() {
        let mut bytes = decode_hex_fixture(include_str!("../../../../fixtures/skytraq/phoenix-status.hex"));
        let trailer_index = bytes.len() - 1;
        bytes[trailer_index] = 0xFF;

        let error = decode_frame(&bytes).expect_err("fixture should fail trailer validation");
        assert!(matches!(error, DecodeError::InvalidTerminator));
    }
}
