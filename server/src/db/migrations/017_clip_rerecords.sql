-- Admin → Inbox / Corrections → "Record again": one row per request to record a single clip again without an LLM.
-- The content job makes a new take of the clip (the next seeded take, the current method: carrier, lexicon, pause shaping),
-- checks it and leaves the clip as it was (status review); the admin hears old and new and chooses: Keep new (the job writes
-- the take into content/audio-overrides.json, commits it and reloads the app: kept) or Keep old (the new file is deleted:
-- dropped). `entry` is the override that makes the new take; `unpin` removes a pin (an earlier choice by ear) with it.
CREATE TABLE clip_rerecords (
  id              INTEGER PRIMARY KEY,
  author          TEXT    NOT NULL,
  track           TEXT    NOT NULL,
  speed           TEXT    NOT NULL,
  text            TEXT    NOT NULL,
  old_file        TEXT    NOT NULL,
  new_file        TEXT,
  entry_json      TEXT,
  unpin           INTEGER NOT NULL DEFAULT 0 CHECK (unpin IN (0, 1)),
  flags_old       TEXT,
  flags_new       TEXT,
  status          TEXT    NOT NULL DEFAULT 'making'
                  CHECK (status IN ('making', 'review', 'keeping', 'kept', 'dropping', 'dropped', 'failed')),
  result_reason   TEXT,
  detail          TEXT,
  commit_hash     TEXT,
  report_exercise TEXT,
  created_at      TEXT    NOT NULL,
  finished_at     TEXT
);
CREATE INDEX clip_rerecords_clip ON clip_rerecords (track, speed, text, status);
