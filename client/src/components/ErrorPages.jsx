import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { ROLE_HOME, ROLE_LABEL } from '../lib/format.js';
import { Brand, Icon } from './ui.jsx';

function Shell({ code, title, children, actions }) {
  return (
    <div className="error-page">
      <div className="inner">
        <Brand />
        {code && <span className="eyebrow">{code}</span>}
        <h1>{title}</h1>
        <div className="muted">{children}</div>
        <div className="row wrap">{actions}</div>
      </div>
    </div>
  );
}

export function NotFound() {
  const { user } = useAuth();
  const home = user ? ROLE_HOME[user.role] : '/';
  return (
    <Shell code="Error 404" title="We can't find that page"
      actions={<Link className="btn primary" to={home}>Back to home</Link>}>
      The link may be old, or the incident was merged into another one when duplicates were joined.
    </Shell>
  );
}

export function Forbidden() {
  const { user, signOut } = useAuth();
  return (
    <Shell code="Error 403" title="This page isn't part of your role"
      actions={<>
        <Link className="btn primary" to={ROLE_HOME[user?.role] || '/'}>Go to my workspace</Link>
        <button type="button" className="btn ghost" onClick={signOut}>Switch account</button>
      </>}>
      You're signed in as {ROLE_LABEL[user?.role] ? `a ${ROLE_LABEL[user.role].toLowerCase()}` : 'someone else'}. Ask your MSMO administrator if you need access.
    </Shell>
  );
}

export function SessionExpired() {
  const { state } = useLocation();
  const navigate = useNavigate();
  return (
    <Shell code="Signed out" title="Your session expired"
      actions={<button type="button" className="btn primary" onClick={() => navigate(state?.staff ? '/staff/login' : '/login')}>
        <Icon name="lock" size={18} /> Sign in again
      </button>}>
      For security, CivicPulse signs you out after a while. Sign in again to carry on.
    </Shell>
  );
}

// Inline full-page error for failed loads (404 / 500 from the API).
export function LoadError({ error, onRetry, home = '/' }) {
  if (error?.status === 404) {
    return (
      <div className="stack loose" style={{ paddingTop: 40 }}>
        <span className="eyebrow">Error 404</span>
        <h1>We can't find that incident</h1>
        <p className="muted">{error.message}</p>
        <Link className="btn primary block" to={home}>Back to home</Link>
      </div>
    );
  }
  if (error?.status === 403) return <Forbidden />;
  return (
    <div className="stack loose" style={{ paddingTop: 40 }}>
      <span className="eyebrow">{error?.status ? `Error ${error.status}` : 'Offline'}</span>
      <h1>That didn't go through</h1>
      <p className="muted">{error?.message || 'Our servers did not respond.'} {error?.reference && <span className="mono">Reference {error.reference}</span>}</p>
      {onRetry && <button type="button" className="btn primary block" onClick={onRetry}>Try again</button>}
      <Link className="btn ghost block" to={home}>Back to home</Link>
    </div>
  );
}
