'use strict';
// Pure business rules: sector presets, overtime, payslip maths, fatigue checks.

const SECTORS = {
  construction: { label: 'Construction site', stdHours: 8, otMultiplier: 1.5, hourlyRate: 75, place: 'Zone' },
  college: { label: 'College campus', stdHours: 8, otMultiplier: 2, hourlyRate: 110, place: 'Block' },
};
const HOUR = 3600000;
const LIMITS = { weekHours: 48, shiftHours: 12, restHours: 10 };
const round2 = (n) => Math.round(n * 100) / 100;

function hoursBetween(start, end) {
  return Math.max(0, (new Date(end) - new Date(start)) / HOUR);
}

function splitHours(shift, sector) {
  const total = hoursBetween(shift.start, shift.end);
  const overtime = Math.max(0, total - sector.stdHours);
  return { total, regular: total - overtime, overtime };
}

function payslip(shifts, sector) {
  const sum = shifts.reduce(
    (a, s) => {
      const h = splitHours(s, sector);
      return { regular: a.regular + h.regular, overtime: a.overtime + h.overtime };
    },
    { regular: 0, overtime: 0 }
  );
  const regularPay = sum.regular * sector.hourlyRate;
  const overtimePay = sum.overtime * sector.hourlyRate * sector.otMultiplier;
  return {
    regularHours: round2(sum.regular),
    overtimeHours: round2(sum.overtime),
    hourlyRate: sector.hourlyRate,
    otMultiplier: sector.otMultiplier,
    regularPay: round2(regularPay),
    overtimePay: round2(overtimePay),
    total: round2(regularPay + overtimePay),
  };
}

function fatigueFlags(shifts, now = new Date()) {
  const flags = new Set();
  const sorted = [...shifts].sort((a, b) => new Date(a.start) - new Date(b.start));
  const weekAgo = now - 7 * 24 * HOUR;
  const weekHours = sorted
    .filter((s) => new Date(s.start) >= weekAgo)
    .reduce((a, s) => a + hoursBetween(s.start, s.end), 0);
  if (weekHours > LIMITS.weekHours) flags.add('WEEK_HOURS');
  sorted.forEach((s, i) => {
    if (hoursBetween(s.start, s.end) > LIMITS.shiftHours) flags.add('LONG_SHIFT');
    const next = sorted[i + 1];
    if (next && hoursBetween(s.end, next.start) < LIMITS.restHours) flags.add('SHORT_REST');
  });
  return [...flags];
}

// Simple, explainable quit-risk score: more fatigue flags => higher risk.
function quitRisk(flags) {
  return flags.length >= 2 ? 'high' : flags.length === 1 ? 'medium' : 'low';
}

module.exports = { SECTORS, LIMITS, hoursBetween, splitHours, payslip, fatigueFlags, quitRisk };
