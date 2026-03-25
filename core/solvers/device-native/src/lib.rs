use clartk_geo::LlaPoint;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DeviceNativeFix {
    pub point: LlaPoint,
    pub quality: &'static str,
}

pub fn fixed(point: LlaPoint) -> DeviceNativeFix {
    DeviceNativeFix {
        point,
        quality: "device-native",
    }
}

