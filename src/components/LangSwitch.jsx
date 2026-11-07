import { Languages } from 'lucide-react';
import { useLang } from '../i18n/LanguageContext';

/** Toggles English ⇄ Arabic. Shows the name of the *other* language, in that language. */
export default function LangSwitch({ className = '' }) {
  const { lang, setLang } = useLang();
  const next = lang === 'ar' ? 'en' : 'ar';
  return (
    <button
      type="button"
      className={`lang-switch ${className}`}
      onClick={() => setLang(next)}
      lang={next}
      aria-label={lang === 'ar' ? 'Switch to English' : 'التبديل إلى العربية'}
    >
      <Languages size={16} />
      <span>{lang === 'ar' ? 'English' : 'العربية'}</span>
    </button>
  );
}
