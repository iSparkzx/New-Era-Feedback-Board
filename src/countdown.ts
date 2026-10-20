// "New Era Launching in X days Y hours Z minutes W seconds", live every
// second, then "New Era Launched".

import { countdown } from './core';
import { $, el } from './dom';

/** "17 days" as one unbreakable piece; minutes and seconds use two digits so the line doesn't shift. */
function part(n: number, one: string, twoDigits: boolean): HTMLElement {
  const span = el('span', 'cd-part');
  span.append(el('b', null, twoDigits ? String(n).padStart(2, '0') : String(n)), n === 1 ? ` ${one}` : ` ${one}s`);
  return span;
}

function tick(): boolean {
  const c = countdown(Date.now());
  const main = $('cdMain');
  if (c.launched) {
    main.textContent = 'New Era Launched';
    return false;
  }
  main.textContent = 'New Era Launching in ';
  main.append(
    part(c.days, 'day', false), ' ',
    part(c.hours, 'hour', false), ' ',
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
