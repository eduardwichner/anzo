-- 001_init: users, stats, progress, attempts, item strength.
-- The `sessions` table is created by better-sqlite3-session-store at startup.

CREATE TABLE users (
  id             INTEGER PRIMARY KEY,
  username       TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  password_hash  TEXT    NOT NULL,
  role           TEXT    NOT NULL CHECK (role IN ('child', 'admin')),
  display_name   TEXT    NOT NULL,
  track          TEXT    NULL CHECK (track IN ('en', 'fr')),
  avatar         TEXT    NULL,
  created_at     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (role = 'admin' OR track IS NOT NULL)
);

CREATE TABLE user_stats (
  user_id          INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  xp               INTEGER NOT NULL DEFAULT 0,
  streak_current   INTEGER NOT NULL DEFAULT 0,
  streak_best      INTEGER NOT NULL DEFAULT 0,
  last_active_date TEXT    NULL          -- 'YYYY-MM-DD' in Europe/Amsterdam
);

CREATE TABLE lesson_progress (
  user_id            INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id          TEXT    NOT NULL,
  status             TEXT    NOT NULL DEFAULT 'done' CHECK (status IN ('done')),
  best_score         INTEGER NOT NULL,
  times_completed    INTEGER NOT NULL DEFAULT 1,
  first_completed_at TEXT    NOT NULL,
  last_completed_at  TEXT    NOT NULL,
  PRIMARY KEY (user_id, lesson_id)
);

CREATE TABLE attempts (
  id           INTEGER PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id    TEXT    NOT NULL,
  exercise_id  TEXT    NOT NULL,
  item_ids     TEXT    NOT NULL,          -- JSON array of vocabulary/sentence ids
  correct      INTEGER NOT NULL CHECK (correct IN (0, 1)),
  given_answer TEXT    NULL,              -- JSON of what the child submitted
  created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX attempts_user_lesson ON attempts (user_id, lesson_id);

CREATE TABLE item_strength (
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id        TEXT    NOT NULL,
  strength       INTEGER NOT NULL DEFAULT 0 CHECK (strength BETWEEN 0 AND 5),
  last_seen_at   TEXT    NOT NULL,
  next_review_at TEXT    NOT NULL,
  PRIMARY KEY (user_id, item_id)
);
CREATE INDEX item_strength_review ON item_strength (user_id, next_review_at);
