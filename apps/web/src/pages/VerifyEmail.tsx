import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { AuthShell } from '../components/AuthShell';
import { Alert } from '../components/ui';

export function VerifyEmail() {
  const [params] = useSearchParams();
  const [state, setState] = useState<'idle' | 'working' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const token = params.get('token');
    if (!token) { setState('error'); setMessage('No verification token was supplied. Open the link from your email, or resend it from Settings.'); return; }
    setState('working');
    api.post('/auth/verify-email', { token })
      .then(() => { setState('done'); setMessage('Your email address is verified.'); })
      .catch(err => { setState('error'); setMessage(err instanceof ApiError ? err.message : 'Verification failed.'); });
  }, [params]);

  return (
    <AuthShell title="Email verification">
      {state === 'done' ? <Alert tone="success">{message}</Alert> : state === 'error' ? <Alert tone="error">{message}</Alert> : <Alert tone="info">Verifying your email…</Alert>}
      <div className="mt-2"><Link to="/dashboard" className="btn btn-primary btn-block">Go to dashboard</Link></div>
    </AuthShell>
  );
}
