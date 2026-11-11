import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, ApiError, type Ratings, type SessionUser } from './api';

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

  const refresh = useCallback(async () => {
    try {
      const data = await api.get<{ user: SessionUser; ratings: Ratings; unreadNotifications: number }>('/auth/me');
      if (!mounted.current) return;
      setUser(data.user);
      setRatings(data.ratings);
      setUnread(data.unreadNotifications);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        if (mounted.current) { setUser(null); setRatings(null); setUnread(0); }
      }
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    refresh();
    return () => { mounted.current = false; };
  }, [refresh]);

  const logout = useCallback(async () => {
    await api.post('/auth/logout');
    setUser(null);
    setRatings(null);
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
