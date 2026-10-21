// The live content: packs, the id lock's retired exercises and the audio manifest, loaded together and swapped together.
// `systemctl reload anzo` (SIGHUP) calls reload(): the new index is built and checked completely first; only then is the
// single reference swapped, so a request sees either the old or the new content, never a mix. On any failure the old
// content stays and the error is returned (and logged). Sessions live in SQLite and are untouched.
import fs from 'node:fs';
import path from 'node:path';
import { loadContent } from './loader.js';
import { loadAudio } from '../audio/manifest.js';
import { compareLock, lockEntries, lockFailures } from './idlock.js';

/** The id lock file, or null when there is none (a fresh checkout without content). */
export function readRuntimeLock(contentDir) {
  const file = path.join(contentDir, 'ids.lock.json');
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
}

/** Lock failures for the loaded (available) packs only: packs not loaded are not compared. */
export function lockProblemsFor(content, lock) {
  if (!lock) return [];
  const loaded = new Set(content.packs.keys());
  const scoped = { ...lock, packs: Object.fromEntries(Object.entries(lock.packs || {}).filter(([id]) => loaded.has(id))) };
  return lockFailures(compareLock(scoped, lockEntries([...content.packs.values()].map((p) => p.pack))));
}

/**
 * Load everything the API serves from. Throws (ContentError, or Error for the lock) when the content is unusable.
 * strictLock: refuse content that breaks the id lock (a reload); at startup a lock problem is only reported.
 * @returns {{ content, audio, lockProblems: string[], loadedAt: string }}
 */
export function loadRuntime({ config, logger, strictLock = false }) {
  const content = loadContent({ contentDir: config.contentDir });
  const lock = readRuntimeLock(config.contentDir);
  const lockProblems = lockProblemsFor(content, lock);
  if (strictLock && lockProblems.length) {
    const err = new Error(`the content breaks the id lock: ${lockProblems.slice(0, 5).join('; ')}`);
    err.lockProblems = lockProblems;
    throw err;
  }
  // Exercise ids hidden by an admin correction: progress naming them stays valid (integrity, lesson totals).
  content.retired = new Map(Object.entries(lock?.retired || {}));
  // A lesson opened before one of its exercises was hidden still completes with the old count (progress.js).
  for (const id of content.retired.keys()) {
    const lesson = content.lessons.get(id.replace(/-[ex]\d+$/, ''));
    if (lesson) lesson.retiredCount = (lesson.retiredCount ?? 0) + 1;
  }
  const audio = loadAudio({ audioDir: config.audioDir, contentDir: config.contentDir, content, logger });
  return { content, audio, lockProblems, loadedAt: new Date().toISOString() };
}

/**
 * @param initial  the first loadRuntime() result
 * @param load     () => next runtime (throws on failure)
 * @param onSwap   (runtime) => void, called after a successful swap (legacy marking, status file)
 */
export function createContentStore(initial, { load, logger, onSwap } = {}) {
  let current = initial;
  let generation = 1;
  let lastReload = null;
  return {
    get content() {
      return current.content;
    },
    get audio() {
      return current.audio;
    },
    get runtime() {
      return current;
    },
    status() {
      return { generation, loadedAt: current.loadedAt, lockProblems: current.lockProblems, lastReload };
    },
    reload() {
      const at = new Date().toISOString();
      let next;
      try {
        next = load();
      } catch (err) {
        lastReload = { ok: false, at, error: err.message.split('\n').slice(0, 12).join('\n') };
        logger?.error({ error: lastReload.error }, 'content reload failed; the previous content stays in use');
        return lastReload;
      }
      // A lesson open since before the reload sends the playable count it was opened with: remember the earlier counts of
      // every lesson (an undone hide or an appended exercise raises it, and that run could otherwise never complete)
      for (const [id, lesson] of next.content.lessons) {
        const old = current.content.lessons.get(id);
        if (!old) continue;
        const known = new Set([...(old.knownCounts ?? []), old.playableCount]);
        known.delete(lesson.playableCount);
        if (known.size) lesson.knownCounts = [...known].slice(-4);
      }
      current = next;
      generation += 1;
      lastReload = { ok: true, at, packs: [...next.content.packs.keys()], audioMissing: next.audio.missing };
      logger?.info({ packs: lastReload.packs, audioMissing: next.audio.missing, generation }, 'content reloaded');
      try {
        onSwap?.(next);
      } catch (err) {
        logger?.error({ err }, 'after content reload');
      }
      return lastReload;
    },
  };
}
