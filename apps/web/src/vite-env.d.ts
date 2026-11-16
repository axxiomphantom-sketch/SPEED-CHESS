/// <reference types="vite/client" />

/**
 * Typed environment variables.
 *
 * This project uses **Vite**, not Next.js, so the browser sees `VITE_`-prefixed names only —
 * `NEXT_PUBLIC_*` variables do nothing here. Only `VITE_`-prefixed values reach the browser
 * bundle, which is why the frontend reads these two directly and the server (which prefers its
 * own un-prefixed `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY`) falls back to them.
 *
 * Never add a secret or a Supabase service-role key here: anything declared in this file is
 * shipped to every visitor.
 */
interface ImportMetaEnv {
  /** Supabase project origin, e.g. `https://<project-ref>.supabase.co` (no `/rest/v1` suffix). */
  readonly VITE_SUPABASE_URL?: string;
  /** Publishable/anon key. Public by design — the tables it can reach are guarded by RLS. */
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
