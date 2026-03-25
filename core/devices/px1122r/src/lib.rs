use clartk_skytraq_phoenix::PhoenixFrame;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Px1122rSample {
    pub mode: &'static str,
    pub frame: PhoenixFrame,
}

pub fn sample_from_frame(frame: PhoenixFrame) -> Px1122rSample {
    Px1122rSample {
        mode: "base-or-rover",
        frame,
    }
}

