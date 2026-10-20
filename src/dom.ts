// Small DOM helpers. All user text goes in through textContent, never innerHTML.

export function $<T extends HTMLElement = HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing #${id}`);
  return node as T;
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string | null,
  text?: string | null,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

export function lsGet(k: string): string | null {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}

export function lsSet(k: string, v: string): void {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* storage blocked; nothing to remember */
  }
}

export function banner(text: string): void {
  const b = $('banner');
  b.textContent = text;
  b.hidden = !text;
}

/** Colors a node with a status color token from the statuses table (new, rev, asg, ...). */
export function paint(node: HTMLElement, token: string): void {
  const t = /^[a-z0-9-]+$/.test(token) ? token : 'dq';
  node.style.setProperty('--c', `var(--s-${t})`);
  node.style.setProperty('--cb', `var(--s-${t}-bg)`);
}

/** "Oct 20, 6:31 PM" in the viewer's locale. */
export function fmtDate(ms: number): string {
  if (Number.isNaN(ms)) return '';
  return new Date(ms).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/** "Tue, Oct 20, 2026, 6:31 PM" in the viewer's locale. */
export function fmtDateLong(ms: number): string {
  if (Number.isNaN(ms)) return '';
  return new Date(ms).toLocaleString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}
