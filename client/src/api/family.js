import { api } from './client.js';

// The family board (this week) and, for the admin, its goal.
export const getFamily = () => api('/family');
export const setFamilyGoal = (goal) => api('/admin/family', { method: 'PUT', body: { goal } });
