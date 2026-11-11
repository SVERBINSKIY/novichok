import 'dotenv/config';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import session from 'express-session';
import { db } from './db.js';
import { seedDatabase } from './seed.js';
import { assessRisk, daysBetweenDates } from './rules.js';
import { buildMetrics, MIN_GROUP_SIZE } from './metrics.js';
import { texts } from '../client/src/texts.js';

const app = express();
const port = Number(process.env.PORT) || 3000;
const today = () => new Date().toISOString().slice(0, 10);
const addDays = (date, days) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
const departments = texts.departments;
const shifts = texts.shifts;
const exitReasons = texts.exitReasons;
const pulseDays = [3, 14, 30, 60, 85];
const here = path.dirname(fileURLToPath(import.meta.url));

seedDatabase();
app.disable('x-powered-by');
app.use(express.json({ limit: '30kb' }));
app.use(session({
  name: 'novichok.sid',
  secret: process.env.SESSION_SECRET || 'local-demo-secret-change-before-deploy',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 8 * 60 * 60 * 1000 }
}));

const employeeById = db.prepare('SELECT * FROM employees WHERE id = ?');
const employeeByToken = db.prepare('SELECT * FROM employees WHERE token = ?');
const pulsesByEmployee = db.prepare('SELECT * FROM pulses WHERE employee_id = ? ORDER BY day');
const reviewsByEmployee = db.prepare('SELECT * FROM mentor_reviews WHERE employee_id = ?');
const eventsByEmployee = db.prepare('SELECT * FROM attendance_events WHERE employee_id = ? ORDER BY event_date DESC');
const actionsByEmployee = db.prepare('SELECT * FROM hr_actions WHERE employee_id = ? ORDER BY action_date DESC');

function parsePulse(row) {
  return { ...row, tags: JSON.parse(row.tags || '[]') };
}

function currentRisk(employee) {
  return assessRisk(employee, pulsesByEmployee.all(employee.id).map(parsePulse), reviewsByEmployee.all(employee.id), eventsByEmployee.all(employee.id), today());
}

function requireRole(role) {
  return (req, res, next) => {
    if (req.session.role !== role) return res.status(401).json({ error: texts.api.unauthorized });
    next();
  };
}

function validString(value, maxLength = 100) {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= maxLength;
}

app.get('/health', (_req, res) => res.status(200).json({ status: 'ok' }));

app.get('/api/session', (req, res) => res.json({ role: req.session.role || null, demo: process.env.DEMO_MODE !== 'false' }));
app.post('/api/auth/demo/:role', (req, res) => {
  const { role } = req.params;
  if (process.env.DEMO_MODE === 'false' || !['hr', 'boss'].includes(role)) return res.status(403).json({ error: texts.api.demoDisabled });
  req.session.role = role;
  return res.json({ role });
});
app.post('/api/auth/login', (req, res) => {
  const { role, password } = req.body || {};
  const expected = role === 'hr' ? process.env.HR_PASSWORD : role === 'boss' ? process.env.BOSS_PASSWORD : null;
  if (!expected || typeof password !== 'string' || password !== expected) return res.status(401).json({ error: texts.api.wrongPassword });
  req.session.role = role;
  return res.json({ role });
});
app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(error => {
    if (error) return res.status(500).json({ error: texts.api.logoutFailed });
    res.clearCookie('novichok.sid');
    return res.json({ ok: true });
  });
});

app.get('/api/public/demo', (_req, res) => {
  const demo = db.prepare("SELECT id, name, token FROM employees WHERE id IN ('emp-001', 'emp-002', 'emp-003') ORDER BY id").all();
  res.json({ newcomers: demo.map(employee => ({ ...employee, url: `/p/${employee.token}` })) });
});

app.get('/api/p/:token', (req, res) => {
  const employee = employeeByToken.get(req.params.token);
  if (!employee || employee.status !== 'работает') return res.status(404).json({ error: texts.api.invalidLink });
  const pulse = pulsesByEmployee.all(employee.id)
    .map(parsePulse)
    .find(item => !item.responded_at && item.due_date <= today());
  if (!pulse) {
    return res.json({ employee: { name: employee.name, department: employee.department, start_date: employee.start_date }, pulse: null, progress: 5, idle: true });
  }
  res.json({
    employee: { name: employee.name, department: employee.department, start_date: employee.start_date },
    pulse,
    progress: pulsesByEmployee.all(employee.id).filter(item => item.responded_at).length,
    idle: false
  });
});

app.post('/api/p/:token', (req, res) => {
  const employee = employeeByToken.get(req.params.token);
  if (!employee || employee.status !== 'работает') return res.status(404).json({ error: texts.api.invalidLink });
  const pulse = pulsesByEmployee.all(employee.id).find(item => !item.responded_at && item.due_date <= today());
  if (!pulse) return res.status(409).json({ error: texts.api.noPulse });
  const body = req.body || {};
  const ratingFields = ['mood', 'clarity', 'reality', 'future'];
  for (const field of ratingFields) {
    if (field === 'clarity' && pulse.day === 3) continue;
    if (field === 'reality' && ![14, 30].includes(pulse.day)) continue;
    if (field === 'future' && pulse.day < 14) continue;
    if (body[field] === undefined || !Number.isInteger(Number(body[field])) || Number(body[field]) < 1 || Number(body[field]) > 5) {
      return res.status(400).json({ error: texts.api.requiredAnswers });
    }
  }
  if (![texts.surveyData.yes, texts.surveyData.no].includes(body.has_contact)) return res.status(400).json({ error: texts.api.chooseAnswer });
  const lowSignal = ratingFields.some(field => body[field] !== undefined && Number(body[field]) <= 3)   || body.has_contact === texts.surveyData.no;
  const tags = Array.isArray(body.tags) ? body.tags.filter(tag => typeof tag === 'string').slice(0, 8) : [];
  if (lowSignal && !tags.length) return res.status(400).json({ error: texts.api.chooseIssue });
  db.prepare(`UPDATE pulses SET responded_at = ?, mood = ?, clarity = ?, reality = ?, future = ?, has_contact = ?, tags = ?, comment = ?
    WHERE id = ? AND responded_at IS NULL`).run(
    today(), Number(body.mood), body.clarity === undefined ? null : Number(body.clarity),
    body.reality === undefined ? null : Number(body.reality), body.future === undefined ? null : Number(body.future),
    body.has_contact, JSON.stringify(tags), typeof body.comment === 'string' ? body.comment.trim().slice(0, 500) : '', pulse.id
  );
  const refreshed = employeeById.get(employee.id);
  res.json({ ok: true, risk: currentRisk(refreshed), message: 'Мы увидим ваш ответ и, если нужно, свяжемся.' });
});

app.post('/api/demo/reset', (req, res) => {
  if (process.env.DEMO_MODE === 'false') return res.status(403).json({ error: texts.api.resetDisabled });
  seedDatabase();
  res.json({ ok: true });
});

app.use('/api/hr', requireRole('hr'));
app.use('/api/boss', requireRole('boss'));

app.get('/api/hr/today', (_req, res) => {
  const people = db.prepare("SELECT * FROM employees WHERE status = 'работает' ORDER BY start_date DESC").all();
  const due = people.map(employee => ({ employee, risk: currentRisk(employee) }))
    .filter(item => item.risk.level !== 'green')
    .filter(item => !db.prepare("SELECT 1 FROM hr_actions WHERE employee_id = ? AND type = 'remind' AND action_date >= ?").get(item.employee.id, today()))
    .sort((a, b) => ['red', 'yellow'].indexOf(a.risk.level) - ['red', 'yellow'].indexOf(b.risk.level)
      || b.risk.reasons.length - a.risk.reasons.length
      || a.employee.start_date.localeCompare(b.employee.start_date))
    .slice(0, 10)
    .map(({ employee, risk }) => ({ ...employee, risk, adaptationDay: Math.max(0, daysBetweenDates(employee.start_date, today())) }));
  const stale = db.prepare(`SELECT COUNT(DISTINCT p.employee_id) AS count
    FROM pulses p JOIN employees e ON e.id = p.employee_id
    WHERE e.status = 'работает' AND p.responded_at IS NULL AND p.due_date <= ?
      AND NOT EXISTS (
        SELECT 1 FROM hr_actions a WHERE a.employee_id = p.employee_id
          AND a.action_date >= p.due_date AND a.type IN ('звонок', 'заметка')
      )`).get(addDays(today(), -14)).count;
  const allPulses = db.prepare(`SELECT COUNT(*) AS count FROM pulses p JOIN employees e ON e.id = p.employee_id
    WHERE e.status = 'работает' AND p.responded_at IS NULL AND p.due_date <= ?`).get(today()).count;
  res.json({ today: due, staleSignals: stale, awaiting: allPulses, total: people.length });
});

app.get('/api/hr/employees', (req, res) => {
  const { search = '', department = '', risk = '', status = '' } = req.query;
  const people = db.prepare('SELECT * FROM employees ORDER BY start_date DESC').all()
    .filter(employee => (!status || employee.status === status)
      && (!department || employee.department === department)
      && (!search || `${employee.name} ${employee.job_title} ${employee.location}`.toLowerCase().includes(String(search).toLowerCase())))
    .map(employee => ({ ...employee, risk: employee.status === 'уволен' ? { level: 'green', reasons: [] } : currentRisk(employee) }))
    .filter(employee => !risk || employee.risk.level === risk);
  res.json(people);
});

app.get('/api/hr/employees/:id', (req, res) => {
  const employee = employeeById.get(req.params.id);
  if (!employee) return res.status(404).json({ error: texts.api.employeeNotFound });
  res.json({
    ...employee,
    risk: employee.status === 'уволен' ? { level: 'green', reasons: [] } : currentRisk(employee),
    pulses: pulsesByEmployee.all(employee.id).map(parsePulse),
    mentorReviews: reviewsByEmployee.all(employee.id),
    attendanceEvents: eventsByEmployee.all(employee.id),
    actions: actionsByEmployee.all(employee.id)
  });
});

app.patch('/api/hr/employees/:id/pulses/:pulseId', (req, res) => {
  const employee = employeeById.get(req.params.id);
  if (!employee) return res.status(404).json({ error: texts.api.employeeNotFound });
  if (employee.status !== 'работает') return res.status(409).json({ error: texts.api.surveyEmployeeInactive });

  const pulse = db.prepare('SELECT id, day, responded_at FROM pulses WHERE id = ? AND employee_id = ?')
    .get(req.params.pulseId, employee.id);
  if (!pulse || pulse.responded_at) return res.status(409).json({ error: texts.api.surveyNotAvailable });

  const dueDate = req.body?.due_date;
  if (typeof dueDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)
    || Number.isNaN(Date.parse(`${dueDate}T00:00:00Z`))
    || new Date(`${dueDate}T00:00:00Z`).toISOString().slice(0, 10) !== dueDate
    || dueDate < today()) {
    return res.status(400).json({ error: texts.api.surveyDateInvalid });
  }

  const earlierPending = db.prepare(`SELECT 1 FROM pulses
    WHERE employee_id = ? AND responded_at IS NULL AND day < ? AND due_date <= ?
    LIMIT 1`).get(employee.id, pulse.day, dueDate);
  if (earlierPending) return res.status(409).json({ error: texts.api.surveyEarlierPending });

  const updated = db.prepare('UPDATE pulses SET due_date = ? WHERE id = ? AND responded_at IS NULL')
    .run(dueDate, pulse.id);
  if (!updated.changes) return res.status(409).json({ error: texts.api.surveyNotAvailable });

  res.json({ id: pulse.id, day: pulse.day, due_date: dueDate, url: `/p/${employee.token}` });
});

app.post('/api/hr/employees', (req, res) => {
  const body = req.body || {};
  const required = ['name', 'phone', 'department', 'location', 'job_title', 'shift', 'start_date'];
  if (required.some(key => !validString(body[key])) || !departments.includes(body.department) || !shifts.includes(body.shift)
    || !/^\d{4}-\d{2}-\d{2}$/.test(body.start_date)
    || Number.isNaN(Date.parse(`${body.start_date}T00:00:00Z`))
    || new Date(`${body.start_date}T00:00:00Z`).toISOString().slice(0, 10) !== body.start_date) {
    return res.status(400).json({ error: texts.api.invalidEmployee });
  }
  const id = `emp-${crypto.randomUUID()}`;
  const token = crypto.randomBytes(24).toString('base64url');
  const addEmployee = db.prepare(`INSERT INTO employees
    (id, name, phone, department, location, job_title, shift, start_date, mentor_id, status, token)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'работает', ?)`);
  const addPulse = db.prepare('INSERT INTO pulses (id, employee_id, day, due_date) VALUES (?, ?, ?, ?)');
  const insert = db.transaction(() => {
    addEmployee.run(id, body.name.trim(), body.phone.trim(), body.department, body.location.trim(), body.job_title.trim(), body.shift, body.start_date, body.mentor_id || null, token);
    for (const day of pulseDays) addPulse.run(`${id}-pulse-${day}`, id, day, addDays(body.start_date, day));
  });
  insert();
  return res.status(201).json({ id, name: body.name.trim(), token, url: `/p/${token}` });
});

app.post('/api/hr/employees/:id/terminate', (req, res) => {
  const employee = employeeById.get(req.params.id);
  const reason = req.body?.reason;
  if (!employee) return res.status(404).json({ error: texts.api.employeeNotFound });
  if (employee.status === 'уволен') return res.status(409).json({ error: texts.api.alreadyTerminated });
  if (!exitReasons.includes(reason)) return res.status(400).json({ error: texts.api.chooseExitReason });
  db.prepare("UPDATE employees SET status = 'уволен', exit_date = ?, exit_reason = ? WHERE id = ?").run(today(), reason, employee.id);
  res.json({ ok: true });
});

app.post('/api/hr/employees/:id/actions', (req, res) => {
  if (!employeeById.get(req.params.id)) return res.status(404).json({ error: texts.api.employeeNotFound });
  const { type, result = '', text = '' } = req.body || {};
  if (!['звонок', 'заметка', 'remind'].includes(type) || typeof text !== 'string' || text.length > 500) {
    return res.status(400).json({ error: texts.api.invalidAction });
  }
  if (type === 'звонок' && !['дозвонился', 'не дозвонился', 'вопрос решён', 'нужна эскалация'].includes(result)) {
    return res.status(400).json({ error: texts.api.chooseCallResult });
  }
  const id = crypto.randomUUID();
  db.prepare('INSERT INTO hr_actions (id, employee_id, action_date, type, result, text) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, req.params.id, today(), type, result, text.trim());
  res.status(201).json({ id, action_date: today(), type, result, text: text.trim() });
});

app.get('/api/hr/awaiting', (_req, res) => {
  const rows = db.prepare(`SELECT e.id, e.name, e.department, e.token, p.day, p.due_date
    FROM pulses p JOIN employees e ON e.id = p.employee_id
    WHERE e.status = 'работает' AND p.responded_at IS NULL AND p.due_date <= ?
    ORDER BY p.due_date ASC`).all(today());
  res.json(rows.map(row => ({ ...row, daysLate: daysBetweenDates(row.due_date, today()), url: `/p/${row.token}` })));
});

app.post('/api/hr/improvements', (req, res) => {
  const { text, department = null } = req.body || {};
  if (!validString(text, 300) || (department && !departments.includes(department))) {
    return res.status(400).json({ error: texts.api.invalidImprovement });
  }
  const id = crypto.randomUUID();
  db.prepare('INSERT INTO improvements (id, action_date, department, text) VALUES (?, ?, ?, ?)')
    .run(id, today(), department, text.trim());
  res.status(201).json({ id, text: text.trim(), department });
});

app.get('/api/boss/metrics', (_req, res) => {
  const employees = db.prepare('SELECT * FROM employees WHERE start_date >= ?').all(addDays(today(), -365));
  const pulses = db.prepare('SELECT employee_id, responded_at, mood, clarity, reality, future, has_contact, tags FROM pulses').all().map(row => ({ ...row, tags: JSON.parse(row.tags || '[]') }));
  const actions = db.prepare('SELECT employee_id, action_date, result FROM hr_actions').all();
  const metrics = buildMetrics({ employees, pulses, actions, today: today() });
  metrics.kpis.redNow = employees.filter(employee => employee.status === 'работает' && currentRisk(employee).level === 'red').length;
  metrics.topReasons = metrics.topReasons.filter(item => item.count >= MIN_GROUP_SIZE);
  metrics.topTags = metrics.topTags.filter(item => item.count >= MIN_GROUP_SIZE);
  metrics.hotDepartments = metrics.hotDepartments.map(group => group.hidden
    ? { name: group.name, hidden: true }
    : { ...group, hidden: false });
  metrics.hotLocations = metrics.hotLocations.map(group => group.hidden
    ? { name: group.name, hidden: true }
    : { ...group, hidden: false });
  metrics.cohorts = metrics.cohorts.map(group => !group.mature || group.total < MIN_GROUP_SIZE
    ? { month: group.month, mature: group.mature, hidden: true, rate: null }
    : { ...group, hidden: false });
  metrics.retentionByDepartment = metrics.retentionByDepartment.map(group => ({
    department: group.department,
    curve: group.curve.map(point => point.eligible < MIN_GROUP_SIZE
      ? { day: point.day, rate: null, hidden: true }
      : { day: point.day, rate: point.rate, hidden: false })
  }));
  metrics.retentionByLocation = metrics.retentionByLocation.map(group => ({
    location: group.location,
    curve: group.curve.map(point => point.eligible < MIN_GROUP_SIZE
      ? { day: point.day, rate: null, hidden: true }
      : { day: point.day, rate: point.rate, hidden: false })
  }));
  delete metrics.kpis.matureEmployees;
  res.json(metrics);
});

app.use(express.static(path.resolve(here, '../client/dist')));
app.get('/{*path}', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  return res.sendFile(path.resolve(here, '../client/dist/index.html'));
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: texts.api.generic });
});

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  app.listen(port, () => console.log(`Новичок запущен на http://localhost:${port}`));
}

export { app };
