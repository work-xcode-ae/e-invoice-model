import { CheckCircle2 } from 'lucide-react';
import { useLang } from '../i18n/LanguageContext';

export default function AuthSide({ title, text }) {
  const { t } = useLang();
  return (
    <aside className="auth-side">
      <h2>{title}</h2>
      <p>{text}</p>
      <ul>
        {[
          'Peppol PINT AE e-invoices, validated before sending',
          'Automatic Tax Data reporting to the FTA',
          'Manual entry, Excel upload or REST API',
          'Live status tracking & full audit log',
          'MFA and AES-256 encryption',
        ].map((item) => (
          <li key={item}><CheckCircle2 size={20} /> {t(item)}</li>
        ))}
      </ul>
    </aside>
  );
}
