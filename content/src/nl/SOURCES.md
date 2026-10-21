# Dutch course — reference sources

The Dutch course (English speakers learning the standard Dutch of Flanders, levels Start, A1, A2, B1, B2) is grounded in the files in
`content/reference/dutch/{a1,a2,b1,b2}/` (where to get them: `docs/developer/content.md` → *Reference files*). They are gitignored (copyright of their publishers, NT2Lex under a
non-commercial licence); their extracted text is in `content/reference/extracted/dutch/` (gitignored, `pdftotext -layout`).
Every file was read in full for this inventory. "Text layer" counts pages with more than 40 non-space characters.

| File | What it is | Text layer | Used for | Why |
|---|---|---|---|---|
| `a1/NT2Lex-CGN-v01.tsv` | **NT2Lex** (Tack, François, Desmet, Fairon 2018; CENTAL UCLouvain / ITEC KU Leuven), CGN tagset: 15,227 entries (lemma + part of speech), raw frequency F, dispersion D, SFI, frequency per million U and tf-idf per CEFR level A1–C1, from NT2 textbook reading texts and simplified readers. Licence **CC BY-NC-SA 4.0** | n/a (TSV) | **word-list levels** (the backbone) | One row per lemma and part of speech: exactly what a lemma level needs |
| `a1/NT2Lex-CGN+ODWN-v01.tsv` | The same corpus with word senses from Open Dutch WordNet: 17,743 rows, the same 15,227 lemma+tag pairs split into senses (frequencies divided between them) | n/a (TSV) | not used | Sense-split counts understate a lemma's frequency (e.g. *huis* A1 77 = 9 + 53 + 4 + 11 over four senses); Anzo levels lemmas, not senses |
| `a2/lp_nt2_r1_waystage_2015_1.pdf` | **Leerplan NT2 Richtgraad 1 – Waystage** (Flemish adult education, CVO, approved 31 Jan 2015): the A2 modules *Waystage mondeling / schriftelijk*; domains (persoonlijk, publiek, professioneel, educatief), roles (huisvesting en gezinsadministratie, consument, cursist, vrijetijdsbesteder, opvoeder, werkende, werkzoekende, ondernemer; verkeersgebruiker, patiënt), can-do tasks with examples, register (*u / je*), pronunciation and sociocultural appendices | 67 / 67 | **syllabus & domains** (unit topics, situations, register), A2 tasks | The Flemish curriculum for exactly this audience; it names no grammar per level (the teacher chooses items by task) but uses the present, question words, modal verbs, the imperative and *omdat* clauses in its tasks |
| `b1/lp_nt2_r2_threshold_1_en_2_2015_1.pdf` | **Leerplan NT2 Richtgraad 2 – Threshold 1 en 2** (B1): same structure, B1 tasks (neighbours, doctor, school, job interview, complaints, police report, opinions) | 84 / 84 | **syllabus & domains** (B1 unit topics, roles, can-do tasks, text types) | The Flemish B1 curriculum: units follow its domains and roles (werkzoekende, werkende, beheerder huisvesting, opvoeder, consument, vrijetijdsbesteder, cursist) and its example tasks per skill (job adverts, safety instructions, a doctor's instructions, a school letter, a complaint, a debate, a life story) |
| `a2/Info_DEEL_A_set1.pdf`, `Info_Deel_A_set_2.pdf` | CNaVT *Maatschappelijk Informeel* (INFO, A2) sample exam, part A (listening + writing): task sheets and note forms; the recordings are not included | 6/6, 6/6 | **attested vocabulary** (A2), task types | Flemish exam at A2; note forms show what is heard (party, menu, travel, cycling in the rain) |
| `a2/Info_Deel_B_set_1.pdf`, `Info_Deel_B_set_2.pdf` | INFO part B (reading + writing): full texts — e-mails, a shop folder, an adventure-park website, a travel-pharmacy leaflet, a party invitation, a blog and a reading-club form | 12/12, 11/11 | **attested vocabulary** (A2), task types | Authentic A2 texts of everyday adult life in Flanders/the Netherlands (*slaatjes, luchtkasteel, openingsuren*) |
| `a2/Info_Deel_C_set_1.pdf`, `Info_Deel_C_set_2.pdf` | INFO part C (speaking): picture stories and topic cards (a day in Rotterdam, a family party, a bad day, life in ten years) | 3/3, 4/4 | **attested vocabulary** (A2), task types | Topics and situations of A2 speaking |
| `a2/INFO_Instructies_voor_examinator_set_1.pdf`, `…_set_2.pdf` | INFO examiner booklets: procedure, the examiner's lines and questions | 14/14, 14/14 | attested vocabulary (examiner's questions only) | The questions put to the candidate are A2 input; the procedure text is not learner text |
| `a2/INFO_Beoordelingsmodellen_set_1.pdf`, `…_set_2.pdf` | INFO answer keys and rating criteria (they give the content of the recordings: *kippensoep, buurthuis, bus 300, kapper, ober, dief, aangifte*) | 10/10, 11/11 | **attested vocabulary** (A2) | The only written trace of the listening texts |
| `a1/engels_handleiding-naar-nederland.pdf` | *Naar Nederland* handleiding (Netherlands Ministry of Social Affairs, 2014), Dutch + English: the civic-integration exam abroad (A1) and a **Dutch–English word list per werkboek lesson 21–65** | 27 / 28 (p. 28 = back cover) | **attested vocabulary** (Start/A1) with English glosses | The lesson word list maps each beginner word to a lesson and an English gloss |
| `a1/nn-werkboek-2015-herzien-omslag-lowres.pdf` | *Naar Nederland* werkboek (Boom, 2015): 65 lessons — 1–20 literacy (letters, sounds, first words), 21–65 dialogues with grammar boxes (present, plurals, inversion, modal verbs, perfect, separable verbs, comparatives, *omdat/als*, reflexives) | 325 / 340 (no text: pp. 2, 3, 12–18, 20–22, 24, 25, 339 — covers and photo pages) | **attested vocabulary** (Start/A1), grammar sequence, **`regional: nl`** tagging | A1 beginner course for adults; its Netherlands realia (*OV-chipkaart, Randstad, 9292ov, pinnen, patat, groep zeven, consultatiebureau, Koningsdag*) are tagged `regional: nl` and not taught as core |
| `a1/nn-fotoboek-2014-herzien-omslag-lowres.pdf` | *Naar Nederland* fotoboek: 100 photos for the civic-knowledge exam (KNS) and, on pp. 107–110, the 100 questions with their answers | 8 / 112 (pp. 1, 3, 4, 107–110, 112; the photos are images) | not used | Netherlands civic knowledge (history, the Tweede Kamer, Schiphol, the consultatiebureau) — not everyday Flemish life; its few everyday words are in the werkboek too |
| `b1/FORM_Deel_A_set_1.pdf`, `FORM_Deel_A_set_2.pdf` | CNaVT *Maatschappelijk Formeel* (FORM, B1) part A: household tips, a neighbourhood meeting, a social-media survey, the Ronde van Vlaanderen | 6/6, 8/8 | **attested vocabulary** (B1), text-type models | Household tips, a neighbourhood meeting, a survey: the B1 topics of the environment and the neighbourhood |
| `b1/FORM_Deel_B_set_1.pdf`, `FORM_Deel_B_set_2.pdf` | FORM part B: a municipal street-party folder (Bertem), a photo contest, *Dwars door Brugge*, writing activities | 9/9, 7/7 | **attested vocabulary** (B1), text-type models | A municipal folder (Bertem street parties): the model for the council notices and the call for participation (units 11, 14) — the texts are original |
| `b1/FORM_Deel_C_set_1.pdf`, `FORM_Deel_C_set_2.pdf` | FORM part C: a stolen bike (police), an online watch order, climate ideas of the municipality, a nightlife area | 6/6, 6/6 | **attested vocabulary** (B1), task models | A stolen bike reported to the police (unit 19), an online order (unit 17), the municipality's climate ideas (unit 14) |
| `b1/FORM_Instructies_voor_examinator_set_1.pdf`, `…_set_2.pdf` | FORM examiner booklets | 14/14, 14/14 | attested vocabulary (examiner's questions only, B1) | Examiner questions (B1 input) |
| `b1/FORM_Beoordelingsmodellen_set_1.pdf`, `…_set_2.pdf` | FORM answer keys and criteria | 9/9, 15/15 | **attested vocabulary** (B1) | Content of the B1 recordings |
| `b1/2025 Lezen I openbaar examen tekst- en opgavenboekje (papier).pdf` | **Staatsexamen NT2 Programma I** (Netherlands, B1), 2025 public exam, reading texts and questions: a carpenter becomes a driving instructor, crying, sales training, overtime, the neighbourhood WhatsApp, a college | 22/22 | **attested vocabulary** (B1), text-type models | B1 reading (Netherlands; `regional: nl` applies): models for the job advert, the work e-mail and the newspaper article |
| `b1/2025 Lezen I openbaar examen beoordelingsmodel (papier).pdf` | Its answer key (text types per text) | 6/6 | attested vocabulary (B1) | — |
| `b1/2025 Luisteren I openbaar examen opgavenboekje (papier).pdf` | Staatsexamen B1 listening questions: a nature-education dean, a car-free street, an appraisal interview, a museum attendant, a personal trainer, a teaching assistant (video) | 18/18 | attested vocabulary (B1) | — |
| `b1/2025 Luisteren I openbaar examen beoordelingsmodel (papier).pdf` | Its key (39 questions, pass mark 26) | 7/7 | attested vocabulary (B1) | — |
| `b1/2025 Schrijven I openbaar examen opgavenboekje (papier).pdf` | Staatsexamen B1 writing: work e-mails, a course enquiry, a broken coffee machine, a forum post, booking a meeting room | 18/18 | attested vocabulary (B1) | — |
| `b1/2025 Schrijven I openbaar examen beoordelingsmodel (papier).pdf` | Its rating model (content 27, form 20 points; pass 25) | 17/17 | attested vocabulary (B1) | — |
| `b1/2025 Spreken I openbaar examen opgavenboekje (papier).pdf` | Staatsexamen B1 speaking: 16 tasks (helping in the garden, a new timetable, a concert, lost keys, the library, parcels …) | 14/14 | attested vocabulary (B1) | — |
| `b1/2025 Spreken I openbaar examen beoordelingsmodel (papier).pdf` | Its rating model (128 points, pass 75) | 34/34 | attested vocabulary (B1) | — |

## How they are used (summary)

- **Word list** (`content/src/nl/WORDLIST.md`, built into `content/reference/extracted/wordlist-nl.json`): NT2Lex levels are the
  base, with NT2Lex's own documented rule — a lemma's level is *the first CEFR level at which it is observed* (the rule of the
  NT2Lex/CEFRLex complexity analyser). Attestations from CNaVT INFO (A2) and *Naar Nederland* (Start/A1) add file:line references
  and words NT2Lex lacks; Richtgraad 1 topics complete the domains. Belgian forms, `alsoNL` and `regional: nl` are recorded there.
- **Syllabus** (`content/src/nl/PLAN.md`): unit topics follow the Richtgraad 1 domains and roles for adults in Flanders; A2 units
  follow its can-do tasks and the CNaVT INFO situations; the grammar sequence per level is recorded in the plan.
- **B1**: Richtgraad 2 is the syllabus (domains, roles, can-do tasks, text types); NT2Lex gives the B1 levels
  (first observed at B1, or an A1–A2 word moved up with a reason); CNaVT FORM (parts A–C, the answer keys, the examiner's
  questions) and the Staatsexamen NT2 Programma I 2025 booklets are B1 attestations and models for text types and tasks. The 21
  B1 texts are original; no exam text is copied.

## B2 (`dutch/b2/`)

Read in full (`content/reference/extracted/dutch/b2/`). B2 has a **shared core** and two **optional domain
branches**: the two CNaVT B2 profiles are the *same level* (B2) in *different domains*, not B2.1 and B2.2.

| File | What it is | Text layer | Used for | Why |
|---|---|---|---|---|
| `b2/lp_nt2_r3_vantage_2015_1.pdf` | **Leerplan NT2 Richtgraad 3 – Vantage** (B2, Flemish adult education, 2015): the modules *Vantage mondeling / schriftelijk*; at Vantage the domains are free (personal, public, professional, educational), roles, can-do goals per skill, text characteristics (longer, more abstract texts, argumentative and informative), strategies, two worked example tasks | 70/70 | **B2 core: syllabus & domains** | The Flemish B2 curriculum for adults: the core's units follow its goals and text types; it explicitly allows a professional or educational focus, which is what the two branches are |
| `b2/2025 Lezen II openbaar examen tekst- en opgavenboekje (papier).pdf` + `… beoordelingsmodel` | **Staatsexamen NT2 Programma II** (Netherlands, B2) 2025 reading: 6 texts (an appraisal interview article, …), 36 multiple-choice questions; the last text is read selectively (search first, then read) | 20/20, 6/6 | **B2 core**: attested words (with `regional: nl`), text types, the selective-reading task | B2 reading of the public and professional domain |
| `b2/2025 Luisteren II …opgavenboekje` + `beoordelingsmodel` | Staatsexamen II listening: conversations, interviews, a video fragment, one question per fragment | 17/17, 7/7 | **B2 core**: attested words, longer audio | — |
| `b2/2025 Schrijven II …opgavenboekje` + `beoordelingsmodel` | Staatsexamen II writing: tips for a magazine, a message as an ICT company owner, a 50–100-word email, a research report, a reaction on a discussion website (English-taught university courses) | 18/18, 16/16 | **B2 core**: text types (argued reaction, report) | — |
| `b2/2025 Spreken II …opgavenboekje` + `beoordelingsmodel` | Staatsexamen II speaking tasks and rating model | 13/13, 32/32 | **B2 core**: topics | — |
| `b2/Prof_Deel_A_set_1.pdf`, `…set_2` | CNaVT **Zakelijk Professioneel (PROF, B2)** part A, listening + writing: *Bewegen op het werk*, *Thuiswerken*, *Diversiteit op de werkvloer*, *Federatie Vrije Beroepen* (an email to a head of department arguing a point from an interview) | 7/7, 7/7 | **branch "B2 at work"**: attested words, tasks | Dutch for the workplace (administrative, service and care jobs) |
| `b2/Prof_Deel_B_set_1.pdf`, `…set_2` | PROF part B, reading + writing: *Opleiding* (asking the HR director for a training course), *Reiskosten*, *Apps voor de zorg*, *Foute levering* | 8/8, 11/11 | **branch "B2 at work"** | Work emails, a complaint about a wrong delivery, care apps |
| `b2/Prof_Deel_C_set_1.pdf`, `…set_2` | PROF part C, speaking: *Uitvindingen voor senioren* (a residential care centre), *Stagiair(e) gezocht*, *Een motiverende werkplek*, *Zelfsturende teams* | 4/4, 4/4 | **branch "B2 at work"** | Meetings with colleagues: comparing options, defending a choice |
| `b2/PROF_Instructies_voor_examinator_set_1.pdf`, `…set_2`; `PROF_Beoordelingsmodellen_set_1.pdf`, `…set_2` | PROF examiner booklets (the colleague's questions) and rating models (the content of the recordings) | 14/14, 14/14; 11/11, 13/13 | **branch "B2 at work"**: attested words | The only written trace of the PROF recordings |
| `b2/STRT_Deel_A_set_1.pdf`, `…set_2` | CNaVT **Educatief Startbekwaam (STRT, B2)** part A, listening + writing: *Medicijnresten in het grondwater* (an argued text for a guest lecture), *Liegen*, *Bedtijd*, *Taalverandering* | 7/7, 7/7 | **branch "B2 for study"**: attested words, tasks | Dutch for starting higher education: lectures, argued texts |
| `b2/STRT_Deel_B_set_1.pdf`, `…set_2` | STRT part B, reading + writing: *Industrieel ontwerpen* (a formal letter asking for a work placement), *Koopknop in het brein*, *Bewust leven*, *Aardbeien plukken* | 10/10, 10/10 | **branch "B2 for study"** | Study administration, popular-science articles |
| `b2/STRT_Deel_C_set_1.pdf`, `…set_2` | STRT part C, speaking: *Laboratoriumassistent* (arguing with a professor), *Wat een bende*, *Debat*, *Nederland fietsland* | 7/7, 7/7 | **branch "B2 for study"** | Discussions with lecturers and fellow students |
| `b2/STRT_Instructies_voor_examinator_set_1.pdf`, `…set_2`; `STRT_Beoordelingsmodellen_set_1.pdf`, `…set_2` | STRT examiner booklets and rating models | 14/14, 14/14; 11/11, 16/16 | **branch "B2 for study"**: attested words | — |

**The plan:** a **Dutch B2 core** (Richtgraad 3 Vantage as the syllabus, NT2Lex B2 as the level evidence,
Staatsexamen Programma II 2025 as attestations and text models — the personal and public domains plus general work and
news), and two **optional branches** at the same level: **"B2 at work"** (CNaVT PROF: work emails, meetings, care and
service settings, training, complaints between companies) and **"B2 for study"** (CNaVT STRT: lectures, argued texts,
formal letters to a university, popular science). The branches add their own domain vocabulary and text types; neither is
needed to finish B2, and both come after the core on the path.

**Not used** — none: every Dutch B2 file is used (core or a branch).

## Licences

- **NT2Lex**: Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International (CC BY-NC-SA 4.0), CENTAL (UCLouvain).
  Anzo uses it as an authoring reference only: the derived word list stays gitignored, the app never ships or serves it, and
  Anzo is not commercial. Cite: Tack, A., François, T., Desmet, P. & Fairon, C. (2018). *NT2Lex: A CEFR-Graded Lexical
  Resource for Dutch as a Foreign Language Linked to Open Dutch WordNet.* BEA 2018, pp. 137–146.
- **CNaVT** sample exams (KU Leuven / Taalunie), **Leerplannen NT2** (Flemish adult education), **Naar Nederland** (© 2014
  Ministerie van Sociale Zaken en Werkgelegenheid, all rights reserved) and **Staatsexamens NT2** (DUO / College voor Toetsen en
  Examens): reference only; not in the repository; never quoted at length in content.
