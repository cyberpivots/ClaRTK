use serde::{Deserialize, Serialize};
use thiserror::Error;

const SYNC_1: u8 = 0xA0;
const SYNC_2: u8 = 0xA1;
const TRAILER_1: u8 = 0x0D;
const TRAILER_2: u8 = 0x0A;

const MESSAGE_ID_QUERY_SOFTWARE_VERSION: u8 = 0x02;
const MESSAGE_ID_CONFIGURE_SERIAL_PORT: u8 = 0x05;
const MESSAGE_ID_CONFIGURE_MESSAGE_TYPE: u8 = 0x09;
const MESSAGE_ID_CONFIGURE_POSITION_UPDATE_RATE: u8 = 0x0E;
const MESSAGE_ID_QUERY_POSITION_UPDATE_RATE: u8 = 0x10;
const MESSAGE_ID_QUERY_MESSAGE_TYPE: u8 = 0x16;
const MESSAGE_ID_CONFIGURE_BINARY_MEASUREMENT_OUTPUT: u8 = 0x1E;
const MESSAGE_ID_QUERY_BINARY_MEASUREMENT_OUTPUT_STATUS: u8 = 0x1F;

const MESSAGE_ID_SOFTWARE_VERSION: u8 = 0x80;
const MESSAGE_ID_ACK: u8 = 0x83;
const MESSAGE_ID_NACK: u8 = 0x84;
const MESSAGE_ID_POSITION_UPDATE_RATE: u8 = 0x86;
const MESSAGE_ID_BINARY_MEASUREMENT_OUTPUT_STATUS: u8 = 0x89;
const MESSAGE_ID_MESSAGE_TYPE: u8 = 0x8C;
const MESSAGE_ID_EXTENDED_RAW_MEASUREMENT_V1: u8 = 0xE5;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Venus8Frame {
    pub message_id: u8,
    pub payload: Vec<u8>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[repr(u8)]
pub enum OutputMessageType {
    None = 0,
    Nmea = 1,
    Binary = 2,
}

impl OutputMessageType {
    fn from_wire(value: u8) -> Result<Self, ProtocolError> {
        match value {
            0 => Ok(Self::None),
            1 => Ok(Self::Nmea),
            2 => Ok(Self::Binary),
            other => Err(ProtocolError::InvalidFieldValue {
                field: "message_type",
                value: other,
            }),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[repr(u8)]
pub enum StorageLocation {
    Sram = 0,
    SramAndFlash = 1,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[repr(u8)]
pub enum SerialStorageLocation {
    Sram = 0,
    SramAndFlash = 1,
    Temporary = 2,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[repr(u8)]
pub enum BaudRate {
    B4800 = 0,
    B9600 = 1,
    B19200 = 2,
    B38400 = 3,
    B57600 = 4,
    B115200 = 5,
    B230400 = 6,
    B460800 = 7,
    B921600 = 8,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum PositionUpdateRate {
    Hz1,
    Hz2,
    Hz4,
    Hz5,
    Hz8,
    Hz10,
    Hz20,
    Hz25,
    Hz40,
    Hz50,
}

impl PositionUpdateRate {
    fn from_wire(value: u8) -> Result<Self, ProtocolError> {
        match value {
            1 => Ok(Self::Hz1),
            2 => Ok(Self::Hz2),
            4 => Ok(Self::Hz4),
            5 => Ok(Self::Hz5),
            8 => Ok(Self::Hz8),
            10 => Ok(Self::Hz10),
            20 => Ok(Self::Hz20),
            25 => Ok(Self::Hz25),
            40 => Ok(Self::Hz40),
            50 => Ok(Self::Hz50),
            other => Err(ProtocolError::InvalidFieldValue {
                field: "position_update_rate",
                value: other,
            }),
        }
    }

    fn to_wire(self) -> u8 {
        match self {
            Self::Hz1 => 1,
            Self::Hz2 => 2,
            Self::Hz4 => 4,
            Self::Hz5 => 5,
            Self::Hz8 => 8,
            Self::Hz10 => 10,
            Self::Hz20 => 20,
            Self::Hz25 => 25,
            Self::Hz40 => 40,
            Self::Hz50 => 50,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum BinaryMeasurementOutputRate {
    Hz1,
    Hz2,
    Hz4,
    Hz5,
    Hz8,
    Hz10,
    Hz20,
}

impl BinaryMeasurementOutputRate {
    fn from_wire(value: u8) -> Result<Self, ProtocolError> {
        match value {
            0 => Ok(Self::Hz1),
            1 => Ok(Self::Hz2),
            2 => Ok(Self::Hz4),
            3 => Ok(Self::Hz5),
            4 => Ok(Self::Hz10),
            5 => Ok(Self::Hz20),
            6 => Ok(Self::Hz8),
            other => Err(ProtocolError::InvalidFieldValue {
                field: "binary_measurement_output_rate",
                value: other,
            }),
        }
    }

    fn to_wire(self) -> u8 {
        match self {
            Self::Hz1 => 0,
            Self::Hz2 => 1,
            Self::Hz4 => 2,
            Self::Hz5 => 3,
            Self::Hz10 => 4,
            Self::Hz20 => 5,
            Self::Hz8 => 6,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
pub struct ConstellationMask {
    pub gps: bool,
    pub glonass: bool,
    pub galileo: bool,
    pub beidou: bool,
}

impl ConstellationMask {
    fn to_wire(self) -> u8 {
        u8::from(self.gps)
            | (u8::from(self.glonass) << 1)
            | (u8::from(self.galileo) << 2)
            | (u8::from(self.beidou) << 3)
    }

    fn from_wire(value: u8) -> Self {
        Self {
            gps: value & 0x01 != 0,
            glonass: value & 0x02 != 0,
            galileo: value & 0x04 != 0,
            beidou: value & 0x08 != 0,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct BinaryMeasurementOutputConfig {
    pub rate: BinaryMeasurementOutputRate,
    pub meas_time_enabled: bool,
    pub raw_measurement_enabled: bool,
    pub sv_channel_status_enabled: bool,
    pub receiver_state_enabled: bool,
    pub subframe_enabled: ConstellationMask,
    pub extended_raw_measurement_enabled: bool,
    pub attributes: StorageLocation,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SoftwareVersion {
    pub software_type: u8,
    pub kernel_version: u32,
    pub odm_version: u32,
    pub revision: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RequestCorrelation {
    pub request_ids: Vec<u8>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum Venus8Command {
    QuerySoftwareVersion,
    ConfigureSerialPort {
        com_port: u8,
        baud_rate: BaudRate,
        attributes: SerialStorageLocation,
    },
    ConfigureMessageType {
        message_type: OutputMessageType,
        attributes: StorageLocation,
    },
    ConfigurePositionUpdateRate {
        rate: PositionUpdateRate,
        attributes: StorageLocation,
    },
    QueryPositionUpdateRate,
    QueryMessageType,
    ConfigureBinaryMeasurementOutput(BinaryMeasurementOutputConfig),
    QueryBinaryMeasurementOutputStatus,
}

impl Venus8Command {
    pub fn to_frame(&self) -> Venus8Frame {
        match self {
            Self::QuerySoftwareVersion => Venus8Frame {
                message_id: MESSAGE_ID_QUERY_SOFTWARE_VERSION,
                payload: Vec::new(),
            },
            Self::ConfigureSerialPort {
                com_port,
                baud_rate,
                attributes,
            } => Venus8Frame {
                message_id: MESSAGE_ID_CONFIGURE_SERIAL_PORT,
                payload: vec![*com_port, *baud_rate as u8, *attributes as u8],
            },
            Self::ConfigureMessageType {
                message_type,
                attributes,
            } => Venus8Frame {
                message_id: MESSAGE_ID_CONFIGURE_MESSAGE_TYPE,
                payload: vec![*message_type as u8, *attributes as u8],
            },
            Self::ConfigurePositionUpdateRate { rate, attributes } => Venus8Frame {
                message_id: MESSAGE_ID_CONFIGURE_POSITION_UPDATE_RATE,
                payload: vec![rate.to_wire(), *attributes as u8],
            },
            Self::QueryPositionUpdateRate => Venus8Frame {
                message_id: MESSAGE_ID_QUERY_POSITION_UPDATE_RATE,
                payload: Vec::new(),
            },
            Self::QueryMessageType => Venus8Frame {
                message_id: MESSAGE_ID_QUERY_MESSAGE_TYPE,
                payload: Vec::new(),
            },
            Self::ConfigureBinaryMeasurementOutput(config) => Venus8Frame {
                message_id: MESSAGE_ID_CONFIGURE_BINARY_MEASUREMENT_OUTPUT,
                payload: vec![
                    config.rate.to_wire(),
                    u8::from(config.meas_time_enabled),
                    u8::from(config.raw_measurement_enabled),
                    u8::from(config.sv_channel_status_enabled),
                    u8::from(config.receiver_state_enabled),
                    config.subframe_enabled.to_wire(),
                    u8::from(config.extended_raw_measurement_enabled),
                    config.attributes as u8,
                ],
            },
            Self::QueryBinaryMeasurementOutputStatus => Venus8Frame {
                message_id: MESSAGE_ID_QUERY_BINARY_MEASUREMENT_OUTPUT_STATUS,
                payload: Vec::new(),
            },
        }
    }

    pub fn encode(&self) -> Vec<u8> {
        encode_frame(&self.to_frame())
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum Venus8OutputMessage {
    Ack(RequestCorrelation),
    Nack(RequestCorrelation),
    SoftwareVersion(SoftwareVersion),
    PositionUpdateRate(PositionUpdateRate),
    MessageType(OutputMessageType),
    BinaryMeasurementOutputStatus(BinaryMeasurementOutputConfig),
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ExtendedRawMeasurementV1 {
    pub version: u8,
    pub iod: u8,
    pub receiver_week: u16,
    pub receiver_tow_ms: u32,
    pub measurement_period_ms: u16,
    pub measurement_indicator: u8,
    pub measurements: Vec<ExtendedRawChannelMeasurement>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ExtendedRawChannelMeasurement {
    pub gnss_type: u8,
    pub signal_type: u8,
    pub svid: u8,
    pub frequency_id: u8,
    pub lock_time_indicator: u8,
    pub cn0_dbhz: u8,
    pub pseudorange_m: f64,
    pub carrier_phase_cycles: f64,
    pub doppler_hz: f32,
    pub pseudorange_stddev: u8,
    pub carrier_phase_stddev: u8,
    pub doppler_stddev: u8,
    pub channel_indicator: u16,
}

#[derive(Debug, Error)]
pub enum DecodeError {
    #[error("frame too short")]
    TooShort,
    #[error("invalid sync bytes")]
    InvalidSync,
    #[error("incomplete frame")]
    IncompleteFrame,
    #[error("frame length mismatch")]
    LengthMismatch,
    #[error("missing payload message id")]
    MissingMessageId,
    #[error("invalid frame terminator")]
    InvalidTerminator,
    #[error("checksum mismatch: expected {expected:#04x}, got {actual:#04x}")]
    ChecksumMismatch { expected: u8, actual: u8 },
}

#[derive(Debug, Error)]
pub enum RawMeasurementError {
    #[error("message {actual:#04x} is not extended raw measurements (expected 0xe5)")]
    WrongMessageId { actual: u8 },
    #[error("extended raw measurement payload too short")]
    TooShort,
    #[error("extended raw measurement payload length mismatch: expected {expected}, got {actual}")]
    LengthMismatch { expected: usize, actual: usize },
}

#[derive(Debug, Error)]
pub enum ProtocolError {
    #[error(transparent)]
    Decode(#[from] DecodeError),
    #[error("unsupported output message {message_id:#04x}")]
    UnsupportedOutputMessage { message_id: u8 },
    #[error("output message {message_id:#04x} payload too short: expected at least {expected}, got {actual}")]
    OutputTooShort {
        message_id: u8,
        expected: usize,
        actual: usize,
    },
    #[error("invalid {field} field value {value:#04x}")]
    InvalidFieldValue { field: &'static str, value: u8 },
}

pub fn encode_frame(frame: &Venus8Frame) -> Vec<u8> {
    let declared_length = frame.payload.len() + 1;
    let mut bytes = Vec::with_capacity(declared_length + 7);
    bytes.push(SYNC_1);
    bytes.push(SYNC_2);
    bytes.extend_from_slice(&(declared_length as u16).to_be_bytes());
    bytes.push(frame.message_id);
    bytes.extend_from_slice(&frame.payload);
    let checksum = bytes[4..].iter().fold(0u8, |acc, byte| acc ^ byte);
    bytes.push(checksum);
    bytes.push(TRAILER_1);
    bytes.push(TRAILER_2);
    bytes
}

pub fn decode_frame(bytes: &[u8]) -> Result<Venus8Frame, DecodeError> {
    if bytes.len() < 8 {
        return Err(DecodeError::TooShort);
    }
    if bytes[0] != SYNC_1 || bytes[1] != SYNC_2 {
        return Err(DecodeError::InvalidSync);
    }
    let declared_length = ((bytes[2] as usize) << 8) | bytes[3] as usize;
    let expected_length = declared_length + 7;
    if bytes.len() < expected_length {
        return Err(DecodeError::IncompleteFrame);
    }
    if bytes.len() != expected_length {
        return Err(DecodeError::LengthMismatch);
    }
    if bytes[expected_length - 2] != TRAILER_1 || bytes[expected_length - 1] != TRAILER_2 {
        return Err(DecodeError::InvalidTerminator);
    }

    let payload = &bytes[4..4 + declared_length];
    if payload.is_empty() {
        return Err(DecodeError::MissingMessageId);
    }

    let checksum = bytes[4 + declared_length];
    let expected_checksum = payload.iter().fold(0u8, |acc, byte| acc ^ byte);
    if checksum != expected_checksum {
        return Err(DecodeError::ChecksumMismatch {
            expected: expected_checksum,
            actual: checksum,
        });
    }

    Ok(Venus8Frame {
        message_id: payload[0],
        payload: payload[1..].to_vec(),
    })
}

pub fn decode_output_message(bytes: &[u8]) -> Result<Venus8OutputMessage, ProtocolError> {
    let frame = decode_frame(bytes)?;
    parse_output_message(&frame)
}

pub fn parse_output_message(frame: &Venus8Frame) -> Result<Venus8OutputMessage, ProtocolError> {
    match frame.message_id {
        MESSAGE_ID_ACK => Ok(Venus8OutputMessage::Ack(RequestCorrelation {
            request_ids: frame.payload.clone(),
        })),
        MESSAGE_ID_NACK => Ok(Venus8OutputMessage::Nack(RequestCorrelation {
            request_ids: frame.payload.clone(),
        })),
        MESSAGE_ID_SOFTWARE_VERSION => {
            if frame.payload.len() < 13 {
                return Err(ProtocolError::OutputTooShort {
                    message_id: frame.message_id,
                    expected: 13,
                    actual: frame.payload.len(),
                });
            }
            Ok(Venus8OutputMessage::SoftwareVersion(SoftwareVersion {
                software_type: frame.payload[0],
                kernel_version: u32::from_be_bytes(
                    frame.payload[1..5].try_into().expect("kernel version slice length"),
                ),
                odm_version: u32::from_be_bytes(
                    frame.payload[5..9].try_into().expect("odm version slice length"),
                ),
                revision: u32::from_be_bytes(
                    frame.payload[9..13].try_into().expect("revision slice length"),
                ),
            }))
        }
        MESSAGE_ID_POSITION_UPDATE_RATE => {
            let rate = *frame
                .payload
                .first()
                .ok_or(ProtocolError::OutputTooShort {
                    message_id: frame.message_id,
                    expected: 1,
                    actual: 0,
                })?;
            Ok(Venus8OutputMessage::PositionUpdateRate(
                PositionUpdateRate::from_wire(rate)?,
            ))
        }
        MESSAGE_ID_MESSAGE_TYPE => {
            let value = *frame
                .payload
                .first()
                .ok_or(ProtocolError::OutputTooShort {
                    message_id: frame.message_id,
                    expected: 1,
                    actual: 0,
                })?;
            Ok(Venus8OutputMessage::MessageType(
                OutputMessageType::from_wire(value)?,
            ))
        }
        MESSAGE_ID_BINARY_MEASUREMENT_OUTPUT_STATUS => {
            if frame.payload.len() < 7 {
                return Err(ProtocolError::OutputTooShort {
                    message_id: frame.message_id,
                    expected: 7,
                    actual: frame.payload.len(),
                });
            }
            Ok(Venus8OutputMessage::BinaryMeasurementOutputStatus(
                BinaryMeasurementOutputConfig {
                    rate: BinaryMeasurementOutputRate::from_wire(frame.payload[0])?,
                    meas_time_enabled: frame.payload[1] != 0,
                    raw_measurement_enabled: frame.payload[2] != 0,
                    sv_channel_status_enabled: frame.payload[3] != 0,
                    receiver_state_enabled: frame.payload[4] != 0,
                    subframe_enabled: ConstellationMask::from_wire(frame.payload[5]),
                    extended_raw_measurement_enabled: frame.payload[6] != 0,
                    attributes: StorageLocation::Sram,
                },
            ))
        }
        other => Err(ProtocolError::UnsupportedOutputMessage { message_id: other }),
    }
}

pub fn parse_extended_raw_measurements(
    frame: &Venus8Frame,
) -> Result<ExtendedRawMeasurementV1, RawMeasurementError> {
    if frame.message_id != MESSAGE_ID_EXTENDED_RAW_MEASUREMENT_V1 {
        return Err(RawMeasurementError::WrongMessageId {
            actual: frame.message_id,
        });
    }
    if frame.payload.len() < 13 {
        return Err(RawMeasurementError::TooShort);
    }

    let measurement_count = frame.payload[12] as usize;
    let expected_length = 13 + (measurement_count * 31);
    if frame.payload.len() != expected_length {
        return Err(RawMeasurementError::LengthMismatch {
            expected: expected_length,
            actual: frame.payload.len(),
        });
    }

    let mut measurements = Vec::with_capacity(measurement_count);
    let mut offset = 13usize;
    while offset < frame.payload.len() {
        let descriptor = frame.payload[offset];
        let combined = frame.payload[offset + 2];
        measurements.push(ExtendedRawChannelMeasurement {
            gnss_type: descriptor & 0x0F,
            signal_type: descriptor >> 4,
            svid: frame.payload[offset + 1],
            frequency_id: combined & 0x0F,
            lock_time_indicator: combined >> 4,
            cn0_dbhz: frame.payload[offset + 3],
            pseudorange_m: f64::from_be_bytes(
                frame.payload[offset + 4..offset + 12]
                    .try_into()
                    .expect("pseudorange slice length"),
            ),
            carrier_phase_cycles: f64::from_be_bytes(
                frame.payload[offset + 12..offset + 20]
                    .try_into()
                    .expect("carrier slice length"),
            ),
            doppler_hz: f32::from_be_bytes(
                frame.payload[offset + 20..offset + 24]
                    .try_into()
                    .expect("doppler slice length"),
            ),
            pseudorange_stddev: frame.payload[offset + 24],
            carrier_phase_stddev: frame.payload[offset + 25],
            doppler_stddev: frame.payload[offset + 26],
            channel_indicator: u16::from_be_bytes(
                frame.payload[offset + 27..offset + 29]
                    .try_into()
                    .expect("indicator slice length"),
            ),
        });
        offset += 31;
    }

    Ok(ExtendedRawMeasurementV1 {
        version: frame.payload[0],
        iod: frame.payload[1],
        receiver_week: u16::from_be_bytes([frame.payload[2], frame.payload[3]]),
        receiver_tow_ms: u32::from_be_bytes([
            frame.payload[4],
            frame.payload[5],
            frame.payload[6],
            frame.payload[7],
        ]),
        measurement_period_ms: u16::from_be_bytes([frame.payload[8], frame.payload[9]]),
        measurement_indicator: frame.payload[10],
        measurements,
    })
}

#[cfg(test)]
mod tests {
    use super::{
        BinaryMeasurementOutputConfig, BinaryMeasurementOutputRate, ConstellationMask,
        DecodeError, OutputMessageType, PositionUpdateRate, StorageLocation, Venus8Command,
        Venus8OutputMessage, decode_frame, decode_output_message, encode_frame,
        parse_extended_raw_measurements,
    };

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
    fn decodes_fixture_frame_with_checksum_validation() {
        let bytes = decode_hex_fixture(include_str!("../../../../fixtures/skytraq/venus8-nav.hex"));
        let frame = decode_frame(&bytes).expect("fixture should decode");
        assert_eq!(frame.message_id, 0xDC);
        assert_eq!(frame.payload, vec![0x01, 0x02, 0x03]);
    }

    #[test]
    fn rejects_checksum_mismatch() {
        let mut bytes =
            decode_hex_fixture(include_str!("../../../../fixtures/skytraq/venus8-nav.hex"));
        let checksum_index = bytes.len() - 3;
        bytes[checksum_index] ^= 0x01;

        let error = decode_frame(&bytes).expect_err("fixture should fail checksum validation");
        assert!(matches!(error, DecodeError::ChecksumMismatch { .. }));
    }

    #[test]
    fn parses_extended_raw_measurement_fixture() {
        let bytes = decode_hex_fixture(include_str!(
            "../../../../fixtures/skytraq/venus8-ext-raw.hex"
        ));
        let frame = decode_frame(&bytes).expect("fixture should decode");
        let raw = parse_extended_raw_measurements(&frame)
            .expect("extended raw measurement fixture should parse");

        assert_eq!(frame.message_id, 0xE5);
        assert_eq!(raw.version, 1);
        assert_eq!(raw.receiver_week, 0x077C);
        assert_eq!(raw.measurement_period_ms, 1000);
        assert_eq!(raw.measurements.len(), 17);
        assert_eq!(raw.measurements[0].gnss_type, 0);
        assert_eq!(raw.measurements[0].signal_type, 0);
        assert_eq!(raw.measurements[0].svid, 0x0D);
        assert_eq!(raw.measurements[0].channel_indicator, 0x4007);
    }

    #[test]
    fn encodes_query_software_version_command_from_official_example() {
        let bytes = Venus8Command::QuerySoftwareVersion.encode();
        assert_eq!(bytes, vec![0xA0, 0xA1, 0x00, 0x01, 0x02, 0x02, 0x0D, 0x0A]);
    }

    #[test]
    fn encodes_configure_message_type_from_official_example() {
        let bytes = Venus8Command::ConfigureMessageType {
            message_type: OutputMessageType::None,
            attributes: StorageLocation::Sram,
        }
        .encode();
        assert_eq!(bytes, vec![0xA0, 0xA1, 0x00, 0x03, 0x09, 0x00, 0x00, 0x09, 0x0D, 0x0A]);
    }

    #[test]
    fn encodes_configure_position_rate_from_official_example() {
        let bytes = Venus8Command::ConfigurePositionUpdateRate {
            rate: PositionUpdateRate::Hz1,
            attributes: StorageLocation::Sram,
        }
        .encode();
        assert_eq!(bytes, vec![0xA0, 0xA1, 0x00, 0x03, 0x0E, 0x01, 0x00, 0x0F, 0x0D, 0x0A]);
    }

    #[test]
    fn encodes_configure_binary_measurement_output_from_official_example() {
        let bytes = Venus8Command::ConfigureBinaryMeasurementOutput(BinaryMeasurementOutputConfig {
            rate: BinaryMeasurementOutputRate::Hz1,
            meas_time_enabled: false,
            raw_measurement_enabled: false,
            sv_channel_status_enabled: true,
            receiver_state_enabled: true,
            subframe_enabled: ConstellationMask {
                gps: true,
                glonass: true,
                galileo: false,
                beidou: false,
            },
            extended_raw_measurement_enabled: true,
            attributes: StorageLocation::SramAndFlash,
        })
        .encode();
        assert_eq!(
            bytes,
            vec![
                0xA0, 0xA1, 0x00, 0x09, 0x1E, 0x00, 0x00, 0x00, 0x01, 0x01, 0x03, 0x01,
                0x01, 0x1D, 0x0D, 0x0A,
            ]
        );
    }

    #[test]
    fn parses_ack_message_from_official_example() {
        let message = decode_output_message(&[
            0xA0, 0xA1, 0x00, 0x02, 0x83, 0x02, 0x81, 0x0D, 0x0A,
        ])
        .expect("ack should decode");
        assert_eq!(
            message,
            Venus8OutputMessage::Ack(super::RequestCorrelation {
                request_ids: vec![0x02],
            })
        );
    }

    #[test]
    fn parses_nack_message_from_official_example() {
        let message = decode_output_message(&[
            0xA0, 0xA1, 0x00, 0x02, 0x84, 0x01, 0x85, 0x0D, 0x0A,
        ])
        .expect("nack should decode");
        assert_eq!(
            message,
            Venus8OutputMessage::Nack(super::RequestCorrelation {
                request_ids: vec![0x01],
            })
        );
    }

    #[test]
    fn parses_binary_measurement_output_status_from_official_example() {
        let message = decode_output_message(&[
            0xA0, 0xA1, 0x00, 0x08, 0x89, 0x00, 0x00, 0x00, 0x01, 0x01, 0x03, 0x01,
            0x8B, 0x0D, 0x0A,
        ])
        .expect("status should decode");
        assert_eq!(
            message,
            Venus8OutputMessage::BinaryMeasurementOutputStatus(BinaryMeasurementOutputConfig {
                rate: BinaryMeasurementOutputRate::Hz1,
                meas_time_enabled: false,
                raw_measurement_enabled: false,
                sv_channel_status_enabled: true,
                receiver_state_enabled: true,
                subframe_enabled: ConstellationMask {
                    gps: true,
                    glonass: true,
                    galileo: false,
                    beidou: false,
                },
                extended_raw_measurement_enabled: true,
                attributes: StorageLocation::Sram,
            })
        );
    }

    #[test]
    fn parses_message_type_status_from_official_example() {
        let message = decode_output_message(&[
            0xA0, 0xA1, 0x00, 0x02, 0x8C, 0x02, 0x8E, 0x0D, 0x0A,
        ])
        .expect("message type should decode");
        assert_eq!(message, Venus8OutputMessage::MessageType(OutputMessageType::Binary));
    }

    #[test]
    fn encodes_existing_fixture_frame_round_trip() {
        let bytes = decode_hex_fixture(include_str!("../../../../fixtures/skytraq/venus8-nav.hex"));
        let frame = decode_frame(&bytes).expect("fixture should decode");
        assert_eq!(encode_frame(&frame), bytes);
    }
}
