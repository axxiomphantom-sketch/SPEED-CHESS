import { requireSupabaseBrowserClient, isSupabaseConfigured, SupabaseNotConfiguredError } from '../utils/supabase/client';
import { api, ApiError } from './api';

/**
 * Supabase Auth calls used by the SPEED CHESS screens.
 *
 * Every function here returns either `{ ok: true }` or `{ ok: false, message }` with a message that
 * is safe to show a player. Supabase's raw errors are mapped rather than dumped: "Invalid login
 * credentials" is friendly, "AuthApiError: Invalid login credentials at _request" is not.
 */

export { isSupabaseConfigured, SupabaseNotConfiguredError };

export type AuthResult =
  | { ok: true; message?: string; needsVerification?: boolean }
  | { ok: false; message: string; needsVerification?: boolean };

/** Where Supabase should send the player after they click an email link. */
function appUrl(path: string): string {
  // Use the origin the app is actually running on so local dev, the Arena preview and production
  // all work without hardcoding a hostname.
  const base = typeof window !== 'undefined' ? window.location.origin : '';
  return `${base}${path}`;
}

/** Maps Supabase/GoTrue errors onto plain language. */
function friendly(error: { message?: string; status?: number; code?: string } | null | undefined): string {
  const message = (error?.message ?? '').toLowerCase();
  const code = (error?.code ?? '').toLowerCase();

  if (code === 'invalid_credentials' || message.includes('invalid login credentials')) {
    return 'That email and password combination is not correct. Check your details and try again.';
  }
  if (code === 'email_not_confirmed' || message.includes('email not confirmed')) {
    return 'Please verify your email address first. Check your inbox for the confirmation link.';
  }
  if (message.includes('already registered') || message.includes('user already exists')) {
    return 'An account with that email address already exists. Try signing in instead.';
  }
  if (message.includes('password should be at least')) {
    return 'Your password is too short. Choose at least 10 characters.';
  }
  if (message.includes('rate limit') || (error?.status ?? 0) === 429) {
    return 'Too many attempts. Please wait a minute and try again.';
  }
  if (message.includes('unable to validate email') || message.includes('invalid email')) {
    return 'That email address does not look valid.';
  }
  if (message.includes('same password')) {
    return 'Your new password must be different from your current one.';
  }
  if (message.includes('token has expired') || message.includes('invalid token') || message.includes('otp_expired')) {
    return 'That link has expired or has already been used. Request a new one.';
  }
  if (message.includes('signups not allowed')) {
    return 'New registrations are currently disabled on this project.';
  }
  return error?.message ? `Sign-in failed: ${error.message}` : 'Something went wrong. Please try again.';
}

/**
 * Creates the account in Supabase and stores the username in user metadata.
 *
 * `emailRedirectTo` points at the app's own /verify-email page with a `token_hash` placeholder.
 * Supabase replaces `{{ .TokenHash }}` in the email template, so the link works on whatever origin
 * it is opened from — local, preview or production — without per-environment redirect allow-lists.
 */
export async function signUpWithSupabase(input: {
  username: string;
  email: string;
  password: string;
  country?: string;
}): Promise<AuthResult> {
  if (!isSupabaseConfigured) {
    return { ok: false, message: new SupabaseNotConfiguredError().message };
  }
  const supabase = requireSupabaseBrowserClient();
  const { data, error } = await supabase.auth.signUp({
    email: input.email.trim(),
    password: input.password,
    options: {
      emailRedirectTo: appUrl('/verify-email'),
      data: {
        username: input.username.trim(),
        country: input.country ?? null,
        // Recorded so the profile trigger can display intent even before the username is editable.
        display_name: input.username.trim(),
      },
    },
  });

  if (error) return { ok: false, message: friendly(error) };

  // Supabase returns a user with an empty identities array when the email is already registered
  // and "confirm email" is on. That is a duplicate registration, not a success.
  if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    return { ok: false, message: 'An account with that email address already exists. Try signing in instead.' };
  }

  // If email confirmation is disabled the session exists immediately; otherwise the player must
  // confirm first. Either way the UI shows the "check your inbox" screen.
  return { ok: true, needsVerification: !data.session };
}

/**
 * Signs in and then provisions the local chess profile through the API.
 *
 * The browser session alone is not enough: the Express API needs its own session cookie, and the
 * `users` row that owns ratings/games must exist. `/api/auth/supabase/sync` does both, after
 * verifying the Supabase token server-side with `getClaims()`.
 */
export async function signInWithSupabase(email: string, password: string): Promise<AuthResult> {
  if (!isSupabaseConfigured) {
    return { ok: false, message: new SupabaseNotConfiguredError().message };
  }
  const supabase = requireSupabaseBrowserClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });

  if (error) return { ok: false, message: friendly(error) };

  if (data.user && !data.user.email_confirmed_at && !(data.user as { confirmed_at?: string }).confirmed_at) {
    await supabase.auth.signOut();
    return {
      ok: false,
      needsVerification: true,
      message: 'Please verify your email address before signing in. Check your inbox for the confirmation link.',
    };
  }

  return syncLocalAccount();
}

/**
 * Starts the Google OAuth flow.
 *
 * `redirectTo` must be listed in Supabase → Authentication → URL Configuration → Redirect URLs.
 * With PKCE (the default for `@supabase/ssr`) the flow returns to this app with `?code=…`, which
 * `completeOAuthFromUrl` exchanges for a session.
 */
export async function signInWithGoogle(): Promise<AuthResult> {
  if (!isSupabaseConfigured) {
    return { ok: false, message: new SupabaseNotConfiguredError().message };
  }
  const supabase = requireSupabaseBrowserClient();
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: appUrl('/auth/callback'),
      // Ask Google for the basics only; the username comes from metadata on first sign-in.
      queryParams: { prompt: 'select_account' },
    },
  });
  // On success the browser is already navigating to Google, so a success value never arrives.
  if (error) return { ok: false, message: friendly(error) };
  return { ok: true };
}

/**
 * Finishes an OAuth redirect: exchanges the `?code=` for a session, then provisions the local
 * chess account. Returns `{ ok: true }` when the player is fully signed in.
 */
export async function completeOAuthFromUrl(): Promise<AuthResult & { notStarted?: boolean }> {
  if (!isSupabaseConfigured) {
    return { ok: false, message: new SupabaseNotConfiguredError().message };
  }
  const supabase = requireSupabaseBrowserClient();
  const url = new URL(window.location.href);
  const code = url.searchParams.get('code');
  const errorDescription = url.searchParams.get('error_description') ?? url.searchParams.get('error');

  if (errorDescription) {
    return { ok: false, message: `Google sign-in was cancelled or refused (${errorDescription}).` };
  }
  if (!code) {
    // Also handles the implicit flow, where the SDK has already parsed the URL fragment.
    const { data } = await supabase.auth.getSession();
    if (!data.session) return { ok: false, message: 'This sign-in link is missing its code.', notStarted: true };
  } else {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return { ok: false, message: friendly(error) };
  }

  const synced = await syncLocalAccount();
  if (!synced.ok) return synced;
  return { ok: true };
}

/** Provisions/refreshes the local account and session cookie. Safe to call repeatedly. */
export async function syncLocalAccount(): Promise<AuthResult> {
  try {
    await api.post('/auth/supabase/sync');
    return { ok: true };
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.status === 403) return { ok: false, message: err.message, needsVerification: true };
      if (err.status === 503) {
        return { ok: false, message: 'This deployment has not been connected to Supabase yet. Contact the administrator.' };
      }
      return { ok: false, message: err.message };
    }
    return { ok: false, message: 'We could not finish signing you in. Please try again.' };
  }
}

/** Sends the password-reset email. Always reports success so accounts cannot be enumerated. */
export async function sendPasswordReset(email: string): Promise<AuthResult> {
  if (!isSupabaseConfigured) {
    return { ok: false, message: new SupabaseNotConfiguredError().message };
  }
  const supabase = requireSupabaseBrowserClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: appUrl('/reset-password'),
  });
  // Rate limiting is the one error worth surfacing; anything account-related stays silent.
  if (error) {
    const message = friendly(error);
    if (message.includes('Too many attempts')) return { ok: false, message };
    return {
      ok: true,
      message: 'If an account exists for that address, a reset link is on its way. Check your inbox and spam folder.',
    };
  }
  return {
    ok: true,
    message: 'If an account exists for that address, a reset link is on its way. Check your inbox and spam folder.',
  };
}

/** Applies a new password using the recovery session created by the emailed link. */
export async function updatePassword(newPassword: string): Promise<AuthResult> {
  if (!isSupabaseConfigured) {
    return { ok: false, message: new SupabaseNotConfiguredError().message };
  }
  const supabase = requireSupabaseBrowserClient();
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) return { ok: false, message: friendly(error) };
  return { ok: true, message: 'Your password has been updated. You can sign in with it now.' };
}

/** Resends the confirmation email. */
export async function resendVerification(email: string): Promise<AuthResult> {
  if (!isSupabaseConfigured) {
    return { ok: false, message: new SupabaseNotConfiguredError().message };
  }
  const supabase = requireSupabaseBrowserClient();
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email: email.trim(),
    options: { emailRedirectTo: appUrl('/verify-email') },
  });
  if (error) return { ok: false, message: friendly(error) };
  return { ok: true, message: 'A new confirmation link is on its way. Check your inbox and spam folder.' };
}

/**
 * Confirms an email address from a `token_hash` link.
 * `type` must match the template that produced the link (signup, recovery, email_change, invite).
 */
export async function verifyEmailToken(tokenHash: string, type: 'signup' | 'recovery' | 'email_change' | 'invite' | 'magiclink' | 'email' = 'signup'): Promise<AuthResult> {
  if (!isSupabaseConfigured) {
    return { ok: false, message: new SupabaseNotConfiguredError().message };
  }
  const supabase = requireSupabaseBrowserClient();
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
  if (error) return { ok: false, message: friendly(error) };
  return { ok: true };
}

/** Signs out of Supabase and clears the SPEED CHESS session. Safe to call when only one exists. */
export async function signOutEverywhere(): Promise<void> {
  try {
    const supabase = isSupabaseConfigured ? requireSupabaseBrowserClient() : null;
    await supabase?.auth.signOut();
  } catch {
    // A failed Supabase sign-out must not keep the local session alive.
  }
  await api.post('/auth/logout').catch(() => {});
}

/** Current Supabase session details, used by the verify-email screen to show the address. */
export async function currentSupabaseUser() {
  if (!isSupabaseConfigured) return null;
  const supabase = requireSupabaseBrowserClient();
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}
