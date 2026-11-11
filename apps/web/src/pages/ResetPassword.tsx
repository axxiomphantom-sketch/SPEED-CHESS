import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { AuthShell } from '../components/AuthShell';
import { Alert, Button, Field } from '../components/ui';

export function ResetPassword() {
  const [params] = useSearchParams();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const token = params.get('token') ?? '';

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    if (password !== confirm) { setError('The two passwords do not match.'); return; }
    setLoading(true);
    try {
      await api.post('/auth/reset-password', { token, password });
      setDone(true);
      setTimeout(() => navigate('/login'), 1800);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reset your password.');
    } finally { setLoading(false); }
  };

  return (
    <AuthShell title="Choose a new password" subtitle="For your security, all other sessions will be signed out.">
      {!token ? <Alert tone="error">This link is missing its reset token. Request a new link from the sign-in page.</Alert>
        : done ? <Alert tone="success">Password updated. Taking you to sign in…</Alert>
        : (
          <form onSubmit={submit} noValidate>
            {error && <div className="form-error" role="alert">{error}</div>}
            <Field label="New password" htmlFor="new-password" hint="At least 8 characters with a letter and a number.">
              <input id="new-password" className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" required />
            </Field>
            <Field label="Confirm new password" htmlFor="confirm-password">
              <input id="confirm-password" className="input" type="password" value={confirm} onChange={e => setConfirm(e.target.value)} autoComplete="new-password" required />
            </Field>
            <Button type="submit" block loading={loading}>Update password</Button>
          </form>
        )}
      <div className="mt-2 small"><Link to="/login">Back to sign in</Link></div>
    </AuthShell>
  );
}
