import { api } from './client.js';

// Admin → Corrections
export const searchContent = (q) => api(`/admin/corrections/search?q=${encodeURIComponent(q)}`);
export const getCorrectionItem = (id) => api(`/admin/corrections/item/${encodeURIComponent(id)}`);
export const getAdminExercise = (id) => api(`/admin/corrections/exercise/${encodeURIComponent(id)}`);
export const previewCorrection = (id, after) => api('/admin/corrections/preview', { method: 'POST', body: { id, after } });
export const submitCorrection = (body) => api('/admin/corrections', { method: 'POST', body });
export const hideExercise = (body) => api('/admin/corrections/hide', { method: 'POST', body });
export const undoCorrection = (id) => api(`/admin/corrections/${id}/undo`, { method: 'POST', body: {} });
export const listCorrections = () => api('/admin/corrections');

// Children's reports (child side) and Admin → Inbox
export const sendReport = (body) => api('/reports', { method: 'POST', body });
export const getMessages = () => api('/messages');
export const markMessageShown = (id) => api(`/messages/${id}/shown`, { method: 'POST', body: {} });
export const getInbox = () => api('/admin/inbox');
export const inboxAction = (exerciseId, body) => api(`/admin/inbox/${encodeURIComponent(exerciseId)}`, { method: 'POST', body });

// Admin → System
export const getAdminSummary = () => api('/admin/summary');
export const getSystem = () => api('/admin/system');
export const getDiagnostics = () => api('/admin/system/diagnostics');
/** { key } one problem, { all: true } every problem shown → { problems, acknowledged } */
export const acknowledgeProblems = (body) => api('/admin/system/problems/ack', { method: 'POST', body });

// Admin → Listen check: progress, strata, fix queue and the next clip
export const getListen = () => api('/admin/listen');
/** the Audio quality numbers (lib/quality.js) */
export const getAudioQuality = () => api('/admin/listen/quality');
/** { file, verdict: 'ok' | 'bad', reason?, note? } → the new state */
export const postListen = (body) => api('/admin/listen', { method: 'POST', body });
export const getAudioSample = () => api('/admin/audio-sample');
export const voteAudioSample = (rowId, body) => api(`/admin/audio-sample/${encodeURIComponent(rowId)}`, { method: 'POST', body });

// "Record again": a new take of one clip, made by the content job; the admin hears old and new and chooses
export const getRerecords = (files) => api(`/admin/rerecord?files=${encodeURIComponent(files.join(','))}`);
export const requestRerecord = (body) => api('/admin/rerecord', { method: 'POST', body });
export const decideRerecord = (id, decision, body = {}) => api(`/admin/rerecord/${id}/${decision}`, { method: 'POST', body });
