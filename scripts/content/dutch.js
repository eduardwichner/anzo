// Dutch morphology for the derived Dutch word list (wordlist-nl.js) and the Dutch trace (trace-nl-lib.js).
// Pure and hand-written, like french.js: a lemma's forms are generated forward from its part of speech (and, for nouns,
// its plural from the word list) with the spelling rules and tables below, then looked up in reverse. Kinds of forms
// (which level's grammar allows them: trace-nl-lib.js KIND_LEVEL):
//   base         the lemma itself (a noun's singular, an adjective's base form, a verb's infinitive)
//   plural       noun plural (katten, huizen, auto's, kamers)
//   present      verb present tense: stem (ik werk / werk jij), stem + t (hij werkt), infinitive (wij werken); imperative
//   inflected    adjective with -e (grote, witte, lieve, lekkere)
//   partitive    adjective + s after iets / niets / wat (iets lekkers)
//   diminutive   noun + -je / -tje / -pje / -etje / -kje, and its plural + s (kopje, stoeltje, boompje, balletje)
//   past         simple past (werkte, woonden, ging, gingen) — imperfect
//   participle   past participle (gewerkt, gewoond, gegaan, opgestaan, betaald)
//   comparative  adjective + er / der and superlative + st (groter, duurder, grootst, grootste, beter, best)
// Separable verbs are written with a bar in the word list (op|staan): their finite forms stand apart from the particle
// (ik sta op), the trace joins them; the joined forms (opstaan, opstond, opgestaan, op te staan) are generated here.

export const LEVELS = ['Start', 'A1', 'A2', 'B1', 'B2'];
// B2: the core and its two optional branches (work, study) are the same level
export const PACK_LEVEL = { 'nl-pre-a1': 'Start', 'nl-a1': 'A1', 'nl-a2': 'A2', 'nl-b1': 'B1', 'nl-b2': 'B2', 'nl-b2-work': 'B2', 'nl-b2-study': 'B2' };
export const rank = (l) => LEVELS.indexOf(l);

/** Lower-case, NFC, straight apostrophes. */
export const norm = (s) => String(s).normalize('NFC').replace(/[‘’ʼ`´]/g, "'").toLowerCase();

const VOWEL = /[aeiouy]/;
const isVowel = (c) => VOWEL.test(c ?? '');
// long vowels and diphthongs written with two letters
const DIGRAPH = /(aa|ee|oo|uu|ie|oe|ei|ij|ui|ou|au|eu)$/;

// ---- verbs ----------------------------------------------------------------------------------------------------
// Irregular verbs: present (ik / jij / hij / wij, only where they differ from the rules), past (sg pl), participle.
// Inseparable prefixes keep their prefix and take no ge- (begrijpen → begrepen); separable verbs reuse their base verb.
const IRREGULAR_VERBS = {
  zijn: { present: 'ben bent is zijn wees', past: 'was waren', pp: 'geweest' },
  hebben: { present: 'heb hebt heeft hebben', past: 'had hadden', pp: 'gehad' },
  gaan: { present: 'ga gaat gaan', past: 'ging gingen', pp: 'gegaan' },
  staan: { present: 'sta staat staan', past: 'stond stonden', pp: 'gestaan' },
  slaan: { present: 'sla slaat slaan', past: 'sloeg sloegen', pp: 'geslagen' },
  ontslaan: { present: 'ontsla ontslaat ontslaan', past: 'ontsloeg ontsloegen', pp: 'ontslagen' },
  doen: { present: 'doe doet doen', past: 'deed deden', pp: 'gedaan' },
  zien: { present: 'zie ziet zien', past: 'zag zagen', pp: 'gezien' },
  kunnen: { present: 'kan kunt kun kunnen', past: 'kon konden', pp: 'gekund' },
  willen: { present: 'wil wilt willen', past: 'wilde wou wilden', pp: 'gewild' },
  mogen: { present: 'mag mogen', past: 'mocht mochten', pp: 'gemogen gemoogd' },
  moeten: { present: 'moet moeten', past: 'moest moesten', pp: 'gemoeten' },
  zullen: { present: 'zal zult zul zullen', past: 'zou zouden', pp: '' },
  weten: { present: 'weet weten', past: 'wist wisten', pp: 'geweten' },
  komen: { present: 'kom komt komen', past: 'kwam kwamen', pp: 'gekomen' },
  worden: { past: 'werd werden', pp: 'geworden' },
  eten: { past: 'at aten', pp: 'gegeten' },
  vergeten: { past: 'vergat vergaten', pp: 'vergeten' },
  geven: { past: 'gaf gaven', pp: 'gegeven' },
  lezen: { past: 'las lazen', pp: 'gelezen' },
  nemen: { past: 'nam namen', pp: 'genomen' },
  spreken: { past: 'sprak spraken', pp: 'gesproken' },
  breken: { past: 'brak braken', pp: 'gebroken' },
  liggen: { past: 'lag lagen', pp: 'gelegen' },
  zitten: { past: 'zat zaten', pp: 'gezeten' },
  bidden: { past: 'bad baden', pp: 'gebeden' },
  vragen: { past: 'vroeg vroegen vraagde vraagden', pp: 'gevraagd' },
  zeggen: { past: 'zei zeiden zegde zegden', pp: 'gezegd' },
  dragen: { past: 'droeg droegen', pp: 'gedragen' },
  varen: { past: 'voer voeren', pp: 'gevaren' },
  vermijden: { past: 'vermeed vermeden', pp: 'vermeden' },
  laden: { past: 'laadde laadden', pp: 'geladen' },
  lachen: { past: 'lachte lachten', pp: 'gelachen' },
  bakken: { past: 'bakte bakten', pp: 'gebakken' },
  wassen: { past: 'waste wasten', pp: 'gewassen' },
  braden: { past: 'braadde braadden', pp: 'gebraden' },
  scheiden: { past: 'scheidde scheidden', pp: 'gescheiden' },
  roepen: { past: 'riep riepen', pp: 'geroepen' },
  lopen: { past: 'liep liepen', pp: 'gelopen' },
  slapen: { past: 'sliep sliepen', pp: 'geslapen' },
  laten: { past: 'liet lieten', pp: 'gelaten' },
  vallen: { past: 'viel vielen', pp: 'gevallen' },
  houden: { present: 'houd hou houdt houden', past: 'hield hielden', pp: 'gehouden' },
  hangen: { past: 'hing hingen', pp: 'gehangen' },
  vangen: { past: 'ving vingen', pp: 'gevangen' },
  helpen: { past: 'hielp hielpen', pp: 'geholpen' },
  sterven: { past: 'stierf stierven', pp: 'gestorven' },
  werpen: { past: 'wierp wierpen', pp: 'geworpen' },
  ontwerpen: { past: 'ontwierp ontwierpen', pp: 'ontworpen' },
  beginnen: { past: 'begon begonnen', pp: 'begonnen' },
  vinden: { past: 'vond vonden', pp: 'gevonden' },
  binden: { past: 'bond bonden', pp: 'gebonden' },
  drinken: { past: 'dronk dronken', pp: 'gedronken' },
  zingen: { past: 'zong zongen', pp: 'gezongen' },
  verzinnen: { past: 'verzon verzonnen', pp: 'verzonnen' },
  verbinden: { past: 'verbond verbonden', pp: 'verbonden' },
  bedriegen: { past: 'bedroog bedrogen', pp: 'bedrogen' },
  gelden: { past: 'gold golden', pp: 'gegolden' },
  werven: { past: 'wierf wierven', pp: 'geworven' },
  weerleggen: { past: 'weerlegde weerlegden', pp: 'weerlegd' },
  discussiëren: { past: 'discussieerde discussieerden', pp: 'gediscussieerd' },
  kopiëren: { present: 'kopieer kopieert kopiëren', past: 'kopieerde kopieerden', pp: 'gekopieerd' },
  updaten: { past: 'updatete updateten', pp: 'geüpdatet' },
  springen: { past: 'sprong sprongen', pp: 'gesprongen' },
  klinken: { past: 'klonk klonken', pp: 'geklonken' },
  stinken: { past: 'stonk stonken', pp: 'gestonken' },
  winnen: { past: 'won wonnen', pp: 'gewonnen' },
  zwemmen: { past: 'zwom zwommen', pp: 'gezwommen' },
  trekken: { past: 'trok trokken', pp: 'getrokken' },
  vertrekken: { past: 'vertrok vertrokken', pp: 'vertrokken' },
  schrikken: { past: 'schrok schrokken', pp: 'geschrokken' },
  schrijven: { past: 'schreef schreven', pp: 'geschreven' },
  blijven: { past: 'bleef bleven', pp: 'gebleven' },
  rijden: { past: 'reed reden', pp: 'gereden' },
  kijken: { past: 'keek keken', pp: 'gekeken' },
  lijken: { past: 'leek leken', pp: 'geleken' },
  blijken: { past: 'bleek bleken', pp: 'gebleken' },
  krijgen: { past: 'kreeg kregen', pp: 'gekregen' },
  begrijpen: { past: 'begreep begrepen', pp: 'begrepen' },
  grijpen: { past: 'greep grepen', pp: 'gegrepen' },
  bijten: { past: 'beet beten', pp: 'gebeten' },
  wijzen: { past: 'wees wezen', pp: 'gewezen' },
  snijden: { past: 'sneed sneden', pp: 'gesneden' },
  lijden: { past: 'leed leden', pp: 'geleden' },
  verdwijnen: { past: 'verdween verdwenen', pp: 'verdwenen' },
  schijnen: { past: 'scheen schenen', pp: 'geschenen' },
  stijgen: { past: 'steeg stegen', pp: 'gestegen' },
  zwijgen: { past: 'zweeg zwegen', pp: 'gezwegen' },
  ontbijten: { past: 'ontbeet ontbeten', pp: 'ontbeten' },
  vliegen: { past: 'vloog vlogen', pp: 'gevlogen' },
  liegen: { past: 'loog logen', pp: 'gelogen' },
  bieden: { past: 'bood boden', pp: 'geboden' },
  verbieden: { past: 'verbood verboden', pp: 'verboden' },
  genieten: { past: 'genoot genoten', pp: 'genoten' },
  schieten: { past: 'schoot schoten', pp: 'geschoten' },
  sluiten: { past: 'sloot sloten', pp: 'gesloten' },
  ruiken: { past: 'rook roken', pp: 'geroken' },
  kiezen: { past: 'koos kozen', pp: 'gekozen' },
  verliezen: { past: 'verloor verloren', pp: 'verloren' },
  vriezen: { past: 'vroor vroren', pp: 'gevroren' },
  wegen: { past: 'woog wogen', pp: 'gewogen' },
  bewegen: { past: 'bewoog bewogen', pp: 'bewogen' },
  buigen: { past: 'boog bogen', pp: 'gebogen' },
  schuiven: { past: 'schoof schoven', pp: 'geschoven' },
  zuigen: { past: 'zoog zogen', pp: 'gezogen' },
  denken: { past: 'dacht dachten', pp: 'gedacht' },
  brengen: { past: 'bracht brachten', pp: 'gebracht' },
  kopen: { past: 'kocht kochten', pp: 'gekocht' },
  zoeken: { past: 'zocht zochten', pp: 'gezocht' },
  verkopen: { past: 'verkocht verkochten', pp: 'verkocht' },
  bezoeken: { past: 'bezocht bezochten', pp: 'bezocht' },
  onderzoeken: { past: 'onderzocht onderzochten', pp: 'onderzocht' },
  verstaan: { past: 'verstond verstonden', pp: 'verstaan' },
  bestaan: { past: 'bestond bestonden', pp: 'bestaan' },
  ontstaan: { past: 'ontstond ontstonden', pp: 'ontstaan' },
  bevallen: { past: 'beviel bevielen', pp: 'bevallen' },
  ontvangen: { past: 'ontving ontvingen', pp: 'ontvangen' },
  vergelijken: { past: 'vergeleek vergeleken', pp: 'vergeleken' },
  ontmoeten: { past: 'ontmoette ontmoetten', pp: 'ontmoet' },
  gebeuren: { past: 'gebeurde gebeurden', pp: 'gebeurd' },
  verstrijken: { past: 'verstreek verstreken', pp: 'verstreken' },
  scheren: { past: 'schoor schoren', pp: 'geschoren' },
  wreken: { past: 'wreekte wreekten', pp: 'gewroken' },
  heten: { past: 'heette heetten', pp: 'geheten' },
  raden: { past: 'raadde raadden', pp: 'geraden' },
  stelen: { past: 'stal stalen', pp: 'gestolen' },
  steken: { past: 'stak staken', pp: 'gestoken' },
  treffen: { past: 'trof troffen', pp: 'getroffen' },
  meten: { past: 'mat maten', pp: 'gemeten' },
  treden: { past: 'trad traden', pp: 'getreden' },
  zenden: { past: 'zond zonden', pp: 'gezonden' },
  gelden: { past: 'gold golden', pp: 'gegolden' },
  schelden: { past: 'schold scholden', pp: 'gescholden' },
  smelten: { past: 'smolt smolten', pp: 'gesmolten' },
  zwellen: { past: 'zwol zwollen', pp: 'gezwollen' },
  bederven: { past: 'bedierf bedierven', pp: 'bedorven' },
  verbergen: { past: 'verborg verborgen', pp: 'verborgen' },
  bergen: { past: 'borg borgen', pp: 'geborgen' },
  waaien: { past: 'waaide woei waaiden', pp: 'gewaaid' },
  verdragen: { past: 'verdroeg verdroegen', pp: 'verdragen' },
  gieten: { past: 'goot goten', pp: 'gegoten' },
  fluiten: { past: 'floot floten', pp: 'gefloten' },
  kruipen: { past: 'kroop kropen', pp: 'gekropen' },
  duiken: { past: 'dook doken', pp: 'gedoken' },
  verbinden: { past: 'verbond verbonden', pp: 'verbonden' },
  ontdekken: { past: 'ontdekte ontdekten', pp: 'ontdekt' },
};

// Inseparable verbs with onder- / over- / vol- / mis- (the prefix is stressless: no ge-, never split): onderhouden,
// ondertekenen, overtuigen, voldoen. Listed, because volgen, overleggen (to consult: inseparable too) and the separable
// over|stappen would otherwise be guessed wrong.
const INSEPARABLE_LONG = new Set(['onderhouden', 'ondertekenen', 'onderhandelen', 'onderzoeken', 'ondernemen', 'onderbreken', 'onderscheiden',
  'overtuigen', 'overleggen', 'overleven', 'overwegen', 'overdrijven', 'overleden', 'voldoen', 'volbrengen', 'misbruiken', 'mislukken']);
/** Inseparable prefixes: no ge- in the participle (betalen → betaald, vertellen → verteld); bellen, verven are not prefixed. */
const prefixed = (inf) => {
  if (INSEPARABLE_LONG.has(inf)) return true;
  const m = inf.match(/^(be|ge|her|ver|ont|er)(.*)en$/);
  return Boolean(m && /[aeiouy]/.test(m[2]));
};

/**
 * An irregular verb with an inseparable prefix that the table does not list: the root's forms with the prefix and no ge-
 * (ontbreken → ontbrak ontbroken, bespreken → besprak besproken, beschrijven → beschreef beschreven, bestaan → bestaat,
 * verwijzen → verwees verwezen, onderhouden → onderhield onderhouden, voldoen → voldoet voldeed voldaan). null when the
 * verb is not one.
 */
function prefixedIrregular(inf) {
  if (IRREGULAR_VERBS[inf]) return IRREGULAR_VERBS[inf];
  const m = inf.match(/^(onder|over|vol|mis|be|ge|her|ver|ont|er)(.+)$/);
  if (!m || !prefixed(inf)) return null;
  const [, pre, root] = m;
  const irr = IRREGULAR_VERBS[root];
  if (!irr) return null;
  const strip = (pp) => pp.replace(/^ge/, '');
  return {
    ...(irr.present ? { present: irr.present.split(' ').map((f) => `${pre}${f}`).join(' ') } : {}),
    past: irr.past.split(' ').map((f) => `${pre}${f}`).join(' '),
    pp: irr.pp ? irr.pp.split(' ').map((f) => `${pre}${strip(f)}`).join(' ') : '',
  };
}

/** ge- before a stem that starts with e, i or u takes a diaeresis: geïsoleerd, geëindigd, geüpload. */
const ge = (stem) => (/^[eiu]/.test(stem) ? `ge${{ e: 'ë', i: 'ï', u: 'ü' }[stem[0]]}${stem.slice(1)}` : `ge${stem}`);
// Verbs in -eren / -elen with the stress on that syllable: their stem doubles the e (studeren → studeer).
const STRESSED_EREN = /(studeren|parkeren|reserveren|organiseren|controleren|telefoneren|repareren|noteren|informeren|interesseren|presenteren|accepteren|installeren|reageren|feliciteren|serveren|proberen|passeren|registreren|fotograferen|corrigeren|functioneren|irriteren|investeren|markeren|demonstreren|vaccineren|inspireren|respecteren|integreren|regeren|realiseren|annuleren|stimuleren|formuleren|sorteren|solliciteren|kamperen|amuseren|onweren|isoleren|blokkeren|recycleren|adviseren|motiveren|discussiëren|bankieren|concentreren|arresteren|protesteren|financieren|kopiëren|evalueren|reclameren|baseren|engageren|waarderen|evolueren|notuleren|rapporteren|coördineren|opereren|presteren|renoveren|variëren|creëren|manipuleren|analyseren|argumenteren|communiceren|produceren|consumeren|digitaliseren|publiceren|discrimineren|subsidiëren|evolueren|garanderen|definiëren|identificeren|illustreren|interpreteren|kritiseren|lanceren|negeren|polariseren|programmeren|riskeren|selecteren|simuleren|tolereren|transporteren|reduceren|domineren|emigreren|immigreren|reflecteren|concluderen|relativeren|archiveren|regisseren|interviewen|formeren|ventileren|activeren|automatiseren|centraliseren|controleren|reguleren|signaleren|delegeren|faciliteren|prioriteren|structureren|plaatsvinden|citeren|parafraseren|resumeren|presenteren)$/;

// Roots in -elen / -eren whose e is a full vowel although the rule below would read a schwa (oordelen = oor + delen).
const STEM_EXCEPTIONS = { oordelen: 'oordeel', beoordelen: 'beoordeel', veroordelen: 'veroordeel' };

/** The stem of a (non-separable) verb: maken → maak, zitten → zit, leven → leef, lezen → lees, studeren → studeer. */
export function verbStem(inf, prefixes = true) {
  if (STEM_EXCEPTIONS[inf]) return STEM_EXCEPTIONS[inf];
  if (/(gaan|staan|slaan)$/.test(inf)) return inf.slice(0, -2); // ga, sta, sla (also verstaan → versta)
  // an inseparable prefix: the root's stem (beweren → beweer, verdelen → verdeel, betalen → betaal, vergaderen → vergader)
  const pre = prefixes && inf.match(/^(be|ge|her|ver|ont|er)(.{4,})$/);
  if (pre && prefixed(inf) && /en$/.test(pre[2]) && /^[^aeiouy]+[aeiouy]/.test(pre[2])) return `${pre[1]}${verbStem(pre[2], false)}`;
  if (/(zien|doen)$/.test(inf)) return inf.slice(0, -1); // zie, doe
  if (!/en$/.test(inf)) return inf.replace(/n$/, '');
  let r = inf.slice(0, -2);
  if (/(ii|ij)$/.test(r)) return r;
  if (/([bcdfgklmnprstvz])\1$/.test(r)) return r.slice(0, -1); // zitt → zit, zwemm → zwem
  const last = r.slice(-1);
  const before = r.slice(-2, -1);
  const third = r.slice(-3, -2);
  const voice = (s) => s.replace(/v$/, 'f').replace(/z$/, 's');
  // single vowel + single consonant at the end of an open syllable: the vowel doubles (mak → maak, lop → loop, et → eet);
  // never before w (waarschuwen → waarschuw, sjouwen → sjouw); u + e after a consonant is two syllables (evalueren → evalueer)
  const hiatus = third === 'u' && before === 'e' && !isVowel(r.slice(-4, -3));
  if (!isVowel(last) && last !== 'w' && isVowel(before) && (!isVowel(third) || hiatus) && before !== 'i' && before !== 'y') {
    const syllables = (r.match(/[aeiouy]+/g) || []).length;
    const schwa = before === 'e' && syllables > 1 && /[lnrm]$/.test(r) && !STRESSED_EREN.test(inf);
    if (!schwa) r = `${r.slice(0, -1)}${before}${last}`;
  }
  return voice(r);
}

/** Last consonant of the infinitive before -en ('t kofschip decides between -te and -de). */
const kofschip = (inf) => {
  const r = inf.replace(/e?n$/, '');
  if (/ch$/.test(r)) return true;
  return /[tkfscphx]$/.test(r.slice(-1)) && !/[aeiou]$/.test(r);
};

/** Weak past forms: werken → werkte werkten; leven → leefde leefden; zetten → zette zetten. */
export function weakPast(inf) {
  const stem = verbStem(inf);
  const suffix = kofschip(inf) ? 'te' : 'de';
  return [`${stem}${suffix}`, `${stem}${suffix}n`];
}

/** Weak participle: werken → gewerkt; zetten → gezet; antwoorden → geantwoord; betalen → betaald. */
export function weakParticiple(inf) {
  const stem = verbStem(inf);
  const end = /[td]$/.test(stem) ? '' : kofschip(inf) ? 't' : 'd';
  return prefixed(inf) ? `${stem}${end}` : ge(`${stem}${end}`);
}

/**
 * Forms of a verb lemma. A separable lemma is written "op|staan". Returns [[form, kind]] — present and imperative are
 * one kind; a separable verb's finite base forms come back with kind 'present-split' etc. (the trace joins particle
 * and verb); its joined forms (opstaan, opstaat, opgestaan) are ordinary kinds.
 */
export function verbForms(lemma) {
  const out = [];
  const add = (f, k) => {
    if (f) out.push([f, k]);
  };
  const [particle, base] = lemma.includes('|') ? lemma.split('|') : [null, lemma];
  const irr = prefixedIrregular(base);
  const stem = verbStem(base);
  // ga / sta / sla: gaat, staat, slaat (also bestaat, verstaat)
  const third = /t$/.test(stem) ? stem : /(ga|sta|sla)$/.test(stem) ? `${stem}at` : `${stem}t`;
  const present = irr?.present ? irr.present.split(' ') : [stem, third, base];
  const past = irr?.past ? irr.past.split(' ') : weakPast(base);
  const pps = irr ? (irr.pp ? irr.pp.split(' ') : []) : [weakParticiple(base)];
  if (!particle) {
    add(base, 'base');
    for (const f of present) add(f, 'present');
    for (const f of past) add(f, 'past');
    for (const f of pps) add(f, 'participle');
    return out;
  }
  // separable: joined forms (subordinate clauses, infinitive, participle) and split finite forms
  add(`${particle}${base}`, 'base');
  for (const f of present) add(`${particle}${f}`, 'present');
  for (const f of past) add(`${particle}${f}`, 'past');
  for (const f of pps) add(`${particle}${f}`, 'participle'); // op + gestaan, terug + betaald
  for (const f of present) add(f, 'present-split');
  for (const f of past) add(f, 'past-split');
  add(base, 'infinitive-split'); // op te staan, moet opstaan → "op … staan" never; "om op te staan"
  return out;
}

// ---- nouns ----------------------------------------------------------------------------------------------------
/** Diminutives of a noun (without article): kop → kopje, stoel → stoeltje, boom → boompje, bal → balletje. */
export function diminutive(noun) {
  const w = noun;
  const IRR = { jongen: 'jongetje', meisje: 'meisje', blad: 'blaadje', schip: 'scheepje', gat: 'gaatje', glas: 'glaasje', pad: 'paadje', rad: 'raadje', vat: 'vaatje', lot: 'lootje', spel: 'spelletje', weg: 'weggetje', dak: 'dakje', kind: 'kindje', ei: 'eitje' };
  if (IRR[w]) return [IRR[w]];
  if (/(je|tje)$/.test(w)) return [w];
  if (/ing$/.test(w) && (w.match(/[aeiouy]+/g) || []).length > 1) return [`${w.slice(0, -1)}kje`];
  if (/[aiouy]$/.test(w) && !DIGRAPH.test(w)) return [`${w}${w.slice(-1)}tje`]; // auto → autootje, oma → omaatje
  if (DIGRAPH.test(w) || /e$/.test(w)) return [`${w}tje`]; // zee → zeetje, tante → tantetje
  const last = w.slice(-1);
  const before = w.slice(-2, -1);
  const third = w.slice(-3, -2);
  const syllables = (w.match(/[aeiouy]+/g) || []).length;
  const shortVowel = isVowel(before) && !isVowel(third);
  const schwaSyllable = syllables > 1 && before === 'e' && !isVowel(third);
  if (/[lnrw]$/.test(w)) {
    if (shortVowel && !schwaSyllable) return [`${w}${last}etje`]; // bal → balletje, pen → pennetje
    return [`${w}tje`]; // stoel → stoeltje, tafel → tafeltje
  }
  if (/ng$/.test(w) && syllables === 1) return [`${w}etje`]; // ring → ringetje
  if (/m$/.test(w)) {
    if (shortVowel && !schwaSyllable) return [`${w}metje`]; // kam → kammetje
    return [`${w}pje`]; // boom → boompje, bezem → bezempje
  }
  return [`${w}je`];
}

/** Plural candidates when the word list gives none (attestation scanning only): -en with spelling, -s, 's. */
export function guessPlurals(noun) {
  const w = noun;
  if (/je$/.test(w)) return [`${w}s`];
  if (/[aiouy]$/.test(w) && !DIGRAPH.test(w)) return [`${w}'s`];
  if (/e$/.test(w) && !/ee$/.test(w)) return [`${w}s`, `${w}n`];
  if (/(el|em|en|er|aar)$/.test(w) && (w.match(/[aeiouy]+/g) || []).length > 1) return [`${w}s`, `${w}en`];
  const out = [`${w}en`, `${w}s`];
  const last = w.slice(-1);
  const before = w.slice(-2, -1);
  const third = w.slice(-3, -2);
  if (!isVowel(last) && isVowel(before) && !isVowel(third)) out.push(`${w}${last}en`); // kat → katten
  const m = w.match(/^(.*?)(aa|ee|oo|uu)([^aeiouy])$/);
  if (m) out.push(`${m[1]}${m[2][0]}${m[3].replace('f', 'v').replace('s', 'z')}en`); // boom → bomen, kaas → kazen
  const d = w.match(/^(.*?)(ie|oe|ei|ij|ui|ou|au|eu)([fs])$/);
  if (d) out.push(`${d[1]}${d[2]}${d[3] === 'f' ? 'v' : 'z'}en`); // brief → brieven, huis → huizen
  return out;
}

// ---- adjectives ----------------------------------------------------------------------------------------------
const UNINFLECTED_ADJ = new Set(['oranje', 'roze', 'lila', 'beige', 'gratis', 'open', 'eigen', 'extra', 'stuk', 'kapot', 'klaar', 'tevreden', 'verlegen']);
const IRREGULAR_COMPARATIVE = { goed: ['beter', 'best', 'beste'], veel: ['meer', 'meest', 'meeste'], weinig: ['minder', 'minst', 'minste'], graag: ['liever', 'liefst', 'liefste'], dichtbij: ['dichterbij'] };

/** The adjective with -e: groot → grote, wit → witte, lief → lieve, lekker → lekkere, mooi → mooie. */
export function inflected(adj) {
  const a = adj;
  // -e adjectives (moe, oranje) and schwa -en participles (gesloten, gebakken) take no -e; groen, bruin do
  if (UNINFLECTED_ADJ.has(a) || /e$/.test(a) || (/[^aeiouy]en$/.test(a) && (a.match(/[aeiouy]+/g) || []).length > 1)) return [];
  const last = a.slice(-1);
  const before = a.slice(-2, -1);
  const third = a.slice(-3, -2);
  const syllables = (a.match(/[aeiouy]+/g) || []).length;
  if (isVowel(last) || /[wj]$/.test(a)) return [`${a}e`]; // mooi(e), blauw(e)
  if (/(ig|lijk|isch|ijk|el|er|em|en)$/.test(a) && syllables > 1 && !/(aal|eel|ool|uul|eer)$/.test(a)) return [`${a}e`]; // lekker → lekkere
  // -ieel: the e that opens the next syllable after i takes a diaeresis (financieel → financiële, officieel → officiële)
  const ie = a.match(/^(.*i)eel$/);
  if (ie) return [`${ie[1]}ële`];
  const m = a.match(/^(.*?)(aa|ee|oo|uu)([^aeiouy])$/);
  if (m) return [`${m[1]}${m[2][0]}${m[3].replace(/f$/, 'v').replace(/s$/, 'z')}e`]; // groot → grote, boos → boze, normaal → normale
  const d = a.match(/^(.*?)(ie|oe|ei|ij|ui|ou|au|eu)([fs])$/);
  if (d) return [`${d[1]}${d[2]}${d[3] === 'f' ? 'v' : 'z'}e`]; // lief → lieve, grijs → grijze, nerveus → nerveuze
  if (!isVowel(last) && isVowel(before) && !isVowel(third)) return [`${a}${last}e`]; // dik → dikke, wit → witte, fris → frisse
  return [`${a}e`]; // klein → kleine, interessant → interessante
}

/** Comparative and superlative forms: groot → groter grootst grootste; duur → duurder duurst; goed → beter best. */
export function comparatives(adj) {
  if (IRREGULAR_COMPARATIVE[adj]) return IRREGULAR_COMPARATIVE[adj];
  const inf = inflected(adj)[0] ?? adj;
  const stemC = inf.replace(/e$/, '');
  const comp = /r$/.test(adj) ? `${adj}der` : `${stemC}er`;
  const sup = /s$/.test(adj) ? `${adj}t` : `${adj}st`;
  return [comp, `${comp}e`, sup, `${sup}e`];
}

// ---- numbers ---------------------------------------------------------------------------------------------------
const NL_UNITS = ['nul', 'één', 'twee', 'drie', 'vier', 'vijf', 'zes', 'zeven', 'acht', 'negen', 'tien', 'elf', 'twaalf', 'dertien',
  'veertien', 'vijftien', 'zestien', 'zeventien', 'achttien', 'negentien'];
const NL_TENS = ['', '', 'twintig', 'dertig', 'veertig', 'vijftig', 'zestig', 'zeventig', 'tachtig', 'negentig'];
/** The Dutch number word of 0–1000 (as server/src/content/grading.js dutchNumber). */
export function numberWord(n) {
  if (!Number.isInteger(n) || n < 0 || n > 1000) return null;
  if (n === 1000) return 'duizend';
  if (n >= 100) {
    const h = Math.floor(n / 100);
    const rest = n % 100;
    const head = `${h === 1 ? '' : numberWord(h)}honderd`;
    return rest ? `${head}${rest === 1 ? 'een' : numberWord(rest)}` : head;
  }
  if (n < 20) return NL_UNITS[n];
  const u = n % 10;
  if (!u) return NL_TENS[Math.floor(n / 10)];
  const unit = u === 1 ? 'een' : NL_UNITS[u];
  return `${unit}${unit.endsWith('e') ? 'ën' : 'en'}${NL_TENS[Math.floor(n / 10)]}`;
}
/** Number word -> value (0–1000), with eenentwintig, een (1). */
export const NUMBER_VALUE = (() => {
  const m = new Map();
  for (let n = 0; n <= 1000; n++) m.set(numberWord(n), n);
  return m;
})();

// ---- all forms of an entry ---------------------------------------------------------------------------------------
/**
 * Every generated form of a word-list entry { lemma, pos, plural? }: [[form, kind]]. Multi-word lemmas ('s morgens,
 * de hele dag, tot ziens) generate only themselves; the trace matches them as sequences.
 */
export function formsOf(entry) {
  const out = [[entry.lemma, 'base']];
  if (/\s/.test(entry.lemma)) return out;
  switch (entry.pos) {
    case 'noun': {
      for (const p of (entry.plural && entry.plural !== '-' ? entry.plural.split('/') : [])) out.push([p, 'plural']);
      if (!entry.noDiminutive) for (const d of diminutive(entry.lemma)) out.push([d, 'diminutive'], [`${d}s`, 'diminutive']);
      break;
    }
    case 'verb':
      return verbForms(entry.lemma);
    case 'determiner':
      // welk → welke, elk → elke, ieder → iedere, zulk → zulke
      if (/^(welk|elk|ieder|zulk|ander|enig|sommig|vorig|volgend)$/.test(entry.lemma)) out.push([`${entry.lemma}e`, 'inflected']);
      // used as a pronoun for people: sommigen, enigen, beiden (sommigen zijn nu mijn vrienden)
      if (/^(sommige|beide)$/.test(entry.lemma)) out.push([`${entry.lemma}n`, 'inflected']);
      if (/^(sommig|enig)$/.test(entry.lemma)) out.push([`${entry.lemma}en`, 'inflected']);
      break;
    case 'adverb':
      // the few adverbs with a comparative: vaak → vaker, vaakst (A2 grammar, like adjectives)
      if (ADVERB_COMPARE[entry.lemma]) for (const f of ADVERB_COMPARE[entry.lemma]) out.push([f, 'comparative']);
      break;
    case 'adjective': {
      for (const f of inflected(entry.lemma)) out.push([f, 'inflected']);
      // ander used as a pronoun for people: anderen (contact met anderen), like sommigen
      if (entry.lemma === 'ander') out.push(['anderen', 'inflected']);
      out.push([`${entry.lemma}s`, 'partitive']);
      if (!entry.noCompare) for (const f of comparatives(entry.lemma)) out.push([f, 'comparative']);
      break;
    }
    default:
      break;
  }
  return out;
}

const ADVERB_COMPARE = { weinig: ['minder', 'minst'], veel: ['meer', 'meest'], erg: ['erger', 'ergst'], vaak: ['vaker', 'vaakst'], dikwijls: ['dikwijler'], laat: ['later', 'laatst'], vroeg: ['vroeger', 'vroegst'] };

// ---- tokenizer ---------------------------------------------------------------------------------------------------
/**
 * Words of a text: lower-case (original kept), apostrophes inside a word kept (auto's, z'n), a leading 's / 't as its
 * own token, hyphenated words kept whole (e-mail); digits as numbers. Punctuation dropped.
 */
export function tokenize(text) {
  const out = [];
  const s = String(text).normalize('NFC').replace(/[‘’ʼ`´]/g, "'");
  const re = /'s(?=\s)|'t(?=\s)|[\p{L}\p{N}]+(?:['-][\p{L}\p{N}]+)*/gu;
  let m;
  // a capitalised één is written Eén: its lower-case form is één
  while ((m = re.exec(s))) out.push({ word: m[0].toLowerCase().replace(/^eén$/, 'één'), original: m[0] });
  return out;
}
