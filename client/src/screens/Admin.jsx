import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { listUsers } from '../api/admin.js';
import { getAdminSummary } from '../api/ops.js';
import { t } from '../i18n/index.js';
import { IconCheck, IconChevron, IconFamily, IconGear, IconHeadphones, IconInbox, IconLevels, IconPencil, IconPlus, IconPulse, IconSpeaker } from '../icons/index.jsx';
import Avatar from '../components/Avatar.jsx';
import Flag from '../components/Flag.jsx';
import Button from '../components/Button.jsx';
import { Loading, LoadError } from '../components/Loading.jsx';

/** The visible courses of an account, the active one first ("Engels + Frans"), or "—". */
export const coursesText = (u) => {
  const shown = (u.courses ?? []).filter((c) => !c.hidden).map((c) => c.track)
    .sort((a, b) => (a === u.activeTrack ? -1 : b === u.activeTrack ? 1 : 0));
  return shown.length ? shown.map((tr) => t(`languages.${tr}`)).join(' + ') : t('admin.noTrack');
};

// Beheer → Gebruikers: every account with its numbers; tap one to edit it, or add a new one.
export default function Admin() {
  const { logout, user } = useAuth();
  const { state } = useLocation();
  const [users, setUsers] = useState(null);
  const [failed, setFailed] = useState(false);
  const [summary, setSummary] = useState(null);

  const load = useCallback(() => {
    setFailed(false);
    listUsers().then((r) => setUsers(r.users)).catch(() => setFailed(true));
    getAdminSummary().then(setSummary).catch(() => setSummary(null));
  }, []);
  useEffect(load, [load]);

  if (failed) return <LoadError onRetry={load} />;
  if (!users) return <Loading />;

  return (
    <main className="page page--wide" data-testid="admin">
      <header className="topbar">
        <h1>{t('admin.title')}</h1>
        <Link to="/admin/voices" className="icon-btn" aria-label={t('voices.title')} data-testid="voices-link"><IconSpeaker /></Link>
        <Link to="/levels" className="icon-btn" aria-label={t('home.levels')}><IconLevels /></Link>
        <Link to="/settings" className="icon-btn" aria-label={t('home.settings')} data-testid="settings-link"><IconGear /></Link>
        <Button variant="secondary" size="small" onClick={logout} data-testid="logout-button">{t('admin.logout')}</Button>
      </header>

      {state?.deleted && <p className="form-ok" role="status" data-testid="admin-message">{t('admin.deleted', { name: state.deleted })}</p>}

      <nav className="tools" aria-label={t('ops.tools')}>
        <Link to="/admin/inbox" className="tool" data-testid="admin-inbox-link">
          <IconInbox />
          <span className="tool-label">{t('ops.inbox.title')}</span>
          {summary?.openReports > 0 && <span className="tool-count" data-testid="admin-inbox-count">{summary.openReports}</span>}
        </Link>
        <Link to="/admin/corrections" className="tool" data-testid="admin-corrections-link">
          <IconPencil />
          <span className="tool-label">{t('ops.corrections.title')}</span>
          {summary?.queuedCorrections > 0 && <span className="tool-count tool-count--wait">{summary.queuedCorrections}</span>}
        </Link>
        <Link to="/admin/system" className="tool" data-testid="admin-system-link" data-level={summary?.systemLevel ?? 'unknown'}>
          <IconPulse />
          <span className="tool-label">{t('ops.system.title')}</span>
          {summary && <span className={`dot dot--${summary.systemLevel}`} aria-label={t(`ops.system.level.${summary.systemLevel}`)} />}
        </Link>
        <Link to="/family" className="tool" data-testid="admin-family-link">
          <IconFamily />
          <span className="tool-label">{t('family.title')}</span>
        </Link>
        <Link to="/admin/rules" className="tool" data-testid="admin-rules-link">
          <IconCheck />
          <span className="tool-label">{t('rules.title')}</span>
        </Link>
        <Link to="/admin/listen" className="tool" data-testid="admin-listen-link">
          <IconHeadphones />
          <span className="tool-label">{t('listen.title')}</span>
        </Link>
      </nav>

      {/* The admin takes courses too: his own Home (path, practice, profile), or a first course. */}
      <Link to={user.activeTrack ? '/' : '/?start=1'} className="my-course" data-testid="admin-my-course" data-track={user.activeTrack ?? 'none'}>
        {user.activeTrack ? <Flag track={user.activeTrack} /> : <span className="course-chip-plus" aria-hidden="true">+</span>}
        <span className="my-course-label">
          {user.activeTrack ? t('admin.myCourse', { language: t(`languages.${user.activeTrack}`) }) : t('admin.learn')}
        </span>
        <IconChevron className="user-row-chevron" width="22" height="22" />
      </Link>

      <section className="card stack">
        <div className="section-head">
          <h2>{t('admin.users')}</h2>
          <Link to="/admin/users/new" className="btn btn--small" data-testid="admin-add-user">
            <IconPlus width="20" height="20" />
            {t('admin.addUser')}
          </Link>
        </div>
        <ul className="user-list" data-testid="admin-users">
          {users.map((u) => (
            <li key={u.id} data-username={u.username} data-xp={u.stats.xp} data-lessons={u.lessonsDone}>
              <Link to={`/admin/users/${u.id}`} className="user-row" data-testid={`admin-user-${u.username}`}>
                <Avatar avatar={u.avatar} bg={u.avatarBg} className="avatar avatar--list" />
                <span className="user-row-main">
                  <span className="user-row-name">{u.displayName}</span>
                  <span className="user-row-meta">
                    {[u.username, u.role === 'admin' ? t('admin.roleAdmin') : t('admin.roleChild'), coursesText(u),
                      ...(u.showOnLogin ? [] : [t('admin.hiddenFromLogin')])].join(' · ')}
                  </span>
                  <span className="user-row-stats" data-testid="admin-stats">
                    {t('admin.statsLine', { xp: u.stats.xp, streak: u.stats.streak, lessons: u.lessonsDone })}
                  </span>
                </span>
                <IconChevron className="user-row-chevron" width="22" height="22" />
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
