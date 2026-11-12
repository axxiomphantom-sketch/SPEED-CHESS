import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import {
  isSupabaseConfigured, resendVerification, syncLocalAccount, verifyEmailToken,
} from '../lib/supabaseAuth';
import { AuthShell } from '../components/AuthShell';
import { Alert, Button, Field } from '../components/ui';

/**
 * Email verification landing page.
 *
 * Supports both link shapes:
 *   /verify-email?token_hash=...&type=signup   (Supabase, recommended — works on any origin)
 *   /verify-email?token=...                    (legacy local accounts)
 *
 * With `token_hash`, the browser calls `supabase.auth.verifyOtp`, which creates the session. The
 * server then provisions the chess profile via `/auth/supabase/sync`, so a freshly verified player
 * lands on a working dashboard rather than an empty shell.
 */
export function VerifyEmail() {
  const [params] = useSearchParams();
  const { refresh } = useAuth();
  const [state, setState] = useState<'idle' | 'working' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState(params.get('email') ?? '');
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState('');

  const tokenHash = params.get('token_hash');
  const legacyToken = params.get('token');
  const otpType = (params.get('type') ?? 'signup') as 'signup' | 'recovery' | 'email_change' | 'invite' | 'magiclink' | 'email';

  useEffect(() => {
    if (!tokenHash && !legacyToken) {
      // No token: this is the "resend the link" view, not an error.
      setState('idle');
      return;
    }

    let cancelled = false;
    setState('working');

    const run = async () => {
      if (tokenHash) {
        const result = await verifyEmailToken(tokenHash, otpType);
        if (cancelled) return;
        if (!result.ok) { setState('error'); setMessage(result.message); return; }
        // Provision the local chess account and session so the dashboard is usable immediately.
        const synced = await syncLocalAccount();
        if (cancelled) return;
        await refresh();
        if (!synced.ok) {
          setState('done');
          setMessage('Your email address is verified. Sign in to finish setting up your account.');
          return;
        }
        setState('done');
        setMessage('Your email address is verified. Your account is ready.');
        return;
      }

      try {
        await api.post('/auth/verify-email', { token: legacyToken });
        if (cancelled) return;
        setState('done');
        setMessage('Your email address is verified.');
      } catch (err) {
        if (cancelled) return;
        setState('error');
        setMessage(err instanceof ApiError ? err.message : 'Verification failed.');
      }
    };

    void run();
    return () => { cancelled = true; };
  }, [tokenHash, legacyToken, otpType, refresh]);

  const resend = useCallback(async () => {
    setResent('');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setResent('Enter the email address you registered with.'); return; }
    setResending(true);
    try {
      const result = await resendVerification(email);
      setResent(result.ok ? (result.message ?? 'A new link is on its way.') : result.message);
    } finally {
      setResending(false);
    }
  }, [email]);

  const resendBlock = (
    <div className="mt-2">
      <Field label="Resend the confirmation link" htmlFor="verify-email-address">
        <input
          id="verify-email-address"
          className="input"
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="you@example.com"
          autoComplete="email"
        />
      </Field>
      <Button type="button" variant="secondary" block loading={resending} onClick={resend}>
        Send a new link
      </Button>
      {resent && <p className="small muted" style={{ marginTop: 10 }} role="status">{resent}</p>}
    </div>
  );

  return (
    <AuthShell title="Email verification" subtitle="Confirm your address to unlock your dashboard.">
      {state === 'working' && <Alert tone="info">Verifying your email…</Alert>}
      {state === 'done' && <Alert tone="success">{message}</Alert>}
      {state === 'error' && <Alert tone="error">{message}</Alert>}
      {state === 'idle' && (
        <Alert tone="info" title="Check your inbox">
          Open the confirmation link we emailed you. Nothing arrived? Send a fresh one below.
        </Alert>
      )}

      {state === 'done' ? (
        <div className="mt-2">
          <Link to="/dashboard" className="btn btn-primary btn-block">Go to dashboard</Link>
        </div>
      ) : isSupabaseConfigured && state !== 'working' ? (
        resendBlock
      ) : null}

      <div className="mt-2 small"><Link to="/login">Back to sign in</Link></div>
    </AuthShell>
  );
}
