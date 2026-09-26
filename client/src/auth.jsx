import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, getToken, setAuthLostHandler, setToken } from './api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const navigate = useNavigate();

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setUser(null);
      return null;
    }
    try {
      const me = await api('/me');
      setUser(me);
      return me;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    refresh().finally(() => setReady(true));
  }, [refresh]);

  useEffect(() => {
    setAuthLostHandler((code) => {
      const wasStaff = user && user.role !== 'CITIZEN';
      setToken(null);
      setUser(null);
      if (code === 'SESSION_EXPIRED') navigate('/session-expired', { state: { staff: wasStaff } });
      else navigate(wasStaff ? '/staff/login' : '/login');
    });
  }, [navigate, user]);

  const signIn = useCallback((token, u) => {
    setToken(token);
    setUser(u);
    refresh();
  }, [refresh]);

  const signOut = useCallback(() => {
    const staff = user && user.role !== 'CITIZEN';
    setToken(null);
    setUser(null);
    navigate(staff ? '/staff/login' : '/login');
  }, [navigate, user]);

  return <AuthContext.Provider value={{ user, ready, refresh, signIn, signOut }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
