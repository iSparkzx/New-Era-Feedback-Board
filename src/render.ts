// Count tiles, sections, and cards. The Rust core decides what shows where;
// this file only turns that into DOM.

import { boardView, formatRef, fullName, parseTs } from './core';
import { $, el, fmtDate, paint } from './dom';
import { openDrawer, refreshDrawer } from './drawer';
import { linkNode, shotsNode, statusControl } from './pieces';
import { ensureSigned } from './screenshots';
import { commentCounts, itemList, st } from './state';
import type { Item, View } from './types';

export function render(): void {
  const view = boardView(itemList(), st.statuses, st.filter);
  renderCounts(view);
  renderList(view);
  refreshDrawer();
  void signShown(view);
}

function renderCounts(view: View): void {
  const box = $('counts');
  box.textContent = '';
  for (const s of st.statuses) {
    const n = view.counts.find((c) => c.key === s.key)?.n ?? 0;
    const b = el('button', 'count');
    b.type = 'button';
    paint(b, s.color);
    b.setAttribute('aria-pressed', String(st.filter.status === s.key));
    b.setAttribute('aria-label', `Show only ${s.label} (${n})`);
    b.appendChild(el('span', `n${n ? '' : ' zero'}`, String(n)));
    b.appendChild(el('span', 'l', s.label));
    b.addEventListener('click', () => {
      st.filter.status = st.filter.status === s.key ? '' : s.key;
      render();
    });
    box.appendChild(b);
  }
  $('showAll').hidden = !st.filter.status;
}

function renderList(view: View): void {
  const list = $('list');
  list.textContent = '';
  if (!st.loaded) {
    $('showing').textContent = 'Loading feedback…';
    return;
  }
  $('showing').textContent = `Showing ${view.shown} of ${view.total}${view.total === 1 ? ' item' : ' items'}.`;
  if (!view.total) {
    list.appendChild(el('div', 'empty', 'No feedback yet. Use "Add feedback" to log the first item.'));
    return;
  }
  const counts = commentCounts();
  for (const s of view.sections) {
    const sec = el('section', `sec${s.ids.length ? '' : ' is-empty'}`);
    paint(sec, s.color);
    sec.id = `sec-${s.key}`;
    const head = el('div', 'sechead');
    head.append(el('h2', null, s.label), el('span', 'num', String(s.ids.length)));
    sec.appendChild(head);
    if (s.ids.length) {
      const ol = el('ol');
      for (const id of s.ids) {
        const it = st.items.get(id);
        if (it) ol.appendChild(buildCard(it, counts.get(id) ?? 0));
      }
      sec.appendChild(ol);
    }
    list.appendChild(sec);
  }
  if (!view.shown) list.appendChild(el('div', 'empty', 'No items match these filters.'));
}

function buildCard(d: Item, comments: number): HTMLLIElement {
  const ref = formatRef(d.ref_num);
  const name = fullName(d.first_name, d.last_name);
  const commentText = comments ? `${comments} ${comments === 1 ? 'comment' : 'comments'}` : '';
  const li = el('li', `card${d.type === 'Bug' ? ' bug' : ''}`);
  li.tabIndex = 0;
  li.dataset.id = d.id;
  li.setAttribute('aria-label', `${ref}, ${d.type} from ${name}${commentText ? `, ${commentText}` : ''}. Open details`);

  const meta = el('div', 'cmeta');
  meta.appendChild(el('span', 'ref', ref));
  if (d.type) meta.appendChild(el('span', `chip t-${d.type}`, d.type));
  if (d.department) meta.appendChild(el('span', 'chip', d.department));
  meta.appendChild(statusControl(d, 'status-'));
  li.appendChild(meta);

  li.appendChild(el('p', 'desc', d.description));

  const ln = linkNode(d);
  if (ln) {
    const lp = el('div', 'lnk');
    lp.append('Page: ', ln);
    li.appendChild(lp);
  }

  const th = shotsNode(d, 'thumbs');
  if (th) li.appendChild(th);

  const who = el('div', 'who');
  who.appendChild(el('b', null, name));
  const when = fmtDate(parseTs(d.created_at));
  if (when) who.append(` · ${when}`);
  const foot = el('div', 'cfoot');
  foot.style.justifyContent = 'space-between';
  const right = el('span', 'cright');
  if (commentText) right.appendChild(el('span', 'ccount', commentText));
  right.appendChild(el('span', 'more', 'View details →'));
  foot.append(who, right);
  li.appendChild(foot);

  li.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('select, button, a, label, input')) return;
    openDrawer(d.id);
  });
  li.addEventListener('keydown', (e) => {
    if (e.target !== li) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openDrawer(d.id);
    }
  });
  return li;
}

/** Renews screenshot links before they expire (they last 1 hour). Called on a timer. */
export function refreshShots(): void {
  if (st.loaded) void signShown(boardView(itemList(), st.statuses, st.filter));
}

/** Fetch signed URLs for screenshots that are on screen, then redraw once if any arrived. */
async function signShown(view: View): Promise<void> {
  const paths: string[] = [];
  for (const s of view.sections) {
    for (const id of s.ids) paths.push(...(st.items.get(id)?.screenshots ?? []));
  }
  if (st.openId) paths.push(...(st.items.get(st.openId)?.screenshots ?? []));
  if (!paths.length) return;
  try {
    if (await ensureSigned(paths)) render();
  } catch (err) {
    console.error(err);
  }
}
