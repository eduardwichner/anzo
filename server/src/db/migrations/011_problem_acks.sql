-- Admin → System → Problems: "Acknowledge" (one problem) and "Acknowledge all" hide entries until the same problem is
-- logged again. The logs are never edited: an entry is hidden while its key (source + message with digits as #,
-- ops/logs.js problemKey) has an acknowledgement at or after the entry's time. Entries older than 14 days drop off the
-- page anyway; acknowledgements older than 30 days are deleted when a new one is written. No user_id: the admin's
-- username is kept as text (like content_corrections.author).
CREATE TABLE problem_acks (
  key       TEXT PRIMARY KEY,
  acked_at  TEXT NOT NULL,
  acked_by  TEXT NOT NULL,
  message   TEXT NOT NULL DEFAULT ''
);
