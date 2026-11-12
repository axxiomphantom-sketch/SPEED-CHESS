import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { completeOAuthFromUrl } from '../lib/supabaseAuth';
import { AuthShell } from '../components/AuthShell';
import { Alert } from '../components/ui';

/**
 * OAuth callback landing page (`/auth/callback`).
 *
 * Supabase redirects here with `?code=…` after Google sign-in. The code is exchanged for a session,
 * the local chess account is provisioned, and the player lands on their dashboard. Nothing is
 * assumed: the session only exists once Supabase accepts the code AND the API verifies the token.
 */
export function AuthCallback() {
  const { refresh } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [working, setWorking] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const result = await completeOAuthFromUrl();
      if (cancelled) return;
      if (!result.ok) {
        setError(result.message);
        setWorking(false);
        return;
      }
      await refresh();
      if (cancelled) return;
      navigate('/dashboard', { replace: true });
    };
    void run();
    return () => { cancelled = true; };
  }, [navigate, refresh]);

  return (
    <AuthShell title={error ? 'Sign-in failed' : 'Signing you in'} subtitle="One moment while we finish the handshake.">
      {error ? (
        <>
          <Alert tone="error">{error}</Alert>
          <div className="mt-2">
            <Link to="/login" className="btn btn-primary btn-block">Back to sign in</Link>
          </div>
        </>
      ) : (
        <Alert tone="info">{working ? 'Completing sign-in with Google…' : 'Finishing up…'}</Alert>
      )}
    </AuthShell>
  );
}
