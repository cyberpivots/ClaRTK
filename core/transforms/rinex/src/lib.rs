use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RinexObservationRef {
    pub station: String,
    pub epoch_count: u64,
}

#[derive(Debug, Error)]
pub enum RinexError {
    #[error("missing marker name")]
    MissingMarkerName,
    #[error("missing END OF HEADER marker")]
    MissingEndOfHeader,
}

pub fn empty_observation(station: impl Into<String>) -> RinexObservationRef {
    RinexObservationRef {
        station: station.into(),
        epoch_count: 0,
    }
}

pub fn observation_ref(contents: &str) -> Result<RinexObservationRef, RinexError> {
    let mut station: Option<String> = None;
    let mut epoch_count = 0u64;
    let mut in_body = false;

    for line in contents.lines() {
        if !in_body {
            if line.contains("MARKER NAME") {
                let candidate = line.get(..60).unwrap_or(line).trim();
                if !candidate.is_empty() {
                    station = Some(candidate.to_string());
                }
            }
            if line.contains("END OF HEADER") {
                in_body = true;
            }
            continue;
        }

        if line.starts_with('>') {
            epoch_count += 1;
        }
    }

    if !in_body {
        return Err(RinexError::MissingEndOfHeader);
    }

    let station = station.ok_or(RinexError::MissingMarkerName)?;
    Ok(RinexObservationRef { station, epoch_count })
}

#[cfg(test)]
mod tests {
    use super::{empty_observation, observation_ref};

    #[test]
    fn parses_fixture_station_and_epoch_count() {
        let rinex = include_str!("../../../../fixtures/rinex/obs-sample.24o");
        let summary = observation_ref(rinex).expect("fixture should parse");
        assert_eq!(summary.station, "TEST STATION");
        assert_eq!(summary.epoch_count, 2);
    }

    #[test]
    fn creates_empty_summary() {
        let summary = empty_observation("test");
        assert_eq!(summary.station, "test");
        assert_eq!(summary.epoch_count, 0);
    }
}
