// The trace of a unit's texts, transformations and word-formation stems (used by content:trace for every course). A module
// of its own so the tests can import it without running the content:trace command (trace.js runs it at import).
import { containsWord } from '../../server/src/content/texts.js';

/**
 * Texts (reading texts and dialogues of a unit): every sentence or turn, question, statement and option is traced like a
 * sentence at the pack's level. A word that fails is allowed when the text's glossary lists it (shown with its meaning;
 * may be up to a level above) or it is one of the unit's own vocabulary words (the words the text practises).
 */
export function traceTexts(unit, traceFn, report) {
  let n = 0;
  for (const t of unit.texts || []) {
    const segs = t.kind === 'dialogue' ? t.turns ?? [] : (t.paragraphs ?? []).flat();
    const qs = [...(t.questions || []), ...(t.listeningQuestions || [])];
    const texts = [...segs.map((x) => [x.id, x.target]), ...qs.flatMap((q) => [q.question, q.statement, ...(q.options || [])].filter(Boolean).map((x) => [q.id, x])),
      // B2: matching statements and labels, completion answers, the gapped text's extra sentences, word-formation stems
      ...qs.flatMap((q) => [...(q.statements || []).map((x) => x.statement), ...(q.labels || []), ...(q.answers || [])].map((x) => [q.id, String(x).replace(/___/g, ' ')])),
      ...(t.gapped?.extra || []).map((x) => [x.id, x.target]),
      ...(t.wordForm || []).map((g) => [`${g.sentence} stem`, String(g.stem).toLowerCase()]),
      ...[...(t.openCloze || []), ...(t.wordForm || [])].flatMap((g) => (g.acceptAlso || []).map((a) => [`${g.sentence} acceptAlso`, a]))];
    texts.forEach((x) => { x[1] = String(x[1]).replace(/___/g, ' '); });
    // a unit word in an inflected form counts too (coins, vrijwilligers, worked): its bare form + a common ending
    const ENDINGS = ['', 's', 'es', 'n', 'en', 'e', 'd', 'ed', 't', 'te', 'ing', 'er', 'ers'];
    const bare = (target) => target.toLowerCase().replace(/^(de|het|le|la|les|the|a|an)\s+|^l'/, '');
    const inflectedUnitWord = (word) => unit.vocabulary.some((v) => !/\s/.test(bare(v.target))
      && ENDINGS.some((e) => word.toLowerCase() === bare(v.target) + e));
    const allowed = (word) => (t.glossary || []).some((g) => containsWord(g.word, word))
      || unit.vocabulary.some((v) => containsWord(v.target, word)) || inflectedUnitWord(word);
    for (const [where, text] of texts) {
      n++;
      for (const p of traceFn(text)) if (!allowed(p.word)) report(`${t.file ?? unit.file}: text ${t.id} ${where} "${text}": "${p.word}" — ${p.reason}`);
    }
  }
  // B2: the unit's key word transformations (both sentences, every answer) and its word-formation stems
  const unitWord = (word) => unit.vocabulary.some((v) => containsWord(v.target, word));
  for (const x of unit.transforms || []) {
    for (const text of [x.from, x.gapped.replace('___', ' '), ...x.answers, x.key.toLowerCase()]) {
      n++;
      for (const p of traceFn(text)) if (!unitWord(p.word)) report(`${unit.file}: transform ${x.id} "${text}": "${p.word}" — ${p.reason}`);
    }
  }
  for (const x of (unit.sentences || []).filter((y) => y.form)) {
    n++;
    for (const p of traceFn(x.form.stem.toLowerCase())) if (!unitWord(p.word)) report(`${unit.file}: ${x.id} form stem "${x.form.stem}": "${p.word}" — ${p.reason}`);
  }
  return n;
}
