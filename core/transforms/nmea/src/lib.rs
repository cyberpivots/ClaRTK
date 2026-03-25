use thiserror::Error;

#[derive(Debug, Error)]
pub enum NmeaError {
    #[error("sentence must start with $")]
    MissingDollar,
}

pub fn talker(sentence: &str) -> Result<&str, NmeaError> {
    if !sentence.starts_with('$') {
        return Err(NmeaError::MissingDollar);
    }
    Ok(&sentence[1..3])
}

