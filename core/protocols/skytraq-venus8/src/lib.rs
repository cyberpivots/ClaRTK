use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Venus8Frame {
    pub message_id: u8,
    pub payload: Vec<u8>,
}

#[derive(Debug, Error)]
pub enum DecodeError {
    #[error("frame too short")]
    TooShort,
    #[error("invalid sync bytes")]
    InvalidSync,
}

pub fn decode_frame(bytes: &[u8]) -> Result<Venus8Frame, DecodeError> {
    if bytes.len() < 8 {
        return Err(DecodeError::TooShort);
    }
    if bytes[0] != 0xA0 || bytes[1] != 0xA1 {
        return Err(DecodeError::InvalidSync);
    }
    Ok(Venus8Frame {
        message_id: bytes[4],
        payload: bytes[4..bytes.len().saturating_sub(4)].to_vec(),
    })
}

