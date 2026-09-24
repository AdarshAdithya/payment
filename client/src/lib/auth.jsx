import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { get, post, tokenStore, setUnauthorizedHandler } from './api.js';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [state, setState] = useState({ user: null, counts: {}, ready: !tokenStore.get() });

  const logout = useCallback(() => {
    tokenStore.clear();
    setState({ user: null, counts: {}, ready: true });
  }, []);

  const refresh = useCallback(async () => {
    if (!tokenStore.get()) return;
    try {
      const { user, counts } = await get('/me');
      setState({ user, counts, ready: true });
    } catch (e) {
      if (e.status === 401) logout();
      else setState((s) => ({ ...s, ready: true }));
    }
  }, [logout]);

  useEffect(() => {
    setUnauthorizedHandler(logout);
    refresh();
  }, [logout, refresh]);

  // Keep balances and badges fresh while the tab is visible.
  useEffect(() => {
    if (!state.user) return undefined;
    const t = setInterval(() => document.visibilityState === 'visible' && refresh(), 15000);
    return () => clearInterval(t);
  }, [state.user, refresh]);

  const signIn = useCallback(async (path, body) => {
    const { token, user } = await post(path, body);
    tokenStore.set(token);
    setState({ user, counts: {}, ready: true });
    refresh();
    return user;
  }, [refresh]);

  const value = useMemo(() => ({
    ...state,
    refresh,
    logout,
    login: (phone, password) => signIn('/auth/login', { phone, password }),
    register: (data) => signIn('/auth/register', data),
  }), [state, refresh, logout, signIn]);

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);
