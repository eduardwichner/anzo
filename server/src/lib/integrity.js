// Read-only consistency check of the progress data against the current content (npm run check:integrity).
// Content changes (renamed or removed lesson, exercise or vocabulary ids) would orphan stored progress;
// this finds such rows before they matter. Pure: takes an open database and a loaded content index.
import { amsterdamDate } from './gamification.js';
import { itemsDiffer } from './legacy.js';
import { NATIVE_LANGS } from './langs.js';
import { USER_TABLES } from './users.js';

/**
 * @returns {{ users: object[], errors: string[], warnings: string[], info: string[] }}
 *   users: per-user summary (stats, completions, lessons, attempts by type, item strength range)
 *   errors: inconsistencies (exit 1), incl. progress in a course the user was never enrolled in; warnings: legal but notable;
 *   info: expected and harmless (legacy attempts, progress on exercises hidden by an admin correction)
 */
export function checkIntegrity(db, content, { today = amsterdamDate() } = {}) {
  const errors = [];
  const warnings = [];
  const info = [];
  const retired = content.retired ?? new Map();
  const itemIds = new Set();
  const packOfItem = new Map();
  for (const p of content.packs.values()) {
    for (const id of [...p.vocabById.keys(), ...p.sentenceById.keys()]) {
      itemIds.add(id);
      packOfItem.set(id, p);
    }
  }
  const hasColumn = (table, col) => db.prepare(`SELECT 1 FROM pragma_table_info('${table}') WHERE name = ?`).get(col);
  const hasTable = (name) => Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name));
  const withPractice = hasTable('practice_sessions');
  const withLegacy = Boolean(hasColumn('attempts', 'legacy'));

  if (!hasTable('user_courses') || !hasColumn('users', 'active_track')) {
    errors.push('the database predates migration 007 (courses): start the service once to migrate it, then check again');
    return { users: [], errors, warnings, info };
  }
  const users = db.prepare('SELECT * FROM users ORDER BY id').all();
  const summaries = [];
  for (const u of users) {
    const who = `${u.username} (id ${u.id})`;
    const err = (m) => errors.push(`${who}: ${m}`);
    const warn = (m) => warnings.push(`${who}: ${m}`);
    const tell = (m) => info.push(`${who}: ${m}`);

    // Courses: enrolments name real courses and start levels; the active course is enrolled and not hidden.
    if (!NATIVE_LANGS.includes(u.native_lang)) err(`native_lang "${u.native_lang}" is not a native language (${NATIVE_LANGS.join(', ')})`);
    const courses = db.prepare('SELECT * FROM user_courses WHERE user_id = ? ORDER BY enrolled_at, track').all(u.id);
    const enrolled = new Set(courses.map((c) => c.track));
    for (const c of courses) {
      if (!content.manifest.tracks.some((t) => t.id === c.track)) err(`user_courses: "${c.track}" is not a course in the manifest`);
      if (c.start_pack != null) {
        const p = content.packs.get(c.start_pack);
        if (!p) err(`user_courses ${c.track}: start_pack "${c.start_pack}" is not an available pack`);
        else if (p.trackId !== c.track) err(`user_courses ${c.track}: start_pack "${c.start_pack}" is not a level of that course`);
        else if (p.preview) warn(`user_courses ${c.track}: start_pack "${c.start_pack}" is a level withdrawn to preview`);
      }
    }
    if (u.active_track != null) {
      const active = courses.find((c) => c.track === u.active_track);
      if (!active) err(`active_track "${u.active_track}" is not a course the user is enrolled in`);
      else if (active.hidden) err(`active_track "${u.active_track}" is a hidden course`);
    } else if (courses.some((c) => !c.hidden)) warn('no active course although a course is visible (the first one is used)');

    // A level moved back from available to preview: its progress stays, but learners cannot reach it
    const inPreview = db.prepare('SELECT lesson_id FROM lesson_progress WHERE user_id = ?').pluck().all(u.id)
      .filter((id) => content.packs.get(content.lessons.get(id)?.packId)?.preview).length;
    if (inPreview) warn(`${inPreview} finished lesson(s) in a level withdrawn to preview (learners cannot open it)`);

    // XP and streak
    const stats = db.prepare('SELECT * FROM user_stats WHERE user_id = ?').get(u.id);
    const completions = db.prepare('SELECT * FROM lesson_completions WHERE user_id = ? ORDER BY completed_at').all(u.id);
    const practice = withPractice ? db.prepare('SELECT * FROM practice_sessions WHERE user_id = ? ORDER BY id').all(u.id) : [];
    const finished = practice.filter((ps) => ps.finished_at);
    const xpSum = completions.reduce((s, c) => s + c.xp, 0);
    const practiceXp = practice.reduce((s, ps) => s + ps.xp, 0);
    if (!stats) err('no user_stats row');
    else {
      if (stats.xp !== xpSum + practiceXp) {
        err(`user_stats.xp ${stats.xp} ≠ SUM(lesson_completions.xp) ${xpSum} + SUM(practice_sessions.xp) ${practiceXp}`);
      }
      if (stats.streak_current > stats.streak_best) err(`streak_current ${stats.streak_current} > streak_best ${stats.streak_best}`);
      if (stats.last_active_date) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(stats.last_active_date)) err(`last_active_date "${stats.last_active_date}" is not YYYY-MM-DD`);
        else if (stats.last_active_date > today) err(`last_active_date ${stats.last_active_date} is after today (${today}, Amsterdam)`);
        if (stats.streak_current < 1) err('last_active_date is set but streak_current is 0');
      } else if (stats.streak_current !== 0) err('streak_current > 0 without last_active_date');
      // The last lesson completion or finished practice session (pre-003 XP totals carry no real date). It may be earlier
      // than last_active_date (a progress reset deletes completions but never the streak); it can never be later.
      const dated = [...completions.filter((c) => c.lesson_id != null).map((c) => c.completed_at), ...finished.map((ps) => ps.finished_at)].sort();
      if (dated.length) {
        const lastDay = amsterdamDate(new Date(dated[dated.length - 1]));
        if (!stats.last_active_date) err(`completions exist (the last on ${lastDay}) but last_active_date is not set`);
        else if (lastDay > stats.last_active_date) err(`last_active_date ${stats.last_active_date} is before the Amsterdam date of the last completion (${lastDay})`);
      }
    }

    // Every progress row belongs to a course the user is (or was: hidden) enrolled in.
    const lessonTrack = (id) => content.lessons.get(id)?.trackId;
    const checkTrack = (kind, lessonId) => {
      const t = lessonTrack(lessonId);
      if (t && !enrolled.has(t)) err(`${kind} for lesson ${lessonId} in course "${t}", which the user is not enrolled in`);
    };

    for (const c of completions) {
      if (c.lesson_id == null) continue; // XP total from before migration 003
      if (!content.lessons.has(c.lesson_id)) err(`lesson_completions ${c.id}: lesson "${c.lesson_id}" does not exist in the content`);
      else checkTrack('lesson_completions', c.lesson_id);
    }

    const progress = db.prepare('SELECT * FROM lesson_progress WHERE user_id = ? ORDER BY lesson_id').all(u.id);
    const legacyXp = completions.some((c) => c.lesson_id == null);
    for (const p of progress) {
      if (!content.lessons.has(p.lesson_id)) err(`lesson_progress: lesson "${p.lesson_id}" does not exist in the content`);
      else checkTrack('lesson_progress', p.lesson_id);
      const n = completions.filter((c) => c.lesson_id === p.lesson_id).length;
      if (!legacyXp && n !== p.times_completed) err(`lesson_progress ${p.lesson_id}: times_completed ${p.times_completed} ≠ ${n} lesson_completions rows`);
    }

    // Practice sessions: every exercise exists; unfinished sessions earned nothing.
    const sessionIds = new Set(practice.map((ps) => ps.id));
    for (const ps of practice) {
      let ids = [];
      try {
        ids = JSON.parse(ps.exercise_ids);
      } catch {
        err(`practice_sessions ${ps.id}: exercise_ids is not JSON`);
      }
      for (const id of ids) {
        if (!content.exercises.has(id) && !retired.has(id)) err(`practice_sessions ${ps.id}: exercise "${id}" does not exist in the content`);
      }
      if (ids.length !== ps.exercises) err(`practice_sessions ${ps.id}: exercises ${ps.exercises} ≠ ${ids.length} exercise ids`);
      if (!ps.finished_at && ps.xp !== 0) err(`practice_sessions ${ps.id}: not finished but has ${ps.xp} XP`);
      if (!enrolled.has(ps.track)) err(`practice_sessions ${ps.id} in course "${ps.track}", which the user is not enrolled in`);
    }

    const attempts = db.prepare('SELECT * FROM attempts WHERE user_id = ? ORDER BY id').all(u.id);
    const byType = {};
    const attemptTracks = new Set();
    const stale = new Map(); // items differ but not flagged legacy yet
    const legacyRows = new Map();
    let onRetired = 0;
    for (const a of attempts) {
      if (a.practice_session_id != null && !sessionIds.has(a.practice_session_id)) {
        err(`attempt ${a.id}: practice session ${a.practice_session_id} does not exist`);
      }
      const lesson = content.lessons.get(a.lesson_id);
      const ex = content.exercises.get(a.exercise_id);
      if (withLegacy && a.legacy === 1 && !(!ex && retired.has(a.exercise_id))) legacyRows.set(a.exercise_id, (legacyRows.get(a.exercise_id) ?? 0) + 1);
      else if (ex && itemsDiffer(ex.exercise, a.item_ids)) stale.set(a.exercise_id, (stale.get(a.exercise_id) ?? 0) + 1);
      if (!lesson) err(`attempt ${a.id}: lesson "${a.lesson_id}" does not exist in the content`);
      if (!ex && retired.has(a.exercise_id)) onRetired += 1;
      else if (!ex) err(`attempt ${a.id}: exercise "${a.exercise_id}" does not exist in the content`);
      else if (ex.lessonId !== a.lesson_id) err(`attempt ${a.id}: exercise "${a.exercise_id}" belongs to ${ex.lessonId}, not ${a.lesson_id}`);
      if (lesson) attemptTracks.add(lesson.trackId);
      let ids = [];
      try {
        ids = JSON.parse(a.item_ids);
      } catch {
        err(`attempt ${a.id}: item_ids is not JSON`);
      }
      for (const id of ids) if (!itemIds.has(id)) err(`attempt ${a.id}: item "${id}" does not exist in the content`);
      const type = ex?.exercise.type ?? 'unknown';
      byType[type] ??= { correct: 0, wrong: 0 };
      byType[type][a.correct ? 'correct' : 'wrong'] += 1;
    }
    const total = (m) => [...m.values()].reduce((x, y) => x + y, 0);
    const list = (m) => [...m].slice(0, 12).map(([id, k]) => `${id} ×${k}`).join(', ') + (m.size > 12 ? ', …' : '');
    if (legacyRows.size) {
      // Answered an earlier version of the exercise (attempts.legacy). Lesson, XP and word strengths are unaffected;
      // exercise-level views (My mistakes, accuracy by type) skip these attempts. Expected, so information only.
      tell(`${total(legacyRows)} legacy attempt(s) (an earlier version of their exercise; ignored by My mistakes and accuracy): ${list(legacyRows)}`);
    }
    if (onRetired) tell(`${onRetired} attempt(s) on exercises hidden by an admin correction (kept, still valid)`);
    if (stale.size) {
      warn(`${total(stale)} attempt(s) answered an earlier version of their exercise but are not marked legacy yet `
        + `(the service marks them at its next start or content reload): ${list(stale)}`);
    }
    for (const t of attemptTracks) {
      if (!enrolled.has(t)) err(`attempts in course "${t}", which the user is not enrolled in`);
    }

    const strengths = db.prepare('SELECT * FROM item_strength WHERE user_id = ? ORDER BY item_id').all(u.id);
    for (const s of strengths) {
      if (!itemIds.has(s.item_id)) err(`item_strength: item "${s.item_id}" does not exist in the content`);
      else if (!enrolled.has(packOfItem.get(s.item_id).trackId)) err(`item_strength ${s.item_id} in course "${packOfItem.get(s.item_id).trackId}", which the user is not enrolled in`);
      // Strength 0 is due at once whichever comes first; in older rows a later answer in the same run moved only
      // last_seen_at, so such rows are consistent. A stronger item must be scheduled after it was last seen.
      if (s.strength > 0 && s.next_review_at < s.last_seen_at) err(`item_strength ${s.item_id}: next_review_at before last_seen_at`);
    }

    const range = (rows, key) => (rows.length ? [rows.reduce((m, r) => (r[key] < m ? r[key] : m), rows[0][key]), rows.reduce((m, r) => (r[key] > m ? r[key] : m), rows[0][key])] : null);
    summaries.push({
      username: u.username,
      role: u.role,
      activeTrack: u.active_track,
      nativeLang: u.native_lang,
      courses: courses.map((c) => ({ track: c.track, startPack: c.start_pack, hidden: Boolean(c.hidden) })),
      stats: stats ? { xp: stats.xp, streak: stats.streak_current, streakBest: stats.streak_best, lastActiveDate: stats.last_active_date } : null,
      completions: completions.map((c) => ({ lessonId: c.lesson_id, score: c.score, xp: c.xp, completedAt: c.completed_at })),
      practice: { sessions: practice.length, finished: finished.length, xp: practiceXp },
      ...(hasTable('user_badges') ? { badges: db.prepare('SELECT badge_id FROM user_badges WHERE user_id = ? ORDER BY earned_at, badge_id').pluck().all(u.id) } : {}),
      lessons: progress.map((p) => ({ lessonId: p.lesson_id, bestScore: p.best_score, timesCompleted: p.times_completed })),
      attempts: { legacy: total(legacyRows), total: attempts.length, correct: attempts.filter((a) => a.correct).length, wrong: attempts.filter((a) => !a.correct).length, byType },
      itemStrength: {
        rows: strengths.length,
        strength: range(strengths, 'strength'),
        nextReviewAt: range(strengths, 'next_review_at'),
      },
    });
  }

  // Rows of users that no longer exist (every table deleteUser clears).
  for (const [table, column] of USER_TABLES.filter(([t]) => hasTable(t))) {
    const n = db.prepare(`SELECT COUNT(*) FROM ${table} WHERE ${column} NOT IN (SELECT id FROM users)`).pluck().get();
    if (n) errors.push(`${table}: ${n} row(s) of users that do not exist`);
  }

  return { users: summaries, errors, warnings, info };
}
