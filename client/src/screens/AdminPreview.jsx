import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { findLesson, getPack, getTracks, textsOf } from '../api/content.js';
import { previewAttempt } from '../api/admin.js';
import { t } from '../i18n/index.js';
import TopBar from '../components/TopBar.jsx';
import { Loading, LoadError } from '../components/Loading.jsx';
import SessionPlayer from '../exercises/SessionPlayer.jsx';

/** The pack, its manifest row and its course (mascot, meaning language), for the preview screens. */
async function loadPreview(packId) {
  const { tracks } = await getTracks();
  const track = tracks.find((tr) => tr.packs.some((p) => p.id === packId));
  const entry = track?.packs.find((p) => p.id === packId);
  if (!track || !['available', 'preview'].includes(entry.status)) return null;
  return { track, entry, pack: await getPack(packId) };
}

// Admin → Levels → Preview: every lesson of one level (available or preview), to play as a learner sees it.
export function AdminPreviewPack() {
  const { packId } = useParams();
  const { state } = useLocation();
  const [data, setData] = useState(undefined);
  const [failed, setFailed] = useState(false);
  const load = useCallback(() => {
    setFailed(false);
    loadPreview(packId).then(setData).catch(() => setFailed(true));
  }, [packId]);
  useEffect(load, [load]);

  if (failed) return <LoadError onRetry={load} />;
  if (data === undefined) return <Loading />;
  if (data === null) return <main className="page"><TopBar title={t('levels.title')} backTo="/levels" /><p>{t('lesson.notFound')}</p></main>;
  return (
    <main className="page" data-testid="preview-pack" data-pack-id={packId}>
      <TopBar title={t('admin.preview.title', { level: `${t(`languages.${data.track.id}`)} ${data.entry.cefr}` })} backTo="/levels" />
      <p className="muted">{t('admin.preview.intro')}</p>
      {state?.done && <p className="form-ok" role="status" data-testid="preview-done">{t('admin.preview.done', { score: state.done.score })}</p>}
      {data.pack.units.map((unit) => (
        <section key={unit.id} className="card stack-tight" data-testid="preview-unit" data-unit-id={unit.id}>
          <h2>{unit.title}</h2>
          <ul className="preview-lessons">
            {unit.lessons.map((lesson) => (
              <li key={lesson.id}>
                <Link to={`/admin/preview/${packId}/${lesson.id}`} className="preview-lesson" data-testid="preview-lesson" data-lesson-id={lesson.id}>
                  <span>{lesson.title}</span>
                  <span className="muted small">
                    {t('admin.preview.lessons', { n: lesson.exercises.length })}{lesson.extra ? ` · ${t('admin.preview.extra')}` : ''}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}

// One lesson in preview: played like a lesson, graded by /api/admin/preview/attempt, nothing stored; the end returns to
// the lesson list with the first-try score.
export function AdminPreviewLesson() {
  const { packId, lessonId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [data, setData] = useState(undefined);
  const [failed, setFailed] = useState(false);
  const load = useCallback(() => {
    setFailed(false);
    loadPreview(packId).then((d) => setData(d && { ...d, found: findLesson([d.pack], lessonId) })).catch(() => setFailed(true));
  }, [packId, lessonId]);
  useEffect(load, [load]);

  if (failed) return <LoadError onRetry={load} />;
  if (data === undefined) return <Loading />;
  if (!data?.found) return <main className="page"><TopBar title={t('levels.title')} backTo={`/admin/preview/${packId}`} /><p>{t('lesson.notFound')}</p></main>;
  const back = `/admin/preview/${packId}`;
  // the admin sees the lesson as the course's learners do: meanings in the course's native language
  const previewUser = { ...user, nativeLang: data.track.native, audience: 'adult' };
  return (
    <>
      <p className="preview-banner" data-testid="preview-banner">{t('admin.preview.banner')}</p>
      <SessionPlayer
        key={lessonId}
        user={previewUser}
        track={data.pack.language ?? data.pack.track}
        mascot={data.track.mascot}
        exercises={data.found.lesson.exercises}
        wordAudio={data.pack.wordAudio || {}}
        texts={textsOf([data.pack])}
        submit={(exercise, answer) => previewAttempt(exercise.id, answer)}
        finish={async ({ firstTryCorrect, total }) => navigate(back, { replace: true, state: { done: { score: total ? Math.round((100 * firstTryCorrect) / total) : 0 } } })}
        rootProps={{ 'data-lesson-id': lessonId, 'data-preview': 'true' }}
        quitTo={back}
        quitLabel={t('admin.preview.quit')}
        noReport
      />
    </>
  );
}

