export const STATUS_LABEL = {
  REPORTED: 'Reported',
  LINKED: 'Linked',
  ASSIGNED: 'Assigned',
  IN_PROGRESS: 'In progress',
  AWAITING_VERIFICATION: 'Awaiting verification',
  CLOSED: 'Closed',
  REOPENED: 'Reopened',
};
export const PRIORITY_LABEL = { P1: 'Critical', P2: 'High', P3: 'Medium', P4: 'Low' };
export const PRIORITY_HINT = {
  P1: 'Safety risk — same-day response',
  P2: 'Wide impact or many reports',
  P3: 'Scheduled within the week',
  P4: 'Routine maintenance',
};
export const STAGE_LABEL = { EN_ROUTE: 'En route', ON_SITE: 'On site', WORKING: 'Working', RESOLVED: 'Resolved' };
export const ROLE_LABEL = {
  CITIZEN: 'Citizen', OFFICER: 'Officer', DEPT_HEAD: 'Department head', FIELD_WORKER: 'Field worker', ADMIN: 'Municipal admin',
};
export const ROLE_HOME = { CITIZEN: '/', OFFICER: '/officer', DEPT_HEAD: '/dept', FIELD_WORKER: '/field', ADMIN: '/admin' };

export function statusLabel(inc) {
  if (!inc) return '';
  if (inc.status === 'CLOSED' && inc.closure_type === 'OFFICER') return 'Closed · officer-verified';
  return STATUS_LABEL[inc.status] || inc.status;
}

export function timeAgo(iso, now = Date.now()) {
  if (!iso) return '';
  const s = Math.max(0, (now - Date.parse(iso)) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} m`;
  if (s < 86400) return `${Math.floor(s / 3600)} h`;
  if (s < 86400 * 14) return `${Math.floor(s / 86400)} d`;
  if (s < 86400 * 60) return `${Math.floor(s / (86400 * 7))} wk`;
  return `${Math.floor(s / (86400 * 30))} mo`;
}
export const ago = (iso) => (timeAgo(iso) === 'just now' ? 'just now' : `${timeAgo(iso)} ago`);

export function timeLeft(iso, now = Date.now()) {
  const s = (Date.parse(iso) - now) / 1000;
  if (s <= 0) return 'window closed';
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d) return `${d} d ${h} h left`;
  if (h) return `${h} h ${m} m left`;
  return `${m} m left`;
}

const sameDay = (a, b) => a.toDateString() === b.toDateString();
export function when(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (sameDay(d, now)) return `Today, ${time}`;
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (sameDay(d, y)) return `Yesterday, ${time}`;
  return `${d.toLocaleDateString([], { day: 'numeric', month: 'short' })}, ${time}`;
}
export const dayMonth = (iso) => (iso ? new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short' }) : '');

export function durationDays(fromIso, toIso) {
  const d = (Date.parse(toIso) - Date.parse(fromIso)) / 86400000;
  if (d < 1) return `${Math.max(1, Math.round(d * 24))} h`;
  return `${Math.round(d * 10) / 10} days`;
}

export function meters(m) {
  if (m == null) return '';
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
}

export function initials(name = '') {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

export const pct = (n) => (n == null ? '—' : `${Math.round(n * 100)}%`);
