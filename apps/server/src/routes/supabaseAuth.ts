import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import { config } from '../config.js';
import { COOKIE_NAME, cookieOptions, createSession, requireAuth, toPublicUser, type AuthedRequest } from '../lib/auth.js';
import { getUserRating, audit } from '../lib/service.js';
import { CATEGORIES, divisionFor } from '../lib/ratings.js';
import { isSupabaseConfigured, readSupabaseUser } from '../lib/supabase.js';
import { ensureLocalUser, findBySupabaseId, linkSupabaseUser } from '../services/supabaseUsers.js';

/**
 * Supabase-backed authentication endpoints.
 *
 * Division of responsibility:
 *   - Supabase Auth owns credentials: sign-up, email verification, password reset, token refresh.
 *   - The browser talks to Supabase directly for those flows (see `apps/web/src/lib/supabaseAuth`).
 *   - This router exists so the *server* can (a) verify a Supabase session with `getClaims()`,
 *     (b) provision the matching chess-database row, and (c) hand back the normal SPEED CHESS
 *     session cookie that the other 30 route modules already understand.
 *
 * Nothing here invents identity: every route starts from a token verified against Supabase.
 */
export const supabaseAuthRouter = Router();

/** Smallest username/locale-safe shape, identical to the legacy register form. */
const usernameSchema = z.string().trim().min(3).max(24).regex(/^[A-Za-z0-9_]+$/, 'Letters, numbers and underscores only');

/** Reports whether the API is configured to accept Supabase sessions at all. */
supabaseAuthRouter.get('/status', (_req, res) => {
  res.json({ configured: isSupabaseConfigured() });
});

/**
 * Provisions (or returns) the local chess account for the caller's verified Supabase session
 * and issues the standard session cookie.
 *
 * Called automatically right after sign-up confirmation and on every sign-in, so a player can
 * never end up "signed in to Supabase" but with no chess profile.
 */
supabaseAuthRouter.post('/sync', async (req: AuthedRequest, res) => {
  if (!isSupabaseConfigured()) {
    return res.status(503).json({
      error: 'Supabase is not configured on this deployment. Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY.',
      integrationRequired: true,
    });
  }
  const verified = await readSupabaseUser(req, res);
  if (!verified) return res.status(401).json({ error: 'Sign in again to continue.' });

  // Unverified addresses get a specific, friendly error — they must confirm before entering.
  if (!verified.emailVerified) {
    return res.status(403).json({
      error: 'Please verify your email address before signing in. Check your inbox for the confirmation link.',
      emailVerified: false,
    });
  }

  const alreadyLinked = Boolean(findBySupabaseId(verified.id));
  const body = z.object({
    username: usernameSchema.optional(),
    country: z.string().trim().length(2).optional(),
  }).safeParse(req.body ?? {});
  if (!body.success) return res.status(400).json({ error: body.error.issues[0].message });

  // Keep Supabase metadata and the local row in step. A username chosen at sign-up wins; the
  // /sync body can correct it once (e.g. the player edits it during onboarding).
  if (body.data.username) {
    const taken = db.prepare('SELECT 1 FROM users WHERE username_lower = ? AND supabase_user_id IS NOT ?')
      .get(body.data.username.toLowerCase(), verified.id);
    if (taken) return res.status(409).json({ error: 'That username is already taken. Choose another.' });
  }

  let local;
  try {
    local = ensureLocalUser({
      supabaseUserId: verified.id,
      email: verified.email,
      username: body.data.username ?? verified.username,
      emailVerified: true,
      country: body.data.country ?? null,
    });
  } catch (err) {
    console.error('[auth] could not provision local user:', err);
    return res.status(500).json({ error: 'We could not create your chess profile. Please try again.' });
  }

  // Issue the SPEED CHESS session cookie so every existing endpoint works unchanged.
  const { token: signed } = createSession(local.id, req);
  res.cookie(COOKIE_NAME, signed, cookieOptions());
  audit(local.id, 'auth.supabase_sync', 'user', local.id, { supabaseUserId: verified.id }, req.ip);

  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(local.id) as any;
  const ratings = Object.fromEntries(CATEGORIES.map(c => {
    const r = getUserRating(local.id, c);
    return [c, { ...r, division: divisionFor(r.rating) }];
  }));
  res.json({ user: toPublicUser(row), ratings, created: !alreadyLinked });
});

/**
 * Links a verified Supabase identity to an existing local account with the same email.
 * Used by the one-time migration path so players who registered before Supabase keep their
 * rating, games and clubs. Requires a valid local session already.
 */
supabaseAuthRouter.post('/link', requireAuth, async (req: AuthedRequest, res) => {
  const verified = await readSupabaseUser(req, res);
  if (!verified) return res.status(401).json({ error: 'Sign in with Supabase first.' });
  if (!verified.emailVerified) return res.status(403).json({ error: 'Verify your email address first.' });

  const localEmail = (req.user!.email ?? '').toLowerCase();
  if (!verified.email || verified.email.toLowerCase() !== localEmail) {
    return res.status(409).json({ error: 'The Supabase account email does not match this account.' });
  }
  const clash = findBySupabaseId(verified.id);
  if (clash && clash.id !== req.user!.id) {
    return res.status(409).json({ error: 'That Supabase account is already linked to another player.' });
  }
  linkSupabaseUser(req.user!.id, verified.id);
  audit(req.user!.id, 'auth.supabase_linked', 'user', req.user!.id, {}, req.ip);
  res.json({ ok: true });
});
