// Starts the page: loads the Rust core, follows sign-in state, and switches
// between the sign-in screen, the "not allowed" screen, and the board.

import './styles.css';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { cleanUrl, initSignIn, resetSignIn, takeLinkError } from './auth';
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

type Screen = 'signin' | 'notAllowed' | 'board';

function show(screen: Screen): void {
  $('signin').hidden = screen !== 'signin';
  $('notAllowed').hidden = screen !== 'notAllowed';
  $('board').hidden = screen !== 'board';
  $('lede').hidden = screen !== 'board';
  $('toggleForm').hidden = screen !== 'board';
  $('acct').hidden = screen === 'signin';
  $('whoami').textContent = st.email ? `Signed in as ${st.email} ·` : '';
}

function teardown(): void {
  unsubscribe();
  if (drawerOpen()) closeDrawer();
  resetForm();
  resetState();
  clearSigned();
  resetSignIn();
  banner('');
  $<HTMLButtonElement>('toggleForm').disabled = true;
}

let linkError = '';
let seq = 0;

async function onAuth(event: AuthChangeEvent, session: Session | null): Promise<void> {
  const uid = session?.user.id ?? '';
  if (event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') return;
  if (uid && uid === st.uid) return; // same person, nothing to redo
  const mine = ++seq;
  teardown();

  if (!session) {
    show('signin');
    if (linkError) banner(linkError);
    linkError = '';
    return;
  }

  cleanUrl();
  st.uid = uid;
  st.email = session.user.email ?? '';
  try {
    const allowed = await checkAllowed();
    if (mine !== seq) return;
    if (!allowed) {
      $('naEmail').textContent = st.email;
      show('notAllowed');
      return;
    }
    show('board');
    render();
    subscribe(render, (msg) => banner(msg));
    await loadAll();
    if (mine !== seq) return;
    $<HTMLButtonElement>('toggleForm').disabled = false;
    render();
  } catch (err) {
    if (mine !== seq) return;
    show('board');
    banner(friendly(err, "Your account can't open this board.", 'Could not load the board. Reload the page to try again.'));
  }
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
  initSignIn();
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
    show('signin');
    $<HTMLButtonElement>('si-btn').disabled = true;
    banner("This board isn't connected to its database yet.");
    return;
  }

  window.addEventListener('offline', () => banner("You're offline. The board will catch up when you reconnect."));
  window.addEventListener('online', () => {
    banner('');
    if (st.loaded) resync().then(render, () => {});
  });
  setInterval(refreshShots, 5 * 60 * 1000);

  linkError = takeLinkError();
  // Supabase asks that no Supabase calls run inside this callback, so defer the work.
  sb().auth.onAuthStateChange((event, session) => {
    setTimeout(() => void onAuth(event, session), 0);
  });
}

void boot();
