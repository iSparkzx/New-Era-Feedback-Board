// Starts the page: loads the Rust core, then shows either the team-code
// screen or the board, depending on what the database says this browser's
// session may do.

import './styles.css';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { closeAdminForm, initAccess, joining, resetCodeScreen, updateAdminUi } from './access';
import { loadCore } from './core';
import { initCopy } from './copy';
import { startCountdown } from './countdown';
import { checkAllowed, loadAll, resync, subscribe, unsubscribe } from './data';
import { $, banner } from './dom';
import { closeDrawer, drawerOpen, initDrawer } from './drawer';
import { friendly } from './errors';
import { initForm, resetForm } from './form';
import { initLightbox } from './lightbox';
import { refreshShots, render } from './render';
import { clearSigned } from './screenshots';
import { resetState, setRenderHook, st } from './state';
import { configured, sb } from './supabase';

type Screen = 'code' | 'board';

function show(screen: Screen): void {
  $('codeScreen').hidden = screen !== 'code';
  $('board').hidden = screen !== 'board';
  $('lede').hidden = screen !== 'board';
  $('toggleForm').hidden = screen !== 'board';
  $('acct').hidden = screen !== 'board';
  if (screen === 'code') $('tc-code').focus();
}

function teardown(): void {
  unsubscribe();
  if (drawerOpen()) closeDrawer();
  resetForm();
  closeAdminForm();
  resetState();
  clearSigned();
  resetCodeScreen();
  banner('');
  $<HTMLButtonElement>('toggleForm').disabled = true;
}

let seq = 0;

/** Opens the board if this session has entered the team code; otherwise asks for it. */
async function openBoard(): Promise<void> {
  const mine = ++seq;
  try {
    const allowed = await checkAllowed();
    if (mine !== seq) return;
    if (!allowed) {
      show('code');
      return;
    }
    show('board');
    render();
    subscribe(render, (msg) => banner(msg));
    await loadAll();
    if (mine !== seq) return;
    $<HTMLButtonElement>('toggleForm').disabled = false;
    updateAdminUi();
    render();
  } catch (err) {
    if (mine !== seq) return;
    show('code');
    banner(friendly(err, 'Enter the team code again.', 'Could not load the board. Reload the page to try again.'));
  }
}

async function onAuth(event: AuthChangeEvent, session: Session | null): Promise<void> {
  if (event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') return;
  const uid = session?.user.id ?? '';
  if (uid && uid === st.uid) return; // same session, nothing to redo
  if (joining && uid) {
    // A session made while checking a team code; the code form opens the board itself.
    st.uid = uid;
    return;
  }
  seq++;
  teardown();
  if (!session) {
    show('code');
    return;
  }
  st.uid = uid;
  await openBoard();
}

function initFilters(): void {
  $('showAll').addEventListener('click', () => {
    st.filter.status = '';
    render();
  });
  $<HTMLSelectElement>('fd').addEventListener('change', (e) => {
    st.filter.dept = (e.target as HTMLSelectElement).value;
    render();
  });
  $<HTMLSelectElement>('ft').addEventListener('change', (e) => {
    st.filter.type = (e.target as HTMLSelectElement).value;
    render();
  });
  $<HTMLInputElement>('q').addEventListener('input', (e) => {
    st.filter.q = (e.target as HTMLInputElement).value;
    render();
  });
}

async function boot(): Promise<void> {
  initLightbox();
  initDrawer();
  initForm();
  initCopy();
  initFilters();
  initAccess({
    onJoined: () => void openBoard(),
    onAdminChange: () => render(),
  });
  setRenderHook(render);

  try {
    await loadCore();
  } catch (err) {
    console.error(err);
    banner("The page couldn't start. Reload to try again.");
    return;
  }
  startCountdown();

  if (!configured) {
    show('code');
    $<HTMLButtonElement>('tc-btn').disabled = true;
    banner("This board isn't connected to its database yet.");
    return;
  }

  window.addEventListener('offline', () => banner("You're offline. The board will catch up when you reconnect."));
  window.addEventListener('online', () => {
    banner('');
    if (st.loaded) resync().then(render, () => {});
  });
  // The live connection can drop changes without saying so, so catch up whenever the tab comes back.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && st.loaded) resync().then(render, () => {});
  });
  setInterval(refreshShots, 5 * 60 * 1000);

  // Supabase asks that no Supabase calls run inside this callback, so defer the work.
  sb().auth.onAuthStateChange((event, session) => {
    setTimeout(() => void onAuth(event, session), 0);
  });
}

void boot();
