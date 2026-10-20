// Signed URLs for the private screenshots bucket. URLs last 1 hour and are
// fetched in batches, then reused until they are close to expiring.

import { SCREENSHOTS, sb } from './supabase';

const LIFETIME_S = 3600;
const REFRESH_BEFORE_MS = 10 * 60 * 1000;
const RETRY_FAILED_MS = 60 * 1000;

interface Entry {
  url: string; // '' when the file couldn't be signed
  expires: number;
}

const cache = new Map<string, Entry>();
let inFlight: Promise<boolean> | null = null;

/** The signed URL for a storage path, '' if it failed, undefined if not fetched yet. */
export function signedUrl(path: string): string | undefined {
  return cache.get(path)?.url;
}

function stale(path: string, now: number): boolean {
  const e = cache.get(path);
  return !e || e.expires - now < REFRESH_BEFORE_MS;
}

/** Fetches URLs for any paths that are missing or nearly expired. Resolves true if anything changed. */
export async function ensureSigned(paths: string[]): Promise<boolean> {
  if (inFlight) await inFlight;
  const now = Date.now();
  const need = [...new Set(paths)].filter((p) => stale(p, now));
  if (!need.length) return false;

  inFlight = (async () => {
    const { data, error } = await sb().storage.from(SCREENSHOTS).createSignedUrls(need, LIFETIME_S);
    const t = Date.now();
    if (error || !data) {
      console.error(error);
      for (const p of need) cache.set(p, { url: '', expires: t + RETRY_FAILED_MS + REFRESH_BEFORE_MS });
      return true;
    }
    for (const r of data) {
      if (!r.path) continue;
      cache.set(r.path, r.signedUrl && !r.error
        ? { url: r.signedUrl, expires: t + LIFETIME_S * 1000 }
        : { url: '', expires: t + RETRY_FAILED_MS + REFRESH_BEFORE_MS });
    }
    return true;
  })();

  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}

export function clearSigned(): void {
  cache.clear();
}
