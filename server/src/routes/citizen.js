// Citizen-facing API: reporting, tracking, nearby, verification.
import { Router } from 'express';
import { getDb, nowIso } from '../db.js';
import { requireAuth, requireRole } from '../auth.js';
import { listCategories, recommendCategory } from '../services/classification.js';
import { previewMatch, submitReport, getReportForCitizen } from '../services/reports.js';
import {
  decorateIncident, HttpError, incidentHistory, incidentSummary, incidentSummarySql, OPEN_STATUSES, reportCode,
} from '../services/incidents.js';
import { boundingBox, distanceMeters } from '../services/geo.js';
import { reverseGeocode } from '../services/geocode.js';
import { proofDistance } from '../services/fieldwork.js';
import { recordResponse, sweepExpired, verificationState } from '../services/verification.js';
import { discardPhoto, h, intParam, photoUpload, savePhoto } from './util.js';

const r = Router();
const citizen = [requireAuth, requireRole('CITIZEN')];

r.get('/meta', requireAuth, h(async (req, res) => {
  const db = getDb();
  res.json({
    categories: await listCategories(),
    departments: await db.prepare('SELECT department_id, name, short_code FROM department ORDER BY name').all(),
    department_categories: await db.prepare('SELECT * FROM department_category').all(),
  });
}));

r.post('/reports/suggest', requireAuth, h(async (req, res) => res.json((await recommendCategory(req.body.description)).slice(0, 3))));
r.post('/reports/check', ...citizen, h(async (req, res) => res.json({ match: await previewMatch(req.body) })));

// Street address for a GPS fix, so citizens don't have to type one.
r.get('/geocode/reverse', requireAuth, h(async (req, res) => {
  res.json({ address: await reverseGeocode(Number(req.query.lat), Number(req.query.lng)) });
}));

// Anti-spam: a citizen can send up to REPORTS_PER_HOUR reports an hour.
const REPORTS_PER_HOUR = Number(process.env.REPORTS_PER_HOUR || 10);

r.post('/reports', ...citizen, photoUpload, h(async (req, res) => {
  const { n } = await getDb()
    .prepare('SELECT COUNT(*) n FROM report WHERE citizen_id = ? AND submitted_at > ?')
    .get(req.user.user_id, new Date(Date.now() - 3600000).toISOString());
  if (n >= REPORTS_PER_HOUR) throw new HttpError(429, `You've sent ${n} reports in the last hour. Please wait a little before sending more.`, 'RATE_LIMITED');
  const photoUrl = await savePhoto(req);
  try {
    // Reports queued offline carry the time they were written.
    const captured = Date.parse(req.body.captured_at);
    const at = Number.isFinite(captured) && captured < Date.now() && captured > Date.now() - 7 * 86400000
      ? new Date(captured).toISOString()
      : nowIso();
    const out = await submitReport(req.user.user_id, req.body, { photoUrl, requirePhoto: true, at });
    res.status(201).json(out);
  } catch (e) {
    await discardPhoto(photoUrl);
    throw e;
  }
}));

// Citizen home: how the city is doing, and what was fixed near them.
r.get('/citizen/overview', ...citizen, h(async (req, res) => {
  const db = getDb();
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const city = await db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM incident WHERE status = 'CLOSED' AND closed_at >= ?) fixed_30d,
         (SELECT COUNT(*) FROM incident WHERE status != 'CLOSED') open_now,
         (SELECT COUNT(*) FROM report WHERE submitted_at >= ?) reports_30d,
         (SELECT COUNT(*) FROM report WHERE submitted_at >= ? AND link_method IN ('AUTO','OFFICER','CITIZEN')) joined_30d,
         (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY julianday(closed_at) - julianday(opened_at))
            FROM incident WHERE status = 'CLOSED' AND closed_at >= ?) median_close_days`
    )
    .get(since, since, since, since);
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  let recentFixes = [];
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    const box = boundingBox({ lat, lng }, 3000);
    recentFixes = (await db
      .prepare(incidentSummarySql(`i.status = 'CLOSED' AND i.closed_at >= ? AND i.latitude BETWEEN ? AND ? AND i.longitude BETWEEN ? AND ?`) + ' ORDER BY i.closed_at DESC LIMIT 20')
      .all(since, box.minLat, box.maxLat, box.minLng, box.maxLng))
      .map(decorateIncident)
      .map((i) => ({
        incident_id: i.incident_id, code: i.code, title: i.title, category_name: i.category_name, address: i.address,
        closed_at: i.closed_at, opened_at: i.opened_at, report_count: i.report_count, closure_type: i.closure_type,
        distance_m: Math.round(distanceMeters({ lat, lng }, { lat: i.latitude, lng: i.longitude })),
      }))
      .filter((i) => i.distance_m <= 3000)
      .slice(0, 5);
  }
  res.json({
    city: {
      fixed_30d: city.fixed_30d, open_now: city.open_now, reports_30d: city.reports_30d, joined_30d: city.joined_30d,
      median_close_days: city.median_close_days == null ? null : Math.round(city.median_close_days * 10) / 10,
    },
    recent_fixes: recentFixes,
  });
}));

async function myReports(userId) {
  const rows = await getDb()
    .prepare(
      `SELECT r.report_id, r.description, r.photo_url, r.submitted_at, r.incident_id, r.link_method, r.address,
              c.name AS category_name, i.title AS incident_title, i.status AS incident_status, i.report_count,
              i.closed_at, i.closure_type, i.priority,
              (SELECT MIN(submitted_at) FROM report x WHERE x.incident_id = i.incident_id) AS first_report_at,
              (SELECT v.response IS NULL AND v.expires_at > ?
                 FROM verification_request v WHERE v.incident_id = i.incident_id AND v.citizen_id = r.citizen_id
                 ORDER BY v.round DESC LIMIT 1) AS awaiting_me
       FROM report r JOIN category c ON c.category_id = r.category_id
       LEFT JOIN incident i ON i.incident_id = r.incident_id
       WHERE r.citizen_id = ? ORDER BY r.submitted_at DESC`
    )
    .all(nowIso(), userId);
  return rows.map((x) => ({ ...x, code: reportCode(x.report_id), incident_code: x.incident_id ? `INC-${x.incident_id}` : null, awaiting_me: !!x.awaiting_me }));
}

r.get('/reports/mine', ...citizen, h(async (req, res) => {
  await sweepExpired();
  res.json(await myReports(req.user.user_id));
}));

r.get('/reports/:id', ...citizen, h(async (req, res) => {
  const rep = await getReportForCitizen(intParam(req.params.id));
  if (!rep || rep.citizen_id !== req.user.user_id) throw new HttpError(404, "We can't find that report.", 'NOT_FOUND');
  res.json(rep);
}));

// Open incidents near a point, for the Nearby map (citizens and staff).
r.get('/incidents/nearby', requireAuth, h(async (req, res) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  const radius = Math.min(5000, Number(req.query.radius) || 1000);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new HttpError(422, 'Location needed.');
  const box = boundingBox({ lat, lng }, radius);
  const found = await getDb()
    .prepare(
      incidentSummarySql(
        `i.status IN (${OPEN_STATUSES.map(() => '?').join(',')}) AND i.latitude BETWEEN ? AND ? AND i.longitude BETWEEN ? AND ?`
      )
    )
    .all(...OPEN_STATUSES, box.minLat, box.maxLat, box.minLng, box.maxLng);
  const rows = found
    .map(decorateIncident)
    .map((i) => ({ ...i, distance_m: Math.round(distanceMeters({ lat, lng }, { lat: i.latitude, lng: i.longitude })) }))
    .filter((i) => i.distance_m <= radius)
    .sort((a, b) => a.distance_m - b.distance_m);
  const mine = new Set(
    (await getDb().prepare('SELECT incident_id FROM report WHERE citizen_id = ?').all(req.user.user_id)).map((x) => x.incident_id)
  );
  res.json(rows.map((i) => ({
    incident_id: i.incident_id, code: i.code, title: i.title, status: i.status, category_name: i.category_name,
    category_id: i.category_id, report_count: i.report_count, latitude: i.latitude, longitude: i.longitude,
    distance_m: i.distance_m, priority: i.priority, address: i.address, mine: mine.has(i.incident_id),
  })));
}));

// Citizen view of an incident: public lifecycle plus their own reports.
export async function citizenIncidentView(incidentId, user) {
  const inc = await incidentSummary(incidentId);
  if (!inc) throw new HttpError(404, "We can't find that incident. It may have been merged into another one when duplicates were joined.", 'NOT_FOUND');
  const db = getDb();
  const reports = await db
    .prepare('SELECT report_id, citizen_id, photo_url, submitted_at, description, link_method FROM report WHERE incident_id = ? ORDER BY submitted_at')
    .all(incidentId);
  const myReports = reports.filter((x) => x.citizen_id === user.user_id).map((x) => ({ ...x, code: reportCode(x.report_id) }));
  const history = (await incidentHistory(incidentId)).map((e) => ({
    changed_at: e.changed_at, from_status: e.from_status, to_status: e.to_status, reason: e.reason,
    by_role: e.changed_by_role,
  }));
  const proof = inc.status === 'AWAITING_VERIFICATION' || inc.status === 'CLOSED' ? await proofDistance(incidentId) : null;
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
    verification: await verificationState(incidentId, user.user_id),
  };
}

r.get('/citizen/incidents/:id', ...citizen, h(async (req, res) => {
  await sweepExpired();
  res.json(await citizenIncidentView(intParam(req.params.id), req.user));
}));

r.post('/incidents/:id/verify', ...citizen, photoUpload, h(async (req, res) => {
  const id = intParam(req.params.id);
  const fixed = req.body.fixed === true || req.body.fixed === 'true';
  const photoUrl = await savePhoto(req);
  let out;
  try {
    out = await recordResponse(id, req.user.user_id, { fixed, feedback: req.body.feedback, photoUrl });
  } catch (e) {
    await discardPhoto(photoUrl);
    throw e;
  }
  res.json({ ...out, incident: await citizenIncidentView(id, req.user) });
}));

export default r;
