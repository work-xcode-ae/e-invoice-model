import { Link } from 'react-router-dom';
import { useLang, errText } from '../i18n/LanguageContext';

export default function NotFound() {
  const { t, locale } = useLang();
  return (
    <section className="section center">
      <div className="container">
        <h1 style={{ fontSize: 64, color: '#0f5c94' }}>404</h1>
        <h2>{t('Page not found')}</h2>
        <p className="muted">{t('The page you are looking for does not exist.')}</p>
        <Link to="/" className="btn btn-primary">{t('Back to home')}</Link>
      </div>
    </section>
  );
}
