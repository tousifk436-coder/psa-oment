/* ============================================================================
   Full API test — every endpoint, both roles, emails, trackers, persistence.
   Needs a MongoDB (MONGO_URI in .env). Uses its own "<db>_test" database and
   drops it afterwards.   Run:  npm test
   ============================================================================ */
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const H = require('./helpers');
const { api, rpc } = H;

let app, ADMIN, ALEX, ROHAN, ALEX_ID, ROHAN_ID;
const S = {};                                   // ids created along the way

const ok = (r, msg) => { assert.ok(r.status >= 200 && r.status < 300, (msg || '') + ' → ' + r.status + ' ' + JSON.stringify(r.json || {}).slice(0, 300)); return r; };
const snap = async t => (await api(t, 'GET', '/api/snapshot')).json.snapshot;
const outbox = async () => (await api(ADMIN, 'GET', '/api/emails?limit=200')).json.result.items;
const mailsTo = async (to, re) => (await outbox()).filter(m => m.to === to && (!re || re.test(m.subject)));
const engineDB = () => require('../src/services/engine.service').get().DataAPI.raw();

before(async () => { ({ app } = await H.start()); });
after(async () => { await H.stop(); });

/* ── auth ─────────────────────────────────────────────────────────────── */
test('health public, rest protected', async () => {
  ok(await api(null, 'GET', '/'));
  ok(await api(null, 'GET', '/api/health'));
  assert.equal((await api(null, 'GET', '/api/snapshot')).status, 401);
  assert.equal((await api(null, 'GET', '/api/nope')).status, 401);
});

test('login admin + employees, me, logout, bad password', async () => {
  assert.equal((await api(null, 'POST', '/api/auth/login', { username: 'admin', password: 'x' })).status, 401);
  ADMIN = ok(await api(null, 'POST', '/api/auth/login', { username: 'admin', password: 'admin123' })).json.token;
  const a = ok(await api(null, 'POST', '/api/auth/login', { username: 'alex', password: 'oment123' }));
  ALEX = a.json.token; ALEX_ID = a.json.user.id;
  const r = ok(await api(null, 'POST', '/api/auth/login', { username: 'rohan', password: 'oment123' }));
  ROHAN = r.json.token; ROHAN_ID = r.json.user.id;
  const me = ok(await api(ALEX, 'GET', '/api/auth/me')).json.user;
  assert.equal(me.role, 'EMPLOYEE'); assert.equal(me.profile.name, 'Alex Chen');
  ok(await api(ALEX, 'POST', '/api/auth/logout'));
  assert.equal((await api(null, 'GET', '/api/does-not-exist')).status, 401);
  assert.equal((await api(ADMIN, 'GET', '/api/does-not-exist')).status, 404);
});

test('snapshot is role-filtered', async () => {
  const a = await snap(ADMIN), e = await snap(ALEX);
  assert.ok(a.invoices.length > 0 && a.employees.every(x => x.passHash === undefined));
  assert.equal(e.invoices.length, 0);
  assert.ok(e.employees.filter(x => x.id !== ALEX_ID).every(x => x.email === undefined));
  assert.equal((await api(ALEX, 'GET', '/api/invoices')).status, 403);
  assert.equal((await api(ALEX, 'GET', '/api/emails')).status, 403);
  assert.equal((await rpc(ALEX, 'DataAPI', 'reset', [])).status, 403);
});

test('change password + forgot/reset password flow (emails)', async () => {
  assert.equal((await api(ALEX, 'POST', '/api/auth/change-password', { oldPassword: 'bad', newPassword: 'newpass1' })).status, 401);
  ok(await api(ALEX, 'POST', '/api/auth/change-password', { oldPassword: 'oment123', newPassword: 'newpass1' }));
  ok(await api(null, 'POST', '/api/auth/login', { username: 'alex', password: 'newpass1' }));
  const alexEmail = engineDB().employees.find(e => e.id === ALEX_ID).email;
  assert.ok((await mailsTo(alexEmail, /password was changed/)).length, 'password-changed email');

  ok(await api(null, 'POST', '/api/auth/forgot-password', { username: 'nobody-here' }), 'no user leak');
  ok(await api(null, 'POST', '/api/auth/forgot-password', { username: 'alex' }));
  const mail = (await mailsTo(alexEmail, /Reset your/))[0];
  assert.ok(mail, 'reset email queued');
  const token = /reset=([a-f0-9]{64})/.exec(ok(await api(ADMIN, 'GET', '/api/emails/' + mail.id)).json.result.html)[1];
  assert.equal((await api(null, 'POST', '/api/auth/reset-password', { token: 'x'.repeat(64), newPassword: 'abcdef' })).status, 401);
  ok(await api(null, 'POST', '/api/auth/reset-password', { token, newPassword: 'oment123' }));
  assert.equal((await api(null, 'POST', '/api/auth/reset-password', { token, newPassword: 'again12' })).status, 401, 'one-time token');
  ALEX = ok(await api(null, 'POST', '/api/auth/login', { username: 'alex', password: 'oment123' })).json.token;
});

/* ── settings + email settings ────────────────────────────────────────── */
test('settings, email settings, test email, processing', async () => {
  ok(await api(ADMIN, 'GET', '/api/settings'));
  ok(await api(ADMIN, 'PATCH', '/api/settings', { phone: '+91 1' }));
  assert.equal((await api(ALEX, 'PATCH', '/api/settings', { phone: 'x' })).status, 403);
  const es = ok(await api(ADMIN, 'GET', '/api/settings/email')).json.result;
  assert.equal(es.resolvedAdminEmail, 'owner@oment.test');
  assert.ok(es.categories.tasks === true && es.categoryLabels.invoices);
  assert.equal((await api(ADMIN, 'PATCH', '/api/settings/email', { adminEmail: 'bad' })).status, 400);
  ok(await api(ADMIN, 'PATCH', '/api/settings/email', { categories: { messages: true } }));
  const t = ok(await api(ADMIN, 'POST', '/api/emails/test', { to: 'owner@oment.test' })).json;
  assert.equal(t.transport, 'console');
  ok(await api(ADMIN, 'POST', '/api/emails/process'));
});

/* ── people ───────────────────────────────────────────────────────────── */
test('employees + departments (welcome, password reset, deactivate emails)', async () => {
  ok(await api(ADMIN, 'GET', '/api/employees'));
  ok(await api(ADMIN, 'GET', '/api/employees/' + ALEX_ID));
  ok(await api(ADMIN, 'GET', '/api/employees/' + ALEX_ID + '/score'));
  const d = ok(await api(ADMIN, 'POST', '/api/departments', { name: 'QA', color: '#111' })).json.result;
  ok(await api(ADMIN, 'PATCH', '/api/departments/' + d.id, { description: 'Testing' }));
  ok(await api(ADMIN, 'GET', '/api/departments'));

  const e = ok(await api(ADMIN, 'POST', '/api/employees', {
    name: 'Neha Test', email: 'neha@oment.test', phone: '9', address: 'Lucknow', role: 'QA Engineer', deptId: d.id,
    username: 'neha', password: 'secret1', monthlySalaryPaise: 2080000, hoursPerDay: 8
  })).json.result;
  S.neha = e.id;
  assert.ok((await mailsTo('neha@oment.test', /Welcome/)).length, 'welcome email with login');
  ok(await api(null, 'POST', '/api/auth/login', { username: 'neha', password: 'secret1' }));

  ok(await api(ADMIN, 'PATCH', '/api/employees/' + e.id, { password: 'reset99' }));
  assert.ok((await mailsTo('neha@oment.test', /password was reset/)).length);
  const NEHA = ok(await api(null, 'POST', '/api/auth/login', { username: 'neha', password: 'reset99' })).json.token;

  ok(await api(ADMIN, 'PATCH', '/api/employees/' + e.id, { active: false }));
  assert.ok((await mailsTo('neha@oment.test', /turned off/)).length, 'deactivation email');
  assert.equal((await api(NEHA, 'GET', '/api/snapshot')).status, 401, 'deactivated token stops working');
  assert.equal((await api(null, 'POST', '/api/auth/login', { username: 'neha', password: 'reset99' })).status, 401);
  ok(await api(ADMIN, 'PATCH', '/api/employees/' + e.id, { active: true }));
  assert.ok((await mailsTo('neha@oment.test', /back on/)).length);
});

/* ── projects / milestones / tasks ────────────────────────────────────── */
test('projects, milestones, members (emails)', async () => {
  const p = ok(await api(ADMIN, 'POST', '/api/projects', { name: 'Test Project', clientName: 'Acme Ltd', clientEmail: 'billing@acme.test', deptId: 1 })).json.result;
  S.project = p.id;
  ok(await api(ADMIN, 'GET', '/api/projects'));
  ok(await api(ADMIN, 'GET', '/api/projects/' + p.id));
  ok(await api(ADMIN, 'PATCH', '/api/projects/' + p.id, { description: 'x' }));
  ok(await api(ADMIN, 'POST', '/api/projects/' + p.id + '/members', { employeeId: ALEX_ID }));
  ok(await api(ADMIN, 'POST', '/api/projects/' + p.id + '/members', { employeeId: S.neha }));
  assert.ok((await mailsTo('neha@oment.test', /added to Test Project/)).length);
  ok(await api(ADMIN, 'DELETE', '/api/projects/' + p.id + '/members/' + S.neha));
  assert.ok((await mailsTo('neha@oment.test', /removed from/)).length);
  ok(await api(ADMIN, 'GET', '/api/projects/' + p.id + '/progress'));
  const m = ok(await api(ADMIN, 'POST', '/api/milestones', { projectId: p.id, title: 'Phase 1', amountPaise: 5000000, dueDate: '2026-12-01' })).json.result;
  S.ms = m.id;
  ok(await api(ADMIN, 'GET', '/api/milestones?projectId=' + p.id));
  ok(await api(ADMIN, 'PATCH', '/api/milestones/' + m.id, { title: 'Phase 1 — build' }));
  ok(await api(ADMIN, 'GET', '/api/milestones/' + m.id + '/progress'));
});

test('task lifecycle: assign → timer → comment → submit → reject → approve (emails)', async () => {
  const alexEmail = engineDB().employees.find(e => e.id === ALEX_ID).email;
  const t = ok(await api(ADMIN, 'POST', '/api/deliverables', {
    projectId: S.project, milestoneId: S.ms, title: 'Build login page', assigneeIds: [ALEX_ID], createdById: 100,
    origin: 'ADMIN', dueAt: new Date(Date.now() - 3600e3).toISOString(), estimateSecs: 3600, pricingMode: 'HOURLY'
  })).json.result;
  S.task = t.id;
  assert.ok((await mailsTo(alexEmail, /assigned|New work/i)).length, 'assignment email');
  ok(await api(ALEX, 'GET', '/api/deliverables'));
  ok(await api(ALEX, 'GET', '/api/deliverables/' + t.id));
  ok(await api(ADMIN, 'PATCH', '/api/deliverables/' + t.id, { description: 'Use OTP' }));
  ok(await api(ALEX, 'GET', '/api/wallet/can-start?employeeId=' + ALEX_ID + '&deliverableId=' + t.id));
  ok(await api(ALEX, 'POST', '/api/time/start', { employeeId: ALEX_ID, deliverableId: t.id }));
  assert.ok(ok(await api(ALEX, 'GET', '/api/time/open?employeeId=' + ALEX_ID)).json.result);
  const again = ok(await api(ALEX, 'POST', '/api/time/start', { employeeId: ALEX_ID, deliverableId: t.id })).json.result;
  assert.equal(again.id, ok(await api(ALEX, 'GET', '/api/time/open?employeeId=' + ALEX_ID)).json.result.id, 'reopening the app keeps the same running timer');
  ok(await api(ALEX, 'POST', '/api/time/stop', { employeeId: ALEX_ID }));
  ok(await api(ALEX, 'POST', '/api/deliverables/' + t.id + '/comments', { fromId: ALEX_ID, text: 'Need the API keys' }));
  assert.ok((await mailsTo('owner@oment.test', /New comment/)).length, 'comment → admin');
  ok(await api(ADMIN, 'POST', '/api/deliverables/' + t.id + '/comments', { fromId: 100, text: 'Sent on Slack' }));
  assert.ok((await mailsTo(alexEmail, /New comment/)).length, 'comment → assignee');
  ok(await api(ALEX, 'POST', '/api/deliverables/' + t.id + '/files', { files: [{ name: 'shot.png', size: 10, url: 'data:image/png;base64,AA==' }], which: 'submission' }));
  ok(await api(ALEX, 'DELETE', '/api/deliverables/' + t.id + '/files/0?which=submission'));
  ok(await api(ALEX, 'POST', '/api/deliverables/' + t.id + '/submit', { notes: 'done' }));
  assert.ok((await mailsTo('owner@oment.test', /submitted for review/)).length, 'submit → admin');
  ok(await api(ADMIN, 'POST', '/api/deliverables/' + t.id + '/reject', { reason: 'Button colour wrong' }));
  const rej = await mailsTo(alexEmail, /returned|revision/i);
  assert.ok(rej.length && ok(await api(ADMIN, 'GET', '/api/emails/' + rej[0].id)).json.result.body.includes('Button colour wrong'), 'reason in email');
  ok(await api(ALEX, 'POST', '/api/deliverables/' + t.id + '/submit', { notes: 'fixed' }));
  ok(await api(ADMIN, 'POST', '/api/deliverables/' + t.id + '/approve', { note: 'great' }));
  assert.ok((await mailsTo(alexEmail, /approved/i)).length);
  ok(await api(ADMIN, 'POST', '/api/deliverables/' + t.id + '/reassign', { assigneeIds: [ALEX_ID, ROHAN_ID] }));
  ok(await api(ADMIN, 'GET', '/api/deliverables?projectId=' + S.project + '&page=1&limit=5'));
});

test('milestone pay: allotted hours, cut per extra hour, credited to the team', async () => {
  ok(await rpc(ADMIN, 'DataAPI', 'updateDeliverable', [S.task, { loggedSecs: 3 * 3600 }]));
  ok(await api(ADMIN, 'PATCH', '/api/milestones/' + S.ms, { payPaise: 1000000, payHours: 2, payCutPct: 10, payFloorPct: 60 }));
  const calc = ok(await rpc(ADMIN, 'DataAPI', 'milestonePay', [S.ms])).json.result;
  assert.ok(calc.takenSecs > 0 && calc.cutPct > 0 && calc.cutPct === 10, 'cut applied, never below the 60% floor');
  assert.equal(calc.finalPaise, Math.round(1000000 * (100 - calc.cutPct) / 100));
  assert.equal((await rpc(ALEX, 'DataAPI', 'creditMilestonePay', [S.ms])).status, 403);
  const paid = ok(await rpc(ADMIN, 'DataAPI', 'creditMilestonePay', [S.ms])).json.result;
  assert.ok(paid.shares.some(x => x.employeeId === ALEX_ID && x.amountPaise > 0));
  const w = ok(await api(ADMIN, 'GET', '/api/wallet/' + ALEX_ID)).json.result;
  assert.ok(w.entries.some(e => /Milestone pay/.test(e.why)), 'wallet entry added');
  assert.equal((await rpc(ADMIN, 'DataAPI', 'creditMilestonePay', [S.ms])).status, 409, 'only once');
});

test('subtasks + self-assigned task (email to admin)', async () => {
  const st = ok(await api(ALEX, 'POST', '/api/subtasks', { deliverableId: S.task, title: 'Write tests', assigneeId: ALEX_ID })).json.result;
  ok(await api(ALEX, 'GET', '/api/deliverables/' + S.task + '/subtasks'));
  ok(await api(ALEX, 'PATCH', '/api/subtasks/' + st.id, { status: 'IN_REVIEW' }));
  ok(await api(ADMIN, 'POST', '/api/subtasks/' + st.id + '/reject', { reason: 'more cases' }));
  ok(await api(ADMIN, 'POST', '/api/subtasks/' + st.id + '/approve'));
  ok(await api(ADMIN, 'DELETE', '/api/subtasks/' + st.id));
  const self = ok(await api(ALEX, 'POST', '/api/deliverables', { projectId: S.project, title: 'Refactor auth', assigneeIds: [ALEX_ID], createdById: ALEX_ID, origin: 'SELF', dueAt: new Date(Date.now() + 86400e3).toISOString() })).json.result;
  assert.ok((await mailsTo('owner@oment.test', /added a task/)).length, 'self task → admin');
  ok(await api(ADMIN, 'DELETE', '/api/deliverables/' + self.id));
});

/* ── piece-rate wallet ───────────────────────────────────────────────── */
test('wallet: pricing, agreement, block, settle, disputes, payouts (emails)', async () => {
  const d = ok(await api(ADMIN, 'POST', '/api/deliverables', {
    projectId: S.project, milestoneId: S.ms, title: 'Piece task', assigneeIds: [ROHAN_ID], createdById: 100, origin: 'ADMIN',
    dueAt: new Date(Date.now() + 86400e3).toISOString(), estimateSecs: 7200, pricingMode: 'PIECE', pricePaise: 100000
  })).json.result;
  S.piece = d.id;
  ok(await api(ADMIN, 'POST', '/api/wallet/pricing/' + d.id, { pricePaise: 100000, estimateSecs: 7200 }));
  ok(await api(ADMIN, 'GET', '/api/wallet/agreement/' + d.id + '/hint'));
  ok(await api(ROHAN, 'POST', '/api/wallet/agreement/' + d.id + '/propose', { employeeId: ROHAN_ID, secs: 10800, note: 'needs 3h' }));
  assert.ok((await mailsTo('owner@oment.test', /proposed/)).length, 'proposal → admin');
  ok(await api(ADMIN, 'POST', '/api/wallet/agreement/' + d.id + '/counter', { secs: 9000, note: '2.5h' }));
  const rohanEmail = engineDB().employees.find(e => e.id === ROHAN_ID).email;
  assert.ok((await mailsTo(rohanEmail, /new estimate/i)).length, 'counter → employee');
  ok(await api(ROHAN, 'POST', '/api/wallet/agreement/' + d.id + '/accept', { employeeId: ROHAN_ID }));

  const d2 = ok(await api(ADMIN, 'POST', '/api/deliverables', { projectId: S.project, title: 'Piece 2', assigneeIds: [ROHAN_ID], createdById: 100, origin: 'ADMIN', dueAt: new Date(Date.now() + 86400e3).toISOString(), estimateSecs: 7200, pricingMode: 'PIECE', pricePaise: 50000 })).json.result;
  ok(await api(ROHAN, 'POST', '/api/wallet/agreement/' + d2.id + '/flag', { employeeId: ROHAN_ID, reason: 'unrealistic' }));
  ok(await api(ADMIN, 'POST', '/api/wallet/agreement/' + d2.id + '/counter', { secs: 10000, note: 'ok more' }));
  ok(await api(ROHAN, 'POST', '/api/wallet/agreement/' + d2.id + '/propose', { employeeId: ROHAN_ID, secs: 11000, note: 'a bit more' }));
  ok(await api(ADMIN, 'POST', '/api/wallet/agreement/' + d2.id + '/accept-proposal'));

  ok(await api(ROHAN, 'POST', '/api/time/start', { employeeId: ROHAN_ID, deliverableId: d.id }));
  ok(await api(ROHAN, 'POST', '/api/wallet/block/' + d.id, { byId: ROHAN_ID, reason: 'no access' }));
  assert.ok(ok(await api(ADMIN, 'GET', '/api/wallet/blocked')).json.result.some(b => b.id === d.id));
  ok(await api(ADMIN, 'POST', '/api/wallet/unblock/' + d.id, { byId: 100, note: 'granted' }));
  await rpc(ADMIN, 'DataAPI', 'updateDeliverable', [d.id, { loggedSecs: 9000 + 3600 + 120 }]);
  ok(await api(ROHAN, 'POST', '/api/deliverables/' + d.id + '/submit', { notes: 'done' }));
  const prev = ok(await api(ADMIN, 'GET', '/api/wallet/settlement-preview/' + d.id)).json.result;
  assert.ok(prev.finalPaise > 0 && typeof prev.why === 'string', 'settlement preview works');
  const sp = ok(await api(ADMIN, 'GET', '/api/wallet/slab-preview/' + d.id + '?loggedSecs=100')).json.result;
  assert.ok('currentPaise' in sp && 'secsToNext' in sp);
  ok(await api(ADMIN, 'POST', '/api/deliverables/' + d.id + '/approve', {}));
  const w = ok(await api(ADMIN, 'GET', '/api/wallet/' + ROHAN_ID)).json.result;
  const credit = w.entries.find(e => e.deliverableId === d.id && e.type === 'TASK_CREDIT');
  assert.ok(credit);
  const creditMails = (await mailsTo(rohanEmail)).filter(m => /credited|wallet/i.test(m.subject));
  assert.ok(creditMails.length <= 1, 'wallet credit never emailed twice');

  ok(await api(ADMIN, 'PATCH', '/api/wallet/policy', { showMoneyToEmployees: true }));
  ok(await api(ADMIN, 'GET', '/api/wallet/policy'));
  ok(await api(ROHAN, 'GET', '/api/wallet/' + ROHAN_ID));
  ok(await api(ADMIN, 'GET', '/api/wallet-ledger?employeeId=' + ROHAN_ID));
  ok(await api(ADMIN, 'POST', '/api/wallet-entries', { employeeId: ROHAN_ID, type: 'BONUS', amountPaise: 20000, why: 'Great month' }));
  assert.ok((await mailsTo(rohanEmail, /Bonus/)).length, 'bonus email');
  ok(await api(ROHAN, 'POST', '/api/wallet-disputes', { entryId: credit.id, employeeId: ROHAN_ID, reason: 'slab was unfair' }));
  assert.ok((await mailsTo('owner@oment.test', /disputed/)).length);
  const disp = ok(await api(ADMIN, 'GET', '/api/wallet-disputes')).json.result[0];
  ok(await api(ADMIN, 'POST', '/api/wallet-disputes/' + disp.id + '/resolve', { accept: false, note: 'Slab applies as agreed' }));
  assert.ok((await mailsTo(rohanEmail, /dispute/i)).length);
  ok(await api(ADMIN, 'POST', '/api/wallet-entries', { employeeId: ROHAN_ID, type: 'PAYOUT', amountPaise: -20000, why: 'Bank transfer' }));
  const payoutMails = (await mailsTo(rohanEmail)).filter(m => /payout/i.test(m.subject));
  assert.equal(payoutMails.length, 1, 'payout emailed exactly once');
  ok(await api(ADMIN, 'GET', '/api/wallet-company-summary'));
  ok(await api(ADMIN, 'GET', '/api/wallet-estimate-behaviour'));
  ok(await api(ADMIN, 'GET', '/api/wallet-outbox'));
  ok(await api(ROHAN, 'GET', '/api/focus-queue/' + ROHAN_ID));
  /* recording a payment: it only reduces what is owed, never adds to earnings;
     paying more than is owed is allowed (advance) and can be undone */
  const before = ok(await api(ADMIN, 'GET', '/api/wallet/' + ROHAN_ID)).json.result;
  const bal = w => (w.entries || []).reduce((s, e) => s + e.amountPaise, 0);
  const earned = w => (w.entries || []).filter(e => e.type !== 'PAYOUT').reduce((s, e) => s + e.amountPaise, 0);
  const pay = ok(await api(ADMIN, 'POST', '/api/wallet/payments', { employeeId: ROHAN_ID, amountPaise: 150000, method: 'UPI', reference: 'UTR77', projectId: S.project, note: 'Part payment' })).json.result;
  const after = ok(await api(ADMIN, 'GET', '/api/wallet/' + ROHAN_ID)).json.result;
  assert.equal(bal(after), bal(before) - 150000, 'balance goes down by the payment');
  assert.equal(earned(after), earned(before), 'earnings do not change when you pay');
  ok(await api(ADMIN, 'POST', '/api/wallet/payments', { employeeId: ROHAN_ID, amountPaise: 99999999, note: 'advance' }), 'paying more than owed is an advance');
  ok(await rpc(ADMIN, 'Wallet', 'reversePayment', [pay.id, 'mistake']), 'a payment can be undone');
  assert.equal((await rpc(ADMIN, 'Wallet', 'reversePayment', [pay.id, 'again'])).status, 409, 'only once');
});

test('ledger is append-only at the storage layer', async () => {
  const store = require('../src/services/store.service');
  const db = store.loadAll();
  db.walletEntries[0].amountPaise = 1;
  assert.throws(() => store.saveAll(db), e => e.code === 'LOCKED');
  const db2 = store.loadAll();
  db2.walletEntries.pop();
  assert.throws(() => store.saveAll(db2), e => e.code === 'LOCKED');
});

/* ── attendance + tracker ────────────────────────────────────────────── */
test('attendance: ensure, heartbeat (never shrinks), break, live board, punch-out', async () => {
  ok(await api(ALEX, 'POST', '/api/attendance/ensure-today', { employeeId: ALEX_ID }));
  const h1 = ok(await api(ALEX, 'POST', '/api/attendance/heartbeat', { sessionSecs: 600, activeSecs: 400, idleSecs: 200, perDeliverableSecs: { [S.task]: 400 }, currentDeliverableId: S.task })).json.result;
  assert.equal(h1.activeSecs >= 400, true);
  const h2 = ok(await api(ALEX, 'POST', '/api/attendance/heartbeat', { sessionSecs: 100, activeSecs: 50 })).json.result;
  assert.ok(h2.activeSecs >= 400 && h2.sessionSecs >= 600, 'totals never go down');
  assert.ok(ok(await api(ALEX, 'GET', '/api/attendance/today')).json.result.lastSeenAt);
  ok(await api(ALEX, 'POST', '/api/attendance/break', { employeeId: ALEX_ID, break: { type: 'Lunch', startAt: new Date(Date.now() - 1800e3).toISOString(), endAt: new Date().toISOString(), secs: 1800 } }));
  const live = ok(await api(ADMIN, 'GET', '/api/attendance/live')).json.result;
  assert.equal(live.find(x => x.employeeId === ALEX_ID).online, true);
  assert.equal((await api(ALEX, 'GET', '/api/attendance/live')).status, 403);
  ok(await api(ADMIN, 'GET', '/api/attendance?employeeId=' + ALEX_ID));
  const out = ok(await api(ALEX, 'POST', '/api/attendance/punch-out', { sessionSecs: 700, activeSecs: 450 })).json.result;
  assert.ok(out.lastOutAt, 'logout time saved');
  assert.equal(out.status, out.activeSecs < 4 * 3600 ? 'HALF_DAY' : 'PRESENT', 'half day only when under 4 h worked');
  const rec = engineDB().attendance.find(a => a.employeeId === ALEX_ID && a.lastOutAt);
  ok(await api(ADMIN, 'PATCH', '/api/attendance/' + rec.id, { status: 'PRESENT' }));
  ok(await api(ADMIN, 'POST', '/api/attendance/heartbeat', { employeeId: ROHAN_ID, sessionSecs: 60 }));
});

/* ── HRM ─────────────────────────────────────────────────────────────── */
test('HRM: holidays, leave, comp-off, regularisation, reports (emails)', async () => {
  ok(await api(ADMIN, 'GET', '/api/hrm/policy'));
  ok(await api(ADMIN, 'PATCH', '/api/hrm/policy', { lateAfter: '10:15' }));
  const hol = ok(await api(ADMIN, 'POST', '/api/hrm/holidays', { date: '2026-12-25', name: 'Christmas' })).json.result;
  assert.ok((await mailsTo('neha@oment.test', /Holiday: Christmas/)).length, 'holiday to everyone');
  ok(await api(ALEX, 'GET', '/api/hrm/holidays'));
  ok(await api(ADMIN, 'DELETE', '/api/hrm/holidays/' + hol.id));
  ok(await api(ALEX, 'GET', '/api/hrm/balances/' + ALEX_ID));
  ok(await api(ADMIN, 'POST', '/api/hrm/comp-off', { employeeId: ALEX_ID, days: 1, reason: 'Worked Sunday' }));
  const alexEmail = engineDB().employees.find(e => e.id === ALEX_ID).email;
  assert.ok((await mailsTo(alexEmail, /Comp-off/)).length);

  const H_ = require('../src/services/engine.service').get().HRM, U_ = require('../src/services/engine.service').get().Utils;
  const workDay = from => { let d = new Date(from); for (let i = 0; i < 30; i++, d = new Date(d.getTime() + 86400e3)) { const x = U_.isoDate(d); if (H_.workingDaysBetween(x, x).length > 0) return { d, iso: x }; } throw new Error('no working day'); };
  const w1 = workDay(Date.now() + 30 * 86400e3), day = w1.d, iso = w1.iso;
  const lv = ok(await api(ALEX, 'POST', '/api/hrm/leave', { employeeId: ALEX_ID, type: 'CL', fromDate: iso, toDate: iso, reason: 'family' })).json.result;
  const approver = engineDB().employees.find(e => e.id === lv.approverId);
  const approverEmail = approver ? approver.email : 'owner@oment.test';
  assert.ok((await mailsTo(approverEmail, /Leave request/)).length, 'leave → approver (manager or admin)');
  ok(await api(ADMIN, 'GET', '/api/hrm/leave'));
  ok(await api(ADMIN, 'POST', '/api/hrm/leave/' + lv.id + '/approve', { note: 'ok' }));
  assert.ok((await mailsTo(alexEmail, /Leave approved/)).length);
  ok(await api(ALEX, 'POST', '/api/hrm/leave/' + lv.id + '/cancel'));
  assert.ok((await mailsTo(approverEmail, /cancelled a leave/)).length);
  const iso2 = workDay(day.getTime() + 7 * 86400e3).iso;
  const lv2 = ok(await api(ALEX, 'POST', '/api/hrm/leave', { employeeId: ALEX_ID, type: 'SL', fromDate: iso2, toDate: iso2, reason: 'doctor' })).json.result;
  ok(await api(ADMIN, 'POST', '/api/hrm/leave/' + lv2.id + '/reject', { reason: 'release week' }));
  assert.ok((await mailsTo(alexEmail, /declined/)).length);

  const y = new Date(Date.now() - 86400e3).toISOString().slice(0, 10);
  const rg = ok(await api(ALEX, 'POST', '/api/hrm/regularisations', { employeeId: ALEX_ID, date: y, inTime: '09:30', outTime: '18:30', reason: 'forgot to log in' })).json.result;
  const rApprover = engineDB().employees.find(e => e.id === rg.approverId);
  assert.ok((await mailsTo(rApprover ? rApprover.email : 'owner@oment.test', /regularisation/i)).length);
  ok(await api(ADMIN, 'GET', '/api/hrm/regularisations'));
  ok(await api(ADMIN, 'POST', '/api/hrm/regularisations/' + rg.id + '/approve'));
  const y2 = new Date(Date.now() - 2 * 86400e3).toISOString().slice(0, 10);
  const rg2 = ok(await api(ALEX, 'POST', '/api/hrm/regularisations', { employeeId: ALEX_ID, date: y2, inTime: '10:00', outTime: '18:00', reason: 'wifi' })).json.result;
  ok(await api(ADMIN, 'POST', '/api/hrm/regularisations/' + rg2.id + '/reject', { reason: 'no proof' }));

  const now = new Date();
  ok(await api(ADMIN, 'GET', '/api/hrm/today-board'));
  ok(await api(ADMIN, 'GET', '/api/hrm/register?year=' + now.getFullYear() + '&month=' + (now.getMonth() + 1)));
  ok(await api(ADMIN, 'GET', '/api/hrm/timesheet?employeeId=' + ALEX_ID + '&from=2026-09-01&to=2026-09-30'));
  ok(await api(ADMIN, 'GET', '/api/hrm/utilisation?from=2026-09-01&to=2026-09-30'));
  assert.ok(Array.isArray(ok(await api(ALEX, 'GET', '/api/hrm/working-days?from=2026-09-01&to=2026-09-30')).json.result));
});

/* ── invoices ─────────────────────────────────────────────────────────── */
test('invoices: create, send (PDF email), pay (receipt), cancel, pdf download', async () => {
  ok(await api(ADMIN, 'GET', '/api/invoices/peek-number'));
  ok(await api(ADMIN, 'GET', '/api/invoices/uninvoiced-milestones'));
  const inv = ok(await api(ADMIN, 'POST', '/api/invoices', {
    projectId: S.project, clientName: 'Acme Ltd', clientEmail: 'billing@acme.test', placeOfSupply: '09',
    issueDate: '2026-09-01', dueDate: '2026-09-10', lines: [{ description: 'Phase 1', hsnSac: '998314', qty: 1, ratePaise: 100000 }]
  })).json.result;
  ok(await api(ADMIN, 'PATCH', '/api/invoices/' + inv.id, { notes: 'Thanks' }));
  ok(await api(ADMIN, 'POST', '/api/invoices/' + inv.id + '/send'));
  const m = (await mailsTo('billing@acme.test', /Invoice/))[0];
  assert.ok(m && String(m.meta.attachInvoiceId) === String(inv.id), 'invoice email with PDF attachment');
  const pdf = await api(ADMIN, 'GET', '/api/invoices/' + inv.id + '/pdf');
  assert.equal(pdf.status, 200); assert.equal(pdf.buf.slice(0, 4).toString(), '%PDF');
  assert.equal((await api(ADMIN, 'POST', '/api/invoices/' + inv.id + '/payment', { amountPaise: 999999999 })).status, 400, 'more than balance');
  const paid = ok(await api(ADMIN, 'POST', '/api/invoices/' + inv.id + '/payment', { amountPaise: 50000, date: '2026-09-02', method: 'UPI', reference: 'UTR123' })).json.result;
  assert.equal(paid.payments[0].method, 'UPI'); assert.equal(paid.status, 'PARTIALLY_PAID');
  ok(await api(ADMIN, 'POST', '/api/invoices/' + inv.id + '/send'));
  assert.equal(engineDB().invoices.find(x => x.id === inv.id).status, 'PARTIALLY_PAID', 'resend keeps part-paid');
  assert.ok((await mailsTo('billing@acme.test', /Payment received/)).length, 'receipt to client');
  assert.ok((await mailsTo('owner@oment.test', /Payment recorded/)).length);
  ok(await api(ADMIN, 'GET', '/api/invoices?status=PARTIALLY_PAID'));
  const inv2 = ok(await api(ADMIN, 'POST', '/api/invoices', { clientName: 'Beta', clientEmail: 'ap@beta.test', lines: [{ description: 'x', qty: 1, ratePaise: 1000 }] })).json.result;
  ok(await api(ADMIN, 'POST', '/api/invoices/' + inv2.id + '/send'));
  ok(await api(ADMIN, 'POST', '/api/invoices/' + inv2.id + '/cancel', { reason: 'duplicate' }));
  assert.ok((await mailsTo('ap@beta.test', /cancelled/)).length);
  assert.equal((await api(ADMIN, 'POST', '/api/invoices/' + inv2.id + '/payment', { amountPaise: 100 })).status, 409, 'no payment on cancelled');
  const inv3 = ok(await api(ADMIN, 'POST', '/api/invoices', { clientName: 'Gamma', lines: [{ description: 'y', qty: 1, ratePaise: 1000 }] })).json.result;
  /* recurring plans */
  const plan = ok(await api(ADMIN, 'POST', '/api/invoices/recurring', { name: 'Monthly retainer', clientName: 'Acme Ltd', clientEmail: 'billing@acme.test', frequency: 'monthly', lines: [{ description: 'Retainer', qty: 1, ratePaise: 5000000 }], autoSend: true })).json.result;
  assert.equal(plan.created.length, 1, 'first invoice made today');
  assert.equal(plan.status, 'ACTIVE');
  ok(await api(ADMIN, 'GET', '/api/invoices/recurring'));
  const paused = ok(await api(ADMIN, 'PATCH', '/api/invoices/recurring/' + plan.id, { active: false })).json.result;
  assert.equal(paused.status, 'PAUSED');
  assert.equal((await api(ADMIN, 'POST', '/api/invoices/recurring', { clientName: 'X', frequency: 'daily', lines: [{ qty: 1, ratePaise: 1 }] })).status, 400);
  ok(await api(ADMIN, 'DELETE', '/api/invoices/recurring/' + plan.id));
  assert.equal((await rpc(ADMIN, 'DataAPI', 'runRecurringInvoices', [])).status, 403, 'server job only');
  const inv4 = ok(await api(ADMIN, 'POST', '/api/invoices', { clientName: 'Delta', lines: [{ description: 'z', qty: 1, ratePaise: 1000 }] })).json.result;
  const paidDraft = ok(await api(ADMIN, 'POST', '/api/invoices/' + inv4.id + '/payment', { amountPaise: 500, method: 'Cash' }), 'payment on a draft issues it').json.result;
  assert.equal(paidDraft.status, 'PARTIALLY_PAID'); assert.ok(paidDraft.issuedWithoutEmail);
  ok(await api(ADMIN, 'DELETE', '/api/invoices/' + inv3.id));
  assert.equal((await api(ADMIN, 'POST', '/api/invoices', { clientName: 'Bad', lines: [] })).status, 400, 'validation, nothing saved');
});

/* ── communication ───────────────────────────────────────────────────── */
test('notices, messages, calendar, notifications (emails)', async () => {
  const n = ok(await api(ADMIN, 'POST', '/api/notices', { title: 'Office closed Friday', content: 'Diwali prep', recipients: 'all', priority: 'Normal' })).json.result;
  ok(await api(ADMIN, 'PATCH', '/api/notices/' + n.id, { content: 'Diwali prep — enjoy!' }));
  ok(await api(ADMIN, 'POST', '/api/notices/' + n.id + '/send'));
  const alexEmail = engineDB().employees.find(e => e.id === ALEX_ID).email;
  const nm = (await mailsTo(alexEmail, /New notice/))[0];
  assert.ok(nm && ok(await api(ADMIN, 'GET', '/api/emails/' + nm.id)).json.result.body.includes('Diwali prep'), 'notice content in email');
  assert.ok(ok(await api(ALEX, 'GET', '/api/notices')).json.result.some(x => x.id === n.id), 'employee sees sent notice');
  ok(await api(ALEX, 'POST', '/api/notices/' + n.id + '/read', { employeeId: ALEX_ID }));
  const npdf = await api(ALEX, 'GET', '/api/notices/' + n.id + '/pdf');
  assert.equal(npdf.status, 200); assert.equal(npdf.buf.slice(0, 4).toString(), '%PDF');
  assert.ok(ok(await api(ADMIN, 'GET', '/api/notices')).json.result.find(x => x.id === n.id).readBy.includes(ALEX_ID), 'admin sees who read it');
  assert.ok(ok(await api(ALEX, 'GET', '/api/notices')).json.result.every(x => String(x.status).toUpperCase() === 'SENT'), 'employee never sees drafts');
  const n2 = ok(await api(ADMIN, 'POST', '/api/notices', { title: 'Draft', content: 'x', recipients: 'all' })).json.result;
  ok(await api(ADMIN, 'DELETE', '/api/notices/' + n2.id));

  const conv = ok(await api(ADMIN, 'GET', '/api/conversations')).json.result.find(c => c.withId === ALEX_ID);
  ok(await api(ADMIN, 'POST', '/api/conversations/' + conv.id + '/messages', { fromId: 100, text: 'Call at 5?' }));
  ok(await api(ADMIN, 'POST', '/api/conversations/' + conv.id + '/messages', { fromId: 100, text: 'Or 6?' }));
  assert.equal((await mailsTo(alexEmail, /New message/)).length, 1, 'chat emails are throttled');
  ok(await api(ADMIN, 'POST', '/api/conversations/' + conv.id + '/read'));

  const ev = ok(await api(ADMIN, 'POST', '/api/calendar', { title: 'Sprint review', date: '2026-10-02', time: '15:00', type: 'Review', attendeeIds: [ALEX_ID] })).json.result;
  assert.ok((await mailsTo(alexEmail, /Invite: Sprint review/)).length);
  ok(await api(ALEX, 'GET', '/api/calendar'));
  ok(await api(ADMIN, 'DELETE', '/api/calendar/' + ev.id));

  const notes = ok(await api(ALEX, 'GET', '/api/notifications?recipientId=' + ALEX_ID)).json.result;
  ok(await api(ALEX, 'POST', '/api/notifications/' + notes[0].id + '/read'));
  ok(await api(ALEX, 'POST', '/api/notifications/read-all', { recipientId: ALEX_ID }));
});

test('email category switch turns emails off', async () => {
  ok(await api(ADMIN, 'PATCH', '/api/settings/email', { categories: { notices: false } }));
  const seen = new Set((await outbox()).map(m => m.id));
  const n = ok(await api(ADMIN, 'POST', '/api/notices', { title: 'Silent notice', content: 'x', recipients: 'all' })).json.result;
  ok(await api(ADMIN, 'POST', '/api/notices/' + n.id + '/send'));
  assert.equal((await outbox()).filter(m => !seen.has(m.id) && /New notice/.test(m.subject)).length, 0);
  ok(await api(ADMIN, 'PATCH', '/api/settings/email', { categories: { notices: true } }));
});

/* ── dashboards, profit, AI, signals ─────────────────────────────────── */
test('dashboard, profitability, een, signals', async () => {
  for (const p of ['/api/activity', '/api/call-logs', '/api/kpis', '/api/revenue-series?monthsBack=6']) ok(await api(ADMIN, 'GET', p));
  ok(await api(ADMIN, 'GET', '/api/profit/settings'));
  ok(await api(ADMIN, 'PATCH', '/api/profit/settings', { overheadPct: 20 }));
  ok(await api(ADMIN, 'POST', '/api/profit/rates/' + ALEX_ID, { costPerHourPaise: 50000, billRatePaise: 150000 }));
  for (const p of ['/api/profit/rate-coverage', '/api/profit/projects/' + S.project, '/api/profit/portfolio', '/api/profit/by-client', '/api/profit/by-employee?from=2026-01-01&to=2026-12-31', '/api/profit/alerts', '/api/profit/loaded-rate/' + ALEX_ID]) ok(await api(ADMIN, 'GET', p), p);
  assert.equal((await api(ALEX, 'GET', '/api/profit/portfolio')).status, 403);
  ok(await api(ADMIN, 'GET', '/api/een/status'));
  assert.equal((await api(ADMIN, 'POST', '/api/een/chat', { payload: {} })).status, 503, 'needs GEMINI_API_KEY');
  assert.equal((await api(ALEX, 'POST', '/api/een/chat', {})).status, 403);
  ok(await api(ADMIN, 'GET', '/api/signals'));
  ok(await api(ALEX, 'GET', '/api/signals'));
});

/* ── RPC parity: every method the frontend adapter calls ─────────────── */
test('rpc works for frontend methods and refuses unknown ones', async () => {
  ok(await rpc(ADMIN, 'DataAPI', 'getKpis', []));
  const r = ok(await rpc(ADMIN, 'DataAPI', 'updateSettings', [{ phone: '+91 2' }]));
  assert.ok(r.json.snapshot, 'mutations return a fresh snapshot');
  ok(await rpc(ADMIN, 'Wallet', 'computeSettlement', [engineDB().deliverables[0]]));
  ok(await rpc(ALEX, 'HRM', 'workingDaysBetween', ['2026-09-01', '2026-09-30']));
  assert.equal((await rpc(ADMIN, 'DataAPI', 'nope', [])).status, 404);
  assert.equal((await api(ADMIN, 'POST', '/api/rpc', { api: 'DataAPI' })).status, 400);
});

/* ── integrations ────────────────────────────────────────────────────── */
test('CRM deal-won webhook', async () => {
  assert.equal((await api(null, 'POST', '/api/integrations/crm/deal-won', {})).status, 401);
  const sample = ok(await api(ADMIN, 'GET', '/api/integrations/crm/sample')).json.result;
  sample.dealId = 'crm_deal_test_1';
  const r = await api(null, 'POST', '/api/integrations/crm/deal-won', sample, { headers: { 'X-Webhook-Secret': 'test-secret-123' } });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  assert.ok(engineDB().projects.some(p => p.crmDealId === 'crm_deal_test_1'));
  ok(await api(null, 'GET', '/api/integrations/crm/accounts/' + sample.accountId + '/health', undefined, { headers: { 'X-Webhook-Secret': 'test-secret-123' } }));
  assert.equal((await api(null, 'POST', '/api/integrations/crm/deal-won', { dealId: 'x' }, { headers: { 'X-Webhook-Secret': 'test-secret-123' } })).status, 400);
});

/* ── scheduler + email worker ────────────────────────────────────────── */
test('reminder jobs + worker delivers (console transport)', async () => {
  ok(await api(ADMIN, 'GET', '/api/admin/scheduler'));
  const before = (await outbox()).length;
  for (const job of ['recurringInvoices', 'overdueTasks', 'overdueInvoices', 'noPunchIn', 'missedPunchOut', 'leaveTomorrow', 'adminDigest', 'longTimers'])
    ok(await api(ADMIN, 'POST', '/api/admin/scheduler/' + job + '/run'), job);
  assert.equal((await api(ADMIN, 'POST', '/api/admin/scheduler/nope/run')).status, 404);
  const after_ = await outbox();
  assert.ok(after_.length > before, 'reminders queued');
  assert.ok(after_.some(m => /overdue/i.test(m.subject)), 'overdue task reminder');
  assert.ok(after_.some(m => m.to === 'billing@acme.test' && /reminder/i.test(m.subject)), 'invoice reminder to client');
  assert.ok(after_.some(m => /Daily summary/.test(m.subject)), 'admin digest');
  /* once per day: running again does not duplicate */
  const n1 = (await outbox()).filter(m => /Daily summary/.test(m.subject)).length;
  ok(await api(ADMIN, 'POST', '/api/admin/scheduler/adminDigest/run'));
  assert.equal((await outbox()).filter(m => /Daily summary/.test(m.subject)).length, n1);

  ok(await api(ADMIN, 'POST', '/api/emails/process'));
  ok(await api(ADMIN, 'POST', '/api/emails/process'));
  const list = ok(await api(ADMIN, 'GET', '/api/emails?status=LOGGED&limit=5')).json.result;
  assert.ok(list.total > 0 && list.items[0].transport === 'console');
  const resent = ok(await api(ADMIN, 'POST', '/api/emails/' + list.items[0].id + '/retry')).json.result;
  assert.notEqual(resent.id, list.items[0].id, 'resend makes a new copy');
  assert.ok(/Sent by Oment/.test(resent.html || ''), 'rebuilt in the current design');
});

/* ── persistence: MongoDB holds exactly what the engine has ──────────── */
test('restart-safe: reloading from MongoDB gives the same data', async () => {
  const store = require('../src/services/store.service');
  const { supportsTransactions } = require('../src/config/db');
  await store.flush();
  const memory = JSON.stringify(store.loadAll());
  await store.load({ transactions: await supportsTransactions() });
  assert.equal(JSON.stringify(store.loadAll()), memory);
  assert.equal(JSON.stringify(store.loadAll().employees), JSON.stringify(engineDB().employees));
});

test('failed request changes nothing', async () => {
  const n = engineDB().projects.length;
  assert.equal((await api(ADMIN, 'POST', '/api/projects', { name: 'no client' })).status, 400);
  assert.equal(engineDB().projects.length, n);
});

/* ── cleanup endpoints + reset ───────────────────────────────────────── */
test('deletes + workspace reset', async () => {
  ok(await api(ADMIN, 'DELETE', '/api/deliverables/' + S.task));
  ok(await api(ADMIN, 'DELETE', '/api/milestones/' + S.ms));
  const p = ok(await api(ADMIN, 'POST', '/api/projects', { name: 'Temp', clientName: 'T' })).json.result;
  ok(await api(ADMIN, 'DELETE', '/api/projects/' + p.id));
  ok(await api(ADMIN, 'DELETE', '/api/employees/' + S.neha));
  assert.equal((await api(null, 'POST', '/api/auth/login', { username: 'neha', password: 'reset99' })).status, 401);
  const d = ok(await api(ADMIN, 'POST', '/api/departments', { name: 'Temp dept' })).json.result;
  ok(await api(ADMIN, 'DELETE', '/api/departments/' + d.id));

  assert.equal((await api(ADMIN, 'POST', '/api/admin/reset', { mode: 'demo' })).status, 400, 'needs confirm');
  const r = ok(await api(ADMIN, 'POST', '/api/admin/reset', { mode: 'empty', confirm: 'RESET' }));
  assert.equal(r.json.snapshot.employees.length, 0);
  ok(await api(ADMIN, 'GET', '/api/snapshot'), 'admin token still valid');
  ok(await api(ADMIN, 'POST', '/api/admin/reset', { mode: 'demo', confirm: 'RESET' }));
  ok(await api(null, 'POST', '/api/auth/login', { username: 'alex', password: 'oment123' }), 'demo logins work after reset');
});

/* ── files (GridFS) ──────────────────────────────────────────────────── */
test('files: employee uploads, admin downloads, others blocked', async () => {
  const A = ok(await api(null, 'POST', '/api/auth/login', { username: 'admin', password: 'admin123' })).json.token;
  const E = ok(await api(null, 'POST', '/api/auth/login', { username: 'alex', password: 'oment123' })).json;
  const R = ok(await api(null, 'POST', '/api/auth/login', { username: 'rohan', password: 'oment123' })).json.token;
  const body = Buffer.from('hello file ' + Date.now());
  const up = await H.raw(E.token, 'POST', '/api/files?name=' + encodeURIComponent('work.txt') + '&mime=text/plain', body);
  assert.equal(up.status, 201);
  const id = up.json.result.fileId;
  const dl = await H.raw(A, 'GET', '/api/files/' + id);
  assert.equal(dl.status, 200); assert.ok(dl.buf.equals(body), 'same bytes back');
  assert.equal((await H.raw(R, 'GET', '/api/files/' + id)).status, 403, 'another employee cannot open it');
  assert.equal((await H.raw(A, 'GET', '/api/files/000000000000000000000000')).status, 404);
});

/* ── every endpoint was exercised ────────────────────────────────────── */
test('coverage: every route was called at least once', () => {
  const all = require('../src/utils/listRoutes')(app).map(r => r.method + ' ' + r.path);
  /* een/chat needs a real GEMINI_API_KEY to succeed; it is called above and
     answers 503 NOT_CONFIGURED, which is the expected result without a key */
  const external = ['POST /api/een/chat'];
  const missing = all.filter(r => !H.hits.has(r) && !external.includes(r));
  assert.deepEqual(missing, [], 'untested routes');
});