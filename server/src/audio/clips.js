// Shared, pure audio-clip logic used by the render pipeline (scripts/render-audio) and the server.
// Audio is derived from text: a clip's file name is a hash of (voice, speaker, lengthScale, text — plus, when they apply, the
// override, the pronunciation lexicon's phoneme blocks and the carrier sentence), so a URL never reveals the word and
// changing the voice or speed produces different files.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const SPEEDS = ['normal', 'slow'];

/** Canonical form of text that is spoken: NFC, straight apostrophes, single spaces. Case and punctuation kept (they shape prosody). */
export function normalizeText(text) {
  return String(text ?? '')
    .normalize('NFC')
    .replace(/[‘’ʼ]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

const EDGE_PUNCT = /^[\s.,!?;:"«»()…¿¡-]+|[\s.,!?;:"«»()…¿¡-]+$/gu;

/** One displayed word → its tap-to-hear key: lower-case, edge punctuation removed, elisions kept ("J'ai" → "j'ai"). */
export function tokenKey(word) {
  return normalizeText(word).toLowerCase().replace(EDGE_PUNCT, '');
}

/** Spoken words of a text: space-separated pieces with a letter or digit (an apostrophe or hyphen keeps a word whole). */
export function spokenWords(text) {
  return normalizeText(text).split(' ').filter((w) => /[\p{L}\p{N}]/u.test(w));
}

/** What a clip says: 'word' (one word: "eight", "I've", "s'il"), 'short' (2–3 words) or 'sentence'. */
export function clipKind(text) {
  const n = spokenWords(text).length;
  return n <= 1 ? 'word' : n <= 3 ? 'short' : 'sentence';
}

/**
 * The pronunciation lexicon (content/pronunciations.json, compiled from content/src/<track>/pronunciations.yaml): per track
 * `words` (form → espeak phonemes, whole words anywhere), `alone` (only when the clip is that one word: English *a* as
 * /ə/), `beforeVowel` (only before a word that starts with a vowel letter) and `hiatus` (the same, said as before a short
 * break: the block ends in a comma, so the voice ends the vowel without linking it to the next one — English *sofa is*
 * without an intrusive r — and synth.py shortens that silence; a real mark after the word is used as it is),
 * `initial` (only as the first word of a clip of several words: French *Entre, …* said stressed at the start of a sentence
 * hissed between the nasal vowel and the t). Forms match without regard to case. Returns the text with each matching word replaced by a Piper phoneme block
 * `[[ … ]]` (piper-tts passes it to the voice unchanged), punctuation kept around it.
 */
export function applyLexicon(text, lex) {
  return lexiconParts(text, lex).said;
}

/** The phonemes of each `hiatus` word that got the comma (no real mark after it), in order: synth.py shortens their breaks. */
export function hiatusIn(text, lex) {
  return lexiconParts(text, lex).hiatus;
}

const VOWEL_START = /^[aeiouAEIOU]/;

function lexiconParts(text, lex) {
  const t = normalizeText(text);
  const hiatus = [];
  if (!lex) return { said: t, hiatus };
  const parts = t.split(' ');
  const words = spokenWords(t);
  const core = (w) => w.replace(EDGE_PUNCT, '');
  const out = parts.map((part, i) => {
    const c = core(part);
    if (!c) return part;
    const key = c.toLowerCase();
    let ph = lex.words?.[key];
    if (lex.alone?.[key] && words.length === 1) ph = lex.alone[key];
    if (lex.initial?.[key] && words.length > 1 && i === parts.findIndex((x) => core(x))) ph = lex.initial[key];
    const next = () => parts.slice(i + 1).map(core).find(Boolean);
    let brk = false;
    if (!ph && (lex.beforeVowel?.[key] || lex.hiatus?.[key]) && VOWEL_START.test(next() ?? '')) {
      ph = lex.beforeVowel?.[key] ?? lex.hiatus[key];
      brk = !lex.beforeVowel?.[key];
    }
    if (!ph) return part;
    const at = part.indexOf(c);
    // punctuation right after the word goes inside the block: Piper phonemizes the text after a block on its own, and
    // espeak drops a leading comma — "[[ ʌmbɹˈɛlə ]], it's" lost its pause and ran into "its"
    const rest = part.slice(at + c.length);
    const mark = rest.match(/^[,.;:!?]+/)?.[0] ?? '';
    if (brk && !mark) hiatus.push(ph);
    return `${part.slice(0, at)}[[ ${ph}${mark || (brk ? ',' : '')} ]]${rest.slice(mark.length)}`;
  });
  const said = out.join(' ');
  return { said: lex.colon === 'sentence' ? colonAsSentence(said) : said, hiatus };
}

/**
 * The lexicon's `colon: sentence`: the English and Dutch voices make almost no pause at a colon (measured on
 * 48 seeded renders each: median 0 ms of silence in English, 88 ms in Dutch), and a comma or semicolon does not help the Dutch
 * voice; a full stop does — when the next word starts with a capital (espeak ignores a full stop before a lower-case word):
 * median 182 ms (English), 200 ms (Dutch). So a colon followed by a word is said as ". " and that word capitalised, in what the
 * voice is given only (learners read the colon). Inside a lexicon block nothing changes (a colon there may be a length
 * mark). A clock time (10:30) has no space after its colon and is left alone. Part of `said`, so of
 * the clip's name.
 */
export function colonAsSentence(said) {
  const cap = (s) => s.replace(/^(["“«'(¿¡]*)(\p{Ll})/u, (m, open, ch) => `${open}${ch.toUpperCase()}`);
  // a phoneme block is left exactly as it is: a colon there may be part of its phonemes (a length mark)
  return said.split(/(\[\[[^\]]*\]\])/).map((part, i, parts) => {
    if (i % 2) return part;
    const next = part.replace(/\s*:\s+(\S+)/gu, (m, w) => `. ${cap(w)}`);
    // a colon right before a lexicon block ("Kies: [[ dʒˈɔp ]]"): the full stop alone (a block has no case)
    return i + 1 < parts.length ? next.replace(/\s*:\s+$/u, '. ') : next;
  }).join('');
}

/** content/pronunciations.json, or null. */
export function readPronunciations(contentDir) {
  const file = path.join(contentDir, 'pronunciations.json');
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8')).tracks ?? null;
}

/** Distinct word keys in a text. The fill-in blank "___" is not a word. */
export function tokenize(text) {
  return normalizeText(text)
    .split(' ')
    .filter((w) => !w.includes('___'))
    .map(tokenKey)
    .filter((k) => /\p{L}/u.test(k));
}

/** Synthesis settings an override may change (content/audio-overrides.json); anything else there is documentation. */
// take: a new render of the same settings (Piper samples noise, so a second take can be clean where the first babbled);
// it only changes the file name.
// carrier: another carrier sentence for this clip (audio:fix: a longer pause, another carrier word).
// end: "cut" — a carrier clip cut 40 ms after its last phoneme (a breath after a final vowel: "plu" → "pluf").
// hiatus: with `say` — the phonemes of the say text's blocks that end in a hiatus comma (synth.py's 160/240 ms break), in place
// of the lexicon's (one clip said with another hiatus spelling: "Grandma on Sunday" slow).
export const OVERRIDE_FIELDS = ['say', 'carrier', 'lengthFactor', 'noiseScale', 'noiseW', 'trim', 'take', 'end', 'hiatus'];

/** The synthesis part of an override, keys sorted (stable in the hash), or null when it changes nothing. */
export function synthOverride(entry) {
  if (!entry) return null;
  const out = {};
  for (const k of OVERRIDE_FIELDS) if (entry[k] !== undefined) out[k] = entry[k];
  return Object.keys(out).length ? out : null;
}

/**
 * Content-addressed file name, relative to the audio dir: "<track>/<sha1[0:16]>.mp3". A per-clip synthesis override is part
 * of the key (so changing it renders anew); a clip without one keeps the name it always had.
 */
export function clipFile(track, { voice, speaker, lengthScale }, text, override = null, { said = null, carrier = null } = {}) {
  const o = synthOverride(override);
  const t = normalizeText(text);
  const key = `${voice}|${speaker ?? ''}|${lengthScale}|${t}${o ? `|override:${JSON.stringify(o)}` : ''}`
    + `${said && said !== t ? `|said:${said}` : ''}${carrier ? `|carrier:${carrier}` : ''}`;
  return `${track}/${crypto.createHash('sha1').update(key).digest('hex').slice(0, 16)}.mp3`;
}

/** content/audio-overrides.json, or null when there is none. A malformed file throws (it would silently rename clips). */
export function readAudioOverrides(contentDir) {
  const file = path.join(contentDir, 'audio-overrides.json');
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/**
 * The override of one clip: content/audio-overrides.json `clips[track][text]` — either one entry for both speeds, or
 * `{ normal: {…}, slow: {…} }` with an entry per speed. Returns the entry or null.
 */
/** The speeds an override entry may name one by one ({ normal: {…}, 'dialogue-normal': {…} }); otherwise it is for all. */
export const OVERRIDE_SPEEDS = ['normal', 'slow', 'dialogue-normal', 'dialogue-slow'];
export const perSpeedEntry = (entry) => Boolean(entry) && OVERRIDE_SPEEDS.some((k) => k in entry);

/**
 * A pinned clip (`pins[track][text][speed] = { file, why }` in content/audio-overrides.json): listeners preferred the clip
 * as it is to a new rendering (Audio lab: *Worse*), so it keeps its file — no lexicon, no carrier, never rendered again.
 */
export function pinFor(overrides, track, speed, text) {
  return overrides?.pins?.[track]?.[normalizeText(text)]?.[speed] ?? null;
}

/** The carrier sentence of a clip ({ text, kinds } in content/voices.json per track; the main voice only), or null. */
export function carrierFor(voices, track, speed, text, override = null) {
  if (speed !== 'normal' && speed !== 'slow') return null;
  const c = voices?.[track]?.carrier;
  if (!c?.text || !(c.kinds ?? ['word', 'short']).includes(clipKind(text))) return null;
  return override?.carrier ?? c.text;
}

export function overrideFor(overrides, track, speed, text) {
  const entry = overrides?.clips?.[track]?.[normalizeText(text)];
  if (!entry) return null;
  // An entry with only a dialogue speed is per speed too (it was read as one entry for every speed)
  const e = perSpeedEntry(entry) ? entry[speed] : entry;
  return e && synthOverride(e) ? e : null;
}

export function lengthScaleFor(voiceConfig, speed) {
  return speed === 'slow' || speed === 'dialogue-slow' ? voiceConfig.slowLengthScale : voiceConfig.lengthScale;
}

/** The voice of a clip: the track's main voice, or its dialogue voice (speeds dialogue-normal / dialogue-slow). */
export function voiceFor(voices, track, speed) {
  const cfg = voices[track];
  if (!cfg) throw new Error(`content/voices.json has no voice for track "${track}"`);
  if (!speed.startsWith('dialogue-')) return cfg;
  if (!cfg.dialogue) throw new Error(`content/voices.json: track "${track}" has a dialogue but no dialogue voice ("dialogue": { voice, … })`);
  return cfg.dialogue;
}

/**
 * Which side of a multiple_choice exercise is in the target language: target text is a plain string,
 * native text a localized object ({ nl: … }). The validator guarantees question and options are opposite.
 */
export function mcQuestionIsTarget(exercise) {
  return typeof exercise.question === 'string';
}

/**
 * Everything in a pack the child can see or hear in the target language.
 * Returns { phrases: Set (vocabulary + sentence targets: normal + slow clips), words: Set (tokens: normal clip) }.
 */
export function collectPackTexts(pack) {
  const phrases = new Set();
  const dialoguePhrases = new Set(); // turns of speaker B: the course's dialogue voice (voices.json `dialogue`)
  const visible = [];
  const byId = new Map();
  for (const unit of pack.units) {
    for (const v of unit.vocabulary) {
      phrases.add(normalizeText(v.target));
      byId.set(v.id, v);
      visible.push(v.target);
    }
    for (const s of unit.sentences || []) {
      phrases.add(normalizeText(s.target));
      byId.set(s.id, s);
      visible.push(s.target);
    }
    // texts: one clip per sentence or turn (normal + slow); the player plays them in sequence
    for (const t of unit.texts || []) {
      const segs = t.kind === 'dialogue' ? t.turns ?? [] : (t.paragraphs ?? []).flat();
      for (const x of segs) {
        (x.speaker === 'B' ? dialoguePhrases : phrases).add(normalizeText(x.target));
        visible.push(x.target);
      }
      for (const q of [...(t.questions || []), ...(t.listeningQuestions || [])]) visible.push(q.question ?? '', q.statement ?? '', ...(q.options || []));
    }
  }
  for (const unit of pack.units) {
    for (const lesson of unit.lessons) {
      for (const ex of lesson.exercises) {
        switch (ex.type) {
          case 'multiple_choice':
            if (mcQuestionIsTarget(ex)) visible.push(ex.question);
            else visible.push(...ex.options.map((o) => o.text));
            break;
          case 'match_pairs':
            visible.push(...ex.pairs.map((p) => p.left));
            break;
          case 'build_sentence':
            visible.push(...ex.tokens, ...(ex.distractors || []));
            break;
          case 'fill_blank':
            visible.push(ex.sentence, ...(ex.options || []));
            break;
          case 'listen_choose':
            if (ex.answerSide === 'target') visible.push(...ex.options.map((o) => o.text));
            break;
          case 'cloze':
            visible.push(...(ex.options || []));
            break;
          default:
            break;
        }
      }
    }
  }
  const words = new Set(visible.flatMap(tokenize));
  return { phrases, dialoguePhrases, words, byId };
}

/**
 * Clip list for already-loaded packs, plus each voice's `sample` sentence (normal speed; played on Admin → Voices).
 * Deduplicated by file (a word that is also a vocabulary target shares its normal clip).
 */
/**
 * Packs as clipsForPacks takes them, from validated { pack, track } entries (validateContent): each with its course's target
 * language (a variant course — fr-en, French for English speakers — plays the clips of its target, fr).
 */
export const clipPacks = (entries) => entries.map(({ pack, track }) => ({ ...pack, target: track.target ?? track.id }));

export function clipsForPacks(packs, voices, overrides = null, lexicon = null) {
  const clips = new Map();
  const add = (track, speed, text) => {
    const cfg = voiceFor(voices, track, speed);
    const lengthScale = lengthScaleFor(cfg, speed);
    const override = overrideFor(overrides, track, speed, text);
    const t = normalizeText(text);
    const pinned = pinFor(overrides, track, speed, t);
    // a pinned clip keeps exactly what it was rendered from; every other clip gets the lexicon and, when short, the carrier
    const said = pinned ? t : applyLexicon(t, lexicon?.[track]);
    // breaks synth.py shortens (part of `said`, so of the name; an override's own `hiatus` goes with its `say`)
    const hiatus = pinned ? [] : override?.hiatus ?? hiatusIn(t, lexicon?.[track]);
    const carrier = pinned ? null : carrierFor(voices, track, speed, t, override);
    // a pin names its file: the clip as listeners heard it, whatever settings made it (never rendered again)
    const file = pinned ? pinned.file : clipFile(track, { voice: cfg.voice, speaker: cfg.speaker, lengthScale }, t, override, { said, carrier });
    if (!clips.has(file)) {
      clips.set(file, {
        file, track, speed, text: t, voice: cfg.voice, speaker: cfg.speaker ?? null, lengthScale, kind: clipKind(t),
        ...(said !== t ? { said } : {}),
        ...(hiatus.length ? { hiatus } : {}),
        ...(carrier ? { carrier } : {}),
        ...(pinned ? { pinned: true } : {}),
        ...(override ? { override: synthOverride(override) } : {}),
      });
    }
  };
  for (const pack of packs) {
    const { phrases, words, dialoguePhrases } = collectPackTexts(pack);
    const lang = pack.target ?? pack.track; // the clips of the course's target language (clipPacks)
    for (const p of phrases) {
      add(lang, 'normal', p);
      add(lang, 'slow', p);
    }
    for (const w of words) add(lang, 'normal', w);
    for (const p of dialoguePhrases) {
      add(lang, 'dialogue-normal', p);
      add(lang, 'dialogue-slow', p);
    }
  }
  for (const [track, cfg] of Object.entries(voices)) {
    if (cfg.sample) add(track, 'normal', cfg.sample);
    if (cfg.dialogue?.sample) add(track, 'dialogue-normal', cfg.dialogue.sample); // Admin → Voices plays it
  }
  return [...clips.values()].sort((a, b) => a.file.localeCompare(b.file));
}
