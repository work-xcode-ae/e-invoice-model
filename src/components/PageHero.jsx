import { Link } from 'react-router-dom';

export default function PageHero({ title, subtitle, crumb, children, overlap = false, center = false }) {
  return (
    <section className={`page-hero ${overlap ? 'page-hero-overlap' : ''} ${center ? 'center' : ''}`}>
      <div className="container">
        <div className="crumbs"><Link to="/">Home</Link> / {crumb || title}</div>
        <h1>{title}</h1>
        {subtitle && <p style={center ? { margin: '0 auto' } : undefined}>{subtitle}</p>}
        {children}
      </div>
    </section>
  );
}
