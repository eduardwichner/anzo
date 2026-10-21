# Content

Part of the developer docs (`CONTRIBUTING.md` → *Developer docs*). The pack contract (full spec: `content/README.md`), the content procedure, the reference files, the id lock, the word lists and traces, authoring and generator rules, hidden exercises.

## Content-pack contract (summary)
Full spec: `content/README.md`; schema: `content/schema/pack.schema.json`.

- `content/packs/manifest.json`: tracks (`id`, `target`, `idPrefix?`, `name`, `native`, `mascot`) → packs with `status`
  `available | preview | planned | roadmap` (`preview`: loaded and
  validated like `available`, played only in Admin → Levels → Preview; a learner sees the row as `roadmap`, never the pack).
  The Levels screen renders it directly — never hard-code levels in UI or README.
- Pack (**schemaVersion 2**): `schemaVersion: 2, id, track, cefr, source, units[]`; unit: `id, title{nl}, icon,
  vocabulary[{id, target, native{nl}, pos, gender? (French nouns)}], sentences[{id, target, native{nl}, items}], lessons[]`; lesson:
  `id, title{nl}, exercises[]`. Exercises have `type, id, items`, optional `instruction` (i18n key), **no `prompt`**.
- Sides: target text = string, native text = `{ <native> }`, keyed by the course's native language (manifest track `native`:
  `nl` for English and French, `en` for Dutch; the validator requires that key). MC question and options are opposite sides (the type of
  `question` decides the direction and the default instruction `exercise.multiple_choice.fromTarget|toTarget`);
  `match_pairs.right`, native `listen_choose` options and `hint` are `{ nl }`. `build_sentence` requires
  `sentenceId` (its `answer` = that sentence's target; the app shows the sentence's native text).
- Exercise types implemented: `multiple_choice`, `match_pairs` (4–6 pairs), `build_sentence`
  (tokens join to answer), `fill_blank` (options → word bank, none → typed), `listen_choose`
  (`listen` = vocab/sentence id, `answerSide` target|native, 3–4 options), `listen_type` (`listen`,
  `answer` = the listened target text; per-word typo tolerance for words ≥ 5 letters → note `spelling`; English digits
  count as number words; hyphenated words may be typed as one or two words). `build_sentence` and `listen_type` may carry
  `acceptAlso` (other orders of the same tiles / other spellings of the same sound; never sent to the client).
  Reserved (schema only, UI shows *Binnenkort* + skip, not scored): `speak`.
- Ids globally unique across packs; vocab ids `<track>.<ascii-word>`; `items` must resolve to vocab in the same pack.
- `source` must say which reference files the words came from. Cambridge has a closed list;
  **DELF Prim does not** — the French list is derived from booklets/transcripts/descriptors and
  that derivation is recorded in `source`.
- **Audio is derived from text, never declared.** Packs contain no audio paths; `npm run audio:render`
  produces a clip for every vocabulary/sentence target (normal + slow) and every visible word (normal).
  A missing clip means no URL, and the UI hides the speaker button.
- `npm run content:format` rewrites packs in the house layout (content unchanged).

## Target language and variant courses

A track is a **course**; its `target` is the **language it teaches** (`en`, `fr`, `nl`; lib/langs.js `TARGET_LANGS`). For
`en`, `fr`, `nl` the target is the id. Everything about the *language* keys on the target: grading (`grade(…, { track:
target })`, `knownWordsOf(content, target)`), clips and voices (`clipsForPacks` reads `pack.target ?? pack.track`;
`clipPacks(validated)` adds it), the unit sources and the generator's language rules, `content:trace` (`-- fr-en` traces fr),
the homophones and the word list, the client's `lang` attributes (`publicPack().language`, `track.target`) and the flag.
Everything about the *course* keys on the track id: progress, enrolment, ids, the lock, XP, reports, practice.

**A variant course** teaches a target to speakers of another native language. Today: `fr-en`, *French for English speakers*
(`target: fr`, `native: en`, `idPrefix: fe`, fox, the French accent colour; `languages.fr-en`). The validator requires a
variant's own `idPrefix`, a target that is a language and not the native one, and pack ids with the prefix.
- **Sources: the same French units, an `en` meaning layer.** Every native-side text of a unit (vocabulary and sentence
  `native`, unit and lesson titles, hints, text questions …) may carry several native languages: `native: { nl: hallo, en:
  hello }`. `readPackSources` reduces every such localized object to the pack's native key (`projectNative`), so the
  French-for-Dutch packs never see the English and stay byte-identical. For `fe-<level>` it reads `content/src/fr/<level>/`
  and keeps only the units whose every native-side text has `en` (`missingNative`); the others are listed as skipped.
- **Generation** (`scripts/content/build-pack.js` → `buildPack`): the generator runs with the target's rules (`track: fr`)
  and English meanings, then `withPrefix` gives every id the variant's prefix (`fr.bonjour` → `fe.bonjour`,
  `fr-a1-1-u01-l01-e01` → `fe-a1-1-u01-l01-e01`; ids are recognised by their form) and `track: fr-en`. Output:
  `content/packs/fr-en/<level>.json`. A level with no English unit yet is **not generated** (`content:generate` says so); its
  manifest row stays `planned` and, while the course has no `available` level, English speakers see it in the course sheet
  under *Coming soon* (`coursesView().soon`, `comingCourses`), not offered. Exercises depend on the whole pack (distractors
  are drawn pack-wide), so adding units to a variant level can change the exercises of the units already there: relock a
  **preview** pack deliberately; once a level is `available`, add units only with `append:`.
- **Audio**: a variant plays its target's clips (`fr/…`); its packs need no rendering of their own (`content:validate --
  --audio`: `fe-a1-1` 192 clips, 0 missing).
- **Ids and lock**: `fe-*` ids are locked like any pack's (`content:lock -- --reason …`); `lessonTrack` maps a removed
  lesson's prefix to its track through `idPrefix`.
- **Corrections and the content job**: Admin → Corrections lists `fe` items next to `fr` ones (each row names its
  course: *French for English speakers*). An `fe` item is edited in the French unit source: its `native` is the `en` meaning
  (only that course changes), its `target` is the French text both courses share (the form says so: `sharedWith`). The request
  keeps the course's ids (`fe-a1-1`, `fe.bonjour`); the job maps them to the sources (`sourceSide`: `fr-a1-1-u01`, `fr.bonjour`,
  meaning key `en`) and rebuilds by the target (`affectedPacks('fe-a1')` = the `fr` packs from A1 up and the built `fe` ones).
  A hide names the course's exercise id (`fe-a1-1-u01-l01-e03`) and is applied to that course only (`hiddenFor` in `sources.js`).
- **The course**: `fe-a1-1`, `fe-a1`, `fe-a2`, `fe-b1`, `fe-b2` are available (112 units, every native-side text with
  `en`). The packs differ slightly from the `fr` ones (1,115 against 1,111 exercises at A1): twins and cognates are decided by
  the English meanings.
- **B1 and B2 meanings.** Besides vocabulary, sentences and titles, a text's `title`, every sentence or turn, every
  glossary entry and every gap hint carry `en`; finite-verb hints name the French infinitive and the English tense (`être
  (imperfect)`, `pouvoir (conditional)`, `porter (subjunctive)`, `faire (passé composé: a …)`). A B2 key word transformation
  may carry `native: { en: "…" }` alone (the meaning of the completed sentence): the source reader accepts a transform line in
  another course's language only, and the generator keeps only the course's key, so `fr-b2` (whose transforms have none) is
  unchanged. English cognates are never blanked at B1+ (`noCognateBlank`: *talent*, *motivation*; for French with English meanings accents
  are ignored there and in `hintCheck`, since the grader accepts *evaluation* for *évaluation* — the other courses' locked packs
  keep the exact test), so a lesson whose words are
  all cognates or twins fails generation (*progrès* "progress" would twin B1 *avancer* "to progress", so *avancer* is "to move
  forward, to make progress").
- **`typedAlso`.** A vocabulary item may list other words its **typed** fill-ins accept in the course of one native
  language only: `typedAlso: { en: [email, e-mail] }` on *le mail*. The generator adds them as the fill-in's `acceptAlso` (only
  for a bare blank, so no article must agree; never on a word bank; the validator refuses `acceptAlso` beside `options`), and
  `gradeFillBlank` accepts them with the usual tolerance. The packs of other native languages never see the key. Use it for a
  look-alike an English speaker will type that is correct French in the sentence (*atmosphère* for *ambiance*, *sérieusement*
  for *gravement*, *loisir/hobby* for *passe-temps*, *éducatif*, *certificat*, *piquant*), never to widen the Dutch course
  (it would change its locked pack's grading only, but that is the other course's decision).
- **English meanings: authoring rules.** British English (mum, jumper, rubber, holiday, at the weekend); statements "I have",
  questions "Have you got …?". Meaning parts are compared **lower-cased** (*pouvoir* "may" would twin *mai* "May": it is written "to
  be allowed to") and split at `, ; /` — **never a comma inside brackets** ("number (of a bus, a house)" would split off "a
  house" and twin *numéro* with *maison*). Words an English speaker cannot tell apart share a part on purpose so the generator never
  offers one against the other (*aimer/adorer* "to love", *tu/vous* "you (informal singular)" / "you (formal or plural)",
  *maîtresse/professeur* "teacher", *nager/se baigner* "to swim"); `avoid` lists cannot be added for this course (they would
  change the locked French course for Dutch speakers). A verb and a noun with the same English word are twins too (the
  leading "to" is dropped: *boire*/*boisson* "drink", *travailler*/*travail* "work"; 11 pairs at A1.1–A2) — accepted: only a
  typed fill-in is lost. An `avoid` pair keeps two items out of one question but **does not stop a typed fill-in** (only a
  shared part does): when the hint could lead an English speaker to the other word (*bizarre* "weird, odd" / *étrange*
  "strange"; *déguisement* "costume" / *costume* "suit"), give the two a shared part. A new twin can leave a lesson with no word a typed fill-in may blank — the
  generator then refuses the pack (*dire* "to tell" would twin *raconter*). Every word a sentence's `items` practise is
  visible in its English (a build shows only the English). Bracket labels: "(male)/(female)", "(informal)", "(formal or plural)".

## Reference files

Every word of a pack is traceable to the official reference documents of its level. They are copyrighted publications and
are **not in the repository**: whoever authors lessons downloads them into `content/reference/` (gitignored as a whole; the
full archive keeps it, `docs/developer/operations.md`) and extracts their text into `content/reference/extracted/`. Without
them the app, the packs, the generator and the unit tests work as usual; `content:wordlist` and `content:trace` say what is
missing and skip.

| Folder | What | Where to get it |
|---|---|---|
| `english/` | the Cambridge YLE word list (Pre A1 Starters, A1 Movers, A2 Flyers: `149681-yle-flyers-word-list.pdf`) and the YLE Handbook for Teachers (`153612-yle-handbook-for-teachers.pdf`) | cambridgeenglish.org |
| `english/b1/`, `english/b2/` | the B1 Preliminary vocabulary list (`506887-b1-preliminary-vocabulary-list.pdf`), the B1 Preliminary and B2 First for Schools handbooks and sample tests | cambridgeenglish.org (the preparation pages of both exams) |
| `french/` | the DELF Prim sample papers per level (A1.1, A1, A2): candidate booklet, examiner booklet, transcript — `delf-prim-<level>-livret-candidat.pdf`, `-livret-examinateur.pdf`, `-transcription.pdf` | france-education-international.fr (DELF Prim, *exemples de sujets*) |
| `french/b1/`, `french/b2/` | DELF junior / scolaire sample papers, the *conseils* sheets, the DELF B2 candidate manual | france-education-international.fr |
| `dutch/` | NT2Lex (`dutch/a1/NT2Lex-CGN-v01.tsv`, CC BY-NC-SA 4.0), *Naar Nederland*, CNaVT, Staatsexamen NT2, Richtgraad | cental.uclouvain.be (NT2Lex), cnavt.org, staatsexamensnt2.nl, onderwijsvlaanderen.be |

What each file is and what it is used for: `content/src/en/SOURCES.md`, `content/src/fr/SOURCES.md`,
`content/src/nl/SOURCES.md`. DELF Prim publishes **no closed word list**: the French vocabulary is derived from the papers
(below). Text extraction (`pdftotext`, from `poppler-utils`):

```bash
cd content/reference && mkdir -p extracted
for f in english/*.pdf french/*.pdf; do pdftotext -layout "$f" "extracted/$(basename "$f" .pdf).txt"; done
# B1/B2 and dutch/: one folder per language and level, sample-paper subfolders flattened
for f in english/b1/*.pdf english/b1/*/*.pdf english/b2/*.pdf english/b2/*/*.pdf french/b1/*.pdf french/b2/*.pdf dutch/b2/*.pdf; do
  lang=${f%%/*}; rest=${f#*/}; lvl=${rest%%/*}
  mkdir -p "extracted/$lang/$lvl"; pdftotext -layout "$f" "extracted/$lang/$lvl/$(basename "${f%.pdf}").txt"
done
```

The B1 vocabulary list is set in two columns (four in its topic appendix), which `-layout` interleaves: `npm run
content:wordlist` rebuilds it column by column from `pdftotext -bbox` into
`extracted/english/b1/506887-b1-preliminary-vocabulary-list.columns.txt` (delete that file to rebuild it).

## Reviews

Every unit and every level is reviewed before it is released. An independent reviewer (a separate AI session working from a brief)
reads the unit as a learner meets it — `node scripts/content/show-unit.js <pack file> <unit id>` prints it, texts and text exercises
included — against a brief for its course (the course's rules, the level's grammar, the word list, and for texts and the B2
kinds their own checks) and lists findings; the author fixes or declines every one under *Author's resolution*. A level
review follows the last unit of a level. The briefs and the review files are working papers kept with the installation
that authors lessons (`content/review/`, not in the repository); `npm run content:status` counts a unit as reviewed when its
review file there has a resolution, and says so when the folder is absent.

## Procedures and rules

- **Content: the procedure.** Packs are generated, never hand-edited:
  1. `content/src/<track>/<level>/pack.yaml` (`id, cefr, source, omit[]`) and one `NN-<topic>.yaml` per unit (format:
     `content/README.md`, "Unit sources"). Vocabulary `id` defaults to `<track>.<ascii target>`; sentence ids `s01`
     are short for `<unit>-s01`; pin lessons with `lessons: [{id: l01, title, vocab}]`. `category: true` and
     `avoid: [ids]` keep confusable words apart; `avoidInChoices: [ids]` the same except in matching pairs (
     *s'il te plaît* / *s'il vous plaît* are never two options of one question, but may stand side by side as pairs); items
     whose Dutch meanings share a word count as the same answer.
  2. `npm run content:generate -- <pack>` → `npm run content:validate` → `npm run content:trace -- en|fr|nl`.
  3. Review (*Reviews* below): one independent review per unit, and one level-wide review after a level; fix or decline
     every finding.
  4. `npm run audio:render`, then **`npm run audio:check`** (every clip measured and transcribed; `npm run audio:fix` repairs
     what it flags with per-clip overrides — `docs/developer/audio.md`; the System tile must not stay amber), `npm run content:status`
     (all rows `done`), set the manifest row `available`,
     `npm run content:lock -- --reason "<pack> uNN added"`, `npm run check:integrity` (0 orphans), restart, commit.
  Ids are stable forever: never rename a unit id or a pinned lesson id, and never reuse a vocabulary id (progress keys on
  them; `check:integrity` catches orphans). Exercise ids are positional (`<lesson>-eNN`).
- **Id lock (`content/ids.lock.json`).** It records every pack's unit, lesson, item (vocabulary + sentence) and exercise ids,
  and each exercise's type and items; for a pack with texts also its text ids, the sentence and turn ids inside
  them, the question ids (questions and listening questions) and what each text exercise stands for (`textExercises`: text +
  question, a cloze's gaps `sentence:word`, an ordering's unit). A removed text, sentence or question id, or a text exercise
  that now asks another question, fails like a removed exercise (`server/test/idlock.test.js`). `server/test/idlock.test.js` fails if a locked id disappears, if a locked exercise id now
  has another type or other items (order-insensitive), or if the packs hold ids the lock does not know yet. **A generator
  change must keep existing ids stable: append new exercises with new ids instead of renumbering** (renumbered exercises would leave the stored attempts
  describing other exercises). New content or a
  deliberate change is locked with `npm run content:lock -- --reason "<why>"` (the reason, and what was added / removed /
  changed, go into the lock's `history`); without `--reason` it only checks. A deliberate change of a locked exercise also
  needs `npm run check:integrity` on the live data first: stored attempts would describe another exercise.
- **French word list (derived, with provenance).** DELF Prim has no closed list. `scripts/content/wordlist-fr.js` splits the nine
  extracted papers into child-facing text and exam/examiner text, tokenizes (elisions split, contractions resolved), lemmatizes
  forward with `french.js` and the lexicon in `content/src/fr/wordlist-sources.yaml` (`lemma = pos [gender]`; `lemma~tag` keeps
  homographs apart: `orange~fruit`, `goûter~v`), resolves ambiguous forms by context (determiner → noun, pronoun → verb, être
  before suivre, reflexive only after me/te/se), and records each lemma's lowest attested level, refs and attested forms (per
  level). Topic additions (by DELF theme, with justification) and parity additions (concepts of the English plan) complete it.
  An unknown child-facing word stops the build: add it to the lexicon, `names` or `exclude`. To add a word for content: put it
  in the lexicon and in a `topic`/`parity` group of the right level with a justification, then `npm run content:wordlist -- fr`.
- **French trace** (`trace-fr-lib.js`): vocabulary = a list lemma ≤ the level (nouns with their article; with an article the noun
  lemma wins, without one the other); sentence words = generated forms the level's grammar allows (agreement, present,
  imperative at all levels; past participles from A2), forms the papers attest at or below the level (imparfait, futur,
  conditionnel only so), elisions/contractions, parts of multi-word lemmas (plural parts too), numbers (A1.1 ≤ 20, A1 ≤ 100),
  list names. It matches spellings, not parts of speech (*voyage* the noun lets *il voyage* through), so reviewers check that.
- **French authoring rules.** Nouns carry their article in `target` (`le chat`, `l'école`, `les yeux`) and `gender: m|f`;
  ids drop the article (`fr.ecole`). Dutch meanings carry the Dutch article and are quoted when they contain a comma (YAML).
  *tu* throughout; *vous* only to an adult (shop, waiter, teacher) or to several people, with *u* / *jullie* in Dutch.
  Give near-synonyms one shared meaning part (`"aardig, leuk"`) so they count as the same answer, and `avoid` for homophones
  (*mer/mère*, *ou/où*, *ami/amie*) and near-synonyms the parts do not catch. A sentence word must be listed at its level: add
  it to the word list with a justification rather than bending the sentence.
- **Generator rules** (`scripts/content/generator.js`, unit-tested): 6–8 new words per lesson (pinned or balanced
  split), 12–14 exercises: each word introduced by MC target→native, then listen-target, match, listen-native, fill,
  build, listen-type; plus a review lesson `<unit>-review` ("Herhaling"). Distractors from the same pack, same pos,
  never a same-meaning/`avoid`/category clash. Pre-A1 and A1.1 fill-ins are word banks (options with the answer's capitals; a
  bare French noun gets nouns of its gender and number); A1+ typed and never blank a word with a same-meaning twin in that
  level or a lower one of the track (`lowerVocab`). French options showing nouns share the answer's article form (le/la/l'/les/
  none); a word that cannot get three options gives way to another word (`firstValid`). A match whose words may not stand side by side
  (avoid pairs, the first lesson) is retried two steps later. Build tiles carry no punctuation and no sentence-start capital in every track (names, languages, English *I*, and abbreviations like *a.m.* keep theirs); the client shows the sentence's final mark (`end`). Build ≤ 7 words (Pre-A1) / ≤ 10; listen_type ≤ 5 / ≤ 8 words. Only exact vocabulary forms are
  blanked, never the first word.
- **Homophone rule (new content only).** A single-word `listen_type` (a vocabulary item, or a one-word sentence,
  after its article) is never generated for a word in the track's homophone list `content/src/<track>/homophones.yaml`
  (`groups: [[ijs, eis], [hart, hard], …]`: words that sound alike in the course): the lesson's step 6 takes another word
  or a short sentence, the review skips to the next word. The six English and French packs of Pre-A1 to A2 set
  `legacyListenType: true` in their `pack.yaml` and ignore the rule, so their locked exercises and pack files stay
  byte-identical; every other pack follows it.
- **Dutch word list (derived, with provenance).** `scripts/content/wordlist-nl.js` builds `wordlist-nl.json` (gitignored) from the
  unit groups of `content/src/nl/wordlist-sources.yaml` (every word sits in one group of one level, with a `why` naming its
  sources and, when it sits above its NT2Lex level, a `moved` reason). Each lemma records its NT2Lex level (CGN file,
  *first observed* level: the lowest CEFR level with a frequency > 0; CC BY-NC-SA 4.0), its attestations in *Naar Nederland*
  and the CNaVT tasks, and its source: `nt2lex` (NT2Lex level ≤ the group's), `attested`, or `topic` (Belgian standard forms and
  Flemish everyday tasks the corpora lack). Nouns carry article and plural; separable verbs are written `op|staan`;
  `regional` lists Netherlands-only words (never allowed); `alsoNL` maps a Belgian word to its Netherlands form. Counts per
  level and source: `content/src/nl/WORDLIST.md`; sources and licences: `content/src/nl/SOURCES.md`.
- **Dutch trace** (`trace-nl-lib.js`, morphology in `dutch.js`): vocabulary = a list lemma ≤ the level (nouns with the list's
  article, plural and `alsoNL` as listed; reflexive verbs with *zich*; a listed phrase with an article is its own lemma);
  sentence words = forms the level's grammar allows (`KIND_LEVEL`: present, imperative, plural, adjective -e from Start;
  diminutives, partitive -s, split separable verbs from A1; past, participles, comparatives and superlatives from A2;
  irregular verbs from the table in `dutch.js`), parts of listed phrases, numbers (Start ≤ 20, A1 ≤ 1000), list names,
  compounds of two list words (reported for review). Homographs of a form above the level (*was*: *wassen* or the past of
  *zijn*) pass and are listed for review. The trace checks forms, not clause structure: subordinate clauses (A2) and
  reflexive use (A2) are the reviewers' job.
- **Dutch authoring rules.** Standard Belgian Dutch (Groene Boekje spelling; *je/jij*, never *ge/gij*; *hebt u*); a Belgian word
  with a different Netherlands form carries `alsoNL` (the app then shows "In the Netherlands: …"). Nouns carry *de/het* and
  `plural`. English meanings are British English and quoted when they contain a comma. *u* in shops, offices, at the doctor's
  and with strangers; *je* among friends and colleagues. Built word order: verb and particle last; every unmarked fronted
  order of the same words is listed in `acceptAlso` (a fronted subordinate clause with inversion included); extraposed orders
  are not. The generator fails on a Dutch `acceptAlso` that is not the same words as the target. Grammar per level, unit list
  and omissions: `content/src/nl/PLAN.md`; the Dutch reviewer brief (*Reviews*).
- **Dutch generator rules** (only for track `nl`, except the tile rule, which every track follows): build tiles carry no
  punctuation and every sentence start (the first word, a word after . ! ?, the word after a sentence-initial *'s*) is lower-case
  unless it is a name or language (capitalised inside a sentence or a capitalised target), and grading compares word order only (`orderKey`); noun tiles and distractors are bare nouns; a word bank for a bare
  noun offers nouns of its article, and capitalised words first for a capitalised answer; English meaning parts also count
  without their bracket ("floor (storey)" overlaps "floor"); a group noun (`category`) excludes only same-pos words of its own
  unit; a phrase containing a word with a twin is never a typed fill-in; dictations accept only what was said; the review
  lesson takes sentences no lesson used and adds exercises until every sentence reaches the learner.
- **Appending to locked content.** A unit whose exercises are locked never gets words added to its
  `vocabulary` (the lesson split, the review lesson and every distractor pool would move). Instead the unit YAML gets an
  `append:` block: `[{ lesson: { id: lNN (the next free number), title }, why, vocabulary: […], sentences: […] }]`. Its
  words and sentences stay out of every pool the existing exercises draw from; they get one lesson of their own, built by
  the normal lesson recipe and placed before the review lesson (`<unit>-review`, also in a unit with text lessons) (Dutch: every appended sentence reaches an exercise there);
  their sentences continue the unit's numbering (`sNN`). Trace, status and the lower-level vocabulary see appended words
  (`withAppended` in `sources.js`); the same-meaning twin rule counts them. Example: Dutch A2 Belgian realia
  (`nl-a2-u07-l03` *plaatsbeschrijving, brandverzekering*; `nl-a2-u08-l04` *ziekenfonds, mutualiteit*). Check with
  `content:lock`: only new ids. Append to a unit a learner has already finished only when the new lesson is meant to
  become their current lesson.
- **Extra lessons** (`pack.yaml` `extraLessons: true`; the six English and French packs). After the review lesson, every
  sentence of the unit that no exercise uses (not built, filled in, listened to, nor asked as a multiple-choice question)
  gets one exercise in `<unit>-extra` (`-extra2` … when there are more than 14), title *Extra oefening* / *Extra practice*
  (`EXTRA_TITLES`), `"extra": true`. Kinds rotate (build ≤ the level's build length, dictation ≤ its listen length,
  listen-for-meaning, fill-in) and the first that fits the sentence is taken; a lesson with fewer than 4 exercises is filled
  up with other sentences of the unit. Extra lessons are **optional**: on the path never current or locked, not counted in
  level/unit progress (`requiredLessonIds`, `packProgress`), unit and level badges, or the level ring; completing one gives
  XP and practice candidates like any lesson. On the path a finished one is a green star on white with a small check (never
  the green disc of a lesson), and the level sheet says *Extra oefening: n van m gedaan* under the level's progress.
  Dutch packs keep "every sentence in the review lesson" instead.
- **Texts.** A unit may list `texts: [text id, …]`; each text is
  `content/src/<lang>/<level>/texts/NN-<slug>.yaml`:
  `{ id, kind: reading | dialogue, title {native}, topic, level, paragraphs: [[{id, target, native}]] | turns: [{id, speaker:
  A|B, target, native}] + speakers {A: {name}, B: {name}}, glossary: [{word, native}], items: [vocab ids], questions,
  listeningQuestions?, cloze?: [{sentence, word, kind?: word | finite_verb, hint}], orderable? }`. Questions are authored, in
  the target language: `mc` (`question`, `options`, `correct` = index), `true_false_notgiven` (`statement`, `answer` true |
  false | not_given), `match_heading` (`paragraph` 1-based, `options`, `correct`). Rules (`server/src/content/texts.js`, used by
  the YAML reader and the pack validator; one failing fixture each in `server/test/texts.test.js`): kind and native title;
  reading = paragraphs, dialogue = turns with both speakers defined, alternating, both speaking; every sentence/turn has its
  meaning and a unique id; glossary words occur in the text, have a meaning and are at most ~5 % of its tokens; items and
  questions required; mc/heading: ≥ 3 unique options, `correct` an index; `not_given` only for true/false/not given; a
  heading's paragraph exists (reading only); question ids unique; cloze 3–6 gaps, each word in its sentence as a whole word
(`gapPattern`: a quote or a plural possessive is a word edge, an elision or a hyphen inside a word is not) and placed in the text; gaps are numbered on screen in text order; **every gap of a
  typed cloze has a hint** (its meaning, or the infinitive and tense: without one, another word often fits); `orderable` needs ≥ 3 parts.
  **Generator** (a unit with texts): one lesson per text — one `reading`/`dialogue` exercise per question, then its `cloze`
  (authored gaps, else its items where they occur; a word bank of the gap words + two unit words below B1, typed at B1),
  then `order_paragraphs` when `orderable` (paragraphs when ≥ 3, else sentences; a dialogue's turns; at most 8); then a
  review lesson with a `listening` exercise per listening question of every text (its `listeningQuestions`, else its mc and
  true/false ones). Deterministic, positional ids, append-only under the lock. The pack keeps the texts (without `cloze`).
  **Presentation**: one screen per text — the text (or the listening player) at the top, *Question 2 of 5* with a dot
  per question, the questions one after another underneath; on a phone the text folds to a *Show text* bar after the first
  question (one tap opens it again), from 900 px text and question sit side by side. Each question stays its own exercise
  (score, XP, first try, practice); a wrong one comes back at the end under the same text. In the listening review the
  transcript appears once every question of that text has been answered.
  **Trace** (`traceTexts` in `trace.js`): every sentence, turn, question and option at the pack's level; a word off the list
  passes only as a glossary word (a glossary phrase covers its words) or as one of the unit's own words (also inflected:
  coins, vrijwilligers). Dutch has a B1 level (`dutch.js` LEVELS; B1 groups in `wordlist-sources.yaml`, NT2Lex B1 as
  evidence). English and French have no B1 list on disk: `en-b1`/`fr-b1` trace against the A2 list, their own vocabulary is
  reported for the reviewer instead of failing, and French accepts every tense of a listed lemma there (`allForms`: imparfait,
  conditionnel). **Review**: a text unit's review uses the texts brief plus the course's unit brief (*Reviews*). **Practice**: a cloze comes back in practice (`PRACTICE_TYPES`: a bank = assemble, typed =
  produce); reading, dialogue, listening and ordering exercises do not; every text exercise updates its `items`.
- **B1 units with vocabulary and texts.** A unit with `texts` and `sentences` gets the normal vocabulary lessons
  (lesson recipe, 6–8 words), then one lesson per text numbered after them (`<unit>-lNN`: one exercise per question, the cloze,
  ordering), the review lesson (`<unit>-review`, with finite-verb fill-ins) and a listening lesson `<unit>-listening`
  (*Luisteren* / *Listening*, `LISTENING_TITLES`) with every text's listening questions. A unit with texts and no sentences
  (the pilot units) keeps one lesson per text and a listening review as before (`textLessons` in `generator.js`).
- **Dutch B1 rules.** The word list's B1 groups (`c02`–`c20` in `wordlist-sources.yaml`, one per unit, with `why` =
  the Richtgraad 2 role and task and `moved` = why NT2Lex A1–A2 words sit at B1) are compared with NT2Lex B1 (`bucket`), and
  CNaVT FORM and the Staatsexamen 2025 booklets are B1 attestations. Never list at B1 a word the lower levels already use as a
  compound (listing *buurman* at B1 fails the A1 trace: a listed lemma above the level is an error). Keep the Belgian forms the
  course already teaches (*ziekenwagen*, *uurrooster*/*werkrooster*, *kwart na*) and put every new Belgian form with its
  Netherlands form in the `alsoNL` map. Trace morphology for B1 (`dutch.js`): irregular verbs with an inseparable prefix
  (*ontbreken → ontbrak, ontbroken*; *bestaan → bestaat*), the root's stem after a prefix (*beweren → beweer*), *ge-* with a
  diaeresis (*geïsoleerd*), loan verbs in *-eren* (*geblokkeerd*), inseparable *onder-/over-/vol-* verbs (`INSEPARABLE_LONG`),
  adverb comparatives (*vaker, erger*), *sommigen*, a capitalised *Eén*; pronominal adverbs (`pronominalAdverb`: *er/daar/hier* +
  preposition A2, *waar* + preposition B1); a split separable verb takes the nearest particle (*neem … mee … aan*). Texts: readings
  120–250 words, dialogues 8–14 turns (A = a man, the main voice; B = a woman, the dialogue voice), glossary ≤ 5 % of tokens,
  original (exam papers are models only), 4–6 questions + 2 listening questions, a typed cloze of finite verbs with infinitive +
  tense hints. A text's `items` list every B1 course word it uses (a word taught in a later unit too); the glossary only holds
  words that are not course words. The generator writes a Dutch text's `forms` (an inflected form in the text → its item:
  *begeleid → nl.begeleiden*, a split separable verb only with its particle in the same sentence), and the loader keys the tap
  meanings by them. Vary the true/false/not-given answers between q2–q4 across texts. The locked pilots (t01, t02) keep their
  items: their exercises lock them. Built word order (PLAN.md, B1 row): the verb, particle and cluster last in the target; a
  prepositional phrase after the final verb only as an `acceptAlso`; both cluster orders listed.
- **Generator and validator guards.** A cloze gap or a sentence `finite` whose word is its hint's
  infinitive (*we geven*, hint "geven (present)") is an error (`clozeProblems`, `generatePack`). B1 (`LEVEL_RULES.B1.noCognateBlank`)
  never blanks a word whose meaning is the word itself (*laptop*, *camera*). A sentence with `build: true` is always built in its
  unit's review lesson. The Dutch trace never splits a compound into a pronoun, determiner or conjunction (*me + geven*,
  *dank + zij*). Lower packs are unchanged by all four (`content:generate -- <pack> --check`).
- **Finite-verb fill-ins** (`pack.yaml` `finiteVerbFill: true`, new content only): a sentence annotated `finite: { word, hint }`
  gets a typed `fill_blank` with `kind: finite_verb` (the conjugated verb blanked, the hint its infinitive and tense) appended
  to its unit's review lesson; instruction `exercise.fill_blank.finiteVerb`. Existing packs stay byte-identical (flag off).
- **English and French B1.** Audience **from about 11 to adult** (learners are teenagers by B1): school,
  friends, family, work, travel, society; family-safe (nothing explicit, violent, frightening or mocking; no alcohol, drugs or
  gambling); nothing childish. *English*: the word list's B1 level is the **B1 Preliminary vocabulary list** parsed from the
  PDF's word boxes (`scripts/content/wordlist-en-b1.js`: columns per page, entries, examples, topic lists; 3,120 entries,
  0 unparsed) plus names for the texts (`content/src/en/wordlist-b1-names.yaml`, names that are list words dropped);
  `content:trace -- en --coverage` counts B1 per headword (1,917 taught, 12 omitted, 1,171 already taught at YLE levels);
  a B1 phrase may inflect its first word (*got rid of*). `pack.yaml` `offList` admits a pilot word that is not on the list,
  with a reason. *French*: the B1 lemmas are attested in the DELF B1 junior / scolaire papers (`classifyB1Lines`), plus
  topic and parity groups (`wordlist-sources.yaml`); the trace allows imparfait, futur, conditionnel, subjonctif and
  gérondif at B1 (`KIND_LEVEL`); `PLAN.md` (B1) lists every unit's words. A French gap (cloze or `finite`) is a standalone
  word, never an elided form (*j'étais*), with the French tense in the hint (*être (imparfait)*). Two items whose ascii ids
  collide across levels get an explicit id (`fr.age-adj` for *âgé* against A1.1 *âge*, `fr.sur-adj`, `fr.fatigue-n`;
  English `en.face-to-face-adj`, `en.full-time-1`). Reviews: one unit + its text per review, then a level review.
- **`noBlank: true`** (vocabulary key): the item is never a typed fill-in — for a word whose sentences also take a
  common lower-level word (*elder/older*, *made of/made from*, *cab/taxi*). Twins (a shared whole meaning part) are never
  blanked anyway.
- **Inflected forms in B1 texts** (`LEVEL_RULES.B1.textForms`, English and French; Dutch the same way): the
  generator writes a text's `forms` (*postponed → en.postpone*, *soutient → fr.soutenir*: verb forms and plurals of the
  text's items, never a word that is itself a course word), and the loader keys the tap meanings by them.
- **`acceptAlso` in builds and dictations.** A build keeps an `acceptAlso` that uses the
  same tiles with the capital and the full stop moved (*Last week I …*), in every track. A dictation leaves out the alternatives that are other word orders in Dutch and at B1
  (`LEVEL_RULES.B1.orderAlternatives`) and keeps the others (spellings: *It's / It is*); the lower English and
  French dictations keep every `acceptAlso`.
- **B2 exercise kinds.** Text exercises `gap_sentence` (a gapped text:
  sentences taken out, one or two extra ones offered; first in the text's lesson; graded per gap by opaque tokens),
  `open_cloze` (typed, no hints; `acceptAlso` per gap) and `word_form` (typed, a stem in capitals per gap; a word of the stem
  in another form gets the note `form`, never a correct mark); the question types `summary` (mc on the whole text),
  `match_texts` (a label per paragraph, statements matched to them, graded per row) and `complete` (listening, typed 1–3 words,
  dictation tolerance); unit exercises `transform` (key word transformation, `transforms:` in the unit YAML, typed, graded
  against every authored answer) and the `fill_blank` kind `word_form` (sentence `form:`), both in the review lesson.
  `LEVEL_RULES.B2` = B1 with builds ≤ 14 and dictations ≤ 12 words, plus three generator rules that keep the B2 review honest:
  `gapsReach` (a sentence with a `form` or `finite` gap is shown nowhere else in the review lesson — its fill-in is how it reaches
  the learner), `hintCheck` (generation fails when a fill-in's hint, the English meaning, contains the answer as a word: write
  meanings without Dutch, "(as in: …)", or mark the item `noBlank`) and no repeated (sentence, word) fill-in across a unit's
  lessons; pack.yaml `transformsFirst: true` (en-b2, fr-b2) puts the key word transformations at the start
  of each review lesson, so no build, dictation or fill-in of that review shows a transformation's answer sentence first (nl-b2
  is locked and keeps them at the end). The validator rejects a sentence with both `form` and `finite`. Rules: `texts.js` (`gappedProblems`, `transformProblems`,
  `questionProblems`), one failing fixture each in `server/test/b2.test.js`; source keys and order: `content/README.md` ("B2
  keys"). Practice plays `open_cloze`, `word_form`, `transform` (produce), never
  `gap_sentence`; comprehension kinds only mark the text's words as seen. Long texts (> 180 words) and matching texts get their
  own scroll pane on a phone; the paragraphs of a matching text show their labels. Not built: true/false with a justification sentence, selective
  reading.
- **English and French B2.** Audience **from about 13 to adult**, family-safe; 20 units each, one original
  text per unit (165–300 words; English and French run in parallel unit for unit). Neither exam publishes a B2 list, so both
  are *teaching lists*: one topic group per unit with a justification naming the exam words it covers. *English*:
  `content/src/en/wordlist-b2-sources.yaml` (groups b01–b20, `names`); `wordlist-en.js` (`buildB2Entries`) marks a word
  `attested` when it occurs in the B2 First for Schools sample paper 1 (`b2PaperText`), and fails on a word already on a
  lower list (hyphen and space variants too) unless the group lists it under `newSense` (a new meaning: *make up* after a
  row, id `en.make-up-after-a-row`); trace `LEVELS` gain `B2`, `content/src/en/WORDLIST.md` records the method and counts.
  *French*: B2 groups and lexicon lines in `content/src/fr/wordlist-sources.yaml`; the DELF B2 junior / scolaire papers
  (`wordlist-fr.js` `FILES`, five files) are `ATTEST_ONLY` — a paper word missing from the lexicon is not an error (the papers
  use far more words than 20 units teach); omissions with a reason in `content/src/fr/b2/pack.yaml` (*mademoiselle*). The
  conjugation tables (`french.js`) include *concevoir, rompre, convaincre*, the compounds *contredire, prédire, interrompre*
  and the *è* stems of *protéger, révéler*. A form or wordForm gap is a standalone token (not an elided *l'invention*), and
  its stem is the real base on the list. Reviews: the B1 briefs plus the B2 checks, then a level review per course.
- **Branch packs.** Manifest `branch: true` + `after: <core pack>` (an earlier non-branch pack of the same track and
  CEFR level; validator). Lessons optional on the path (`lessonStates`), never current; not in course progress
  (`allCourses().corePackIds`) or start levels; their own level badge (`level-<pack>`); reset by pack or course as any level;
  the level sheet indents them under their core with *Keuzerichting / Optional branch*. Dutch: `nl-b2-work`, `nl-b2-study`.
- **Hidden exercises.** Unit YAML `hidden: [{ exercise, reason }]`; the generator numbers them and then drops them (no other id
  moves). The lock keeps them under `retired`; `content.retired` makes their attempts info, practice ids valid, and a lesson
  opened before the hide completes with the old count (`retiredCount`).
