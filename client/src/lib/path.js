// Lesson states on the Home path. Pure (unit-tested from server/test/path.test.js).
//   done     — completed at least once
//   optional — not done, in a level before the child's start level, an extra lesson (Extra oefening) or a lesson of an
//              optional branch level (pack.branch): playable, not required, never current
//   current  — the first lesson not done, from the start level on (the "Start" bubble)
//   locked   — after the current lesson
// Lessons unlock one by one; a start level (user_courses.start_pack, set per course by the admin) skips the levels before it.

/**
 * @param packs     public packs in track order ([{ id, units: [{ lessons: [{ id }] }] }])
 * @param done      { lessonId: … } of completed lessons
 * @param startPack pack id the child starts at, or null/undefined for the first pack
 * @returns Map lessonId -> state
 */
export function lessonStates(packs, done, startPack) {
  const states = new Map();
  const startIndex = Math.max(0, packs.findIndex((p) => p.id === startPack));
  let currentFound = false;
  packs.forEach((pack, i) => {
    for (const unit of pack.units) {
      for (const lesson of unit.lessons) {
        if (done[lesson.id]) states.set(lesson.id, 'done');
        else if (i < startIndex || lesson.extra || pack.branch) states.set(lesson.id, 'optional');
        else if (!currentFound) {
          states.set(lesson.id, 'current');
          currentFound = true;
        } else states.set(lesson.id, 'locked');
      }
    }
  });
  return states;
}

/** Whether a pack lies before the start level (its lessons are optional). */
export function isBeforeStart(packs, packId, startPack) {
  const start = packs.findIndex((p) => p.id === startPack);
  return start > 0 && packs.findIndex((p) => p.id === packId) < start;
}

/** Lessons done of one pack: { done, total, percent } (the level header's ring and the level sheet). */
export function packProgress(pack, done) {
  const ids = pack.units.flatMap((u) => u.lessons.filter((l) => !l.extra).map((l) => l.id));
  const n = ids.filter((id) => done[id]).length;
  return { done: n, total: ids.length, percent: ids.length ? Math.round((100 * n) / ids.length) : 0 };
}

/** Extra lessons (Extra oefening) of one pack: { done, total } — shown apart from the level's progress. */
export function packExtras(pack, done) {
  const ids = pack.units.flatMap((u) => u.lessons.filter((l) => l.extra).map((l) => l.id));
  return { done: ids.filter((id) => done[id]).length, total: ids.length };
}

/** { packId, unitId, lessonId } of the current lesson, or null when every required lesson is done. */
export function currentPosition(packs, states) {
  for (const pack of packs) {
    for (const unit of pack.units) {
      const lesson = unit.lessons.find((l) => states.get(l.id) === 'current');
      if (lesson) return { packId: pack.id, unitId: unit.id, lessonId: lesson.id };
    }
  }
  return null;
}
