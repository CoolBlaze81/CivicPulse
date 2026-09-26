import { Link } from 'react-router-dom';
import { PRIORITY_LABEL, statusLabel } from '../lib/format.js';

// ---- icons (1.8px stroke, 24 grid) ----
const paths = {
  back: 'M15 5l-7 7 7 7',
  camera: 'M4 8h3l2-3h6l2 3h3v11H4z M12 17a4 4 0 100-8 4 4 0 000 8z',
  image: 'M4 5h16v14H4z M4 16l5-5 4 4 3-3 4 4 M15 9.5a1.5 1.5 0 100-.01',
  pin: 'M12 21s-7-6.2-7-11.5A7 7 0 0119 9.5C19 14.8 12 21 12 21z M12 12a2.5 2.5 0 100-5 2.5 2.5 0 000 5z',
  link: 'M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1 M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1',
  sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z',
  home: 'M4 11l8-7 8 7v9h-5v-6H9v6H4z',
  map: 'M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2z M9 4v14 M15 6v14',
  list: 'M8 6h12 M8 12h12 M8 18h12 M4 6h.01 M4 12h.01 M4 18h.01',
  user: 'M12 12a4 4 0 100-8 4 4 0 000 8z M4 21a8 8 0 0116 0',
  bell: 'M6 17V11a6 6 0 1112 0v6l2 2H4z M10 21h4',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  x: 'M6 6l12 12 M18 6L6 18',
  search: 'M11 18a7 7 0 100-14 7 7 0 000 14z M20 20l-4-4',
  route: 'M6 19a2 2 0 100-4 2 2 0 000 4z M18 9a2 2 0 100-4 2 2 0 000 4z M8 17h7a3 3 0 000-6H9a3 3 0 010-6h7',
  alert: 'M12 4l9 16H3z M12 10v4 M12 17h.01',
  wifi: 'M2 8.5a15 15 0 0120 0 M5.5 12a10 10 0 0113 0 M9 15.5a5 5 0 016 0 M12 19h.01 M3 3l18 18',
  refresh: 'M20 11a8 8 0 10-2.3 5.7 M20 5v6h-6',
  lock: 'M6 11h12v9H6z M8 11V8a4 4 0 118 0v3',
  plus: 'M12 5v14 M5 12h14',
  edit: 'M4 20h4L19 9l-4-4L4 16z',
  chevron: 'M9 6l6 6-6 6',
};
export function Icon({ name, size = 20, stroke = 1.8, ...rest }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      <path d={paths[name]} />
    </svg>
  );
}

export function PulseMark({ size = 20, color = '#F0642E' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <path d="M8 34h13l5-12 8 22 6-15 3 5h13" fill="none" stroke={color} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
export function Brand({ to = '/', light }) {
  return (
    <Link to={to} className="brand" style={light ? { color: '#fff' } : undefined}>
      <span className="mark"><PulseMark /></span>CivicPulse
    </Link>
  );
}

// Colour always ships with a label (design p.1).
export function StatusPill({ incident, status, label, awaitingYou }) {
  if (awaitingYou) return <span className="pill AWAITING_YOU">Awaiting you</span>;
  const s = status || incident?.status;
  if (incident?.needs_triage && !status) return <span className="pill TRIAGE">Needs triage</span>;
  return <span className={`pill ${s}`}>{label || statusLabel(incident || { status: s })}</span>;
}

export function Priority({ p, showLabel = true, code = false }) {
  if (!p) return null;
  return (
    <span className="prio">
      <span className={`bars ${p}`}><i /><i /><i /><i /></span>
      {code && <span>{p}</span>}
      {showLabel && <span className={`prio-text ${p}`}>{PRIORITY_LABEL[p]}</span>}
    </span>
  );
}

export function Photo({ src, style, className = '', children, alt = '' }) {
  return (
    <div className={`photo ${className}`} style={style}>
      {src ? <img src={src} alt={alt} /> : null}
      {children}
    </div>
  );
}

export function Spinner() {
  return <div className="loading"><div className="spinner" /></div>;
}

export function EmptyState({ title, children, action }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {children && <p className="muted">{children}</p>}
      {action}
    </div>
  );
}

export function ErrorNote({ error, onRetry }) {
  if (!error) return null;
  return (
    <div className="banner error row between">
      <span>{error.message}{error.reference ? ` (reference ${error.reference})` : ''}</span>
      {onRetry && <button type="button" className="link-btn" onClick={onRetry}>Try again</button>}
    </div>
  );
}

export function Toast({ msg }) {
  return msg ? <div className="toast" role="status">{msg}</div> : null;
}

export function Meter({ load, max }) {
  return (
    <span className={`meter ${load >= max ? 'full' : ''}`} title={`${load} of ${max} jobs`}>
      {Array.from({ length: max }, (_, i) => <i key={i} className={i < load ? 'on' : ''} />)}
    </span>
  );
}
