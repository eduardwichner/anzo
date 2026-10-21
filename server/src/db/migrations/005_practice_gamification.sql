-- 005: spaced practice ("Oefenen"), daily goal, sound effects, badges, and durations.
-- Badges and reached daily goals that existing history already qualifies for are awarded right after this migration
-- by backfillGamification() (server/src/lib/badges.js), silently; it needs Europe/Amsterdam dates, which SQL lacks.

-- A practice session: exercises picked from lessons the child completed (server/src/practice/). Not tied to a lesson:
-- no lesson_progress row. Created when it starts; finished_at, first_try_correct and xp are set when it is completed.
-- user_stats.xp = SUM(lesson_completions.xp) + SUM(practice_sessions.xp).
CREATE TABLE practice_sessions (
  id                INTEGER PRIMARY KEY,
  user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  track             TEXT    NOT NULL,
  mode              TEXT    NOT NULL CHECK (mode IN ('due', 'mistakes')),
  exercise_ids      TEXT    NOT NULL,          -- JSON array of exercise ids, in play order
  exercises         INTEGER NOT NULL,          -- number of exercises
  started_at        TEXT    NOT NULL,          -- after completion: finished_at minus the clamped duration (1 s … 60 min)
  finished_at       TEXT    NULL,              -- NULL = started, not completed (xp 0)
  first_try_correct INTEGER NULL,
  xp                INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX practice_sessions_user ON practice_sessions (user_id, finished_at);

-- Attempts made in a practice session name it; first_try = the first answer to that exercise in its lesson run or
-- practice session (a retry after a wrong answer is 0). "My mistakes" and accuracy statistics use it.
ALTER TABLE attempts ADD COLUMN practice_session_id INTEGER NULL;
ALTER TABLE attempts ADD COLUMN first_try INTEGER NULL CHECK (first_try IN (0, 1));
CREATE INDEX attempts_user_created ON attempts (user_id, created_at);

-- Existing attempts: a run of a lesson ends with its completion, so an attempt is a first try when the same exercise
-- was not attempted earlier after the previous completion of that lesson.
UPDATE attempts SET first_try = CASE WHEN EXISTS (
  SELECT 1 FROM attempts b
  WHERE b.user_id = attempts.user_id AND b.exercise_id = attempts.exercise_id AND b.id < attempts.id
    AND b.created_at > COALESCE((SELECT MAX(c.completed_at) FROM lesson_completions c
                                 WHERE c.user_id = attempts.user_id AND c.lesson_id = attempts.lesson_id
                                   AND c.completed_at < attempts.created_at), '')
) THEN 0 ELSE 1 END;

-- When the lesson started (sent by the client, stored as completed_at minus the duration clamped to 1 s … 60 min).
-- NULL for completions from before this migration: their duration is unknown.
ALTER TABLE lesson_completions ADD COLUMN started_at TEXT NULL;

-- Daily goal in XP: 20 (Rustig), 50 (Gewoon), 100 (Fanatiek). NULL = not chosen yet (the app asks; 20 applies).
ALTER TABLE users ADD COLUMN daily_goal INTEGER NULL CHECK (daily_goal IN (20, 50, 100));
-- Synthesized sound effects (correct / wrong / lesson done) on or off.
ALTER TABLE users ADD COLUMN sound_effects INTEGER NOT NULL DEFAULT 1 CHECK (sound_effects IN (0, 1));

-- Earned badges (server/src/lib/badges.js; ids stable). silent = awarded by the backfill, never announced.
CREATE TABLE user_badges (
  user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  badge_id  TEXT    NOT NULL,
  earned_at TEXT    NOT NULL,
  silent    INTEGER NOT NULL DEFAULT 0 CHECK (silent IN (0, 1)),
  PRIMARY KEY (user_id, badge_id)
);

-- Days on which the daily goal was reached (Europe/Amsterdam), with the goal and the XP at that moment.
-- Like the streak, it counts days and is never touched by a progress reset.
CREATE TABLE daily_goal_days (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day        TEXT    NOT NULL,          -- 'YYYY-MM-DD'
  goal       INTEGER NOT NULL,
  xp         INTEGER NOT NULL,
  reached_at TEXT    NOT NULL,
  PRIMARY KEY (user_id, day)
);
