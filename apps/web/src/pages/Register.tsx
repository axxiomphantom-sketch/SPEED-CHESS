import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { AuthShell } from '../components/AuthShell';
import { Button, Field } from '../components/ui';

const COUNTRIES = ['NG', 'GH', 'KE', 'ZA', 'EG', 'GB', 'US', 'CA', 'DE', 'FR', 'ES', 'IT', 'NL', 'PL', 'UA', 'RU', 'IN', 'BR', 'AR', 'MX', 'AU', 'JP', 'CN', 'PH', 'TR', 'AE', 'SA', 'PK', 'BD', 'ID', 'MY', 'SG', 'SE', 'NO', 'DK', 'FI', 'IE', 'PT', 'GR', 'CZ'];

export function Register() {
  const [form, setForm] = useState({ username: '', email: '', password: '', country: '', ageConfirmed: false, acceptedTerms: false });
  const [error, setError] = useState('');
  const [issues, setIssues] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { refresh } = useAuth();

  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const target = event.target as HTMLInputElement;
    setForm(prev => ({ ...prev, [key]: target.type === 'checkbox' ? target.checked : target.value }));
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setIssues([]);
    if (!form.ageConfirmed || !form.acceptedTerms) {
      setError('Please confirm your age and accept the Terms and Privacy Policy.');
      return;
    }
    setLoading(true);
    try {
      await api.post('/auth/register', {
        username: form.username, email: form.email, password: form.password,
        country: form.country || undefined, ageConfirmed: form.ageConfirmed, acceptedTerms: form.acceptedTerms,
      });
      await refresh();
      navigate('/onboarding');
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        const payload = err.payload as any;
        if (payload?.issues?.length) setIssues(payload.issues.map((i: any) => i.message));
      } else setError('Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Create your account"
      subtitle="Free forever for chess, lessons, puzzles, clubs and public tournaments."
      footer={<>Already registered? <Link to="/login" style={{ fontWeight: 600 }}>Sign in</Link></>}
    >
      <form onSubmit={submit} noValidate>
        {error && <div className="form-error" role="alert">{error}</div>}
        <Field label="Username" htmlFor="username" hint="3–24 characters: letters, numbers and underscores.">
          <input id="username" className="input" value={form.username} onChange={set('username')} autoComplete="username" required minLength={3} maxLength={24} />
        </Field>
        <Field label="Email" htmlFor="reg-email">
          <input id="reg-email" className="input" type="email" value={form.email} onChange={set('email')} autoComplete="email" required />
        </Field>
        <Field label="Password" htmlFor="reg-password" hint="At least 8 characters with a letter and a number.">
          <input id="reg-password" className="input" type="password" value={form.password} onChange={set('password')} autoComplete="new-password" required minLength={8} />
        </Field>
        {issues.length > 0 && <ul className="small" style={{ color: '#ff9d9d', margin: '0 0 12px 18px' }}>{issues.map(i => <li key={i}>{i}</li>)}</ul>}
        <Field label="Country (optional)" htmlFor="country">
          <select id="country" className="select" value={form.country} onChange={set('country')}>
            <option value="">Prefer not to say</option>
            {COUNTRIES.map(code => <option key={code} value={code}>{code}</option>)}
          </select>
        </Field>
        <label className="checkbox" style={{ marginBottom: 10 }}>
          <input type="checkbox" checked={form.ageConfirmed} onChange={set('ageConfirmed')} />
          <span>I am 13 or older, or I have parent/guardian consent to use SPEED CHESS.</span>
        </label>
        <label className="checkbox" style={{ marginBottom: 16 }}>
          <input type="checkbox" checked={form.acceptedTerms} onChange={set('acceptedTerms')} />
          <span>I accept the <Link to="/legal/terms">Terms of Service</Link> and <Link to="/legal/privacy">Privacy Policy</Link>.</span>
        </label>
        <Button type="submit" block loading={loading} size="lg">Create account</Button>
      </form>
    </AuthShell>
  );
}
