// Typed wrappers around the Rust board logic (crates/board-core), which
// wasm-pack builds into src/wasm. Call loadCore() once before anything else.

import init, * as wasm from './wasm/board_core.js';
import type { Checked, CommentChecked, CommentInput, CountdownInfo, Filter, FormInput, Item, Status, View } from './types';

export async function loadCore(): Promise<void> {
  await init();
}

export const boardView = (items: Item[], statuses: Status[], filter: Filter): View =>
  wasm.boardView(items, statuses, filter) as View;

export const copyText = (items: Item[], statuses: Status[], filter: Filter): string =>
  wasm.copyText(items, statuses, filter);

export const validateForm = (input: FormInput): Checked => wasm.validateForm(input) as Checked;

export const validateComment = (input: CommentInput): CommentChecked =>
  wasm.validateComment(input) as CommentChecked;

/** Feedback, Bug, Process, Question: the same list the form and the database use. */
export const itemTypes = (): string[] => wasm.itemTypes() as string[];

/** Why this file can't be attached, or undefined if it can. */
export const checkScreenshot = (file: File, already: number): string | undefined =>
  wasm.checkScreenshot(file.type, file.size, already);

export const screenshotExt = (mime: string): string | undefined => wasm.screenshotExt(mime);

export const maxShots = (): number => wasm.maxShots();

export const formatRef = (n: number): string => wasm.formatRef(n);

export const fullName = (first: string, last: string): string => wasm.fullName(first, last);

/** The link if it is safe to use as an href (http or https only). */
export const safeHref = (raw: string | null | undefined): string | undefined =>
  raw ? wasm.safeHref(raw) : undefined;

/** Epoch milliseconds, or NaN. */
export const parseTs = (s: string | null | undefined): number => (s ? wasm.parseTs(s) : NaN);

export const countdown = (nowMs: number): CountdownInfo => wasm.countdown(nowMs) as CountdownInfo;
