import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getTracks } from '../api/content.js';
import { t } from '../i18n/index.js';
import TopBar from '../components/TopBar.jsx';
import { LevelRow } from '../components/LevelSheet.jsx';
import { Loading, LoadError } from '../components/Loading.jsx';

// The admin's view of the manifest: every track's levels (available, coming soon, later). Children see the same rows
// in the level sheet on Home (/levels opens it there).
export default function Levels() {
  const [tracks, setTracks] = useState(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    setFailed(false);
    getTracks().then((r) => setTracks(r.tracks)).catch(() => setFailed(true));
  }, []);
  useEffect(load, [load]);

  if (failed) return <LoadError onRetry={load} />;
  if (!tracks) return <Loading />;

  return (
    <main className="page" data-testid="levels">
      <TopBar title={t('levels.title')} backTo="/admin" />
      {tracks.map((track) => (
        <section key={track.id} className="track-block" data-track={track.id}>
          <h2>{t(`languages.${track.id}`)}</h2>
          {track.packs.map((pack) => (
            <LevelRow
              key={pack.id}
              pack={pack}
              progress={pack.progress && { done: pack.progress.lessonsDone, total: pack.progress.lessonsTotal, percent: pack.progress.percent }}
            >
              {/* Admin → Levels → Preview: play any lesson of a loaded level, a preview level too; nothing is stored */}
              {['available', 'preview'].includes(pack.status) && (
                <Link to={`/admin/preview/${pack.id}`} className="btn btn--small btn--secondary level-preview" data-testid="level-preview">{t('admin.preview.open')}</Link>
              )}
            </LevelRow>
          ))}
        </section>
      ))}
    </main>
  );
}
