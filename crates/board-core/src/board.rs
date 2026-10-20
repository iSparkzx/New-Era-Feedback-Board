//! Filtering, grouping into sections, counts, and "copy as text".
//! Behavior matches `reference/board-current.html`.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use crate::text::{format_ref, full_name};
use crate::time::parse_ts;

/// One row from `items`. Unknown columns are ignored.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default)]
pub struct Item {
    pub id: String,
    pub ref_num: u32,
    pub first_name: Option<String>,
    pub last_name: Option<String>,
    pub department: Option<String>,
    #[serde(rename = "type")]
    pub kind: Option<String>,
    pub link: Option<String>,
    pub description: Option<String>,
    pub screenshots: Option<Vec<String>>,
    pub status: Option<String>,
    pub created_at: Option<String>,
}

/// One row from `statuses`, already in `sort_order`.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default)]
pub struct Status {
    pub key: String,
    pub label: String,
    pub color: String,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default)]
pub struct Filter {
    /// Show one section only (a status key), or empty for all.
    pub status: String,
    pub dept: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub q: String,
}

#[derive(Debug, Serialize)]
pub struct Count {
    pub key: String,
    pub n: usize,
}

#[derive(Debug, Serialize)]
pub struct Section {
    pub key: String,
    pub label: String,
    pub color: String,
    /// Item ids, newest first.
    pub ids: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct View {
    pub total: usize,
    pub shown: usize,
    /// Every status in order, counting all items (filters don't change counts).
    pub counts: Vec<Count>,
    /// Sections to draw, in order. Empty sections are left out while
    /// searching or filtering by department or type.
    pub sections: Vec<Section>,
}

fn s(o: &Option<String>) -> &str {
    o.as_deref().unwrap_or("")
}

/// The status key an item shows under. Unknown keys fall back to the first section.
fn status_of<'a>(item: &'a Item, statuses: &'a [Status]) -> &'a str {
    let key = s(&item.status);
    if statuses.iter().any(|st| st.key == key) {
        key
    } else {
        statuses.first().map(|st| st.key.as_str()).unwrap_or(key)
    }
}

fn matches(item: &Item, f: &Filter, q: &str, statuses: &[Status]) -> bool {
    if !f.status.is_empty() && status_of(item, statuses) != f.status {
        return false;
    }
    if !f.dept.is_empty() && s(&item.department) != f.dept {
        return false;
    }
    if !f.kind.is_empty() && s(&item.kind) != f.kind {
        return false;
    }
    if !q.is_empty() {
        let hay = [
            s(&item.first_name),
            s(&item.last_name),
            s(&item.department),
            s(&item.kind),
            s(&item.link),
            s(&item.description),
            &format_ref(item.ref_num),
        ]
        .join(" ")
        .to_lowercase();
        if !hay.contains(q) {
            return false;
        }
    }
    true
}

/// Items that pass the filter, newest first.
pub fn filtered<'a>(items: &'a [Item], statuses: &[Status], f: &Filter) -> Vec<&'a Item> {
    let q = f.q.trim().to_lowercase();
    let mut rows: Vec<&Item> = items.iter().filter(|it| matches(it, f, &q, statuses)).collect();
    let when = |it: &Item| it.created_at.as_deref().and_then(parse_ts).unwrap_or(f64::NEG_INFINITY);
    rows.sort_by(|a, b| when(b).total_cmp(&when(a)).then(b.ref_num.cmp(&a.ref_num)));
    rows
}

pub fn view(items: &[Item], statuses: &[Status], f: &Filter) -> View {
    let mut counts: HashMap<&str, usize> = HashMap::new();
    for it in items {
        *counts.entry(status_of(it, statuses)).or_default() += 1;
    }

    let rows = filtered(items, statuses, f);
    let mut groups: HashMap<&str, Vec<String>> = HashMap::new();
    for it in &rows {
        groups.entry(status_of(it, statuses)).or_default().push(it.id.clone());
    }

    let filtering = !f.q.trim().is_empty() || !f.dept.is_empty() || !f.kind.is_empty();
    let sections = statuses
        .iter()
        .filter(|st| f.status.is_empty() || f.status == st.key)
        .filter_map(|st| {
            let ids = groups.remove(st.key.as_str()).unwrap_or_default();
            if filtering && ids.is_empty() && f.status.is_empty() {
                return None;
            }
            Some(Section { key: st.key.clone(), label: st.label.clone(), color: st.color.clone(), ids })
        })
        .collect();

    View {
        total: items.len(),
        shown: rows.len(),
        counts: statuses
            .iter()
            .map(|st| Count { key: st.key.clone(), n: counts.get(st.key.as_str()).copied().unwrap_or(0) })
            .collect(),
        sections,
    }
}

/// The shown items as plain text, grouped by section.
pub fn copy_text(items: &[Item], statuses: &[Status], f: &Filter) -> String {
    let rows = filtered(items, statuses, f);
    let mut lines = vec!["New Era Feedback Board".to_string(), String::new()];
    for st in statuses {
        let g: Vec<&&Item> = rows.iter().filter(|it| status_of(it, statuses) == st.key).collect();
        if g.is_empty() {
            continue;
        }
        lines.push(format!("== {} ({}) ==", st.label.to_uppercase(), g.len()));
        for it in g {
            lines.push(format!(
                "{} | {} | {} | {}",
                format_ref(it.ref_num),
                s(&it.kind),
                s(&it.department),
                full_name(s(&it.first_name), s(&it.last_name)),
            ));
            lines.push(format!("  {}", s(&it.description).replace('\n', "\n  ")));
            if !s(&it.link).is_empty() {
                lines.push(format!("  Page: {}", s(&it.link)));
            }
            let shots = it.screenshots.as_ref().map_or(0, Vec::len);
            if shots > 0 {
                lines.push(format!("  Screenshots: {shots} on the board"));
            }
        }
        lines.push(String::new());
    }
    lines.join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn statuses() -> Vec<Status> {
        [("new", "New", "new"), ("review", "In Review", "rev"), ("done", "Done", "done")]
            .iter()
            .map(|(k, l, c)| Status { key: k.to_string(), label: l.to_string(), color: c.to_string() })
            .collect()
    }

    fn item(id: &str, n: u32, status: &str, dept: &str, kind: &str, desc: &str, at: &str) -> Item {
        Item {
            id: id.into(),
            ref_num: n,
            first_name: Some("Sam".into()),
            last_name: Some("Rivera".into()),
            department: Some(dept.into()),
            kind: Some(kind.into()),
            link: None,
            description: Some(desc.into()),
            screenshots: Some(vec![]),
            status: Some(status.into()),
            created_at: Some(at.into()),
        }
    }

    fn sample() -> Vec<Item> {
        vec![
            item("a", 1, "new", "Sales", "Feedback", "Rename a label", "2026-10-20T18:31:27+00:00"),
            item("b", 2, "new", "Sales", "Bug", "Search box missing", "2026-10-20T18:39:09+00:00"),
            item("c", 3, "done", "Marketing", "Process", "Update the help page", "2026-10-20 17:46:37+00"),
            item("d", 4, "gone", "Sales", "Feedback", "Old status key", "2026-10-19T00:00:00Z"),
        ]
    }

    #[test]
    fn groups_newest_first_and_counts_everything() {
        let v = view(&sample(), &statuses(), &Filter::default());
        assert_eq!(v.total, 4);
        assert_eq!(v.shown, 4);
        let keys: Vec<_> = v.sections.iter().map(|s| s.key.as_str()).collect();
        assert_eq!(keys, ["new", "review", "done"], "all sections, including empty ones");
        assert_eq!(v.sections[0].ids, ["b", "a", "d"], "unknown status shows under the first section");
        assert!(v.sections[1].ids.is_empty());
        assert_eq!(v.counts.iter().map(|c| c.n).collect::<Vec<_>>(), [3, 0, 1]);
    }

    #[test]
    fn filtering_hides_empty_sections_but_not_counts() {
        let f = Filter { dept: "Sales".into(), ..Default::default() };
        let v = view(&sample(), &statuses(), &f);
        assert_eq!(v.shown, 3);
        assert_eq!(v.sections.len(), 1);
        assert_eq!(v.counts[2].n, 1, "counts ignore filters");
    }

    #[test]
    fn status_tile_shows_one_section_even_if_empty() {
        let f = Filter { status: "review".into(), q: "nothing matches".into(), ..Default::default() };
        let v = view(&sample(), &statuses(), &f);
        assert_eq!(v.sections.len(), 1);
        assert_eq!(v.sections[0].key, "review");
        assert_eq!(v.shown, 0);
    }

    #[test]
    fn search_covers_ref_name_and_text() {
        let st = statuses();
        let items = sample();
        let q = |q: &str| view(&items, &st, &Filter { q: q.into(), ..Default::default() }).shown;
        assert_eq!(q("ne-03"), 1);
        assert_eq!(q("  SEARCH box "), 1);
        assert_eq!(q("rivera"), 4);
        assert_eq!(q("marketing"), 1);
        assert_eq!(q("zzz"), 0);
    }

    #[test]
    fn filters_combine() {
        let f = Filter { dept: "Sales".into(), kind: "Bug".into(), ..Default::default() };
        assert_eq!(view(&sample(), &statuses(), &f).shown, 1);
    }

    #[test]
    fn copy_text_layout() {
        let mut items = sample();
        items[1].link = Some("https://dev.worldemblem.com/shop".into());
        items[1].screenshots = Some(vec!["u/1.png".into(), "u/2.png".into()]);
        items[1].description = Some("Line one\nLine two".into());
        let f = Filter { status: "new".into(), ..Default::default() };
        let text = copy_text(&items, &statuses(), &f);
        let expected = "New Era Feedback Board\n\n\
            == NEW (3) ==\n\
            NE-02 | Bug | Sales | Sam Rivera\n  Line one\n  Line two\n  Page: https://dev.worldemblem.com/shop\n  Screenshots: 2 on the board\n\
            NE-01 | Feedback | Sales | Sam Rivera\n  Rename a label\n\
            NE-04 | Feedback | Sales | Sam Rivera\n  Old status key\n";
        assert_eq!(text, expected);
    }
}
