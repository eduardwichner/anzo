import { useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import { changePassword } from '../api/auth.js';
import { t } from '../i18n/index.js';
import Button from '../components/Button.jsx';

const MIN = 8;

// Shown instead of every admin page while the admin still has the seeded (or an admin-set) password.
export default function ForcePasswordChange() {
  const { refresh, logout } = useAuth();
  const [form, setForm] = useState({ current: '', next: '', repeat: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (form.next !== form.repeat) return setError(t('settings.mismatch'));
    if (form.next.length < MIN) return setError(t('settings.tooShort', { min: MIN }));
    setBusy(true);
    setError(null);
    try {
      await changePassword(form.current, form.next);
      await refresh();
    } catch (err) {
      const code = err.body?.error;
      setError(code === 'wrong_current_password' ? t('settings.wrongCurrent')
        : code === 'password_too_short' ? t('settings.tooShort', { min: err.body.min }) : t('app.error'));
      setBusy(false);
    }
  };

  const field = (name, label, autoComplete) => (
    <div className="field">
      <label htmlFor={`force-${name}`}>{label}</label>
      <input id={`force-${name}`} className="input" type="password" autoComplete={autoComplete} value={form[name]} onChange={set(name)} />
    </div>
  );

  return (
    <main className="page" data-testid="force-password">
      <form className="card stack" onSubmit={submit}>
        <h1>{t('forcePassword.title')}</h1>
        <p className="muted">{t('forcePassword.text', { min: MIN })}</p>
        {field('current', t('settings.current'), 'current-password')}
        {field('next', t('settings.next'), 'new-password')}
        {field('repeat', t('settings.repeat'), 'new-password')}
        {error && <p className="form-error" role="alert" data-testid="force-password-error">{error}</p>}
        <Button type="submit" block disabled={busy || !form.current || !form.next}>{t('forcePassword.submit')}</Button>
      </form>
      <Button variant="secondary" block onClick={logout}>{t('settings.logout')}</Button>
    </main>
  );
}
