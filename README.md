<div align="center">

# SPEED CHESS

**PLAY. LEARN. COMPETE. EVOLVE.**

*ONE PLATFORM. EVERY PLAYER. ENDLESS POSSIBILITIES.*

</div>

SPEED CHESS is a complete, working chess platform: real chess rules, a server-authoritative
move validator, online and offline play, a full learning academy, puzzles, tournaments, ratings,
clubs, an educational coach and an admin console. Every number shown in the interface comes from a
real record; anything not implemented is labelled as pending instead of faked.

<p align="center"><strong>YOUR NEXT MOVE STARTS HERE.</strong></p>

---

## Quick start

```bash
npm ci
npm run seed      # demo accounts + reference content (courses, puzzles, openings, plans)
npm run dev       # API on http://localhost:4000, Vite client on http://localhost:5173
```

Production:

```bash
npm run build && npm start   # one process serves the API and the built client
```

Demo accounts (created by `npm run seed`, all clearly marked as demo in their bios):

| Account | Email | Password | Role |
| --- | --- | --- | --- |
| demo_player | `demo@speedchess.local` | `DemoPlayer123` | player |
| coach_ada | `coach@speedchess.local` | `CoachAda123` | coach |
| organizer_kai | `organizer@speedchess.local` | `OrganizerKai123` | organizer |
| admin_speedchess | `admin@speedchess.local` | `AdminSpeed123` | admin |
| nova_blitz / rookie_sam / lina_rapid / tommy_tactics | `<name>@speedchess.local` | see `apps/server/src/db/seed.ts` | players |

## What is actually implemented

Everything in this table is wired end to end: UI → HTTP/WebSocket → service → database.

### Play
* **Real chess rules** through `chess.js` — castling, en passant, promotion, stalemate, threefold
  repetition, fifty-move rule, insufficient material.
* **Server-authoritative moves.** The client never decides legality; `applyMove()` validates turn,
  clocks and rules, then writes the move and FEN.
* **Online play** with matchmaking that widens by 60 rating points every 3 seconds (any rating after
  20 s; unrated games ignore rating entirely) and a long-poll fallback that survives WebSocket loss.
* **Computer play** with five genuine difficulty levels (`beginner` … `expert`: depth 1–5,
  blunder probabilities, capture quiescence) powered by the in-house engine in `packages/engine`.
* **Local hot-seat play**, private invite links, direct challenges, resign / draw offer / abort.
* **Clocks** tick server-side; a timeout finishes the game and updates ratings.
* **Game review** with per-ply evaluation, classification (brilliant → blunder), accuracy, opening
  name and written insights; PGN import and export.

### Learn
* **How to Play Academy** — board basics, piece recognition, movement, special moves, capturing and
  tactics, check and checkmate, draws, opening principles and a first full game, with per-lesson
  knowledge tests, progress tracking and six executable practice exercises on a live board.
* **Learning centre** with courses, lessons and completion tracking.
* **Puzzles** whose solutions are verified by the test suite; hints, reveal, streaks and stats.
* **Opening explorer** with plans, traps, step-through board and a saved repertoire.

### Compete
* **Glicko-2 ratings** per time control (bullet/blitz/rapid/classical) with RD, volatility and peak.
  Divisions (Bronze → Master) are display labels and are **not** official chess titles.
* **Tournaments**: Swiss, single/double elimination, round robin and arena — pairings, Buchholz
  tiebreaks, automatic game creation, organiser tools and manual result entry.
* **Leaderboards** for players, clubs and countries, computed from stored ratings only.

### Community & improvement
* Friends, blocking, direct messages, clubs with roles and announcements, activity feeds.
* Achievements driven by real milestones (never purchasable).
* **AI coach** — a rule-based educational assistant answering from a curated knowledge base plus
  the player's own statistics. It **refuses** to analyse a position in your active rated game (HTTP
  403 enforced server-side), so it cannot be used to cheat.
* Coaching centre with profiles, assignments, submissions and feedback.

### Platform
* Session auth (scrypt, server-side sessions, HTTP-only cookies), email verification and password
  reset with real SMTP when configured.
* Library of support articles/FAQ, legal pages, subscription plans with an honest "integration
  required" response when no payment provider is configured.
* Admin dashboard: live counters, 14-day charts, user management, moderation queue with written
  resolutions, content approval, tournament oversight, platform settings and an audit log.
* 42 automated tests, typechecked frontend and backend, dependency audit clean.

## Deliberately not simulated

| Area | Status |
| --- | --- |
| Card payments | Requires `STRIPE_SECRET_KEY`. Without it checkout returns **503 `integrationRequired`** and no charge is attempted. |
| Transactional email | Works with `SMTP_URL`; otherwise links are logged (console mode) and the API says so. |
| Push notifications / native apps | Not implemented. |
| OAuth / SSO | Not implemented; email + password only. |
| Stockfish-grade analysis | The engine is an in-house negamax with alpha-beta and quiescence, capped at depth 5. It is honest about that in the UI. |
| Student discounts, referral programme | Planned, explicitly marked as not implemented. |

## Architecture

```
apps/web        React 18 + Vite 7 + React Router 7 single-page client
  src/pages       one page per product area (38 pages)
  src/components  design-system primitives, board, layout, markdown renderer
  src/hooks       websocket game sync, synthesised chess sounds
apps/server     Express + better-sqlite3 API, WebSocket hub, services, routes
packages/engine chess rules (chess.js), evaluation, search, opening book, game analysis
db/schema.sql   40-table relational schema (see docs/SCHEMA.md)
docs            API.md · SCHEMA.md · DEPLOYMENT.md
```

The move pipeline is deliberately boring: browser sends coordinates → `POST /api/games/:id/move` →
service validates and persists → payload is pushed over `/ws` and returned in the response. Nothing
important happens only in the browser.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | API + Vite dev server together |
| `npm run build` | Build the client into `apps/web/dist` |
| `npm start` | Serve API + built client on `:4000` |
| `npm run seed` | Demo accounts, reference content, demo games |
| `npm test` | 42-test suite (rules, service, auth, puzzles, matchmaking, tournaments, DB) |
| `npm run typecheck` | `tsc --noEmit` for server and web (unused-code checks on) |

## Documentation

* [`docs/API.md`](docs/API.md) — every HTTP and WebSocket endpoint, access level and failure mode.
* [`docs/SCHEMA.md`](docs/SCHEMA.md) — every table, relationship and PostgreSQL porting notes.
* [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) — environment variables, Docker, nginx, backups, scaling,
  security checklist and post-deploy verification.
* In-app: `/help` (FAQ + support), `/legal` (terms, privacy, fair play, minors, cookies, accessibility).

## Design

Charcoal base (`#090909` / `#151515` / `#1C1C24` / `#24242D`) with a purple and violet accent
(`#7925D9`, `#9333EA`, `#CBA7FF`), white and muted-grey text, Inter/Manrope typography. The piece set
is original vector art drawn for this project (ivory vs charcoal with a violet rim), and every icon
comes from `lucide-react`. Layout is a fixed sidebar on desktop and a bottom navigation bar on
mobile, with a global search in the top bar.

## Licence

Code in this repository was written for SPEED CHESS. Third-party dependencies keep their own
licences; the brand, logo and interface are original and do not reproduce any other platform.
