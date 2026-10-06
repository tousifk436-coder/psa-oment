(function (root) {
  'use strict';

  var U = root.Utils, S = root.Schema, DataAPI = root.DataAPI;

  var ENTRY_TYPES = {
    TASK_CREDIT:       { key:'TASK_CREDIT',       label:'Task credit',        sign: +1 },
    SLAB_ADJUSTMENT:   { key:'SLAB_ADJUSTMENT',   label:'Late-slab price',    sign: -1 },
    DISPUTE_CREDIT:    { key:'DISPUTE_CREDIT',    label:'Dispute credit',     sign: +1 },
    BONUS:             { key:'BONUS',             label:'Bonus',              sign: +1 },
    ADJUSTMENT:        { key:'ADJUSTMENT',        label:'Manual adjustment',  sign:  0 },
    DEDUCTION:         { key:'DEDUCTION',         label:'Penalty deduction',  sign: -1 },
    PAYOUT:            { key:'PAYOUT',            label:'Payout',             sign: -1 }
  };

  var AGREEMENT = {
    NONE:      { key:'NONE',      label:'No estimate',          tone:'grey'  },
    PENDING:   { key:'PENDING',   label:'Waiting for you',      tone:'amber' },    
    COUNTERED: { key:'COUNTERED', label:'Employee proposed',    tone:'blue'  },    
    FLAGGED:   { key:'FLAGGED',   label:'Flagged unrealistic',  tone:'red'   },
    AGREED:    { key:'AGREED',    label:'Agreed',               tone:'green' }
  };

  var DISPUTE_STATUS = { OPEN:'OPEN', ACCEPTED:'ACCEPTED', REJECTED:'REJECTED' };

  /* ── Ensure collections + policy ─────────────────────────────────────── */
  function ensure() {
    var DB = DataAPI.raw();
    repairDirectPayments(DB);
    if (!DB) return null;
    if (!DB.walletEntries) DB.walletEntries = [];
    if (!DB.disputes)      DB.disputes = [];
    if (!DB.outbox)        DB.outbox = [];       // automated emails — backend flush karega
    if (!DB.payPolicy) DB.payPolicy = {
      wipLimit: 2,                  
      slabStepSecs: 3600,           
      slabCutPct: 6,               // % taken off the price for each slab (₹500 → ₹30)
      floorPct: 65,                 
      graceSecs: 0,                 
      autoAgreeBelowPaise: 20000,  // ₹200 se chhote tasks — admin ka estimate default accept
      autoAgreeBelowSecs: 3600,    // ya 1 hours se chhote
      flagWindowSecs: 900,          
      emailOnCredit: true,
      emailOnSlab: true,
      sandbagRatio: 0.6,           // logged/estimate isse kam = sandbagging candidate
      sandbagMinTasks: 4,
      showMoneyToEmployees: false    
    };
    if (DB.payPolicy.showMoneyToEmployees === undefined) DB.payPolicy.showMoneyToEmployees = false;
    /* Purane deliverables ko default fields do — idempotent */
    DB.deliverables.forEach(function (d) { ensureDeliverableFields(d, DB); });
    return DB;
  }

  function ensureDeliverableFields(d, DB) {
    if (!d.pricingMode) d.pricingMode = 'HOURLY';
    if (d.pricePaise == null) d.pricePaise = 0;
    if (!d.slab) d.slab = slabFromPolicy(DB);
    if (!d.agreement) d.agreement = { state: d.pricingMode === 'PIECE' ? 'PENDING' : 'NONE',
      adminSecs: d.estimateSecs || 0, employeeSecs: null, note: '', flagReason: '',
      agreedAt: null, agreedById: null, auto: false, history: [] };
    if (d.blocked === undefined) d.blocked = null;
    if (d.blockedSecs == null) d.blockedSecs = 0;
    if (!d.blockedLog) d.blockedLog = [];
    if (d.settlement === undefined) d.settlement = null;
    if (d.reworkCount == null) d.reworkCount = 0;
  }

  function slabFromPolicy(DB) {
    var p = (DB || DataAPI.raw()).payPolicy || {};
    return { stepSecs: p.slabStepSecs || 3600, cutPct: p.slabCutPct == null ? 6 : p.slabCutPct,
             floorPct: p.floorPct == null ? 65 : p.floorPct, graceSecs: p.graceSecs || 0 };
  }

  /* ── Helpers ─────────────────────────────────────────────────────────── */
  function ok(v) { if (DataAPI.touch) DataAPI.touch(); if (DataAPI.flush) DataAPI.flush(); return Promise.resolve(v); }
  function fail(msg, code) { var e = new Error(msg); e.code = code || 'ERROR'; return Promise.reject(e); }
  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  function now() { return new Date().toISOString(); }
  function del(DB, id) { return DB.deliverables.find(function (d) { return String(d.id) === String(id); }); }
  function emp(DB, id) { return DB.employees.find(function (e) { return String(e.id) === String(id); }); }
  function repairDirectPayments(DB) {
    if (!DB.walletEntries) return;
    var cancelled = {};
    DB.walletEntries.forEach(function (x) { if (x.meta && x.meta.cancels) cancelled[x.meta.cancels] = 1; if (x.meta && x.meta.reversalOf) cancelled[x.meta.reversalOf] = 1; });
    DB.walletEntries.filter(function (x) { return x.type === 'BONUS' && x.meta && x.meta.direct && !cancelled[x.id]; }).forEach(function (x) {
      DB.walletEntries.unshift({ id: U.newId('w'), employeeId: x.employeeId, deliverableId: null, projectId: x.projectId || null, type: 'ADJUSTMENT',
        amountPaise: -x.amountPaise, why: 'Correction: a payment is not earnings', createdAt: new Date().toISOString(),
        meta: { manual: true, cancels: x.id, system: true } });
    });
  }

  function empName(DB, id) { var e = emp(DB, id); return e ? e.name : (id === DB.adminUser.id ? DB.adminUser.name : 'Unknown'); }
  function projName(DB, id) { var p = DB.projects.find(function (x) { return x.id === id; }); return p ? p.name : '\u2014'; }
  function rupee(paise) { return U.fmtRupee(paise).replace('.00', ''); }
  function fmtT(secs) { return S.TIME.fmtShort(secs); }

  function notify(DB, recipientId, kind, title, body, entityType, entityId) {
    if (recipientId == null) return;
    DB.notifications.unshift({
      id: U.newId('n'), recipientId: recipientId, kind: kind, title: title, body: body,
      entityType: entityType || null, entityId: entityId != null ? entityId : null,
      read: false, createdAt: now()
    });
  }
  function activity(DB, icon, color, text) {
    DB.activity.unshift({ icon: icon, color: color, text: text, at: now() });
    if (DB.activity.length > 80) DB.activity.length = 80;
  }
  function queueEmail(DB, to, subject, body, kind, meta) {
    DB.outbox.unshift({ id: U.newId('mail'), to: to, subject: subject, body: body,
      kind: kind || 'INFO', meta: meta || {}, status: 'QUEUED', createdAt: now() });
    if (DB.outbox.length > 200) DB.outbox.length = 200;
  }

  function isPiece(d) { return d && d.pricingMode === 'PIECE'; }

  function splitPaise(total, n) {
    if (!n) return [];
    var base = Math.floor(total / n), rem = total - base * n, out = [];
    for (var i = 0; i < n; i++) out.push(base + (i === 0 ? rem : 0));
    return out;
  }

  /* ── Settlement math — pure, testable ─────────────────────────────────── */
  function computeSettlement(d, policy) {
    policy = policy || {};
    var slab = d.slab || {};
    var base = d.pricePaise || 0;
    var est = d.estimateSecs || 0;
    var chargeable = d.loggedSecs || 0;
    var grace = slab.graceSecs || 0;
    var overSecs = Math.max(0, chargeable - est - grace);
    var step = slab.stepSecs || 3600;
    var steps = est > 0 ? Math.floor(overSecs / step) : 0;
    var cutPct = slab.cutPct == null ? 6 : slab.cutPct;
    var floorPct = slab.floorPct == null ? 65 : slab.floorPct;
    var floorPaise = Math.round(base * floorPct / 100);
    var cutPaise = Math.round(base * cutPct / 100) * steps;
    var finalPaise = Math.max(floorPaise, base - cutPaise);
    var appliedCut = base - finalPaise;
    var hitFloor = steps > 0 && (base - cutPaise) < floorPaise;

    var why;
    if (!est) why = 'No agreed estimate, so the full price applies.';
    else if (steps === 0) why = 'Agreed ' + fmtT(est) + ', took ' + fmtT(chargeable) + ' \u2014 within time. Full price.';
    else why = 'Agreed ' + fmtT(est) + ', took ' + fmtT(chargeable) + ' (' + fmtT(overSecs) + ' extra). ' +
      steps + ' slab' + (steps > 1 ? 's' : '') + ' \u00d7 ' + cutPct + '% = ' + rupee(appliedCut) + ' off' +
      (hitFloor ? ' (floor ' + floorPct + '% floor reached)' : '') + '.';

    return {
      basePaise: base, finalPaise: finalPaise, cutPaise: appliedCut,
      estimateSecs: est, chargeableSecs: chargeable, overSecs: overSecs,
      steps: steps, cutPct: cutPct, stepSecs: step, floorPaise: floorPaise, hitFloor: hitFloor,
      why: why
    };
  }

  function slabPreview(d, liveLoggedSecs) {
    var copy = clone(d);
    copy.loggedSecs = liveLoggedSecs != null ? liveLoggedSecs : (d.loggedSecs || 0);
    var s = computeSettlement(copy);
    var slab = d.slab || {};
    var step = slab.stepSecs || 3600;
    var nextAt = (d.estimateSecs || 0) + (slab.graceSecs || 0) + (s.steps + 1) * step;
    var secsToNext = Math.max(0, nextAt - copy.loggedSecs);
    var nextPaise = Math.max(s.floorPaise, s.basePaise - Math.round(s.basePaise * s.cutPct / 100) * (s.steps + 1));
    var atFloor = s.finalPaise <= s.floorPaise;
    return {
      currentPaise: s.finalPaise, nextPaise: nextPaise, secsToNext: atFloor ? null : secsToNext,
      steps: s.steps, atFloor: atFloor, floorPaise: s.floorPaise, why: s.why
    };
  }

  /* ── Agreement helpers ───────────────────────────────────────────────── */
  function shouldAutoAgree(d, DB) {
    var p = DB.payPolicy;
    return (d.pricePaise || 0) < (p.autoAgreeBelowPaise || 0) || (d.estimateSecs || 0) <= (p.autoAgreeBelowSecs || 0);
  }
  function pushAg(d, ev) { if (!d.agreement.history) d.agreement.history = []; d.agreement.history.push(Object.assign({ at: now() }, ev)); }

  function estimateHint(DB, d) {
    var assignees = d.assigneeIds || [];
    var words = String(d.title || '').toLowerCase().split(/[^a-z0-9]+/).filter(function (w) { return w.length > 3; });
    function similar(x) {
      if (x.id === d.id || x.status !== 'DONE' || !x.estimateSecs || !x.loggedSecs) return false;
      var t = String(x.title || '').toLowerCase();
      return words.some(function (w) { return t.indexOf(w) >= 0; }) || x.projectId === d.projectId;
    }
    var mine = DB.deliverables.filter(function (x) { return similar(x) && (x.assigneeIds || []).some(function (a) { return assignees.indexOf(a) >= 0; }); });
    var team = DB.deliverables.filter(similar);
    function stats(list) {
      if (!list.length) return null;
      var logged = list.reduce(function (s, x) { return s + x.loggedSecs; }, 0) / list.length;
      var ratio = list.reduce(function (s, x) { return s + x.loggedSecs / x.estimateSecs; }, 0) / list.length;
      return { count: list.length, avgLoggedSecs: Math.round(logged), avgRatio: Math.round(ratio * 100) / 100 };
    }
    return { person: stats(mine), team: stats(team) };
  }

  /* ── Public API ──────────────────────────────────────────────────────── */
  var Wallet = {
    ENTRY_TYPES: ENTRY_TYPES,
    AGREEMENT: AGREEMENT,
    DISPUTE_STATUS: DISPUTE_STATUS,
    computeSettlement: computeSettlement,
    moneyVisibleToEmployees: function () {
      var DB2 = DataAPI.raw();
      return !!(DB2 && DB2.payPolicy && DB2.payPolicy.showMoneyToEmployees);
    },
    slabPreview: slabPreview,
    slabFromPolicy: slabFromPolicy,

    init: function () { ensure(); return ok(true); },

    /* ── policy ── */
    getPolicy: function () { var DB = ensure(); return ok(clone(DB.payPolicy)); },
    updatePolicy: function (patch) {
      var DB = ensure();
      patch = patch || {};
      if (patch.floorPct != null && (patch.floorPct < 0 || patch.floorPct > 100)) return fail('Floor must be between 0 and 100%', 'VALIDATION');
      if (patch.slabCutPct != null && (patch.slabCutPct < 0 || patch.slabCutPct > 50)) return fail('Keep the slab cut between 0 and 50%', 'VALIDATION');
      if (patch.wipLimit != null && patch.wipLimit < 1) return fail('WIP limit must be at least 1', 'VALIDATION');
      Object.assign(DB.payPolicy, patch);
      activity(DB, '\u2699\uFE0F', '#F0EEE9', 'Pay policy updated');
      return ok(clone(DB.payPolicy));
    },

    onDeliverableCreated: function (d, payload) {
      var DB = ensure();
      payload = payload || {};
      d.pricingMode = payload.pricingMode === 'PIECE' ? 'PIECE' : 'HOURLY';
      d.pricePaise = Math.max(0, Math.round(payload.pricePaise || 0));
      d.slab = Object.assign(slabFromPolicy(DB), payload.slab || {});
      d.blocked = null; d.blockedSecs = 0; d.blockedLog = []; d.settlement = null; d.liveSettlement = null; d.reworkCount = 0;
      var auto = isPiece(d) && shouldAutoAgree(d, DB);
      d.agreement = {
        state: isPiece(d) ? (auto ? 'AGREED' : 'PENDING') : 'NONE',
        adminSecs: d.estimateSecs || 0, employeeSecs: null, note: '', flagReason: '',
        agreedAt: auto ? now() : null, agreedById: null, auto: auto, history: []
      };
      pushAg(d, { type: 'admin_set', secs: d.estimateSecs, by: d.createdById, auto: auto });
    },

    /* Reject pe rework count — rushing ka natural counter */
    onDeliverableRejected: function (d) { ensure(); d.reworkCount = (d.reworkCount || 0) + 1; },

    canStart: function (employeeId, deliverableId) {
      var DB = ensure();
      var d = del(DB, deliverableId);
      if (!d) return { ok: false, reason: 'Task not found', code: 'NOT_FOUND' };
      if (d.blocked) return { ok: false, reason: 'This task is blocked: ' + d.blocked.reason + '. It has to be unblocked first.', code: 'BLOCKED' };
      if (isPiece(d) && d.agreement.state !== 'AGREED')
        return { ok: false, reason: 'Agree the estimate first \u2014 the timer won’t run without an agreement.', code: 'NOT_AGREED' };
      var limit = DB.payPolicy.wipLimit || 2;
      var active = DB.deliverables.filter(function (x) {
        return x.id !== d.id && x.status === 'IN_PROGRESS' && (x.assigneeIds || []).indexOf(Number(employeeId)) >= 0;
      });
      if (d.status !== 'IN_PROGRESS' && active.length >= limit)
        return { ok: false, reason: 'You already have ' + active.length + ' tasks in progress (limit ' + limit + '). Finish or submit one first.', code: 'WIP_LIMIT', active: active.map(function (x) { return x.title; }) };
      return { ok: true };
    },

    /* ── pricing (admin) ── */
    setPricing: function (deliverableId, patch) {
      var DB = ensure();
      var d = del(DB, deliverableId);
      if (!d) return fail('Task not found', 'NOT_FOUND');
      if (d.status === 'DONE') return fail('An approved task’s price can’t change \u2014 add an adjustment entry in the ledger.', 'LOCKED');
      patch = patch || {};
      if (patch.pricingMode) d.pricingMode = patch.pricingMode === 'PIECE' ? 'PIECE' : 'HOURLY';
      if (patch.pricePaise != null) d.pricePaise = Math.max(0, Math.round(patch.pricePaise));
      if (patch.slab) d.slab = Object.assign({}, d.slab, patch.slab);
      if (isPiece(d) && d.agreement.state === 'NONE') d.agreement.state = shouldAutoAgree(d, DB) ? 'AGREED' : 'PENDING';
      if (!isPiece(d)) d.agreement.state = 'NONE';
      return ok(clone(d));
    },

    /* ── estimate negotiation ── */
    getEstimateHint: function (deliverableId) {
      var DB = ensure(); var d = del(DB, deliverableId);
      if (!d) return fail('Task not found', 'NOT_FOUND');
      return Promise.resolve(estimateHint(DB, d));
    },
    acceptEstimate: function (deliverableId, employeeId) {
      var DB = ensure(); var d = del(DB, deliverableId);
      if (!d) return fail('Task not found', 'NOT_FOUND');
      if ((d.assigneeIds || []).indexOf(Number(employeeId)) < 0) return fail('This is not your task', 'FORBIDDEN');
      if (d.agreement.state === 'AGREED') return ok(clone(d));
      d.estimateSecs = d.agreement.adminSecs || d.estimateSecs;
      d.agreement.state = 'AGREED'; d.agreement.agreedAt = now(); d.agreement.agreedById = Number(employeeId); d.agreement.auto = false;
      pushAg(d, { type: 'employee_accept', secs: d.estimateSecs, by: Number(employeeId) });
      d.timeline.push({ type: 'assign', text: 'Estimate agreed: ' + fmtT(d.estimateSecs) + ' for ' + rupee(d.pricePaise), time: now() });
      notify(DB, DB.adminUser.id, 'INFO', empName(DB, employeeId) + ' accepted the estimate', '"' + d.title + '" \u00b7 ' + fmtT(d.estimateSecs), 'DELIVERABLE', d.id);
      return ok(clone(d));
    },
    proposeEstimate: function (deliverableId, employeeId, secs, note) {
      var DB = ensure(); var d = del(DB, deliverableId);
      if (!d) return fail('Task not found', 'NOT_FOUND');
      if ((d.assigneeIds || []).indexOf(Number(employeeId)) < 0) return fail('This is not your task', 'FORBIDDEN');
      secs = Math.round(Number(secs) || 0);
      if (secs <= 0) return fail('Time must be more than 0', 'VALIDATION');
      if (!String(note || '').trim()) return fail('Say why in one line \u2014 the admin will see exactly this', 'VALIDATION');
      d.agreement.state = 'COUNTERED'; d.agreement.employeeSecs = secs; d.agreement.note = String(note).trim();
      pushAg(d, { type: 'employee_propose', secs: secs, by: Number(employeeId), note: d.agreement.note });
      notify(DB, DB.adminUser.id, 'REVIEW', empName(DB, employeeId) + ' proposed ' + fmtT(secs),
        '"' + d.title + '" \u00b7 you had set ' + fmtT(d.agreement.adminSecs) + '. Reason: ' + d.agreement.note, 'DELIVERABLE', d.id);
      return ok(clone(d));
    },
    flagEstimate: function (deliverableId, employeeId, reason) {
      var DB = ensure(); var d = del(DB, deliverableId);
      if (!d) return fail('Task not found', 'NOT_FOUND');
      if ((d.assigneeIds || []).indexOf(Number(employeeId)) < 0) return fail('This is not your task', 'FORBIDDEN');
      if (!String(reason || '').trim()) return fail('A reason is required', 'VALIDATION');
      if (d.agreement.state === 'AGREED' && d.agreement.auto) {
        var age = (Date.now() - new Date(d.agreement.agreedAt || d.createdAt).getTime()) / 1000;
        if (age > (DB.payPolicy.flagWindowSecs || 900)) return fail('The flag window has closed (' + Math.round((DB.payPolicy.flagWindowSecs || 900) / 60) + ' min). Talk to the admin.', 'WINDOW_CLOSED');
      } else if (d.agreement.state === 'AGREED') {
        return fail('An agreed estimate can’t be flagged \u2014 the time to propose was before accepting.', 'LOCKED');
      }
      d.agreement.state = 'FLAGGED'; d.agreement.flagReason = String(reason).trim();
      pushAg(d, { type: 'employee_flag', by: Number(employeeId), note: d.agreement.flagReason });
      notify(DB, DB.adminUser.id, 'REVIEW', empName(DB, employeeId) + ' flagged the estimate', '"' + d.title + '": ' + d.agreement.flagReason, 'DELIVERABLE', d.id);
      return ok(clone(d));
    },
    /* Admin: accept the employee's proposal */
    acceptProposal: function (deliverableId) {
      var DB = ensure(); var d = del(DB, deliverableId);
      if (!d) return fail('Task not found', 'NOT_FOUND');
      if (d.agreement.state !== 'COUNTERED' || !d.agreement.employeeSecs) return fail('No employee proposal is pending', 'VALIDATION');
      d.estimateSecs = d.agreement.employeeSecs; d.agreement.adminSecs = d.estimateSecs;
      d.agreement.state = 'AGREED'; d.agreement.agreedAt = now(); d.agreement.agreedById = DB.adminUser.id; d.agreement.auto = false;
      pushAg(d, { type: 'admin_accept', secs: d.estimateSecs, by: DB.adminUser.id });
      d.timeline.push({ type: 'assign', text: 'Estimate agreed: ' + fmtT(d.estimateSecs) + ' for ' + rupee(d.pricePaise), time: now() });
      (d.assigneeIds || []).forEach(function (aid) {
        notify(DB, aid, 'APPROVED', 'Your estimate was accepted', '"' + d.title + '" \u00b7 ' + fmtT(d.estimateSecs) + ' agreed. You can start now.', 'DELIVERABLE', d.id);
      });
      return ok(clone(d));
    },
    counterEstimate: function (deliverableId, secs, note) {
      var DB = ensure(); var d = del(DB, deliverableId);
      if (!d) return fail('Task not found', 'NOT_FOUND');
      secs = Math.round(Number(secs) || 0);
      if (secs <= 0) return fail('Time must be more than 0', 'VALIDATION');
      d.agreement.adminSecs = secs; d.agreement.state = 'PENDING'; d.agreement.note = String(note || '').trim(); d.agreement.auto = false;
      d.estimateSecs = secs;
      pushAg(d, { type: 'admin_counter', secs: secs, by: DB.adminUser.id, note: d.agreement.note });
      (d.assigneeIds || []).forEach(function (aid) {
        notify(DB, aid, 'REVIEW', 'Admin proposed a new estimate: ' + fmtT(secs), '"' + d.title + '"' + (d.agreement.note ? ' \u00b7 ' + d.agreement.note : '') + '. Accept it or propose your own time.', 'DELIVERABLE', d.id);
      });
      return ok(clone(d));
    },

    /* ── blocked ── */
    markBlocked: function (deliverableId, byId, reason) {
      var DB = ensure(); var d = del(DB, deliverableId);
      if (!d) return fail('Task not found', 'NOT_FOUND');
      if (!String(reason || '').trim()) return fail('Say what you need \u2014 the admin will see exactly this', 'VALIDATION');
      if (d.blocked) return fail('Already blocked', 'VALIDATION');
      if (d.status === 'DONE' || d.status === 'IN_REVIEW') return fail('A task in review or done can’t be blocked', 'VALIDATION');
      DB.timeEntries.filter(function (t) { return String(t.deliverableId) === String(d.id) && !t.endedAt; })
        .forEach(function (t) {
          t.endedAt = now();
          var secs = Math.max(0, Math.floor((new Date(t.endedAt) - new Date(t.startedAt)) / 1000));
          d.loggedSecs = (d.loggedSecs || 0) + secs;
        });
      d.blocked = { reason: String(reason).trim(), since: now(), byId: Number(byId) };
      d.timeline.push({ type: 'pause', text: 'Blocked \u2014 ' + d.blocked.reason, time: now() });
      notify(DB, DB.adminUser.id, 'REJECTED', empName(DB, byId) + ' is blocked', '"' + d.title + '": ' + d.blocked.reason, 'DELIVERABLE', d.id);
      activity(DB, '\uD83D\uDED1', '#FEF2F2', '<strong>' + U.esc(empName(DB, byId)) + '</strong> blocked on <strong>' + U.esc(d.title) + '</strong>');
      return ok(clone(d));
    },
    unblock: function (deliverableId, byId, note) {
      var DB = ensure(); var d = del(DB, deliverableId);
      if (!d) return fail('Task not found', 'NOT_FOUND');
      if (!d.blocked) return fail('Not blocked', 'VALIDATION');
      var secs = Math.max(0, Math.floor((Date.now() - new Date(d.blocked.since).getTime()) / 1000));
      d.blockedSecs = (d.blockedSecs || 0) + secs;
      d.blockedLog.push({ reason: d.blocked.reason, since: d.blocked.since, until: now(), secs: secs, resolvedById: Number(byId), note: String(note || '').trim() });
      var wasBy = d.blocked.byId;
      d.blocked = null;
      d.timeline.push({ type: 'resume', text: 'Unblocked' + (note ? ' \u2014 ' + String(note).trim() : '') + ' (' + fmtT(secs) + ' blocked)', time: now() });
      (d.assigneeIds || []).forEach(function (aid) {
        notify(DB, aid, 'APPROVED', 'Your block was cleared', '"' + d.title + '"' + (note ? ' \u00b7 ' + String(note).trim() : '') + '. You can start again.', 'DELIVERABLE', d.id);
      });
      if (wasBy !== Number(byId)) notify(DB, DB.adminUser.id, 'INFO', 'Block resolved', '"' + d.title + '" \u00b7 ' + 'was blocked for ' + fmtT(secs), 'DELIVERABLE', d.id);
      return ok(clone(d));
    },
    getBlocked: function () {
      var DB = ensure();
      return Promise.resolve(DB.deliverables.filter(function (d) { return !!d.blocked; }).map(function (d) {
        return { id: d.id, title: d.title, project: projName(DB, d.projectId), projectId: d.projectId,
          reason: d.blocked.reason, since: d.blocked.since, byId: d.blocked.byId, byName: empName(DB, d.blocked.byId),
          waitingSecs: Math.floor((Date.now() - new Date(d.blocked.since).getTime()) / 1000),
          pricePaise: d.pricePaise, pricingMode: d.pricingMode };
      }).sort(function (a, b) { return b.waitingSecs - a.waitingSecs; }));
    },

    /* ── settlement on approve (DataAPI.approveDeliverable se) ── */
    settleOnApprove: function (d) {
      var DB = ensure();
      if (!isPiece(d) || d.settlement) return null;    
      var s = computeSettlement(d, DB.payPolicy);
      var ids = d.assigneeIds || [];
      var shares = splitPaise(s.basePaise, ids.length);
      var cutShares = splitPaise(s.cutPaise, ids.length);
      var entries = [];
      ids.forEach(function (aid, i) {
        var e = emp(DB, aid);
        var credit = {
          id: U.newId('w'), employeeId: aid, deliverableId: d.id, projectId: d.projectId,
          type: 'TASK_CREDIT', amountPaise: shares[i],
          why: '"' + d.title + '" was approved. ' + (ids.length > 1 ? 'Price ' + rupee(s.basePaise) + ' ' + ids.length + ' people.' : 'Task price ' + rupee(s.basePaise) + '.'),
          createdAt: now(), meta: { settlement: s }
        };
        DB.walletEntries.unshift(credit); entries.push(credit);
        if (cutShares[i] > 0) {
          var adj = {
            id: U.newId('w'), employeeId: aid, deliverableId: d.id, projectId: d.projectId,
            type: 'SLAB_ADJUSTMENT', amountPaise: -cutShares[i],
            why: 'Late slab applied. ' + s.why, createdAt: now(), meta: { settlement: s, creditEntryId: credit.id }
          };
          DB.walletEntries.unshift(adj); entries.push(adj);
        }
        var net = shares[i] - cutShares[i];
        var showMoney = !!DB.payPolicy.showMoneyToEmployees;
        if (showMoney) notify(DB, aid, 'APPROVED', rupee(net) + ' added to your wallet',
          '"' + d.title + '" \u00b7 ' + (cutShares[i] > 0 ? rupee(shares[i]) + ' \u2212 ' + rupee(cutShares[i]) + ' slab. ' + s.why : 'Within time \u2014 full price.'),
          'WALLET', credit.id);
        if (e && DB.payPolicy.emailOnCredit && showMoney) {
          queueEmail(DB, e.email, 'Oment: ' + rupee(net) + ' credited for "' + d.title + '"',
            'Hi ' + e.name.split(' ')[0] + ',\n\n"' + d.title + '" (' + projName(DB, d.projectId) + ') has been approved.\n\n' +
            'Task price: ' + rupee(shares[i]) + '\n' + (cutShares[i] > 0 ? 'Late slab: \u2212' + rupee(cutShares[i]) + '\n' : '') +
            'Credited: ' + rupee(net) + '\n\nWhy: ' + s.why + '\n\nFull details are in your Wallet. If something looks wrong, tap "Dispute" on the entry.\n\n\u2014 Oment',
            cutShares[i] > 0 ? 'SLAB_APPLIED' : 'WALLET_CREDIT', { employeeId: aid, deliverableId: d.id, amountPaise: net });
        }
      });
      d.settlement = Object.assign({ settledAt: now(), entryIds: entries.map(function (x) { return x.id; }) }, s);
      d.liveSettlement = Object.assign({}, d.settlement, { currentPaise: s.finalPaise });
      activity(DB, '\uD83D\uDCB0', '#ECFDF5', '<strong>' + U.esc(d.title) + '</strong> settled \u2014 ' + rupee(s.finalPaise) + (s.cutPaise ? ' (slab \u2212' + rupee(s.cutPaise) + ')' : ''));
      return d.settlement;
    },

    /* ── ledger reads ── */
    getWallet: function (employeeId) {
      var DB = ensure();
      var eid = Number(employeeId);
      var entries = DB.walletEntries.filter(function (w) { return w.employeeId === eid; });
      var sum = function (type) { return entries.filter(function (w) { return w.type === type; }).reduce(function (s, w) { return s + w.amountPaise; }, 0); };
      var balance = entries.reduce(function (s, w) { return s + w.amountPaise; }, 0);
      var monthKey = now().slice(0, 7);
      var thisMonth = entries.filter(function (w) { return w.createdAt.slice(0, 7) === monthKey && w.type !== 'PAYOUT'; })
        .reduce(function (s, w) { return s + w.amountPaise; }, 0);
      var open = DB.disputes.filter(function (x) { return x.employeeId === eid && x.status === 'OPEN'; });
      var disputedIds = {};
      DB.disputes.forEach(function (x) { if (x.employeeId === eid) disputedIds[x.entryId] = x.status; });
      var committed = DB.deliverables.filter(function (d) { return isPiece(d) && d.status !== 'DONE' && (d.assigneeIds || []).indexOf(eid) >= 0; })
        .reduce(function (s, d) { return s + splitPaise(d.pricePaise, (d.assigneeIds || []).length)[(d.assigneeIds || []).indexOf(eid)]; }, 0);
      return Promise.resolve({
        employeeId: eid, balancePaise: balance,
        earnedPaise: sum('TASK_CREDIT') + sum('BONUS') + sum('DISPUTE_CREDIT'),
        slabPaise: sum('SLAB_ADJUSTMENT'), paidOutPaise: -sum('PAYOUT'), adjustmentsPaise: sum('ADJUSTMENT'),
        deductionsPaise: -sum('DEDUCTION'),
        thisMonthPaise: thisMonth, committedPaise: committed, openDisputes: open.length,
        entries: entries.map(function (w) { return Object.assign(clone(w), {
          disputeStatus: disputedIds[w.id] || null,
          taskTitle: (del(DB, w.deliverableId) || {}).title || null,
          project: w.projectId != null ? projName(DB, w.projectId) : null
        }); })
      });
    },

    /* ── disputes ── */
    raiseDispute: function (entryId, employeeId, reason) {
      var DB = ensure();
      var w = DB.walletEntries.find(function (x) { return x.id === entryId; });
      if (!w) return fail('Entry not found', 'NOT_FOUND');
      if (w.employeeId !== Number(employeeId)) return fail('This is not your entry', 'FORBIDDEN');
      if (!String(reason || '').trim()) return fail('Say what is wrong \u2014 a reason is required', 'VALIDATION');
      if (DB.disputes.some(function (x) { return x.entryId === entryId && x.status === 'OPEN'; })) return fail('A dispute is already open on this entry', 'DUPLICATE');
      var disp = { id: U.newId('dsp'), entryId: entryId, employeeId: Number(employeeId), deliverableId: w.deliverableId,
        amountPaise: w.amountPaise, reason: String(reason).trim(), status: 'OPEN', resolutionNote: '', creditedPaise: 0,
        createdAt: now(), resolvedAt: null };
      DB.disputes.unshift(disp);
      var d = del(DB, w.deliverableId);
      notify(DB, DB.adminUser.id, 'REJECTED', empName(DB, employeeId) + ' disputed a wallet entry',
        (d ? '"' + d.title + '" \u00b7 ' : '') + rupee(Math.abs(w.amountPaise)) + ' \u00b7 ' + disp.reason, 'DISPUTE', disp.id);
      activity(DB, '\u2696\uFE0F', '#FFFBEB', '<strong>' + U.esc(empName(DB, employeeId)) + '</strong> raised a wallet dispute');
      return ok(clone(disp));
    },
    resolveDispute: function (disputeId, opts) {
      var DB = ensure();
      opts = opts || {};
      var disp = DB.disputes.find(function (x) { return x.id === disputeId; });
      if (!disp) return fail('Dispute not found', 'NOT_FOUND');
      if (disp.status !== 'OPEN') return fail('This dispute is already resolved', 'LOCKED');
      if (!String(opts.note || '').trim()) return fail('A resolution note is required \u2014 the employee will see exactly this', 'VALIDATION');
      disp.resolutionNote = String(opts.note).trim(); disp.resolvedAt = now();
      var d = del(DB, disp.deliverableId);
      if (opts.accept) {
        var amt = Math.round(Number(opts.creditPaise != null ? opts.creditPaise : Math.abs(disp.amountPaise)));
        if (amt <= 0) return fail('Credit amount must be more than 0', 'VALIDATION');
        disp.status = 'ACCEPTED'; disp.creditedPaise = amt;
        DB.walletEntries.unshift({ id: U.newId('w'), employeeId: disp.employeeId, deliverableId: disp.deliverableId, projectId: d ? d.projectId : null,
          type: 'DISPUTE_CREDIT', amountPaise: amt, why: 'Dispute accepted: ' + disp.resolutionNote, createdAt: now(), meta: { disputeId: disp.id } });
        notify(DB, disp.employeeId, 'APPROVED', 'Dispute accept \u2014 ' + rupee(amt) + ' credit', disp.resolutionNote, 'WALLET', disp.id);
      } else {
        disp.status = 'REJECTED';
        notify(DB, disp.employeeId, 'INFO', 'Your dispute was answered', disp.resolutionNote, 'WALLET', disp.id);
      }
      return ok(clone(disp));
    },
    getDisputes: function (filter) {
      var DB = ensure(); filter = filter || {};
      var rows = DB.disputes.slice();
      if (filter.status) rows = rows.filter(function (x) { return x.status === filter.status; });
      if (filter.employeeId != null) rows = rows.filter(function (x) { return x.employeeId === Number(filter.employeeId); });
      return Promise.resolve(rows.map(function (x) {
        var d = del(DB, x.deliverableId);
        return Object.assign(clone(x), { employeeName: empName(DB, x.employeeId), taskTitle: d ? d.title : null, project: d ? projName(DB, d.projectId) : null });
      }));
    },

    /* ── manual entries (admin) ── */
    /* meta (optional): { projectId, method, reference, date, note, direct } */
    addEntry: function (employeeId, type, amountPaise, why, meta) {
      meta = meta || {};
      var DB = ensure();
      if (!ENTRY_TYPES[type] || type === 'TASK_CREDIT' || type === 'SLAB_ADJUSTMENT') return fail('This entry type can’t be created manually', 'VALIDATION');
      if (!emp(DB, employeeId)) return fail('Employee not found', 'NOT_FOUND');
      amountPaise = Math.round(Number(amountPaise) || 0);
      if (!amountPaise) return fail('Amount can’t be 0', 'VALIDATION');
      if (!String(why || '').trim()) return fail('A reason is required \u2014 every ledger entry has a "why"', 'VALIDATION');
      if (type === 'PAYOUT') {
        if (amountPaise > 0) amountPaise = -amountPaise;
        var bal = DB.walletEntries.filter(function (w) { return w.employeeId === Number(employeeId); }).reduce(function (s, w) { return s + w.amountPaise; }, 0);
        if (!meta.direct && -amountPaise > bal) return fail('That is more than the balance due (' + rupee(bal) + '). Choose "Direct payment" for salary, advances or project fees.', 'VALIDATION');
      }
      if (type === 'BONUS' || type === 'DISPUTE_CREDIT') amountPaise = Math.abs(amountPaise);
      if (type === 'DEDUCTION') amountPaise = -Math.abs(amountPaise);
      var w = { id: U.newId('w'), employeeId: Number(employeeId), deliverableId: null,
        projectId: meta.projectId != null && meta.projectId !== '' ? Number(meta.projectId) : null, type: type,
        amountPaise: amountPaise, why: String(why).trim(), createdAt: now(),
        meta: { manual: true, byId: DB.adminUser.id, method: meta.method || null, reference: meta.reference || null,
                date: meta.date || null, direct: !!meta.direct, penalty: meta.penalty || null } };
      DB.walletEntries.unshift(w);
      notify(DB, Number(employeeId), amountPaise > 0 ? 'APPROVED' : 'INFO', ENTRY_TYPES[type].label + ': ' + rupee(Math.abs(amountPaise)), w.why, 'WALLET', w.id);
      if (type === 'PAYOUT') {
        var e = emp(DB, employeeId);
        if (e) queueEmail(DB, e.email, 'Oment: payout of ' + rupee(-amountPaise), 'Hi ' + e.name.split(' ')[0] + ',\n\n' + rupee(-amountPaise) + ' paid out. ' + w.why + '\n\n\u2014 Oment', 'PAYOUT', { employeeId: e.id, amountPaise: -amountPaise });
      }
      if (type === 'DEDUCTION') {
        var de = emp(DB, employeeId);
        var pm = w.meta && w.meta.penalty ? w.meta.penalty : {};
        if (de) queueEmail(DB, de.email, 'Oment: penalty deduction of ' + rupee(Math.abs(amountPaise)),
          'Hi ' + de.name.split(' ')[0] + ',\n\nA penalty deduction has been recorded in your Oment payout.\n\n' +
          'Penalty: ' + (pm.ruleName || 'Penalty') + '\n' +
          'Date: ' + (pm.date || w.createdAt.slice(0, 10)) + '\n' +
          'Penalty days: ' + (pm.penaltyDays != null ? pm.penaltyDays : '—') + '\n' +
          'Deduction: ' + rupee(Math.abs(amountPaise)) + '\n' +
          'Reason: ' + w.why + '\n\nYour payout balance has been updated accordingly.\n\n— Oment',
          'PENALTY', { employeeId: de.id, amountPaise: Math.abs(amountPaise), penalty: pm });
      }
      return ok(clone(w));
    },

    /* Record money sent to an employee.
       mode WALLET  → paid from what they earned (a payout from their balance)
       mode DIRECT  → salary, advance or a project fee paid directly: recorded as
                      earned + paid, so their balance doesn't change but the
                      project's spend does. */
    recordEmployeePayment: function (employeeId, p) {
      /* A payment only reduces what is owed ("still to pay"). It is never
         counted as earnings. Paying more than is owed is allowed and shows as
         an advance. */
      p = p || {};
      var amt = Math.round(Math.abs(Number(p.amountPaise) || 0));
      if (!amt) return fail('Enter the amount paid', 'VALIDATION');
      var date = p.date && /^\d{4}-\d{2}-\d{2}$/.test(p.date) ? p.date : U.isoDate(new Date());
      if (date > U.isoDate(new Date())) return fail('The date cannot be in the future', 'VALIDATION');
      var proj = p.projectId != null && p.projectId !== '' ? ensure().projects.find(function (x) { return x.id === Number(p.projectId); }) : null;
      var why = (String(p.note || '').trim() || 'Payment') + (proj ? ' \u2014 ' + proj.name : '') +
        (p.method ? ' (' + p.method + (p.reference ? ', ref ' + p.reference : '') + ')' : '');
      return this.addEntry(employeeId, 'PAYOUT', -amt, why,
        { projectId: proj ? proj.id : null, method: p.method || null, reference: p.reference || null, date: date, direct: true });
    },

    /* Undo a payment that was recorded by mistake. The ledger is never
       edited: a correcting entry is added (and, for a direct payment, its
       matching "earned" entry is cancelled too). */
    reversePayment: function (entryId, reason) {
      var DB = ensure();
      var w = DB.walletEntries.find(function (x) { return String(x.id) === String(entryId); });
      if (!w) return fail('Entry not found', 'NOT_FOUND');
      if (w.type === 'TASK_CREDIT' || w.type === 'SLAB_ADJUSTMENT' || w.type === 'DISPUTE_CREDIT')
        return fail('Task pay comes from the task itself \u2014 return or re-price the task instead', 'INVALID_STATE');
      if (w.meta && w.meta.reversalOf) return fail('This is already a correction', 'INVALID_STATE');
      if (DB.walletEntries.some(function (x) { return x.meta && String(x.meta.reversalOf) === String(w.id); }))
        return fail('This payment was already undone', 'INVALID_STATE');
      var why = (w.type === 'PAYOUT' ? 'Payment undone' : 'Credit undone') + (reason ? ': ' + String(reason).trim() : '') +
        ' (was ' + rupee(Math.abs(w.amountPaise)) + ')';
      var made = [];
      var add = function (amt, of) {
        var e = { id: U.newId('w'), employeeId: w.employeeId, deliverableId: null, projectId: w.projectId || null, type: 'ADJUSTMENT',
          amountPaise: amt, why: why, createdAt: now(), meta: { manual: true, byId: DB.adminUser.id, reversalOf: of } };
        DB.walletEntries.unshift(e); made.push(e);
      };
      add(-w.amountPaise, w.id);                                  // money back on their balance
      if (w.meta && w.meta.direct) {                               // direct payment: cancel the matching "earned" line too
        var pair = DB.walletEntries.find(function (x) {
          return x.employeeId === w.employeeId && x.type === 'BONUS' && x.meta && x.meta.direct &&
            x.amountPaise === -w.amountPaise && String(x.projectId) === String(w.projectId) && Math.abs(Date.parse(x.createdAt) - Date.parse(w.createdAt)) < 60000;
        });
        if (pair) add(-pair.amountPaise, pair.id);
      }
      activity(DB, '\u21A9\uFE0F', '#FEF2F2', (w.type === 'PAYOUT' ? 'Payment of ' : 'Credit of ') + rupee(Math.abs(w.amountPaise)) + ' for <strong>' + U.esc(empName(DB, w.employeeId)) + '</strong> undone');
      return ok(clone(made));
    },

    /* ── company view ── */
    getCompanySummary: function () {
      var DB = ensure();
      var sum = function (pred) { return DB.walletEntries.filter(pred).reduce(function (s, w) { return s + w.amountPaise; }, 0); };
      var earned = sum(function (w) { return w.type === 'TASK_CREDIT' || w.type === 'BONUS' || w.type === 'DISPUTE_CREDIT'; });
      var slab = sum(function (w) { return w.type === 'SLAB_ADJUSTMENT'; });
      var adj = sum(function (w) { return w.type === 'ADJUSTMENT'; });
      var deductions = -sum(function (w) { return w.type === 'DEDUCTION'; });
      var paid = -sum(function (w) { return w.type === 'PAYOUT'; });
      var open = DB.deliverables.filter(function (d) { return isPiece(d) && d.status !== 'DONE'; });
      var committed = open.reduce(function (s, d) { return s + (d.pricePaise || 0); }, 0);
      var blocked = DB.deliverables.filter(function (d) { return !!d.blocked; }).length;
      var pendingAgreement = open.filter(function (d) { return d.agreement && d.agreement.state !== 'AGREED'; }).length;
      var disputesOpen = DB.disputes.filter(function (x) { return x.status === 'OPEN'; });
      var monthKey = now().slice(0, 7);
      var thisMonth = sum(function (w) { return w.createdAt.slice(0, 7) === monthKey && w.type !== 'PAYOUT'; });

      var byEmployee = DB.employees.map(function (e) {
        var mine = DB.walletEntries.filter(function (w) { return w.employeeId === e.id; });
        var s = function (t) { return mine.filter(function (w) { return w.type === t; }).reduce(function (a, w) { return a + w.amountPaise; }, 0); };
        var pieceDone = DB.deliverables.filter(function (d) { return isPiece(d) && d.status === 'DONE' && d.settlement && (d.assigneeIds || []).indexOf(e.id) >= 0; });
        var onTime = pieceDone.filter(function (d) { return d.settlement.steps === 0; }).length;
        var ratioList = pieceDone.filter(function (d) { return d.estimateSecs > 0; }).map(function (d) { return d.loggedSecs / d.estimateSecs; });
        var avgRatio = ratioList.length ? ratioList.reduce(function (a, b) { return a + b; }, 0) / ratioList.length : null;
        return { id: e.id, name: e.name, avatarInitials: e.avatarInitials, avatarBg: e.avatarBg, avatarFg: e.avatarFg,
          earnedPaise: s('TASK_CREDIT') + s('BONUS') + s('DISPUTE_CREDIT'), slabPaise: s('SLAB_ADJUSTMENT'),
          deductionsPaise: -s('DEDUCTION'), paidOutPaise: -s('PAYOUT'), balancePaise: mine.reduce(function (a, w) { return a + w.amountPaise; }, 0),
          tasksDone: pieceDone.length, onTime: onTime, avgRatio: avgRatio != null ? Math.round(avgRatio * 100) / 100 : null,
          reworks: pieceDone.reduce(function (a, d) { return a + (d.reworkCount || 0); }, 0),
          openTasks: open.filter(function (d) { return (d.assigneeIds || []).indexOf(e.id) >= 0; }).length,
          openDisputes: disputesOpen.filter(function (x) { return x.employeeId === e.id; }).length };
      }).sort(function (a, b) { return b.earnedPaise - a.earnedPaise; });

      var byProject = DB.projects.map(function (p) {
        var dels = DB.deliverables.filter(function (d) { return d.projectId === p.id && isPiece(d); });
        if (!dels.length) return null;
        var settled = dels.filter(function (d) { return d.settlement; });
        return { id: p.id, name: p.name, client: p.clientName, tasks: dels.length, settled: settled.length,
          committedPaise: dels.filter(function (d) { return !d.settlement; }).reduce(function (s, d) { return s + d.pricePaise; }, 0),
          paidPaise: settled.reduce(function (s, d) { return s + d.settlement.finalPaise; }, 0),
          slabPaise: settled.reduce(function (s, d) { return s + d.settlement.cutPaise; }, 0) };
      }).filter(Boolean);

      return Promise.resolve({
        earnedPaise: earned, slabPaise: slab, adjustmentsPaise: adj, deductionsPaise: deductions, paidOutPaise: paid,
        liabilityPaise: earned + slab + adj - deductions - paid,           
        committedPaise: committed,                            // open tasks — if done in sab time pe hue
        thisMonthPaise: thisMonth,
        openTasks: open.length, blockedTasks: blocked, pendingAgreement: pendingAgreement,
        openDisputes: disputesOpen.length, openDisputePaise: disputesOpen.reduce(function (s, x) { return s + Math.abs(x.amountPaise); }, 0),
        outboxQueued: DB.outbox.filter(function (m) { return m.status === 'QUEUED'; }).length,
        byEmployee: byEmployee, byProject: byProject
      });
    },
    getLedger: function (filter) {
      var DB = ensure(); filter = filter || {};
      var rows = DB.walletEntries.slice();
      if (filter.employeeId != null) rows = rows.filter(function (w) { return w.employeeId === Number(filter.employeeId); });
      if (filter.type) rows = rows.filter(function (w) { return w.type === filter.type; });
      if (filter.month) rows = rows.filter(function (w) { return w.createdAt.slice(0, 7) === filter.month; });
      var dispById = {};
      DB.disputes.forEach(function (x) { dispById[x.entryId] = x.status; });
      return Promise.resolve(rows.map(function (w) {
        var d = del(DB, w.deliverableId);
        return Object.assign(clone(w), { employeeName: empName(DB, w.employeeId), taskTitle: d ? d.title : null,
          project: w.projectId != null ? projName(DB, w.projectId) : null, disputeStatus: dispById[w.id] || null });
      }));
    },
    getOutbox: function () { var DB = ensure(); return Promise.resolve(clone(DB.outbox)); },

    /* Sandbagging — per person */
    getEstimateBehaviour: function () {
      var DB = ensure();
      var p = DB.payPolicy;
      return Promise.resolve(DB.employees.map(function (e) {
        var done = DB.deliverables.filter(function (d) { return d.status === 'DONE' && d.estimateSecs > 0 && d.loggedSecs > 0 && (d.assigneeIds || []).indexOf(e.id) >= 0; });
        var ratios = done.map(function (d) { return d.loggedSecs / d.estimateSecs; });
        var avg = ratios.length ? ratios.reduce(function (a, b) { return a + b; }, 0) / ratios.length : null;
        var under = ratios.filter(function (r) { return r < (p.sandbagRatio || 0.6); }).length;
        return { id: e.id, name: e.name, tasks: done.length, avgRatio: avg != null ? Math.round(avg * 100) / 100 : null,
          underRuns: under, overRuns: ratios.filter(function (r) { return r > 1.25; }).length,
          sandbagging: done.length >= (p.sandbagMinTasks || 4) && avg != null && avg < (p.sandbagRatio || 0.6) };
      }));
    },

    focusQueue: function (employeeId) {
      var DB = ensure(); var eid = Number(employeeId);
      var pr = { HIGH: 3, MEDIUM: 2, LOW: 1 };
      function rank(d) {
        if (d.status === 'REJECTED') return 0;
        if (d.blocked) return 5;
        if (isPiece(d) && d.agreement.state !== 'AGREED') return 4;
        if (d.status === 'IN_PROGRESS') return 1;
        return 2;
      }
      var rows = DB.deliverables.filter(function (d) {
        return (d.assigneeIds || []).indexOf(eid) >= 0 && d.status !== 'DONE' && d.status !== 'IN_REVIEW';
      }).sort(function (a, b) {
        var ra = rank(a), rb = rank(b); if (ra !== rb) return ra - rb;
        var pa = pr[a.priority] || 2, pb = pr[b.priority] || 2; if (pa !== pb) return pb - pa;
        return (a.dueAt ? new Date(a.dueAt) : Infinity) - (b.dueAt ? new Date(b.dueAt) : Infinity);
      });
      return Promise.resolve(rows.map(function (d) {
        var chk = Wallet.canStart(eid, d.id);
        return { id: d.id, title: d.title, project: projName(DB, d.projectId), priority: d.priority, status: d.status,
          dueAt: d.dueAt, pricePaise: d.pricePaise, pricingMode: d.pricingMode, estimateSecs: d.estimateSecs, loggedSecs: d.loggedSecs,
          agreement: d.agreement.state, blocked: d.blocked ? d.blocked.reason : null, canStart: chk.ok, whyNot: chk.ok ? null : chk.reason,
          rank: rank(d) };
      }));
    }
  };

  root.Wallet = Wallet;
  if (typeof module !== 'undefined' && module.exports) module.exports = Wallet;

})(typeof window !== 'undefined' ? window : globalThis);