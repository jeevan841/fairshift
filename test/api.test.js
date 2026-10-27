'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { createApp } = require('../src/server');

async function withServer(fn) {
  const server = createApp({ adminPin: 'test-pin' }).listen(0);
  const base = `http://127.0.0.1:${server.address().port}/api`;
  try { await fn(base); } finally { server.close(); }
}
const post = (url, body) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
const admin = { headers: { 'x-admin-pin': 'test-pin' } };

test('admin routes need the PIN', () => withServer(async (b) => {
  assert.strictEqual((await fetch(`${b}/admin/summary`)).status, 401);
  assert.strictEqual((await fetch(`${b}/admin/summary`, admin)).status, 200);
}));

test('reports are anonymous and trackable by code', () => withServer(async (b) => {
  const res = await post(`${b}/reports`, { category: 'hazard', text: 'Loose scaffolding', sector: 'construction', workerId: 'W1' });
  const { code } = await res.json();
  const sum = await (await fetch(`${b}/admin/summary`, admin)).json();
  const stored = sum.reports.find((r) => r.code === code);
  assert.ok(stored);
  assert.ok(!('workerId' in stored));
  assert.strictEqual((await (await fetch(`${b}/reports/${code}`)).json()).status, 'open');
}));

test('check-in toggles a shift', () => withServer(async (b) => {
  assert.strictEqual((await (await post(`${b}/worker/W2/toggle`)).json()).checkedIn, true);
  assert.strictEqual((await (await post(`${b}/worker/W2/toggle`)).json()).checkedIn, false);
}));

test('reports get a triage and the explain endpoint validates language', () => withServer(async (b) => {
  const { code } = await (await post(`${b}/reports`, { category: 'hazard', text: 'Exposed wire near gate', sector: 'college' })).json();
  const sum = await (await fetch(`${b}/admin/summary`, admin)).json();
  assert.strictEqual(sum.reports.find((r) => r.code === code).triage.severity, 'urgent');
  assert.strictEqual((await post(`${b}/worker/W1/explain`, { lang: 'xx' })).status, 400);
  assert.strictEqual((await post(`${b}/worker/W1/explain`, { lang: 'ta' })).status, 200);
  assert.strictEqual((await fetch(`${b}/admin/insight`, admin)).status, 200);
}));
