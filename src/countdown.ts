// "New Era Launching in X days Y hours Z minutes W seconds", live every
// second, then "New Era Launched".

import { countdown } from './core';
import { $, el } from './dom';

/** One number with its unit, e.g. "17 days"; hours, minutes, and seconds use two digits. */
function part(n: number, one: string, twoDigits: boolean): HTMLElement {
  const span = el('span', 'cd-part');
  span.append(
    el('span', 'cd-n', twoDigits ? String(n).padStart(2, '0') : String(n)),
    ' ', // the flex gap does the visual spacing; this space is for copying and screen readers
    el('span', 'cd-u', n === 1 ? one : `${one}s`),
  );
  return span;
}

function tick(): boolean {
  const c = countdown(Date.now());
  const time = $('cdTime');
  if (c.launched) {
    $('cdLead').textContent = 'New Era';
    time.replaceChildren(el('span', 'cd-done', 'Launched'));
    return false;
  }
  // Spaces between parts keep the sentence readable when copied or read aloud.
  time.replaceChildren(
    part(c.days, 'day', false), ' ',
    part(c.hours, 'hour', true), ' ',
    part(c.minutes, 'minute', true), ' ',
    part(c.seconds, 'second', true),
  );
  return true;
}

/** Ticks just after each whole second so the seconds never skip. */
function schedule(): void {
  setTimeout(() => {
    if (tick()) schedule();
  }, 1000 - (Date.now() % 1000) + 10);
}

export function startCountdown(): void {
  if (tick()) schedule();
}
