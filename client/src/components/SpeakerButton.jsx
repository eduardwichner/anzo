import { play } from '../audio/player.js';
import { useAudioState } from '../audio/useAudio.js';
import { IconSpeaker, IconTurtle } from '../icons/index.jsx';
import { t } from '../i18n/index.js';

// 🔊 (normal) or 🐢 (slow) for one clip. Renders nothing without a URL, so missing audio never shows a dead button.
export default function SpeakerButton({ url, slow = false, big = false, testId, label = null }) {
  const { playing, url: current } = useAudioState();
  if (!url) return null;
  const active = playing && current === url;
  const classes = ['speaker-btn', slow && 'speaker-btn--slow', big && 'speaker-btn--big', active && 'is-playing'].filter(Boolean);
  return (
    <button
      type="button"
      className={classes.join(' ')}
      aria-label={label ?? (slow ? t('audio.playSlow') : t('audio.play'))}
      data-testid={testId ?? (slow ? 'speaker-slow' : 'speaker')}
      onClick={(e) => {
        e.stopPropagation();
        play(url);
      }}
    >
      {slow ? <IconTurtle /> : <IconSpeaker />}
    </button>
  );
}
