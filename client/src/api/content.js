import { api } from './client.js';

const packCache = new Map();
let contentVersion = null;

/**
 * The courses with their levels. A new contentVersion (the server reloaded its lessons) empties the pack cache.
 * mine: the learner's own courses — what a child always gets; for the admin, his own Home, lessons and practice (without
 * it he gets every track, with preview levels, for Levels and the preview).
 */
export async function getTracks({ mine = false } = {}) {
  const res = await api(mine ? '/content/tracks?mine=1' : '/content/tracks');
  if (res.contentVersion && contentVersion && res.contentVersion !== contentVersion) clearContentCache();
  contentVersion = res.contentVersion ?? contentVersion;
  return res;
}

export async function getPack(id) {
  if (!packCache.has(id)) packCache.set(id, api(`/content/packs/${encodeURIComponent(id)}`));
  try {
    return await packCache.get(id);
  } catch (err) {
    packCache.delete(id);
    throw err;
  }
}

const pathCache = new Map();
/** A pack's path for Home (units and lessons only: /content/packs/:id/path), cached like the packs. */
export async function getPackPath(id) {
  if (!pathCache.has(id)) pathCache.set(id, api(`/content/packs/${encodeURIComponent(id)}/path`));
  try {
    return await pathCache.get(id);
  } catch (err) {
    pathCache.delete(id);
    throw err;
  }
}

/** The paths of a track's available packs, in manifest order (Home). */
export const getAvailablePaths = (track) => Promise.all(track.packs.filter((p) => p.status === 'available').map((p) => getPackPath(p.id)));

export function clearContentCache() {
  packCache.clear();
  pathCache.clear();
}

/** The pack whose lesson this is (lesson ids start with "<pack id>-u"), from the tracks list, or null. */
export const trackOfLesson = (tracks, lessonId) => tracks.find((tr) => tr.packs.some((p) => lessonId.startsWith(`${p.id}-u`))) ?? null;
/** The id of the available pack a lesson belongs to (only that pack is loaded for a lesson). */
export const packOfLesson = (track, lessonId) => track?.packs.find((p) => p.status === 'available' && lessonId.startsWith(`${p.id}-u`))?.id ?? null;

/** Available packs of the user's track(s), fully loaded, in manifest order. */
export async function getAvailablePacks(tracks) {
  const ids = tracks.flatMap((t) => t.packs.filter((p) => p.status === 'available').map((p) => p.id));
  return Promise.all(ids.map(getPack));
}

/** { textId: text } of the given public packs (reading texts and dialogues; exercises refer to them by textId). */
export const textsOf = (packs) => Object.fromEntries(packs.flatMap((p) => p.units.flatMap((u) => (u.texts || []).map((x) => [x.id, x]))));

export function findLesson(packs, lessonId) {
  for (const pack of packs) {
    for (const unit of pack.units) {
      const lesson = unit.lessons.find((l) => l.id === lessonId);
      if (lesson) return { pack, unit, lesson };
    }
  }
  return null;
}

/** { pack, unit, lesson, exercise } of an exercise id in the loaded packs, or null. */
export function findExercise(packs, exerciseId) {
  for (const pack of packs) {
    for (const unit of pack.units) {
      for (const lesson of unit.lessons) {
        const exercise = lesson.exercises.find((e) => e.id === exerciseId);
        if (exercise) return { pack, unit, lesson, exercise };
      }
    }
  }
  return null;
}
