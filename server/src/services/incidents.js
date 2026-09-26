// Incident lifecycle core: status changes with history (FR-37, FR-59),
// linking reports to incidents (FR-18, FR-20, FR-21) and read models.
import { getDb, nowIso } from '../db.js';
import { refreshRecommendations, PRIORITY_LABELS } from './classification.js';
import { notify, notifyCitizens } from './notifications.js';
import { wardFor } from './geo.js';

export const STATUS = {
  REPORTED: 'REPORTED',
  LINKED: 'LINKED',
  ASSIGNED: 'ASSIGNED',
  IN_PROGRESS: 'IN_PROGRESS',
  AWAITING_VERIFICATION: 'AWAITING_VERIFICATION',
  CLOSED: 'CLOSED',
  REOPENED: 'REOPENED',
};
export const OPEN_STATUSES = ['REPORTED', 'LINKED', 'ASSIGNED', 'IN_PROGRESS', 'AWAITING_VERIFICATION', 'REOPENED'];

export const incidentCode = (id) => `INC-${id}`;
export const reportCode = (id) => `RPT-${id}`;

export class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function getIncident(id) {
  return getDb().prepare('SELECT * FROM incident WHERE incident_id = ?').get(id);
}

export function requireIncident(id) {
  const inc = getIncident(id);
  if (!inc) throw new HttpError(404, `We can't find incident ${incidentCode(id)}.`, 'NOT_FOUND');
  return inc;
}

export function changeStatus(incidentId, toStatus, { by = null, reason = null, at = nowIso() } = {}) {
  const db = getDb();
  const inc = requireIncident(incidentId);
  if (inc.status === toStatus) return inc;
  db.prepare('UPDATE incident SET status = ? WHERE incident_id = ?').run(toStatus, incidentId);
  db.prepare(
    `INSERT INTO status_history (incident_id, from_status, to_status, changed_by, reason, changed_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(incidentId, inc.status, toStatus, by, reason, at);
  return { ...inc, status: toStatus };
}

// A history line that is not a status change (e.g. "report linked").
export function logEvent(incidentId, reason, { by = null, at = nowIso() } = {}) {
  const inc = getIncident(incidentId);
  getDb()
    .prepare(
      `INSERT INTO status_history (incident_id, from_status, to_status, changed_by, reason, changed_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(incidentId, inc.status, inc.status, by, reason, at);
}

function shortStreet(address) {
  const first = String(address || '').split(',')[0].trim();
  return first.replace(/^(no\.?\s*)?\d+[a-z]?\s+/i, '') || first;
}

export function createIncidentFromReport(report, { by = null, at = nowIso() } = {}) {
  const db = getDb();
  const cat = db.prepare('SELECT name, default_priority FROM category WHERE category_id = ?').get(report.category_id);
  const ward = wardFor({ lat: report.latitude, lng: report.longitude });
  const title = `${cat.name}, ${report.address ? shortStreet(report.address) : `Ward ${ward}`}`;
  const info = db
    .prepare(
      `INSERT INTO incident (category_id, title, description, priority, status, latitude, longitude, address, ward, report_count, opened_at)
       VALUES (?, ?, ?, ?, 'REPORTED', ?, ?, ?, ?, 0, ?)`
    )
    .run(
      report.category_id, title, report.description, cat.default_priority,
      report.latitude, report.longitude, report.address,
      ward, at
    );
  const incidentId = Number(info.lastInsertRowid);
  db.prepare(
    `INSERT INTO status_history (incident_id, from_status, to_status, changed_by, reason, changed_at)
     VALUES (?, NULL, 'REPORTED', ?, ?, ?)`
  ).run(incidentId, by, `Opened from ${reportCode(report.report_id)}`, at);
  attachReport(report.report_id, incidentId, { method: 'NEW', score: null, by, at, isNew: true });
  return getIncident(incidentId);
}

function recount(incidentId) {
  const db = getDb();
  const n = db.prepare('SELECT COUNT(*) n FROM report WHERE incident_id = ?').get(incidentId).n;
  db.prepare('UPDATE incident SET report_count = ? WHERE incident_id = ?').run(n, incidentId);
  return n;
}

// Associates a report with an incident and notifies the reporter.
export function attachReport(reportId, incidentId, { method, score = null, by = null, at = nowIso(), isNew = false }) {
  const db = getDb();
  const inc = requireIncident(incidentId);
  if (inc.status === 'CLOSED') throw new HttpError(409, `${incidentCode(incidentId)} is already closed.`, 'CLOSED');
  const report = db.prepare('SELECT * FROM report WHERE report_id = ?').get(reportId);
  db.prepare('UPDATE report SET incident_id = ?, link_method = ?, match_score = ?, linked_at = ? WHERE report_id = ?')
    .run(incidentId, method, score, at, reportId);
  const count = recount(incidentId);

  if (!isNew) {
    const how = { AUTO: 'automatically', OFFICER: 'by an officer', CITIZEN: 'by the reporter' }[method] || '';
    logEvent(incidentId, `${reportCode(reportId)} linked ${how}${score != null ? ` (${Math.round(score * 100)}% match)` : ''}`, { by, at });
    if (inc.status === 'REPORTED') changeStatus(incidentId, 'LINKED', { by, reason: 'Second report linked', at });
    notify(report.citizen_id, {
      type: 'REPORT_LINKED',
      incidentId,
      reportId,
      at,
      message: `Your report joined ${count - 1} other${count - 1 === 1 ? '' : 's'} about the same problem: ${inc.title}.`,
    });
  } else {
    notify(report.citizen_id, {
      type: 'REPORT_RECEIVED',
      incidentId,
      reportId,
      at,
      message: `We received your report ${reportCode(reportId)}. It opened a new incident, ${incidentCode(incidentId)}.`,
    });
  }
  refreshRecommendations(incidentId);
  return getIncident(incidentId);
}

// Officer correction (FR-21): take a report off its incident. It becomes a
// new incident of its own; an automatic link undone this way is counted.
export function unlinkReport(reportId, { by, at = nowIso() }) {
  const db = getDb();
  const report = db.prepare('SELECT * FROM report WHERE report_id = ?').get(reportId);
  if (!report?.incident_id) throw new HttpError(404, 'That report is not linked to an incident.');
  const inc = getIncident(report.incident_id);
  if (inc.report_count <= 1) throw new HttpError(409, 'This is the only report on the incident, so there is nothing to unlink it from.');
  if (report.link_method === 'AUTO') db.prepare('UPDATE report SET auto_link_overridden = 1 WHERE report_id = ?').run(reportId);
  // If the first report is unlinked the incident keeps the rest.
  db.prepare('UPDATE report SET incident_id = NULL WHERE report_id = ?').run(reportId);
  recount(inc.incident_id);
  logEvent(inc.incident_id, `${reportCode(reportId)} unlinked by an officer`, { by, at });
  refreshRecommendations(inc.incident_id);
  const fresh = db.prepare('SELECT * FROM report WHERE report_id = ?').get(reportId);
  return createIncidentFromReport(fresh, { by, at });
}

// ---- read models -------------------------------------------------------

export function incidentSummarySql(where = '1=1') {
  return `
    SELECT i.*, c.name AS category_name, d.name AS department_name,
      rc.name AS rec_category_name, rd.name AS rec_department_name,
      a.crew_id AS crew_id, cr.name AS crew_name,
      (SELECT MIN(submitted_at) FROM report r WHERE r.incident_id = i.incident_id) AS first_report_at
    FROM incident i
    JOIN category c ON c.category_id = i.category_id
    LEFT JOIN department d ON d.department_id = i.department_id
    LEFT JOIN category rc ON rc.category_id = i.rec_category_id
    LEFT JOIN department rd ON rd.department_id = i.rec_department_id
    LEFT JOIN assignment a ON a.incident_id = i.incident_id AND a.is_current = 1
    LEFT JOIN crew cr ON cr.crew_id = a.crew_id
    WHERE ${where}`;
}

export function decorateIncident(row) {
  if (!row) return row;
  return {
    ...row,
    code: incidentCode(row.incident_id),
    priority_label: PRIORITY_LABELS[row.priority],
    rec_reasons: row.rec_reasons ? JSON.parse(row.rec_reasons) : [],
    needs_triage: ['REPORTED', 'LINKED'].includes(row.status) && !row.triaged,
    needs_crew: !row.crew_id && ['REPORTED', 'LINKED', 'REOPENED'].includes(row.status) && !!row.triaged,
  };
}

export function incidentSummary(id) {
  return decorateIncident(getDb().prepare(incidentSummarySql('i.incident_id = ?')).get(id));
}

export function incidentHistory(id) {
  return getDb()
    .prepare(
      `SELECT h.*, u.name AS changed_by_name, u.role AS changed_by_role
       FROM status_history h LEFT JOIN user u ON u.user_id = h.changed_by
       WHERE h.incident_id = ? ORDER BY h.changed_at DESC, h.history_id DESC`
    )
    .all(id);
}

export function incidentReports(id) {
  return getDb()
    .prepare(
      `SELECT r.*, u.name AS citizen_name, c.name AS category_name FROM report r
       JOIN user u ON u.user_id = r.citizen_id JOIN category c ON c.category_id = r.category_id
       WHERE r.incident_id = ? ORDER BY r.submitted_at`
    )
    .all(id)
    .map((r) => ({ ...r, code: reportCode(r.report_id) }));
}

export function incidentWorkUpdates(id) {
  return getDb()
    .prepare(
      `SELECT w.*, u.name AS worker_name, cr.name AS crew_name FROM work_update w
       JOIN user u ON u.user_id = w.field_worker_id LEFT JOIN crew cr ON cr.crew_id = u.crew_id
       WHERE w.incident_id = ? ORDER BY w.created_at DESC, w.update_id DESC`
    )
    .all(id);
}

export { notifyCitizens };
