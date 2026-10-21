//! WebAssembly exports. Each function converts JS values to the plain Rust
//! types, calls the matching module, and converts the result back.
//! Typed wrappers for TypeScript live in `src/core.ts`.

use serde::de::DeserializeOwned;
use serde::Serialize;
use wasm_bindgen::prelude::*;

use crate::board::{self, Filter, Item, Status};
use crate::{comment, countdown, form, text, time};

fn from_js<T: DeserializeOwned>(v: JsValue) -> Result<T, JsError> {
    serde_wasm_bindgen::from_value(v).map_err(|e| JsError::new(&e.to_string()))
}

fn to_js<T: Serialize>(v: &T) -> Result<JsValue, JsError> {
    v.serialize(&serde_wasm_bindgen::Serializer::json_compatible())
        .map_err(|e| JsError::new(&e.to_string()))
}

#[wasm_bindgen(js_name = boardView)]
pub fn board_view(items: JsValue, statuses: JsValue, filter: JsValue) -> Result<JsValue, JsError> {
    let items: Vec<Item> = from_js(items)?;
    let statuses: Vec<Status> = from_js(statuses)?;
    let filter: Filter = from_js(filter)?;
    to_js(&board::view(&items, &statuses, &filter))
}

#[wasm_bindgen(js_name = copyText)]
pub fn copy_text(items: JsValue, statuses: JsValue, filter: JsValue) -> Result<String, JsError> {
    let items: Vec<Item> = from_js(items)?;
    let statuses: Vec<Status> = from_js(statuses)?;
    let filter: Filter = from_js(filter)?;
    Ok(board::copy_text(&items, &statuses, &filter))
}

#[wasm_bindgen(js_name = validateForm)]
pub fn validate_form(input: JsValue) -> Result<JsValue, JsError> {
    let input: form::FormInput = from_js(input)?;
    to_js(&form::validate(&input))
}

#[wasm_bindgen(js_name = validateComment)]
pub fn validate_comment(input: JsValue) -> Result<JsValue, JsError> {
    let input: comment::CommentInput = from_js(input)?;
    to_js(&comment::validate(&input))
}

/// The item types, in form order.
#[wasm_bindgen(js_name = itemTypes)]
pub fn item_types() -> Result<JsValue, JsError> {
    to_js(&form::TYPES)
}

#[wasm_bindgen(js_name = checkScreenshot)]
pub fn check_screenshot(mime: &str, size_bytes: f64, already: u32) -> Option<String> {
    form::check_screenshot(mime, size_bytes, already).map(str::to_string)
}

#[wasm_bindgen(js_name = screenshotExt)]
pub fn screenshot_ext(mime: &str) -> Option<String> {
    form::screenshot_ext(mime).map(str::to_string)
}

#[wasm_bindgen(js_name = maxShots)]
pub fn max_shots() -> u32 {
    form::MAX_SHOTS
}

#[wasm_bindgen(js_name = formatRef)]
pub fn format_ref(n: u32) -> String {
    text::format_ref(n)
}

#[wasm_bindgen(js_name = fullName)]
pub fn full_name(first: &str, last: &str) -> String {
    text::full_name(first, last)
}

#[wasm_bindgen(js_name = safeHref)]
pub fn safe_href(raw: &str) -> Option<String> {
    text::safe_href(raw)
}

/// Epoch milliseconds, or NaN if the text isn't a timestamp.
#[wasm_bindgen(js_name = parseTs)]
pub fn parse_ts(s: &str) -> f64 {
    time::parse_ts(s).unwrap_or(f64::NAN)
}

#[wasm_bindgen(js_name = countdown)]
pub fn countdown_js(now_ms: f64) -> Result<JsValue, JsError> {
    to_js(&countdown::countdown(now_ms, countdown::LAUNCH_MS))
}
