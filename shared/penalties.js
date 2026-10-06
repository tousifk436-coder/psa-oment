/* ============================================================================
   PENALTIES — admin penalties + employee appeals
   ----------------------------------------------------------------------------
   This is deliberately separate from the existing wallet engine. Penalties are
   wallet ledger entries, while appeal decisions are stored in the existing
   disputes collection with kind = PENALTY_APPEAL.
   ============================================================================ */
(function (root) {
  'use strict';

  var U = root.Utils;
  var DataAPI = root.DataAPI;
  var Wallet = root.Wallet;

  function DB() { return DataAPI.raw(); }
  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  function now() { return new Date().toISOString(); }
  function today() { return U.isoDate(new Date()); }
  function emp(id) { return (DB().employees || []).find(function (e) { return Number(e.id) === Number(id); }); }
  function rupee(paise) { return U.fmtRupee(Math.max(0, Number(paise) || 0)).replace('.00', ''); }
  function ok(v) { if (DataAPI.touch) DataAPI.touch(); if (DataAPI.flush) DataAPI.flush(); return Promise.resolve(v); }
  function fail(msg, code) { var e = new Error(msg); e.code = code || 'ERROR'; return Promise.reject(e); }
  function notify(recipientId, kind, title, body, entityType, entityId) {
    if (recipientId == null) return;
    var d = DB();
    if (!d.notifications) d.notifications = [];
    d.notifications.unshift({ id: U.newId('n'), recipientId: Number(recipientId), kind: kind, title: title, body: body,
      entityType: entityType || null, entityId: entityId == null ? null : entityId, read: false, createdAt: now() });
  }
  function activity(icon, color, text) {
    var d = DB();
    if (!d.activity) d.activity = [];
    d.activity.unshift({ icon: icon, color: color, text: text, at: now() });
    if (d.activity.length > 80) d.activity.length = 80;
  }
  function queueEmail(to, subject, body, meta) {
    if (!to) return;
    var d = DB();
    if (!d.outbox) d.outbox = [];
    d.outbox.unshift({ id: U.newId('mail'), to: to, subject: subject, body: body,
      kind: 'PENALTY', meta: meta || {}, status: 'QUEUED', createdAt: now() });
    if (d.outbox.length > 200) d.outbox.length = 200;
  }
  function balanceOf(employeeId) {
    return (DB().walletEntries || []).filter(function (w) { return Number(w.employeeId) === Number(employeeId); })
      .reduce(function (s, w) { return s + Number(w.amountPaise || 0); }, 0);
  }
  function penaltyRows(filter) {
    filter = filter || {};
    return (DB().walletEntries || []).filter(function (w) {
      return w.type === 'DEDUCTION' && w.meta && w.meta.penalty &&
        (filter.employeeId == null || Number(w.employeeId) === Number(filter.employeeId));
    });
  }
  function appealFor(entryId) {
    return (DB().disputes || []).find(function (x) { return x.kind === 'PENALTY_APPEAL' && String(x.entryId) === String(entryId); }) || null;
  }
  function currentPenalty(w) {
    var a = appealFor(w.id);
    if (a && a.status !== 'OPEN' && a.finalPenaltyPaise != null) return Math.max(0, Number(a.finalPenaltyPaise) || 0);
    return Math.abs(Number(w.amountPaise) || 0);
  }

  if (!Wallet) throw new Error('Wallet must load before shared/penalties.js');

  Wallet.applyPenalty = function (employeeId, p) {
    var d = DB();
    p = p || {};
    var e = emp(employeeId);
    if (!e) return fail('Employee not found', 'NOT_FOUND');

    var date = /^\d{4}-\d{2}-\d{2}$/.test(String(p.date || '')) ? String(p.date) : today();
    var days = Number(p.penaltyDays);
    var amount = Math.round(Number(p.amountPaise) || 0);
    var daily = Math.round(Number(p.dailyRatePaise) || 0);
    var ruleKey = String(p.ruleKey || 'CUSTOM_PENALTY').trim();
    var ruleName = String(p.ruleName || 'Penalty').trim();
    var reason = String(p.reason || '').trim();

    if (!isFinite(days) || days <= 0) return fail('Penalty days must be greater than 0', 'VALIDATION');
    if (!amount || amount <= 0) return fail('Penalty amount must be greater than 0', 'VALIDATION');
    if (!reason) return fail('A reason is required', 'VALIDATION');
    if (date > today()) return fail('The penalty date cannot be in the future', 'VALIDATION');

    var duplicate = penaltyRows().some(function (w) {
      var p2 = w.meta && w.meta.penalty;
      return Number(w.employeeId) === Number(employeeId) && p2 && p2.ruleKey === ruleKey && p2.date === date && !p2.reversed;
    });
    if (duplicate) return fail('This penalty is already recorded for this employee and date', 'DUPLICATE');

    var w = {
      id: U.newId('w'), employeeId: Number(employeeId), deliverableId: null, projectId: null,
      type: 'DEDUCTION', amountPaise: -Math.abs(amount),
      why: ruleName + ' — ' + reason, createdAt: now(),
      meta: {
        manual: true, byId: d.adminUser && d.adminUser.id, date: date,
        penalty: { ruleKey: ruleKey, ruleName: ruleName, date: date, penaltyDays: days,
          dailyRatePaise: daily, deductionPaise: Math.abs(amount), reason: reason }
      }
    };
    d.walletEntries = d.walletEntries || [];
    d.walletEntries.unshift(w);

    var balance = balanceOf(employeeId);
    notify(employeeId, 'INFO', 'Penalty applied — ' + rupee(amount),
      ruleName + ' · ' + days + ' day' + (days === 1 ? '' : 's') + '. Reason: ' + reason,
      'PENALTY', w.id);

    queueEmail(e.email,
      'Oment: penalty deduction of ' + rupee(amount),
      'Hi ' + e.name.split(' ')[0] + ',\n\n' +
      'A penalty has been recorded on your account.\n\n' +
      'Penalty: ' + ruleName + '\nDate: ' + date + '\nPenalty days: ' + days + '\n' +
      'Deduction: ' + rupee(amount) + '\nReason: ' + reason + '\n' +
      'Updated payout balance: ' + rupee(balance) + '\n\n' +
      'If you believe this penalty is incorrect or too high, you can appeal it from the employee app.\n\n— Oment',
      { employeeId: e.id, penaltyEntryId: w.id, amountPaise: amount, penaltyDays: days });

    if (d.adminUser && d.adminUser.email) queueEmail(d.adminUser.email,
      'Oment: penalty applied — ' + e.name,
      'A penalty was applied to ' + e.name + '.\n\n' +
      'Penalty: ' + ruleName + '\nDate: ' + date + '\nDays: ' + days + '\n' +
      'Deduction: ' + rupee(amount) + '\nReason: ' + reason + '\n' +
      'Updated employee payout balance: ' + rupee(balance) + '\n\n— Oment',
      { employeeId: e.id, penaltyEntryId: w.id, amountPaise: amount });

    activity('⚖️', '#FEF2F2', '<strong>' + U.esc(e.name) + '</strong> received a ' + U.esc(ruleName) + ' deduction of ' + rupee(amount));
    return ok(clone(w));
  };

  Wallet.getPenaltyRecords = function (filter) {
    filter = filter || {};
    return Promise.resolve(penaltyRows(filter).map(function (w) {
      var p = w.meta && w.meta.penalty || {};
      var e = emp(w.employeeId);
      var appeal = appealFor(w.id);
      return Object.assign(clone(w), {
        employeeName: e ? e.name : 'Unknown', employeeEmail: e ? e.email : '',
        originalPenaltyPaise: Math.abs(Number(w.amountPaise) || 0),
        currentPenaltyPaise: currentPenalty(w),
        appealStatus: appeal ? appeal.status : null,
        appealId: appeal ? appeal.id : null,
        appeal: appeal ? clone(appeal) : null,
        penaltyRuleName: p.ruleName || 'Penalty', penaltyDate: p.date || null
      });
    }));
  };

  Wallet.raisePenaltyAppeal = function (entryId, employeeId, reason) {
    var d = DB();
    var w = (d.walletEntries || []).find(function (x) { return String(x.id) === String(entryId); });
    if (!w || w.type !== 'DEDUCTION' || !(w.meta && w.meta.penalty)) return fail('Penalty not found', 'NOT_FOUND');
    if (Number(w.employeeId) !== Number(employeeId)) return fail('This penalty is not yours', 'FORBIDDEN');
    reason = String(reason || '').trim();
    if (!reason) return fail('A reason is required for an appeal', 'VALIDATION');
    if ((d.disputes || []).some(function (x) { return x.kind === 'PENALTY_APPEAL' && x.entryId === w.id && x.status === 'OPEN'; }))
      return fail('An appeal is already open for this penalty', 'DUPLICATE');

    var p = w.meta.penalty || {}, e = emp(employeeId);
    var appeal = {
      id: U.newId('pa'), kind: 'PENALTY_APPEAL', entryId: w.id, employeeId: Number(employeeId),
      amountPaise: Math.abs(w.amountPaise), originalPenaltyPaise: Math.abs(w.amountPaise),
      finalPenaltyPaise: Math.abs(w.amountPaise), penaltyDays: Number(p.penaltyDays) || 0,
      penaltyRuleKey: p.ruleKey || '', penaltyRuleName: p.ruleName || 'Penalty', penaltyDate: p.date || null,
      reason: reason, status: 'OPEN', resolutionNote: '', creditedPaise: 0, adjustmentPaise: 0,
      createdAt: now(), resolvedAt: null
    };
    d.disputes = d.disputes || [];
    d.disputes.unshift(appeal);

    if (d.adminUser && d.adminUser.email) queueEmail(d.adminUser.email,
      'Oment: penalty appeal from ' + (e ? e.name : 'employee'),
      'An employee has appealed a penalty.\n\nEmployee: ' + (e ? e.name : employeeId) + '\n' +
      'Penalty: ' + appeal.penaltyRuleName + '\nPenalty date: ' + (appeal.penaltyDate || '—') + '\n' +
      'Current deduction: ' + rupee(appeal.originalPenaltyPaise) + '\n\nAppeal reason:\n' + reason +
      '\n\nOpen the Penalties panel to accept, reject, or set a revised deduction amount.\n\n— Oment',
      { appealId: appeal.id, employeeId: appeal.employeeId, penaltyEntryId: w.id });

    notify(d.adminUser && d.adminUser.id, 'REJECTED', (e ? e.name : 'Employee') + ' appealed a penalty',
      appeal.penaltyRuleName + ' · ' + rupee(appeal.originalPenaltyPaise) + ' · ' + reason,
      'PENALTY_APPEAL', appeal.id);
    activity('⚖️', '#FFFBEB', '<strong>' + U.esc(e ? e.name : 'Employee') + '</strong> appealed a penalty');
    return ok(clone(appeal));
  };

  Wallet.resolvePenaltyAppeal = function (appealId, opts) {
    var d = DB(); opts = opts || {};
    var appeal = (d.disputes || []).find(function (x) { return x.kind === 'PENALTY_APPEAL' && x.id === appealId; });
    if (!appeal) return fail('Penalty appeal not found', 'NOT_FOUND');
    if (appeal.status !== 'OPEN') return fail('This appeal is already resolved', 'LOCKED');
    var note = String(opts.note || '').trim();
    if (!note) return fail('A resolution note is required', 'VALIDATION');

    var w = (d.walletEntries || []).find(function (x) { return String(x.id) === String(appeal.entryId); });
    if (!w) return fail('Original penalty entry not found', 'NOT_FOUND');

    var original = Math.abs(Number(w.amountPaise) || 0);
    var action = String(opts.action || '').toUpperCase();
    var finalPenalty;
    if (action === 'REJECT') finalPenalty = original;
    else if (opts.finalPenaltyPaise != null && opts.finalPenaltyPaise !== '') finalPenalty = Math.max(0, Math.round(Number(opts.finalPenaltyPaise) || 0));
    else finalPenalty = 0;

    var delta = original - finalPenalty;
    if (delta !== 0) {
      d.walletEntries.unshift({
        id: U.newId('w'), employeeId: appeal.employeeId, deliverableId: null, projectId: null,
        type: 'ADJUSTMENT', amountPaise: delta,
        why: 'Penalty appeal adjustment — ' + note, createdAt: now(),
        meta: { manual: true, byId: d.adminUser && d.adminUser.id, penaltyAppealId: appeal.id,
          penaltyEntryId: w.id, appealAdjustment: true, originalPenaltyPaise: original, finalPenaltyPaise: finalPenalty }
      });
    }

    appeal.status = action === 'REJECT' ? 'REJECTED' : 'ACCEPTED';
    appeal.resolutionNote = note;
    appeal.resolvedAt = now();
    appeal.creditedPaise = Math.max(0, delta);
    appeal.adjustmentPaise = delta;
    appeal.finalPenaltyPaise = finalPenalty;

    var balance = balanceOf(appeal.employeeId), e = emp(appeal.employeeId);
    var resultText = appeal.status === 'REJECTED'
      ? 'Your appeal was rejected. The original penalty remains ' + rupee(original) + '.'
      : (finalPenalty === 0 ? 'Your appeal was accepted and the penalty was fully removed.' :
        'Your appeal was accepted. The penalty was changed from ' + rupee(original) + ' to ' + rupee(finalPenalty) + '.');

    notify(appeal.employeeId, appeal.status === 'ACCEPTED' ? 'APPROVED' : 'INFO',
      appeal.status === 'ACCEPTED' ? 'Penalty appeal accepted' : 'Penalty appeal rejected',
      resultText + ' ' + note, 'PENALTY_APPEAL', appeal.id);

    if (e && e.email) queueEmail(e.email,
      'Oment: penalty appeal ' + (appeal.status === 'ACCEPTED' ? 'accepted' : 'rejected'),
      'Hi ' + e.name.split(' ')[0] + ',\n\n' +
      'Your penalty appeal has been ' + (appeal.status === 'ACCEPTED' ? 'accepted' : 'rejected') + '.\n\n' +
      'Penalty: ' + appeal.penaltyRuleName + '\nPenalty date: ' + (appeal.penaltyDate || '—') + '\n' +
      'Original deduction: ' + rupee(original) + '\nFinal deduction: ' + rupee(finalPenalty) + '\n' +
      'Updated payout balance: ' + rupee(balance) + '\n\nAdmin response:\n' + note + '\n\n— Oment',
      { appealId: appeal.id, employeeId: e.id, finalPenaltyPaise: finalPenalty, balancePaise: balance });

    if (d.adminUser && d.adminUser.email) queueEmail(d.adminUser.email,
      'Oment: penalty appeal resolved — ' + (e ? e.name : appeal.employeeId),
      'Penalty appeal resolved.\n\nEmployee: ' + (e ? e.name : appeal.employeeId) + '\n' +
      'Decision: ' + (appeal.status === 'ACCEPTED' ? 'Accepted' : 'Rejected') + '\n' +
      'Original deduction: ' + rupee(original) + '\nFinal deduction: ' + rupee(finalPenalty) + '\n' +
      'Updated payout balance: ' + rupee(balance) + '\n\nAdmin response: ' + note + '\n\n— Oment',
      { appealId: appeal.id, employeeId: appeal.employeeId });

    activity('⚖️', appeal.status === 'ACCEPTED' ? '#ECFDF5' : '#F3F4F6',
      '<strong>' + U.esc(e ? e.name : 'Employee') + '</strong> penalty appeal ' + appeal.status.toLowerCase());
    return ok(clone(appeal));
  };

  Wallet.getPenaltyAppeals = function (filter) {
    filter = filter || {};
    var d = DB();
    return Promise.resolve((d.disputes || []).filter(function (x) {
      return x.kind === 'PENALTY_APPEAL' && (!filter.status || x.status === String(filter.status).toUpperCase()) &&
        (filter.employeeId == null || Number(x.employeeId) === Number(filter.employeeId));
    }).map(function (x) {
      var e = emp(x.employeeId), w = (d.walletEntries || []).find(function (q) { return String(q.id) === String(x.entryId); });
      return Object.assign(clone(x), { employeeName: e ? e.name : 'Unknown', employeeEmail: e ? e.email : '',
        currentPenaltyPaise: currentPenalty(w || { amountPaise: x.finalPenaltyPaise || x.amountPaise }) });
    }));
  };

})(typeof window !== 'undefined' ? window : globalThis);
