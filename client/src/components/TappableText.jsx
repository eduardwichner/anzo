import { Fragment } from 'react';
import { play } from '../audio/player.js';
import { tokenKey } from '../audio/tokens.js';
import { useLessonAudio } from '../audio/LessonAudioContext.jsx';
import { t } from '../i18n/index.js';

/** Target-language text where every word with a clip is a tap-to-hear button. Dutch text never uses this. */
export default function TappableText({ text, lang }) {
  const { wordAudio } = useLessonAudio();
  const parts = String(text).split(/(\s+)/);
  return (
    <span lang={lang} className="tappable">
      {parts.map((part, i) => {
        const url = /\S/.test(part) ? wordAudio?.[tokenKey(part)] : null;
        if (!url) return <Fragment key={i}>{part}</Fragment>;
        return (
          <button
            key={i}
            type="button"
            className="word-btn"
            data-testid="word"
            aria-label={t('audio.playWord', { word: part })}
            onClick={() => play(url)}
          >
            {part}
          </button>
        );
      })}
    </span>
  );
}
