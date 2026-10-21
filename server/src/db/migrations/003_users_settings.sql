-- 003: per-user interface language, reserved native language, avatars with a background colour,
-- login-grid visibility, the self-service progress-reset permission, and XP per lesson completion.

ALTER TABLE users ADD COLUMN ui_lang TEXT NOT NULL DEFAULT 'nl' CHECK (ui_lang IN ('nl', 'en'));
-- Reserved: the language exercise meanings are shown in (content `{ "nl": … }` objects). Not user-editable yet.
ALTER TABLE users ADD COLUMN native_lang TEXT NOT NULL DEFAULT 'nl' CHECK (native_lang IN ('nl'));
-- users.avatar holds an avatar id (client/src/avatars, server/src/lib/avatars.js); avatar_bg a colour token name.
ALTER TABLE users ADD COLUMN avatar_bg TEXT NULL;
ALTER TABLE users ADD COLUMN show_on_login INTEGER NOT NULL DEFAULT 0 CHECK (show_on_login IN (0, 1));
ALTER TABLE users ADD COLUMN can_self_reset INTEGER NOT NULL DEFAULT 0 CHECK (can_self_reset IN (0, 1));

-- Existing accounts: children appear on the login grid, admins log in by username.
UPDATE users SET show_on_login = 1 WHERE role = 'child';

-- The first version drew two fixed avatars ("kid1", "kid2"); map them into the avatar set.
UPDATE users SET avatar = 'cat', avatar_bg = 'sky' WHERE avatar = 'kid1';
UPDATE users SET avatar = 'rabbit', avatar_bg = 'peach' WHERE avatar = 'kid2';
UPDATE users SET avatar = 'owl', avatar_bg = 'lilac'
  WHERE avatar IS NULL OR avatar NOT IN ('fox', 'owl', 'cat', 'dog', 'bear', 'rabbit', 'panda', 'frog',
                                         'penguin', 'lion', 'mouse', 'koala', 'pig', 'hedgehog', 'robot', 'dino');
UPDATE users SET avatar_bg = 'sky' WHERE avatar_bg IS NULL;

-- The admin works in English; the children keep Dutch.
UPDATE users SET ui_lang = 'en' WHERE username = 'admin';

-- XP per lesson completion. Until now XP was awarded at completion (first-try/retry counts + lesson bonus)
-- and kept only a running total in user_stats.xp; from now on user_stats.xp = SUM(xp) of these rows,
-- so a progress reset can recompute it from what remains.
CREATE TABLE lesson_completions (
  id           INTEGER PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id    TEXT    NULL,   -- NULL: XP earned before this table existed (a total, not attributable to a lesson)
  score        INTEGER NULL,
  xp           INTEGER NOT NULL,
  completed_at TEXT    NOT NULL
);
CREATE INDEX lesson_completions_user ON lesson_completions (user_id, lesson_id);

INSERT INTO lesson_completions (user_id, lesson_id, score, xp, completed_at)
  SELECT user_id, NULL, NULL, xp, strftime('%Y-%m-%dT%H:%M:%fZ', 'now') FROM user_stats WHERE xp > 0;
