/* ============================================================================
   AUTH SERVICE — login, JWT, bcrypt passwords
   ----------------------------------------------------------------------------
   ADMIN     subject 'admin'    — username/password from .env (ADMIN_USERNAME /
                                  ADMIN_PASSWORD), re-applied on every start,
                                  so changing .env changes the login.
   EMPLOYEE  subject 'emp:<id>' — password set by the admin (credentials card)
                                  or by the employee (change password).
   Only bcrypt hashes in the "credentials" collection are trusted.
   ============================================================================ */
'use strict';
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const env = require('../config/env');
const store = require('./store.service');
const engine = require('./engine.service');
const crypto = require('crypto');
const ApiError = require('../utils/ApiError');
const { PasswordReset } = require('../models');

const ROUNDS = 10;
const sha256 = s => crypto.createHash('sha256').update(String(s)).digest('hex');

/* Admin password comes from .env. It is (re)applied when the admin login
   doesn't exist yet OR when ADMIN_PASSWORD in .env was changed since the
   last start — so a password the admin changed in the app (change / forgot
   password) is NOT silently overwritten on every restart. */
function bootstrapAdmin() {
  const fp = sha256('admin-env:' + env.ADMIN_USERNAME + ':' + env.ADMIN_PASSWORD);
  const row = store.getAuth('admin');
  if (row && store.getLs('adminEnvFingerprint') === fp) return;
  store.setAuth('admin', 'ADMIN', bcrypt.hashSync(env.ADMIN_PASSWORD, ROUNDS), false);
  store.setLs('adminEnvFingerprint', fp);
}

function syncEmployeeCred(empId, plainPassword, mustChange) {
  store.setAuth('emp:' + empId, 'EMPLOYEE', bcrypt.hashSync(String(plainPassword), ROUNDS), mustChange !== false);
}

function removeEmployeeCred(empId) {
  store.deleteAuth('emp:' + empId);
}

function issueToken(p) {
  return jwt.sign({ sub: p.subject, role: p.role, name: p.name, empId: p.empId || null }, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES });
}

function verifyToken(token) {
  const p = jwt.verify(token, env.JWT_SECRET);
  return { subject: p.sub, role: p.role, name: p.name, empId: p.empId };
}

function login(username, password) {
  username = String(username || '').toLowerCase().trim();
  password = String(password || '');
  const vague = () => { throw new ApiError('AUTH', 'Incorrect username or password'); };
  if (!username || !password) vague();

  if (username === env.ADMIN_USERNAME) {
    const row = store.getAuth('admin');
    if (!row || !bcrypt.compareSync(password, row.hash)) vague();
    const admin = engine.get().DataAPI.raw().adminUser || { id: 100, name: 'Admin' };
    return {
      token: issueToken({ subject: 'admin', role: 'ADMIN', name: admin.name }),
      role: 'ADMIN', mustChange: !!row.mustChange,
      user: { id: admin.id, name: admin.name }
    };
  }

  const DB = engine.get().DataAPI.raw();
  const emp = DB.employees.find(e => e.username === username);
  if (!emp || emp.canLogin === false || emp.active === false) vague();
  const row = store.getAuth('emp:' + emp.id);
  if (row) {
    if (!bcrypt.compareSync(password, row.hash)) vague();
  } else {
    /* first login of an employee created by the engine: verify its own hash, then upgrade to bcrypt */
    if (!engine.get().Utils.checkPass(password, emp.passHash)) vague();
    syncEmployeeCred(emp.id, password, emp.mustChangePass);
  }
  const r2 = store.getAuth('emp:' + emp.id);
  return {
    token: issueToken({ subject: 'emp:' + emp.id, role: 'EMPLOYEE', name: emp.name, empId: emp.id }),
    role: 'EMPLOYEE', mustChange: !!(r2 && r2.mustChange),
    user: { id: emp.id, name: emp.name, role: emp.role, avatarInitials: emp.avatarInitials }
  };
}

function changeOwnPassword(principal, oldPass, newPass) {
  if (String(newPass || '').length < 6) throw new ApiError('VALIDATION', 'Password must be at least 6 characters');
  const subject = principal.role === 'ADMIN' ? 'admin' : 'emp:' + principal.empId;
  const row = store.getAuth(subject);
  if (!row || !bcrypt.compareSync(String(oldPass || ''), row.hash)) throw new ApiError('AUTH', 'Current password is incorrect');
  store.setAuth(subject, row.kind, bcrypt.hashSync(String(newPass), ROUNDS), false);
  if (principal.role === 'EMPLOYEE') {
    const ctx = engine.get();
    const emp = ctx.DataAPI.raw().employees.find(e => e.id === principal.empId);
    if (emp) { emp.passHash = ctx.Utils.hashPass(String(newPass)); emp.mustChangePass = false; ctx.DataAPI.touch(); }
  }
  notifyPasswordChanged(subject);
  return true;
}

/* ── who is this login? (admin or employee) ── */
function principalFor(identifier) {
  const id = String(identifier || '').toLowerCase().trim();
  if (!id) return null;
  const email = require('./email.service');
  const D = engine.get().DataAPI.raw();
  if (id === env.ADMIN_USERNAME || (email.adminAddress() && id === email.adminAddress().toLowerCase())) {
    return { subject: 'admin', role: 'ADMIN', name: (D.adminUser && D.adminUser.name) || 'Admin', email: email.adminAddress() };
  }
  const emp = (D.employees || []).find(e => String(e.username || '').toLowerCase() === id || String(e.email || '').toLowerCase() === id);
  if (!emp || emp.active === false || emp.canLogin === false) return null;
  return { subject: 'emp:' + emp.id, role: 'EMPLOYEE', name: emp.name, email: emp.email, empId: emp.id };
}

/* Forgot password: always answers the same way (no "user not found" leak).
   Call inside a unit of work — the email is queued there. */
async function requestPasswordReset(identifier) {
  const email = require('./email.service');
  const p = principalFor(identifier);
  if (!p || !email.isEmail(p.email)) return { ok: true };
  const token = crypto.randomBytes(32).toString('hex');
  await PasswordReset.create({ tokenHash: sha256(token), subject: p.subject, expiresAt: new Date(Date.now() + env.RESET_TOKEN_MINUTES * 60000) });
  const url = email.appLink(p.role) + '?reset=' + token;
  email.queue({
    to: p.email, name: p.name, category: 'account', kind: 'FORGOT_PASSWORD', force: true,
    subject: 'Reset your ' + email.companyName() + ' password',
    heading: 'Reset your password',
    lines: ['We received a request to reset your password. The link works for ' + env.RESET_TOKEN_MINUTES + ' minutes and can be used once.',
      'If you did not ask for this, ignore this email — your password stays the same.'],
    button: { label: 'Choose a new password', url }
  });
  return { ok: true };
}

/* Call inside a unit of work. */
async function resetPassword(token, newPassword) {
  if (String(newPassword || '').length < 6) throw new ApiError('VALIDATION', 'Password must be at least 6 characters');
  const row = await PasswordReset.findOne({ tokenHash: sha256(token || '') });
  if (!row || row.usedAt || row.expiresAt.getTime() < Date.now()) throw new ApiError('AUTH', 'This reset link is invalid or has expired. Please request a new one.');
  const cur = store.getAuth(row.subject);
  const kind = row.subject === 'admin' ? 'ADMIN' : 'EMPLOYEE';
  store.setAuth(row.subject, cur ? cur.kind : kind, bcrypt.hashSync(String(newPassword), ROUNDS), false);
  row.usedAt = new Date();
  await row.save();
  await PasswordReset.deleteMany({ subject: row.subject, _id: { $ne: row._id } });

  const ctx = engine.get();
  let role = 'ADMIN', who = null;
  if (row.subject.startsWith('emp:')) {
    role = 'EMPLOYEE';
    const empId = Number(row.subject.slice(4));
    who = ctx.DataAPI.raw().employees.find(e => e.id === empId);
    if (who) { who.passHash = ctx.Utils.hashPass(String(newPassword)); who.mustChangePass = false; ctx.DataAPI.touch(); }
  }
  notifyPasswordChanged(role === 'ADMIN' ? 'admin' : row.subject);
  return { ok: true, role };
}

function notifyPasswordChanged(subject) {
  const email = require('./email.service');
  const D = engine.get().DataAPI.raw();
  let to, name, role;
  if (subject === 'admin') { to = email.adminAddress(); name = (D.adminUser && D.adminUser.name) || 'Admin'; role = 'ADMIN'; }
  else {
    const e = D.employees.find(x => 'emp:' + x.id === subject);
    if (!e) return;
    to = e.email; name = e.name; role = 'EMPLOYEE';
  }
  email.queue({
    to, name, category: 'account', kind: 'PASSWORD_CHANGED', force: true,
    subject: 'Your ' + email.companyName() + ' password was changed',
    heading: 'Password changed',
    lines: ['Your password was changed on ' + new Date().toLocaleString('en-IN', { timeZone: env.TIMEZONE }) + '.',
      'If this was not you, reset your password right away and tell your admin.'],
    button: { label: 'Sign in', url: email.appLink(role) }
  });
}

module.exports = { principalFor, requestPasswordReset, resetPassword, notifyPasswordChanged, bootstrapAdmin, syncEmployeeCred, removeEmployeeCred, issueToken, verifyToken, login, changeOwnPassword };
