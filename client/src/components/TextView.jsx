import { Fragment, useState } from 'react';
import { pauseSequence, play, playSequence, resumeSequence, stop } from '../audio/player.js';
import { tokenKey } from '../audio/tokens.js';
import { useAudioState } from '../audio/useAudio.js';
import { useLessonAudio } from '../audio/LessonAudioContext.jsx';
import { IconSpeaker, IconTurtle } from '../icons/index.jsx';
import { t } from '../i18n/index.js';

const PAUSE_SENTENCE = 350;
const PAUSE_PARAGRAPH = 900; // between paragraphs, and after a turn of a dialogue
const PAUSE_TURN = 700;

/** The clips of a text in reading order, with the pauses between them (slow: the turtle clips). */
export function textPlaylist(text, slow = false) {
  const url = (x) => (slow ? x.audioSlow : x.audio);
  if (text.kind === 'dialogue') return text.turns.map((x) => ({ url: url(x), pauseMs: PAUSE_TURN }));
  return text.paragraphs.flatMap((par) => par.map((x, i) => ({ url: url(x), pauseMs: i === par.length - 1 ? PAUSE_PARAGRAPH : PAUSE_SENTENCE })));
}

/**
 * ▶ (and 🐢) for a whole text: the sentences one after another; while it plays ⏸ pauses (▶ goes on from the current
 * sentence), ■ stops, and "3 / 24" shows where it is — long B2 texts and listening.
 */
export function TextPlayButtons({ text, big = false, testId = 'text-play' }) {
  const { sequence } = useAudioState();
  const running = sequence?.key === text.id || sequence?.key === `${text.id}:slow`;
  const cls = `speaker-btn${big ? ' speaker-btn--big' : ''}`;
  if (running) {
    return (
      <span className="speaker-row">
        {sequence.paused ? (
          <button type="button" className={cls} aria-label={t('text.resume')} data-testid={`${testId}-resume`} onClick={resumeSequence}>
            <IconSpeaker />
          </button>
        ) : (
          <button type="button" className={`${cls} speaker-btn--pause`} aria-label={t('text.pause')} data-testid={`${testId}-pause`} onClick={pauseSequence}>
            <span className="pause-bars" aria-hidden="true" />
          </button>
        )}
        <button type="button" className={`${cls} speaker-btn--stop`} aria-label={t('text.stop')} data-testid={`${testId}-stop`} onClick={stop}>
          <span className="stop-square" aria-hidden="true" />
        </button>
        {sequence.total > 1 && (
          <span className="seq-progress" data-testid={`${testId}-progress`} aria-label={t('text.progress', { n: sequence.index + 1, total: sequence.total })}>
            {sequence.index + 1} / {sequence.total}
          </span>
        )}
      </span>
    );
  }
  return (
    <span className="speaker-row">
      <button type="button" className={cls} aria-label={t('text.play')} data-testid={testId} onClick={() => playSequence(text.id, textPlaylist(text))}>
        <IconSpeaker />
      </button>
      <button type="button" className={`${cls} speaker-btn--slow`} aria-label={t('text.playSlow')} data-testid={`${testId}-slow`}
        onClick={() => playSequence(`${text.id}:slow`, textPlaylist(text, true))}>
        <IconTurtle />
      </button>
    </span>
  );
}

/** One sentence or turn: every word a button (its sound; its meaning when the text gives one). */
function Words({ target, lang, glossary, onWord, segId }) {
  const parts = String(target).split(/(\s+)/);
  return parts.map((part, i) => {
    if (!/\S/.test(part)) return <Fragment key={i}>{part}</Fragment>;
    const key = tokenKey(part);
    const gloss = glossary.has(key);
    return (
      <button key={i} type="button" className={`word-btn${gloss ? ' word-btn--gloss' : ''}`} lang={lang} data-testid={gloss ? 'gloss-word' : 'text-word'}
        aria-label={t('audio.playWord', { word: part })} onClick={() => onWord(part, segId)}>
        {part}
      </button>
    );
  });
}

/**
 * A reading text or a dialogue: the sentences (or chat bubbles with the speakers' names), ▶ / 🐢 to hear it sentence by
 * sentence with the current one highlighted, every word tappable (its sound and, for glossary and course words, its
 * meaning in a small popover). `collapsible`: the text folds away (phones) while its questions are answered — on its own,
 * or controlled with `open` + `onToggle(next)`.
 * `translation`: each sentence's meaning under it (after answering).
 */
export default function TextView({ text, track, nativeLang, collapsible = false, translation = false, testId = 'text', open: openProp, onToggle, bounded = false, labels = null }) {
  const { wordAudio } = useLessonAudio();
  const { sequence } = useAudioState();
  const [openState, setOpenState] = useState(true);
  // controlled (open + onToggle: the stepped text screen folds it after the first question) or on its own
  const open = openProp ?? openState;
  const setOpen = onToggle ?? ((f) => setOpenState(f));
  const [popover, setPopover] = useState(null); // { word, meaning }
  const glossary = new Set((text.glossary || []).map(tokenKey));
  const current = sequence && (sequence.key === text.id || sequence.key === `${text.id}:slow`) ? sequence.index : -1;

  const onWord = (word, segId) => {
    const key = tokenKey(word);
    play(wordAudio?.[key]);
    setPopover({ word, segId, meaning: text.meanings?.[key] ?? null });
  };
  // the meaning appears right after the sentence of the tapped word, where the eye is (at the top of a long
  // text it was off screen on a phone)
  const popoverBox = () => (
    <span className="word-popover" role="status" data-testid="word-popover">
      <strong lang={track}>{popover.word}</strong>
      {popover.meaning ? <span lang={nativeLang}>{popover.meaning}</span> : <span className="muted">{t('text.noMeaning')}</span>}
      <button type="button" className="icon-btn icon-btn--small" aria-label={t('text.closeWord')} onClick={() => setPopover(null)}>×</button>
    </span>
  );

  let n = -1; // running sentence index, matches the playlist order
  const segment = (x, extraClass = '') => {
    n += 1;
    const active = n === current;
    return (
      <span key={x.id} className={`text-seg${active ? ' is-current' : ''}${extraClass}`} data-testid="text-seg" data-seg-id={x.id} data-current={active ? 'true' : 'false'}>
        <Words target={x.target} lang={track} glossary={glossary} onWord={onWord} segId={x.id} />
        {translation && <span className="text-translation" lang={nativeLang}>{x.native}</span>}
        {popover?.segId === x.id && popoverBox()}
      </span>
    );
  };

  return (
    <section className={`card text-card text-card--${text.kind}${open ? '' : ' is-folded'}${bounded ? ' text-card--bounded' : ''}`} data-testid={testId}
      data-text-id={text.id} data-open={open ? 'true' : 'false'} data-bounded={bounded ? 'true' : undefined}>
      <div className="text-head">
        <h3 className="text-title" lang={nativeLang}>{text.title}</h3>
        <TextPlayButtons text={text} />
        {collapsible && (
          <button type="button" className="btn btn--small btn--secondary text-toggle" aria-expanded={open} data-testid="text-toggle" onClick={() => setOpen(!open)}>
            {open ? t('text.hide') : t('text.show')}
          </button>
        )}
      </div>
      {open && (text.kind === 'dialogue' ? (
        <div className="dialogue">
          {text.turns.map((turn) => (
            <div key={turn.id} className={`bubble bubble--${turn.speaker === 'A' ? 'a' : 'b'}`} data-testid="dialogue-turn" data-speaker={turn.speaker}>
              <span className="bubble-name">{text.speakers?.[turn.speaker]?.name ?? turn.speaker}</span>
              {segment(turn)}
            </div>
          ))}
        </div>
      ) : (
        <div className="reading">
          {text.paragraphs.map((par, i) => (
            <p key={par[0].id} className="text-par" data-testid="text-paragraph" data-paragraph={i + 1}>
              {/* B2 multiple matching: each short text under the name the statements are matched to */}
              {labels?.[i] ? <span className="par-label" lang={track} data-testid="paragraph-label">{labels[i]}</span>
                : <span className="par-number" aria-hidden="true">{i + 1}</span>}
              {par.map((x) => <Fragment key={x.id}>{segment(x)} </Fragment>)}
            </p>
          ))}
        </div>
      ))}
    </section>
  );
}
