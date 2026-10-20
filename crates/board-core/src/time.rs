//! Timestamp parsing. The REST API and live updates can format Postgres
//! `timestamptz` values differently ("2026-10-20T18:31:27+00:00" versus
//! "2026-10-20 18:31:27.123+00"), so both are read here into epoch
//! milliseconds instead of relying on the browser's date parser.

/// Parses `YYYY-MM-DD[T ]HH:MM[:SS[.fff…]][Z|±HH[:MM]]` into milliseconds
/// since 1970-01-01 UTC. Returns `None` if the text is not in that shape.
pub fn parse_ts(s: &str) -> Option<f64> {
    let b = s.trim().as_bytes();
    let num = |from: usize, len: usize| -> Option<i64> {
        let part = b.get(from..from + len)?;
        if !part.iter().all(u8::is_ascii_digit) {
            return None;
        }
        std::str::from_utf8(part).ok()?.parse().ok()
    };

    let year = num(0, 4)?;
    if b.get(4) != Some(&b'-') || b.get(7) != Some(&b'-') {
        return None;
    }
    let month = num(5, 2)?;
    let day = num(8, 2)?;
    if !(1..=12).contains(&month) || !(1..=31).contains(&day) {
        return None;
    }

    let mut i = 10;
    let (mut hour, mut minute, mut second, mut millis) = (0, 0, 0, 0.0);
    if matches!(b.get(i), Some(b'T' | b't' | b' ')) {
        hour = num(i + 1, 2)?;
        if b.get(i + 3) != Some(&b':') {
            return None;
        }
        minute = num(i + 4, 2)?;
        i += 6;
        if b.get(i) == Some(&b':') {
            second = num(i + 1, 2)?;
            i += 3;
            if b.get(i) == Some(&b'.') {
                let start = i + 1;
                let mut end = start;
                while b.get(end).is_some_and(u8::is_ascii_digit) {
                    end += 1;
                }
                if end == start {
                    return None;
                }
                let frac: f64 = format!("0.{}", std::str::from_utf8(&b[start..end]).ok()?)
                    .parse()
                    .ok()?;
                millis = frac * 1000.0;
                i = end;
            }
        }
    }
    if hour > 23 || minute > 59 || second > 60 {
        return None;
    }

    let offset_minutes = match b.get(i) {
        None => 0,
        Some(b'Z' | b'z') if i + 1 == b.len() => 0,
        Some(&sign @ (b'+' | b'-')) => {
            let oh = num(i + 1, 2)?;
            let mut j = i + 3;
            if b.get(j) == Some(&b':') {
                j += 1;
            }
            let om = if j < b.len() { num(j, 2)? } else { 0 };
            if j < b.len() && j + 2 != b.len() {
                return None;
            }
            let total = oh * 60 + om;
            if sign == b'+' {
                total
            } else {
                -total
            }
        }
        _ => return None,
    };

    let days = days_from_civil(year, month, day);
    let secs = days * 86_400 + hour * 3_600 + minute * 60 + second - offset_minutes * 60;
    Some(secs as f64 * 1000.0 + millis)
}

/// Days since 1970-01-01 for a proleptic Gregorian date (Howard Hinnant's algorithm).
fn days_from_civil(y: i64, m: i64, d: i64) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400;
    let mp = (m + 9) % 12;
    let doy = (153 * mp + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

#[cfg(test)]
mod tests {
    use super::*;

    // 2026-10-20T18:31:27Z
    const T: f64 = 1_792_521_087_000.0;

    #[test]
    fn rest_api_format() {
        assert_eq!(parse_ts("2026-10-20T18:31:27+00:00"), Some(T));
        assert_eq!(parse_ts("2026-10-20T18:31:27Z"), Some(T));
    }

    #[test]
    fn postgres_text_format() {
        assert_eq!(parse_ts("2026-10-20 18:31:27+00"), Some(T));
        assert_eq!(parse_ts("2026-10-20 18:31:27.25+00"), Some(T + 250.0));
        assert_eq!(parse_ts("2026-10-20T18:31:27.123456+00:00"), Some(T + 123.456));
    }

    #[test]
    fn offsets() {
        assert_eq!(parse_ts("2026-10-20T14:31:27-04:00"), Some(T));
        assert_eq!(parse_ts("2026-10-20T20:01:27+0130"), Some(T));
    }

    #[test]
    fn launch_moment() {
        // Midnight Eastern (EST, UTC-5) on Nov 7, 2026.
        assert_eq!(parse_ts("2026-11-07T00:00:00-05:00"), parse_ts("2026-11-07T05:00:00Z"));
        assert_eq!(parse_ts("2026-11-07T05:00:00Z"), Some(1_794_027_600_000.0));
    }

    #[test]
    fn rejects_junk() {
        for bad in ["", "yesterday", "2026-13-01T00:00:00Z", "2026-10-20X", "2026-10-20T18:31:27+00:00junk"] {
            assert_eq!(parse_ts(bad), None, "{bad}");
        }
    }

    #[test]
    fn ordering_matches_time() {
        let a = parse_ts("2026-10-20 18:31:27.5+00").unwrap();
        let b = parse_ts("2026-10-20T18:31:27.45+00:00").unwrap();
        assert!(a > b);
    }
}
