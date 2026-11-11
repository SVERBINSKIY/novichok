import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMetrics } from './metrics.js';

const today = '2026-11-11';
const person = (id, changes = {}) => ({
  id, name: `Участник ${id}`, department: 'Склад', location: 'Склад Центральный',
  start_date: '2026-01-01', status: 'работает', exit_date: null, exit_reason: null, ...changes
});

test('early exits only use employees who reached day 90', () => {
  const data = buildMetrics({
    today,
    employees: [
      ...Array.from({ length: 5 }, (_, i) => person(i, { start_date: '2026-01-01', status: i < 2 ? 'уволен' : 'работает', exit_date: i < 2 ? '2026-02-01' : null })),
      person(6, { start_date: '2026-11-01', status: 'уволен', exit_date: '2026-11-05' })
    ]
  });
  assert.equal(data.kpis.matureEmployees, 5);
  assert.equal(data.kpis.earlyExitRate, 0.4);
});

test('groups smaller than five are hidden and disclosed in privacy note', () => {
  const metrics = buildMetrics({ today, employees: [person(1, { department: 'Офис' })] });
  assert.equal(metrics.hotDepartments[0].hidden, true);
  assert.match(metrics.privacyNote, /Слишком мало данных/);
});

test('empty data returns safe empty metrics', () => {
  const metrics = buildMetrics({ today });
  assert.equal(metrics.kpis.newcomers12m, 0);
  assert.equal(metrics.kpis.earlyExitRate, null);
  assert.deepEqual(metrics.topReasons, []);
  assert.deepEqual(metrics.cohorts, []);
});

test('recent cohorts are labelled as not mature and excluded from the rate', () => {
  const metrics = buildMetrics({
    today,
    employees: Array.from({ length: 5 }, (_, i) => person(i, { start_date: '2026-10-20', status: i === 0 ? 'уволен' : 'работает', exit_date: i === 0 ? '2026-10-25' : null }))
  });
  assert.equal(metrics.kpis.matureEmployees, 0);
  assert.equal(metrics.kpis.earlyExitRate, null);
  assert.equal(metrics.cohorts[0].mature, false);
  assert.equal(metrics.cohorts[0].rate, null);
});

test('retention is available by department and location', () => {
  const metrics = buildMetrics({
    today,
    employees: Array.from({ length: 5 }, (_, i) => person(i, { location: 'Магазин «Арена»' }))
  });
  assert.equal(metrics.retentionByDepartment[0].department, 'Склад');
  assert.equal(metrics.retentionByLocation[0].location, 'Магазин «Арена»');
});

test('signal closure only counts low pulse answers followed by an HR response', () => {
  const data = buildMetrics({
    today,
    employees: [person('1')],
    pulses: [
      { employee_id: '1', responded_at: '2026-11-10', mood: 2, clarity: 4, reality: 4, future: 4, has_contact: 'да', tags: [] },
      { employee_id: '1', responded_at: '2026-11-10', mood: 4, clarity: 4, reality: 4, future: 4, has_contact: 'да', tags: [] }
    ],
    actions: [{ employee_id: '1', action_date: '2026-11-11', result: 'дозвонился' }]
  });
  assert.equal(data.kpis.actionCloseRate14d, 1);
});

test('a cohort is not mature until the final hire date reaches day 90', () => {
  const metrics = buildMetrics({
    today,
    employees: Array.from({ length: 5 }, (_, i) => person(i, { start_date: '2026-08-31' }))
  });
  assert.equal(metrics.cohorts[0].mature, false);
  assert.equal(metrics.cohorts[0].rate, null);
});
