import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { clearContentCache, findExercise, getPack, getTracks } from '../api/content.js';
import { completePractice, postPracticeAttempt, startPractice } from '../api/practice.js';
import { t } from '../i18n/index.js';
import { Loading } from '../components/Loading.jsx';
import SessionPlayer from '../exercises/SessionPlayer.jsx';

const MESSAGES = { practice_locked: 'practice.locked', no_mistakes: 'practice.mistakesNone' };

// /practice/due and /practice/mistakes: the server picks existing exercises of completed lessons; the client already
// has those packs (Home loaded them), so the session is played from them like a lesson.
export default function Practice() {
  const { mode } = useParams();
  const navigate = useNavigate();
  const { user, setStats } = useAuth();
  const [state, setState] = useState(null); // { session, exercises, wordAudio, mascot } | { error }
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return; // one session per visit (StrictMode runs effects twice in development)
    started.current = true;
    (async () => {
      try {
        const { tracks, active } = await getTracks({ mine: true });
        const { session } = await startPractice(mode === 'mistakes' ? 'mistakes' : 'due');
        // The packs the session draws from; packs cached before the admin changed a lesson may lack an exercise: once
        // more from the server then.
        const resolve = async () => {
          const packs = await Promise.all([...new Set(session.exercises.map((e) => e.packId))].map(getPack));
          return session.exercises.map((e) => findExercise(packs, e.id));
        };
        let found = await resolve();
        if (found.some((f) => !f)) {
          clearContentCache();
          found = await resolve();
        }
        if (found.some((f) => !f)) throw new Error('exercise_missing');
        // Tap-to-hear for every word of the session: the word lists of the packs it draws from.
        const wordAudio = Object.assign({}, ...[...new Set(found.map((f) => f.pack))].map((p) => p.wordAudio || {}));
        // the course, and the language it teaches (lang attributes, the language's name)
        const courseId = found[0]?.pack.track ?? active ?? tracks[0]?.id;
        const course = tracks.find((tr) => tr.id === courseId);
        setState({ session, track: found[0]?.pack.language ?? course?.target ?? courseId, exercises: found.map((f) => f.exercise), wordAudio, mascot: course?.mascot ?? null });
      } catch (err) {
        setState({ error: MESSAGES[err.body?.error] ?? 'practice.loadFailed' });
      }
    })();
  }, [mode]);

  if (!state) return <Loading />;
  if (state.error) {
    return (
      <main className="page" data-testid="practice-unavailable">
        <div className="center">
          <p>{t(state.error)}</p>
          <Link className="btn" to="/">{t('app.back')}</Link>
        </div>
      </main>
    );
  }

  const { session } = state;
  const finish = async ({ startedAt }) => {
    const res = await completePractice(session.id, startedAt);
    setStats(res.stats);
    navigate('/practice/done', { replace: true, state: { kind: 'practice', mode: session.mode, mascot: state.mascot, ...res } });
  };

  return (
    <SessionPlayer
      user={user}
      track={state.track}
      mascot={state.mascot}
      exercises={state.exercises}
      wordAudio={state.wordAudio}
      submit={(exercise, answer) => postPracticeAttempt(session.id, exercise.id, answer)}
      finish={finish}
      testId="practice"
      quitLabel={t('practice.quit')}
      rootProps={{ 'data-practice-id': session.id, 'data-mode': session.mode }}
    />
  );
}
