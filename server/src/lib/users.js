// User accounts, stats and seeding. All functions take a better-sqlite3 handle.
import bcrypt from 'bcrypt';
import { amsterdamDate, DAILY_GOALS, effectiveStreak } from './gamification.js';
import { AVATAR_BGS, AVATAR_IDS } from './avatars.js';
import { AUDIENCES, NATIVE_LANGS, UI_LANGS } from './langs.js';
import { EXAMPLE_ACCOUNTS } from './seed.js';

export { UI_LANGS };

/** Settings → Theme (migration 021): the device's choice, or a fixed light or dark look. */
export const THEMES = ['system', 'light', 'dark'];
export const BCRYPT_COST = 10;

/** child = a learner (children and adult learners alike; users.audience says which wording they get); admin = whoever runs the installation. */
export const ROLES = ['child', 'admin'];
export const USERNAME_RE = /^[a-z0-9_-]{2,24}$/;
export const DISPLAY_NAME_MAX = 30;

/** courses: the tracks the account is enrolled in (the first is the active one): 'en', or { track, startPack }. */
// The generic seed accounts (config/seed.example.json: kid1, kid2, admin); the service seeds from seedFile() (lib/seed.js:
// config/seed.local.json when this installation has one).
export const SEED_USERS = EXAMPLE_ACCOUNTS;

export function minPasswordLength(role) {
  return role === 'admin' ? 8 : 4;
}

const COLUMNS = ['username', 'password_hash', 'role', 'display_name', 'avatar', 'avatar_bg', 'ui_lang', 'native_lang', 'audience',
  'must_change_password', 'show_on_login', 'can_self_reset', 'can_self_enroll', 'board_hidden'];
const ROW_DEFAULTS = {
  ui_lang: 'nl', native_lang: 'nl', audience: 'child', avatar_bg: 'sky', must_change_password: 0, show_on_login: 0, can_self_reset: 0, can_self_enroll: 1,
  board_hidden: 0,
};

function insertUser(db, row) {
  const full = { ...ROW_DEFAULTS, ...row };
  return db.transaction(() => {
    const info = db.prepare(`INSERT INTO users (${COLUMNS.join(', ')}) VALUES (${COLUMNS.map((c) => `@${c}`).join(', ')})`)
      .run(Object.fromEntries(COLUMNS.map((c) => [c, full[c] ?? null])));
    db.prepare('INSERT OR IGNORE INTO user_stats (user_id) VALUES (?)').run(info.lastInsertRowid);
    return Number(info.lastInsertRowid);
  })();
}

/** Insert seed users that don't exist yet. Never touches existing accounts. Returns created usernames. */
export function seedUsers(db, users = SEED_USERS) {
  const exists = db.prepare('SELECT 1 FROM users WHERE username = ?').pluck();
  const created = [];
  for (const u of users) {
    if (exists.get(u.username)) continue;
    const { password, courses = [], ...row } = u;
    db.transaction(() => {
      const id = insertUser(db, { ...row, password_hash: bcrypt.hashSync(password, BCRYPT_COST) });
      const list = courses.map((c) => (typeof c === 'string' ? { track: c, startPack: null } : { startPack: null, ...c }));
      // the app's clock (as enrol() does), not SQLite's: enrolments sort by this time
      const at = new Date().toISOString();
      for (const c of list) db.prepare('INSERT INTO user_courses (user_id, track, start_pack, enrolled_at) VALUES (?, ?, ?, ?)').run(id, c.track, c.startPack, at);
      if (list.length) db.prepare('UPDATE users SET active_track = ? WHERE id = ?').run(list[0].track, id);
    })();
    created.push(u.username);
  }
  return created;
}

export function countUsers(db) {
  return db.prepare('SELECT COUNT(*) FROM users').pluck().get();
}

export function countAdmins(db) {
  return db.prepare("SELECT COUNT(*) FROM users WHERE role = 'admin'").pluck().get();
}

export function findUserByUsername(db, username) {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(String(username ?? ''));
}

export function findUserById(db, id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

export function publicUser(u) {
  return {
    id: u.id,
    username: u.username,
    role: u.role,
    displayName: u.display_name,
    // The course stored as active; routes with the content at hand report the effective one (courses.js activeTrack).
    activeTrack: u.active_track ?? null,
    avatar: u.avatar,
    avatarBg: u.avatar_bg,
    uiLang: u.ui_lang,
    nativeLang: u.native_lang,
    audience: u.audience ?? 'child',
    mustChangePassword: Boolean(u.must_change_password),
    showOnLogin: Boolean(u.show_on_login),
    canSelfReset: Boolean(u.can_self_reset),
    canSelfEnroll: u.can_self_enroll === undefined ? true : Boolean(u.can_self_enroll),
    dailyGoal: u.daily_goal ?? null,
    soundEffects: u.sound_effects === undefined ? true : Boolean(u.sound_effects),
    autoplay: u.autoplay === undefined ? true : Boolean(u.autoplay),
    theme: THEMES.includes(u.theme) ? u.theme : 'system',
    // the family board (migration 013): the account's own switch, and the admin's hide
    showOnBoard: u.show_on_board === undefined ? true : Boolean(u.show_on_board),
    boardHidden: Boolean(u.board_hidden),
  };
}

export function getStats(db, userId, today = amsterdamDate()) {
  const row = db.prepare('SELECT * FROM user_stats WHERE user_id = ?').get(userId) || {
    xp: 0, streak_current: 0, streak_best: 0, last_active_date: null,
  };
  return {
    xp: row.xp,
    streak: effectiveStreak(row, today),
    streakBest: row.streak_best,
    lastActiveDate: row.last_active_date,
    activeToday: row.last_active_date === today,
  };
}

/** mustChange: true when an admin sets the password (forces a change), false on self-service change. */
export function setPasswordHash(db, userId, hash, { mustChange }) {
  db.prepare('UPDATE users SET password_hash = ?, must_change_password = ? WHERE id = ?').run(hash, mustChange ? 1 : 0, userId);
}

/**
 * Log a user out everywhere (after a password change or reset), except the session `keepSid` (the one making the change).
 */
export function deleteSessions(db, userId, keepSid = null) {
  if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'sessions'").get()) return 0;
  return db.prepare("DELETE FROM sessions WHERE json_extract(sess, '$.userId') = ? AND sid IS NOT ?").run(userId, keepSid).changes;
}

/** Login grid: accounts marked "shown on the login screen", by display name. uiLang sets the login screen's language on tap. */
export function listLoginProfiles(db) {
  return db
    .prepare('SELECT username, display_name, avatar, avatar_bg, ui_lang FROM users WHERE show_on_login = 1 ORDER BY display_name COLLATE NOCASE, username')
    .all()
    .map((u) => ({ username: u.username, displayName: u.display_name, avatar: u.avatar, avatarBg: u.avatar_bg, uiLang: u.ui_lang }));
}

export function listUsersWithStats(db) {
  const today = amsterdamDate();
  return db
    .prepare(`SELECT u.*, (SELECT COUNT(*) FROM lesson_progress lp WHERE lp.user_id = u.id) AS lessons_done
              FROM users u ORDER BY u.role DESC, u.display_name COLLATE NOCASE, u.username`)
    .all()
    .map((u) => ({
      ...publicUser(u),
      lessonsDone: u.lessons_done,
      stats: getStats(db, u.id, today),
      courses: db.prepare('SELECT track, hidden FROM user_courses WHERE user_id = ? ORDER BY enrolled_at, track').all(u.id)
        .map((c) => ({ track: c.track, hidden: Boolean(c.hidden) })),
    }));
}

// ---------------------------------------------------------------------------------------------
// Validation shared by create / edit (admin) and preferences (self). Mirrored in client/src/lib/userRules.js.

/**
 * Validate an admin create/edit payload (camelCase, as the API receives it).
 * `existing` is the stored row when editing (username and unspecified fields come from it). Courses are not part of the
 * account row: Admin → Users sets them per course (courses.js); a new learner's first course comes with the create call.
 * Returns { values } (a users row fragment) or { errors: { field: code }, min? }.
 */
export function validateUserInput(db, input, existing = null) {
  const src = input && typeof input === 'object' ? input : {};
  const errors = {};
  const has = (k) => src[k] !== undefined;
  const values = {};

  if (!existing) {
    const username = typeof src.username === 'string' ? src.username.trim().toLowerCase() : '';
    if (!USERNAME_RE.test(username)) errors.username = 'invalid';
    else if (findUserByUsername(db, username)) errors.username = 'taken';
    values.username = username;
  } else if (has('username') && String(src.username).trim().toLowerCase() !== existing.username.toLowerCase()) {
    errors.username = 'immutable';
  }

  const role = has('role') ? src.role : existing?.role;
  if (!ROLES.includes(role)) errors.role = 'invalid';
  values.role = role;

  if (has('displayName') || !existing) {
    const name = typeof src.displayName === 'string' ? src.displayName.trim() : '';
    if (!name || name.length > DISPLAY_NAME_MAX) errors.displayName = 'invalid';
    values.display_name = name;
  }

  // The language the meanings are shown in. Changing it keeps all progress; it changes which courses are offered.
  if (has('nativeLang') || !existing) {
    const lang = src.nativeLang ?? 'nl';
    if (!NATIVE_LANGS.includes(lang)) errors.nativeLang = 'invalid';
    values.native_lang = lang;
  }
  if (has('audience') || !existing) {
    const audience = src.audience ?? (role === 'admin' ? 'adult' : 'child');
    if (!AUDIENCES.includes(audience)) errors.audience = 'invalid';
    values.audience = audience;
  }

  if (has('uiLang') || !existing) {
    const lang = src.uiLang ?? 'nl';
    if (!UI_LANGS.includes(lang)) errors.uiLang = 'invalid';
    values.ui_lang = lang;
  }
  if (has('avatar') || !existing) {
    if (!AVATAR_IDS.includes(src.avatar)) errors.avatar = 'invalid';
    values.avatar = src.avatar;
  }
  if (has('avatarBg') || !existing) {
    if (!AVATAR_BGS.includes(src.avatarBg)) errors.avatarBg = 'invalid';
    values.avatar_bg = src.avatarBg;
  }

  const flag = (key, column, fallback) => {
    if (has(key)) {
      if (typeof src[key] !== 'boolean') errors[key] = 'invalid';
      values[column] = src[key] ? 1 : 0;
    } else if (!existing) values[column] = fallback ? 1 : 0;
  };
  flag('mustChangePassword', 'must_change_password', role === 'admin');
  flag('showOnLogin', 'show_on_login', role === 'child');
  flag('canSelfReset', 'can_self_reset', false);
  flag('canSelfEnroll', 'can_self_enroll', true);
  flag('boardHidden', 'board_hidden', false);

  let min;
  if (!existing || has('password')) {
    min = minPasswordLength(role);
    if (typeof src.password !== 'string' || src.password.length < min) errors.password = 'too_short';
    values.password = src.password;
  }

  if (Object.keys(errors).length) return { errors, ...(errors.password ? { min } : {}) };
  return { values };
}

/** Create a user from validated values (validateUserInput). Returns the new row. */
export function createUser(db, values) {
  const { password, ...row } = values;
  const id = insertUser(db, { ...row, password_hash: bcrypt.hashSync(password, BCRYPT_COST) });
  return findUserById(db, id);
}

/** Apply validated edit values. Promotion to admin forces a password change (child passwords may be short). */
export function updateUser(db, existing, values) {
  const { password, username, ...row } = values;
  if (row.role === 'admin' && existing.role !== 'admin' && row.must_change_password === undefined) row.must_change_password = 1;
  if (password !== undefined) {
    row.password_hash = bcrypt.hashSync(password, BCRYPT_COST);
    if (row.must_change_password === undefined) row.must_change_password = 1;
  }
  const cols = Object.keys(row).filter((c) => row[c] !== undefined);
  if (cols.length) {
    db.prepare(`UPDATE users SET ${cols.map((c) => `${c} = @${c}`).join(', ')} WHERE id = @id`).run({ ...row, id: existing.id });
  }
  return findUserById(db, existing.id);
}

/** Self-service settings: interface language, avatar, daily goal, sound effects, autoplay, the family board, the theme. Returns { values } or { errors }. */
export function validatePreferences(input) {
  const src = input && typeof input === 'object' ? input : {};
  const errors = {};
  const values = {};
  if (src.uiLang !== undefined) {
    if (!UI_LANGS.includes(src.uiLang)) errors.uiLang = 'invalid';
    values.ui_lang = src.uiLang;
  }
  if (src.avatar !== undefined) {
    if (!AVATAR_IDS.includes(src.avatar)) errors.avatar = 'invalid';
    values.avatar = src.avatar;
  }
  if (src.avatarBg !== undefined) {
    if (!AVATAR_BGS.includes(src.avatarBg)) errors.avatarBg = 'invalid';
    values.avatar_bg = src.avatarBg;
  }
  if (src.dailyGoal !== undefined) {
    if (!DAILY_GOALS.includes(src.dailyGoal)) errors.dailyGoal = 'invalid';
    values.daily_goal = src.dailyGoal;
  }
  if (src.soundEffects !== undefined) {
    if (typeof src.soundEffects !== 'boolean') errors.soundEffects = 'invalid';
    values.sound_effects = src.soundEffects ? 1 : 0;
  }
  if (src.autoplay !== undefined) {
    if (typeof src.autoplay !== 'boolean') errors.autoplay = 'invalid';
    values.autoplay = src.autoplay ? 1 : 0;
  }
  if (src.showOnBoard !== undefined) {
    if (typeof src.showOnBoard !== 'boolean') errors.showOnBoard = 'invalid';
    values.show_on_board = src.showOnBoard ? 1 : 0;
  }
  if (src.theme !== undefined) {
    if (!THEMES.includes(src.theme)) errors.theme = 'invalid';
    values.theme = src.theme;
  }
  if (!Object.keys(values).length && !Object.keys(errors).length) errors.body = 'empty';
  return Object.keys(errors).length ? { errors } : { values };
}

export function setPreferences(db, userId, values) {
  const cols = Object.keys(values);
  db.prepare(`UPDATE users SET ${cols.map((c) => `${c} = @${c}`).join(', ')} WHERE id = @id`).run({ ...values, id: userId });
  return findUserById(db, userId);
}

/** Every table that holds rows of a user, with the column naming the user. The delete and the orphan test use it. */
export const USER_TABLES = [
  ['user_stats', 'user_id'],
  ['lesson_progress', 'user_id'],
  ['lesson_completions', 'user_id'],
  ['attempts', 'user_id'],
  ['item_strength', 'user_id'],
  ['practice_sessions', 'user_id'],
  ['user_badges', 'user_id'],
  ['daily_goal_days', 'user_id'],
  ['content_reports', 'user_id'],
  ['child_messages', 'user_id'],
  ['user_courses', 'user_id'],
  ['listen_checks', 'user_id'],
  ['audio_sample_votes', 'user_id'],
];

/** Delete a user and all their rows (USER_TABLES and login sessions) in one transaction. */
export function deleteUser(db, userId) {
  const hasSessions = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'sessions'").get();
  db.transaction(() => {
    for (const [table, column] of USER_TABLES) db.prepare(`DELETE FROM ${table} WHERE ${column} = ?`).run(userId);
    if (hasSessions) db.prepare("DELETE FROM sessions WHERE json_extract(sess, '$.userId') = ?").run(userId);
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  })();
}
