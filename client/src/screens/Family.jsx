import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { getFamily, setFamilyGoal } from '../api/family.js';
import { t } from '../i18n/index.js';
import TopBar from '../components/TopBar.jsx';
import Button from '../components/Button.jsx';
import { Loading, LoadError } from '../components/Loading.jsx';
import { FamilyGoalBar, MemberRow, weekRange } from '../components/FamilyBoard.jsx';
import { IconCrown } from '../icons/index.jsx';

// Home → Familie: this week's board (Monday–Sunday). Everyone shown on it, by this week's XP; the family goal; last week's
// top learner wears a crown. The admin sets the family goal here.
export default function Family() {
  const { user } = useAuth();
  const [board, setBoard] = useState(null);
  const [failed, setFailed] = useState(false);
  const [goal, setGoal] = useState('');
  const [message, setMessage] = useState(null); // { ok, text }

  const load = useCallback(() => {
    setFailed(false);
    getFamily().then((b) => {
      setBoard(b);
      setGoal(String(b.goal.target));
    }).catch(() => setFailed(true));
  }, []);
  useEffect(load, [load]);

  const saveGoal = async (e) => {
    e.preventDefault();
    setMessage(null);
    try {
      const next = await setFamilyGoal(Number(goal));
      setBoard(next);
      setMessage({ ok: true, text: t('family.saved') });
    } catch {
      setMessage({ ok: false, text: t('family.invalidGoal') });
    }
  };

  if (failed) return <LoadError onRetry={load} />;
  if (!board) return <Loading />;

  return (
    <main className="page" data-testid="family">
      <TopBar title={t('family.title')} backTo="/" />

      <section className="card stack" data-testid="family-goal-card">
        <h2>{t('family.goalTitle')}</h2>
        <FamilyGoalBar goal={board.goal} large />
        {board.goal.reached && <p className="form-ok" data-testid="family-goal-reached">{t('family.goalReached')}</p>}
        <p className="muted small">{weekRange(board.week)} · {t('family.resets')}</p>
      </section>

      {board.viewer && !board.viewer.shown && (
        <p className="notice" data-testid="family-not-shown">
          {board.viewer.hiddenByAdmin ? t('family.offAdmin') : t('family.offSelf')}{' '}
          {!board.viewer.hiddenByAdmin && <Link to="/settings">{t('family.settingsLink')}</Link>}
        </p>
      )}

      {board.members.length ? (
        <ol className="family-list" data-testid="family-list">
          {board.members.map((m) => <MemberRow key={m.id} member={m} week={board.week} />)}
        </ol>
      ) : (
        <p className="muted" data-testid="family-empty">{t('family.empty')}</p>
      )}
      {board.members.some((m) => m.crown) && (
        <p className="muted small family-legend" data-testid="family-crown-legend">
          <span className="family-legend-crown" aria-hidden="true"><IconCrown /></span> {t('family.crownLegend')}
        </p>
      )}

      {user.role === 'admin' && (
        <form className="card stack" onSubmit={saveGoal} data-testid="family-goal-form">
          <label htmlFor="family-goal-input"><strong>{t('family.adminGoal')}</strong></label>
          <input id="family-goal-input" className="input" type="number" inputMode="numeric" min={50} max={10000} step={10}
            value={goal} onChange={(e) => setGoal(e.target.value)} data-testid="family-goal-input" />
          <p className="muted small">{t('family.adminGoalHelp')}</p>
          {message && <p className={message.ok ? 'form-ok' : 'form-error'} role="status" data-testid="family-goal-message">{message.text}</p>}
          <Button type="submit" data-testid="family-goal-save">{t('family.save')}</Button>
        </form>
      )}
    </main>
  );
}
