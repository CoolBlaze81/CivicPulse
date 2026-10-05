import { Component } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { ROLE_HOME, ROLE_LABEL } from '../lib/format.js';
import { Brand, Icon } from './ui.jsx';
import { BlockedArt, ConeArt, LockArt, LostArt, OfflineArt } from './Illustrations.jsx';

function Shell({ code, title, children, actions, art }) {
  return (
    <div className="error-page">
      <div className="inner">
        <Brand />
        {art}
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
    <Shell code="Error 404" title="We can't find that page" art={<LostArt className="error-art" />}
      actions={<Link className="btn primary" to={home}>Back to home</Link>}>
      The link may be old, or the incident was merged into another one when duplicates were joined.
    </Shell>
  );
}

export function Forbidden() {
  const { user, signOut } = useAuth();
  return (
    <Shell code="Error 403" title="This page isn't part of your role" art={<BlockedArt className="error-art" />}
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
    <Shell code="Signed out" title="Your session expired" art={<LockArt className="error-art" />}
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
      <div className="stack loose load-error">
        <LostArt className="error-art" />
        <span className="eyebrow">Error 404</span>
        <h1>We can't find that incident</h1>
        <p className="muted">{error.message}</p>
        <Link className="btn primary block" to={home}>Back to home</Link>
      </div>
    );
  }
  if (error?.status === 403) return <Forbidden />;
  return (
    <div className="stack loose load-error">
      {error?.status ? <ConeArt className="error-art" /> : <OfflineArt className="error-art" />}
      <span className="eyebrow">{error?.status ? `Error ${error.status}` : 'Offline'}</span>
      <h1>That didn't go through</h1>
      <p className="muted">{error?.message || 'Our servers did not respond.'} {error?.reference && <span className="mono">Reference {error.reference}</span>}</p>
      {onRetry && <button type="button" className="btn primary block" onClick={onRetry}>Try again</button>}
      <Link className="btn ghost block" to={home}>Back to home</Link>
    </div>
  );
}

// Catches a crash while drawing a page, so people see a way out instead of a
// blank screen.
export class CrashGuard extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error) { console.error('CivicPulse page crashed', error); }
  componentDidUpdate(prev) { if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null }); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="error-page">
        <div className="inner">
          <Brand />
          <ConeArt className="error-art" />
          <span className="eyebrow">Something went wrong</span>
          <h1>This page hit a snag</h1>
          <div className="muted">Nothing you saved was lost. Reload the page, or go back to where you were.</div>
          <div className="row wrap">
            <button type="button" className="btn primary" onClick={() => window.location.reload()}>Reload</button>
            <button type="button" className="btn ghost" onClick={() => window.history.back()}>Go back</button>
          </div>
        </div>
      </div>
    );
  }
}
