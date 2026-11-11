/** Typed fetch wrapper: same-origin (proxied) requests, credentials included. */
export class ApiError extends Error {
  status: number;
  payload: unknown;
  constructor(message: string, status: number, payload?: unknown) {
    super(message);
    this.status = status;
    this.payload = payload;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: 'include',
    headers: {
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
      ...(init?.headers ?? {}),
    },
    ...init,
  });
  const text = await res.text();
  let payload: any = null;
  if (text) {
    try { payload = JSON.parse(text); } catch { payload = text; }
  }
  if (!res.ok) {
    const message = (payload && typeof payload === 'object' && 'error' in payload)
      ? String(payload.error)
      : `Request failed (${res.status})`;
    throw new ApiError(message, res.status, payload);
  }
  return payload as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body: body === undefined ? undefined : JSON.stringify(body) }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body: body === undefined ? undefined : JSON.stringify(body) }),
  del: <T>(path: string, body?: unknown) => request<T>(path, { method: 'DELETE', body: body === undefined ? undefined : JSON.stringify(body) }),
};

/* ---------- Shared types ---------- */
export interface RatingInfo { rating: number; rd: number; games: number; peak: number; division: { name: string; min: number; tone: string } }
export type Ratings = Record<'bullet' | 'blitz' | 'rapid' | 'classical', RatingInfo>;

export interface SessionUser {
  id: string; username: string; role: string; status: string; country: string | null;
  avatarUrl: string | null; bio: string | null; title: string | null; plan: string;
  onboarded: boolean; createdAt: string; email?: string; emailVerified?: boolean;
}

export interface GamePlayer { id: string | null; name: string; rating: number | null }
export interface GamePayload {
  id: string;
  white: GamePlayer; black: GamePlayer;
  mode: 'computer' | 'online' | 'local' | 'tournament';
  rated: boolean; category: 'bullet' | 'blitz' | 'rapid' | 'classical';
  initialSeconds: number; increment: number; difficulty: string | null;
  fen: string; status: 'active' | 'finished' | 'aborted' | 'pending';
  result: 'white' | 'black' | 'draw' | null; termination: string | null; turn: 'w' | 'b';
  clocks: { white: number; black: number };
  moves: Array<{ ply: number; san: string; uci: string; fen_after: string; clock_white_ms: number | null; clock_black_ms: number | null; is_check: number; is_capture: number }>;
  opening: string | null; pgn: string | null; inviteCode: string | null; isPrivate: boolean;
  tournamentId: string | null; startedAt: string; finishedAt: string | null;
  accuracy: { white: number | null; black: number | null };
}

export const TIME_CONTROLS = {
  bullet: { label: 'Bullet', seconds: 60, increment: 0, blurb: '1+0 · pure reflex' },
  blitz: { label: 'Blitz', seconds: 180, increment: 2, blurb: '3+2 · fast and tactical' },
  rapid: { label: 'Rapid', seconds: 600, increment: 5, blurb: '10+5 · balanced' },
  classical: { label: 'Classical', seconds: 1800, increment: 10, blurb: '30+10 · deep calculation' },
} as const;

export const DIFFICULTY_LEVELS = [
  { key: 'beginner', label: 'Beginner', elo: '~600', description: 'Sees one move ahead and often misses threats. Ideal for a first game.' },
  { key: 'easy', label: 'Easy', elo: '~1000', description: 'Takes free material and defends simple threats.' },
  { key: 'intermediate', label: 'Intermediate', elo: '~1300', description: 'Punishes loose pieces and develops sensibly.' },
  { key: 'advanced', label: 'Advanced', elo: '~1600', description: 'Prunes with alpha-beta and finds short tactics.' },
  { key: 'expert', label: 'Expert', elo: '~1900', description: 'Full-width search to depth 5 with capture quiescence.' },
] as const;

export function formatClock(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return '--:--';
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    return `${hours}:${String(minutes % 60).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  if (ms < 20000) return `${minutes}:${String(seconds).padStart(2, '0')}.${Math.floor((Math.max(0, ms) % 1000) / 100)}`;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value.includes('T') ? value : value.replace(' ', 'T') + 'Z');
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value.includes('T') ? value : value.replace(' ', 'T') + 'Z');
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function timeAgo(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value.includes('T') ? value : value.replace(' ', 'T') + 'Z');
  const diff = Date.now() - date.getTime();
  if (Number.isNaN(diff)) return '—';
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(value);
}

export function initials(name: string): string {
  return name.slice(0, 2).toUpperCase();
}

export function duration(seconds: number | null | undefined): string {
  if (!seconds && seconds !== 0) return '—';
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s ? `${m}m ${s}s` : `${m}m`;
}
