import test from 'node:test';
import assert from 'node:assert/strict';
import { assessRisk } from './rules.js';

const today = '2026-11-11';
const employee = { status: 'работает', start_date: '2026-10-01', mentor_id: 'm1' };
const pulse = (day, values = {}) => ({ day, due_date: '2026-11-01', responded_at: '2026-11-01', mood: 4, clarity: 4, reality: 4, future: 4, has_contact: 'да', ...values });
const event = (event_date = today) => ({ event_date, type: 'опоздание' });
const level = (person = employee, pulses = [], reviews = [], events = []) => assessRisk(person, pulses, reviews, events, today).level;

test('future 2 is red, future 3 is not a red trigger', () => {
  assert.equal(level(employee, [pulse(30, { future: 2 })]), 'red');
  assert.equal(level(employee, [pulse(30, { future: 3 })]), 'green');
});
test('mood decline by exactly two is red', () => {
  assert.equal(level(employee, [pulse(14, { mood: 5 }), pulse(30, { mood: 3 })]), 'red');
});
test('reality 2 and future 3 together are red', () => {
  assert.equal(level(employee, [pulse(30, { reality: 2, future: 3 })]), 'red');
});
test('missing reality and future values are not interpreted as zero', () => {
  assert.equal(level(employee, [pulse(3, { reality: null, future: null })]), 'green');
});
test('two consecutive overdue pulses are red', () => {
  assert.equal(level(employee, [
    { day: 14, due_date: '2026-11-01', responded_at: null },
    { day: 30, due_date: '2026-11-01', responded_at: null }
  ]), 'red');
});
test('30-day mentor risk or not reaching tasks is red', () => {
  assert.equal(level(employee, [], [{ day: 30, risk: 'высокий', reached_tasks: 1 }]), 'red');
  assert.equal(level(employee, [], [{ day: 30, risk: 'низкий', reached_tasks: 0 }]), 'red');
});
test('missing mentor after day three is red', () => {
  assert.equal(level({ ...employee, mentor_id: null, start_date: '2026-11-07' }), 'red');
});
test('three attendance events are red; two are yellow', () => {
  assert.equal(level(employee, [], [], [event(), event(), event()]), 'red');
  assert.equal(level(employee, [], [], [event(), event()]), 'yellow');
});
test('mood or clarity at 3 is yellow', () => {
  assert.equal(level(employee, [pulse(30, { mood: 3 })]), 'yellow');
  assert.equal(level(employee, [pulse(30, { clarity: 3 })]), 'yellow');
});
test('reality at 2 is yellow unless combined with low future', () => {
  assert.equal(level(employee, [pulse(30, { reality: 2, future: 4 })]), 'yellow');
});
test('no contact is yellow', () => {
  assert.equal(level(employee, [pulse(30, { has_contact: 'нет' })]), 'yellow');
});
test('one pulse overdue by exactly three days is yellow', () => {
  assert.equal(level(employee, [{ day: 14, due_date: '2026-11-08', responded_at: null }]), 'yellow');
  assert.equal(level(employee, [{ day: 14, due_date: '2026-11-09', responded_at: null }]), 'green');
});
test('nothing triggered is green and fired people are not evaluated', () => {
  assert.equal(level(employee, [pulse(30)]), 'green');
  assert.deepEqual(assessRisk({ ...employee, status: 'уволен' }, [pulse(30, { future: 1 })], [], [], today), { level: 'green', reasons: [] });
});
test('red takes precedence and all matching explanations are returned', () => {
  const result = assessRisk(employee, [pulse(30, { future: 2, mood: 3, has_contact: 'нет' })], [], [], today);
  assert.equal(result.level, 'red');
  assert.ok(result.reasons.length >= 3);
});
