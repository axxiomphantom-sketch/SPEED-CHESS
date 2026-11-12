import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Browser Supabase client.
 *
 * SPEED CHESS is a Vite single-page app, so `@supabase/ssr`'s `createBrowserClient` is used
 * without a `createClient` from `@supabase/supabase-js`: that variant stores the session in
 * cookies (not localStorage), which is what lets the Express API read the same session and
 * verify it server-side.
 *
 * The publishable/anon key is safe to ship to the browser — every table it can reach is guarded
 * by Row Level Security. A service-role key must never be imported from client code; there is
 * deliberately no code path here that could read one.
 */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

/** True when both public env vars are present. Used by the UI to explain misconfiguration. */
export const isSupabaseConfigured: boolean = Boolean(SUPABASE_URL && SUPABASE_KEY);

let browserClient: SupabaseClient | null = null;

/**
 * Returns the shared browser client, or `null` when the project is not configured.
 *
 * Callers must handle `null` explicitly instead of crashing the whole app: a developer who
 * clones the repo without credentials should get a clear message, not a blank screen. Every
 * auth helper in `src/lib/supabaseAuth.ts` funnels through here.
 */
export function getSupabaseBrowserClient(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null;
  if (!browserClient) {
    browserClient = createBrowserClient(SUPABASE_URL!, SUPABASE_KEY!);
  }
  return browserClient;
}

/** Thrown when Supabase auth is attempted but the environment is not configured. */
export class SupabaseNotConfiguredError extends Error {
  constructor() {
    super(
      'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY ' +
      'in .env.local and restart the dev server.',
    );
    this.name = 'SupabaseNotConfiguredError';
  }
}

/** Same as `getSupabaseBrowserClient`, but throws a user-readable error when unconfigured. */
export function requireSupabaseBrowserClient(): SupabaseClient {
  const client = getSupabaseBrowserClient();
  if (!client) throw new SupabaseNotConfiguredError();
  return client;
}
