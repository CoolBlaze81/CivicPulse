// Report submission (SRS 4.2, Level 2 DFD process 1.0) and hand-off to the
// matching engine (process 2.0).
import { getDb, nowIso, tx } from '../db.js';
import { isValidCoord } from './geo.js';
import { evaluate } from './matching.js';
import { attachReport, createIncidentFromReport, HttpError, reportCode, incidentCode, requireIncident } from './incidents.js';
import { notify, notifyOfficers } from './notifications.js';

// FR-12, FR-15: validate before storing. Returns a list of problems.
export function validateReport(input) {
  const problems = [];
  const description = String(input.description || '').trim();
  if (description.length < 5) problems.push({ field: 'description', message: 'Describe the problem in a few words.' });
  if (description.length > 1000) problems.push({ field: 'description', message: 'Keep the description under 1000 characters.' });
  const lat = Number(input.latitude);
  const lng = Number(input.longitude);
  if (input.latitude == null || input.longitude == null || !isValidCoord(lat, lng)) {
    problems.push({ field: 'location', message: 'Add a location. Pick it on the map if GPS is off.' });
  }
  const cat = input.category_id && getDb().prepare('SELECT 1 FROM category WHERE category_id = ?').get(Number(input.category_id));
  if (!cat) problems.push({ field: 'category', message: 'Choose what kind of problem this is.' });
  return problems;
}

// Pre-submit check the citizen sees as "This looks already reported".
export function previewMatch(input) {
  const report = {
    description: String(input.description || ''),
    category_id: Number(input.category_id),
    latitude: Number(input.latitude),
    longitude: Number(input.longitude),
    submitted_at: nowIso(),
  };
  if (!isValidCoord(report.latitude, report.longitude) || !report.category_id) return null;
  const { best } = evaluate(report);
  if (!best || best.score < 0.6) return null;
  return {
    incident_id: best.incident.incident_id,
    code: incidentCode(best.incident.incident_id),
    title: best.incident.title,
    status: best.incident.status,
    report_count: best.incident.report_count,
    distance_m: best.signals.distance_m,
    score: best.score,
  };
}

// Stores a report and links it:
//  - join_incident_id: the citizen chose "Add my report to it" (or "I see it too")
//  - not_incident_id:  the citizen said "Different issue" for that candidate
// Otherwise the matching engine decides: >= 90% auto-link, 60-90% officer
// review (report waits unlinked), else a new incident.
export function submitReport(citizenId, input, { photoUrl = null, at = nowIso() } = {}) {
  const problems = validateReport(input);
  if (problems.length) {
    const err = new HttpError(422, `${problems.length} thing${problems.length > 1 ? 's' : ''} to fix before we can send this.`, 'VALIDATION');
    err.problems = problems;
    throw err;
  }
  return tx(() => {
    const db = getDb();
    const info = db
      .prepare(
        `INSERT INTO report (citizen_id, category_id, description, photo_url, latitude, longitude, address, submitted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        citizenId, Number(input.category_id), String(input.description).trim(), photoUrl,
        Number(input.latitude), Number(input.longitude), String(input.address || '').trim() || null, at
      );
    const reportId = Number(info.lastInsertRowid);
    const report = db.prepare('SELECT * FROM report WHERE report_id = ?').get(reportId);

    let outcome;
    if (input.join_incident_id) {
      const target = requireIncident(Number(input.join_incident_id));
      if (target.status === 'CLOSED') throw new HttpError(409, `${incidentCode(target.incident_id)} is already closed. Submit this as a new report.`);
      const { best } = evaluate(report, {});
      const score = best?.incident.incident_id === target.incident_id ? best.score : null;
      attachReport(reportId, target.incident_id, { method: 'CITIZEN', score, by: citizenId, at });
      outcome = { decision: 'LINKED', incident_id: target.incident_id };
    } else {
      const exclude = input.not_incident_id ? [Number(input.not_incident_id)] : [];
      const { decision, best } = evaluate(report, { excludeIds: exclude });
      if (decision === 'AUTO_LINK') {
        attachReport(reportId, best.incident.incident_id, { method: 'AUTO', score: best.score, at });
        outcome = { decision: 'LINKED', incident_id: best.incident.incident_id, score: best.score };
      } else if (decision === 'REVIEW') {
        db.prepare(
          `INSERT INTO match_review (report_id, candidate_incident_id, score, signals, created_at) VALUES (?, ?, ?, ?, ?)`
        ).run(reportId, best.incident.incident_id, best.score, JSON.stringify(best.signals), at);
        notify(citizenId, {
          type: 'REPORT_RECEIVED', reportId, at,
          message: `We received your report ${reportCode(reportId)}. An officer is checking whether it matches an existing incident.`,
        });
        notifyOfficers(best.incident.incident_id, {
          type: 'MATCH_REVIEW', at,
          message: `${reportCode(reportId)} may match ${incidentCode(best.incident.incident_id)} (${Math.round(best.score * 100)}%). Needs match review.`,
        });
        outcome = { decision: 'REVIEW', candidate_incident_id: best.incident.incident_id, score: best.score };
      } else {
        const inc = createIncidentFromReport(report, { by: citizenId, at });
        notifyOfficers(inc.incident_id, {
          type: 'NEW_INCIDENT', at,
          message: `New incident ${incidentCode(inc.incident_id)}: ${inc.title}. Needs triage.`,
        });
        outcome = { decision: 'NEW', incident_id: inc.incident_id };
      }
    }
    return { report_id: reportId, code: reportCode(reportId), ...outcome, report: getReportForCitizen(reportId) };
  });
}

export function getReportForCitizen(reportId) {
  const r = getDb()
    .prepare(
      `SELECT r.*, c.name AS category_name, i.title AS incident_title, i.status AS incident_status,
              i.report_count, i.priority
       FROM report r JOIN category c ON c.category_id = r.category_id
       LEFT JOIN incident i ON i.incident_id = r.incident_id WHERE r.report_id = ?`
    )
    .get(reportId);
  return r && { ...r, code: reportCode(r.report_id), incident_code: r.incident_id ? incidentCode(r.incident_id) : null };
}
