# Deployment guide

SPEED CHESS is a single Node service that serves both the API and the built React client, plus a
SQLite database file. That keeps deployment small, but it has hard requirements — read section 2
before choosing hosting.

## 1. Requirements

| Item | Minimum | Notes |
| --- | --- | --- |
| Node.js | 20 LTS (22 tested) | `>=20` is enforced in `package.json`. |
| npm | 10 | Workspaces are used (`apps/server`, `apps/web`, `packages/engine`). |
| Disk | 1 GB | Database, uploads and build output. |
| Memory | 512 MB | The engine search is depth-limited; 512 MB is comfortable. |

## 2. Important hosting constraint

The database is SQLite, which requires a **persistent filesystem**. Free tiers of Vercel, Netlify and
Cloudflare Workers cannot host this service as-is (they are stateless and/or have no durable disk).

Supported options:

* **VPS / dedicated server** (Hetzner, DigitalOcean, Linode, a home server) with a mounted data volume.
* **Fly.io / Railway / Render** with a persistent volume mounted at `/data` and `DATA_DIR=/data`.
* **Docker** anywhere a volume can be attached (section 5).

If you need serverless, port the data layer to PostgreSQL first (`docs/SCHEMA.md` §9) and move uploads
to object storage.

## 3. Environment variables

Copy `.env.example` to `.env` and set the following. Never commit `.env`.

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `NODE_ENV` | yes in prod | `development` | Enables strict CSP, secure cookies and production CORS. |
| `PORT` | no | `4000` | Listen port. |
| `APP_URL` | yes in prod | `http://localhost:5173` | Public origin; used for links, CORS and cookies. |
| `DATA_DIR` | yes in prod | `./data` | Directory for the database, `.jwt-secret` and uploads. Mount a volume here. |
| `DATABASE_FILE` | no | `$DATA_DIR/speed-chess.db` | Explicit database path. |
| `JWT_SECRET` | recommended | generated | Persisted to `$DATA_DIR/.jwt-secret` if absent. Set it explicitly in production. |
| `SESSION_TTL_DAYS` | no | `30` | Session lifetime. |
| `TRUST_PROXY` | no | `1` | Set to the number of proxy hops in front of the app. |
| `STRIPE_SECRET_KEY` | no | — | Enables checkout. Without it the API returns 503 `integrationRequired`. |
| `STRIPE_WEBHOOK_SECRET` | no | — | Verifies webhook signatures. |
| `SMTP_URL` | no | — | Enables real email through nodemailer (`smtps://user:pass@smtp.host:465`). Without it links go to the server log ("console mode"). |
| `MAIL_FROM` | no | `SPEED CHESS <no-reply@speedchess.local>` | Sender address; most providers require a domain you have verified. |

Generate secrets with `openssl rand -hex 48`. Never reuse them between environments.

## 4. Build and run

```bash
git clone https://github.com/axxiomphantom-sketch/SPEED-CHESS.git
cd SPEED-CHESS
npm ci
npm run build              # builds the client into apps/web/dist
npm run seed               # demo accounts + reference content (optional in production)
NODE_ENV=production npm start
```

`npm start` runs the API on `$PORT` (default 4000) and serves `apps/web/dist` with an SPA fallback.
Startup is idempotent: the schema is migrated and reference content (courses, puzzles, openings,
achievements, plans) is inserted only if missing.

Verify:

```bash
curl -s localhost:4000/api/meta/health          # {"ok":true,...}
curl -s localhost:4000/api/meta | head -c 200   # brand + live counters
```

## 5. Docker

```dockerfile
FROM node:22-slim AS build
WORKDIR /app
COPY package*.json ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/engine/package.json packages/engine/
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production DATA_DIR=/data PORT=4000
COPY --from=build /app /app
RUN mkdir -p /data && chown -R node:node /data
USER node
VOLUME ["/data"]
EXPOSE 4000
CMD ["npm", "start"]
```

```bash
docker build -t speed-chess .
docker run -d --name speed-chess -p 4000:4000 \
  -v speedchess-data:/data \
  -e APP_URL=https://chess.example.com -e JWT_SECRET=$(openssl rand -hex 48) \
  speed-chess
```

`better-sqlite3` is a native module; the build stage must run on the same platform and Node major
version as the runtime stage (the multi-stage build above guarantees this).

## 6. Reverse proxy (TLS + WebSocket)

nginx:

```nginx
server {
  listen 443 ssl http2;
  server_name chess.example.com;
  ssl_certificate     /etc/letsencrypt/live/chess.example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/chess.example.com/privkey.pem;

  client_max_body_size 3m;

  location / {
    proxy_pass http://127.0.0.1:4000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  location /ws {
    proxy_pass http://127.0.0.1:4000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 3600s;
  }
}
```

Set `APP_URL=https://chess.example.com`; cookies are `secure` when `NODE_ENV=production`.

## 6b. Clearing registered accounts

To remove every registered player — for example after testing, before launch, or to start with a
clean database — use the purge script rather than editing the database by hand:

```bash
# Always start with a dry run: lists the accounts and related rows, deletes nothing.
npm -w @speed-chess/server run purge:users

# Keep the seeded demo accounts, remove only accounts people registered themselves.
npm -w @speed-chess/server run purge:users -- --yes --keep-seed

# Remove every account.
npm -w @speed-chess/server run purge:users -- --yes
```

Point it at a specific database with `DATABASE_FILE` (or `DATA_DIR`):

```bash
DATABASE_FILE=./data/speed-chess.db npm -w @speed-chess/server run purge:users -- --yes
```

### Why a `DELETE FROM users` is not enough

| Problem | What the script does |
| --- | --- |
| `audit_logs` has **no foreign key** to `users` and stores the username in a JSON `meta` column | Clears `audit_logs` wholesale |
| `reports` can contain player names in free-text reasons | Clears `reports` |
| `games` use `ON DELETE SET NULL`, so a deleted player's games survive as ownerless records | Deletes `games` |
| SQLite leaves deleted bytes in free pages — emails stay readable with `grep` | `VACUUM`, then **verifies** the raw file no longer contains any of the addresses |
| A partial failure would leave a half-purged database | Runs inside a single transaction |

Reference content (courses, lessons, puzzles, openings) is untouched, so the app still works and new
players get the full academy.

The script also prints a note about Supabase: accounts created through Supabase Auth live in that
service, not in this database. Remove them in **Supabase → Authentication → Users**, or new sign-ups
will still collide with the old addresses.

## 7. Backups

The database is a single file in WAL mode. Take a consistent snapshot with SQLite's own backup:

```bash
sqlite3 "$DATA_DIR/speed-chess.db" ".backup '/backups/speed-chess-$(date +%F).db'"
```

Run it from cron daily, keep 14 days, and copy uploads (`$DATA_DIR/uploads`) with the database so
avatars stay consistent. Restoring: stop the service, replace the database file, restart. Test a
restore into a staging copy at least once — an untested backup is not a backup.

## 8. Scaling notes

* **One process per database file.** SQLite allows many readers but a single writer; running two
  app processes against the same file on a network filesystem risks corruption. Use one process, or
  migrate to PostgreSQL before scaling out.
* **Sessions are server-side**, so a restart does not sign everyone out.
* **Matchmaking state is in the database**, so it survives restarts and would work across instances
  after the PostgreSQL port.
* **WebSocket fan-out is in-process.** Multiple instances would need Redis pub/sub for cross-instance
  delivery; the client's polling fallback keeps games playable meanwhile.
* **Timeouts** are swept every 5 seconds by an interval in the API process; a second instance would
  run a second sweep. Guard it with a leader lock if you scale out.

## 9. Scheduled jobs

There is no external cron requirement. In-process:
* Flagged game timeouts (5s interval).
* Rating recalculation happens on game finish, never in a batch.

Optional external cron: daily database backup (section 7), log rotation.

## 10. Observability

* `GET /api/meta/health` — liveness, uptime, version. Point your uptime monitor here.
* `GET /api/admin/overview` — authenticated counters (players, games, reports, memory, uptime).
* Structured `[error]` lines on the server for 500s; ship stdout to your log platform.
* Audit trail in `audit_logs` covers every staff action.

## 11. Post-deploy checklist

1. `/api/meta/health` returns `ok: true`.
2. Register a new account; confirm the verification link appears in logs (no SMTP) or in email.
   With SMTP configured the API must answer `emailDelivery: "sent"` and **not** include the link;
   the admin dashboard card should read `Email delivery: Live`.
3. Play a computer game to checkmate; confirm the result appears in History with a rating change
   (or no change for a casual game).
4. Open Game Analysis on that game; confirm per-move classifications appear.
5. Solve the daily puzzle; confirm the stats counter increments.
6. Create a tournament as an `organizer` account; start a round; confirm games open.
7. Sign in as `admin`; confirm `/admin` loads and a test report can be resolved.
8. Confirm `/pricing` shows the "payments not configured" message rather than a broken checkout.
9. Delete the test account from Settings to confirm the flow works.
10. Restore a backup into staging and confirm the data matches.

## 12. Security checklist

* [ ] `NODE_ENV=production` and HTTPS only.
* [ ] `JWT_SECRET` set explicitly (not auto-generated) and stored in your secret manager.
* [ ] `.env` not committed; `.gitignore` covers it.
* [ ] Database and uploads on a persistent volume with restrictive permissions.
* [ ] Rate limits appropriate to your traffic (`apps/server/src/index.ts`).
* [ ] Reverse proxy limits request body size (3 MB above).
* [ ] Backups encrypted at rest and access-logged.
* [ ] Staff accounts use unique, strong passwords; admin role granted sparingly.
* [ ] Review `audit_logs` after granting any elevated role.

## 13. Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `EADDRINUSE` | Another instance running | `pkill -f "tsx apps/server"` or change `PORT`. |
| `SQLITE_CANTOPEN` | `DATA_DIR` missing or not writable | Create it and check ownership; the app creates it if it can. |
| Blank page after deploy | Client not built | `npm run build`; confirm `apps/web/dist/index.html` exists. |
| 401 on every request | Cookies blocked or `APP_URL` mismatch | Use HTTPS and the same origin; check `SameSite`/`secure` flags. |
| Checkout always 503 | No `STRIPE_SECRET_KEY` | Expected; configure the provider or keep the free tier. |
| Emails never arrive | No `SMTP_URL` | Links are in the server log and the API reports `"console"`; configure SMTP for real delivery. |
| Sign-in works but mail fails | Bad credentials / unverified sender domain | The request still succeeds; look for the logged `[mail]` failure and check `MAIL_FROM` is a verified sender. |
