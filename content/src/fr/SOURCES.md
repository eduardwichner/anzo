# French course — reference sources

The French course (Dutch-speaking learners: DELF Prim A1.1, A1, A2, then B1 and B2) is grounded in the files in
`content/reference/french/`. They are gitignored (© France Éducation international); their extracted text is in
`content/reference/extracted/french/` (gitignored, `pdftotext -layout`). The DELF Prim papers (A1.1–A2) are described in
`docs/developer/content.md` (*Reference files*) and `content/src/fr/WORDLIST.md`. Every B1 and B2 file was read for this inventory.
"Text layer" counts pages with more than 40 non-space characters. **DELF publishes no word list at any level**: B1 and B2
extend the derived list (`WORDLIST.md`) with lemmas attested in these papers, topic completions and parity with the English
plan.

## B1 (`french/b1/`, DELF B1 junior / scolaire — the version for school students)

| File | What it is | Text layer | Used for | Why |
|---|---|---|---|---|
| `delf-sj-b1-exemple1-coll-candidat.pdf`, `delf-sj-b1-exemple2-coll-candidat.pdf` | Sample papers 1 and 2, collective tests, candidate booklet: listening (3 recordings: conversations between friends at school, a radio programme), reading (choosing between four documents against criteria — clubs, activities; an article with multiple-choice and true/false questions), writing (a letter, email or forum article giving an opinion) | 13/13, 12/12 | **word list (attested, B1)**, **text types & tasks** | The child-facing B1 texts and questions: their lemmas are the `attested` B1 part of the French list; their documents are the models for the French B1 texts (all texts are original) |
| `delf-sj-b1-exemple1-coll-surveillant.pdf`, `delf-sj-b1-exemple2-coll-surveillant.pdf` | Transcriptions of the listening recordings | 2/2, 2/2 | **word list (attested, B1)** | What the candidate hears: dialogues between teenagers, a radio item — B1 spoken French for this age group |
| `delf-sj-b1-exemple1-coll-correcteur.pdf`, `delf-sj-b1-exemple2-coll-correcteur.pdf` | Answer keys and marking scales | 2/2, 2/2 | tasks (not attested) | The keys repeat the options of the candidate booklets, which are attested from there; the scales are examiner text |
| `delf-sj-b1-indiv-candidat.pdf`, `delf-sj-b1-indiv-examinateur.pdf` | Individual oral test: directed interview, interaction (role play: an unusual everyday situation to solve), point of view on a short document; the examiner's procedure and subjects | 2/2, 4/4 | **word list (attested: the subjects and the examiner's questions to the candidate)**, topics | The oral subjects name the B1 themes (school life, friends, leisure, the environment, media, family rules) |
| `delf-b1-junior-scolaire-ceexercice-1-con.pdf` … `-3-con.pdf`, `-coexercice-1-con.pdf` … `-3-con.pdf`, `-peexercice-con.pdf`, `scolaire-b1-poexercice-con.pdf` | One "conseils" sheet per exercise (reading 1–3, listening 1–3, writing, speaking): how the exercise works, written to the candidate ("Je coche la bonne réponse…") with a screenshot of the task | 4/4, 3/3, 2/2, 1/1, 1/1, 2/2, 2/2, 1/1 | **text types & tasks** (not attested: exam instructions) | The task types of each exercise (criteria grid, multiple choice, true/false with justification, short written answers, opinion texts, role play): the reference for the engine; their words are how the exam talks to the candidate, so they are not attested vocabulary |

## B2 (`french/b2/`)

| File | What it is | Text layer | Used for | Why |
|---|---|---|---|---|
| `delf-sj-b2-exemple1-coll-candidat.pdf`, `delf-sj-b2-exemple2-coll-candidat.pdf` | B2 sample papers, collective tests: listening (a 5-minute recording heard twice, short recordings heard once), reading (newspaper articles, opinions for and against animals in zoos), writing (an argued text of 250 words: formal letter, forum essay, article) | 14/14, 13/13 | **B2** (attested words, text types, tasks) | The B2 texts for school students |
| `delf-sj-b2-exemple1-coll-surveillant.pdf`, `…exemple2-coll-surveillant.pdf` | Listening transcriptions | 4/4, 3/3 | **B2** (attested words) | Longer spoken texts (interviews, reports) |
| `delf-sj-b2-exemple1-coll-correcteur.pdf`, `…exemple2-coll-correcteur.pdf` | Answer keys | 2/2, 2/2 | **B2** | — |
| `delf-sj-b2-indiv-candidat.pdf`, `delf-sj-b2-indiv-examinateur.pdf` | Individual oral: a monologue defending a point of view from a short document, then a debate with the examiner | 2/2, 2/2 | **B2** (topics, tasks) | — |
| `delf-b2-junior-scolaire-ceexercice-1-con.pdf` … `-3-con.pdf`, `-coexercice-1-con.pdf` … `-3-con.pdf`, `-peexercice-con.pdf`, `scolaire-b2-poexercice-con.pdf` | "Conseils" sheets per exercise | 3/3, 3/3, 2/2, 2/2, 2/2, 1/1, 1/3 (pp. 2–3 images), 1/1 | **B2** (task types) | Task types: true/false **with a justification copied from the text**, reformulating "in your own words", argued writing with connectors |
| `manuel-candidat-delf-b2.pdf` | DELF B2 candidate manual (July 2026): who takes the exam, the versions (tout public, scolaire, junior), the question types (multiple choice, short answers, rephrasing, true/false with justification), the two listening formats in circulation, the writing and oral tasks, rights and duties | 22/22 | **B2** (task types) | The only document that lists every question type of the B2 exam; it confirms that both listening formats are current |

## Not used

None: every French file is used. The "conseils" sheets are small and are the clearest statement
of each task type.
