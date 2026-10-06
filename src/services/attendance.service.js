/* ============================================================================
   ATTENDANCE TRACKER SERVICE — live work-session tracking from the employee app
   ----------------------------------------------------------------------------
   The employee app counts every second: session time, active (timer running),
   idle, and time per task. It sends those totals here:

     heartbeat()  every ~15s while the app is open   → keeps today's record live
     punchOut()   when the employee logs out          → closes the current session

   Totals only ever go UP (max of stored vs sent), so two open tabs or a late
   request can never shrink someone's recorded time. Stored on the same
   attendance record the admin HRM screens already read.
   ============================================================================ */
'use strict';
const engine = require('./engine.service');
const ApiError = require('../utils/ApiError');

const DAY = 86400;
const ONLINE_WINDOW_MS = 2 * 60 * 1000;

const clampSecs = v => Math.max(0, Math.min(DAY, Math.round(Number(v) || 0)));

function todayISO() {
  return engine.get().Utils.isoDate(new Date());
}

function recordFor(empId, date) {
  const ctx = engine.get();
  const D = ctx.DataAPI.raw();
  const emp = (D.employees || []).find(e => Number(e.id) === Number(empId));
  if (!emp) throw new ApiError('NOT_FOUND', 'Employee not found');
  let a = (D.attendance || []).find(x => x.employeeId === emp.id && x.date === date);
  if (!a) {
    a = ctx.Schema.Shape.attendanceDay({
      id: 'att_' + emp.id + '_' + date, employeeId: emp.id, date, status: 'PRESENT', firstInAt: new Date().toISOString(), sessions: [{ inAt: new Date().toISOString(), outAt: null }]
    });
    D.attendance.unshift(a);
  }
  if (!Array.isArray(a.sessions)) a.sessions = [];
  if (!a.sessions.length && a.firstInAt) a.sessions.push({ inAt: a.firstInAt, outAt: a.lastOutAt || null });
  return a;
}

function ensureOpenSession(a, at) {
  if (!Array.isArray(a.sessions)) a.sessions = [];
  var last = a.sessions[a.sessions.length - 1];
  if (!last || last.outAt) a.sessions.push({ inAt: at, outAt: null });
}

function merge(a, body) {
  body = body || {};
  ['sessionSecs', 'activeSecs', 'idleSecs'].forEach(k => {
    if (body[k] !== undefined) a[k] = Math.max(a[k] || 0, clampSecs(body[k]));
  });
  if (body.perDeliverableSecs && typeof body.perDeliverableSecs === 'object') {
    a.perDeliverableSecs = a.perDeliverableSecs || {};
    Object.keys(body.perDeliverableSecs).slice(0, 200).forEach(id => {
      const v = clampSecs(body.perDeliverableSecs[id]);
      if (v > (a.perDeliverableSecs[id] || 0)) a.perDeliverableSecs[id] = v;
    });
  }
  if (!a.firstInAt) a.firstInAt = new Date().toISOString();
  if (body.lateReason) a.lateReason = String(body.lateReason).trim().slice(0, 300);
  /* Working right now means PRESENT. A genuine Half Day is an explicit HR
     attendance decision, not a side effect of a normal login/logout session. */
  if (!a.status || a.status === 'ABSENT' || (a.status === 'HALF_DAY' && !a.lastOutAt)) a.status = 'PRESENT';
  a.lastSeenAt = new Date().toISOString();
  if (body.onBreak !== undefined) a.onBreak = !!body.onBreak;
  if (body.currentDeliverableId !== undefined) a.currentDeliverableId = body.currentDeliverableId == null ? null : Number(body.currentDeliverableId);
}

/* call inside a unit of work */
function heartbeat(empId, body) {
  const a = recordFor(empId, todayISO());
  const wasOut = !!a.lastOutAt;
  const at = new Date().toISOString();
  if (body && body.resume) {
    if (wasOut) a.lastOutAt = null;
    ensureOpenSession(a, at);
    a.status = 'PRESENT';
  } else if (!a.lastOutAt) {
    ensureOpenSession(a, a.firstInAt || at);
  }
  merge(a, body);
  engine.get().DataAPI.touch();
  return JSON.parse(JSON.stringify(a));
}

/* call inside a unit of work */
function punchOut(empId, body) {
  const a = recordFor(empId, todayISO());
  merge(a, body);
  const outAt = new Date().toISOString();
  a.lastOutAt = outAt;
  a.onBreak = false;
  a.currentDeliverableId = null;
  if (!Array.isArray(a.sessions)) a.sessions = [];
  var last = a.sessions[a.sessions.length - 1];
  if (!last || last.outAt) {
    a.sessions.push({ inAt: a.firstInAt || outAt, outAt: outAt });
  } else {
    last.outAt = outAt;
  }
  /* Logging out closes the current session; it is not a half-day decision.
     Keep the day PRESENT so a normal logout/re-login never changes attendance
     to Half Day. HR can explicitly mark a genuine Half Day. */
  if (!a.status || a.status === 'ABSENT') a.status = 'PRESENT';
  /* close any running timer so logged time stops */
  const ctx = engine.get();
  const open = (ctx.DataAPI.raw().timeEntries || []).find(t => t.employeeId === Number(empId) && !t.endedAt);
  if (open) { try { ctx.DataAPI.stopTimer(Number(empId)); } catch (e) { /* ignore */ } }
  ctx.DataAPI.touch();
  return JSON.parse(JSON.stringify(a));
}

/* read-only: today's record (or null) */
function today(empId) {
  const D = engine.get().DataAPI.raw();
  const a = (D.attendance || []).find(x => x.employeeId === Number(empId) && x.date === todayISO());
  return a ? JSON.parse(JSON.stringify(a)) : null;
}

/* admin: who is online right now */
function live() {
  const D = engine.get().DataAPI.raw();
  const today = todayISO();
  const now = Date.now();
  return (D.employees || []).filter(e => e.active !== false).map(e => {
    const a = (D.attendance || []).find(x => x.employeeId === e.id && x.date === today) || null;
    const timer = (D.timeEntries || []).find(t => t.employeeId === e.id && !t.endedAt) || null;
    const seen = a && a.lastSeenAt ? Date.parse(a.lastSeenAt) : 0;
    const online = !!(a && !a.lastOutAt && seen && now - seen < ONLINE_WINDOW_MS);
    return {
      employeeId: e.id, name: e.name, role: e.role,
      state: !a || !a.firstInAt ? 'NOT_IN' : a.lastOutAt ? 'LOGGED_OUT' : !online ? 'AWAY' : a.onBreak ? 'ON_BREAK' : timer ? 'WORKING' : 'IDLE',
      online, firstInAt: a && a.firstInAt, lastSeenAt: a && a.lastSeenAt, lastOutAt: a && a.lastOutAt,
      sessionSecs: a ? a.sessionSecs || 0 : 0, activeSecs: a ? a.activeSecs || 0 : 0, idleSecs: a ? a.idleSecs || 0 : 0,
      status: a ? a.status : 'ABSENT',
      currentDeliverableId: timer ? timer.deliverableId : null, timerStartedAt: timer ? timer.startedAt : null
    };
  });
}

module.exports = { heartbeat, punchOut, live, today, todayISO };