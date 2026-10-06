/* ============================================================================
   CORE — every engine method, guarded, transactional
   ----------------------------------------------------------------------------
   The single choke-point for business calls. REST routes and the /api/rpc
   endpoint both come through call(user, api, method, args):

     1. guard lookup      — who may call this, and with what argument scope
     2. begin             — unit of work (MongoDB transaction when available)
     3. engine method     — the same code the frontend runs; its flush()es
                            write into this transaction
     4. commit            — or rollback + engine reload on error

   GUARDS is the complete method inventory. Anything not listed is refused for
   everyone (fail-closed) — so a new engine method is invisible until someone
   consciously decides its access rules. `assertCovered()` at boot verifies the
   inventory covers every callable the engine actually exposes, so the list
   can't silently go stale either.

   Scope language:
     'admin'          — ADMIN only
     'any'            — any authenticated principal, no argument checks
     fn(user, args)   — custom check; throw {code:'FORBIDDEN'} to refuse,
                        return possibly-rewritten args (e.g. force own id)
   ============================================================================ */
'use strict';
const store = require('./store.service');
const engine = require('./engine.service');
const auth = require('./auth.service');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');
const events = require('./events.service');

function err(code, message) { return new ApiError(code, message); }

/* throws unless this conversation belongs to the signed-in employee */
function ownConversation(user, conversationId) {
  const c = (engine.get().DataAPI.raw().conversations || []).find(x => String(x.id) === String(conversationId));
  const mine = c && (Number(c.withId) === Number(user.empId) || (c.participantIds || []).map(Number).includes(Number(user.empId)));
  if (!mine) throw new ApiError('FORBIDDEN', 'Not your conversation');
  return c;
}
const FORBID = () => err('FORBIDDEN', 'You can only access your own data');

/* employee apni id force kare — arg position `i` */
const selfArg = i => (user, args) => {
  if (user.role === 'ADMIN') return args;
  args[i] = user.empId;
  return args;
};
/* deliverable ka assignee hona zaroori — arg position `i` = deliverableId */
const assigneeArg = i => (user, args) => {
  if (user.role === 'ADMIN') return args;
  const DB = engine.get().DataAPI.raw();
  const d = DB.deliverables.find(x => String(x.id) === String(args[i]));
  if (!d || (d.assigneeIds || []).indexOf(user.empId) < 0) throw FORBID();
  return args;
};
/* payload.employeeId apna hi ho */
const selfPayload = (field, i) => (user, args) => {
  if (user.role === 'ADMIN') return args;
  args[i] = Object.assign({}, args[i], { [field]: user.empId });
  return args;
};

/* Employee-created subtasks are always their own review items. */
const selfSubtaskCreate = (user, args) => {
  if (user.role === 'ADMIN') return args;
  const p = Object.assign({}, args[0] || {});
  const DB = engine.get().DataAPI.raw();
  const d = (DB.deliverables || []).find(x => String(x.id) === String(p.deliverableId));
  if (!d || (d.assigneeIds || []).map(Number).indexOf(Number(user.empId)) < 0) throw FORBID();
  p.assigneeId = user.empId;
  p.createdById = user.empId;
  p.origin = 'SELF';
  p.status = 'IN_REVIEW';
  p.approvalState = 'PENDING';
  args[0] = p;
  return args;
};

const selfSubtaskUpdate = (user, args) => {
  if (user.role === 'ADMIN') return args;
  const DB = engine.get().DataAPI.raw();
  const s = (DB.subtasks || []).find(x => String(x.id) === String(args[0]));
  if (!s || (Number(s.assigneeId) !== Number(user.empId) && Number(s.createdById) !== Number(user.empId))) throw FORBID();
  const patch = Object.assign({}, args[1] || {});
  const allowed = ['status', 'description', 'loggedSecs', 'estimateSecs', 'submissionNotes', 'submissionFiles'];
  Object.keys(patch).forEach(k => { if (!allowed.includes(k)) delete patch[k]; });
  if (patch.status) {
    const status = String(patch.status).toUpperCase();
    if (status === 'IN_REVIEW' || status === 'SUBMITTED') {
      patch.status = 'IN_REVIEW';
      /* First review approves the task to start; a later submission is a
         completion review. The current stored state tells us which phase. */
      patch.approvalState = String(s.approvalState || '').toUpperCase() === 'APPROVED'
        ? 'COMPLETION_PENDING'
        : 'PENDING';
      patch.rejectionReason = null;
    } else if (status === 'IN_PROGRESS' || status === 'REJECTED') {
      patch.status = 'IN_PROGRESS';
      if (String(s.approvalState || '').toUpperCase() === 'REJECTED') patch.approvalState = 'PENDING';
    }
  }
  args[1] = patch;
  return args;
};

/* ── THE INVENTORY ─────────────────────────────────────────────────────────
   api → method → guard. Comments only where the rule isn't obvious. */
const GUARDS = {
  DataAPI: {
    init: null, flush: null, touch: null, reset: null, raw: null, setLatency: null,
    authenticateEmployee: null,                  

    getSettings: 'any', updateSettings: 'admin',

    getEmployees: 'any',                         
    getEmployee: 'any',
    createEmployee: 'admin', updateEmployee: 'admin', deleteEmployee: 'admin',

    getDepartments: 'any', createDepartment: 'admin', updateDepartment: 'admin', deleteDepartment: 'admin',

    getProjects: 'any', getProject: 'any',
    createProject: 'admin', updateProject: 'admin', deleteProject: 'admin',
    addProjectMember: 'admin', removeProjectMember: 'admin',

    getMilestones: 'any', createMilestone: 'admin', updateMilestone: 'admin', deleteMilestone: 'admin', milestonePay: 'admin', creditMilestonePay: 'admin',

    getDeliverables: (user, args) => {          // employee: apne hi tasks
      if (user.role === 'ADMIN') return args;
      args[0] = Object.assign({}, args[0], { assigneeId: user.empId });
      return args;
    },
    getDeliverable: 'any',
    createDeliverable: (user, args) => {         
      if (user.role === 'ADMIN') return args;
      const p = args[0] || {};
      if ((p.assigneeIds || []).some(id => id !== user.empId)) throw FORBID();
      args[0] = Object.assign({}, p, { assigneeIds: [user.empId], createdById: user.empId, origin: 'SELF', pricingMode: 'HOURLY', pricePaise: 0 });
      return args;
    },
    updateDeliverable: 'admin',
    deleteDeliverable: 'admin',
    submitDeliverable: assigneeArg(0),
    approveDeliverable: 'admin', rejectDeliverable: 'admin', reassignDeliverable: 'admin',
    addDeliverableComment: (user, args) => { if (user.role !== 'ADMIN') args[1] = user.empId; return assigneeArg(0)(user, args); },
    addDeliverableFiles: assigneeArg(0), removeDeliverableFile: assigneeArg(0),

    getSubtasks: 'any',
    createSubtask: selfSubtaskCreate,
    updateSubtask: selfSubtaskUpdate, approveSubtask: 'admin', rejectSubtask: 'admin', deleteSubtask: 'any',

    startTimer: selfArg(0), stopTimer: selfArg(0), getOpenTimer: selfArg(0),

    getAttendance: (user, args) => { if (user.role !== 'ADMIN') args[0] = Object.assign({}, args[0], { employeeId: user.empId }); return args; },
    ensureTodayAttendance: selfArg(0),
    updateAttendance: 'admin',                  // corrections regularisation flow se
    addBreak: selfArg(0),

    getInvoices: 'admin', peekInvoiceNumber: 'admin', createInvoice: 'admin', updateInvoice: 'admin',
    sendInvoice: 'admin', recordPayment: 'admin', cancelInvoice: 'admin', deleteInvoice: 'admin',
    getRecurringInvoices: 'admin', createRecurringInvoice: 'admin', updateRecurringInvoice: 'admin', deleteRecurringInvoice: 'admin',
    runRecurringInvoices: null,           // server job only
    getUninvoicedMilestones: 'admin',

    getNotices: (user, args) => { if (user.role !== 'ADMIN') args[0] = user.empId; return args; }, createNotice: 'admin', updateNotice: 'admin', sendNotice: 'admin',
    markNoticeRead: (user, args) => { if (user.role !== 'ADMIN') args[1] = user.empId; return args; },
    deleteNotice: 'admin',

    /* employees: only their own conversation with the admin */
    getConversations: (user, args) => { if (user.role !== 'ADMIN') args[0] = user.empId; return args; },
    sendMessage: (user, args) => {
      if (user.role !== 'ADMIN') { ownConversation(user, args[0]); args[1] = user.empId; }
      return args;
    },
    markConversationRead: (user, args) => {
      if (user.role !== 'ADMIN') { const c = ownConversation(user, args[0]); args[1] = c.kind === 'PEER' ? user.empId : 'EMPLOYEE'; }
      return args;
    },
    startConversation: (user, args) => { if (user.role !== 'ADMIN') args[0] = user.empId; return args; },
    /* employee ↔ employee chat: always as yourself */
    startPeerConversation: (user, args) => {
      if (user.role === 'ADMIN') throw new ApiError('FORBIDDEN', 'Admins use the normal chat');
      args[0] = user.empId; return args;
    },

    getCalendarEvents: 'any', createCalendarEvent: 'admin', deleteCalendarEvent: 'admin',

    getNotifications: selfNotif(0), markNotificationRead: 'any',
    markAllNotificationsRead: selfNotif(0),

    getActivity: 'admin', getCallLogs: 'admin',
    getRevenueSeries: 'admin', getKpis: 'admin',
    projectProgress: 'any', milestoneProgress: 'any', deliverableProgress: 'any', employeeScore: selfArg(0)
  },

  HRM: {
    init: null,
    getPolicy: 'any', updatePolicy: 'admin',
    getHolidays: 'any', addHoliday: 'admin', deleteHoliday: 'admin',
    getBalances: selfArg(0), creditCompOff: 'admin',
    getLeaveRequests: (user, args) => { if (user.role !== 'ADMIN') args[0] = Object.assign({}, args[0], { employeeId: user.empId }); return args; },
    applyLeave: selfPayload('employeeId', 0),
    approveLeave: 'admin', rejectLeave: 'admin',
    cancelLeave: 'any',                           
    getRegularisations: (user, args) => { if (user.role !== 'ADMIN') args[0] = Object.assign({}, args[0], { employeeId: user.empId }); return args; },
    requestRegularisation: selfPayload('employeeId', 0),
    approveRegularisation: 'admin', rejectRegularisation: 'admin',
    getTodayBoard: 'admin', getRegister: 'admin',
    getTimesheet: selfArg(0), getUtilisation: 'admin',
    workingDaysBetween: 'any', dayFlags: 'any', holidayOn: 'any', isWeekOff: 'any'
  },

  Profit: {
    init: null,
    getSettings: 'admin', updateSettings: 'admin', setEmployeeRates: 'admin', getRateCoverage: 'admin',
    getProject: 'admin', getPortfolio: 'admin', getByClient: 'admin', getByEmployee: 'admin',
    getAlerts: 'admin', loadedRateOf: 'admin'
  },

  Wallet: {
    init: null, onDeliverableCreated: null, onDeliverableRejected: null, settleOnApprove: null,    
    computeSettlement: 'admin', slabPreview: moneyGated('any'), slabFromPolicy: 'any',
    moneyVisibleToEmployees: 'any',
    getPolicy: 'any', updatePolicy: 'admin',
    canStart: selfArg(0),
    setPricing: 'admin',
    acceptEstimate: (user, args) => { if (user.role !== 'ADMIN') args[1] = user.empId; return assigneeArg(0)(user, args); },
    proposeEstimate: (user, args) => { if (user.role !== 'ADMIN') args[1] = user.empId; return assigneeArg(0)(user, args); },
    flagEstimate: (user, args) => { if (user.role !== 'ADMIN') args[1] = user.empId; return assigneeArg(0)(user, args); },
    acceptProposal: 'admin', counterEstimate: 'admin', getEstimateHint: 'admin',
    markBlocked: (user, args) => { if (user.role !== 'ADMIN') args[1] = user.empId; return assigneeArg(0)(user, args); },
    unblock: (user, args) => { if (user.role !== 'ADMIN') args[1] = user.empId; return assigneeArg(0)(user, args); },
    getBlocked: 'admin',
    getWallet: moneyGated(selfArg(0)), getLedger: moneyGated((user, args) => { if (user.role !== 'ADMIN') args[0] = Object.assign({}, args[0], { employeeId: user.empId }); return args; }),
    addEntry: 'admin', recordEmployeePayment: 'admin', reversePayment: 'admin',
    applyPenalty: 'admin', getPenaltyRecords: (user, args) => { if (user.role !== 'ADMIN') args[0] = Object.assign({}, args[0] || {}, { employeeId: user.empId }); return args; },
    raisePenaltyAppeal: (user, args) => { if (user.role !== 'ADMIN') args[1] = user.empId; return args; },
    resolvePenaltyAppeal: 'admin',
    getPenaltyAppeals: (user, args) => { if (user.role !== 'ADMIN') args[0] = Object.assign({}, args[0] || {}, { employeeId: user.empId }); return args; },
    raiseDispute: moneyGated((user, args) => { if (user.role !== 'ADMIN') args[1] = user.empId; return args; }),
    resolveDispute: 'admin',
    getDisputes: moneyGated((user, args) => { if (user.role !== 'ADMIN') args[0] = Object.assign({}, args[0], { employeeId: user.empId }); return args; }),
    getCompanySummary: 'admin', getEstimateBehaviour: 'admin', getOutbox: 'admin',
    focusQueue: selfArg(0)
  },

  EenSignals: {
    RULES: null,
    scan: 'admin', scanForAdmin: 'admin',
    scanForEmployee: selfArg(0),
    plainText: 'any'                             // pure formatter
  }
};

function selfNotif(i) {
  return (user, args) => { if (user.role !== 'ADMIN') args[i] = user.empId; return args; };
}
function moneyGated(inner) {
  return (user, args) => {
    if (user.role !== 'ADMIN' && !engine.get().Wallet.moneyVisibleToEmployees())
      throw err('FORBIDDEN', 'Not available — pay details are managed by your admin');
    if (inner === 'any') return args;
    return inner(user, args);
  };
}

/* Engine ke naye methods chhoot na jaayein — boot pe verify */
function assertCovered() {
  const ctx = engine.get();
  const missing = [];
  for (const api of Object.keys(GUARDS)) {
    for (const m of Object.keys(ctx[api] || {})) {
      if (typeof ctx[api][m] !== 'function') continue;
      if (!(m in GUARDS[api])) missing.push(api + '.' + m);
    }
  }
  if (missing.length) throw new Error('GUARDS inventory is missing: ' + missing.join(', ') + ' — decide access rules in core.js before exposing the server');
}

const snapshot = require('./snapshot.service');
function sanitizeResult(user, api, method, result) {
  if (user.role === 'ADMIN') return snapshot.stripSecrets(result);
  return snapshot.stripForEmployee(result, user.empId, engine.get());
}

async function call(user, api, method, args) {
  const table = GUARDS[api];
  if (!table || !(method in table)) throw err('NOT_FOUND', 'Unknown method ' + api + '.' + method);
  const guard = table[method];
  if (guard === null) throw err('FORBIDDEN', api + '.' + method + ' is server-internal');
  args = Array.isArray(args) ? args.slice() : [];
  if (guard === 'admin') { if (user.role !== 'ADMIN') throw FORBID(); }
  else if (guard === 'any') { /* ok */ }
  else args = guard(user, args);

  return unitOfWork(async () => {
    const ctx = engine.get();
    const mark = events.before(ctx);
    /* the engine may modify its arguments (e.g. it deletes a plain password
       after hashing it) — keep an untouched copy for credentials + emails */
    const original = JSON.parse(JSON.stringify(args === undefined ? [] : args));
    let result = ctx[api][method].apply(ctx[api], args);
    if (result && typeof result.then === 'function') result = await result;
    /* login credentials change in the same unit of work as the employee */
    if (api === 'DataAPI' && method === 'createEmployee' && result && result.id != null && original[0] && original[0].password)
      auth.syncEmployeeCred(result.id, original[0].password, original[0].mustChangePass);
    if (api === 'DataAPI' && method === 'updateEmployee' && original[1] && original[1].password)
      auth.syncEmployeeCred(original[0], original[1].password, original[1].mustChangePass);
    if (api === 'DataAPI' && method === 'deleteEmployee')
      auth.removeEmployeeCred(original[0]);
    events.after(ctx, mark, { user, api, method, args: original, result });
    return sanitizeResult(user, api, method, result);
  });
}

/* One request = one unit of work. Requests run one after another (the
   engine is a single in-memory object), and the response is sent only
   after MongoDB has stored the change. */
let lane = Promise.resolve();
function unitOfWork(fn) {
  const run = lane.then(async () => {
    const ctx = engine.get();
    store.begin();
    let result;
    try {
      result = await fn();
      /* the engine debounces saves by 120ms — force it inside this unit */
      ctx.DataAPI.flush();
    } catch (e) {
      store.rollback();
      await engine.reload();
      throw e;
    }
    try {
      await store.commit();
    } catch (e) {
      logger.error('MongoDB write failed:', e.message);
      await store.load({ transactions: store.usesTransactions() });
      await engine.reload();
      throw err('DB_UNAVAILABLE', 'Could not save to the database — please try again');
    }
    return result;
  });
  lane = run.catch(() => {});
  return run;
}

function afterEmployeeCredential(empId, plainPassword, mustChange) {
  auth.syncEmployeeCred(empId, plainPassword, mustChange);
}

/* Run fn alone in the request lane WITHOUT opening a unit of work (used by
   reset-demo, which re-boots the engine and manages its own writes). */
function exclusive(fn) {
  const run = lane.then(fn);
  lane = run.catch(() => {});
  return run;
}

module.exports = { call, unitOfWork, exclusive, GUARDS, assertCovered, afterEmployeeCredential, err };