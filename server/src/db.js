// SQLite connection and schema. Tables follow the CivicPulse ER diagram
// (USER, REPORT, INCIDENT, MATCH_REVIEW, STATUS_HISTORY, ASSIGNMENT,
// WORK_UPDATE, VERIFICATION_REQUEST, NOTIFICATION, DEPARTMENT, CATEGORY,
// DEPARTMENT_CATEGORY, CREW, EQUIPMENT).
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = process.env.CIVICPULSE_DATA_DIR || path.join(here, '..', 'data');
export const UPLOAD_DIR = process.env.CIVICPULSE_UPLOAD_DIR || path.join(here, '..', 'uploads');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS department (
  department_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  short_code TEXT NOT NULL,
  head_user_id INTEGER REFERENCES user(user_id)
);

CREATE TABLE IF NOT EXISTS category (
  category_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  default_priority TEXT NOT NULL CHECK (default_priority IN ('P1','P2','P3','P4'))
);

CREATE TABLE IF NOT EXISTS department_category (
  department_id INTEGER NOT NULL REFERENCES department(department_id),
  category_id INTEGER NOT NULL REFERENCES category(category_id),
  PRIMARY KEY (department_id, category_id)
);

CREATE TABLE IF NOT EXISTS crew (
  crew_id INTEGER PRIMARY KEY,
  department_id INTEGER NOT NULL REFERENCES department(department_id),
  name TEXT NOT NULL UNIQUE,
  members INTEGER NOT NULL DEFAULT 3,
  zone TEXT NOT NULL,           -- comma separated ward numbers, e.g. "7,8"
  skills TEXT NOT NULL DEFAULT '',
  availability TEXT NOT NULL DEFAULT 'ON_DUTY' CHECK (availability IN ('ON_DUTY','OFF_SHIFT','ON_LEAVE')),
  max_load INTEGER NOT NULL DEFAULT 5
);

CREATE TABLE IF NOT EXISTS equipment (
  equipment_id INTEGER PRIMARY KEY,
  department_id INTEGER NOT NULL REFERENCES department(department_id),
  name TEXT NOT NULL,
  total_units INTEGER NOT NULL,
  available_units INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS user (
  user_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT UNIQUE,
  email TEXT,
  staff_id TEXT UNIQUE,
  password_hash TEXT,
  role TEXT NOT NULL CHECK (role IN ('CITIZEN','OFFICER','DEPT_HEAD','FIELD_WORKER','ADMIN')),
  department_id INTEGER REFERENCES department(department_id),
  crew_id INTEGER REFERENCES crew(crew_id),
  wards TEXT,                   -- officers: comma separated wards they cover
  home_area TEXT,
  failed_logins INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  deleted INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS otp_code (
  phone TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  tries_left INTEGER NOT NULL DEFAULT 3
);

CREATE TABLE IF NOT EXISTS incident (
  incident_id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER NOT NULL REFERENCES category(category_id),
  department_id INTEGER REFERENCES department(department_id),
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT NOT NULL CHECK (priority IN ('P1','P2','P3','P4')),
  status TEXT NOT NULL CHECK (status IN ('REPORTED','LINKED','ASSIGNED','IN_PROGRESS','AWAITING_VERIFICATION','CLOSED','REOPENED')),
  closure_type TEXT CHECK (closure_type IN ('CITIZEN','OFFICER')),
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  address TEXT,
  ward INTEGER,
  report_count INTEGER NOT NULL DEFAULT 0,
  triaged INTEGER NOT NULL DEFAULT 0,           -- officer has reviewed category/priority
  rec_category_id INTEGER REFERENCES category(category_id),
  rec_priority TEXT,
  rec_department_id INTEGER REFERENCES department(department_id),
  rec_reasons TEXT,                             -- JSON array of "why" strings
  work_stage TEXT,                              -- latest field stage
  needs_officer_verification INTEGER NOT NULL DEFAULT 0,
  opened_at TEXT NOT NULL,
  resolved_at TEXT,
  closed_at TEXT
);

CREATE TABLE IF NOT EXISTS report (
  report_id INTEGER PRIMARY KEY AUTOINCREMENT,
  citizen_id INTEGER NOT NULL REFERENCES user(user_id),
  incident_id INTEGER REFERENCES incident(incident_id),  -- null while waiting for match review
  category_id INTEGER NOT NULL REFERENCES category(category_id),
  description TEXT NOT NULL,
  photo_url TEXT,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  address TEXT,
  link_method TEXT CHECK (link_method IN ('AUTO','OFFICER','CITIZEN','NEW')),
  match_score REAL,
  submitted_at TEXT NOT NULL,
  linked_at TEXT,
  auto_link_overridden INTEGER NOT NULL DEFAULT 0  -- officer unlinked an automatic match
);

CREATE TABLE IF NOT EXISTS match_review (
  review_id INTEGER PRIMARY KEY,
  report_id INTEGER NOT NULL REFERENCES report(report_id),
  candidate_incident_id INTEGER NOT NULL REFERENCES incident(incident_id),
  score REAL NOT NULL,
  signals TEXT NOT NULL,        -- JSON {distance_m, category, text, photo, time_gap_h}
  decision TEXT CHECK (decision IN ('LINK','NEW_INCIDENT','OTHER')),
  decided_incident_id INTEGER REFERENCES incident(incident_id),
  officer_id INTEGER REFERENCES user(user_id),
  created_at TEXT NOT NULL,
  decided_at TEXT
);

CREATE TABLE IF NOT EXISTS status_history (
  history_id INTEGER PRIMARY KEY,
  incident_id INTEGER NOT NULL REFERENCES incident(incident_id),
  from_status TEXT,
  to_status TEXT NOT NULL,
  changed_by INTEGER REFERENCES user(user_id),
  reason TEXT,
  changed_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS assignment (
  assignment_id INTEGER PRIMARY KEY,
  incident_id INTEGER NOT NULL REFERENCES incident(incident_id),
  department_id INTEGER NOT NULL REFERENCES department(department_id),
  crew_id INTEGER REFERENCES crew(crew_id),
  assigned_by INTEGER REFERENCES user(user_id),
  is_current INTEGER NOT NULL DEFAULT 1,
  assigned_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS work_update (
  update_id INTEGER PRIMARY KEY,
  incident_id INTEGER NOT NULL REFERENCES incident(incident_id),
  field_worker_id INTEGER NOT NULL REFERENCES user(user_id),
  stage TEXT NOT NULL CHECK (stage IN ('EN_ROUTE','ON_SITE','WORKING','RESOLVED')),
  note TEXT,
  photo_url TEXT,
  latitude REAL,
  longitude REAL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS verification_request (
  request_id INTEGER PRIMARY KEY,
  incident_id INTEGER NOT NULL REFERENCES incident(incident_id),
  citizen_id INTEGER NOT NULL REFERENCES user(user_id),
  round INTEGER NOT NULL DEFAULT 1,   -- increments each time the incident is resolved again
  sent_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  response TEXT CHECK (response IN ('FIXED','NOT_FIXED')),
  feedback TEXT,
  proof_photo_url TEXT,
  responded_at TEXT,
  UNIQUE (incident_id, citizen_id, round)
);

CREATE TABLE IF NOT EXISTS notification (
  notification_id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES user(user_id),
  incident_id INTEGER REFERENCES incident(incident_id),
  report_id INTEGER REFERENCES report(report_id),
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_report_incident ON report(incident_id);
CREATE INDEX IF NOT EXISTS idx_report_citizen ON report(citizen_id);
CREATE INDEX IF NOT EXISTS idx_incident_status ON incident(status);
CREATE INDEX IF NOT EXISTS idx_incident_geo ON incident(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_notification_user ON notification(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_history_incident ON status_history(incident_id);
CREATE INDEX IF NOT EXISTS idx_verification_incident ON verification_request(incident_id, round);
`;

let db;

export function openDb(file) {
  const target = file || process.env.CIVICPULSE_DB || path.join(DATA_DIR, 'civicpulse.db');
  if (target !== ':memory:') fs.mkdirSync(path.dirname(target), { recursive: true });
  db = new Database(target);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  return db;
}

export function getDb() {
  if (!db) openDb();
  return db;
}

export function nowIso(date = new Date()) {
  return date.toISOString();
}

export function tx(fn) {
  return getDb().transaction(fn)();
}
