import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, ApiError } from './api';

/**
 * Guest session state.
 *
 * The token itself lives in an httpOnly cookie the browser never reads — this context only tracks
 * the *identity* the server reports, so the UI can show "Guest Knight" and a "sign up to keep your
 * game" nudge. Refreshing the page calls `GET /auth/guest`, which returns the cookie's identity if
 * it is still valid.
 */

export interface GuestIdentity {
  displayName: string;
  avatarIcon: string | null;
  expiresAt?: string;
}

interface GuestState {
  guest: GuestIdentity | null;
  loading: boolean;
  /** Starts a guest session; safe to call when one already exists. */
  start: (icon?: string | null) => Promise<GuestIdentity | null>;
  setIcon: (icon: string) => Promise<void>;
  /** Clears local guest state (the cookie is cleared server-side on logout). */
  clear: () => void;
  /** True once we know there is no account *and* no guest. */
  error: string | null;
}

const GuestContext = createContext<GuestState | null>(null);

const ICON_KEY = 'sc-guest-icon';

export function GuestProvider({ children }: { children: ReactNode }) {
  const [guest, setGuest] = useState<GuestIdentity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    api.get<{ guest: GuestIdentity | null }>('/auth/guest')
      .then(res => { if (mounted) setGuest(res.guest); })
      .catch(() => { /* no guest is a normal state, not an error */ })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  const start = useCallback(async (icon?: string | null) => {
    setError(null);
    try {
      // Reuse a previously chosen icon so a returning guest keeps their avatar.
      const stored = icon ?? (() => { try { return localStorage.getItem(ICON_KEY); } catch { return null; } })();
      const res = await api.post<{ guest: GuestIdentity }>('/auth/guest', { icon: stored ?? undefined });
      setGuest(res.guest);
      return res.guest;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not start a guest session.');
      return null;
    }
  }, []);

  const setIcon = useCallback(async (icon: string) => {
    setGuest(prev => (prev ? { ...prev, avatarIcon: icon } : prev));
    try { localStorage.setItem(ICON_KEY, icon); } catch { /* storage disabled */ }
    // Persist server-side too, so a refresh keeps it. Failure is non-fatal: the icon is cosmetic.
    await api.patch('/auth/guest', { icon }).catch(() => {});
  }, []);

  const clear = useCallback(() => {
    setGuest(null);
    try { localStorage.removeItem(ICON_KEY); } catch { /* storage disabled */ }
  }, []);

  const value = useMemo<GuestState>(
    () => ({ guest, loading, start, setIcon, clear, error }),
    [guest, loading, start, setIcon, clear, error],
  );
  return <GuestContext.Provider value={value}>{children}</GuestContext.Provider>;
}

export function useGuest(): GuestState {
  const ctx = useContext(GuestContext);
  if (!ctx) throw new Error('useGuest must be used inside GuestProvider');
  return ctx;
}
