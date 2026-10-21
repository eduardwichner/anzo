// Admin → Listen check → Audio quality: how good the recordings are, per language and per group
// (words and short phrases; sentences, dialogue turns and text sentences). Nothing is stored: every number is computed when
// the page opens, from the live audio (the clips the content plays now), the verdicts on those exact files (listen_checks)
// and the last full `npm run audio:check` (the spool status the System page reads). A clip rendered again — by audio:render,
// audio:fix or Record again — is a new file: its old verdict stays with the old file and the new one counts as not heard.
import { latestByFile, listenQueue, upperBound } from './listen.js';

export const QUALITY_GROUPS = ['words', 'sentences'];
export const qualityGroup = (c) => (c.kind === 'word' || c.kind === 'short' ? 'words' : 'sentences');

/**
 * Per group, one row per language: { track, clips, heard, bad, upper, redone }. `heard` and `bad` count the current files
 * (latest verdict per file); `upper` is the 95 % upper bound on the share of bad clips (lib/listen.js upperBound); `redone`
 * the clips with a per-clip fix (another take, carrier or cut, an acronym spelling, a pin: content/audio-overrides.json).
 */
export function qualityTable(rows, pool) {
  const latest = latestByFile(rows);
  const cells = new Map();
  for (const c of pool.clips) {
    const key = `${qualityGroup(c)}|${c.track}`;
    const x = cells.get(key) ?? { track: c.track, clips: 0, heard: 0, bad: 0, redone: 0 };
    x.clips += 1;
    if (c.redone) x.redone += 1;
    const v = latest.get(c.file);
    if (v) {
      x.heard += 1;
      if (v.verdict === 'bad') x.bad += 1;
    }
    cells.set(key, x);
  }
  const tracks = [...new Set(pool.clips.map((c) => c.track))].sort();
  return QUALITY_GROUPS.map((group) => ({
    group,
    rows: tracks.map((tr) => cells.get(`${group}|${tr}`)).filter(Boolean).map((x) => ({ ...x, upper: upperBound(x.heard, x.bad) })),
  }));
}

/**
 * The Bad clips being fixed: `again` recorded again, not heard yet (served first); `waiting` still the file heard Bad, of which
 * `pronunciation` were Bad for a wrong pronunciation (a lexicon entry fixes those, a new take seldom); `fixed` heard OK after.
 */
export function qualityFixing(rows, pool) {
  const q = listenQueue(rows, pool);
  return {
    again: q.again.length,
    waiting: q.waiting.length,
    pronunciation: q.waiting.filter((c) => c.reason === 'wrong-pronunciation').length,
    fixed: q.fixed.length,
  };
}

/** The last full machine check (spool status audio-check, written by npm run audio:check), or null when there is none. */
export function qualityCheck(status) {
  if (!status) return null;
  return { at: status.checkedAt ?? null, clips: status.clips ?? 0, flagged: status.flagged ?? 0, explained: status.explained ?? 0 };
}

/** Everything the Audio quality section shows. `checkStatus`: readStatus(spool, 'audio-check'). */
export function audioQuality(rows, pool, checkStatus) {
  return { groups: qualityTable(rows, pool), fixing: qualityFixing(rows, pool), check: qualityCheck(checkStatus) };
}
