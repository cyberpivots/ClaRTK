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

pub fn sample_from_bytes(bytes: &[u8]) -> Result<NsRawSample, clartk_skytraq_venus8::DecodeError> {
    let frame = clartk_skytraq_venus8::decode_frame(bytes)?;
    Ok(sample_from_frame(frame))
}

#[cfg(test)]
mod tests {
    use super::sample_from_bytes;

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
    fn tags_ns_raw_navigation_fixture_transport() {
        let bytes = decode_hex_fixture(include_str!("../../../../fixtures/skytraq/venus8-nav.hex"));
        let sample = sample_from_bytes(&bytes).expect("fixture should decode");
        assert_eq!(sample.transport, "usb-or-txd1");
        assert_eq!(sample.frame.message_id, 0xDC);
    }

    #[test]
    fn decodes_ns_raw_extended_raw_fixture() {
        let bytes = decode_hex_fixture(include_str!(
            "../../../../fixtures/skytraq/ns-raw-ext-raw.hex"
        ));
        let sample = sample_from_bytes(&bytes).expect("fixture should decode");
        assert_eq!(sample.transport, "usb-or-txd1");
        assert_eq!(sample.frame.message_id, 0xE5);
    }
}
