// Admin → Listen check: random clips of the
// live audio, heard one at a time and marked OK or Bad, to know how many clips are wrong — something no automatic check can
// say. Pure logic here (strata, sampler, bounds, fix queue); the Audio quality table is lib/quality.js, the route
// routes/listen.js, the table listen_checks (016).
import { normalizeText } from '../audio/clips.js';
//
// Strata: language × kind (word, short phrase ≤ 3 words, sentence, text sentence — a sentence or turn of a reading text or
// dialogue) × speed (normal, slow; a dialogue's second voice counts as its speed). A clip is "re-rendered" when it was made
// by the current method: said inside a carrier sentence, or with the pronunciation lexicon.

export const LISTEN_KINDS = ['word', 'short', 'sentence', 'text'];
export const LISTEN_REASONS = ['babble', 'cut-off', 'wrong-word', 'wrong-pronunciation', 'other'];
/** Share of the random draws that are sentences (and text sentences); the rest are words and short phrases. */
export const SENTENCE_SHARE = 2 / 3;

const speedClass = (speed) => (speed.endsWith('slow') ? 'slow' : 'normal');
export const stratumKey = (c) => `${c.track}|${c.kind}|${c.speedClass}`;

const pools = new WeakMap();
/**
 * The clips that can be heard: the live audio's playable clips (audio.clips) with their stratum. Cached per audio object (a
 * reload makes a new one).
 */
export function listenPool(content, audio) {
  if (pools.has(audio)) return pools.get(audio);
  const textSegments = new Set();
  for (const { pack, target } of content?.packs?.values() ?? []) {
    for (const unit of pack.units ?? []) {
      for (const t of unit.texts ?? []) {
        for (const x of t.kind === 'dialogue' ? t.turns ?? [] : (t.paragraphs ?? []).flat()) textSegments.add(`${target}|${normalizeText(x.target)}`);
      }
    }
  }
  const clips = (audio?.clips ?? []).map((c) => {
    const text = c.speed.startsWith('dialogue-') || (c.kind === 'sentence' && textSegments.has(`${c.track}|${c.text}`)) ? 'text' : c.kind;
    return { file: c.file, track: c.track, speed: c.speed, text: c.text, kind: text, speedClass: speedClass(c.speed),
      rerendered: Boolean(c.carrier || c.said), seeded: Boolean(c.seeded), redone: Boolean(c.override || c.pinned) };
  });
  const out = { clips, byFile: new Map(clips.map((c) => [c.file, c])) };
  pools.set(audio, out);
  return out;
}

/** log of the binomial probability mass P(X = k) for n trials with probability p. */
function logPmf(n, k, p) {
  let lc = 0;
  for (let i = 1; i <= k; i++) lc += Math.log((n - k + i) / i);
  return lc + k * Math.log(p) + (n - k) * Math.log1p(-p);
}
const cdf = (n, k, p) => {
  let s = 0;
  for (let i = 0; i <= k; i++) s += Math.exp(logPmf(n, i, p));
  return s;
};

/**
 * 95 % upper bound on the error rate after `bad` bad clips in `n` random clips: the rule of three (3 / n) with none bad, the
 * exact Clopper–Pearson bound (two-sided 95 %: P(X ≤ bad) = 2.5 %) otherwise. null when nothing was heard.
 */
export function upperBound(n, bad) {
  if (!n) return null;
  if (bad === 0) return Math.min(1, 3 / n);
  if (bad >= n) return 1;
  let lo = bad / n;
  let hi = 1;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (cdf(n, bad, mid) > 0.025) lo = mid;
    else hi = mid;
  }
  return hi;
}

/** The latest verdict per file: Map(file → row). `rows`: listen_checks rows, oldest first. */
export function latestByFile(rows) {
  const m = new Map();
  for (const r of rows) m.set(r.file, r);
  return m;
}

/**
 * The fix queue. For each clip (language, speed, text) with a Bad verdict: `waiting` — the latest verdict on its current file is Bad
 * (audio:check flags it `listen`, audio:fix renders it again); `again` — it was re-rendered and the new file was not heard yet
 * (served first); `fixed` — the new file was heard OK. Returns { waiting: [...], again: [...], fixed: [...] }.
 */
export function listenQueue(rows, pool) {
  const latest = latestByFile(rows);
  const current = new Map(pool.clips.map((c) => [`${c.track}|${c.speed}|${c.text}`, c]));
  const out = { waiting: [], again: [], fixed: [] };
  // per clip its latest Bad verdict (the first one would keep an old note, and an overruled Bad would come back as "again")
  const lastBad = new Map();
  for (const r of rows) if (r.verdict === 'bad') lastBad.set(`${r.track}|${r.speed}|${r.text}`, r);
  for (const [key, r] of lastBad) {
    const now = current.get(key);
    if (!now) continue; // the text is gone from the content
    const v = latest.get(now.file);
    // what the queue shows is the verdict that keeps the clip in it: the latest one on its current file (also
    // its note); for a file not heard yet, the latest Bad verdict on the file before it
    const shown = v?.verdict === 'bad' ? v : r;
    const item = { ...now, reason: shown.reason, note: shown.note, heardAt: shown.heard_at };
    if (v?.verdict === 'bad') out.waiting.push(item);
    else if (now.file === r.file) continue; // the same file heard OK later: the Bad was overruled
    else if (latest.get(r.file)?.verdict === 'ok') continue; // overruled before the clip was recorded again: not a fix
    else if (!v) out.again.push(item);
    else out.fixed.push(item);
  }
  return out;
}

/**
 * The audio check as it stands now (Admin → System): the last full `npm run audio:check` (its spool status, with
 * every flagged file in `flaggedFiles`; `worst` for a status written before) combined with the latest verdict per current
 * file, as the Audio quality table counts them. A clip is flagged now when its current file's latest verdict is Bad, or the
 * check flagged that file for something it measured and nobody has heard it OK since. A flag on a file no longer in use (it
 * was recorded again) is gone; the new file counts as not checked. Returns null without a status.
 */
export function liveAudioCheck(status, rows, pool) {
  if (!status) return null;
  const latest = latestByFile(rows);
  const listed = status.flaggedFiles ?? status.worst ?? [];
  const named = listed.filter((e) => e.file);
  const byFile = new Map(named.map((e) => [e.file, e]));
  const flagged = [];
  for (const c of pool.clips) {
    const v = latest.get(c.file);
    const machine = (byFile.get(c.file)?.flags ?? []).filter((f) => f !== 'listen');
    if (v?.verdict === 'bad') flagged.push({ file: c.file, track: c.track, text: c.text, flags: [...machine, 'listen'], heardBad: true });
    else if (machine.length && v?.verdict !== 'ok') flagged.push({ file: c.file, track: c.track, text: c.text, flags: machine, heardBad: false });
  }
  // flagged clips the status does not name (an old status lists only its worst ten, an older one without files; a list
  // can be cut) are still counted, as it shows them — minus the clips heard Bad before the check outside the named ones, which
  // the check counted itself and this function counts again from their verdict
  const checkedAt = status.checkedAt ?? '';
  const badOutside = flagged.filter((f) => f.heardBad && !byFile.has(f.file) && (latest.get(f.file)?.heard_at ?? '') <= checkedAt).length;
  const unnamed = Math.max(0, (status.flagged ?? 0) - named.length - (status.flaggedFiles ? 0 : badOutside));
  return {
    flagged: flagged.length + unnamed,
    heardBad: flagged.filter((f) => f.heardBad).length,
    machine: flagged.filter((f) => !f.heardBad).length + unnamed,
    worst: [...flagged, ...(unnamed ? listed.filter((e) => !e.file) : [])].slice(0, 3).map(({ track, text, flags }) => ({ track, text, flags })),
  };
}

/** Per stratum (current files only, latest verdict per file): { key, track, kind, speed, clips, heard, bad, upper, mayBeBad }. */
export function listenStats(rows, pool) {
  const latest = latestByFile(rows);
  const strata = new Map();
  for (const c of pool.clips) {
    const key = stratumKey(c);
    const s = strata.get(key) ?? { key, track: c.track, kind: c.kind, speed: c.speedClass, clips: 0, heard: 0, bad: 0 };
    s.clips += 1;
    const v = latest.get(c.file);
    if (v) {
      s.heard += 1;
      if (v.verdict === 'bad') s.bad += 1;
    }
    strata.set(key, s);
  }
  const order = (s) => `${s.track}|${LISTEN_KINDS.indexOf(s.kind)}|${s.speed === 'slow' ? 1 : 0}`;
  return [...strata.values()].sort((a, b) => order(a).localeCompare(order(b))).map((s) => {
    const upper = upperBound(s.heard, s.bad);
    return { ...s, upper, mayBeBad: upper === null ? null : Math.round(upper * s.clips) };
  });
}

/**
 * The next clip to hear: a clip marked Bad and recorded again comes back first; then a seeded clip (a
 * fix or a Record again) that nobody heard; then at random — a sentence (or text
 * sentence) SENTENCE_SHARE of the time, else a word or short phrase, the language at random, then the clip — so every row of
 * the Audio quality table gets heard. null when everything was heard.
 */
export function nextClip(rows, pool, rand = Math.random) {
  const again = listenQueue(rows, pool).again;
  if (again.length) return { ...again[0], again: true };
  const heard = latestByFile(rows);
  const open = pool.clips.filter((c) => !heard.has(c.file));
  if (!open.length) return null;
  const pick = (xs) => {
    const tracks = [...new Set(xs.map((c) => c.track))].sort();
    const track = tracks[Math.floor(rand() * tracks.length)];
    const inTrack = xs.filter((c) => c.track === track);
    return { ...inTrack[Math.floor(rand() * inTrack.length)], again: false };
  };
  const fresh = open.filter((c) => c.seeded);
  if (fresh.length) return pick(fresh);
  const sentences = open.filter((c) => c.kind === 'sentence' || c.kind === 'text');
  const words = open.filter((c) => c.kind === 'word' || c.kind === 'short');
  return pick(!words.length || (sentences.length && rand() < SENTENCE_SHARE) ? sentences : words);
}
