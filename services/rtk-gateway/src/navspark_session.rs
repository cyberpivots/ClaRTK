use anyhow::{Context, Result, anyhow};
use serialport::SerialPort;
use std::io::{self, Read, Write};
use std::time::Duration;

const SYNC_1: u8 = 0xA0;
const SYNC_2: u8 = 0xA1;

pub trait FrameTransport {
    fn write_frame(&mut self, frame: &[u8]) -> io::Result<()>;
    fn read_frame(&mut self, timeout: Duration) -> io::Result<Vec<u8>>;
}

#[allow(dead_code)]
pub struct SerialPortFrameTransport {
    port: Box<dyn SerialPort>,
    buffer: Vec<u8>,
}

#[allow(dead_code)]
impl SerialPortFrameTransport {
    pub fn open(source_ref: &str, baud: u32, timeout: Duration) -> Result<Self> {
        let port = serialport::new(source_ref, baud)
            .timeout(timeout)
            .open()
            .with_context(|| format!("unable to open serial port {}", source_ref))?;
        Ok(Self {
            port,
            buffer: Vec::new(),
        })
    }
}

impl FrameTransport for SerialPortFrameTransport {
    fn write_frame(&mut self, frame: &[u8]) -> io::Result<()> {
        self.port.write_all(frame)?;
        self.port.flush()
    }

    fn read_frame(&mut self, timeout: Duration) -> io::Result<Vec<u8>> {
        self.port.set_timeout(timeout)?;
        loop {
            if let Some(frame) = extract_skytraq_frame(&mut self.buffer) {
                return Ok(frame);
            }

            let mut chunk = [0u8; 1024];
            match self.port.read(&mut chunk) {
                Ok(size) if size > 0 => self.buffer.extend_from_slice(&chunk[..size]),
                Ok(_) => {}
                Err(error) if error.kind() == io::ErrorKind::TimedOut => return Err(error),
                Err(error) => return Err(error),
            }
        }
    }
}

pub enum SessionParseOutcome<T> {
    Continue,
    Complete(T),
    Retry,
}

pub struct NavsparkSession<T> {
    transport: T,
    read_timeout: Duration,
    max_retries: usize,
}

impl<T> NavsparkSession<T>
where
    T: FrameTransport,
{
    pub fn open(transport: T, read_timeout: Duration, max_retries: usize) -> Self {
        Self {
            transport,
            read_timeout,
            max_retries,
        }
    }

    pub fn write_frame(&mut self, frame: &[u8]) -> Result<()> {
        self.transport
            .write_frame(frame)
            .context("unable to write framed NavSpark command")
    }

    #[allow(dead_code)]
    pub fn read_frame(&mut self) -> Result<Vec<u8>> {
        self.transport
            .read_frame(self.read_timeout)
            .context("unable to read framed NavSpark response")
    }

    pub fn send_command_and_wait<R, F>(&mut self, frame: &[u8], mut classify: F) -> Result<R>
    where
        F: FnMut(&[u8]) -> Result<SessionParseOutcome<R>>,
    {
        for attempt in 0..=self.max_retries {
            self.write_frame(frame)?;

            loop {
                match self.transport.read_frame(self.read_timeout) {
                    Ok(response) => match classify(&response)? {
                        SessionParseOutcome::Continue => continue,
                        SessionParseOutcome::Complete(value) => return Ok(value),
                        SessionParseOutcome::Retry => break,
                    },
                    Err(error) if error.kind() == io::ErrorKind::TimedOut => break,
                    Err(error) => {
                        return Err(error).context("unable to read framed NavSpark response");
                    }
                }
            }

            if attempt == self.max_retries {
                return Err(anyhow!(
                    "NavSpark session exhausted {} retry attempts without terminal response",
                    self.max_retries
                ));
            }
        }

        Err(anyhow!("NavSpark session exited without terminal response"))
    }
}

fn extract_skytraq_frame(buffer: &mut Vec<u8>) -> Option<Vec<u8>> {
    let mut cursor = 0usize;
    while cursor + 7 <= buffer.len() {
        if buffer[cursor] != SYNC_1 || buffer[cursor + 1] != SYNC_2 {
            cursor += 1;
            continue;
        }

        let declared_length = ((buffer[cursor + 2] as usize) << 8) | buffer[cursor + 3] as usize;
        let frame_length = declared_length + 7;
        if cursor + frame_length > buffer.len() {
            break;
        }

        let frame = buffer[cursor..cursor + frame_length].to_vec();
        buffer.drain(..cursor + frame_length);
        return Some(frame);
    }

    if cursor > 0 {
        buffer.drain(..cursor);
    }
    None
}

#[cfg(test)]
mod tests {
    use super::{FrameTransport, NavsparkSession, SessionParseOutcome, extract_skytraq_frame};
    use anyhow::anyhow;
    use clartk_skytraq_phoenix::PhoenixOutputMessage;
    use clartk_skytraq_venus8::{Venus8Frame, Venus8OutputMessage, encode_frame};
    use std::collections::VecDeque;
    use std::io;
    use std::time::Duration;

    #[derive(Default)]
    struct FakeTransport {
        writes: Vec<Vec<u8>>,
        responses: VecDeque<io::Result<Vec<u8>>>,
    }

    impl FrameTransport for FakeTransport {
        fn write_frame(&mut self, frame: &[u8]) -> io::Result<()> {
            self.writes.push(frame.to_vec());
            Ok(())
        }

        fn read_frame(&mut self, _timeout: Duration) -> io::Result<Vec<u8>> {
            self.responses
                .pop_front()
                .unwrap_or_else(|| Err(io::Error::new(io::ErrorKind::TimedOut, "timeout")))
        }
    }

    #[test]
    fn extracts_first_frame_and_discards_prefix_noise() {
        let mut buffer = vec![0x00, 0xFF, 0xA0, 0xA1, 0x00, 0x01, 0x02, 0x02, 0x0D, 0x0A];
        let frame = extract_skytraq_frame(&mut buffer).expect("frame should extract");
        assert_eq!(frame, vec![0xA0, 0xA1, 0x00, 0x01, 0x02, 0x02, 0x0D, 0x0A]);
        assert!(buffer.is_empty());
    }

    #[test]
    fn session_returns_after_ack_then_software_version() {
        let mut transport = FakeTransport::default();
        transport.responses = VecDeque::from(vec![
            Ok(vec![0xA0, 0xA1, 0x00, 0x02, 0x83, 0x02, 0x81, 0x0D, 0x0A]),
            Ok(encode_frame(&Venus8Frame {
                message_id: 0x80,
                payload: vec![
                    0x02, 0x00, 0x01, 0x00, 0x02, 0x00, 0x03, 0x00, 0x04, 0x00, 0x05,
                    0x00, 0x06,
                ],
            })),
        ]);
        let mut session = NavsparkSession::open(transport, Duration::from_millis(50), 1);

        let version = session
            .send_command_and_wait(&[0xA0, 0xA1, 0x00, 0x01, 0x02, 0x02, 0x0D, 0x0A], |bytes| {
                match clartk_skytraq_venus8::decode_output_message(bytes)
                    .map_err(|error| anyhow!(error.to_string()))?
                {
                    Venus8OutputMessage::Ack(_) => Ok(SessionParseOutcome::Continue),
                    Venus8OutputMessage::SoftwareVersion(version) => {
                        Ok(SessionParseOutcome::Complete(version))
                    }
                    Venus8OutputMessage::Nack(_) => Ok(SessionParseOutcome::Retry),
                    other => Err(anyhow!("unexpected response: {other:?}")),
                }
            })
            .expect("session should complete");

        assert_eq!(version.kernel_version, 0x0001_0002);
        assert_eq!(version.odm_version, 0x0003_0004);
        assert_eq!(version.revision, 0x0005_0006);
    }

    #[test]
    fn session_retries_after_timeout_and_accepts_phoenix_rate_status() {
        let mut transport = FakeTransport::default();
        transport.responses = VecDeque::from(vec![
            Err(io::Error::new(io::ErrorKind::TimedOut, "timeout")),
            Ok(vec![0xA0, 0xA1, 0x00, 0x04, 0x7A, 0x0E, 0x82, 0x01, 0xF7, 0x0D, 0x0A]),
        ]);
        let mut session = NavsparkSession::open(transport, Duration::from_millis(50), 1);

        let rate = session
            .send_command_and_wait(&[0xA0, 0xA1, 0x00, 0x03, 0x7A, 0x0E, 0x03, 0x77, 0x0D, 0x0A], |bytes| {
                match clartk_skytraq_phoenix::decode_output_message(bytes)
                    .map_err(|error| anyhow!(error.to_string()))?
                {
                    PhoenixOutputMessage::Px1122rRoverMovingBasePositionUpdateRate(rate) => {
                        Ok(SessionParseOutcome::Complete(rate))
                    }
                    PhoenixOutputMessage::Nack(_) => Ok(SessionParseOutcome::Retry),
                    PhoenixOutputMessage::Ack(_) => Ok(SessionParseOutcome::Continue),
                    other => Err(anyhow!("unexpected response: {other:?}")),
                }
            })
            .expect("session should complete");

        assert!(matches!(
            rate,
            clartk_skytraq_phoenix::PositionUpdateRate::Hz1
        ));
    }
}
