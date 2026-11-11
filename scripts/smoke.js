import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(error => error ? reject(error) : resolve(port));
    });
  });
}

async function waitForHealth(baseUrl, child, getLogs) {
  const deadline = Date.now() + 12000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Сервер завершился раньше времени.\n${getLogs()}`);
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 120));
  }
  throw new Error(`Сервер не ответил на /health.\n${getLogs()}`);
}

async function main() {
  const port = await freePort();
  const dbFile = path.resolve('data', `smoke-${process.pid}.sqlite`);
  const baseUrl = `http://127.0.0.1:${port}`;
  let logs = '';
  const child = spawn(process.execPath, ['server/index.js'], {
    env: { ...process.env, PORT: String(port), DB_FILE: dbFile, DEMO_MODE: 'true', SESSION_SECRET: 'smoke-test-session-secret' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  child.stdout.on('data', chunk => { logs += chunk.toString(); });
  child.stderr.on('data', chunk => { logs += chunk.toString(); });
  let cookie = '';

  const request = async (url, { method = 'GET', body, authenticated = false, expect = 200 } = {}) => {
    const headers = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (authenticated && cookie) headers.Cookie = cookie;
    const response = await fetch(`${baseUrl}${url}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    if (expect !== null) assert.equal(response.status, expect, `${method} ${url}: ${await response.clone().text()}`);
    if (url.startsWith('/api/auth/demo/') && response.headers.get('set-cookie')) {
      cookie = response.headers.get('set-cookie').split(';')[0];
    }
    const text = await response.text();
    try { return text ? JSON.parse(text) : null; } catch { return text; }
  };

  try {
    await waitForHealth(baseUrl, child, () => logs);
    const demo = await request('/api/public/demo');
    const worried = demo.newcomers[1];
    assert.ok(worried.token.length >= 16);
    const pulse = await request(`/api/p/${worried.token}`);
    assert.equal(pulse.pulse.day, 14);
    await request(`/api/p/${worried.token}`, {
      method: 'POST',
      body: { mood: 2, clarity: 4, reality: 4, future: 4, has_contact: 'да', tags: ['График и смены'] }
    });
    await request(`/api/p/${worried.token}`, { method: 'POST', body: {}, expect: 409 });
    await request('/api/auth/demo/hr', { method: 'POST' });
    const queue = await request('/api/hr/today', { authenticated: true });
    const alerted = queue.today.find(person => person.id === worried.id);
    assert.ok(alerted, `answered newcomer should enter HR today queue: ${JSON.stringify(queue)}`);
    assert.equal(alerted.risk.level, 'red');
    await request(`/api/hr/employees/${worried.id}/actions`, {
      method: 'POST',
      authenticated: true,
      body: { type: 'звонок', result: 'дозвонился', text: 'Обсудили поддержку' },
      expect: 201
    });
    const profile = await request(`/api/hr/employees/${worried.id}`, { authenticated: true });
    assert.equal(profile.actions[0].result, 'дозвонился');

    const newcomer = await request('/api/hr/employees', {
      method: 'POST',
      authenticated: true,
      expect: 201,
      body: {
        name: 'Тестовый Новичок', phone: '+375 29 000-00-91', department: 'Офис',
        location: 'Офис', job_title: 'Специалист', shift: 'дневная',
        start_date: new Date(Date.now() - 4 * 86400000).toISOString().slice(0, 10), mentor_id: 'mentor-test'
      }
    });
    assert.ok(newcomer.token.length >= 16);
    const newPulse = await request(`/api/p/${newcomer.token}`);
    assert.equal(newPulse.pulse.day, 3);
    const today = new Date().toISOString().slice(0, 10);
    await request(`/api/hr/employees/${newcomer.id}/pulses/${newcomer.id}-pulse-14`, {
      method: 'PATCH', authenticated: true, body: { due_date: today }, expect: 409
    });
    const scheduled = await request(`/api/hr/employees/${newcomer.id}/pulses/${newcomer.id}-pulse-3`, {
      method: 'PATCH', authenticated: true, body: { due_date: today }
    });
    assert.equal(scheduled.due_date, today);
    assert.equal(scheduled.url, `/p/${newcomer.token}`);
    assert.equal((await request(`/api${scheduled.url}`)).pulse.day, 3);
    await request(`/api${scheduled.url}`, { method: 'POST', body: { mood: 4, has_contact: 'да' } });
    await request(`/api/hr/employees/${newcomer.id}/pulses/${newcomer.id}-pulse-3`, {
      method: 'PATCH', authenticated: true, body: { due_date: today }, expect: 409
    });
    await request(`/api/hr/employees/${newcomer.id}/terminate`, {
      method: 'POST', authenticated: true, body: { reason: 'другая работа' }
    });
    await request('/api/auth/demo/boss', { method: 'POST' });
    const metrics = await request('/api/boss/metrics', { authenticated: true });
    assert.ok(metrics.kpis.newcomers12m >= 120);
    assert.ok(metrics.cohorts.length > 0);
    assert.ok(metrics.topReasons.length > 0);
    assert.ok(metrics.topTags.length > 0);
    assert.ok(metrics.privacyNote.includes('Слишком мало данных'));
    assert.equal(JSON.stringify(metrics).includes(newcomer.name), false);
    const page = await fetch(`${baseUrl}/`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Новичок/);
    console.log('Smoke пройден: опрос → красный сигнал HR → запись звонка → новый сотрудник → увольнение → аналитика.');
  } finally {
    if (child.exitCode === null) {
      const closed = new Promise(resolve => child.once('exit', resolve));
      child.kill('SIGTERM');
      await closed;
    }
    for (const suffix of ['', '-shm', '-wal']) {
      const file = `${dbFile}${suffix}`;
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
