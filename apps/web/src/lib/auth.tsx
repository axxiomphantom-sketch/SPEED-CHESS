import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, ApiError, type Ratings, type SessionUser } from './api';
import { isSupabaseConfigured, signOutEverywhere, syncLocalAccount } from './supabaseAuth';
import { loadAuthConfig } from '../utils/supabase/client';

interface AuthState {
  user: SessionUser | null;
  ratings: Ratings | null;
  unreadNotifications: number;
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  setUser: (user: SessionUser | null) => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [ratings, setRatings] = useState<Ratings | null>(null);
  const [unreadNotifications, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);

  const loadSession = useCallback(async () => {
    const data = await api.get<{ user: SessionUser; ratings: Ratings; unreadNotifications: number }>('/auth/me');
    if (!mounted.current) return;
    setUser(data.user);
    setRatings(data.ratings);
    setUnread(data.unreadNotifications);
  }, []);

  const refresh = useCallback(async () => {
    try {
      await loadSession();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        if (mounted.current) { setUser(null); setRatings(null); setUnread(0); }
      }
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [loadSession]);

  useEffect(() => {
    mounted.current = true;
    /**
     * Boot sequence:
     *  1. Try the normal session (covers legacy cookies and a Supabase session already synced).
     *  2. If that fails but Supabase holds a session — for example the player refreshed the page
     *     after confirming their email on another tab — provision the local account and retry.
     * This removes the "verified but somehow signed out" gap without ever trusting the client.
     */
    const boot = async () => {
      // Resolve whether Supabase is configured *before* touching the session. The flag used to be
      // baked in at build time; now it is fetched, so it is unknown until this resolves.
      await loadAuthConfig();
      try {
        await loadSession();
      } catch {
        if (isSupabaseConfigured) {
          const synced = await syncLocalAccount();
          if (synced.ok) {
            try { await loadSession(); } catch { /* fall through to signed-out state */ }
          }
        }
        if (mounted.current) { setUser(null); setRatings(null); setUnread(0); }
      } finally {
        if (mounted.current) setLoading(false);
      }
    };
    void boot();
    return () => { mounted.current = false; };
  }, [loadSession]);

  const logout = useCallback(async () => {
    // Clears the Supabase session *and* the API session; either alone would leave a half-login.
    await signOutEverywhere();
    setUser(null);
    setRatings(null);
    setUnread(0);
  }, []);

  const value = useMemo<AuthState>(
    () => ({ user, ratings, unreadNotifications, loading, refresh, logout, setUser }),
    [user, ratings, unreadNotifications, loading, refresh, logout]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

/** Preferences are cached locally so the board renders instantly, then synced. */
export interface Prefs {
  boardTheme: 'violet' | 'classic' | 'emerald' | 'slate' | 'midnight';
  pieceSet: string;
  showCoordinates: boolean;
  showLegalMoves: boolean;
  soundEnabled: boolean;
  reducedMotion: boolean;
}

const DEFAULT_PREFS: Prefs = {
  boardTheme: 'violet', pieceSet: 'classic', showCoordinates: true,
  showLegalMoves: true, soundEnabled: true, reducedMotion: false,
};

const PrefsContext = createContext<{ prefs: Prefs; update: (patch: Partial<Prefs>) => void }>({
  prefs: DEFAULT_PREFS,
  update: () => {},
});

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<Prefs>(() => {
    try {
      const raw = localStorage.getItem('sc-prefs');
      return raw ? { ...DEFAULT_PREFS, ...JSON.parse(raw) } : DEFAULT_PREFS;
    } catch { return DEFAULT_PREFS; }
  });

  useEffect(() => {
    document.documentElement.classList.toggle('reduced-motion', prefs.reducedMotion);
  }, [prefs.reducedMotion]);

  const update = useCallback((patch: Partial<Prefs>) => {
    setPrefs(prev => {
      const next = { ...prev, ...patch };
      try { localStorage.setItem('sc-prefs', JSON.stringify(next)); } catch { /* storage disabled */ }
      return next;
    });
    void api.patch('/me/settings', patch).catch(() => {});
  }, []);

  return <PrefsContext.Provider value={{ prefs, update }}>{children}</PrefsContext.Provider>;
}

export function usePrefs() {
  return useContext(PrefsContext);
}

/** Loads server-side preferences once the user is known. */
export function useSyncServerPrefs() {
  const { user } = useAuth();
  const { update } = usePrefs();
  useEffect(() => {
    if (!user) return;
    api.get<{ settings: any }>('/me/settings').then(({ settings }) => {
      update({
        boardTheme: settings.boardTheme, pieceSet: settings.pieceSet,
        showCoordinates: settings.showCoordinates, showLegalMoves: settings.showLegalMoves,
        soundEnabled: settings.soundEnabled, reducedMotion: settings.reducedMotion,
      });
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);
}
