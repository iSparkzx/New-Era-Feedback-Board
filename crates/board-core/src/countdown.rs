//! Countdown to the New Era launch.

use serde::Serialize;

/// Midnight Eastern at the start of Saturday, Nov 7, 2026 (EST, UTC-5), in epoch ms.
pub const LAUNCH_MS: f64 = 1_794_027_600_000.0;

#[derive(Debug, PartialEq, Serialize)]
pub struct Countdown {
    pub launched: bool,
    pub days: u32,
    pub hours: u32,
}

/// Whole days and leftover whole hours until `launch_ms`.
pub fn countdown(now_ms: f64, launch_ms: f64) -> Countdown {
    let ms = launch_ms - now_ms;
    if !(ms > 0.0) {
        return Countdown { launched: true, days: 0, hours: 0 };
    }
    let days = (ms / 86_400_000.0).floor();
    let hours = ((ms % 86_400_000.0) / 3_600_000.0).floor();
    Countdown { launched: false, days: days as u32, hours: hours as u32 }
}

#[cfg(test)]
mod tests {
    use super::*;

    const HOUR: f64 = 3_600_000.0;
    const DAY: f64 = 24.0 * HOUR;

    #[test]
    fn counts_days_and_hours() {
        let now = LAUNCH_MS - (17.0 * DAY + 5.0 * HOUR + 59.0 * 60_000.0);
        assert_eq!(countdown(now, LAUNCH_MS), Countdown { launched: false, days: 17, hours: 5 });
    }

    #[test]
    fn last_hour() {
        assert_eq!(countdown(LAUNCH_MS - 1.0, LAUNCH_MS), Countdown { launched: false, days: 0, hours: 0 });
    }

    #[test]
    fn launched_at_and_after() {
        assert!(countdown(LAUNCH_MS, LAUNCH_MS).launched);
        assert!(countdown(LAUNCH_MS + DAY, LAUNCH_MS).launched);
        assert!(countdown(f64::NAN, LAUNCH_MS).launched);
    }
}
