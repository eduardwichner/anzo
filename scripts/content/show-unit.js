#!/usr/bin/env node
// Print one unit of a generated pack as a reviewer reads it (read-only;
// texts and their exercises included).
//   node scripts/content/show-unit.js <pack file> <unit id>   e.g. content/packs/fr-en/a1-1.json fe-a1-1-u02
// Native-side texts are shown in the pack's native language; ✓ marks the right option.
import fs from 'node:fs';

const [file, unitId] = process.argv.slice(2);
const pack = JSON.parse(fs.readFileSync(file, 'utf8'));
const unit = pack.units.find((u) => u.id === unitId);
if (!unit) {
  console.error(`no unit ${unitId} in ${file}: ${pack.units.map((u) => u.id).join(' ')}`);
  process.exit(1);
}
const nat = (x) => (x && typeof x === 'object' ? Object.values(x)[0] : x);
const vocab = new Map(pack.units.flatMap((u) => u.vocabulary.map((v) => [v.id, v])));
const sent = new Map(pack.units.flatMap((u) => (u.sentences || []).map((s) => [s.id, s])));
const what = (id) => (vocab.get(id) ? `${vocab.get(id).target} = ${nat(vocab.get(id).native)}` : sent.get(id) ? `"${sent.get(id).target}" = "${nat(sent.get(id).native)}"` : id);

console.log(`# ${unit.id} — ${nat(unit.title)}\n\n## Vocabulary`);
for (const v of unit.vocabulary) console.log(`- ${v.id}: ${v.target} = ${nat(v.native)} (${v.pos}${v.gender ? `, ${v.gender}` : ''})`);
console.log('\n## Sentences');
for (const s of unit.sentences || []) console.log(`- ${s.id}: ${s.target} = ${nat(s.native)}  [${(s.items || []).join(', ')}]`);
// Texts (B1/B2): every sentence or turn with its meaning, the glossary (the tap meanings of words that are not
// course words) and the inflected forms that tap to an item
const texts = new Map((unit.texts || []).map((t) => [t.id, t]));
const textSent = new Map([...texts.values()].flatMap((t) => [...(t.paragraphs || []).flat(), ...(t.turns || [])].map((x) => [x.id, x])));
for (const t of texts.values()) {
  console.log(`\n## Text ${t.id} (${t.kind}) — ${nat(t.title)}${t.speakers ? ` — A: ${t.speakers.A.name}, B: ${t.speakers.B.name}` : ''}`);
  (t.paragraphs || []).forEach((para, i) => { console.log(`¶${i + 1}`); for (const x of para) console.log(`- ${x.id}: ${x.target} = ${nat(x.native)}`); });
  for (const x of t.turns || []) console.log(`- ${x.id} ${x.speaker}: ${x.target} = ${nat(x.native)}`);
  if (t.glossary?.length) console.log(`glossary: ${t.glossary.map((g) => `${g.word} = ${nat(g.native)}`).join(' · ')}`);
  console.log(`items: ${(t.items || []).map((id) => what(id)).join(' · ')}`);
  if (t.forms) console.log(`forms: ${Object.entries(t.forms).map(([f, id]) => `${f} → ${id}`).join(', ')}`);
}
const q = (x) => {
  switch (x.type) {
    case 'mc': case 'summary': return `${x.type} ${x.question ? `"${x.question}" ` : ''}${x.options.map((o, i) => `${i === x.correct ? '✓' : '·'} ${o}`).join(' | ')}`;
    case 'true_false_notgiven': return `T/F/NG "${x.statement}" → ${x.answer}`;
    case 'match_heading': return `heading ¶${x.paragraph}: ${x.options.map((o, i) => `${i === x.correct ? '✓' : '·'} ${o}`).join(' | ')}`;
    case 'match_texts': return `match ${x.labels.join('/')}: ${x.statements.map((s) => `"${s.statement}" → ${x.labels[s.paragraph - 1]}`).join(' · ')}`;
    case 'complete': return `complete "${x.statement}" → ${x.answers.join(' / ')}`;
    default: return JSON.stringify(x).slice(0, 200);
  }
};
const gap = (g) => `${textSent.get(g.sentence)?.target.replace(new RegExp(`(?<![\\p{L}])${g.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}])`, 'u'), '___') ?? g.sentence} → ${g.word}${g.hint ? ` (hint "${nat(g.hint)}")` : ''}${g.stem ? ` (stem ${g.stem})` : ''}${g.acceptAlso ? ` also ${g.acceptAlso.join('/')}` : ''}`;
for (const l of unit.lessons) {
  console.log(`\n## Lesson ${l.id} — ${nat(l.title)}${l.extra ? ' (extra)' : ''}`);
  for (const e of l.exercises) {
    const opts = (e.options || []).map((o) => `${o.correct ? '✓' : '·'} ${typeof o === 'string' ? o : nat(o.text)}`).join(' | ');
    let line;
    switch (e.type) {
      case 'multiple_choice':
        line = `MC  ${typeof e.question === 'string' ? `FR "${e.question}" → EN` : `EN "${nat(e.question)}" → FR`}: ${opts}`;
        break;
      case 'listen_choose':
        line = `LISTEN ${what(e.listen)} → pick ${e.answerSide}: ${opts}`;
        break;
      case 'match_pairs':
        line = `MATCH ${e.pairs.map((p) => `${p.left} = ${nat(p.right)}`).join(' · ')}`;
        break;
      case 'fill_blank':
        line = `FILL${e.kind ? ` (${e.kind})` : ''} "${e.sentence}" ${e.stem ? `stem ${e.stem}` : `hint "${nat(e.hint)}"`} answer "${e.answer}"${e.acceptAlso ? ` also ${e.acceptAlso.join('/')}` : ''}${e.options ? ` bank: ${e.options.join(' | ')}` : ' (typed)'}${e.sentenceId ? ` — the sentence in English: "${nat(sent.get(e.sentenceId)?.native)}"` : ''}`;
        break;
      case 'reading': case 'dialogue': case 'listening':
        line = `${e.type.toUpperCase()} ${e.textId} ${q(e.question)}`;
        break;
      case 'cloze': case 'open_cloze': case 'word_form':
        line = `${e.type.toUpperCase()} ${e.textId}${e.options ? ` bank: ${e.options.join(' | ')}` : ' (typed)'}\n    ${e.gaps.map(gap).join('\n    ')}`;
        break;
      case 'gap_sentence':
        line = `GAPPED ${e.textId} gaps ${e.gaps.join(', ')}; extra: ${e.extra.map((x) => `"${x.target}" = "${nat(x.native)}"`).join(' · ')}`;
        break;
      case 'order_paragraphs':
        line = `ORDER ${e.textId} ${e.unit}s: ${e.segments.join(', ')}`;
        break;
      case 'transform':
        line = `TRANSFORM "${e.from}" key ${e.key} → "${e.gapped}" = ${e.answers.join(' / ')}${e.native ? ` — English: "${nat(e.native)}"` : ''}`;
        break;
      case 'build_sentence':
        line = `BUILD from EN "${nat(sent.get(e.sentenceId)?.native)}" → "${e.answer}" tiles: ${e.tokens.join(' ')}${e.distractors?.length ? ` + distractors ${e.distractors.join(' ')}` : ''}`;
        break;
      case 'listen_type':
        line = `DICTATION ${what(e.listen)}`;
        break;
      default:
        line = `${e.type} ${JSON.stringify(e).slice(0, 200)}`;
    }
    console.log(`- ${e.id} ${line}`);
  }
}
