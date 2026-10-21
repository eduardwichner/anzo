// Id stability lock (content/ids.lock.json). Progress is stored by id: lesson_progress and lesson_completions by
// lesson id, attempts by exercise id (+ the exercise's items), item_strength by vocabulary/sentence id. A lock records
// every pack's unit, lesson, item (vocabulary + sentence) and exercise ids, and for each exercise its type and items.
// A locked id may never disappear, and a locked exercise id may never point at another type or other items: a
// generator change appends new exercises with new ids instead of renumbering. New ids are locked deliberately with
// `npm run content:lock -- --reason "<why>"`, which records the reason. An exercise hidden by an admin correction is
// *retired*: it leaves the packs, the lock keeps it under `retired` (with its key and the reason), and progress that
// names it stays valid. Texts (B1) add their ids to the same rules: text ids, the sentence and turn ids inside
// them, question ids (questions + listeningQuestions), and for each text exercise what it stands for (`textExercises`:
// its text and question, a cloze's gaps, an ordering's unit) — only for packs with texts, so older entries stay as they
// were. Pure; used by scripts/content/lock.js, the content job, the server's reload check
// (server/src/content/store.js) and the unit test (server/test/idlock.test.js).
import fs from 'node:fs';
import path from 'node:path';

/** Locked form of one exercise: "<type> <item> <item> …" (items in pack order). */
export const exerciseKey = (ex) => [ex.type, ...(ex.items || [])].join(' ');

/**
 * What a text exercise stands for: "<text id> <question id>" (reading, dialogue, listening), "<text id> <sentence>:<word> …"
 * (cloze: its gaps), "<text id> <unit>" (order_paragraphs: paragraph | sentence | turn).
 */
export function textExerciseKey(ex) {
  if (ex.question) return `${ex.textId} ${ex.question.id}`;
  if (ex.type === 'cloze') return [ex.textId, ...(ex.gaps || []).map((g) => `${g.sentence}:${g.word}`)].join(' ');
  // B2: the kind in front, so an open cloze never stands for a word-formation gap of the same words
  if (ex.type === 'open_cloze' || ex.type === 'word_form') return [ex.textId, ex.type, ...(ex.gaps || []).map((g) => `${g.sentence}:${g.word}`)].join(' ');
  if (ex.type === 'gap_sentence') return [ex.textId, 'gaps', ...(ex.gaps || []), ...(ex.extra || []).map((x) => x.id)].join(' ');
  return `${ex.textId} ${ex.unit ?? ''}`.trim();
}

/** Every id kind the lock lists per pack (texts, segments and questions only in packs with texts). */
export const ID_KINDS = ['units', 'lessons', 'items', 'texts', 'segments', 'questions'];

/**
 * Lock entries of one pack: { units, lessons, items, exercises: { id: "type items…" } } and, for a pack with texts,
 * { texts, segments (sentence + turn ids), questions, textExercises: { id: textExerciseKey } }.
 */
export function packEntries(pack) {
  const out = { units: [], lessons: [], items: [], exercises: {} };
  const texts = { texts: [], segments: [], questions: [], textExercises: {} };
  for (const unit of pack.units) {
    out.units.push(unit.id);
    for (const v of unit.vocabulary) out.items.push(v.id);
    for (const s of unit.sentences || []) out.items.push(s.id);
    for (const text of unit.texts || []) {
      texts.texts.push(text.id);
      for (const seg of text.paragraphs ? text.paragraphs.flat() : text.turns || []) texts.segments.push(seg.id);
      for (const q of [...(text.questions || []), ...(text.listeningQuestions || [])]) texts.questions.push(q.id);
    }
    for (const lesson of unit.lessons) {
      out.lessons.push(lesson.id);
      for (const ex of lesson.exercises) {
        out.exercises[ex.id] = exerciseKey(ex);
        if (ex.textId) texts.textExercises[ex.id] = textExerciseKey(ex);
      }
    }
  }
  return texts.texts.length ? { ...out, ...texts } : out;
}

/** { packId: entries } for a list of packs. */
export function lockEntries(packs) {
  return Object.fromEntries(packs.map((p) => [p.id, packEntries(p)]));
}

const sameItems = (a, b) => {
  const [ta, ...ia] = a.split(' ');
  const [tb, ...ib] = b.split(' ');
  return { type: ta === tb, items: [...ia].sort().join(' ') === [...ib].sort().join(' ') };
};

/**
 * Compare the current content with a lock.
 * @returns {{ removed: string[], changed: {id, was, now, what}[], unlocked: string[] }}
 *   removed: locked ids (any kind) that no pack has any more — progress keyed on them would be orphaned
 *   changed: locked exercise ids whose type or items differ, or (texts) whose text, question, gaps or unit differ — stored
 *            attempts would describe another exercise
 *   unlocked: ids in the content that the lock does not know yet (lock them with --reason)
 */
export function compareLock(lock, current) {
  const removed = [];
  const changed = [];
  const unlocked = [];
  const all = (entries) => {
    const ids = new Map();
    for (const [packId, e] of Object.entries(entries)) {
      for (const kind of ID_KINDS) for (const id of e[kind] ?? []) ids.set(`${kind}:${id}`, packId);
      for (const id of Object.keys(e.exercises)) ids.set(`exercises:${id}`, packId);
    }
    return ids;
  };
  const exercisesOf = (entries) => Object.assign({}, ...Object.values(entries).map((e) => e.exercises));
  const was = all(lock.packs || {});
  const now = all(current);
  const retired = lock.retired || {};
  for (const key of was.keys()) {
    const id = key.replace(/^\w+:/, '');
    if (!now.has(key) && !(key.startsWith('exercises:') && id in retired)) removed.push(id);
  }
  for (const key of now.keys()) if (!was.has(key)) unlocked.push(key.replace(/^\w+:/, ''));
  const exWas = exercisesOf(lock.packs || {});
  const exNow = exercisesOf(current);
  for (const [id, key] of Object.entries(exWas)) {
    if (!(id in exNow)) continue;
    const same = sameItems(key, exNow[id]);
    if (!same.type || !same.items) changed.push({ id, was: key, now: exNow[id], what: !same.type ? 'type' : 'items' });
  }
  const textsOf = (entries) => Object.assign({}, ...Object.values(entries).map((e) => e.textExercises || {}));
  const txWas = textsOf(lock.packs || {});
  const txNow = textsOf(current);
  for (const [id, key] of Object.entries(txWas)) {
    if (id in txNow && txNow[id] !== key && !changed.some((c) => c.id === id)) changed.push({ id, was: key, now: txNow[id], what: 'text reference' });
  }
  return { removed, changed, unlocked };
}

/** Human-readable failures of a comparison (empty = the lock holds). Unlocked ids are not failures here. */
export function lockFailures({ removed, changed }) {
  return [
    ...removed.map((id) => `locked id "${id}" no longer exists in the content`),
    ...changed.map((c) => `locked exercise "${c.id}" changed its ${c.what}: was "${c.was}", now "${c.now}"`),
  ];
}

/**
 * A new lock from the current content, with the reason (and what changed) appended to the history.
 * retire: exercise ids that left the content on purpose (hidden by an admin correction); they move to `retired` with
 * their locked key, so the lock no longer reports them as removed. A retired id that is back in the content (an undo)
 * leaves `retired` again.
 */
export function updateLock(lock, current, { reason, date, retire = [] }) {
  if (!reason || !String(reason).trim()) throw new Error('a reason is required to update the id lock');
  const why = String(reason).trim();
  const base = lock || { packs: {} };
  const lockedEx = Object.assign({}, ...Object.values(base.packs || {}).map((e) => e.exercises));
  const nowEx = Object.assign({}, ...Object.values(current).map((e) => e.exercises));
  const retired = { ...(base.retired || {}) };
  for (const id of retire) {
    if (!(id in lockedEx)) throw new Error(`cannot retire "${id}": it is not a locked exercise`);
    if (id in nowEx) throw new Error(`cannot retire "${id}": it is still in the content`);
    retired[id] = { key: lockedEx[id], date, reason: why };
  }
  for (const id of Object.keys(retired)) if (id in nowEx) delete retired[id];
  // Retired ids stay listed in their pack too, so a later comparison still knows them.
  const packs = Object.fromEntries(Object.entries(current).map(([packId, e]) => {
    const keep = Object.fromEntries(Object.entries(base.packs?.[packId]?.exercises || {}).filter(([id]) => id in retired));
    const keepTx = Object.fromEntries(Object.entries(base.packs?.[packId]?.textExercises || {}).filter(([id]) => id in retired));
    const tx = e.textExercises || Object.keys(keepTx).length ? { textExercises: { ...(e.textExercises || {}), ...keepTx } } : {};
    return [packId, { ...e, exercises: { ...e.exercises, ...keep }, ...tx }];
  }));
  const diff = compareLock({ ...base, retired }, current);
  const history = [...(base.history || []), {
    date, reason: why, added: diff.unlocked.length, removed: diff.removed, changed: diff.changed.map((c) => c.id),
    ...(retire.length ? { retired: [...retire] } : {}),
  }];
  return { about: ABOUT, history, ...(Object.keys(retired).length ? { retired } : {}), packs };
}

const ABOUT = 'Every unit, lesson, item and exercise id of the packs, and each exercise\'s type and items; for texts also the '
  + 'text, sentence/turn and question ids and what each text exercise stands for. Progress is stored '
  + 'by these ids: none may disappear or change meaning (server/test/idlock.test.js). Update only deliberately: '
  + 'npm run content:lock -- --reason "<why>".';

/** One id per line: readable diffs when content is added. */
export const formatLock = (lock) => `${JSON.stringify(lock, null, 1)}\n`;

export function readLock(file) {
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
}

/** Packs listed in the manifest with a file that exists (available and generated-ahead packs alike). */
export function readPacks(packsDir) {
  const manifest = JSON.parse(fs.readFileSync(path.join(packsDir, 'manifest.json'), 'utf8'));
  return manifest.tracks.flatMap((t) => t.packs)
    .filter((p) => p.file && fs.existsSync(path.join(packsDir, p.file)))
    .map((p) => JSON.parse(fs.readFileSync(path.join(packsDir, p.file), 'utf8')));
}
