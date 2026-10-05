import { Router } from 'express';
import { getDb } from '../db.js';
import {
  audit, changePassword, publicUser, requestOtp, requireAuth, signOutEverywhere, staffLogin, verifyOtp,
} from '../auth.js';
import { unreadCount } from '../services/notifications.js';
import { HttpError } from '../services/incidents.js';
import { deletePhoto } from '../services/storage.js';
import { h, photoUpload, savePhoto } from './util.js';

const r = Router();

r.post('/auth/otp', h(async (req, res) => res.json(await requestOtp(req.body.phone))));
r.post('/auth/otp/verify', h(async (req, res) => res.json(await verifyOtp(req.body.phone, req.body.code, req.body.name, req.ip))));
r.post('/auth/staff', h(async (req, res) => res.json(await staffLogin(req.body.staff_id, req.body.password, req.ip))));

export async function meFor(user) {
  const db = getDb();
  const out = { ...publicUser(user), unread: await unreadCount(user.user_id) };
  if (user.department_id) out.department = await db.prepare('SELECT department_id, name, short_code FROM department WHERE department_id = ?').get(user.department_id);
  if (user.crew_id) {
    out.crew = await db.prepare('SELECT crew_id, name, zone, department_id FROM crew WHERE crew_id = ?').get(user.crew_id);
    out.department = await db.prepare('SELECT department_id, name, short_code FROM department WHERE department_id = ?').get(out.crew.department_id);
  }
  if (user.role === 'CITIZEN') {
    out.stats = await db
      .prepare(
        `SELECT COUNT(*) reports,
           COALESCE(SUM(CASE WHEN i.status = 'CLOSED' THEN 1 ELSE 0 END), 0) fixed,
           COALESCE(SUM(CASE WHEN i.status IS NOT NULL AND i.status != 'CLOSED' THEN 1 ELSE 0 END), 0) open,
           (SELECT COUNT(*) FROM verification_request v WHERE v.citizen_id = ? AND v.response IS NOT NULL) verified
         FROM report r LEFT JOIN incident i ON i.incident_id = r.incident_id WHERE r.citizen_id = ?`
      )
      .get(user.user_id, user.user_id);
  }
  return out;
}

const reload = (id) => getDb().prepare('SELECT * FROM "user" WHERE user_id = ?').get(id);

r.get('/me', requireAuth, h(async (req, res) => res.json(await meFor(req.user))));

r.patch('/me', requireAuth, h(async (req, res) => {
  const name = req.body.name != null ? String(req.body.name).trim().replace(/\s+/g, ' ') : req.user.name;
  if (name.length < 2 || name.length > 60) throw new HttpError(422, 'Names need 2 to 60 characters.');
  const homeArea = req.body.home_area != null ? String(req.body.home_area).trim() : req.user.home_area;
  if (homeArea && homeArea.length > 80) throw new HttpError(422, 'Keep the home area under 80 characters.');
  await getDb().prepare('UPDATE "user" SET name = ?, home_area = ? WHERE user_id = ?').run(name, homeArea || null, req.user.user_id);
  res.json(await meFor(await reload(req.user.user_id)));
}));

// Profile picture (any role). The old picture is removed.
r.post('/me/avatar', requireAuth, photoUpload, h(async (req, res) => {
  if (!req.file) throw new HttpError(422, 'Choose a photo for your profile picture.');
  const url = await savePhoto(req);
  await getDb().prepare('UPDATE "user" SET avatar_url = ? WHERE user_id = ?').run(url, req.user.user_id);
  await deletePhoto(req.user.avatar_url);
  res.json(await meFor(await reload(req.user.user_id)));
}));

r.delete('/me/avatar', requireAuth, h(async (req, res) => {
  await getDb().prepare('UPDATE "user" SET avatar_url = NULL WHERE user_id = ?').run(req.user.user_id);
  await deletePhoto(req.user.avatar_url);
  res.json(await meFor(await reload(req.user.user_id)));
}));

r.post('/me/password', requireAuth, h(async (req, res) => {
  res.json(await changePassword(req.user, req.body.current_password, req.body.new_password, req.ip));
}));

r.post('/auth/signout-all', requireAuth, h(async (req, res) => {
  await signOutEverywhere(req.user, req.ip);
  res.json({ ok: true });
}));

// Citizens can delete their account. Reports stay for traceability (NFR-18)
// but lose the link to a name and phone number.
r.delete('/me', requireAuth, h(async (req, res) => {
  if (req.user.role !== 'CITIZEN') return res.status(403).json({ error: 'Staff accounts are managed by MSMO.' });
  await getDb().prepare(`UPDATE "user" SET name = 'Deleted user', phone = NULL, home_area = NULL, avatar_url = NULL, deleted = 1, token_version = token_version + 1 WHERE user_id = ?`).run(req.user.user_id);
  await deletePhoto(req.user.avatar_url);
  await audit(req.user.user_id, 'ACCOUNT_DELETED', null, req.ip);
  res.json({ ok: true });
}));

export default r;
