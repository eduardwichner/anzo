import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { findLesson, getPack, getTracks, packOfLesson, textsOf, trackOfLesson } from '../api/content.js';
import { completeLesson, postAttempt } from '../api/progress.js';
import { t } from '../i18n/index.js';
import { Loading, LoadError } from '../components/Loading.jsx';
import SessionPlayer from '../exercises/SessionPlayer.jsx';

export default function Lesson() {
  const { lessonId } = useParams();
  const navigate = useNavigate();
  const { user, setStats } = useAuth();

  const [lesson, setLesson] = useState(null); // null = loading, false = not found
  const [mascot, setMascot] = useState(null);
  const [wordAudio, setWordAudio] = useState({});
  const [texts, setTexts] = useState({});
  const [loadFailed, setLoadFailed] = useState(false);

  const load = useCallback(async () => {
    setLoadFailed(false);
    setLesson(null);
    try {
      const { tracks } = await getTracks({ mine: true });
      // Only the course this lesson belongs to.
      const track = trackOfLesson(tracks, lessonId);
      const packId = packOfLesson(track, lessonId);
      const found = packId ? findLesson([await getPack(packId)], lessonId) : null;
      setMascot(track?.mascot ?? null);
      setWordAudio(found?.pack.wordAudio || {});
      setTexts(found ? textsOf([found.pack]) : {});
      setLesson(found ? { ...found.lesson, target: found.pack.language ?? found.pack.track } : false);
    } catch {
      setLoadFailed(true);
    }
  }, [lessonId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loadFailed) return <LoadError onRetry={load} />;
  if (lesson === null) return <Loading />;
  if (lesson === false) {
    return (
      <main className="page"><div className="center"><p>{t('lesson.notFound')}</p><Link className="btn" to="/">{t('app.back')}</Link></div></main>
    );
  }

  const finish = async ({ firstTryCorrect, total, startedAt }) => {
    const res = await completeLesson(lessonId, firstTryCorrect, total, startedAt);
    setStats(res.stats);
    navigate(`/lesson/${lessonId}/done`, { replace: true, state: { kind: 'lesson', lessonId, mascot, ...res } });
  };

  return (
    <SessionPlayer
      key={lessonId}
      user={user}
      track={lesson.target}
      mascot={mascot}
      exercises={lesson.exercises}
      wordAudio={wordAudio}
      texts={texts}
      submit={(exercise, answer, firstTry, startedAt) => postAttempt(lessonId, exercise.id, answer, firstTry, startedAt)}
      finish={finish}
      rootProps={{ 'data-lesson-id': lessonId }}
      noReport={user.role === 'admin'} /* the 🚩 reports go to the admin: he corrects directly (Admin → Corrections) */
    />
  );
}
