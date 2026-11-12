/**
 * Cloudflare Worker entry point for SPEED CHESS.
 *
 * Scope is deliberately narrow. With `run_worker_first` limited to /api, /ws and /uploads, the
 * Workers Assets layer serves the built SPA directly — faster than proxying it through JavaScript,
 * and it already handles SPA fallback (deep links like /dashboard) via `not_found_handling`.
 *
 * What this Worker adds is the one thing assets cannot do: routing dynamic traffic to the SPEED
 * CHESS Express API, which runs on a Node host.
 *
 * It does NOT run the game server. That API needs a native SQLite binding, a long-lived WebSocket
 * server, in-process matchmaking state and a 5-second timeout sweep — none of which exist in the
 * Workers runtime. See docs/CLOUDFLARE.md.
 */
export interface Env {
  /** Origin of the Express API, e.g. https://api.speedchess.example */
  API_ORIGIN?: string;
}

const API_PREFIXES = ['/api', '/uploads'];

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = (env.API_ORIGIN ?? '').trim().replace(/\/+$/, '');

    // ---- realtime -------------------------------------------------------
    if (url.pathname === '/ws' || url.pathname.startsWith('/ws/')) {
      if (!origin) return notConfigured('realtime');
      try {
        // Do NOT rewrite the scheme to ws:// — Workers' fetch only speaks http(s), and a ws:// URL
        // fails with "Fetch API cannot load". The Upgrade headers already on `request` are what
        // turn this into a WebSocket; forwarding them verbatim lets the platform upgrade it.
        return await fetch(new Request(`${origin}${url.pathname}${url.search}`, request));
      } catch (err) {
        // A failed socket must not break play: the client falls back to /matchmaking/wait and
        // /games/:id/moves polling.
        return new Response(JSON.stringify({ error: 'Realtime unavailable', detail: String(err) }), {
          status: 502,
          headers: { 'content-type': 'application/json' },
        });
      }
    }

    // ---- API ------------------------------------------------------------
    if (API_PREFIXES.some(p => url.pathname === p || url.pathname.startsWith(`${p}/`))) {
      if (!origin) return notConfigured('api');
      try {
        const proxied = new Request(new URL(`${url.pathname}${url.search}`, origin), request);
        proxied.headers.set('x-forwarded-host', url.host);
        proxied.headers.set('x-forwarded-proto', url.protocol.replace(':', ''));
        return await fetch(proxied);
      } catch (err) {
        return new Response(JSON.stringify({
          error: 'The SPEED CHESS API could not be reached. Check that the origin is running and that API_ORIGIN is correct.',
          detail: String(err),
        }), { status: 502, headers: { 'content-type': 'application/json' } });
      }
    }

    // Anything else is a static asset; `run_worker_first` keeps that out of this Worker. If a route
    // does reach here, answer honestly rather than pretending the asset exists.
    return new Response('Not found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;

/**
 * A missing ORIGIN is a deployment mistake, not a user error: say exactly what to fix rather than
 * returning an opaque 500 that looks like the app is broken.
 */
function notConfigured(kind: 'api' | 'realtime'): Response {
  const message = kind === 'api'
    ? 'The SPEED CHESS API origin is not configured. Set API_ORIGIN (wrangler secret put API_ORIGIN, or the vars block in wrangler.jsonc) to the Express API base URL.'
    : 'The realtime origin is not configured. Set API_ORIGIN so /ws can be proxied to the API.';
  return new Response(JSON.stringify({ error: message, integrationRequired: true }), {
    status: 503,
    headers: { 'content-type': 'application/json' },
  });
}
