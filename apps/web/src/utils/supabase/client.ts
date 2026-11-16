import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { api } from '../../lib/api';

/**
 * Browser Supabase client.
 *
 * SPEED CHESS is a Vite single-page app, so `@supabase/ssr`'s `createBrowserClient` is used
 * without a `createClient` from `@supabase/supabase-js`: that variant stores the session in
 * cookies (not localStorage), which is what lets the Express API read the same session and
 * verify it server-side.
 *
 * ## Why the settings are fetched, not built in
 *
 * This module used to read `import.meta.env.VITE_SUPABASE_URL`, which Vite inlines at build time.
 * Two things then went wrong, and they compounded:
 *
 *   1. `vite.config.ts` had no `envDir`, so Vite looked for `.env*` in `apps/web/` while the file
 *      lived at the repository root. The values were empty for every build.
 *   2. `isSupabaseConfigured` was `Boolean(url && key)` over those emptied values, so Vite folded
 *      it to a literal `false` and eliminated `@supabase/supabase-js` as dead code. The bundle
 *      silently dropped ~237 KB and the app took the legacy local-auth path instead.
 *
 * The failure was invisible: no error, no warning, just a different code path. Fetching the
 * settings from `GET /api/meta/config` at runtime — the same values the server itself uses —
 * means the browser and the API can no longer disagree about whether authentication exists.
 *
 * Only the *publishable* key is fetched. It is designed to be public and is guarded by RLS.
 * A service-role key must never reach client code; there is no code path here that could read one.
 */

/**
 * Build-time defaults from Vite.
 *
 * Vite inlines `VITE_`-prefixed values into the bundle, so these are the variables the project
 * documents for the frontend. They are read here directly (rather than only via the API) so a
 * correctly-configured build works even if the config endpoint is briefly unreachable.
 *
 * Vite inlines this as a string literal at build time.
 */
const BUILD_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const BUILD_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

/** Shape of `GET /api/meta/config`. */
export interface PublicConfig {
  supabase: { configured: boolean; url: string | null; publishableKey: string | null };
  emailConfigured?: boolean;
  paymentsConfigured?: boolean;
}

let settings: { url: string; key: string } | null =
  BUILD_URL && BUILD_KEY ? { url: BUILD_URL.trim(), key: BUILD_KEY.trim() } : null;
let loadPromise: Promise<void> | null = null;

/**
 * True once the server has confirmed Supabase is configured.
 *
 * Kept as a synchronous export because 32 call sites read it directly, and they must keep working.
 * It is `false` until `loadAuthConfig()` resolves — callers that read it before then see
 * "not configured", which is the safe answer: it means the app never attempts a Supabase call
 * before it knows where to send it.
 */
export let isSupabaseConfigured = false;

/**
 * True once the initial load has finished, successfully or not.
 *
 * The UI needs this to tell "still checking" apart from "genuinely not configured". Without it a
 * configured project would flash a "not configured" message on every cold load.
 */
export let isAuthConfigLoaded = false;

// The bundle already knows the VITE_ values, so the app is usable before the config request that
// would confirm them resolves. Declared after the flags above it mutates.
if (settings) isSupabaseConfigured = true;

const listeners = new Set<() => void>();

/** Subscribe to changes in the loaded state. Returns an unsubscribe function. */
export function onAuthConfigChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

function publish() {
  for (const fn of listeners) fn();
}

/**
 * Loads the runtime auth settings from the API. Safe to call repeatedly: the first call wins and
 * later calls reuse the same promise, so a re-render storm cannot flood the endpoint.
 *
 * Never throws. A failure leaves Supabase "not configured", which degrades to the legacy local
 * auth path rather than breaking every screen.
 */
export function loadAuthConfig(): Promise<void> {
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    try {
      const config = await api.get<PublicConfig>('/meta/config');
      const url = config.supabase?.url?.trim();
      const key = config.supabase?.publishableKey?.trim();
      if (config.supabase?.configured && url && key) {
        // The server's answer wins: it is the same project the API itself talks to, so the two
        // halves cannot end up pointed at different Supabase projects.
        settings = { url, key };
        isSupabaseConfigured = true;
      } else if (!settings) {
        // Neither source has credentials: the app correctly stays on local auth.
        settings = null;
        isSupabaseConfigured = false;
      }
      // If the endpoint says "not configured" but the build inlined values, keep the build values:
      // an unconfigured API is the thing that is wrong, and failing here would hide that.
    } catch {
      // The API is unreachable. Keep whatever the build provided and retry on the next call
      // rather than caching a failure forever.
      loadPromise = null;
      isSupabaseConfigured = Boolean(settings);
    } finally {
      isAuthConfigLoaded = true;
      publish();
    }
  })();

  return loadPromise;
}

/** Awaits the settings, loading them on first use. */
export async function ensureAuthConfig(): Promise<boolean> {
  if (!isAuthConfigLoaded) await loadAuthConfig();
  return isSupabaseConfigured;
}

let browserClient: SupabaseClient | null = null;

/**
 * Returns the shared browser client, or `null` when the project is not configured.
 *
 * Callers must handle `null` explicitly instead of crashing the whole app: a developer who
 * clones the repo without credentials should get a clear message, not a blank screen. Every
 * auth helper in `src/lib/supabaseAuth.ts` funnels through here.
 */
export function getSupabaseBrowserClient(): SupabaseClient | null {
  if (!isSupabaseConfigured || !settings) return null;
  if (!browserClient) {
    browserClient = createBrowserClient(settings.url, settings.key);
  }
  return browserClient;
}

/** Thrown when Supabase auth is attempted but the server has not published a configuration. */
export class SupabaseNotConfiguredError extends Error {
  constructor() {
    super(
      'Supabase is not configured on the server. Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY ' +
      '(or VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY) and restart the API.',
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
