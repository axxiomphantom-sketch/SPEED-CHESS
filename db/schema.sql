-- ============================================================
-- SPEED CHESS — relational database schema (SQLite dialect)
-- Portable to PostgreSQL with minor type changes (see docs/SCHEMA.md)
-- ============================================================
PRAGMA foreign_keys = ON;

-- ---------- Identity & accounts ----------
CREATE TABLE IF NOT EXISTS users (
  id                TEXT PRIMARY KEY,
  username          TEXT NOT NULL UNIQUE,
  username_lower    TEXT NOT NULL UNIQUE,
  email             TEXT NOT NULL UNIQUE,
  email_lower       TEXT NOT NULL UNIQUE,
  email_verified    INTEGER NOT NULL DEFAULT 0,
  verification_token TEXT,
  password_hash     TEXT NOT NULL,
  -- Supabase auth.users.id when this account is managed by Supabase Auth.
  -- Credentials then live in Supabase; this row only owns the chess data.
  supabase_user_id  TEXT UNIQUE,
  role              TEXT NOT NULL DEFAULT 'player' CHECK (role IN ('player','coach','organizer','moderator','admin')),
  status            TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','restricted','suspended','deleted')),
  country           TEXT,
  avatar_url        TEXT,
  bio               TEXT,
  title             TEXT,                        -- self-declared/FIDE-style title, informational only
  birth_year        INTEGER,
  onboarded         INTEGER NOT NULL DEFAULT 0,
  plan              TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free','premium','pro')),
  plan_renews_at    TEXT,
  board_theme       TEXT NOT NULL DEFAULT 'violet',
  piece_set         TEXT NOT NULL DEFAULT 'classic',
  show_coordinates  INTEGER NOT NULL DEFAULT 1,
  show_legal_moves  INTEGER NOT NULL DEFAULT 1,
  sound_enabled     INTEGER NOT NULL DEFAULT 1,
  reduced_motion    INTEGER NOT NULL DEFAULT 0,
  language          TEXT NOT NULL DEFAULT 'en',
  allow_friend_requests INTEGER NOT NULL DEFAULT 1,
  allow_messages    INTEGER NOT NULL DEFAULT 1,
  show_country      INTEGER NOT NULL DEFAULT 1,
  show_activity     INTEGER NOT NULL DEFAULT 1,
  notify_games      INTEGER NOT NULL DEFAULT 1,
  notify_social     INTEGER NOT NULL DEFAULT 1,
  notify_learning   INTEGER NOT NULL DEFAULT 1,
  notify_tournaments INTEGER NOT NULL DEFAULT 1,
  last_seen_at      TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

-- Ratings: one row per user per time control
CREATE TABLE IF NOT EXISTS ratings (
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category    TEXT NOT NULL CHECK (category IN ('bullet','blitz','rapid','classical')),
  rating      REAL NOT NULL DEFAULT 1200,
  rd          REAL NOT NULL DEFAULT 350,     -- Glicko-2 rating deviation
  volatility  REAL NOT NULL DEFAULT 0.06,
  games       INTEGER NOT NULL DEFAULT 0,
  peak        REAL NOT NULL DEFAULT 1200,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, category)
);

CREATE TABLE IF NOT EXISTS rating_history (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category   TEXT NOT NULL,
  rating     REAL NOT NULL,
  delta      REAL NOT NULL,
  game_id    TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_rating_history_user ON rating_history(user_id, created_at);

CREATE TABLE IF NOT EXISTS sessions (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash   TEXT NOT NULL UNIQUE,
  user_agent   TEXT,
  ip           TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at   TEXT NOT NULL,
  revoked_at   TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS password_resets (
  token_hash TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  used_at    TEXT
);

-- ---------- Games ----------
CREATE TABLE IF NOT EXISTS games (
  id             TEXT PRIMARY KEY,
  white_id       TEXT REFERENCES users(id) ON DELETE SET NULL,
  black_id       TEXT REFERENCES users(id) ON DELETE SET NULL,
  owner_id       TEXT REFERENCES users(id) ON DELETE SET NULL, -- who created it: lets the creator review a local/computer game
  white_name     TEXT NOT NULL,
  black_name     TEXT NOT NULL,
  white_rating   REAL,
  black_rating   REAL,
  mode           TEXT NOT NULL CHECK (mode IN ('computer','online','local','tournament')),
  rated          INTEGER NOT NULL DEFAULT 0,
  category       TEXT NOT NULL DEFAULT 'rapid' CHECK (category IN ('bullet','blitz','rapid','classical')),
  initial_seconds INTEGER NOT NULL DEFAULT 600,
  increment      INTEGER NOT NULL DEFAULT 0,
  difficulty     TEXT,                       -- computer opponent level
  fen            TEXT NOT NULL,
  pgn            TEXT,
  status         TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('pending','active','finished','aborted')),
  result         TEXT CHECK (result IN ('white','black','draw')),
  termination    TEXT,                       -- checkmate, resignation, timeout, stalemate, draw, insufficient, repetition, fifty-move, agreement, abandoned
  white_clock_ms INTEGER,
  black_clock_ms INTEGER,
  turn           TEXT,
  opening_name   TEXT,
  accuracy_white REAL,
  accuracy_black REAL,
  tournament_id  TEXT REFERENCES tournaments(id) ON DELETE SET NULL,
  is_private     INTEGER NOT NULL DEFAULT 0,
  invite_code    TEXT,
  started_at     TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at    TEXT,
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_games_white ON games(white_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_games_black ON games(black_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_games_status ON games(status);
CREATE INDEX IF NOT EXISTS idx_games_invite ON games(invite_code);

CREATE TABLE IF NOT EXISTS moves (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id     TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  ply         INTEGER NOT NULL,
  san         TEXT NOT NULL,
  uci         TEXT NOT NULL,
  fen_after   TEXT NOT NULL,
  clock_white_ms INTEGER,
  clock_black_ms INTEGER,
  eval_cp     INTEGER,
  is_check    INTEGER NOT NULL DEFAULT 0,
  is_capture  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (game_id, ply)
);
CREATE INDEX IF NOT EXISTS idx_moves_game ON moves(game_id, ply);

CREATE TABLE IF NOT EXISTS game_analysis (
  game_id    TEXT PRIMARY KEY REFERENCES games(id) ON DELETE CASCADE,
  payload    TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------- Learning content ----------
CREATE TABLE IF NOT EXISTS courses (
  id          TEXT PRIMARY KEY,
  slug        TEXT NOT NULL UNIQUE,
  title       TEXT NOT NULL,
  level       TEXT NOT NULL CHECK (level IN ('beginner','intermediate','advanced')),
  summary     TEXT NOT NULL,
  description TEXT NOT NULL,
  icon        TEXT,
  minutes     INTEGER NOT NULL DEFAULT 30,
  published   INTEGER NOT NULL DEFAULT 1,
  author_id   TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS lessons (
  id            TEXT PRIMARY KEY,
  course_id     TEXT REFERENCES courses(id) ON DELETE CASCADE,
  slug          TEXT NOT NULL UNIQUE,
  order_index   INTEGER NOT NULL DEFAULT 0,
  title         TEXT NOT NULL,
  level         TEXT NOT NULL DEFAULT 'beginner',
  minutes       INTEGER NOT NULL DEFAULT 6,
  body          TEXT NOT NULL,               -- markdown-lite
  fen           TEXT,                        -- demonstration position
  highlights    TEXT,                        -- JSON array of squares
  quiz          TEXT,                        -- JSON array of questions
  tags          TEXT,
  published     INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_lessons_course ON lessons(course_id, order_index);

CREATE TABLE IF NOT EXISTS lesson_progress (
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id    TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'started' CHECK (status IN ('started','completed')),
  quiz_score   INTEGER,
  quiz_total   INTEGER,
  completed_at TEXT,
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, lesson_id)
);

-- ---------- Puzzles ----------
CREATE TABLE IF NOT EXISTS puzzles (
  id          TEXT PRIMARY KEY,
  fen         TEXT NOT NULL,
  solution    TEXT NOT NULL,                 -- JSON array of SAN moves (odd length: solver moves at even indices)
  rating      INTEGER NOT NULL DEFAULT 1000,
  themes      TEXT NOT NULL DEFAULT '',
  title       TEXT,
  difficulty  TEXT NOT NULL DEFAULT 'easy' CHECK (difficulty IN ('easy','medium','hard')),
  side_to_move TEXT NOT NULL DEFAULT 'w',
  explanation TEXT
);
CREATE INDEX IF NOT EXISTS idx_puzzles_difficulty ON puzzles(difficulty);

CREATE TABLE IF NOT EXISTS puzzle_attempts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  puzzle_id   TEXT NOT NULL REFERENCES puzzles(id) ON DELETE CASCADE,
  solved      INTEGER NOT NULL DEFAULT 0,
  hints_used  INTEGER NOT NULL DEFAULT 0,
  ms          INTEGER,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_puzzle_attempts_user ON puzzle_attempts(user_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_puzzle_daily ON puzzle_attempts(user_id, puzzle_id, substr(created_at,1,10));

-- ---------- Openings ----------
CREATE TABLE IF NOT EXISTS openings (
  id        TEXT PRIMARY KEY,
  eco       TEXT NOT NULL,
  name      TEXT NOT NULL,
  family    TEXT NOT NULL,
  moves     TEXT NOT NULL,                   -- SAN list, space separated
  plans     TEXT NOT NULL,                   -- markdown-lite
  traps     TEXT,
  side      TEXT NOT NULL DEFAULT 'both'
);
CREATE INDEX IF NOT EXISTS idx_openings_family ON openings(family);

CREATE TABLE IF NOT EXISTS repertoire (
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  opening_id TEXT NOT NULL REFERENCES openings(id) ON DELETE CASCADE,
  note       TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, opening_id)
);

-- ---------- Tournaments ----------
CREATE TABLE IF NOT EXISTS tournaments (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  slug          TEXT NOT NULL UNIQUE,
  description   TEXT NOT NULL,
  organizer_id  TEXT REFERENCES users(id) ON DELETE SET NULL,
  format        TEXT NOT NULL CHECK (format IN ('swiss','single-elimination','double-elimination','round-robin','arena')),
  category      TEXT NOT NULL DEFAULT 'blitz',
  rounds        INTEGER NOT NULL DEFAULT 5,
  initial_seconds INTEGER NOT NULL DEFAULT 180,
  increment     INTEGER NOT NULL DEFAULT 2,
  max_players   INTEGER NOT NULL DEFAULT 64,
  starts_at     TEXT NOT NULL,
  registration_deadline TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'upcoming' CHECK (status IN ('draft','upcoming','ongoing','completed','cancelled')),
  is_private    INTEGER NOT NULL DEFAULT 0,
  rules         TEXT,
  prize         TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tournaments_status ON tournaments(status, starts_at);

CREATE TABLE IF NOT EXISTS registrations (
  tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'registered' CHECK (status IN ('registered','withdrawn','removed')),
  seed          INTEGER,
  points        REAL NOT NULL DEFAULT 0,
  tiebreak      REAL NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (tournament_id, user_id)
);

CREATE TABLE IF NOT EXISTS pairings (
  id            TEXT PRIMARY KEY,
  tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  round         INTEGER NOT NULL,
  board         INTEGER NOT NULL DEFAULT 1,
  white_id      TEXT REFERENCES users(id) ON DELETE SET NULL,
  black_id      TEXT REFERENCES users(id) ON DELETE SET NULL,
  game_id       TEXT REFERENCES games(id) ON DELETE SET NULL,
  result        TEXT CHECK (result IN ('white','black','draw','bye')),
  UNIQUE (tournament_id, round, board)
);
CREATE INDEX IF NOT EXISTS idx_pairings_tournament ON pairings(tournament_id, round);

-- ---------- Social ----------
CREATE TABLE IF NOT EXISTS friendships (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  requester_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  addressee_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','blocked')),
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (requester_id, addressee_id)
);
CREATE INDEX IF NOT EXISTS idx_friends_addr ON friendships(addressee_id, status);

CREATE TABLE IF NOT EXISTS messages (
  id          TEXT PRIMARY KEY,
  sender_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body        TEXT NOT NULL,
  read_at     TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_messages_pair ON messages(sender_id, recipient_id, created_at);

-- In-game chat. Kept separate from `messages` on purpose: private messaging is a two-party inbox,
-- whereas game chat is scoped to one game, readable by anyone watching it (spectators), and must
-- disappear from view once the game is over. Overloading `messages` would have meant an optional
-- game_id plus a second set of access rules on the same table.
CREATE TABLE IF NOT EXISTS game_messages (
  id         TEXT PRIMARY KEY,
  game_id    TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_game_messages_game ON game_messages(game_id, created_at);

CREATE TABLE IF NOT EXISTS clubs (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  slug        TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  country     TEXT,
  owner_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
  is_private  INTEGER NOT NULL DEFAULT 0,
  avatar_url  TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS club_members (
  club_id   TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role      TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member','moderator','owner')),
  status    TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('pending','active','banned')),
  joined_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (club_id, user_id)
);

CREATE TABLE IF NOT EXISTS club_announcements (
  id         TEXT PRIMARY KEY,
  club_id    TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  author_id  TEXT REFERENCES users(id) ON DELETE SET NULL,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------- Coaching ----------
CREATE TABLE IF NOT EXISTS coach_profiles (
  user_id     TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  headline    TEXT NOT NULL,
  expertise   TEXT NOT NULL,
  languages   TEXT,
  hourly_rate INTEGER,                       -- in minor units, informational
  currency    TEXT DEFAULT 'USD',
  accepting   INTEGER NOT NULL DEFAULT 1,
  verified    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS assignments (
  id          TEXT PRIMARY KEY,
  coach_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  student_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  instructions TEXT NOT NULL,
  puzzle_ids  TEXT,
  due_at      TEXT,
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','submitted','reviewed')),
  submission  TEXT,
  feedback    TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------- Content ----------
CREATE TABLE IF NOT EXISTS articles (
  id          TEXT PRIMARY KEY,
  slug        TEXT NOT NULL UNIQUE,
  title       TEXT NOT NULL,
  summary     TEXT NOT NULL,
  body        TEXT NOT NULL,
  category    TEXT NOT NULL DEFAULT 'general',
  author_id   TEXT REFERENCES users(id) ON DELETE SET NULL,
  status      TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft','in-review','published','rejected')),
  views       INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------- Progression ----------
CREATE TABLE IF NOT EXISTS achievements (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT NOT NULL,
  icon        TEXT NOT NULL,
  tier        TEXT NOT NULL DEFAULT 'bronze' CHECK (tier IN ('bronze','silver','gold','platinum')),
  category    TEXT NOT NULL DEFAULT 'general',
  target      INTEGER NOT NULL DEFAULT 1,
  metric      TEXT NOT NULL DEFAULT 'manual'
);

CREATE TABLE IF NOT EXISTS user_achievements (
  user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  achievement_id TEXT NOT NULL REFERENCES achievements(id) ON DELETE CASCADE,
  progress       INTEGER NOT NULL DEFAULT 0,
  unlocked_at    TEXT,
  PRIMARY KEY (user_id, achievement_id)
);

CREATE TABLE IF NOT EXISTS notifications (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,
  title      TEXT NOT NULL,
  body       TEXT,
  link       TEXT,
  read_at    TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at DESC);

-- ---------- Commerce ----------
CREATE TABLE IF NOT EXISTS plans (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  price_cents INTEGER NOT NULL,
  currency    TEXT NOT NULL DEFAULT 'USD',
  interval    TEXT NOT NULL DEFAULT 'month',
  features    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id             TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id        TEXT NOT NULL REFERENCES plans(id),
  status         TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('incomplete','active','past_due','cancelled')),
  provider       TEXT NOT NULL DEFAULT 'manual',
  provider_ref   TEXT,
  current_period_end TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  cancelled_at   TEXT
);

CREATE TABLE IF NOT EXISTS payments (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subscription_id TEXT REFERENCES subscriptions(id) ON DELETE SET NULL,
  amount_cents INTEGER NOT NULL,
  currency    TEXT NOT NULL DEFAULT 'USD',
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','succeeded','failed','refunded')),
  provider    TEXT NOT NULL DEFAULT 'manual',
  provider_ref TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------- Trust & safety ----------
CREATE TABLE IF NOT EXISTS reports (
  id           TEXT PRIMARY KEY,
  reporter_id  TEXT REFERENCES users(id) ON DELETE SET NULL,
  target_type  TEXT NOT NULL CHECK (target_type IN ('user','game','club','article','message')),
  target_id_ref TEXT,
  target_id    TEXT NOT NULL,
  reason       TEXT NOT NULL,
  details      TEXT,
  status       TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewing','actioned','dismissed')),
  resolved_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
  resolution   TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id   TEXT,
  action     TEXT NOT NULL,
  target_type TEXT,
  target_id  TEXT,
  meta       TEXT,
  ip         TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);

CREATE TABLE IF NOT EXISTS announcements (
  id         TEXT PRIMARY KEY,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  level      TEXT NOT NULL DEFAULT 'info' CHECK (level IN ('info','success','warning')),
  author_id  TEXT REFERENCES users(id) ON DELETE SET NULL,
  active     INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS activity (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,
  summary    TEXT NOT NULL,
  link       TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_activity_user ON activity(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS challenges (
  id          TEXT PRIMARY KEY,
  from_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category    TEXT NOT NULL DEFAULT 'rapid',
  initial_seconds INTEGER NOT NULL DEFAULT 600,
  increment   INTEGER NOT NULL DEFAULT 0,
  rated       INTEGER NOT NULL DEFAULT 1,
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','expired','cancelled')),
  game_id     TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS support_tickets (
  id         TEXT PRIMARY KEY,
  user_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
  email      TEXT NOT NULL,
  topic      TEXT NOT NULL,
  subject    TEXT NOT NULL,
  body       TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in-progress','resolved')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS schema_migrations (
  id         TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS app_settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
