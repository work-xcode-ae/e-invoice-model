// Public-site widgets: news ticker (WEB-05), ad spaces (WEB-06), video slot (WEB-07),
// WhatsApp button that creates a CRM lead (WEB-09) and cookie consent (WEB-10).
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { MessageCircle, X, Send, Play, Megaphone, Cookie } from 'lucide-react';
import { useLang } from '../i18n/LanguageContext';
import { getPlatform, localized } from '../services/platform';
import { liveAds, trackView, trackClick } from '../services/ads';
import { createLead } from '../services/crm';
import { useDbVersion } from '../hooks/useDb';

const today = () => new Date().toISOString().slice(0, 10);

export function NewsTicker() {
  const { t, lang } = useLang();
  useDbVersion();
  const p = getPlatform();
  if (!p.features.newsTicker) return null;
  const items = p.ticker.filter((x) => x.visible && (!x.start || x.start <= today()) && (!x.end || x.end >= today())).sort((a, b) => a.order - b.order);
  if (!items.length) return null;
  const render = (k) => items.map((x) => {
    const text = localized(x, 'text', lang, t);
    return x.link?.startsWith('/') ? <Link key={`${k}${x.id}`} to={x.link}>{text}</Link> : <a key={`${k}${x.id}`} href={x.link || '#'} target="_blank" rel="noreferrer">{text}</a>;
  });
  return (
    <div className="ticker" role="region" aria-label={t('News')}>
      <div className="container">
        <span className="tk-label">{t('NEWS')}</span>
        <div className="tk-track">{render('a')}{render('b')}</div>
      </div>
    </div>
  );
}

export function AdSlot({ placement }) {
  const { lang } = useLang();
  const [ad] = useState(() => { const list = liveAds(placement); return list[Math.floor(Math.random() * list.length)] || null; });
  useEffect(() => { if (ad) trackView(ad.id); }, [ad]);
  if (!ad) return null;
  return (
    <a className="ad-slot" href={ad.link} target="_blank" rel="noreferrer sponsored" onClick={() => trackClick(ad.id)}>
      <Megaphone size={22} color="#b07f3e" />
      <span><span className="ad-tag">{lang === 'ar' ? 'إعلان' : 'AD'}</span><b>{lang === 'ar' && ad.titleAr ? ad.titleAr : ad.title}</b><small className="muted">{ad.advertiser}</small></span>
    </a>
  );
}

/** The video only loads after the visitor clicks play, so the page stays fast. */
export function VideoSlot() {
  const { t, lang } = useLang();
  const p = getPlatform();
  const [which, setWhich] = useState('short');
  const [playing, setPlaying] = useState(false);
  if (!p.features.video) return null;
  const v = p.video[which];
  return (
    <div>
      <div className="video-slot">
        {playing ? <video src={v.url} poster={v.poster || undefined} controls autoPlay preload="none" />
          : <button type="button" className="play" onClick={() => setPlaying(true)}><span><Play size={30} /></span>{localized(v, 'title', lang, t)}</button>}
      </div>
      <div className="video-tabs">
        {['short', 'full'].map((k) => <button key={k} type="button" className={`chip ${which === k ? 'on' : ''}`} onClick={() => { setWhich(k); setPlaying(false); }}>{localized(p.video[k], 'title', lang, t)}</button>)}
      </div>
    </div>
  );
}

export function WhatsAppButton() {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: '', phone: '', message: '' });
  const [done, setDone] = useState(false);
  if (!getPlatform().features.whatsappButton) return null;
  const send = (e) => {
    e.preventDefault();
    if (!f.phone) return;
    createLead({ name: f.name || f.phone, phone: f.phone, source: 'WhatsApp', note: f.message });
    setDone(true);
    window.open(`https://wa.me/971500000000?text=${encodeURIComponent(f.message || 'Hello, I would like to know more about Model E-Invoice.')}`, '_blank', 'noopener');
  };
  return (
    <>
      {open && (
        <div className="wa-panel" role="dialog" aria-label="WhatsApp">
          <header className="flex between items-center"><div><b>Model E-Invoice</b><small>{t('Usually replies within an hour')}</small></div><button className="ab-close" style={{ color: '#fff' }} onClick={() => setOpen(false)} aria-label={t('Close')}><X size={18} /></button></header>
          {done ? <div style={{ padding: 16 }}>{t('Thanks! WhatsApp opened in a new tab. Our sales team will follow up.')}</div> : (
            <form onSubmit={send}>
              <input className="input" placeholder={t('Your name')} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
              <input className="input" dir="ltr" placeholder="+971 5x xxx xxxx" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} required />
              <textarea className="input" rows="3" placeholder={t('How can we help?')} value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} />
              <button className="btn btn-success"><Send size={16} /> {t('Start chat')}</button>
            </form>
          )}
        </div>
      )}
      <button className="wa-fab" onClick={() => setOpen((o) => !o)} aria-label={t('Chat on WhatsApp')}><MessageCircle size={26} /></button>
    </>
  );
}

// ---------- Cookie consent: no analytics script before consent ----------
const CONSENT_KEY = 'mei_cookie_consent';
export const getConsent = () => { try { return JSON.parse(localStorage.getItem(CONSENT_KEY) || 'null'); } catch { return null; } };
function loadScripts(c) {
  if (c?.analytics && !window.__meiAnalytics) {
    window.__meiAnalytics = true; // placeholder: the analytics tag is injected here, never before consent
    const s = document.createElement('script'); s.dataset.analytics = 'placeholder'; s.text = 'window.dataLayer = window.dataLayer || [];'; document.head.appendChild(s);
  }
  if (c?.marketing && !window.__meiMarketing) { window.__meiMarketing = true; }
}
export function openCookieSettings() { window.dispatchEvent(new Event('mei-cookie-settings')); }

export function CookieBanner() {
  const { t } = useLang();
  const [c, setC] = useState(getConsent);
  const [custom, setCustom] = useState(false);
  const [opts, setOpts] = useState({ analytics: false, marketing: false });
  useEffect(() => { if (c) loadScripts(c); }, [c]);
  useEffect(() => {
    const open = () => { setC(null); setCustom(true); };
    window.addEventListener('mei-cookie-settings', open);
    return () => window.removeEventListener('mei-cookie-settings', open);
  }, []);
  if (c || !getPlatform().features.cookieBanner) return null;
  const save = (v) => { const val = { necessary: true, ...v, at: new Date().toISOString() }; localStorage.setItem(CONSENT_KEY, JSON.stringify(val)); setC(val); };
  return (
    <div className="cookie-bar" role="dialog" aria-label={t('Cookies')}>
      <div className="flex items-center gap-1"><Cookie size={20} color="#b07f3e" /><b>{t('We use cookies')}</b></div>
      <p>{t('Necessary cookies keep the site working. With your consent we also use analytics and marketing cookies.')} <Link to="/privacy">{t('Privacy Policy')}</Link></p>
      {custom && (
        <div className="cb-opts">
          <label className="checkbox"><input type="checkbox" checked disabled /> {t('Necessary')}</label>
          <label className="checkbox"><input type="checkbox" checked={opts.analytics} onChange={(e) => setOpts({ ...opts, analytics: e.target.checked })} /> {t('Analytics')}</label>
          <label className="checkbox"><input type="checkbox" checked={opts.marketing} onChange={(e) => setOpts({ ...opts, marketing: e.target.checked })} /> {t('Marketing')}</label>
        </div>
      )}
      <div className="flex gap-1 wrap">
        <button className="btn btn-primary btn-sm" onClick={() => save({ analytics: true, marketing: true })}>{t('Accept all')}</button>
        <button className="btn btn-outline btn-sm" onClick={() => save({ analytics: false, marketing: false })}>{t('Necessary only')}</button>
        {custom ? <button className="btn btn-outline btn-sm" onClick={() => save(opts)}>{t('Save choices')}</button>
          : <button className="btn btn-outline btn-sm" onClick={() => setCustom(true)}>{t('Customise')}</button>}
      </div>
    </div>
  );
}
