import { CheckCircle2 } from 'lucide-react';

export default function AuthSide({ title, text }) {
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
        ].map((t) => (
          <li key={t}><CheckCircle2 size={20} /> {t}</li>
        ))}
      </ul>
    </aside>
  );
}
