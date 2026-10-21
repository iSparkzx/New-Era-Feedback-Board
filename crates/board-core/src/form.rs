//! Submit form rules. These mirror the checks in `supabase/schema.sql`;
//! the database still enforces them, this only gives friendly messages first.

use serde::{Deserialize, Serialize};

pub const DEPARTMENTS: [&str; 3] = ["Marketing", "Sales", "Customer Service"];
pub const TYPES: [&str; 4] = ["Feedback", "Bug", "Process", "Question"];

pub const MAX_SHOTS: u32 = 4;
pub const MAX_SHOT_BYTES: f64 = 20.0 * 1024.0 * 1024.0;

/// What the person typed, before trimming.
#[derive(Debug, Default, Deserialize)]
#[serde(default)]
pub struct FormInput {
    pub first_name: String,
    pub last_name: String,
    pub department: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub link: String,
    pub description: String,
}

/// One message per field that needs fixing. Keys match the `e-*` ids on the page.
#[derive(Debug, Default, PartialEq, Serialize)]
pub struct FormErrors {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub first: Option<&'static str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last: Option<&'static str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dept: Option<&'static str>,
    #[serde(rename = "type", skip_serializing_if = "Option::is_none")]
    pub kind: Option<&'static str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub link: Option<&'static str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub desc: Option<&'static str>,
}

/// The row to insert, trimmed. Field names match the `items` columns.
#[derive(Debug, PartialEq, Serialize)]
pub struct CleanItem {
    pub first_name: String,
    pub last_name: String,
    pub department: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub link: Option<String>,
    pub description: String,
}

#[derive(Debug, Serialize)]
pub struct Checked {
    pub ok: bool,
    pub errors: FormErrors,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub clean: Option<CleanItem>,
}

fn len(s: &str) -> usize {
    s.chars().count()
}

pub fn validate(input: &FormInput) -> Checked {
    let first = input.first_name.trim();
    let last = input.last_name.trim();
    let link = input.link.trim();
    let desc = input.description.trim();
    let mut e = FormErrors::default();

    if first.is_empty() {
        e.first = Some("Enter your first name.");
    } else if len(first) > 60 {
        e.first = Some("Use 60 characters or fewer.");
    }
    if last.is_empty() {
        e.last = Some("Enter your last name.");
    } else if len(last) > 60 {
        e.last = Some("Use 60 characters or fewer.");
    }
    if !DEPARTMENTS.contains(&input.department.as_str()) {
        e.dept = Some("Choose your department.");
    }
    if !TYPES.contains(&input.kind.as_str()) {
        e.kind = Some("Choose a type.");
    }
    if !link.is_empty() && crate::text::safe_href(link).is_none() {
        e.link = Some("Paste a full link that starts with https://");
    }
    if len(desc) < 5 {
        e.desc = Some("Describe the issue.");
    } else if len(desc) > 4000 {
        e.desc = Some("Use 4000 characters or fewer.");
    }

    let ok = e == FormErrors::default();
    let clean = ok.then(|| CleanItem {
        first_name: first.to_string(),
        last_name: last.to_string(),
        department: input.department.clone(),
        kind: input.kind.clone(),
        link: (!link.is_empty()).then(|| link.to_string()),
        description: desc.to_string(),
    });
    Checked { ok, errors: e, clean }
}

/// Why a chosen file can't be attached, or `None` if it can.
/// `already` is how many screenshots are attached so far.
pub fn check_screenshot(mime: &str, size_bytes: f64, already: u32) -> Option<&'static str> {
    if screenshot_ext(mime).is_none() {
        Some("Use a PNG, JPG, GIF, or WebP image.")
    } else if size_bytes > MAX_SHOT_BYTES {
        Some("Each image must be under 20 MB.")
    } else if already >= MAX_SHOTS {
        Some("You can attach up to 4 screenshots.")
    } else {
        None
    }
}

/// File extension for an allowed screenshot type.
pub fn screenshot_ext(mime: &str) -> Option<&'static str> {
    match mime {
        "image/png" => Some("png"),
        "image/jpeg" => Some("jpg"),
        "image/gif" => Some("gif"),
        "image/webp" => Some("webp"),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn good() -> FormInput {
        FormInput {
            first_name: " Sam ".into(),
            last_name: "Rivera".into(),
            department: "Sales".into(),
            kind: "Bug".into(),
            link: "".into(),
            description: "  Search is missing.  ".into(),
        }
    }

    #[test]
    fn valid_input_is_trimmed() {
        let c = validate(&good());
        assert!(c.ok);
        let clean = c.clean.unwrap();
        assert_eq!(clean.first_name, "Sam");
        assert_eq!(clean.description, "Search is missing.");
        assert_eq!(clean.link, None);
    }

    #[test]
    fn empty_form_flags_every_required_field() {
        let c = validate(&FormInput::default());
        assert!(!c.ok);
        assert!(c.clean.is_none());
        assert_eq!(c.errors.first, Some("Enter your first name."));
        assert_eq!(c.errors.last, Some("Enter your last name."));
        assert_eq!(c.errors.dept, Some("Choose your department."));
        assert_eq!(c.errors.kind, Some("Choose a type."));
        assert_eq!(c.errors.desc, Some("Describe the issue."));
        assert_eq!(c.errors.link, None, "link is optional");
    }

    #[test]
    fn length_limits() {
        let mut f = good();
        f.first_name = "a".repeat(61);
        f.description = "abcd".into();
        let c = validate(&f);
        assert_eq!(c.errors.first, Some("Use 60 characters or fewer."));
        assert_eq!(c.errors.desc, Some("Describe the issue."));

        f.first_name = "é".repeat(60);
        f.description = "x".repeat(4001);
        let c = validate(&f);
        assert_eq!(c.errors.first, None, "60 accented letters is fine");
        assert_eq!(c.errors.desc, Some("Use 4000 characters or fewer."));
    }

    #[test]
    fn options_must_match_exactly() {
        let mut f = good();
        f.department = "sales".into();
        f.kind = "question".into();
        let c = validate(&f);
        assert!(c.errors.dept.is_some());
        assert!(c.errors.kind.is_some());
    }

    #[test]
    fn question_is_a_type() {
        let mut f = good();
        f.kind = "Question".into();
        assert!(validate(&f).ok);
    }

    #[test]
    fn link_must_be_http() {
        let mut f = good();
        f.link = "javascript:alert(1)".into();
        assert!(validate(&f).errors.link.is_some());
        f.link = " https://dev.worldemblem.com/shop ".into();
        let c = validate(&f);
        assert!(c.ok);
        assert_eq!(c.clean.unwrap().link.as_deref(), Some("https://dev.worldemblem.com/shop"));
    }

    #[test]
    fn screenshots() {
        assert_eq!(check_screenshot("image/png", 1000.0, 0), None);
        assert_eq!(check_screenshot("image/svg+xml", 1000.0, 0), Some("Use a PNG, JPG, GIF, or WebP image."));
        assert_eq!(check_screenshot("image/jpeg", MAX_SHOT_BYTES, 3), None);
        assert_eq!(check_screenshot("image/jpeg", MAX_SHOT_BYTES + 1.0, 0), Some("Each image must be under 20 MB."));
        assert_eq!(check_screenshot("image/webp", 10.0, 4), Some("You can attach up to 4 screenshots."));
        assert_eq!(screenshot_ext("image/jpeg"), Some("jpg"));
    }
}
