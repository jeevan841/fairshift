'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { SECTORS, splitHours, payslip, fatigueFlags, quitRisk } = require('../src/rules');

const shift = (start, end) => ({ start, end });

test('10h shift gives 2h overtime', () => {
  const h = splitHours(shift('2026-01-05T06:00:00Z', '2026-01-05T16:00:00Z'), SECTORS.construction);
  assert.deepStrictEqual([h.regular, h.overtime], [8, 2]);
});

test('payslip pays overtime at the sector multiplier', () => {
  const p = payslip([shift('2026-01-05T06:00:00Z', '2026-01-05T16:00:00Z')], SECTORS.construction);
  assert.deepStrictEqual([p.regularPay, p.overtimePay, p.total], [600, 225, 825]);
});

test('college sector uses its own rate', () => {
  const p = payslip([shift('2026-01-05T08:00:00Z', '2026-01-05T16:00:00Z')], SECTORS.college);
  assert.strictEqual(p.total, 880);
});

test('flags short rest and long shift', () => {
  const f = fatigueFlags([
    shift('2026-01-04T06:00:00Z', '2026-01-04T20:00:00Z'),
    shift('2026-01-05T02:00:00Z', '2026-01-05T10:00:00Z'),
  ], new Date('2026-01-06T00:00:00Z'));
  assert.ok(f.includes('LONG_SHIFT') && f.includes('SHORT_REST'));
});

test('no flags for normal shifts', () => {
  const f = fatigueFlags([
    shift('2026-01-04T08:00:00Z', '2026-01-04T16:00:00Z'),
    shift('2026-01-05T08:00:00Z', '2026-01-05T16:00:00Z'),
  ], new Date('2026-01-06T00:00:00Z'));
  assert.deepStrictEqual(f, []);
});

test('quit risk rises with flags', () => {
  assert.deepStrictEqual([quitRisk([]), quitRisk(['A']), quitRisk(['A', 'B'])], ['low', 'medium', 'high']);
});
