# SPEED CHESS — database schema

The canonical DDL is [`db/schema.sql`](../db/schema.sql) (531 lines, 40 tables). It is written in
SQLite dialect and is applied idempotently at boot by `apps/server/src/db/index.ts` (`migrate()`), so
a fresh clone creates its database on first start. Every statement uses `CREATE TABLE IF NOT EXISTS`,
which keeps startup safe across restarts.

* **Engine:** SQLite via `better-sqlite3` (synchronous, single-writer).
* **File:** `data/speed-chess.db` by default (`DATABASE_FILE` overrides it; tests use `data/test.db`).
* **Integrity:** `PRAGMA foreign_keys = ON`, `PRAGMA journal_mode = WAL`.
* **Migrations:** `schema_migrations` records applied versions; additive migrations live in
  `apps/server/src/db/index.ts`.

## 1. Identity and accounts

| Table | Purpose | Key columns |
| --- | --- | --- |
| `users` | One row per account. All profile, privacy and board preferences live here. | `id` PK, `username_lower` UNIQUE, `email_lower` UNIQUE, `password_hash` (scrypt), `role` ∈ player/coach/organizer/moderator/admin, `status` ∈ active/restricted/suspended/deleted, `plan` ∈ free/premium/pro |
| `sessions` | Server-side session records; the cookie only carries an opaque token whose SHA-256 is stored. | `token_hash`, `user_id` FK, `expires_at`, `revoked_at`, `ip`, `user_agent` |
| `password_resets` | Single-use reset tokens, stored hashed, with expiry. | `token_hash` UNIQUE, `used_at` |
| `ratings` | One row per player per time control (Glicko-2). | PK `(user_id, category)`, `rating`, `rd`, `volatility`, `games`, `peak` |
| `rating_history` | Immutable log of every rating change, used by the sparklines and analytics. | `category`, `rating`, `delta`, `game_id` |
| `app_settings` | Key/value store for platform settings and per-user onboarding answers. | `key` PK, `value` (JSON text) |

`users.birth_year` is optional and never exposed publicly; it is only used to apply the stricter
defaults for minors described in `docs/API.md` and the Legal page.

## 2. Games

| Table | Purpose | Notes |
| --- | --- | --- |
| `games` | One row per game, including computer, local and imported games. | `mode` ∈ online/computer/local/tournament, `status` ∈ pending/active/finished/aborted, `result` ∈ white/black/draw, `rated`, `category`, `initial_seconds`, `increment`, `fen`, `pgn`, `turn`, `white_clock_ms`, `black_clock_ms`, `invite_code`, `accuracy_white/black` |
| `moves` | Every ply, with the resulting FEN and both clocks. | PK `(game_id, ply)`, `san`, `uci`, `fen_after`, `is_check`, `is_capture` |
| `game_analysis` | Cache of the engine review, one JSON payload per game. | PK `game_id` |

`games.black_id` is `NULL` for computer games — the engine is not a user. Local games store the
two player names in `white_name`/`black_name` and keep `rated = 0`. Imported PGNs are stored with
`termination = 'imported'` and `is_private = 1`, and never touch ratings.

## 3. Learning

| Table | Purpose |
| --- | --- |
| `courses` | Course metadata: `slug`, `title`, `level`, `summary`, `description`, `icon`, `minutes`, `published`. |
| `lessons` | Lesson body (markdown), optional demonstration `fen`, `highlights`, `quiz` (JSON), `order_index`, `published`. |
| `lesson_progress` | PK `(user_id, lesson_id)`, `status` ∈ started/completed, `quiz_score`, `quiz_total`. |
| `puzzles` | `fen`, `solution` (SAN list, JSON), `rating`, `themes` (JSON), `difficulty`, `side_to_move`, `explanation`. |
| `puzzle_attempts` | One row per attempt: `solved`, `hints_used`, `ms`, `daily_date`. |
| `openings` | Opening library: `eco`, `name`, `family`, `moves`, `plans`, `traps`, `side`. |
| `repertoire` | PK `(user_id, opening_id)` — saved openings. |

Every seeded puzzle solution is replayed against `chess.js` by the test suite
(`every puzzle solution is a legal move sequence`), so no unverifiable puzzle can ship.

## 4. Competition

| Table | Purpose |
| --- | --- |
| `tournaments` | `format` ∈ swiss / single-elimination / double-elimination / round-robin / arena, `category`, `rounds`, clock, `status` ∈ upcoming/ongoing/completed/cancelled, `organizer_id`, `rules`, `prize`, `is_private`. |
| `registrations` | PK `(tournament_id, user_id)`, `status` ∈ registered/withdrawn, `seed`, `points`, `tiebreak`. |
| `pairings` | `round`, `board`, `white_id`, `black_id`, `game_id`, `result`. |
| `challenges` | Direct player challenges: `from_id`, `to_id`, clock, `rated`, `status` ∈ pending/accepted/declined/expired. |

Swiss pairings never repeat an opponent within an event; this is asserted by the test
`Swiss pairing never repeats an opponent within a round`.

## 5. Community

| Table | Purpose |
| --- | --- |
| `friendships` | `requester_id`, `addressee_id`, `status` ∈ pending/accepted/declined/blocked. Blocking is enforced in messaging and challenges. |
| `messages` | Direct messages with `read_at` for unread counts. |
| `clubs` | `slug`, `name`, `description`, `country`, `is_private`, `owner_id`. |
| `club_members` | PK `(club_id, user_id)`, `role` ∈ owner/moderator/member, `status` ∈ active/pending/banned. |
| `club_announcements` | Posts from club managers. |
| `activity` | Per-user activity feed used by the friends timeline. |
| `achievements` / `user_achievements` | Achievement catalogue (`target`, `tier`, `category`) and per-user `progress`/`unlocked_at`. |

## 6. Coaching, content and commerce

| Table | Purpose |
| --- | --- |
| `coach_profiles` | PK `user_id`: `headline`, `expertise`, `languages`, `hourly_rate`, `accepting`, `verified`. |
| `assignments` | Coach → student work: `title`, `instructions`, `puzzle_ids`, `due_at`, `status`, `submission`, `feedback`. |
| `articles` | Content centre: `slug`, `title`, `summary`, `body` (markdown), `category`, `author_id`, `status` ∈ draft/pending/published/rejected, `views`. |
| `plans` | Subscription catalogue: `price_cents`, `currency`, `interval`, `features` (JSON). |
| `subscriptions` | Provider subscription reference, `status`, `current_period_end`. |
| `payments` | Provider payment references only — **no card data is ever stored**. |

## 7. Trust and safety

| Table | Purpose |
| --- | --- |
| `reports` | Player reports: `target_type`, `target_id`, `reason`, `details`, `status` ∈ open/reviewing/actioned/dismissed, `resolution`, `resolved_by`. |
| `audit_logs` | Append-only record of staff and security actions: `actor_id`, `action`, `target_type`, `target_id`, `details`, `ip`. |
| `announcements` | Platform-wide banners with `level` ∈ info/success/warning. |
| `notifications` | In-app notifications with `read_at` and a deep `link`. |
| `support_tickets` | Help-centre messages, optionally linked to a user. |

## 8. Indexes

Indexes cover every foreign key used in a hot path plus the leaderboard and history queries:
`idx_games_white`, `idx_games_black`, `idx_games_status`, `idx_moves_game`, `idx_ratings_category`,
`idx_rating_history_user`, `idx_pairings_tournament`, `idx_notifications_user`,
`idx_messages_pair`, and `idx_activity_user`.

## 9. Portability to PostgreSQL

The schema avoids SQLite-only constructs except:

1. `TEXT` timestamps with `DEFAULT (datetime('now'))` → replace with `timestamptz DEFAULT now()`.
2. `INTEGER` booleans (`0`/`1`) → `boolean`.
3. `AUTOINCREMENT`-free `TEXT` primary keys are already portable.
4. JSON is stored as `TEXT`; in PostgreSQL use `jsonb` and swap `JSON.parse` for native reads.

`apps/server/src/db/index.ts` exposes a single `db` handle, so a `pg` adapter only needs to
implement `prepare(...).run/get/all`. No query in the application uses SQLite-specific syntax beyond
`ON CONFLICT ... DO UPDATE`, which PostgreSQL also supports.

## 10. Seed data

`seedReferenceContent()` runs automatically at boot and is idempotent. It inserts the courses,
lessons, puzzles, openings, achievements and plans. `npm run seed` additionally creates the demo
accounts and plays a handful of real games through the game service so that leaderboards, histories
and analytics contain genuine records rather than fabricated numbers.
