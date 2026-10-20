//! Countdown to the New Era launch.

use serde::Serialize;

/// Midnight Eastern at the start of Saturday, Nov 7, 2026 (EST, UTC-5), in epoch ms.
pub const LAUNCH_MS: f64 = 1_794_027_600_000.0;

#[derive(Debug, PartialEq, Serialize)]
pub struct Countdown {
    pub launched: bool,
    pub days: u32,
    pub hours: u32,
    pub minutes: u32,
    pub seconds: u32,
}

/// Days, hours, minutes, and seconds until `launch_ms`. Seconds round up, so
/// the last second shows "1 second" rather than all zeros before launch.
pub fn countdown(now_ms: f64, launch_ms: f64) -> Countdown {
    let ms = launch_ms - now_ms;
    if !(ms > 0.0) {
        return Countdown { launched: true, days: 0, hours: 0, minutes: 0, seconds: 0 };
    }
    let total = (ms / 1000.0).ceil() as u64;
    Countdown {
        launched: false,
        days: (total / 86_400) as u32,
        hours: (total % 86_400 / 3_600) as u32,
        minutes: (total % 3_600 / 60) as u32,
        seconds: (total % 60) as u32,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SECOND: f64 = 1_000.0;
    const MINUTE: f64 = 60.0 * SECOND;
    const HOUR: f64 = 60.0 * MINUTE;
    const DAY: f64 = 24.0 * HOUR;

    fn left(days: u32, hours: u32, minutes: u32, seconds: u32) -> Countdown {
        Countdown { launched: false, days, hours, minutes, seconds }
    }

    #[test]
    fn counts_every_unit() {
        let now = LAUNCH_MS - (17.0 * DAY + 5.0 * HOUR + 32.0 * MINUTE + 10.0 * SECOND);
        assert_eq!(countdown(now, LAUNCH_MS), left(17, 5, 32, 10));
    }

    #[test]
    fn partial_seconds_round_up() {
        let now = LAUNCH_MS - (2.0 * MINUTE + 9.4 * SECOND);
        assert_eq!(countdown(now, LAUNCH_MS), left(0, 0, 2, 10));
    }

    #[test]
    fn last_moment_shows_one_second() {
        assert_eq!(countdown(LAUNCH_MS - 1.0, LAUNCH_MS), left(0, 0, 0, 1));
    }

    #[test]
    fn whole_days() {
        assert_eq!(countdown(LAUNCH_MS - DAY, LAUNCH_MS), left(1, 0, 0, 0));
    }

    #[test]
    fn launched_at_and_after() {
        assert!(countdown(LAUNCH_MS, LAUNCH_MS).launched);
        assert!(countdown(LAUNCH_MS + DAY, LAUNCH_MS).launched);
        assert!(countdown(f64::NAN, LAUNCH_MS).launched);
    }
}
