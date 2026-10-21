import { api } from './client.js';

export const getMyProgress = () => api('/progress/me');
/**
 * firstTry: the first answer to this exercise in this run of the lesson (retries after a wrong answer are not);
 * startedAt: when this run started (ISO) — the server moves a word's strength at most once per run.
 */
export const postAttempt = (lessonId, exerciseId, answer, firstTry, startedAt) =>
  api('/progress/attempt', { method: 'POST', body: { lessonId, exerciseId, answer, firstTry, startedAt } });
/** startedAt: when the lesson started (ISO); the server stores the duration clamped to 1 s … 60 min. */
export const completeLesson = (lessonId, firstTryCorrect, total, startedAt) =>
  api(`/progress/lesson/${encodeURIComponent(lessonId)}/complete`, { method: 'POST', body: { firstTryCorrect, total, startedAt } });
/** Self-service reset: { scope: 'track' | 'pack', packId?, password, confirm } */
export const resetMyProgress = (body) => api('/progress/reset', { method: 'POST', body });
