'use strict';
const crypto = require('crypto');
const path = require('path');
const express = require('express');
const { SECTORS, fatigueFlags, payslip, quitRisk } = require('./rules');
const ai = require('./ai');

const STATUSES = ['open', 'in_progress', 'fixed'];
const CATEGORIES = ['hazard', 'pay', 'harassment', 'other'];
const round = (n) => Math.round(n * 100) / 100;

function seed(workers, shifts) {
  const day = 24 * 3600000;
  const at = (daysAgo, hour, hours) => {
    const s = new Date(Date.now() - daysAgo * day);
    s.setHours(hour, 0, 0, 0);
    return { start: s.toISOString(), end: new Date(s.getTime() + hours * 3600000).toISOString() };
  };
  workers.forEach((w) => {
    for (let d = 1; d <= 5; d++) {
      const long = w.id === 'W1' && d <= 4; // demo: an overworked builder
      shifts.push({ workerId: w.id, ...(long ? at(d, 6, 14) : at(d, 8, w.id === 'W3' && d === 2 ? 10 : 8)) });
    }
  });
}

function createApp({ adminPin = process.env.ADMIN_PIN || 'demo-admin' } = {}) {
  const app = express();
  const workers = [
    { id: 'W1', name: 'Ravi', sector: 'construction', place: 'Zone A' },
    { id: 'W2', name: 'Meena', sector: 'construction', place: 'Zone B' },
    { id: 'W3', name: 'Anita', sector: 'college', place: 'Library block' },
    { id: 'W4', name: 'Karthik', sector: 'college', place: 'Hostel block' },
  ];
  const shifts = [];
  const reports = [];
  seed(workers, shifts);

  app.disable('x-powered-by');
  app.use(express.json({ limit: '10kb' }));
  app.use((req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    next();
  });

  const findWorker = (id) => workers.find((w) => w.id === id);
  const done = (id) => shifts.filter((s) => s.workerId === id && s.end);
  const requireAdmin = (req, res, next) => {
    const given = Buffer.from(String(req.get('x-admin-pin') || ''));
    const real = Buffer.from(adminPin);
    if (given.length === real.length && crypto.timingSafeEqual(given, real)) return next();
    res.status(401).json({ error: 'Admin PIN required' });
  };

  app.get('/api/sectors', (req, res) => res.json(SECTORS));
  app.get('/api/workers', (req, res) => res.json(workers));

  app.get('/api/worker/:id', (req, res) => {
    const w = findWorker(req.params.id);
    if (!w) return res.status(404).json({ error: 'Unknown worker' });
    const sector = SECTORS[w.sector];
    res.json({
      worker: w,
      sector,
      checkedIn: shifts.some((s) => s.workerId === w.id && !s.end),
      payslip: payslip(done(w.id), sector),
      flags: fatigueFlags(done(w.id)),
    });
  });

  app.post('/api/worker/:id/toggle', (req, res) => {
    const w = findWorker(req.params.id);
    if (!w) return res.status(404).json({ error: 'Unknown worker' });
    const open = shifts.find((s) => s.workerId === w.id && !s.end);
    if (open) open.end = new Date().toISOString();
    else shifts.push({ workerId: w.id, start: new Date().toISOString(), end: null });
    res.json({ checkedIn: !open });
  });

  // Anonymous by design: a report never stores who sent it.
  app.post('/api/reports', async (req, res) => {
    const { category, text, sector } = req.body || {};
    const clean = String(text || '').trim().slice(0, 500);
    if (!CATEGORIES.includes(category) || !SECTORS[sector] || clean.length < 3)
      return res.status(400).json({ error: 'Invalid report' });
    const code = crypto.randomBytes(3).toString('hex').toUpperCase();
    const triage = await ai.triageReport(clean); // text only, never the sender
    reports.push({ code, category, text: clean, sector, triage, status: 'open', createdAt: new Date().toISOString() });
    res.status(201).json({ code });
  });

  app.get('/api/reports/:code', (req, res) => {
    const r = reports.find((x) => x.code === req.params.code.toUpperCase());
    if (!r) return res.status(404).json({ error: 'Code not found' });
    res.json({ status: r.status });
  });

  const summaryRows = () => {
    const rows = workers.map((w) => {
      const flags = fatigueFlags(done(w.id));
      const pay = payslip(done(w.id), SECTORS[w.sector]);
      return { id: w.id, name: w.name, sector: w.sector, place: w.place, flags, risk: quitRisk(flags),
        hours: round(pay.regularHours + pay.overtimeHours), overtimeHours: pay.overtimeHours, shifts: done(w.id).length };
    });
    return rows;
  };
  app.get('/api/admin/summary', requireAdmin, (req, res) => res.json({ workers: summaryRows(), reports }));

  const cache = new Map();
  const cached = async (key, ttl, fn) => {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < ttl) return hit.val;
    const val = await fn();
    cache.set(key, { at: Date.now(), val });
    return val;
  };
  app.get('/api/ai/status', (req, res) => res.json({ live: ai.enabled(), models: ai.MODELS }));
  app.post('/api/worker/:id/explain', async (req, res) => {
    const w = findWorker(req.params.id);
    const lang = req.body && req.body.lang;
    if (!w || !ai.LANGS[lang]) return res.status(400).json({ error: 'Bad request' });
    const p = payslip(done(w.id), SECTORS[w.sector]);
    res.json(await cached(`x|${w.id}|${lang}|${p.total}`, 600000, () => ai.explainPayslip(p, lang)));
  });
  app.get('/api/admin/insight', requireAdmin, async (req, res) => {
    res.json(await cached('insight', 60000, () => ai.adminInsight(summaryRows(), reports)));
  });

  app.patch('/api/admin/reports/:code', requireAdmin, (req, res) => {
    const r = reports.find((x) => x.code === req.params.code);
    if (!r || !STATUSES.includes(req.body && req.body.status)) return res.status(400).json({ error: 'Bad request' });
    r.status = req.body.status;
    res.json({ ok: true });
  });

  app.get('/api/admin/export.csv', requireAdmin, (req, res) => {
    const lines = ['worker,sector,shifts,regular_hours,overtime_hours,total_pay,flags'];
    workers.forEach((w) => {
      const p = payslip(done(w.id), SECTORS[w.sector]);
      lines.push([w.name, w.sector, done(w.id).length, p.regularHours, p.overtimeHours, p.total,
        fatigueFlags(done(w.id)).join('|')].join(','));
    });
    res.type('text/csv').send(lines.join('\n'));
  });

  app.use(express.static(path.join(__dirname, '..', 'public')));
  return app;
}

if (require.main === module) {
  const port = process.env.PORT || 8080;
  createApp().listen(port, () => console.log(`FairShift listening on ${port}`));
}
module.exports = { createApp };
