import { api } from './client.js';

export const listUsers = () => api('/admin/users');
export const getUser = (id) => api(`/admin/users/${id}`);
export const createUser = (body) => api('/admin/users', { method: 'POST', body });
export const updateUser = (id, body) => api(`/admin/users/${id}`, { method: 'PATCH', body });
export const deleteUser = (id, confirmUsername) => api(`/admin/users/${id}`, { method: 'DELETE', body: { confirmUsername } });
export const setUserPassword = (id, next) => api(`/admin/users/${id}/password`, { method: 'POST', body: { next } });
const trackQuery = (track) => (track ? `?track=${encodeURIComponent(track)}` : '');
/** One course's lessons (default: the active course). */
export const getUserProgress = (id, track) => api(`/admin/users/${id}/progress${trackQuery(track)}`);
export const getUserReport = (id, track) => api(`/admin/users/${id}/report${trackQuery(track)}`);
/** { active, courses: [{ track, startPack, hidden, offered, progress, xp }], offered: [{ track }], canSelfEnroll, nativeLang } */
export const getUserCourses = (id) => api(`/admin/users/${id}/courses`);
/** body: { startPack?, hidden?, active? } — enrols when needed */
export const putUserCourse = (id, track, body) => api(`/admin/users/${id}/courses/${encodeURIComponent(track)}`, { method: 'PUT', body });
export const getVoices = () => api('/admin/voices');
/** scope: { scope: 'track', track } or { scope: 'pack', packId } */
export const resetUserProgress = (id, scope) => api(`/admin/users/${id}/progress/reset`, { method: 'POST', body: scope });
export const previewAttempt = (exerciseId, answer) => api('/admin/preview/attempt', { method: 'POST', body: { exerciseId, answer } });
