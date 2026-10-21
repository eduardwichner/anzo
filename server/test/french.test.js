// French content pipeline: morphology (scripts/content/french.js), the derived word list (wordlist-fr.js) and its
// summary, the French trace (trace-fr-lib.js + content:trace -- fr) and the generator's French rules.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import YAML from 'yaml';
import { formsOf, otherTenses, participePresent, subjonctif, tokenize, verbForms } from '../../scripts/content/french.js';
import { countsTable, summarize, WORDLIST_FR_JSON } from '../../scripts/content/wordlist-fr.js';
import { indexWordlistFr, traceSentenceFr, traceTokenFr, traceVocabFr } from '../../scripts/content/trace-fr-lib.js';
import { articleOf, generatePack, words } from '../../scripts/content/generator.js';
import { expandIds, vocabId } from '../../scripts/content/sources.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '../..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'anzo-fr-'));
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

// A small word list in the format of wordlist-fr.json (levels A1.1 < A1 < A2).
const e = (lemma, level, pos, extra = {}) => ({ lemma, level, pos, source: 'topic', ...extra });
const LIST = {
  entries: [
    e('le', 'A1.1', 'determiner'), e('un', 'A1.1', 'number'), e('de', 'A1.1', 'preposition'), e('à', 'A1.1', 'preposition'),
    e('je', 'A1.1', 'pronoun'), e('tu', 'A1.1', 'pronoun'), e('il', 'A1.1', 'pronoun'), e('elle', 'A1.1', 'pronoun'), e('nous', 'A1.1', 'pronoun'),
    e('se', 'A1.1', 'pronoun'), e('ne', 'A1.1', 'adverb'), e('pas', 'A1.1', 'adverb'), e('que', 'A1.1', 'pronoun'), e('ce', 'A1.1', 'determiner'),
    e('mon', 'A1.1', 'determiner'), e('ton', 'A1.1', 'determiner'), e('son', 'A1.1', 'determiner'), e('me', 'A1.1', 'pronoun'), e('et', 'A1.1', 'conjunction'),
    e('être', 'A1.1', 'verb'), e('avoir', 'A1.1', 'verb'), e('aller', 'A1.1', 'verb'), e('aimer', 'A1.1', 'verb', { source: 'attested', forms: { aimerais: 'A2' } }),
    e("s'appeler", 'A1.1', 'verb'), e('manger', 'A1.1', 'verb'), e('finir', 'A1.1', 'verb'),
    e('chat', 'A1.1', 'noun', { gender: 'm' }), e('école', 'A1.1', 'noun', { gender: 'f' }), e('œil', 'A1.1', 'noun', { gender: 'm' }),
    e('ami', 'A1.1', 'noun', { gender: 'm' }), e('cheval', 'A1.1', 'noun', { gender: 'm' }), e('parc', 'A1.1', 'noun', { gender: 'm' }),
    e('petit', 'A1.1', 'adjective'), e('gentil', 'A1', 'adjective'), e('beau', 'A1.1', 'adjective'), e('blanc', 'A1.1', 'adjective'),
    e('aujourd\'hui', 'A1.1', 'adverb'), e('grand-mère', 'A1.1', 'noun', { gender: 'f' }), e("qu'est-ce que", 'A1.1', 'question'),
    e("s'il te plaît", 'A1.1', 'phrase'), e('te', 'A1.1', 'pronoun'), e('est-ce que', 'A1.1', 'question'),
    e('hier', 'A2', 'adverb'), e('requin', 'A1', 'noun', { gender: 'm' }), e('petit pois', 'A2', 'noun', { gender: 'm' }),
    e('orange', 'A1.1', 'adjective'), e('orange', 'A1', 'noun', { key: 'orange~fruit', gender: 'f' }),
    e('vouloir', 'A1.1', 'verb'), e('en', 'A1.1', 'preposition'), e('quand', 'A1.1', 'conjunction'),
    e('inscrire', 'B1', 'verb'), e('industriel', 'B1', 'noun', { gender: 'm' }), e('professionnel', 'B1', 'adjective'),
  ],
  names: [{ name: 'Rose', level: 'A1.1' }, { name: 'Bulle', level: 'A2' }],
};
const index = indexWordlistFr(LIST);
const bad = (text, level) => traceSentenceFr(index, text, level).map((p) => p.word);

describe('French morphology', () => {
  it('tokenizes elisions apart and keeps aujourd\'hui, hyphenated words and qu\'est-ce', () => {
    expect(tokenize("Qu’est-ce que c'est, aujourd'hui ? L'école de ma grand-mère.").map((t) => t.word))
      .toEqual(["qu'", 'est-ce', 'que', "c'", 'est', "aujourd'hui", "l'", 'école', 'de', 'ma', 'grand-mère']);
  });

  it('generates agreement forms of nouns and adjectives, irregulars included', () => {
    const f = (lemma, pos, gender) => formsOf({ lemma, pos, gender }).map(([x]) => x);
    expect(f('œil', 'noun', 'm')).toContain('yeux');
    expect(f('cheval', 'noun', 'm')).toContain('chevaux');
    expect(f('ami', 'noun', 'm')).toEqual(expect.arrayContaining(['amis', 'amie', 'amies']));
    expect(f('gentil', 'adjective')).toEqual(expect.arrayContaining(['gentille', 'gentils', 'gentilles']));
    expect(f('beau', 'adjective')).toEqual(expect.arrayContaining(['beaux', 'belle', 'belles', 'bel']));
    expect(f('blanc', 'adjective')).toContain('blanche');
    expect(f('le', 'determiner')).toEqual(['le', 'la', 'les']);
  });

  it('conjugates present, imperative and participle (regular, stem-changing, irregular, reflexive)', () => {
    expect(verbForms('manger').present).toContain('mangeons');
    expect(verbForms('finir').present).toEqual(expect.arrayContaining(['finis', 'finissons']));
    expect(verbForms("s'appeler").present).toEqual(expect.arrayContaining(['appelle', 'appelons']));
    expect(verbForms('aller').present).toEqual(['vais', 'vas', 'va', 'allons', 'allez', 'vont']);
    expect(verbForms('aller').participle).toEqual(['allé', 'allée', 'allés', 'allées']);
    expect(verbForms('être').imperative).toEqual(['sois', 'soyons', 'soyez']);
  });
});

describe('French morphology at B1', () => {
  it('subjonctif présent: irregular table, the ils stem, the nous/vous imparfait stem', () => {
    expect(subjonctif('être')).toEqual(expect.arrayContaining(['sois', 'soit', 'soyons']));
    expect(subjonctif('venir')).toEqual(expect.arrayContaining(['vienne', 'viennes', 'viennent', 'venions']));
    expect(subjonctif('manger')).toEqual(expect.arrayContaining(['mange', 'mangions', 'mangiez']));
    expect(subjonctif('faire')).toContain('fasse');
  });

  it('imparfait: -ger and -cer verbs drop e / cedilla before -i- (mangions, commencions)', () => {
    expect(otherTenses('manger').imparfait).toEqual(['mangeais', 'mangeait', 'mangions', 'mangiez', 'mangeaient']);
    expect(otherTenses('commencer').imparfait).toEqual(expect.arrayContaining(['commençais', 'commencions']));
    expect(otherTenses('être').imparfait).toContain('étions');
    expect(otherTenses('venir').futur).toContain('viendrai');
    expect(otherTenses('pouvoir').conditionnel).toContain('pourrais');
  });

  it('gérondif, compounds like their base, inscrire like écrire, plaindre like craindre', () => {
    expect(participePresent('faire')).toContain('faisant');
    expect(participePresent('être')).toContain('étant');
    expect(verbForms('soutenir').present).toEqual(expect.arrayContaining(['soutiens', 'soutient', 'soutiennent']));
    expect(verbForms('promettre').participle).toContain('promis');
    expect(verbForms('inscrire').present).toEqual(['inscris', 'inscris', 'inscrit', 'inscrivons', 'inscrivez', 'inscrivent']);
    expect(verbForms('inscrire').participle).toContain('inscrit');
    expect(verbForms('se plaindre').present).toEqual(expect.arrayContaining(['plains', 'plaint', 'plaignent']));
    expect(verbForms('produire').present).toEqual(expect.arrayContaining(['produit', 'produisons']));
  });
});

describe('French trace rules', () => {
  it('B1: subjonctif, imparfait, futur and gérondif pass at B1, not at A2', () => {
    expect(bad('Elle veut que nous mangions.', 'B1')).toEqual([]);
    expect(bad('Elle veut que nous mangions.', 'A2')).toEqual(['mangions']);
    expect(bad('Quand je mangeais, il finissait.', 'B1')).toEqual([]);
    expect(bad('Il finit en mangeant.', 'B1')).toEqual([]);
    expect(bad('Il finit en mangeant.', 'A2')).toEqual(['mangeant']);
    expect(bad('Je vais inscrire mon ami.', 'B1')).toEqual([]);
    expect(bad("L'industriel est professionnel.", 'B1')).toEqual([]);
    expect(bad("L'industriel est professionnel.", 'A2')).toEqual(['industriel', 'professionnel']);
  });

  it('present, agreement, elisions and contractions of known lemmas pass at A1.1', () => {
    expect(bad("Je m'appelle Rose et j'aime mon petit chat.", 'A1.1')).toEqual([]);
    expect(bad('Elle est petite ; ses yeux sont beaux.', 'A1.1')).toEqual([]);
    expect(bad("Nous allons à l'école et au parc.", 'A1.1')).toEqual([]);
    expect(bad("Qu'est-ce que tu manges aujourd'hui ?", 'A1.1')).toEqual([]);
    expect(bad("Une pomme, s'il te plaît !", 'A1.1')).toEqual(['pomme']);
    expect(bad('Il ne mange pas.', 'A1.1')).toEqual([]);
  });

  it('an imperative and est-ce que pass; passé composé participles only from A2', () => {
    expect(bad('Finis ton chat !', 'A1.1')).toEqual([]);
    expect(bad('Est-ce que tu manges ?', 'A1.1')).toEqual([]);
    expect(bad("Hier, je suis allée à l'école.", 'A1.1')).toEqual(['Hier', 'allée']);
    expect(bad("Hier, je suis allée à l'école.", 'A2')).toEqual([]);
    expect(traceTokenFr(index, 'allé', 'A1').how).toMatch(/not A1 grammar/);
  });

  it('other tenses only as forms the papers attest, from the level they are attested at', () => {
    expect(bad("J'aimerais un chat.", 'A1')).toEqual(['aimerais']);
    expect(bad("J'aimerais un chat.", 'A2')).toEqual([]);
    expect(bad('Il mangera.', 'A2')).toEqual(['mangera']);
  });

  it('numbers in range, names, multi-word entries with plural parts, unknown and off-level words fail', () => {
    expect(bad('Il a 20 chats.', 'A1.1')).toEqual([]);
    expect(bad('Il a 21 chats.', 'A1.1')).toEqual(['21']);
    expect(bad('Il a 99 chats.', 'A1')).toEqual([]);
    expect(bad('Bulle est gentille.', 'A1')).toEqual([]);
    expect(bad('Rose est gentille.', 'A1.1')).toEqual(['gentille']);
    expect(bad('Il mange des petits pois.', 'A2')).toEqual([]);
    expect(bad('Le requin mange.', 'A1.1')).toEqual(['requin']);
    expect(bad('Le dragon mange.', 'A2')).toEqual(['dragon']);
  });

  it('vocabulary: a lemma at or below the level, nouns with their article; the article picks the noun lemma', () => {
    expect(traceVocabFr(index, 'le chat', 'A1.1')).toMatchObject({ ok: true, key: 'chat' });
    expect(traceVocabFr(index, "l'école", 'A1.1')).toMatchObject({ ok: true, key: 'école' });
    expect(traceVocabFr(index, 'les yeux', 'A1.1')).toMatchObject({ ok: true, key: 'œil' });
    expect(traceVocabFr(index, "l'orange", 'A1')).toMatchObject({ ok: true, key: 'orange~fruit' });
    expect(traceVocabFr(index, 'orange', 'A1')).toMatchObject({ ok: true, key: 'orange' });
    expect(traceVocabFr(index, 'le requin', 'A1.1')).toMatchObject({ ok: false });
    expect(traceVocabFr(index, 'le dragon', 'A2')).toMatchObject({ ok: false });
  });

  it('content:trace -- fr fails on an off-level fixture and passes on a clean one', () => {
    const list = path.join(tmp, 'wordlist-fr.json');
    fs.writeFileSync(list, JSON.stringify(LIST));
    const src = path.join(tmp, 'src');
    const unit = (sentence) => YAML.stringify({
      id: 'fr-a1-1-u01', title: { nl: 'Test' }, icon: 'animals',
      vocabulary: [{ target: 'le chat', native: { nl: 'de kat' }, pos: 'noun', gender: 'm' }],
      sentences: [{ id: 's01', target: sentence, native: { nl: 'x' }, items: ['fr.chat'] }],
    });
    fs.mkdirSync(path.join(src, 'fr/a1-1'), { recursive: true });
    fs.writeFileSync(path.join(src, 'fr/a1-1/pack.yaml'), YAML.stringify({ id: 'fr-a1-1', cefr: 'A1.1', source: 'test' }));
    const run = () => execFileSync(process.execPath, [path.join(ROOT, 'scripts/content/trace.js'), 'fr', '--src', src, '--wordlist', list], { encoding: 'utf8', stdio: 'pipe' });
    fs.writeFileSync(path.join(src, 'fr/a1-1/01-test.yaml'), unit('Le chat mange.'));
    expect(run()).toMatch(/content:trace OK/);
    fs.writeFileSync(path.join(src, 'fr/a1-1/01-test.yaml'), unit('Hier, le requin a mangé le chat.'));
    let out = '';
    try {
      run();
    } catch (err) {
      out = `${err.stdout}${err.stderr}`;
      expect(err.status).toBe(1);
    }
    expect(out).toMatch(/"Hier" — hier is A2, above A1\.1/);
    expect(out).toMatch(/"requin" — requin is A1, above A1\.1/);
    expect(out).toMatch(/content:trace FAILED/);
  });
});

describe('French word list summary', () => {
  it('counts per level and source; WORDLIST.md shows the counts of the gitignored list (when present)', () => {
    const counts = summarize([{ level: 'A1.1', source: 'attested' }, { level: 'A1.1', source: 'topic' }, { level: 'A2', source: 'parity' }]);
    expect(counts['A1.1']).toEqual({ attested: 1, topic: 1, parity: 0, total: 2 });
    expect(counts.A2.total).toBe(1);
    if (!fs.existsSync(WORDLIST_FR_JSON)) return; // derived from gitignored papers
    const json = JSON.parse(fs.readFileSync(WORDLIST_FR_JSON, 'utf8'));
    const md = fs.readFileSync(path.join(ROOT, 'content/src/fr/WORDLIST.md'), 'utf8');
    const section = md.match(/<!-- counts:start -->\n([\s\S]*)\n<!-- counts:end -->/)[1];
    expect(section).toBe(countsTable(summarize(json.entries), { names: json.names, excluded: json.excluded, examinerOnly: json.examinerOnly }));
    expect(json.counts).toEqual(summarize(json.entries));
  });
});

describe('generator: French rules', () => {
  const n = (target, nl, gender, extra = {}) => ({ target, native: { nl }, pos: 'noun', gender, ...extra });
  const u1 = expandIds({
    id: 'fr-a1-1-u01', title: { nl: 'Dieren' }, icon: 'animals',
    vocabulary: [
      n('le chat', 'de kat', 'm'), n('le chien', 'de hond', 'm'), n('le cheval', 'het paard', 'm'), n('le lapin', 'het konijn', 'm'),
      n('la souris', 'de muis', 'f'), n('la vache', 'de koe', 'f'), n('la poule', 'de kip', 'f'), n('la girafe', 'de giraf', 'f'),
      n("l'oiseau", 'de vogel', 'm'), n("l'âne", 'de ezel', 'm'), n("l'abeille", 'de bij', 'f'), n("l'araignée", 'de spin', 'f'),
      n('les yeux', 'de ogen', 'm'), n('les cheveux', 'het haar', 'm'), n('les lunettes', 'de bril', 'f'), n('les ciseaux', 'de schaar', 'm'),
      { target: 'maman', native: { nl: 'mama' }, pos: 'noun', gender: 'f' }, { target: 'papa', native: { nl: 'papa' }, pos: 'noun', gender: 'm' },
      { target: 'lundi', native: { nl: 'maandag' }, pos: 'noun', gender: 'm' }, { target: 'mardi', native: { nl: 'dinsdag' }, pos: 'noun', gender: 'm' },
    ],
    sentences: [
      { id: 's01', target: 'Mon chat est noir.', native: { nl: 'Mijn kat is zwart.' }, items: ['fr.chat'] },
      { id: 's02', target: 'Ma souris est petite.', native: { nl: 'Mijn muis is klein.' }, items: ['fr.souris'] },
      { id: 's03', target: 'Salut ! Le cheval mange.', native: { nl: 'Hoi! Het paard eet.' }, items: ['fr.cheval'] },
      { id: 's04', target: 'Mes yeux sont bleus.', native: { nl: 'Mijn ogen zijn blauw.' }, items: ['fr.yeux'] },
      { id: 's05', target: "Regarde l'oiseau !", native: { nl: 'Kijk naar de vogel!' }, items: ['fr.oiseau'] },
      { id: 's06', target: 'Bonjour maman, ça va ?', native: { nl: 'Hallo mama, hoe gaat het?' }, items: ['fr.maman'] },
    ],
  }, 'fr');
  const pack = generatePack({ id: 'fr-a1-1', track: 'fr', cefr: 'A1.1', source: 'test' }, [{ ...u1, file: 'test' }]);
  const all = pack.units.flatMap((u) => u.lessons.flatMap((l) => l.exercises));

  it('noun ids drop the article; nouns keep their gender in the pack', () => {
    expect(vocabId('fr', "l'école")).toBe('fr.ecole');
    expect(vocabId('fr', 'les yeux')).toBe('fr.yeux');
    expect(vocabId('fr', 'un peu', 'adverb')).toBe('fr.un-peu');
    expect(vocabId('fr', "l'œuf")).toBe('fr.oeuf');
    expect(pack.units[0].vocabulary.find((v) => v.id === 'fr.souris')).toMatchObject({ target: 'la souris', gender: 'f' });
  });

  it('options showing French nouns share the answer\'s article form (le / la / l\' / les / none)', () => {
    const sets = all.filter((x) => (x.type === 'multiple_choice' && typeof x.question !== 'string') || (x.type === 'listen_choose' && x.answerSide === 'target'));
    expect(sets.length).toBeGreaterThan(3);
    for (const x of sets) expect(new Set(x.options.map((o) => articleOf(o.text))).size, x.id).toBe(1);
  });

  it('bare-noun word banks offer nouns of the same gender and number, with the answer\'s capitals', () => {
    const banks = all.filter((x) => x.type === 'fill_blank' && x.options);
    expect(banks.length).toBeGreaterThan(0);
    const g = new Map(pack.units[0].vocabulary.map((v) => [v.target.replace(/^(le|la|les)\s+|^l'/, ''), `${v.gender}${v.target.startsWith('les ') ? 'pl' : ''}`]));
    for (const b of banks) {
      if (!g.has(b.answer.toLowerCase())) continue;
      expect(new Set(b.options.map((o) => g.get(o.toLowerCase()))).size, b.id).toBe(1);
      const cap = /^\p{Lu}/u.test(b.answer);
      for (const o of b.options) expect(/^\p{Lu}/u.test(o), b.id).toBe(cap);
    }
  });

  it('French spaced punctuation stays on its tile', () => {
    expect(words('Salut ! Le cheval mange.')).toEqual(['Salut !', 'Le', 'cheval', 'mange.']);
    const build = all.find((x) => x.type === 'build_sentence' && x.answer.startsWith('Salut'));
    if (build) expect(build.tokens.join(' ')).toBe(build.answer);
  });
});

describe('the French packs in the repository', () => {
  const art = (t) => (t.match(/^(le|la|les|un|une|des)\s+|^l'/i) || [''])[0].trim().toLowerCase();
  for (const level of ['a1-1', 'a1', 'a2']) {
    it(`fr/${level}: noun options share their article, banks agree, every choice has 3+ options, no sentence twice`, () => {
      const pack = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/packs/fr', `${level}.json`), 'utf8'));
      const gender = new Map();
      for (const u of pack.units) for (const v of u.vocabulary) gender.set(v.target.replace(/^(le|la|les)\s+|^l'/, '').toLowerCase(), `${v.gender ?? ''}${v.target.startsWith('les ') ? 'pl' : ''}`);
      const seen = new Set();
      for (const u of pack.units) {
        for (const s of u.sentences) {
          expect(seen.has(s.target), s.id).toBe(false);
          seen.add(s.target);
        }
        for (const l of u.lessons) {
          for (const e of l.exercises) {
            const targetOptions = (e.type === 'multiple_choice' && typeof e.question !== 'string') || (e.type === 'listen_choose' && e.answerSide === 'target');
            if (targetOptions) {
              const right = e.options.find((o) => o.correct).text;
              if (art(right)) expect(new Set(e.options.map((o) => art(o.text))).size, e.id).toBe(1);
            }
            if (e.options) expect(e.options.length, e.id).toBeGreaterThanOrEqual(3);
            if (e.type === 'fill_blank' && e.options && gender.has(e.answer.toLowerCase())) {
              expect(new Set(e.options.map((o) => gender.get(o.toLowerCase()))).size, e.id).toBe(1);
            }
          }
        }
      }
    });
  }
});
