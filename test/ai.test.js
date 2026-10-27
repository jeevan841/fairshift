'use strict';
const test = require('node:test');
const assert = require('node:assert');
const ai = require('../src/ai');

const reply = (content) => async () => ({ ok: true, json: async () => ({ choices: [{ message: { content } }] }) });
async function withKey(fetchImpl, fn) {
  const saved = [process.env.NEBIUS_API_KEY, globalThis.fetch];
  process.env.NEBIUS_API_KEY = 'test-key';
  globalThis.fetch = fetchImpl;
  try { await fn(); } finally {
    if (saved[0] === undefined) delete process.env.NEBIUS_API_KEY; else process.env.NEBIUS_API_KEY = saved[0];
    globalThis.fetch = saved[1];
  }
}

test('without a key, triage uses the heuristic fallback', async () => {
  const t = await ai.triageReport('Scaffolding collapsed near gate 2');
  assert.deepStrictEqual([t.severity, t.source], ['urgent', 'fallback']);
});

test('Nemotron reply is parsed; think tags stripped; bad severity coerced', async () => {
  await withKey(reply('<think>hmm</think>{"severity":"catastrophic","summary":"Loose rail","nextStep":"Fix it"}'), async () => {
    const t = await ai.triageReport('loose rail');
    assert.deepStrictEqual([t.severity, t.summary, t.source], ['medium', 'Loose rail', 'nemotron']);
  });
});

test('empty model content falls back instead of failing', async () => {
  await withKey(reply(''), async () => {
    assert.strictEqual((await ai.triageReport('gas leak')).source, 'fallback');
  });
});

test('requests go to Token Factory with a bearer key and the requested language', async () => {
  let seen;
  await withKey(async (url, opts) => { seen = { url, opts }; return reply('ठीक है')(); }, async () => {
    const r = await ai.explainPayslip({ regularHours: 8, overtimeHours: 2, hourlyRate: 75, otMultiplier: 1.5, regularPay: 600, overtimePay: 225, total: 825 }, 'hi');
    assert.strictEqual(r.source, 'nemotron');
  });
  assert.ok(seen.url.endsWith('/chat/completions'));
  assert.strictEqual(seen.opts.headers.Authorization, 'Bearer test-key');
  assert.ok(JSON.parse(seen.opts.body).messages[0].content.includes('Hindi'));
});
