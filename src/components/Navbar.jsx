import { useState, useEffect, useRef } from 'react';
import { NavLink, Link, useLocation, useNavigate } from 'react-router-dom';
import { Menu, X, ShoppingBag, LogOut, LayoutDashboard, ArrowRight, ChevronDown, CreditCard, ChevronRight, ShieldCheck } from 'lucide-react';
import Logo from './Logo';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../i18n/LanguageContext';
import LangSwitch from './LangSwitch';
import NotificationBell from './NotificationBell';

const links = [
  { to: '/how-it-works', label: 'How it works' },
  { to: '/packages', label: 'Packages' },
  { to: '/check', label: 'Are you obligated?' },
  { to: '/partners', label: 'Partners' },
  { to: '/news', label: 'News' },
  { to: '/contact', label: 'Contact' },
];

// Pages whose top section is dark, so the navbar starts transparent with white text.
const DARK_TOP = ['/', '/packages', '/requirements', '/contact', '/cart', '/how-it-works', '/faq', '/news', '/partners', '/advertise', '/check', '/terms', '/privacy', '/refund-policy', '/disclaimer', '/partner-agreement'];

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { isAuthenticated, isAdmin, isPartner, user, logout, cart, me, role, can } = useAuth();
  const home = isAdmin ? '/admin' : isPartner ? '/partner' : '/dashboard';
  const homeLabel = isAdmin ? 'Staff panel' : isPartner ? 'Partner portal' : 'Dashboard';
  const { t } = useLang();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const menuRef = useRef(null);

  useEffect(() => { setOpen(false); setMenu(false); }, [pathname]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!menu) return undefined;
    const close = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenu(false); };
    const esc = (e) => e.key === 'Escape' && setMenu(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [menu]);

  const onDark = (DARK_TOP.includes(pathname) || pathname.startsWith('/news/')) && !scrolled && !open;
  const solid = !onDark;
  const initials = me?.name?.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  const doLogout = () => { logout(); navigate('/'); };

  return (
    <header className={`nav ${solid ? 'solid' : 'on-dark'} ${open ? 'open' : ''}`}>
      <div className="container nav-inner">
        <Logo />

        <nav className="nav-links" aria-label={t('Main')}>
          {links.map((l) => <NavLink key={l.to} to={l.to} end={l.end}>{t(l.label)}</NavLink>)}
        </nav>

        <div className="nav-actions">
          <LangSwitch />
          {cart && (
            <Link to="/cart" className="icon-btn" aria-label={t('Cart, 1 item')}>
              <ShoppingBag size={19} /><span className="count">1</span>
            </Link>
          )}
          {isAuthenticated && !isAdmin && !isPartner && <NotificationBell />}
          {isAuthenticated && (
            <NavLink to={home} className={({ isActive }) => `nav-cta nav-dash ${isActive ? 'is-here' : ''}`}>
              {isAdmin ? <ShieldCheck size={16} /> : <LayoutDashboard size={16} />} {t(homeLabel)}
            </NavLink>
          )}
          {isAuthenticated ? (
            <div className="user-menu" ref={menuRef}>
              <button className="user-trigger" onClick={() => setMenu((m) => !m)} aria-expanded={menu} aria-haspopup="menu">
                <span className="avatar">{initials}</span>
                {me.name.split(' ')[0]}
                <ChevronDown size={15} />
              </button>
              {menu && (
                <div className="user-dd" role="menu">
                  <div className="user-dd-head">
                    <strong>{me.name}</strong>
                    <span>{me.email}</span>
                    {!isAdmin && !isPartner && <span className="role-chip">{t(role === 'Owner' ? 'Manager' : role)} · {user.company?.name || ''}</span>}
                  </div>
                  <Link to={home} role="menuitem">{isAdmin ? <ShieldCheck size={16} /> : <LayoutDashboard size={16} />} {t(homeLabel)}</Link>
                  {!isAdmin && !isPartner && can('billing') && <Link to="/packages" role="menuitem"><CreditCard size={16} /> {t(user.subscription ? 'Manage package' : 'Choose a package')}</Link>}
                  <button className="danger" onClick={doLogout} role="menuitem"><LogOut size={16} /> {t('Log out')}</button>
                </div>
              )}
            </div>
          ) : (
            <>
              <Link to="/login" className="nav-link-btn">{t('Log in')}</Link>
              <Link to="/register" className="nav-cta">{t('Get started')} <ArrowRight size={15} className="flip-rtl" /></Link>
            </>
          )}
        </div>

        {isAuthenticated && !isAdmin && !isPartner && <div className="bell-mobile"><NotificationBell /></div>}
        <button className="nav-toggle" onClick={() => setOpen((o) => !o)} aria-label={t(open ? 'Close menu' : 'Open menu')} aria-expanded={open}>
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {open && (
        <div className="nav-mobile">
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.end} className={({ isActive }) => `m-link ${isActive ? 'active' : ''}`}>
              {t(l.label)} <ChevronRight size={18} className="flip-rtl" />
            </NavLink>
          ))}
          {cart && <NavLink to="/cart" className="m-link">{t('Cart (1)')} <ChevronRight size={18} className="flip-rtl" /></NavLink>}
          <LangSwitch className="m-lang" />
          <div className="m-actions">
            {isAuthenticated ? (
              <>
                <Link to={home} className="btn btn-dark btn-lg"><LayoutDashboard size={18} /> {t(homeLabel)}</Link>
                <button className="btn btn-outline btn-lg" onClick={doLogout}><LogOut size={18} /> {t('Log out')}</button>
              </>
            ) : (
              <>
                <Link to="/register" className="btn btn-dark btn-lg">{t('Get started')} <ArrowRight size={18} className="flip-rtl" /></Link>
                <Link to="/login" className="btn btn-outline btn-lg">{t('Log in')}</Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
