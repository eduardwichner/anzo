import { AVATAR_BGS, AVATAR_IDS } from './avatars.js';
import { AUDIENCES, NATIVE_LANGS, UI_LANGS } from './langs.js';
import { ROLES, USERNAME_RE, minPasswordLength } from './users.js';
// Courses and enrolment. A course is a track of the manifest (its target language) taught through its native language
// (the manifest's `native`). A learner — role child, or an admin who takes courses himself — is enrolled in
// any number of courses (user_courses) and plays one at a time (users.active_track). The rules are the same for both roles. Hiding a course keeps its progress; enrolling again restores it. A course is offered to
// a learner only when its native language is the learner's (users.native_lang); an enrolment in a course that is not
// offered (the native language changed) stays in the database, invisible, and comes back when the language does.

export class CourseError extends Error {
  constructor(code, status = 400) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

const coursesCache = new WeakMap();
/**
 * Every course of the manifest with its available packs (in manifest order): [{ track, native, mascot, packIds, corePackIds }].
 * corePackIds leave out the optional branch packs: course progress and start levels count only those.
 */
export function allCourses(content) {
  if (!coursesCache.has(content)) {
    coursesCache.set(content, content.manifest.tracks.map((t) => {
      const available = t.packs.filter((e) => e.status === 'available' && content.packs.has(e.id));
      return {
        track: t.id,
        target: t.target ?? t.id,
        native: t.native,
        mascot: t.mascot,
        packIds: available.map((e) => e.id),
        corePackIds: available.filter((e) => !e.branch).map((e) => e.id),
      };
    }));
  }
  return coursesCache.get(content);
}

export const courseOf = (content, track) => allCourses(content).find((c) => c.track === track) ?? null;

/** Courses a learner with this native language can take (at least one available level). */
export function offeredCourses(content, nativeLang) {
  return allCourses(content).filter((c) => c.native === nativeLang && c.packIds.length > 0);
}

/** Courses for this native language without an available level yet: the course sheet lists them as Coming soon. */
export function comingCourses(content, nativeLang) {
  return allCourses(content).filter((c) => c.native === nativeLang && c.packIds.length === 0);
}

const isOffered = (content, user, track) => offeredCourses(content, user.native_lang).some((c) => c.track === track);

/** The user's enrolments, oldest first: [{ track, startPack, enrolledAt, hidden }]. */
export function enrolments(db, userId) {
  return db.prepare('SELECT track, start_pack, enrolled_at, hidden FROM user_courses WHERE user_id = ? ORDER BY enrolled_at, track')
    .all(userId)
    .map((r) => ({ track: r.track, startPack: r.start_pack ?? null, enrolledAt: r.enrolled_at, hidden: Boolean(r.hidden) }));
}

/** Both roles may learn: children, and the admin for himself (Admin → Users shows his progress like anyone's). */
export const LEARNER_ROLES = new Set(['child', 'admin']);
export const canLearn = (user) => LEARNER_ROLES.has(user?.role);

/** Enrolments the learner sees and plays: not hidden, offered for their native language. */
export function visibleCourses(db, content, user) {
  if (!canLearn(user)) return [];
  return enrolments(db, user.id).filter((e) => !e.hidden && isOffered(content, user, e.track));
}

/** The course being played: users.active_track when visible, else the first visible course, else null. */
export function activeCourse(db, content, user) {
  const visible = visibleCourses(db, content, user);
  return visible.find((e) => e.track === user.active_track) ?? visible[0] ?? null;
}

export const activeTrack = (db, content, user) => activeCourse(db, content, user)?.track ?? null;

/** May this learner play (open packs of, record progress in, report on) this track? */
export function learnsTrack(db, content, user, track) {
  return visibleCourses(db, content, user).some((e) => e.track === track);
}

function checkStartPack(content, track, startPack) {
  if (startPack === null || startPack === undefined) return;
  // a branch is never a start level: it is optional, and the core before it would become optional too
  if (!courseOf(content, track)?.corePackIds.includes(startPack)) throw new CourseError('invalid_start_pack');
}

/**
 * Enrol (or restore a hidden course). Learners and the admin alike, only courses offered for their native language.
 * startPack: undefined keeps a restored course's start level; null = the first level. activate: make it the active course.
 */
export function enrol(db, content, user, track, { startPack, activate = true, now = new Date() } = {}) {
  if (!canLearn(user)) throw new CourseError('not_a_learner', 403);
  if (!isOffered(content, user, track)) throw new CourseError('course_not_offered');
  checkStartPack(content, track, startPack);
  db.transaction(() => {
    db.prepare(`INSERT INTO user_courses (user_id, track, start_pack, enrolled_at) VALUES (?, ?, ?, ?)
                ON CONFLICT(user_id, track) DO UPDATE SET hidden = 0`)
      .run(user.id, track, startPack ?? null, now.toISOString());
    if (startPack !== undefined) db.prepare('UPDATE user_courses SET start_pack = ? WHERE user_id = ? AND track = ?').run(startPack, user.id, track);
    // The new course becomes the active one when asked, or when the learner has no (visible) active course yet.
    if (activate || !user.active_track || !learnsTrack(db, content, user, user.active_track)) {
      db.prepare('UPDATE users SET active_track = ? WHERE id = ?').run(track, user.id);
    }
  })();
}

/** Hide a course (progress kept). The active course moves to the next visible one (or none). */
export function hideCourse(db, content, user, track) {
  const info = db.prepare('UPDATE user_courses SET hidden = 1 WHERE user_id = ? AND track = ?').run(user.id, track);
  if (!info.changes) throw new CourseError('not_enrolled', 404);
  if (user.active_track === track) {
    const next = visibleCourses(db, content, user).find((e) => e.track !== track)?.track ?? null;
    db.prepare('UPDATE users SET active_track = ? WHERE id = ?').run(next, user.id);
  }
}

/** Switch the active course (server-side, so it follows the learner to every device). */
export function setActiveTrack(db, content, user, track) {
  if (!learnsTrack(db, content, user, track)) throw new CourseError('not_enrolled', 404);
  db.prepare('UPDATE users SET active_track = ? WHERE id = ?').run(track, user.id);
}

/** Set an enrolled course's start level (admin). null = the first level. */
export function setStartPack(db, content, userId, track, startPack) {
  checkStartPack(content, track, startPack);
  const info = db.prepare('UPDATE user_courses SET start_pack = ? WHERE user_id = ? AND track = ?').run(startPack ?? null, userId, track);
  if (!info.changes) throw new CourseError('not_enrolled', 404);
}

/**
 * The track a lesson id belongs to: from the content, else its "<prefix>-" (removed lessons): the track whose id prefix it is
 * (manifest idPrefix, e.g. fe → fr-en), else the prefix itself.
 */
export function lessonTrack(content, lessonId) {
  const known = content.lessons.get(lessonId)?.trackId;
  if (known || !lessonId) return known ?? null;
  const prefix = lessonId.slice(0, lessonId.indexOf('-'));
  if (!prefix) return null;
  return content.manifest?.tracks?.find((t) => (t.idPrefix ?? t.id) === prefix)?.id ?? prefix;
}

/** XP per course: lesson completions (by the lesson's track) + practice sessions (by their track). { en: 120, … } */
export function xpByTrack(db, content, userId) {
  const out = {};
  for (const r of db.prepare('SELECT lesson_id, xp FROM lesson_completions WHERE user_id = ?').all(userId)) {
    const t = lessonTrack(content, r.lesson_id) ?? '';
    out[t] = (out[t] ?? 0) + r.xp;
  }
  for (const r of db.prepare('SELECT track, SUM(xp) AS xp FROM practice_sessions WHERE user_id = ? GROUP BY track').all(userId)) {
    out[r.track] = (out[r.track] ?? 0) + r.xp;
  }
  return out;
}

/** The user row with the effective active course in active_track (what the routes and publicUser should see). */
export function withActiveTrack(db, content, user) {
  return canLearn(user) ? { ...user, active_track: activeTrack(db, content, user) } : { ...user, active_track: null };
}

/**
 * The seed tooling's check of one extra account (scripts/seed-users.js --account): a learner's courses must be offered for
 * its native language and a start level must be an available pack of that course. Returns a problem text or null.
 */
export function checkSeedAccount(manifest, account) {
  if (!account?.username || !account.password || !account.role) return 'username, password and role are required';
  // the account rules of Admin → Users: an extra seed account is not a way around them
  if (!USERNAME_RE.test(account.username)) return `username "${account.username}" must be 2–24 of a-z 0-9 _ -`;
  if (!ROLES.includes(account.role)) return `role must be one of ${ROLES.join(', ')}`;
  if (String(account.password).length < minPasswordLength(account.role)) return `password: at least ${minPasswordLength(account.role)} characters for ${account.role}`;
  for (const [key, list] of [['native_lang', NATIVE_LANGS], ['ui_lang', UI_LANGS], ['audience', AUDIENCES], ['avatar', AVATAR_IDS], ['avatar_bg', AVATAR_BGS]]) {
    if (account[key] !== undefined && !list.includes(account[key])) return `${key} must be one of ${list.join(', ')}`;
  }
  for (const c of account.courses ?? []) {
    const { track, startPack = null } = typeof c === 'string' ? { track: c } : c;
    const tr = manifest.tracks.find((t) => t.id === track);
    const available = (tr?.packs ?? []).filter((p) => p.status === 'available' && !p.branch).map((p) => p.id);
    if (!tr || !available.length) return `course "${track}" has no available level`;
    if ((tr.native ?? 'nl') !== (account.native_lang ?? 'nl')) return `course "${track}" is not offered for native language "${account.native_lang ?? 'nl'}"`;
    if (startPack && !available.includes(startPack)) return `start level "${startPack}" is not an available level of "${track}"`;
  }
  return null;
}
