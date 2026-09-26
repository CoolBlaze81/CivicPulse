import { Router } from 'express';
import { getDb } from '../db.js';
import { publicUser, requestOtp, requireAuth, staffLogin, verifyOtp } from '../auth.js';
import { unreadCount } from '../services/notifications.js';
import { h } from './util.js';

const r = Router();

r.post('/auth/otp', h((req, res) => res.json(requestOtp(req.body.phone))));
r.post('/auth/otp/verify', h((req, res) => res.json(verifyOtp(req.body.phone, req.body.code, req.body.name))));
r.post('/auth/staff', h((req, res) => res.json(staffLogin(req.body.staff_id, req.body.password))));

export function meFor(user) {
  const db = getDb();
  const out = { ...publicUser(user), unread: unreadCount(user.user_id) };
  if (user.department_id) out.department = db.prepare('SELECT department_id, name, short_code FROM department WHERE department_id = ?').get(user.department_id);
  if (user.crew_id) {
    out.crew = db.prepare('SELECT crew_id, name, zone, department_id FROM crew WHERE crew_id = ?').get(user.crew_id);
    out.department = db.prepare('SELECT department_id, name, short_code FROM department WHERE department_id = ?').get(out.crew.department_id);
  }
  if (user.role === 'CITIZEN') {
    out.stats = db
      .prepare(
        `SELECT COUNT(*) reports,
           SUM(CASE WHEN i.status = 'CLOSED' THEN 1 ELSE 0 END) fixed,
           (SELECT COUNT(*) FROM verification_request v WHERE v.citizen_id = ? AND v.response IS NOT NULL) verified
         FROM report r LEFT JOIN incident i ON i.incident_id = r.incident_id WHERE r.citizen_id = ?`
      )
      .get(user.user_id, user.user_id);
  }
  return out;
}

r.get('/me', requireAuth, h((req, res) => res.json(meFor(req.user))));

r.patch('/me', requireAuth, h((req, res) => {
  const name = String(req.body.name ?? req.user.name).trim() || req.user.name;
  const homeArea = req.body.home_area != null ? String(req.body.home_area).trim() : req.user.home_area;
  getDb().prepare('UPDATE user SET name = ?, home_area = ? WHERE user_id = ?').run(name, homeArea, req.user.user_id);
  res.json(meFor(getDb().prepare('SELECT * FROM user WHERE user_id = ?').get(req.user.user_id)));
}));

// Citizens can delete their account. Reports stay for traceability (NFR-18)
// but lose the link to a name and phone number.
r.delete('/me', requireAuth, h((req, res) => {
  if (req.user.role !== 'CITIZEN') return res.status(403).json({ error: 'Staff accounts are managed by MSMO.' });
  getDb().prepare("UPDATE user SET name = 'Deleted user', phone = NULL, home_area = NULL, deleted = 1 WHERE user_id = ?").run(req.user.user_id);
  res.json({ ok: true });
}));

export default r;
