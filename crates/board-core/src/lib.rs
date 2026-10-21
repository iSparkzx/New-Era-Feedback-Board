//! Board logic for the New Era Feedback Board.
//!
//! Plain Rust modules hold the rules (so they can be unit tested natively);
//! `wasm` exposes them to the TypeScript page through WebAssembly.
//! Nothing here touches the network or the page.

pub mod board;
pub mod comment;
pub mod countdown;
pub mod form;
pub mod text;
pub mod time;

mod wasm;
