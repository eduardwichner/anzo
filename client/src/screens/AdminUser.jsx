import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import {
  createUser, deleteUser, getUser, getUserCourses, getUserProgress, listUsers, putUserCourse, resetUserProgress, updateUser,
} from '../api/admin.js';
import { getTracks } from '../api/content.js';
import { loc, t } from '../i18n/index.js';
import { DISPLAY_NAME_MAX, minPasswordLength, USERNAME_RE } from '../lib/userRules.js';
import AvatarPicker from '../components/AvatarPicker.jsx';
import Button from '../components/Button.jsx';
import Flag from '../components/Flag.jsx';
import LangToggle from '../components/LangToggle.jsx';
import TopBar from '../components/TopBar.jsx';
import { availablePacks, scopeBody, scopeLabel, scopeValues } from '../components/SelfReset.jsx';
import { Loading, LoadError } from '../components/Loading.jsx';

const NEW_USER = {
  username: '', displayName: '', role: 'child', nativeLang: 'nl', audience: 'child', uiLang: 'nl', avatar: 'fox', avatarBg: 'sky',
  password: '', mustChangePassword: false, showOnLogin: true, canSelfReset: false, canSelfEnroll: true, onBoard: true, course: 'en', startPack: '',
};

const fromUser = (u) => ({
  username: u.username, displayName: u.displayName, role: u.role, nativeLang: u.nativeLang, audience: u.audience, uiLang: u.uiLang,
  avatar: u.avatar, avatarBg: u.avatarBg, password: '', mustChangePassword: u.mustChangePassword,
  showOnLogin: u.showOnLogin, canSelfReset: u.canSelfReset, canSelfEnroll: u.canSelfEnroll, onBoard: !u.boardHidden,
});

/** Client-side check mirroring the server (server/src/lib/users.js). Returns { field: message }. */
function validate(form, isNew) {
  const errors = {};
  const min = minPasswordLength(form.role);
  if (isNew && !USERNAME_RE.test(form.username.trim().toLowerCase())) errors.username = t('admin.errors.username.invalid');
  if (!form.displayName.trim() || form.displayName.trim().length > DISPLAY_NAME_MAX) errors.displayName = t('admin.errors.displayName');
  if ((isNew || form.password) && form.password.length < min) errors.password = t('admin.errors.password', { min });
  return errors;
}

function serverErrors(body, role) {
  const out = {};
  for (const [field, code] of Object.entries(body?.fields ?? {})) {
    if (field === 'username') out.username = t(`admin.errors.username.${code === 'taken' ? 'taken' : 'invalid'}`);
    else if (field === 'password') out.password = t('admin.errors.password', { min: body.min ?? minPasswordLength(role) });
    else if (field === 'displayName') out.displayName = t('admin.errors.displayName');
    else if (field === 'course') out.form = t(code === 'invalid_start_pack' ? 'admin.errors.startPack' : 'admin.errors.course');
    else out.form = t('app.error');
  }
  return out;
}

/** The lessons of one course with done / best score / times played. */
function ProgressTable({ userId, track, reloadKey }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    setData(null);
    getUserProgress(userId, track).then(setData).catch(() => setData(false));
  }, [userId, track, reloadKey]);
  if (data === null) return <p className="muted">{t('app.loading')}</p>;
  if (data === false) return <p className="form-error">{t('app.error')}</p>;
  const lessons = data.packs.flatMap((p) => p.units.flatMap((u) => u.lessons.map((l) => ({ ...l, unit: loc(u.title), cefr: p.cefr }))));
  if (!lessons.length) return <p className="muted">{t('admin.noLessons')}</p>;
  return (
    <div className="table-wrap">
      <table className="table" data-testid="admin-progress" data-track={data.track}>
        <thead>
          <tr>
            <th>{t('admin.lesson')}</th>
            <th>{t('admin.status')}</th>
            <th>{t('admin.score')}</th>
            <th>{t('admin.times')}</th>
          </tr>
        </thead>
        <tbody>
          {lessons.map((l) => (
            <tr key={l.id} data-lesson-id={l.id} data-done={String(l.done)} data-extra={String(Boolean(l.extra))}>
              <td>{`${l.cefr} · ${l.unit} · ${loc(l.title)}`}</td>
              <td>{l.done ? t('admin.statusDone') : l.extra ? t('admin.statusOptional') : t('admin.statusOpen')}</td>
              <td>{l.bestScore ?? '—'}</td>
              <td>{l.timesCompleted}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Check({ name, checked, onChange, label }) {
  return (
    <label className="check">
      <input type="checkbox" name={name} checked={checked} data-testid={`user-${name}`} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function FieldError({ text, id }) {
  return text ? <p className="field-error" id={id} role="alert">{text}</p> : null;
}

/** Scope choice + confirmation for resetting one course of a user (the whole course or one level). */
function AdminReset({ user, track, onDone }) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [scope, setScope] = useState(`track:${track.id}`);
  const [message, setMessage] = useState(null);
  const tracks = [track];
  const label = scopeLabel(scope, tracks);
  useEffect(() => setScope(`track:${track.id}`), [track.id]);

  const reset = async () => {
    try {
      await resetUserProgress(user.id, scopeBody(scope));
      setConfirming(false);
      setOpen(false);
      setMessage({ ok: true, text: t('admin.resetDone', { name: user.displayName, scope: label }) });
      onDone();
    } catch {
      setMessage({ ok: false, text: t('app.error') });
    }
  };

  return (
    <div className="stack">
      {!open && (
        <Button variant="secondary" size="small" className="self-start" onClick={() => { setOpen(true); setMessage(null); }} data-testid="admin-reset">
          {t('admin.resetProgress')}
        </Button>
      )}
      {open && (
        <fieldset className="choice-list" data-testid="admin-reset-scope">
          <legend>{t('admin.resetScope')}</legend>
          {scopeValues(tracks).map((value) => (
            <label key={value} className="choice">
              <input type="radio" name="admin-reset-scope" value={value} checked={scope === value}
                data-testid={`admin-reset-scope-${value.startsWith('track:') ? 'track' : value}`}
                onChange={() => { setScope(value); setConfirming(false); }} />
              <span>{scopeLabel(value, tracks)}</span>
            </label>
          ))}
          {!confirming ? (
            <div className="row row--end">
              <Button variant="secondary" size="small" onClick={() => setOpen(false)}>{t('app.cancel')}</Button>
              <Button variant="danger" size="small" onClick={() => setConfirming(true)} data-testid="admin-reset-next">{t('admin.resetProgress')}</Button>
            </div>
          ) : (
            <div className="confirm-box" role="alertdialog" aria-label={t('admin.resetProgress')}>
              <p>{t('admin.confirmReset', { name: user.displayName, scope: label })}</p>
              <div className="row row--end">
                <Button variant="secondary" size="small" onClick={() => setConfirming(false)}>{t('admin.confirmNo')}</Button>
                <Button variant="danger" size="small" onClick={reset} data-testid="admin-reset-confirm">{t('admin.confirmYes')}</Button>
              </div>
            </div>
          )}
        </fieldset>
      )}
      {message && <p className={message.ok ? 'form-ok' : 'form-error'} role="alert" data-testid="admin-reset-message">{message.text}</p>}
    </div>
  );
}

/** Start-level choice of one course: '' = the first level. */
function StartLevel({ id, track, value, onChange, testId, help = true }) {
  const packs = availablePacks(track).filter((p) => !p.branch); // a branch is never a start level
  if (packs.length < 2) return null;
  return (
    <div className="field">
      <label htmlFor={id}>{t('admin.courses.startLevel')}</label>
      <select id={id} className="input" value={value ?? ''} data-testid={testId} onChange={(e) => onChange(e.target.value)}>
        {packs.map((p, i) => <option key={p.id} value={i === 0 ? '' : p.id}>{`${p.cefr} · ${loc(p.title)}`}</option>)}
      </select>
      {help && <p className="field-help">{t('admin.form.startPackHelp')}</p>}
    </div>
  );
}

/**
 * Admin → Users → <learner> → Courses: every enrolment (hidden ones too) with its start level, active marker, hide /
 * restore, and adding a course offered for the learner's native language.
 */
function UserCourses({ user, tracks, onChanged }) {
  const [data, setData] = useState(null);
  const [adding, setAdding] = useState('');
  const [error, setError] = useState(null);
  const load = useCallback(() => getUserCourses(user.id).then((d) => {
    setData(d);
    onChanged(d);
  }).catch(() => setData(false)), [user.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    load();
  }, [load, user.nativeLang]);
  const trackOf = (id) => tracks.find((tr) => tr.id === id);
  const put = async (track, body) => {
    setError(null);
    try {
      const d = await putUserCourse(user.id, track, body);
      setData(d);
      onChanged(d);
    } catch (err) {
      setError(err.body?.error === 'course_not_offered' ? t('admin.errors.course') : t('app.error'));
    }
  };
  if (data === null) return <p className="muted">{t('app.loading')}</p>;
  if (data === false) return <p className="form-error">{t('app.error')}</p>;
  return (
    <section className="card stack" data-testid="admin-user-courses">
      <h2>{t('admin.courses.title')}</h2>
      {data.courses.length > 0 && <p className="field-help">{t('admin.form.startPackHelp')}</p>}
      {!data.courses.length && <p className="muted">{t('admin.courses.none')}</p>}
      <ul className="admin-courses">
        {data.courses.map((c) => {
          const tr = trackOf(c.track);
          const active = c.track === data.active;
          return (
            <li key={c.track} className="admin-course" data-testid="admin-course" data-track={c.track} data-hidden={String(c.hidden)} data-active={String(active)}>
              <div className="admin-course-head">
                <Flag track={c.track} target={c.target} />
                <strong>{t(`languages.${c.track}`)}</strong>
                {active && <span className="badge badge--available">{t('admin.courses.active')}</span>}
                {c.hidden && <span className="badge badge--roadmap">{t('admin.courses.hidden')}</span>}
              </div>
              <span className="muted small">{t('admin.courses.line', { n: c.progress.percent, xp: c.xp })}</span>
              {!c.offered && <span className="field-error">{t('admin.courses.notOffered')}</span>}
              {tr && <StartLevel id={`start-${c.track}`} track={tr} value={c.startPack} testId={`course-start-${c.track}`} help={false}
                onChange={(v) => put(c.track, { startPack: v || null })} />}
              <div className="row">
                {!c.hidden && !active && (
                  <Button size="small" variant="secondary" data-testid={`course-activate-${c.track}`} onClick={() => put(c.track, { active: true })}>
                    {t('admin.courses.makeActive')}
                  </Button>
                )}
                {c.hidden ? (
                  <Button size="small" variant="secondary" data-testid={`course-restore-${c.track}`} onClick={() => put(c.track, { hidden: false })}>
                    {t('admin.courses.restore')}
                  </Button>
                ) : (
                  <Button size="small" variant="secondary" data-testid={`course-hide-${c.track}`} onClick={() => put(c.track, { hidden: true })}>
                    {t('admin.courses.hide')}
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {data.offered.length > 0 && (
        <div className="row admin-course-add">
          <label className="sr-only" htmlFor="course-add">{t('admin.courses.add')}</label>
          <select id="course-add" className="input" value={adding} data-testid="course-add-select" onChange={(e) => setAdding(e.target.value)}>
            <option value="">{t('admin.courses.add')}</option>
            {data.offered.map((c) => <option key={c.track} value={c.track}>{t(`languages.${c.track}`)}</option>)}
          </select>
          <Button size="small" disabled={!adding} data-testid="course-add-button" onClick={() => { put(adding, {}); setAdding(''); }}>
            {t('admin.courses.addButton')}
          </Button>
        </div>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
    </section>
  );
}

/** Delete with a confirmation in which the admin types the username. */
function DeleteUser({ user, onDeleted }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [error, setError] = useState(null);

  const remove = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      await deleteUser(user.id, typed);
      onDeleted();
    } catch (err) {
      const code = err.body?.error;
      setError(['last_admin', 'cannot_delete_self', 'confirm_mismatch'].includes(code) ? t(`admin.errors.${code}`) : t('app.error'));
    }
  };

  if (!open) {
    return (
      <Button variant="danger" size="small" className="self-start" onClick={() => setOpen(true)} data-testid="admin-delete">
        {t('admin.deleteUser')}
      </Button>
    );
  }
  return (
    <form className="confirm-box" role="alertdialog" aria-labelledby="delete-title" onSubmit={remove} data-testid="admin-delete-dialog">
      <h3 id="delete-title">{t('admin.deleteTitle', { name: user.displayName })}</h3>
      <p>{t('admin.deleteText', { name: user.displayName })}</p>
      <div className="field">
        <label htmlFor="delete-username">{t('admin.deleteTypeName', { username: user.username })}</label>
        <input id="delete-username" className="input" autoComplete="off" autoCapitalize="off" spellCheck={false} value={typed}
          data-testid="admin-delete-input" onChange={(e) => setTyped(e.target.value)} />
      </div>
      {error && <p className="form-error" role="alert" data-testid="admin-delete-error">{error}</p>}
      <div className="row row--end">
        <Button variant="secondary" size="small" onClick={() => { setOpen(false); setTyped(''); }}>{t('app.cancel')}</Button>
        <Button type="submit" variant="danger" size="small" disabled={typed !== user.username} data-testid="admin-delete-confirm">
          {t('admin.deleteConfirm')}
        </Button>
      </div>
    </form>
  );
}

// Beheer → Gebruikers → add (/admin/users/new) or edit (/admin/users/:id) one account. A learner's courses (start level,
// hidden, active) are set per course in the Courses section; a new learner gets a first course with the form.
export default function AdminUser() {
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();
  const location = useLocation();
  const { user: me, setUser: setMe } = useAuth();
  const [user, setUser] = useState(null); // stored user (edit)
  const [form, setForm] = useState(isNew ? NEW_USER : null);
  const [tracks, setTracks] = useState([]);
  const [nativeLangs, setNativeLangs] = useState(['nl']);
  const [audiences, setAudiences] = useState(['child', 'adult']);
  const [courseData, setCourseData] = useState(null);
  const [progressTrack, setProgressTrack] = useState(null);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState(location.state?.created ? { ok: true, text: t('admin.userCreated', { name: location.state.created }) } : null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [progressKey, setProgressKey] = useState(0);
  const [showProgress, setShowProgress] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const [{ tracks: all }, list, found] = await Promise.all([getTracks(), listUsers(), isNew ? null : getUser(id)]);
      setTracks(all);
      setNativeLangs(list.nativeLangs ?? ['nl']);
      setAudiences(list.audiences ?? ['child', 'adult']);
      if (found) {
        setUser(found.user);
        setForm(fromUser(found.user));
      }
    } catch {
      setFailed(true);
    }
  }, [id, isNew]);
  useEffect(() => {
    load();
  }, [load]);

  if (failed) return <LoadError onRetry={load} />;
  if (!form || (!isNew && !user)) return <Loading />;

  const set = (field) => (value) => setForm((f) => ({ ...f, [field]: value }));
  const offered = (lang) => tracks.filter((tr) => tr.native === lang && availablePacks(tr).length);
  const setRole = (role) => setForm((f) => (isNew
    ? { ...f, role, audience: role === 'admin' ? 'adult' : f.audience, mustChangePassword: role === 'admin', showOnLogin: role === 'child' }
    : { ...f, role }));
  const setNative = (nativeLang) => setForm((f) => ({ ...f, nativeLang, course: offered(nativeLang)[0]?.id ?? '', startPack: '' }));
  const min = minPasswordLength(form.role);
  const courseTrack = tracks.find((tr) => tr.id === form.course);

  const save = async () => {
    setBusy(true);
    setMessage(null);
    const body = {
      displayName: form.displayName.trim(), role: form.role, nativeLang: form.nativeLang, audience: form.audience, uiLang: form.uiLang,
      avatar: form.avatar, avatarBg: form.avatarBg, mustChangePassword: form.mustChangePassword,
      showOnLogin: form.showOnLogin, canSelfReset: form.canSelfReset, canSelfEnroll: form.canSelfEnroll, boardHidden: !form.onBoard,
      ...(form.password ? { password: form.password } : {}),
    };
    try {
      if (isNew) {
        const course = form.course ? { track: form.course, startPack: form.startPack || null } : undefined;
        const { user: created } = await createUser({ ...body, username: form.username.trim().toLowerCase(), ...(course ? { course } : {}) });
        navigate(`/admin/users/${created.id}`, { replace: true, state: { created: created.displayName } });
        return;
      }
      const { user: saved } = await updateUser(user.id, body);
      setUser(saved);
      setForm(fromUser(saved));
      if (saved.id === me.id) setMe({ ...me, ...saved });
      setMessage({ ok: true, text: t('admin.userSaved') });
    } catch (err) {
      const code = err.body?.error;
      if (code === 'invalid_user') setErrors(serverErrors(err.body, form.role));
      else setMessage({ ok: false, text: ['last_admin', 'cannot_demote_self'].includes(code) ? t(`admin.errors.${code}`) : t('app.error') });
    } finally {
      setBusy(false);
    }
  };

  const submit = (e) => {
    e.preventDefault();
    const found = validate(form, isNew);
    setErrors(found);
    if (Object.keys(found).length) return;
    save();
  };

  const err = (field) => (errors[field] ? { 'aria-invalid': true, 'aria-describedby': `err-${field}` } : {});
  const enrolled = (courseData?.courses ?? []).map((c) => c.track);
  const shownTrack = tracks.find((tr) => tr.id === (enrolled.includes(progressTrack) ? progressTrack : courseData?.active ?? enrolled[0]));

  return (
    <main className="page" data-testid="admin-user">
      <TopBar title={isNew ? t('admin.newUserTitle') : t('admin.editUserTitle', { name: user.displayName })} backTo="/admin" />

      <form className="card stack" onSubmit={submit} noValidate data-testid="user-form">
        <div className="field">
          <label htmlFor="user-username">{t('admin.form.username')}</label>
          <input id="user-username" className="input" autoComplete="off" autoCapitalize="off" spellCheck={false} maxLength={24}
            value={form.username} readOnly={!isNew} data-testid="user-username" {...err('username')}
            onChange={(e) => set('username')(e.target.value.toLowerCase())} />
          {isNew && <p className="field-help">{t('admin.form.usernameHelp')}</p>}
          <FieldError text={errors.username} id="err-username" />
        </div>

        <div className="field">
          <label htmlFor="user-displayName">{t('admin.form.displayName')}</label>
          <input id="user-displayName" className="input" autoComplete="off" maxLength={DISPLAY_NAME_MAX} value={form.displayName}
            data-testid="user-displayName" {...err('displayName')} onChange={(e) => set('displayName')(e.target.value)} />
          <FieldError text={errors.displayName} id="err-displayName" />
        </div>

        <div className="field">
          <span className="field-label" id="user-role-label">{t('admin.form.role')}</span>
          <div className="segmented" role="group" aria-labelledby="user-role-label" data-testid="user-role">
            {['child', 'admin'].map((role) => (
              <button key={role} type="button" className="segmented-btn" aria-pressed={form.role === role} data-testid={`user-role-${role}`}
                onClick={() => setRole(role)}>
                {role === 'admin' ? t('admin.roleAdmin') : t('admin.roleChild')}
              </button>
            ))}
          </div>
        </div>

        <>
            <div className="field">
              <label htmlFor="user-nativeLang">{t('admin.form.nativeLang')}</label>
              <select id="user-nativeLang" className="input" value={form.nativeLang} data-testid="user-nativeLang" onChange={(e) => setNative(e.target.value)}>
                {nativeLangs.map((l) => <option key={l} value={l}>{t(`nativeLanguages.${l}`)}</option>)}
              </select>
              <p className="field-help">{t('admin.form.nativeLangHelp')}</p>
            </div>
            {form.role === 'child' && <div className="field">
              <span className="field-label" id="user-audience-label">{t('admin.form.audience')}</span>
              <div className="segmented" role="group" aria-labelledby="user-audience-label" data-testid="user-audience">
                {audiences.map((a) => (
                  <button key={a} type="button" className="segmented-btn" aria-pressed={form.audience === a} data-testid={`user-audience-${a}`}
                    onClick={() => set('audience')(a)}>
                    {t(`admin.audience.${a}`)}
                  </button>
                ))}
              </div>
              <p className="field-help">{t('admin.form.audienceHelp')}</p>
            </div>}
        </>

        {isNew && (
          <>
            <div className="field">
              <label htmlFor="user-course">{t('admin.form.firstCourse')}</label>
              <select id="user-course" className="input" value={form.course} data-testid="user-course"
                onChange={(e) => setForm((f) => ({ ...f, course: e.target.value, startPack: '' }))}>
                <option value="">{t('admin.form.firstCourseNone')}</option>
                {offered(form.nativeLang).map((tr) => <option key={tr.id} value={tr.id}>{t(`languages.${tr.id}`)}</option>)}
              </select>
            </div>
            {courseTrack && (
              <StartLevel id="user-startPack" track={courseTrack} value={form.startPack} testId="user-startPack" onChange={set('startPack')} />
            )}
          </>
        )}

        <div className="field">
          <span className="field-label" id="user-lang-label">{t('admin.form.uiLang')}</span>
          <LangToggle value={form.uiLang} onChange={set('uiLang')} label={t('admin.form.uiLang')} testId="user-uiLang" />
        </div>

        <div className="field">
          <span className="field-label" id="user-avatar-label">{t('admin.form.avatar')}</span>
          <AvatarPicker avatar={form.avatar} bg={form.avatarBg} idPrefix="user-avatar"
            onChange={({ avatar, avatarBg }) => setForm((f) => ({ ...f, avatar, avatarBg }))} />
        </div>

        <div className="field">
          <label htmlFor="user-password">{isNew ? t('admin.form.password') : t('admin.form.newPassword')}</label>
          <input id="user-password" className="input" type="password" autoComplete="new-password" value={form.password}
            data-testid="user-password" {...err('password')} onChange={(e) => set('password')(e.target.value)} />
          <p className="field-help">{t('admin.form.passwordHelp', { min })}</p>
          <FieldError text={errors.password} id="err-password" />
        </div>

        <div className="checks">
          <Check name="mustChangePassword" checked={form.mustChangePassword} onChange={set('mustChangePassword')} label={t('admin.form.mustChange')} />
          <Check name="showOnLogin" checked={form.showOnLogin} onChange={set('showOnLogin')} label={t('admin.form.showOnLogin')} />
          <Check name="canSelfReset" checked={form.canSelfReset} onChange={set('canSelfReset')} label={t('admin.form.canSelfReset')} />
          <Check name="onBoard" checked={form.onBoard} onChange={set('onBoard')} label={t('admin.form.onBoard')} />
          {form.role === 'child' && (
            <Check name="canSelfEnroll" checked={form.canSelfEnroll} onChange={set('canSelfEnroll')} label={t('admin.form.canSelfEnroll')} />
          )}
        </div>

        <FieldError text={errors.form} id="err-form" />
        <Button type="submit" size="big" block disabled={busy} data-testid="user-save">
          {isNew ? t('admin.form.create') : t('app.save')}
        </Button>
        {message && <p className={message.ok ? 'form-ok' : 'form-error'} role="alert" data-testid="user-message">{message.text}</p>}
      </form>

      {!isNew && ( /* children and admins alike take courses (the admin for himself) */
        <UserCourses user={user} tracks={tracks} onChanged={(d) => { setCourseData(d); setProgressKey((k) => k + 1); }} />
      )}

      {!isNew && shownTrack && (
        <section className="card stack" data-testid="admin-user-progress">
          <div className="section-head">
            <h2>{t('admin.progress')}</h2>
            <Button variant="secondary" size="small" onClick={() => setShowProgress((s) => !s)} data-testid="admin-progress-toggle">
              {showProgress ? t('admin.hideProgress') : t('admin.viewProgress')}
            </Button>
          </div>
          {enrolled.length > 1 && (
            <div className="field">
              <label htmlFor="progress-course">{t('admin.courses.progressFor')}</label>
              <select id="progress-course" className="input" value={shownTrack.id} data-testid="progress-course" onChange={(e) => setProgressTrack(e.target.value)}>
                {enrolled.map((tr) => <option key={tr} value={tr}>{t(`languages.${tr}`)}</option>)}
              </select>
            </div>
          )}
          <p className="muted small" data-testid="admin-user-stats">{t('admin.xpStreak', { xp: user.stats.xp, streak: user.stats.streak })}</p>
          <Link to={`/admin/users/${user.id}/progress?track=${shownTrack.id}`} className="btn btn--small self-start" data-testid="admin-report-link">{t('admin.openReport')}</Link>
          {showProgress && <ProgressTable userId={user.id} track={shownTrack.id} reloadKey={progressKey} />}
          <AdminReset user={user} track={shownTrack} onDone={() => { setProgressKey((k) => k + 1); load(); }} />
        </section>
      )}

      {!isNew && (
        <section className="card stack danger-zone">
          <DeleteUser user={user} onDeleted={() => navigate('/admin', { replace: true, state: { deleted: user.displayName } })} />
        </section>
      )}
    </main>
  );
}
