// Citizen-facing API: reporting, tracking, nearby, verification.
import { Router } from 'express';
import { getDb } from '../db.js';
import { requireAuth, requireRole } from '../auth.js';
import { listCategories, recommendCategory } from '../services/classification.js';
import { previewMatch, submitReport, getReportForCitizen } from '../services/reports.js';
import {
  decorateIncident, HttpError, incidentHistory, incidentSummary, incidentSummarySql, OPEN_STATUSES, reportCode,
} from '../services/incidents.js';
import { boundingBox, distanceMeters } from '../services/geo.js';
import { proofDistance } from '../services/fieldwork.js';
import { recordResponse, sweepExpired, verificationState } from '../services/verification.js';
import { h, intParam, photoUpload, photoUrlOf } from './util.js';

const r = Router();
const citizen = [requireAuth, requireRole('CITIZEN')];

r.get('/meta', requireAuth, h((req, res) => {
  const db = getDb();
  res.json({
    categories: listCategories(),
    departments: db.prepare('SELECT department_id, name, short_code FROM department ORDER BY name').all(),
    department_categories: db.prepare('SELECT * FROM department_category').all(),
  });
}));

r.post('/reports/suggest', requireAuth, h((req, res) => res.json(recommendCategory(req.body.description).slice(0, 3))));
r.post('/reports/check', ...citizen, h((req, res) => res.json({ match: previewMatch(req.body) })));

r.post('/reports', ...citizen, photoUpload, h((req, res) => {
  const out = submitReport(req.user.user_id, req.body, { photoUrl: photoUrlOf(req) });
  res.status(201).json(out);
}));

function myReports(userId) {
  return getDb()
    .prepare(
      `SELECT r.report_id, r.description, r.photo_url, r.submitted_at, r.incident_id, r.link_method, r.address,
              c.name AS category_name, i.title AS incident_title, i.status AS incident_status, i.report_count,
              i.closed_at, i.closure_type, i.priority,
              (SELECT MIN(submitted_at) FROM report x WHERE x.incident_id = i.incident_id) AS first_report_at,
              (SELECT v.response IS NULL AND v.expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now')
                 FROM verification_request v WHERE v.incident_id = i.incident_id AND v.citizen_id = r.citizen_id
                 ORDER BY v.round DESC LIMIT 1) AS awaiting_me
       FROM report r JOIN category c ON c.category_id = r.category_id
       LEFT JOIN incident i ON i.incident_id = r.incident_id
       WHERE r.citizen_id = ? ORDER BY r.submitted_at DESC`
    )
    .all(userId)
    .map((x) => ({ ...x, code: reportCode(x.report_id), incident_code: x.incident_id ? `INC-${x.incident_id}` : null, awaiting_me: !!x.awaiting_me }));
}

r.get('/reports/mine', ...citizen, h((req, res) => {
  sweepExpired();
  res.json(myReports(req.user.user_id));
}));

r.get('/reports/:id', ...citizen, h((req, res) => {
  const rep = getReportForCitizen(intParam(req.params.id));
  if (!rep || rep.citizen_id !== req.user.user_id) throw new HttpError(404, "We can't find that report.", 'NOT_FOUND');
  res.json(rep);
}));

// Open incidents near a point, for the Nearby map (citizens and staff).
r.get('/incidents/nearby', requireAuth, h((req, res) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  const radius = Math.min(5000, Number(req.query.radius) || 1000);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new HttpError(422, 'Location needed.');
  const box = boundingBox({ lat, lng }, radius);
  const rows = getDb()
    .prepare(
      incidentSummarySql(
        `i.status IN (${OPEN_STATUSES.map(() => '?').join(',')}) AND i.latitude BETWEEN ? AND ? AND i.longitude BETWEEN ? AND ?`
      )
    )
    .all(...OPEN_STATUSES, box.minLat, box.maxLat, box.minLng, box.maxLng)
    .map(decorateIncident)
    .map((i) => ({ ...i, distance_m: Math.round(distanceMeters({ lat, lng }, { lat: i.latitude, lng: i.longitude })) }))
    .filter((i) => i.distance_m <= radius)
    .sort((a, b) => a.distance_m - b.distance_m);
  const mine = new Set(
    getDb().prepare('SELECT incident_id FROM report WHERE citizen_id = ?').all(req.user.user_id).map((x) => x.incident_id)
  );
  res.json(rows.map((i) => ({
    incident_id: i.incident_id, code: i.code, title: i.title, status: i.status, category_name: i.category_name,
    category_id: i.category_id, report_count: i.report_count, latitude: i.latitude, longitude: i.longitude,
    distance_m: i.distance_m, priority: i.priority, address: i.address, mine: mine.has(i.incident_id),
  })));
}));

// Citizen view of an incident: public lifecycle plus their own reports.
export function citizenIncidentView(incidentId, user) {
  const inc = incidentSummary(incidentId);
  if (!inc) throw new HttpError(404, "We can't find that incident. It may have been merged into another one when duplicates were joined.", 'NOT_FOUND');
  const db = getDb();
  const reports = db
    .prepare('SELECT report_id, citizen_id, photo_url, submitted_at, description, link_method FROM report WHERE incident_id = ? ORDER BY submitted_at')
    .all(incidentId);
  const myReports = reports.filter((x) => x.citizen_id === user.user_id).map((x) => ({ ...x, code: reportCode(x.report_id) }));
  const history = incidentHistory(incidentId).map((e) => ({
    changed_at: e.changed_at, from_status: e.from_status, to_status: e.to_status, reason: e.reason,
    by_role: e.changed_by_role,
  }));
  const proof = inc.status === 'AWAITING_VERIFICATION' || inc.status === 'CLOSED' ? proofDistance(incidentId) : null;
  return {
    incident_id: inc.incident_id, code: inc.code, title: inc.title, status: inc.status, priority: inc.priority,
    priority_label: inc.priority_label, category_name: inc.category_name, department_name: inc.department_name,
    crew_name: inc.crew_name, work_stage: inc.work_stage, address: inc.address, latitude: inc.latitude, longitude: inc.longitude,
    report_count: inc.report_count, opened_at: inc.opened_at, resolved_at: inc.resolved_at, closed_at: inc.closed_at,
    closure_type: inc.closure_type, needs_officer_verification: !!inc.needs_officer_verification,
    my_reports: myReports,
    first_photo: myReports.find((x) => x.photo_url)?.photo_url || reports.find((x) => x.photo_url)?.photo_url || null,
    history,
    proof: proof && { note: proof.note, photo_url: proof.photo_url, created_at: proof.created_at, distance_m: proof.distance_m, crew_name: inc.crew_name },
    verification: verificationState(incidentId, user.user_id),
  };
}

r.get('/citizen/incidents/:id', ...citizen, h((req, res) => {
  sweepExpired();
  res.json(citizenIncidentView(intParam(req.params.id), req.user));
}));

r.post('/incidents/:id/verify', ...citizen, photoUpload, h((req, res) => {
  const id = intParam(req.params.id);
  const fixed = req.body.fixed === true || req.body.fixed === 'true';
  const out = recordResponse(id, req.user.user_id, { fixed, feedback: req.body.feedback, photoUrl: photoUrlOf(req) });
  res.json({ ...out, incident: citizenIncidentView(id, req.user) });
}));

export default r;
