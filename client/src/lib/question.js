// Inbox → "Copy question": a ready-made question, always in English, with everything someone needs to judge the exercise
// the learners flagged (to ask a teacher, a native speaker or an assistant for a second opinion). Built from an inbox group (server/src/ops/reports.js inboxGroups).
import { tIn } from '../i18n/index.js';

const en = (key, params) => tIn('en', key, params);

/** What the child saw, as plain text lines. */
export function shownText(ex) {
  if (!ex) return '';
  switch (ex.type) {
    case 'multiple_choice':
      return `${ex.question} — options: ${ex.options.join(' / ')}`;
    case 'match_pairs':
      return ex.pairs.map((p) => `${p.left} = ${p.right}`).join('; ');
    case 'build_sentence':
      return `${ex.native} — tiles: ${ex.bank.join(' / ')}`;
    case 'fill_blank':
      return `${ex.sentence}${ex.hint ? ` (hint: ${ex.hint})` : ''}${ex.options ? ` — options: ${ex.options.join(' / ')}` : ''}`;
    case 'listen_choose':
      return `${en('ops.ask.audioOnly')}${ex.options ? ` — options: ${ex.options.join(' / ')}` : ''}`;
    case 'listen_type':
      return en('ops.ask.audioOnly');
    default:
      return ex.type;
  }
}

const answerOf = (a) => (a == null ? en('ops.ask.noAnswer') : typeof a === 'string' ? a : Array.isArray(a) ? a.join(' ') : JSON.stringify(a));

export function questionText(group) {
  const language = en(`languages.${group.track}`);
  const native = en(`nativeLanguages.${group.native ?? 'nl'}`);
  const who = en(`ops.ask.who.${group.reports.every((r) => r.audience === 'adult') ? 'adult' : 'child'}`);
  const ex = group.seen;
  const lines = [
    en('ops.ask.intro', { language, native, who, n: group.count }),
    '',
    `${en('ops.ask.type')} ${en(`exerciseTypes.${ex?.type}`)} (${group.exerciseId})`,
    `${en('ops.ask.instruction')} ${ex?.instruction ? en(ex.instruction, { language }) : '-'}`,
    `${en('ops.ask.shown')} ${shownText(ex)}`,
    `${en('ops.ask.correct')} ${group.correctAnswer ?? '-'}`,
  ];
  if (group.current?.heard) lines.push(`${en('ops.ask.heard')} ${group.current.heard}`);
  for (const it of group.items) lines.push(`${en('ops.ask.meaning', { text: it.target, native })} ${it.native}`);
  for (const r of group.reports) {
    lines.push('');
    lines.push(`${en('ops.ask.childAnswer')} ${answerOf(r.childAnswer)}${r.childCorrect === false ? ` (${en('ops.ask.markedWrong')})` : r.childCorrect ? ` (${en('ops.ask.markedRight')})` : ''}`);
    lines.push(`${en('ops.ask.reason')} ${en(`ops.inbox.reason.${r.reason}`, { language, native })}`);
    if (r.note) lines.push(`${en('ops.ask.note')} ${r.note}`);
  }
  lines.push('', en('ops.ask.question', { language, native, who }));
  return lines.join('\n');
}
