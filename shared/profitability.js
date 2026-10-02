(function (root) {
  'use strict';

  var U = root.Utils, S = root.Schema, DataAPI = root.DataAPI;

  function ensure() {
    var DB = DataAPI.raw();
    if (!DB) return null;
    if (DB.settings.overheadMultiplier == null) DB.settings.overheadMultiplier = 1.4;
    if (DB.settings.targetMarginPct == null) DB.settings.targetMarginPct = 45;
    return DB;
  }

  function ok(v) { if (DataAPI.touch) DataAPI.touch(); return Promise.resolve(v); }
  function clone(x) { return JSON.parse(JSON.stringify(x)); }

  /* Loaded cost — salary + overhead */
  function loadedRate(emp, DB) {
    return Math.round((emp.costPerHourPaise || 0) * (DB.settings.overheadMultiplier || 1.4));
  }

  function effortByDeliverable(DB, filter) {
    filter = filter || {};
    var out = {};   // { deliverableId: { employeeId: secs } }
    DB.attendance.forEach(function (a) {
      if (filter.from && a.date < filter.from) return;
      if (filter.to && a.date > filter.to) return;
      Object.keys(a.perDeliverableSecs || {}).forEach(function (dId) {
        if (!out[dId]) out[dId] = {};
        out[dId][a.employeeId] = (out[dId][a.employeeId] || 0) + a.perDeliverableSecs[dId];
      });
    });
    return out;
  }

  function deliverableCost(DB, effort, del) {
    var delId = del.id;
    var byEmp = effort[delId] || {};
    var costPaise = 0, attributedSecs = 0, contributors = [];

    if (del.pricingMode === 'PIECE') {
      /* Fixed-price task: the cost is the payout once the task is approved.
         Before that nothing has been spent yet — the price is counted in the
         forecast (remaining cost), not as money already spent. */
      /* what was really credited for this task in the pay ledger (all
         assignees together, after late cuts and disputes) — the same money
         the Projects page and Pay team show */
      var credited = (DB.walletEntries || []).filter(function (w) {
        return String(w.deliverableId) === String(del.id) && w.type !== 'PAYOUT';
      }).reduce(function (t, w) { return t + (w.amountPaise || 0); }, 0);
      var pieceCost = del.settlement ? Math.max(0, credited) : 0;
      return { costPaise: pieceCost, secs: del.loggedSecs || 0, attributedSecs: del.loggedSecs || 0, contributors: [{
        employeeId: null, name: (del.settlement ? 'Fixed-price payout' : 'Fixed price (not paid yet)'),
        avatarInitials: '\u20B9', avatarBg: 'var(--s3)', avatarFg: 'var(--t2)',
        secs: del.loggedSecs || 0, costPaise: pieceCost, loadedRatePaise: null, attributed: !!del.settlement, piece: true
      }] };
    }

    Object.keys(byEmp).forEach(function (eid) {
      var emp = DB.employees.find(function (e) { return String(e.id) === String(eid); });
      if (!emp) return;
      var s = byEmp[eid];
      var c = Math.round(loadedRate(emp, DB) * s / 3600);
      costPaise += c; attributedSecs += s;
      contributors.push({
        employeeId: emp.id, name: emp.name,
        avatarInitials: emp.avatarInitials, avatarBg: emp.avatarBg, avatarFg: emp.avatarFg,
        secs: s, costPaise: c, loadedRatePaise: loadedRate(emp, DB), attributed: true
      });
    });

    var totalSecs = Math.max(del.loggedSecs || 0, attributedSecs);
    var unattributedSecs = totalSecs - attributedSecs;

    if (unattributedSecs > 0) {
      var ids = del.assigneeIds || [];
      var rate = ids.length
        ? Math.round(ids.reduce(function (s, id) {
            var e = DB.employees.find(function (x) { return x.id === id; });
            return s + (e ? loadedRate(e, DB) : 0);
          }, 0) / ids.length)
        : (DB.employees.length
            ? Math.round(DB.employees.reduce(function (s, e) { return s + loadedRate(e, DB); }, 0) / DB.employees.length)
            : 0);
      var c2 = Math.round(rate * unattributedSecs / 3600);
      costPaise += c2;
      contributors.push({
        employeeId: null, name: 'Earlier work (pre-timesheet)',
        avatarInitials: '\u2026', avatarBg: 'var(--s3)', avatarFg: 'var(--t3)',
        secs: unattributedSecs, costPaise: c2, loadedRatePaise: rate, attributed: false
      });
    }

    contributors.sort(function (a, b) { return b.costPaise - a.costPaise; });
    return { costPaise: costPaise, secs: totalSecs, attributedSecs: attributedSecs, contributors: contributors };
  }

  function forecastRemaining(DB, deliverables) {
    var avgRate = DB.employees.length
      ? Math.round(DB.employees.reduce(function (s, e) { return s + loadedRate(e, DB); }, 0) / DB.employees.length)
      : 0;
    var secs = 0, costPaise = 0;
    deliverables.forEach(function (d) {
      if (d.status === 'DONE') return;
      if (d.pricingMode === 'PIECE') {                    // fixed price still to be paid
        costPaise += d.pricePaise || 0;
        secs += Math.max(0, (d.estimateSecs || 0) - (d.loggedSecs || 0));
        return;
      }
      var remaining = Math.max(0, (d.estimateSecs || 0) - (d.loggedSecs || 0));
      if (remaining === 0 && d.estimateSecs > 0) remaining = Math.round(d.estimateSecs * 0.25);
      var ids = d.assigneeIds || [];
      var rate = ids.length
        ? Math.round(ids.reduce(function (s, id) {
            var e = DB.employees.find(function (x) { return x.id === id; });
            return s + (e ? loadedRate(e, DB) : avgRate);
          }, 0) / ids.length)
        : avgRate;
      secs += remaining;
      costPaise += Math.round(rate * remaining / 3600);
    });
    return { secs: secs, costPaise: costPaise };
  }

  /* ==========================================================================
     PUBLIC API
     ========================================================================== */
  var Profit = {

    init: function () { ensure(); return ok(true); },

    getSettings: function () {
      var DB = ensure();
      return Promise.resolve({
        overheadMultiplier: DB.settings.overheadMultiplier,
        targetMarginPct: DB.settings.targetMarginPct
      });
    },
    updateSettings: function (patch) {
      var DB = ensure();
      if (patch.overheadMultiplier != null) {
        var m = Number(patch.overheadMultiplier);
        if (isNaN(m) || m < 1 || m > 3) {
          var e = new Error('Overhead multiplier must be between 1.0 and 3.0');
          e.code = 'VALIDATION'; return Promise.reject(e);
        }
        DB.settings.overheadMultiplier = m;
      }
      if (patch.targetMarginPct != null) {
        var t = Number(patch.targetMarginPct);
        if (isNaN(t) || t < 0 || t > 95) {
          var e2 = new Error('Target margin must be between 0 and 95%');
          e2.code = 'VALIDATION'; return Promise.reject(e2);
        }
        DB.settings.targetMarginPct = t;
      }
      return ok(clone(DB.settings));
    },

    setEmployeeRates: function (employeeId, rates) {
      var DB = ensure();
      var emp = DB.employees.find(function (e) { return e.id === Number(employeeId); });
      if (!emp) { var e = new Error('Employee not found'); e.code = 'NOT_FOUND'; return Promise.reject(e); }
      if (rates.costPerHourPaise != null) {
        var c = Number(rates.costPerHourPaise);
        if (isNaN(c) || c < 0) { var e2 = new Error('Cost rate must be a positive number'); e2.code = 'VALIDATION'; return Promise.reject(e2); }
        emp.costPerHourPaise = Math.round(c);
      }
      if (rates.billRatePaise != null) {
        var b = Number(rates.billRatePaise);
        if (isNaN(b) || b < 0) { var e3 = new Error('Bill rate must be a positive number'); e3.code = 'VALIDATION'; return Promise.reject(e3); }
        emp.billRatePaise = Math.round(b);
      }
      return ok(clone(emp));
    },

    getRateCoverage: function () {
      var DB = ensure();
      var missing = DB.employees.filter(function (e) { return !e.costPerHourPaise; });
      return Promise.resolve({
        total: DB.employees.length,
        withRates: DB.employees.length - missing.length,
        missing: missing.map(function (e) { return { id: e.id, name: e.name }; }),
        complete: missing.length === 0
      });
    },

    /* ── Ek project ka poora P&L ──────────────────────────────────────── */
    getProject: function (projectId) {
      var DB = ensure();
      var pid = Number(projectId);
      var p = DB.projects.find(function (x) { return x.id === pid; });
      if (!p) { var e = new Error('Project not found'); e.code = 'NOT_FOUND'; return Promise.reject(e); }

      var effort = effortByDeliverable(DB);
      var dels = DB.deliverables.filter(function (d) { return d.projectId === pid; });

      /* ── COST ── */
      var costPaise = 0, loggedSecs = 0;
      var byEmployee = {};
      var delRows = dels.map(function (d) {
        var c = deliverableCost(DB, effort, d);
        costPaise += c.costPaise;
        loggedSecs += c.secs;
        c.contributors.forEach(function (ct) {
          if (!byEmployee[ct.employeeId]) {
            byEmployee[ct.employeeId] = {
              employeeId: ct.employeeId, name: ct.name,
              avatarInitials: ct.avatarInitials, avatarBg: ct.avatarBg, avatarFg: ct.avatarFg,
              secs: 0, costPaise: 0, loadedRatePaise: ct.loadedRatePaise
            };
          }
          byEmployee[ct.employeeId].secs += ct.secs;
          byEmployee[ct.employeeId].costPaise += ct.costPaise;
        });
        var estSecs = d.estimateSecs || 0;
        return {
          id: d.id, title: d.title, status: d.status,
          milestoneId: d.milestoneId,
          estimateSecs: estSecs,
          actualSecs: c.secs,
          costPaise: c.costPaise,
          overrunPct: estSecs ? Math.round((c.secs / estSecs - 1) * 100) : null,
          milestoneAmountPaise: d.milestoneId ? ((DB.milestones.find(function (m) { return m.id === d.milestoneId; }) || {}).amountPaise || 0) : 0,
          currentPayoutPaise: d.liveSettlement ? d.liveSettlement.currentPaise : null,
          finalPayoutPaise: d.settlement ? d.settlement.finalPaise : null,
          contributors: c.contributors
        };
      }).sort(function (a, b) { return b.costPaise - a.costPaise; });

      /* money paid to people for this project outside task pay
         (milestone pay, direct payments/salary for the project) */
      var payoutIds = {};
      (DB.walletEntries || []).forEach(function (w) { if (w.type === 'PAYOUT') payoutIds[w.id] = 1; });
      var extraCost = Math.max(0, (DB.walletEntries || []).filter(function (w) {
        if ((w.type === 'BONUS' && w.meta && w.meta.direct) || (w.meta && w.meta.cancels)) return false;      // old payment-as-earnings lines (they cancel out)
        return w.projectId === pid && !w.deliverableId && w.type !== 'PAYOUT' && !(w.meta && w.meta.reversalOf && payoutIds[w.meta.reversalOf]);
      }).reduce(function (t, w) { return t + w.amountPaise; }, 0));
      if (extraCost) {
        costPaise += extraCost;
        delRows.push({ id: 'extra', title: 'Milestone pay & direct payments', status: 'DONE', milestoneId: null, estimateSecs: 0, actualSecs: 0,
          costPaise: extraCost, overrunPct: null, milestoneAmountPaise: 0, currentPayoutPaise: null, finalPayoutPaise: null, contributors: [] });
      }

      /* ── REVENUE — teen alag number ── */
      /* a draft has not been billed to the client yet */
      var invs = DB.invoices.filter(function (i) {
        return i.projectId === pid && i.status !== 'CANCELLED' && i.status !== 'DRAFT';
      });
      var invoicedPaise = invs.reduce(function (s, i) { return s + i.subtotalPaise; }, 0);
      var collectedPaise = invs.reduce(function (s, i) {
        if (!i.totalPaise) return s;
        return s + Math.round(i.paidPaise * (i.subtotalPaise / i.totalPaise));
      }, 0);
      var contractPaise = p.contractValuePaise || p.budgetPaise || 0;
      /* advance + invoice payments, never counted twice (same rule as everywhere) */
      var grossReceived = U.clientReceivedPaise(p, DB.invoices);
      var grossBilled = invs.reduce(function (t, i) { return t + (i.totalPaise || 0); }, 0);
      collectedPaise = grossBilled > 0 ? Math.round(grossReceived * invoicedPaise / grossBilled) : grossReceived;

      var billableMs = DB.milestones.filter(function (m) { return m.projectId === pid && m.billable; });
      var doneUnbilled = billableMs.filter(function (m) {
        if (m.status !== 'DONE') return false;
        return !DB.invoices.some(function (i) { return i.milestoneId === m.id && i.status !== 'CANCELLED'; });
      });
      /* Prefer explicit milestone amounts. Fall back to an equal split only
         for legacy milestones that have no amount configured. */
      var fallbackMsAmount = billableMs.length ? Math.round(contractPaise / billableMs.length) : 0;
      var wipPaise = doneUnbilled.reduce(function (sum, m) {
        return sum + (m.amountPaise || fallbackMsAmount);
      }, 0);

      /* ── MARGIN ── */
      var recognisedPaise = invoicedPaise + wipPaise;   // work already delivered
      var marginPaise = recognisedPaise - costPaise;
      var marginPct = recognisedPaise > 0 ? Math.round(marginPaise / recognisedPaise * 100) : null;

      /* ── FORECAST ── */
      var fc = forecastRemaining(DB, dels);
      var projectedCost = costPaise + fc.costPaise;
      var projectedMargin = contractPaise - projectedCost;
      var projectedMarginPct = contractPaise > 0
        ? Math.round(projectedMargin / contractPaise * 100) : null;

      var target = DB.settings.targetMarginPct;
      var health = projectedMarginPct == null ? 'UNKNOWN'
        : projectedMarginPct < 0 ? 'LOSS'
        : projectedMarginPct < target * 0.5 ? 'CRITICAL'
        : projectedMarginPct < target ? 'BELOW_TARGET'
        : 'HEALTHY';

      var effectiveRatePaise = loggedSecs >= 3600
        ? Math.round(recognisedPaise / (loggedSecs / 3600)) : null;   // too little time to say

      /* Budget burn — how much of the contract value is used up */
      var burnPct = contractPaise > 0 ? Math.round(costPaise / contractPaise * 100) : null;
      /* delivered = finished work (time logged is not delivery: an overrun
         task has lots of time but is not done) — weighted by estimate */
      var pDs = (DB.deliverables || []).filter(function (d) { return d.projectId === pid; });
      var deliveryPct;
      if (pDs.length) {
        var wSum = 0, dSum = 0;
        pDs.forEach(function (d) {
          var wt = d.estimateSecs > 0 ? d.estimateSecs : 3600;
          wSum += wt; dSum += wt * (d.status === 'DONE' ? 100 : d.status === 'IN_REVIEW' ? 90 : 0);
        });
        deliveryPct = Math.round(dSum / wSum);
      } else deliveryPct = DataAPI.projectProgress(pid);

      return Promise.resolve({
        projectId: p.id, name: p.name, client: p.clientName, status: p.status,

        contractPaise: contractPaise,
        invoicedPaise: invoicedPaise,
        collectedPaise: collectedPaise,
        wipPaise: wipPaise,
        uninvoicedMilestones: doneUnbilled.length,
        outstandingPaise: Math.max(0, invoicedPaise - collectedPaise),

        costPaise: costPaise,
        loggedSecs: loggedSecs,
        loggedHours: Math.round(loggedSecs / 360) / 10,

        marginPaise: marginPaise,
        marginPct: marginPct,
        effectiveRatePaise: effectiveRatePaise,

        forecastRemainingSecs: fc.secs,
        forecastRemainingCostPaise: fc.costPaise,
        projectedCostPaise: projectedCost,
        projectedMarginPaise: projectedMargin,
        projectedMarginPct: projectedMarginPct,

        burnPct: burnPct,
        deliveryPct: deliveryPct,
        burnAhead: burnPct != null && burnPct > deliveryPct + 10,

        targetMarginPct: target,
        health: health,

        deliverables: delRows,
        team: Object.keys(byEmployee).map(function (k) { return byEmployee[k]; })
          .sort(function (a, b) { return b.costPaise - a.costPaise; })
      });
    },

    /* ── Saare projects ka portfolio view ─────────────────────────────── */
    getPortfolio: function () {
      var DB = ensure();
      var list = DB.projects.map(function (p) { return Profit.getProject(p.id); });
      return Promise.all(list).then(function (rows) {
        var totals = rows.reduce(function (acc, r) {
          acc.contractPaise += r.contractPaise;
          acc.invoicedPaise += r.invoicedPaise;
          acc.collectedPaise += r.collectedPaise;
          acc.wipPaise += r.wipPaise;
          acc.costPaise += r.costPaise;
          acc.projectedCostPaise += r.projectedCostPaise;
          acc.loggedSecs += r.loggedSecs;
          return acc;
        }, { contractPaise:0, invoicedPaise:0, collectedPaise:0, wipPaise:0,
             costPaise:0, projectedCostPaise:0, loggedSecs:0 });

        var recognised = totals.invoicedPaise + totals.wipPaise;
        totals.marginPaise = recognised - totals.costPaise;
        totals.marginPct = recognised > 0 ? Math.round(totals.marginPaise / recognised * 100) : null;
        totals.projectedMarginPaise = totals.contractPaise - totals.projectedCostPaise;
        totals.projectedMarginPct = totals.contractPaise > 0
          ? Math.round(totals.projectedMarginPaise / totals.contractPaise * 100) : null;
        totals.effectiveRatePaise = totals.loggedSecs >= 3600
          ? Math.round(recognised / (totals.loggedSecs / 3600)) : null;
        totals.outstandingPaise = Math.max(0, totals.invoicedPaise - totals.collectedPaise);

        rows.sort(function (a, b) {
          var order = { LOSS:0, CRITICAL:1, BELOW_TARGET:2, HEALTHY:3, UNKNOWN:4 };
          if (order[a.health] !== order[b.health]) return order[a.health] - order[b.health];
          return (a.projectedMarginPct || 0) - (b.projectedMarginPct || 0);
        });

        return { projects: rows, totals: totals, targetMarginPct: DB.settings.targetMarginPct };
      });
    },

    getByClient: function () {
      return Profit.getPortfolio().then(function (pf) {
        var map = {};
        pf.projects.forEach(function (r) {
          var k = r.client || 'Unknown';
          if (!map[k]) map[k] = {
            client: k, projects: 0, contractPaise: 0, invoicedPaise: 0,
            collectedPaise: 0, costPaise: 0, loggedSecs: 0
          };
          map[k].projects++;
          map[k].contractPaise += r.contractPaise;
          map[k].invoicedPaise += r.invoicedPaise;
          map[k].collectedPaise += r.collectedPaise;
          map[k].costPaise += r.costPaise;
          map[k].loggedSecs += r.loggedSecs;
        });
        return Object.keys(map).map(function (k) {
          var c = map[k];
          c.marginPaise = c.invoicedPaise - c.costPaise;
          c.marginPct = c.invoicedPaise > 0 ? Math.round(c.marginPaise / c.invoicedPaise * 100) : null;
          c.effectiveRatePaise = c.loggedSecs >= 3600
            ? Math.round(c.invoicedPaise / (c.loggedSecs / 3600)) : null;
          return c;
        }).sort(function (a, b) { return b.marginPaise - a.marginPaise; });
      });
    },

    /* ── Per-employee contribution ────────────────────────────────────── */
    getByEmployee: function (fromIso, toIso) {
      var DB = ensure();
      var effort = effortByDeliverable(DB, { from: fromIso, to: toIso });

      var rows = DB.employees.map(function (e) {
        var costPaise = 0, secs = 0, billablePaise = 0, billableSecs = 0;
        Object.keys(effort).forEach(function (dId) {
          var s = effort[dId][e.id];
          if (!s) return;
          secs += s;
          costPaise += Math.round(loadedRate(e, DB) * s / 3600);
          var d = DB.deliverables.find(function (x) { return String(x.id) === String(dId); });
          var proj = d && DB.projects.find(function (p) { return p.id === d.projectId; });
          if (proj && proj.status !== 'COMPLETED') {
            billableSecs += s;
            billablePaise += Math.round((e.billRatePaise || 0) * s / 3600);
          }
        });
        return {
          employeeId: e.id, name: e.name, role: e.role,
          avatarInitials: e.avatarInitials, avatarBg: e.avatarBg, avatarFg: e.avatarFg,
          costRatePaise: e.costPerHourPaise || 0,
          loadedRatePaise: loadedRate(e, DB),
          billRatePaise: e.billRatePaise || 0,
          secs: secs, hours: Math.round(secs / 360) / 10,
          costPaise: costPaise,
          billableValuePaise: billablePaise,
          billableSecs: billableSecs,
          contributionPaise: billablePaise - costPaise,
          multiple: costPaise > 0 ? Math.round(billablePaise / costPaise * 100) / 100 : null
        };
      }).filter(function (r) { return r.secs > 0; })
        .sort(function (a, b) { return b.contributionPaise - a.contributionPaise; });

      return Promise.resolve(rows);
    },

    getAlerts: function () {
      return Profit.getPortfolio().then(function (pf) {
        var alerts = [];
        pf.projects.forEach(function (r) {
          if (r.health === 'LOSS') {
            alerts.push({ severity:'high', projectId:r.projectId,
              title: r.name + ' is projected to lose money',
              detail: 'Forecast margin ' + r.projectedMarginPct + '%. Cost so far ' +
                      U.fmtRupee(r.costPaise) + ' against a ' + U.fmtRupee(r.contractPaise) + ' contract.' });
          } else if (r.health === 'CRITICAL') {
            alerts.push({ severity:'high', projectId:r.projectId,
              title: r.name + ' margin is critical',
              detail: 'Projected ' + r.projectedMarginPct + '% against a ' + r.targetMarginPct + '% target.' });
          }
          if (r.burnAhead) {
            alerts.push({ severity:'medium', projectId:r.projectId,
              title: r.name + ' is burning budget faster than it delivers',
              detail: r.burnPct + '% of budget consumed, only ' + r.deliveryPct + '% delivered.' });
          }
          if (r.uninvoicedMilestones > 0) {
            alerts.push({ severity:'medium', projectId:r.projectId,
              title: r.uninvoicedMilestones + ' delivered milestone(s) not invoiced on ' + r.name,
              detail: 'About ' + U.fmtRupee(r.wipPaise) + ' sitting as work-in-progress.' });
          }
          if (r.outstandingPaise > 0 && r.status !== 'PLANNING') {
            var overdue = DataAPI.raw().invoices.some(function (i) {
              return i.projectId === r.projectId && i.status !== 'PAID' &&
                     i.dueDate && i.dueDate < U.isoDate(new Date());
            });
            if (overdue) {
              alerts.push({ severity:'high', projectId:r.projectId,
                title: 'Overdue payment on ' + r.name,
                detail: U.fmtRupee(r.outstandingPaise) + ' invoiced but not collected.' });
            }
          }
        });
        var rank = { high:0, medium:1, low:2 };
        alerts.sort(function (a, b) { return rank[a.severity] - rank[b.severity]; });
        return alerts;
      });
    },

    /* Helper for UI */
    loadedRateOf: function (employeeId) {
      var DB = ensure();
      var e = DB.employees.find(function (x) { return x.id === Number(employeeId); });
      return e ? loadedRate(e, DB) : 0;
    }
  };

  root.Profit = Profit;
  if (typeof module !== 'undefined' && module.exports) module.exports = Profit;

})(typeof window !== 'undefined' ? window : globalThis);