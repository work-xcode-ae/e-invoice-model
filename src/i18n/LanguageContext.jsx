import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import arBase from './ar';
import ar2 from './ar2';
import ar3 from './ar3';
import ar4 from './ar4';

const ar = { ...arBase, ...ar2, ...ar3, ...ar4 };
import { setCurrencyLang } from '../data/packages';

/**
 * Lightweight i18n: English text is the key. t('Packages') returns the Arabic
 * translation when the language is Arabic, otherwise the English text.
 * Placeholders use {name}: t('Save {amount}', { amount: 'AED 20' }).
 */
const LanguageContext = createContext(null);
const STORAGE_KEY = 'mei_lang';

const readLang = () => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'ar' || saved === 'en') return saved;
  } catch { /* storage unavailable */ }
  return 'en';
};

const fill = (str, vars) =>
  vars ? str.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? vars[k] : m)) : str;

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(readLang);
  setCurrencyLang(lang);

  useEffect(() => {
    const html = document.documentElement;
    html.lang = lang;
    html.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.title = lang === 'ar' ? 'نموذج الفوترة الإلكترونية | منصة الفوترة الإلكترونية في الإمارات' : 'Model E-Invoice | UAE e-Invoicing Platform';
  }, [lang]);

  const setLang = useCallback((l) => {
    setLangState(l);
    try { localStorage.setItem(STORAGE_KEY, l); } catch { /* ignore */ }
  }, []);

  const t = useCallback(
    (str, vars) => {
      if (str === undefined || str === null) return '';
      // "Word|context" keys: same English word, different Arabic by context (e.g. "Open|status").
      const plain = typeof str === 'string' && str.includes('|') ? str.slice(0, str.indexOf('|')) : str;
      if (lang !== 'ar') return fill(plain, vars);
      const tr = ar[str] ?? (plain !== str ? ar[plain] : undefined);
      if (tr === undefined && import.meta.env.DEV) {
        window.__missingAr = window.__missingAr || new Set();
        window.__missingAr.add(str);
      }
      return fill(tr ?? plain, vars);
    },
    [lang]
  );

  const value = useMemo(() => ({
    lang,
    setLang,
    t,
    isRTL: lang === 'ar',
    // Western digits are standard in UAE business documents.
    locale: lang === 'ar' ? 'ar-AE-u-nu-latn' : 'en-GB',
  }), [lang, setLang, t]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export const useLang = () => useContext(LanguageContext);

/** Errors thrown by the API carry an English template + vars so the UI can translate them. */
export const errText = (t, e) => {
  if (!e) return '';
  if (typeof e === 'string') return t(e);
  const vars = e.vars && e.vars.name ? { ...e.vars, name: t(e.vars.name) } : e.vars;
  return t(e.key || e.message || 'Something went wrong.', vars);
};
