//! Small text helpers: ref numbers, names, and safe links.

/// Shows a ref number as `NE-` plus at least two digits (NE-01, NE-17, NE-104).
pub fn format_ref(n: u32) -> String {
    format!("NE-{n:02}")
}

/// "First Last", or "Unknown" when both are blank.
pub fn full_name(first: &str, last: &str) -> String {
    let name = [first.trim(), last.trim()]
        .iter()
        .filter(|s| !s.is_empty())
        .copied()
        .collect::<Vec<_>>()
        .join(" ");
    if name.is_empty() {
        "Unknown".to_string()
    } else {
        name
    }
}

/// Returns the link if it is safe to put in an `href`: it must start with
/// `http://` or `https://`, name a host, and hold no spaces or control
/// characters. Anything else (including `javascript:`) returns `None`.
pub fn safe_href(raw: &str) -> Option<String> {
    let s = raw.trim();
    let lower = s.to_ascii_lowercase();
    let rest = if lower.starts_with("https://") {
        &s[8..]
    } else if lower.starts_with("http://") {
        &s[7..]
    } else {
        return None;
    };
    if s.chars().any(|c| c.is_whitespace() || c.is_control()) {
        return None;
    }
    let host_end = rest.find(['/', '?', '#']).unwrap_or(rest.len());
    let authority = &rest[..host_end];
    let host = authority.rsplit('@').next().unwrap_or("");
    if host.is_empty() || host.starts_with(':') || authority.contains('\\') {
        return None;
    }
    Some(s.to_string())
}

/// A light check for the sign-in box: one `@`, a name before it, and a dotted
/// domain after it. The sign-in email itself is the real test.
pub fn looks_like_email(raw: &str) -> bool {
    let s = raw.trim();
    let Some((name, domain)) = s.split_once('@') else {
        return false;
    };
    !name.is_empty()
        && !domain.contains('@')
        && !s.chars().any(|c| c.is_whitespace() || c.is_control())
        && domain.split('.').count() >= 2
        && domain.split('.').all(|part| !part.is_empty())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn emails() {
        assert!(looks_like_email(" pat.lee@worldemblem.com "));
        assert!(!looks_like_email("pat"));
        assert!(!looks_like_email("@worldemblem.com"));
        assert!(!looks_like_email("a@worldemblem"));
        assert!(!looks_like_email("a@@worldemblem.com"));
        assert!(!looks_like_email("a b@worldemblem.com"));
        assert!(!looks_like_email("a@worldemblem..com"));
    }

    #[test]
    fn refs_have_at_least_two_digits() {
        assert_eq!(format_ref(1), "NE-01");
        assert_eq!(format_ref(17), "NE-17");
        assert_eq!(format_ref(104), "NE-104");
    }

    #[test]
    fn names() {
        assert_eq!(full_name("Sam", "Rivera"), "Sam Rivera");
        assert_eq!(full_name(" Pat ", ""), "Pat");
        assert_eq!(full_name("", "  "), "Unknown");
    }

    #[test]
    fn only_http_links_are_safe() {
        assert_eq!(
            safe_href("  https://dev.worldemblem.com/shop?x=1 ").as_deref(),
            Some("https://dev.worldemblem.com/shop?x=1")
        );
        assert!(safe_href("HTTP://example.com").is_some());
        assert!(safe_href("javascript:alert(1)").is_none());
        assert!(safe_href("JaVaScRiPt:alert(1)").is_none());
        assert!(safe_href("data:text/html,hi").is_none());
        assert!(safe_href("ftp://example.com").is_none());
        assert!(safe_href("https://").is_none());
        assert!(safe_href("https:///path").is_none());
        assert!(safe_href("https://exa mple.com").is_none());
        assert!(safe_href("https://a\\@b.com").is_none());
        assert!(safe_href("www.example.com").is_none());
        assert!(safe_href("").is_none());
    }
}
