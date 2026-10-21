import { useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import { changePassword, updateMe } from '../api/auth.js';
import { setLang, t } from '../i18n/index.js';
import AvatarPicker from '../components/AvatarPicker.jsx';
import GoalPicker from '../components/GoalPicker.jsx';
import Button from '../components/Button.jsx';
import LangToggle from '../components/LangToggle.jsx';
import SelfReset from '../components/SelfReset.jsx';
import TopBar from '../components/TopBar.jsx';
import ThemeToggle from '../components/ThemeToggle.jsx';
import { applyTheme } from '../lib/theme.js';

const EMPTY = { current: '', next: '', repeat: '' };

export default function Settings() {
  const { user, logout, refresh, setUser } = useAuth();
  const [form, setForm] = useState(EMPTY);
  const [message, setMessage] = useState(null); // { ok, text }
  const [prefsError, setPrefsError] = useState(null);
  const [busy, setBusy] = useState(false);
  const min = user.role === 'admin' ? 8 : 4;

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  // Language, theme, avatar, daily goal, sound effects, autoplay and the family board save at once; the screen follows immediately.
  const savePrefs = async (changes) => {
    setPrefsError(null);
    const previous = user;
    if (changes.uiLang) setLang(changes.uiLang);
    if (changes.theme) applyTheme(changes.theme);
    setUser({ ...user, ...changes });
    try {
      const { user: saved } = await updateMe(changes);
      setUser(saved);
    } catch {
      setUser(previous);
      setLang(previous.uiLang);
      applyTheme(previous.theme ?? 'system');
      setPrefsError(t('app.error'));
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (form.next !== form.repeat) return setMessage({ ok: false, text: t('settings.mismatch') });
    if (form.next.length < min) return setMessage({ ok: false, text: t('settings.tooShort', { min }) });
    setBusy(true);
    setMessage(null);
    try {
      await changePassword(form.current, form.next);
      setForm(EMPTY);
      setMessage({ ok: true, text: t('settings.saved') });
      refresh().catch(() => {});
    } catch (err) {
      const code = err.body?.error;
      setMessage({
        ok: false,
        text: code === 'wrong_current_password' ? t('settings.wrongCurrent')
          : code === 'password_too_short' ? t('settings.tooShort', { min: err.body.min })
            : t('app.error'),
      });
    } finally {
      setBusy(false);
    }
  };

  const field = (name, label, autoComplete) => (
    <div className="field">
      <label htmlFor={`pw-${name}`}>{label}</label>
      <input id={`pw-${name}`} className="input" type="password" autoComplete={autoComplete} value={form[name]} onChange={set(name)} />
    </div>
  );

  return (
    <main className="page" data-testid="settings">
      <TopBar title={t('settings.title')} backTo={user.role === 'admin' ? '/admin' : '/'} />

      <section className="card stack">
        <h2 id="settings-lang-label">{t('settings.language')}</h2>
        <LangToggle value={user.uiLang} onChange={(uiLang) => savePrefs({ uiLang })} label={t('settings.language')} testId="settings-lang" />
        <p className="muted small">{t('settings.languageHelp')}</p>
      </section>

      <section className="card stack">
        <h2 id="settings-theme-label">{t('settings.theme')}</h2>
        <ThemeToggle value={user.theme ?? 'system'} onChange={(theme) => savePrefs({ theme })} />
        <p className="muted small">{t('settings.themeHelp')}</p>
      </section>

      <section className="card stack">
        <h2 id="avatar-label">{t('settings.avatar')}</h2>
        <AvatarPicker avatar={user.avatar} bg={user.avatarBg} onChange={savePrefs} />
      </section>
      {(user.role === 'child' || user.activeTrack) && (
        <>
          <section className="card stack" data-testid="settings-goal">
            <h2>{t('settings.dailyGoal')}</h2>
            <GoalPicker value={user.dailyGoal ?? 20} onChange={(dailyGoal) => savePrefs({ dailyGoal })} testId="settings-goal-picker" />
            <p className="muted small">{t('settings.dailyGoalHelp')}</p>
          </section>
          <section className="card stack" data-testid="settings-autoplay">
            <label className="check check--switch">
              <input type="checkbox" checked={user.autoplay !== false} data-testid="autoplay-setting"
                onChange={(e) => savePrefs({ autoplay: e.target.checked })} />
              <span className="stack-tight">
                <strong>{t('settings.autoplay')}</strong>
                <span className="muted small">{t('settings.autoplayHelp')}</span>
              </span>
            </label>
          </section>
          <section className="card stack">
            <label className="check check--switch">
              <input type="checkbox" checked={user.soundEffects !== false} data-testid="sfx-toggle"
                onChange={(e) => savePrefs({ soundEffects: e.target.checked })} />
              <span className="stack-tight">
                <strong>{t('settings.soundEffects')}</strong>
                <span className="muted small">{t('settings.soundEffectsHelp')}</span>
              </span>
            </label>
          </section>
        </>
      )}
      <section className="card stack" data-testid="settings-board">
        <label className="check check--switch">
          <input type="checkbox" checked={user.showOnBoard !== false} data-testid="board-setting"
            onChange={(e) => savePrefs({ showOnBoard: e.target.checked })} />
          <span className="stack-tight">
            <strong>{t('settings.showOnBoard')}</strong>
            <span className="muted small">{t('settings.showOnBoardHelp')}</span>
          </span>
        </label>
      </section>
      {prefsError && <p className="form-error" role="alert">{prefsError}</p>}

      <form className="card stack" onSubmit={submit}>
        <h2>{t('settings.changePassword')}</h2>
        {field('current', t('settings.current'), 'current-password')}
        {field('next', t('settings.next'), 'new-password')}
        {field('repeat', t('settings.repeat'), 'new-password')}
        {message && (
          <p className={message.ok ? 'form-ok' : 'form-error'} role="alert" data-testid="settings-message">{message.text}</p>
        )}
        <Button type="submit" block disabled={busy || !form.current || !form.next}>{t('settings.save')}</Button>
      </form>

      {(user.role === 'admin' || user.canSelfReset) && <SelfReset />}

      <Button variant="secondary" block data-testid="logout-button" onClick={logout}>{t('settings.logout')}</Button>
    </main>
  );
}
