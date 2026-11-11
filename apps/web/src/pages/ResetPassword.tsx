import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import {
  currentSupabaseUser, isSupabaseConfigured, sendPasswordReset, updatePassword, verifyEmailToken,
} from '../lib/supabaseAuth';
import { AuthShell } from '../components/AuthShell';
import { Alert, Button, Field } from '../components/ui';

/**
 * Password reset landing page.
 *
 * Two link shapes are supported:
 *   /reset-password?token_hash=...&type=recovery   (Supabase recovery email)
 *   /reset-password?token=...                      (legacy local accounts)
 *
 * The Supabase path verifies the recovery token (which creates a short-lived recovery session) and
 * then calls `updateUser({ password })`. The legacy path posts to the local API as before.
 */
export function ResetPassword() {
  const [params] = useSearchParams();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [linkState, setLinkState] = useState<'checking' | 'ready' | 'invalid'>(isSupabaseConfigured ? 'checking' : 'ready');
  const [linkMessage, setLinkMessage] = useState('');
  const [email, setEmail] = useState('');
  const [requesting, setRequesting] = useState(false);
  const navigate = useNavigate();

  const tokenHash = params.get('token_hash');
  const legacyToken = params.get('token') ?? '';

  // Supabase recovery links either arrive as ?token_hash= (verifyOtp) or as a #access_token
  // fragment parsed by the SDK. Establish which one we have before offering the form.
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let cancelled = false;
    const establish = async () => {
      if (tokenHash) {
        const result = await verifyEmailToken(tokenHash, 'recovery');
        if (cancelled) return;
        if (!result.ok) { setLinkState('invalid'); setLinkMessage(result.message); return; }
        setLinkState('ready');
        return;
      }
      // The SDK picks up an implicit-flow session from the URL fragment automatically.
      const user = await currentSupabaseUser();
      if (cancelled) return;
      if (user) setLinkState('ready');
      else { setLinkState('invalid'); setLinkMessage('This reset link is missing or has expired. Request a new one below.'); }
    };
    void establish();
    return () => { cancelled = true; };
  }, [tokenHash]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    if (password.length < 10) { setError('Choose a password of at least 10 characters.'); return; }
    if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) { setError('Your password needs at least one letter and one number.'); return; }
    if (password !== confirm) { setError('The two passwords do not match.'); return; }
    setLoading(true);
    try {
      if (isSupabaseConfigured) {
        const result = await updatePassword(password);
        if (!result.ok) { setError(result.message); return; }
        setDone(true);
        setTimeout(() => navigate('/login'), 1800);
        return;
      }
      await api.post('/auth/reset-password', { token: legacyToken, password });
      setDone(true);
      setTimeout(() => navigate('/login'), 1800);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reset your password.');
    } finally {
      setLoading(false);
    }
  };

  const requestNewLink = async () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setLinkMessage('Enter your email address first.'); return; }
    setRequesting(true);
    try {
      const result = await sendPasswordReset(email);
      setLinkMessage(result.message ?? 'Check your inbox.');
    } finally {
      setRequesting(false);
    }
  };

  const form = (
    <form onSubmit={submit} noValidate>
      {error && <div className="form-error" role="alert">{error}</div>}
      <Field label="New password" htmlFor="new-password" hint="At least 10 characters, including a letter and a number.">
        <input id="new-password" className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" required minLength={10} />
      </Field>
      <Field label="Confirm new password" htmlFor="confirm-password">
        <input id="confirm-password" className="input" type="password" value={confirm} onChange={e => setConfirm(e.target.value)} autoComplete="new-password" required />
      </Field>
      <Button type="submit" block loading={loading}>Update password</Button>
    </form>
  );

  return (
    <AuthShell title="Choose a new password" subtitle="Your other sessions will be signed out for security.">
      {done ? (
        <Alert tone="success">Password updated. Taking you to sign in…</Alert>
      ) : linkState === 'checking' ? (
        <Alert tone="info">Checking your reset link…</Alert>
      ) : linkState === 'invalid' ? (
        <>
          <Alert tone="error">{linkMessage || 'This reset link is invalid or has expired.'}</Alert>
          <div className="mt-2">
            <Field label="Send me a new link" htmlFor="reset-email">
              <input id="reset-email" className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" />
            </Field>
            <Button type="button" variant="secondary" block loading={requesting} onClick={requestNewLink}>Send reset link</Button>
          </div>
        </>
      ) : !isSupabaseConfigured && !legacyToken ? (
        <Alert tone="error">This link is missing its reset token. Request a new link from the sign-in page.</Alert>
      ) : (
        form
      )}
      <div className="mt-2 small"><Link to="/login">Back to sign in</Link></div>
    </AuthShell>
  );
}
