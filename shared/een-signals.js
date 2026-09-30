
(function (root) {
  'use strict';

  var U = root.Utils;

  var SEVERITY = { HIGH: 3, MEDIUM: 2, LOW: 1 };

  var RULES = {
    DEADLINE_MISSED:      { label: 'Deadline missed',              audience: 'BOTH',     on: true },
    DEADLINE_SOON:        { label: 'Deadline tomorrow',                 audience: 'EMPLOYEE', on: true },
    STUCK_IN_REVIEW:      { label: 'Work stuck in review',        audience: 'ADMIN',    on: true },
    WORK_RETURNED:        { label: 'Work sent back',                  audience: 'EMPLOYEE', on: true },
    NEW_WORK:             { label: 'New work assigned',                   audience: 'EMPLOYEE', on: true },
    ESTIMATE_BLOWN:       { label: 'Way over estimate',     audience: 'BOTH',     on: true },
    MARGIN_LOSS:          { label: 'Project is losing money',    audience: 'ADMIN',    on: true },
    MARGIN_BELOW_TARGET:  { label: 'Margin below target',          audience: 'ADMIN',    on: true },
    BURN_AHEAD:           { label: 'Burning budget faster than delivering',         audience: 'ADMIN',    on: true },
    UNBILLED_WORK:        { label: 'Delivered but not invoiced',     audience: 'ADMIN',    on: true },
    INVOICE_OVERDUE:      { label: 'Client payment overdue',        audience: 'ADMIN',    on: true },
    OVERLOADED_PERSON:    { label: 'Someone is overloaded',               audience: 'ADMIN',    on: true },
    IDLE_PERSON:          { label: 'Someone has no work',           audience: 'ADMIN',    on: true },
    LEAVE_PENDING:        { label: 'Leave request pending',            audience: 'ADMIN',    on: true },
    LEAVE_CLASH:          { label: 'Leave clashes with a deadline',    audience: 'ADMIN',    on: true },
    NO_TIME_LOGGED:       { label: 'Work in progress, no time logged',    audience: 'EMPLOYEE', on: true },
    MISSING_PUNCH:        { label: 'Attendance incomplete',               audience: 'EMPLOYEE', on: true },
    NO_COST_RATES:        { label: 'Cost rate not set',           audience: 'ADMIN',    on: true },
    /* ── piece-rate / wallet (shared/wallet.js) ── */
    BLOCKED_WAITING:      { label: 'Someone is blocked',                 audience: 'ADMIN',    on: true },
    ESTIMATE_PENDING:     { label: 'Estimate not yet agreed',        audience: 'BOTH',     on: true },
    SLAB_APPROACHING:     { label: 'Price slab approaching',      audience: 'EMPLOYEE', on: true },
    DISPUTE_OPEN:         { label: 'Wallet dispute pending',           audience: 'ADMIN',    on: true },
    SANDBAGGING_PATTERN:  { label: 'Estimates consistently padded',     audience: 'ADMIN',    on: true },
    PAYOUT_DUE:           { label: 'Wallet balance bina payout',       audience: 'ADMIN',    on: true }
  };

  function DB() { return root.DataAPI.raw(); }
  function today() { return U.isoDate(new Date()); }
  function hoursUntil(iso) { return (new Date(iso) - Date.now()) / 3600000; }
  function empName(id) {
    var e = DB().employees.find(function (x) { return x.id === id; });
    return e ? e.name : 'Unknown';
  }
  function projName(id) {
    var p = DB().projects.find(function (x) { return x.id === id; });
    return p ? p.name : '\u2014';
  }
  function sig(type, o) {
    var r = RULES[type] || {};
    return {
      id: type + ':' + (o.key || ''),
      type: type,
      severity: o.severity || SEVERITY.MEDIUM,
      audience: o.audience || r.audience || 'ADMIN',
      recipientId: o.recipientId != null ? o.recipientId : null,
      headline: o.headline,
      why: o.why,                 /* the reason shown to the user */
      facts: o.facts || {},        
      action: o.action || null,
      detectedAt: new Date().toISOString()
    };
  }


  function deadlineSignals() {
    var out = [], t = today();
    DB().deliverables.forEach(function (d) {
      if (d.status === 'DONE' || !d.dueAt) return;
      var hrs = hoursUntil(d.dueAt);
      var assignees = d.assigneeIds || [];

      if (hrs < 0) {
        var daysLate = Math.floor(-hrs / 24);
        out.push(sig('DEADLINE_MISSED', {
          key: d.id, severity: daysLate >= 3 ? SEVERITY.HIGH : SEVERITY.MEDIUM,
          audience: 'BOTH', recipientId: assignees[0],
          headline: '"' + d.title + '" missed its deadline',
          why: 'Deadline ' + (daysLate === 0 ? 'today' : daysLate + ' days ago') + ' and the work is still not done.',
          facts: {
            deliverableId: d.id, title: d.title, project: projName(d.projectId),
            daysLate: daysLate, progressPct: d.progressPct,
            assignees: assignees.map(empName), status: d.status
          },
          action: { module: 'projects', projectId: d.projectId }
        }));
      } else if (hrs <= 30) {
        assignees.forEach(function (aid) {
          out.push(sig('DEADLINE_SOON', {
            key: d.id + '-' + aid, severity: SEVERITY.MEDIUM,
            audience: 'EMPLOYEE', recipientId: aid,
            headline: '"' + d.title + '" is due by tomorrow',
            why: 'Deadline ' + Math.round(hrs) + ' hours and the work is at ' + (d.progressPct || 0) + '%.',
            facts: {
              deliverableId: d.id, title: d.title, project: projName(d.projectId),
              hoursLeft: Math.round(hrs), progressPct: d.progressPct || 0
            },
            action: { module: 'detail', deliverableId: d.id }
          }));
        });
      }
    });
    return out;
  }

  function reviewSignals() {
    var out = [];
    DB().deliverables.forEach(function (d) {
      if (d.status !== 'IN_REVIEW') return;
      var sub = (d.timeline || []).filter(function (t) { return t.type === 'submit'; }).pop();
      var days = sub ? Math.floor((Date.now() - new Date(sub.time)) / 86400000) : 0;
      if (isNaN(days) || days < 1) return;
      out.push(sig('STUCK_IN_REVIEW', {
        key: d.id, severity: days >= 3 ? SEVERITY.HIGH : SEVERITY.MEDIUM,
        headline: '"' + d.title + '" ' + days + ' days in review',
        why: (d.assigneeIds || []).map(empName).join(', ') + ' submitted it ' + days +
             ' days ago; it hasn’t been approved or returned yet.',
        facts: {
          deliverableId: d.id, title: d.title, project: projName(d.projectId),
          daysWaiting: days, assignees: (d.assigneeIds || []).map(empName)
        },
        action: { module: 'projects', projectId: d.projectId }
      }));
    });
    return out;
  }

  function returnedWorkSignals() {
    var out = [];
    DB().deliverables.forEach(function (d) {
      if (d.status !== 'REJECTED') return;
      (d.assigneeIds || []).forEach(function (aid) {
        out.push(sig('WORK_RETURNED', {
          key: d.id + '-' + aid, severity: SEVERITY.HIGH,
          audience: 'EMPLOYEE', recipientId: aid,
          headline: '"' + d.title + '" was sent back',
          why: 'The manager left a reason \u2014 read it and resubmit.',
          facts: {
            deliverableId: d.id, title: d.title, project: projName(d.projectId),
            reason: d.rejectionReason
          },
          action: { module: 'detail', deliverableId: d.id }
        }));
      });
    });
    return out;
  }

  function estimateSignals() {
    var out = [];
    DB().deliverables.forEach(function (d) {
      if (d.status === 'DONE' || !d.estimateSecs || !d.loggedSecs) return;
      var over = d.loggedSecs / d.estimateSecs;
      if (over < 1.5) return;
      out.push(sig('ESTIMATE_BLOWN', {
        key: d.id, severity: over >= 2 ? SEVERITY.HIGH : SEVERITY.MEDIUM,
        audience: 'ADMIN',
        headline: '"' + d.title + '" is ' + Math.round((over - 1) * 100) + '% over estimate',
        why: 'Socha tha ' + Math.round(d.estimateSecs / 3600) + ' hours, so far ' +
             Math.round(d.loggedSecs / 3600) + ' hours spent and the work is still not done.',
        facts: {
          deliverableId: d.id, title: d.title, project: projName(d.projectId),
          estimateHours: Math.round(d.estimateSecs / 3600),
          actualHours: Math.round(d.loggedSecs / 3600),
          overrunPct: Math.round((over - 1) * 100),
          assignees: (d.assigneeIds || []).map(empName)
        },
        action: { module: 'profit', projectId: d.projectId }
      }));
    });
    return out;
  }

  function moneySignals() {
    if (typeof root.Profit === 'undefined') return Promise.resolve([]);
    return root.Profit.getPortfolio().then(function (pf) {
      var out = [];
      pf.projects.forEach(function (p) {
        if (p.health === 'LOSS') {
          out.push(sig('MARGIN_LOSS', {
            key: p.projectId, severity: SEVERITY.HIGH,
            headline: p.name + ' is losing money',
            why: 'So far ' + U.fmtRupee(p.costPaise) + ' spent, and it will reach ' +
                 U.fmtRupee(p.projectedCostPaise) + ' by completion \u2014 while the deal is worth ' + U.fmtRupee(p.contractPaise) + '.',
            facts: {
              projectId: p.projectId, name: p.name, client: p.client,
              contractRupees: U.paiseToRupees(p.contractPaise),
              costRupees: U.paiseToRupees(p.costPaise),
              projectedMarginPct: p.projectedMarginPct,
              loggedHours: p.loggedHours
            },
            action: { module: 'profit', projectId: p.projectId }
          }));
        } else if (p.health === 'CRITICAL' || p.health === 'BELOW_TARGET') {
          out.push(sig('MARGIN_BELOW_TARGET', {
            key: p.projectId,
            severity: p.health === 'CRITICAL' ? SEVERITY.HIGH : SEVERITY.MEDIUM,
            headline: p.name + ' margin is below target',
            why: 'Forecast ' + p.projectedMarginPct + '%, target ' + p.targetMarginPct + '%.',
            facts: {
              projectId: p.projectId, name: p.name,
              projectedMarginPct: p.projectedMarginPct, targetMarginPct: p.targetMarginPct,
              costRupees: U.paiseToRupees(p.costPaise)
            },
            action: { module: 'profit', projectId: p.projectId }
          }));
        }

        if (p.burnAhead) {
          out.push(sig('BURN_AHEAD', {
            key: p.projectId, severity: SEVERITY.MEDIUM,
            headline: p.name + ' is spending faster than it delivers',
            why: '' + p.burnPct + '% of budget spent but only ' + p.deliveryPct + '% delivered.',
            facts: {
              projectId: p.projectId, name: p.name,
              burnPct: p.burnPct, deliveryPct: p.deliveryPct
            },
            action: { module: 'profit', projectId: p.projectId }
          }));
        }

        if (p.uninvoicedMilestones > 0) {
          out.push(sig('UNBILLED_WORK', {
            key: p.projectId, severity: SEVERITY.MEDIUM,
            headline: p.name + ' has delivered work that isn’t invoiced',
            why: p.uninvoicedMilestones + ' milestone(s) are complete but no invoice has been sent.',
            facts: {
              projectId: p.projectId, name: p.name, client: p.client,
              milestones: p.uninvoicedMilestones,
              approxRupees: U.paiseToRupees(p.wipPaise)
            },
            action: { module: 'invoices', projectId: p.projectId }
          }));
        }
      });
      return out;
    });
  }

  function invoiceSignals() {
    var out = [], t = today();
    DB().invoices.forEach(function (i) {
      if (i.status === 'PAID' || i.status === 'CANCELLED' || i.status === 'DRAFT') return;
      if (!i.dueDate || i.dueDate >= t) return;
      var days = Math.floor((new Date(t) - new Date(i.dueDate)) / 86400000);
      out.push(sig('INVOICE_OVERDUE', {
        key: i.id, severity: days >= 30 ? SEVERITY.HIGH : SEVERITY.MEDIUM,
        headline: i.clientName + ' payment is ' + days + ' days overdue',
        why: 'Invoice ' + i.number + ' was due ' + days + ' days ago.',
        facts: {
          invoiceId: i.id, number: i.number, client: i.clientName,
          daysOverdue: days,
          pendingRupees: U.paiseToRupees(i.totalPaise - i.paidPaise)
        },
        action: { module: 'invoices' }
      }));
    });
    return out;
  }

  function capacitySignals() {
    if (typeof root.HRM === 'undefined') return Promise.resolve([]);
    return root.HRM.getUtilisation().then(function (u) {
      var out = [];
      var free = u.rows.filter(function (r) { return r.load === 'FREE' || r.load === 'AVAILABLE'; });
      u.rows.forEach(function (r) {
        if (r.load === 'OVERLOADED') {
          out.push(sig('OVERLOADED_PERSON', {
            key: r.employeeId, severity: SEVERITY.MEDIUM,
            headline: r.name + ' is over capacity',
            why: r.committedDays + ' days of work queued, which is more than the available time.',
            facts: {
              employeeId: r.employeeId, name: r.name,
              committedDays: r.committedDays, openDeliverables: r.openDeliverables,
              peopleWithRoom: free.slice(0, 3).map(function (f) { return f.name; })
            },
            action: { module: 'hrm', tab: 'capacity' }
          }));
        }
        if (r.load === 'FREE' && r.openDeliverables === 0) {
          out.push(sig('IDLE_PERSON', {
            key: r.employeeId, severity: SEVERITY.LOW,
            headline: r.name + ' has no work right now',
            why: 'No open deliverable is assigned.',
            facts: { employeeId: r.employeeId, name: r.name, role: r.role },
            action: { module: 'hrm', tab: 'capacity' }
          }));
        }
      });
      return out;
    });
  }

  function leaveSignals() {
    if (typeof root.HRM === 'undefined') return Promise.resolve([]);
    return root.HRM.getLeaveRequests({ status: 'PENDING' }).then(function (reqs) {
      var out = [];
      reqs.forEach(function (r) {
        var days = Math.floor((Date.now() - new Date(r.appliedAt)) / 86400000);
        if (days >= 1) {
          out.push(sig('LEAVE_PENDING', {
            key: r.id, severity: days >= 3 ? SEVERITY.HIGH : SEVERITY.MEDIUM,
            headline: empName(r.employeeId) + '\u2019s leave request ' + days + ' days overdue',
            why: r.fromDate + ' \u2014 no decision yet.',
            facts: {
              leaveId: r.id, employee: empName(r.employeeId), type: r.type,
              fromDate: r.fromDate, toDate: r.toDate, days: r.days,
              waitingDays: days, reason: r.reason
            },
            action: { module: 'hrm', tab: 'leave' }
          }));
        }

        var clash = DB().deliverables.filter(function (d) {
          if (d.status === 'DONE' || !d.dueAt) return false;
          if ((d.assigneeIds || []).indexOf(r.employeeId) < 0) return false;
          var due = U.isoDate(d.dueAt);
          return due >= r.fromDate && due <= r.toDate;
        });
        if (clash.length) {
          out.push(sig('LEAVE_CLASH', {
            key: r.id + '-clash', severity: SEVERITY.HIGH,
            headline: empName(r.employeeId) + '\u2019s leave clashes with a deadline',
            why: 'In the week of the requested leave, ' + clash.length +
                 ' of their deliverables are due.',
            facts: {
              leaveId: r.id, employee: empName(r.employeeId),
              fromDate: r.fromDate, toDate: r.toDate,
              clashingWork: clash.map(function (d) {
                return { title: d.title, due: U.isoDate(d.dueAt), project: projName(d.projectId) };
              })
            },
            action: { module: 'hrm', tab: 'leave' }
          }));
        }
      });
      return out;
    });
  }

  function timeLoggingSignals() {
    var out = [], t = today();
    var att = DB().attendance.filter(function (a) { return a.date === t; });

    DB().deliverables.forEach(function (d) {
      if (d.status !== 'IN_PROGRESS') return;
      (d.assigneeIds || []).forEach(function (aid) {
        var a = att.find(function (x) { return x.employeeId === aid; });
        if (!a || a.status === 'ON_LEAVE' || a.status === 'ABSENT') return;
        var tagged = (a.perDeliverableSecs || {})[d.id] || 0;
        if (a.activeSecs > 4 * 3600 && tagged === 0) {
          out.push(sig('NO_TIME_LOGGED', {
            key: d.id + '-' + aid, severity: SEVERITY.LOW,
            audience: 'EMPLOYEE', recipientId: aid,
            headline: '"' + d.title + '" has no time logged today',
            why: 'This task is in progress but its timer wasn’t run today. Work done without the timer isn’t counted anywhere.',
            facts: { deliverableId: d.id, title: d.title, project: projName(d.projectId) },
            action: { module: 'detail', deliverableId: d.id }
          }));
        }
      });
    });

    /* Kal ka no punch-out */
    var y = U.isoDate(new Date(Date.now() - 86400000));
    DB().attendance.forEach(function (a) {
      if (a.date !== y) return;
      if (a.status === 'ABSENT' || a.status === 'ON_LEAVE') return;
      if (a.firstInAt && !a.lastOutAt) {
        out.push(sig('MISSING_PUNCH', {
          key: a.id, severity: SEVERITY.LOW,
          audience: 'EMPLOYEE', recipientId: a.employeeId,
          headline: 'Yesterday’s punch-out is missing',
          why: 'You came in yesterday but your punch-out wasn’t recorded.',
          facts: { date: a.date, employee: empName(a.employeeId) },
          action: { module: 'leave' }
        }));
      }
    });
    return out;
  }

  function dataQualitySignals() {
    var out = [];
    var missing = DB().employees.filter(function (e) { return !e.costPerHourPaise; });
    if (missing.length) {
      out.push(sig('NO_COST_RATES', {
        key: 'rates', severity: SEVERITY.MEDIUM,
        headline: missing.length + ' people have no cost rate set',
        why: 'Their time is being counted as free, so every profit figure is overstated.',
        facts: { people: missing.map(function (e) { return e.name; }) },
        action: { module: 'profit', tab: 'rates' }
      }));
    }
    return out;
  }

  function newWorkSignals() {
    var out = [];
    var cutoff = Date.now() - 24 * 3600 * 1000;
    DB().deliverables.forEach(function (d) {
      if (d.status !== 'TODO' || !d.createdAt) return;
      if (new Date(d.createdAt).getTime() < cutoff) return;
      (d.assigneeIds || []).forEach(function (aid) {
        out.push(sig('NEW_WORK', {
          key: d.id + '-' + aid, severity: SEVERITY.LOW,
          audience: 'EMPLOYEE', recipientId: aid,
          headline: 'New work assigned: "' + d.title + '"',
          why: 'This task was assigned to you in the last 24 hours.',
          facts: {
            deliverableId: d.id, title: d.title, project: projName(d.projectId),
            dueAt: d.dueAt ? U.isoDate(d.dueAt) : null
          },
          action: { module: 'detail', deliverableId: d.id }
        }));
      });
    });
    return out;
  }

  /* ── Piece-rate / wallet signals ────────────────────────────────────── */
  function walletSignals() {
    var out = [];
    var W = root.Wallet;
    if (!W) return Promise.resolve(out);
    var db = DB();
    var policy = db.payPolicy || {};

    db.deliverables.forEach(function (d) {
      if (!d.blocked) return;
      var hrs = (Date.now() - new Date(d.blocked.since).getTime()) / 3600000;
      out.push(sig('BLOCKED_WAITING', {
        key: d.id, severity: hrs >= 4 ? SEVERITY.HIGH : SEVERITY.MEDIUM,
        headline: empName(d.blocked.byId) + ' "' + d.title + '"',
        why: 'Reason: ' + d.blocked.reason + '. ' + (hrs < 1 ? Math.round(hrs * 60) + ' min' : Math.round(hrs) + ' hours') + ' waiting \u2014 this time isn’t counting for anyone.',
        facts: { deliverableId: d.id, title: d.title, project: projName(d.projectId), reason: d.blocked.reason, waitingHours: Math.round(hrs * 10) / 10, employee: empName(d.blocked.byId) },
        action: { module: 'payouts', tab: 'blocked' }
      }));
    });

    /* Estimate agreement pending — dono taraf */
    db.deliverables.forEach(function (d) {
      if (d.pricingMode !== 'PIECE' || d.status === 'DONE' || !d.agreement) return;
      var st = d.agreement.state;
      if (st === 'COUNTERED' || st === 'FLAGGED') {
        out.push(sig('ESTIMATE_PENDING', {
          key: d.id + '-admin', severity: SEVERITY.MEDIUM, audience: 'ADMIN',
          headline: (d.assigneeIds || []).map(empName).join(', ') + '\u2019s estimate needs your reply',
          why: st === 'FLAGGED'
            ? '"' + d.title + '" estimate was flagged as unrealistic: ' + d.agreement.flagReason + '. Work can’t start until you reply.'
            : '"' + d.title + '": you set ' + U_fmt(d.agreement.adminSecs) + ', the employee proposed ' + U_fmt(d.agreement.employeeSecs) + ' (' + d.agreement.note + '). Accept or counter.',
          facts: { deliverableId: d.id, title: d.title, adminSecs: d.agreement.adminSecs, employeeSecs: d.agreement.employeeSecs, state: st },
          action: { module: 'payouts', tab: 'agreements' }
        }));
      } else if (st === 'PENDING') {
        (d.assigneeIds || []).forEach(function (aid) {
          out.push(sig('ESTIMATE_PENDING', {
            key: d.id + '-' + aid, severity: SEVERITY.MEDIUM, audience: 'EMPLOYEE', recipientId: aid,
            headline: '"' + d.title + '" \u2014 accept the estimate',
            why: 'The admin set ' + U_fmt(d.agreement.adminSecs) + ' for this task' + (policy.showMoneyToEmployees ? ', price ' + rupee(d.pricePaise) : '') + '. Accept it or propose your own time \u2014 the timer won’t run until then.',
            facts: { deliverableId: d.id, title: d.title, adminSecs: d.agreement.adminSecs, pricePaise: d.pricePaise },
            action: { module: 'detail', deliverableId: d.id }
          }));
        });
      }
    });

    /* Slab approaching — IN_PROGRESS piece task, 30 min ke andar agla slab */
    db.deliverables.forEach(function (d) {
      if (!policy.showMoneyToEmployees) return;
      if (d.pricingMode !== 'PIECE' || d.status !== 'IN_PROGRESS' || !d.estimateSecs) return;
      var pv = W.slabPreview(d);
      if (pv.secsToNext == null || pv.secsToNext > 1800) return;
      (d.assigneeIds || []).forEach(function (aid) {
        out.push(sig('SLAB_APPROACHING', {
          key: d.id + '-' + aid, severity: SEVERITY.MEDIUM, audience: 'EMPLOYEE', recipientId: aid,
          headline: '"' + d.title + '" \u2014 ' + Math.round(pv.secsToNext / 60) + ' min the price drops to ' + rupee(pv.nextPaise) + '',
          why: 'Currently at ' + rupee(pv.currentPaise) + '. ' + pv.why + ' If the work is done, submit now.',
          facts: { deliverableId: d.id, title: d.title, currentPaise: pv.currentPaise, nextPaise: pv.nextPaise, minutesLeft: Math.round(pv.secsToNext / 60) },
          action: { module: 'detail', deliverableId: d.id }
        }));
      });
    });

    /* Disputes */
    (db.disputes || []).forEach(function (x) {
      if (x.status !== 'OPEN') return;
      var days = Math.floor((Date.now() - new Date(x.createdAt).getTime()) / 86400000);
      out.push(sig('DISPUTE_OPEN', {
        key: x.id, severity: days >= 2 ? SEVERITY.HIGH : SEVERITY.MEDIUM,
        headline: empName(x.employeeId) + '\u2019s wallet dispute ' + (days ? days + ' days ' : '') + 'pending',
        why: 'Entry ' + rupee(Math.abs(x.amountPaise)) + ' \u00b7 "' + x.reason + '". The later the reply, the more trust erodes.',
        facts: { disputeId: x.id, employee: empName(x.employeeId), amountPaise: x.amountPaise, reason: x.reason, days: days },
        action: { module: 'payouts', tab: 'disputes' }
      }));
    });

    /* Sandbagging + payout due — async summary se */
    return Promise.all([W.getEstimateBehaviour(), W.getCompanySummary()]).then(function (r) {
      r[0].forEach(function (e) {
        if (!e.sandbagging) return;
        out.push(sig('SANDBAGGING_PATTERN', {
          key: e.id, severity: SEVERITY.LOW,
          headline: e.name + '\u2019s estimates look consistently padded',
          why: 'Pichhle ' + e.tasks + ' tasks average ' + Math.round(e.avgRatio * 100) + '% of estimate. The slab never triggers and capacity looks fuller than it is. Use past data when negotiating the next estimate.',
          facts: { employee: e.name, tasks: e.tasks, avgRatio: e.avgRatio, underRuns: e.underRuns },
          action: { module: 'payouts', tab: 'people' }
        }));
      });
      r[1].byEmployee.forEach(function (e) {
        if (e.balancePaise < 500000) return;   // ₹5,000 se kam ignore
        var lastPayout = (db.walletEntries || []).find(function (w) { return w.employeeId === e.id && w.type === 'PAYOUT'; });
        var daysSince = lastPayout ? Math.floor((Date.now() - new Date(lastPayout.createdAt).getTime()) / 86400000) : 999;
        if (daysSince < 30) return;
        out.push(sig('PAYOUT_DUE', {
          key: e.id, severity: SEVERITY.LOW,
          headline: e.name + '\u2019s wallet balance is ' + rupee(e.balancePaise) + ' \u2014 payout pending',
          why: (lastPayout ? daysSince + ' days since the last payout.' : 'No payout has been recorded yet.') + ' A growing balance is stressful for the employee.',
          facts: { employee: e.name, balancePaise: e.balancePaise, daysSinceLastPayout: lastPayout ? daysSince : null },
          action: { module: 'payouts', tab: 'people' }
        }));
      });
      return out;
    }).catch(function () { return out; });
  }
  function U_fmt(secs) { return root.Schema.TIME.fmtShort(secs); }
  function rupee(p) { return U.fmtRupee(p).replace('.00', ''); }

  /* ==========================================================================
     PUBLIC API
     ========================================================================== */

  var Signals = {
    SEVERITY: SEVERITY,
    RULES: RULES,

    scan: function (opts) {
      opts = opts || {};
      var enabled = opts.enabled || null;

      var sync = []
        .concat(deadlineSignals())
        .concat(reviewSignals())
        .concat(returnedWorkSignals())
        .concat(estimateSignals())
        .concat(invoiceSignals())
        .concat(timeLoggingSignals())
        .concat(dataQualitySignals())
        .concat(newWorkSignals());

      return Promise.all([moneySignals(), capacitySignals(), leaveSignals(), walletSignals()])
        .then(function (async) {
          var all = sync.concat(async[0], async[1], async[2], async[3]);

          if (enabled) {
            all = all.filter(function (s) { return enabled[s.type] !== false; });
          }
          if (opts.audience) {
            all = all.filter(function (s) {
              return s.audience === opts.audience || s.audience === 'BOTH';
            });
          }
          if (opts.recipientId != null) {
            all = all.filter(function (s) {
              return s.recipientId === opts.recipientId ||
                     (s.audience === 'ADMIN' && s.recipientId == null);
            });
          }
          if (opts.minSeverity) {
            all = all.filter(function (s) { return s.severity >= opts.minSeverity; });
          }

          all.sort(function (a, b) { return b.severity - a.severity; });
          return all;
        });
    },

    scanForAdmin: function (enabled) {
      return Signals.scan({ audience: 'ADMIN', enabled: enabled }).then(function (list) {
        return {
          urgent: list.filter(function (s) { return s.severity === SEVERITY.HIGH; }),
          watch: list.filter(function (s) { return s.severity === SEVERITY.MEDIUM; }),
          fyi: list.filter(function (s) { return s.severity === SEVERITY.LOW; }),
          all: list,
          count: list.length
        };
      });
    },

    scanForEmployee: function (employeeId, enabled) {
      return Signals.scan({ audience: 'EMPLOYEE', enabled: enabled }).then(function (list) {
        return list.filter(function (s) { return s.recipientId === employeeId; })
                   .sort(function (a, b) { return b.severity - a.severity; });
      });
    },

    plainText: function (s) {
      return s.headline + ' \u2014 ' + s.why;
    }
  };

  root.EenSignals = Signals;
  if (typeof module !== 'undefined' && module.exports) module.exports = Signals;

})(typeof window !== 'undefined' ? window : globalThis);
