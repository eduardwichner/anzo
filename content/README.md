# Content packs

Anzo's curriculum is data. The engine never changes when a level is added: a level is one
JSON **pack** file plus one row in the manifest.

```
content/
├── schema/pack.schema.json   # JSON Schema 2020-12 for the manifest ($defs/manifest) and packs
├── voices.json               # which Piper voice speaks each language (see "Audio" below)
├── src/<track>/<level>/      # unit sources of the generated packs (pack.yaml + NN-<topic>.yaml); src/<track>/PLAN.md
├── src/<track>/wordlist-sources.yaml, WORDLIST.md, SOURCES.md   # word list sources, counts, reference files (fr, nl; en: WORDLIST.md, SOURCES.md)
├── ids.lock.json             # every id of every pack (docs/developer/content.md → Id lock)
├── packs/
│   ├── manifest.json         # tracks (courses), their levels, and each level's status
│   ├── en/pre-a1.json … b2.json   # English: Cambridge YLE Starters, Movers, Flyers, B1, B2
│   ├── fr/a1-1.json … b2.json     # French: DELF Prim A1.1, A1, A2, B1, B2
│   ├── nl/pre-a1.json … b2-study.json   # Dutch for English speakers: Start … B2 and the two B2 branches
│   └── fr-en/a1-1.json … b2.json  # French for English speakers (built from the French units' en meanings)
└── reference/                # the official documents every word must come from (not in the repository:
                              # docs/developer/content.md → Reference files)
```

Validate after every change:

```bash
npm run content:validate
```

The server runs the same validation at startup and refuses to start on any error, naming
the file and the JSON path (for example `content/packs/en/pre-a1.json /units/0/lessons/1/exercises/3/tokens: …`).

## No UI text in packs (schemaVersion 2)

A pack holds learning content only. Everything the app *says* around it — "What does this mean?",
"Translate this sentence", "Type what you hear" — lives in the interface language files
(`client/src/i18n/nl.json`, `en.json`) and follows each account's app language.

- **Instructions** are chosen by exercise type (table below). An exercise may name a different
  instruction with `"instruction": "exercise.<key>"`; that key must exist in **every** locale file
  (the validator checks). There is no `prompt` field; the validator rejects it.
- **Target language** (English or French) is a plain string: `"target": "cat"`.
- **The child's own language** is a localized object keyed by native language: `"native": { "nl": "kat" }`.
  This applies to vocabulary and sentence `native`, native-side multiple-choice questions and options,
  match-pair `right`, native listening options, `hint`, and unit/lesson `title`. Only `nl` exists and is
  required now; meanings for another native language (`"en": "cat"` for a French learner who speaks
  English) can be added later without touching the engine.
- Every pack starts with `"schemaVersion": 2`.

| exercise | default instruction key | nl / en |
|---|---|---|
| `multiple_choice`, target question | `exercise.multiple_choice.fromTarget` | Wat betekent dit? / What does this mean? |
| `multiple_choice`, native question | `exercise.multiple_choice.toTarget` | Hoe zeg je dit in het Engels? / How do you say this in English? |
| `match_pairs` | `exercise.match_pairs` | Zoek de paren / Match the pairs |
| `build_sentence` | `exercise.build_sentence` | Vertaal deze zin / Translate this sentence (+ the sentence's native text below it) |
| `fill_blank` with options / typed | `exercise.fill_blank.choose` / `.type` | Vul in / Typ het woord |
| `listen_choose` target / native (word) / native (sentence) | `exercise.listen_choose.target` / `.native` / `.nativeSentence` | Wat hoor je? / Wat betekent het woord dat je hoort? / … de zin … |
| `listen_type` | `exercise.listen_type` | Typ wat je hoort / Type what you hear |
| `speak` (reserved) | `exercise.speak` | Zeg het na / Say it |

## The golden rule: every word is traceable

Every target-language word in a pack must appear in the reference material in
`content/reference/` (use the text in `content/reference/extracted/`; the files and where to get them:
`docs/developer/content.md` → *Reference files*). Dutch translations are
written by the author. The pack's `source` field says which documents were used and how:

- **English**: Cambridge publishes a closed word list per level. Only use words from the
  level's column of `149681-yle-flyers-word-list.pdf`; name the list(s) and topic(s) in `source`.
- **French**: DELF Prim publishes **no** word list, so Anzo derives one with provenance
  (`src/fr/WORDLIST.md`; `npm run content:wordlist -- fr` builds the gitignored
  `reference/extracted/wordlist-fr.json`): every word of the child-facing text of the level's candidate booklet,
  examiner booklet and transcript at the lowest level it occurs, completed per DELF theme (`source: topic`) and with
  the concepts of the English plan (`source: parity`), each addition with a justification in
  `src/fr/wordlist-sources.yaml`. Only words of that list at or below the pack's level are used
  (`npm run content:trace -- fr`). The pack's `source` names the papers and the list.

## Manifest

```json
{ "tracks": [
  { "id": "en", "name": { "nl": "Engels" }, "mascot": "otter", "packs": [
    { "id": "en-pre-a1", "file": "en/pre-a1.json", "cefr": "Pre-A1", "title": { "nl": "Starters" }, "status": "available" },
    { "id": "en-a1",     "file": "en/a1.json",     "cefr": "A1",     "title": { "nl": "Movers" },   "status": "planned" },
    { "id": "en-b1",     "file": null,             "cefr": "B1",     "title": { "nl": "B1" },       "status": "roadmap" }
  ]}
]}
```

| status | meaning | file |
|---|---|---|
| `available` | loaded, validated, playable | must exist and validate |
| `planned` | shown greyed as *Binnenkort* | may be absent (not validated) |
| `roadmap` | shown greyed as *Later* | `null` |

The Levels screen in the app renders the manifest directly, so the manifest *is* the roadmap.

## Adding a level

1. Write `packs/<track>/<level>.json` (see below).
2. Set its manifest row to `"status": "available"`.
3. `npm run content:validate`
4. `sudo systemctl restart anzo`

## Pack structure

```json
{
  "schemaVersion": 2,
  "id": "en-pre-a1", "track": "en", "cefr": "Pre-A1",
  "source": "Which reference files, lists and topics the words came from.",
  "units": [{
    "id": "en-pre-a1-u01", "title": { "nl": "Dieren" }, "icon": "animals",
    "vocabulary": [
      { "id": "en.cat", "target": "cat", "native": { "nl": "kat" }, "pos": "noun" }
    ],
    "sentences": [
      { "id": "en-pre-a1-u01-s01", "target": "The cat is black.", "native": { "nl": "De kat is zwart." }, "items": ["en.cat", "en.black"] }
    ],
    "lessons": [
      { "id": "en-pre-a1-u01-l01", "title": { "nl": "Huisdieren" }, "exercises": [ … ] }
    ]
  }]
}
```

- `pos`: `noun | verb | adjective | number | phrase | pronoun | article | other`; French nouns add `"gender": "m" | "f"`.

### French conventions

- A noun's `target` carries its definite article: `le chat`, `la maison`, `l'école`, `les yeux` (plural-only use);
  `gender` is the noun's gender, also when the article is elided or plural (`l'école` → `f`). The id drops the article
  (`fr.ecole`). Months, days and names of address (`maman`, `lundi`, `madame`) have no article.
- The Dutch meaning carries the matching Dutch article: `{ "nl": "de kat" }`, `{ "nl": "het huis" }`.
- Options that show French nouns (multiple choice towards French, listening with French options) all have the
  answer's article form (le / la / l' / les / none); a word bank for a bare noun (*Ma ___ est petite.*) offers nouns of
  the same gender and number, with the answer's capitals.
- *tu* throughout; *vous* only to an adult in a shop or restaurant, a teacher, or to several people (Dutch *u* / *jullie*).
- French punctuation `? ! : ;` follows a space; in build-the-sentence tiles it stays with its word (`Salut !`).
- Two words that mean the same to a Dutch child share a meaning part (`"aardig, leuk"` / `"aardig"`) so they count as
  the same answer; homophones (*mer / mère*, *ou / où*, *ami / amie*) are kept apart with `avoid`.
- `icon` names an inline icon in the client (`animals`, `family`; anything else falls back to a book).
- **Never write audio paths.** Audio is derived from the text (see "Audio" below); the schema
  rejects an `audio` field.
- Lessons have 9–14 exercises that mix the types below, including at least one `listen_choose`
  per answer side and one `listen_type`. All packs are generated (see "Unit sources and the generator").
  A lesson with `"extra": true` (*Extra oefening*, `<unit>-extra`) is optional practice of 4–14 exercises: never the
  current lesson on the path and not counted for level or unit completion (`docs/developer/content.md`).
- `npm run content:format` rewrites pack files in this layout (one line per vocabulary item and
  sentence, exercises on up to three lines) without changing their content.

### Id conventions

Ids are globally unique across **all** packs (the validator enforces this), lower-case, and
use `-` and `.` as separators:

| thing | pattern | example |
|---|---|---|
| pack | `<track>-<level>` | `fr-a1-1` |
| unit | `<pack>-uNN` | `fr-a1-1-u01` |
| lesson | `<unit>-lNN` | `fr-a1-1-u01-l02` |
| exercise | `<lesson>-eNN` | `fr-a1-1-u01-l02-e05` |
| sentence | `<unit>-sNN` | `fr-a1-1-u01-s04` |
| vocabulary | `<track>.<word>` (ASCII, no accents) | `fr.grand-mere`, `en.cat` |

Vocabulary ids are per track, not per pack: a word introduced in Pre-A1 keeps its id and is
**not** redefined in A1 (the global uniqueness check rejects that). Later packs reference
new words only.

`items` (on sentences and exercises) lists the vocabulary ids being practised; every entry
must be a vocabulary id in the same pack. Graded attempts update each item's strength, which
the review mode uses. `sentenceId` (required on `build_sentence`, optional on `fill_blank`) links an
exercise to a sentence, which is then tracked too and provides result audio.

## Exercise types

Every exercise has `type`, `id` and `items`, and optionally `instruction` (an i18n key, see above).

**multiple_choice** — question in the target language (a string) with native options (`{ "nl": … }`),
or the reverse. The two sides must be opposite; the side of `question` picks the instruction.
Exactly one option has `"correct": true`; option texts are unique; 2–6 options.

```json
{ "type": "multiple_choice", "id": "en-pre-a1-u01-l01-e01", "items": ["en.cat"],
  "question": "cat",
  "options": [ { "text": { "nl": "kat" }, "correct": true }, { "text": { "nl": "hond" } }, { "text": { "nl": "vis" } } ] }
{ "type": "multiple_choice", "id": "en-pre-a1-u01-l01-e03", "items": ["en.fish"],
  "question": { "nl": "vis" },
  "options": [ { "text": "fish", "correct": true }, { "text": "bird" }, { "text": "cat" } ] }
```

**match_pairs** — 4 to 6 pairs; left = target language (string), right = native (`{ "nl": … }`).
All lefts unique, all rights unique.

```json
{ "type": "match_pairs", "id": "en-pre-a1-u01-l01-e05", "items": ["en.cat", "en.dog", "en.fish", "en.bird"],
  "pairs": [ { "left": "cat", "right": { "nl": "kat" } }, { "left": "dog", "right": { "nl": "hond" } },
             { "left": "fish", "right": { "nl": "vis" } }, { "left": "bird", "right": { "nl": "vogel" } } ] }
```

**build_sentence** — the app shows the native text of sentence `sentenceId` (required); the child taps
words in order. `answer` equals that sentence's `target`, and `tokens` joined with single spaces equal
`answer` exactly (punctuation stays attached to its word: `"black."`). `distractors` are extra wrong
words mixed into the bank.

```json
{ "type": "build_sentence", "id": "en-pre-a1-u01-l01-e07", "items": ["en.cat", "en.black"], "sentenceId": "en-pre-a1-u01-s01",
  "answer": "The cat is black.", "tokens": ["The", "cat", "is", "black."], "distractors": ["dog", "white."] }
```

**fill_blank** — one `___` in `sentence`. With `options` the child picks from a word bank
(the options must include `answer`); without `options` the child types the answer. Typed
answers ignore case, extra spaces and a final `.?!`; in French a missing accent is accepted
with a "Let op de accenten" note.

```json
{ "type": "fill_blank", "id": "en-pre-a1-u01-l01-e06", "items": ["en.cat"], "sentenceId": "en-pre-a1-u01-s01",
  "sentence": "The ___ is black.", "answer": "cat",
  "hint": { "nl": "kat" }, "options": ["cat", "dog", "fish"] }
```

**listen_choose** — the child hears the clip of a vocabulary item or sentence (`listen`: its id
in this pack) and picks either its written target-language form (`"answerSide": "target"`, string
options) or its meaning (`"answerSide": "native"`, `{ "nl": … }` options). 3–4 options, exactly one
correct; the correct option's text must equal the listened item's `target` (answerSide target) or
`native` (answerSide native). Distractors are other words **from the same pack** (not invented
minimal pairs: every word must stay traceable to the references).

```json
{ "type": "listen_choose", "id": "en-pre-a1-u01-l01-e10", "items": ["en.cat"], "listen": "en.cat", "answerSide": "target",
  "options": [ { "text": "cat", "correct": true }, { "text": "dog" }, { "text": "fish" }, { "text": "bird" } ] }
{ "type": "listen_choose", "id": "en-pre-a1-u01-l01-e11", "items": ["en.dog"], "listen": "en.dog", "answerSide": "native",
  "options": [ { "text": { "nl": "hond" }, "correct": true }, { "text": { "nl": "kat" } }, { "text": { "nl": "vis" } } ] }
```

**listen_type** — the child hears the clip and types it. `answer` must equal the listened
item's `target` text. Grading: case, spaces and a final `.?!` are ignored; a French answer that
differs only in accents is correct with a note; a word of 5 or more letters that is one edit
(insert, delete, change, swap) away is correct with a "Bijna!" note showing the spelling;
shorter words must be exact (`cat`/`cap` is wrong); word count and order must match.

```json
{ "type": "listen_type", "id": "en-pre-a1-u01-l01-e12", "items": ["en.cat", "en.black"], "listen": "en-pre-a1-u01-s01",
  "answer": "The cat is black." }
```

The app never sends the listened text or answer to the browser, only the clip URLs.

**Reserved type** — `speak` (`phrase`) validates but is not playable yet; the app shows a
*Binnenkort* card with a skip button and does not count it in the score.

## Texts and dialogues (B1)

A unit may carry `texts` (`src/<track>/<level>/texts/NN-<slug>.yaml`, listed in the unit as `texts: [id, …]`): a reading text
(paragraphs of sentences) or a dialogue (turns of speakers A and B), each sentence with its meaning, a small glossary,
authored questions in the target language and an optional cloze; full format and rules: `docs/developer/content.md` (*Texts*). Their
exercises: `reading` / `dialogue` / `listening` (`textId` + one `question`), `order_paragraphs` (`textId`, `unit`, `segments`
in the right order), `cloze` (`textId`, `gaps` [{ sentence, word, kind?, hint? }], `options` = a word bank below B1). Each
sentence or turn has its own normal and slow clip; turns of speaker B are spoken by the course's dialogue voice
(`content/voices.json` → `dialogue`).

## Audio

Audio is derived from text; authors never write audio paths. `npm run audio:render` records,
with the voice named in `content/voices.json`:

- every vocabulary `target` and sentence `target`, at normal and slow speed;
- every distinct target-language word visible in an exercise (multiple-choice question or
  options in the target language, match-pair left cards, word-bank tokens and distractors,
  fill-in sentences and options, target-side listening options), at normal speed. Words are
  lower-cased without surrounding punctuation; French elisions stay whole (`j'ai`, `c'est`,
  `m'appelle`).

After changing a pack: `npm run content:validate -- --audio` shows missing recordings,
`npm run audio:render` makes them, then restart the service. Multiple-choice questions whose
text equals a vocabulary or sentence target count as target language and are read aloud.

## What the validator checks

Schema (types, required fields, id format, statuses, `schemaVersion: 2`, no `prompt`, native text as
`{ "nl": … }`) plus: every instruction key (default or `instruction`) exists in every
`client/src/i18n/*.json`; multiple-choice question and options on opposite sides; listening options on
the side named by `answerSide`; `build_sentence.answer` equals its sentence's target; manifest pack ids unique; every
`available` pack exists and matches its manifest row (`id`, `track`, `cefr`); ids unique
across all packs; every `items` reference and `sentenceId` resolves in the same pack;
`match_pairs` has 4–6 pairs; `build_sentence` tokens join to `answer`; `multiple_choice`
has exactly one correct option; `fill_blank` has one blank and its options include the answer;
`listen` resolves to a vocabulary or sentence id in the same pack; `listen_choose` has 3–4 unique
options, exactly one correct, matching the listened item's target or native text;
`listen_type.answer` equals the listened item's target text.

## acceptAlso

`build_sentence` and `listen_type` may list `acceptAlso` (strings). For `build_sentence` each one must use exactly the
tiles of the answer (same words with the same capitals and punctuation, another order); for `listen_type` they are other
spellings of what is heard (`I'm` / `I am`). The grader accepts them; the client never receives them. Typed dictation
also accepts digits for English numbers 0–100 and hyphenated words typed as one or two words.

## Unit sources and the generator

All packs (`packs/en/*.json`, `packs/fr/*.json`) are built by `npm run content:generate -- <pack id>` from
`src/<track>/<level>/`. Never edit a generated pack; edit its sources and generate again (the output is deterministic:
unchanged sources give a byte-identical file; `-- --check` verifies).

`pack.yaml`:

```yaml
id: en-a1
cefr: A1
source: >-                    # which reference documents, lists and notes the words come from
  …
omit:                         # word-list entries deliberately not taught, with the reason (content:trace coverage)
  - { word: blonde, reason: "spelling variant of blond, which is taught" }
extraLessons: true            # every sentence no exercise uses gets one in an optional <unit>-extra lesson
```

`NN-<topic>.yaml`, one unit (files are read in name order):

```yaml
id: en-pre-a1-u01             # stable forever
title: { nl: Dieren }         # quote titles with commas, colons or ?
icon: animals
topic: Animals                # the YLE topic
vocabulary:
  - { target: cat, native: { nl: kat }, pos: noun }                    # id defaults to en.cat
  - { id: en.bat-animal, target: bat, native: { nl: vleermuis }, pos: noun }   # explicit id when a word has two senses
  - { target: animal, native: { nl: dier }, pos: noun, category: true }       # group word
  - { target: jeans, native: { nl: spijkerbroek }, pos: noun, avoid: [en.trousers] }
sentences:
  - { id: s01, target: "The cat is black.", native: { nl: "De kat is zwart." }, items: [en.cat, en.black] }
  - { id: s02, target: "I'm nine today!", native: { nl: "Ik word vandaag negen!" }, items: [en.nine],
      acceptAlso: ["I am nine today!"] }
lessons:                      # optional: pin lesson ids, titles and words; the rest is split automatically
  - { id: l01, title: { nl: Huisdieren }, vocab: [en.cat, en.dog] }
overrides:                    # optional hand-written exercises (pack format) appended to a lesson
  - { lesson: en-pre-a1-u01-l01, exercises: [ … ] }
hidden:                       # written by Admin → Corrections → Hide: generated exercises left out of the pack
  - { exercise: "en-pre-a1-u01-l01-e05", reason: "admin correction #4: wrong picture" }
append:                       # content added after the unit's exercises were locked: a lesson of its own, new ids only
  - lesson: { id: l03, title: { nl: Nog meer dieren } }
    why: "…"
    vocabulary: [ … ]         # never offered as a wrong option in the unit's earlier exercises
    sentences: [ … ]          # ids continue the unit's numbering
```

**B2 keys.** On a sentence, `form: { word, stem }` — word formation: a typed fill-in of `word` with `stem` in
capitals (*aanpassing* from AANPASSEN), in the review lesson after the finite-verb fill-ins. On a unit, `transforms:` — key word
transformations in the review lesson, last:

```yaml
transforms:
  - { id: x01, from: "Ik wilde die stap eerder zetten, maar ik heb het niet gedaan.", key: willen,
      gapped: "Ik had die stap eerder ___.", answers: ["willen zetten"], items: [nl.stap], native: { en: "…" } }
```

`answers` lists every correct filling (2–6 words, each with the key word unchanged; the key word is not in `from`). On a text
(`texts/NN-*.yaml`): `gapped: { gaps: [3–6 sentence ids, in order, never the first, never two neighbours], extra: [1–2 { id,
target, native }] }` (a gapped text, the first exercise of the text's lesson), `wordForm: [{ sentence, word, stem, acceptAlso? }]`
(3–6 gaps, a word-formation text), `openCloze: [{ sentence, word, acceptAlso? }]` (3–6 gaps, no hints: list every other word that
fits), and the question types `summary` (`options`, `correct`: which summary fits the whole text), `match_texts` (`labels`: a name
per paragraph, `statements: [{ id, statement, paragraph }]`, 4–8) and, in `listeningQuestions`, `complete` (`statement` with one
`___`, `answers`: 1–3 words each). A text with `openCloze` or `wordForm` may leave out `cloze`. Order in a text's lesson: gapped
text, the questions, cloze, open cloze, word formation, ordering. A text over 180 words is shown in its own scroll pane on a
phone (`isLongText`).

**Branch packs.** A manifest pack with `"branch": true, "after": "<core pack id>"` is an optional branch of that
level (same CEFR, another domain: `nl-b2-work`, `nl-b2-study` after `nl-b2`). Its lessons are optional on the path (never the
current lesson, never locked), it counts for its own level badge only, never for course progress, and it is never a start level.

`hidden:` entries are made by the content job (Admin → Corrections → *Hide this exercise*); never delete one by hand: that
would bring the exercise back. The generator still numbers a hidden exercise (no other id moves) and then leaves it out;
the id lock lists it under `retired`, so progress that names it stays valid. Undo in Admin → Corrections removes it.

`pos` in sources is fine-grained (`noun verb adjective adverb preposition conjunction pronoun determiner number phrase
question exclamation other`) and steers distractor choice; the pack gets the schema's coarser `pos`. Sentence ids `sNN`
and lesson ids `lNN` are short for `<unit id>-sNN` / `-lNN`.

**Same answer.** Two words whose Dutch meanings share a word (split on `,` `;` `/`: "moeder, mama" and "mama"), a
`category` word and a same-pos word, or two words linked by `avoid` (either side) are never offered against each other:
not as multiple-choice or listening options, not in a word bank, not as build-the-sentence distractors, not in the same
match.

**What the generator builds per unit:**

- Lessons: the pinned ones, then the remaining words in lessons of at most 8 (balanced: 25 words → 7, 6, 6, 6).
  A sentence belongs to the lesson in which its last `items` word is introduced. Then one review lesson
  `<unit id>-review` ("Herhaling") over the whole unit, 13 exercises, nothing new.
- A lesson with N new words has N + 6 exercises (12–14): every word first appears in a multiple choice target→native;
  after the first two words a listen-and-choose (target side), after four a match (4–6 pairs from the lesson and
  earlier lessons), after six a listen-and-choose (native side, a sentence when one is ready), then fill in, build the
  sentence and type what you hear — the last three only with sentences whose words were all introduced already.
- Distractors: same pack and same part of speech, same unit first; never the same answer (above); unique texts.
- `fill_blank`: blanks one exact vocabulary form of the unit (never an inflected form, never the first word, never a
  word that occurs twice; a French noun may be blanked without its article), hint = its Dutch meaning. Pre-A1 and A1.1:
  word bank of three; A1/A2: typed, and words with a same-meaning twin in the pack or a lower level of the track are
  not blanked.
- `build_sentence`: sentences of ≤ 7 words (Pre-A1, A1.1) / ≤ 10 (A1, A2), plus 2 distractor tiles from the unit.
- `listen_type`: sentences of ≤ 5 words (Pre-A1, A1.1) / ≤ 8, else a word.
- Ids: `<lesson>-eNN` by position; lesson and unit ids as above. Ids stay stable as long as the unit id and the lesson
  assignment stay the same.

**Checks (French):** `npm run content:trace -- fr [--coverage]`: every vocabulary target is a lemma of the derived word
list at or below the level (nouns with their article); every sentence word is a form of such a lemma that the level's
grammar allows (agreement, present and imperative at every level, past participles at A2), a form the papers attest at or
below the level (*j'aimerais*, *il était* at A2), an elision or contraction, part of a multi-word entry, a number in range
(A1.1 ≤ 20, A1 ≤ 100) or a name of the list; every lemma of the list is taught in some pack at or above its level, or
listed in a `pack.yaml` `omit` with a reason.

**Checks (English):** `npm run content:validate` (schema and cross-field rules), `npm run content:trace -- en [--coverage]`
(every vocabulary target is a word-list entry at or below the level; every sentence word is one, an inflection the
level's grammar allows — Starters: plurals, -s, -ing, possessive, contractions, letters, numbers ≤ 20; Movers adds past
forms, -er/-est, -ly, numbers ≤ 100; Flyers adds participles and *will* — a multi-word entry, or a handbook name; every
word of the level taught exactly once or listed in `omit`).
