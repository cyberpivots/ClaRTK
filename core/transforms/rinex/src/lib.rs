use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RinexObservationRef {
    pub station: String,
    pub epoch_count: u64,
}

pub fn empty_observation(station: impl Into<String>) -> RinexObservationRef {
    RinexObservationRef {
        station: station.into(),
        epoch_count: 0,
    }
}

