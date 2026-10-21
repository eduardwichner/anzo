# French word list (derived from DELF Prim, DELF B1 junior and DELF B2 junior)

DELF Prim publishes no closed word list (Cambridge does, for English). Anzo derives one, with provenance for every
entry, so French content can be traced and reviewed the way English is. The list itself,
`content/reference/extracted/wordlist-fr.json`, is gitignored like the papers it is derived from; this file records the
method and the counts. Rebuild it with `npm run content:wordlist -- fr` (it also rewrites the counts below).

## Method

1. **Child-facing text.** The nine extracted DELF Prim sample papers (`content/reference/extracted/delf-prim-*.txt`:
   candidate booklet, examiner booklet and recording transcript for A1.1, A1 and A2) are split line by line into what
   the child reads or hears (messages, dialogues, questions, tasks, the examiner's questions to the child, the oral
   subjects) and what is about the exam (cover pages, score tables, exam summaries, level descriptors, instructions to
   the examiner, the recording's stage directions). Only child-facing text is attested; words found only in
   examiner-facing text are listed separately in the JSON (`examinerOnly`) and are not in the list.
2. **Tokens and lemmas.** `scripts/content/french.js` tokenizes (elisions `l' j' m' t' d' n' qu' s' c'` split off,
   contractions `au aux du des` resolved to `à/de + le`, hyphenated words kept when they are a lemma — *grand-mère*,
   *week-end* — and split otherwise — *fais-tu*, *présente-toi*). Lemmatization is forward and hand-written: for every
   lemma of the lexicon in `content/src/fr/wordlist-sources.yaml` (part of speech, gender) the module generates its
   forms — noun and adjective plurals and feminines with the irregular tables (*yeux*, *belle*, *gentille*), verb
   present, imperative and past participle (regular *-er/-ir/-re* plus 60 irregular verbs), imparfait, futur and
   conditionnel — and each token is looked up in reverse. An ambiguous form is resolved by context: after a
   determiner the noun (*la porte*), after a subject or object pronoun the verb (*il porte*). Words that are not in the
   lexicon stop the build, so every child-facing word is accounted for.
3. **Attested level.** Each lemma gets the lowest level it occurs at (A1.1 < A1 < A2), up to three `file:line` refs
   and every surface form seen with the level it was seen at (the trace allows forms such as *j'aimerais* or *il était*
   only from that level).
4. **Exclusions.** Exam-instruction words in the child-facing text are excluded (list below). Proper names of the
   papers (*Diego, Côme, Louise, Genève…*) are kept as names, plus a few added for sentences.
5. **Topic completion** (`source: topic`). The papers attest only a slice of each theme (much is in pictures). For each
   theme the papers test at a level (se présenter, famille, nombres, couleurs, corps, vêtements, nourriture, animaux,
   maison, école, loisirs, dates et heures, météo, ville et transports, métiers, repas, fête, santé, voyage,
   sentiments, achats, médias, …) the high-frequency child words needed for those tasks are added at that level, in
   groups with the theme and a one-line justification (`wordlist-sources.yaml`).
6. **Parity** (`source: parity`). Concepts the English YLE plan (`content/src/en/PLAN.md`) teaches at the matching
   level (Starters ↔ A1.1, Movers ↔ A1, Flyers ↔ A2) are added where the papers' themes do not already bring them
   (zoo animals, toys, the sky, jobs, nature and space, cooking, adventures …), so the French course covers roughly the same
   everyday world as the English one.
7. A word attested only at a higher level but needed earlier keeps the lower level of its group and records where it
   is attested (`attestedAt`, refs).

8. **B1**. Attested: the DELF B1 junior / scolaire sample papers (two collective papers: the candidate
   booklets and the listening transcriptions; the oral subjects of the examiner booklet; `content/src/fr/SOURCES.md`),
   classified line by line like the Prim papers (`classifyB1Lines`: exam instructions, score lines and layout artefacts
   are not attested). Topic groups complete the DELF B1 themes (housing, health, work, travel, the town, the environment,
   society) and parity groups add the concepts of the English B1 plan; the guardrail was 600–800 new lemmas (738).
   French morphology at B1 adds the subjonctif présent, the gérondif, compound verbs conjugated like their base
   (*soutenir*, *permettre*, *produire*) and the *-ger / -cer* imparfait (*mangions*). The B1 unit assignment is in
   `content/src/fr/PLAN.md`; 26 lemmas are omitted with a reason in `content/src/fr/b1/pack.yaml`.

9. **B2**. The DELF B2 junior / scolaire sample papers (two collective papers, candidate booklet and
   examiner booklet, and the individual oral subjects; `content/src/fr/SOURCES.md`) are classified like the B1 papers
   but are **attest-only**: a word of the papers that is not in the lexicon does not stop the build (the B2 papers use
   far more words than a course of 20 units can teach). A B2 lemma is a word of a B2 topic group in
   `wordlist-sources.yaml` (one group per unit theme: character, studies, work, money, housing, health, food, the media,
   technology, the environment, nature, travel …, each with a justification naming the paper words it covers and the
   parallel English and Dutch B2 units); `attested` counts the group words that occur in the papers, `topic` the rest.
   Every B2 lemma is taught in `fr-b2`, so the list stays a teaching list, not a frequency list. B2 morphology adds the
   compound relatives (*lequel, auquel, duquel*), the passive in every tense and the *plus-que-parfait* /
   *conditionnel passé* of the past unreal; the conjugation tables gained *concevoir* and the *è* stems of *protéger,
   révéler*.

Entries: `{ lemma, key?, level, pos, gender?, source: attested | topic | parity, refs + forms | theme + justification }`
(`key` tells apart two lemmas spelled alike: *orange* the colour, *orange~fruit*).

## Counts (new lemmas per level)

<!-- counts:start -->
| Level | attested | topic | parity | total (new at this level) |
|---|---|---|---|---|
| A1.1 | 238 | 119 | 26 | 383 |
| A1 | 88 | 236 | 33 | 357 |
| A2 | 75 | 239 | 133 | 447 |
| B1 | 567 | 68 | 114 | 749 |
| B2 | 134 | 448 | 0 | 582 |
| all | 1102 | 1110 | 306 | 2518 |

Names: 145. Excluded exam-instruction words: 77. Words found only in examiner-facing text: 402.
<!-- counts:end -->

A1.1 is above the 250–350 guideline because the A1.1 papers alone attest about 240 lemmas, roughly 80 of them grammatical
words (articles, pronouns, prepositions, *être*/*avoir* …); the topic and parity additions at A1.1 are about 140.

## Excluded exam-instruction words

How to answer the exam, not child vocabulary: *accueil, candidat, case, cocher, consigne, correspondant* (the "matching"
picture; the pen-pal noun *correspondant(e)* of the A2 letter is kept), *dialogue, document, entourer, examinateur,
exercice, identité, inscription, inscrire, instruction, justifier, ligne, note/noter, relier, remplacer, remplir, rôle,
situation, suivant, sujet*, the placeholder *XXXX*, and PDF layout artifacts (*etc*, *mp*, *uelle* from "Q uelle").

## Checks

`npm run content:trace -- fr` checks every French unit source against the list (rules in
`scripts/content/trace-fr-lib.js`): vocabulary is a lemma at or below the pack's level (nouns with their article);
sentence words are forms of such lemmas that the level's grammar allows (agreement, present, imperative; past
participles at A2), forms the papers attest at or below the level, elisions and contractions, parts of multi-word
entries, numbers in range (A1.1 ≤ 20, A1 ≤ 100) and names. `--coverage` requires every lemma of the list to be taught
in a pack at or above its level, or omitted in a `pack.yaml` with a reason.
