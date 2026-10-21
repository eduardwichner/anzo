# English course — reference sources

The English course (Dutch-speaking learners: Cambridge YLE Starters, Movers, Flyers, then B1 and B2) is grounded in
the files in `content/reference/english/`. They are gitignored (© Cambridge University Press & Assessment); their extracted
text is in `content/reference/extracted/english/` (gitignored, `pdftotext -layout`; the B1 vocabulary list also as
`…columns.txt`, rebuilt column by column from `pdftotext -bbox`). Every B1 and B2 file was read for this inventory. "Text layer" counts pages with more than 40 non-space characters.

The YLE files (`149681-yle-flyers-word-list.pdf`, `153612-yle-handbook-for-teachers.pdf`) are described in
`docs/developer/content.md` (*Reference files*) and `content/src/en/PLAN.md`.

## B1 (`english/b1/`)

| File | What it is | Text layer | Used for | Why |
|---|---|---|---|---|
| `506887-b1-preliminary-vocabulary-list.pdf` | **B1 Preliminary and Preliminary for Schools Vocabulary List**, August 2025 edition (additions of 2025 in green): an alphabetical list of ~3,100 headwords with part of speech and example phrases that restrict a meaning (pp. 4–40), Appendix 1 word sets (numbers, days, months, seasons, countries/nationalities/languages, continents), Appendix 2 topic lists (23 topics, pp. 42–53) | 53/53 | **word list** (the closed list for English B1) | Cambridge's own B1 list, the counterpart of the YLE list: parsed by `scripts/content/wordlist-en-b1.js` into level `B1` of `wordlist-en.json` (headword forms, part of speech, examples, topics) |
| `168143-cambridge-english-preliminary-for-schools-teachers-handbook.pdf` | **B1 Preliminary for Schools Handbook for teachers** (© 2024, for the revised 2020 exam): exam overview, task tables per paper, advice by task, a sample paper with keys, writing assessment, **language specifications** (functions, grammatical areas, topics) | 76/78 (pp. 1, 78 covers) | **syllabus & topics**, **grammar per level**, **text types & tasks** | The current exam format, written for school students (11+): its grammar inventory is the B1 grammar of `PLAN.md`; its topic list and the vocabulary list's topic appendix give the units; its text types (notices, messages, emails, magazine articles, stories, websites) give the texts |
| `168150-b1-preliminary-teachers-handbook.pdf` | B1 Preliminary (general) Handbook for teachers (© 2024, revised 2020 exam) | 74/78 | not used | Same exam format, the same language specifications and the same topic list as the for Schools handbook; it differs only in its adult sample tasks, which the adult sample papers below already show |
| `565480-b1-preliminary-schools-2020-sample-tests/` (7 files: Reading QP 2022 + answers, Listening QP 2022 + script + key, Writing QP 2022, Speaking 2020) | B1 Preliminary **for Schools** sample tests | Reading 11/12, Listening QP 7/8, script 11/11, keys 2/2 + 2/2, Writing 3/4, Speaking 6/9 (pictures) | **text types & tasks** (models) | Notices about campsites, school trips and sports day; matching young people to cycling courses; a teenager's article about tennis; a gapped text by a 13-year-old about planting trees; a cloze about a car that runs on chocolate; dialogues about homework, a concert, a book; an email to a teacher about an end-of-year party; a story starting "Jo looked at the map…" — the models for the English B1 texts (all texts are original) |
| `504344-b1-preliminary-sample-papers/` (7 files: Reading QP + key, Listening QP + tape script + key, Writing QP, Speaking QP, 2022) | B1 Preliminary (general) sample papers | Reading 11/12, Listening QP 7/8, script 9/9, keys 2/2 + 2/2, Writing 3/4, Speaking 6/9 | **text types & tasks** (secondary models for the adult end of the audience) | The same task types with adult situations (a lecturer who becomes a marine educator, a flatmate, a new clothes shop, an art competition, a visit to a friend): useful because the B1 course is for learners from about 11 to adult; it adds no task type the Schools set lacks |

**Handbook decision:** the **for Schools** handbook is the reference (current exam, written for school students; the two
handbooks have identical language specifications and topic lists). The general handbook adds nothing and can be deleted.
The general sample papers are kept as models for adult situations (small; the course audience reaches adults).

## B2 (`english/b2/`)

| File | What it is | Text layer | Used for | Why |
|---|---|---|---|---|
| `167792-b2-first-for-schools-handbook.pdf` | **B2 First for Schools Handbook for teachers** (© 2026): Reading and Use of English (7 parts: multiple-choice cloze, open cloze, **word formation**, **key word transformation**, multiple choice, **gapped text**, **multiple matching**), Writing (essay + article/email/review/story, 140–190 words), Listening (4 parts: short extracts, sentence completion, multiple matching, interview), Speaking (4 parts), assessment scales, a sample paper | 87/89 | **B2** (syllabus, task types, text types) | The current B2 exam for school students. It has **no vocabulary list and no language specification**: it says only that the lower levels' specifications (A2 Key, B1 Preliminary) apply in their simplest exponents and assesses *range* (words, fixed phrases, collocations) on its scales. English B2 therefore needs a **derived list** (like French): the B1 list as the base, the words the B2 sample paper attests, and topic completions with a justification each |
| `first-for-schools-sample-paper-1/` — RUE 2022, Listening 2022, Writing 2022, answer keys, speaking | B2 First for Schools sample paper 1 | RUE 13/16, Listening 7/8, Writing 3/3, keys 8/8, Speaking 6/6 | **B2** (task types, attested words, text models) | Every task type of the exam with texts (*Ballet dancer by chance*, *Camels*, *Playing chess*, *Young inventor*, *Teenage summer camps*) and its key |
| `first-for-schools-sample-paper-1/Test & Train information for students.pdf`, `… for teachers.pdf` | One-page adverts for the "Test & Train" online practice product | 1/1, 1/1 | not used | Marketing only: no exam content, no vocabulary |

**Sample paper 2 is not used:** paper 1 shows every task type of the exam, with its key, so the engine does not need it;
the attested part of the derived B2 list comes from one paper (about 2,500 running words of reading and listening), and the
topic completions make up the rest. Paper 2 would add attestations, but it is not required.

## Not used

```
content/reference/english/b1/168150-b1-preliminary-teachers-handbook.pdf
content/reference/english/b2/first-for-schools-sample-paper-1/Test & Train information for students.pdf
content/reference/english/b2/first-for-schools-sample-paper-1/Test & Train information for teachers.pdf
```
