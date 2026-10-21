import { api } from './client.js';

export const getPracticeSummary = () => api('/practice/summary');
/** mode: 'due' | 'mistakes' → { session: { id, mode, exercises: [{ id, lessonId, packId }] } } */
export const startPractice = (mode) => api('/practice/start', { method: 'POST', body: { mode } });
export const postPracticeAttempt = (sessionId, exerciseId, answer) =>
  api(`/practice/${sessionId}/attempt`, { method: 'POST', body: { exerciseId, answer } });
export const completePractice = (sessionId, startedAt) =>
  api(`/practice/${sessionId}/complete`, { method: 'POST', body: { startedAt } });
export const getProfile = () => api('/profile');
