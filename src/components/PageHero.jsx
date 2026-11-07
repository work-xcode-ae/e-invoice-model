import { Link } from 'react-router-dom';
import { useLang } from '../i18n/LanguageContext';

export default function PageHero({ title, subtitle, crumb, children, overlap = false, center = false }) {
  const { t } = useLang();
  return (
    <section className={`page-hero ${overlap ? 'page-hero-overlap' : ''} ${center ? 'center' : ''}`}>
      <div className="container">
        <div className="crumbs"><Link to="/">{t('Home')}</Link> / {crumb || title}</div>
        <h1>{title}</h1>
        {subtitle && <p style={center ? { margin: '0 auto' } : undefined}>{subtitle}</p>}
        {children}
      </div>
    </section>
  );
}
