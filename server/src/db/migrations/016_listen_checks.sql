-- Admin → Listen check: one row per clip heard — OK or
-- Bad (with an optional reason and note). `file` is the clip as it was heard (content-addressed: a re-rendered clip is a new
-- file); a Bad file that is still the clip's current file is in the fix queue (audio:check flags it `listen`, audio:fix
-- renders it again), and the new file is served again before the clip counts as fixed.
CREATE TABLE listen_checks (
  id          INTEGER PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  file        TEXT NOT NULL,
  track       TEXT NOT NULL,
  speed       TEXT NOT NULL,
  text        TEXT NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('word', 'short', 'sentence', 'text')),
  rerendered  INTEGER NOT NULL DEFAULT 0,
  verdict     TEXT NOT NULL CHECK (verdict IN ('ok', 'bad')),
  reason      TEXT CHECK (reason IS NULL OR reason IN ('babble', 'cut-off', 'wrong-word', 'wrong-pronunciation', 'other')),
  note        TEXT,
  heard_at    TEXT NOT NULL
);
CREATE INDEX listen_checks_file ON listen_checks (file);
