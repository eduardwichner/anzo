import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import { getProfile } from '../api/practice.js';
import { getLang, t } from '../i18n/index.js';
import { IconFlame, IconStar } from '../icons/index.jsx';
import Avatar from '../components/Avatar.jsx';
import Flag from '../components/Flag.jsx';
import BadgeIcon from '../components/BadgeIcon.jsx';
import TopBar from '../components/TopBar.jsx';
import { Loading, LoadError } from '../components/Loading.jsx';
import { badgeCondition, badgeTitle } from '../lib/badges.js';

const dayName = (day) => new Intl.DateTimeFormat(getLang(), { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${day}T12:00:00Z`));
const dateText = (iso) => new Intl.DateTimeFormat(getLang(), { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso));

// The child's profile (tap the avatar on Home): numbers, the daily goal of the last 7 days, and every badge — earned in
// colour with its date, locked in grey with what it takes.
export default function Profile() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);
  const load = useCallback(() => {
    setFailed(false);
    getProfile().then(setData).catch(() => setFailed(true));
  }, []);
  useEffect(load, [load]);

  if (failed) return <LoadError onRetry={load} />;
  if (!data) return <Loading />;
  const { stats, wordsLearned, goalWeek, badges, dailyGoal, courses = [] } = data;
  const days = (n) => (n === 1 ? t('profile.daysOne') : t('profile.days', { n }));
  // Earned badges first (oldest first), then the locked ones in their fixed order.
  const sorted = [...badges.filter((b) => b.earnedAt).sort((a, b) => (a.earnedAt < b.earnedAt ? -1 : 1)), ...badges.filter((b) => !b.earnedAt)];

  return (
    <main className="page" data-testid="profile">
      <TopBar title={t('profile.title')} />
      <section className="profile-head">
        <Avatar avatar={user.avatar} bg={user.avatarBg} className="avatar avatar--profile" />
        <h2>{user.displayName}</h2>
      </section>

      <section className="profile-stats">
        <div className="profile-stat" data-testid="profile-xp"><IconStar className="profile-stat-icon profile-stat-icon--xp" /><strong>{stats.xp}</strong><span>{t('profile.xp')}</span></div>
        <div className="profile-stat" data-testid="profile-streak"><IconFlame className="profile-stat-icon profile-stat-icon--streak" /><strong>{days(stats.streak)}</strong><span>{t('profile.streak')}</span></div>
        <div className="profile-stat" data-testid="profile-streak-best"><strong>{days(stats.streakBest)}</strong><span>{t('profile.streakBest')}</span></div>
        <div className="profile-stat" data-testid="profile-words"><strong>{wordsLearned}</strong><span>{t('profile.words')}</span></div>
      </section>

      {courses.length > 0 && (
        <section className="card stack" data-testid="profile-courses">
          <h2>{t('profile.courses')}</h2>
          <ul className="profile-courses">
            {courses.map((c) => (
              <li key={c.track} className="profile-course" data-testid="profile-course" data-track={c.track} data-xp={c.xp}>
                <Flag track={c.track} target={c.target} className="flag flag--big" />
                <span className="profile-course-main">
                  <strong>{t(`languages.${c.track}`)}</strong>
                  <span className="muted small">{t('profile.courseLine', { xp: c.xp, words: c.wordsLearned, lessons: c.lessonsDone })}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card stack">
        <h2>{t('profile.goalWeek')}</h2>
        <p className="muted small">{t('goal.xp', { n: dailyGoal.goal })}</p>
        <ol className="goal-week" data-testid="goal-week">
          {goalWeek.map((d) => (
            <li key={d.day} className="goal-day" data-reached={String(d.reached)} data-testid="goal-day"
              aria-label={d.reached ? t('profile.goalDayReached', { day: dayName(d.day), xp: d.xp }) : t('profile.goalDayMissed', { day: dayName(d.day), xp: d.xp })}>
              <span className="goal-dot" aria-hidden="true" />
              <span className="goal-day-name" aria-hidden="true">{dayName(d.day)}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="card stack">
        <h2>{t('profile.badges')}</h2>
        <ul className="badge-grid" data-testid="badge-grid">
          {sorted.map((b) => (
            <li key={b.id} className="badge-cell" data-testid="badge" data-badge-id={b.id} data-earned={String(Boolean(b.earnedAt))}>
              <BadgeIcon badge={b} locked={!b.earnedAt} className="badge-icon--grid" />
              <strong className="badge-title">{badgeTitle(b)}</strong>
              <span className="badge-sub">
                {b.earnedAt ? t('badges.earnedOn', { date: dateText(b.earnedAt) }) : badgeCondition(b)}
              </span>
              {b.id === 'unit-complete' && b.count > 0 && <span className="badge-sub" data-testid="units-count">{t('badges.unitsCount', { n: b.count })}</span>}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
