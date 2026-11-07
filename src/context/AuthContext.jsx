import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import * as api from '../services/api';
import { can } from '../services/permissions';

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

  // Keep the logged-in user in sync with the data store (queue engine, admin actions, other tabs).
  useEffect(() => {
    const sync = () => {
      setSession((s) => {
        if (!s) return s;
        const fresh = api.getUserById(s.user.id);
        if (!fresh) return s;
        const user = api.publicUser(fresh);
        return JSON.stringify(user) === JSON.stringify(s.user) ? s : { ...s, user };
      });
    };
    window.addEventListener(api.DB_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => { window.removeEventListener(api.DB_EVENT, sync); window.removeEventListener('storage', sync); };
  }, []);

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
  // A team member signs in to the owner's company; their role limits what they can do.
  const member = session?.member || null;
  const role = member ? member.role : session?.user?.role || null;
  const me = member ? { name: member.name, email: member.email } : session?.user ? { name: session.user.fullName, email: session.user.email } : null;
  const canDo = (perm) => (role === 'SuperAdmin' ? true : can(role, perm));

  return (
    <AuthContext.Provider
      value={{ user: session?.user || null, isAuthenticated: !!session, isAdmin: session?.user?.role === 'SuperAdmin', member, role, me, can: canDo, login, register, logout, refreshUser, cart, setCart }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
