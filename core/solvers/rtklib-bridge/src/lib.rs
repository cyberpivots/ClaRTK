use clartk_geo::{EcefPoint, LlaPoint};
use serde::{Deserialize, Serialize};
use std::ffi::CString;
use std::os::raw::{c_char, c_int};
use std::path::{Path, PathBuf};
use thiserror::Error;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RtklibNmeaFix {
    pub point: LlaPoint,
    pub ecef: EcefPoint,
    pub quality: &'static str,
    pub status_code: u8,
    pub satellites: u8,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct RtklibRawFix {
    pub point: LlaPoint,
    pub ecef: EcefPoint,
    pub quality: &'static str,
    pub status_code: u8,
    pub satellites: u8,
    pub age_s: f64,
    pub ratio: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct RtklibRawSolveSummary {
    pub rover_observation_epochs: u32,
    pub reference_observation_epochs: u32,
    pub rtcm_message_count: u32,
    pub reference_station_position_present: bool,
    pub solution: Option<RtklibRawFix>,
}

#[derive(Debug, Error)]
pub enum RtklibBridgeError {
    #[error("RTKLIB bridge is not available")]
    Unavailable,
    #[error("RTKLIB could not decode the provided NMEA solution sentence")]
    DecodeFailed,
    #[error("NMEA sentence contained an interior NUL byte")]
    InvalidSentence,
    #[error("RTKLIB could not analyze the provided SkyTraq raw and RTCM correction streams")]
    RawSolveFailed,
}

#[repr(C)]
struct RtklibNmeaSolution {
    ok: c_int,
    stat: u8,
    ns: u8,
    lat_deg: f64,
    lon_deg: f64,
    alt_m: f64,
    ecef_x_m: f64,
    ecef_y_m: f64,
    ecef_z_m: f64,
}

#[repr(C)]
struct RtklibRawSolution {
    ok: c_int,
    solution_ok: c_int,
    rover_observation_epochs: u32,
    reference_observation_epochs: u32,
    rtcm_message_count: u32,
    reference_station_position_present: c_int,
    stat: u8,
    ns: u8,
    age_s: f64,
    ratio: f64,
    lat_deg: f64,
    lon_deg: f64,
    alt_m: f64,
    ecef_x_m: f64,
    ecef_y_m: f64,
    ecef_z_m: f64,
}

unsafe extern "C" {
    fn clartk_rtklib_decode_nmea_gga(
        sentence: *const c_char,
        out: *mut RtklibNmeaSolution,
    ) -> c_int;
    fn clartk_rtklib_solve_skytraq_rtcm3(
        rover_bytes: *const u8,
        rover_len: c_int,
        correction_bytes: *const u8,
        correction_len: c_int,
        out: *mut RtklibRawSolution,
    ) -> c_int;
    fn clartk_rtklib_solve_skytraq_pair(
        rover_bytes: *const u8,
        rover_len: c_int,
        base_bytes: *const u8,
        base_len: c_int,
        base_lat_deg: f64,
        base_lon_deg: f64,
        base_alt_m: f64,
        has_base_position: c_int,
        out: *mut RtklibRawSolution,
    ) -> c_int;
}

pub fn rtklib_present() -> bool {
    option_env!("CLARTK_RTKLIB_PRESENT").is_some()
}

pub fn rtklib_root(manifest_dir: &Path) -> PathBuf {
    manifest_dir.join("../../../third_party/rtklib")
}

pub fn decode_nmea_gga(sentence: &str) -> Result<RtklibNmeaFix, RtklibBridgeError> {
    if !rtklib_present() {
        return Err(RtklibBridgeError::Unavailable);
    }

    let sentence = CString::new(sentence).map_err(|_| RtklibBridgeError::InvalidSentence)?;
    let mut solution = RtklibNmeaSolution {
        ok: 0,
        stat: 0,
        ns: 0,
        lat_deg: 0.0,
        lon_deg: 0.0,
        alt_m: 0.0,
        ecef_x_m: 0.0,
        ecef_y_m: 0.0,
        ecef_z_m: 0.0,
    };

    let status = unsafe { clartk_rtklib_decode_nmea_gga(sentence.as_ptr(), &mut solution) };
    if status != 1 || solution.ok != 1 {
        return Err(RtklibBridgeError::DecodeFailed);
    }

    Ok(RtklibNmeaFix {
        point: LlaPoint {
            latitude_deg: solution.lat_deg,
            longitude_deg: solution.lon_deg,
            altitude_m: solution.alt_m,
        },
        ecef: EcefPoint {
            x_m: solution.ecef_x_m,
            y_m: solution.ecef_y_m,
            z_m: solution.ecef_z_m,
        },
        quality: quality_label(solution.stat),
        status_code: solution.stat,
        satellites: solution.ns,
    })
}

pub fn solve_skytraq_rtcm3(
    rover_bytes: &[u8],
    correction_bytes: &[u8],
) -> Result<RtklibRawSolveSummary, RtklibBridgeError> {
    if !rtklib_present() {
        return Err(RtklibBridgeError::Unavailable);
    }

    let mut solution = RtklibRawSolution {
        ok: 0,
        solution_ok: 0,
        rover_observation_epochs: 0,
        reference_observation_epochs: 0,
        rtcm_message_count: 0,
        reference_station_position_present: 0,
        stat: 0,
        ns: 0,
        age_s: 0.0,
        ratio: 0.0,
        lat_deg: 0.0,
        lon_deg: 0.0,
        alt_m: 0.0,
        ecef_x_m: 0.0,
        ecef_y_m: 0.0,
        ecef_z_m: 0.0,
    };

    let status = unsafe {
        clartk_rtklib_solve_skytraq_rtcm3(
            rover_bytes.as_ptr(),
            rover_bytes.len() as c_int,
            correction_bytes.as_ptr(),
            correction_bytes.len() as c_int,
            &mut solution,
        )
    };
    if status != 1 || solution.ok != 1 {
        return Err(RtklibBridgeError::RawSolveFailed);
    }

    Ok(RtklibRawSolveSummary {
        rover_observation_epochs: solution.rover_observation_epochs,
        reference_observation_epochs: solution.reference_observation_epochs,
        rtcm_message_count: solution.rtcm_message_count,
        reference_station_position_present: solution.reference_station_position_present == 1,
        solution: if solution.solution_ok == 1 {
            Some(RtklibRawFix {
                point: LlaPoint {
                    latitude_deg: solution.lat_deg,
                    longitude_deg: solution.lon_deg,
                    altitude_m: solution.alt_m,
                },
                ecef: EcefPoint {
                    x_m: solution.ecef_x_m,
                    y_m: solution.ecef_y_m,
                    z_m: solution.ecef_z_m,
                },
                quality: quality_label(solution.stat),
                status_code: solution.stat,
                satellites: solution.ns,
                age_s: solution.age_s,
                ratio: solution.ratio,
            })
        } else {
            None
        },
    })
}

pub fn solve_skytraq_pair(
    rover_bytes: &[u8],
    base_bytes: &[u8],
    base_position: Option<LlaPoint>,
) -> Result<RtklibRawSolveSummary, RtklibBridgeError> {
    if !rtklib_present() {
        return Err(RtklibBridgeError::Unavailable);
    }

    let mut solution = RtklibRawSolution {
        ok: 0,
        solution_ok: 0,
        rover_observation_epochs: 0,
        reference_observation_epochs: 0,
        rtcm_message_count: 0,
        reference_station_position_present: 0,
        stat: 0,
        ns: 0,
        age_s: 0.0,
        ratio: 0.0,
        lat_deg: 0.0,
        lon_deg: 0.0,
        alt_m: 0.0,
        ecef_x_m: 0.0,
        ecef_y_m: 0.0,
        ecef_z_m: 0.0,
    };
    let has_base_position = base_position.is_some();
    let base_position = base_position.unwrap_or(LlaPoint {
        latitude_deg: 0.0,
        longitude_deg: 0.0,
        altitude_m: 0.0,
    });

    let status = unsafe {
        clartk_rtklib_solve_skytraq_pair(
            rover_bytes.as_ptr(),
            rover_bytes.len() as c_int,
            base_bytes.as_ptr(),
            base_bytes.len() as c_int,
            base_position.latitude_deg,
            base_position.longitude_deg,
            base_position.altitude_m,
            if has_base_position { 1 } else { 0 },
            &mut solution,
        )
    };
    if status != 1 || solution.ok != 1 {
        return Err(RtklibBridgeError::RawSolveFailed);
    }

    Ok(RtklibRawSolveSummary {
        rover_observation_epochs: solution.rover_observation_epochs,
        reference_observation_epochs: solution.reference_observation_epochs,
        rtcm_message_count: solution.rtcm_message_count,
        reference_station_position_present: solution.reference_station_position_present == 1,
        solution: if solution.solution_ok == 1 {
            Some(RtklibRawFix {
                point: LlaPoint {
                    latitude_deg: solution.lat_deg,
                    longitude_deg: solution.lon_deg,
                    altitude_m: solution.alt_m,
                },
                ecef: EcefPoint {
                    x_m: solution.ecef_x_m,
                    y_m: solution.ecef_y_m,
                    z_m: solution.ecef_z_m,
                },
                quality: quality_label(solution.stat),
                status_code: solution.stat,
                satellites: solution.ns,
                age_s: solution.age_s,
                ratio: solution.ratio,
            })
        } else {
            None
        },
    })
}

fn quality_label(status_code: u8) -> &'static str {
    match status_code {
        1 => "fix",
        2 => "float",
        3 => "sbas",
        4 => "dgps",
        5 => "single",
        6 => "ppp",
        7 => "dead-reckoning",
        _ => "none",
    }
}

#[cfg(test)]
mod tests {
    use super::{decode_nmea_gga, solve_skytraq_pair, solve_skytraq_rtcm3};
    use clartk_geo::LlaPoint;

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
    fn decodes_gateway_gga_fixture() {
        let sentence = include_str!("../../../../fixtures/gateway/serial-gga-smoke.nmea").trim();
        let fix = decode_nmea_gga(sentence).expect("fixture should decode through RTKLIB");

        assert_eq!(fix.quality, "single");
        assert_eq!(fix.satellites, 8);
        assert!((fix.point.latitude_deg - 48.1173).abs() < 0.0001);
        assert!((fix.point.longitude_deg - 11.5166666667).abs() < 0.0001);
        assert!((fix.point.altitude_m - 592.3).abs() < 0.1);
    }

    #[test]
    fn summarizes_raw_rover_with_station_only_rtcm_without_fake_solution() {
        let rover_bytes = decode_hex_fixture(include_str!(
            "../../../../fixtures/skytraq/venus8-ext-raw.hex"
        ));
        let rtcm_bytes =
            decode_hex_fixture(include_str!("../../../../fixtures/rtcm/rtcm3-msg1005.hex"));
        let summary = solve_skytraq_rtcm3(&rover_bytes, &rtcm_bytes)
            .expect("raw analysis should complete through RTKLIB");

        assert_eq!(summary.rover_observation_epochs, 1);
        assert_eq!(summary.reference_observation_epochs, 0);
        assert_eq!(summary.rtcm_message_count, 1);
        assert!(!summary.reference_station_position_present);
        assert!(summary.solution.is_none());
    }

    #[test]
    fn summarizes_skytraq_pair_without_base_position_without_fake_solution() {
        let rover_bytes = decode_hex_fixture(include_str!(
            "../../../../fixtures/skytraq/venus8-ext-raw.hex"
        ));
        let base_bytes = decode_hex_fixture(include_str!(
            "../../../../fixtures/skytraq/venus8-ext-raw.hex"
        ));
        let summary =
            solve_skytraq_pair(&rover_bytes, &base_bytes, None).expect("pair analysis should run");

        assert_eq!(summary.rover_observation_epochs, 1);
        assert_eq!(summary.reference_observation_epochs, 1);
        assert_eq!(summary.rtcm_message_count, 0);
        assert!(!summary.reference_station_position_present);
        assert!(summary.solution.is_none());
    }

    #[test]
    fn summarizes_skytraq_pair_with_manual_base_position_without_fake_solution() {
        let rover_bytes = decode_hex_fixture(include_str!(
            "../../../../fixtures/skytraq/venus8-ext-raw.hex"
        ));
        let base_bytes = decode_hex_fixture(include_str!(
            "../../../../fixtures/skytraq/venus8-ext-raw.hex"
        ));
        let summary = solve_skytraq_pair(
            &rover_bytes,
            &base_bytes,
            Some(LlaPoint {
                latitude_deg: 47.6205,
                longitude_deg: -122.3493,
                altitude_m: 25.0,
            }),
        )
        .expect("pair analysis should run");

        assert_eq!(summary.rover_observation_epochs, 1);
        assert_eq!(summary.reference_observation_epochs, 1);
        assert!(summary.reference_station_position_present);
        assert!(summary.solution.is_none());
    }
}
