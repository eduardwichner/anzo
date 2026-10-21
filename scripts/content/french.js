// French morphology for the derived DELF Prim word list (wordlist-fr.js) and the French trace (trace-fr.js).
// Pure and hand-written: a lemma's forms are generated forward from its part of speech, gender and the tables below,
// then looked up in reverse. Kinds of forms (which level's grammar allows them: trace-fr.js):
//   base        the lemma itself
//   plural      noun/adjective plural (chats, yeux, chevaux, beaux)
//   feminine    adjective (or person noun) feminine, singular or plural (petite, gentilles, amie, chanteuse)
//   present     verb present tense (all persons)
//   imperative  verb imperative (tu / nous / vous)
//   participle  past participle, with agreement (mangé, partie, allés) — passé composé (A2)
//   infinitive  = base for verbs
//   imparfait, futur, conditionnel, subjonctif (présent), gerondif (en venant) — B1 grammar; below B1 only as forms attested in the papers
// (plus-que-parfait = imparfait of avoir/être + participle: no forms of its own).

export const LEVELS = ['A1.1', 'A1', 'A2', 'B1', 'B2'];
// fr-b1: the DELF junior/scolaire B1 papers add the B1 level of the derived list
export const PACK_LEVEL = { 'fr-a1-1': 'A1.1', 'fr-a1': 'A1', 'fr-a2': 'A2', 'fr-b1': 'B1', 'fr-b2': 'B2' };
export const rank = (l) => LEVELS.indexOf(l);

/** Lower-case, NFC, straight apostrophes. */
export const norm = (s) => String(s).normalize('NFC').replace(/[‘’ʼ`´]/g, "'").toLowerCase();

// ---- elision, contraction --------------------------------------------------------------------------------
/** Elided form -> full word (lemma). c' = ce; jusqu' = jusque. */
export const ELISIONS = { "l'": 'le', "j'": 'je', "m'": 'me', "t'": 'te', "d'": 'de', "n'": 'ne', "qu'": 'que', "s'": 'se', "c'": 'ce', "jusqu'": 'jusque', "lorsqu'": 'lorsque', "puisqu'": 'puisque' };
/** Contractions of à/de with the definite article. "des" is also the plural indefinite article (lemma un). */
export const CONTRACTIONS = { au: ['à', 'le'], aux: ['à', 'le'], du: ['de', 'le'], des: ['de', 'le'] };

// ---- nouns and adjectives ----------------------------------------------------------------------------------
const IRREGULAR_PLURAL = { 'œil': ['yeux'], ciel: ['ciels', 'cieux'], travail: ['travaux'], 'bonhomme': ['bonshommes'], madame: ['mesdames'], monsieur: ['messieurs'], mademoiselle: ['mesdemoiselles'], 'grand-mère': ['grands-mères'], 'grand-père': ['grands-pères'], 'grand-parent': ['grands-parents'], 'petit-déjeuner': ['petits-déjeuners'], 'arc-en-ciel': ['arcs-en-ciel'] };
const INVARIANT_PLURAL_AL = new Set(['bal', 'festival', 'carnaval', 'récital', 'chacal']);
const AIL_AUX = new Set(['travail', 'corail', 'vitrail', 'émail']);
const OU_X = new Set(['bijou', 'caillou', 'chou', 'genou', 'hibou', 'joujou', 'pou']);

export function plural(w) {
  if (IRREGULAR_PLURAL[w]) return IRREGULAR_PLURAL[w];
  if (/[sxz]$/.test(w)) return [w];
  if (/al$/.test(w) && !INVARIANT_PLURAL_AL.has(w)) return [`${w.slice(0, -2)}aux`];
  if (AIL_AUX.has(w)) return [`${w.slice(0, -3)}aux`];
  if (/(eau|au|eu)$/.test(w) && !['pneu', 'bleu'].includes(w)) return [`${w}x`];
  if (OU_X.has(w)) return [`${w}x`];
  return [`${w}s`];
}

const IRREGULAR_FEMININE = {
  beau: ['belle', 'bel'], nouveau: ['nouvelle', 'nouvel'], vieux: ['vieille', 'vieil'], fou: ['folle'], mou: ['molle'],
  long: ['longue'], frais: ['fraîche'], gros: ['grosse'], roux: ['rousse'], doux: ['douce'], faux: ['fausse'], blanc: ['blanche'],
  franc: ['franche'], sec: ['sèche'], gentil: ['gentille'], bas: ['basse'], épais: ['épaisse'], las: ['lasse'], gras: ['grasse'],
  favori: ['favorite'], public: ['publique'], grec: ['grecque'], turc: ['turque'], malin: ['maligne'], bon: ['bonne'],
  copain: ['copine'], roi: ['reine'], homme: [], garçon: [], père: [], frère: [], oncle: [], fils: [], neveu: ['nièce'],
  héros: ['héroïne'], prince: ['princesse'], maître: ['maîtresse'], directeur: ['directrice'], acteur: ['actrice'],
  instituteur: ['institutrice'], dessinateur: ['dessinatrice'], facteur: ['factrice'], vendeur: ['vendeuse'], serveur: ['serveuse'],
  coiffeur: ['coiffeuse'], chanteur: ['chanteuse'], danseur: ['danseuse'], joueur: ['joueuse'], nageur: ['nageuse'], menteur: ['menteuse'],
  meilleur: ['meilleure'], supérieur: ['supérieure'], extérieur: ['extérieure'], intérieur: ['intérieure'], inférieur: ['inférieure'],
  seul: ['seule'], don: [], pion: [], champion: ['championne'],
  chat: ['chatte'], lion: ['lionne'], loup: ['louve'], cheval: ['jument'], tigre: ['tigresse'], âne: ['ânesse'], dieu: ['déesse'],
};

/** Feminine singular forms of an adjective (or a person noun). */
export function feminine(w) {
  if (w in IRREGULAR_FEMININE) return IRREGULAR_FEMININE[w];
  if (/e$/.test(w)) return [w];
  if (/eux$/.test(w)) return [`${w.slice(0, -1)}se`];
  // -teur before -eur: conducteur → conductrice (also -teuse, chanteur → chanteuse).
  if (/teur$/.test(w)) return [`${w.slice(0, -3)}rice`, `${w.slice(0, -1)}se`];
  if (/eur$/.test(w)) return [`${w.slice(0, -1)}se`, `${w}e`];
  if (/if$/.test(w)) return [`${w.slice(0, -1)}ve`];
  if (/er$/.test(w)) return [`${w.slice(0, -2)}ère`];
  if (/(el|eil|ul)$/.test(w)) return [`${w}le`];
  if (/(en|on)$/.test(w)) return [`${w}ne`];
  if (/et$/.test(w) && !['complet', 'inquiet', 'secret', 'concret', 'discret'].includes(w)) return [`${w}te`];
  if (['complet', 'inquiet', 'secret', 'concret', 'discret'].includes(w)) return [`${w.slice(0, -2)}ète`];
  return [`${w}e`];
}

// ---- verbs ---------------------------------------------------------------------------------------------------
// Irregular verbs: present (je tu il nous vous ils), past participle, imperative (tu nous vous; omitted = from present).
const IRREGULAR_VERBS = {
  'être': { present: 'suis es est sommes êtes sont', pp: 'été', imp: 'sois soyons soyez' },
  avoir: { present: 'ai as a avons avez ont', pp: 'eu', imp: 'aie ayons ayez' },
  aller: { present: 'vais vas va allons allez vont', pp: 'allé', imp: 'va allons allez' },
  faire: { present: 'fais fais fait faisons faites font', pp: 'fait' },
  dire: { present: 'dis dis dit disons dites disent', pp: 'dit' },
  venir: { present: 'viens viens vient venons venez viennent', pp: 'venu' },
  devenir: { present: 'deviens deviens devient devenons devenez deviennent', pp: 'devenu' },
  souvenir: { present: 'souviens souviens souvient souvenons souvenez souviennent', pp: 'souvenu' },
  revenir: { present: 'reviens reviens revient revenons revenez reviennent', pp: 'revenu' },
  tenir: { present: 'tiens tiens tient tenons tenez tiennent', pp: 'tenu' },
  pouvoir: { present: 'peux/puis peux peut pouvons pouvez peuvent', pp: 'pu', imp: '' },
  vouloir: { present: 'veux veux veut voulons voulez veulent', pp: 'voulu', imp: 'veuille veuillons veuillez' },
  devoir: { present: 'dois dois doit devons devez doivent', pp: 'dû/due/dus/dues', imp: '' },
  savoir: { present: 'sais sais sait savons savez savent', pp: 'su', imp: 'sache sachons sachez' },
  prendre: { present: 'prends prends prend prenons prenez prennent', pp: 'pris' },
  apprendre: { present: 'apprends apprends apprend apprenons apprenez apprennent', pp: 'appris' },
  comprendre: { present: 'comprends comprends comprend comprenons comprenez comprennent', pp: 'compris' },
  mettre: { present: 'mets mets met mettons mettez mettent', pp: 'mis' },
  voir: { present: 'vois vois voit voyons voyez voient', pp: 'vu' },
  lire: { present: 'lis lis lit lisons lisez lisent', pp: 'lu' },
  'écrire': { present: 'écris écris écrit écrivons écrivez écrivent', pp: 'écrit' },
  boire: { present: 'bois bois boit buvons buvez boivent', pp: 'bu' },
  dormir: { present: 'dors dors dort dormons dormez dorment', pp: 'dormi' },
  endormir: { present: 'endors endors endort endormons endormez endorment', pp: 'endormi' },
  sortir: { present: 'sors sors sort sortons sortez sortent', pp: 'sorti' },
  partir: { present: 'pars pars part partons partez partent', pp: 'parti' },
  sentir: { present: 'sens sens sent sentons sentez sentent', pp: 'senti' },
  servir: { present: 'sers sers sert servons servez servent', pp: 'servi' },
  courir: { present: 'cours cours court courons courez courent', pp: 'couru' },
  'connaître': { present: 'connais connais connaît connaissons connaissez connaissent', pp: 'connu' },
  'reconnaître': { present: 'reconnais reconnais reconnaît reconnaissons reconnaissez reconnaissent', pp: 'reconnu' },
  'paraître': { present: 'parais parais paraît paraissons paraissez paraissent', pp: 'paru' },
  'disparaître': { present: 'disparais disparais disparaît disparaissons disparaissez disparaissent', pp: 'disparu' },
  ouvrir: { present: 'ouvre ouvres ouvre ouvrons ouvrez ouvrent', pp: 'ouvert' },
  offrir: { present: 'offre offres offre offrons offrez offrent', pp: 'offert' },
  couvrir: { present: 'couvre couvres couvre couvrons couvrez couvrent', pp: 'couvert' },
  'découvrir': { present: 'découvre découvres découvre découvrons découvrez découvrent', pp: 'découvert' },
  recevoir: { present: 'reçois reçois reçoit recevons recevez reçoivent', pp: 'reçu' },
  conduire: { present: 'conduis conduis conduit conduisons conduisez conduisent', pp: 'conduit' },
  construire: { present: 'construis construis construit construisons construisez construisent', pp: 'construit' },
  rompre: { present: 'romps romps rompt rompons rompez rompent', pp: 'rompu' },
  convaincre: { present: 'convaincs convaincs convainc convainquons convainquez convainquent', pp: 'convaincu' },
  croire: { present: 'crois crois croit croyons croyez croient', pp: 'cru' },
  vivre: { present: 'vis vis vit vivons vivez vivent', pp: 'vécu' },
  suivre: { present: 'suis suis suit suivons suivez suivent', pp: 'suivi' },
  rire: { present: 'ris ris rit rions riez rient', pp: 'ri' },
  sourire: { present: 'souris souris sourit sourions souriez sourient', pp: 'souri' },
  falloir: { present: '- - faut - - -', pp: 'fallu', imp: '' },
  pleuvoir: { present: '- - pleut - - -', pp: 'plu', imp: '' },
  neiger: { present: '- - neige - - -', pp: 'neigé', imp: '' },
  mourir: { present: 'meurs meurs meurt mourons mourez meurent', pp: 'mort' },
  'naître': { present: 'nais nais naît naissons naissez naissent', pp: 'né' },
  plaire: { present: 'plais plais plaît plaisons plaisez plaisent', pp: 'plu' },
  peindre: { present: 'peins peins peint peignons peignez peignent', pp: 'peint' },
  'éteindre': { present: 'éteins éteins éteint éteignons éteignez éteignent', pp: 'éteint' },
  asseoir: { present: 'assieds assieds assied asseyons asseyez asseyent', pp: 'assis' },
  battre: { present: 'bats bats bat battons battez battent', pp: 'battu' },
  envoyer: { present: 'envoie envoies envoie envoyons envoyez envoient', pp: 'envoyé' },
  essayer: { present: 'essaie/essaye essaies/essayes essaie/essaye essayons essayez essaient/essayent', pp: 'essayé' },
  payer: { present: 'paie/paye paies/payes paie/paye payons payez paient/payent', pp: 'payé' },
  nettoyer: { present: 'nettoie nettoies nettoie nettoyons nettoyez nettoient', pp: 'nettoyé' },
  appuyer: { present: 'appuie appuies appuie appuyons appuyez appuient', pp: 'appuyé' },
  ennuyer: { present: 'ennuie ennuies ennuie ennuyons ennuyez ennuient', pp: 'ennuyé' },
  // B1
  'décevoir': { present: 'déçois déçois déçoit décevons décevez déçoivent', pp: 'déçu' },
  apercevoir: { present: 'aperçois aperçois aperçoit apercevons apercevez aperçoivent', pp: 'aperçu' },
  concevoir: { present: 'conçois conçois conçoit concevons concevez conçoivent', pp: 'conçu' },
  cueillir: { present: 'cueille cueilles cueille cueillons cueillez cueillent', pp: 'cueilli' },
  accueillir: { present: 'accueille accueilles accueille accueillons accueillez accueillent', pp: 'accueilli' },
  atteindre: { present: 'atteins atteins atteint atteignons atteignez atteignent', pp: 'atteint' },
  craindre: { present: 'crains crains craint craignons craignez craignent', pp: 'craint' },
  rejoindre: { present: 'rejoins rejoins rejoint rejoignons rejoignez rejoignent', pp: 'rejoint' },
  plaindre: { present: 'plains plains plaint plaignons plaignez plaignent', pp: 'plaint' },
  conclure: { present: 'conclus conclus conclut concluons concluez concluent', pp: 'conclu' },
  suffire: { present: 'suffis suffis suffit suffisons suffisez suffisent', pp: 'suffi' },
  'résoudre': { present: 'résous résous résout résolvons résolvez résolvent', pp: 'résolu' },
  'apparaître': { present: 'apparais apparais apparaît apparaissons apparaissez apparaissent', pp: 'apparu' },
  aboyer: { present: 'aboie aboies aboie aboyons aboyez aboient', pp: 'aboyé' },
  employer: { present: 'emploie emploies emploie employons employez emploient', pp: 'employé' },
  extraire: { present: 'extrais extrais extrait extrayons extrayez extraient', pp: 'extrait' },
  valoir: { present: 'vaux vaux vaut valons valez valent', pp: 'valu', imp: '' },
  'se taire': { present: 'tais tais tait taisons taisez taisent', pp: 'tu' },
};
// Compounds conjugated like their base verb (permettre like mettre).
const COMPOUND_OF = {
  permettre: 'mettre', promettre: 'mettre', remettre: 'mettre', admettre: 'mettre', transmettre: 'mettre',
  surprendre: 'prendre', reprendre: 'prendre', entreprendre: 'prendre', revivre: 'vivre', survivre: 'vivre',
  reproduire: 'conduire', produire: 'conduire', réduire: 'conduire', traduire: 'conduire', introduire: 'conduire', détruire: 'conduire',
  obtenir: 'tenir', retenir: 'tenir', contenir: 'tenir', appartenir: 'tenir', maintenir: 'tenir', soutenir: 'tenir',
  prévenir: 'venir', intervenir: 'venir', parvenir: 'venir', décrire: 'écrire', inscrire: 'écrire', relire: 'lire', élire: 'lire',
  revoir: 'voir', prévoir: 'voir', repartir: 'partir', ressentir: 'sentir', parcourir: 'courir', combattre: 'battre',
  reconstruire: 'construire', interdire: 'dire', redire: 'dire', contredire: 'dire', prédire: 'dire', interrompre: 'rompre',
};
// -duire / -truire verbs: produis produit produisons produisent, produit
for (const verb of ['produire', 'reproduire', 'réduire', 'traduire', 'introduire', 'détruire']) {
  const st = verb.slice(0, -2);
  IRREGULAR_VERBS[verb] = { present: `${st}s ${st}s ${st}t ${st}sons ${st}sez ${st}sent`, pp: `${st}t` };
}
for (const [verb, base] of Object.entries(COMPOUND_OF)) {
  const prefix = verb.slice(0, verb.length - base.length);
  const b = IRREGULAR_VERBS[base];
  if (!b || IRREGULAR_VERBS[verb] || !verb.endsWith(base)) continue;
  const pre = (list) => list.split(' ').map((f) => (f === '-' ? f : f.split('/').map((x) => prefix + x).join('/'))).join(' ');
  IRREGULAR_VERBS[verb] = { present: pre(b.present), pp: b.pp.split('/').map((x) => prefix + x).join('/'), ...(b.imp !== undefined ? { imp: b.imp ? pre(b.imp) : '' } : {}) };
}

// inscrire is écrire with in- for s- (not a prefix of the written form)
IRREGULAR_VERBS.inscrire = { present: 'inscris inscris inscrit inscrivons inscrivez inscrivent', pp: 'inscrit' };

// Future/conditional stems of irregular verbs (other verbs: the infinitive, -re verbs without the final e).
const FUTURE_STEM = {
  'être': 'ser', avoir: 'aur', aller: 'ir', faire: 'fer', pouvoir: 'pourr', vouloir: 'voudr', devoir: 'devr', savoir: 'saur',
  venir: 'viendr', revenir: 'reviendr', devenir: 'deviendr', tenir: 'tiendr', voir: 'verr', envoyer: 'enverr', falloir: 'faudr',
  pleuvoir: 'pleuvr', courir: 'courr', mourir: 'mourr', recevoir: 'recevr', 'asseoir': 'assiér', acheter: 'achèter',
  'décevoir': 'décevr', apercevoir: 'apercevr', concevoir: 'concevr', cueillir: 'cueiller', accueillir: 'accueiller', valoir: 'vaudr', aboyer: 'aboier',
  employer: 'emploier', obtenir: 'obtiendr', retenir: 'retiendr', contenir: 'contiendr', appartenir: 'appartiendr',
  maintenir: 'maintiendr', soutenir: 'soutiendr', prévenir: 'préviendr', intervenir: 'interviendr', parvenir: 'parviendr',
  revoir: 'reverr', parcourir: 'parcourr',
  appeler: 'appeller', jeter: 'jetter', essayer: 'essaier', payer: 'paier', nettoyer: 'nettoier', lever: 'lèver', promener: 'promèner',
};
// Imparfait stems that are not the "nous" present stem.
const IMPARFAIT_STEM = { 'être': 'ét', falloir: 'fall', pleuvoir: 'pleuv', neiger: 'neige' };

/** Imparfait, futur simple and conditionnel forms. Only forms attested in the papers are allowed in content. */
export function otherTenses(inf) {
  const v = inf.replace(/^se |^s'/, '');
  const pres = verbForms(v).present;
  const nous = pres.find((f) => /ons$/.test(f) && f !== 'sommes');
  const impStem = IMPARFAIT_STEM[v] ?? (nous ? nous.slice(0, -3) : null);
  const futStem = FUTURE_STEM[v] ?? (/re$/.test(v) ? v.slice(0, -1) : v);
  // before -i- the spelling stem loses its e / cedilla: nous mangeons -> mangions, nous commençons -> commencions
  const soft = (stem, e) => (e.startsWith('i') ? stem.replace(/ge$/, 'g').replace(/ç$/, 'c') : stem);
  const imp = impStem ? ['ais', 'ait', 'ions', 'iez', 'aient'].map((e) => soft(impStem, e) + e) : [];
  const fut = ['ai', 'as', 'a', 'ons', 'ez', 'ont'].map((e) => futStem + e);
  const cond = ['ais', 'ait', 'ions', 'iez', 'aient'].map((e) => futStem + e);
  return { imparfait: imp, futur: fut, conditionnel: cond };
}

// Subjonctif présent of irregular verbs (je tu il nous vous ils); other verbs: the "ils" present stem + -e -es -e -ent and
// the imparfait stem + -ions -iez (qu'ils viennent, que nous venions).
const SUBJONCTIF = {
  'être': 'sois sois soit soyons soyez soient', avoir: 'aie aies ait ayons ayez aient', aller: 'aille ailles aille allions alliez aillent',
  faire: 'fasse fasses fasse fassions fassiez fassent', pouvoir: 'puisse puisses puisse puissions puissiez puissent',
  savoir: 'sache saches sache sachions sachiez sachent', vouloir: 'veuille veuilles veuille voulions vouliez veuillent',
  falloir: '- - faille - - -', pleuvoir: '- - pleuve - - -', valoir: 'vaille vailles vaille valions valiez vaillent',
};

/** Subjonctif présent forms (B1: il faut que, vouloir que, avant que, pour que). */
export function subjonctif(inf) {
  const v = inf.replace(/^se |^s'/, '');
  if (SUBJONCTIF[v]) return SUBJONCTIF[v].split(' ').filter((f) => f !== '-');
  const pres = verbForms(v).present;
  const ils = pres.filter((f) => /ent$/.test(f) && f !== 'sont').at(-1) ?? null; // the last person (vient is il)
  const tenses = otherTenses(v);
  const nous = tenses.imparfait.find((f) => /ions$/.test(f));
  if (!ils) return [];
  const stem = ils.slice(0, -3);
  const out = [`${stem}e`, `${stem}es`, `${stem}ent`];
  if (nous) out.push(nous, nous.replace(/ions$/, 'iez'));
  return out;
}

/** Present participle / gérondif (en venant): the "nous" stem + -ant; être étant, avoir ayant, savoir sachant. */
export function participePresent(inf) {
  const v = inf.replace(/^se |^s'/, '');
  const special = { 'être': 'étant', avoir: 'ayant', savoir: 'sachant' };
  if (special[v]) return [special[v]];
  const nous = verbForms(v).present.find((f) => /ons$/.test(f));
  return nous ? [`${nous.slice(0, -3)}ant`] : [];
}

/** Stem changes of -er verbs in the singular and 3rd plural (je, tu, il, ils): appeler -> appelle, acheter -> achète. */
const ER_STRONG_STEM = {
  appeler: 'appell', rappeler: 'rappell', jeter: 'jett', épeler: 'épell',
  acheter: 'achèt', lever: 'lèv', enlever: 'enlèv', soulever: 'soulèv', promener: 'promèn', emmener: 'emmèn', amener: 'amèn', geler: 'gèl', peser: 'pès',
  préférer: 'préfèr', répéter: 'répèt', espérer: 'espèr', compléter: 'complèt', sécher: 'sèch', célébrer: 'célèbr',
  inquiéter: 'inquièt', posséder: 'possèd', considérer: 'considèr', protéger: 'protèg', révéler: 'révèl',
};

/** Forms of a verb: { present: [], imperative: [], participle: [] }. Regular -er, -ir (finir) and -re (attendre). */
export function verbForms(inf) {
  const reflexive = inf.startsWith("se ") || inf.startsWith("s'");
  const v = reflexive ? inf.replace(/^se |^s'/, '') : inf;
  const out = { present: [], imperative: [], participle: [] };
  const agree = (pp) => {
    if (pp.includes('/')) return pp.split('/');
    if (/[sx]$/.test(pp)) return [pp, `${pp}e`, `${pp}es`];
    return [pp, `${pp}e`, `${pp}s`, `${pp}es`];
  };
  const irr = IRREGULAR_VERBS[v];
  if (irr) {
    const persons = irr.present.split(' ');
    out.present = persons.flatMap((p) => p.split('/')).filter((p) => p !== '-');
    out.participle = agree(irr.pp);
    if (irr.imp !== undefined) out.imperative = irr.imp ? irr.imp.split(' ') : [];
    else {
      const [tu, , , nous, vous] = persons.map((p) => p.split('/')[0]);
      const tuImp = /es$/.test(tu) && /er$|rir$/.test(v) ? tu.slice(0, -1) : tu; // ouvres -> ouvre
      out.imperative = [tuImp, nous, vous].filter((p) => p && p !== '-');
    }
    return out;
  }
  if (/er$/.test(v)) {
    const stem = v.slice(0, -2);
    const strong = ER_STRONG_STEM[v] ?? stem;
    const soft = /g$/.test(stem) ? `${stem}e` : /c$/.test(stem) ? `${stem.slice(0, -1)}ç` : stem; // mangeons, commençons
    out.present = [`${strong}e`, `${strong}es`, `${soft}ons`, `${stem}ez`, `${strong}ent`];
    out.imperative = [`${strong}e`, `${soft}ons`, `${stem}ez`];
    out.participle = agree(`${stem}é`);
  } else if (/ir$/.test(v)) {
    const stem = v.slice(0, -2);
    out.present = [`${stem}is`, `${stem}it`, `${stem}issons`, `${stem}issez`, `${stem}issent`];
    out.imperative = [`${stem}is`, `${stem}issons`, `${stem}issez`];
    out.participle = agree(`${stem}i`);
  } else if (/re$/.test(v)) {
    const stem = v.slice(0, -2);
    out.present = [`${stem}s`, stem, `${stem}ons`, `${stem}ez`, `${stem}ent`];
    out.imperative = [`${stem}s`, `${stem}ons`, `${stem}ez`];
    out.participle = agree(`${stem}u`);
  }
  return out;
}

/** Forms of determiners, pronouns and other function words (gender/number), all of the base's level. */
export const FUNCTION_FORMS = {
  le: ['la', 'les'], un: ['une', 'des'], mon: ['ma', 'mes'], ton: ['ta', 'tes'], son: ['sa', 'ses'], notre: ['nos'], votre: ['vos'],
  leur: ['leurs'], ce: ['cet', 'cette', 'ces'], quel: ['quelle', 'quels', 'quelles'], tout: ['toute', 'tous', 'toutes'],
  aucun: ['aucune'], quelque: ['quelques'], autre: ['autres'], 'même': ['mêmes'], il: ['ils'], elle: ['elles'],
  celui: ['celle', 'ceux', 'celles'], lequel: ['laquelle', 'lesquels', 'lesquelles'], chacun: ['chacune'], 'quelqu\'un': [],
  certain: ['certaine', 'certains', 'certaines'], tel: ['telle', 'tels', 'telles'],
};

/**
 * Every form of a lexicon entry, as [form, kind] pairs (kind: see the header).
 * entry: { lemma, pos, gender? }; nouns may be plural-only (gender "mpl"/"fpl").
 */
export function formsOf({ lemma, pos, gender }) {
  const out = [[lemma, 'base']];
  const add = (forms, kind) => forms.forEach((f) => f && f !== lemma && out.push([f, kind]));
  if (FUNCTION_FORMS[lemma] && pos !== 'noun' && pos !== 'verb') {
    add(FUNCTION_FORMS[lemma], 'base');
    return out;
  }
  if (gender === 'mpl' || gender === 'fpl') return out; // plural-only nouns (les ciseaux, les lunettes)
  if (pos === 'noun') {
    add(plural(lemma), 'plural');
    // Person and animal nouns have feminine forms (ami -> amie, voisin -> voisine, chanteur -> chanteuse).
    if (gender === 'm' && (lemma in IRREGULAR_FEMININE || /(in|ain|ien|ois|ais|eur|teur|ier|ant|ent|i|u|é|on|at)$/.test(lemma))) {
      const fem = feminine(lemma);
      add(fem, 'feminine');
      add(fem.flatMap(plural), 'feminine');
    }
  } else if (pos === 'adjective' || pos === 'number-ordinal') {
    add(plural(lemma), 'plural');
    const fem = feminine(lemma);
    add(fem, 'feminine');
    add(fem.flatMap(plural), 'feminine');
  } else if (pos === 'verb') {
    if (/^(se |s')/.test(lemma)) add([lemma.replace(/^se |^s'/, '')], 'base'); // "je vais me lever"
    const f = verbForms(lemma);
    add(f.present, 'present');
    add(f.imperative, 'imperative');
    add(f.participle, 'participle');
    const o = otherTenses(lemma);
    add(o.imparfait, 'imparfait');
    add(o.futur, 'futur');
    add(o.conditionnel, 'conditionnel');
    add(subjonctif(lemma), 'subjonctif');
    add(participePresent(lemma), 'gerondif');
  }
  return out;
}

// ---- tokenizer -----------------------------------------------------------------------------------------------
const LETTERS = "a-zàâäéèêëîïôöùûüçœæ";
const WORD = new RegExp(`[${LETTERS}0-9]+(?:['-][${LETTERS}0-9]+)*'?`, 'giu');

/**
 * Words of a French text: lower-cased, apostrophes straightened. Elisions are split off ("l'école" -> "l'", "école";
 * "qu'est-ce" -> "qu'", "est-ce"); hyphens are kept here (the caller decides: compound lemma, or split).
 * Returns [{ word, original }] where original keeps the case (proper names).
 */
export function tokenize(text) {
  const s = String(text).normalize('NFC').replace(/[‘’ʼ`´]/g, "'");
  const out = [];
  for (const m of s.matchAll(WORD)) {
    let w = m[0];
    // elisions: one or more prefixes (qu'il, jusqu'à, d'aujourd'hui is kept: aujourd'hui is a word)
    for (;;) {
      const lower = w.toLowerCase();
      const el = Object.keys(ELISIONS).find((e) => lower.startsWith(e) && lower.length > e.length && !/^aujourd'hui/.test(lower));
      if (!el) break;
      out.push({ word: el, original: w.slice(0, el.length) });
      w = w.slice(el.length);
    }
    if (w.endsWith("'") && !Object.keys(ELISIONS).includes(w.toLowerCase())) w = w.slice(0, -1);
    if (w) out.push({ word: w.toLowerCase(), original: w });
  }
  return out;
}

/** Hyphenated verb-subject/object inversions: "fais-tu", "présente-toi", "donne-le", "a-t-il". */
export const CLITICS = new Set(['je', 'tu', 'il', 'elle', 'on', 'nous', 'vous', 'ils', 'elles', 'moi', 'toi', 'le', 'la', 'les', 'lui', 'leur', 'en', 'y', 'ce', 't']);
