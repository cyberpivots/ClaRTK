use thiserror::Error;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RtcmFrame {
    pub message_type: u16,
    pub payload: Vec<u8>,
}

#[derive(Debug, Error)]
pub enum RtcmError {
    #[error("not enough data")]
    TooShort,
    #[error("invalid preamble")]
    InvalidPreamble,
    #[error("incomplete frame")]
    IncompleteFrame,
    #[error("frame length mismatch")]
    LengthMismatch,
    #[error("missing message type")]
    MissingMessageType,
    #[error("crc mismatch: expected {expected:#08x}, got {actual:#08x}")]
    CrcMismatch { expected: u32, actual: u32 },
}

pub fn frame_type(bytes: &[u8]) -> Result<u16, RtcmError> {
    Ok(parse_frame(bytes)?.message_type)
}

pub fn parse_frame(bytes: &[u8]) -> Result<RtcmFrame, RtcmError> {
    if bytes.len() < 6 {
        return Err(RtcmError::TooShort);
    }
    if bytes[0] != 0xD3 {
        return Err(RtcmError::InvalidPreamble);
    }

    let declared_length = (((bytes[1] as usize) & 0x03) << 8) | bytes[2] as usize;
    let expected_length = declared_length + 6;
    if bytes.len() < expected_length {
        return Err(RtcmError::IncompleteFrame);
    }
    if bytes.len() != expected_length {
        return Err(RtcmError::LengthMismatch);
    }

    let payload = &bytes[3..3 + declared_length];
    if payload.len() < 2 {
        return Err(RtcmError::MissingMessageType);
    }

    let actual_crc =
        ((bytes[expected_length - 3] as u32) << 16)
            | ((bytes[expected_length - 2] as u32) << 8)
            | bytes[expected_length - 1] as u32;
    let expected_crc = crc24q(&bytes[..expected_length - 3]);
    if actual_crc != expected_crc {
        return Err(RtcmError::CrcMismatch {
            expected: expected_crc,
            actual: actual_crc,
        });
    }

    Ok(RtcmFrame {
        message_type: ((payload[0] as u16) << 4) | ((payload[1] as u16) >> 4),
        payload: payload.to_vec(),
    })
}

fn crc24q(bytes: &[u8]) -> u32 {
    let mut crc = 0u32;
    for byte in bytes {
        crc ^= (*byte as u32) << 16;
        for _ in 0..8 {
            crc <<= 1;
            if (crc & 0x1000000) != 0 {
                crc ^= 0x1864CFB;
            }
            crc &= 0xFFFFFF;
        }
    }
    crc
}

#[cfg(test)]
mod tests {
    use super::{frame_type, parse_frame, RtcmError};

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
    fn decodes_rtcm_fixture_and_message_type() {
        let bytes = decode_hex_fixture(include_str!("../../../../fixtures/rtcm/rtcm3-msg1005.hex"));
        let frame = parse_frame(&bytes).expect("fixture should parse");
        assert_eq!(frame_type(&bytes).expect("fixture message type"), 1005);
        assert_eq!(frame.message_type, 1005);
        assert_eq!(frame.payload.len(), 4);
    }

    #[test]
    fn rejects_crc_mismatch() {
        let mut bytes = decode_hex_fixture(include_str!("../../../../fixtures/rtcm/rtcm3-msg1005.hex"));
        let tail_index = bytes.len() - 1;
        bytes[tail_index] ^= 0x01;

        let error = parse_frame(&bytes).expect_err("fixture should fail crc validation");
        assert!(matches!(error, RtcmError::CrcMismatch { .. }));
    }
}
