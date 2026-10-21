import { Link } from 'react-router-dom';
import { getLang, t } from '../i18n/index.js';
import { IconChevron, IconCrown, IconFamily, IconFlame } from '../icons/index.jsx';
import Avatar from './Avatar.jsx';

// The family board's parts: the family goal bar, a member with a crown for last week's top learner, and the Home card.
// This week only (Monday–Sunday, Amsterdam); the server sorts the members and computes ranks and crowns.

export const dayName = (day) => new Intl.DateTimeFormat(getLang(), { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${day}T12:00:00Z`));
const dayMonth = (day) => new Intl.DateTimeFormat(getLang(), { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${day}T12:00:00Z`));
export const weekRange = (week) => t('family.week', { from: dayMonth(week.start), to: dayMonth(week.end) });

/** The family's combined XP this week against the admin's target. */
export function FamilyGoalBar({ goal, large = false }) {
  const pct = Math.min(100, Math.round((100 * goal.xp) / Math.max(1, goal.target)));
  return (
    <div className={`family-goal${large ? ' family-goal--large' : ''}`} data-testid="family-goal" data-xp={goal.xp} data-target={goal.target}
      data-reached={String(goal.reached)}>
      <div className="family-goal-bar" role="progressbar" aria-valuemin={0} aria-valuemax={goal.target} aria-valuenow={Math.min(goal.xp, goal.target)}
        aria-label={t('family.goalText', { xp: goal.xp, goal: goal.target })}>
        <span className="family-goal-fill" style={{ width: `${pct}%` }} />
      </div>
      <p className="family-goal-text">{t('family.goalText', { xp: goal.xp, goal: goal.target })}</p>
    </div>
  );
}

/** An avatar with last week's crown. */
export function MemberAvatar({ member, className = 'avatar' }) {
  return (
    <span className="family-avatar">
      <Avatar avatar={member.avatar} bg={member.avatarBg} className={className} />
      {member.crown && (
        <span className="family-crown" data-testid="family-crown" title={t('family.crown')}>
          <IconCrown />
          <span className="visually-hidden">{t('family.crown')}</span>
        </span>
      )}
    </span>
  );
}

/** One row of the full board: place, avatar, name, the week's 7 days, streak, XP. */
export function MemberRow({ member, week }) {
  return (
    <li className="family-row" data-testid="family-row" data-me={String(member.me)} data-rank={member.rank} data-crown={String(member.crown)}
      data-xp={member.xp} data-name={member.displayName}>
      <span className="family-rank" aria-label={t('family.rank', { n: member.rank })}>{member.rank}</span>
      <MemberAvatar member={member} className="avatar avatar--board" />
      <span className="family-who">
        <strong className="family-name">{member.displayName}{member.me && <span className="family-you"> · {t('family.you')}</span>}</strong>
        <ol className="family-days" aria-label={t('family.days', { n: member.daysPractised })}>
          {week.days.map((d, i) => (
            <li key={d} className="family-day" data-done={String(member.days[i])} data-today={String(d === week.today)}
              aria-label={member.days[i] ? t('family.dayDone', { day: dayName(d) }) : t('family.dayNot', { day: dayName(d) })} />
          ))}
        </ol>
      </span>
      <span className="family-stats">
        <span className="family-xp" data-testid="family-xp">{t('family.xp', { n: member.xp })}</span>
        <span className="family-streak" aria-label={t('home.streakLabel', { n: member.streak })}><IconFlame /> {member.streak}</span>
      </span>
    </li>
  );
}

/** Members the Home card lists: everyone up to five; a bigger family shows the top five and "+N more". */
export const CARD_MEMBERS = 5;

/** Home: the family goal and the members of the week (up to five); opens the full board. */
export function FamilyCard({ board }) {
  if (!board?.members?.length) return null;
  const shown = board.members.length <= CARD_MEMBERS ? board.members : board.members.slice(0, CARD_MEMBERS);
  const more = board.members.length - shown.length;
  return (
    <Link to="/family" className="card family-card" data-testid="family-card"
      aria-label={t('family.cardLabel', { xp: board.goal.xp, goal: board.goal.target })}>
      <span className="family-card-head">
        <IconFamily className="family-card-icon" />
        <strong>{t('family.title')}</strong>
        <span className="muted small">{t('family.thisWeek')}</span>
        <IconChevron className="family-card-chevron" />
      </span>
      <FamilyGoalBar goal={board.goal} />
      <ol className="family-mini">
        {shown.map((m) => (
          <li key={m.id} className="family-mini-item" data-testid="family-mini" data-me={String(m.me)}>
            <MemberAvatar member={m} className="avatar avatar--mini" />
            <span className="family-mini-name">{m.displayName}</span>
            <span className="family-mini-xp">{t('family.xp', { n: m.xp })}</span>
          </li>
        ))}
      </ol>
      {more > 0 && <span className="family-mini-more muted small" data-testid="family-mini-more">{t('family.moreMembers', { n: more })}</span>}
    </Link>
  );
}
