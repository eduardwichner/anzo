-- anzo:foreign-keys-off
-- 008_drop_user_track: users.track and users.start_pack are replaced by user_courses + users.active_track (007).
-- SQLite cannot drop a column named in a table CHECK, so the table is rebuilt (the runner switches foreign keys off for
-- this file, so dropping the old table does not cascade, and runs PRAGMA foreign_key_check before committing).
-- native_lang loses its CHECK: the list of native languages lives in one place, server/src/lib/langs.js (validated by
-- the API and the integrity checker), so adding one needs no migration.

CREATE TABLE users_new (
  id                   INTEGER PRIMARY KEY,
  username             TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  password_hash        TEXT    NOT NULL,
  role                 TEXT    NOT NULL CHECK (role IN ('child', 'admin')),
  display_name         TEXT    NOT NULL,
  avatar               TEXT    NULL,
  created_at           TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  must_change_password INTEGER NOT NULL DEFAULT 0 CHECK (must_change_password IN (0, 1)),
  ui_lang              TEXT    NOT NULL DEFAULT 'nl' CHECK (ui_lang IN ('nl', 'en')),
  native_lang          TEXT    NOT NULL DEFAULT 'nl',
  avatar_bg            TEXT    NULL,
  show_on_login        INTEGER NOT NULL DEFAULT 0 CHECK (show_on_login IN (0, 1)),
  can_self_reset       INTEGER NOT NULL DEFAULT 0 CHECK (can_self_reset IN (0, 1)),
  daily_goal           INTEGER NULL CHECK (daily_goal IN (20, 50, 100)),
  sound_effects        INTEGER NOT NULL DEFAULT 1 CHECK (sound_effects IN (0, 1)),
  active_track         TEXT    NULL,
  can_self_enroll      INTEGER NOT NULL DEFAULT 1 CHECK (can_self_enroll IN (0, 1)),
  audience             TEXT    NOT NULL DEFAULT 'child' CHECK (audience IN ('child', 'adult'))
);

INSERT INTO users_new (id, username, password_hash, role, display_name, avatar, created_at, must_change_password, ui_lang,
                       native_lang, avatar_bg, show_on_login, can_self_reset, daily_goal, sound_effects, active_track,
                       can_self_enroll, audience)
  SELECT id, username, password_hash, role, display_name, avatar, created_at, must_change_password, ui_lang,
         native_lang, avatar_bg, show_on_login, can_self_reset, daily_goal, sound_effects, active_track,
         can_self_enroll, audience
  FROM users;

DROP TABLE users;
ALTER TABLE users_new RENAME TO users;
