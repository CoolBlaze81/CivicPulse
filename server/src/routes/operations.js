// Department, field worker, analytics, admin and notification endpoints.
import { Router } from 'express';
import { getDb, nowIso } from '../db.js';
import { hashPassword, publicUser, requireAuth, requireRole, ROLES } from '../auth.js';
import { decorateIncident, HttpError, incidentSummary, incidentSummarySql } from '../services/incidents.js';
import { crewsForDepartment, suggestCrew } from '../services/assignment.js';
import { doneToday, jobsForCrew, updateProgress } from '../services/fieldwork.js';
import { kpis, departmentWorkload } from '../services/analytics.js';
import { listFor, markRead, unreadCount } from '../services/notifications.js';
import { distanceMeters } from '../services/geo.js';
import { sweepExpired } from '../services/verification.js';
import { h, intParam, photoUpload, photoUrlOf } from './util.js';

const r = Router();

// ---- notifications (all roles) ------------------------------------------
r.get('/notifications', requireAuth, h((req, res) => {
  res.json({ unread: unreadCount(req.user.user_id), items: listFor(req.user.user_id) });
}));
r.post('/notifications/read', requireAuth, h((req, res) => {
  markRead(req.user.user_id, req.body.id ? Number(req.body.id) : null);
  res.json({ unread: unreadCount(req.user.user_id) });
}));

// ---- department head -----------------------------------------------------
const head = [requireAuth, requireRole('DEPT_HEAD')];

r.get('/department/board', ...head, h((req, res) => {
  sweepExpired();
  const db = getDb();
  const deptId = req.user.department_id;
  const rows = db
    .prepare(incidentSummarySql(`(i.department_id = ? OR (i.department_id IS NULL AND i.rec_department_id = ?)) AND i.status != 'CLOSED'`) + ' ORDER BY i.priority, i.opened_at')
    .all(deptId, deptId)
    .map(decorateIncident);
  const columns = {
    needs_crew: rows
      .filter((i) => !i.crew_id && i.status !== 'AWAITING_VERIFICATION')
      .map((i) => ({ ...i, suggested_crew: suggestCrew(deptId, i.ward)?.name || null })),
    assigned: rows.filter((i) => i.crew_id && i.status === 'ASSIGNED'),
    in_progress: rows.filter((i) => i.status === 'IN_PROGRESS'),
    awaiting: rows.filter((i) => i.status === 'AWAITING_VERIFICATION'),
  };
  const workload = departmentWorkload({ days: 30 }).find((d) => d.department_id === deptId);
  const avg = db
    .prepare(`SELECT AVG(julianday(closed_at) - julianday(opened_at)) d FROM incident WHERE department_id = ? AND status = 'CLOSED' AND closed_at >= ?`)
    .get(deptId, new Date(Date.now() - 30 * 86400000).toISOString()).d;
  res.json({
    department: db.prepare('SELECT * FROM department WHERE department_id = ?').get(deptId),
    summary: {
      open: rows.length,
      critical: rows.filter((i) => i.priority === 'P1').length,
      reopened: rows.filter((i) => i.status === 'REOPENED').length,
      avg_resolve_days: avg == null ? null : Math.round(avg * 10) / 10,
      overdue: workload?.overdue || 0,
    },
    columns,
    crews: crewsForDepartment(deptId),
  });
}));

r.get('/department/resources', ...head, h((req, res) => {
  const db = getDb();
  const deptId = req.user.department_id;
  res.json({
    crews: crewsForDepartment(deptId),
    equipment: db.prepare('SELECT * FROM equipment WHERE department_id = ? ORDER BY name').all(deptId),
    categories: db.prepare('SELECT category_id FROM department_category WHERE department_id = ?').all(deptId).map((x) => x.category_id),
    all_categories: db
      .prepare(
        `SELECT c.*, d.name AS handled_by FROM category c
         LEFT JOIN department_category dc ON dc.category_id = c.category_id LEFT JOIN department d ON d.department_id = dc.department_id
         ORDER BY c.name`
      )
      .all(),
  });
}));

function ownCrew(req) {
  const crew = getDb().prepare('SELECT * FROM crew WHERE crew_id = ?').get(intParam(req.params.id));
  if (!crew || crew.department_id !== req.user.department_id) throw new HttpError(404, "That crew isn't in your department.");
  return crew;
}

function crewFields(body, fallback = {}) {
  const availability = body.availability ?? fallback.availability ?? 'ON_DUTY';
  if (!['ON_DUTY', 'OFF_SHIFT', 'ON_LEAVE'].includes(availability)) throw new HttpError(422, 'Unknown availability.');
  const zone = String(body.zone ?? fallback.zone ?? '').split(',').map((w) => Number(String(w).trim())).filter((w) => w >= 1 && w <= 12);
  if (!zone.length) throw new HttpError(422, 'Give the wards this crew covers, e.g. 7,8.');
  const members = Number(body.members ?? fallback.members ?? 3);
  const maxLoad = Number(body.max_load ?? fallback.max_load ?? 5);
  if (!(members >= 1 && members <= 50) || !(maxLoad >= 1 && maxLoad <= 20)) throw new HttpError(422, 'Members and max jobs must be sensible numbers.');
  return { availability, zone: zone.join(','), members, max_load: maxLoad, skills: String(body.skills ?? fallback.skills ?? '').trim() };
}

r.patch('/department/crews/:id', ...head, h((req, res) => {
  const crew = ownCrew(req);
  const f = crewFields(req.body, crew);
  getDb().prepare('UPDATE crew SET availability = ?, zone = ?, members = ?, max_load = ?, skills = ? WHERE crew_id = ?')
    .run(f.availability, f.zone, f.members, f.max_load, f.skills, crew.crew_id);
  res.json(crewsForDepartment(req.user.department_id));
}));

r.post('/department/crews', ...head, h((req, res) => {
  const name = String(req.body.name || '').trim();
  if (!name) throw new HttpError(422, 'Give the crew a name, e.g. Crew R-9.');
  const f = crewFields(req.body);
  try {
    getDb().prepare('INSERT INTO crew (department_id, name, members, zone, skills, availability, max_load) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(req.user.department_id, name, f.members, f.zone, f.skills, f.availability, f.max_load);
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) throw new HttpError(409, 'A crew with that name already exists.');
    throw e;
  }
  res.status(201).json(crewsForDepartment(req.user.department_id));
}));

r.patch('/department/equipment/:id', ...head, h((req, res) => {
  const db = getDb();
  const eq = db.prepare('SELECT * FROM equipment WHERE equipment_id = ?').get(intParam(req.params.id));
  if (!eq || eq.department_id !== req.user.department_id) throw new HttpError(404, "That equipment isn't in your department.");
  const total = Number(req.body.total_units ?? eq.total_units);
  const available = Number(req.body.available_units ?? eq.available_units);
  if (!(total >= 0) || !(available >= 0) || available > total) throw new HttpError(422, 'Available units must be between 0 and the total.');
  db.prepare('UPDATE equipment SET total_units = ?, available_units = ? WHERE equipment_id = ?').run(total, available, eq.equipment_id);
  res.json(db.prepare('SELECT * FROM equipment WHERE department_id = ? ORDER BY name').all(req.user.department_id));
}));

// Categories this department handles; drives the department recommendation.
// A category belongs to one department, so claiming it moves it here.
r.put('/department/categories', ...head, h((req, res) => {
  const db = getDb();
  const ids = (req.body.category_ids || []).map(Number).filter(Boolean);
  const deptId = req.user.department_id;
  db.transaction(() => {
    const current = db.prepare('SELECT category_id FROM department_category WHERE department_id = ?').all(deptId).map((x) => x.category_id);
    const removed = current.filter((c) => !ids.includes(c));
    const orphaned = removed.filter((c) => db.prepare('SELECT COUNT(*) n FROM department_category WHERE category_id = ?').get(c).n <= 1);
    if (orphaned.length) throw new HttpError(409, 'Every category needs a department. Another department has to claim it before you drop it.');
    db.prepare('DELETE FROM department_category WHERE department_id = ?').run(deptId);
    for (const c of ids) {
      db.prepare('DELETE FROM department_category WHERE category_id = ?').run(c);
      db.prepare('INSERT INTO department_category (department_id, category_id) VALUES (?, ?)').run(deptId, c);
    }
  })();
  res.json({ categories: ids });
}));

// ---- field worker ---------------------------------------------------------
const worker = [requireAuth, requireRole('FIELD_WORKER')];

r.get('/field/jobs', ...worker, h((req, res) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  const here = Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  const jobs = jobsForCrew(req.user.crew_id).map((j) => ({
    ...j,
    distance_m: here ? Math.round(distanceMeters(here, { lat: j.latitude, lng: j.longitude })) : null,
  }));
  const reopened = getDb()
    .prepare(incidentSummarySql(`i.status = 'REOPENED' AND EXISTS (SELECT 1 FROM assignment x WHERE x.incident_id = i.incident_id AND x.crew_id = ?)`))
    .all(req.user.crew_id)
    .map(decorateIncident);
  res.json({
    jobs,
    reopened,
    counts: {
      assigned: jobs.filter((j) => j.status === 'ASSIGNED').length,
      in_progress: jobs.filter((j) => j.status === 'IN_PROGRESS').length,
      done_today: doneToday(req.user.crew_id),
    },
  });
}));

r.post('/field/incidents/:id/progress', ...worker, photoUpload, h((req, res) => {
  const id = intParam(req.params.id);
  updateProgress(id, req.user, {
    stage: req.body.stage, note: req.body.note, photoUrl: photoUrlOf(req), latitude: req.body.latitude, longitude: req.body.longitude,
  });
  const next = jobsForCrew(req.user.crew_id)[0];
  res.json({ incident: incidentSummary(id), next_job: next ? { incident_id: next.incident_id, code: next.code, title: next.title } : null });
}));

// ---- analytics (FR-56: officers, dept heads for their dept, admins) -------
r.get('/analytics', requireAuth, requireRole('OFFICER', 'DEPT_HEAD', 'ADMIN'), h((req, res) => {
  sweepExpired();
  const days = [7, 30, 90].includes(Number(req.query.days)) ? Number(req.query.days) : 30;
  const departmentId = req.user.role === 'DEPT_HEAD' ? req.user.department_id : Number(req.query.department_id) || null;
  res.json(kpis({ days, ward: Number(req.query.ward) || null, departmentId }));
}));

// ---- municipal admin -----------------------------------------------------
const admin = [requireAuth, requireRole('ADMIN')];

r.get('/admin/users', ...admin, h((req, res) => {
  res.json(
    getDb()
      .prepare(
        `SELECT u.*, d.name AS department_name, c.name AS crew_name FROM user u
         LEFT JOIN department d ON d.department_id = COALESCE(u.department_id, (SELECT department_id FROM crew WHERE crew_id = u.crew_id))
         LEFT JOIN crew c ON c.crew_id = u.crew_id
         WHERE u.role != 'CITIZEN' AND u.deleted = 0 ORDER BY u.role, u.name`
      )
      .all()
      .map(publicUser)
      .concat([{ role: 'CITIZEN', count: getDb().prepare("SELECT COUNT(*) n FROM user WHERE role = 'CITIZEN' AND deleted = 0").get().n }])
  );
}));

r.post('/admin/users', ...admin, h((req, res) => {
  const db = getDb();
  const { name, staff_id, role, password, department_id, crew_id, wards } = req.body;
  if (!ROLES.includes(role) || role === 'CITIZEN') throw new HttpError(422, 'Choose a staff role.');
  if (!String(name || '').trim() || !String(staff_id || '').trim()) throw new HttpError(422, 'Name and staff ID are required.');
  if (String(password || '').length < 8) throw new HttpError(422, 'Passwords need at least 8 characters.');
  if (role === 'DEPT_HEAD' && !department_id) throw new HttpError(422, 'Department heads need a department.');
  if (role === 'FIELD_WORKER' && !crew_id) throw new HttpError(422, 'Field workers need a crew.');
  try {
    const info = db
      .prepare('INSERT INTO user (name, staff_id, password_hash, role, department_id, crew_id, wards, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(String(name).trim(), String(staff_id).trim().toUpperCase(), hashPassword(password), role,
        role === 'DEPT_HEAD' ? Number(department_id) : null, role === 'FIELD_WORKER' ? Number(crew_id) : null,
        role === 'OFFICER' ? String(wards || '') : null, nowIso());
    if (role === 'DEPT_HEAD') db.prepare('UPDATE department SET head_user_id = ? WHERE department_id = ?').run(info.lastInsertRowid, Number(department_id));
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) throw new HttpError(409, 'That staff ID is already taken.');
    throw e;
  }
  res.status(201).json({ ok: true });
}));

r.post('/admin/users/:id/unlock', ...admin, h((req, res) => {
  getDb().prepare('UPDATE user SET failed_logins = 0, locked_until = NULL WHERE user_id = ?').run(intParam(req.params.id));
  res.json({ ok: true });
}));

r.get('/admin/departments', ...admin, h((req, res) => {
  const db = getDb();
  const workload = departmentWorkload({ days: 30 });
  res.json(
    db.prepare('SELECT d.*, u.name AS head_name FROM department d LEFT JOIN user u ON u.user_id = d.head_user_id ORDER BY d.name').all().map((d) => ({
      ...d,
      workload: workload.find((w) => w.department_id === d.department_id),
      categories: db.prepare('SELECT c.name FROM category c JOIN department_category dc ON dc.category_id = c.category_id WHERE dc.department_id = ?').all(d.department_id).map((c) => c.name),
      crews: crewsForDepartment(d.department_id),
    }))
  );
}));

r.get('/admin/crews', ...admin, h((req, res) => {
  res.json(getDb().prepare('SELECT c.crew_id, c.name, d.name AS department_name FROM crew c JOIN department d ON d.department_id = c.department_id ORDER BY c.name').all());
}));

export default r;
