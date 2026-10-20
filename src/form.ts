// "Add feedback" form: fields, screenshots (choose, drag, or paste), submit.

import { checkScreenshot, validateForm } from './core';
import { submitItem } from './data';
import { $, el, lsGet, lsSet } from './dom';
import { friendly } from './errors';
import { requestRender } from './state';
import type { FormField } from './types';

const FIELDS: { key: FormField; input: string }[] = [
  { key: 'first', input: 'f-first' },
  { key: 'last', input: 'f-last' },
  { key: 'dept', input: 'f-dept' },
  { key: 'type', input: 'f-type' },
  { key: 'link', input: 'f-link' },
  { key: 'desc', input: 'f-desc' },
];

const LS_FIRST = 'nefb-first';
const LS_LAST = 'nefb-last';
const LS_DEPT = 'nefb-dept';

interface Pending {
  file: File;
  url: string;
}
let pending: Pending[] = [];

const val = (id: string): string => $<HTMLInputElement>(id).value;
const setVal = (id: string, v: string): void => {
  $<HTMLInputElement>(id).value = v;
};
const form = (): HTMLFormElement => $<HTMLFormElement>('formPanel');

export function openForm(open: boolean): void {
  form().hidden = !open;
  $('toggleForm').textContent = open ? 'Close form' : 'Add feedback';
  if (!open) return;
  if (!val('f-first')) setVal('f-first', lsGet(LS_FIRST) ?? '');
  if (!val('f-last')) setVal('f-last', lsGet(LS_LAST) ?? '');
  if (!val('f-dept')) setVal('f-dept', lsGet(LS_DEPT) ?? '');
  $(val('f-first') ? 'f-type' : 'f-first').focus();
}

function addFiles(list: Iterable<File>): void {
  const err = $('e-shots');
  err.textContent = '';
  for (const f of list) {
    const problem = checkScreenshot(f, pending.length);
    if (problem) {
      err.textContent = problem;
      continue;
    }
    pending.push({ file: f, url: URL.createObjectURL(f) });
  }
  drawPreviews();
}

function drawPreviews(): void {
  const p = $('previews');
  p.textContent = '';
  pending.forEach((it, i) => {
    const box = el('div', 'pv');
    const img = el('img');
    img.src = it.url;
    img.alt = `Selected screenshot ${i + 1}`;
    const x = el('button', null, '×');
    x.type = 'button';
    x.setAttribute('aria-label', `Remove screenshot ${i + 1}`);
    x.addEventListener('click', () => {
      URL.revokeObjectURL(it.url);
      pending.splice(i, 1);
      $('e-shots').textContent = '';
      drawPreviews();
    });
    box.append(img, x);
    p.appendChild(box);
  });
}

function clearPending(): void {
  for (const p of pending) URL.revokeObjectURL(p.url);
  pending = [];
  drawPreviews();
}

function showErrors(errors: Partial<Record<FormField, string>>): HTMLElement | null {
  let first: HTMLElement | null = null;
  for (const f of FIELDS) {
    const msg = errors[f.key] ?? '';
    $(`e-${f.key}`).textContent = msg;
    const input = $(f.input);
    if (msg) {
      input.setAttribute('aria-invalid', 'true');
      first ??= input;
    } else {
      input.removeAttribute('aria-invalid');
    }
  }
  return first;
}

async function onSubmit(e: SubmitEvent): Promise<void> {
  e.preventDefault();
  const msg = $('formMsg');
  const checked = validateForm({
    first_name: val('f-first'),
    last_name: val('f-last'),
    department: val('f-dept'),
    type: val('f-type'),
    link: val('f-link'),
    description: val('f-desc'),
  });
  const firstBad = showErrors(checked.errors);
  if (!checked.ok || !checked.clean) {
    msg.textContent = 'Fix the highlighted fields.';
    firstBad?.focus();
    return;
  }

  const btn = $<HTMLButtonElement>('submitBtn');
  btn.disabled = true;
  try {
    await submitItem(checked.clean, pending.map((p) => p.file), (m) => {
      msg.textContent = m;
    });
    lsSet(LS_FIRST, checked.clean.first_name);
    lsSet(LS_LAST, checked.clean.last_name);
    lsSet(LS_DEPT, checked.clean.department);
    clearPending();
    setVal('f-type', '');
    setVal('f-link', '');
    setVal('f-desc', '');
    msg.textContent = 'Submitted. Thanks!';
    setTimeout(() => {
      if (msg.textContent === 'Submitted. Thanks!') msg.textContent = '';
    }, 4000);
    requestRender();
  } catch (err) {
    msg.textContent = friendly(
      err,
      "Your account can't submit to this board. Sign in with your World Emblem email.",
      'Could not submit. Try again.',
    );
  }
  btn.disabled = false;
}

export function resetForm(): void {
  form().reset();
  clearPending();
  showErrors({});
  $('e-shots').textContent = '';
  $('formMsg').textContent = '';
  openForm(false);
}

export function initForm(): void {
  $('toggleForm').addEventListener('click', () => openForm(form().hidden !== false));
  $('cancelBtn').addEventListener('click', () => openForm(false));
  form().addEventListener('submit', (e) => void onSubmit(e));

  const input = $<HTMLInputElement>('f-shots');
  input.addEventListener('change', () => {
    if (input.files) addFiles(input.files);
    input.value = '';
  });

  const drop = $('drop');
  for (const t of ['dragenter', 'dragover']) {
    drop.addEventListener(t, (e) => {
      e.preventDefault();
      drop.classList.add('over');
    });
  }
  for (const t of ['dragleave', 'drop']) {
    drop.addEventListener(t, (e) => {
      e.preventDefault();
      drop.classList.remove('over');
    });
  }
  drop.addEventListener('drop', (e) => {
    if (e.dataTransfer) addFiles(e.dataTransfer.files);
  });

  document.addEventListener('paste', (e) => {
    if (form().hidden || !e.clipboardData) return;
    const files: File[] = [];
    for (const it of e.clipboardData.items) {
      if (it.kind === 'file') {
        const f = it.getAsFile();
        if (f) files.push(f);
      }
    }
    if (files.length) {
      e.preventDefault();
      addFiles(files);
    }
  });
}
