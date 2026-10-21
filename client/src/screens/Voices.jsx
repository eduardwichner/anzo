import { useCallback, useEffect, useState } from 'react';
import { getVoices } from '../api/admin.js';
import { t } from '../i18n/index.js';
import SpeakerButton from '../components/SpeakerButton.jsx';
import TopBar from '../components/TopBar.jsx';
import { Loading, LoadError } from '../components/Loading.jsx';

// Admin → Voices: read-only. One Piper voice per language (content/voices.json), its licence and a sample.
// Changing the voice is an authoring step (docs/operator-guide.md: Audio), not a setting.
export default function Voices() {
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);
  const load = useCallback(() => {
    setFailed(false);
    getVoices().then(setData).catch(() => setFailed(true));
  }, []);
  useEffect(load, [load]);

  if (failed) return <LoadError onRetry={load} />;
  if (!data) return <Loading />;

  return (
    <main className="page" data-testid="voices">
      <TopBar title={t('voices.title')} backTo="/admin" />
      <p className="muted">{t('voices.intro')}</p>
      {data.tracks.map((v) => (
        <article key={v.track} className="card voice-card stack" data-testid={`voices-${v.track}`} data-voice={v.voice}>
          <h2>{t(`languages.${v.track}`)}</h2>
          <dl className="voice-facts">
            <dt>{t('voices.voice')}</dt>
            <dd data-testid="voice-name">{v.voice}</dd>
            <dt>{t('voices.licence')}</dt>
            <dd data-testid="voice-licence">{`${v.licence ?? '—'} (${t(`voices.assessment.${v.licenceAssessment}`)})`}</dd>
            <dt>{t('voices.tempoLabel')}</dt>
            <dd>{t('voices.tempo', { normal: v.lengthScale, slow: v.slowLengthScale })}</dd>
          </dl>
          {v.sample?.url ? (
            <div className="voice-sample">
              <SpeakerButton url={v.sample.url} testId="voice-sample" />
              <span lang={v.track}>{v.sample.text}</span>
            </div>
          ) : (
            <p className="muted">{t('voices.noSample')}</p>
          )}
          {v.dialogue && (
            <div className="stack-tight" data-testid="voice-dialogue">
              <h3>{t('voices.dialogueTitle')}</h3>
              <dl className="voice-facts">
                <dt>{t('voices.voice')}</dt>
                <dd>{v.dialogue.speakerName ? `${v.dialogue.voice} (${v.dialogue.speakerName})` : v.dialogue.voice}</dd>
                <dt>{t('voices.licence')}</dt>
                <dd>{`${v.dialogue.licence ?? '—'} (${t(`voices.assessment.${v.dialogue.licenceAssessment}`)})`}</dd>
              </dl>
              {v.dialogue.sample?.url && (
                <div className="voice-sample">
                  <SpeakerButton url={v.dialogue.sample.url} testId="voice-dialogue-sample" />
                  <span lang={v.track}>{v.dialogue.sample.text}</span>
                </div>
              )}
            </div>
          )}
        </article>
      ))}
    </main>
  );
}
