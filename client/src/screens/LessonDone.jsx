import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { t } from '../i18n/index.js';
import { IconCheck, IconFlame, IconStar } from '../icons/index.jsx';
import Button from '../components/Button.jsx';
import BadgeIcon from '../components/BadgeIcon.jsx';
import Confetti from '../components/Confetti.jsx';
import Mascot from '../components/Mascot.jsx';
import { useCountUp } from '../components/CountUp.jsx';
import { unlock } from '../audio/player.js';
import { playSfx } from '../audio/sfx.js';
import { badgeCondition, badgeTitle } from '../lib/badges.js';
import { mascotLine } from '../lib/lines.js';

/** New badges of this completion, inline (never in the way of the buttons). */
function NewBadges({ badges }) {
  if (!badges?.length) return null;
  return (
    <section className="card badge-card" data-testid="badge-card" aria-live="polite">
      <h2>{badges.length === 1 ? t('badges.newTitle') : t('badges.newTitleMany', { n: badges.length })}</h2>
      <ul className="badge-card-list">
        {badges.map((b) => (
          <li key={b.id} className="badge-card-item" data-testid="new-badge" data-badge-id={b.id}>
            <BadgeIcon badge={b} className="badge-icon--card" />
            <span className="badge-card-text">
              <strong>{badgeTitle(b)}</strong>
              <span className="muted small">{badgeCondition(b)}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// End of a lesson (/lesson/:id/done) or a practice session (/practice/done): the mascot celebrates, XP counts up,
// confetti falls (not with reduced motion), a fanfare plays (sound effects on), new badges and a reached daily goal show.
export default function LessonDone() {
  const { lessonId } = useParams();
  const { state } = useLocation();
  const navigate = useNavigate();
  const practice = state?.kind === 'practice';
  const valid = state && (practice ? !lessonId : state.lessonId === lessonId);
  const [line] = useState(() => mascotLine(state?.dailyGoal?.reachedNow ? 'goal' : 'celebrate'));
  const xp = useCountUp(valid ? state.xpEarned : 0);

  useEffect(() => {
    if (valid) playSfx('done');
  }, [valid]);

  if (!valid) return <Navigate to="/" replace />;

  const { score, xpEarned, stats, mascot, badges, dailyGoal } = state;
  const again = () => {
    unlock();
    navigate(practice ? `/practice/${state.mode === 'mistakes' ? 'mistakes' : 'due'}` : `/lesson/${lessonId}`, { replace: true });
  };
  return (
    <main className="page done-page" data-testid={practice ? 'practice-done' : 'lesson-done'}>
      <Confetti />
      <div className="done-hero">
        <Mascot kind={mascot} pose="celebrating" className="mascot mascot--done" testId="done-mascot" />
        <h1>{practice ? t('practice.doneTitle') : t('done.title')}</h1>
        <p className="done-line" data-testid="done-line">{line}</p>
      </div>
      {dailyGoal?.reachedNow && (
        <p className="goal-banner" data-testid="goal-reached">{t('done.goalReached')}</p>
      )}
      <div className="done-stats">
        <div className="done-stat done-stat--score">
          <IconCheck />
          <span className="value" data-testid="done-score">{t('done.scoreValue', { n: score })}</span>
          <span className="label">{t('done.score')}</span>
        </div>
        <div className="done-stat done-stat--xp">
          <IconStar />
          <span className="value" data-testid="done-xp" data-value={xpEarned}>{t('done.xpEarned', { n: xp })}</span>
          <span className="label">{t('home.xp')}</span>
        </div>
        <div className="done-stat done-stat--streak">
          <IconFlame />
          <span className="value" data-testid="done-streak">{stats.streak}</span>
          <span className="label">{stats.streak === 1 ? t('done.streakOne') : t('done.streak', { n: stats.streak })}</span>
        </div>
      </div>
      <NewBadges badges={badges} />
      {score < 60 && <p className="done-encourage" data-testid="done-encourage">{t('done.lowScore')}</p>}
      <div className="stack">
        {/* Continue is the way on: Home opens at the current lesson, which after this one is the next. */}
        <Link to="/" className="btn btn--big btn--block" data-testid="done-continue">
          {t('done.continue')}
        </Link>
        <Button variant="secondary" size="big" block data-testid="again-button" onClick={again}>
          {practice ? t('practice.again') : t('done.again')}
        </Button>
      </div>
    </main>
  );
}
