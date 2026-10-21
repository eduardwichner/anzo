# Dutch curriculum plan (Flemish standard Dutch for English speakers)

Source of every word: the derived Dutch word list (`content/src/nl/WORDLIST.md`; `npm run content:wordlist -- nl` builds
`content/reference/extracted/wordlist-nl.json` from NT2Lex, *Naar Nederland*, CNaVT and the unit groups of
`content/src/nl/wordlist-sources.yaml`). Units follow the domains and roles of **Richtgraad 1** of Flemish adult education
(persoonlijk, publiek, professioneel, educatief; beheerder huisvesting en gezinsadministratie, consument, opvoeder,
werkende, werkzoekende, vrijetijdsbesteder, patiënt, verkeersgebruiker) for adults living in Flanders: realistic, polite,
everyday situations, no Netherlands-specific procedures. The learners are adults (`users.audience = adult`); meanings are
in British English.

Rules this plan keeps:

- **Belgian standard Dutch.** Where Belgian and Netherlands standard usage differ for an everyday word, the Belgian form
  is taught and `alsoNL` records the Netherlands form, shown after the answer (*de gsm* — in the Netherlands: *de mobiel*).
  *je/jij* and *u*, never *ge/gij*. Spelling: the Groene Boekje. Netherlands-only realia are `regional: nl` and never core.
- **Register.** *u* to strangers, in shops, at the doctor's, at the town hall and to a teacher; *je/jij* to friends, family
  and colleagues (Richtgraad 1, register appendix). English meanings mark the formal pair: *alstublieft* "please (formal)".
- **Nouns carry their article** in `target` (*de kat, het huis*) and record `plural` (*katten, huizen*; `-` when there is
  none). Options and word-bank tiles for a noun share its article where articles are shown, so the article never gives the
  answer away. Diminutives are separate items only when common in their own right (*het broodje, het meisje, het
  kaartje*).
- **Every lemma of the word list is taught in exactly one unit** of its level or a higher one, or omitted with a reason in
  a level's `pack.yaml` (`npm run content:trace -- nl --coverage`). Articles are omitted as vocabulary and practised in
  every sentence.
- **Word order** is practised in *build the sentence*: V2 inversion (*Morgen ga ik naar Gent.*), the verb last in
  subordinate clauses (*…, omdat ik ziek ben.*), split separable verbs (*Ik sta om zeven uur op.*); where Dutch allows
  another order of the same words, `acceptAlso` lists it (*Ik ga morgen naar Gent.*).

## Grammar per level

The Richtgraad 1 Waystage curriculum names no grammar per level (the teacher chooses by task; its examples use the
present, question words, modal verbs, the imperative and *omdat* clauses). The sequence below follows those tasks, the
*Naar Nederland* grammar boxes (lessons 21–65) and the CEFR descriptors, and is what `content:trace -- nl` enforces for
forms (`scripts/content/trace-nl-lib.js` KIND_LEVEL).

| Level | Structures (sentences use only these; the trace checks the forms) |
|---|---|
| Start | *zijn* and *hebben*; personal pronouns (*ik, jij/je, u, hij, zij/ze, wij/we, jullie*; *mij/me, jou, hem*); *mijn, jouw, uw*; *dit/dat*; the present of regular verbs (*ik werk, jij werkt, wij werken*) and common irregular presents (*ga, doe, zie*); the imperative (*Kijk! Bel me!*); yes/no questions (verb first) and *w*-questions (*wie, wat, welk(e), waar, wanneer, hoe, waarom, hoeveel*); numbers 0–20; *niet* and *geen*; adjective *-e* (*een mooie stad*); plurals. Statements keep the subject first; the presentative formulas *Hier is …*, *Daar is …* (*Daar is bus zeventien.*) are taught as fixed phrases, and any other fronted word with inversion waits for A1. |
| A1 | all of Start, plus inversion (V2: *Vandaag werk ik niet.*); separable verbs (*Ik sta om zeven uur op.*); modal verbs *kunnen, moeten, mogen, willen, zullen* and *hoeven te*; basic *er* (*er is, er zijn*); the other possessives (*zijn, haar, ons/onze, jullie, hun*) and *deze/die*; time expressions (*om acht uur, kwart na drie, half vier*); numbers to 1000 and ordinals; diminutives; partitive *iets lekkers*. *meer/minder* (quantity) and *beter* "better (recovered)" are A1 words, not comparatives. Built word order: verb and particle last (*Ik sta om zes uur op.*, *U moet naar loket drie gaan.*); extraposed orders are not accepted; every fronted order of the same words is (`acceptAlso`). |
| A2 | all of A1, plus the perfect tense with *hebben* and *zijn* (*Ik heb gewerkt. Ik ben gegaan.*); the imperfect of common verbs (*was, had, ging, werkte*); subordinate clauses with *omdat, als, dat, toen, terwijl, voordat, nadat* (verb last); comparatives and superlatives (*groter dan, het grootst, beter, meer*); the future with *zullen* and *gaan* + infinitive; reflexive verbs (*zich vervelen, zich haasten, zich zorgen maken*). Also in scope: *zodat, hoewel*; indirect questions with the verb last (*Weet u wat er op de verpakking staat?*); *om … te* + infinitive; the double infinitive in the perfect (*we zijn gaan fietsen*); split *er* + preposition (*klik er niet op*); *zijn* + participle as a resulting state (*Mijn fiets is gestolen. Het probleem is opgelost. We zijn uitgenodigd.*). Not at A2: the passive with *worden*, the pluperfect (both B1). Built word order as at A1 (verb and particle last; no extraposed orders). |
| B1 | all of A2, plus (Richtgraad 2 — Threshold; its appendix names no grammar per level either, so the list follows its can-do tasks: telling what happened, reporting what someone said, procedures and notices, complaints, opinions, hypothetical plans): the **passive with *worden*** in the present and past (*Het afval wordt op maandag opgehaald. De brief werd gisteren verstuurd.*) and with a modal (*moet betaald worden*); the **pluperfect** (*Toen ik aankwam, was de trein al vertrokken. Ik had het formulier al ingevuld.*); **relative clauses** with *die / dat* and *waar* + preposition (*de collega die naast mij zit; het huis waarin we wonen; de dokter waarmee ik praatte*); **er** in its main uses (presentative *er is*, place *Ik woon er al jaren*, quantity *Ik heb er twee*, with a preposition *Ik denk erover na*, with the passive *Er wordt gebeld*); **indirect speech** with *dat* / *of* / a question word and the verb last (*Hij zei dat hij later kwam. Ze vroeg of ik tijd had.*); the **conditional** *zou / zouden* (*Ik zou graag langskomen. Zou u mij kunnen helpen?*); separable and inseparable verbs in subordinate clauses (*…, omdat hij morgen verhuist; …, dat ze de rekening heeft betaald*); **linking words** with their word order (*omdat, doordat, zodat, hoewel, terwijl, nadat, voordat, toch, daarom, bovendien*); common **fixed prepositions with verbs** (*wachten op, denken aan, zorgen voor, zich aanmelden voor, rekening houden met, deelnemen aan, klagen over*). Built word order: the target has the verb, the particle and the verb cluster last; a prepositional phrase moved after the final verb (*Ik ben het oneens met je*, *kun je hulp vragen bij het OCMW*) is accepted as an alternative in `acceptAlso` but never the target (dictation and listening may model it, as speech does); both orders of a verb cluster (*uitgenodigd heeft / heeft uitgenodigd*) are listed; every fronted order of the same words is listed in `acceptAlso` (a fronted subordinate clause with inversion included). A sentence marked `build: true` is always built in the review lesson (the grammar point the unit teaches: a *waar*-relative, *doordat*, *toch*). *verliezen* takes *hebben* and, very often in Belgium, *zijn* (*ik heb / ben mijn kaart verloren*): both are standard and both occur. `content:trace -- nl` checks forms, not clause structure: the passive and the pluperfect use the A2 participles and pasts, *waar* + preposition is B1 (`pronominalAdverb` in `trace-nl-lib.js`), *er/daar/hier* + preposition A2. |

| B2 | all of B1, plus (Richtgraad 3 — Vantage; like Richtgraad 1 and 2 it names no grammar per level, so the list follows its can-do tasks — following an argument, comparing points of view, writing a formal complaint, judging a text — and the Staatsexamen NT2 Programma II papers): **verb clusters** of three verbs (*Ik had die stap eerder willen zetten. Hij zou het moeten weten.*); *zou* + infinitive for hypotheses, advice and politeness and the **past conditional** (*Als ik het geweten had, zou ik je geholpen hebben.*); the **passive in all tenses and with modals**, also in the past (*is goedgekeurd, werd verkocht, moet betaald worden, had beter uitgelegd moeten worden*); **er** in all its functions (u06); **nominalisation** (*het invoeren van, bij het kiezen van, de vermindering van*); **infinitive constructions** (*om … te, door te, zonder te; proberen, beloven, weigeren te; lijken te, hoeven te; staan / zitten te*); **fixed prepositions** with verbs, adjectives and nouns (*afhangen van, wijzen op, twijfelen aan; bewust van, benieuwd naar, gewend aan, verantwoordelijk voor; recht op*); **relative clauses** with *waar* + preposition (*de app waarmee je betaalt*) and with *wat, wie, waar* (*alles wat, wie …, die; het dorp waar*); **connectors of argument, concession and condition** (*bovendien, echter, desondanks, aangezien, immers, daarentegen, weliswaar … maar; ofschoon, niettemin, bijgevolg; enerzijds … anderzijds; tenzij, mits, zodra, zolang, totdat*); prepositions of reason in formal texts (*gezien, wegens, dankzij, ondanks*). Built word order as at B1; a sentence marked `build: true` practises the unit's point. Every unit has three key word transformations (`transforms`) and two or three word-formation fill-ins (`form`) in its review lesson. |

## B1: units, texts and their presentation

B1 follows the domains, roles and can-do tasks of **Richtgraad 2 (Threshold 1 and 2)** for adults in Flanders:
work and applications, housing and the landlord, moving and the municipality, health and the ziekenfonds, school and parents,
money and the bank, media and news, the environment and the neighbourhood, travel, leisure and associations, consumer
complaints, relationships and opinions, the police, a life story. Every unit has vocabulary lessons as at A2 (6–8 words, the
lesson recipe), then **one text lesson per text** (one exercise per question, a typed cloze with a hint per gap, ordering
when `orderable`), the review lesson (with finite-verb fill-ins: `pack.yaml finiteVerbFill`) and a **listening lesson**
`<unit>-listening` (every text heard, its listening questions). Unit 1 is the pilot unit (two texts only; its ids are
locked). 21 texts: 12 readings of 120–180 words (a job advert, an e-mail from a team leader, a municipal web page, a
ziekenfonds leaflet, a school letter, a council notice, a news article, a call for participation, an association newsletter, a
complaint e-mail, a newcomer's blog) and 9 dialogues of 8–14 turns (an interview, phone calls to a landlady, a GP's practice
and a bank, a parents' evening, a station desk, two friends disagreeing, a police statement), each with 5 questions and 2
listening questions; the CNaVT FORM and Staatsexamen 2025 papers were models for the text types only. B speakers are women
(the dialogue voice *nl_BE-nathalie*), A speakers men (*nl_BE-rdh*).

## B2: units, texts and their presentation

B2 follows the domains, roles and can-do tasks of **Richtgraad 3 (Vantage)** for adults and teenagers from 13
(`users.audience` adult; family-safe): a life change, career and the labour market, money, housing, the health system, food,
media and fake news, technology, education, climate and energy, mobility, society and diversity, politics and the Belgian
state, law and consumer rights, culture, family and care, tourism, science, argument and the future (one unit each,
`nl-b2-u01`–`u20`; the size, 815 new lemmas, is in WORDLIST.md). Every unit has vocabulary lessons as at B1, **one text
lesson per text**, the review lesson (finite-verb fill-ins, word-formation fill-ins `form`, key word transformations
`transforms`) and the listening lesson. 21 texts (about 5,300 words): 17 readings of about 120–450 words (a blog, three texts with four
voices, articles, an explainer for newcomers, an advice column, a theatre review, opinion pieces, a popular-science article and
a long feature; the last three units have the longest) and 4 dialogues of 14–16 turns (an interview with a career coach, two
friends on eating less meat, a radio debate between a councillor and a shop owner, a brother and sister on caring for their
mother). Each text lesson uses the B2 kinds (`content/README.md`, *B2 keys*): a **gapped text** (`gapped`, 4–5 sentences out
and one extra) in 9 texts, a **summary** question in 19, **multiple matching** (`match_texts`) in the three texts with four
voices, an **open cloze** (`openCloze`) or **word formation** (`wordForm`) instead
of the course-word cloze, and a **listening completion** (`complete`) among the listening questions. Texts longer than 180
words scroll in their own pane on a phone. The Staatsexamen NT2 Programma II 2025 booklets and the CNaVT B2 profiles were
models for the text types only; every text is original. Names in the texts are Belgian (WORDLIST.md, `names`).

Unit 1 is the pilot unit. Two branches follow the core (`nl-b2-work`, `nl-b2-study`).

## B2 branches: work and study

Two optional packs after the core (manifest `branch: true, after: nl-b2`): shown on the path after the core, not needed to
complete the level, and independent of each other (a learner takes either or both, so a branch never relies on a word only
the other branch teaches without a gloss). Each has 8 units and 8 texts; their words are the word list's groups e01–e08
(work) and f01–f08 (study), level B2, traced with the core.

- **`nl-b2-work`** (CNaVT B2 Zakelijk Professioneel, PROF): applying (no probation period for most Belgian contracts since
  2014), meetings and minutes, business e-mails and their formulas, teams and feedback, health at work (*arbeidsgeneesheer,
  preventieadviseur, vertrouwenspersoon*), customers (quotations, credit notes), diversity, contracts and pay (*brutoloon,
  vakantiegeld, eindejaarspremie, indexering, maaltijdcheques*). Texts: an advert, a meeting dialogue, an e-mail, two articles,
  a phone call, four voices, an intranet page.
- **`nl-b2-study`** (CNaVT B2 Educatief Startbekwaam, STRT, one unit per task): studying at a hogeschool, writing a paper,
  research and surveys (the lecture *Liegen*), presenting with slides, language change (*Taalverandering*), behaviour and the
  brain (*Koopknop in het brein*, *Bedtijd*), water (*Medicijnresten in het grondwater*, a radio interview), design
  (*Industrieel ontwerpen*, *Aardbeien plukken*). Texts: 2 dialogues + 1 interview (A male, B female), 5 readings.
- **Lighter review format** (deliberate): a branch unit has two or three key word transformations and one or two
  word-formation fill-ins (the core: three and two or three); its review is shorter than a core review. Everything else follows
  the B2 rules above. Every unit of both branches has an independent review with the author's resolution.

## Deliberate omissions

| What | Why |
|---|---|
| *de, het, een* as vocabulary | Articles: every noun is taught with its article; practised in every sentence |
| Netherlands-only realia (*OV-chipkaart, Randstad, DigiD, pinnen, patat, consultatiebureau, Koningsdag*) | `regional: nl`: not the learners' Flemish everyday life (WORDLIST.md) |
| *ge/gij*, dialect and tussentaal (*seffens, goesting, frigo, living*) | Standard Belgian Dutch only |
| Other omissions | Listed with their reason in each level's `pack.yaml` (`omit`) |

## Units

<!-- units:start -->
| Level | Unit | Title | Topic | Words | Sentences |
|---|---|---|---|---|---|
| Start | nl-pre-a1-u01 | Hello! | Greetings and politeness | 27 | 23 |
| Start | nl-pre-a1-u02 | Me and you | Personal pronouns, my / your, geen | 21 | 20 |
| Start | nl-pre-a1-u03 | Questions | Question words, niet, and, or, but | 17 | 20 |
| Start | nl-pre-a1-u04 | Who are you? | Introducing yourself (name, origin, address, languages) | 25 | 28 |
| Start | nl-pre-a1-u05 | Numbers to twenty | Numbers 0-20, age, phone numbers | 28 | 29 |
| Start | nl-pre-a1-u06 | My family | Family | 21 | 24 |
| Start | nl-pre-a1-u07 | At home | The home and its rooms | 22 | 22 |
| Start | nl-pre-a1-u08 | Food and drink | Food and drink | 28 | 25 |
| Start | nl-pre-a1-u09 | Days and times | Days of the week, parts of the day | 29 | 29 |
| Start | nl-pre-a1-u10 | In town | Places in town; going somewhere | 22 | 26 |
| Start | nl-pre-a1-u11 | Colours and clothes | Colours and clothes | 20 | 21 |
| Start | nl-pre-a1-u12 | What do you do? | Everyday verbs in the present | 23 | 23 |
| Start | nl-pre-a1-u13 | How is it? | Describing people and things; feelings | 20 | 23 |
| Start | nl-pre-a1-u14 | Calls and messages | Phone, messages, questions and answers | 11 | 18 |
| A1 | nl-a1-u01 | Numbers to a thousand | Numbers 30-1000, ordinals, amounts | 22 | 23 |
| A1 | nl-a1-u02 | Can, may, must | Modal verbs; knowing and thinking | 22 | 25 |
| A1 | nl-a1-u03 | His, her, our; often, never | Possessives, demonstratives, someone/something, how often | 30 | 31 |
| A1 | nl-a1-u04 | Money | Money, prices, paying | 18 | 18 |
| A1 | nl-a1-u05 | What time is it? | The time, appointments | 24 | 26 |
| A1 | nl-a1-u06 | Groceries | Groceries and meals | 24 | 24 |
| A1 | nl-a1-u07 | At the market | At the market and the bakery; quantities | 22 | 21 |
| A1 | nl-a1-u08 | My body | The body | 18 | 18 |
| A1 | nl-a1-u09 | At the doctor's | Feeling ill, the doctor, the pharmacy | 20 | 22 |
| A1 | nl-a1-u10 | By bus and train | Public transport and travelling | 22 | 21 |
| A1 | nl-a1-u11 | Asking the way | Directions in town | 25 | 24 |
| A1 | nl-a1-u12 | My day | Daily routine; separable verbs | 20 | 21 |
| A1 | nl-a1-u13 | Where I live | Housing, the building, the neighbours | 29 | 27 |
| A1 | nl-a1-u14 | At work | Jobs, colleagues, the working day | 21 | 22 |
| A1 | nl-a1-u15 | The children's school | School, the teacher, homework | 24 | 24 |
| A1 | nl-a1-u16 | Weather and seasons | Weather, seasons, months | 31 | 30 |
| A1 | nl-a1-u17 | Free time | Hobbies, sport, going out | 21 | 21 |
| A1 | nl-a1-u18 | Buying clothes | In a clothes shop | 16 | 18 |
| A1 | nl-a1-u19 | At the town hall | Registering, forms, the post | 18 | 18 |
| A1 | nl-a1-u20 | A party | Birthdays, invitations, visitors | 22 | 21 |
| A2 | nl-a2-u01 | Yesterday and last year | Telling what happened; the perfect tense | 23 | 25 |
| A2 | nl-a2-u02 | A bad day | Things that went wrong; the perfect and the imperfect | 26 | 24 |
| A2 | nl-a2-u03 | What do you think? | Opinions, reasons, agreeing; subordinate clauses | 24 | 25 |
| A2 | nl-a2-u04 | Bigger, better, best | Comparatives and superlatives | 19 | 25 |
| A2 | nl-a2-u05 | People and things | Everyday core words | 27 | 28 |
| A2 | nl-a2-u06 | Problems at home | Repairs, the landlord, complaints about noise | 20 | 20 |
| A2 | nl-a2-u07 | Looking for a home | Renting a flat in Flanders | 16 | 18 |
| A2 | nl-a2-u08 | The doctor and the hospital | Emergencies, examinations, the hospital | 24 | 23 |
| A2 | nl-a2-u09 | At the pharmacy | Medicine, instructions, side effects | 17 | 19 |
| A2 | nl-a2-u10 | Looking for work | Vacancies, applications, interviews | 20 | 22 |
| A2 | nl-a2-u11 | On the job | Tasks, meetings, shifts, safety | 20 | 20 |
| A2 | nl-a2-u12 | School and parents | The Flemish school system, parents' evening, results | 21 | 20 |
| A2 | nl-a2-u13 | Travelling | Holidays abroad, the airport, hotels | 23 | 22 |
| A2 | nl-a2-u14 | A day out | Outings, nature, opening hours | 21 | 19 |
| A2 | nl-a2-u15 | How do you feel? | Feelings; reflexive verbs | 26 | 24 |
| A2 | nl-a2-u16 | The news and the weather forecast | News, forecasts, the future with zullen | 26 | 25 |
| A2 | nl-a2-u17 | The neighbourhood and the town | Rubbish, roadworks, rules, local life | 21 | 22 |
| A2 | nl-a2-u18 | Cooking | Recipes, kitchen things, instructions | 29 | 25 |
| A2 | nl-a2-u19 | Shopping and complaints | Online orders, deliveries, complaints, sales | 19 | 19 |
| A2 | nl-a2-u20 | The bank and online | Bank accounts, transfers, computers and apps | 23 | 20 |
| A2 | nl-a2-u21 | Celebrations and traditions | Holidays, weddings, births, wishes | 19 | 20 |
| A2 | nl-a2-u22 | Sport and a healthy life | Exercise, matches, healthy habits | 22 | 23 |
| A2 | nl-a2-u23 | Making plans | Plans, dreams, the future with gaan and zullen | 16 | 17 |
| A2 | nl-a2-u24 | Linking sentences | Linking words; word order after them | 13 | 13 |
| A2 | nl-a2-u25 | Keeping in touch | Cards, letters, emails, phone calls | 21 | 25 |
| B1 | nl-b1-u01 | Living together | Neighbours, repairs, the building | 7 | 0 |
| B1 | nl-b1-u02 | Looking for work | Job adverts, profiles and conditions; relative clauses with die and dat | 42 | 42 |
| B1 | nl-b1-u03 | The job interview | Presenting yourself, qualities, pay and conditions; the conditional with zou | 42 | 38 |
| B1 | nl-b1-u04 | At work | Rosters, meetings, instructions and safety; indirect speech and the passive | 40 | 39 |
| B1 | nl-b1-u05 | The landlord and repairs | Repairs, maintenance, energy, the lease; er in its main uses | 35 | 35 |
| B1 | nl-b1-u06 | Moving house | Moving, changing your address, documents and suppliers; the passive with worden | 34 | 33 |
| B1 | nl-b1-u07 | The doctor and appointments | The GP's practice, symptoms, treatment, referrals; verbs with fixed prepositions | 33 | 32 |
| B1 | nl-b1-u08 | Health insurance and the pharmacy | The ziekenfonds, refunds, medicines, specialists; the passive | 33 | 33 |
| B1 | nl-b1-u09 | School and parents | The Flemish school year, letters from school, costs, choices; relative clauses | 31 | 28 |
| B1 | nl-b1-u10 | The parents' evening | Progress, behaviour, support at school; linking words (doordat, zodat, hoewel) | 33 | 30 |
| B1 | nl-b1-u11 | The municipality and services | Rubbish collection, taxes, permits, the library, the council; the passive | 31 | 28 |
| B1 | nl-b1-u12 | Money and the bank | Accounts, payments, debts, fraud; the conditional and indirect questions | 34 | 32 |
| B1 | nl-b1-u13 | Media and news | Newspapers, broadcasts, news events, politics; reported speech and the pluperfect | 30 | 32 |
| B1 | nl-b1-u14 | The environment and the neighbourhood | The climate, pollution, saving energy, local initiatives; zodat and om … te | 39 | 34 |
| B1 | nl-b1-u15 | Travel and holidays | Bookings, delays, airports, accommodation, insurance; the conditional with zou | 32 | 30 |
| B1 | nl-b1-u16 | Leisure and associations | Clubs, culture, events, volunteering, meeting people; relative clauses with waar + preposition | 35 | 32 |
| B1 | nl-b1-u17 | Consumer complaints | Orders, deliveries, guarantees, refunds, a formal complaint; the conditional and linking words | 36 | 34 |
| B1 | nl-b1-u18 | Relationships and opinions | Partners, family, habits; giving and defending an opinion (hoewel, enerzijds … anderzijds) | 37 | 36 |
| B1 | nl-b1-u19 | The police and safety | Theft, burglary, reporting a crime, witnesses, road safety; the pluperfect and the passive | 39 | 33 |
| B1 | nl-b1-u20 | Looking back and ahead | A newcomer's story, settling in, achievements and plans; the pluperfect and linking words | 29 | 28 |
| B2 | nl-b2-u01 | A new chapter | Life changes, settling in a new city; verb clusters | 43 | 41 |
| B2 | nl-b2-u02 | Work and career | Career switch, skills, the labour market; zou + infinitive | 47 | 38 |
| B2 | nl-b2-u03 | Money matters | Budget, debt, credit, saving; the passive with modals | 42 | 40 |
| B2 | nl-b2-u04 | Housing | Renting, buying, renovating, energy; om … te, door te, zonder te | 43 | 35 |
| B2 | nl-b2-u05 | Health care | The health system, prevention, mental health; the passive in all tenses | 50 | 37 |
| B2 | nl-b2-u06 | Food and health | Labels, diets, food waste; er in all its functions | 46 | 38 |
| B2 | nl-b2-u07 | Media and information | News, fake news, algorithms, press freedom; fixed prepositions with verbs | 58 | 49 |
| B2 | nl-b2-u08 | Technology | Digital life, privacy, smart devices, AI; waar + preposition | 45 | 44 |
| B2 | nl-b2-u09 | Education | The Flemish school system, dual and lifelong learning; nominalisation | 40 | 42 |
| B2 | nl-b2-u10 | Climate and energy | Climate change, extreme weather, the energy transition; connectors of argument | 49 | 44 |
| B2 | nl-b2-u11 | Mobility | Commuting, public transport, road safety; infinitives with te | 35 | 43 |
| B2 | nl-b2-u12 | Society and diversity | Diversity, integration, volunteering, solidarity; the past conditional | 34 | 39 |
| B2 | nl-b2-u13 | Politics and government | The federal state, elections, compulsory voting; the passive with modals (past) | 36 | 38 |
| B2 | nl-b2-u14 | Law and consumer rights | Contracts, guarantees, mediation, fraud, courts; fixed prepositions after adjectives and nouns | 27 | 35 |
| B2 | nl-b2-u15 | Culture | Art, theatre, books, reviews, heritage; gezien, wegens, dankzij, ondanks | 43 | 43 |
| B2 | nl-b2-u16 | Family and relationships | Families, teenagers, caring for parents; tenzij, mits, zodra, zolang, totdat | 37 | 40 |
| B2 | nl-b2-u17 | Travel and tourism | Sustainable travel, mass tourism; relative clauses with wat, wie, waar | 33 | 37 |
| B2 | nl-b2-u18 | Science | Research, the brain, sleep, numbers; formal register, nominal style | 38 | 38 |
| B2 | nl-b2-u19 | Debate and argument | Taking and defending a position; ofschoon, niettemin, bijgevolg | 34 | 37 |
| B2 | nl-b2-u20 | The future | The future of work, an ageing society; review of the B2 grammar | 37 | 42 |
<!-- units:end -->
