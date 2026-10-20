// Team code and admin code. Visitors get a silent Supabase session (no
// email); the database decides what that session may do once a code is
// accepted (see supabase/migrations/002_team_code.sql).

import { $ } from './dom';
import { OFFLINE } from './errors';
import { st } from './state';
import { sb } from './supabase';

type CodeResult = 'ok' | 'wrong' | 'too_many' | 'not_set' | 'no_session';

interface Hooks {
  /** The team code was accepted; open the board. */
  onJoined: () => void;
  /** Admin tools were turned on or off. */
  onAdminChange: () => void;
}

/** True while a team code is being checked, so main.ts can ignore the new-session event. */
export let joining = false;

async function ensureSession(): Promise<void> {
  const { data } = await sb().auth.getSession();
  if (data.session) return;
  const { error } = await sb().auth.signInAnonymously();
  if (error) throw error;
}

async function check(fn: 'join_board' | 'unlock_admin', code: string): Promise<CodeResult> {
  await ensureSession();
  const { data, error } = await sb().rpc(fn, { code });
  if (error) throw error;
  return data as CodeResult;
}

function message(r: CodeResult, wrong: string): string {
  switch (r) {
    case 'wrong':
      return wrong;
    case 'too_many':
      return 'Too many tries. Wait 10 minutes and try again.';
    case 'not_set':
      return "The board isn't set up yet. Tell Carlos Mitchell.";
    default:
      return 'Something went wrong. Try again.';
  }
}

function failMessage(err: unknown): string {
  console.error(err);
  if (!navigator.onLine || /failed to fetch|network/i.test(String((err as Error)?.message ?? ''))) return OFFLINE;
  return 'Something went wrong. Try again.';
}

export function resetCodeScreen(): void {
  $('e-code').textContent = '';
  $('tc-msg').textContent = '';
  $('tc-code').removeAttribute('aria-invalid');
}

/** Shows "Admin tools are on" or the link to turn them on. */
export function updateAdminUi(): void {
  $('adminState').textContent = st.canEdit ? 'Admin tools are on.' : '';
  $('adminToggle').textContent = st.canEdit ? 'Turn off' : 'Admin tools';
  if (st.canEdit) $('adminForm').hidden = true;
}

export function closeAdminForm(): void {
  const f = $<HTMLFormElement>('adminForm');
  f.reset();
  f.hidden = true;
  $('e-admin').textContent = '';
}

export function initAccess(hooks: Hooks): void {
  $<HTMLFormElement>('codeForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = $<HTMLInputElement>('tc-code');
    const err = $('e-code');
    const msg = $('tc-msg');
    const btn = $<HTMLButtonElement>('tc-btn');
    const code = input.value.trim();
    if (!code) {
      err.textContent = 'Enter the team code.';
      input.setAttribute('aria-invalid', 'true');
      input.focus();
      return;
    }
    resetCodeScreen();
    btn.disabled = true;
    msg.textContent = 'Checking…';
    joining = true;
    try {
      const r = await check('join_board', code);
      msg.textContent = '';
      if (r === 'ok') {
        input.value = '';
        hooks.onJoined();
      } else {
        err.textContent = message(r, "That code isn't right. Check it and try again.");
        input.setAttribute('aria-invalid', 'true');
        input.focus();
      }
    } catch (ex) {
      msg.textContent = failMessage(ex);
    } finally {
      joining = false;
      btn.disabled = false;
    }
  });

  $('adminToggle').addEventListener('click', async () => {
    if (st.canEdit) {
      const { error } = await sb().rpc('lock_admin');
      if (error) console.error(error);
      st.canEdit = false;
      updateAdminUi();
      hooks.onAdminChange();
      return;
    }
    const f = $('adminForm');
    f.hidden = !f.hidden;
    if (!f.hidden) $('ad-code').focus();
  });
  $('ad-cancel').addEventListener('click', closeAdminForm);

  $<HTMLFormElement>('adminForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = $<HTMLInputElement>('ad-code');
    const err = $('e-admin');
    const btn = $<HTMLButtonElement>('ad-btn');
    const code = input.value.trim();
    if (!code) {
      err.textContent = 'Enter the admin code.';
      input.focus();
      return;
    }
    err.textContent = '';
    btn.disabled = true;
    try {
      const r = await check('unlock_admin', code);
      if (r === 'ok') {
        closeAdminForm();
        st.canEdit = true;
        updateAdminUi();
        hooks.onAdminChange();
      } else {
        err.textContent = message(r, "That admin code isn't right.");
        input.select();
      }
    } catch (ex) {
      err.textContent = failMessage(ex);
    } finally {
      btn.disabled = false;
    }
  });
}
