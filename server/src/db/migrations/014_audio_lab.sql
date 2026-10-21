-- Admin → Audio lab (since removed): one vote per admin and sample row, "is the variant better, the same or
-- worse than the current clip?". The samples live outside the app (/var/lib/anzo-lab); a row id names one of them.
CREATE TABLE lab_votes (
  user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  set_id    TEXT NOT NULL,
  row_id    TEXT NOT NULL,
  vote      TEXT NOT NULL CHECK (vote IN ('better', 'same', 'worse')),
  voted_at  TEXT NOT NULL,
  PRIMARY KEY (user_id, set_id, row_id)
);
