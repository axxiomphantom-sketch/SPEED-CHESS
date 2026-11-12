import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError, api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { isSupabaseConfigured, signUpWithSupabase } from '../lib/supabaseAuth';
import { AuthShell } from '../components/AuthShell';
import { GoogleButton } from '../components/GoogleButton';
import { Alert, Button, Field } from '../components/ui';

const COUNTRIES = ['NG', 'GH', 'KE', 'ZA', 'EG', 'GB', 'US', 'CA', 'DE', 'FR', 'ES', 'IT', 'NL', 'PL', 'UA', 'RU', 'IN', 'BR', 'AR', 'MX', 'AU', 'JP', 'CN', 'PH', 'TR', 'AE', 'SA', 'PK', 'BD', 'ID', 'MY', 'SG', 'SE', 'NO', 'DK', 'FI', 'IE', 'PT', 'GR', 'CZ'];

export function Register() {
  const [form, setForm] = useState({
    username: '', email: '', password: '', confirmPassword: '', country: '',
    ageConfirmed: false, acceptedTerms: false,
  });
  const [error, setError] = useState('');
  const [issues, setIssues] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  /** Set once Supabase accepts the sign-up, so we can show the "verify your email" screen. */
  const [awaitingVerification, setAwaitingVerification] = useState(false);
  const navigate = useNavigate();
  const { refresh } = useAuth();

  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const target = event.target as HTMLInputElement;
    setForm(prev => ({ ...prev, [key]: target.type === 'checkbox' ? target.checked : target.value }));
  };

  /** Client-side validation shared by both auth paths, so the feedback is identical. */
  const validate = (): string | null => {
    if (!/^[A-Za-z0-9_]{3,24}$/.test(form.username.trim())) {
      return 'Username must be 3–24 characters: letters, numbers and underscores only.';
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return 'Enter a valid email address.';
    if (form.password.length < 10) return 'Choose a password of at least 10 characters.';
    if (!/[A-Za-z]/.test(form.password) || !/[0-9]/.test(form.password)) {
      return 'Your password needs at least one letter and one number.';
    }
    if (form.password !== form.confirmPassword) return 'The two passwords do not match.';
    if (!form.ageConfirmed || !form.acceptedTerms) {
      return 'Please confirm your age and accept the Terms and Privacy Policy.';
    }
    return null;
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setIssues([]);

    const validationError = validate();
    if (validationError) { setError(validationError); return; }

    setLoading(true);
    try {
      if (isSupabaseConfigured) {
        const result = await signUpWithSupabase({
          username: form.username.trim(),
          email: form.email.trim(),
          password: form.password,
          country: form.country || undefined,
        });
        if (!result.ok) { setError(result.message); return; }
        // Supabase creates the account and sends the confirmation email. The player cannot reach a
        // protected page until that link is used, so we stop here rather than navigating.
        setAwaitingVerification(true);
        return;
      }

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

  if (awaitingVerification) {
    return (
      <AuthShell
        title="Check your email"
        subtitle="One last step before your first game."
        footer={<>Already confirmed? <Link to="/login" style={{ fontWeight: 600 }}>Sign in</Link></>}
      >
        <Alert tone="info" title="Verify your email address">
          We sent a confirmation link to <strong>{form.email.trim()}</strong>. Open it to activate your
          account and choose your board. The link is valid for 24 hours.
        </Alert>
        <p className="small muted" style={{ marginTop: 14 }}>
          Nothing arrived? Check your spam folder, or resend the link from the{' '}
          <Link to={`/verify-email?email=${encodeURIComponent(form.email.trim())}`}>verification page</Link>.
        </p>
        <p className="small muted" style={{ marginTop: 8 }}>
          You will not be able to sign in until the address is confirmed.
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Create your account"
      subtitle="Free forever for chess, lessons, puzzles, clubs and public tournaments."
      footer={<>Already registered? <Link to="/login" style={{ fontWeight: 600 }}>Sign in</Link></>}
    >
      {isSupabaseConfigured && (
        <>
          <GoogleButton label="Sign up with Google" onError={setError} />
          <div className="row" style={{ gap: 12, margin: '16px 0', alignItems: 'center' }} aria-hidden="true">
            <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            <span className="tiny muted">or register with email</span>
            <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          </div>
        </>
      )}
      <form onSubmit={submit} noValidate>
        {error && <div className="form-error" role="alert">{error}</div>}
        <Field label="Username" htmlFor="username" hint="3–24 characters: letters, numbers and underscores.">
          <input id="username" className="input" value={form.username} onChange={set('username')} autoComplete="username" required minLength={3} maxLength={24} />
        </Field>
        <Field label="Email" htmlFor="reg-email">
          <input id="reg-email" className="input" type="email" value={form.email} onChange={set('email')} autoComplete="email" required />
        </Field>
        <Field label="Password" htmlFor="reg-password" hint="At least 10 characters, including a letter and a number.">
          <input id="reg-password" className="input" type="password" value={form.password} onChange={set('password')} autoComplete="new-password" required minLength={10} />
        </Field>
        <Field
          label="Confirm password"
          htmlFor="reg-password-confirm"
          error={form.confirmPassword.length > 0 && form.confirmPassword !== form.password ? 'Passwords do not match.' : undefined}
        >
          <input
            id="reg-password-confirm"
            className="input"
            type="password"
            value={form.confirmPassword}
            onChange={set('confirmPassword')}
            autoComplete="new-password"
            required
          />
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
