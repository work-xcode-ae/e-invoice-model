import { Link } from 'react-router-dom';
import { FileCheck2 } from 'lucide-react';

export default function Logo({ to = '/', tag = true }) {
  return (
    <Link to={to} className="brand" aria-label="Model E-Invoice home">
      <span className="brand-mark"><FileCheck2 size={19} /></span>
      <span>Model E-Invoice</span>
      {tag && <span className="brand-sub">UAE</span>}
    </Link>
  );
}
