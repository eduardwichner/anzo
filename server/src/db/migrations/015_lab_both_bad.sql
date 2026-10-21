-- anzo:foreign-keys-off
-- Admin → Audio lab: a fourth vote, "both bad" (the current clip and the new one are both wrong), for a set
-- checked before a release. The vote column has a CHECK, so the table is rebuilt (docs/developer/extending.md).
CREATE TABLE lab_votes_new (
  user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  set_id    TEXT NOT NULL,
  row_id    TEXT NOT NULL,
  vote      TEXT NOT NULL CHECK (vote IN ('better', 'same', 'worse', 'both-bad')),
  voted_at  TEXT NOT NULL,
  PRIMARY KEY (user_id, set_id, row_id)
);
INSERT INTO lab_votes_new (user_id, set_id, row_id, vote, voted_at) SELECT user_id, set_id, row_id, vote, voted_at FROM lab_votes;
DROP TABLE lab_votes;
ALTER TABLE lab_votes_new RENAME TO lab_votes;
