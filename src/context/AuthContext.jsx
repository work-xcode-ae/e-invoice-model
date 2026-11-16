import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import * as api from '../services/api';
import { can } from '../services/permissions';
import { levelFor } from '../services/staff';

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
        if (!s || s.staff || s.partnerId) return s;
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

  /** Returns the session, or { otpRequired, challengeId, … } when a second factor is needed. */
  const login = async (data) => {
    const s = await api.login(data);
    if (!s.otpRequired) setSession(s);
    return s;
  };
  const verifyLogin = async (challengeId, code) => {
    const s = await api.completeLogin(challengeId, code);
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

  const role0 = session?.user?.role || null;
  const isStaff = role0 === 'SuperAdmin' || role0 === 'Staff';
  const isPartner = role0 === 'Partner';
  // A team member signs in to the owner's company with their own role.
  const member = session?.member || null;
  const role = member ? member.role : role0;
  const me = member ? { id: member.id, name: member.name, email: member.email }
    : session?.partnerUser ? { id: session.partnerUser.id, name: session.partnerUser.name, email: session.partnerUser.email }
    : session?.user ? { id: session.user.role === 'Owner' ? 'owner' : session.user.id, name: session.user.fullName, email: session.user.email } : null;
  const staffRoles = session?.user?.staffRoles || (role0 === 'SuperAdmin' ? ['Manager'] : []);
  /** Customer permission (section 4.2) — staff can do everything customers can when looking at a company. */
  const canDo = (perm) => (isStaff ? true : can(role, perm));
  /** Staff permission level (section 4.1): 'full' | 'approve' | 'request' | 'tech' | 'own' | 'view' | null. */
  const staffLevel = (perm) => (isStaff ? levelFor(staffRoles, perm) : null);

  return (
    <AuthContext.Provider
      value={{
        user: session?.user || null, isAuthenticated: !!session, isAdmin: isStaff, isStaff, isPartner,
        partnerId: session?.partnerId || null, partnerUser: session?.partnerUser || null,
        staffRoles, staffLevel, member, role, me, can: canDo, login, verifyLogin, register, logout, refreshUser, cart, setCart,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
