// End-to-end rules from the SRS: consolidation (BR-02, BR-12), verification
// (BR-05, BR-06, BR-10, BR-11), role checks (FR-04, NFR-10) and login lockout.
process.env.CIVICPULSE_DB = ':memory:';
process.env.CIVICPULSE_UPLOAD_DIR = new URL('../data/test-uploads', import.meta.url).pathname;
delete process.env.DATABASE_URL;
delete process.env.BLOB_READ_WRITE_TOKEN;

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

const { openDb, getDb } = await import('../src/db.js');
const { seed } = await import('../src/seed.js');
const { submitReport } = await import('../src/services/reports.js');
const { textSimilarity } = await import('../src/services/text.js');
const { score, AUTO_LINK_THRESHOLD, CANDIDATE_THRESHOLD } = await import('../src/services/matching.js');
const { assign } = await import('../src/services/assignment.js');
const { updateProgress } = await import('../src/services/fieldwork.js');
const { recordResponse, evaluate, officerVerify } = await import('../src/services/verification.js');
const { recommendPriority, recommendCategory } = await import('../src/services/classification.js');
const { createApp } = await import('../src/app.js');

let db;
let server;
let base;
const HOUR = 3600000;
const iso = (t) => new Date(t).toISOString();
// A quiet spot far from the demo data.
const spot = { lat: 18.62, lng: 73.99 };
const cat = async (name) => (await db.prepare('SELECT category_id FROM category WHERE name = ?').get(name)).category_id;
const citizen = async (i) => (await db.prepare(`SELECT user_id FROM "user" WHERE role = 'CITIZEN' ORDER BY user_id LIMIT 1 OFFSET ?`).get(i)).user_id;
const user = (staffId) => db.prepare('SELECT * FROM "user" WHERE staff_id = ?').get(staffId);
const incident = (id) => db.prepare('SELECT * FROM incident WHERE incident_id = ?').get(id);

before(async () => {
  await openDb(':memory:');
  await seed({ historyDays: 5 });
  db = getDb();
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(() => server?.close());

async function report(i, text, { category = 'Pothole', dLatM = 0, at = Date.now(), ...rest } = {}) {
  return submitReport(await citizen(i), {
    description: text, category_id: await cat(category), latitude: spot.lat + dLatM / 111320, longitude: spot.lng, address: '5 Test Rd', ...rest,
  }, { at: iso(at) });
}

// Takes an incident to AWAITING_VERIFICATION through the real services.
async function resolve(incidentId, at) {
  const crew = await db.prepare(`SELECT * FROM crew WHERE name = 'Crew R-7'`).get();
  await assign(incidentId, { departmentId: crew.department_id, crewId: crew.crew_id }, await user('OFF-101'), iso(at));
  const worker = await db.prepare('SELECT * FROM "user" WHERE crew_id = ?').get(crew.crew_id);
  await updateProgress(incidentId, worker, { stage: 'RESOLVED', note: 'Fixed' }, iso(at + HOUR));
}

test('text similarity folds synonyms', () => {
  assert.ok(textSimilarity('big hole on the road', 'deep pothole') > 0);
  assert.equal(textSimilarity('garbage bin overflowing', 'streetlight not working'), 0);
});

test('classification suggests categories and raises priority for danger words', async () => {
  assert.equal((await recommendCategory('streetlight flickering at night'))[0].name, 'Streetlight');
  const p = await recommendPriority({ categoryId: await cat('Pothole'), texts: ['pothole outside the school gate'] });
  assert.equal(p.priority, 'P1');
  assert.match(p.reasons[0], /school/);
});

test('a first report opens an incident; a near-identical one auto-links (BR-12)', async () => {
  const t = Date.now() - 2 * HOUR;
  const first = await report(0, 'Deep pothole on Test Road near the bakery', { at: t });
  assert.equal(first.decision, 'NEW');
  const second = await report(1, 'Huge pothole on Test Road by the bakery', { dLatM: 15, at: t + HOUR });
  assert.equal(second.decision, 'LINKED');
  assert.equal(second.incident_id, first.incident_id);
  assert.ok(second.score >= AUTO_LINK_THRESHOLD);
  const inc = await incident(first.incident_id);
  assert.equal(inc.report_count, 2);
  assert.equal(inc.status, 'LINKED');
});

test('an uncertain match waits for officer review, and a different category never matches', async () => {
  const base = await report(2, 'Water pipe leaking on Test Road', { category: 'Water leakage', dLatM: 1000 });
  const maybe = await report(3, 'Road is wet here', { category: 'Water leakage', dLatM: 1120 });
  assert.equal(maybe.decision, 'REVIEW');
  assert.equal(maybe.candidate_incident_id, base.incident_id);
  assert.ok(maybe.score >= CANDIDATE_THRESHOLD && maybe.score < AUTO_LINK_THRESHOLD);

  const inc = await incident(base.incident_id);
  const other = { description: 'Water pipe leaking', category_id: await cat('Streetlight'), latitude: inc.latitude, longitude: inc.longitude, submitted_at: iso(Date.now()) };
  assert.ok((await score(other, inc)).score < CANDIDATE_THRESHOLD);
});

test('invalid reports are rejected with a list of problems (FR-15)', async () => {
  await assert.rejects(submitReport(await citizen(0), { description: 'x' }), (e) => e.status === 422 && e.problems.length === 3);
  await assert.rejects(
    submitReport(await citizen(0), { description: 'x' }, { requirePhoto: true }),
    (e) => e.problems.some((p) => p.field === 'photo')
  );
});

test('majority of reporters confirms: closed as citizen-verified (BR-10)', async () => {
  const t = Date.now() - 10 * HOUR;
  const a = await report(4, 'Pothole A on Test Lane', { dLatM: 3000, at: t });
  await report(5, 'Pothole A on Test Lane again', { dLatM: 3005, at: t + 1000 });
  await report(6, 'Pothole A still on Test Lane', { dLatM: 3010, at: t + 2000 });
  await resolve(a.incident_id, t + HOUR);
  await recordResponse(a.incident_id, await citizen(4), { fixed: true }, iso(t + 3 * HOUR));
  const out = await recordResponse(a.incident_id, await citizen(5), { fixed: true }, iso(t + 4 * HOUR));
  assert.equal(out.outcome, 'CLOSED'); // 2 of 3 already a majority
  const inc = await incident(a.incident_id);
  assert.equal(inc.status, 'CLOSED');
  assert.equal(inc.closure_type, 'CITIZEN');
});

test('a tie reopens the incident and ends the crew assignment (BR-06)', async () => {
  const t = Date.now() - 10 * HOUR;
  const a = await report(7, 'Pothole B on Test Street', { dLatM: 5000, at: t });
  await report(8, 'Pothole B on Test Street too', { dLatM: 5005, at: t + 1000 });
  await resolve(a.incident_id, t + HOUR);
  await recordResponse(a.incident_id, await citizen(7), { fixed: true }, iso(t + 3 * HOUR));
  await assert.rejects(recordResponse(a.incident_id, await citizen(8), { fixed: false }, iso(t + 4 * HOUR)), /what's still wrong/);
  const out = await recordResponse(a.incident_id, await citizen(8), { fixed: false, feedback: 'Still there' }, iso(t + 4 * HOUR));
  assert.equal(out.outcome, 'REOPENED');
  const { n } = await db.prepare('SELECT COUNT(*) n FROM assignment WHERE incident_id = ? AND is_current = 1').get(a.incident_id);
  assert.equal(n, 0);
});

test('no responses in 72 h goes to the officer, who closes it as officer-verified (BR-11)', async () => {
  const t = Date.now() - 100 * HOUR;
  const a = await report(9, 'Pothole C on Test Avenue', { dLatM: 7000, at: t });
  await resolve(a.incident_id, t + HOUR);
  assert.equal(await evaluate(a.incident_id, { at: iso(t + 10 * HOUR) }), null); // window still open
  assert.equal(await evaluate(a.incident_id, { at: iso(t + 80 * HOUR) }), 'OFFICER_QUEUE');
  await officerVerify(a.incident_id, { close: true }, (await user('OFF-101')).user_id);
  const inc = await incident(a.incident_id);
  assert.equal(inc.status, 'CLOSED');
  assert.equal(inc.closure_type, 'OFFICER');
});

async function call(path, { token, method = 'GET', body, form } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { ...(form ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: form || (body ? JSON.stringify(body) : undefined),
  });
  return { status: res.status, body: await res.json() };
}

// A 1x1 PNG.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

async function citizenToken(phone) {
  const otp = await call('/auth/otp', { method: 'POST', body: { phone } });
  const ok = await call('/auth/otp/verify', { method: 'POST', body: { phone, code: otp.body.demo_code, name: 'Test Citizen' } });
  return ok.body.token;
}

test('citizen signs in with a phone code and reports with a photo through the API', async () => {
  const otp = await call('/auth/otp', { method: 'POST', body: { phone: '9000000001' } });
  assert.equal(otp.status, 200);
  assert.equal(otp.body.is_new, true);
  const wrong = await call('/auth/otp/verify', { method: 'POST', body: { phone: '9000000001', code: otp.body.demo_code === '123456' ? '654321' : '123456', name: 'Test' } });
  assert.equal(wrong.status, 401);
  const ok = await call('/auth/otp/verify', { method: 'POST', body: { phone: '9000000001', code: otp.body.demo_code, name: 'Test Citizen' } });
  assert.equal(ok.status, 200);
  const token = ok.body.token;

  const fields = { description: 'Streetlight out on Test Road', category_id: String(await cat('Streetlight')), latitude: String(spot.lat - 0.05), longitude: String(spot.lng) };
  const noPhoto = new FormData();
  for (const [k, v] of Object.entries(fields)) noPhoto.append(k, v);
  const rejected = await call('/reports', { token, method: 'POST', form: noPhoto });
  assert.equal(rejected.status, 422);
  assert.ok(rejected.body.problems.some((p) => p.field === 'photo'));

  const withPhoto = new FormData();
  for (const [k, v] of Object.entries(fields)) withPhoto.append(k, v);
  withPhoto.append('photo', new Blob([PNG], { type: 'image/png' }), 'light.png');
  const rep = await call('/reports', { token, method: 'POST', form: withPhoto });
  assert.equal(rep.status, 201);
  assert.match(rep.body.report.photo_url, /^\/uploads\/.+\.png$/);

  const mine = await call('/reports/mine', { token });
  assert.equal(mine.body.length, 1);
  // Citizens can't reach staff endpoints (FR-07).
  assert.equal((await call('/staff/incidents', { token })).status, 403);
});

test('a report queued offline keeps the time it was written', async () => {
  const token = await citizenToken('9000000002');
  const written = new Date(Date.now() - 3 * HOUR).toISOString();
  const form = new FormData();
  form.append('description', 'Garbage dumped near the Test Road bus stop');
  form.append('category_id', String(await cat('Waste')));
  form.append('latitude', String(spot.lat - 0.08));
  form.append('longitude', String(spot.lng));
  form.append('captured_at', written);
  form.append('photo', new Blob([PNG], { type: 'image/png' }), 'bin.png');
  const rep = await call('/reports', { token, method: 'POST', form });
  assert.equal(rep.status, 201);
  assert.equal(rep.body.report.submitted_at, written);
});

test('role checks: a department head cannot assign in another department', async () => {
  const login = await call('/auth/staff', { method: 'POST', body: { staff_id: 'DEP-WASTE', password: 'civicpulse' } });
  const token = login.body.token;
  const { department_id: roads } = await db.prepare(`SELECT department_id FROM department WHERE name = 'Roads & Highways'`).get();
  const inc = await db.prepare(`SELECT incident_id FROM incident WHERE status IN ('REPORTED','LINKED') ORDER BY incident_id LIMIT 1`).get();
  const res = await call(`/staff/incidents/${inc.incident_id}/assign`, { token, method: 'POST', body: { department_id: roads } });
  assert.equal(res.status, 403);
  assert.equal((await call('/staff/match-reviews', { token })).status, 403);
});

test('staff accounts lock after repeated wrong passwords', async () => {
  let last;
  for (let i = 0; i < 5; i += 1) last = await call('/auth/staff', { method: 'POST', body: { staff_id: 'OFF-102', password: 'nope' } });
  assert.equal(last.status, 423);
  const right = await call('/auth/staff', { method: 'POST', body: { staff_id: 'OFF-102', password: 'civicpulse' } });
  assert.equal(right.status, 423);
});
