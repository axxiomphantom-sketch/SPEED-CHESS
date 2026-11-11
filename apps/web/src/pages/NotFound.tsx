import { Link } from 'react-router-dom';

export function NotFound() {
  return (
    <div className="page page-narrow text-center" style={{ paddingTop: 80 }}>
      <div className="eyebrow">404</div>
      <h1>That move is not legal.</h1>
      <p className="muted">The page you asked for does not exist. Try the dashboard, or start a game.</p>
      <div className="row center">
        <Link to="/dashboard" className="btn btn-primary">Back to dashboard</Link>
        <Link to="/play" className="btn btn-secondary">Play chess</Link>
      </div>
    </div>
  );
}
