// Page state shared by the modules, plus a render hook so modules can ask
// for a redraw without importing the renderer (avoids import cycles).

import { parseTs } from './core';
import type { Filter, Item, ItemComment, Status } from './types';

export const st = {
  uid: '',
  email: '',
  canEdit: false,
  statuses: [] as Status[],
  items: new Map<string, Item>(),
  comments: new Map<string, ItemComment>(),
  loaded: false,
  filter: { status: '', dept: '', type: '', q: '' } as Filter,
  openId: null as string | null,
};

export function resetState(): void {
  st.uid = '';
  st.email = '';
  st.canEdit = false;
  st.statuses = [];
  st.items = new Map();
  st.comments = new Map();
  st.loaded = false;
  st.filter = { status: '', dept: '', type: '', q: '' };
  st.openId = null;
}

export const itemList = (): Item[] => [...st.items.values()];

/** One item's comments, oldest first. */
export const commentsFor = (itemId: string): ItemComment[] =>
  [...st.comments.values()]
    .filter((c) => c.item_id === itemId)
    .map((c) => ({ c, t: parseTs(c.created_at) }))
    .sort((a, b) => a.t - b.t || a.c.id.localeCompare(b.c.id))
    .map(({ c }) => c);

/** How many comments each item has. */
export function commentCounts(): Map<string, number> {
  const n = new Map<string, number>();
  for (const c of st.comments.values()) n.set(c.item_id, (n.get(c.item_id) ?? 0) + 1);
  return n;
}

export const statusLabel = (key: string): string =>
  st.statuses.find((s) => s.key === key)?.label ?? st.statuses[0]?.label ?? key;

/** The status key an item shows under; unknown keys fall back to the first section. */
export const statusOf = (item: Item): string =>
  st.statuses.some((s) => s.key === item.status) ? item.status : (st.statuses[0]?.key ?? item.status);

export const statusColor = (key: string): string => st.statuses.find((s) => s.key === key)?.color ?? 'dq';

let renderHook: () => void = () => {};
export const setRenderHook = (fn: () => void): void => {
  renderHook = fn;
};
export const requestRender = (): void => renderHook();
