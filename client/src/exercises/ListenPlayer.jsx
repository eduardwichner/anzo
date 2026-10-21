import { useEffect } from 'react';
import { play } from '../audio/player.js';
import { useLessonAudio } from '../audio/LessonAudioContext.jsx';
import SpeakerButton from '../components/SpeakerButton.jsx';
import { t } from '../i18n/index.js';

/** Big 🔊 + 🐢 for listening exercises; plays once when the exercise appears (if auto-play is on). */
export default function ListenPlayer({ exercise }) {
  const { autoplay } = useLessonAudio();
  useEffect(() => {
    if (autoplay && exercise.audio) play(exercise.audio);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exercise.id]);

  if (!exercise.audio) return <p className="form-error" role="alert">{t('audio.missing')}</p>;
  return (
    <div className="listen-player" data-testid="listen-player">
      <SpeakerButton url={exercise.audio} big testId="listen-play" />
      <SpeakerButton url={exercise.audioSlow} slow big testId="listen-slow" />
    </div>
  );
}
