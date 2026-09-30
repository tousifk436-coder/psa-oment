/* ============================================================================
   EMAIL SERVICE — queue, settings, SMTP worker, test mail
   ----------------------------------------------------------------------------
   Every email goes into the outbox (the engine's DB.outbox list, so the admin
   Payouts → Outbox view shows it too) as status QUEUED, inside the same unit
   of work as the change that caused it. The worker sends them:

     QUEUED  → SENT            (SMTP accepted it)
             → FAILED          (retried with back-off: 1m, 5m, 15m, 1h, 6h)
             → LOGGED          (no SMTP_HOST set: printed to the server console)
             → SKIPPED         (email switched off for that category)

   Admin controls per-category on/off and the admin address from
   Settings → Email (GET/PATCH /api/settings/email).
   ============================================================================ */
'use strict';
const nodemailer = require('nodemailer');
const env = require('../config/env');
const store = require('./store.service');
const engine = require('./engine.service');
const template = require('./email/template');
const pdf = require('./pdf.service');
const logger = require('../utils/logger');
const ApiError = require('../utils/ApiError');

const SETTINGS_KEY = 'emailSettings';

const CATEGORIES = {
  account: 'Account & login (welcome, password reset, deactivation)',
  tasks: 'Tasks (assigned, submitted, approved, returned, comments)',
  estimates: 'Estimates & blocked tasks',
  wallet: 'Wallet, payouts & disputes',
  leave: 'Leave, comp-off & holidays',
  attendance: 'Attendance & regularisation',
  projects: 'Project membership',
  notices: 'Company notices',
  messages: 'Chat messages',
  calendar: 'Calendar invites',
  invoices: 'Invoices & receipts to clients',
  reminders: 'Automatic reminders (overdue, missed punch-in/out, long timers)',
  digest: 'Daily admin summary'
};

const BACKOFF_MS = [60e3, 5 * 60e3, 15 * 60e3, 60 * 60e3, 6 * 60 * 60e3];
const OUTBOX_CAP = 500;

const uid = () => 'mail_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const isEmail = s => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || '').trim());

/* ── settings ─────────────────────────────────────────────────────────── */
function defaults() {
  const c = {};
  Object.keys(CATEGORIES).forEach(k => { c[k] = true; });
  return { enabled: env.EMAIL_ENABLED, adminEmail: env.ADMIN_EMAIL || '', categories: c };
}

function getSettings() {
  let saved = {};
  try { saved = JSON.parse(store.getLs(SETTINGS_KEY) || '{}'); } catch (e) { saved = {}; }
  const d = defaults();
  return {
    enabled: saved.enabled === undefined ? d.enabled : !!saved.enabled,
    adminEmail: saved.adminEmail !== undefined ? saved.adminEmail : d.adminEmail,
    categories: Object.assign(d.categories, saved.categories || {})
  };
}

function publicSettings() {
  const s = getSettings();
  return Object.assign(s, {
    categoryLabels: CATEGORIES,
    resolvedAdminEmail: adminAddress(),
    smtp: { configured: smtpConfigured(), host: env.SMTP.host || env.SMTP.service || null, port: env.SMTP.port, from: env.SMTP.from, user: env.SMTP.user || null }
  });
}

function updateSettings(patch) {
  patch = patch || {};
  const cur = getSettings();
  if (patch.adminEmail !== undefined && patch.adminEmail !== '' && !isEmail(patch.adminEmail))
    throw new ApiError('VALIDATION', 'Admin email is not a valid address');
  const next = {
    enabled: patch.enabled === undefined ? cur.enabled : !!patch.enabled,
    adminEmail: patch.adminEmail === undefined ? cur.adminEmail : String(patch.adminEmail).trim(),
    categories: Object.assign({}, cur.categories)
  };
  Object.keys(patch.categories || {}).forEach(k => {
    if (!CATEGORIES[k]) throw new ApiError('VALIDATION', 'Unknown email category: ' + k);
    next.categories[k] = !!patch.categories[k];
  });
  store.setLs(SETTINGS_KEY, JSON.stringify(next));
  return publicSettings();
}

/* ── people ───────────────────────────────────────────────────────────── */
function db() { return engine.get().DataAPI.raw(); }

function companyName() {
  const D = db();
  return (D.settings && D.settings.companyName) || (D.company && D.company.name) || 'Oment';
}

function adminAddress() {
  const D = db();
  const s = getSettings();
  const cands = [s.adminEmail, env.ADMIN_EMAIL, D.settings && D.settings.email, D.company && D.company.email, isEmail(env.ADMIN_USERNAME) ? env.ADMIN_USERNAME : ''];
  return cands.find(isEmail) || '';
}

function isAdminId(id) {
  const D = db();
  return id != null && D.adminUser && Number(id) === Number(D.adminUser.id);
}

/* → { email, name, role } or null */
function person(id) {
  const D = db();
  if (isAdminId(id)) return { email: adminAddress(), name: (D.adminUser && D.adminUser.name) || 'Admin', role: 'ADMIN' };
  const e = (D.employees || []).find(x => Number(x.id) === Number(id));
  if (!e) return null;
  return { email: e.email, name: e.name, role: 'EMPLOYEE', active: e.active !== false };
}

function appLink(role, hash) {
  return env.APP_URL + (role === 'ADMIN' ? '/admin/' : '/employee/') + (hash || '');
}

const firstName = n => String(n || '').trim().split(/\s+/)[0] || 'there';

/* ── queue (call inside a unit of work) ───────────────────────────────── */
/**
 * @param {object} m
 *   to, name, category, kind, subject, heading, lines, facts, button,
 *   attachInvoiceId, meta, force (ignore category switch)
 */
function queue(m) {
  const D = db();
  const to = String(m.to || '').trim();
  if (!isEmail(to)) return null;
  const s = getSettings();
  const off = !s.enabled || (m.category && s.categories[m.category] === false);
  if (off && !m.force) return null;

  const { html, text } = template.render({
    company: companyName(),
    heading: m.heading || m.subject,
    greeting: m.name ? 'Hi ' + firstName(m.name) + ',' : null,
    lines: m.lines, facts: m.facts, button: m.button, footer: m.footer
  });
  const row = {
    id: uid(), to, subject: template.plain(m.subject), body: text, html,
    kind: m.kind || 'INFO', category: m.category || 'general',
    meta: Object.assign({}, m.meta || {}, m.attachInvoiceId ? { attachInvoiceId: m.attachInvoiceId } : {}),
    status: 'QUEUED', attempts: 0, createdAt: new Date().toISOString(), nextAttemptAt: null
  };
  D.outbox = D.outbox || [];
  D.outbox.unshift(row);
  trimOutbox(D);
  engine.get().DataAPI.touch();
  return row;
}

/* same message to many people */
function queueMany(people, build) {
  const seen = new Set();
  (people || []).forEach(p => {
    if (!p || !isEmail(p.email) || seen.has(p.email.toLowerCase())) return;
    seen.add(p.email.toLowerCase());
    queue(Object.assign({ to: p.email, name: p.name }, build(p)));
  });
}

function trimOutbox(D) {
  if (D.outbox.length <= OUTBOX_CAP) return;
  /* drop the oldest finished mails first, never unsent ones */
  for (let i = D.outbox.length - 1; i >= 0 && D.outbox.length > OUTBOX_CAP; i--) {
    if (['SENT', 'LOGGED', 'SKIPPED'].includes(D.outbox[i].status)) D.outbox.splice(i, 1);
  }
}

/* engine-made mails (wallet credit, payout) have plain text only — give them
   the same layout and a category so the switches apply */
function adoptEngineMail(m) {
  if (m.html) return;
  m.category = m.category || 'wallet';
  const s = getSettings();
  if (!s.enabled || s.categories[m.category] === false) { m.status = 'SKIPPED'; m.error = 'Category switched off'; return; }
  const r = template.render({ company: companyName(), heading: m.subject, lines: [m.body], button: { label: 'Open Oment', url: appLink('EMPLOYEE') } });
  m.html = r.html;
  m.attempts = m.attempts || 0;
}

/* ── transport ────────────────────────────────────────────────────────── */
let transporter = null;
/* SMTP is configured when either SMTP_SERVICE (gmail, outlook …) or SMTP_HOST is set */
function smtpConfigured() { return !!(env.SMTP.host || env.SMTP.service); }
function getTransport() {
  if (!smtpConfigured()) return null;
  if (!transporter) {
    const auth = env.SMTP.user ? { user: env.SMTP.user, pass: env.SMTP.pass } : undefined;
    transporter = env.SMTP.service && !env.SMTP.host
      ? nodemailer.createTransport({ service: env.SMTP.service, auth })
      : nodemailer.createTransport({ host: env.SMTP.host, port: env.SMTP.port, secure: env.SMTP.secure, auth });
  }
  return transporter;
}

async function attachmentsFor(m) {
  const id = m.meta && m.meta.attachInvoiceId;
  if (id == null) return [];
  const D = db();
  const inv = (D.invoices || []).find(i => String(i.id) === String(id));
  if (!inv) return [];
  const buf = await pdf.invoicePdf(inv, D.settings || D.company);
  return [{ filename: 'Invoice-' + (inv.number || inv.id) + '.pdf', content: buf, contentType: 'application/pdf' }];
}

async function deliver(m) {
  const t = getTransport();
  if (!t) {
    logger.info(`[email → console] to=${m.to} subject="${m.subject}"`);
    return { status: 'LOGGED', transport: 'console' };
  }
  const info = await t.sendMail({
    from: env.SMTP.from, to: m.to, subject: m.subject, text: m.body, html: m.html || undefined,
    attachments: await attachmentsFor(m)
  });
  return { status: 'SENT', transport: 'smtp', messageId: info && info.messageId };
}

/* ── worker ───────────────────────────────────────────────────────────── */
let draining = false;
async function drain() {
  if (draining) return 0;
  draining = true;
  try {
    const now = Date.now();
    const D = db();
    const due = (D.outbox || []).filter(m =>
      m.status === 'QUEUED' ||
      (m.status === 'FAILED' && (m.attempts || 0) < env.MAIL_MAX_ATTEMPTS && (!m.nextAttemptAt || Date.parse(m.nextAttemptAt) <= now))
    ).slice(0, 25).map(m => JSON.parse(JSON.stringify(m)));
    if (!due.length) return 0;

    const results = [];
    for (const m of due) {
      try { results.push(Object.assign({ id: m.id, ok: true }, await deliver(m))); }
      catch (e) { results.push({ id: m.id, ok: false, error: String(e && e.message || e).slice(0, 300) }); }
    }

    const access = require('./access.service');
    await access.unitOfWork(async () => {
      const D2 = db();
      results.forEach(r => {
        const m = (D2.outbox || []).find(x => x.id === r.id);
        if (!m) return;
        m.attempts = (m.attempts || 0) + 1;
        m.lastAttemptAt = new Date().toISOString();
        if (r.ok) {
          m.status = r.status; m.sentAt = m.lastAttemptAt; m.transport = r.transport;
          if (r.messageId) m.messageId = r.messageId;
          m.error = null; m.nextAttemptAt = null;
        } else {
          m.status = 'FAILED'; m.error = r.error;
          m.nextAttemptAt = m.attempts < env.MAIL_MAX_ATTEMPTS ? new Date(Date.now() + BACKOFF_MS[Math.min(m.attempts - 1, BACKOFF_MS.length - 1)]).toISOString() : null;
          logger.warn(`Email to ${m.to} failed (attempt ${m.attempts}): ${r.error}`);
        }
      });
      engine.get().DataAPI.touch();
    });
    return results.length;
  } finally {
    draining = false;
  }
}

/* ── admin tools ──────────────────────────────────────────────────────── */
function list(q) {
  q = q || {};
  let rows = (db().outbox || []).slice();
  if (q.status) rows = rows.filter(m => m.status === String(q.status).toUpperCase());
  if (q.category) rows = rows.filter(m => m.category === q.category);
  if (q.to) rows = rows.filter(m => String(m.to).toLowerCase().includes(String(q.to).toLowerCase()));
  const limit = Math.min(Math.max(parseInt(q.limit, 10) || 50, 1), 200);
  const page = Math.max(parseInt(q.page, 10) || 1, 1);
  const total = rows.length;
  const counts = {};
  (db().outbox || []).forEach(m => { counts[m.status] = (counts[m.status] || 0) + 1; });
  return {
    total, page, limit, counts,
    items: rows.slice((page - 1) * limit, page * limit).map(m => { const o = Object.assign({}, m); delete o.html; return o; })
  };
}

function getOne(id) {
  const m = (db().outbox || []).find(x => x.id === id);
  if (!m) throw new ApiError('NOT_FOUND', 'Email not found');
  return m;
}

/* call inside a unit of work */
function retry(id) {
  const m = (db().outbox || []).find(x => x.id === id);
  if (!m) throw new ApiError('NOT_FOUND', 'Email not found');
  if (m.status === 'SENT') throw new ApiError('INVALID_STATE', 'This email was already sent');
  m.status = 'QUEUED'; m.attempts = 0; m.error = null; m.nextAttemptAt = null;
  if (!m.html) adoptEngineMail(m);
  if (m.status === 'SKIPPED') m.status = 'QUEUED';
  engine.get().DataAPI.touch();
  return m;
}

async function sendTest(to) {
  to = String(to || adminAddress()).trim();
  if (!isEmail(to)) throw new ApiError('VALIDATION', 'Give a valid email address (or set the admin email first)');
  const { html, text } = template.render({
    company: companyName(), heading: 'Test email',
    lines: ['If you can read this, email sending works.', 'Sent at ' + new Date().toString()]
  });
  const t = getTransport();
  if (!t) return { ok: true, transport: 'console', message: 'SMTP_SERVICE / SMTP_HOST is not set in .env — the email was printed to the server console instead of being sent.' };
  await t.verify();
  const info = await t.sendMail({ from: env.SMTP.from, to, subject: companyName() + ': test email', text, html });
  return { ok: true, transport: 'smtp', to, messageId: info && info.messageId };
}

module.exports = {
  smtpConfigured, getTransport,
  CATEGORIES, getSettings, publicSettings, updateSettings,
  adminAddress, person, isAdminId, appLink, firstName, companyName, isEmail,
  queue, queueMany, adoptEngineMail, drain, list, getOne, retry, sendTest, deliver
};
