// Admin → Users → <child> → Progress: a read-only report of one learner's learning in one course (track). XP, streak
// and the activity per day are the learner's across all courses; levels, accuracy, weakest words and words learned are the
// course's.
import { nativeText } from '../content/localized.js';
import { activityRows, lastDays } from './activity.js';
import { wordsLearned } from './badges.js';
import { getStats } from './users.js';
import { xpByTrack } from './courses.js';
import { isCurrentAttempt } from '../practice/index.js';
import { PRACTICE_TYPES } from '../practice/select.js';

const DAY_MS = 86_400_000;

/**
 * @returns {{
 *   track,
 *   summary: { xp, courseXp, streak, streakBest, wordsLearned, practiceSessions, badges, levels: [{ id, cefr, title, done, total, percent }] },
 *   days: [{ day, lessonXp, practiceXp, active, minutes, unknown }],   // last 30 Amsterdam days, oldest first
 *   accuracy: [{ type, recent: { correct, total }, allTime: { correct, total } }],  // first tries; recent = 30 days
 *   weakest: [{ id, kind, target, native, strength, lastSeen, timesWrong }]          // 20 lowest strengths
 * }}
 */
export function progressReport(db, content, user, track, now = new Date()) {
  const stats = getStats(db, user.id);
  const done = new Set(db.prepare('SELECT lesson_id FROM lesson_progress WHERE user_id = ?').pluck().all(user.id));
  const packs = [...content.packs.values()].filter((p) => p.trackId === track && !p.preview);
  const levels = packs.map((p) => {
    const ids = p.requiredLessonIds;
    const n = ids.filter((id) => done.has(id)).length;
    return { id: p.pack.id, cefr: p.pack.cefr, title: p.entry.title, done: n, total: ids.length, percent: ids.length ? Math.round((100 * n) / ids.length) : 0 };
  });

  // Activity per day: XP of lessons and practice, minutes where the duration is known.
  const days = lastDays(30, now);
  const byDay = new Map(days.map((d) => [d, { day: d, lessonXp: 0, practiceXp: 0, active: false, seconds: 0, unknown: 0 }]));
  for (const r of activityRows(db, user.id, days[0])) {
    const d = byDay.get(r.day);
    if (!d) continue;
    d.active = true;
    d[r.kind === 'lesson' ? 'lessonXp' : 'practiceXp'] += r.xp;
    if (r.durationS == null) d.unknown += 1;
    else d.seconds += r.durationS;
  }

  // Accuracy by exercise type: first tries only, of attempts that still describe their exercise.
  const recentSince = new Date(now.getTime() - 30 * DAY_MS).toISOString();
  const acc = new Map(PRACTICE_TYPES.map((t) => [t, { type: t, recent: { correct: 0, total: 0 }, allTime: { correct: 0, total: 0 } }]));
  for (const a of db.prepare('SELECT * FROM attempts WHERE user_id = ? AND first_try = 1').all(user.id)) {
    const found = content.exercises.get(a.exercise_id);
    if (!found || found.trackId !== track || !isCurrentAttempt(content, a)) continue;
    const row = acc.get(found.exercise.type);
    if (!row) continue;
    row.allTime.total += 1;
    row.allTime.correct += a.correct;
    if (a.created_at >= recentSince) {
      row.recent.total += 1;
      row.recent.correct += a.correct;
    }
  }

  // Weakest items among those seen: lowest strength, then most often wrong, then longest ago.
  const lookup = (id) => {
    for (const p of packs) {
      const v = p.vocabById.get(id);
      if (v) return { kind: 'word', target: v.target, native: nativeText(v.native, user.native_lang) };
      const s = p.sentenceById.get(id);
      if (s) return { kind: 'sentence', target: s.target, native: nativeText(s.native, user.native_lang) };
    }
    return null;
  };
  const wrongCounts = new Map(db.prepare(`SELECT j.value AS item, COUNT(*) AS n FROM attempts a, json_each(a.item_ids) j
                                          WHERE a.user_id = ? AND a.correct = 0 GROUP BY j.value`).all(user.id).map((r) => [r.item, r.n]));
  const weakest = db.prepare('SELECT item_id, strength, last_seen_at FROM item_strength WHERE user_id = ?').all(user.id)
    .map((r) => ({ id: r.item_id, strength: r.strength, lastSeen: r.last_seen_at, timesWrong: wrongCounts.get(r.item_id) ?? 0, info: lookup(r.item_id) }))
    .filter((r) => r.info)
    .sort((a, b) => a.strength - b.strength || b.timesWrong - a.timesWrong || (a.lastSeen < b.lastSeen ? -1 : 1))
    .slice(0, 20)
    .map(({ info, ...r }) => ({ ...r, ...info }));

  return {
    track,
    summary: {
      xp: stats.xp,
      courseXp: track ? xpByTrack(db, content, user.id)[track] ?? 0 : 0,
      streak: stats.streak,
      streakBest: stats.streakBest,
      wordsLearned: track ? wordsLearned(db, content, user.id, track) : 0,
      practiceSessions: db.prepare('SELECT COUNT(*) FROM practice_sessions WHERE user_id = ? AND track = ? AND finished_at IS NOT NULL').pluck().get(user.id, track),
      badges: db.prepare('SELECT COUNT(*) FROM user_badges WHERE user_id = ?').pluck().get(user.id),
      levels,
    },
    days: [...byDay.values()].map(({ seconds, ...d }) => ({ ...d, minutes: Math.round(seconds / 60) })),
    accuracy: [...acc.values()],
    weakest,
  };
}
