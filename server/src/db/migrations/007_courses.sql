-- 007_courses: courses decoupled from users. A course is a track of the manifest (with its native language); a learner
-- is enrolled in any number of courses (user_courses) and plays one at a time (users.active_track). "Removing" a course
-- only hides it: progress is kept and re-adding restores it. users.track / users.start_pack are copied here and dropped
-- by 008.

CREATE TABLE user_courses (
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  track       TEXT    NOT NULL,                 -- a track id of content/packs/manifest.json
  start_pack  TEXT    NULL,                     -- the start level in this course (NULL = its first available pack)
  enrolled_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  hidden      INTEGER NOT NULL DEFAULT 0 CHECK (hidden IN (0, 1)),
  PRIMARY KEY (user_id, track)
);

ALTER TABLE users ADD COLUMN active_track TEXT NULL;
ALTER TABLE users ADD COLUMN can_self_enroll INTEGER NOT NULL DEFAULT 1 CHECK (can_self_enroll IN (0, 1));
-- Wording for the few texts that address a child ("… dan kijkt een volwassene ernaar"): adults get adult wording.
ALTER TABLE users ADD COLUMN audience TEXT NOT NULL DEFAULT 'child' CHECK (audience IN ('child', 'adult'));
UPDATE users SET audience = 'adult' WHERE role = 'admin';

-- Every learner's current track becomes their (visible, active) course, with its start level.
INSERT INTO user_courses (user_id, track, start_pack, enrolled_at)
  SELECT id, track, start_pack, created_at FROM users WHERE role = 'child' AND track IS NOT NULL;
UPDATE users SET active_track = track WHERE role = 'child' AND track IS NOT NULL;

-- Progress kept from an earlier track (an admin changed the track; the progress stayed): that course, hidden, so the
-- progress belongs to an enrolment and re-adding the course brings it back. Lesson ids start with "<track>-",
-- item ids with "<track>.".
INSERT OR IGNORE INTO user_courses (user_id, track, start_pack, enrolled_at, hidden)
  SELECT DISTINCT u.id, t.track, NULL, u.created_at, 1
  FROM users u JOIN (
    SELECT user_id, substr(lesson_id, 1, instr(lesson_id, '-') - 1) AS track FROM lesson_progress
    UNION SELECT user_id, substr(lesson_id, 1, instr(lesson_id, '-') - 1) FROM lesson_completions WHERE lesson_id IS NOT NULL
    UNION SELECT user_id, substr(lesson_id, 1, instr(lesson_id, '-') - 1) FROM attempts
    UNION SELECT user_id, substr(item_id, 1, instr(item_id, '.') - 1) FROM item_strength
    UNION SELECT user_id, track FROM practice_sessions
  ) t ON t.user_id = u.id
  WHERE u.role = 'child' AND t.track <> '';
