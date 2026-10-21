// Dutch morphology (scripts/content/dutch.js) used by the Dutch word list and trace.
import { describe, expect, it } from 'vitest';
import {
  comparatives, diminutive, formsOf, inflected, numberWord, tokenize, verbForms, verbStem, weakParticiple, weakPast,
} from '../../scripts/content/dutch.js';

const forms = (lemma) => verbForms(lemma).map(([f]) => f);
const kinds = (lemma, kind) => verbForms(lemma).filter(([, k]) => k === kind).map(([f]) => f);

describe('Dutch verbs', () => {
  it('stems: open syllables double their vowel, double consonants halve, v/z become f/s, schwa and -eren loans', () => {
    const cases = {
      maken: 'maak', lopen: 'loop', eten: 'eet', zitten: 'zit', zwemmen: 'zwem', leven: 'leef', lezen: 'lees', reizen: 'reis',
      werken: 'werk', fietsen: 'fiets', wonen: 'woon', betalen: 'betaal', studeren: 'studeer', luisteren: 'luister',
      wandelen: 'wandel', openen: 'open', gaan: 'ga', doen: 'doe', zien: 'zie', beginnen: 'begin', vragen: 'vraag', rijden: 'rijd',
      douchen: 'douch', regenen: 'regen', waaien: 'waai', bellen: 'bel', antwoorden: 'antwoord',
    };
    for (const [inf, stem] of Object.entries(cases)) expect(verbStem(inf), inf).toBe(stem);
  });

  it("'t kofschip: -te after t k f s ch p, -de after the rest (by the infinitive's consonant: leven → leefde)", () => {
    expect(weakPast('werken')).toEqual(['werkte', 'werkten']);
    expect(weakPast('wonen')).toEqual(['woonde', 'woonden']);
    expect(weakPast('leven')).toEqual(['leefde', 'leefden']);
    expect(weakPast('reizen')).toEqual(['reisde', 'reisden']);
    expect(weakPast('zetten')).toEqual(['zette', 'zetten']);
    expect(weakPast('fietsen')).toEqual(['fietste', 'fietsten']);
    expect(weakPast('douchen')).toEqual(['douchte', 'douchten']);
  });

  it('participles: ge- + stem + t/d, none doubled, no ge- after be- ge- her- ver- ont- er- (bellen is no prefix)', () => {
    const cases = { werken: 'gewerkt', wonen: 'gewoond', zetten: 'gezet', antwoorden: 'geantwoord', betalen: 'betaald',
      vertellen: 'verteld', herhalen: 'herhaald', gebruiken: 'gebruikt', bellen: 'gebeld', studeren: 'gestudeerd', verhuizen: 'verhuisd' };
    for (const [inf, pp] of Object.entries(cases)) expect(weakParticiple(inf), inf).toBe(pp);
  });

  it('present: ik werk, werkt, werken; zitten → zit (no zitt); irregulars from the table only', () => {
    expect(kinds('werken', 'present')).toEqual(['werk', 'werkt', 'werken']);
    expect(kinds('zitten', 'present')).toEqual(['zit', 'zit', 'zitten']);
    expect(kinds('gaan', 'present')).toEqual(['ga', 'gaat', 'gaan']);
    expect(kinds('zijn', 'present')).toContain('wees');
    expect(kinds('komen', 'present')).toEqual(['kom', 'komt', 'komen']);
    expect(forms('gaan')).not.toContain('gat');
  });

  it('irregular past and participle; inseparable prefix keeps its participle without ge-', () => {
    expect(kinds('gaan', 'past')).toEqual(['ging', 'gingen']);
    expect(kinds('begrijpen', 'participle')).toEqual(['begrepen']);
    expect(kinds('drinken', 'participle')).toEqual(['gedronken']);
  });

  it('separable verbs: joined forms (opstaan, opstond, opgestaan) and split finite forms for the trace', () => {
    const all = verbForms('op|staan');
    expect(all.filter(([, k]) => k === 'base').map(([f]) => f)).toEqual(['opstaan']);
    expect(kinds('op|staan', 'participle')).toEqual(['opgestaan']);
    expect(kinds('op|staan', 'present')).toContain('opstaat');
    expect(kinds('op|staan', 'present-split')).toEqual(['sta', 'staat', 'staan']);
    expect(kinds('terug|betalen', 'participle')).toEqual(['terugbetaald']);
    expect(kinds('op|bellen', 'participle')).toEqual(['opgebeld']);
  });
});

describe('Dutch verbs at B1', () => {
  const forms = (lemma) => verbForms(lemma).map(([f]) => f);
  it('irregular verbs with an inseparable prefix take the root\'s forms without ge-', () => {
    expect(forms('ontbreken')).toEqual(expect.arrayContaining(['ontbrak', 'ontbraken', 'ontbroken']));
    expect(forms('bespreken')).toEqual(expect.arrayContaining(['besprak', 'besproken']));
    expect(forms('beschrijven')).toEqual(expect.arrayContaining(['beschreef', 'beschreven']));
    expect(forms('bekijken')).toEqual(expect.arrayContaining(['bekeek', 'bekeken']));
    expect(forms('voldoen')).toEqual(expect.arrayContaining(['voldoet', 'voldeed', 'voldaan']));
    expect(forms('onderhouden')).toEqual(expect.arrayContaining(['onderhield', 'onderhouden']));
    expect(forms('door|verwijzen')).toEqual(expect.arrayContaining(['verwees', 'doorverwezen']));
    expect(forms('in|breken')).toEqual(expect.arrayContaining(['brak', 'ingebroken']));
  });
  it('bestaan, verstaan: -aat in the third person', () => {
    expect(forms('bestaan')).toEqual(expect.arrayContaining(['besta', 'bestaat', 'bestond']));
    expect(forms('verstaan')).toContain('verstaat');
  });
  it('the stem after an inseparable prefix is the root\'s stem; no vowel doubling before w', () => {
    expect(verbStem('beweren')).toBe('beweer');
    expect(verbStem('verdelen')).toBe('verdeel');
    expect(verbStem('beoordelen')).toBe('beoordeel');
    expect(verbStem('herinneren')).toBe('herinner');
    expect(verbStem('gebeuren')).toBe('gebeur');
    expect(verbStem('waarschuwen')).toBe('waarschuw');
    expect(forms('waarschuwen')).toContain('waarschuwden');
  });
  it('ge- before e / i / u takes a diaeresis; loan verbs in -eren keep -eer-; onder-/over-/vol- verbs take no ge-', () => {
    expect(forms('isoleren')).toEqual(expect.arrayContaining(['isoleert', 'geïsoleerd']));
    expect(forms('interesseren')).toContain('geïnteresseerd');
    expect(forms('recycleren')).toContain('gerecycleerd');
    expect(forms('ondertekenen')).toContain('ondertekend');
    expect(forms('overtuigen')).toContain('overtuigd');
    expect(forms('volgen')).toContain('gevolgd'); // vol- of volgen is no prefix
  });
});

describe('Dutch nouns and adjectives', () => {
  it('diminutives', () => {
    const cases = { kop: 'kopje', huis: 'huisje', stoel: 'stoeltje', trein: 'treintje', tafel: 'tafeltje', boom: 'boompje',
      bal: 'balletje', ring: 'ringetje', kam: 'kammetje', auto: 'autootje', koning: 'koninkje', zee: 'zeetje', jongen: 'jongetje' };
    for (const [n, d] of Object.entries(cases)) expect(diminutive(n), n).toEqual([d]);
  });

  it('adjective -e with spelling; -e and schwa -en adjectives stay', () => {
    const cases = { groot: 'grote', wit: 'witte', lief: 'lieve', grijs: 'grijze', lekker: 'lekkere', mooi: 'mooie', blauw: 'blauwe',
      normaal: 'normale', dik: 'dikke', goed: 'goede', klein: 'kleine', interessant: 'interessante', groen: 'groene', nerveus: 'nerveuze',
      gelukkig: 'gelukkige', fris: 'frisse', duur: 'dure' };
    for (const [a, e] of Object.entries(cases)) expect(inflected(a), a).toEqual([e]);
    for (const a of ['open', 'oranje', 'gesloten', 'moe']) expect(inflected(a), a).toEqual([]);
  });

  it('comparatives and superlatives', () => {
    expect(comparatives('groot')).toEqual(['groter', 'grotere', 'grootst', 'grootste']);
    expect(comparatives('duur')).toContain('duurder');
    expect(comparatives('goed')).toEqual(['beter', 'best', 'beste']);
    expect(comparatives('vies')).toContain('viest');
  });

  it('a noun entry: plural from the list, diminutives; an adjective: inflected, partitive, comparative', () => {
    expect(formsOf({ lemma: 'kat', pos: 'noun', plural: 'katten' })).toEqual(expect.arrayContaining([['katten', 'plural'], ['katje', 'diminutive']]));
    expect(formsOf({ lemma: 'lekker', pos: 'adjective' })).toEqual(expect.arrayContaining([['lekkere', 'inflected'], ['lekkers', 'partitive'], ['lekkerder', 'comparative']]));
  });
});

describe('B1 extras: adverb comparatives, pronoun plurals, Eén', () => {
  it('vaak → vaker, erg → erger (comparatives of adverbs); sommige → sommigen; a capitalised Eén reads één', () => {
    expect(formsOf({ lemma: 'vaak', pos: 'adverb' }).map(([f]) => f)).toEqual(expect.arrayContaining(['vaker', 'vaakst']));
    expect(formsOf({ lemma: 'erg', pos: 'adverb' }).map(([f]) => f)).toContain('erger');
    expect(formsOf({ lemma: 'sommige', pos: 'determiner' }).map(([f]) => f)).toContain('sommigen');
    expect(tokenize('Eén dag per week.')[0].word).toBe('één');
  });
});

describe('numbers and tokens', () => {
  it('number words 0–1000', () => {
    expect([1, 21, 22, 35, 100, 101, 235, 1000].map(numberWord)).toEqual(['één', 'eenentwintig', 'tweeëntwintig', 'vijfendertig', 'honderd', 'honderdeen', 'tweehonderdvijfendertig', 'duizend']);
  });

  it("tokens keep auto's, z'n and e-mail whole and 's apart; curly apostrophes are straight", () => {
    expect(tokenize("Ik werk ’s morgens. Twee auto's, z'n e-mail!").map((t) => t.word)).toEqual(['ik', 'werk', "'s", 'morgens', 'twee', "auto's", "z'n", 'e-mail']);
  });
});
