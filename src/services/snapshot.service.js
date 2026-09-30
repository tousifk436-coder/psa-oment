/* ============================================================================
   SNAPSHOT — role-filtered read model
   ----------------------------------------------------------------------------
   The frontend renders from a synchronous DataAPI.raw(). Over HTTP that
   becomes: GET /api/snapshot → the client caches it and re-renders; every
   mutation response includes a fresh snapshot so the cache never goes stale.

   ADMIN sees everything except password hashes.
   EMPLOYEE sees a strict slice:
     • own employee record (minus passHash, salary, cost rate)
     • colleagues: directory fields only (name, role, dept, avatar, status)
     • projects they are a member of (+ those milestones/deliverables)
     • own subtasks, time entries, attendance, leave, regularisations
     • notices addressed to them, own conversations, calendar, notifications
     • wallet entries + disputes ONLY when payPolicy.showMoneyToEmployees is
       on; price/settlement/cost fields are stripped from deliverables when
       it's off — the amounts never even leave the server
     • NEVER: invoices, other people's anything, profit data, outbox,
       salaries, cost rates, activity log, call logs
   ============================================================================ */
'use strict';

const EMP_SECRET_FIELDS = ['passHash', 'mustChangePass'];
const EMP_PRIVATE_FIELDS = ['monthlySalaryPaise', 'hoursPerDay', 'costPerHourPaise', 'billRatePaise', 'email', 'phone', 'address', 'username'];
const MONEY_FIELDS = ['pricePaise', 'settlement', 'costSnapshot', 'slab'];

const clone = x => x === undefined ? x : JSON.parse(JSON.stringify(x));

function stripSecrets(x) {
  x = clone(x);
  walk(x, o => { for (const f of EMP_SECRET_FIELDS) if (f in o) delete o[f]; });
  return x;
}

function walk(x, fn) {
  if (Array.isArray(x)) { x.forEach(v => walk(v, fn)); return; }
  if (x && typeof x === 'object') { fn(x); Object.values(x).forEach(v => walk(v, fn)); }
}

function directoryView(e) {
  return {
    id: e.id, name: e.name, role: e.role, deptId: e.deptId, managerId: e.managerId,
    attendanceStatus: e.attendanceStatus, accessLevel: e.accessLevel, score: e.score,
    avatarInitials: e.avatarInitials, avatarBg: e.avatarBg, avatarFg: e.avatarFg,
    color: e.color, canLogin: e.canLogin, joinedAt: e.joinedAt
  };
}

function adminSnapshot(ctx) {
  const DB = clone(ctx.DataAPI.raw());
  DB.employees.forEach(e => EMP_SECRET_FIELDS.forEach(f => delete e[f]));
  return DB;
}

function employeeSnapshot(ctx, empId) {
  const DB = ctx.DataAPI.raw();
  const showMoney = ctx.Wallet.moneyVisibleToEmployees();
  const me = DB.employees.find(e => e.id === empId);
  if (!me) return null;

  const myProjects = DB.projects.filter(p => (p.memberIds || []).includes(empId) ||
    DB.deliverables.some(d => d.projectId === p.id && (d.assigneeIds || []).includes(empId)));
  const myProjectIds = new Set(myProjects.map(p => p.id));

  const meOut = clone(me);
  EMP_SECRET_FIELDS.concat(['monthlySalaryPaise', 'costPerHourPaise', 'billRatePaise']).forEach(f => delete meOut[f]);

  const deliverables = clone(DB.deliverables.filter(d => myProjectIds.has(d.projectId) || (d.assigneeIds || []).includes(empId)));
  if (!showMoney) deliverables.forEach(d => { MONEY_FIELDS.forEach(f => delete d[f]); if (d.pricingMode === 'PIECE') d.pricingMode = 'PIECE'; });

  const out = {
    version: DB.version, schemaVersion: DB.schemaVersion,
    settings: { companyName: (DB.settings || {}).companyName, workdayStart: (DB.settings || {}).workdayStart, workdayEnd: (DB.settings || {}).workdayEnd },
    adminUser: DB.adminUser ? { id: DB.adminUser.id, name: DB.adminUser.name } : null,
    employees: DB.employees.map(e => e.id === empId ? meOut : directoryView(e)),
    departments: clone(DB.departments),
    projects: clone(myProjects),
    milestones: clone(DB.milestones.filter(m => myProjectIds.has(m.projectId))),
    deliverables,
    subtasks: clone(DB.subtasks.filter(s => s.assigneeId === empId || deliverables.some(d => d.id === s.deliverableId))),
    timeEntries: clone(DB.timeEntries.filter(t => t.employeeId === empId)),
    attendance: clone(DB.attendance.filter(a => a.employeeId === empId)),
    holidays: clone(DB.holidays || []),
    leaveRequests: clone((DB.leaveRequests || []).filter(l => l.employeeId === empId)),
    regularisations: clone((DB.regularisations || []).filter(r => r.employeeId === empId)),
    compOffLedger: clone((DB.compOffLedger || []).filter(c => c.employeeId === empId)),
    hrPolicy: clone(DB.hrPolicy),
    notices: clone((DB.notices || []).filter(n => {
      if (String(n.status).toUpperCase() !== 'SENT') return false;
      const reads = (n.readBy || []).map(Number);
      const unread = (n.notReadBy || []).map(Number);
      const targets = reads.concat(unread);
      if (targets.includes(Number(empId))) return true;
      const r = n.recipients;
      if (r === 'all') return true;
      if (Array.isArray(r) && r.map(Number).includes(Number(empId))) return true;
      return false;
    })),
    conversations: clone((DB.conversations || []).filter(c => Number(c.withId) === Number(empId) || (c.participantIds || []).includes(empId))),
    calendarEvents: clone(DB.calendarEvents || []),
    notifications: clone((DB.notifications || []).filter(n => n.recipientId === empId)),
    payPolicy: clone(DB.payPolicy),
    walletEntries: showMoney ? clone((DB.walletEntries || []).filter(w => w.employeeId === empId)) : [],
    disputes: showMoney ? clone((DB.disputes || []).filter(d2 => d2.employeeId === empId)) : [],
    /* explicit empties — frontend collections jinke bina raw() readers girte */
    invoices: [], activity: [], callLogs: [], outbox: []
  };
  return out;
}

function stripForEmployee(result, empId, ctx) {
  const showMoney = ctx.Wallet.moneyVisibleToEmployees();
  result = clone(result);
  walk(result, o => {
    EMP_SECRET_FIELDS.forEach(f => delete o[f]);
    if (o && o.avatarInitials !== undefined && o.id !== undefined && o.id !== empId && o.name !== undefined)
      EMP_PRIVATE_FIELDS.concat(['monthlySalaryPaise']).forEach(f => delete o[f]);
    if (o && o.id === empId) ['monthlySalaryPaise', 'costPerHourPaise', 'billRatePaise'].forEach(f => delete o[f]);
    if (!showMoney && o && (o.pricingMode !== undefined || o.settlement !== undefined))
      MONEY_FIELDS.forEach(f => delete o[f]);
  });
  return result;
}

module.exports = { adminSnapshot, employeeSnapshot, stripSecrets, stripForEmployee };
