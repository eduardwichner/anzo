// The family board: this week's XP of every learner side by side (Monday–Sunday, Europe/Amsterdam), the days practised,
// the streak, a family goal everyone adds to, and a crown for last week's top learner. Only this week counts: there is
// no all-time ranking (different languages, ages and levels). An account is on the board unless it switched itself off
// (users.show_on_board, Settings) or the admin hid it (users.board_hidden, Admin → Users).
import { amsterdamDate } from './gamification.js';
import { activityRows } from './activity.js';
import { getStats } from './users.js';

export const FAMILY_GOAL = { default: 500, min: 50, max: 10000 };

/** 'YYYY-MM-DD' plus n days. Pure calendar arithmetic (no instants), so a DST change never moves a day. */
export function addDays(day, n) {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** The Amsterdam week (Monday first) holding `day`: { start, end, days: [7 days] }. */
export function weekOf(day) {
  const [y, m, d] = day.split('-').map(Number);
  const back = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7; // Monday 0 … Sunday 6
  const start = addDays(day, -back);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  return { start, end: days[6], days };
}

/** The family's XP target per week (app_settings familyGoal; the default while the admin has not set one). */
export function familyGoal(db) {
  const v = Number(db.prepare("SELECT value FROM app_settings WHERE key = 'familyGoal'").pluck().get());
  return Number.isInteger(v) && v >= FAMILY_GOAL.min && v <= FAMILY_GOAL.max ? v : FAMILY_GOAL.default;
}

/** Set the family goal. Returns { goal } or { error: 'invalid_goal' }. */
export function setFamilyGoal(db, goal, by, now = new Date()) {
  if (!Number.isInteger(goal) || goal < FAMILY_GOAL.min || goal > FAMILY_GOAL.max) return { error: 'invalid_goal' };
  db.prepare(`INSERT INTO app_settings (key, value, updated_at, updated_by) VALUES ('familyGoal', ?, ?, ?)
              ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`)
    .run(String(goal), now.toISOString(), String(by ?? ''));
  return { goal };
}

/** XP per Amsterdam day of `days` (lessons + practice) for one user. */
function xpByDay(db, userId, days) {
  const out = new Map(days.map((d) => [d, { xp: 0, active: false }]));
  for (const r of activityRows(db, userId, days[0])) {
    const e = out.get(r.day);
    if (!e) continue;
    e.xp += r.xp;
    e.active = true; // a finished lesson or practice session counts as practised, whatever its XP
  }
  return out;
}

/**
 * The board as `viewerId` sees it. Members: every account shown on the board, by this week's XP (most first; equal XP
 * shares a rank and is listed alphabetically by display name). goal.xp = the members' XP this week. crown: the member(s)
 * with last week's highest XP (above 0) among today's members.
 */
export function familyBoard(db, { viewerId, now = new Date() } = {}) {
  const today = amsterdamDate(now);
  const week = weekOf(today);
  const lastWeek = weekOf(addDays(week.start, -7));
  const users = db.prepare(`SELECT id, display_name, avatar, avatar_bg FROM users
                            WHERE show_on_board = 1 AND board_hidden = 0 ORDER BY id`).all();
  const rows = users.map((u) => {
    const thisWeek = xpByDay(db, u.id, week.days);
    const prev = xpByDay(db, u.id, lastWeek.days);
    const days = week.days.map((d) => thisWeek.get(d).active);
    return {
      id: u.id,
      displayName: u.display_name,
      avatar: u.avatar,
      avatarBg: u.avatar_bg,
      xp: week.days.reduce((s, d) => s + thisWeek.get(d).xp, 0),
      days,
      daysPractised: days.filter(Boolean).length,
      streak: getStats(db, u.id, today).streak,
      lastWeekXp: lastWeek.days.reduce((s, d) => s + prev.get(d).xp, 0),
      me: u.id === viewerId,
    };
  });
  const top = Math.max(0, ...rows.map((r) => r.lastWeekXp));
  const members = rows
    .sort((a, b) => b.xp - a.xp || a.displayName.localeCompare(b.displayName) || a.id - b.id)
    .map(({ lastWeekXp, ...r }) => ({ ...r, rank: 1 + rows.filter((o) => o.xp > r.xp).length, crown: top > 0 && lastWeekXp === top }));
  const viewer = viewerId ? db.prepare('SELECT show_on_board, board_hidden FROM users WHERE id = ?').get(viewerId) : null;
  const target = familyGoal(db);
  const xp = members.reduce((s, r) => s + r.xp, 0);
  return {
    week: { ...week, today },
    goal: { target, xp, reached: xp >= target },
    members,
    viewer: viewer ? { shown: Boolean(viewer.show_on_board && !viewer.board_hidden), switchedOff: !viewer.show_on_board, hiddenByAdmin: Boolean(viewer.board_hidden) } : null,
  };
}
