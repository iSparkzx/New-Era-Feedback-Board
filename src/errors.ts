// Turns Supabase and network errors into plain messages. Raw error text is
// never shown to people; it goes to the console for debugging.

/** Thrown when the database quietly refused a change (row level security). */
export class NotAllowed extends Error {}

interface ErrLike {
  message?: unknown;
  code?: unknown;
  status?: unknown;
  statusCode?: unknown;
  error?: unknown;
}

export const OFFLINE = "You're offline. Check your connection and try again.";

export function friendly(err: unknown, notAllowed: string, fallback: string): string {
  console.error(err);
  if (!navigator.onLine) return OFFLINE;
  if (err instanceof NotAllowed) return notAllowed;

  const e = (err ?? {}) as ErrLike;
  const msg = `${String(e.message ?? '')} ${String(e.error ?? '')}`;
  const code = String(e.code ?? '');
  const status = Number(e.status ?? e.statusCode ?? 0);

  if (/failed to fetch|networkerror|load failed|network request failed/i.test(msg)) return OFFLINE;
  if (status === 413 || /payload too large|maximum allowed size|entity too large|too large/i.test(msg)) {
    return 'A screenshot is too large. Use images under 20 MB.';
  }
  if (status === 415 || /mime type|invalid_mime_type|not supported/i.test(msg)) {
    return 'Use a PNG, JPG, GIF, or WebP image.';
  }
  if (/jwt expired|invalid jwt|refresh token/i.test(msg)) {
    return 'Your sign-in has expired. Reload the page and sign in again.';
  }
  if (code === '42501' || status === 401 || status === 403 || /row-level security|permission denied|unauthorized/i.test(msg)) {
    return notAllowed;
  }
  if (status === 429 || /rate limit/i.test(msg)) return 'Too many requests at once. Wait a minute and try again.';
  if (code === '23514' || code === '22001' || code === '23502') {
    return "Some details aren't valid. Check the form and try again.";
  }
  return fallback;
}
