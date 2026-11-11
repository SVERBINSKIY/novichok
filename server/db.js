import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDirectory = path.resolve(here, '../data');
fs.mkdirSync(dataDirectory, { recursive: true });

export const db = new Database(process.env.DB_FILE || path.join(dataDirectory, 'novichok.sqlite'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS employees (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    department TEXT NOT NULL,
    location TEXT NOT NULL,
    job_title TEXT NOT NULL,
    shift TEXT NOT NULL,
    start_date TEXT NOT NULL,
    mentor_id TEXT,
    status TEXT NOT NULL DEFAULT 'работает',
    exit_date TEXT,
    exit_reason TEXT,
    token TEXT NOT NULL UNIQUE
  );
  CREATE TABLE IF NOT EXISTS pulses (
    id TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    day INTEGER NOT NULL,
    due_date TEXT NOT NULL,
    responded_at TEXT,
    mood INTEGER,
    clarity INTEGER,
    reality INTEGER,
    future INTEGER,
    has_contact TEXT,
    tags TEXT NOT NULL DEFAULT '[]',
    comment TEXT NOT NULL DEFAULT '',
    UNIQUE(employee_id, day)
  );
  CREATE TABLE IF NOT EXISTS mentor_reviews (
    id TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    day INTEGER NOT NULL,
    reached_tasks INTEGER NOT NULL,
    risk TEXT NOT NULL,
    comment TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS attendance_events (
    id TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    event_date TEXT NOT NULL,
    type TEXT NOT NULL,
    comment TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS hr_actions (
    id TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    action_date TEXT NOT NULL,
    type TEXT NOT NULL,
    result TEXT NOT NULL DEFAULT '',
    text TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS improvements (
    id TEXT PRIMARY KEY,
    action_date TEXT NOT NULL,
    department TEXT,
    text TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS pulses_employee_due ON pulses(employee_id, due_date);
  CREATE INDEX IF NOT EXISTS employees_start_date ON employees(start_date);
`);
