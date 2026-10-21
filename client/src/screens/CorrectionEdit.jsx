import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { getCorrectionItem, hideExercise, previewCorrection, submitCorrection } from '../api/ops.js';
import { t } from '../i18n/index.js';
import { courseLabel } from '../lib/courseLabel.js';
import TopBar from '../components/TopBar.jsx';
import Button from '../components/Button.jsx';
import SpeakerButton from '../components/SpeakerButton.jsx';
import RerecordPanel from '../components/RerecordPanel.jsx';
import ExerciseCard from '../components/ExerciseCard.jsx';
import { Loading, LoadError } from '../components/Loading.jsx';

const lines = (text) => text.split('\n').map((l) => l.trim()).filter(Boolean);

/** The fields that differ from the item as it is now (what the server calls `after`). */
function changesOf(editable, form) {
  const out = {};
  if (form.target.trim() !== editable.target) out.target = form.target;
  if (form.native.trim() !== editable.native) out.native = form.native;
  const also = lines(form.acceptAlso);
  if (JSON.stringify(also) !== JSON.stringify(editable.acceptAlso)) out.acceptAlso = also;
  return out;
}

// Admin → Corrections → one word or sentence: edit its texts (ids, part of speech and gender are read-only), see how the
// exercises that use it will look, and queue the correction; or hide one exercise that is wrong as a whole.
// ?report=<exercise id>: opened from the Inbox ("Fix"): applying the correction closes those reports and thanks the child.
export default function CorrectionEdit() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const reportExercise = params.get('report');
  const navigate = useNavigate();
  const [item, setItem] = useState(null);
  const [failed, setFailed] = useState(false);
  const [form, setForm] = useState(null);
  const [reason, setReason] = useState('');
  const [preview, setPreview] = useState(null);
  const [previewError, setPreviewError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [hiding, setHiding] = useState(null);
  const [hideReason, setHideReason] = useState('');
  const [allPreviews, setAllPreviews] = useState(false);

  const load = useCallback(() => {
    setFailed(false);
    getCorrectionItem(id).then((r) => {
      setItem(r.item);
      setForm({ target: r.item.editable.target, native: r.item.editable.native, acceptAlso: r.item.editable.acceptAlso.join('\n') });
    }).catch(() => setFailed(true));
  }, [id]);
  useEffect(load, [load]);

  const changes = useMemo(() => (item && form ? changesOf(item.editable, form) : {}), [item, form]);
  const changed = Object.keys(changes).length > 0;
  const seq = useRef(0);
  useEffect(() => {
    if (!changed) {
      setPreview(null);
      setPreviewError(null);
      return undefined;
    }
    const n = ++seq.current;
    const timer = setTimeout(() => {
      previewCorrection(id, changes)
        .then((p) => n === seq.current && (setPreview(p), setPreviewError(null)))
        .catch((e) => n === seq.current && (setPreview(null), setPreviewError(e.body?.fields ?? { _: e.body?.error ?? 'error' })));
    }, 350);
    return () => clearTimeout(timer);
  }, [id, changed, changes]);

  if (failed) return <LoadError onRetry={load} />;
  if (!item || !form) return <Loading />;
  const language = t(`languages.${item.targetLang}`);
  const nativeName = t(`nativeLanguages.${item.nativeLang}`);
  const kindLabel = t(`ops.corrections.kind.${item.kind}`);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await submitCorrection({ id, after: changes, reason, ...(reportExercise ? { reportExercise } : {}) });
      navigate(`/admin/corrections?tab=history&id=${r.correction.id}`);
    } catch (e) {
      setError(e.body?.fields ? t('ops.corrections.invalid') : t('ops.corrections.submitFailed'));
      setBusy(false);
    }
  };
  const hide = async (exerciseId) => {
    setBusy(true);
    setError(null);
    try {
      const r = await hideExercise({ exerciseId, reason: hideReason, ...(reportExercise ? { reportExercise } : {}) });
      navigate(`/admin/corrections?tab=history&id=${r.correction.id}`);
    } catch {
      setError(t('ops.corrections.submitFailed'));
      setBusy(false);
    }
  };
  const fieldError = (k) => previewError?.[k] && <p className="field-error">{t(`ops.corrections.error.${previewError[k]}`)}</p>;

  return (
    <main className="page page--wide" data-testid="correction-edit" data-item={item.id}>
      <TopBar title={t('ops.corrections.editTitle', { kind: kindLabel })} backTo="/admin/corrections" />
      {reportExercise && <p className="notice" data-testid="correction-for-report">{t('ops.corrections.forReport', { id: reportExercise })}</p>}

      <section className="card stack">
        <div className="row wrap">
          <SpeakerButton url={item.audio} />
          <SpeakerButton url={item.audioSlow} slow />
          <h2 lang={item.targetLang} className="spacer">{item.target}</h2>
        </div>
        <dl className="facts">
          <dt>{t('ops.corrections.id')}</dt><dd><code>{item.id}</code></dd>
          <dt>{t('ops.corrections.levelUnit')}</dt><dd data-testid="correction-course">{`${courseLabel(item)} · ${item.level} · ${item.unitTitle}`}</dd>
          {item.kind === 'vocabulary' && <><dt>{t('ops.corrections.pos')}</dt><dd>{item.pos}{item.gender ? ` · ${t(`ops.corrections.gender.${item.gender}`)}` : ''}</dd></>}
          <dt>{t('ops.corrections.source')}</dt><dd><code>{item.sourceFile}</code></dd>
        </dl>
        <p className="muted">{t('ops.corrections.readOnlyNote')}</p>
        {item.audio && (
          <details data-testid="rerecord-toggle">
            <summary>{t('ops.rerecord.title')}</summary>
            <RerecordPanel clips={[{ url: item.audio }, { url: item.audioSlow, slow: true }]} reportExercise={reportExercise} />
          </details>
        )}
      </section>

      <section className="card stack" data-testid="correction-form">
        <h2>{t('ops.corrections.change')}</h2>
        <label className="field">
          <span className="field-label">{t('ops.corrections.field.target', { language })}</span>
          <input className="input" lang={item.targetLang} value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })} data-testid="correction-target" />
          {fieldError('target')}
          {item.sharedWith?.length > 0 && (
            <span className="field-help" data-testid="correction-shared">
              {t('ops.corrections.sharedTarget', { language, courses: item.sharedWith.map((c) => courseLabel({ targetLang: item.targetLang, nativeLang: c.nativeLang })).join(', ') })}
            </span>
          )}
        </label>
        <label className="field">
          <span className="field-label">{t('ops.corrections.field.nativeIn', { native: nativeName })}</span>
          <input className="input" lang={item.nativeLang} value={form.native} onChange={(e) => setForm({ ...form, native: e.target.value })} data-testid="correction-native" />
          {fieldError('native')}
        </label>
        <label className="field">
          <span className="field-label">{t('ops.corrections.field.acceptAlso')}</span>
          <textarea className="input textarea" lang={item.targetLang} rows={3} value={form.acceptAlso}
            onChange={(e) => setForm({ ...form, acceptAlso: e.target.value })} data-testid="correction-accept" />
          <span className="field-help">{t('ops.corrections.acceptHelp')}</span>
          {fieldError('acceptAlso')}
        </label>
        <label className="field">
          <span className="field-label">{t('ops.corrections.reason')}</span>
          <input className="input" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} data-testid="correction-reason" />
        </label>

        {preview && (
          <div className="stack" data-testid="correction-warnings">
            {preview.audioChange && <p className="notice notice--warn" data-testid="warning-audio">{t('ops.corrections.warnAudio', { language })}</p>}
            <p className="notice" data-testid="warning-used">{t(`ops.corrections.warnUsed.${item.kind}`, { n: preview.usedIn })}</p>
          </div>
        )}
        {previewError?._ === 'nothing_changed' && <p className="muted">{t('ops.corrections.nothingChanged')}</p>}
        {previewError?._ && previewError._ !== 'nothing_changed' && <p className="form-error" role="alert" data-testid="preview-error">{t('app.error')}</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
        <Button block disabled={!changed || !preview || busy} onClick={submit} data-testid="correction-submit">{t('ops.corrections.submit')}</Button>
        <p className="muted">{t('ops.corrections.submitNote')}</p>
      </section>

      {preview && (
        <section className="stack" data-testid="correction-preview">
          <h2>{t('ops.corrections.preview')}</h2>
          {(allPreviews ? preview.exercises : preview.exercises.slice(0, 3)).map((x) => (
            <div key={x.id} className="preview-pair">
              <ExerciseCard ex={x.before} track={item.targetLang} title={x.lessonTitle} mark="before" testId="preview-before" />
              <ExerciseCard ex={x.after} track={item.targetLang} title={t('ops.corrections.after')} mark="after" testId="preview-after" />
              {x.mayChange && <p className="muted">{t('ops.corrections.mayChange')}</p>}
            </div>
          ))}
          {!allPreviews && preview.exercises.length > 3 && (
            <Button variant="secondary" onClick={() => setAllPreviews(true)} data-testid="preview-all">{t('ops.corrections.showAll', { n: preview.exercises.length })}</Button>
          )}
        </section>
      )}

      {!preview && (
        <section className="stack" data-testid="correction-exercises">
          <h2>{t('ops.corrections.exercises', { n: item.exercises.length })}</h2>
          {item.exercises.map((ex) => (
            <div key={ex.id} className="stack">
              <ExerciseCard ex={ex} track={item.targetLang} title={ex.lessonTitle} mark={ex.id === reportExercise ? 'reported' : undefined} />
              {hiding === ex.id ? (
                <div className="card stack">
                  <p>{t('ops.corrections.hideExplain')}</p>
                  <label className="field">
                    <span className="field-label">{t('ops.corrections.hideReason')}</span>
                    <input className="input" value={hideReason} maxLength={300} onChange={(e) => setHideReason(e.target.value)} data-testid="hide-reason" />
                  </label>
                  <div className="row wrap">
                    <Button size="small" variant="danger" disabled={!hideReason.trim() || busy} onClick={() => hide(ex.id)} data-testid="hide-confirm">{t('ops.corrections.hideYes')}</Button>
                    <Button size="small" variant="secondary" onClick={() => setHiding(null)}>{t('admin.confirmNo')}</Button>
                  </div>
                </div>
              ) : (
                <div><Button size="small" variant="secondary" onClick={() => setHiding(ex.id)} data-testid={`hide-${ex.id}`}>{t('ops.corrections.hide')}</Button></div>
              )}
            </div>
          ))}
        </section>
      )}
    </main>
  );
}
