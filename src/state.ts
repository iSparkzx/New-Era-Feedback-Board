// Page state shared by the modules, plus a render hook so modules can ask
// for a redraw without importing the renderer (avoids import cycles).

import type { Filter, Item, Status } from './types';

export const st = {
  uid: '',
  email: '',
  canEdit: false,
  statuses: [] as Status[],
  items: new Map<string, Item>(),
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
  st.loaded = false;
  st.filter = { status: '', dept: '', type: '', q: '' };
  st.openId = null;
}

export const itemList = (): Item[] => [...st.items.values()];

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
