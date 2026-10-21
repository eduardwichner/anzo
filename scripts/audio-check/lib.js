// Pure logic of npm run audio:check: comparable words, word error rate, robust statistics per clip group and the flag
// rules. The measurements come from analyze.py (energy, zero crossings + Vosk) and phonemes.py (espeak's phonemes of what
// the clip says); this file decides what is suspicious. Unit-tested (server/test/audio-check.test.js).
import { spokenWords } from '../../server/src/audio/clips.js';

/** Words to compare: lower-case, accents and apostrophes/hyphens folded, punctuation dropped. */
export function compareWords(text) {
  return String(text ?? '')
    .normalize('NFD').replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/['’ʼ\-–]/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/** One spoken word: no space ("I've", "s'il", "e-mail", "aujourd'hui" are one word). */
export const isSingle = (text) => spokenWords(text).length <= 1;

// Phoneme classes (espeak IPA as Piper's voices get it). A diphthong or a long vowel is one nucleus.
const VOWELS = new Set([...'aeiouyɑɒɔəɛɜɪʊʌæøœɐɵɘɯɤʏɞ']);
const STOPS = new Set([...'pbtdkgʔ']);
const FRICATIVES = new Set([...'szfvʃʒxɣhθðʁç']);
const VOICELESS_FRICATIVES = new Set([...'sʃfxθç']);
const MARKS = /[ˈˌ\-,.?!;:…ʲ\u0303ː]/gu;

/**
 * What the phonemes say about a clip's shape: first and last sound class (vowel | stop | fricative | other), whether
 * it starts with a voiceless fricative, its vowel nuclei, and its closures — stops between two vowels, where a word may
 * fall silent for a moment (a second voiced span there is the word itself, not babble).
 */
export function phonemeInfo(phonemes) {
  const words = String(phonemes ?? '').replace(MARKS, '').split(/\s+/).filter(Boolean);
  const sounds = [...words.join('')];
  const cls = (c) => (c === undefined ? null : VOWELS.has(c) ? 'vowel' : STOPS.has(c) ? 'stop' : FRICATIVES.has(c) ? 'fricative' : 'other');
  let nuclei = 0;
  let closures = 0;
  sounds.forEach((c, i) => {
    if (VOWELS.has(c) && !VOWELS.has(sounds[i - 1])) nuclei += 1;
    if (STOPS.has(c) && sounds.slice(0, i).some((x) => VOWELS.has(x)) && sounds.slice(i + 1).some((x) => VOWELS.has(x))) closures += 1;
  });
  const last = sounds.at(-1);
  // a final stop, or a stop followed only by consonants (French "titre" tʁ): its release may be a short span of its own
  const lastStop = sounds.findLastIndex((c) => STOPS.has(c));
  const finalRelease = lastStop >= 0 && !sounds.slice(lastStop + 1).some((x) => VOWELS.has(x));
  return { words: words.length, first: cls(sounds[0]), last: cls(last), voicelessFricativeStart: VOICELESS_FRICATIVES.has(sounds[0]), nuclei, closures, finalRelease };
}

/**
 * espeak's intrusive /ɹ/ (British English): a word whose phonemes end in ɹ though its spelling has no r, before another
 * word ("Anna is" → ˈanəɹ ɪz, "Anner is"). Returns the words, or [] (also when words and phonemes do not line up).
 */
export function intrusiveR(text, phonemes) {
  const spelled = spokenWords(text);
  const said = String(phonemes ?? '').split(/\s+/).map((w) => w.replace(/[,.?!;:…]+$/u, '')).filter(Boolean);
  if (spelled.length !== said.length || spelled.some((w) => /\d/.test(w))) return [];
  const out = [];
  for (let i = 0; i < spelled.length - 1; i += 1) {
    const w = spelled[i].replace(/[^\p{L}']/gu, '').toLowerCase();
    if (said[i].endsWith('ɹ') && !/(r|re|rr|r's)$/.test(w)) out.push(spelled[i]);
  }
  return out;
}

/** Letters of a text (what a clip's length scales with). */
export const letters = (text) => (String(text).match(/\p{L}/gu) ?? []).length;

/** Word-level Levenshtein alignment: { wer, sub, del, ins }. */
export function wordErrors(ref, hyp) {
  const n = ref.length;
  const m = hyp.length;
  const d = Array.from({ length: n + 1 }, (_, i) => Array.from({ length: m + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= n; i += 1) {
    for (let j = 1; j <= m; j += 1) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (ref[i - 1] === hyp[j - 1] ? 0 : 1));
    }
  }
  let i = n;
  let j = m;
  let sub = 0;
  let del = 0;
  let ins = 0;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && d[i][j] === d[i - 1][j - 1] + (ref[i - 1] === hyp[j - 1] ? 0 : 1)) {
      if (ref[i - 1] !== hyp[j - 1]) sub += 1;
      i -= 1;
      j -= 1;
    } else if (i > 0 && d[i][j] === d[i - 1][j] + 1) {
      del += 1;
      i -= 1;
    } else {
      ins += 1;
      j -= 1;
    }
  }
  return { wer: n ? (sub + del + ins) / n : hyp.length ? 1 : 0, sub, del, ins };
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  if (!s.length) return null;
  const h = s.length >> 1;
  return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2;
};

/** Clips compare with clips of the same language, speed and length class. */
export function groupKey(clip) {
  const l = letters(clip.text);
  const size = l <= 3 ? 'xs' : l <= 6 ? 's' : l <= 10 ? 'm' : l <= 20 ? 'l' : 'xl';
  return `${clip.track}|${clip.speed}|${size}`;
}

/** Per group: median and MAD of log(voiced ms per letter), and the median voiced ms. */
export function groupStats(rows) {
  const groups = new Map();
  for (const r of rows) {
    if (!r.m?.voicedMs || !letters(r.text)) continue;
    const k = groupKey(r);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  const stats = new Map();
  for (const [k, rs] of groups) {
    const logs = rs.map((r) => Math.log(r.m.voicedMs / letters(r.text)));
    const med = median(logs);
    const mad = median(logs.map((x) => Math.abs(x - med)));
    stats.set(k, { n: rs.length, medLog: med, mad: Math.max(mad, 0.05), medPerLetter: Math.exp(med) });
  }
  return stats;
}

// Calibrated on the first full run (18,184 clips): a phrase that is merely long (pauses at commas) with a
// clean transcript, extra words "heard" in a single word of normal length, and a misheard phrase of normal length were
// recognizer limits, not bad clips; babble is long AND heard as extra words, truncation is short.
export const THRESHOLDS = {
  zLong: 3.5, // robust z of log(ms per letter) above the group …
  longExtraMs: 350, // … and at least this much longer than the group's typical clip of that many letters
  phraseLongWer: 0.5, // a long phrase is flagged only with extra words heard or this word error rate
  zShort: -4,
  leadMs: 400,
  babbleExtraWords: 3, // the recognizer heard ≥ 3 more words than the text has …
  babbleRatio: 2, //      … and at least twice as many …
  babbleMinZ: 2, //       … in a clip longer than usual (Vosk invents words in a short single word)
  phraseWer: 0.75, // a phrase of ≥ 3 words mostly not recognized …
  phraseMinWords: 3,
  werMinAbsZ: 2.5, // … and of unusual length; otherwise "uncertain" (listed, not flagged: a recognizer limit)
  tailFactor: 1.5, // a single word's expected end: its voice start + 1.5 × the group's typical length …
  tailMs: 100, //    … voice after it (a babble tail: "red … where and eleven"; 300 would miss "eight awrwrw" at 255)
  trailMs: 1000, // silence after the voice (the speaker icon stays busy, sound effects wait)
  // calibrated on 13 clips listeners reported and 1,500 random ones:
  secondMinMs: 60, // a single word: another voiced span this long after a pause (analyze.py merges spans < 80 ms apart) …
  releaseMaxMs: 120, // … not counting the release of a final stop (≤ this) or a span per closure between vowels
  shortWords: 3, //  the rules below look at words and short phrases (the carrier clips)
  padLeadMs: 30, //  synth.py's padding before the voice …
  cutOnsetMs: 20, // … a voice this close to the cut (or the start of synthesis) had its first sound clipped
  gapMinMs: 40, //   a carrier clip keeps at least this much silence before the word (synth.py measures it: gapMs)
  headMs: 20, //     a word starting with a voiceless fricative (s, f, ch …) shows at least this much of it before the vowel
  // sound after the last vowel, by the last phoneme. Stop and fricative: the 90th percentile of the carrier clips listeners
  // preferred in a compare round (en 320/330, nl 340/330 ms) — a word at the end of a sentence
  // keeps its last consonant long; vowel and other: 150 ms (their 90th percentile is ~150 ms; "the" with 170 ms was reported)
  codaMs: { vowel: 150, other: 150, stop: 350, fricative: 350 },
  quietTailMs: 400, // a quiet murmur (30–55 dB under the peak) this long after the voice: "child … awawaw"
  weakDb: -15, //    a carrier clip whose word came out this far under the carrier's peak was whispered (synth.py: wordDb)
  // from Listen check remarks ("make a bit of pause after the comma", "not enough pause after the
  // ':'", a pause in the middle of "Georges et Ismaël") and the measured pauses of every sentence clip (the Dutch voice: a
  // median of 0 ms at a comma; English 340 ms, French 280 ms at normal speed):
  pauseMarkMs: { normal: 120, slow: 180 }, //  a sentence: the pause at a mark inside it (, ; : — . ? !) at least this long …
  pauseExtraMs: { normal: 170, slow: 260 }, // … and no pause this long between two words without one
  pauseWindow: 0.12, // without the renderer's measures: a pause belongs to a mark within this share of the voiced span
  // A hiatus break (the lexicon's `hiatus`, synth.py: hiatusMs) shorter than this — the voice ran through the comma
  hiatusMinMs: 100,
};

const speedClass = (speed) => (String(speed).endsWith('slow') ? 'slow' : 'normal');

/**
 * The pauses of a sentence clip estimated from its energy (analyze.py segments: voiced runs, gaps < 80 ms merged) and its
 * phonemes, for a clip rendered before synth.py measured them: each mark inside the text (, ; : — and . ? ! … before more
 * words) sits at the share of the sounds said before it; its pause is the longest gap within `pauseWindow` of that point
 * (0 when none). Every other gap is a pause between words without a mark. Returns { marks: [ms…], extra: [ms…] }.
 */
export function pauseGaps(segments, phonemes, t = THRESHOLDS) {
  const segs = segments ?? [];
  if (segs.length < 1 || !phonemes) return { marks: [], extra: [] };
  const chars = [...String(phonemes).replace(/[ˈˌː\u0303ʲ]/gu, '').trimEnd()];
  const total = chars.filter((c) => /\p{L}/u.test(c)).length;
  if (!total) return { marks: [], extra: [] };
  const at = [];
  let n = 0;
  chars.forEach((c, i) => {
    if (/\p{L}/u.test(c)) n += 1;
    else if (/[,;:—.?!…]/u.test(c) && chars.slice(i + 1).some((x) => /\p{L}/u.test(x))) at.push(n / total);
  });
  const v0 = segs[0][0];
  const span = Math.max(1, segs.at(-1)[1] - v0);
  const gaps = segs.slice(1).map((sg, i) => ({ at: (segs[i][1] - v0) / span, ms: sg[0] - segs[i][1] }));
  const near = (g, p) => Math.abs(g.at - p) <= t.pauseWindow;
  return {
    marks: at.map((p) => Math.max(0, ...gaps.filter((g) => near(g, p)).map((g) => g.ms))),
    // a gap at the very end is a final stop's release, not a pause between words
    extra: gaps.filter((g) => g.at < 0.97 && !at.some((p) => near(g, p))).map((g) => g.ms),
  };
}

/**
 * `pause` for a sentence clip (more than `shortWords` words): a mark inside it with too short a pause, or a long pause
 * between two words without a mark. synth.py's own measures (audio/manifest.json → files: pauseMarkMs, pauseExtraMs, from
 * the alignments, after shaping) when the clip has them, else the estimate from the energy.
 */
export function pauseFlag(clip, t = THRESHOLDS) {
  if (spokenWords(clip.text).length <= t.shortWords || clip.carrier) return false;
  const sp = speedClass(clip.speed);
  const minMark = t.pauseMarkMs[sp];
  const maxExtra = t.pauseExtraMs[sp];
  if (clip.pauseMarkMs !== undefined || clip.pauseExtraMs !== undefined) {
    return (clip.pauseMarkMs != null && clip.pauseMarkMs < minMark) || (clip.pauseExtraMs != null && clip.pauseExtraMs >= maxExtra);
  }
  const { marks, extra } = pauseGaps(clip.m?.segments, clip.phonemes, t);
  return marks.some((g) => g < minMark) || extra.some((g) => g >= maxExtra);
}

/** Voiced ms after `endMs` (segments [[start, end] …] from analyze.py). */
export const voicedAfter = (segments, endMs) => segments.reduce((n, [a, b]) => n + Math.max(0, b - Math.max(a, endMs)), 0);

/**
 * The flags of one clip ({ text, track, speed, m: analyze.py result }), given its group's stats.
 * Returns { flags: [..], z, expectedMs, wer, hyp, ref }.
 */
/** Voiced spans after the first that are more than a word's own pauses: closures between vowels, a final release. */
export function extraSpans(segments, info, t = THRESHOLDS) {
  const after = (segments ?? []).slice(1).filter(([a, b]) => b - a >= t.secondMinMs);
  const last = segments?.at(-1);
  const release = info?.finalRelease && after.length && last && last[1] - last[0] <= t.releaseMaxMs ? 1 : 0;
  return Math.max(0, after.length - release - (info?.closures ?? 0));
}

/**
 * The flags of one clip ({ text, track, speed, m: analyze.py result, phonemes?, said?, expectedSaid?, gapMs? }), given its
 * group's stats. `phonemes` are espeak's phonemes of what the clip says (said: the text, or its lexicon form); `expectedSaid`
 * is what the current lexicon would say (a clip rendered before a lexicon entry is out of date); `gapMs` the silence a
 * carrier clip kept before the word (synth.py, audio/manifest.json). Returns { flags: [..], z, expectedMs, wer, hyp, ref }.
 */
export function flagClip(clip, stats, t = THRESHOLDS) {
  const { m } = clip;
  const flags = [];
  const ref = compareWords(clip.text);
  const hyp = compareWords(m.transcript);
  const errs = wordErrors(ref, hyp);
  const l = letters(clip.text);
  const g = stats.get(groupKey(clip));
  const single = isSingle(clip.text);
  const short = spokenWords(clip.text).length <= t.shortWords;
  const info = clip.phonemes ? phonemeInfo(clip.phonemes) : null;
  let z = null;
  let expectedMs = null;
  const uncertain = [];
  const extraHeard = hyp.length > ref.length;
  if (!m.voicedMs) flags.push('silent');
  else if (g && l) {
    z = (Math.log(m.voicedMs / l) - g.medLog) / (1.4826 * g.mad);
    expectedMs = Math.round(g.medPerLetter * l);
    if (z > t.zLong && m.voicedMs - expectedMs > t.longExtraMs) {
      if (single || extraHeard || errs.wer >= t.phraseLongWer) flags.push('long');
      else uncertain.push('long-clean'); // pauses at punctuation, every word heard
    }
    if (z < t.zShort) flags.push('short');
    const wordEnd = (m.voicedStartMs ?? 0) + t.tailFactor * expectedMs;
    if (single && m.segments?.length && voicedAfter(m.segments, wordEnd) >= t.tailMs) flags.push('tail');
    // a single word whose file goes on long after it (faint blips, then silence: "red" slow lasted 4 s)
    if (single && m.durationMs - wordEnd > t.trailMs && !flags.includes('tail')) flags.push('trail');
  }
  if (m.trailMs > t.trailMs && !flags.includes('trail')) flags.push('trail');
  if (m.leadMs > t.leadMs) flags.push('lead');
  if (m.clipped > 0) flags.push('clipping');
  // a single word that goes on after a pause ("old … old", "is … hă"): more voiced spans than its closures explain
  const spans = single && m.voicedMs ? extraSpans(m.segments, info, t) : 0;
  if (spans > 0) flags.push('second');
  if (hyp.length - ref.length >= t.babbleExtraWords && hyp.length >= t.babbleRatio * ref.length) {
    if (z === null || z >= t.babbleMinZ) flags.push('extra-words');
    else uncertain.push('extra-words-normal-length');
  } else if (single && extraHeard && (m.segments?.length ?? 0) > 1) flags.push('extra-words'); // heard more, and a second span
  if (short && m.voicedMs && m.onsetMs !== undefined) {
    // the first sound clipped: voice right at the cut, a voiceless fricative with nothing of it before the vowel, or a carrier
    // cut that kept too little silence
    // (a carrier clip: the silence kept from the pause, measured in the clip itself after its 30 ms padding — the
    // renderer's own gapMs was measured against the whole sentence's peak in older renders and can be too kind)
    const gap = clip.gapMs !== undefined && clip.gapMs !== null;
    const carrier = Boolean(clip.carrier) || gap; // a reused earlier take may have no gapMs in the manifest
    const atCut = !carrier && m.onsetMs - t.padLeadMs < t.cutOnsetMs && info?.first && info.first !== 'vowel';
    const noHead = info?.voicelessFricativeStart && m.vowelStartMs !== null && m.vowelStartMs - m.onsetMs < t.headMs;
    const closeCut = carrier && ((gap && clip.gapMs < t.gapMinMs) || m.onsetMs - t.padLeadMs < t.gapMinMs);
    if (atCut || noHead || closeCut) flags.push('onset');
    // sound after the last vowel longer than the last consonant needs ("the" + a hiss, "plaît" + an s)
    if (info?.last && m.afterVowelMs > (t.codaMs[info.last] ?? t.codaMs.other)) flags.push('coda');
    if (m.quietTailMs >= t.quietTailMs) flags.push('quiet-tail');
    if (typeof clip.wordDb === 'number' && clip.wordDb < t.weakDb) flags.push('weak'); // a lone schwa, whispered
  }
  // a sentence's pauses: none at a comma or colon, or one in the middle of a phrase. Listed, never flagged
  // (takes chosen by this rule, and pauses shaped for it, were heard as worse)
  if (m.voicedMs && pauseFlag(clip, t)) uncertain.push('pause');
  // a hiatus break the voice ran through ("sofa is" may link with an r again): listed for a listener
  if (typeof clip.hiatusMs === 'number' && clip.hiatusMs < t.hiatusMinMs) uncertain.push('hiatus');
  // pronunciation: espeak's intrusive r, or a clip rendered before the lexicon entry that now applies to it
  if ((clip.track === 'en' && clip.phonemes && intrusiveR(clip.text, clip.phonemes).length)
    || (clip.expectedSaid !== undefined && clip.expectedSaid !== (clip.said ?? clip.text))) flags.push('pronunciation');
  if (ref.length >= t.phraseMinWords && errs.wer >= t.phraseWer) {
    if (z === null || Math.abs(z) >= t.werMinAbsZ) flags.push('wer');
    else uncertain.push('wer-normal-length');
  }
  return { flags, uncertain, z: z === null ? null : Math.round(z * 10) / 10, expectedMs, wer: Math.round(errs.wer * 100) / 100, ref, hyp };
}

/** Severity for "the worst 30": the duration excess and the babble count most. */
export function severity(row) {
  const f = row.check;
  return (f.flags.length * 10) + Math.max(0, f.z ?? 0) + Math.max(0, f.hyp.length - f.ref.length) + f.wer;
}

/**
 * Cached results that no longer describe their file: `audio:render -- --force` writes new takes under the
 * same content-hash names, so the cache keys on the name *and* a stamp (size + mtime). An entry without a stamp (an older
 * cache) is adopted with the file's current stamp. Returns the clips to analyse; sets the stamp of adopted entries.
 */
export function staleClips(clips, results, stampOf) {
  return clips.filter((c) => {
    const r = results[c.file];
    if (!r) return true;
    // the shape measures were added to analyze.py: a word or short phrase analysed before then is measured again
    if (r.ok && r.onsetMs === undefined && spokenWords(c.text).length <= THRESHOLDS.shortWords) return true;
    const stamp = stampOf(c.file);
    if (r.stamp === undefined) {
      r.stamp = stamp;
      return false;
    }
    return r.stamp !== stamp;
  });
}

/**
 * Is a flag on this clip explained in audio-overrides.json → accepted[track][text]? A plain reason covers every clip of
 * the text; { why, speeds: ['normal', …] } only those speeds.
 */
export function acceptedFor(accepted, clip) {
  const entry = accepted?.[clip.track]?.[clip.text];
  if (!entry) return null;
  if (typeof entry === 'string') return entry;
  return !entry.speeds || entry.speeds.includes(clip.speed) ? entry.why ?? 'accepted' : null;
}
