# Dutch word list (derived: NT2Lex + attestations + Flemish syllabus)

The Dutch course (Start, A1, A2, B1, B2; English meanings; the standard Dutch of Flanders) is traced against a derived word list,
`content/reference/extracted/wordlist-nl.json`. It is gitignored like the references it comes from (NT2Lex is licensed
CC BY-NC-SA 4.0; the exam papers and *Naar Nederland* are copyrighted); this file records the method and the counts.
Rebuild it with `npm run content:wordlist -- nl` (it also rewrites the counts below). Sources: `content/src/nl/SOURCES.md`.

## Method

1. **Inventory by unit.** `content/src/nl/wordlist-sources.yaml` lists the lemmas of each planned unit (one group per
   unit of `content/src/nl/PLAN.md`), with its level, its theme and a written reason: the Richtgraad 1 domain, role or task
   it serves and what the references show. Nouns carry their article and plural (`de kat/katten`), separable verbs their
   particle (`op|staan`), reflexive verbs `zich`. Sizes follow the guardrails: about 300 lemmas at Start, 450 new at A1 and
   500 new at A2.
2. **NT2Lex level (the base).** Each lemma is looked up in NT2Lex (`NT2Lex-CGN-v01.tsv`: one row per lemma and part of
   speech; the sense-split `CGN+ODWN` file would divide a lemma's counts over its senses). **Rule: a lemma's NT2Lex level is
   the first CEFR level at which it is observed (raw frequency F > 0)** — the rule NT2Lex's own complexity analyser uses
   ("the tool selects the first level in which the lexical unit is observed"). NT2Lex has no Start level: Start and A1 both
   read NT2Lex A1 (Start takes the most basic A1 lemmas, by topic); A2 and B1 read their own NT2Lex level. Where NT2Lex's lemmatiser files a word under another
   lemma (*vorige → vorig, tweede → twee, meer → veel, broodje → brood*), that lemma is used and recorded (`via`).
3. **Attestations.** Every form of every lemma (`scripts/content/dutch.js`: plurals, diminutives, conjugation, participles,
   adjective -e, comparatives, joined separable verbs) is looked up in the extracted references: *Naar Nederland* (the
   werkboek and the handleiding's Dutch–English word list: Start/A1) and CNaVT *Maatschappelijk Informeel* (parts A, B, C,
   the answer keys and the examiner's questions: A2; CNaVT *Maatschappelijk Formeel* and the Staatsexamen NT2 Programma I 2025
   booklets: B1; the Staatsexamen NT2 Programma II 2025 booklets, the CNaVT PROF and STRT papers, their assessment models and
   the examiner's instructions, `content/reference/dutch/b2/`: B2). Up to three `file:line` references are kept, with the forms seen.
4. **Source of each entry.**
   - `nt2lex`: NT2Lex observes the lemma at the entry's level (or lower: see *moved*).
   - `attested`: NT2Lex places it higher (or lacks it), but a reference attests it at or below the entry's level (NT2Lex's
     A1 corpus is small — about 13,000 tokens against 158,000 at A2 — so many everyday words such as *soep, vis, nacht,
     apotheek* first appear at A2 there while *Naar Nederland* teaches them at A1).
   - `topic`: neither; the group's written reason applies. These are mostly the **Belgian standard forms** that the
     Netherlands-leaning textbooks lack (*gsm, zetel, voormiddag, frietjes, boekentas, brooddoos, speelplaats, rondpunt,
     voetpad, kasticket, bankkaart, proficiat, immokantoor, zoekertje, solden*) and the words of Flemish everyday tasks
     the papers show only in pictures (*keelpijn, kruispunt, paskamer, huisvuilophaling, containerpark*).
   - **moved**: a lemma placed *higher* than its NT2Lex level carries the group's `moved` reason (at A2 and B1; at A2
     NT2Lex A1 words taught with an A2 task or with A2 grammar — feelings with the reflexive verbs, *omdat/dat/als* with
     subordinate clauses, *dan* with comparatives; at B1 the core words of B1 text types and tasks — job adverts, procedures,
     complaints, opinions — that the A2 units did not need, such as *ander, volgen, eigen, tijdens, genoeg, informatie*).
   - **B1 size**: 672 new lemmas (guardrail 600–800), one group per unit of `content/src/nl/PLAN.md` (`c01`–`c20`).
   - **B2 size**: 815 new lemmas (guardrail 700–900), one group per unit of the core (`d01`–`d20`) and `d00-algemeen` for the
     general words the B2 texts need throughout (*overheid, rol, eeuw, gebrek, belang, basis, soort, moment*), each taught in
     one unit. Most are moved up (575): NT2Lex observes them at A1–B1, but the lower units had no task that needed them — the
     words for judging news, weighing a policy, following a debate or reading research (Richtgraad 3). Words a lower level
     already uses stay at that level (*voorbij, nepnieuws, aankoop, grootouder, klantendienst, toestaan* were taken out of the
     B2 groups for that reason; *nepnieuws* and *aankoop* are still B2 vocabulary items, traced as compounds of
     lower-level words). Rare, specialist or text-specific words are glossed in the text that uses them instead.
5. **Belgian variant.** Where Belgian and Netherlands standard usage differ for an everyday word, the Belgian form is the
   lemma and `alsoNL` records the Netherlands form (*gsm → mobiel, frietjes → patat, voormiddag → ochtend, zetel → bank,
   kleed → jurk, job → baan*); the app shows it as a note after the answer. *je/jij* throughout (never *ge/gij*); spelling
   follows the Groene Boekje.
6. **Regional: nl.** (*pincode, uitkering, inburgering* are not on it: they are Belgian standard too.) Netherlands-only words and realia met in the references (*OV-chipkaart, Randstad, DigiD, pinnen,
   patat, consultatiebureau, Koningsdag, groep zeven*) are listed under `regional` and never taught as core vocabulary;
   `content:trace -- nl` rejects them in content.

Entries: `{ key, lemma, pos, level, group, theme, source, article?, plural?, separable?, reflexive?, nt2lex?: { level, F, via? },
refs?, attestedAt?, forms?, moved?, alsoNL? }` (`key` tells apart lemmas spelled alike: `dag~exclamation`, `dag~noun`).

## Counts (new lemmas per level)

<!-- counts:start -->
| Level | nt2lex | attested | topic | of which moved up | alsoNL | total (new at this level) |
|---|---|---|---|---|---|---|
| Start | 262 | 41 | 14 | 0 | 7 | 317 |
| A1 | 225 | 156 | 68 | 0 | 17 | 449 |
| A2 | 392 | 48 | 100 | 96 | 11 | 540 |
| B1 | 553 | 31 | 88 | 367 | 27 | 672 |
| B2 | 816 | 70 | 193 | 690 | 25 | 1079 |
| all | 2248 | 346 | 463 | 1153 | 87 | 3057 |

Names: 93. Regional (Netherlands-only, never core): 26.
<!-- counts:end -->

## Checks

`npm run content:trace -- nl` checks every Dutch unit source against the list (rules in `scripts/content/trace-nl-lib.js`):
vocabulary is a lemma at or below the pack's level (nouns with their article); sentence words are forms the level's grammar
allows; `--coverage` requires every lemma of a level to be taught in a unit at or above it, or omitted with a reason.
