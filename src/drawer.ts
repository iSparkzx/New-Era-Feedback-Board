// Side drawer with every detail of one item, plus its comments. Admins can
// change the type, move, and delete here.

import { formatRef, fullName, itemTypes, parseTs, validateComment } from './core';
import { addComment, changeType, deleteComment, deleteItem } from './data';
import { $, banner, el, fmtDate, fmtDateLong, lsGet, lsSet } from './dom';
import { friendly } from './errors';
import { LS_FIRST, LS_LAST } from './form';
import { lightboxOpen } from './lightbox';
import { linkNode, shotsNode, statusControl } from './pieces';
import { commentsFor, requestRender, st, statusLabel, statusOf } from './state';
import type { CommentInput, Item, ItemComment } from './types';

const LS_COMMENT_NAME = 'nefb-comment-name';

let returnFocus: Element | null = null;
/** The item the comment box's draft belongs to. */
let draftFor: string | null = null;

export const drawerOpen = (): boolean => !$('drawer').hidden;

export function openDrawer(id: string): void {
  if (!st.items.has(id)) return;
  returnFocus = document.activeElement;
  st.openId = id;
  resetCommentForm(id);
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

/** True while someone is using a dropdown or confirming a delete inside this part of the drawer. */
function inUse(partId: string): boolean {
  const ae = document.activeElement;
  return ae instanceof HTMLElement && $(partId).contains(ae) && (ae.tagName === 'SELECT' || !!ae.dataset.confirm);
}

/** Re-draws the open drawer, skipping any part that someone is using right now. */
export function refreshDrawer(): void {
  if (!st.openId || !drawerOpen()) return;
  const d = st.items.get(st.openId);
  if (!d) {
    closeDrawer();
    return;
  }
  if (!inUse('dMain') && !inUse('dFoot')) renderDetails(d);
  if (!inUse('cList')) renderComments(d);
}

function renderDrawer(): void {
  const id = st.openId;
  if (!id) return;
  const d = st.items.get(id);
  if (!d) {
    closeDrawer();
    return;
  }
  renderDetails(d);
  renderComments(d);
}

/** Everything above the comments, plus the admin footer. */
function renderDetails(d: Item): void {
  const id = d.id;
  const name = fullName(d.first_name, d.last_name);
  $('dRef').textContent = formatRef(d.ref_num);
  const body = $('dMain');
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
  row('Type', st.canEdit ? typeControl(d) : d.type);
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
  if (st.canEdit) {
    foot.appendChild(deleteControl(async () => {
      try {
        await deleteItem(d);
        banner('');
        closeDrawer();
        requestRender();
        return true;
      } catch (err) {
        banner(friendly(err, 'Turn on admin tools to delete items.', 'Could not delete that item. Try again in a moment.'));
        return false;
      }
    }));
  }
}

/** Admins pick the type (for example, mark feedback as a Question). */
function typeControl(d: Item): HTMLSelectElement {
  const sel = el('select', 'typesel');
  sel.id = `dtype-${d.id}`;
  sel.setAttribute('aria-label', 'Change type');
  for (const t of itemTypes()) {
    const op = el('option', null, t);
    op.selected = t === d.type;
    sel.appendChild(op);
  }
  sel.addEventListener('change', async () => {
    sel.disabled = true;
    try {
      await changeType(d.id, sel.value);
      banner('');
    } catch (err) {
      banner(friendly(err, 'Turn on admin tools to change the type.', 'Could not change the type. Try again.'));
    }
    requestRender();
    renderDrawer();
    document.getElementById(sel.id)?.focus();
  });
  return sel;
}

function renderComments(d: Item): void {
  const cs = commentsFor(d.id);
  $('cHead').textContent = cs.length ? `Comments (${cs.length})` : 'Comments';
  $('cNone').hidden = cs.length > 0;
  const list = $('cList');
  list.textContent = '';
  list.hidden = !cs.length;
  for (const c of cs) list.appendChild(commentNode(c));
}

function commentNode(c: ItemComment): HTMLLIElement {
  const li = el('li', `cmt${c.by_admin ? ' by-admin' : ''}`);
  const head = el('div', 'chead');
  head.appendChild(el('b', null, c.author));
  if (c.by_admin) head.appendChild(el('span', 'ctag', 'Board admin'));
  head.appendChild(el('span', null, fmtDate(parseTs(c.created_at))));
  if (st.canEdit || (c.created_by !== null && c.created_by === st.uid)) {
    const del = deleteControl(async () => {
      try {
        await deleteComment(c.id);
        $('c-msg').textContent = 'Comment deleted.';
        $('cHead').focus(); // first, so the redraw isn't held back by the confirm button
        requestRender();
        return true;
      } catch (err) {
        $('c-msg').textContent = friendly(err, 'You can delete only your own comments.', 'Could not delete that comment. Try again.');
        return false;
      }
    });
    del.classList.add('cdel');
    head.appendChild(del);
  }
  li.append(head, el('p', 'cbody', c.body));
  return li;
}

/** "Delete", then "Confirm delete" / "Cancel". `run` does the delete and says whether it worked. */
function deleteControl(run: () => Promise<boolean>): HTMLElement {
  const wrap = el('span');
  const del = el('button', 'link danger', 'Delete');
  del.type = 'button';
  del.addEventListener('click', () => {
    wrap.textContent = '';
    const yes = el('button', 'danger', 'Confirm delete');
    yes.type = 'button';
    const no = el('button', 'link', 'Cancel');
    no.type = 'button';
    // A live update won't redraw the drawer while one of these has focus.
    yes.dataset.confirm = '1';
    no.dataset.confirm = '1';
    yes.addEventListener('click', async () => {
      yes.disabled = true;
      no.disabled = true;
      if (await run()) return;
      yes.disabled = false;
      no.disabled = false;
      yes.focus();
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

/** The name used last time, else the name from the feedback form, else blank. */
const rememberedName = (): string =>
  lsGet(LS_COMMENT_NAME) ??
  [lsGet(LS_FIRST), lsGet(LS_LAST)].map((s) => (s ?? '').trim()).filter(Boolean).join(' ');

function showCommentErrors(errors: Partial<Record<keyof CommentInput, string>>): void {
  for (const [key, input, err] of [['body', 'c-body', 'e-cbody'], ['author', 'c-author', 'e-cauthor']] as const) {
    $(err).textContent = errors[key] ?? '';
    if (errors[key]) $(input).setAttribute('aria-invalid', 'true');
    else $(input).removeAttribute('aria-invalid');
  }
}

/** Keeps a draft for the same item; starts fresh for a different one. */
function resetCommentForm(id: string): void {
  if (draftFor !== id) $<HTMLTextAreaElement>('c-body').value = '';
  draftFor = id;
  const author = $<HTMLInputElement>('c-author');
  if (!author.value) author.value = rememberedName();
  showCommentErrors({});
  $('c-msg').textContent = '';
}

async function submitComment(e: SubmitEvent): Promise<void> {
  e.preventDefault();
  const id = st.openId;
  if (!id) return;
  const bodyEl = $<HTMLTextAreaElement>('c-body');
  const authorEl = $<HTMLInputElement>('c-author');
  const msg = $('c-msg');
  const btn = $<HTMLButtonElement>('c-btn');
  msg.textContent = '';
  const r = validateComment({ author: authorEl.value, body: bodyEl.value });
  showCommentErrors(r.errors);
  if (!r.ok || !r.clean) {
    (r.errors.body ? bodyEl : authorEl).focus();
    return;
  }
  btn.disabled = true;
  msg.textContent = 'Saving…';
  try {
    await addComment(id, r.clean);
    lsSet(LS_COMMENT_NAME, r.clean.author);
    if (draftFor === id) bodyEl.value = '';
    msg.textContent = 'Comment added.';
    requestRender();
  } catch (err) {
    msg.textContent = friendly(err, 'Enter the team code again to comment.', 'Could not add the comment. Try again.');
  } finally {
    btn.disabled = false;
  }
}

export function initDrawer(): void {
  $('dClose').addEventListener('click', closeDrawer);
  $('scrim').addEventListener('click', closeDrawer);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !e.defaultPrevented && !lightboxOpen() && drawerOpen()) closeDrawer();
  });
  const form = $<HTMLFormElement>('cForm');
  form.addEventListener('submit', (e) => void submitComment(e));
  $('c-body').addEventListener('input', () => {
    $('c-msg').textContent = '';
  });
  // Ctrl+Enter (Cmd+Enter on a Mac) adds the comment from the text box.
  $('c-body').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      form.requestSubmit();
    }
  });
}
