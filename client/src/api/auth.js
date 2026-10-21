import { api } from './client.js';

export const getProfiles = () => api('/users/profiles');
/** uiLang: only when the login-screen toggle was changed for this account during this login (saved on success). */
export const login = (username, password, uiLang) => api('/auth/login', { method: 'POST', body: { username, password, ...(uiLang ? { uiLang } : {}) } });
export const logout = () => api('/auth/logout', { method: 'POST' });
export const me = () => api('/auth/me');
export const changePassword = (current, next) => api('/auth/password', { method: 'POST', body: { current, next } });
/** Own settings: { uiLang?, avatar?, avatarBg? } → { user } */
export const updateMe = (body) => api('/auth/me', { method: 'PATCH', body });
