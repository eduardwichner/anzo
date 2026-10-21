# Audio

Part of the developer docs (`CONTRIBUTING.md` → *Developer docs*). How clips are rendered offline with Piper and served, the
client player, the audio check, the Listen check, and the tools and models.

No TTS runs at request time. Piper (GPL-3.0, Python) and lame are **authoring tools**; the `anzo` service only serves MP3
files.

```
content/packs/*.json + content/voices.json
   │  scripts/render-audio/collect.js      clip list: vocab + sentence targets (normal + slow), visible words (normal)
   ▼
scripts/render-audio/lexicon.js      content/src/<track>/pronunciations.yaml → content/pronunciations.json (phoneme blocks)
scripts/render-audio/index.js ──stdin/stdout JSON lines──> synth.py (tools/piper-venv, PiperVoice.load once per voice, ≤ 4 threads)
   │  short clips: "<carrier> <word>." → cut in the pause; sentences as the voice says them   WAV (temp dir) → lame --preset voice -m m
   │  noise seeded per clip (seed = first 32 bits of the clip's name), one ONNX thread per process, no memory arena
   │  → audio/<track>/<sha1(voice|speaker|lengthScale|text[|override][|said][|carrier])[0:16]>.mp3   (a pin names its file)
   ▼
audio/manifest.json  { clips: {track: {normal|slow: {text: file}}}, files: {file: {durationMs, bytes, seed?, gapMs?, wordDb?, …}}, voices }
   │  server/src/audio/manifest.js at startup
   ▼
publicPack(): audio/audioSlow/wordAudio URLs   ·   /audio static (immutable, ranges)   ·   client AudioPlayer
```

- File names are content hashes: unchanged content re-renders nothing; a voice/speed change makes new
  names, and the old files become orphans that the next render deletes (`--keep-orphans` keeps them, for a rollback).
  `--workers N` runs up to 4 `synth.py` processes (jobs sorted by voice and sliced), each on **one** ONNX thread (a seeded clip
  renders to the same samples only on the same number of threads) and without onnxruntime's memory arena (with it, one
  process keeps the peak of the longest slow sentence, about 1.3 GB; four of them can exhaust a 4 GB machine). Use at most
  2–3 workers beside anything else; a sentence takes ≈ 2–3 s per process, a short clip ≈ 0.3 s. `--force` re-renders all but
  pinned clips (needed only after changing `synth.py` itself: volume −1 dBFS, 5 ms fades, 30/60 ms padding).
- **Workflow: content change ⇒ `npm run audio:render` ⇒ `sudo systemctl restart anzo`.**
  `npm run content:validate -- --audio` reports clips missing from the manifest.
- Voice choice: `content/voices.json` (`voice`, `speaker` for multi-speaker voices, `lengthScale` 1.1,
  `slowLengthScale` 1.6, `sample`). **One voice per language, no choice in the UI.** After editing:
  `scripts/fetch-models.sh` (downloads the named voices and deletes voices no longer named), `npm run audio:render`,
  restart. Defaults: en `en_GB-cori-medium` (public domain), fr `fr_FR-siwis-medium`
  (CC-BY 4.0), nl `nl_BE-rdh-medium` (Belgian Dutch, CC0 1.0; chosen over `nl_BE-nathalie-medium` because none of 50 sample
  clips ended with less than 38 ms of trailing silence, against 11 clips under 20 ms for nathalie, which clipped final
  consonants). Only voices whose MODEL_CARD licence is assessed `permissive` may be defaults
  (`models-manifest.js` warns otherwise).
- Client: `client/src/audio/player.js` wraps one hidden `<audio id="anzo-audio">`. `unlock()` (silent
  `/silence.mp3`) runs inside the tap that opens a lesson (Home node, "Nog een keer") and on the first
  pointer/key event in a lesson — iOS only allows later programmatic `play()` after that. Starting a clip
  stops the previous one; the same clip again restarts in place (no new source load: Chromium then serves it from cache;
  WebKit still asks for a byte range per restart); a `play()` interrupted by the next tap resolves `false`, never rejects
  (any sequence of taps is safe: `server/test/hardening.test.js`, e2e 28). Auto-play (target-language MC questions,
  listening exercises; once on appear) is the account setting *Settings → Play words automatically* (`users.autoplay`,
  default on); there is no switch in the lesson header.
- **Texts** (reading texts, dialogues): one clip per sentence or turn (normal + slow), so rendering, overrides and the audio
  check apply unchanged. Turns of speaker B are rendered with the course's **dialogue voice** (`content/voices.json` →
  `<track>.dialogue`: `voice`, `speaker` (a pinned speaker id), `speakerName`, `lengthScale`, `slowLengthScale`, `sample`), under
  the speeds `dialogue-normal` / `dialogue-slow` in `audio/manifest.json` (`audio.both(track, text, 'dialogue')`). The player
  plays a text with `playSequence(key, [{ url, pauseMs }])` (`client/src/audio/player.js`): clip after clip, 350 ms between
  sentences, 900 ms between paragraphs, 700 ms after a turn; `state.sequence = { key, index, total, paused }` highlights the
  current sentence and shows "3 / 24"; any other `play()` or `stop()` ends it. ⏸ (`pauseSequence`) holds it, ▶
  (`resumeSequence`, inside the tap) goes on from the current sentence; a clip that fails to load is skipped, and a pause from
  outside (an iOS call, the screen locked) holds the sequence instead of stalling it (`server/test/hardening.test.js`).
  Dialogue voices (chosen like the main voices: licence clear and not non-commercial, a single or pinned speaker, the other
  gender by measured pitch, no truncation — the raw output's trailing silence — and the lowest Vosk WER on 8 dialogue
  sentences): English `en_GB-vctk-medium` speaker p258 (id 57; male ≈ 100 Hz; CC BY 4.0; WER 0.09, shortest trailing silence
  65 ms; several VCTK speakers clip their final consonants), French `fr_FR-upmc-medium` "pierre" (id 1; male 140 Hz; CC BY-SA
  4.0 — share-alike is clear and allows commercial use; WER 0.12; every male `fr_FR-mls` speaker scored WER > 1), Dutch
  `nl_BE-nathalie-medium` (female 156 Hz, Belgian; CC0; WER 0.13; it clips some single words, but not dialogue sentences;
  the audio check watches its clips). The main voices: *cori* female 212 Hz, *siwis* female 200 Hz, *rdh* male 114 Hz.
- **Long texts (B2)**: still one clip per sentence (normal + slow) and per turn; `playSequence` plays them with ⏸ / ▶ and
  "3 / 24" (`TextPlayButtons`); a clip that fails is skipped. Extra sentences of a gapped text and the B2 statements are shown,
  never played (no clips).
- Tap-to-hear: `TappableText` (MC target questions, fill-blank sentence words), match-pair left cards,
  build and fill word-bank chips. Native-language text is never tappable. Listening options are not tappable
  (that would give the answer away). Fill-blank has no whole-sentence 🔊 before checking (it would say
  the answer); the result strip has 🔊/🐢 for the correct answer.
- `client/src/audio/tokens.js` mirrors `tokenKey()` in `server/src/audio/clips.js`; a unit test keeps them equal.

## The rules for changing audio

1. **Ears before a bulk change.** A change that affects many clips (a renderer change, a lexicon entry in many sentences, a
   check rule that drives `audio:fix`) is released only after people have heard a sample of it: the Listen check's *Before
   release* sample (below). `audio:fix` refuses a round of more than 50 clips without `--bulk`. Measures alone are not
   enough: pause shaping from Piper's alignments, a glottal stop against the intrusive r, and "the best of 6 takes" by the
   check's rules all measured well and were heard as worse, so none of them is used.
2. **A pronunciation remark is fixed with the lexicon, never with another take.** `audio:fix` lists a clip heard Bad for
   *wrong pronunciation* for a lexicon entry and gives it no take (another take says the word the same way); the entry is
   measured on several renders before it is kept (*grammatica* `ɣrɑmˈaːtɪkaː`: hiss after the t 5–15 ms instead of up to 135;
   *plu* `plˈyː`: no s in 14 renders).
3. A check rule that cannot be heard to be right only lists a clip (it goes to the uncertain list, never a flag).
4. One voice per language for every clip; a voice change is a decision for the whole language.
5. A file name is cached as immutable by the browsers: a changed clip gets a new name (a new take), never the same name
   rendered differently.

## Short clips: carrier sentence, pronunciation lexicon, pins

Every **single word and short phrase (1–3 words: `clipKind` in `server/src/audio/clips.js`; an apostrophe or hyphen keeps a
word whole)** of the main voice, normal and slow, is said inside a **carrier sentence** and cut out: a bare short input makes
Piper babble on after the word ("eight awrwrw", "old old") or swallow its first sound, and it says English single words
badly. Listeners preferred the carrier clips to bare ones (720 compared: 490 better, 194 same, 36 worse) at the voice's own
noise (`noise_scale` 0.667, `noise_w` 0.8 — a lower 0.333 / 0.333 sounded clearly worse and is never used).

- **Carrier** (`content/voices.json` → `<track>.carrier`: `text`, `kinds`, `alternatives`): en `The word,`, fr `Le mot :`,
  nl `Het woord is:` — chosen by the silence they leave before the word (60 random words × 2 speeds: < 40 ms of silence in 4,
  0 and 1 of 60; the Dutch voice barely pauses at a comma — `Het woord,` 37 of 60 — and the English one not at a colon).
  `synth.py` says `"<carrier> <text>."` as one sentence (a final full stop when the text has none; the word ends the
  sentence), with Piper's phoneme alignments (`PiperVoice.load(…, include_alignments=True)`: the model is patched in memory,
  which needs the `onnx` package pinned in `tools/requirements.txt`).
- **The cut**: between the carrier's pause mark (`,` `:` `;`) and the word's first phoneme, at the quietest 5 ms frame that
  keeps **50–150 ms of silence** (more than 40 dB under the *word's* loudest frame — not the sentence's: the word is
  normalised on its own, and a soft first sound under a loud carrier would count as silence) before the word's first
  audible frame — inside the pause, so a soft first sound (French *j, r, v, s, f*, Dutch *r*) is never clipped. A pause
  that is never that quiet (the Dutch voice after `is:`, an English *h*) is cut where its quietest stretch begins. The word
  is then normalised to the usual level (volume 0.89) and shaped like every clip (5 ms fades, 30/60 ms padding). `synth.py`
  reports the silence kept (`gapMs`, in `audio/manifest.json` → `files`); the check measures it again in the clip itself
  (onset − 30 ms padding) and flags `onset` under 40 ms. The carrier is part of the clip's hash.
- **Phonemes the voice has no id for** break the alignment (`no phoneme alignments`): espeak writes Dutch *enquête* with a
  nasal ɑ̃ (a combining tilde the Belgian voice lacks). Give such a word a lexicon entry (*enquête* `ɑŋkˈɛːtə`).
- **Pronunciation lexicon** — `content/src/<track>/pronunciations.yaml`, compiled by `npm run audio:lexicon` (also at the
  start of every `audio:render`) into `content/pronunciations.json`, which the renderer, the check and the server's health
  check read. Sections: `words` (form → espeak phonemes, whole words in any case, also inside sentences), `alone` (only
  when the clip is that one word), `beforeVowel` (only before a word starting with a vowel letter), `hiatus` (the same
  condition; the block then ends in a comma, see *The intrusive r* below) and `initial` (only as the first word of a clip of
  several words: French *Entre, s'il te plaît !* stressed at a sentence start hisses between the nasal vowel and the t,
  70–100 ms in 6 of 6 seeded renders, 0 ms unstressed `ɑ̃tʁ`). `applyLexicon` replaces each match by a Piper phoneme block
  `[[ … ]]` (piper-tts passes it to the voice unchanged); the lexicon form is part of the hash, so an entry renders exactly
  the clips that contain its word. Every symbol must be in the voice's `phoneme_id_map` (unit test). Entries: Dutch English
  loanwords (*job, smartphone, deadline, wifi, updaten, feedback, downloaden, t-shirt, e-mails, fitness* …), stress fixes
  (*hospitalisatieverzekering* on *ze*, *maaltijdcheques* on *cheq*, the other *-verzekering* compounds), *roer* / *vuur*
  with the long vowel before r (espeak writes short `rˈur`, `vˈyr`), and 74 compounds and separable verbs whose espeak
  stress falls on the second part (*achternaam, luchthaven, klantendienst, overstappen* …; other long words are right or not
  compounds: *hogeschool, regelmatig*, numbers, *ver-* verbs); English `alone: a → ˈə` (the article "uh" — stressed, or the
  voice whispers it —, not the letter "ay") and `hiatus` for the 16 words after which the British voice inserts an intrusive
  /ɹ/ (*Anna is* → "Anner is": *Anna, sofa, zebra, data, umbrella, Grandma* …), `words: weekend(s)` stressed on *week*,
  `beforeVowel: hurry` without espeak's palatal glide mark `ʲ` (*hurry up* → `hˈʌɹiʲ ˈʌp`: the voice says the `ʲ` as a
  consonant, "hurry fap"; the mark is in 864 English texts and is changed only for *hurry* until a sample has been heard —
  rule 1), `words: ok: əʊˈkeɪ` (espeak's ˌəʊkˈeɪ makes the voice stretch the k and its stress slot, "okkhiei", 487 ms; with
  the stress before the k: median 139 ms, max 221 over 10 texts × 6 seeded renders; *Okay* is no better); French *jouent*
  `ʒˈu`, *louent* `lˈu` (espeak: a bare glide `ʒw`). Punctuation right after a lexicon word goes inside the block
  (`[[ ʌmbɹˈɛlə, ]] it's`): Piper phonemizes the text after a block on its own and espeak drops a leading comma. Check
  espeak's reading:
  `tools/piper-venv/bin/python -c "from piper.phonemize_espeak import EspeakPhonemizer as P; print(P().phonemize('nl', 'job'))"`.
- **Colon** (`colon: sentence`; English and Dutch): the English and Dutch voices barely pause at a colon (median 0 ms
  and 88 ms of silence, 48 seeded renders each), a comma or semicolon does not help the Dutch voice, and a full stop works only
  before a capital (espeak ignores it before a lower-case word); so the voice is given ". " and the next word capitalised —
  learners still read the colon — for a median 182 ms (English) and 200 ms (Dutch). A colon inside a phoneme block is never
  touched (it may be a length mark); a clock time has no space after its colon. French is unchanged: its voice pauses ≈ 300 ms
  at a colon (`colonAsSentence` in `server/src/audio/clips.js`).
- **Pins** — `content/audio-overrides.json` → `pins[track][text][speed] = { file, why }`: a clip listeners preferred to a new
  rendering keeps its file — no lexicon, no carrier, never rendered again (not even by `--force`; a missing pinned file fails
  the render). The clip list takes the file name from the pin. A pinned clip that the check flags counts as explained.

## Seeded noise, the intrusive r, `end: cut`, record again

- **Seeded noise.** Piper draws its noise inside the model (two `RandomNormalLike` nodes: the duration predictor's and the
  flow's). `synth.py` patches each model in memory (`seed_noise`) so the noise is an input, a slice of a buffer filled by
  `numpy.random.default_rng(seed)`; `render.js` passes `seed = seedOf(file)` (the first 32 bits of the clip's content-hash
  name; a `take` changes the name, so every take has its own seed) and records it in `audio/manifest.json → files[file].seed`.
  Rendering the same clip again gives the same samples, hence the same MP3 (`server/test/audio-listen-fixes.test.js`) — on the same
  number of ONNX threads (1 per process) and the same kind of CPU. Some older clips have no seed: take 1 of such a clip is its
  unseeded file name, never choose it as a take.
- **The intrusive r — a hiatus** (`hiatus` in the lexicon). The British voice links a final vowel to the next word's vowel
  with an r of its own (*sofa is* → "sofar is"), even when espeak's ɹ is removed. No spelling inside the word is clean on
  every render; a comma is (no r, no consonant: F3 stays high), but it leaves 215–565 ms of silence. So a `hiatus` entry's
  block ends in "," (`[[ sˈəʊfə, ]] is`) and `synth.py` (`cap_hiatus`) makes that break exactly **160 ms (240 slow)**,
  cutting or widening only frames already 45 dB under the peak (a break is widened only when it has 20 ms of silence), never a
  sound; `hiatusMs` in `audio/render-measures.json` is the shortest break (0 = the voice ran through the comma; audio:check
  lists it as `hiatus`). Side effect: the vowel before the break is longer (as before a comma).
- **`end: "cut"`** (an override field, part of the hash): a carrier clip is cut 40 ms after its last phoneme and faded out
  (15 ms) instead of ending as the sentence ends — for a breath or a vowel the voice adds after the word.
- **Record again** (Admin → Inbox, an audio report; Admin → Corrections, an item; Admin → Listen check, a Bad clip of the fix
  queue): `server/src/ops/rerecord.js` (table `clip_rerecords`) queues `requests/rerecord-NNNNNN.json`; the
  content job (`scripts/jobs/rerecord-lib.js`) makes the next take (the clip's override take + 1, skipping takes already on
  disk; say/carrier/end kept; a pin lifted), renders it (`--keep-orphans`), checks it (`audio:check -- --only <file> --report
  <tmp>`), then puts `content/` and `audio/manifest.json` back — the app keeps playing the old clip, corrections are not
  blocked — and returns old and new with their flags. **Keep new**: the job writes the take into
  `content/audio-overrides.json`, renders (the file is there: nothing is synthesized), commits (`audio: record again #N …`),
  reloads and checks `/api/health`; any failure puts everything back and the request returns to review. **Keep old**: the new
  file is deleted (never one the live manifest uses). No AI: the admin hears both and chooses.
- **Choosing a take by a phoneme**: seeded takes are reproducible, so a take can be measured in a scratch run (render takes
  with their seeds, measure the phoneme the remark names from the alignments) — but a take is only a fix for a take problem
  (babble, a cut, a breath), never for a pronunciation (rule 2).

## Audio check (`npm run audio:check`) and overrides (`npm run audio:fix`)

`audio:check` runs after every render and for every *Record again* (one clip), and feeds the Listen check's fix queue and the
System tile. It is a script (energy measures + the offline recognizer Vosk), not an AI.

Piper samples noise, so a render can go wrong: a short bare word (*good*, *red*, *bad*) sometimes runs on into seconds of
babble after the word ("good rewerwer…"). `npm run audio:check` checks every clip the content needs:

- **Metrics** (`scripts/audio-check/analyze.py`, in `tools/vosk-venv`): the MP3 decoded with lame, 10 ms energy frames,
  voiced = above −45 dBFS and within 30 dB of the loudest frame (runs closer than 80 ms merged): voiced span, leading and
  trailing silence, clipping; and the shape of the sound: `onsetMs` (the first frame within 40 dB of the loudest),
  vowel-like frames (within 20 dB, ≤ 30 zero crossings per 10 ms: a fricative or a hiss has many more) from `vowelStartMs`
  to `vowelEndMs`, `afterVowelMs` (audible sound after the last vowel-like frame) and `quietTailMs` (a murmur 30–55 dB under
  the loudest after the voiced span). A word or short phrase analysed before these measures existed is analysed again.
- **Phonemes** (`scripts/audio-check/phonemes.py`, in `tools/piper-venv`): espeak's phonemes of what each clip says (its
  lexicon form or `say`), as Piper hands them to the voice; cached per language and text in the check cache. They give the
  rules the first and last sound, the vowel nuclei and the closures (stops between two vowels).
- **Recognition**: Vosk small models (`tools/vosk-models.json`: en-us 0.15, fr 0.22, nl 0.22, Apache 2.0; in
  `models/vosk/`, gitignored, fetched by `scripts/fetch-models.sh`, listed under `recognizers` in `models/manifest.json`),
  free decoding, one recogniser per language and sample rate (building one is the expensive part), reset per clip.
- **Flags** (`scripts/audio-check/lib.js`, unit-tested; calibrated on a full run of 18,184 clips, on 13 clips listeners
  reported and on 1,500 random ones — `server/test/audio-check-shape.test.js` keeps the 13 flagged). A **single word** is one without
  a space: *I've*, *s'il*, *e-mail* are single words. `long` (robust z of log(voiced ms per letter) > 3.5 within its group —
  language, speed, length class — and ≥ 350 ms over the group's typical clip; a phrase only with extra words heard or WER ≥
  0.5), `tail` (a single word with ≥ 100 ms of voice after its expected end = voice start + 1.5 × typical length: "eight
  awrwrw"), `second` (a single word with a further voiced span ≥ 60 ms after a pause ≥ 80 ms that neither a closure between
  vowels nor the release of a final stop (≤ 120 ms) explains: "old … old", "is … hă"), `trail` (> 1 s of file after the
  voice, or after a single word's expected end), `extra-words` (≥ 3 more words heard than written, at least twice as many, in
  a clip with z ≥ 2: babble; or a single word heard as more words that also has a second span), `short` (z < −4:
  truncation), `wer` (a phrase of ≥ 3 words with WER ≥ 0.75 and |z| ≥ 2.5), `lead` (> 400 ms before the voice), `clipping`,
  `silent`; for words and short phrases (≤ 3 words) also `onset` (the first sound clipped: a consonant audible within 20 ms
  of the cut — the 30 ms padding — , a voiceless fricative *s f ch* with < 20 ms of it before the vowel ("snel" → "nel"), or a
  carrier cut that kept < 40 ms of silence), `coda` (sound after the last vowel longer than the last consonant needs: 150 ms
  after a vowel or sonorant, 350 after a stop or fricative — the 90th percentile of the carrier clips listeners preferred,
  whose sentence-final consonant is long: "the" + a hiss, "plaît" + an s), `quiet-tail` (a murmur of ≥ 400 ms after the
  voice: "child … awawaw") and `weak` (a carrier clip whose word came out more than 15 dB under its carrier: a lone schwa is
  whispered); for every clip `pronunciation` (espeak's intrusive /ɹ/ in English, or a clip rendered before the lexicon entry
  that now applies to it). **Uncertain** (listed in the report, not flagged): a misheard phrase of normal length, extra words
  "heard" in a single word of normal length and one voiced span, a long phrase with every word heard (pauses at commas), and
  `pause`. Vosk is weak on isolated words, synthetic voices and slow speech: in a test of 45 uncertain clips, two fresh
  renders of the same text were misheard again in 35 (78 %; both renders in 21), so these are recognizer limits, not bad
  clips. The US-English model also confuses British vowels (*red* → "read", *bed* → "bad").
- Results are cached per clip file and its stamp (size + mtime: `audio:render -- --force` writes new takes under the same
  names) in `audio/check-cache.json` (written to a temp file and renamed); only new or re-rendered clips are analysed;
  `audio/check-report.json` lists every flagged clip with its metrics, phonemes and transcript (`-- --manifest <file>
  -- --report <file>` checks exactly the clips of another manifest, e.g. the one saved before a re-render, without touching
  the spool status); `status/audio-check.json` in the spool feeds the System tile *Audio check* (amber: clips flagged, or
  rendered since the last check). Each worker holds the three models (≈ 600 MB–1.1 GB): never run it beside the full test
  suites on a 4 GB machine (1 worker there; 2 workers ≈ 10 clips/s).

**Overrides** — `content/audio-overrides.json` (committed): `clips[track][text]` = `{ say, carrier, lengthFactor, take,
why }` for both speeds, or `{ normal: {…}, slow: {…} }` (a per-speed entry may name any of `normal`, `slow`, `dialogue-normal`,
`dialogue-slow`: `perSpeedEntry`). The synthesis fields (not `why`) are part of the clip's hash (`clipFile`), so only that
clip renders again and every other file name stays as it was; `take` only renames (a new render of the same settings: Piper
samples noise); `carrier` replaces the track's carrier for that clip; `say` spells an acronym (espeak-ng spells a Dutch
acronym without a vowel — *pmd, gft, sms* — but reads one with a vowel as a word: *OCMW* → /ɔkmw/, so `say: "O-C-M-W"`).
`noiseScale`, `noiseW` and `trim` remain on 71 older override entries (most of them not pinned); nothing writes them any
more, and a new take keeps none of them. A clip with a `say` text is said exactly so: lexicon entries do not reach it (the
dialogue turn *Oh no. OK, I'll wash up…* keeps the older *OK*). `hiatus` (with `say`) names the phonemes of the say text's
blocks that end in a hiatus comma, so synth.py still makes that break 160/240 ms: one clip said with another spelling (*We
will visit Grandma on Sunday.* slow: a short `ɑ` before the comma, vowel median 530 → 400 ms). A per-clip `say` with a
phoneme block is the tool for a prosody fault of one text that a lexicon entry would spread to hundreds of clips (*I didn't
recognise …* slow: `[[ ˈaɪ ]]`; 4 of 6 renders left ≥ 970 ms after an unstressed *I*).
`accepted[track][text]` = why a remaining flag is a recognizer limit (the check counts it as explained); `{ why, speeds:
['normal'] }` explains only those speeds (a plain reason: every speed and voice of the text). `pins` — see *Short clips*.

`npm run audio:fix` repairs the flagged clips of the last full check, per clip and speed: a carrier clip first gets the
track's first alternative carrier (another pause mark: en `The word;`, fr `Le mot,`, nl `Hier is het woord:`), then the
second (another carrier word: `The next word,`, `Le mot suivant :`, `Het volgende woord is:`), then takes 2–4 of that; a
sentence gets takes 2–4. It never lowers the noise (it sounds clearly worse) and never says a word twice and cuts (that
leaves *old old*); a pinned clip is never touched; a clip heard Bad for its pronunciation gets no take (it is listed for a
lexicon entry); a round that would render more than 50 clips stops unless `--bulk` (rule 1). Each round renders and
re-checks (`-- --keep-orphans` and `-- --workers N` are passed to the render: without `--keep-orphans` a round deletes the
files a rollback needs); what is left is listed for a human decision. Pack content and ids never change for audio. Clips
still flagged after the rounds and heard fine — mostly a long sentence-final Dutch *r/s/t* (`coda`) and English clips with
< 40 ms of silence (`onset`) — are explained in `accepted`.

## Listen check and Audio quality (Admin → Listen check)

People hear what no check can measure. The page serves one **playable clip of the live audio** at a time (exactly the file
learners get); ▶, then **OK** or **Bad** (optional reason: babble, cut off, wrong word, wrong pronunciation, other; a note).
Only verdicts are stored (`listen_checks`, with the file they were given on), so many short sittings simply continue. A
"How this works" panel on the page explains all of this to the admin (i18n `listen.how.*`).

**Order** (`nextClip`, `server/src/lib/listen.js`): a clip heard Bad whose file has changed since and was not heard yet (the
fix queue's *again*); then a seeded clip (its manifest entry has a seed: a fix or a *Record again*) that nobody heard; then at
random — a sentence or text sentence two times in three (`SENTENCE_SHARE`), else a word or short phrase, the language at
random, then the clip. A file is never served twice.

**Audio quality** (`server/src/lib/quality.js`, `GET /api/admin/listen/quality`; the table at the top of the page, one line on
Admin → Corrections): per group — words and short phrases; sentences, dialogue turns and text sentences — one row per
language: clips (the live audio's playable clips), heard (current files with a verdict), Bad now (latest verdict per file),
the **95 % upper bound** on the share of bad clips (3 / *n* with none bad, the exact Clopper–Pearson bound otherwise:
`upperBound`), and *rendered again* (clips with a per-clip override or pin). Below it: the last full `audio:check` (the spool
status the System page reads) and the Bad clips being fixed (recorded again and not heard; waiting, of which for a
pronunciation; fixed). Nothing is stored: every number is computed when the page opens, so a render, an `audio:fix` or a
Record again counts at once — a new file is "not heard" until someone hears it. The per-stratum table (language × kind ×
speed) is below the clip.

**Fix queue.** The latest verdict on a clip's current file is Bad (an OK heard later on the same file overrules it). Each entry
shows the reason and the note of that verdict, ▶, **Heard OK now** (an OK verdict on that very file: it sounded fine after
all; no new take) and *Record again* (the content job, no AI), whose review plays **Old** (the file in use) and **New** (the
take): *Keep new*, *Keep old* (from the fix queue also an OK verdict on the old file, so it leaves the queue) or *Neither —
try again* (the take is dropped, the clip stays in the queue). A Bad for *wrong pronunciation* is marked as needing a lexicon
entry (an authoring session; a new take seldom helps). `npm run audio:check` also reads the queue from the live database
(`scripts/audio-check/listen.js`: `sudo -n -u anzo sqlite3 -readonly`, or `ANZO_LISTEN_DB=<file>`) and flags the clip
`listen`, so `npm run audio:fix -- --keep-orphans` renders the rest in an authoring session.

**Before release** (`server/src/routes/sample.js`, `client/src/components/AudioSample.jsx`, table `audio_sample_votes`): before
a change that affects many clips is released (rule 1), an authoring session renders the new clips into `audio/` as files only
(the live manifest does not name them), writes a sample of about 20 rows to the spool (`status/audio-sample.json`: `{ name,
about, rows: [{ id, track, speed, text, oldFile, newFile, flagsOld, flagsNew, why }] }`) and the Listen check shows it at the
top: per row ▶ Old / ▶ New, what the check noticed, *Keep new* / *Keep old* / *Neither — try again* and a note (one vote per
admin and row). Nothing changes until a session reads the votes and releases (or not); then it removes the spool file.

## Tools, models and ownership
| Path | Owner (`ANZO_DEV_USER`) | Git | Recreate with |
|---|---|---|---|
| `tools/piper-venv/` | developer account | ignored | `scripts/fetch-models.sh` (from `tools/requirements.txt`, piper-tts 1.8.0 + onnx 1.23.2 for alignments) |
| `models/piper/*.onnx(.json)`, `*.MODEL_CARD` | developer account | ignored | `scripts/fetch-models.sh` (every voice in `voices.json`, main and dialogue, idempotent; ≈ 390 MB) |
| `models/manifest.json` | developer account | committed | written by `fetch-models.sh` via `scripts/models-manifest.js` |
| `tools/vosk-venv/` | developer account | ignored | `scripts/fetch-models.sh` (from `tools/requirements-vosk.txt`, vosk 0.3.45) |
| `models/vosk/<model>/` | developer account | ignored | `scripts/fetch-models.sh` (every model in `tools/vosk-models.json`; ≈ 150 MB) |
| `audio/` | developer account, world-readable | ignored | `npm run audio:render`, or the recordings archive of a release (README → *Getting started*) |

The service reads `audio/` (ProtectSystem=strict allows reads) and never writes it.
