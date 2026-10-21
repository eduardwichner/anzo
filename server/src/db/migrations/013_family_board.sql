-- Family board: this week's XP of every learner side by side, a family goal, last week's crown.
-- show_on_board: the account's own switch (Settings → Show me on the family board), default on.
-- board_hidden: the admin hides an account from the board (Admin → Users), default off. Shown = both allow it.
-- app_settings: app-wide values the admin sets (key familyGoal = the family's XP target per week; absent = 500).
-- No user_id: the admin's username is kept as text (like problem_acks.acked_by).
ALTER TABLE users ADD COLUMN show_on_board INTEGER NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN board_hidden INTEGER NOT NULL DEFAULT 0;
CREATE TABLE app_settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  updated_by  TEXT NOT NULL DEFAULT ''
);
