import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { getAvailablePaths, getTracks } from '../api/content.js';
import { getMyProgress } from '../api/progress.js';
import { updateMe } from '../api/auth.js';
import { getMessages, markMessageShown } from '../api/ops.js';
import { addCourse, getCourses, hideCourse, switchCourse } from '../api/courses.js';
import { getFamily } from '../api/family.js';
import { t } from '../i18n/index.js';
import { IconArrowDown, IconGear, IconPractice } from '../icons/index.jsx';
import { unlock } from '../audio/player.js';
import Mascot from '../components/Mascot.jsx';
import GoalRing from '../components/GoalRing.jsx';
import GoalPicker from '../components/GoalPicker.jsx';
import PracticeSheet from '../components/PracticeSheet.jsx';
import ChildMessage from '../components/ChildMessage.jsx';
import { mascotLine, streakAtRisk } from '../lib/lines.js';
import Avatar from '../components/Avatar.jsx';
import XpBadge from '../components/XpBadge.jsx';
import StreakFlame from '../components/StreakFlame.jsx';
import LevelBar from '../components/LevelBar.jsx';
import LevelSheet from '../components/LevelSheet.jsx';
import CourseSheet from '../components/CourseSheet.jsx';
import Flag from '../components/Flag.jsx';
import { FamilyCard } from '../components/FamilyBoard.jsx';
import { Loading, LoadError } from '../components/Loading.jsx';
import { currentPosition, isBeforeStart, lessonStates, packExtras, packProgress } from '../lib/path.js';
import Track from './Track.jsx';

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const CURRENT = '[data-testid="lesson-node"][data-state="current"]';
const UNITS = '[data-testid="unit-node"]';

// Home: the learner's path through every available level of the active course; the flag chip (top left) switches or
// adds courses. At the top the mascot in the daily-goal ring;
// the sticky level bar names the level and unit in view and opens the level sheet (also at /levels, so deep links keep
// working); beside it the Oefenen button opens the practice sheet; a floating button returns to the current lesson when
// it is out of view.
/** The Oefenen button beside the level bar, with the number of words due (99+ at most). */
function PracticeButton({ summary, onOpen }) {
  const due = summary?.due ?? 0;
  return (
    <button
      type="button"
      className="practice-btn"
      data-testid="practice-button"
      data-due={due}
      data-unlocked={String(Boolean(summary?.unlocked))}
      aria-label={due ? t('home.practiceLabel', { n: due }) : t('home.practiceCaughtUp')}
      onClick={onOpen}
    >
      <IconPractice />
      <span className="practice-btn-label">{t('home.practice')}</span>
      {due > 0 && <span className="practice-btn-count" data-testid="practice-due">{due > 99 ? '99+' : due}</span>}
    </button>
  );
}

/** The track mascot in the daily-goal ring with a speech line: idle, or sleeping when the streak is at risk. */
function Buddy({ mascot, today, stats }) {
  const sleeping = streakAtRisk(stats);
  const pose = sleeping ? 'sleeping' : today.reached ? 'happy' : 'idle';
  const [pick] = useState(Math.random);
  return (
    <section className="buddy" data-testid="buddy">
      <GoalRing xp={today.xp} goal={today.goal}>
        <Mascot kind={mascot} pose={pose} className="mascot mascot--home" testId="home-mascot" />
      </GoalRing>
      <div className="buddy-talk">
        <p className="speech" data-testid="home-mascot-line">{mascotLine(sleeping ? 'sleeping' : today.reached ? 'goal' : 'idle', pick)}</p>
        <p className="buddy-xp" data-testid="today-xp">{today.reached ? t('goal.reached') : t('home.todayXp', { xp: today.xp, goal: today.goal })}</p>
      </div>
    </section>
  );
}

export default function Home() {
  const { user, setStats, setUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  // the admin's own level sheet is /my-levels (his /levels lists every track, with previews)
  const levelsPath = user.role === 'admin' ? '/my-levels' : '/levels';
  const sheetOpen = location.pathname === levelsPath;
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);
  const [active, setActive] = useState(null); // { packId, unitId } of the section in view
  const [currentOff, setCurrentOff] = useState(null); // null | 'up' | 'down': where the current lesson is, if not in view
  const [practiceOpen, setPracticeOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [courses, setCourses] = useState(null); // the course sheet's data while it is open
  const [family, setFamily] = useState(null); // the family board (this week); no card when it fails or is empty
  const barRef = useRef(null);
  const pendingScroll = useRef(null);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const [{ tracks, active }, progress] = await Promise.all([getTracks({ mine: true }), getMyProgress()]);
      // Only the active course: its packs make the path.
      const track = tracks.find((tr) => tr.id === active) ?? tracks[0] ?? null;
      const packs = track ? await getAvailablePaths(track) : []; // the path only (units, lessons)
      setStats(progress.stats);
      setData({ track, packs, done: progress.lessons, stats: progress.stats, today: progress.today, practice: progress.practice });
    } catch {
      setFailed(true);
    }
    // setStats is recreated with the auth context; loading once per mount is intended.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    let alive = true;
    getFamily().then((b) => alive && setFamily(b)).catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // One-time messages from the grown-ups (a report was checked or fixed): shown once, so marked as shown on arrival.
  useEffect(() => {
    let alive = true;
    getMessages().then(({ messages: list }) => {
      if (!alive || !list.length) return;
      setMessages(list);
      list.forEach((m) => markMessageShown(m.id).catch(() => {}));
    }).catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const startPack = data?.track?.startPack ?? null;
  const position = useMemo(() => (data ? currentPosition(data.packs, lessonStates(data.packs, data.done, startPack)) : null), [data, startPack]);

  // The course sheet: switching, adding or hiding a course reloads the path (and the mascot) of the new active course.
  const openCourses = () => {
    setCourses(false);
    getCourses().then(setCourses).catch(() => setCourses(null));
  };
  const afterCourseChange = async (next) => {
    setUser({ ...user, activeTrack: next.active });
    setCourses(null);
    setData(null);
    setActive(null);
    await load();
    requestAnimationFrame(() => document.querySelector(CURRENT)?.scrollIntoView({ block: 'center', behavior: 'instant' }));
  };
  const onSwitch = async (track) => afterCourseChange(await switchCourse(track));
  const onAdd = async (track) => afterCourseChange(await addCourse(track));
  const onRemove = async (track) => {
    const next = await hideCourse(track);
    if (next.active !== data?.track?.id) await afterCourseChange(next);
    else setCourses(next);
  };

  const scrollToElement = useCallback((el, where) => {
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const barBottom = barRef.current?.getBoundingClientRect().bottom ?? 0;
    const top = where === 'center'
      ? window.scrollY + rect.top - (window.innerHeight - rect.height) / 2
      : window.scrollY + rect.top - Math.max(barBottom, 0) - 24;
    window.scrollTo({ top: Math.max(0, top), behavior: reducedMotion() ? 'auto' : 'smooth' });
  }, []);

  const scrollToCurrent = useCallback(() => scrollToElement(document.querySelector(CURRENT), 'center'), [scrollToElement]);

  // Track the section in view (the last unit heading above the middle of the screen) and the current lesson.
  useEffect(() => {
    if (!data) return undefined;
    let frame = 0;
    const update = () => {
      frame = 0;
      const line = window.innerHeight / 2;
      const nodes = document.querySelectorAll(UNITS);
      let hit = nodes[0];
      for (const n of nodes) {
        if (n.getBoundingClientRect().top <= line) hit = n;
        else break;
      }
      if (hit) setActive((prev) => (prev?.unitId === hit.dataset.unitId ? prev : { packId: hit.dataset.packId, unitId: hit.dataset.unitId }));
      const cur = document.querySelector(CURRENT);
      let off = null;
      if (cur) {
        const r = cur.getBoundingClientRect();
        const barBottom = barRef.current?.getBoundingClientRect().bottom ?? 0;
        if (r.bottom < barBottom) off = 'up';
        else if (r.top > window.innerHeight) off = 'down';
      }
      setCurrentOff(off);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [data]);

  const openSheet = () => navigate(levelsPath, { state: { fromHome: true } });
  const closeSheet = useCallback((then = { kind: 'current' }) => {
    pendingScroll.current = then;
    if (location.state?.fromHome) navigate(-1);
    else navigate('/', { replace: true });
  }, [location.state, navigate]);

  // After the sheet closes: scroll to the current lesson (✕) or to the chosen level ("Go here").
  useEffect(() => {
    if (sheetOpen || !data || !pendingScroll.current) return;
    const target = pendingScroll.current;
    pendingScroll.current = null;
    requestAnimationFrame(() => {
      if (target.kind === 'pack' && target.packId !== position?.packId) {
        scrollToElement(document.querySelector(`${UNITS}[data-pack-id="${target.packId}"]`), 'top');
      } else scrollToCurrent();
    });
  }, [sheetOpen, data, position, scrollToCurrent, scrollToElement]);

  // First login after daily goals arrived: choose one (saved at once; Settings changes it later).
  const chooseGoal = async (dailyGoal) => {
    setUser({ ...user, dailyGoal });
    try {
      const { user: saved } = await updateMe({ dailyGoal });
      setUser(saved);
      setData((d) => (d ? { ...d, today: { ...d.today, goal: dailyGoal, chosen: true, reached: d.today.xp >= dailyGoal } } : d));
    } catch {
      setUser(user);
    }
  };
  const startPractice = (mode) => {
    unlock(); // inside the tap: lets the session play audio on iOS
    navigate(`/practice/${mode}`);
  };

  if (failed) return <LoadError onRetry={load} />;
  if (!data) return <Loading />;

  const activePack = data.packs.find((p) => p.id === active?.packId) ?? data.packs.find((p) => p.id === position?.packId) ?? data.packs[0];
  const activeUnit = activePack?.units.find((u) => u.id === active?.unitId) ?? activePack?.units[0];
  const rows = (data.track?.packs ?? []).map((row) => {
    const loaded = data.packs.find((p) => p.id === row.id);
    return {
      pack: row,
      progress: loaded ? packProgress(loaded, data.done) : null,
      extras: loaded ? packExtras(loaded, data.done) : null,
      optional: Boolean(loaded) && isBeforeStart(data.packs, row.id, startPack),
      after: row.branch ? (data.track?.packs ?? []).find((x) => x.id === row.after) ?? null : null,
      current: row.id === position?.packId,
    };
  });

  return (
    <main className="page" data-testid="home" data-track={data.track?.id}>
      <header className="home-header">
        <button type="button" className="course-chip" data-testid="course-chip" data-track={data.track?.id ?? 'none'}
          aria-label={data.track ? t('courses.chip', { language: t(`languages.${data.track.id}`) }) : t('courses.title')} onClick={openCourses}>
          {data.track ? <Flag track={data.track.id} target={data.track.target} /> : <span className="course-chip-plus" aria-hidden="true">+</span>}
        </button>
        <h1>{t('home.greeting', { name: user.displayName })}</h1>
        <Link to="/profile" className="home-avatar" aria-label={t('home.profile')} data-testid="home-avatar-link">
          <Avatar avatar={user.avatar} bg={user.avatarBg} />
        </Link>
        <Link to="/settings" className="icon-btn" aria-label={t('home.settings')} data-testid="settings-link">
          <IconGear />
        </Link>
      </header>

      <div className="stats-row">
        <XpBadge xp={data.stats.xp} />
        <StreakFlame streak={data.stats.streak} activeToday={data.stats.activeToday} />
        <span className="spacer" />
        {/* the admin's way back sits here, not in the header: there it squeezed the greeting on a phone */}
        {user.role === 'admin' && (
          <Link to="/admin" className="btn btn--small btn--secondary" data-testid="home-admin-link">{t('home.adminLink')}</Link>
        )}
        <span className="stat-pill" data-testid="track-name">{data.track ? t(`languages.${data.track.id}`) : ''}</span>
      </div>

      {data.today && <Buddy mascot={data.track?.mascot} today={data.today} stats={data.stats} />}

      {/* never on top of another sheet: it waits until the level, course or practice sheet is closed */}
      {messages[0] && !sheetOpen && !courses && !practiceOpen && <ChildMessage message={messages[0]} mascot={data.track?.mascot} onDone={() => setMessages((m) => m.slice(1))} />}

      <FamilyCard board={family} />

      {user.dailyGoal == null && (
        <section className="card stack goal-card" data-testid="goal-card">
          <h2>{t('goal.title')}</h2>
          <p className="muted">{t('goal.text')}</p>
          <GoalPicker value={null} onChange={chooseGoal} />
        </section>
      )}

      {activePack && (
        <div className="level-bar-wrap" ref={barRef}>
          <div className="level-bar-row">
            <LevelBar pack={activePack} unit={activeUnit} percent={packProgress(activePack, data.done).percent} onOpen={openSheet} />
            <PracticeButton summary={data.practice} onOpen={() => setPracticeOpen(true)} />
          </div>
        </div>
      )}

      {data.track ? (
        <Track packs={data.packs} done={data.done} startPack={startPack} />
      ) : (
        <section className="card stack" data-testid="no-course">
          <h2>{t('courses.noneTitle')}</h2>
          <p className="muted">{user.canSelfEnroll ? t('courses.noneText') : t('courses.askAdmin')}</p>
          {user.canSelfEnroll && <button type="button" className="btn btn--primary self-start" data-testid="no-course-add" onClick={openCourses}>{t('courses.add')}</button>}
        </section>
      )}

      {courses && (
        <CourseSheet data={courses} onSwitch={onSwitch} onAdd={onAdd} onRemove={onRemove} onClose={() => setCourses(null)} />
      )}

      {currentOff && !sheetOpen && !practiceOpen && (
        <button type="button" className="current-fab" data-testid="current-lesson-button" data-direction={currentOff} onClick={scrollToCurrent}>
          <IconArrowDown className={currentOff === 'up' ? 'flip' : undefined} />
          {t('home.currentLesson')}
        </button>
      )}

      {practiceOpen && data.practice && (
        <PracticeSheet summary={data.practice} onStart={startPractice} onClose={() => setPracticeOpen(false)} />
      )}

      {sheetOpen && (
        <LevelSheet
          trackId={data.track?.id}
          rows={rows}
          onClose={() => closeSheet({ kind: 'current' })}
          onGo={(packId) => closeSheet({ kind: 'pack', packId })}
        />
      )}
    </main>
  );
}
