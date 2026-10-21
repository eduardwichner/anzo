// Settings → "Voortgang wissen": choose a whole course or one level of a course, then confirm with the password and
// the typed word (settings.resetWord). Shown only to admins and to users the admin gave permission.
// Scope values: "track:<id>" (a whole course) or a pack id (one level).
import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import { getTracks } from '../api/content.js';
import { resetMyProgress } from '../api/progress.js';
import { loc, t } from '../i18n/index.js';
import Button from './Button.jsx';

/** Courses → scope values in order: each course, then its available levels. tracks: [{ id, packs }] */
export const scopeValues = (tracks) => tracks.flatMap((tr) => [`track:${tr.id}`, ...availablePacks(tr).map((p) => p.id)]);
export const availablePacks = (track) => (track?.packs ?? []).filter((p) => p.status === 'available');
/** The request body of a scope value. */
export const scopeBody = (scope) => (scope.startsWith('track:') ? { scope: 'track', track: scope.slice(6) } : { scope: 'pack', packId: scope });

export function scopeLabel(scope, tracks) {
  if (scope.startsWith('track:')) return t('settings.resetScopeTrack', { language: t(`languages.${scope.slice(6)}`) });
  const track = tracks.find((tr) => tr.packs.some((p) => p.id === scope));
  const pack = track?.packs.find((p) => p.id === scope);
  return pack ? `${tracks.length > 1 ? `${t(`languages.${track.id}`)} · ` : ''}${t('settings.resetScopePack', { cefr: pack.cefr, title: loc(pack.title) })}` : scope;
}

export default function SelfReset() {
  const { user, setStats } = useAuth();
  const [tracks, setTracks] = useState(null);
  const [step, setStep] = useState('closed'); // closed | scope | confirm
  const [scope, setScope] = useState(null);
  const [password, setPassword] = useState('');
  const [word, setWord] = useState('');
  const [message, setMessage] = useState(null); // { ok, text }
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getTracks({ mine: true }) // the admin resets only his own courses here (others' in Admin → Users)
      .then(({ tracks: list, active }) => {
        setTracks(list);
        setScope(`track:${active ?? list[0]?.id}`);
      })
      .catch(() => setTracks([]));
  }, []);

  const confirmWord = t('settings.resetWord');
  const label = scope ? scopeLabel(scope, tracks ?? []) : '';

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const res = await resetMyProgress({ ...scopeBody(scope), password, confirm: word });
      setStats(res.stats);
      setStep('closed');
      setPassword('');
      setWord('');
      setMessage({ ok: true, text: t('settings.resetDone', { scope: label }) });
    } catch (err) {
      const code = err.body?.error;
      setMessage({
        ok: false,
        text: code === 'wrong_password' ? t('settings.resetWrongPassword')
          : code === 'confirm_mismatch' ? t('settings.resetWrongWord', { word: confirmWord }) : t('app.error'),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card stack" data-testid="settings-reset">
      <h2>{t('settings.reset')}</h2>
      {!tracks?.length ? (
        <p className="muted">{t('settings.resetNothing')}</p>
      ) : (
        <>
          <p className="muted">{t('settings.resetIntro')}</p>
          {step === 'closed' && (
            <Button variant="secondary" block data-testid="reset-open" onClick={() => { setStep('scope'); setMessage(null); }}>
              {t('settings.reset')}
            </Button>
          )}
          {step === 'scope' && (
            <fieldset className="choice-list" data-testid="reset-scope">
              <legend>{t('settings.resetScope')}</legend>
              {scopeValues(tracks).map((value) => (
                <label key={value} className="choice">
                  <input
                    type="radio"
                    name="reset-scope"
                    value={value}
                    checked={scope === value}
                    data-testid={`reset-scope-${value.replace(':', '-')}`}
                    onChange={() => setScope(value)}
                  />
                  <span>{scopeLabel(value, tracks)}</span>
                </label>
              ))}
              <div className="row row--end">
                <Button variant="secondary" size="small" onClick={() => setStep('closed')}>{t('app.cancel')}</Button>
                <Button size="small" data-testid="reset-next" onClick={() => setStep('confirm')}>{t('settings.resetNext')}</Button>
              </div>
            </fieldset>
          )}
          {step === 'confirm' && (
            <form className="confirm-box" role="alertdialog" aria-labelledby="reset-confirm-title" onSubmit={submit} data-testid="reset-confirm">
              <h3 id="reset-confirm-title">{t('settings.resetConfirmTitle')}</h3>
              <p>{t('settings.resetConfirmText', { scope: label })}</p>
              <div className="field">
                <label htmlFor="reset-password">{t('settings.resetPassword')}</label>
                <input
                  id="reset-password"
                  className="input"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  data-testid="reset-password"
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="reset-word">{t('settings.resetTypeWord', { word: confirmWord })}</label>
                <input
                  id="reset-word"
                  className="input"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  value={word}
                  data-testid="reset-word"
                  onChange={(e) => setWord(e.target.value)}
                />
              </div>
              <div className="row row--end">
                <Button variant="secondary" size="small" onClick={() => setStep('closed')}>{t('app.cancel')}</Button>
                <Button
                  type="submit"
                  variant="danger"
                  size="small"
                  data-testid="reset-submit"
                  disabled={busy || !password || word.trim().toUpperCase() !== confirmWord.toUpperCase()}
                >
                  {t('settings.resetSubmit')}
                </Button>
              </div>
            </form>
          )}
        </>
      )}
      {message && <p className={message.ok ? 'form-ok' : 'form-error'} role="alert" data-testid="reset-message">{message.text}</p>}
    </section>
  );
}
