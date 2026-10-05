// Demo data for the fictional MetroServe Municipal Operations Authority.
// Builds ~100 days of history through the real services (so status
// history, notifications and analytics are consistent), then the live
// scenarios shown in the design mockups.
//
//   npm run seed          wipe and rebuild the demo database
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect, getDb, openDb, ready, TABLES, withConnection } from './db.js';
import { hashPassword } from './auth.js';
import { wardCenter, wardFor } from './services/geo.js';
import { submitReport } from './services/reports.js';
import { attachReport, createIncidentFromReport, changeStatus } from './services/incidents.js';
import { decide, pendingReviews } from './services/matchReview.js';
import { assign, classify, suggestCrew } from './services/assignment.js';
import { updateProgress } from './services/fieldwork.js';
import { recordResponse, evaluate as evaluateVerification, officerVerify, sweepExpired } from './services/verification.js';
import { refreshRecommendations } from './services/classification.js';

export const DEMO_PASSWORD = 'civicpulse';
// Bump when the demo data changes in a way an existing database should pick
// up (2: moved from the old fictional city to North Delhi). A server that
// finds older demo data reloads it on start; DEMO_RESEED=0 turns that off.
export const SEED_VERSION = 2;

// Deterministic random numbers so every seed gives the same data.
function rng(seed) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(20260926);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const between = (a, b) => a + rand() * (b - a);
const HOUR = 3600000;
const DAY = 24 * HOUR;

const CATEGORIES = [
  ['Pothole', 'P3'], ['Damaged road', 'P3'], ['Road collapse', 'P1'], ['Footpath', 'P3'], ['Road markings', 'P4'],
  ['Waste', 'P3'], ['Streetlight', 'P3'], ['Drainage', 'P3'], ['Water leakage', 'P3'], ['Public property', 'P4'],
];

const DEPARTMENTS = [
  { name: 'Roads & Highways', code: 'R', head: ['S. Menon', 'DEP-ROADS'], categories: ['Pothole', 'Damaged road', 'Road collapse', 'Footpath', 'Road markings'] },
  { name: 'Solid Waste Management', code: 'S', head: ['F. Shaikh', 'DEP-WASTE'], categories: ['Waste'] },
  { name: 'Electrical Services', code: 'E', head: ['V. Rao', 'DEP-ELEC'], categories: ['Streetlight'] },
  { name: 'Water Supply & Sewerage', code: 'W', head: ['M. Kulkarni', 'DEP-WATER'], categories: ['Water leakage', 'Drainage'] },
  { name: 'Public Works', code: 'P', head: ['J. Thomas', 'DEP-WORKS'], categories: ['Public property'] },
];

// [name, members, skills, zone, availability, max_load]
const CREWS = {
  R: [
    ['Crew R-1', 4, 'Patching, resurfacing', '7,8', 'ON_DUTY', 5], ['Crew R-2', 5, 'Excavation, cave-in repair', '9', 'ON_DUTY', 5],
    ['Crew R-3', 3, 'Patching', '10', 'ON_DUTY', 5], ['Crew R-4', 4, 'Patching, resurfacing', '11,12', 'ON_DUTY', 5],
    ['Crew R-5', 3, 'Kerbs, footpaths', '8', 'ON_DUTY', 5], ['Crew R-6', 4, 'Speed-breakers, markings', '12', 'ON_DUTY', 5],
    ['Crew R-7', 3, 'Patching', '1,2,3,4,5,6', 'ON_DUTY', 5], ['Crew R-8', 4, 'Excavation', '10,11,12', 'ON_LEAVE', 5],
  ],
  S: [['Crew S-1', 6, 'Collection, bins', '1,2,3,4,5,6', 'ON_DUTY', 6], ['Crew S-2', 6, 'Collection, bins', '7,8,9', 'ON_DUTY', 6], ['Crew S-3', 5, 'Bulk waste', '10,11,12', 'ON_DUTY', 6]],
  E: [['Crew E-1', 3, 'Streetlights', '1,2,3,4,5,6', 'ON_DUTY', 5], ['Crew E-2', 3, 'Streetlights, junction boxes', '7,8,11,12', 'ON_DUTY', 5], ['Crew E-3', 3, 'Streetlights', '9,10', 'OFF_SHIFT', 5]],
  W: [
    ['Crew W-1', 4, 'Pipes, mains', '1,2,3,4,5,6,7', 'ON_DUTY', 5], ['Crew W-2', 4, 'Pipes, mains', '8,9,10,11,12', 'ON_DUTY', 5],
    ['Crew D-3', 4, 'Drain clearing', '7,8,9,10,11,12', 'ON_DUTY', 5], ['Crew D-4', 4, 'Drain clearing', '1,2,3,4,5,6', 'ON_DUTY', 5],
  ],
  P: [['Crew P-1', 3, 'Signage, fencing', '1,2,3,4,5,6', 'ON_DUTY', 5], ['Crew P-2', 3, 'Benches, bus stops, signage', '7,8,9,10,11,12', 'ON_DUTY', 5]],
};

const EQUIPMENT = {
  R: [['Asphalt patcher', 3, 2], ['Excavator (JCB)', 2, 1], ['Road roller', 2, 2], ['Barricade sets', 4, 3]],
  S: [['Compactor truck', 4, 3], ['Tipper', 2, 2]],
  E: [['Aerial lift', 2, 1], ['Cable fault locator', 1, 1]],
  W: [['Suction jetting machine', 2, 1], ['Pipe repair kit', 5, 4]],
  P: [['Utility van', 2, 2]],
};

// North Delhi localities, one per ward (see geo.js for the ward grid).
export const WARD_NAMES = {
  1: 'Jahangirpuri', 2: 'Adarsh Nagar', 3: 'Model Town', 4: 'Mukherjee Nagar', 5: 'Wazirpur', 6: 'Azadpur',
  7: 'GTB Nagar', 8: 'Timarpur', 9: 'Keshav Puram', 10: 'Ashok Vihar', 11: 'Kamla Nagar', 12: 'Civil Lines',
};
const STREETS = {
  1: ['GT Karnal Rd', 'Jahangirpuri Main Rd'], 2: ['Adarsh Nagar Main Rd', 'Lal Bagh Rd'], 3: ['Model Town Main Rd', 'Bhama Shah Marg'],
  4: ['Mukherjee Nagar Main Rd', 'Banda Bahadur Marg'], 5: ['Wazirpur Industrial Rd', 'Bungalow Rd'], 6: ['Azadpur Mandi Rd', 'Outer Bungalow Rd'],
  7: ['Hudson Lane', 'Kingsway Camp Rd'], 8: ['Timarpur Main Rd', 'Mall Rd'], 9: ['Lawrence Rd', 'Keshav Puram Main Rd'],
  10: ['Ashok Vihar Main Rd', 'Satyawati Marg'], 11: ['Bungalow Rd', 'Chhatra Marg'], 12: ['Rajpur Rd', 'Alipur Rd'],
};

// Phrases citizens use, per category. {s} = street.
const PHRASES = {
  Pothole: ['Deep pothole on {s}, bikes swerving around it', 'Big hole in the road near {s}', 'Pothole getting bigger on {s}', 'Huge pothole outside the shops on {s}'],
  'Damaged road': ['Road surface broken and uneven on {s}', 'Cracked road near {s} junction', 'Damaged road, asphalt coming off on {s}'],
  'Road collapse': ['Road has caved in on {s}', 'Road sinking near {s}, dangerous pit'],
  Footpath: ['Broken footpath slab on {s}', 'Footpath tiles missing near {s}', 'Kerb stones broken on {s}'],
  'Road markings': ['Zebra crossing markings faded on {s}', 'Lane markings gone on {s}', 'Speed breaker has no paint on {s}'],
  Waste: ['Garbage bin overflowing on {s}', 'Garbage dumped on the roadside at {s}', 'Waste not collected for days near {s}', 'Overflowing bin smells, {s}'],
  Streetlight: ['Streetlight not working on {s}', 'Street light off at night near {s}, very dark', 'Streetlight flickering on {s}'],
  Drainage: ['Drain blocked on {s}, water stagnant', 'Blocked gutter overflowing near {s}', 'Clogged drain on {s} after rain'],
  'Water leakage': ['Water pipe leaking on {s}', 'Water leak from pipeline near {s}', 'Leaking tap wasting water at {s}'],
  'Public property': ['Bench broken at the bus stop on {s}', 'Signboard fallen near {s}', 'Railing damaged on {s}'],
};

// Days from first report to resolution, by category (median-ish).
const RESOLVE_DAYS = {
  Pothole: 2.6, 'Damaged road': 3.5, 'Road collapse': 1.2, Footpath: 4.5, 'Road markings': 6, Waste: 1.2,
  Streetlight: 3.2, Drainage: 3.8, 'Water leakage': 3, 'Public property': 5,
};

const FIRST = ['Aditi', 'Rohan', 'Priya', 'Kabir', 'Sneha', 'Arjun', 'Meera', 'Vikram', 'Ananya', 'Ishaan', 'Neha', 'Siddharth', 'Pooja',
  'Rahul', 'Kavya', 'Dev', 'Tanvi', 'Nikhil', 'Riya', 'Aman', 'Zoya', 'Harsh', 'Divya', 'Omkar', 'Farah', 'Yash', 'Sana', 'Karan',
  'Lata', 'Manish', 'Nisha', 'Pranav', 'Rekha', 'Samir', 'Uma', 'Varun', 'Asha', 'Gaurav', 'Hema', 'Irfan'];
const LAST = ['Sharma', 'Patil', 'Iyer', 'Khan', 'Deshmukh', 'Joshi', 'Nair', 'Gupta', 'Kulkarni', 'Reddy', 'Pawar', 'Das', 'Bose', 'Pillai'];

async function reset() {
  const db = getDb();
  await db.exec(`TRUNCATE ${TABLES.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`);
  return db;
}

function jitter(point, meters) {
  const dLat = (between(-1, 1) * meters) / 111320;
  const dLng = (between(-1, 1) * meters) / (111320 * Math.cos((point.lat * Math.PI) / 180));
  return { lat: point.lat + dLat, lng: point.lng + dLng };
}

function randomPointInWard(ward) {
  const c = wardCenter(ward);
  for (;;) {
    const p = { lat: c.lat + between(-0.009, 0.009), lng: c.lng + between(-0.009, 0.009) };
    if (wardFor(p) === ward) return p;
  }
}

export async function seed({ now = Date.now(), historyDays = 100 } = {}) {
  const db = await reset();
  const iso = (t) => new Date(t).toISOString();
  const pw = hashPassword(DEMO_PASSWORD);

  // ---- reference data ----
  const catId = {};
  for (const [name, p] of CATEGORIES) {
    catId[name] = Number((await db.prepare('INSERT INTO category (name, default_priority) VALUES (?, ?)').run(name, p)).lastInsertRowid);
  }
  const deptId = {};
  const crewIds = {};
  const insertUser = db.prepare(
    `INSERT INTO "user" (name, phone, staff_id, password_hash, role, department_id, crew_id, wards, home_area, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const user = async (u) => {
    const f = {
      phone: null, staff_id: null, password_hash: null, department_id: null, crew_id: null, wards: null, home_area: null,
      created_at: iso(now - (historyDays + 30) * DAY), ...u,
    };
    const info = await insertUser.run(f.name, f.phone, f.staff_id, f.password_hash, f.role, f.department_id, f.crew_id, f.wards, f.home_area, f.created_at);
    return Number(info.lastInsertRowid);
  };

  for (const d of DEPARTMENTS) {
    const id = Number((await db.prepare('INSERT INTO department (name, short_code) VALUES (?, ?)').run(d.name, d.code)).lastInsertRowid);
    deptId[d.name] = id;
    for (const c of d.categories) await db.prepare('INSERT INTO department_category VALUES (?, ?)').run(id, catId[c]);
    for (const [name, members, skills, zone, availability, maxLoad] of CREWS[d.code]) {
      const crewId = Number(
        (await db.prepare('INSERT INTO crew (department_id, name, members, zone, skills, availability, max_load) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .run(id, name, members, zone, skills, availability, maxLoad)).lastInsertRowid
      );
      crewIds[name] = crewId;
      await user({ name: `${name} lead`, staff_id: `CREW-${name.split(' ')[1]}`, password_hash: pw, role: 'FIELD_WORKER', crew_id: crewId });
    }
    for (const [name, total, avail] of EQUIPMENT[d.code]) {
      await db.prepare('INSERT INTO equipment (department_id, name, total_units, available_units) VALUES (?, ?, ?, ?)').run(id, name, total, avail);
    }
    const headId = await user({ name: d.head[0], staff_id: d.head[1], password_hash: pw, role: 'DEPT_HEAD', department_id: id });
    await db.prepare('UPDATE department SET head_user_id = ? WHERE department_id = ?').run(headId, id);
  }
  // Rename crew leads to people so notifications read naturally.
  const crewLeadNames = ['Ravi Kumar', 'Sunil Jadhav', 'Imran Shaikh', 'Ganesh More', 'Prakash Naik', 'Dinesh Yadav', 'Ajay Salunkhe', 'Mohan Lal',
    'Salim Ansari', 'Rajesh Pal', 'Kiran Bhosale', 'Anil Gawde', 'Ramesh Babu', 'Suresh Kamble', 'Vijay Thakur', 'Nitin Chavan', 'Arif Sayyed',
    'Deepak Shinde', 'Mahesh Patil', 'Santosh Rane'];
  const leads = await db.prepare(`SELECT user_id FROM "user" WHERE role = 'FIELD_WORKER' ORDER BY user_id`).all();
  for (const [i, u] of leads.entries()) {
    await db.prepare('UPDATE "user" SET name = ? WHERE user_id = ?').run(crewLeadNames[i % crewLeadNames.length], u.user_id);
  }

  const officer = await user({ name: 'R. Kapoor', staff_id: 'OFF-101', password_hash: pw, role: 'OFFICER', wards: '7,8,9,10,11,12' });
  const officer2 = await user({ name: 'N. Iyer', staff_id: 'OFF-102', password_hash: pw, role: 'OFFICER', wards: '1,2,3,4,5,6' });
  await user({ name: 'A. Desai', staff_id: 'ADM-001', password_hash: pw, role: 'ADMIN' });

  const aarav = await user({ name: 'Aarav Mehta', phone: '9876543210', role: 'CITIZEN', home_area: 'Kamla Nagar' });
  const citizens = [];
  for (let i = 0; i < 60; i += 1) {
    citizens.push(await user({ name: `${FIRST[i % FIRST.length]} ${LAST[(i * 7) % LAST.length]}`, phone: `98${String(20000000 + i * 7919).slice(0, 8)}`, role: 'CITIZEN' }));
  }
  const officerFor = (ward) => (ward >= 7 ? officer : officer2);
  const actor = async (id) => await db.prepare('SELECT * FROM "user" WHERE user_id = ?').get(id);
  const crewLead = async (crewId) => await db.prepare(`SELECT * FROM "user" WHERE crew_id = ? AND role = 'FIELD_WORKER'`).get(crewId);

  // ---- synthetic history ----
  // Incidents start through the matching engine, then go through the full
  // lifecycle. Resolution gets faster over the period (a visible trend).
  const categoryWeights = [
    ['Pothole', 26], ['Waste', 20], ['Streetlight', 15], ['Drainage', 11], ['Water leakage', 10], ['Damaged road', 7],
    ['Footpath', 4], ['Public property', 3], ['Road markings', 3], ['Road collapse', 1],
  ];
  const weightedCategory = () => {
    let x = rand() * categoryWeights.reduce((s, c) => s + c[1], 0);
    for (const [c, w] of categoryWeights) { x -= w; if (x <= 0) return c; }
    return 'Pothole';
  };

  const events = [];
  const nIncidents = Math.round(historyDays * 3.2);
  for (let k = 0; k < nIncidents; k += 1) {
    const start = now - between(historyDays, 1.5) * DAY;
    const category = weightedCategory();
    const ward = 1 + Math.floor(rand() * 12);
    const street = pick(STREETS[ward]);
    const point = randomPointInWard(ward);
    const reports = 1 + Math.floor(rand() ** 2.2 * 5);
    events.push({ start, category, ward, street, point, reports });
  }
  events.sort((a, b) => a.start - b.start);

  const reviewTruth = new Map(); // report_id -> intended incident_id
  const lifecycle = [];

  for (const ev of events) {
    let incidentId = null;
    const text = () => pick(PHRASES[ev.category]).replace('{s}', ev.street);
    const address = `${Math.floor(between(2, 120))} ${ev.street}, ${WARD_NAMES[ev.ward]}`;
    for (let j = 0; j < ev.reports; j += 1) {
      const at = ev.start + (j === 0 ? 0 : between(0.2, 30) * HOUR * j ** 0.5);
      const p = jitter(ev.point, j === 0 ? 0 : 45);
      const out = await submitReport(pick(citizens), {
        description: text(), category_id: catId[ev.category], latitude: p.lat, longitude: p.lng, address,
      }, { at: iso(at) });
      if (j === 0) {
        incidentId = out.incident_id ?? out.candidate_incident_id;
        if (out.decision === 'REVIEW') {
          // First report looked like an older incident: officer says new.
          const rev = await db.prepare('SELECT review_id FROM match_review WHERE report_id = ?').get(out.report_id);
          incidentId = (await decide(rev.review_id, { decision: 'NEW_INCIDENT' }, officerFor(ev.ward), iso(at + 2 * HOUR))).incident_id;
        } else if (out.decision === 'LINKED') {
          incidentId = null; // joined an older incident; nothing new to run
          break;
        }
      } else if (out.decision === 'REVIEW') {
        reviewTruth.set(out.report_id, incidentId);
        const rev = await db.prepare('SELECT review_id, candidate_incident_id FROM match_review WHERE report_id = ?').get(out.report_id);
        const d = rev.candidate_incident_id === incidentId ? { decision: 'LINK' } : { decision: 'OTHER', otherIncidentId: incidentId };
        await decide(rev.review_id, d, officerFor(ev.ward), iso(at + between(0.5, 5) * HOUR));
      } else if (out.decision === 'NEW') {
        // Engine missed it; the officer links it during triage via review.
      }
    }
    if (incidentId) lifecycle.push({ ...ev, incidentId });
  }

  for (const ev of lifecycle) {
    const inc = await db.prepare('SELECT * FROM incident WHERE incident_id = ?').get(ev.incidentId);
    if (!inc || inc.status === 'CLOSED') continue;
    const age = (now - ev.start) / DAY;
    const officerId = officerFor(ev.ward);
    const progress = 1 - age / historyDays; // 0 = oldest, 1 = newest
    const speed = 1.35 - 0.6 * progress; // older work was slower
    const resolveAfter = RESOLVE_DAYS[ev.category] * speed * between(0.55, 1.5) * DAY;
    const tAssign = ev.start + between(1, 10) * HOUR;
    if (tAssign > now - 2 * HOUR) continue; // still waiting for triage
    const deptIdFor = (await refreshRecommendations(ev.incidentId)).departmentId;
    await classify(ev.incidentId, {}, officerId, iso(tAssign - 10 * 60000));
    const crew = await suggestCrew(deptIdFor, ev.ward);
    if (!crew) continue;
    await assign(ev.incidentId, { departmentId: deptIdFor, crewId: crew.crew_id }, await actor(officerId), iso(tAssign));
    const worker = await crewLead(crew.crew_id);
    const tWork = tAssign + Math.min(resolveAfter * 0.4, between(2, 20) * HOUR);
    if (tWork > now) continue;
    await updateProgress(ev.incidentId, worker, { stage: 'WORKING' }, iso(tWork));
    const tResolved = ev.start + resolveAfter;
    if (tResolved > now - 1 * HOUR) continue;
    const proof = jitter({ lat: inc.latitude, lng: inc.longitude }, 12);
    await updateProgress(ev.incidentId, worker, {
      stage: 'RESOLVED', note: 'Work completed and site cleared.', latitude: proof.lat, longitude: proof.lng,
    }, iso(tResolved));

    // Verification: most reporters answer within a day; a few never do.
    const reqs = await db.prepare('SELECT * FROM verification_request WHERE incident_id = ? AND response IS NULL').all(ev.incidentId);
    const silent = rand() < 0.1;
    const failed = rand() < 0.065;
    let t = tResolved;
    for (const r of reqs) {
      if (silent || rand() < 0.25) continue;
      t += between(1, 20) * HOUR;
      if (t > now) break;
      const cur = await db.prepare('SELECT status FROM incident WHERE incident_id = ?').get(ev.incidentId);
      if (cur.status !== 'AWAITING_VERIFICATION') break;
      await recordResponse(ev.incidentId, r.citizen_id, {
        fixed: !failed, feedback: failed ? 'Still not fixed, the problem came back.' : null,
      }, iso(t));
    }
    const expiry = tResolved + 72 * HOUR;
    if (expiry <= now) {
      await evaluateVerification(ev.incidentId, { at: iso(expiry) });
      const cur = await db.prepare('SELECT * FROM incident WHERE incident_id = ?').get(ev.incidentId);
      if (cur.needs_officer_verification && expiry + 5 * HOUR <= now) {
        await officerVerify(ev.incidentId, { close: true }, officerId, iso(expiry + between(1, 5) * HOUR));
      }
    }
    // Reopened ones get a second round with another crew visit.
    const after = await db.prepare('SELECT * FROM incident WHERE incident_id = ?').get(ev.incidentId);
    if (after.status === 'REOPENED') {
      const { t: lastChange } = await db.prepare('SELECT MAX(changed_at) t FROM status_history WHERE incident_id = ?').get(ev.incidentId);
      const tRe = Date.parse(lastChange) + between(3, 12) * HOUR;
      const tFix = tRe + between(0.5, 2) * DAY;
      if (tFix + 30 * HOUR < now) {
        const crew2 = await suggestCrew(after.department_id, ev.ward) || crew;
        await assign(ev.incidentId, { departmentId: after.department_id, crewId: crew2.crew_id }, await actor(officerId), iso(tRe));
        const w2 = await crewLead(crew2.crew_id);
        await updateProgress(ev.incidentId, w2, { stage: 'RESOLVED', note: 'Redone properly after citizen feedback.', latitude: proof.lat, longitude: proof.lng }, iso(tFix));
        const reqs2 = await db.prepare(
          `SELECT * FROM verification_request WHERE incident_id = ? AND response IS NULL
           AND round = (SELECT MAX(round) FROM verification_request WHERE incident_id = ?)`
        ).all(ev.incidentId, ev.incidentId);
        let t2 = tFix;
        for (const r of reqs2) {
          t2 += between(1, 10) * HOUR;
          const cur = await db.prepare('SELECT status FROM incident WHERE incident_id = ?').get(ev.incidentId);
          if (t2 > now || cur.status !== 'AWAITING_VERIFICATION') break;
          await recordResponse(ev.incidentId, r.citizen_id, { fixed: true }, iso(t2));
        }
      }
    }
  }
  // Anything whose window has already run out is settled "as of now".
  await sweepExpired(iso(now));
  // History reviews older than a day were handled by officers.
  for (const rev of await pendingReviews()) {
    if (Date.parse(rev.created_at) < now - DAY) await decide(rev.review_id, { decision: 'LINK' }, officer, iso(Date.parse(rev.created_at) + 3 * HOUR));
  }
  // History notifications are old news.
  await db.prepare('UPDATE notification SET is_read = 1 WHERE created_at < ?').run(iso(now - 2 * DAY));

  await seedScenarios({ db, now, iso, catId, crewIds, deptId, officer, aarav, citizens, actor, crewLead });

  const counts = await db.prepare(`SELECT (SELECT COUNT(*) FROM incident) incidents, (SELECT COUNT(*) FROM report) reports,
    (SELECT COUNT(*) FROM "user") users`).get();
  return counts;
}

// ---- the live scenarios from the design mockups ----------------------------
async function seedScenarios({ db, now, iso, catId, crewIds, deptId, officer, aarav, citizens, actor, crewLead }) {
  const home = wardCenter(11); // Aarav lives in Kamla Nagar, Ward 11
  let ci = 0;
  const nextCitizen = () => citizens[(ci++ * 7) % citizens.length];

  // Inserts one report at a point and links it (or opens the incident).
  async function report(citizenId, { category, text, point, address, at, incidentId = null, method = 'AUTO', score = null }) {
    const info = await db
      .prepare(
        `INSERT INTO report (citizen_id, category_id, description, latitude, longitude, address, submitted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(citizenId, catId[category], text, point.lat, point.lng, address, iso(at));
    const rep = await db.prepare('SELECT * FROM report WHERE report_id = ?').get(info.lastInsertRowid);
    if (incidentId) {
      await attachReport(rep.report_id, incidentId, { method, score: score ?? (method === 'AUTO' ? between(0.9, 0.98) : null), at: iso(at) });
      return incidentId;
    }
    return (await createIncidentFromReport(rep, { by: citizenId, at: iso(at) })).incident_id;
  }

  async function cluster({ category, title, texts, point, address, first, spreadHours, count, reporters = [] }) {
    let id = null;
    for (let i = 0; i < count; i += 1) {
      const at = first + (count === 1 ? 0 : (spreadHours * HOUR * i) / (count - 1));
      const who = reporters[i] ?? nextCitizen();
      const p = i === 0 ? point : jitter(point, 55);
      id = await report(who, { category, text: texts[i % texts.length], point: p, address, at, incidentId: id, method: i % 5 === 3 ? 'OFFICER' : 'AUTO' });
    }
    await db.prepare('UPDATE incident SET title = ? WHERE incident_id = ?').run(title, id);
    await refreshRecommendations(id);
    return id;
  }

  const triageAndAssign = async (id, crewName, at, priority) => {
    const inc = await db.prepare('SELECT * FROM incident WHERE incident_id = ?').get(id);
    await classify(id, { priority: priority || inc.priority }, officer, iso(at - 5 * 60000));
    const crew = await db.prepare('SELECT * FROM crew WHERE name = ?').get(crewName);
    await assign(id, { departmentId: crew.department_id, crewId: crew.crew_id }, await actor(officer), iso(at));
    return await crewLead(crew.crew_id);
  };

  // 1. Deep pothole, Bungalow Road: 12 reports, Aarav's among them, crew on site.
  const bungalowRd = { lat: home.lat + 0.0021, lng: home.lng - 0.0017 };
  const pothole = await cluster({
    category: 'Pothole', title: 'Deep pothole, Bungalow Road', point: bungalowRd, address: '14 Bungalow Road, Kamla Nagar',
    texts: ['Deep pothole on Bungalow Road, roughly a metre wide. Two-wheelers swerving into traffic.', 'Big pothole on Bungalow Road near the petrol pump',
      'Pothole on Bungalow Rd getting deeper every day', 'Huge hole in the left lane of Bungalow Road', 'Bungalow Road pothole, my scooter almost fell'],
    first: now - 2.6 * DAY, spreadHours: 40, count: 12, reporters: [undefined, undefined, aarav],
  });
  await db.prepare('UPDATE incident SET description = ? WHERE incident_id = ?')
    .run('Roughly 1.2 m wide, deepest at the left lane edge. Two-wheelers swerving into traffic.', pothole);
  const r4 = await triageAndAssign(pothole, 'Crew R-4', now - 1.2 * DAY, 'P2');
  await updateProgress(pothole, r4, { stage: 'EN_ROUTE' }, iso(now - 5 * HOUR));
  await updateProgress(pothole, r4, { stage: 'WORKING', note: 'Barricaded the lane, cutting the edges.' }, iso(now - 3 * HOUR));

  // 2. Streetlight on Shakti Nagar Lane: resolved today, 1 of 4 answered.
  const shaktiLane = { lat: home.lat - 0.0016, lng: home.lng + 0.0024 };
  const light = await cluster({
    category: 'Streetlight', title: 'Streetlight out, Shakti Nagar Lane', point: shaktiLane, address: 'Shakti Nagar Lane, near house no. 22',
    texts: ['Streetlight outside house 22 on Shakti Nagar Lane is not working', 'Street light off at night on Shakti Nagar Ln, very dark',
      'Shakti Nagar Lane streetlight dead for a week'],
    first: now - 5 * DAY, spreadHours: 30, count: 4, reporters: [aarav],
  });
  const e2 = await triageAndAssign(light, 'Crew E-2', now - 3.5 * DAY);
  await updateProgress(light, e2, { stage: 'WORKING' }, iso(now - 1 * DAY));
  const lp = jitter(shaktiLane, 5);
  await updateProgress(light, e2, {
    stage: 'RESOLVED', note: 'Replaced the LED fitting and the faulty junction box. Tested after dusk.', latitude: lp.lat, longitude: lp.lng,
  }, iso(now - 19.8 * HOUR));
  const lightReq = await db.prepare('SELECT citizen_id FROM verification_request WHERE incident_id = ? AND citizen_id != ? LIMIT 1').get(light, aarav);
  await recordResponse(light, lightReq.citizen_id, { fixed: true }, iso(now - 10 * HOUR));

  // 3. Overflowing bin, Roshanara Bagh: Aarav's, closed 3 weeks ago in 1.5 days.
  const binPoint = { lat: home.lat + 0.004, lng: home.lng + 0.0035 };
  const bin = await cluster({
    category: 'Waste', title: 'Overflowing bin, Roshanara Bagh', point: binPoint, address: 'Roshanara Bagh gate',
    texts: ['Garbage bin overflowing at the Roshanara Bagh gate'], first: now - 21 * DAY, spreadHours: 0, count: 1, reporters: [aarav],
  });
  const s3 = await triageAndAssign(bin, 'Crew S-3', now - 20.8 * DAY);
  await updateProgress(bin, s3, { stage: 'RESOLVED', note: 'Bin emptied and area cleaned.', latitude: binPoint.lat, longitude: binPoint.lng }, iso(now - 19.6 * DAY));
  await recordResponse(bin, aarav, { fixed: true }, iso(now - 19.5 * DAY));

  // 4. Officer triage queue (design p.25).
  const ward = (w, dLat, dLng) => { const c = wardCenter(w); return { lat: c.lat + dLat, lng: c.lng + dLng }; };
  await cluster({
    category: 'Road collapse', title: 'Road cave-in near school gate', point: ward(9, 0.002, -0.001), address: 'Lawrence Road, near Govt. School No. 4',
    texts: ['Road has caved in right outside the school gate, kids walking around it', 'Big hole opened up on Lawrence Road, a bike almost fell in',
      'Road sinking near Govt School No. 4', 'Dangerous pit, no barricade, please send someone', 'Cave-in on Lawrence Rd, water seeping from below',
      'School road damaged badly', 'Traffic diverted because of hole in road', 'Pit getting bigger, edges breaking', 'Near school gate the road collapsed'],
    first: now - 2 * HOUR, spreadHours: 1.9, count: 9,
  });
  await cluster({
    category: 'Water leakage', title: 'Burst water main, flooding lane', point: ward(7, -0.003, 0.002), address: 'Kingsway Camp, lane 3',
    texts: ['Water main burst, the whole lane is flooding', 'Burst pipe flooding Kingsway Camp lane 3', 'Water gushing from the road, flooding houses'],
    first: now - 3 * HOUR, spreadHours: 2.5, count: 6,
  });
  await cluster({
    category: 'Drainage', title: 'Blocked storm drain', point: ward(12, 0.001, 0.003), address: 'Rajpur Road, Civil Lines',
    texts: ['Storm drain blocked on Rajpur Road, water stagnant', 'Blocked drain overflowing onto the main road'],
    first: now - 48 * 60000, spreadHours: 0.6, count: 3,
  });
  await cluster({
    category: 'Streetlight', title: 'Four streetlights out in a row', point: ward(8, -0.002, -0.002), address: 'Timarpur Road',
    texts: ['Four streetlights not working in a row on Timarpur Road', 'Timarpur Rd completely dark at night, lights off'],
    first: now - 6 * HOUR, spreadHours: 4, count: 5,
  });
  await cluster({
    category: 'Waste', title: 'Overflowing community bin', point: { lat: binPoint.lat + 0.0006, lng: binPoint.lng - 0.0005 }, address: 'Roshanara Bagh, back entrance',
    texts: ['Community bin overflowing at the back of Roshanara Bagh'], first: now - 2 * HOUR, spreadHours: 0.5, count: 2,
  });
  await cluster({
    category: 'Footpath', title: 'Broken footpath slab', point: ward(10, 0.001, 0.001), address: 'Ashok Vihar Main Rd',
    texts: ['Footpath slab broken on Ashok Vihar Main Rd, people tripping'], first: now - 7 * HOUR, spreadHours: 0, count: 1,
  });
  await cluster({
    category: 'Public property', title: 'Fallen signboard on divider', point: { lat: bungalowRd.lat + 0.003, lng: bungalowRd.lng - 0.004 }, address: 'Bungalow Road divider',
    texts: ['Signboard has fallen on the Bungalow Road divider'], first: now - 1 * HOUR, spreadHours: 0, count: 1,
  });
  await cluster({
    category: 'Water leakage', title: 'Leaking public tap', point: ward(11, -0.004, -0.003), address: 'Kamla Nagar Market',
    texts: ['Public tap leaking in Kamla Nagar Market, water wasted all day'], first: now - 9 * HOUR, spreadHours: 2, count: 2,
  });

  // 5. Reopened by citizens: Malka Ganj Rd patch failed.
  const market = { lat: home.lat - 0.0035, lng: home.lng - 0.003 };
  const patch = await cluster({
    category: 'Pothole', title: 'Pothole patch failed again', point: market, address: 'Malka Ganj Rd, Kamla Nagar',
    texts: ['Pothole on the market road', 'Market road pothole again after rain'], first: now - 9 * DAY, spreadHours: 20, count: 4,
  });
  const r1 = await triageAndAssign(patch, 'Crew R-4', now - 8 * DAY, 'P2');
  await updateProgress(patch, r1, { stage: 'RESOLVED', note: 'Cold patch applied.', latitude: market.lat, longitude: market.lng }, iso(now - 6 * DAY));
  const patchReqs = await db.prepare('SELECT citizen_id FROM verification_request WHERE incident_id = ?').all(patch);
  await recordResponse(patch, patchReqs[0].citizen_id, { fixed: false, feedback: 'The patch broke up again after one day of rain.' }, iso(now - 5.5 * DAY));
  await recordResponse(patch, patchReqs[1].citizen_id, { fixed: false, feedback: 'Same hole is back.' }, iso(now - 5.2 * DAY));

  // Open manhole, Chhatra Marg: reopened, near Aarav for the Nearby map.
  const manhole = await cluster({
    category: 'Drainage', title: 'Open manhole, Chhatra Marg', point: { lat: home.lat + 0.0018, lng: home.lng + 0.0016 }, address: 'Chhatra Marg, Kamla Nagar',
    texts: ['Open manhole on Chhatra Marg, no cover', 'Manhole cover missing, dangerous at night'], first: now - 6 * DAY, spreadHours: 10, count: 2,
  });
  const d3 = await triageAndAssign(manhole, 'Crew D-3', now - 5.5 * DAY, 'P1');
  await updateProgress(manhole, d3, { stage: 'RESOLVED', note: 'Temporary cover placed.' }, iso(now - 4 * DAY));
  const mReqs = await db.prepare('SELECT citizen_id FROM verification_request WHERE incident_id = ?').all(manhole);
  await recordResponse(manhole, mReqs[0].citizen_id, { fixed: false, feedback: 'The temporary cover already moved, still open.' }, iso(now - 3.5 * DAY));

  // 6. Officer verification queue: no reporter answered in 72 h.
  const queue = [
    ['Drainage', 'Clogged drain, Timarpur Road', 'Timarpur Rd', ward(8, 0.003, 0.001), 'Crew D-3', 2, 'Drain cleared, silt removed and carted away.'],
    ['Water leakage', 'Leaking public tap', 'Kamla Nagar Market', ward(11, 0.002, 0.004), 'Crew W-2', 1, 'Tap spindle and washer replaced.'],
    ['Public property', 'Broken bench at bus stop', 'Ashok Vihar Main Rd', ward(10, -0.002, 0.002), 'Crew P-2', 1, 'Bench slats replaced and bolted.'],
  ];
  for (const [category, title, address, point, crewName, count, note] of queue) {
    const id = await cluster({ category, title, point, address, texts: [`${title}`], first: now - 8 * DAY, spreadHours: 6, count });
    const w = await triageAndAssign(id, crewName, now - 7 * DAY);
    const pp = jitter(point, 4);
    await updateProgress(id, w, { stage: 'RESOLVED', note, latitude: pp.lat, longitude: pp.lng }, iso(now - 75 * HOUR));
    await evaluateVerification(id, { at: iso(now - 3 * HOUR) });
  }

  // 7. More live work for Crew R-4 and the Roads board.
  const cave = await cluster({
    category: 'Road markings', title: 'Faded speed-breaker marking', point: { lat: shaktiLane.lat - 0.001, lng: shaktiLane.lng + 0.001 }, address: 'Shakti Nagar Lane',
    texts: ['Speed breaker on Shakti Nagar Lane has no paint, bikes hit it at speed'], first: now - 6 * DAY, spreadHours: 0, count: 1,
  });
  await triageAndAssign(cave, 'Crew R-4', now - 5 * DAY);
  const sunk = await cluster({
    category: 'Damaged road', title: 'Sunken manhole cover', point: ward(7, 0.001, -0.003), address: 'Kingsway Camp Rd, GTB Nagar',
    texts: ['Manhole cover sunk below the road level on Kingsway Camp Road'], first: now - 1.2 * DAY, spreadHours: 0, count: 1,
  });
  await triageAndAssign(sunk, 'Crew R-1', now - 1 * DAY);

  // 8. Match review queue: reports the engine was unsure about.
  const titled = async (t) => await db.prepare('SELECT * FROM incident WHERE title = ? ORDER BY incident_id DESC').get(t);
  const reviews = [
    ['Deep pothole, Bungalow Road', 'Pothole', 'Road broken outside HP petrol pump, my scooter tyre burst', 125, 14],
    ['Burst water main, flooding lane', 'Water leakage', 'Water on road in Kingsway Camp since morning', 120, 22],
    ['Four streetlights out in a row', 'Streetlight', 'Streetlight not working near the bridge', 210, 60],
    ['Overflowing community bin', 'Waste', 'Garbage pile near park wall', 95, 120],
    ['Pothole patch failed again', 'Pothole', 'Road broken near temple, big hole with stones lying around', 160, 180],
  ];
  for (const [title, category, text, meters, minsAgo] of reviews) {
    const inc = await titled(title);
    const p = { lat: inc.latitude + meters / 111320, lng: inc.longitude };
    const out = await submitReport(nextCitizen(), { description: text, category_id: catId[category], latitude: p.lat, longitude: p.lng, address: inc.address }, { at: iso(now - minsAgo * 60000) });
    if (out.decision !== 'REVIEW') console.warn(`seed: expected a match review for "${text}", engine said ${out.decision} (${out.score})`);
  }

  // Aarav's notifications from the design, newest unread.
  await db.prepare('UPDATE notification SET is_read = 1 WHERE user_id = ? AND created_at < ?').run(aarav, iso(now - 1.5 * DAY));
}

// Copies every table from one connection into another that is already in
// a transaction (replacing what it had), then moves the id sequences past
// the copied rows.
async function copyInto(from, t) {
  await t.exec(`TRUNCATE ${TABLES.map((x) => `"${x}"`).join(', ')} RESTART IDENTITY CASCADE`);
  for (const table of TABLES) {
    const { rows } = await from.query(`SELECT * FROM "${table}"`);
    if (!rows.length) continue;
    const cols = Object.keys(rows[0]);
    const perBatch = Math.floor(30000 / cols.length);
    for (let i = 0; i < rows.length; i += perBatch) {
      const params = [];
      const values = rows.slice(i, i + perBatch).map((row) => `(${cols.map((c) => { params.push(row[c]); return `$${params.length}`; }).join(', ')})`);
      await t.query(`INSERT INTO "${table}" (${cols.map((c) => `"${c}"`).join(', ')}) VALUES ${values.join(', ')}`, params);
    }
  }
  const { rows: seqs } = await t.query(
    `SELECT table_name, column_name FROM information_schema.columns
     WHERE table_schema = current_schema() AND is_identity = 'YES'`
  );
  for (const { table_name: table, column_name: col } of seqs) {
    await t.query(
      `SELECT setval(pg_get_serial_sequence('"${table}"', '${col}'), m) FROM (SELECT MAX("${col}") m FROM "${table}") x WHERE m IS NOT NULL`
    );
  }
}

// Seeds the open database. A remote Postgres (Neon) is filled by building
// the data in an in-memory database first and copying it over in bulk,
// which takes seconds instead of thousands of network round trips.
// onlyIfEmpty: skip if another server instance already seeded it (the
// check runs under a lock, so two instances never seed at once).
export async function seedDatabase({ onlyIfEmpty = false, onlyIfOutdated = false, ...options } = {}) {
  const target = await ready();
  const isEmpty = async (c) => (await c.query('SELECT COUNT(*) n FROM "user"')).rows[0].n === 0;
  const version = async (c) => Number((await c.query(`SELECT value FROM app_meta WHERE key = 'seed_version'`)).rows[0]?.value || 1);
  const needed = async (c) => {
    if (!onlyIfEmpty && !onlyIfOutdated) return true;
    if (await isEmpty(c)) return true;
    return onlyIfOutdated && (await version(c)) < SEED_VERSION;
  };
  const stamp = (c) => c.query(
    `INSERT INTO app_meta (key, value) VALUES ('seed_version', $1) ON CONFLICT (key) DO UPDATE SET value = excluded.value`, [String(SEED_VERSION)]
  );
  if (target.kind === 'pglite') {
    if (!(await needed(target))) return null;
    const counts = await seed(options);
    await stamp(target);
    return counts;
  }
  return target.transaction(async (t) => {
    await t.query('SELECT pg_advisory_xact_lock(2026092601)');
    if (!(await needed(t))) return null;
    const memory = await connect(':memory:');
    try {
      const counts = await withConnection(memory, () => seed(options));
      await copyInto(memory, t);
      await stamp(t);
      return counts;
    } finally {
      await memory.close();
    }
  });
}

// Used on server start: loads the demo data into an empty database, or
// reloads it when the stored demo data is older than SEED_VERSION.
export async function ensureDemoData() {
  const outdated = process.env.DEMO_RESEED !== '0';
  const counts = await seedDatabase({ onlyIfEmpty: true, onlyIfOutdated: outdated });
  if (counts) console.log(`Loaded demo data v${SEED_VERSION}: ${counts.incidents} incidents, ${counts.reports} reports.`);
  return counts;
}

// CLI: node src/seed.js
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await openDb();
  const t = Date.now();
  const counts = await seedDatabase();
  console.log(`Seeded ${counts.incidents} incidents, ${counts.reports} reports, ${counts.users} users in ${Date.now() - t} ms.`);
  console.log(`Staff password for every demo account: ${DEMO_PASSWORD}`);
  await (await ready()).close();
}
