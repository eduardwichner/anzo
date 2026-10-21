# What the app accepts as correct (grading rules)

Part of the Anzo docs (developer docs index: `CONTRIBUTING.md` → *Developer docs*). Every rule the grader applies, per exercise type and language, in
plain English with an example, and where it lives in the code. All grading happens on the server
(`server/src/content/grading.js`, pure functions), except *matching pairs*, which are matched on the device. The routes
call `grade(exercise, answer, { track, nativeLang, knownWords })` (`routes/progress.js`, `routes/practice.js`,
`routes/admin.js` for the admin's preview); `track` is the course of the exercise (`en`, `fr`, `nl`).

Every example below was run through the real grader. *Right (note)* means the answer counts as correct and the
result strip shows the note: `accents` ("watch the accents", with the accented form) or `spelling` ("almost: watch the
spelling", with the right spelling). A note never costs XP or strength: the answer is correct.

## 1. Per exercise type

| Exercise | The learner gives | Correct when | Code |
|---|---|---|---|
| Multiple choice, listen and choose | an option tapped | it is the right option (compared after `normalize`: case and a final `.?!` do not matter) | `gradeMultipleChoice` |
| Matching pairs | `{ mistakes: n }` from the device | `n` is 0: every pair matched without a wrong tap (a wrong pair flashes red, is never paired, and counts one mistake) | `gradeMatchPairs`, `client/src/exercises/MatchPairs.jsx` |
| Build a sentence (word tiles) | the tiles in order | exactly the given tiles are used (compared as words, so tiles with a capital and the final mark, from an older pack, grade the same), and their order equals the sentence or one of its `acceptAlso` orders, compared without case and punctuation (`orderKey`). Tiles carry no punctuation and no sentence-start capital in every course (names, languages and English *I* keep theirs); the app shows the final mark after the built sentence | `gradeBuildSentence` |
| Fill in, word bank | a bank word | it is the answer, ignoring case (`Yellow` = `yellow`); accents are never "almost right" in a bank | `gradeFillBlank` |
| Fill in, typed | text | the typed rules (section 2) | `gradeFillBlank` → `gradeTyped` |
| Dictation (*listen and type*) | text | the dictation rules (section 3) against the sentence or one of its `acceptAlso` spellings | `gradeListenType` |
| Reading, dialogue, listening questions | an option, or true / false / not given | the right option or code | `gradeTextQuestion` |
| Ordering paragraphs or sentences | the parts in order | every part in its place (opaque per-exercise tokens) | `gradeOrder` |
| Cloze (text with gaps), word bank | one word per gap | each gap's word, ignoring case; correct when every gap is | `gradeCloze` |
| Cloze, typed; open cloze; word formation (B2) | one word per gap | each gap by the typed rules, also against the gap's `acceptAlso`; a word-formation gap that starts like its stem but is the wrong form gets the note `form` (still wrong) | `gradeCloze`, `sameStem` |
| Gapped text (B2) | a sentence per gap | each gap has its own sentence | `gradeGapSentence` |
| Multiple matching (B2) | a paragraph per statement | every statement matched | `gradeTextQuestion` (`match_texts`) |
| Listening completion (B2) | 1–3 typed words | the dictation rules against any authored answer | `gradeTextQuestion` (`complete`) |
| Key word transformation (B2) | the words in the gap | the typed rules against any authored answer | `gradeTransform` |
| Word formation fill-in (B2 `fill_blank` kind `word_form`) | text | the typed rules; the right word in another form gets the note `form` (still wrong) | `gradeFillBlank` |

Answers larger than any exercise needs (a string over 400 characters, a list over 24 entries) are refused before grading
(`answerFits`, 400 `invalid_answer`).

## 2. Typed answers: fill-ins, typed cloze gaps, transformations (`normalize`, `gradeTyped`)

| Rule | Example (expected → typed) | Result |
|---|---|---|
| Upper or lower case never matters | `The horse is big.` → `the horse is big` | right |
| Extra spaces at either end or between words never matter | `Look at the donkey!` → `  LOOK at the   donkey ` | right |
| A final `.`, `?` or `!` never matters (also several, also with spaces) | `Clap your hands!` → `Clap your hands` | right |
| Curly and other apostrophes (`’ ‘ ʼ ` ´`) are `'` | `J'ai huit ans.` → `J’ai huit ans` | right |
| The space before `? ! : ;` is optional (French typing), also a no-break space | `Quel est ton nom ?` → `Quel est ton nom?` | right |
| `, ; :` are word breaks: the space after them is optional | `Oui, ça va bien.` → `Oui,ça va bien` | right |
| Spaces around an apostrophe between letters do not matter | `J'ai huit ans.` → `j ' ai huit ans` | right |
| The ligatures `œ` `æ` equal `oe` `ae` | `Ma sœur` → `Ma soeur` | right |
| A hyphen may be typed as a space or left out | `ice-cream` → `ice cream`, `icecream` | right |
| A space may be typed as a hyphen | `well made` → `well-made` | right |
| **French and Dutch**: missing accents are almost right | `café` → `cafe`; `één` → `een` | right (accents) |
| … but an accent *added* or *changed* is another word | `a` → `à`; `ou` → `où` | wrong |
| **English**: a contraction may be written out (`n't 'm 're 've 'll`, `can't` = `cannot` = `can not`, `won't`, `shan't`) | `haven't` → `have not` | right |
| … but not `'s` and `'d` (is/has/possessive, would/had) | `It's red.` → `It is red.` | wrong (needs an `acceptAlso`) |
| **English**: the British `-t` past and the `-ed` past are both right (`ENGLISH_PAST_T`: learnt, spelt, burnt, dreamt, spilt, smelt, spoilt, leapt, knelt) | `I learnt it.` → `I learned it.` | right |
| **English**: `-ize` for `-ise`, only for the stems that really have both (`ENGLISH_IZE_STEMS`) | `realise` → `realize` | right |
| **English**: American spellings of British words (`ENGLISH_US`: color, favor(ite), center, theater, gray, jewelry, mom, math, program, … and their plurals/forms) | `favourite colour` → `favorite color` | right |
| **English**: the American single `-l-` (`ENGLISH_LL`: canceled, traveling, traveler, labeled, modeled) | `cancelled` → `canceled` | right |
| No typo tolerance in a typed fill-in | `giraffe` → `girafe` | wrong |

## 3. Dictation (*listen and type*) and listening completion (`gradeListenType`, `gradeDictation`, `compareWords`)

Everything in section 2, then word by word (same number of words, same order; punctuation at the edges of each word is
ignored, so commas and full stops inside the sentence do not matter either):

| Rule | Example (heard → typed) | Result |
|---|---|---|
| Punctuation inside the sentence is ignored (at word edges) | `Au revoir, Rose !` → `au revoir rose` | right |
| A slip of one letter (insert, delete, change or swap two neighbours) in a word of 5+ letters | `The horse is big.` → `The hors is big.` | right (spelling) |
| … unless the typed word is itself another word of the course (`knownWords`): the learner heard another word | `three` → `tree` | wrong |
| … words of 4 letters or fewer must be exact | `cat` → `kat` | wrong |
| **French**: an agreement ending that is not heard (`-e -s -es` after `-é/-i/-u/-er`, words of 4+ letters) | `allée` → `allé`; `fier` → `fière` | right (spelling) |
| **French, Dutch**: missing accents | `Mon frère` → `Mon frere`; `België` → `Belgie` | right (accents) |
| Digits for number words, only where a side has digits: English 0–100 (and "a/one … nine hundred [and …]"), French 0–100 (`vingt et un`, `une`), Dutch 0–1000 written as one word | `deux` → `2`; `vingt et un` → `21`; `a hundred` → `100`; `eenentwintig` → `21` | right |
| … but an article is never a number: Dutch `een` (unaccented) is the article; French `une`/`un` stay words where both sides wrote words | `Ik heb een kat.` → `Ik heb 1 kat` | wrong |
| A hyphenated word may be typed as one or two words; a space typed as a hyphen | `Bon week-end !` → `bon weekend`, `bon week end`; `well made` → `well-made` | right |
| English contractions written out, `-t`/`-ed`, `-ize`, US spellings, single `-l-` (as in section 2) | `I haven't got a dog.` → `I have not got a dog.` | right |
| The exercise's `acceptAlso` spellings (authored, e.g. *It's / It is*) count like the answer | | right |
| "spelling" wins over "accents" when both apply | | right (spelling) |

**What the result strip shows**: after a dictation that is wrong or only almost right, the
sentence as written with each word marked — right, accents, spelling, wrong, missing — and the typed words the sentence does
not have; and, whenever the learner left out the capital at the start or the mark at the end (`leftOutCapsOrStop`), the line
*Capitals and full stops don't count* — they never do. The marks follow the grade (`wordMarks`): a word-level
alignment in which one word may also stand against a run of up to four words on the other side, each pair decided by the
grader's own rules (`wordMatch`, `gradeListenType`). So nothing the grade accepts is marked wrong: *do not* for *don't*
(and *don't* for *do not*), *cannot* for *can't*, *21* for *vingt et un* or *eenentwintig* (and the other way round),
*100* for *a hundred*, *stomach ache* or *stomachache* for *stomach-ache*, *well-made* for *well made*, *color* for *colour*,
*learned* for *learnt*. A sentence with `acceptAlso` spellings is marked against the one the answer is closest to (*There
is a fly …* is shown, not *There's …*).

English variants come before the one-letter-slip rule: in dictation a valid variant spelling (*realize,
favorite, color, canceled*) is plainly right, as in typed fill-ins; a real slip in the same sentence still gets the note.

## 4. Per language, in one place

- **English** (`track === 'en'`): contractions, `-t`/`-ed` pasts, `-ize` stems, US spellings, single `-l-`, digits 0–100 and
  hundreds in dictation. No accent rule (English has none). The US-English recognizer of the audio check is unrelated.
- **French** (`fr`): missing accents (note), never an added or changed accent; `œ` = `oe`; the optional space before `? ! : ;`;
  unheard agreement endings in dictation (note); digits 0–100 incl. `vingt et un`, `une`.
- **Dutch** (`nl`): missing accents (note: *één, café, ideeën, België*); digits 0–1000 as one word (*eenentwintig,
  honderdvijf*), the article *een* never 1; a compound typed as two words that are both words of the course (*thuis gekomen*
  for *thuisgekomen*) is right with the note `spelling` (dictation and typed fill-ins, `joinCompounds`). Every unmarked
  fronted order is an `acceptAlso` (`docs/developer/content.md`, *Dutch generator rules*); a Dutch dictation accepts only what
  was said (no reordered alternatives). Build tiles carry no punctuation or sentence-start capital, as in every course.

## 5. What is not accepted

| Typed | Expected | Why it is wrong | Learner |
|---|---|---|---|
| `girafe` (typed fill-in) | `giraffe` | typed fill-ins have no typo tolerance (dictation has) | — |
| `It is red.` | `It's red.` | `'s` is never expanded (needs an `acceptAlso`) | — |

Answers that differ only by spacing (`Oui,ça va bien`, `tu as un frere,oui`, `0,1,2,3`, `j ' ai huit ans`) are right, and so
is `Ik ben net thuis gekomen` (with a spelling tip: a Dutch compound typed as two course words) — `server/test/grading-spacing.test.js`.

Capital letters and the final full stop are **never** the reason an answer is wrong.

## 6. Rules that are decided when the content is generated (not in the grader)

- `acceptAlso` (unit YAML → pack): other orders of the same tiles in builds (every track; Dutch: every unmarked fronted
  order), other spellings in dictations (*It's / It is*). B1 and Dutch dictations drop the reordered alternatives
  (`LEVEL_RULES.B1.orderAlternatives`): a dictation is graded against what was said.
- Homophones (`content/src/<track>/homophones.yaml`): a word that sounds like another word of the course is never a
  one-word dictation.
- Twins and `noBlank`: a word with a same-meaning twin is never a typed fill-in (so the grader never has to accept a synonym).

## 7. Why the admin can see the rules but not switch or add them

- **(a) A page that lists the rules** (Admin → *What counts as correct*, section 8): the rules are fixed code; the page shows
  them with their examples in both interface languages, so the admin can answer "why was this wrong?" alone.
- **(b) Switching rules per language at runtime** (stored in an `app_settings` row, read per request, no rebuild): feasible
  for the rules that are already separate steps — accents note, one-letter slips in dictation, unheard French endings,
  digits, English contractions/variants, hyphen as space. Each becomes a flag passed in `grade(…, { rules })`. Risks: (1) the
  same answer is graded differently before and after a switch, so first-try scores, XP, "My mistakes" and the progress report
  mix two standards (stored attempts keep their old `correct`); (2) every switch combination is a grading path the tests must
  cover (7 flags × 3 languages); (3) switching a leniency *off* makes old content wrong where the generator relied on it
  (e.g. digits in number sentences, `acceptAlso` lists written without the contraction forms). **Not built**: a missing
  leniency is better fixed once in code, with tests.
- **(c) Admins adding their own rules** (e.g. "treat X as Y" or a regular expression): risky. A free regular expression is a
  denial-of-service and over-acceptance risk (one backtracking pattern can take seconds per request); a rule is global,
  so one bad entry makes every exercise of a language accept wrong answers silently; and the rule escapes the review that
  content goes through. The safe form already exists: **Admin → Corrections** edits an item's `acceptAlso` (reviewed by the
  content job: generate, trace, lock, tests, commit, undo). **Not built**; if wanted one day, only a closed list of
  word-pair equivalences per language (*thuis gekomen = thuisgekomen*), applied after normalisation, unit-tested on the packs.

So: (a) exists; missing leniencies are fixed in the grader; Corrections → `acceptAlso` handles one-off cases.

## 8. The rules page (Admin → *What counts as correct* / *Wat telt als goed*)

The page shows the rules below, one line each with one example, in the interface language (English or Dutch), filtered by
course language and searchable. **This section is its only source**: `npm run docs:rules` compiles it into
`client/src/data/grading-rules.json` (committed), and `server/test/rules-page.test.js` fails when the JSON is out of date or
when an example does not grade as its `result` says (it runs every example through `grade()` with the course's real words).
Format: a `###` line `id | English title | Dutch title` per section, then a table. `lang`: the course languages the rule is
about (`all`, or some of `en fr nl`); `kind`: how the example is graded (`typed` fill-in, `dictation`, `build` tiles, `pairs`
with `typed` = the number of wrong taps); `result`: `right`, `accents`, `spelling` (right, with that tip) or `wrong`.

### capitals | Capitals and punctuation | Hoofdletters en leestekens

| id | lang | track | en | nl | kind | expected | typed | result |
|---|---|---|---|---|---|---|---|---|
| case | all | en | Capital letters never matter. | Hoofdletters tellen nooit mee. | typed | The horse is big. | the horse is big | right |
| final | all | en | A full stop, question mark or exclamation mark at the end never matters. | Een punt, vraagteken of uitroepteken op het einde telt nooit mee. | typed | Clap your hands! | Clap your hands | right |
| inside | all | fr | In a dictation, commas and other marks inside the sentence don't matter. | Bij een dictee tellen komma's en andere tekens in de zin niet mee. | dictation | Au revoir, Rose ! | au revoir rose | right |
| frspace | fr | fr | The space before ? ! : ; may be left out. | De spatie voor ? ! : ; mag je weglaten. | typed | Quel est ton nom ? | Quel est ton nom? | right |
| tiles | all | en | Word tiles have no capitals or marks: only the order of the words counts. | Woordtegels hebben geen hoofdletters of leestekens: alleen de volgorde van de woorden telt. | build | My bed is big. | my bed is big | right |

### spaces | Spaces, apostrophes and hyphens | Spaties, apostrofs en koppeltekens

| id | lang | track | en | nl | kind | expected | typed | result |
|---|---|---|---|---|---|---|---|---|
| extra | all | en | Extra spaces never matter. | Extra spaties tellen nooit mee. | typed | Look at the donkey! | LOOK at the   donkey | right |
| comma | all | fr | A comma, ; or : counts as a space between words. | Een komma, ; of : telt als een spatie tussen woorden. | dictation | Oui, ça va bien. | Oui,ça va bien | right |
| apostrophe | all | fr | Spaces around an apostrophe don't matter. | Spaties rond een apostrof tellen niet mee. | dictation | J'ai huit ans. | j ' ai huit ans | right |
| curly | all | fr | Every kind of apostrophe counts as '. | Elke soort apostrof telt als '. | typed | J'ai huit ans. | J’ai huit ans | right |
| hyphen | all | en | A hyphen may be typed as a space or left out. | Een koppelteken mag je als spatie typen of weglaten. | typed | ice-cream | ice cream | right |
| hyphen2 | all | en | A space may be typed as a hyphen. | Een spatie mag je als koppelteken typen. | typed | well made | well-made | right |

### accents | Accents | Accenten

| id | lang | track | en | nl | kind | expected | typed | result |
|---|---|---|---|---|---|---|---|---|
| missing | fr nl | fr | A missing accent is almost right: it counts, with a tip. | Een ontbrekend accent is bijna goed: het telt, met een tip. | typed | café | cafe | accents |
| missing-nl | nl | nl | Dutch too: één, ideeën, België without their accents count, with a tip. | Ook in het Nederlands: één, ideeën, België zonder accenten tellen, met een tip. | typed | één | een | accents |
| changed | fr nl | fr | An accent that was added or changed makes another word: not right. | Een accent dat erbij kwam of veranderde, maakt een ander woord: niet goed. | typed | ou | où | wrong |
| ligature | fr | fr | œ may be typed as oe. | œ mag je typen als oe. | typed | Ma sœur | Ma soeur | right |

### spelling | Small spelling slips | Kleine tikfouten

| id | lang | track | en | nl | kind | expected | typed | result |
|---|---|---|---|---|---|---|---|---|
| slip | all | en | In a dictation, one wrong letter in a word of 5 or more letters counts, with a tip. | Bij een dictee telt één verkeerde letter in een woord van 5 letters of meer, met een tip. | dictation | The horse is big. | The hors is big | spelling |
| short | all | en | Words of 4 letters or fewer must be exactly right. | Woorden van 4 letters of minder moeten precies kloppen. | dictation | The cat is big. | The kat is big | wrong |
| other | all | en | Not when the typed word is another word of the course: then another word was heard. | Niet als het getypte woord een ander woord uit de cursus is: dan werd een ander woord gehoord. | dictation | I have three cats. | I have tree cats | wrong |
| fill | all | en | A typed fill-in must be spelled right: no slips there. | Een getypt invulwoord moet juist gespeld zijn: daar geen tikfouten. | typed | giraffe | girafe | wrong |

### numbers | Numbers | Getallen

| id | lang | track | en | nl | kind | expected | typed | result |
|---|---|---|---|---|---|---|---|---|
| digits-fr | fr | fr | In a dictation, a number may be typed in digits. | Bij een dictee mag je een getal in cijfers typen. | dictation | J'ai vingt et un ans. | J'ai 21 ans | right |
| digits-en | en | en | English: number words up to a hundred, and hundreds, as digits. | Engels: getallen tot honderd, en honderdtallen, in cijfers. | dictation | I have a hundred books. | I have 100 books | right |
| digits-nl | nl | nl | Dutch: numbers up to a thousand, written as one word, as digits. | Nederlands: getallen tot duizend, als één woord geschreven, in cijfers. | dictation | Ik ben eenentwintig. | Ik ben 21 | right |
| article | nl | nl | The Dutch article een is never the number 1. | Het lidwoord een is nooit het getal 1. | dictation | Ik heb een kat. | Ik heb 1 kat | wrong |

### english | English spellings | Engelse spelling

| id | lang | track | en | nl | kind | expected | typed | result |
|---|---|---|---|---|---|---|---|---|
| contraction | en | en | A short form may be written out: haven't = have not, can't = cannot. | Een korte vorm mag voluit: haven't = have not, can't = cannot. | dictation | I haven't got a dog. | I have not got a dog | right |
| us | en | en | American spellings are right too: color, favorite, center, theater. | Amerikaanse spelling is ook goed: color, favorite, center, theater. | dictation | My favourite colour is red. | My favorite color is red | right |
| past | en | en | Both learnt and learned, spelt and spelled are right. | Zowel learnt als learned, spelt als spelled is goed. | typed | I learnt it. | I learned it | right |
| ize | en | en | -ize and -ise are both right where both exist: realise, realize. | -ize en -ise zijn allebei goed waar beide bestaan: realise, realize. | typed | I realise it. | I realize it | right |
| single-l | en | en | One l or two: canceled, cancelled; traveling, travelling. | Eén l of twee: canceled, cancelled; traveling, travelling. | typed | The train was cancelled. | The train was canceled | right |
| apostrophe-s | en | en | 's is not written out: it can mean is, has or belong to. | 's wordt niet voluit geschreven: het kan is, has of van iemand betekenen. | typed | It's red. | It is red | wrong |

### french | French | Frans

| id | lang | track | en | nl | kind | expected | typed | result |
|---|---|---|---|---|---|---|---|---|
| agreement | fr | fr | In a dictation, an ending you cannot hear (allé, allée) counts, with a tip. | Bij een dictee telt een uitgang die je niet hoort (allé, allée), met een tip. | dictation | Elle est allée au parc. | Elle est allé au parc | spelling |

### dutch | Dutch | Nederlands

| id | lang | track | en | nl | kind | expected | typed | result |
|---|---|---|---|---|---|---|---|---|
| compound | nl | nl | A compound typed as two words of the course counts, with a spelling tip: it is written as one word. | Een samengesteld woord in twee woorden uit de cursus telt, met een spellingtip: je schrijft het aan elkaar. | dictation | Ik ben net thuisgekomen. | Ik ben net thuis gekomen | spelling |
| heard-order | nl | nl | A dictation accepts the words in the order you heard them. | Een dictee aanvaardt de woorden in de volgorde waarin je ze hoorde. | dictation | Morgen ga ik naar school. | Ik ga morgen naar school | wrong |

### order | Word order and matching | Woordvolgorde en paren

| id | lang | track | en | nl | kind | expected | typed | result |
|---|---|---|---|---|---|---|---|---|
| order | all | en | Word tiles in another order are not right, unless the lesson allows that order. | Woordtegels in een andere volgorde zijn niet goed, tenzij de les die volgorde toelaat. | build | My bed is big. | is my bed big | wrong |
| pairs | all | en | Matching pairs: right only without a wrong tap. | Paren zoeken: alleen goed zonder een verkeerde tik. | pairs | 0 | 1 | wrong |

### not | What is not accepted | Wat niet goed is

| id | lang | track | en | nl | kind | expected | typed | result |
|---|---|---|---|---|---|---|---|---|
| synonym | all | en | Another word with the same meaning, unless the lesson lists it. | Een ander woord met dezelfde betekenis, tenzij de les het vermeldt. | typed | big | large | wrong |
| missing-word | all | en | A dictation needs every word you heard. | Een dictee heeft elk woord nodig dat je hoorde. | dictation | I have a dog. | I have dog | wrong |
