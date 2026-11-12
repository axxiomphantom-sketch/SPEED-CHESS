import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import {
  isSupabaseConfigured, sendPasswordReset, signInWithSupabase, signOutEverywhere,
} from '../lib/supabaseAuth';
import { AuthShell } from '../components/AuthShell';
import { GoogleButton } from '../components/GoogleButton';
import { Alert, Button, Field } from '../components/ui';

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [busyRecovery, setBusyRecovery] = useState(false);
  const navigate = useNavigate();
  const location = useLocation() as any;
  const { user, refresh } = useAuth();

  useEffect(() => {
    if (user) navigate(location.state?.from ?? '/dashboard', { replace: true });
  }, [user, navigate, location.state]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setInfo('');
    if (!email.trim() || !password) { setError('Enter your email address and password.'); return; }
    setLoading(true);
    try {
      if (isSupabaseConfigured) {
        // Supabase verifies the password; the API then trades that verified session for the
        // SPEED CHESS cookie after checking the token server-side.
        const result = await signInWithSupabase(email, password);
        if (!result.ok) {
          // A half-finished sign-in must not leave a Supabase session behind.
          await signOutEverywhere().catch(() => {});
          if (result.needsVerification) {
            setInfo(result.message);
            setError('');
            return;
          }
          setError(result.message);
          return;
        }
      } else {
        await api.post('/auth/login', { email, password });
      }
      await refresh();
      navigate(location.state?.from ?? '/dashboard', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Sign-in failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const recover = async () => {
    setError('');
    setInfo('');
    if (!email.trim()) { setError('Enter your email address first.'); return; }
    setBusyRecovery(true);
    try {
      if (isSupabaseConfigured) {
        const result = await sendPasswordReset(email);
        if (result.ok) { setInfo(result.message ?? 'Check your inbox for the reset link.'); setRecovering(false); }
        else setError(result.message);
        return;
      }
      const res = await api.post<{ message: string; resetUrl?: string }>('/auth/forgot-password', { email });
      setInfo(res.message + (res.resetUrl ? ` Reset link: ${res.resetUrl}` : ''));
      setRecovering(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not start password recovery.');
    } finally {
      setBusyRecovery(false);
    }
  };

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to continue your games, lessons and training."
      footer={<>New to SPEED CHESS? <Link to="/register" style={{ fontWeight: 600 }}>Create a free account</Link></>}
    >
      {isSupabaseConfigured && (
        <>
          <GoogleButton onError={setError} />
          <div className="row" style={{ gap: 12, margin: '16px 0', alignItems: 'center' }} aria-hidden="true">
            <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            <span className="tiny muted">or use your email</span>
            <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          </div>
        </>
      )}
      <form onSubmit={submit} noValidate>
        {error && <div className="form-error" role="alert">{error}</div>}
        {info && <div className="form-success" role="status" style={{ wordBreak: 'break-word' }}>{info}</div>}
        <Field label={isSupabaseConfigured ? 'Email address' : 'Email or username'} htmlFor="email">
          <input id="email" className="input" type={isSupabaseConfigured ? 'email' : 'text'} autoComplete="username" value={email}
            onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required />
        </Field>
        <Field label="Password" htmlFor="password">
          <input id="password" className="input" type="password" autoComplete="current-password" value={password}
            onChange={e => setPassword(e.target.value)} placeholder="Your password" required />
        </Field>
        <div className="row-between" style={{ marginBottom: 16 }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRecovering(v => !v)}>
            Forgot password?
          </button>
          {recovering && <Button size="sm" variant="outline" type="button" loading={busyRecovery} onClick={recover}>Send reset link</Button>}
        </div>
        <Button type="submit" block loading={loading} size="lg">Sign in</Button>
      </form>
      <Alert tone="info">
        <strong style={{ display: 'block' }}>Demo accounts (seeded)</strong>
        player: demo@speedchess.local / DemoPlayer123 · admin: admin@speedchess.local / AdminSpeed123
      </Alert>
    </AuthShell>
  );
}
