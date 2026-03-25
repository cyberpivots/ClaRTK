use clartk_skytraq_venus8::Venus8Frame;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct NsRawSample {
    pub transport: &'static str,
    pub frame: Venus8Frame,
}

pub fn sample_from_frame(frame: Venus8Frame) -> NsRawSample {
    NsRawSample {
        transport: "usb-or-txd1",
        frame,
    }
}

