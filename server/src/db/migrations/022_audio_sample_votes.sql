-- Admin → Listen check → *Before release*: a sample of new recordings (a renderer or lexicon change, made but not
-- in use yet) heard next to the recordings in use; per row Keep new, Keep old or Neither — try again, with a note. The sample
-- itself is a spool file (status/audio-sample.json, written in an authoring session); only the votes are stored here.
CREATE TABLE audio_sample_votes (
  id INTEGER PRIMARY KEY,
  sample TEXT NOT NULL,
  row_id TEXT NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vote TEXT NOT NULL CHECK (vote IN ('new', 'old', 'neither')),
  note TEXT,
  voted_at TEXT NOT NULL,
  UNIQUE (sample, row_id, user_id)
);
