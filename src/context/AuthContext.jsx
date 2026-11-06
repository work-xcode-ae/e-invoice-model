import { createContext, useContext, useState, useCallback } from 'react';
import * as api from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(() => api.getSession());
  const [cart, setCartState] = useState(() => {
    try {
      return JSON.parse(sessionStorage.getItem('mei_cart')) || null;
    } catch {
      return null;
    }
  });

  const setCart = useCallback((item) => {
    setCartState(item);
    try {
      if (item) sessionStorage.setItem('mei_cart', JSON.stringify(item));
      else sessionStorage.removeItem('mei_cart');
    } catch {
      /* ignore */
    }
  }, []);

  const login = async (data) => {
    const s = await api.login(data);
    setSession(s);
    return s;
  };
  const register = async (data) => {
    const s = await api.register(data);
    setSession(s);
    return s;
  };
  const logout = () => {
    api.logout();
    setSession(null);
  };
  const refreshUser = (user) => setSession((s) => (s ? { ...s, user } : s));

  return (
    <AuthContext.Provider
      value={{ user: session?.user || null, isAuthenticated: !!session, login, register, logout, refreshUser, cart, setCart }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
