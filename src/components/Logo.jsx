import { Link } from 'react-router-dom';

/**
 * MEI logo per brand guideline: colour mark on light backgrounds, white mark on navy.
 * Wordmark: thin, widely spaced uppercase sans serif.
 */
export default function Logo({ to = '/', variant = 'auto', wordmark = true }) {
  return (
    <Link to={to} className={`brand brand-${variant}`} aria-label="Model E-Invoice home" dir="ltr">
      <img className="brand-color" src="/brand/mei-mark.png" alt="MEI" width="64" height="25" />
      <img className="brand-white" src="/brand/mei-mark-white.png" alt="" aria-hidden="true" width="64" height="25" />
      {wordmark && <span className="wordmark">Model E-Invoice</span>}
    </Link>
  );
}
