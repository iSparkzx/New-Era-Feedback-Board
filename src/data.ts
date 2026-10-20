// Reads and writes board data in Supabase, and keeps it live.
// The database decides who may do what (row level security); these calls
// only report what it allowed.

import type { RealtimeChannel } from '@supabase/supabase-js';
import { screenshotExt } from './core';
import { NotAllowed } from './errors';
import { st } from './state';
import { SCREENSHOTS, sb } from './supabase';
import type { CleanItem, Item, Status } from './types';

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** Normalizes a row from the REST API or a live update into an Item. */
export function toItem(row: Record<string, unknown>): Item {
  return {
    id: str(row.id),
    ref_num: Number(row.ref_num) || 0,
    first_name: str(row.first_name),
    last_name: str(row.last_name),
    department: str(row.department),
    type: str(row.type),
    link: typeof row.link === 'string' && row.link ? row.link : null,
    description: str(row.description),
    screenshots: Array.isArray(row.screenshots) ? row.screenshots.filter((p): p is string => typeof p === 'string') : [],
    status: str(row.status),
    source: str(row.source),
    created_at: str(row.created_at),
    status_changed_at: typeof row.status_changed_at === 'string' ? row.status_changed_at : null,
  };
}

/** True if the signed-in email is on an allowed domain. */
export async function checkAllowed(): Promise<boolean> {
  const { data, error } = await sb().rpc('is_allowed_user');
  if (error) throw error;
  return data === true;
}

export async function loadAll(): Promise<void> {
  const client = sb();
  const [statuses, items, admin] = await Promise.all([
    client.from('statuses').select('key,label,color').order('sort_order'),
    client.from('items').select('*').order('created_at', { ascending: false }),
    client.rpc('is_admin'),
  ]);
  if (statuses.error) throw statuses.error;
  if (items.error) throw items.error;
  st.statuses = (statuses.data ?? []) as Status[];
  st.items = new Map((items.data ?? []).map((r) => {
    const it = toItem(r);
    return [it.id, it];
  }));
  st.canEdit = admin.data === true;
  st.loaded = true;
}

async function reloadItems(): Promise<void> {
  const { data, error } = await sb().from('items').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  st.items = new Map((data ?? []).map((r) => {
    const it = toItem(r);
    return [it.id, it];
  }));
}

let channel: RealtimeChannel | null = null;

/**
 * Subscribes once to changes on items. `onChange` runs after local state is
 * updated; `onTrouble` gets a message when updates stop (or '' when they resume).
 */
export function subscribe(onChange: () => void, onTrouble: (msg: string) => void): void {
  unsubscribe();
  let broken = false;
  channel = sb()
    .channel('items-live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'items' }, (payload) => {
      if (payload.eventType === 'DELETE') {
        const id = str((payload.old as Record<string, unknown>).id);
        if (id) st.items.delete(id);
      } else {
        const row = payload.new as Record<string, unknown>;
        const prev = st.items.get(str(row.id));
        // Live updates can leave out large unchanged values, so merge over what we have.
        const it = toItem({ ...prev, ...row });
        if (it.id) st.items.set(it.id, it);
      }
      onChange();
    })
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        // Catch anything that changed before the subscription started or while disconnected.
        if (st.loaded) reloadItems().then(onChange, () => {});
        if (broken) {
          broken = false;
          onTrouble('');
        }
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        broken = true;
        onTrouble('The board stopped updating. It will reconnect on its own, or reload the page.');
      }
    });
}

export function unsubscribe(): void {
  if (channel) {
    void sb().removeChannel(channel);
    channel = null;
  }
}

/** Resync after coming back online. */
export const resync = reloadItems;

export async function moveItem(id: string, status: string): Promise<void> {
  const { data, error } = await sb().from('items').update({ status }).eq('id', id).select();
  if (error) throw error;
  if (!data?.length) throw new NotAllowed();
  const it = toItem(data[0]);
  st.items.set(it.id, it);
}

export async function deleteItem(item: Item): Promise<void> {
  const { data, error } = await sb().from('items').delete().eq('id', item.id).select('id');
  if (error) throw error;
  if (!data?.length) throw new NotAllowed();
  st.items.delete(item.id);
  if (item.screenshots.length) {
    const { error: rmError } = await sb().storage.from(SCREENSHOTS).remove(item.screenshots);
    if (rmError) console.error('Item deleted, but its screenshots were not', rmError);
  }
}

/**
 * Uploads screenshots to <user id>/<random>.<ext>, then inserts the item.
 * The database fills in status (New), source, and who submitted it.
 */
export async function submitItem(
  clean: CleanItem,
  files: File[],
  progress: (msg: string) => void,
): Promise<Item> {
  const client = sb();
  const paths: string[] = [];
  for (let i = 0; i < files.length; i++) {
    progress(`Uploading screenshot ${i + 1} of ${files.length}…`);
    const file = files[i];
    const ext = screenshotExt(file.type);
    if (!ext) throw Object.assign(new Error('unsupported type'), { status: 415 });
    const path = `${st.uid}/${crypto.randomUUID()}.${ext}`;
    const { error } = await client.storage.from(SCREENSHOTS).upload(path, file, {
      contentType: file.type,
      upsert: false,
    });
    if (error) throw error;
    paths.push(path);
  }
  progress('Saving…');
  const { data, error } = await client.from('items').insert({ ...clean, screenshots: paths }).select().single();
  if (error) throw error;
  const it = toItem(data);
  st.items.set(it.id, it);
  return it;
}
