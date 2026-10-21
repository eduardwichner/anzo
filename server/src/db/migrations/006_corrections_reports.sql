-- 006: legacy attempts, admin content corrections, the children's reports and one-time messages to a child.

-- 1 = the attempt answered an earlier version of its exercise (other items now, or the exercise was hidden).
-- Set from the content by markLegacyAttempts() (server/src/lib/legacy.js) at every start and content reload.
-- My mistakes and accuracy statistics skip legacy attempts; lesson, XP and word strengths are unaffected.
ALTER TABLE attempts ADD COLUMN legacy INTEGER NOT NULL DEFAULT 0 CHECK (legacy IN (0, 1));

-- A correction made in Admin → Corrections, applied by the content job (scripts/jobs/content-job.js, the developer account).
-- kind: edit (texts / acceptAlso), hide (an exercise), undo (git revert of an applied correction's commit).
-- The service writes the request to the spool; the job's result comes back the same way and is recorded here.
CREATE TABLE content_corrections (
  id              INTEGER PRIMARY KEY,
  kind            TEXT    NOT NULL CHECK (kind IN ('edit', 'hide', 'undo')),
  author          TEXT    NOT NULL,          -- admin username (kept if the account is deleted later)
  track           TEXT    NOT NULL,
  pack_id         TEXT    NOT NULL,
  unit_id         TEXT    NOT NULL,
  target_kind     TEXT    NOT NULL CHECK (target_kind IN ('vocabulary', 'sentence', 'exercise')),
  target_id       TEXT    NOT NULL,
  before_json     TEXT    NOT NULL,          -- the edited fields before
  after_json      TEXT    NOT NULL,          -- the edited fields after
  reason          TEXT    NOT NULL DEFAULT '',
  summary         TEXT    NOT NULL,          -- one line: what changed (commit message, history)
  undo_of         INTEGER NULL REFERENCES content_corrections(id),
  report_exercise TEXT    NULL,              -- "Fix" from the inbox: open reports of this exercise close when applied
  status          TEXT    NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'applied', 'rejected')),
  result_reason   TEXT    NULL,              -- plain sentence for the admin
  detail          TEXT    NULL,              -- technical output for diagnostics
  commit_hash     TEXT    NULL,
  undone_by       INTEGER NULL,
  created_at      TEXT    NOT NULL,
  finished_at     TEXT    NULL
);
CREATE INDEX content_corrections_status ON content_corrections (status, id);

-- A child's 🚩 report of an exercise (after checking). Open reports of the same exercise form one inbox group.
CREATE TABLE content_reports (
  id            INTEGER PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exercise_id   TEXT    NOT NULL,
  lesson_id     TEXT    NOT NULL,
  pack_id       TEXT    NOT NULL,
  unit_id       TEXT    NOT NULL,
  track         TEXT    NOT NULL,
  reason        TEXT    NOT NULL CHECK (reason IN ('native', 'target', 'audio', 'other')),
  note          TEXT    NOT NULL DEFAULT '',
  snapshot      TEXT    NOT NULL,            -- JSON: the exercise as served, the child's answer, the correct answer, clips
  ui_lang       TEXT    NOT NULL,
  status        TEXT    NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  resolution    TEXT    NULL CHECK (resolution IN ('correct', 'fixed', 'dismissed')),
  correction_id INTEGER NULL,
  created_at    TEXT    NOT NULL,
  updated_at    TEXT    NOT NULL,
  closed_at     TEXT    NULL
);
CREATE INDEX content_reports_open ON content_reports (status, exercise_id);
CREATE INDEX content_reports_user ON content_reports (user_id, exercise_id, updated_at);

-- A message the child sees once on Home (with the mascot): "it was correct" or "your report fixed a mistake".
CREATE TABLE child_messages (
  id          INTEGER PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        TEXT    NOT NULL CHECK (kind IN ('checked', 'fixed')),
  text        TEXT    NOT NULL,
  report_id   INTEGER NULL,
  exercise_id TEXT    NULL,
  created_at  TEXT    NOT NULL,
  shown_at    TEXT    NULL
);
CREATE INDEX child_messages_user ON child_messages (user_id, shown_at);
