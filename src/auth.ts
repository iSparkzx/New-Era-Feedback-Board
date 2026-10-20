// Sign-in screen (email link), sign-out, and errors coming back from the link.

import { looksLikeEmail } from './core';
import { $ } from './dom';
import { OFFLINE } from './errors';
import { sb } from './supabase';

/** Where the email link sends people back to: this page. */
const redirectUrl = (): string => `${location.origin}${import.meta.env.BASE_URL}`;

/** Removes sign-in tokens or errors from the address bar. */
export function cleanUrl(): void {
  if (location.hash || location.search) history.replaceState(null, '', location.pathname);
}

/**
 * If the page was opened from a sign-in link that failed, returns a message
 * for the person and cleans the address bar. Successful links are left for
 * Supabase to read.
 */
export function takeLinkError(): string {
  const hash = new URLSearchParams(location.hash.replace(/^#/, ''));
  const query = new URLSearchParams(location.search);
  const code = hash.get('error_code') ?? query.get('error_code') ?? hash.get('error') ?? query.get('error');
  if (!code) return '';
  cleanUrl();
  return code === 'otp_expired'
    ? 'That sign-in link has expired or was already used. Send yourself a new one.'
    : "That sign-in link didn't work. Send yourself a new one.";
}

function sendError(error: { status?: number; code?: string; message?: string }): string {
  if (!navigator.onLine || /failed to fetch|network/i.test(error.message ?? '')) return OFFLINE;
  if (error.status === 429 || error.code === 'over_email_send_rate_limit') {
    return 'Too many sign-in emails were sent. Wait a few minutes and try again.';
  }
  if (error.code === 'email_address_not_authorized') {
    return "Sign-in emails can't be sent to this address yet. Tell Carlos Mitchell.";
  }
  if (error.code === 'signup_disabled') return "New sign-ins are turned off right now. Tell Carlos Mitchell.";
  return "Couldn't send the sign-in link. Try again.";
}

async function sendLink(e: SubmitEvent): Promise<void> {
  e.preventDefault();
  const input = $<HTMLInputElement>('si-email');
  const err = $('e-email');
  const msg = $('si-msg');
  const btn = $<HTMLButtonElement>('si-btn');
  const email = input.value.trim().toLowerCase();

  if (!looksLikeEmail(email)) {
    err.textContent = 'Enter your work email.';
    input.setAttribute('aria-invalid', 'true');
    input.focus();
    return;
  }
  err.textContent = '';
  input.removeAttribute('aria-invalid');
  btn.disabled = true;
  msg.textContent = 'Sending…';

  const { error } = await sb().auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectUrl(), shouldCreateUser: true },
  });
  btn.disabled = false;
  msg.textContent = '';
  if (error) {
    console.error(error);
    msg.textContent = sendError(error);
    return;
  }
  $('sentTo').textContent = email;
  $('signinStart').hidden = true;
  $('signinSent').hidden = false;
}

export async function signOut(): Promise<void> {
  // Local scope: sign out of this browser only, not every device.
  const { error } = await sb().auth.signOut({ scope: 'local' });
  if (error) console.error(error);
}

export function resetSignIn(): void {
  $('signinStart').hidden = false;
  $('signinSent').hidden = true;
  $('si-msg').textContent = '';
}

export function initSignIn(): void {
  $<HTMLFormElement>('signinForm').addEventListener('submit', (e) => void sendLink(e));
  $('si-again').addEventListener('click', () => {
    resetSignIn();
    $('si-email').focus();
  });
  $('signOut').addEventListener('click', () => void signOut());
  $('naSignOut').addEventListener('click', () => void signOut());
}
