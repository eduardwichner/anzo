import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as authApi from '../api/auth.js';
import { setUnauthorizedHandler } from '../api/client.js';
import { clearContentCache } from '../api/content.js';
import { deviceLang, setLang } from '../i18n/index.js';
import { setSfxEnabled } from '../audio/sfx.js';
import { applyTheme } from '../lib/theme.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [state, setState] = useState({ status: 'loading', user: null, stats: null });

  const refresh = useCallback(async () => {
    try {
      const { user, stats } = await authApi.me();
      setState({ status: 'ready', user, stats });
      return user;
    } catch (err) {
      if (err.status === 401) {
        setState({ status: 'ready', user: null, stats: null });
        return null;
      }
      setState((s) => ({ ...s, status: s.user ? 'ready' : 'error' }));
      throw err;
    }
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setLang(deviceLang());
      applyTheme('system');
      setState({ status: 'ready', user: null, stats: null });
    });
    refresh().catch(() => {});
  }, [refresh]);

  // The accent colour follows the learner's active course.
  useEffect(() => {
    const u = state.user;
    document.documentElement.dataset.track = u ? (u.role === 'admin' ? 'admin' : u.activeTrack ?? 'en') : 'en';
  }, [state.user]);

  // Sound effects follow the account's switch (users.sound_effects).
  const soundEffects = state.user?.soundEffects;
  useEffect(() => {
    setSfxEnabled(soundEffects !== false);
  }, [soundEffects]);

  // Logged in, the interface language is the account's. It is not remembered for the device: after logout the
  // login screen returns to the device's own language (Login.jsx).
  const uiLang = state.user?.uiLang;
  useEffect(() => {
    if (uiLang) setLang(uiLang);
  }, [uiLang]);

  // The theme is the account's (Settings → Theme), remembered on the device so the next cold start paints it at once;
  // logged out, the device's own setting (login screen).
  const theme = state.user?.theme;
  const hasUser = Boolean(state.user);
  useEffect(() => {
    if (state.status !== 'ready') return;
    applyTheme(hasUser ? theme ?? 'system' : 'system');
  }, [theme, hasUser, state.status]);

  const value = useMemo(
    () => ({
      ...state,
      refresh,
      setStats: (stats) => setState((s) => ({ ...s, stats })),
      /** Replace the user after a settings change (PATCH /api/auth/me). */
      setUser: (user) => setState((s) => ({ ...s, user })),
      async login(username, password, uiLang) {
        await authApi.login(username, password, uiLang);
        clearContentCache();
        // another account on a shared tablet: no cached answer of the previous login
        window.caches?.delete('anzo-api').catch(() => {});
        return refresh();
      },
      async logout() {
        try {
          await authApi.logout();
        } finally {
          clearContentCache();
          // The service worker's cache of lesson content (vite.config.js) belongs to this login too.
          window.caches?.delete('anzo-api').catch(() => {});
          setLang(deviceLang());
          applyTheme('system');
          // A chosen logout: the next login starts on its own home page, not the page logged out from.
          setState({ status: 'ready', user: null, stats: null, loggedOut: true });
        }
      },
    }),
    [state, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
