import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import { getProfiles } from '../api/auth.js';
import { deviceLang, rememberDeviceLang, setLang, t, useLang } from '../i18n/index.js';
import Avatar from '../components/Avatar.jsx';
import Button from '../components/Button.jsx';
import LangToggle from '../components/LangToggle.jsx';
import Mascot from '../components/Mascot.jsx';

export default function Login() {
  const { login } = useAuth();
  const lang = useLang();
  const [profiles, setProfiles] = useState(null);
  const [selected, setSelected] = useState(null); // username of the tapped card, or 'other' (username field)
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  // The toggle always shows the language that will be used: the device's until an account is chosen, then that
  // account's saved language. Changed after choosing an account, it is sent with the login and saved to that
  // account (only if the login succeeds); typed accounts ("other") keep their saved language unless it was changed.
  const [langTouched, setLangTouched] = useState(false);
  const passwordRef = useRef(null);

  const [profilesFailed, setProfilesFailed] = useState(false);
  const loadProfiles = () => {
    setProfilesFailed(false);
    getProfiles().then((r) => setProfiles(r.profiles)).catch(() => {
      setProfiles([]);
      setProfilesFailed(true);
    });
  };
  useEffect(loadProfiles, []);

  useEffect(() => {
    if (selected) passwordRef.current?.focus();
  }, [selected]);

  const otherMode = selected === 'other';
  const choose = (next) => {
    setSelected(next);
    setPassword('');
    setError(null);
    setLangTouched(false);
    const chosen = profiles?.find((p) => p.username === next);
    setLang(chosen?.uiLang ?? deviceLang());
  };

  const switchLang = (next) => {
    setLang(next);
    // Before an account is chosen the toggle is the device's language; afterwards it belongs to this login.
    if (selected) setLangTouched(true);
    else rememberDeviceLang(next);
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(otherMode ? username : selected, password, langTouched ? lang : undefined);
    } catch (err) {
      setError(err.status === 429 ? t('login.tooMany') : err.status === 401 ? t('login.wrong') : t('app.error'));
      setBusy(false);
    }
  };

  const profile = profiles?.find((p) => p.username === selected);

  return (
    <main className="page" data-testid="login">
      <div className="login-top">
        <LangToggle value={lang} onChange={switchLang} label={t('login.language')} testId="login-lang" size="small" />
      </div>
      <div className="login-brand">
        <Mascot kind="otter" />
        <h1>{t('app.name')}</h1>
      </div>

      {!otherMode && (
        <section className="stack">
          <h2>{profile ? t('login.hello', { name: profile.displayName }) : t('login.title')}</h2>
          <div className="profile-grid" data-testid="profile-grid">
            {(profiles || []).map((p) => (
              <button
                key={p.username}
                type="button"
                className="profile-card"
                data-testid={`profile-${p.username}`}
                aria-pressed={selected === p.username}
                onClick={() => choose(p.username)}
              >
                <Avatar avatar={p.avatar} bg={p.avatarBg} />
                <span className="profile-name">{p.displayName}</span>
              </button>
            ))}
          </div>
          {profilesFailed && (
            <div className="stack" data-testid="profiles-failed">
              <p className="form-error" role="alert">{t('app.offline')}</p>
              <button type="button" className="btn btn--secondary btn--small self-start" onClick={loadProfiles}>{t('app.retry')}</button>
            </div>
          )}
        </section>
      )}

      {(selected || otherMode) && (
        <form className="card stack" onSubmit={submit}>
          {otherMode && (
            <>
              <h2>{t('login.otherTitle')}</h2>
              <div className="field">
                <label htmlFor="login-username">{t('login.username')}</label>
                <input
                  id="login-username"
                  className="input"
                  autoComplete="username"
                  autoCapitalize="off"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>
            </>
          )}
          <div className="field">
            <label htmlFor="login-password">{t('login.password')}</label>
            <input
              id="login-password"
              ref={passwordRef}
              className="input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && <p className="form-error" role="alert" data-testid="login-error">{error}</p>}
          <Button type="submit" size="big" block disabled={busy || !password}>
            {t('login.submit')}
          </Button>
        </form>
      )}

      <button type="button" className="link-btn login-other" data-testid="login-other" onClick={() => choose(otherMode ? null : 'other')}>
        {otherMode ? t('app.back') : t('login.otherAccount')}
      </button>
    </main>
  );
}
