import { Router } from 'express';
import { badgeList, wordsLearned } from '../lib/badges.js';
import { dailyGoalToday, goalWeek } from '../lib/activity.js';
import { getStats, publicUser } from '../lib/users.js';
import { visibleCourses, withActiveTrack, xpByTrack } from '../lib/courses.js';
import { lessonMap } from '../lib/progress.js';
import { requireAuth } from '../middleware/requireAuth.js';

// The learner's profile. Per learner: XP, streak, the daily goal of the last 7 days, the badges. Per course: XP, words
// learned, lessons done and the level badges. wordsLearned at the top is the active course's.
export function profileRoutes(ctx) {
  const { db } = ctx;
  const r = Router();
  r.get('/profile', requireAuth(db), (req, res) => {
    const u = withActiveTrack(db, ctx.content, req.user);
    const tracks = visibleCourses(db, ctx.content, u).map((e) => e.track);
    const xp = xpByTrack(db, ctx.content, u.id);
    const done = lessonMap(db, u.id);
    res.json({
      user: publicUser(u),
      stats: getStats(db, u.id),
      wordsLearned: u.active_track ? wordsLearned(db, ctx.content, u.id, u.active_track) : 0,
      courses: tracks.map((track) => ({
        track,
        xp: xp[track] ?? 0,
        wordsLearned: wordsLearned(db, ctx.content, u.id, track),
        lessonsDone: Object.keys(done).filter((id) => ctx.content.lessons.get(id)?.trackId === track).length,
      })),
      dailyGoal: dailyGoalToday(db, u),
      goalWeek: goalWeek(db, u),
      badges: badgeList(db, ctx.content, u, tracks),
    });
  });
  return r;
}
