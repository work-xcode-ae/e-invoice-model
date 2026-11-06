import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <section className="section center">
      <div className="container">
        <h1 style={{ fontSize: 64, color: '#1d6fe8' }}>404</h1>
        <h2>Page not found</h2>
        <p className="muted">The page you are looking for does not exist.</p>
        <Link to="/" className="btn btn-primary">Back to home</Link>
      </div>
    </section>
  );
}
