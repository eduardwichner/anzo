# English curriculum plan (Cambridge YLE)

Source of every word: the combined *Pre A1 Starters, A1 Movers and A2 Flyers alphabetic vocabulary list* of
`149681-yle-flyers-word-list.pdf` (parsed into `content/reference/extracted/wordlist-en.json` by
`npm run content:wordlist`), plus the level notes on numbers and the handbook's name lists. Units follow the YLE
topics (animals, body and face, clothes, colours, family and friends, food and drink, health, home, materials, numbers,
places and directions, school, sports and leisure, time, toys, transport, weather, work, the world around us) as they
apply per level, plus units for the grammatical words each level lists.

Rules this plan keeps:

- Every word-list entry of a level is taught in **exactly one unit of that level** (`npm run content:trace -- en`
  reports coverage; `--coverage` fails on gaps). Deliberate omissions are listed in each level's `pack.yaml` (`omit`)
  with the reason, and summarised below.
- A word already taught at a lower level is not taught again, even when the higher level lists a new use of it
  (Movers `how` adv, `at` for time, `fish` v …): it stays traceable and is used in sentences.
- Units of 15–35 words, split by the generator into lessons of 6–8 new words plus a review lesson.
- Sentences use only the level's structures (handbook *Grammar and structures* lists): Starters — present simple and
  continuous, can, have got, there is/are, imperatives, like + -ing, let's, would like; Movers adds past simple,
  comparatives/superlatives, adverbs, must/have to/could/shall, when-clauses; Flyers adds past continuous, present
  perfect, will/going to, might/may/should, if-clauses, tag questions.
- Unit 1 of Starters (`en-pre-a1-u01`, *Dieren*) keeps its unit id, lesson ids l01–l03 and sentence ids s01–s10.

## Deliberate omissions (all levels)

| What | Why |
|---|---|
| Names (Alex, Anna, Ben, … Charlie, Daisy, … Betty, Harry, …; also London) | Recognised, not translated: they appear in sentences instead |
| American forms marked "(UK …)" or "(US …)" (apartment, candy, eraser, fries, soccer, store, truck, color, favorite, gray, elevator, movie, center, backpack, cookie, flashlight, fire truck, math, pajamas, program, theater, tire, fall = autumn) | The app speaks British English (en_GB voice); the British word is taught |
| Discourse markers *oh, so, then, well* (Starters) | No stable Dutch equivalent as a word; used in sentences |
| *sweet* (Starters noun, singular) | Taught as *sweets* (snoep), the form children use |
| *blonde* (Movers) | Spelling variant of *blond*, which is taught |
| Letters of the alphabet | Not word-list entries; *alphabet* and *letter* are taught |
| Numbers 21–99 except the tens (Movers), 101–999 (Flyers) | Compounds of taught number words (*twenty-one*), traceable by their parts |

## Pre A1 Starters (`en-pre-a1`, 19 units)

| Unit | Title | Words |
|---|---|---|
| u01 | Dieren | cat dog fish bird horse cow sheep chicken duck frog black white brown green yellow big small crocodile lizard snake animal bear elephant giraffe hippo monkey tiger zebra donkey goat mouse mice spider polar bear tail |
| u02 | Hallo! | hello hi goodbye bye see you good please thank you thanks sorry yes no OK nice great cool fantastic wow hooray well done me too don't worry oh dear pardon |
| u03 | Kleuren en getallen | blue red orange pink purple grey colour one two three four five six seven eight nine ten number count eleven twelve thirteen fourteen fifteen add sixteen seventeen eighteen nineteen twenty double |
| u04 | Familie en vrienden | family mother mum father dad brother sister baby grandfather grandpa grandmother grandma cousin child children kid boy girl friend name pet love live man men woman women person people Mr Mrs Miss |
| u05 | Mijn lichaam | head face eye ear nose mouth hair body arm hand leg foot feet long short beautiful ugly young old happy sad angry funny scary silly smile |
| u06 | Kleding | clothes wear T-shirt shirt trousers jeans shorts skirt dress sock shoe boots hat baseball cap jacket bag handbag glasses watch new dirty clean |
| u07 | Fruit en groente | fruit apple banana pear grape lemon lime kiwi mango pineapple coconut watermelon bean carrot onion pea potato tomato food eat like want would like some |
| u08 | Eten en drinken | breakfast bread egg milk juice water drink lunch dinner meat meatballs rice sausage burger chips cake pie chocolate ice cream sweets lemonade |
| u09 | Thuis | house home flat garden door window wall floor room kitchen living room dining room bedroom bathroom hall bath chair table armchair sofa bed cupboard bookcase lamp clock mirror picture rug mat box |
| u10 | In de klas | school class classroom teacher classmate lesson English book pen pencil crayon rubber ruler paper page board desk computer keyboard tablet poster |
| u11 | Leren | read write letter word sentence alphabet spell look look at listen point show line ask answer question tell know understand learn right correct cross tick complete draw drawing paint painting choose find example part |
| u12 | Speelgoed en muziek | toy ball balloon doll teddy kite robot game board game alien monster thing story music song sing guitar piano radio camera photo take a photo take a picture phone television TV |
| u13 | Sport en vrije tijd | sport football basketball baseball hockey tennis table tennis badminton bat tennis racket throw catch kick hit bounce run jump swim ride bike fly play hobby fun enjoy favourite fishing skateboard skateboarding |
| u14 | Buiten en op straat | car bus train plane boat ship helicopter lorry motorbike drive street shop bookshop park playground zoo tree flower bee beach sea sand shell sun jellyfish |
| u15 | Mijn dag | morning afternoon evening night day today now sleep go to bed go to sleep year birthday again go come get start stop end |
| u16 | Doe mee! | be have have got do make can see say give put hold pick up try let's open close sit stand walk wave clap talk closed |
| u17 | Ik en jij | I you he she it we they me him her us them my your his its our their mine yours hers ours theirs |
| u18 | Waar is het? | where in on under behind next to in front of between here there at from to with for of about this that these those a lot of lots of many |
| u19 | Vragen en kleine woorden | who what which whose how how many how old and but or not very too a an the really a lot lots |

## A1 Movers (`en-a1`, 18 units)

| Unit | Title | Words |
|---|---|---|
| u01 | Meer dieren | kitten puppy rabbit parrot cage feed dolphin shark whale snail fly bat lion panda penguin kangaroo climb hop |
| u02 | Ziek en beter | back neck shoulder stomach tooth teeth beard moustache hurt cough earache headache stomach-ache toothache temperature cold ill sick doctor dentist nurse hospital matter fine fat thin blond curly straight |
| u03 | Het weer | weather sunny cloud cloudy rain rainbow wind windy snow ice wet dry hot sky star moon plant leaf leaves |
| u04 | In de natuur | countryside village farm farmer tractor field forest grass ground rock picnic jungle lake river waterfall mountain island world country |
| u05 | In de stad | city town centre city centre town centre building square market supermarket shopping centre café library cinema circus funfair sports centre swimming pool station bus station bus stop car park road map |
| u06 | Waar naartoe? | above below up down upstairs downstairs round inside outside into out of out off near along around opposite by move carry drop ticket trip travel driver fall get on get off |
| u07 | In huis | balcony basement roof lift stairs stair bowl cup glass plate bottle machine blanket seat address model shower towel |
| u08 | Lekker eten | sandwich cheese salad soup pasta noodles sauce pancake milkshake tea coffee vegetable sweet cook hungry thirsty break shopping go shopping buy |
| u09 | Mensen | aunt uncle daughter son granddaughter grandson grandparent parent grown-up clown pirate pop star film star famous afraid frightened surprised brave naughty clever boring strong weak tall little pretty fair busy quick slow quiet loud careful dangerous safe |
| u10 | Dagen en tijd | Monday Tuesday Wednesday Thursday week weekend yesterday Friday Saturday Sunday o'clock after before last age holiday how often always never often sometimes |
| u11 | Getallen | thirty forty fifty sixty seventy eighty ninety hundred first second third fourth fifth sixth seventh eighth ninth tenth eleventh twelfth thirteenth fourteenth fifteenth sixteenth seventeenth eighteenth nineteenth twentieth |
| u12 | Spelen en sporten | ice skates ice skating roller skates roller skating skate helmet sail dance goal net score player practise practice skip party present invite treasure hide dress up |
| u13 | Computers en media | band CD DVD film video comic comic book email internet app laptop website e-book text message call send laugh shout cry |
| u14 | Mijn ochtend | wake get up awake asleep tired wash get dressed get undressed put on take off pair coat toothbrush toothpaste scarf sweater swimsuit pool |
| u15 | Op school | homework mistake wrong difficult easy idea think circle shape difference different kind place teach help change mean noise be called |
| u16 | Alles, meer en waarom | all every everyone everything nothing both more most only than another any someone something because when why how much |
| u17 | Hoe doe je het? | well badly bad terrible better worse best worst carefully loudly quickly quietly slowly could must shall have to would |
| u18 | Dingen doen | bring build fix grow take need work look for lose wait dream top bottom huge brilliant exciting all right come on excuse me |

Movers words also on the Starters list with a new use (taught at Starters, not repeated): how, at (time), on (time),
catch, fish (v), who/where/which (relative), drive (n), ride (n), walk (n), swim (n), wave (n), kick (n), floor.

## A2 Flyers (`en-a2`, 21 units)

| Unit | Title | Words |
|---|---|---|
| u01 | Maanden en seizoenen | January February March April May June July August September October November December spring summer autumn winter calendar date diary century future month |
| u02 | Hoe laat? | hour minute quarter half past midnight midday a.m. p.m. time early late later soon tomorrow tonight ago already yet ever once twice until since during at the moment in a minute |
| u03 | Werk | actor artist singer photographer designer journalist fire fighter police officer pilot astronaut mechanic engineer businessman businesswoman manager office meeting business job factory waiter student uniform |
| u04 | Gebouwen | bank bridge castle hotel museum restaurant skyscraper chemist chemist's fire station police station post office airport stadium theatre college university entrance exit gate |
| u05 | Onderweg | bicycle ambulance fire engine taxi engine wheel tyre passenger platform railway motorway traffic timetable suitcase path way corner straight on far across through north south east west journey tour land arrive leave get to cycle hurry |
| u06 | Natuur en ruimte | hill cave desert ocean pond stream wood air fog foggy storm stone view Earth planet space spaceship rocket environment wild extinct dinosaur creature nest wing |
| u07 | Bijzondere dieren | insect beetle butterfly camel eagle octopus swan tortoise fur furry spotted striped stripe spot |
| u08 | Koken en eten | biscuit butter cereal honey jam yoghurt strawberry fork knife spoon chopsticks salt pepper sugar cooker oven fridge flour mix prepare meal olives pizza snack delicious taste smell |
| u09 | Lichaam en gezondheid | elbow finger knee toe sore feel fall over bandage medicine x-ray break broken cut shampoo soap comb brush burn |
| u10 | Spullen | belt glove pocket trainers pyjamas rucksack umbrella bracelet necklace ring crown costume sunglasses envelope stamp postcard letter key file bin cushion shelf scissors glue torch wool plastic metal gold silver glass |
| u11 | Kunst en media | concert drum instrument violin tune pop music rock music art festival stage design cartoon programme channel magazine newspaper news screen online wifi |
| u12 | Sport en spel | ski snowboard snowboarding sledge snowball snowman chess golf volleyball gym club team race racing competition match prize winner win whistle swing puzzle quiz card |
| u13 | Op avontuur | adventure camp tent explore fire flag hole king queen pyramid secret surprise invitation step search find out disappear appear lie |
| u14 | School en leren | geography history maths science language subject project dictionary information study explain repeat improve problem surname member group piece bit |
| u15 | Denken en voelen | agree believe decide forget guess hope remember invent mind prefer wish hate sure strange worried interested excited pleased bored lucky |
| u16 | Mensen beschrijven | friendly unfriendly kind unkind lazy popular married husband wife poor rich lovely wonderful amazing excellent interesting important special horrible frightening enormous unhappy unusual |
| u17 | Hoe is het? | cheap expensive heavy light dark large high low deep hard soft fast full empty same noisy tidy untidy ready missing dear left front middle |
| u18 | Praten en delen | chat speak whisper conversation telephone hear sound money spend save sell borrow keep collect thank post join meet visit stay |
| u19 | Doen en bewegen | act begin finish use let repair look like turn turn on turn off pull push touch fetch follow enter go out go away look after make sure |
| u20 | Iemand en niemand | anyone anything no-one each other several anywhere everywhere nowhere somewhere else away a few a little much such enough over alone by myself by yourself together without |
| u21 | Kleine woordjes | zero thousand million kilometre thirtieth how long if as as … as also actually instead might should will perhaps quite just still suddenly usually while next happen of course no problem you're welcome if you want warm |

These tables are generated from the unit files (`content/src/en/<level>/NN-*.yaml`), which are the record of what
each unit teaches; `npm run content:trace -- en --coverage` checks that every word of a level is taught exactly once.

## B1 (`en-b1`, 28 units)

Source of every word: the **B1 Preliminary and Preliminary for Schools Vocabulary List** (August 2025,
`506887-b1-preliminary-vocabulary-list.pdf`), parsed by `scripts/content/wordlist-en-b1.js` into level `B1` of
`wordlist-en.json` (3,120 entries, 3,091 headwords, 0 unparsed lines; 23 topic lists; Appendix 1 word sets). 1,169
headwords are already on the YLE list (Starters–Flyers) and are not taught again (they are used in sentences); **1,921
headwords are new at B1** (plus 10 words that appear only in the topic lists). The course teaches **1,917** of them;
12 are omitted with a reason (below). Syllabus, grammar and topics: the **B1 Preliminary for Schools** handbook (revised
2020 exam, © 2024) — its language specifications and topic list; text types after its sample tests
(`content/src/en/SOURCES.md`).

**Audience (B1 and up).** Learners from about 11 to adult: children are older when they reach B1, and adults may
take the course. Topics and tone are for teenagers and adults — everyday life, school and study, work, money, travel, media,
technology, the environment, relationships, opinions — and everything stays **family-safe**: nothing explicit, violent or
otherwise unsuitable (weapons are omitted; war, crime and the police appear only in history, stories and everyday safety).

**Structure.** u01 is the pilot unit (two texts, locked). u02–u28 follow the topic lists of the vocabulary list
(Appendix 2) and the handbook's topic list, one topic per unit, with the B1 grammar points spread over them (column
*Topic and grammar*). Each unit has vocabulary lessons of 6–8 words (generator), one text lesson, a review lesson (with
finite-verb fill-ins, `finiteVerbFill`), a listening lesson and optional extra lessons. **29 texts** (15 readings: blog
posts, emails, notices, articles, a recipe, an interview; 14 dialogues: friends, family, a coach, a waitress, a job
interview, a hotel, the police) with 4–6 questions each (159), 2 listening questions each (56) and a typed cloze of
finite verbs with infinitive + tense hints.

**Size.** 1,917 words in 27 new units (43–91 words, about 70 on average; 1,930 sentences). The brief asked for about
20–25 units and 15–20 texts; the list has 1,921 new headwords, so 25 units would mean 80–100 words (11–14 lessons) per
unit, and the topic lists split cleanly into 27. One text per unit (the rule "at least one text lesson per unit") gives 29
texts with the pilot's two.

**Grammar** (handbook language specifications): present perfect vs past simple, present perfect with for / since, just,
already, yet (u04, u11); past continuous interrupted by the past simple (u10); past perfect (u25, u28; B1 in the English Profile, not in the handbook's inventory); future forms —
going to, will, present continuous for arrangements (u21); first conditional (u20, u24), second conditional (u19);
modals of obligation — must, have to, don't have to, mustn't, needn't, ought to, have got to (u16, u25); modals of
possibility — might, may, could, must be, can't be (u17, u22); the passive, present and past (u07, u14, u15, u23, u25);
relative clauses with who / which / that / where / whose (u06, u13, u23); reported speech, statements and questions (u14);
comparatives and superlatives, *as … as*, *not as … as* (u02, u11); gerunds and infinitives after verbs (*enjoy, fancy,
look forward to, decide to*, u12); used to (u05, u18); so / such … that, although, despite, unless, in case, in order to,
so that (u03, u27); causative have something done (u07); phrasal verbs from the list throughout. The trace checks forms,
not structures: the reviewers check that sentences use the grammar of the level.

Rules this level keeps (besides those above): every sentence word is on the YLE or B1 list (inflected), a name in
`content/src/en/wordlist-b1-names.yaml`, or — in texts — a glossary word; the pilot's *gardener* and *soil* are off the
list (`offList` in `pack.yaml`, locked); a B1 phrase may inflect its verb (*based on, got rid of*); British English;
`homophones.yaml` applies (no single-word dictation of *right/write, hear/here* …); typed English answers may write out
or contract *don't, can't, I'm, we've, they'll* (dictation grading).

### Deliberate omissions (`content/src/en/b1/pack.yaml` `omit`)

| Word | Why |
|---|---|
| bomb, gun | Weapons: the course is family-safe for learners from about 11 |
| sex | Listed as "the male/female sex"; *male* and *female* (u02) cover forms; left out of a children's course |
| cell phone, railroad, on vacation, jewelry | American English (the course is British: *mobile, railway/rail, on holiday, jewellery*) |
| driver's licence | Same meaning as *driving licence* (u22) |
| disc jockey | Same meaning as *DJ* (u13) |
| hi-fi | Dated (topic list only) |
| no one, stomach ache | Spelling variants of *no-one* (A2) and *stomach-ache* (A1), taught there |

### Units

| Unit | Title | Topic and grammar | Words | Sentences | Texts |
|---|---|---|---|---|---|
| u01 | Samen op school | School life and projects | 6 | 0 | t01 reading, t02 dialogue |
| u02 | Mensen: uiterlijk en karakter | Describing people's appearance and character; adjective order, as … as, look like / be like | 58 | 62 | t03 reading |
| u03 | Gevoelens | Feelings and reactions; -ed and -ing adjectives, make someone feel, so / such … that | 74 | 76 | t04 dialogue |
| u04 | Vrienden en relaties | Friends, relationships and getting on with people; reflexive pronouns, phrasal verbs, present perfect with for / since | 89 | 89 | t05 reading |
| u05 | Familie en feesten | Family life, growing up, celebrations and customs; used to, past simple and present perfect | 61 | 63 | t06 dialogue |
| u06 | Thuis wonen | Homes, rooms, furniture and neighbours; relative clauses with where and which | 48 | 49 | t07 reading |
| u07 | Huishouden en spullen | Housework, appliances, materials and repairs; the passive (is made of, was broken), have / get something done | 77 | 78 | t08 dialogue |
| u08 | Koken | Ingredients, recipes and cooking; imperatives and sequencing (first, then, after that), countable and uncountable nouns | 58 | 56 | t09 reading |
| u09 | Uit eten | Restaurants, cafés, tastes and diets; would like, offers, requests and recommendations | 43 | 44 | t10 dialogue |
| u10 | Gezondheid en het lichaam | The body, illness, injuries and healthy habits; past continuous interrupted by the past simple, should for advice | 61 | 63 | t11 reading |
| u11 | Sport en conditie | Sports, competitions and keeping fit; present perfect with just, already and yet, superlatives | 87 | 84 | t12 dialogue |
| u12 | Vrije tijd en hobby's | Hobbies, going out and leisure activities; verbs followed by -ing or to (enjoy, fancy, look forward to, decide to) | 50 | 51 | t13 reading |
| u13 | Film, muziek en theater | Films, TV, music and the theatre; relative clauses with who, which and that | 82 | 83 | t14 dialogue |
| u14 | Woorden, boeken en nieuws | Language, reading, writing and the news; the passive (was written by, is published), reported speech (said that) | 82 | 83 | t15 reading |
| u15 | Telefoon, computer en internet | Phones, computers, the internet and keeping in touch; the present passive (is used for), instructions, phrasal verbs (ring back, hang up) | 76 | 71 | t16 dialogue |
| u16 | School en studie | School, exams and studying; modals of obligation (must, have to, don't have to, mustn't, needn't) | 87 | 84 | t17 reading |
| u17 | Denken en meningen | Opinions, certainty and possibility; modals of possibility (might, may, could, must be, can't be), I think / I'm not sure / it depends | 91 | 94 | t18 dialogue |
| u18 | Beroepen en het werk | Jobs, companies and the workplace; present simple and continuous for jobs and temporary situations, used to | 60 | 63 | t19 reading |
| u19 | Solliciteren en carrière | Applying for a job, interviews and careers; the second conditional (If I got the job, I would …) | 54 | 57 | t20 dialogue |
| u20 | Winkelen en geld | Shops, prices, paying, banks and complaints; the first conditional, too and enough, how much / how many | 83 | 85 | t21 reading |
| u21 | Reizen en vakantie | Travelling, airports, hotels and holidays; future forms (be going to, will, the present continuous for arrangements) | 97 | 97 | t22 dialogue |
| u22 | Onderweg | Transport, roads, traffic and directions; modals of possibility (might, may, could, must be, can't be) and rules (must, mustn't) | 74 | 75 | t23 reading |
| u23 | Stad en land | Towns, buildings, regions and the countryside; relative clauses with where and whose, the passive (is situated, was built) | 64 | 64 | t24 dialogue |
| u24 | Natuur, weer en milieu | Nature, wildlife, weather and the environment; the first conditional, the passive, will for predictions | 84 | 82 | t25 reading |
| u25 | Samenleving, regels en veiligheid | Rules, the law, crime and safety, society and history; the past perfect, the passive (was stolen, were arrested), ought to and have got to | 74 | 74 | t26 dialogue |
| u26 | Kleding en mode | Clothes, fashion and appearance; adjective order, too / enough, it suits you, try on | 52 | 54 | t27 reading |
| u27 | Zinnen verbinden | Linking words, adverbs of degree and quantity; although, despite, however, unless, in case, so that, in order to | 77 | 79 | t28 dialogue |
| u28 | Tijd, getallen en meten | Time expressions, frequency, numbers, sums and measurements; the past perfect with already and after, how often, how long | 70 | 70 | t29 reading |

The table is generated from the unit files (`content/src/en/b1/NN-*.yaml`, `texts/`); `npm run content:trace -- en
--coverage` checks that every new B1 headword is taught exactly once or omitted.

## B2 (`en-b2`, 20 units, preview)

Reference: B2 First for Schools handbook (2026) and sample paper 1 (`content/src/en/SOURCES.md`); the word list is derived
(`WORDLIST.md`). Audience: learners from about 13 to adult (the for Schools exam); Dutch meanings; British English.

**Grammar (one point per unit, recycled in the texts and the key word transformations):** present perfect continuous;
gerund or infinitive; future continuous and future perfect; wish / if only; the causative (have / get something done);
advice and obligation (had better, ought to, needn't); quantifiers and so / such; reporting verbs; the passive in all
tenses; the third conditional; non-defining relative clauses; narrative tenses (past perfect continuous); modals of
deduction about the past; contrast linkers (despite, whereas, nevertheless); used to / be used to / get used to; mixed
conditionals; the impersonal passive (it is said that) and be supposed to; the future in the past; linking an argument and
emphasis (not only …, what … is); review.

**Exercise kinds:** the B1 kinds plus the B2 First task types: key word transformations (three per unit, answers of 2–5
words with the key unchanged), word formation (`form` on a sentence and `wordForm` on texts: a stem in capitals, a real
derivation), open cloze, gapped text (paragraph openers taken out, one extra sentence), multiple matching (four voices,
`match_texts`), summary, true / false / not given, listening completion; finite-verb fill-ins in the review.

**Texts (20):** 16 readings and 4 dialogues (A = the main voice Cori, female; B = the second voice, male: Priya / Sam,
Hannah / Mr Dawson, Grace / Ollie, Megan / Leon) — a school-magazine article, four voices on a first job and on volunteering,
news-site articles, a student's essay, a story, a review, a popular-science article and a letter to one's future self.
About 165–260 words each (shorter than the exam's 550–700-word Part 5 text: one exercise screen at a time).

### Units

| # | Unit | Grammar | Text |
|---|---|---|---|
| 1 | Personality and ambition | present perfect continuous | From the back row (article) |
| 2 | Learning for life | gerund / infinitive | Online or in class? (dialogue) |
| 3 | Work and careers | future continuous / perfect | My first job (four voices) |
| 4 | Money and spending | wish / if only | The invisible money (article) |
| 5 | Home and neighbourhood | causative | A leak in the bathroom (dialogue) |
| 6 | Health and fitness | had better, ought to, needn't | Small steps (article) |
| 7 | Food and eating | quantifiers, so / such | The food we throw away (article) |
| 8 | News and media | reporting verbs | The photo that fooled millions (article) |
| 9 | Inventions and technology | the passive | The young inventor (profile) |
| 10 | Climate and environment | third conditional | Should we ban single-use plastic? (essay) |
| 11 | Animals and nature | non-defining relative clauses | Island of seabirds (report) |
| 12 | Travel and adventure | narrative tenses | Lost in the mist (story) |
| 13 | Sport and competition | must / can't / might have | The quiet champion (article) |
| 14 | Music, film and the arts | contrast linkers | A night at the musical (review) |
| 15 | Friends and relationships | used to / be used to / get used to | A new town (dialogue) |
| 16 | Community and volunteering | mixed conditionals | Why I volunteer (four voices) |
| 17 | Rules, rights and the law | it is said that, be supposed to | Should sixteen-year-olds vote? (article) |
| 18 | Science and discovery | future in the past | A lucky mistake (article) |
| 19 | Debate and persuasion | linkers, not only, what … is | Should school start later? (dialogue) |
| 20 | Looking ahead | review | A letter to my future self (letter) |
