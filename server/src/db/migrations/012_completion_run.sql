-- A lesson completion keeps the run key the client sent (startedAt, as attempts.run), so a
-- retried completion of the same run is recognised even when its duration was clamped (> 60 min, or a clock ahead) —
-- the ±2 s rule on the clamped start stays for rows without a run. Practice answers look up their session by
-- (practice_session_id, exercise_id) without scanning the learner's attempts.
ALTER TABLE lesson_completions ADD COLUMN run TEXT;
CREATE INDEX IF NOT EXISTS lesson_completions_run ON lesson_completions (user_id, lesson_id, run);
CREATE INDEX IF NOT EXISTS attempts_practice ON attempts (practice_session_id, exercise_id);
