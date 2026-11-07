import { Link } from 'react-router-dom';
import { Mail, MapPin, Globe } from 'lucide-react';
import Logo from './Logo';
import { useLang } from '../i18n/LanguageContext';

export default function Footer() {
  const { t } = useLang();
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-grid">
          <div>
            <Logo variant="white" />
            <p>{t('Accredited UAE e-invoicing: Peppol PINT AE exchange, Tax Data reporting to the FTA, and onboarding support, all under one brand.')}</p>
            <p className="flex items-center gap-1 mb-0"><MapPin size={15} /> {t('Al Wahda Commercial Tower, Office 1504, Abu Dhabi')}</p>
          </div>
          <div>
            <h5>{t('Platform')}</h5>
            <ul>
              <li><Link to="/packages">{t('Packages & Pricing')}</Link></li>
              <li><Link to="/requirements">{t('Requirements')}</Link></li>
              <li><Link to="/register">{t('Create Account')}</Link></li>
              <li><Link to="/login">{t('Customer Login')}</Link></li>
            </ul>
          </div>
          <div>
            <h5>{t('Solutions')}</h5>
            <ul>
              <li><a href="/#how-it-works">{t('How it works')}</a></li>
              <li><a href="/#integrations">{t('Integrations & API')}</a></li>
              <li><a href="/#compliance">{t('Compliance & Security')}</a></li>
              <li><a href="/#faq">{t('FAQ')}</a></li>
            </ul>
          </div>
          <div>
            <h5>{t('Contact')}</h5>
            <ul>
              <li><Link to="/contact">{t('Contact Us')}</Link></li>
              <li className="flex items-center gap-1"><Mail size={14} /> <a href="mailto:info@modelfc.ae" dir="ltr">info@modelfc.ae</a></li>
              <li className="flex items-center gap-1"><Globe size={14} /> <a href="https://www.modelfc.ae" target="_blank" rel="noreferrer" dir="ltr">www.modelfc.ae</a></li>
            </ul>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} {t('Model Financial Consulting. All rights reserved.')}</span>
          <span dir="ltr">ISO/IEC 27001:2022 · ISO 22301:2019 · Peppol Seat PAE001264</span>
        </div>
      </div>
    </footer>
  );
}
