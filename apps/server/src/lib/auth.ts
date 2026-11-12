import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { db, nowIso } from '../db/index.js';
import { id, sha256, token } from './ids.js';
import { isSupabaseConfigured, readSupabaseUser } from './supabase.js';
import { findBySupabaseId } from '../services/supabaseUsers.js';

export type Role = 'player' | 'coach' | 'organizer' | 'moderator' | 'admin';

export interface PublicUser {
  id: string;
  username: string;
  email?: string;
  role: Role;
  status: string;
  country: string | null;
  avatarUrl: string | null;
  bio: string | null;
  title: string | null;
  plan: string;
  onboarded: boolean;
  createdAt: string;
}

interface UserRow {
  id: string; username: string; email: string; role: Role; status: string; country: string | null;
  avatar_url: string | null; bio: string | null; title: string | null; plan: string; onboarded: number;
  created_at: string; email_verified: number; password_hash: string;
}

export interface AuthedRequest extends Request {
  user?: UserRow & { sessionId: string };
  /** Set when the request carried a verified Supabase access token. */
  supabaseUserId?: string;
}

export function toPublicUser(row: Partial<UserRow> & { id: string; username: string; role: Role; status: string }): PublicUser {
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    status: row.status,
    country: row.country ?? null,
    avatarUrl: row.avatar_url ?? null,
    bio: row.bio ?? null,
    title: row.title ?? null,
    plan: row.plan ?? 'free',
    onboarded: Boolean(row.onboarded),
    createdAt: row.created_at ?? '',
  };
}

export const COOKIE_NAME = 'sc_session';

export function createSession(userId: string, req: Request): { token: string; sessionId: string } {
  const raw = token(32);
  const sessionId = id('ses_');
  const expires = new Date(Date.now() + config.sessionDays * 864e5).toISOString();
  db.prepare(
    `INSERT INTO sessions (id, user_id, token_hash, user_agent, ip, expires_at) VALUES (?,?,?,?,?,?)`
  ).run(sessionId, userId, sha256(raw), req.get('user-agent')?.slice(0, 200) ?? null, req.ip ?? null, expires);
  const signed = jwt.sign({ sid: sessionId, uid: userId, raw }, config.jwtSecret, { expiresIn: `${config.sessionDays}d` });
  return { token: signed, sessionId };
}

/**
 * Session cookie attributes.
 *
 * Default: `SameSite=Lax`, which is correct whenever the browser talks to the API on its own
 * origin — including the recommended Cloudflare topology, where the Worker proxies /api so the
 * browser only ever sees one host.
 *
 * If the API is served from a *different* site (api.example.com behind app.example.com), Lax will
 * not be sent on cross-site subrequests. Setting COOKIE_SAMESITE=none switches to `SameSite=None`,
 * which browsers only honour together with `Secure` — so it also forces `secure: true`, and the API
 * must be on HTTPS with a matching CORS_ORIGINS entry. Never use it as a way to avoid fixing CORS.
 */
export function cookieOptions() {
  const crossSite = (process.env.COOKIE_SAMESITE ?? '').toLowerCase() === 'none';
  return {
    httpOnly: true,
    sameSite: (crossSite ? 'none' : 'lax') as 'none' | 'lax',
    secure: crossSite || config.isProd,
    maxAge: config.sessionDays * 864e5,
    path: '/',
  };
}

export function resolveSession(signed: string | undefined): (UserRow & { sessionId: string }) | null {
  if (!signed) return null;
  let payload: { sid: string; uid: string; raw: string };
  try {
    payload = jwt.verify(signed, config.jwtSecret) as typeof payload;
  } catch { return null; }
  const session = db.prepare('SELECT * FROM sessions WHERE id = ? AND revoked_at IS NULL').get(payload.sid) as
    | { id: string; user_id: string; token_hash: string; expires_at: string }
    | undefined;
  if (!session) return null;
  if (session.token_hash !== sha256(payload.raw)) return null;
  if (new Date(session.expires_at).getTime() < Date.now()) return null;
  const user = db.prepare('SELECT * FROM users WHERE id = ? AND status != ?').get(session.user_id, 'deleted') as UserRow | undefined;
  if (!user) return null;
  db.prepare('UPDATE sessions SET last_used_at = ? WHERE id = ?').run(nowIso(), session.id);
  return { ...user, sessionId: session.id };
}

/**
 * Populates req.user from either credential:
 *   1. the Supabase session cookie, verified server-side with `getClaims()` (preferred), or
 *   2. the legacy `sc_session` cookie, for accounts that predate Supabase.
 *
 * Never rejects — route-level `requireAuth` does that. Supabase tokens are verified on every
 * request, so this is an identity check, not a "is a cookie present" check.
 */
export function attachUser(req: AuthedRequest, res: Response, next: NextFunction) {
  const resolved = resolveSession(req.cookies?.[COOKIE_NAME]);
  if (resolved) { req.user = resolved; return next(); }

  if (!isSupabaseConfigured()) return next();
  void (async () => {
    try {
      const verified = await readSupabaseUser(req, res);
      if (!verified) return next();
      // Unverified email addresses must not reach protected areas.
      const local = findBySupabaseId(verified.id);
      if (local) {
        req.user = { ...local, sessionId: 'supabase' };
        req.supabaseUserId = verified.id;
      } else {
        // No local row yet (first sign-in before /auth/supabase/sync). Until the player has a
        // chess profile they can only reach the sync endpoint, which creates it.
        req.supabaseUserId = verified.id;
      }
      next();
    } catch (err) {
      console.error('[auth] supabase verification failed:', err);
      next();
    }
  })();
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });
  if (req.user.status === 'suspended') return res.status(403).json({ error: 'Account suspended' });
  next();
}

export function requireRole(...roles: Role[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Insufficient permissions' });
    next();
  };
}
