-- Admin → Listen check → Compare round (since removed): one row per vote on a
-- row of a compare round (audio/compare/round.json, built by scripts/audio-compare/build.js) — the version heard as best
-- (`slot` A–D as shown, `version` behind it) or none of them (`slot` 'none': all bad). The latest vote per row counts
-- (the listeners vote together); the versions' names are shown only once every row has a vote.
CREATE TABLE listen_compare (
  id        INTEGER PRIMARY KEY,
  user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  round     TEXT    NOT NULL,
  row       INTEGER NOT NULL,
  slot      TEXT    NOT NULL CHECK (slot IN ('A', 'B', 'C', 'D', 'none')),
  version   TEXT,
  voted_at  TEXT    NOT NULL
);
CREATE INDEX listen_compare_round ON listen_compare (round, row);
