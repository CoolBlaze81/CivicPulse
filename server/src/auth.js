// Authentication and role-based access (SRS 4.1, FR-01..FR-07, NFR-09..NFR-12).
// Citizens sign in with a phone number and a 6-digit code. SMS is out of
// scope (SRS 2.5), so the code is returned to the app in demo mode.
// Staff sign in with a staff ID and password (bcrypt hashed).
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { getDb, nowIso } from './db.js';
import { HttpError } from './services/incidents.js';

// Tokens are signed with JWT_SECRET. A development default is only allowed
// outside production, so a deployed copy can't run with a public secret.
const SECRET = process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? null : 'civicpulse-dev-secret-change-me');
if (!SECRET) throw new Error('JWT_SECRET is not set. Add a long random value in the environment (Vercel: Settings > Environment Variables).');
const SESSION_HOURS = Number(process.env.SESSION_HOURS || 12);
export const MAX_FAILED_LOGINS = 5;
export const LOCK_MINUTES = 15;
const OTP_MINUTES = 10;
const OTP_RESEND_SECONDS = 30;
const OTP_PER_HOUR = 5;

export const ROLES = ['CITIZEN', 'OFFICER', 'DEPT_HEAD', 'FIELD_WORKER', 'ADMIN'];

// tv (token version) lets a user sign out every device: bumping
// user.token_version makes all earlier tokens invalid.
export function issueToken(user) {
  return jwt.sign({ sub: user.user_id, role: user.role, tv: user.token_version || 0 }, SECRET, { expiresIn: `${SESSION_HOURS}h` });
}

export function publicUser(u) {
  if (!u) return null;
  const { password_hash, failed_logins, locked_until, token_version, ...rest } = u;
  return rest;
}

// Audit trail of sign-ins, account changes and admin actions.
export async function audit(userId, action, detail = null, ip = null) {
  try {
    await getDb().prepare('INSERT INTO audit_log (user_id, action, detail, ip, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(userId || null, action, detail ? String(detail).slice(0, 500) : null, ip ? String(ip).slice(0, 64) : null, nowIso());
  } catch (e) {
    console.error('audit log write failed', e.message);
  }
}

export const PASSWORD_RULE = 'Use at least 8 characters with a letter and a number.';
export function checkPassword(pw) {
  const s = String(pw || '');
  if (s.length < 8 || s.length > 128 || !/[a-z]/i.test(s) || !/\d/.test(s)) throw new HttpError(422, PASSWORD_RULE, 'WEAK_PASSWORD');
  return s;
}

export function normalisePhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  const local = digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;
  return /^[6-9]\d{9}$/.test(local) ? local : null;
}

export async function requestOtp(rawPhone) {
  const phone = normalisePhone(rawPhone);
  if (!phone) throw new HttpError(422, 'Enter a 10-digit mobile number.');
  const db = getDb();
  const now = Date.now();
  // One code every 30 seconds and five an hour per number.
  const last = await db.prepare('SELECT requested_at, requests_in_hour FROM otp_code WHERE phone = ?').get(phone);
  const sinceLast = last ? now - Date.parse(last.requested_at) : Infinity;
  if (sinceLast < OTP_RESEND_SECONDS * 1000) {
    const wait = Math.ceil((OTP_RESEND_SECONDS * 1000 - sinceLast) / 1000);
    throw new HttpError(429, `Wait ${wait} second${wait === 1 ? '' : 's'} before asking for another code.`, 'RATE_LIMITED');
  }
  const inHour = last && sinceLast < 3600000 ? last.requests_in_hour + 1 : 1;
  if (inHour > OTP_PER_HOUR) throw new HttpError(429, 'Too many codes for this number. Try again in an hour.', 'RATE_LIMITED');

  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  const expires = new Date(now + OTP_MINUTES * 60000).toISOString();
  await db
    .prepare(
      `INSERT INTO otp_code (phone, code, expires_at, tries_left, requested_at, requests_in_hour) VALUES (?, ?, ?, 3, ?, ?)
       ON CONFLICT(phone) DO UPDATE SET code = excluded.code, expires_at = excluded.expires_at, tries_left = 3,
         requested_at = excluded.requested_at, requests_in_hour = excluded.requests_in_hour`
    )
    .run(phone, code, expires, new Date(now).toISOString(), inHour);
  const existing = await db.prepare(`SELECT name FROM "user" WHERE phone = ? AND deleted = 0`).get(phone);
  return { phone, demo_code: code, is_new: !existing };
}

export async function verifyOtp(rawPhone, code, name, ip) {
  const db = getDb();
  const phone = normalisePhone(rawPhone);
  const row = phone && (await db.prepare('SELECT * FROM otp_code WHERE phone = ?').get(phone));
  if (!row) throw new HttpError(400, 'Ask for a new code first.');
  if (Date.parse(row.expires_at) < Date.now()) throw new HttpError(400, 'That code has expired. Ask for a new one.');
  if (row.tries_left <= 0) throw new HttpError(429, 'Too many wrong codes. Ask for a new one.');
  const given = Buffer.from(String(code ?? '').trim().padEnd(6).slice(0, 6));
  if (!crypto.timingSafeEqual(given, Buffer.from(row.code))) {
    await db.prepare('UPDATE otp_code SET tries_left = tries_left - 1 WHERE phone = ?').run(phone);
    const left = row.tries_left - 1;
    throw new HttpError(401, left > 0 ? `That code doesn't match. ${left} ${left === 1 ? 'try' : 'tries'} left.` : 'Too many wrong codes. Ask for a new one.');
  }
  // Keep the row (for the resend limits) but make the code unusable.
  await db.prepare('UPDATE otp_code SET tries_left = 0, expires_at = ? WHERE phone = ?').run(new Date(0).toISOString(), phone);

  let user = await db.prepare('SELECT * FROM "user" WHERE phone = ? AND deleted = 0').get(phone);
  if (!user) {
    const cleanName = String(name || '').trim().replace(/\s+/g, ' ');
    if (!cleanName) throw new HttpError(422, 'Tell us your name to create your account.', 'NAME_REQUIRED');
    if (cleanName.length < 2 || cleanName.length > 60) throw new HttpError(422, 'Names need 2 to 60 characters.', 'NAME_REQUIRED');
    const info = await db.prepare(`INSERT INTO "user" (name, phone, role, created_at) VALUES (?, ?, 'CITIZEN', ?)`).run(cleanName, phone, nowIso());
    user = await db.prepare('SELECT * FROM "user" WHERE user_id = ?').get(info.lastInsertRowid);
  }
  if (user.role !== 'CITIZEN') throw new HttpError(403, 'Staff accounts sign in with a staff ID.');
  await db.prepare('UPDATE "user" SET last_login_at = ? WHERE user_id = ?').run(nowIso(), user.user_id);
  await audit(user.user_id, 'SIGN_IN', 'Citizen signed in with a phone code', ip);
  return { token: issueToken(user), user: publicUser(user) };
}

export async function staffLogin(staffId, password, ip) {
  const db = getDb();
  const user = await db
    .prepare(`SELECT * FROM "user" WHERE lower(staff_id) = lower(?) AND role != 'CITIZEN' AND deleted = 0`)
    .get(String(staffId || '').trim());
  const generic = (left) =>
    new HttpError(401, left != null && left <= 2
      ? `Staff ID or password is wrong. ${left} attempt${left === 1 ? '' : 's'} left before the account is locked for ${LOCK_MINUTES} minutes.`
      : 'Staff ID or password is wrong.');
  if (!user) throw generic(null);
  if (user.disabled) {
    await audit(user.user_id, 'SIGN_IN_BLOCKED', 'Account is disabled', ip);
    throw new HttpError(403, 'This account is switched off. Ask your MSMO administrator.', 'DISABLED');
  }
  if (user.locked_until && Date.parse(user.locked_until) > Date.now()) {
    const mins = Math.ceil((Date.parse(user.locked_until) - Date.now()) / 60000);
    throw new HttpError(423, `This account is locked. Try again in ${mins} minute${mins === 1 ? '' : 's'}.`, 'LOCKED');
  }
  if (!bcrypt.compareSync(String(password || ''), user.password_hash || '')) {
    const failed = user.failed_logins + 1;
    if (failed >= MAX_FAILED_LOGINS) {
      await db.prepare('UPDATE "user" SET failed_logins = 0, locked_until = ? WHERE user_id = ?')
        .run(new Date(Date.now() + LOCK_MINUTES * 60000).toISOString(), user.user_id);
      await audit(user.user_id, 'ACCOUNT_LOCKED', `${MAX_FAILED_LOGINS} wrong passwords`, ip);
      throw new HttpError(423, `Too many wrong attempts. The account is locked for ${LOCK_MINUTES} minutes.`, 'LOCKED');
    }
    await db.prepare('UPDATE "user" SET failed_logins = ? WHERE user_id = ?').run(failed, user.user_id);
    await audit(user.user_id, 'SIGN_IN_FAILED', 'Wrong password', ip);
    throw generic(MAX_FAILED_LOGINS - failed);
  }
  await db.prepare('UPDATE "user" SET failed_logins = 0, locked_until = NULL, last_login_at = ? WHERE user_id = ?').run(nowIso(), user.user_id);
  await audit(user.user_id, 'SIGN_IN', 'Staff signed in', ip);
  return { token: issueToken(user), user: publicUser(user) };
}

// Express middleware: attaches req.user or answers 401.
export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Please sign in.', code: 'NO_SESSION' });
  let payload;
  try {
    payload = jwt.verify(token, SECRET);
  } catch (e) {
    const expired = e.name === 'TokenExpiredError';
    return res.status(401).json({ error: expired ? 'Your session expired.' : 'Please sign in.', code: expired ? 'SESSION_EXPIRED' : 'NO_SESSION' });
  }
  try {
    const user = await getDb().prepare('SELECT * FROM "user" WHERE user_id = ? AND deleted = 0').get(payload.sub);
    if (!user) return res.status(401).json({ error: 'Your account no longer exists.', code: 'NO_SESSION' });
    if ((payload.tv || 0) !== (user.token_version || 0)) return res.status(401).json({ error: 'You were signed out. Sign in again.', code: 'SESSION_EXPIRED' });
    if (user.disabled) return res.status(401).json({ error: 'This account is switched off.', code: 'NO_SESSION' });
    req.user = user;
  } catch (e) {
    return next(e);
  }
  next();
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user?.role)) {
      return res.status(403).json({ error: "This page isn't part of your role.", code: 'FORBIDDEN', role: req.user?.role });
    }
    next();
  };
}

export function hashPassword(pw) {
  return bcrypt.hashSync(pw, 10);
}

// Staff change their own password; every other session is signed out.
export async function changePassword(user, current, next, ip) {
  if (user.role === 'CITIZEN') throw new HttpError(403, 'Citizens sign in with a phone code and have no password.');
  if (!bcrypt.compareSync(String(current || ''), user.password_hash || '')) throw new HttpError(422, 'Your current password is wrong.', 'WRONG_PASSWORD');
  const pw = checkPassword(next);
  if (pw === current) throw new HttpError(422, 'Choose a password different from the current one.', 'WEAK_PASSWORD');
  await getDb().prepare('UPDATE "user" SET password_hash = ?, token_version = token_version + 1 WHERE user_id = ?').run(hashPassword(pw), user.user_id);
  await audit(user.user_id, 'PASSWORD_CHANGED', null, ip);
  const fresh = await getDb().prepare('SELECT * FROM "user" WHERE user_id = ?').get(user.user_id);
  return { token: issueToken(fresh) };
}

// Ends every session of this user, including the current one.
export async function signOutEverywhere(user, ip) {
  await getDb().prepare('UPDATE "user" SET token_version = token_version + 1 WHERE user_id = ?').run(user.user_id);
  await audit(user.user_id, 'SIGNED_OUT_EVERYWHERE', null, ip);
}
