import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getInbox, inboxAction } from '../api/ops.js';
import { t, tIn } from '../i18n/index.js';
import TopBar from '../components/TopBar.jsx';
import Button from '../components/Button.jsx';
import SpeakerButton from '../components/SpeakerButton.jsx';
import ExerciseCard from '../components/ExerciseCard.jsx';
import RerecordPanel from '../components/RerecordPanel.jsx';
import { Loading, LoadError } from '../components/Loading.jsx';
import { questionText } from '../lib/question.js';
import { copyText } from '../lib/clipboard.js';
import { dateTime } from '../lib/dates.js';
import { messageKey } from '../lib/audience.js';

const answerText = (a) => (a == null ? '—' : typeof a === 'string' ? a : Array.isArray(a) ? a.join(' ') : a.mistakes != null ? t('ops.inbox.pairMistakes', { n: a.mistakes }) : JSON.stringify(a));

// Admin → Inbox: the children's 🚩 reports, one card per exercise (newest first), the exercise as they saw it.
// Already correct (optionally thanking them), Fix (the correction editor; applying it closes the reports and thanks
// the child), Copy question (copies a ready-made question), Dismiss.
export default function Inbox() {
  const [groups, setGroups] = useState(null);
  const [failed, setFailed] = useState(false);
  const [notice, setNotice] = useState(null);
  const load = useCallback(() => {
    setFailed(false);
    getInbox().then((r) => setGroups(r.groups)).catch(() => setFailed(true));
  }, []);
  useEffect(load, [load]);

  if (failed) return <LoadError onRetry={load} />;
  if (!groups) return <Loading />;
  return (
    <main className="page page--wide" data-testid="inbox">
      <TopBar title={t('ops.inbox.title')} backTo="/admin" />
      <p className="muted">{t('ops.inbox.intro')}</p>
      {notice && <p className="form-ok" role="status" data-testid="inbox-notice">{notice}</p>}
      {!groups.length && <p className="card muted" data-testid="inbox-empty">{t('ops.inbox.empty')}</p>}
      {groups.map((g) => <Group key={g.exerciseId} group={g} onClosed={(text) => { setNotice(text); load(); }} />)}
    </main>
  );
}

function Group({ group: g, onClosed }) {
  const navigate = useNavigate();
  const [mode, setMode] = useState(null); // null | 'correct' | 'dismiss' | 'fixed'
  const lang = g.reports[0]?.uiLang ?? 'nl';
  const audience = g.reports[0]?.audience ?? 'child';
  const defaultText = tIn(lang, messageKey('checked', audience));
  const [send, setSend] = useState(true);
  const [message, setMessage] = useState(defaultText);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const language = t(`languages.${g.track}`);
  const native = t(`nativeLanguages.${g.native ?? 'nl'}`);
  const seen = g.seen ? { ...g.seen, answer: g.correctAnswer } : null;
  const children = [...new Set(g.reports.map((r) => r.displayName))];
  // Reporters with different languages or audiences: the default text goes to each in their own wording (message: true).
  const multiLang = new Set(g.reports.map((r) => `${r.uiLang}/${r.audience ?? 'child'}`)).size > 1;

  const close = async (action) => {
    setBusy(true);
    setError(null);
    try {
      const body = action === 'correct' ? { action, message: send ? (multiLang && message === defaultText ? true : message) : false } : { action };
      const r = await inboxAction(g.exerciseId, body);
      onClosed(action === 'correct' ? t('ops.inbox.closedCorrect', { n: r.messages })
        : action === 'fixed' ? t('ops.inbox.closedFixed', { n: r.messages }) : t('ops.inbox.closedDismissed'));
    } catch {
      setError(t('ops.inbox.actionFailed'));
      setBusy(false);
    }
  };
  const ask = async () => {
    setCopied(await copyText(questionText(g)) ? 'ok' : 'failed');
  };

  return (
    <article className="card stack inbox-group" data-testid={`inbox-group-${g.exerciseId}`} data-count={g.count}>
      <div className="correction-head">
        <span className="pill pill--wait">{t('ops.inbox.count', { n: g.count })}</span>
        <span className="muted">{`${language} · ${children.join(', ')} · ${dateTime(g.newestAt)}`}</span>
      </div>
      <ul className="inbox-reports">
        {g.reports.map((r) => (
          <li key={r.id} data-testid="inbox-report">
            <strong>{r.displayName}</strong>{' '}
            <span className="pill pill--muted">{t(`ops.inbox.reason.${r.reason}`, { language, native })}</span>
            {r.note && <q className="inbox-note">{r.note}</q>}
            <span className="muted inbox-answer">
              {t('ops.inbox.childAnswer', { answer: answerText(r.childAnswer) })}
              {r.childCorrect != null && ` (${r.childCorrect ? t('ops.inbox.right') : t('ops.inbox.wrong')})`}
            </span>
          </li>
        ))}
      </ul>
      <h3>{t('ops.inbox.asSeen')}</h3>
      <ExerciseCard ex={seen} track={g.track} testId="inbox-exercise" />
      {g.clips?.audio && (
        <p className="row"><SpeakerButton url={g.clips.audio} /><SpeakerButton url={g.clips.audioSlow} slow /><span className="muted">{t('ops.inbox.answerClip')}</span></p>
      )}
      {/* an audio report: record the clip again from here */}
      {g.clips?.audio && g.reports.some((r) => r.reason === 'audio') && (
        <RerecordPanel clips={[{ url: g.clips.audio }, { url: g.clips.audioSlow, slow: true }]} reportExercise={g.exerciseId} />
      )}
      {g.hidden && <p className="notice">{t('ops.inbox.hidden')}</p>}

      {mode === 'correct' ? (
        <div className="card stack inset">
          <label className="row">
            <input type="checkbox" checked={send} onChange={(e) => setSend(e.target.checked)} data-testid="inbox-send-message" />
            <span>{t('ops.inbox.sendMessage')}</span>
          </label>
          {send && (
            <label className="field">
              <span className="field-label">{t('ops.inbox.messageLabel')}</span>
              <textarea className="input textarea" rows={2} maxLength={200} value={message} onChange={(e) => setMessage(e.target.value)} data-testid="inbox-message" />
              {multiLang && <span className="field-help">{t('ops.inbox.multiLang')}</span>}
            </label>
          )}
          <div className="row wrap">
            <Button size="small" variant="success" disabled={busy} onClick={() => close('correct')} data-testid="inbox-correct-confirm">{t('ops.inbox.closeCorrect')}</Button>
            <Button size="small" variant="secondary" onClick={() => setMode(null)}>{t('admin.confirmNo')}</Button>
          </div>
        </div>
      ) : mode === 'fixed' ? (
        <div className="row wrap">
          <span>{t('ops.inbox.fixedConfirm')}</span>
          <Button size="small" variant="success" disabled={busy} onClick={() => close('fixed')} data-testid="inbox-fixed-confirm">{t('ops.inbox.markFixed')}</Button>
          <Button size="small" variant="secondary" onClick={() => setMode(null)}>{t('admin.confirmNo')}</Button>
        </div>
      ) : mode === 'dismiss' ? (
        <div className="row wrap">
          <span>{t('ops.inbox.dismissConfirm')}</span>
          <Button size="small" variant="danger" disabled={busy} onClick={() => close('dismiss')} data-testid="inbox-dismiss-confirm">{t('ops.inbox.dismiss')}</Button>
          <Button size="small" variant="secondary" onClick={() => setMode(null)}>{t('admin.confirmNo')}</Button>
        </div>
      ) : (
        <div className="stack">
          <div className="inbox-actions">
            <Button size="small" variant="success" onClick={() => setMode('correct')} data-testid="inbox-correct">{t('ops.inbox.alreadyCorrect')}</Button>
            {g.items.map((it) => (
              <Button key={it.id} size="small" onClick={() => navigate(`/admin/corrections/item/${encodeURIComponent(it.id)}?report=${encodeURIComponent(g.exerciseId)}`)}
                data-testid={`inbox-fix-${it.id}`}>
                {t('ops.inbox.fix', { text: it.target })}
              </Button>
            ))}
            <Button size="small" variant="secondary" onClick={() => setMode('fixed')} data-testid="inbox-fixed">{t('ops.inbox.markFixed')}</Button>
            <Button size="small" variant="secondary" onClick={ask} data-testid="inbox-ask">{t('ops.inbox.ask')}</Button>
            <Button size="small" variant="secondary" onClick={() => setMode('dismiss')} data-testid="inbox-dismiss">{t('ops.inbox.dismiss')}</Button>
          </div>
          {copied === 'ok' && <p className="form-ok" role="status" data-testid="inbox-copied">{t('ops.inbox.copied')}</p>}
          {copied === 'failed' && <p className="form-error" role="alert">{t('ops.copyFailed')}</p>}
        </div>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
    </article>
  );
}
