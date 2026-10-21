import { api } from './client.js';

// The learner's own courses (server/src/routes/courses.js).
/** { active, courses: [{ track, mascot, startPack, progress, xp }], offered: [{ track, mascot, restore }], canSelfEnroll, nativeLang } */
export const getCourses = () => api('/courses');
export const addCourse = (track) => api('/courses', { method: 'POST', body: { track } });
export const switchCourse = (track) => api('/courses/active', { method: 'PUT', body: { track } });
export const hideCourse = (track) => api(`/courses/${encodeURIComponent(track)}`, { method: 'DELETE' });
