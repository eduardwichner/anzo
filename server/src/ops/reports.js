// The children's 🚩 reports and the admin inbox. A child reports an exercise after checking it (never before: the
// client only shows the flag in the result strip); the report stores a snapshot of what the child saw. Open reports of
// one exercise form one inbox group. The admin closes a group as already correct (optionally thanking the children with
// a one-time message), dismisses it, or fixes it through Admin → Corrections (see corrections.js recordResult).
import { publicExercise, answerAudio } from '../content/loader.js';
import { lookupKey, readLocales } from '../content/instructions.js';
import { amsterdamDate } from '../lib/gamification.js';
import { adminExercise } from './corrections.js';
import { learnsTrack } from '../lib/courses.js';
import { awardBadges } from '../lib/badges.js';

export const REPORT_REASONS = ['native', 'target', 'audio', 'other'];
export const REPORTS_PER_DAY = 10;
export const SAME_EXERCISE_DAYS = 7;
export const NOTE_MAX = 200;

export class ReportError extends Error {
  constructor(code, status = 400) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

const LOCALES = readLocales();
/** The locale key of a one-time message: adults (users.audience) get adult wording. Mirrored in client/src/lib/audience.js. */
export const messageKey = (kind, audience) => `messages.${kind}${audience === 'adult' ? 'Adult' : ''}`;
export const defaultMessage = (lang, kind, audience = 'child') => {
  const key = messageKey(kind, audience);
  return lookupKey(LOCALES[lang] ?? LOCALES.nl, key) ?? lookupKey(LOCALES.nl, key);
};

/** Display text of the correct answer (MC / listen: the right option; match: pairs; others: the answer). */
export function correctAnswerText(ex, nativeOf) {
  switch (ex.type) {
    case 'multiple_choice':
    case 'listen_choose':
      return nativeOf(ex.options.find((o) => o.correct)?.text);
    case 'match_pairs':
      return ex.pairs.map((p) => `${p.left} = ${nativeOf(p.right)}`).join(' · ');
    default:
      return ex.answer ?? null;
  }
}

/** Reports created on the child's Amsterdam day (updates of an earlier report do not count). */
function reportsToday(db, userId, now) {
  const today = amsterdamDate(now);
  return db.prepare('SELECT created_at FROM content_reports WHERE user_id = ? AND created_at >= ?')
    .pluck().all(userId, new Date(now.getTime() - 36 * 3600_000).toISOString())
    .filter((at) => amsterdamDate(new Date(at)) === today).length;
}

/**
 * A child's report. body { exerciseId, reason, note? }. The child's answer is the latest attempt at that exercise.
 * @returns {{ report, updated: boolean }}
 */
export function createReport({ db, content, audio }, user, body, now = new Date()) {
  if (user.role !== 'child') throw new ReportError('forbidden', 403);
  const { exerciseId, reason } = body || {};
  const found = typeof exerciseId === 'string' ? content.exercises.get(exerciseId) : null;
  if (!found || !learnsTrack(db, content, user, found.trackId)) throw new ReportError('exercise_not_found', 404);
  if (!REPORT_REASONS.includes(reason)) throw new ReportError('invalid_reason');
  const note = String(body.note ?? '').replace(/\s+/g, ' ').trim();
  if (note.length > NOTE_MAX) throw new ReportError('note_too_long');

  const lesson = content.lessons.get(found.lessonId);
  const nat = (v) => (v && typeof v === 'object' ? v[user.native_lang] ?? v.nl ?? Object.values(v)[0] : v);
  const last = db.prepare('SELECT given_answer, correct, created_at FROM attempts WHERE user_id = ? AND exercise_id = ? ORDER BY id DESC LIMIT 1')
    .get(user.id, exerciseId);
  let childAnswer = null;
  try {
    childAnswer = last ? JSON.parse(last.given_answer) : null;
  } catch { /* keep null */ }
  const served = publicExercise(content, found.packId, found.exercise, { audio, nativeLang: user.native_lang });
  const snapshot = {
    exercise: served,
    childAnswer,
    childCorrect: last ? Boolean(last.correct) : null,
    answeredAt: last?.created_at ?? null,
    correctAnswer: correctAnswerText(found.exercise, nat),
    clips: { ...answerAudio(content, found.packId, found.exercise, audio), question: served.audio ?? null, questionSlow: served.audioSlow ?? null },
    uiLang: user.ui_lang,
  };

  const nowIso = now.toISOString();
  const since = new Date(now.getTime() - SAME_EXERCISE_DAYS * 86_400_000).toISOString();
  // Reporting the same exercise again while the report is open updates it; a closed report (checked, fixed, dismissed)
  // keeps its outcome, and the new report is a new row.
  const earlier = db.prepare("SELECT * FROM content_reports WHERE user_id = ? AND exercise_id = ? AND created_at >= ? AND status = 'open' ORDER BY id DESC LIMIT 1")
    .get(user.id, exerciseId, since);
  if (earlier) {
    db.prepare(`UPDATE content_reports SET reason = ?, note = ?, snapshot = ?, ui_lang = ?, updated_at = ? WHERE id = ?`)
      .run(reason, note, JSON.stringify(snapshot), user.ui_lang, nowIso, earlier.id);
    return { report: db.prepare('SELECT * FROM content_reports WHERE id = ?').get(earlier.id), updated: true };
  }
  if (reportsToday(db, user.id, now) >= REPORTS_PER_DAY) throw new ReportError('report_limit', 429);
  const info = db.prepare(`INSERT INTO content_reports
      (user_id, exercise_id, lesson_id, pack_id, unit_id, track, reason, note, snapshot, ui_lang, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(user.id, exerciseId, found.lessonId, found.packId, lesson.unitId, found.trackId, reason, note, JSON.stringify(snapshot), user.ui_lang, nowIso, nowIso);
  return { report: db.prepare('SELECT * FROM content_reports WHERE id = ?').get(info.lastInsertRowid), updated: false };
}

/** Open reports grouped per exercise, newest first, with the exercise as it is now and as the children saw it. */
export function inboxGroups({ db, content, audio }) {
  const rows = db.prepare(`SELECT r.*, u.username, u.display_name, u.ui_lang AS user_lang, u.audience AS user_audience
                           FROM content_reports r JOIN users u ON u.id = r.user_id
                           WHERE r.status = 'open' ORDER BY r.updated_at DESC`).all();
  const groups = new Map();
  for (const r of rows) {
    if (!groups.has(r.exercise_id)) groups.set(r.exercise_id, []);
    groups.get(r.exercise_id).push(r);
  }
  return [...groups.entries()].map(([exerciseId, reports]) => {
    const latest = reports[0];
    const snapshot = JSON.parse(latest.snapshot);
    const found = content.exercises.get(exerciseId);
    const ex = found?.exercise;
    const itemIds = ex ? [...new Set([...(ex.items || []), ex.sentenceId, ex.listen].filter(Boolean))] : [];
    const p = found ? content.packs.get(found.packId) : null;
    const items = itemIds.map((id) => {
      const it = p?.vocabById.get(id) ?? p?.sentenceById.get(id);
      return it ? { id, kind: p.vocabById.has(id) ? 'vocabulary' : 'sentence', target: it.target, native: it.native.nl ?? Object.values(it.native)[0] } : null;
    }).filter(Boolean);
    const reasons = {};
    for (const r of reports) reasons[r.reason] = (reasons[r.reason] ?? 0) + 1;
    return {
      exerciseId,
      count: reports.length,
      track: latest.track,
      native: content.manifest?.tracks?.find((t) => t.id === latest.track)?.native ?? 'nl',
      packId: latest.pack_id,
      lessonId: latest.lesson_id,
      newestAt: latest.updated_at,
      reasons,
      reports: reports.map((r) => {
        const s = JSON.parse(r.snapshot);
        return {
          id: r.id, username: r.username, displayName: r.display_name, uiLang: r.user_lang, audience: r.user_audience, reason: r.reason, note: r.note,
          childAnswer: s.childAnswer, childCorrect: s.childCorrect, at: r.updated_at,
        };
      }),
      seen: snapshot.exercise,
      correctAnswer: snapshot.correctAnswer,
      clips: snapshot.clips,
      current: found ? adminExercise(content, audio, exerciseId) : null,
      hidden: !found && Boolean(content.retired?.has(exerciseId)),
      items,
    };
  });
}

/**
 * Close the open reports of an exercise. action: 'correct' (optionally with a message to each child: `message` true =
 * the default text in the child's language, a string = that text), 'dismiss' (no message), or 'fixed' (fixed
 * outside Admin → Corrections, e.g. by an audio re-render — like a correction the content job applied: resolution `fixed`,
 * each child gets the "your report fixed a mistake" message, or `message` when a string, and the badges are checked, so the
 * first fixed report earns the bug-hunter badge; `content` is needed for that).
 * @returns {{ closed: number, messages: number }}
 */
export function closeGroup(db, exerciseId, { action, message, content = null }, now = new Date()) {
  if (!['correct', 'dismiss', 'fixed'].includes(action)) throw new ReportError('invalid_action');
  if (typeof message === 'string' && message.trim().length > NOTE_MAX) throw new ReportError('message_too_long');
  const open = db.prepare(`SELECT r.*, u.ui_lang AS user_lang, u.audience AS user_audience FROM content_reports r JOIN users u ON u.id = r.user_id
                           WHERE r.exercise_id = ? AND r.status = 'open'`).all(exerciseId);
  if (!open.length) throw new ReportError('no_open_reports', 404);
  const nowIso = now.toISOString();
  let messages = 0;
  db.transaction(() => {
    db.prepare(`UPDATE content_reports SET status = 'closed', resolution = ?, closed_at = ?, updated_at = ? WHERE exercise_id = ? AND status = 'open'`)
      .run({ correct: 'correct', dismiss: 'dismissed', fixed: 'fixed' }[action], nowIso, nowIso, exerciseId);
    if (action === 'dismiss' || (action === 'correct' && !message)) return;
    const kind = action === 'fixed' ? 'fixed' : 'checked';
    const insert = db.prepare(`INSERT INTO child_messages (user_id, kind, text, report_id, exercise_id, created_at) VALUES (?, ?, ?, ?, ?, ?)`);
    const seen = new Set();
    for (const r of open) {
      if (seen.has(r.user_id)) continue;
      seen.add(r.user_id);
      const text = typeof message === 'string' && message.trim() ? message.trim() : defaultMessage(r.user_lang, kind, r.user_audience);
      insert.run(r.user_id, kind, text, r.id, exerciseId, nowIso);
      messages += 1;
      if (action === 'fixed' && content) awardBadges(db, content, r.user_id, { now });
    }
  })();
  return { closed: open.length, messages };
}

/** Unshown messages of a child, oldest first; a "fixed" message names the bug-hunter badge if it came with it. */
export function pendingMessages(db, userId) {
  const badgeAt = db.prepare("SELECT earned_at FROM user_badges WHERE user_id = ? AND badge_id = 'bug-hunter'").pluck().get(userId);
  return db.prepare('SELECT * FROM child_messages WHERE user_id = ? AND shown_at IS NULL ORDER BY id').all(userId).map((m) => ({
    id: m.id,
    kind: m.kind,
    text: m.text,
    createdAt: m.created_at,
    ...(m.kind === 'fixed' && badgeAt === m.created_at ? { badge: 'bug-hunter' } : {}),
  }));
}

export function markShown(db, userId, id, now = new Date()) {
  return db.prepare('UPDATE child_messages SET shown_at = ? WHERE id = ? AND user_id = ? AND shown_at IS NULL').run(now.toISOString(), id, userId).changes;
}

export const openReportCount = (db) => db.prepare("SELECT COUNT(DISTINCT exercise_id) FROM content_reports WHERE status = 'open'").pluck().get();
