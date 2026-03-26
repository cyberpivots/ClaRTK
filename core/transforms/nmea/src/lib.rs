use thiserror::Error;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NmeaSentence {
    pub talker: String,
    pub sentence_type: String,
    pub fields: Vec<String>,
    pub checksum: u8,
}

#[derive(Debug, Error)]
pub enum NmeaError {
    #[error("sentence must start with $")]
    MissingDollar,
    #[error("sentence header is too short")]
    HeaderTooShort,
    #[error("sentence is missing checksum separator")]
    MissingChecksumSeparator,
    #[error("invalid checksum field")]
    InvalidChecksum,
    #[error("checksum mismatch: expected {expected:#04x}, got {actual:#04x}")]
    ChecksumMismatch { expected: u8, actual: u8 },
}

pub fn talker(sentence: &str) -> Result<&str, NmeaError> {
    let trimmed = sentence.trim_end_matches(['\r', '\n']);
    if !trimmed.starts_with('$') {
        return Err(NmeaError::MissingDollar);
    }
    if trimmed.len() < 6 {
        return Err(NmeaError::HeaderTooShort);
    }
    Ok(&trimmed[1..3])
}

pub fn parse_sentence(sentence: &str) -> Result<NmeaSentence, NmeaError> {
    let trimmed = sentence.trim_end_matches(['\r', '\n']);
    if !trimmed.starts_with('$') {
        return Err(NmeaError::MissingDollar);
    }

    let (data, checksum_text) = trimmed.split_once('*').ok_or(NmeaError::MissingChecksumSeparator)?;
    let checksum_text = checksum_text.trim();
    if checksum_text.len() != 2 {
        return Err(NmeaError::InvalidChecksum);
    }

    let actual_checksum =
        u8::from_str_radix(checksum_text, 16).map_err(|_| NmeaError::InvalidChecksum)?;
    let expected_checksum = data.as_bytes()[1..].iter().fold(0u8, |acc, byte| acc ^ byte);
    if actual_checksum != expected_checksum {
        return Err(NmeaError::ChecksumMismatch {
            expected: expected_checksum,
            actual: actual_checksum,
        });
    }

    let payload = &data[1..];
    let (header, field_text) = payload.split_once(',').unwrap_or((payload, ""));
    if header.len() < 5 {
        return Err(NmeaError::HeaderTooShort);
    }

    Ok(NmeaSentence {
        talker: header[0..2].to_string(),
        sentence_type: header[2..].to_string(),
        fields: if field_text.is_empty() {
            Vec::new()
        } else {
            field_text.split(',').map(ToString::to_string).collect()
        },
        checksum: actual_checksum,
    })
}

#[cfg(test)]
mod tests {
    use super::{parse_sentence, talker, NmeaError};

    #[test]
    fn parses_gga_fixture_with_checksum_validation() {
        let sentence = include_str!("../../../../fixtures/nmea/gga-sample.nmea");
        let parsed = parse_sentence(sentence).expect("fixture should parse");
        assert_eq!(talker(sentence).expect("fixture talker"), "GP");
        assert_eq!(parsed.sentence_type, "GGA");
        assert_eq!(parsed.fields[0], "123519");
        assert_eq!(parsed.fields[1], "4807.038");
    }

    #[test]
    fn rejects_bad_checksum() {
        let sentence = "$GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,46.9,M,,*00";
        let error = parse_sentence(sentence).expect_err("checksum should fail");
        assert!(matches!(error, NmeaError::ChecksumMismatch { .. }));
    }
}
