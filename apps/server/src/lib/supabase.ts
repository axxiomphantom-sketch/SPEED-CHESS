import { createServerClient } from '@supabase/ssr';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import type { Request, Response } from 'express';
import { config } from '../config.js';

/**
 * Server-side Supabase client for the Express API.
 *
 * SPEED CHESS has no Next.js middleware: the API is a long-lived Node process, so the equivalent of
 * "middleware refreshes the session cookie" is a per-request server client that
 *   1. reads the Supabase auth cookies from the incoming request,
 *   2. lets `getClaims()` / `getUser()` refresh an expiring access token,
 *   3. writes any refreshed cookies back onto the Express response.
 *
 * Step 3 is the easy thing to get wrong, and getting it wrong causes random logouts: without
 * `setAll`, a rotated refresh token is lost and the browser keeps replaying one that has already
 * been replaced.
 */

/** True when the API can talk to Supabase. Surfaced by `/api/meta/status` and the admin UI. */
export function isSupabaseConfigured(): boolean {
  return Boolean(config.supabaseUrl && config.supabasePublishableKey);
}

function cookieMethods(req: Request, res: Response) {
  return {
    getAll() {
      const header = req.headers.cookie;
      if (!header) return [];
      return header.split(';').flatMap(part => {
        const index = part.indexOf('=');
        if (index === -1) return [];
        const name = part.slice(0, index).trim();
        const value = part.slice(index + 1).trim();
        if (!name) return [];
        try {
          return [{ name, value: decodeURIComponent(value) }];
        } catch {
          return [{ name, value }];
        }
      });
    },
    setAll(cookies: { name: string; value: string; options?: Record<string, unknown> }[]) {
      const serialised = cookies.map(({ name, value, options }) => {
        const opts = (options ?? {}) as Record<string, unknown>;
        const parts = [`${name}=${encodeURIComponent(value)}`];
        parts.push(`Path=${typeof opts.path === 'string' ? opts.path : '/'}`);
        if (opts.maxAge !== undefined) parts.push(`Max-Age=${opts.maxAge}`);
        if (opts.expires) parts.push(`Expires=${new Date(opts.expires as string).toUTCString()}`);
        if (opts.domain) parts.push(`Domain=${String(opts.domain)}`);
        if (opts.sameSite) parts.push(`SameSite=${String(opts.sameSite)}`);
        if (opts.secure) parts.push('Secure');
        if (opts.httpOnly !== false) parts.push('HttpOnly');
        return parts.join('; ');
      });
      if (serialised.length === 0) return;
      // Append rather than overwrite: a refresh can rotate several chunked cookies at once.
      const existing = res.getHeader('Set-Cookie');
      const list = Array.isArray(existing) ? existing : existing ? [String(existing)] : [];
      res.setHeader('Set-Cookie', [...list, ...serialised]);
    },
  };
}

/** Creates a fresh server client for one request. Never share one across requests. */
export function createSupabaseServerClient(req: Request, res: Response): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  return createServerClient(config.supabaseUrl, config.supabasePublishableKey, {
    cookies: cookieMethods(req, res),
  });
}

export interface VerifiedSupabaseUser {
  /** Supabase `auth.users.id` (a UUID). */
  id: string;
  email: string | null;
  emailVerified: boolean;
  /** Username chosen at sign-up, stored in Supabase user metadata. */
  username: string | null;
  user: User;
}

/**
 * Verifies the caller's Supabase session server-side.
 *
 * Uses `getClaims()`, which validates the JWT signature and expiry (locally against the project's
 * JWKS when asymmetric signing keys are used, otherwise against the Auth server). A session that
 * merely *exists* in a cookie is never trusted — that is exactly how a forged cookie would get in.
 *
 * If claims cannot be verified, this falls back to `getUser()` (a live Auth-server check) rather
 * than assuming anonymous or assuming authenticated, so a missing JWKS never silently grants access.
 */
export async function readSupabaseUser(req: Request, res: Response): Promise<VerifiedSupabaseUser | null> {
  const supabase = createSupabaseServerClient(req, res);
  if (!supabase) return null;

  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;

  if (accessToken) {
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(accessToken);
    if (!claimsError && claimsData?.claims?.sub) {
      const claims = claimsData.claims;
      const user = sessionData.session?.user;
      return {
        id: String(claims.sub),
        email: typeof claims.email === 'string' ? claims.email : (user?.email ?? null),
        emailVerified: isVerified(user),
        username: pickUsername(user?.user_metadata),
        user: user as User,
      };
    }
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return null;
  const user = userData.user;
  return {
    id: user.id,
    email: user.email ?? null,
    emailVerified: isVerified(user),
    username: pickUsername(user.user_metadata),
    user,
  };
}

/** Supabase sets `email_confirmed_at` (and historically `confirmed_at`) once the address is proven. */
function isVerified(user: User | undefined): boolean {
  if (!user) return false;
  return Boolean(user.email_confirmed_at ?? (user as { confirmed_at?: string }).confirmed_at);
}

function pickUsername(metadata: Record<string, unknown> | undefined): string | null {
  const raw = metadata?.username;
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
}
