/* ============================================================================
   SCHEDULER — background jobs (email worker + daily/hourly reminders)
   ----------------------------------------------------------------------------
   Every minute it checks the clock (TIMEZONE in .env) and runs any job that is
   due and hasn't run yet today. What already ran is saved in MongoDB, so a
   restart never sends the same reminder twice.

     every 15s   email worker            send queued emails (retry failed)
     09:00       missedPunchOut          yesterday: logged in, never logged out
     09:30       overdueTasks            tasks past due date (employee + admin)
     10:00       overdueInvoices         client reminder every 3 days
     11:00       noPunchIn               working day, not on leave, not in yet
     18:00       leaveTomorrow           approved leave starting tomorrow
     19:00       adminDigest             everything waiting for the admin
     hourly      longTimers              a task timer running over 10 hours
   ============================================================================ */
'use strict';
const env = require('../config/env');
const store = require('./store.service');
const engine = require('./engine.service');
const email = require('./email.service');
const logger = require('../utils/logger');
const { rupee } = require('./pdf.service');

const STATE_KEY = 'schedulerState';
const LOG_KEY = 'reminderLog';

const JOBS = [
  { name: 'recurringInvoices', at: '07:00', run: recurringInvoices, async: true },
  { name: 'missedPunchOut', at: '09:00', run: missedPunchOut },
  { name: 'overdueTasks', at: '09:30', run: overdueTasks },
  { name: 'overdueInvoices', at: '10:00', run: overdueInvoices },
  { name: 'noPunchIn', at: '11:00', run: noPunchIn },
  { name: 'leaveTomorrow', at: '18:00', run: leaveTomorrow },
  { name: 'adminDigest', at: '19:00', run: adminDigest },
  { name: 'longTimers', every: 'hour', run: longTimers }
];

/* ── clock in company time zone ── */
function clock(d) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: env.TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
    .formatToParts(d || new Date()).reduce((o, p) => (o[p.type] = p.value, o), {});
  const hh = parts.hour === '24' ? '00' : parts.hour;
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hm: `${hh}:${parts.minute}`, hour: `${parts.year}-${parts.month}-${parts.day}T${hh}` };
}
const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

function readJson(key) { try { return JSON.parse(store.getLs(key) || '{}'); } catch (e) { return {}; } }
function writeJson(key, v) { store.setLs(key, JSON.stringify(v)); }

/* reminder log: "send at most once per `days`" */
function allow(log, key, today, days) {
  const last = log[key];
  if (last && addDays(last, days) > today) return false;
  log[key] = today;
  return true;
}
function pruneLog(log, today) {
  const cutoff = addDays(today, -60);
  Object.keys(log).forEach(k => { if (log[k] < cutoff) delete log[k]; });
}

function D() { return engine.get().DataAPI.raw(); }
const activeEmps = () => (D().employees || []).filter(e => e.active !== false);
const adminP = () => ({ email: email.adminAddress(), name: (D().adminUser && D().adminUser.name) || 'Admin', role: 'ADMIN' });
const isWorkingDay = iso => {
  const H = engine.get().HRM;
  try { return !H.isWeekOff(iso) && !(H.holidayOn(iso) && !H.holidayOn(iso).optional); } catch (e) { return true; }
};
const onLeave = (empId, iso) => (D().leaveRequests || []).some(r =>
  r.employeeId === empId && r.status === 'APPROVED' && ((r.dates || []).includes(iso) || (r.fromDate <= iso && r.toDate >= iso)));

/* ── recurring invoices: make the ones due today; email those set to auto-send ── */
async function recurringInvoices(today) {
  const access = require('./access.service');
  const made = await access.unitOfWork(async () => engine.get().DataAPI.runRecurringInvoices(today));
  const admin = { role: 'ADMIN', subject: 'admin', name: 'Scheduler' };
  for (const m of made || []) {
    if (!m.autoSend) continue;
    try { await access.call(admin, 'DataAPI', 'sendInvoice', [m.invoiceId]); }
    catch (e) { logger.warn('recurring: could not send ' + m.number + ': ' + e.message); }
  }
  return (made || []).length;
}

/* ── jobs (each runs inside a unit of work) ── */
function overdueTasks(today, log) {
  const now = Date.now();
  const late = (D().deliverables || []).filter(d => d.dueAt && Date.parse(d.dueAt) < now && d.status !== 'DONE');
  const perEmp = new Map();
  late.forEach(d => (d.assigneeIds || []).forEach(id => {
    if (!allow(log, 'overdue:' + d.id + ':' + id, today, 2)) return;
    if (!perEmp.has(id)) perEmp.set(id, []);
    perEmp.get(id).push(d);
  }));
  perEmp.forEach((tasks, id) => {
    const p = email.person(id);
    if (!p || p.active === false) return;
    email.queue({
      to: p.email, name: p.name, category: 'reminders', kind: 'OVERDUE',
      subject: tasks.length === 1 ? 'Overdue: "' + tasks[0].title + '"' : tasks.length + ' of your tasks are overdue',
      heading: tasks.length === 1 ? 'A task is past its due date' : tasks.length + ' tasks are past their due date',
      facts: tasks.slice(0, 15).map(t => [t.title, 'due ' + new Date(t.dueAt).toLocaleDateString('en-IN', { timeZone: env.TIMEZONE })]),
      lines: ['Please finish them or tell your manager what is blocking you.'],
      button: { label: 'Open my tasks', url: email.appLink('EMPLOYEE') }
    });
  });
  if (late.length && allow(log, 'overdue-admin', today, 1)) {
    const a = adminP();
    email.queue({
      to: a.email, name: a.name, category: 'reminders', kind: 'OVERDUE_SUMMARY',
      subject: late.length + ' overdue task' + (late.length > 1 ? 's' : ''),
      heading: late.length + ' task' + (late.length > 1 ? 's are' : ' is') + ' past due',
      facts: late.slice(0, 20).map(t => [t.title, (t.assigneeIds || []).map(i => (email.person(i) || {}).name).filter(Boolean).join(', ') || 'unassigned']),
      button: { label: 'Open Oment', url: email.appLink('ADMIN') }
    });
  }
  return late.length;
}

function overdueInvoices(today, log) {
  const rows = (D().invoices || []).filter(i =>
    ['SENT', 'PARTIALLY_PAID', 'OVERDUE'].includes(i.status) && i.dueDate && i.dueDate < today && (i.totalPaise || 0) - (i.paidPaise || 0) > 0);
  rows.forEach(inv => {
    if (!allow(log, 'inv:' + inv.id, today, 3)) return;
    const bal = (inv.totalPaise || 0) - (inv.paidPaise || 0);
    email.queue({
      to: inv.clientEmail, name: inv.clientName, category: 'reminders', kind: 'INVOICE_REMINDER',
      subject: 'Payment reminder: invoice ' + inv.number + ' (' + rupee(bal) + ' due)',
      heading: 'Friendly reminder: invoice ' + inv.number + ' is overdue',
      lines: ['Our records show a balance on this invoice. If you have already paid, please ignore this email.'],
      facts: [['Invoice', inv.number], ['Due date', inv.dueDate], ['Total', rupee(inv.totalPaise)], ['Balance due', rupee(bal)]],
      attachInvoiceId: inv.id
    });
  });
  return rows.length;
}

function noPunchIn(today, log) {
  if (!isWorkingDay(today)) return 0;
  const att = D().attendance || [];
  const missing = activeEmps().filter(e => e.canLogin !== false && !onLeave(e.id, today) &&
    !att.some(a => a.employeeId === e.id && a.date === today && a.firstInAt));
  missing.forEach(e => {
    if (!allow(log, 'nopunch:' + e.id, today, 1)) return;
    email.queue({
      to: e.email, name: e.name, category: 'reminders', kind: 'NO_PUNCH_IN',
      subject: 'You haven’t started work today',
      heading: 'Did you forget to log in?',
      lines: ['We don’t see you in the app today. Please sign in to start your day, or apply for leave if you are off.'],
      button: { label: 'Open the app', url: email.appLink('EMPLOYEE') }
    });
  });
  if (missing.length && allow(log, 'nopunch-admin', today, 1)) {
    const a = adminP();
    email.queue({
      to: a.email, name: a.name, category: 'reminders', kind: 'NO_PUNCH_IN_SUMMARY',
      subject: missing.length + ' employee' + (missing.length > 1 ? 's have' : ' has') + ' not logged in today',
      heading: 'Not logged in yet (' + today + ')',
      facts: missing.map(e => [e.name, e.role || '']),
      button: { label: 'Open HRM', url: email.appLink('ADMIN') }
    });
  }
  return missing.length;
}

function missedPunchOut(today, log) {
  const y = addDays(today, -1);
  const rows = (D().attendance || []).filter(a => a.date === y && a.firstInAt && !a.lastOutAt);
  rows.forEach(a => {
    const p = email.person(a.employeeId);
    if (!p || !allow(log, 'nopunchout:' + a.employeeId + ':' + y, today, 30)) return;
    email.queue({
      to: p.email, name: p.name, category: 'reminders', kind: 'MISSED_PUNCH_OUT',
      subject: 'You didn’t log out yesterday (' + y + ')',
      heading: 'Missed log-out on ' + y,
      lines: ['Your attendance for yesterday has no log-out time. If the hours look wrong, request a regularisation from the Leave page.'],
      button: { label: 'Request regularisation', url: email.appLink('EMPLOYEE') }
    });
  });
  return rows.length;
}

function leaveTomorrow(today, log) {
  const t = addDays(today, 1);
  const rows = (D().leaveRequests || []).filter(r => r.status === 'APPROVED' && r.fromDate === t);
  rows.forEach(r => {
    const p = email.person(r.employeeId);
    if (p && allow(log, 'leave-emp:' + r.id, today, 30)) email.queue({
      to: p.email, name: p.name, category: 'reminders', kind: 'LEAVE_TOMORROW',
      subject: 'Your leave starts tomorrow', heading: 'Enjoy your time off',
      facts: [['From', r.fromDate], ['To', r.toDate], ['Days', r.days], ['Type', r.type]],
      lines: ['Please hand over anything urgent before you go.']
    });
  });
  if (rows.length && allow(log, 'leave-admin:' + t, today, 30)) {
    const a = adminP();
    email.queue({
      to: a.email, name: a.name, category: 'reminders', kind: 'LEAVE_TOMORROW_SUMMARY',
      subject: rows.length + ' on leave from tomorrow',
      heading: 'On leave from ' + t,
      facts: rows.map(r => [(email.person(r.employeeId) || {}).name || 'Employee', r.fromDate + ' → ' + r.toDate + ' (' + r.type + ')'])
    });
  }
  return rows.length;
}

function adminDigest(today, log) {
  const X = D();
  const dels = X.deliverables || [];
  const counts = [
    ['Tasks waiting for review', dels.filter(d => d.status === 'IN_REVIEW').length],
    ['Self-assigned tasks to approve', dels.filter(d => d.approvalState === 'PENDING').length],
    ['Estimate proposals / flags', dels.filter(d => d.agreement && ['COUNTERED', 'FLAGGED'].includes(d.agreement.state)).length],
    ['Blocked tasks', dels.filter(d => d.blocked).length],
    ['Leave requests', (X.leaveRequests || []).filter(r => r.status === 'PENDING').length],
    ['Attendance regularisations', (X.regularisations || []).filter(r => r.status === 'PENDING').length],
    ['Open wallet disputes', (X.disputes || []).filter(d => d.status === 'OPEN').length],
    ['Overdue invoices', (X.invoices || []).filter(i => ['SENT', 'PARTIALLY_PAID', 'OVERDUE'].includes(i.status) && i.dueDate && i.dueDate < today).length],
    ['Overdue tasks', dels.filter(d => d.dueAt && Date.parse(d.dueAt) < Date.now() && d.status !== 'DONE').length]
  ].filter(c => c[1] > 0);
  if (!counts.length || !allow(log, 'digest', today, 1)) return 0;
  const a = adminP();
  email.queue({
    to: a.email, name: a.name, category: 'digest', kind: 'DIGEST',
    subject: 'Daily summary — ' + counts.reduce((s, c) => s + c[1], 0) + ' things need you',
    heading: 'Your daily summary (' + today + ')',
    facts: counts.map(c => [c[0], String(c[1])]),
    button: { label: 'Open Oment', url: email.appLink('ADMIN') }
  });
  return counts.length;
}

function longTimers(today, log) {
  const limit = 10 * 3600 * 1000;
  const rows = (D().timeEntries || []).filter(t => !t.endedAt && t.startedAt && Date.now() - Date.parse(t.startedAt) > limit);
  rows.forEach(t => {
    if (!allow(log, 'timer:' + t.id, today, 30)) return;
    const p = email.person(t.employeeId);
    const d = (D().deliverables || []).find(x => x.id === t.deliverableId);
    const hrs = Math.floor((Date.now() - Date.parse(t.startedAt)) / 3600000);
    if (p) email.queue({
      to: p.email, name: p.name, category: 'reminders', kind: 'LONG_TIMER',
      subject: 'Your timer has been running for ' + hrs + ' hours',
      heading: 'Is your timer still supposed to be running?',
      lines: ['The timer on "' + (d ? d.title : 'a task') + '" started ' + hrs + ' hours ago. If you forgot to stop it, stop it now so your logged time stays correct.'],
      button: { label: 'Open the app', url: email.appLink('EMPLOYEE') }
    });
    const a = adminP();
    email.queue({
      to: a.email, name: a.name, category: 'reminders', kind: 'LONG_TIMER_ADMIN',
      subject: (p ? p.name : 'An employee') + '’s timer has run ' + hrs + ' hours',
      heading: 'Timer running ' + hrs + ' hours',
      facts: [['Employee', p && p.name], ['Task', d && d.title], ['Started', new Date(t.startedAt).toLocaleString('en-IN', { timeZone: env.TIMEZONE })]]
    });
  });
  return rows.length;
}

/* ── runner ── */
let tick = null, mailTick = null, running = false;

async function runJob(job, today, force) {
  const access = require('./access.service');
  if (job.async) {                       // manages its own units of work
    const n = await job.run(today);
    if (!force) await access.unitOfWork(async () => {
      const st = readJson(STATE_KEY); st[job.name] = today; writeJson(STATE_KEY, st); engine.get().DataAPI.touch();
    });
    return n;
  }
  return access.unitOfWork(async () => {
    const log = readJson(LOG_KEY);
    const n = job.run(today, log);
    pruneLog(log, today);
    writeJson(LOG_KEY, log);
    if (!force) {
      const st = readJson(STATE_KEY);
      st[job.name] = job.every === 'hour' ? clock().hour : today;
      writeJson(STATE_KEY, st);
    }
    engine.get().DataAPI.touch();
    return n;
  });
}

async function checkDue() {
  if (running) return;
  running = true;
  try {
    const c = clock();
    const st = readJson(STATE_KEY);
    for (const job of JOBS) {
      const due = job.every === 'hour' ? st[job.name] !== c.hour : (c.hm >= job.at && st[job.name] !== c.date);
      if (!due) continue;
      try {
        const n = await runJob(job, c.date);
        if (n) logger.info(`scheduler: ${job.name} → ${n}`);
      } catch (e) { logger.error(`scheduler: ${job.name} failed:`, e.message); }
    }
  } finally { running = false; }
}

/* admin "run now" (ignores the once-a-day state, keeps per-item limits) */
async function runNow(name) {
  const job = JOBS.find(j => j.name === name);
  if (!job) { const e = new Error('Unknown job: ' + name); e.code = 'NOT_FOUND'; throw e; }
  return { job: name, items: await runJob(job, clock().date, true) };
}

function status() {
  const st = readJson(STATE_KEY);
  return { timezone: env.TIMEZONE, now: clock(), enabled: env.SCHEDULER_ENABLED, jobs: JOBS.map(j => ({ name: j.name, at: j.at || 'every hour', lastRun: st[j.name] || null })) };
}

function start() {
  if (!mailTick) {
    mailTick = setInterval(() => email.drain().catch(e => logger.error('email worker:', e.message)), env.MAILER_INTERVAL_MS);
    mailTick.unref();
    setTimeout(() => email.drain().catch(() => {}), 2000).unref();
  }
  if (env.SCHEDULER_ENABLED && !tick) {
    tick = setInterval(() => checkDue().catch(e => logger.error('scheduler:', e.message)), 60 * 1000);
    tick.unref();
    setTimeout(() => checkDue().catch(() => {}), 5000).unref();
  }
  logger.info(`Scheduler started (${env.TIMEZONE}); email worker every ${env.MAILER_INTERVAL_MS / 1000}s`);
}

function stop() {
  if (tick) clearInterval(tick);
  if (mailTick) clearInterval(mailTick);
  tick = mailTick = null;
}

module.exports = { start, stop, runNow, status, checkDue, JOBS };
