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

pub fn sample_from_bytes(bytes: &[u8]) -> Result<Px1122rSample, clartk_skytraq_phoenix::DecodeError> {
    let frame = clartk_skytraq_phoenix::decode_frame(bytes)?;
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
    fn tags_px1122r_fixture_mode() {
        let bytes = decode_hex_fixture(include_str!("../../../../fixtures/skytraq/phoenix-status.hex"));
        let sample = sample_from_bytes(&bytes).expect("fixture should decode");
        assert_eq!(sample.mode, "base-or-rover");
        assert_eq!(sample.frame.message_id, 0xE2);
    }
}
