-- The lesson run an attempt belongs to (the client's startedAt of that run; NULL before 009 and for practice attempts,
-- which have practice_session_id). Item strength rises at most once per item per run and falls at most once.
ALTER TABLE attempts ADD COLUMN run TEXT;
CREATE INDEX IF NOT EXISTS attempts_user_run ON attempts (user_id, run);
