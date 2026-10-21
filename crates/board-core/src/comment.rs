//! Comment rules. These mirror the checks on `comments` in
//! `supabase/migrations/003_questions_and_comments.sql`; the database still
//! enforces them, this only gives friendly messages first.

use serde::{Deserialize, Serialize};

pub const MAX_NAME: usize = 80;
pub const MAX_BODY: usize = 4000;

/// What the person typed, before trimming.
#[derive(Debug, Default, Deserialize)]
#[serde(default)]
pub struct CommentInput {
    pub author: String,
    pub body: String,
}

/// One message per field that needs fixing.
#[derive(Debug, Default, PartialEq, Serialize)]
pub struct CommentErrors {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub author: Option<&'static str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub body: Option<&'static str>,
}

/// The row to insert, trimmed. Field names match the `comments` columns.
#[derive(Debug, PartialEq, Serialize)]
pub struct CleanComment {
    pub author: String,
    pub body: String,
}

#[derive(Debug, Serialize)]
pub struct CommentChecked {
    pub ok: bool,
    pub errors: CommentErrors,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub clean: Option<CleanComment>,
}

pub fn validate(input: &CommentInput) -> CommentChecked {
    let author = input.author.trim();
    let body = input.body.trim();
    let mut e = CommentErrors::default();

    if author.is_empty() {
        e.author = Some("Enter your name.");
    } else if author.chars().count() > MAX_NAME {
        e.author = Some("Use 80 characters or fewer.");
    }
    if body.is_empty() {
        e.body = Some("Write a comment.");
    } else if body.chars().count() > MAX_BODY {
        e.body = Some("Use 4000 characters or fewer.");
    }

    let ok = e == CommentErrors::default();
    let clean = ok.then(|| CleanComment { author: author.to_string(), body: body.to_string() });
    CommentChecked { ok, errors: e, clean }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn input(author: &str, body: &str) -> CommentInput {
        CommentInput { author: author.into(), body: body.into() }
    }

    #[test]
    fn valid_comment_is_trimmed() {
        let c = validate(&input("  Pat Lee ", "\n Yes, that page moves next week. \n"));
        assert!(c.ok);
        assert_eq!(
            c.clean,
            Some(CleanComment { author: "Pat Lee".into(), body: "Yes, that page moves next week.".into() })
        );
    }

    #[test]
    fn blank_fields_are_flagged() {
        let c = validate(&input("   ", " \n "));
        assert!(!c.ok);
        assert!(c.clean.is_none());
        assert_eq!(c.errors.author, Some("Enter your name."));
        assert_eq!(c.errors.body, Some("Write a comment."));
    }

    #[test]
    fn length_limits_count_characters() {
        let c = validate(&input(&"é".repeat(80), &"ü".repeat(4000)));
        assert!(c.ok, "accented letters count as one character each");
        let c = validate(&input(&"a".repeat(81), &"b".repeat(4001)));
        assert_eq!(c.errors.author, Some("Use 80 characters or fewer."));
        assert_eq!(c.errors.body, Some("Use 4000 characters or fewer."));
    }
}
