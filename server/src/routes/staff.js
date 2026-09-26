// Staff API: incident triage, match review, assignment, officer verification.
import { Router } from 'express';
import { getDb, nowIso } from '../db.js';
import { requireAuth, requireRole } from '../auth.js';
import {
  decorateIncident, HttpError, incidentHistory, incidentReports, incidentSummary, incidentSummarySql,
  incidentWorkUpdates, unlinkReport,
} from '../services/incidents.js';
import { assign, assignmentHistory, classify, crewsForDepartment, suggestCrew } from '../services/assignment.js';
import { decide, pendingReviews } from '../services/matchReview.js';
import { canViewJob, proofDistance } from '../services/fieldwork.js';
import { officerQueue, officerVerify, sweepExpired, verificationState } from '../services/verification.js';
import { SLA_DAYS } from '../services/analytics.js';
import { h, intParam } from './util.js';

const r = Router();
const staff = [requireAuth, requireRole('OFFICER', 'DEPT_HEAD', 'ADMIN', 'FIELD_WORKER')];
const officer = [requireAuth, requireRole('OFFICER')];

async function canView(user, inc) {
  if (['OFFICER', 'ADMIN'].includes(user.role)) return true;
  if (user.role === 'DEPT_HEAD') return inc.department_id === user.department_id || inc.rec_department_id === user.department_id;
  if (user.role === 'FIELD_WORKER') return canViewJob(inc.incident_id, user);
  return false;
}

const TABS = {
  triage: `i.status IN ('REPORTED','LINKED') AND i.triaged = 0`,
  assigned: `(i.status = 'ASSIGNED' OR (i.status IN ('REPORTED','LINKED') AND i.triaged = 1))`,
  in_progress: `i.status = 'IN_PROGRESS'`,
  awaiting: `i.status = 'AWAITING_VERIFICATION'`,
  reopened: `i.status = 'REOPENED'`,
  closed: `i.status = 'CLOSED'`,
  open: `i.status != 'CLOSED'`,
  all: '1=1',
};

function scopeFor(user) {
  if (user.role === 'DEPT_HEAD') return { sql: '(i.department_id = ? OR (i.department_id IS NULL AND i.rec_department_id = ?))', args: [user.department_id, user.department_id] };
  return { sql: '1=1', args: [] };
}

r.get('/staff/incidents', ...staff, h(async (req, res) => {
  if (req.user.role === 'FIELD_WORKER') throw new HttpError(403, "This page isn't part of your role.", 'FORBIDDEN');
  await sweepExpired();
  const db = getDb();
  const scope = scopeFor(req.user);
  const tab = TABS[req.query.tab] ? req.query.tab : 'triage';
  const where = [TABS[tab], scope.sql];
  const args = [...scope.args];
  const q = String(req.query.q || '').trim();
  if (q) {
    const id = Number(q.replace(/^inc-?/i, ''));
    where.push(`(i.title ILIKE ? OR i.address ILIKE ? OR c.name ILIKE ? OR i.incident_id = ? OR ('w' || i.ward) = LOWER(REPLACE(?, ' ', '')) OR ('ward' || i.ward) = LOWER(REPLACE(?, ' ', '')))`);
    args.push(`%${q}%`, `%${q}%`, `%${q}%`, Number.isInteger(id) && id > 0 && id < 2147483647 ? id : -1, q, q);
  }
  if (req.query.ward) { where.push('i.ward = ?'); args.push(Number(req.query.ward)); }
  const order = tab === 'closed' ? 'i.closed_at DESC' : `i.priority, i.opened_at`;
  const rows = (await db.prepare(incidentSummarySql(where.join(' AND ')) + ` ORDER BY ${order} LIMIT 300`).all(...args)).map(decorateIncident);

  const counts = {};
  for (const [k, sql] of Object.entries(TABS)) {
    counts[k] = (await db.prepare(`SELECT COUNT(*) n FROM incident i WHERE ${sql} AND ${scope.sql}`).get(...scope.args)).n;
  }
  const now = Date.now();
  res.json({
    tab,
    counts,
    incidents: rows.map((i) => ({ ...i, overdue: i.status !== 'CLOSED' && now - Date.parse(i.opened_at) > SLA_DAYS[i.priority] * 86400000 })),
  });
}));

// Sidebar badges for the officer workspace.
r.get('/staff/counts', ...staff, h(async (req, res) => {
  await sweepExpired();
  const count = async (sql) => (await getDb().prepare(sql).get()).n;
  res.json({
    triage: await count(`SELECT COUNT(*) n FROM incident i WHERE ${TABS.triage}`),
    match_review: await count('SELECT COUNT(*) n FROM match_review WHERE decision IS NULL'),
    officer_verification: await count(`SELECT COUNT(*) n FROM incident WHERE status = 'AWAITING_VERIFICATION' AND needs_officer_verification = 1`),
    needs_crew: await count(`SELECT COUNT(*) n FROM incident i WHERE i.status IN ('REPORTED','LINKED','REOPENED') AND i.triaged = 1 AND NOT EXISTS (SELECT 1 FROM assignment a WHERE a.incident_id = i.incident_id AND a.is_current = 1 AND a.crew_id IS NOT NULL)`),
  });
}));

r.get('/staff/incidents/:id', ...staff, h(async (req, res) => {
  await sweepExpired();
  const id = intParam(req.params.id);
  const inc = await incidentSummary(id);
  if (!inc) throw new HttpError(404, "We can't find that incident. It may have been merged into another one.", 'NOT_FOUND');
  if (!(await canView(req.user, inc))) throw new HttpError(403, "This incident isn't part of your workspace.", 'FORBIDDEN');
  const deptId = inc.department_id || inc.rec_department_id;
  const since = inc.resolved_at;
  res.json({
    ...inc,
    reports: await incidentReports(id),
    history: await incidentHistory(id),
    assignments: await assignmentHistory(id),
    work_updates: await incidentWorkUpdates(id),
    proof: await proofDistance(id),
    verification: await verificationState(id),
    new_reports_since_resolution: since
      ? (await getDb().prepare('SELECT COUNT(*) n FROM report WHERE incident_id = ? AND submitted_at > ?').get(id, since)).n
      : 0,
    crews: deptId ? await crewsForDepartment(deptId) : [],
    suggested_crew: deptId ? await suggestCrew(deptId, inc.ward) : null,
  });
}));

r.get('/staff/departments/:id/crews', ...staff, h(async (req, res) => {
  const id = intParam(req.params.id);
  const ward = Number(req.query.ward) || null;
  res.json({ crews: await crewsForDepartment(id), suggested: ward ? await suggestCrew(id, ward) : null });
}));

r.post('/staff/incidents/:id/classify', ...officer, h(async (req, res) => {
  const id = intParam(req.params.id);
  await classify(id, { categoryId: req.body.category_id, priority: req.body.priority, title: req.body.title }, req.user.user_id);
  res.json(await incidentSummary(id));
}));

// Officers assign anywhere; department heads within their department.
r.post('/staff/incidents/:id/assign', requireAuth, requireRole('OFFICER', 'DEPT_HEAD'), h(async (req, res) => {
  const id = intParam(req.params.id);
  const at = nowIso();
  if (req.user.role === 'OFFICER' && (req.body.category_id || req.body.priority)) {
    await classify(id, { categoryId: req.body.category_id, priority: req.body.priority, title: req.body.title }, req.user.user_id, at);
  }
  await assign(id, { departmentId: req.body.department_id, crewId: req.body.crew_id }, req.user, at);
  res.json(await incidentSummary(id));
}));

r.post('/staff/reports/:id/unlink', ...officer, h(async (req, res) => {
  const inc = await unlinkReport(intParam(req.params.id), { by: req.user.user_id });
  res.json(decorateIncident(inc));
}));

r.get('/staff/match-reviews', ...officer, h(async (req, res) => res.json(await pendingReviews())));
r.post('/staff/match-reviews/:id', ...officer, h(async (req, res) => {
  res.json(await decide(intParam(req.params.id), { decision: req.body.decision, otherIncidentId: req.body.other_incident_id }, req.user.user_id));
}));

r.get('/staff/verification', ...officer, h(async (req, res) => res.json(await officerQueue())));
r.post('/staff/incidents/:id/officer-verify', ...officer, h(async (req, res) => {
  const id = intParam(req.params.id);
  await officerVerify(id, { close: !!req.body.close, reason: req.body.reason }, req.user.user_id);
  res.json(await incidentSummary(id));
}));

// Demo helper: end an incident's 72-hour window now so the outcome (or the
// officer queue) can be shown in a class demo. Disabled with DEMO_MODE=0.
r.post('/staff/incidents/:id/end-verification-window', ...officer, h(async (req, res) => {
  if (process.env.DEMO_MODE === '0') throw new HttpError(404, 'Not available.');
  const id = intParam(req.params.id);
  const at = nowIso();
  await getDb().prepare('UPDATE verification_request SET expires_at = ? WHERE incident_id = ? AND response IS NULL AND expires_at > ?').run(at, id, at);
  await sweepExpired(new Date(Date.now() + 1000).toISOString());
  res.json(await incidentSummary(id));
}));

export default r;
