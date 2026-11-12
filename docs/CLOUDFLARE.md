# Deploying SPEED CHESS on Cloudflare

SPEED CHESS has two halves. Cloudflare can host one of them natively, and that is a deliberate,
documented decision rather than an unfinished port.

| Half | Runtime needs | Where it runs |
| --- | --- | --- |
| React SPA (`apps/web`) | Static files, no server | **Cloudflare** — Workers Assets at the edge |
| API (`apps/server`) | Native SQLite, long-lived WebSockets, in-process state, timers | **Node host** — Fly.io, Railway, Render, a VPS, Cloudflare Containers |

---

## 1. Why the API does not run on Workers

These are hard runtime constraints, not preferences:

| Requirement | Why Workers cannot serve it |
| --- | --- |
| `better-sqlite3` | A **native `.node` addon** with a synchronous C++ binding. The Workers runtime has no native addons. (The file is not even present in a deployment build — it is compiled per platform.) |
| Persistent SQLite file | Workers have no writable filesystem; D1 is a different database with a different API and would mean rewriting every query in `apps/server/src/routes` and `services`. |
| WebSocket server (`ws`) holding live game state | A Worker request must finish; a room that lives for a whole game belongs on a long-running process. |
| `setInterval` timeout sweep (5s) | No long-lived timers between requests. Clocks would never flag a timeout. |
| Matchmaking queue in memory (`Matchmaker.queue`) | Each isolate has its own memory; two players would land in different isolates and never be paired. |
| Engine search up to ~2.5s CPU | Worker CPU limits make a depth-5 search unreliable under load. |

Moving the API to Workers is therefore a **rewrite of the data layer, realtime layer and game-clock
model** — roughly the whole server. It is not a configuration change, and doing it badly would break
the server-authoritative move validation that makes the games trustworthy.

---

## 2. Supported topology (what this config deploys)

```
Browser ──► speed-chess.<account>.workers.dev      (Worker + Assets, edge)
                 │  /api/*  /ws  /uploads/*
                 ▼
            api.speedchess.example                  (Express + SQLite, Node)
```

Benefits of proxying through the Worker rather than exposing the API host directly:

* **One origin.** The session cookie stays `SameSite=Lax` and `HttpOnly`; there is no cross-site
  cookie problem and no CORS preflight in the browser.
* **SPA routing** handled by Workers Assets (`not_found_handling: single-page-application`).
* **Caching** for content-hashed assets at the edge, handled by Cloudflare rather than by proxy code.

---

## 3. Deploy

```bash
# 1. Build the SPA (the Worker uploads apps/web/dist as assets)
npm ci
npm run build

# 2. Point the Worker at your API
npx wrangler secret put API_ORIGIN      # e.g. https://api.speedchess.example

# 3. Ship
npx wrangler deploy
```

Preview locally first — this runs the real `workerd` runtime against your built assets:

```bash
npx wrangler dev --local --var API_ORIGIN:http://127.0.0.1:4000
# http://localhost:8787 serves the app; /api and /ws proxy to the API on :4000
```

`wrangler.jsonc` also defines a `staging` environment: `npx wrangler deploy --env staging`.

---

## 4. Configure the API host

Set these on the **Node host**, not in the Worker:

| Variable | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `APP_URL` | `https://speed-chess.<account>.workers.dev` |
| `JWT_SECRET` | `openssl rand -hex 48` |
| `CORS_ORIGINS` | Optional. Only needed if the browser ever calls the API origin directly instead of through the Worker. |
| `COOKIE_SAMESITE` | Leave unset for the proxied topology. Set to `none` **only** if the browser talks to the API on a different site — that also forces `Secure`, so the API must be HTTPS. |
| `VITE_SUPABASE_*` | Optional, for Supabase auth (see `SUPABASE.md`) |

The Worker only needs `API_ORIGIN`.

---

## 5. What was verified, and what was not

Tested locally on the real Workers runtime (`workerd`, via `wrangler dev`), against the real built
assets and the real Express API:

| Check | Result |
| --- | --- |
| `/` and deep links (`/dashboard`, `/play/game/:id`) serve the SPA | ✅ 200, correct `<title>` |
| `/api/*` proxied to the origin, `x-forwarded-host` preserved | ✅ 200 |
| Full auth through the edge: login → `/auth/me` → dashboard | ✅ 200, cookie `HttpOnly; SameSite=Lax` |
| **WebSocket** upgrade through the Worker | ✅ 101, `{"type":"ready"}` then `{"type":"pong"}` |
| Gameplay through the edge: create game → move → engine reply → history → dashboard | ✅ all pass |
| Feature endpoints: learn, puzzles, openings, tournaments, leaderboards, clubs, achievements, notifications, meta | ✅ all 200 |
| Missing `API_ORIGIN` | ✅ 503 with an actionable message, not a crash |
| Unreachable API origin | ✅ 502 with a clear error |

**Not verified:** `wrangler deploy` itself. Outbound access to `api.cloudflare.com`,
`dash.cloudflare.com` and `workers.cloudflare.com` is blocked in the environment this was built in
(`000`, while GitHub and npm answer normally), so no Cloudflare account was contacted. The
configuration is validated by `wrangler deploy --dry-run` (bundle builds, assets discovered, binding
resolved) and exercised end-to-end in `workerd`, but the upload step needs a machine with normal
internet access and Cloudflare credentials.

A `ws://` bug was found and fixed during this work: rewriting the proxy target to `ws://` fails with
*"Fetch API cannot load"*. Forwarding the original request (headers intact) is what lets the platform
perform the upgrade.

---

## 6. Alternative: Cloudflare Containers

If you want everything inside Cloudflare, **Containers** can run this repository unchanged — it is a
Docker image with a persistent volume for `data/speed-chess.db`. That preserves SQLite, `ws`,
timers and in-memory matchmaking. It needs a Workers **paid** plan and a Dockerfile; the Node host
option above is simpler and cheaper for the same result.
