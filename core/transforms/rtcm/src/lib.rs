use thiserror::Error;

#[derive(Debug, Error)]
pub enum RtcmError {
    #[error("not enough data")]
    TooShort,
}

pub fn frame_type(bytes: &[u8]) -> Result<u16, RtcmError> {
    if bytes.len() < 3 {
        return Err(RtcmError::TooShort);
    }
    Ok((((bytes[1] as u16) & 0x03) << 8) | bytes[2] as u16)
}

