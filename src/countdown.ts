// "Launching in X days Y hours", then "Launched". Updates every 30 seconds.

import { countdown } from './core';
import { $, el } from './dom';

function tick(): void {
  const c = countdown(Date.now());
  const main = $('cdMain');
  if (c.launched) {
    main.textContent = 'Launched';
    return;
  }
  main.textContent = 'Launching in ';
  main.append(el('b', null, String(c.days)), c.days === 1 ? ' day ' : ' days ');
  main.append(el('b', null, String(c.hours)), c.hours === 1 ? ' hour' : ' hours');
}

export function startCountdown(): void {
  tick();
  setInterval(tick, 30_000);
}
