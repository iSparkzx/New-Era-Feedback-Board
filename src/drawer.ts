// Side drawer with every detail of one item. Admins can move and delete here.

import { formatRef, fullName, parseTs } from './core';
import { deleteItem } from './data';
import { $, banner, el, fmtDate, fmtDateLong } from './dom';
import { friendly } from './errors';
import { lightboxOpen } from './lightbox';
import { linkNode, shotsNode, statusControl } from './pieces';
import { requestRender, st, statusLabel, statusOf } from './state';
import type { Item } from './types';

let returnFocus: Element | null = null;

export const drawerOpen = (): boolean => !$('drawer').hidden;

export function openDrawer(id: string): void {
  if (!st.items.has(id)) return;
  returnFocus = document.activeElement;
  st.openId = id;
  renderDrawer();
  $('scrim').hidden = false;
  $('drawer').hidden = false;
  $('dClose').focus();
}

export function closeDrawer(): void {
  const id = st.openId;
  st.openId = null;
  $('scrim').hidden = true;
  $('drawer').hidden = true;
  // Cards are rebuilt on every render, so find the card again if the old one is gone.
  let target: Element | null = returnFocus;
  if (!(target instanceof HTMLElement) || !document.contains(target) || target === document.body) {
    target = id ? document.querySelector(`li.card[data-id="${CSS.escape(id)}"]`) : null;
  }
  if (target instanceof HTMLElement) target.focus();
  returnFocus = null;
}

/** Re-draws the open drawer, unless someone is using its dropdown right now. */
export function refreshDrawer(): void {
  if (!st.openId || !drawerOpen()) return;
  const ae = document.activeElement;
  if (ae && $('drawer').contains(ae) && ae.tagName === 'SELECT') return;
  renderDrawer();
}

function renderDrawer(): void {
  const id = st.openId;
  if (!id) return;
  const d = st.items.get(id);
  if (!d) {
    closeDrawer();
    return;
  }
  const name = fullName(d.first_name, d.last_name);
  $('dRef').textContent = formatRef(d.ref_num);
  const body = $('dBody');
  body.textContent = '';

  const top = el('div', 'dsec');
  const chips = el('div', 'cmeta');
  if (d.type) chips.appendChild(el('span', `chip t-${d.type}`, d.type));
  if (d.department) chips.appendChild(el('span', 'chip', d.department));
  chips.appendChild(statusControl(d, 'dstatus-', () => {
    renderDrawer();
    document.getElementById(`dstatus-${id}`)?.focus();
  }));
  top.appendChild(chips);
  const h = el('h2', null, `${d.type || 'Item'} from ${name}`);
  h.id = 'dTitle';
  top.appendChild(h);
  body.appendChild(top);

  const ds = el('div', 'dsec');
  ds.appendChild(el('h3', null, 'Description'));
  ds.appendChild(el('p', 'desc', d.description || 'No description.'));
  body.appendChild(ds);

  const dl = el('dl', 'dl');
  const row = (k: string, v: string | Node | null): void => {
    dl.appendChild(el('dt', null, k));
    const dd = el('dd');
    if (v instanceof Node) dd.appendChild(v);
    else dd.textContent = v || '—';
    dl.appendChild(dd);
  };
  row('Submitted by', name);
  row('Department', d.department);
  row('Type', d.type);
  row('Status', statusLabel(statusOf(d)));
  row('Page link', linkNode(d) ?? 'None given');
  row('Submitted', fmtDateLong(parseTs(d.created_at)));
  row('Source', d.source === 'Teams chat' ? 'Imported from Teams chat' : 'Submitted on this board');
  if (d.status_changed_at) row('Last moved', fmtDate(parseTs(d.status_changed_at)));
  const details = el('div', 'dsec');
  details.append(el('h3', null, 'Details'), dl);
  body.appendChild(details);

  const ss = el('div', 'dsec');
  ss.appendChild(el('h3', null, 'Screenshots'));
  ss.appendChild(shotsNode(d, 'dshots') ?? el('p', 'hint', 'No screenshots attached.'));
  body.appendChild(ss);

  const foot = $('dFoot');
  foot.textContent = '';
  foot.hidden = !st.canEdit;
  if (st.canEdit) foot.appendChild(deleteControl(d));
}

/** "Delete", then "Confirm delete" / "Cancel". */
function deleteControl(d: Item): HTMLElement {
  const wrap = el('span');
  const del = el('button', 'link danger', 'Delete');
  del.type = 'button';
  del.addEventListener('click', () => {
    wrap.textContent = '';
    const yes = el('button', 'danger', 'Confirm delete');
    yes.type = 'button';
    const no = el('button', 'link', 'Cancel');
    no.type = 'button';
    yes.addEventListener('click', async () => {
      yes.disabled = true;
      no.disabled = true;
      try {
        await deleteItem(d);
        banner('');
        closeDrawer();
        requestRender();
      } catch (err) {
        yes.disabled = false;
        no.disabled = false;
        banner(friendly(err, 'Turn on admin tools to delete items.', 'Could not delete that item. Try again in a moment.'));
      }
    });
    no.addEventListener('click', () => {
      wrap.textContent = '';
      wrap.appendChild(del);
      del.focus();
    });
    wrap.append(yes, no);
    yes.focus();
  });
  wrap.appendChild(del);
  return wrap;
}

export function initDrawer(): void {
  $('dClose').addEventListener('click', closeDrawer);
  $('scrim').addEventListener('click', closeDrawer);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !e.defaultPrevented && !lightboxOpen() && drawerOpen()) closeDrawer();
  });
}
