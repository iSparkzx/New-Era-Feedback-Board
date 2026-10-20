// Parts shared by cards and the drawer: status pill or "Move to" control,
// page link, and screenshot thumbnails.

import { safeHref } from './core';
import { moveItem } from './data';
import { banner, el, paint } from './dom';
import { friendly } from './errors';
import { openLightbox } from './lightbox';
import { signedUrl } from './screenshots';
import { requestRender, st, statusColor, statusLabel, statusOf } from './state';
import type { Item } from './types';

/** Admins get a "Move to" dropdown; everyone else sees the status as a pill. */
export function statusControl(item: Item, idPrefix: string, afterMove?: () => void): DocumentFragment {
  const s = statusOf(item);
  const frag = document.createDocumentFragment();
  if (st.canEdit) {
    const lbl = el('label', 'movelbl', 'Move to');
    const sel = el('select', 'status pill');
    paint(sel, statusColor(s));
    sel.id = idPrefix + item.id;
    lbl.htmlFor = sel.id;
    for (const o of st.statuses) {
      const op = el('option', null, o.label);
      op.value = o.key;
      op.selected = o.key === s;
      sel.appendChild(op);
    }
    sel.addEventListener('change', async () => {
      sel.disabled = true;
      try {
        await moveItem(item.id, sel.value);
        banner('');
      } catch (err) {
        sel.value = s;
        banner(friendly(err, 'Only board admins can move items.', 'Could not move that item. Try again.'));
      }
      sel.disabled = false;
      requestRender();
      afterMove?.();
    });
    frag.append(lbl, sel);
  } else {
    const pill = el('span', 'status pill', statusLabel(s));
    paint(pill, statusColor(s));
    frag.appendChild(pill);
  }
  return frag;
}

/** A clickable link if it is http(s), plain text otherwise, or null if there is none. */
export function linkNode(item: Item): Node | null {
  if (!item.link) return null;
  const href = safeHref(item.link);
  if (!href) return document.createTextNode(item.link);
  const a = el('a', null, item.link);
  a.href = href;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  return a;
}

/** Screenshot buttons that open the lightbox, or null if there are none. */
export function shotsNode(item: Item, cls: string): HTMLElement | null {
  if (!item.screenshots.length) return null;
  const box = el('div', cls);
  item.screenshots.forEach((path, i) => {
    const b = el('button', 'thumb');
    b.type = 'button';
    b.setAttribute('aria-label', `Open screenshot ${i + 1} full size`);
    const url = signedUrl(path);
    if (url) {
      const img = el('img');
      img.alt = `Screenshot ${i + 1}`;
      img.loading = 'lazy';
      img.src = url;
      img.addEventListener('error', () => {
        b.textContent = 'Image unavailable';
        b.classList.add('unavailable');
      });
      b.appendChild(img);
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        openLightbox(url);
      });
    } else {
      b.textContent = url === '' ? 'Image unavailable' : 'Loading…';
      b.classList.add('unavailable');
      b.disabled = true;
    }
    box.appendChild(b);
  });
  return box;
}
