# SPEED CHESS — HTTP & WebSocket API

Base path: `/api`. All responses are JSON. Errors use `{ "error": "human readable message" }` with
an appropriate status code. Authentication is a session cookie (`sc_session`, HTTP-only, SameSite=Lax)
— there are no bearer tokens.

```
POST /api/auth/login        → sets sc_session
GET  /api/auth/me           → { user, ratings }
```

Rate limits: `/api/auth/*` 40 requests / 15 min / IP; all other `/api` routes 300 / min; write-heavy
game routes 120 / min. Exceeding a limit returns `429` with a readable message.

Legend: 🔓 public · 🔐 signed in · 🛡 moderator/admin · 👑 admin.

## 1. Platform meta

| Method | Path | Access | Description |
| --- | --- | --- | --- |
| GET | `/meta` | 🔓 | Brand, live counters, plan catalogue, active announcements, registration/ maintenance flags. |
| GET | `/meta/health` | 🔓 | Uptime and version. |
| GET | `/meta/status` | 🔓 | `{ ok, signedIn }`. |
| GET | `/meta/search?q=` | 🔓 | Global search: players, lessons, tournaments, clubs, openings (min 2 chars). |

## 2. Authentication

| Method | Path | Access | Body / notes |
| --- | --- | --- | --- |
| POST | `/auth/register` | 🔓 | `{ username, email, password }`. Rejects weak passwords (length ≥ 10, mixed classes). |
| POST | `/auth/login` | 🔓 | `{ email, password }`; generic failure message to avoid account enumeration. |
| POST | `/auth/logout` | 🔓 | Revokes the current session. |
| GET | `/auth/me` | 🔐 | Session user + four ratings. |
| POST | `/auth/verify-email` | 🔓 | `{ token }`. |
| POST | `/auth/resend-verification` | 🔐 | Sends a fresh token. Returns `emailDelivery: 'sent' \| 'console'`. |
| POST | `/auth/forgot-password` | 🔓 | `{ email }`; always returns 200 so accounts cannot be enumerated. |
| POST | `/auth/reset-password` | 🔓 | `{ token, password }`. |
| POST | `/auth/change-password` | 🔐 | `{ currentPassword, newPassword }`; revokes other sessions. |
| GET | `/auth/sessions` | 🔐 | Active sessions, `current` flag. |
| DELETE | `/auth/sessions/:id` | 🔐 | Revoke a session (not the current one). |
| DELETE | `/auth/account` | 🔐 | `{ password }`; soft-deletes and anonymises. |
| GET | `/auth/data-export` | 🔐 | Full JSON export of the caller's data. |

Email delivery: `apps/server/src/lib/mailer.ts` uses nodemailer over `SMTP_URL` (`MAIL_FROM` sets
the sender). Link responses depend on configuration, and the API never claims a delivery it did not
make:

| `SMTP_URL` | Response | `emailDelivery` |
| --- | --- | --- |
| set, send succeeded | the link is **not** returned — it only exists in the email | `sent` |
| set, send failed | request still reports success, failure is logged, link not returned | `sent` |
| unset | link is logged to the console and returned as `verificationUrl` / `resetUrl` so local development works | `console` |

Transports run with `disableFileAccess` and `disableUrlAccess`. `GET /admin/overview` exposes
`system.emailConfigured` so the dashboard can state which mode the deployment is in.

## 3. Me / profile / settings

| Method | Path | Access | Description |
| --- | --- | --- | --- |
| GET | `/me/dashboard` | 🔐 | Ratings, recent games, rating history, continue-learning, to-play pairings, achievements, upcoming events, friends. |
| GET | `/me/analytics` | 🔐 | Totals, by colour, by category, openings, terminations, monthly volume, rating history, division table. |
| GET | `/me/settings` | 🔐 | Every editable preference. |
| PATCH | `/me/settings` | 🔐 | Partial update (validated per field, snake_case mapped). |
| POST | `/me/avatar` | 🔐 | `{ dataUrl }` — PNG/JPEG/WebP, ≤ 2 MB; signature-checked, stored under `/uploads`. |
| PATCH | `/me/onboarding` | 🔐 | `{ experience, categories[], interests[] }`; sets provisional starting rating (high RD). |
| GET | `/players` | 🔓 | `?q=&limit=` player search. |
| GET | `/players/:username` | 🔓 | Public profile with privacy controls applied: ratings, record, games, achievements, clubs, tournaments, activity, friendship state. |

## 4. Play and games

| Method | Path | Access | Description |
| --- | --- | --- | --- |
| GET | `/play/levels` | 🔓 | Computer difficulty levels with real engine settings. |
| POST | `/play/games` | 🔐 | Create a game. `{ mode: 'computer'\|'local'\|'friend'\|'online', category, seconds, increment, rated, color?, difficulty?, private? }`. |
| POST | `/play/games/join` | 🔐 | `{ code }` join a private game by invite code. |
| GET | `/games/:id` | 🔓 | Full game payload (players, clocks, FEN, PGN, move list, `viewerSide`). Live games are readable by anyone with the link (spectating); **finished** games return 403 to non-players, and private games return 403 to everyone else. |
| POST | `/games/:id/move` | 🔐 | `{ from, to, promotion? }` — **all legality is validated server-side**; rejects wrong turn, illegal move, or a finished game. |
| POST | `/games/:id/engine-move` | 🔐 | Only accepted when it is Black's turn in a computer game. |
| POST | `/games/:id/resign` | 🔐 | Ends the game, applies ratings once. |
| POST | `/games/:id/draw` | 🔐 | Offer a draw; requires both players. |
| POST | `/games/:id/draw/decline` | 🔐 | Declines a pending offer. |
| POST | `/games/:id/abort` | 🔐 | Aborts before a meaningful number of moves; never rated. |
| GET | `/games/:id/pgn` | 🔓 | `text/plain` PGN download. |
| GET | `/games/:id/analysis` | 🔐 | Cached engine review: per-ply eval, classification, best move, accuracy, counts, opening, summary. |
| GET | `/games/:id/moves` | 🔓 | Lightweight move list for polling fallbacks. |

Errors: `400` invalid payload, `403` not your game, `404` unknown game, `409` game already finished.

## 5. Matchmaking and challenges

| Method | Path | Access | Description |
| --- | --- | --- | --- |
| POST | `/matchmaking/join` | 🔐 | `{ category, seconds?, increment?, rated? }`; pairs with the closest rating inside the widening window (±100, +60 every 3 s, any rating after 20 s; unrated games ignore rating). Returns `{ matched, game? }` or `{ matched: false, ...queueStatus }`. If the caller already has an active online game it returns `{ alreadyPlaying: true, game }`. |
| POST | `/matchmaking/wait` | 🔐 | Poll (≈1s) for a pairing; returns queue statistics when unmatched. |
| GET | `/matchmaking/status` | 🔐 | Current queue state. |
| POST | `/matchmaking/cancel` | 🔐 | Leaves the pool. |
| GET | `/matchmaking/opponents` | 🔐 | Suggested opponents near your rating. |
| GET | `/challenges` | 🔐 | `{ incoming, outgoing }` pending challenges. |
| POST | `/challenges` | 🔐 | `{ username, category, seconds, increment, rated }`. |
| POST | `/challenges/:id/accept` | 🔐 | Creates the game and returns it. |
| POST | `/challenges/:id/decline` | 🔐 | Declines. |

Matchmaking works across processes only because the pool lives in the database, not in memory:
two API instances behind a load balancer still pair correctly.

## 6. Learning

| Method | Path | Access | Description |
| --- | --- | --- | --- |
| GET | `/learn/courses` | 🔓 | Courses with the caller's progress. |
| GET | `/learn/courses/:slug` | 🔓 | Course + lessons + per-lesson progress. |
| GET | `/learn/lessons/:slug` | 🔓 | Lesson body, quiz, board FEN, prev/next. |
| POST | `/learn/lessons/:slug/start` | 🔐 | Marks a lesson as started. |
| POST | `/learn/lessons/:slug/complete` | 🔐 | `{ score?, total? }`; returns course progress and completion. |
| GET | `/learn/progress` | 🔐 | Every lesson progress row. |
| GET | `/learn/continue` | 🔐 | The lesson to resume. |
| POST | `/learn/courses` | coach/admin | Create a course. |
| POST | `/learn/lessons` | coach/admin | Create a lesson. |

## 7. Puzzles

| Method | Path | Access | Description |
| --- | --- | --- | --- |
| GET | `/puzzles` | 🔓 | `?difficulty=&theme=&limit=` library listing. |
| GET | `/puzzles/daily` | 🔓 | Deterministic daily puzzle + `solvedToday`. |
| GET | `/puzzles/themes` | 🔓 | Themes with counts. |
| GET | `/puzzles/stats` | 🔐 | Attempts, solved, accuracy, average time, streak, puzzle rating. |
| POST | `/puzzles/:id/check` | 🔐 | `{ from, to, promotion?, ply, hintsUsed, ms }`. The **server** verifies the move against the stored solution and plays the defence. |
| POST | `/puzzles/:id/hint` | 🔐 | `{ ply }` → a hint that does not give the whole answer away. |
| GET | `/puzzles/:id/solution` | 🔐 | Full solution + explanation (recorded as solved-with-help). |
| POST | `/puzzles/:id/solve` | 🔐 | Records a solve after revealing. |

## 8. Openings, history and analysis imports

| Method | Path | Access | Description |
| --- | --- | --- | --- |
| GET | `/openings` | 🔓 | `?family=&q=` library. |
| GET | `/openings/:id` | 🔓 | Opening + FEN for every step + saved flag. |
| GET | `/openings/family/list` | 🔓 | Families with counts. |
| POST | `/openings/:id/repertoire` | 🔐 | Toggle save → `{ saved }`. |
| GET | `/openings/repertoire/mine` | 🔐 | Saved openings. |
| POST | `/openings/practice` | 🔐 | Starts a practice game from an opening. |
| GET | `/history` | 🔐 | `?limit=&offset=&category=&outcome=&mode=` paginated games with accuracy. |
| POST | `/history/import` | 🔐 | `{ pgn }` → imports a private, unrated game and returns its id for analysis. |

## 9. Tournaments

| Method | Path | Access | Description |
| --- | --- | --- | --- |
| GET | `/tournaments` | 🔓 | Discoverable events with `registered`/`canRegister`. |
| GET | `/tournaments/mine` | 🔐 | Entered events. |
| GET | `/tournaments/organised` | 🔐 | Events you organise. |
| GET | `/tournaments/:slug` | 🔓 | Tournament, standings (with Buchholz), pairings, current round. |
| POST | `/tournaments` | organizer/admin | Create. Validates that registration closes before the start. |
| POST | `/tournaments/:id/register` | 🔐 | Register (capacity + deadline checked). |
| POST | `/tournaments/:id/withdraw` | 🔐 | Withdraw before the start. |
| POST | `/tournaments/:id/rounds` | organizer | Generate pairings for the next round and open every game. |
| POST | `/tournaments/:id/advance` | organizer | Finish the event when all boards are decided. |
| POST | `/tournaments/:id/close` | organizer | Close early. |
| POST | `/tournaments/:id/result` | organizer | Manual result for an offline board. |
| GET | `/tournaments/:id/games` | 🔓 | Games belonging to the event. |

## 10. Leaderboards

`GET /leaderboards?category=&scope=global|friends&limit=&country=` — entries require at least one
rated game. `GET /leaderboards/clubs?category=` and `GET /leaderboards/countries` aggregate real
ratings only. Divisions are display labels, explicitly not official titles.

## 11. Social

| Method | Path | Access | Description |
| --- | --- | --- | --- |
| GET | `/friends` | 🔐 | `{ friends, incoming, outgoing }` with online state. |
| POST | `/friends/request` | 🔐 | `{ username }`; respects `allow_friend_requests`. |
| POST | `/friends/:id/accept` · `/decline` | 🔐 | Respond to a request. |
| DELETE | `/friends/:username` | 🔐 | Remove a friend. |
| POST | `/friends/:username/block` | 🔐 | Block (mutual effect). |
| GET | `/friends/activity` | 🔐 | Friends' recent activity. |
| GET | `/messages/threads` | 🔐 | Conversation list with unread counts. |
| GET | `/messages/with/:username` | 🔐 | Conversation; marks incoming messages read; 403 if the player only accepts friends. |
| POST | `/messages/send` | 🔐 | `{ toUsername, body }` ≤ 2000 chars; blocked/friend-only rules enforced. |

## 12. Coach and coaching centre

| Method | Path | Access | Description |
| --- | --- | --- | --- |
| POST | `/coach/ask` | 🔐 | `{ question, fen? }` → `{ answer, disclaimer }`. **403 if `fen` matches the caller's active rated game** — engine assistance is impossible by construction. |
| GET | `/coach/review/:gameId` | 🔐 | Written review of a finished game from real engine analysis. |
| GET | `/coach/plan` | 🔐 | Learning plan derived from the caller's games, puzzles and lessons. |
| GET | `/coaching/coaches` | 🔓 | Verified coaches accepting students. |
| GET/PUT | `/coaching/profile` | 🔐 | Read/publish a coach profile (coach role only to publish). |
| GET/POST | `/coaching/assignments` | 🔐 | List / create assignments (coach only for create). |
| POST | `/coaching/assignments/:id/submit` | 🔐 | Student submits work. |
| POST | `/coaching/assignments/:id/review` | coach | Written feedback. |
| GET | `/coaching/students` | coach | Your students. |

## 13. Content, clubs, achievements, notifications

| Method | Path | Access | Description |
| --- | --- | --- | --- |
| GET | `/content` | 🔓 | `?category=&q=` published articles + categories. |
| GET | `/content/:slug` | 🔓 | Article with `canEdit`; increments views for published pieces. |
| GET | `/content/mine/drafts` | 🔐 | Your drafts. |
| POST | `/content` | coach/admin/moderator | Create/publish (moderation queue). |
| PATCH | `/content/:id` | 🔐 | Edit your article. |
| GET | `/content/queue/pending` | 🛡 | Moderation queue. |
| POST | `/content/:id/moderate` | 🛡 | Approve or reject with a note. |
| GET | `/clubs` · `/clubs/mine` · `/clubs/:slug` | mixed | Listing, your clubs, club detail (members, announcements, events, `canManage`). |
| POST | `/clubs` | 🔐 | Create; private clubs need approval. |
| POST | `/clubs/:slug/join` · `/leave` | 🔐 | Membership. |
| POST | `/clubs/:slug/members/:userId` | club manager | `approve`/`remove`/`promote`/`demote`/`ban`. |
| POST | `/clubs/:slug/announcements` | club manager | Post an announcement. |
| GET | `/achievements` | 🔓 | Catalogue with the caller's progress. |
| GET | `/notifications` | 🔐 | Inbox. |
| POST | `/notifications/:id/read` · `/read-all` | 🔐 | Mark read. |
| DELETE | `/notifications/:id` | 🔐 | Delete. |

## 14. Billing

| Method | Path | Access | Description |
| --- | --- | --- | --- |
| GET | `/billing/plans` | 🔓 | Plans + `paymentProviderConfigured`. |
| GET | `/billing/subscription` | 🔐 | Current plan, subscription row, payments, provider flag. |
| POST | `/billing/checkout` | 🔐 | `{ planId: 'premium'\|'pro' }`. Without `STRIPE_SECRET_KEY` returns **503** `{ integrationRequired: true }` — no fake success. |
| POST | `/billing/webhook` | provider | Signature-verified (`STRIPE_WEBHOOK_SECRET`); 503 if unconfigured. |
| POST | `/billing/assign` | 🔐 | Applies a plan after provider confirmation. |
| POST | `/billing/cancel` | 🔐 | Cancels renewal at period end. |

## 15. Reports, support, administration

| Method | Path | Access | Description |
| --- | --- | --- | --- |
| POST | `/reports` | 🔐 | `{ targetType, targetId, reason, details? }` → queued for **human** review. |
| POST | `/support/tickets` | 🔓 | `{ email, topic, subject, body }`. |
| GET | `/support/tickets` | 🔐 | Your tickets. |
| GET | `/admin/overview` | 🛡 | Totals, 14-day charts, content counts, subscriptions, safety counts, plus `system: { emailConfigured, paymentsConfigured }` so the dashboard can flag console-mode email and disabled checkout. |
| GET | `/admin/users` | 🛡 | `?q=` search. |
| POST | `/admin/users/:id/status` | 👑 | active / restricted / suspended (with reason; audited, notifies the player). |
| POST | `/admin/users/:id/role` | 👑 | Change role (audited). |
| GET | `/admin/reports` · POST `/admin/reports/:id/resolve` | 🛡 | Review queue and written resolution. |
| GET | `/admin/audit` | 👑 | Last 200 audit entries. |
| GET/PATCH | `/admin/settings` | 👑 | `registrationOpen`, `maintenanceMode`, `announcementBanner`. |
| POST | `/admin/announcements` | 👑 | Publish a banner. |
| GET | `/admin/tournaments` · POST `/:id/cancel` | 🛡/👑 | Event oversight. |
| GET | `/admin/lessons` · POST `/:id/publish` | 🛡/👑 | Lesson publishing. |
| GET | `/admin/financials` | 👑 | Payment references and totals (no card data). |

## 16. WebSocket

`ws(s)://<host>/ws` — same-origin, cookie-authenticated on upgrade.

Client → server
```json
{ "type": "game:watch", "gameId": "gm_..." }
{ "type": "ping" }
```
Server → client
```json
{ "type": "game:state",  "game": { ... } }
{ "type": "game:move",   "gameId": "...", "san": "Nf3", "fen": "...", "clocks": { ... } }
{ "type": "game:end",    "gameId": "...", "result": "white", "termination": "checkmate" }
{ "type": "matchmaking:matched", "gameId": "gm_..." }
{ "type": "notification", "title": "...", "body": "..." }
{ "type": "message:new",  "from": "...", "body": "..." }
```
The client reconnects with exponential backoff (1s → 30s). The HTTP polling endpoints
(`/games/:id/moves`, `/matchmaking/wait`) remain authoritative fallbacks, so a dropped socket never
freezes a game.

## 17. Status codes used

`200 OK` · `201 Created` · `400` validation · `401` not signed in · `403` forbidden (role, ownership,
fair-play block) · `404` unknown resource · `409` state conflict · `413` payload too large ·
`429` rate limited · `500` server error · `503` feature not configured on this deployment.

## 18. Not implemented / pending in this build

* Payment capture requires a live `STRIPE_SECRET_KEY`; until then checkout returns 503 by design.
* Email delivery falls back to console logging without `SMTP_URL`.
* Push notifications and native mobile apps are out of scope.
* OAuth/SSO sign-in is not implemented (email + password only).
* Puzzle and analysis engines are the in-house ones in `packages/engine`; no external Stockfish.
