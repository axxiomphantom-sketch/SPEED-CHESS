import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { AuthShell } from '../components/AuthShell';
import { Alert, Button, Field } from '../components/ui';

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const navigate = useNavigate();
  const location = useLocation() as any;
  const { user, refresh } = useAuth();

  useEffect(() => {
    if (user) navigate(location.state?.from ?? '/dashboard', { replace: true });
  }, [user, navigate, location.state]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.post('/auth/login', { email, password });
      await refresh();
      navigate(location.state?.from ?? '/dashboard');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Sign-in failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const recover = async () => {
    setError('');
    setInfo('');
    if (!email) { setError('Enter your email address first.'); return; }
    try {
      const res = await api.post<{ message: string; resetUrl?: string }>('/auth/forgot-password', { email });
      setInfo(res.message + (res.resetUrl ? ` Reset link: ${res.resetUrl}` : ''));
      setRecovering(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not start password recovery.');
    }
  };

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to continue your games, lessons and training."
      footer={<>New to SPEED CHESS? <Link to="/register" style={{ fontWeight: 600 }}>Create a free account</Link></>}
    >
      <form onSubmit={submit} noValidate>
        {error && <div className="form-error" role="alert">{error}</div>}
        {info && <div className="form-success" role="status" style={{ wordBreak: 'break-word' }}>{info}</div>}
        <Field label="Email or username" htmlFor="email">
          <input id="email" className="input" autoComplete="username" value={email}
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
          {recovering && <Button size="sm" variant="outline" type="button" onClick={recover}>Send reset link</Button>}
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
