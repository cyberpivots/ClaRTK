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
const MESSAGE_ID_RTK_MODE_AND_OPERATIONAL_FUNCTION: u8 = 0x6A;
const MESSAGE_ID_PX1172RH_ROVER_MOVING_BASE: u8 = 0x7A;

const MESSAGE_ID_SOFTWARE_VERSION: u8 = 0x80;
const MESSAGE_ID_ACK: u8 = 0x83;
const MESSAGE_ID_NACK: u8 = 0x84;
const MESSAGE_ID_POSITION_UPDATE_RATE: u8 = 0x86;
const MESSAGE_ID_MESSAGE_TYPE: u8 = 0x8C;

const SUB_ID_RTK_CONFIGURE_MODE: u8 = 0x06;
const SUB_ID_RTK_QUERY_MODE: u8 = 0x07;
const SUB_ID_RTK_MODE_STATUS: u8 = 0x83;

const SUB_ID_PX1172RH: u8 = 0x0E;
const SUB_SUB_ID_PX1172RH_QUERY_SOFTWARE_VERSION: u8 = 0x01;
const SUB_SUB_ID_PX1172RH_QUERY_POSITION_UPDATE_RATE: u8 = 0x03;
const SUB_SUB_ID_PX1172RH_SOFTWARE_VERSION: u8 = 0x80;
const SUB_SUB_ID_PX1172RH_POSITION_UPDATE_RATE: u8 = 0x82;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PhoenixFrame {
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

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum RtkMode {
    Rover = 0,
    Base = 1,
    PreciselyKinematicBase = 2,
}

impl RtkMode {
    fn from_wire(value: u8) -> Result<Self, ProtocolError> {
        match value {
            0 => Ok(Self::Rover),
            1 => Ok(Self::Base),
            2 => Ok(Self::PreciselyKinematicBase),
            other => Err(ProtocolError::InvalidFieldValue {
                field: "rtk_mode",
                value: other,
            }),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum RtkOperationalFunction {
    RoverNormal,
    RoverFloat,
    RoverMovingBase,
    BaseKinematic,
    BaseSurvey,
    BaseStatic,
    PreciselyKinematicNormal,
    PreciselyKinematicFloat,
}

impl RtkOperationalFunction {
    fn from_wire(mode: RtkMode, value: u8) -> Result<Self, ProtocolError> {
        match (mode, value) {
            (RtkMode::Rover, 0) => Ok(Self::RoverNormal),
            (RtkMode::Rover, 1) => Ok(Self::RoverFloat),
            (RtkMode::Rover, 2) => Ok(Self::RoverMovingBase),
            (RtkMode::Base, 0) => Ok(Self::BaseKinematic),
            (RtkMode::Base, 1) => Ok(Self::BaseSurvey),
            (RtkMode::Base, 2) => Ok(Self::BaseStatic),
            (RtkMode::PreciselyKinematicBase, 0) => Ok(Self::PreciselyKinematicNormal),
            (RtkMode::PreciselyKinematicBase, 1) => Ok(Self::PreciselyKinematicFloat),
            (_, other) => Err(ProtocolError::InvalidFieldValue {
                field: "rtk_operational_function",
                value: other,
            }),
        }
    }

    fn to_wire(self) -> (RtkMode, u8) {
        match self {
            Self::RoverNormal => (RtkMode::Rover, 0),
            Self::RoverFloat => (RtkMode::Rover, 1),
            Self::RoverMovingBase => (RtkMode::Rover, 2),
            Self::BaseKinematic => (RtkMode::Base, 0),
            Self::BaseSurvey => (RtkMode::Base, 1),
            Self::BaseStatic => (RtkMode::Base, 2),
            Self::PreciselyKinematicNormal => (RtkMode::PreciselyKinematicBase, 0),
            Self::PreciselyKinematicFloat => (RtkMode::PreciselyKinematicBase, 1),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum RuntimeOperationalFunction {
    Normal = 0,
    Survey = 1,
    Static = 2,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RtkModeOperationalFunctionConfig {
    pub operational_function: RtkOperationalFunction,
    pub survey_length_s: u32,
    pub standard_deviation_m: u32,
    pub latitude_deg: f64,
    pub longitude_deg: f64,
    pub altitude_m: f32,
    pub baseline_length_constraint_m: f32,
    pub attributes: StorageLocation,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RtkModeOperationalFunctionStatus {
    pub mode: RtkMode,
    pub operational_function: RtkOperationalFunction,
    pub saved_survey_length_s: u32,
    pub standard_deviation_m: u32,
    pub latitude_deg: f64,
    pub longitude_deg: f64,
    pub altitude_m: f32,
    pub baseline_length_constraint_m: f32,
    pub runtime_operational_function: Result<RuntimeOperationalFunction, u8>,
    pub runtime_survey_length_s: u32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum PhoenixCommand {
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
    ConfigureRtkModeAndOperationalFunction(RtkModeOperationalFunctionConfig),
    QueryRtkModeAndOperationalFunction,
    QueryPx1122rRoverMovingBaseSoftwareVersion,
    QueryPx1122rRoverMovingBasePositionUpdateRate,
}

impl PhoenixCommand {
    pub fn to_frame(&self) -> PhoenixFrame {
        match self {
            Self::QuerySoftwareVersion => PhoenixFrame {
                message_id: MESSAGE_ID_QUERY_SOFTWARE_VERSION,
                payload: Vec::new(),
            },
            Self::ConfigureSerialPort {
                com_port,
                baud_rate,
                attributes,
            } => PhoenixFrame {
                message_id: MESSAGE_ID_CONFIGURE_SERIAL_PORT,
                payload: vec![*com_port, *baud_rate as u8, *attributes as u8],
            },
            Self::ConfigureMessageType {
                message_type,
                attributes,
            } => PhoenixFrame {
                message_id: MESSAGE_ID_CONFIGURE_MESSAGE_TYPE,
                payload: vec![*message_type as u8, *attributes as u8],
            },
            Self::ConfigurePositionUpdateRate { rate, attributes } => PhoenixFrame {
                message_id: MESSAGE_ID_CONFIGURE_POSITION_UPDATE_RATE,
                payload: vec![rate.to_wire(), *attributes as u8],
            },
            Self::QueryPositionUpdateRate => PhoenixFrame {
                message_id: MESSAGE_ID_QUERY_POSITION_UPDATE_RATE,
                payload: Vec::new(),
            },
            Self::QueryMessageType => PhoenixFrame {
                message_id: MESSAGE_ID_QUERY_MESSAGE_TYPE,
                payload: Vec::new(),
            },
            Self::ConfigureRtkModeAndOperationalFunction(config) => {
                let (mode, operation_code) = config.operational_function.to_wire();
                let mut payload = Vec::with_capacity(36);
                payload.push(SUB_ID_RTK_CONFIGURE_MODE);
                payload.push(mode as u8);
                payload.push(operation_code);
                payload.extend_from_slice(&config.survey_length_s.to_be_bytes());
                payload.extend_from_slice(&config.standard_deviation_m.to_be_bytes());
                payload.extend_from_slice(&config.latitude_deg.to_be_bytes());
                payload.extend_from_slice(&config.longitude_deg.to_be_bytes());
                payload.extend_from_slice(&config.altitude_m.to_be_bytes());
                payload.extend_from_slice(&config.baseline_length_constraint_m.to_be_bytes());
                payload.push(config.attributes as u8);
                PhoenixFrame {
                    message_id: MESSAGE_ID_RTK_MODE_AND_OPERATIONAL_FUNCTION,
                    payload,
                }
            }
            Self::QueryRtkModeAndOperationalFunction => PhoenixFrame {
                message_id: MESSAGE_ID_RTK_MODE_AND_OPERATIONAL_FUNCTION,
                payload: vec![SUB_ID_RTK_QUERY_MODE],
            },
            Self::QueryPx1122rRoverMovingBaseSoftwareVersion => PhoenixFrame {
                message_id: MESSAGE_ID_PX1172RH_ROVER_MOVING_BASE,
                payload: vec![SUB_ID_PX1172RH, SUB_SUB_ID_PX1172RH_QUERY_SOFTWARE_VERSION],
            },
            Self::QueryPx1122rRoverMovingBasePositionUpdateRate => PhoenixFrame {
                message_id: MESSAGE_ID_PX1172RH_ROVER_MOVING_BASE,
                payload: vec![
                    SUB_ID_PX1172RH,
                    SUB_SUB_ID_PX1172RH_QUERY_POSITION_UPDATE_RATE,
                ],
            },
        }
    }

    pub fn encode(&self) -> Vec<u8> {
        encode_frame(&self.to_frame())
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum PhoenixOutputMessage {
    Ack(RequestCorrelation),
    Nack(RequestCorrelation),
    SoftwareVersion(SoftwareVersion),
    PositionUpdateRate(PositionUpdateRate),
    MessageType(OutputMessageType),
    RtkModeOperationalFunction(RtkModeOperationalFunctionStatus),
    Px1122rRoverMovingBaseSoftwareVersion(SoftwareVersion),
    Px1122rRoverMovingBasePositionUpdateRate(PositionUpdateRate),
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
pub enum ProtocolError {
    #[error(transparent)]
    Decode(#[from] DecodeError),
    #[error("unsupported output message {message_id:#04x}")]
    UnsupportedOutputMessage { message_id: u8 },
    #[error("unsupported sub-message {message_id:#04x}/{sub_id:#04x}")]
    UnsupportedSubMessage { message_id: u8, sub_id: u8 },
    #[error("unsupported sub-sub-message {message_id:#04x}/{sub_id:#04x}/{sub_sub_id:#04x}")]
    UnsupportedSubSubMessage {
        message_id: u8,
        sub_id: u8,
        sub_sub_id: u8,
    },
    #[error("output message {message_id:#04x} payload too short: expected at least {expected}, got {actual}")]
    OutputTooShort {
        message_id: u8,
        expected: usize,
        actual: usize,
    },
    #[error("invalid {field} field value {value:#04x}")]
    InvalidFieldValue { field: &'static str, value: u8 },
}

pub fn encode_frame(frame: &PhoenixFrame) -> Vec<u8> {
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

pub fn decode_frame(bytes: &[u8]) -> Result<PhoenixFrame, DecodeError> {
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

    Ok(PhoenixFrame {
        message_id: payload[0],
        payload: payload[1..].to_vec(),
    })
}

pub fn decode_output_message(bytes: &[u8]) -> Result<PhoenixOutputMessage, ProtocolError> {
    let frame = decode_frame(bytes)?;
    parse_output_message(&frame)
}

pub fn parse_output_message(frame: &PhoenixFrame) -> Result<PhoenixOutputMessage, ProtocolError> {
    match frame.message_id {
        MESSAGE_ID_ACK => Ok(PhoenixOutputMessage::Ack(RequestCorrelation {
            request_ids: frame.payload.clone(),
        })),
        MESSAGE_ID_NACK => Ok(PhoenixOutputMessage::Nack(RequestCorrelation {
            request_ids: frame.payload.clone(),
        })),
        MESSAGE_ID_SOFTWARE_VERSION => Ok(PhoenixOutputMessage::SoftwareVersion(
            parse_software_version(frame.message_id, &frame.payload)?,
        )),
        MESSAGE_ID_POSITION_UPDATE_RATE => {
            let rate = *frame
                .payload
                .first()
                .ok_or(ProtocolError::OutputTooShort {
                    message_id: frame.message_id,
                    expected: 1,
                    actual: 0,
                })?;
            Ok(PhoenixOutputMessage::PositionUpdateRate(
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
            Ok(PhoenixOutputMessage::MessageType(
                OutputMessageType::from_wire(value)?,
            ))
        }
        MESSAGE_ID_RTK_MODE_AND_OPERATIONAL_FUNCTION => parse_rtk_message(frame),
        MESSAGE_ID_PX1172RH_ROVER_MOVING_BASE => parse_px1172rh_message(frame),
        other => Err(ProtocolError::UnsupportedOutputMessage { message_id: other }),
    }
}

fn parse_software_version(message_id: u8, payload: &[u8]) -> Result<SoftwareVersion, ProtocolError> {
    if payload.len() < 13 {
        return Err(ProtocolError::OutputTooShort {
            message_id,
            expected: 13,
            actual: payload.len(),
        });
    }
    Ok(SoftwareVersion {
        software_type: payload[0],
        kernel_version: u32::from_be_bytes(payload[1..5].try_into().expect("kernel slice length")),
        odm_version: u32::from_be_bytes(payload[5..9].try_into().expect("odm slice length")),
        revision: u32::from_be_bytes(payload[9..13].try_into().expect("revision slice length")),
    })
}

fn parse_rtk_message(frame: &PhoenixFrame) -> Result<PhoenixOutputMessage, ProtocolError> {
    let sub_id = *frame.payload.first().ok_or(ProtocolError::OutputTooShort {
        message_id: frame.message_id,
        expected: 1,
        actual: 0,
    })?;
    if sub_id != SUB_ID_RTK_MODE_STATUS {
        return Err(ProtocolError::UnsupportedSubMessage {
            message_id: frame.message_id,
            sub_id,
        });
    }
    if frame.payload.len() < 40 {
        return Err(ProtocolError::OutputTooShort {
            message_id: frame.message_id,
            expected: 40,
            actual: frame.payload.len(),
        });
    }

    let body = &frame.payload[1..];
    let mode = RtkMode::from_wire(body[0])?;
    let operational_function = RtkOperationalFunction::from_wire(mode, body[1])?;
    let runtime_operational_function = match body[32] {
        0 => Ok(RuntimeOperationalFunction::Normal),
        1 => Ok(RuntimeOperationalFunction::Survey),
        2 => Ok(RuntimeOperationalFunction::Static),
        other => Err(other),
    };

    Ok(PhoenixOutputMessage::RtkModeOperationalFunction(
        RtkModeOperationalFunctionStatus {
            mode,
            operational_function,
            saved_survey_length_s: u32::from_be_bytes(
                body[2..6].try_into().expect("survey length slice length"),
            ),
            standard_deviation_m: u32::from_be_bytes(
                body[6..10]
                    .try_into()
                    .expect("standard deviation slice length"),
            ),
            latitude_deg: f64::from_be_bytes(
                body[10..18].try_into().expect("latitude slice length"),
            ),
            longitude_deg: f64::from_be_bytes(
                body[18..26].try_into().expect("longitude slice length"),
            ),
            altitude_m: f32::from_be_bytes(
                body[26..30].try_into().expect("altitude slice length"),
            ),
            baseline_length_constraint_m: f32::from_be_bytes(
                body[30..34]
                    .try_into()
                    .expect("baseline slice length"),
            ),
            runtime_operational_function,
            runtime_survey_length_s: u32::from_be_bytes(
                body[33..37]
                    .try_into()
                    .expect("runtime survey length slice length"),
            ),
        },
    ))
}

fn parse_px1172rh_message(frame: &PhoenixFrame) -> Result<PhoenixOutputMessage, ProtocolError> {
    if frame.payload.len() < 2 {
        return Err(ProtocolError::OutputTooShort {
            message_id: frame.message_id,
            expected: 2,
            actual: frame.payload.len(),
        });
    }
    let sub_id = frame.payload[0];
    let sub_sub_id = frame.payload[1];
    if sub_id != SUB_ID_PX1172RH {
        return Err(ProtocolError::UnsupportedSubMessage {
            message_id: frame.message_id,
            sub_id,
        });
    }

    let body = &frame.payload[2..];
    match sub_sub_id {
        SUB_SUB_ID_PX1172RH_SOFTWARE_VERSION => Ok(
            PhoenixOutputMessage::Px1122rRoverMovingBaseSoftwareVersion(parse_software_version(
                frame.message_id,
                body,
            )?),
        ),
        SUB_SUB_ID_PX1172RH_POSITION_UPDATE_RATE => {
            let rate = *body.first().ok_or(ProtocolError::OutputTooShort {
                message_id: frame.message_id,
                expected: 3,
                actual: frame.payload.len(),
            })?;
            Ok(PhoenixOutputMessage::Px1122rRoverMovingBasePositionUpdateRate(
                PositionUpdateRate::from_wire(rate)?,
            ))
        }
        other => Err(ProtocolError::UnsupportedSubSubMessage {
            message_id: frame.message_id,
            sub_id,
            sub_sub_id: other,
        }),
    }
}

#[cfg(test)]
mod tests {
    use super::{
        BaudRate, DecodeError, OutputMessageType, PhoenixCommand, PhoenixOutputMessage,
        PositionUpdateRate, RtkModeOperationalFunctionConfig, RtkOperationalFunction,
        StorageLocation, decode_frame, decode_output_message, encode_frame,
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
        let bytes = decode_hex_fixture(include_str!("../../../../fixtures/skytraq/phoenix-status.hex"));
        let frame = decode_frame(&bytes).expect("fixture should decode");
        assert_eq!(frame.message_id, 0xE2);
        assert_eq!(frame.payload, vec![0x10, 0x20]);
    }

    #[test]
    fn rejects_invalid_trailer() {
        let mut bytes = decode_hex_fixture(include_str!("../../../../fixtures/skytraq/phoenix-status.hex"));
        let trailer_index = bytes.len() - 1;
        bytes[trailer_index] = 0xFF;

        let error = decode_frame(&bytes).expect_err("fixture should fail trailer validation");
        assert!(matches!(error, DecodeError::InvalidTerminator));
    }

    #[test]
    fn encodes_query_software_version_command_from_official_example() {
        let bytes = PhoenixCommand::QuerySoftwareVersion.encode();
        assert_eq!(bytes, vec![0xA0, 0xA1, 0x00, 0x01, 0x02, 0x02, 0x0D, 0x0A]);
    }

    #[test]
    fn encodes_configure_serial_port_from_official_example() {
        let bytes = PhoenixCommand::ConfigureSerialPort {
            com_port: 0,
            baud_rate: BaudRate::B4800,
            attributes: super::SerialStorageLocation::Sram,
        }
        .encode();
        assert_eq!(bytes, vec![0xA0, 0xA1, 0x00, 0x04, 0x05, 0x00, 0x00, 0x00, 0x05, 0x0D, 0x0A]);
    }

    #[test]
    fn encodes_configure_message_type_from_official_example() {
        let bytes = PhoenixCommand::ConfigureMessageType {
            message_type: OutputMessageType::None,
            attributes: StorageLocation::Sram,
        }
        .encode();
        assert_eq!(bytes, vec![0xA0, 0xA1, 0x00, 0x03, 0x09, 0x00, 0x00, 0x09, 0x0D, 0x0A]);
    }

    #[test]
    fn encodes_configure_position_rate_from_official_example() {
        let bytes = PhoenixCommand::ConfigurePositionUpdateRate {
            rate: PositionUpdateRate::Hz1,
            attributes: StorageLocation::Sram,
        }
        .encode();
        assert_eq!(bytes, vec![0xA0, 0xA1, 0x00, 0x03, 0x0E, 0x01, 0x00, 0x0F, 0x0D, 0x0A]);
    }

    #[test]
    fn encodes_query_message_type_from_official_example() {
        let bytes = PhoenixCommand::QueryMessageType.encode();
        assert_eq!(bytes, vec![0xA0, 0xA1, 0x00, 0x01, 0x16, 0x16, 0x0D, 0x0A]);
    }

    #[test]
    fn encodes_configure_rtk_mode_from_official_example() {
        let bytes =
            PhoenixCommand::ConfigureRtkModeAndOperationalFunction(RtkModeOperationalFunctionConfig {
                operational_function: RtkOperationalFunction::RoverNormal,
                survey_length_s: 0x0000_07D0,
                standard_deviation_m: 0x0000_001E,
                latitude_deg: 0.0,
                longitude_deg: 0.0,
                altitude_m: 0.0,
                baseline_length_constraint_m: 0.0,
                attributes: StorageLocation::Sram,
            })
            .encode();
        assert_eq!(
            bytes,
            vec![
                0xA0, 0xA1, 0x00, 0x25, 0x6A, 0x06, 0x00, 0x00, 0x00, 0x00, 0x07, 0xD0,
                0x00, 0x00, 0x00, 0x1E, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
                0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
                0x00, 0x00, 0x00, 0x00, 0x00, 0xA5, 0x0D, 0x0A,
            ]
        );
    }

    #[test]
    fn encodes_query_rtk_mode_from_official_example() {
        let bytes = PhoenixCommand::QueryRtkModeAndOperationalFunction.encode();
        assert_eq!(bytes, vec![0xA0, 0xA1, 0x00, 0x02, 0x6A, 0x07, 0x6D, 0x0D, 0x0A]);
    }

    #[test]
    fn encodes_query_px1172rh_rover_moving_base_position_rate_from_official_example() {
        let bytes = PhoenixCommand::QueryPx1122rRoverMovingBasePositionUpdateRate.encode();
        assert_eq!(bytes, vec![0xA0, 0xA1, 0x00, 0x03, 0x7A, 0x0E, 0x03, 0x77, 0x0D, 0x0A]);
    }

    #[test]
    fn parses_ack_message_from_official_example() {
        let message = decode_output_message(&[
            0xA0, 0xA1, 0x00, 0x02, 0x83, 0x02, 0x81, 0x0D, 0x0A,
        ])
        .expect("ack should decode");
        assert_eq!(
            message,
            PhoenixOutputMessage::Ack(super::RequestCorrelation {
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
            PhoenixOutputMessage::Nack(super::RequestCorrelation {
                request_ids: vec![0x01],
            })
        );
    }

    #[test]
    fn parses_message_type_status_from_official_example() {
        let message = decode_output_message(&[
            0xA0, 0xA1, 0x00, 0x02, 0x8C, 0x02, 0x8E, 0x0D, 0x0A,
        ])
        .expect("message type should decode");
        assert_eq!(message, PhoenixOutputMessage::MessageType(OutputMessageType::Binary));
    }

    #[test]
    fn parses_px1172rh_rover_moving_base_software_version_from_official_example() {
        let message = decode_output_message(&[
            0xA0, 0xA1, 0x00, 0x10, 0x7A, 0x0E, 0x80, 0x01, 0x00, 0x03, 0x00, 0x01,
            0x00, 0x0E, 0x07, 0x21, 0x00, 0x15, 0x04, 0x08, 0xC6, 0x0D, 0x0A,
        ])
        .expect("px1172rh software version should decode");

        match message {
            PhoenixOutputMessage::Px1122rRoverMovingBaseSoftwareVersion(version) => {
                assert_eq!(version.software_type, 0x01);
                assert_eq!(version.kernel_version, 0x0003_0001);
                assert_eq!(version.odm_version, 0x000E_0721);
                assert_eq!(version.revision, 0x0015_0408);
            }
            other => panic!("unexpected message: {other:?}"),
        }
    }

    #[test]
    fn parses_px1172rh_rover_moving_base_position_rate_from_official_example() {
        let message = decode_output_message(&[
            0xA0, 0xA1, 0x00, 0x04, 0x7A, 0x0E, 0x82, 0x01, 0xF7, 0x0D, 0x0A,
        ])
        .expect("px1172rh rate should decode");
        assert_eq!(
            message,
            PhoenixOutputMessage::Px1122rRoverMovingBasePositionUpdateRate(PositionUpdateRate::Hz1)
        );
    }

    #[test]
    fn encodes_existing_fixture_frame_round_trip() {
        let bytes = decode_hex_fixture(include_str!("../../../../fixtures/skytraq/phoenix-status.hex"));
        let frame = decode_frame(&bytes).expect("fixture should decode");
        assert_eq!(encode_frame(&frame), bytes);
    }
}
