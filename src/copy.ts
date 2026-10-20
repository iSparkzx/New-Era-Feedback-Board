// "Copy shown items as text", grouped by section.

import { copyText } from './core';
import { $ } from './dom';
import { itemList, st } from './state';

function fallbackCopy(text: string): boolean {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  Object.assign(ta.style, { position: 'fixed', top: '0', left: '0', width: '1px', height: '1px' });
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  document.body.removeChild(ta);
  return ok;
}

async function copyShown(): Promise<void> {
  const text = copyText(itemList(), st.statuses, st.filter);
  let ok: boolean;
  try {
    await navigator.clipboard.writeText(text);
    ok = true;
  } catch {
    ok = fallbackCopy(text);
  }
  const msg = $('copyMsg');
  msg.textContent = ok ? 'Copied.' : 'Copy blocked here.';
  setTimeout(() => {
    msg.textContent = '';
  }, 3000);
}

export function initCopy(): void {
  $('copyBtn').addEventListener('click', () => void copyShown());
}
