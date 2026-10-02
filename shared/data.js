(function (root) {
  'use strict';

  var U = root.Utils, S = root.Schema;
  var STORAGE_KEY = 'oment_psa_db_v2';    
  var SCHEMA_VERSION = 4;      

  var LATENCY = 0;
  try { LATENCY = parseInt(root.localStorage && root.localStorage.getItem('oment_dev_latency'), 10) || 0; } catch (e) {}

  /* ── In-memory DB ────────────────────────────────────────────────────── */
  var DB = null;

  function freshDB() {
    var seed = root.SEED;
    return {
      version: 1,
      schemaVersion: SCHEMA_VERSION,
      company:       JSON.parse(JSON.stringify(seed.COMPANY)),
      adminUser:     JSON.parse(JSON.stringify(seed.ADMIN_USER)),
      departments:   clone(seed.DEPARTMENTS),
      employees:     clone(seed.EMPLOYEES),
      projects:      clone(seed.PROJECTS),
      milestones:    clone(seed.MILESTONES),
      deliverables:  clone(seed.DELIVERABLES),
      subtasks:      clone(seed.SUBTASKS),
      attendance:    clone(seed.ATTENDANCE),
      timeEntries:   [],
      invoices:      clone(seed.INVOICES),
      notices:       clone(seed.NOTICES),
      conversations: clone(seed.CONVERSATIONS),
      calendarEvents:clone(seed.CALENDAR_EVENTS),
      callLogs:      clone(seed.CALL_LOGS),
      notifications: clone(seed.NOTIFICATIONS),
      activity:      clone(seed.ACTIVITY),
      walletEntries: clone(seed.WALLET_ENTRIES || []),
      disputes:      [],
      outbox:        [],
      settings: {
        companyName: seed.COMPANY.name,
        gstin: seed.COMPANY.gstin,
        stateCode: seed.COMPANY.stateCode,
        address: seed.COMPANY.address,
        email: seed.COMPANY.email,
        phone: seed.COMPANY.phone,
        workdayTargetHours: 8,
        weekStart: 'monday',
        currency: 'INR',
        gstRate: 18,
        invoicePrefix: 'INV',
        autoApproveSelfTasks: false,
        notifyOnSubmission: true,
        notifyOnOverdue: true
      }
    };
  }

  function clone(x) { return JSON.parse(JSON.stringify(x)); }

  /* ── Persistence ─────────────────────────────────────────────────────── */
  function load() {
    try {
      var raw = root.localStorage && root.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && parsed.version === 1) return migrate(parsed);
      }
    } catch (e) {   }
    return freshDB();
  }

  function migrate(db) {
    var v = db.schemaVersion || 1;
    if (v < 2) {
      db.deliverables.forEach(function (d) {
        if (!d.pricingMode) d.pricingMode = 'HOURLY';
        if (d.pricePaise == null) d.pricePaise = 0;
        if (d.reworkCount == null) d.reworkCount = 0;
      });
      if (!db.walletEntries) db.walletEntries = [];
      if (!db.disputes) db.disputes = [];
      if (!db.outbox) db.outbox = [];
      v = 2;
    }
    if (v < 3) {
      var taken = [];
      db.employees.forEach(function (e) {
        if (!e.username) e.username = U.usernameFrom(e.name, taken);
        taken.push(e.username);
        if (!e.passHash) { e.passHash = U.hashPass('oment123'); e.mustChangePass = true; }
        if (e.address === undefined) e.address = '';
      });
      if (db.payPolicy && db.payPolicy.showMoneyToEmployees === undefined) db.payPolicy.showMoneyToEmployees = false;
      v = 3;
    }
    if (v < 4) {
      db.employees.forEach(function (e) {
        if (e.hoursPerDay === undefined) e.hoursPerDay = 8;
        if (e.monthlySalaryPaise === undefined || !e.monthlySalaryPaise) {
          e.monthlySalaryPaise = e.costPerHourPaise ? e.costPerHourPaise * U.WORKING_DAYS_PER_MONTH * 8 : 0;
        }
        if (e.monthlySalaryPaise > 0 && !e.costPerHourPaise) {
          e.costPerHourPaise = U.hourlyCostFromSalary(e.monthlySalaryPaise, e.hoursPerDay);
        }
      });
      v = 4;
    }
    db.schemaVersion = v;
    return db;
  }

  var _saveTimer = null, _dirty = false;

  function _writeNow() {
    _dirty = false;
    try {
      root.localStorage && root.localStorage.setItem(STORAGE_KEY, JSON.stringify(DB));
    } catch (e) {
      console.warn('DataAPI: persistence failed (quota / private mode)', e);
    }
  }

  function save() {
    _dirty = true;
    clearTimeout(_saveTimer);
    _saveTimer = setTimeout(_writeNow, 120);
  }

  function flush() {
    clearTimeout(_saveTimer);
    if (_dirty) _writeNow();
  }

  if (root.addEventListener) {
    root.addEventListener('beforeunload', flush);
    root.addEventListener('pagehide', flush);
    if (root.document) {
      root.document.addEventListener('visibilitychange', function () {
        if (root.document.visibilityState === 'hidden') flush();
      });
    }
  }

  /* ── Promise helpers ─────────────────────────────────────────────────── */
  function ok(data) {
    save();
    if (!LATENCY) return Promise.resolve(data);
    return new Promise(function (res) { setTimeout(function () { res(data); }, LATENCY); });
  }
  function fail(msg, code) {
    var e = new Error(msg); e.code = code || 'ERROR';
    return Promise.reject(e);
  }

  function list(arr) { return ok(clone(arr)); }

  function findOr404(arr, id, what) {
    var row = arr.find(function (x) { return String(x.id) === String(id); });
    return row || null;
  }

  /* ── Invoice counter ─────────────────────────────────────────────────── */
  var _invCounter = null;
  function invCounter() {
    if (!_invCounter) {
      _invCounter = new U.InvoiceCounter({ prefix: DB.settings.invoicePrefix })
        .seedFrom(DB.invoices);
    }
    return _invCounter;
  }

  /* ── Activity + notification helpers ─────────────────────────────────── */
  function logActivity(icon, color, text) {
    DB.activity.unshift({ icon: icon, color: color, text: text, at: new Date().toISOString() });
    if (DB.activity.length > 80) DB.activity.length = 80;
  }
  function notify(recipientId, kind, title, body, entityType, entityId) {
    if (recipientId == null) return;
    DB.notifications.unshift({
      id: U.newId('n'), recipientId: recipientId, kind: kind,
      title: title, body: body, entityType: entityType || null, entityId: entityId || null,
      read: false, createdAt: new Date().toISOString()
    });
  }

  /* ========================================================================
     PUBLIC API
     ======================================================================== */
  /* one place that builds an invoice (used by createInvoice + recurring plans) */
  function buildInvoice(payload) {
    if (!payload) return { error: 'Invoice data is required' };
    if (!payload.clientName) return { error: 'Client name is required' };
    if (!payload.lines || !payload.lines.length) return { error: 'Add at least one line item' };
    var subtotal = payload.lines.reduce(function (s, l) {
      return s + Math.round((Number(l.qty) || 0) * (Number(l.ratePaise) || 0));
    }, 0);
    if (subtotal <= 0) return { error: 'Invoice total must be greater than zero' };
    var gst = U.computeGst(subtotal, DB.settings.gstRate, DB.settings.stateCode, payload.placeOfSupply);
    var invoice = S.Shape.invoice(Object.assign({}, payload, {
      id: U.newId('inv'),
      number: invCounter().next(),           
      subtotalPaise: subtotal,
      cgstPaise: gst.cgstPaise, sgstPaise: gst.sgstPaise, igstPaise: gst.igstPaise,
      totalPaise: gst.totalPaise,
      status: payload.status || 'DRAFT',
      issueDate: payload.issueDate || U.isoDate(new Date())
    }));
    DB.invoices.push(invoice);
    logActivity('\uD83E\uDDFE', '#EFF6FF', 'Invoice <strong>' + U.esc(invoice.number) + '</strong> created — ' + U.fmtRupee(invoice.totalPaise));
    return { invoice: invoice };
  }

  function recurList() {
    if (!Array.isArray(DB.recurringInvoices)) DB.recurringInvoices = [];
    return DB.recurringInvoices;
  }

  var FREQS = { WEEKLY: 'week', MONTHLY: 'month', QUARTERLY: 'quarter', YEARLY: 'year' };

  function checkPlan(p) {
    if (!p.clientName || !String(p.clientName).trim()) return 'Client name is required';
    if (!FREQS[String(p.frequency || '').toUpperCase()]) return 'Choose how often: weekly, monthly, quarterly or yearly';
    if (!p.lines || !p.lines.length) return 'Add at least one line item';
    var sub = p.lines.reduce(function (s, l) { return s + Math.round((Number(l.qty) || 0) * (Number(l.ratePaise) || 0)); }, 0);
    if (sub <= 0) return 'The amount must be greater than zero';
    if (p.startDate && !/^\d{4}-\d{2}-\d{2}$/.test(p.startDate)) return 'Start date is not valid';
    if (p.endDate && p.startDate && p.endDate < p.startDate) return 'End date is before the start date';
    return null;
  }

  /* next date after `iso`, keeping the day of the start date (31 Jan → 28/29 Feb → 31 Mar) */
  function nextRunDate(iso, freq, anchorDay) {
    var d = new Date(iso + 'T12:00:00');
    if (freq === 'WEEKLY') { d.setDate(d.getDate() + 7); return U.isoDate(d); }
    var months = freq === 'MONTHLY' ? 1 : freq === 'QUARTERLY' ? 3 : 12;
    var y = d.getFullYear(), m = d.getMonth() + months;
    y += Math.floor(m / 12); m = ((m % 12) + 12) % 12;
    var last = new Date(y, m + 1, 0).getDate();
    return U.isoDate(new Date(y, m, Math.min(anchorDay || d.getDate(), last), 12));
  }

  /* make the invoices that are due; returns [{planId, invoiceId, autoSend}] */
  function runRecurring(today, onlyId) {
    var made = [];
    recurList().forEach(function (p) {
      if (onlyId && String(p.id) !== String(onlyId)) return;
      var guard = 0;
      while (p.active && p.nextDate && p.nextDate <= today && guard++ < 24) {
        if ((p.endDate && p.nextDate > p.endDate) || (p.maxCount && p.count >= p.maxCount)) { p.active = false; p.status = 'COMPLETED'; break; }
        var due = new Date(p.nextDate + 'T12:00:00'); due.setDate(due.getDate() + (p.dueInDays == null ? 15 : p.dueInDays));
        var period = new Date(p.nextDate + 'T12:00:00').toLocaleDateString('en-IN', p.frequency === 'WEEKLY' ? { day: 'numeric', month: 'short', year: 'numeric' } : { month: 'long', year: 'numeric' });
        var r = buildInvoice({
          clientName: p.clientName, clientEmail: p.clientEmail, clientGstin: p.clientGstin, placeOfSupply: p.placeOfSupply,
          projectId: p.projectId, milestoneId: null, subject: (p.subject || p.name) + ' \u2014 ' + period,
          lines: p.lines.map(function (l) { return Object.assign({}, l, { description: (l.description || p.name) + ' (' + period + ')' }); }),
          issueDate: p.nextDate, dueDate: U.isoDate(due), status: 'DRAFT',
          notes: (p.notes ? p.notes + '\n' : '') + 'Recurring ' + p.frequency.toLowerCase() + ' invoice' + (p.maxCount ? ' (' + (p.count + 1) + ' of ' + p.maxCount + ')' : ''),
          recurringId: p.id
        });
        if (r.error) break;
        p.count += 1; p.lastInvoiceId = r.invoice.id; p.invoiceIds = (p.invoiceIds || []).concat(r.invoice.id).slice(-60);
        p.lastRunAt = new Date().toISOString();
        made.push({ planId: p.id, invoiceId: r.invoice.id, number: r.invoice.number, autoSend: !!p.autoSend && !!p.clientEmail });
        p.nextDate = nextRunDate(p.nextDate, p.frequency, Number(String(p.startDate).slice(8, 10)));
        if ((p.maxCount && p.count >= p.maxCount) || (p.endDate && p.nextDate > p.endDate)) { p.active = false; p.status = 'COMPLETED'; }
      }
    });
    return made;
  }

  function msPayCalc(m) {
    var ds = DB.deliverables.filter(function (d) { return d.milestoneId === m.id; });
    var per = {}, taken = 0;
    ds.forEach(function (d) {
      var secs = d.loggedSecs || 0, a = d.assigneeIds || [];
      taken += secs;
      a.forEach(function (id) { per[id] = (per[id] || 0) + (a.length ? secs / a.length : 0); });
      if (!secs) a.forEach(function (id) { if (per[id] == null) per[id] = 0; });
    });
    var allowed = (Number(m.payHours) || 0) * 3600;
    var overHours = allowed ? Math.max(0, taken - allowed) / 3600 : 0;
    var floor = Math.max(0, Math.min(100, Number(m.payFloorPct == null ? 50 : m.payFloorPct)));
    var cutPct = Math.round(Math.min(100 - floor, overHours * (Number(m.payCutPct) || 0)) * 10) / 10;
    var finalPaise = Math.round((m.payPaise || 0) * (100 - cutPct) / 100);
    var ids = Object.keys(per).map(Number), sum = ids.reduce(function (t, id) { return t + per[id]; }, 0);
    var shares = ids.map(function (id) {
      return { employeeId: id, secs: Math.round(per[id]), amountPaise: sum ? Math.round(finalPaise * per[id] / sum) : Math.round(finalPaise / ids.length) };
    });
    return {
      milestoneId: m.id, payPaise: m.payPaise || 0, allowedSecs: allowed, takenSecs: taken,
      overHours: Math.round(overHours * 10) / 10, cutPct: cutPct, floorPct: floor, finalPaise: finalPaise,
      totalTasks: ds.length, doneTasks: ds.filter(function (d) { return d.status === 'DONE'; }).length,
      shares: shares, settledAt: m.paySettledAt || null
    };
  }

  /* Share a milestone's amount between its tasks that take their price from
     it: approved tasks keep what they were paid; the rest of the amount is
     split equally between the tasks still open. */
  function splitMilestoneAmount(m) {
    var ds = DB.deliverables.filter(function (d) { return d.milestoneId === m.id && d.priceFromMilestone; });
    var settled = ds.filter(function (d) { return d.settlement; });
    var open = ds.filter(function (d) { return !d.settlement; });
    if (!open.length) return;
    var used = settled.reduce(function (t, d) { return t + (d.pricePaise || 0); }, 0);
    var left = Math.max(0, (m.amountPaise || 0) - used);
    var each = Math.floor(left / open.length);
    open.forEach(function (d, i) { d.pricePaise = i === open.length - 1 ? left - each * (open.length - 1) : each; });
  }

  /* ── Automatic invoices ────────────────────────────────────────────── */
  function projectBilledSub(pid) {
    return DB.invoices.filter(function (i) { return i.projectId === pid && i.status !== 'CANCELLED'; })
      .reduce(function (t, i) { return t + (i.subtotalPaise || 0); }, 0);
  }
  /* kind: 'CREATE' (full value) | 'COMPLETE' (what is left to bill) */
  function autoInvoice(p, kind) {
    var value = p.contractValuePaise || p.budgetPaise || 0;
    var left = kind === 'CREATE' ? value : Math.max(0, value - projectBilledSub(p.id));
    if (left <= 0 || !p.clientName) return null;
    var due = new Date(); due.setDate(due.getDate() + 15);
    var r = buildInvoice({
      clientName: p.clientName, clientEmail: p.clientEmail || '', clientGstin: p.clientGstin || '', placeOfSupply: p.clientStateCode || '',
      projectId: p.id, milestoneId: null,
      subject: (kind === 'CREATE' ? 'Project invoice \u2014 ' : 'Final invoice \u2014 ') + p.name,
      lines: [{ description: p.name + (kind === 'CREATE' ? ' \u2014 project value' : ' \u2014 balance on completion'), qty: 1, ratePaise: left }],
      dueDate: U.isoDate(due), status: 'DRAFT',
      notes: kind === 'CREATE' ? 'Created automatically when the project was set up.' : 'Created automatically when the project was completed.'
    });
    if (r.error) return null;
    var inv = r.invoice;
    inv.autoCreated = kind;
    /* an advance already taken counts as a payment on this invoice */
    var advLeft = (p.advancePaidPaise || 0) - (p.advanceAppliedPaise || 0);
    if (advLeft > 0) {
      var use = Math.min(advLeft, inv.totalPaise);
      inv.payments = (inv.payments || []).concat({ id: U.newId('pay'), amountPaise: use, date: p.advanceDate || U.isoDate(new Date()),
        method: 'Advance', reference: p.advanceRef || '', note: 'Advance adjusted', at: new Date().toISOString() });
      inv.paidPaise = (inv.paidPaise || 0) + use;
      p.advanceAppliedPaise = (p.advanceAppliedPaise || 0) + use;
    }
    /* sent straight away when we have the client's email (the server emails it with the PDF) */
    if (p.clientEmail) {
      inv.status = inv.paidPaise >= inv.totalPaise ? 'PAID' : inv.paidPaise > 0 ? 'PARTIALLY_PAID' : 'SENT';
      inv.sentAt = inv.lastSentAt = new Date().toISOString();
      inv.autoEmail = true;
    } else if (inv.paidPaise > 0) {
      inv.status = inv.paidPaise >= inv.totalPaise ? 'PAID' : 'PARTIALLY_PAID';
    }
    notify(DB.adminUser.id, 'INFO', 'Invoice ' + inv.number + ' created automatically',
      p.name + ' \u2014 ' + U.fmtRupee(inv.totalPaise) + (p.clientEmail ? ', emailed to ' + p.clientEmail : ' (draft: add the client email to send it)'), 'INVOICE', inv.id);
    return inv;
  }
  /* all tasks approved → the project is completed */
  function autoCompleteProject(pid) {
    var p = DB.projects.find(function (x) { return x.id === pid; });
    if (!p || p.status === 'COMPLETED' || p.status === 'CANCELLED') return;
    var ds = DB.deliverables.filter(function (d) { return d.projectId === pid; });
    if (!ds.length || ds.some(function (d) { return d.status !== 'DONE'; })) return;
    p.status = 'COMPLETED';
    p.completedAt = new Date().toISOString();
    logActivity('\uD83C\uDFC1', '#ECFDF5', 'Project <strong>' + U.esc(p.name) + '</strong> completed \u2014 all tasks approved');
    notify(DB.adminUser.id, 'INFO', 'Project completed', p.name + ' \u2014 every task is approved', 'PROJECT', p.id);
    if (p.autoInvoiceOnComplete !== false) autoInvoice(p, 'COMPLETE');
  }

  var DataAPI = {

    /* ── lifecycle ─────────────────────────────────────────────────────── */
    init: function () {
      DB = load();
      _invCounter = null;
      /* projects whose every task is already approved are completed
         (status only — no invoice is made for old projects here) */
      (DB.projects || []).forEach(function (p) {
        if (p.status !== 'ACTIVE') return;
        var ds = (DB.deliverables || []).filter(function (d) { return d.projectId === p.id; });
        if (ds.length && ds.every(function (d) { return d.status === 'DONE'; })) {
          p.status = 'COMPLETED'; p.completedAt = p.completedAt || new Date().toISOString();
        }
      });
      return ok(true);
    },
    flush: flush,
    touch: function () { save(); return DB; },
    reset: function () {
      DB = freshDB();
      _invCounter = null;
      try { root.localStorage && root.localStorage.removeItem(STORAGE_KEY); } catch (e) {}
      return ok(true);
    },
    raw: function () { return DB; },

    setLatency: function (ms) { LATENCY = ms || 0; },

    /* ── company / settings ────────────────────────────────────────────── */
    getSettings: function () { return ok(clone(DB.settings)); },
    updateSettings: function (patch) {
      Object.assign(DB.settings, patch || {});
      if (patch && patch.invoicePrefix) _invCounter = null;
      logActivity('\u2699\uFE0F', '#F0EEE9', 'Company settings updated');
      return ok(clone(DB.settings));
    },

    /* ── employees ─────────────────────────────────────────────────────── */
    authenticateEmployee: function (username, password) {
      username = String(username || '').toLowerCase().trim();
      var e = DB.employees.find(function (x) { return x.username === username; });
      if (!e || !U.checkPass(String(password || ''), e.passHash))
        return fail('Incorrect username or password', 'AUTH');
      if (e.canLogin === false) return fail('This account is disabled. Contact your admin.', 'AUTH');
      return ok(clone(e));
    },
    getEmployees: function () { return list(DB.employees); },
    getEmployee: function (id) {
      var e = findOr404(DB.employees, id);
      return e ? ok(clone(e)) : fail('Employee not found', 'NOT_FOUND');
    },
    createEmployee: function (payload) {
      if (!payload || !payload.name) return fail('Name is required', 'VALIDATION');
      if (!payload.email) return fail('Email is required', 'VALIDATION');
      if (DB.employees.some(function (e) { return e.email === payload.email; }))
        return fail('An employee with this email already exists', 'DUPLICATE');
      var maxId = DB.employees.reduce(function (m, e) { return Math.max(m, e.id); }, 0);
      var emp = S.Shape.employee(Object.assign({ joinedAt: U.isoDate(new Date()) }, Object.assign({ id: maxId + 1 }, payload)));
      emp.score = payload.score || 0;
      emp.color = payload.color || emp.avatarBg;
      emp.canLogin = payload.canLogin !== false;
      var taken = DB.employees.map(function (x) { return x.username; }).filter(Boolean);
      emp.username = String(payload.username || U.usernameFrom(payload.name, taken)).toLowerCase().trim();
      if (!/^[a-z0-9._-]{3,30}$/.test(emp.username)) return fail('Username: 3\u201330 chars, letters/numbers/dots only', 'VALIDATION');
      if (taken.indexOf(emp.username) >= 0) return fail('Username "' + emp.username + '" is already taken', 'DUPLICATE');
      if (!payload.password || String(payload.password).length < 6) return fail('Password must be at least 6 characters', 'VALIDATION');
      emp.passHash = U.hashPass(String(payload.password));
      emp.mustChangePass = payload.mustChangePass !== false;    
      emp.address = payload.address || '';
      emp.monthlySalaryPaise = Math.max(0, Math.round(Number(payload.monthlySalaryPaise) || 0));
      emp.hoursPerDay = Math.min(16, Math.max(1, Number(payload.hoursPerDay) || 8));
      if (emp.monthlySalaryPaise > 0) emp.costPerHourPaise = U.hourlyCostFromSalary(emp.monthlySalaryPaise, emp.hoursPerDay);
      DB.employees.push(emp);
      logActivity('\uD83D\uDC64', '#EFF6FF', '<strong>' + U.esc(emp.name) + '</strong> added to the team');
      return ok(clone(emp));
    },
    updateEmployee: function (id, patch) {
      var e = findOr404(DB.employees, id);
      if (!e) return fail('Employee not found', 'NOT_FOUND');
      patch = patch || {};
      if (patch.username) {
        patch.username = String(patch.username).toLowerCase().trim();
        if (!/^[a-z0-9._-]{3,30}$/.test(patch.username)) return fail('Username: 3\u201330 chars, letters/numbers/dots only', 'VALIDATION');
        if (DB.employees.some(function (x) { return x.id !== e.id && x.username === patch.username; }))
          return fail('Username "' + patch.username + '" is already taken', 'DUPLICATE');
      }
      if (patch.password) {           // reset flow — hash it, never store plain
        if (String(patch.password).length < 6) return fail('Password must be at least 6 characters', 'VALIDATION');
        patch.passHash = U.hashPass(String(patch.password));
        patch.mustChangePass = patch.mustChangePass !== false;
        delete patch.password;
      }
      Object.assign(e, patch);
      if ((patch.monthlySalaryPaise !== undefined || patch.hoursPerDay !== undefined) && patch.costPerHourPaise === undefined) {
        e.monthlySalaryPaise = Math.max(0, Math.round(Number(e.monthlySalaryPaise) || 0));
        e.hoursPerDay = Math.min(16, Math.max(1, Number(e.hoursPerDay) || 8));
        if (e.monthlySalaryPaise > 0) e.costPerHourPaise = U.hourlyCostFromSalary(e.monthlySalaryPaise, e.hoursPerDay);
      }
      if (patch && patch.name) e.avatarInitials = S.initialsOf(patch.name);
      return ok(clone(e));
    },
    deleteEmployee: function (id) {
      var e = findOr404(DB.employees, id);
      if (!e) return fail('Employee not found', 'NOT_FOUND');
      var openWork = DB.deliverables.filter(function (d) {
        return (d.assigneeIds || []).indexOf(e.id) >= 0 && d.status !== 'DONE';
      });
      if (openWork.length)
        return fail(e.name + ' has ' + openWork.length + ' open deliverable(s). Reassign them first.', 'HAS_DEPENDENTS');
      DB.employees = DB.employees.filter(function (x) { return x.id !== e.id; });
      DB.projects.forEach(function (p) {
        p.memberIds = (p.memberIds || []).filter(function (m) { return m !== e.id; });
      });
      return ok(true);
    },

    /* ── departments ───────────────────────────────────────────────────── */
    getDepartments: function () { return list(DB.departments); },
    createDepartment: function (payload) {
      if (!payload || !payload.name) return fail('Department name is required', 'VALIDATION');
      if (DB.departments.some(function (d) { return d.name.toLowerCase() === payload.name.toLowerCase(); }))
        return fail('A department with this name already exists', 'DUPLICATE');
      var maxId = DB.departments.reduce(function (m, d) { return Math.max(m, d.id); }, 0);
      var dept = S.Shape.department(Object.assign({ id: maxId + 1 }, payload));
      DB.departments.push(dept);
      return ok(clone(dept));
    },
    updateDepartment: function (id, patch) {
      var d = findOr404(DB.departments, id);
      if (!d) return fail('Department not found', 'NOT_FOUND');
      Object.assign(d, patch || {});
      return ok(clone(d));
    },
    deleteDepartment: function (id) {
      var d = findOr404(DB.departments, id);
      if (!d) return fail('Department not found', 'NOT_FOUND');
      var members = DB.employees.filter(function (e) { return e.deptId === d.id; });
      if (members.length)
        return fail(d.name + ' has ' + members.length + ' member(s). Move them first.', 'HAS_DEPENDENTS');
      DB.departments = DB.departments.filter(function (x) { return x.id !== d.id; });
      return ok(true);
    },

    /* ── projects ──────────────────────────────────────────────────────── */
    getProjects: function () { return list(DB.projects); },
    getProject: function (id) {
      var p = findOr404(DB.projects, id);
      return p ? ok(clone(p)) : fail('Project not found', 'NOT_FOUND');
    },
    createProject: function (payload) {
      if (!payload || !payload.name) return fail('Project name is required', 'VALIDATION');
      if (!payload.clientName) return fail('Client name is required', 'VALIDATION');
      var maxId = DB.projects.reduce(function (m, p) { return Math.max(m, p.id); }, 0);
      var proj = S.Shape.project(Object.assign({ id: maxId + 1 }, payload));
      DB.projects.push(proj);
      logActivity('\uD83D\uDCC1', '#EFF6FF', 'Project <strong>' + U.esc(proj.name) + '</strong> created for ' + U.esc(proj.clientName));
      if (proj.autoInvoiceOnCreate) autoInvoice(proj, 'CREATE');
      return ok(clone(proj));
    },
    updateProject: function (id, patch) {
      var p = findOr404(DB.projects, id);
      if (!p) return fail('Project not found', 'NOT_FOUND');
      var wasDone = p.status === 'COMPLETED';
      Object.assign(p, patch || {});
      if (patch && patch.status) p.status = S.normProjectStatus(patch.status);
      if (!wasDone && p.status === 'COMPLETED') {
        p.completedAt = p.completedAt || new Date().toISOString();
        if (p.autoInvoiceOnComplete !== false) autoInvoice(p, 'COMPLETE');
      }
      return ok(clone(p));
    },
    deleteProject: function (id) {
      var p = findOr404(DB.projects, id);
      if (!p) return fail('Project not found', 'NOT_FOUND');
      var invs = DB.invoices.filter(function (i) { return i.projectId === p.id && i.status !== 'DRAFT'; });
      if (invs.length)
        return fail('This project has ' + invs.length + ' issued invoice(s) and cannot be deleted.', 'HAS_DEPENDENTS');
      var msIds = DB.milestones.filter(function (m) { return m.projectId === p.id; }).map(function (m) { return m.id; });
      var delIds = DB.deliverables.filter(function (d) { return d.projectId === p.id; }).map(function (d) { return d.id; });
      DB.subtasks     = DB.subtasks.filter(function (s) { return delIds.indexOf(s.deliverableId) < 0; });
      DB.deliverables = DB.deliverables.filter(function (d) { return d.projectId !== p.id; });
      DB.milestones   = DB.milestones.filter(function (m) { return msIds.indexOf(m.id) < 0; });
      DB.projects     = DB.projects.filter(function (x) { return x.id !== p.id; });
      return ok(true);
    },
    addProjectMember: function (projectId, employeeId) {
      var p = findOr404(DB.projects, projectId);
      if (!p) return fail('Project not found', 'NOT_FOUND');
      if (!p.memberIds) p.memberIds = [];
      if (p.memberIds.indexOf(employeeId) < 0) p.memberIds.push(employeeId);
      return ok(clone(p));
    },
    removeProjectMember: function (projectId, employeeId) {
      var p = findOr404(DB.projects, projectId);
      if (!p) return fail('Project not found', 'NOT_FOUND');
      var open = DB.deliverables.filter(function (d) {
        return d.projectId === p.id && d.status !== 'DONE' && (d.assigneeIds || []).indexOf(employeeId) >= 0;
      });
      if (open.length)
        return fail('This member has ' + open.length + ' open deliverable(s) on the project. Reassign first.', 'HAS_DEPENDENTS');
      p.memberIds = (p.memberIds || []).filter(function (m) { return m !== employeeId; });
      return ok(clone(p));
    },

    /* ── milestones ────────────────────────────────────────────────────── */
    getMilestones: function (projectId) {
      var rows = projectId == null ? DB.milestones
        : DB.milestones.filter(function (m) { return m.projectId === Number(projectId); });
      return list(rows);
    },
    createMilestone: function (payload) {
      if (!payload || !payload.title) return fail('Milestone title is required', 'VALIDATION');
      if (payload.projectId == null) return fail('Project is required', 'VALIDATION');
      var maxId = DB.milestones.reduce(function (m, x) { return Math.max(m, x.id); }, 1000);
      var ms = S.Shape.milestone(Object.assign({ id: maxId + 1 }, payload));
      DB.milestones.push(ms);
      logActivity('\uD83C\uDFAF', '#FFFBEB', 'Milestone <strong>' + U.esc(ms.title) + '</strong> created');
      return ok(clone(ms));
    },
    updateMilestone: function (id, patch) {
      var m = findOr404(DB.milestones, id);
      if (!m) return fail('Milestone not found', 'NOT_FOUND');
      patch = patch || {};
      if (patch.amountPaise != null) patch.amountPaise = Math.max(0, Math.round(Number(patch.amountPaise) || 0));
      if (patch.estimatedHours != null) patch.estimatedHours = Math.max(0, Number(patch.estimatedHours) || 0);
      if (patch.slabCutPct != null) patch.slabCutPct = Math.max(0, Math.min(50, Number(patch.slabCutPct) || 0));
      if (patch.floorPct != null) patch.floorPct = Math.max(0, Math.min(100, Number(patch.floorPct) || 0));
      if (patch.slabStepHours != null) patch.slabStepHours = Math.max(0.25, Number(patch.slabStepHours) || 1);
      if (patch.graceMinutes != null) patch.graceMinutes = Math.max(0, Number(patch.graceMinutes) || 0);
      Object.assign(m, patch);
      if (patch && patch.status) m.status = S.normMilestoneStatus(patch.status);
      return ok(clone(m));
    },
    /* Milestone pay: amount for the allotted hours, cut by % for each extra
       hour, shared between the people who worked on it (by their time). */
    milestonePay: function (id) {
      var m = findOr404(DB.milestones, id);
      return m ? msPayCalc(m) : null;
    },
    creditMilestonePay: function (id) {
      var m = findOr404(DB.milestones, id);
      if (!m) return fail('Milestone not found', 'NOT_FOUND');
      if (!m.payPaise) return fail('Set the milestone pay amount first', 'VALIDATION');
      if (m.paySettledAt) return fail('This milestone pay was already credited', 'INVALID_STATE');
      var calc = msPayCalc(m);
      if (!calc.shares.length) return fail('Nobody has logged time on this milestone yet', 'VALIDATION');
      if (!root.Wallet) return fail('Wallet is not available', 'NOT_CONFIGURED');
      var why = 'Milestone pay: ' + m.title + (calc.cutPct ? ' (' + calc.cutPct + '% less \u2014 ' + calc.overHours + ' h over)' : '');
      var chain = Promise.resolve();
      calc.shares.forEach(function (sh) {
        if (sh.amountPaise > 0) chain = chain.then(function () { return root.Wallet.addEntry(sh.employeeId, 'BONUS', sh.amountPaise, why, { projectId: m.projectId }); });
      });
      return chain.then(function () {
        m.paySettledAt = new Date().toISOString();
        m.paySettlement = calc;
        logActivity('\uD83D\uDCB0', '#ECFDF5', 'Milestone pay credited for <strong>' + U.esc(m.title) + '</strong> \u2014 ' + U.fmtRupee(calc.finalPaise));
        return ok(clone(calc));
      });
    },
    deleteMilestone: function (id) {
      var m = findOr404(DB.milestones, id);
      if (!m) return fail('Milestone not found', 'NOT_FOUND');
      var billed = DB.invoices.filter(function (i) { return i.milestoneId === m.id && i.status !== 'DRAFT'; });
      if (billed.length)
        return fail('This milestone has been invoiced and cannot be deleted.', 'HAS_DEPENDENTS');
      var delIds = DB.deliverables.filter(function (d) { return d.milestoneId === m.id; }).map(function (d) { return d.id; });
      DB.subtasks     = DB.subtasks.filter(function (s) { return delIds.indexOf(s.deliverableId) < 0; });
      DB.deliverables = DB.deliverables.filter(function (d) { return d.milestoneId !== m.id; });
      DB.milestones   = DB.milestones.filter(function (x) { return x.id !== m.id; });
      return ok(true);
    },

    /* ── deliverables ──────────────────────────────────────────────────── */
    getDeliverables: function (filter) {
      filter = filter || {};
      var rows = DB.deliverables.slice();
      if (filter.projectId != null)   rows = rows.filter(function (d) { return d.projectId === Number(filter.projectId); });
      if (filter.milestoneId != null) rows = rows.filter(function (d) { return d.milestoneId === Number(filter.milestoneId); });
      if (filter.assigneeId != null)  rows = rows.filter(function (d) { return (d.assigneeIds || []).indexOf(Number(filter.assigneeId)) >= 0; });
      if (filter.status)              rows = rows.filter(function (d) { return d.status === S.normStatus(filter.status); });
      if (filter.origin)              rows = rows.filter(function (d) { return d.origin === filter.origin; });
      return list(rows);
    },
    getDeliverable: function (id) {
      var d = findOr404(DB.deliverables, id);
      return d ? ok(clone(d)) : fail('Deliverable not found', 'NOT_FOUND');
    },
    createDeliverable: function (payload) {
      if (!payload || !payload.title) return fail('Title is required', 'VALIDATION');
      if (payload.projectId == null) return fail('Project is required', 'VALIDATION');
      if (!payload.assigneeIds || !payload.assigneeIds.length)
        return fail('At least one assignee is required', 'VALIDATION');
      if (!payload.dueAt) return fail('Deadline is required', 'VALIDATION');

      /* A milestone can define the default employee budget/time policy.
         Explicit task values always win, so existing workflows remain intact. */
      var milestone = payload.milestoneId != null
        ? findOr404(DB.milestones, payload.milestoneId)
        : null;
      var seeded = Object.assign({}, payload);
      if (milestone) {
        /* the milestone amount is SHARED by its tasks (it used to be given in
           full to every task, so two tasks cost twice the milestone) */
        var msPriced = milestone.amountPaise > 0 && seeded.pricePaise == null;
        if (msPriced) seeded.priceFromMilestone = true;
        if (seeded.estimateHours == null && seeded.estimateSecs == null && milestone.estimatedHours > 0) seeded.estimateHours = milestone.estimatedHours;
        if (seeded.pricingMode == null && milestone.amountPaise > 0) seeded.pricingMode = 'PIECE';
        if (!seeded.slab && milestone.amountPaise > 0) {
          seeded.slab = {
            cutPct: milestone.slabCutPct,
            floorPct: milestone.floorPct,
            stepSecs: Math.round(milestone.slabStepHours * 3600),
            graceSecs: Math.round(milestone.graceMinutes * 60)
          };
        }
      }
      var maxId = DB.deliverables.reduce(function (m, x) { return Math.max(m, Number(x.id) || 0); }, 5000);
      if (seeded.priceFromMilestone) seeded.pricePaise = 0;           // set just below, after the task exists
      var del = S.Shape.deliverable(Object.assign({ id: maxId + 1, createdAt: new Date().toISOString() }, seeded));
      del.priceFromMilestone = !!seeded.priceFromMilestone;
      if (!del.timeline.length) {
        var names = del.assigneeIds.map(function (i) {
          var e = findOr404(DB.employees, i); return e ? e.name : '?';
        }).join(', ');
        del.timeline.push({ type: 'assign', text: 'Assigned to ' + names, time: new Date().toISOString() });
      }
      DB.deliverables.push(del);
      if (del.priceFromMilestone && milestone) splitMilestoneAmount(milestone);
      /* Piece-rate fields + estimate agreement (shared/wallet.js) */
      if (root.Wallet) root.Wallet.onDeliverableCreated(del, seeded);
      var isPiece = del.pricingMode === 'PIECE' && del.pricePaise > 0;
      var showMoney = isPiece && DB.payPolicy && DB.payPolicy.showMoneyToEmployees;
      var share = isPiece ? Math.floor(del.pricePaise / del.assigneeIds.length) : 0;
      var agreed = isPiece && del.agreement && del.agreement.state === 'AGREED';
      del.assigneeIds.forEach(function (aid) {
        notify(aid, 'ASSIGNED',
          showMoney ? 'New work \u2014 ' + U.fmtRupee(share).replace('.00', '') + ' on delivery' : 'New task assigned',
          '"' + del.title + '"' + (isPiece
            ? ' \u00b7 agreed time ' + S.TIME.fmtShort(del.estimateSecs) +
              (showMoney ? ' earns the full ' + U.fmtRupee(share).replace('.00', '') : '') +
              (agreed ? '. Estimate auto-agreed (small task), you can start.' : '. Accept the estimate first or propose your own time.')
            : ''),
          'DELIVERABLE', del.id);
      });
      logActivity('\uD83D\uDCCB', '#EFF6FF', 'Deliverable <strong>' + U.esc(del.title) + '</strong> assigned');
      return ok(clone(del));
    },
    updateDeliverable: function (id, patch) {
      var d = findOr404(DB.deliverables, id);
      if (!d) return fail('Deliverable not found', 'NOT_FOUND');
      Object.assign(d, patch || {});
      if (patch && patch.status) d.status = S.normStatus(patch.status);
      if (patch && patch.priority) d.priority = S.normPriority(patch.priority);
      return ok(clone(d));
    },
    deleteDeliverable: function (id) {
      var d = findOr404(DB.deliverables, id);
      if (!d) return fail('Deliverable not found', 'NOT_FOUND');
      DB.subtasks = DB.subtasks.filter(function (s) { return s.deliverableId !== d.id; });
      DB.deliverables = DB.deliverables.filter(function (x) { return x.id !== d.id; });
      return ok(true);
    },

    /* Employee -> submit for review */
    submitDeliverable: function (id, opts) {
      opts = opts || {};
      var d = findOr404(DB.deliverables, id);
      if (!d) return fail('Deliverable not found', 'NOT_FOUND');
      if (!(d.submissionFiles || []).length && !String(opts.notes || d.submissionNotes || '').trim())
        return fail('Add files or notes before submitting', 'VALIDATION');
      d.status = 'IN_REVIEW';
      d.approvalState = 'PENDING';
      d.rejectionReason = null;
      if (opts.notes != null) d.submissionNotes = opts.notes;
      d.timeline.push({ type: 'submit', text: 'Submitted for review', time: new Date().toISOString() });
      notify(DB.adminUser.id, 'REVIEW', 'Deliverable submitted for review', '"' + d.title + '"', 'DELIVERABLE', d.id);
      logActivity('\uD83D\uDCE4', '#EFF6FF', 'Deliverable <strong>' + U.esc(d.title) + '</strong> submitted for review');
      return ok(clone(d));
    },

    /* Admin -> approve */
    approveDeliverable: function (id, note) {
      var d = findOr404(DB.deliverables, id);
      if (!d) return fail('Deliverable not found', 'NOT_FOUND');
      d.status = 'DONE';
      d.approvalState = 'APPROVED';
      d.rejectionReason = null;
      d.progressPct = 100;
      d.completedAt = new Date().toISOString();
      d.timeline.push({ type: 'approve', text: 'Approved by Admin' + (note ? ' — ' + note : ''), time: new Date().toISOString() });
      DB.timeEntries.filter(function (t) { return String(t.deliverableId) === String(d.id) && !t.endedAt; })
        .forEach(function (t) {
          t.endedAt = new Date().toISOString();
          d.loggedSecs = (d.loggedSecs || 0) + Math.max(0, Math.floor((new Date(t.endedAt) - new Date(t.startedAt)) / 1000));
        });
      (d.assigneeIds || []).forEach(function (aid) {
        notify(aid, 'APPROVED', 'Task approved', '"' + d.title + '"', 'DELIVERABLE', d.id);
      });
      /* Piece-rate: wallet credit + slab (shared/wallet.js). Idempotent. */
      if (root.Wallet) root.Wallet.settleOnApprove(d);
      if (!d.costSnapshot) {
        var _secs = d.loggedSecs || 0;
        if (d.pricingMode === 'PIECE' && d.settlement) {
          d.costSnapshot = { mode: 'PIECE', secs: _secs, costPaise: d.settlement.finalPaise, ratePaise: null, at: new Date().toISOString() };
        } else {
          var _rates = (d.assigneeIds || []).map(function (aid) {
            var e2 = DB.employees.find(function (x) { return x.id === aid; });
            return e2 ? (e2.costPerHourPaise || 0) : 0;
          });
          var _avg = _rates.length ? Math.round(_rates.reduce(function (a2, b2) { return a2 + b2; }, 0) / _rates.length) : 0;
          d.costSnapshot = { mode: 'HOURLY', secs: _secs, ratePaise: _avg, costPaise: Math.round(_secs / 3600 * _avg), at: new Date().toISOString() };
        }
      }
      logActivity('\u2705', '#ECFDF5', 'Deliverable <strong>' + U.esc(d.title) + '</strong> approved');

      /* Milestone auto-complete */
      if (d.milestoneId) {
        var siblings = DB.deliverables.filter(function (x) { return x.milestoneId === d.milestoneId; });
        if (siblings.length && siblings.every(function (x) { return x.status === 'DONE'; })) {
          var ms = findOr404(DB.milestones, d.milestoneId);
          if (ms && ms.status !== 'DONE') {
            ms.status = 'DONE';
            logActivity('\uD83C\uDF89', '#ECFDF5', 'Milestone <strong>' + U.esc(ms.title) + '</strong> completed');
            notify(DB.adminUser.id, 'INFO', 'Milestone complete', '"' + ms.title + '" — ready to invoice', 'MILESTONE', ms.id);
          }
        }
      }
      autoCompleteProject(d.projectId);
      return ok(clone(d));
    },

    rejectDeliverable: function (id, reason) {
      var d = findOr404(DB.deliverables, id);
      if (!d) return fail('Deliverable not found', 'NOT_FOUND');
      if (!String(reason || '').trim()) return fail('A rejection reason is required', 'VALIDATION');
      d.status = 'REJECTED';
      d.approvalState = 'REJECTED';
      d.rejectionReason = String(reason).trim();
      d.timeline.push({ type: 'reject', text: 'Returned for revision — ' + d.rejectionReason, time: new Date().toISOString() });
      if (root.Wallet) root.Wallet.onDeliverableRejected(d);
      (d.assigneeIds || []).forEach(function (aid) {
        notify(aid, 'REJECTED', 'Task returned for revision', '"' + d.title + '" — tap to see reason', 'DELIVERABLE', d.id);
      });
      logActivity('\u2715', '#FEF2F2', 'Deliverable <strong>' + U.esc(d.title) + '</strong> returned for revision');
      return ok(clone(d));
    },

    reassignDeliverable: function (id, assigneeIds) {
      var d = findOr404(DB.deliverables, id);
      if (!d) return fail('Deliverable not found', 'NOT_FOUND');
      if (!assigneeIds || !assigneeIds.length) return fail('At least one assignee is required', 'VALIDATION');
      d.assigneeIds = assigneeIds.slice();
      var names = assigneeIds.map(function (i) { var e = findOr404(DB.employees, i); return e ? e.name : '?'; }).join(', ');
      d.timeline.push({ type: 'assign', text: 'Reassigned to ' + names, time: new Date().toISOString() });
      assigneeIds.forEach(function (aid) {
        notify(aid, 'ASSIGNED', 'Task assigned to you', '"' + d.title + '"', 'DELIVERABLE', d.id);
      });
      return ok(clone(d));
    },

    addDeliverableComment: function (id, fromId, text) {
      var d = findOr404(DB.deliverables, id);
      if (!d) return fail('Deliverable not found', 'NOT_FOUND');
      if (!String(text || '').trim()) return fail('Message cannot be empty', 'VALIDATION');
      if (!d.comments) d.comments = [];
      d.comments.push({ fromId: fromId, text: String(text).trim(), time: new Date().toISOString() });
      return ok(clone(d));
    },

    addDeliverableFiles: function (id, files, which) {
      var d = findOr404(DB.deliverables, id);
      if (!d) return fail('Deliverable not found', 'NOT_FOUND');
      var target = which === 'brief' ? 'briefFiles' : 'submissionFiles';
      if (!d[target]) d[target] = [];
      (files || []).forEach(function (f) { d[target].push(S.normFile(f)); });
      return ok(clone(d));
    },
    removeDeliverableFile: function (id, index, which) {
      var d = findOr404(DB.deliverables, id);
      if (!d) return fail('Deliverable not found', 'NOT_FOUND');
      var target = which === 'brief' ? 'briefFiles' : 'submissionFiles';
      (d[target] || []).splice(index, 1);
      return ok(clone(d));
    },

    /* ── subtasks ──────────────────────────────────────────────────────── */
    getSubtasks: function (deliverableId) {
      var rows = deliverableId == null ? DB.subtasks
        : DB.subtasks.filter(function (s) { return String(s.deliverableId) === String(deliverableId); });
      return list(rows);
    },
    createSubtask: function (payload) {
      if (!payload || !payload.title) return fail('Task title is required', 'VALIDATION');
      if (payload.deliverableId == null) return fail('Deliverable is required', 'VALIDATION');
      var maxId = DB.subtasks.reduce(function (m, x) { return Math.max(m, Number(x.id) || 0); }, 6000);
      var st = S.Shape.subtask(Object.assign({ id: maxId + 1, createdAt: new Date().toISOString() }, payload));
      DB.subtasks.push(st);
      return ok(clone(st));
    },
    updateSubtask: function (id, patch) {
      var s = findOr404(DB.subtasks, id);
      if (!s) return fail('Task not found', 'NOT_FOUND');
      Object.assign(s, patch || {});
      if (patch && patch.status) {
        s.status = S.normStatus(patch.status);
        if (s.status === 'DONE' && !s.completedAt) s.completedAt = new Date().toISOString();
        if (s.status !== 'DONE') s.completedAt = null;
      }
      return ok(clone(s));
    },
    approveSubtask: function (id) {
      var s = findOr404(DB.subtasks, id);
      if (!s) return fail('Task not found', 'NOT_FOUND');
      s.status = 'DONE'; s.approvalState = 'APPROVED'; s.rejectionReason = null;
      s.completedAt = new Date().toISOString();
      if (!s.timeline) s.timeline = [];
      s.timeline.push({ type: 'approve', text: 'Approved by Admin', time: new Date().toISOString() });
      notify(s.assigneeId, 'APPROVED', 'Task approved', '"' + s.title + '"', 'SUBTASK', s.id);
      return ok(clone(s));
    },
    rejectSubtask: function (id, reason) {
      var s = findOr404(DB.subtasks, id);
      if (!s) return fail('Task not found', 'NOT_FOUND');
      if (!String(reason || '').trim()) return fail('A rejection reason is required', 'VALIDATION');
      s.status = 'REJECTED'; s.approvalState = 'REJECTED';
      s.rejectionReason = String(reason).trim(); s.completedAt = null;
      if (!s.timeline) s.timeline = [];
      s.timeline.push({ type: 'reject', text: 'Returned — ' + s.rejectionReason, time: new Date().toISOString() });
      notify(s.assigneeId, 'REJECTED', 'Task returned for revision', '"' + s.title + '"', 'SUBTASK', s.id);
      return ok(clone(s));
    },
    deleteSubtask: function (id) {
      var s = findOr404(DB.subtasks, id);
      if (!s) return fail('Task not found', 'NOT_FOUND');
      DB.subtasks = DB.subtasks.filter(function (x) { return x.id !== s.id; });
      return ok(true);
    },

    /* ── time tracking ─────────────────────────────────────────────────── */
    startTimer: function (employeeId, deliverableId) {
      if (root.Wallet) {
        var chk = root.Wallet.canStart(employeeId, deliverableId);
        if (!chk.ok) return fail(chk.reason, chk.code);
      }
      /* Already running on this same task (e.g. the app reopened after a power
         cut) → keep that timer, don't lose its time. */
      var running = DB.timeEntries.find(function (t) {
        return t.employeeId === employeeId && !t.endedAt && Number(t.deliverableId) === Number(deliverableId);
      });
      if (running) return ok(clone(running));
      /* A timer on another task → stop it properly so its time is counted
         (it used to be closed without adding the time to the task). */
      DataAPI.stopTimer(employeeId);

      var entry = S.Shape.timeEntry({
        id: U.newId('te'), employeeId: employeeId, deliverableId: deliverableId,
        startedAt: new Date().toISOString(), source: 'TIMER'
      });
      DB.timeEntries.push(entry);

      var d = findOr404(DB.deliverables, deliverableId);
      if (d && d.status === 'TODO') {
        d.status = 'IN_PROGRESS';
        d.timeline.push({ type: 'start', text: 'Work started', time: entry.startedAt });
      }
      return ok(clone(entry));
    },
    stopTimer: function (employeeId) {
      var open = DB.timeEntries.filter(function (t) { return t.employeeId === employeeId && !t.endedAt; });
      var now = new Date().toISOString();
      open.forEach(function (t) {
        t.endedAt = now;
        var secs = Math.max(0, Math.floor((new Date(t.endedAt) - new Date(t.startedAt)) / 1000));
        var d = findOr404(DB.deliverables, t.deliverableId);
        if (d) {
          d.loggedSecs = (d.loggedSecs || 0) + secs;
          if (d.pricingMode === 'PIECE' && root.Wallet && root.Wallet.slabPreview) {
            d.liveSettlement = root.Wallet.slabPreview(d, d.loggedSecs);
          }
        }
        var today = U.isoDate(new Date());
        var att = DB.attendance.find(function (a) { return a.employeeId === employeeId && a.date === today; });
        if (att) {
          att.activeSecs += secs;
          att.perDeliverableSecs[t.deliverableId] = (att.perDeliverableSecs[t.deliverableId] || 0) + secs;
        }
      });
      return ok(open.length);
    },
    getOpenTimer: function (employeeId) {
      var t = DB.timeEntries.find(function (x) { return x.employeeId === employeeId && !x.endedAt; });
      return ok(t ? clone(t) : null);
    },

    /* ── attendance ────────────────────────────────────────────────────── */
    getAttendance: function (filter) {
      filter = filter || {};
      var rows = DB.attendance.slice();
      if (filter.employeeId != null) rows = rows.filter(function (a) { return a.employeeId === Number(filter.employeeId); });
      if (filter.date) rows = rows.filter(function (a) { return a.date === filter.date; });
      rows.sort(function (a, b) { return a.date < b.date ? 1 : -1; });
      return list(rows);
    },
    ensureTodayAttendance: function (employeeId) {
      /* Explicit check-in endpoint. Merely logging into the employee portal
         must never mark attendance as present. */
      var today = U.isoDate(new Date());
      var a = DB.attendance.find(function (x) { return x.employeeId === employeeId && x.date === today; });
      if (!a) {
        a = S.Shape.attendanceDay({
          id: 'att_' + employeeId + '_' + today, employeeId: employeeId, date: today,
          status: 'PRESENT', firstInAt: new Date().toISOString(), lastSeenAt: new Date().toISOString()
        });
        DB.attendance.unshift(a);
      } else {
        if (!a.firstInAt) a.firstInAt = new Date().toISOString();
        a.lastOutAt = null; a.lastSeenAt = new Date().toISOString(); a.status = 'PRESENT';
      }
      return ok(clone(a));
    },
    updateAttendance: function (id, patch) {
      var a = findOr404(DB.attendance, id);
      if (!a) return fail('Attendance record not found', 'NOT_FOUND');
      Object.assign(a, patch || {});
      return ok(clone(a));
    },
    addBreak: function (employeeId, brk) {
      var today = U.isoDate(new Date());
      var a = DB.attendance.find(function (x) { return x.employeeId === employeeId && x.date === today; });
      if (!a) return fail('No attendance record for today', 'NOT_FOUND');
      a.breaks.push(brk);
      return ok(clone(a));
    },

    /* ── invoices ──────────────────────────────────────────────────────── */
    getInvoices: function (filter) {
      filter = filter || {};
      var rows = DB.invoices.slice();
      if (filter.projectId != null) rows = rows.filter(function (i) { return i.projectId === Number(filter.projectId); });
      if (filter.status) rows = rows.filter(function (i) { return i.status === S.normInvoiceStatus(filter.status); });
      return list(rows);
    },
    peekInvoiceNumber: function () { return ok(invCounter().peek()); },
    createInvoice: function (payload) {
      var r = buildInvoice(payload);
      if (r.error) return fail(r.error, 'VALIDATION');
      return ok(clone(r.invoice));
    },

    /* ── recurring invoices (retainers, monthly fees, AMC …) ─────────────
       A plan makes a new invoice every week / month / quarter / year.
       The server checks every morning; creating a plan whose start date is
       today (or earlier) makes the first invoice straight away. */
    getRecurringInvoices: function () { return list(recurList()); },
    createRecurringInvoice: function (plan) {
      plan = plan || {};
      var err = checkPlan(plan);
      if (err) return fail(err, 'VALIDATION');
      var p = {
        id: U.newId('rec'),
        name: String(plan.name || plan.clientName).trim().slice(0, 120),
        clientName: String(plan.clientName).trim(), clientEmail: String(plan.clientEmail || '').trim(),
        clientGstin: plan.clientGstin || '', placeOfSupply: plan.placeOfSupply || '',
        projectId: plan.projectId != null && plan.projectId !== '' ? Number(plan.projectId) : null,
        subject: String(plan.subject || '').slice(0, 200),
        lines: plan.lines, notes: String(plan.notes || ''),
        frequency: String(plan.frequency).toUpperCase(),
        startDate: plan.startDate || U.isoDate(new Date()),
        endDate: plan.endDate || null,
        maxCount: plan.maxCount ? Math.max(1, Math.floor(Number(plan.maxCount))) : null,
        dueInDays: plan.dueInDays != null && plan.dueInDays !== '' ? Math.max(0, Math.floor(Number(plan.dueInDays))) : 15,
        autoSend: !!plan.autoSend,
        active: true, status: 'ACTIVE', count: 0,
        nextDate: plan.startDate || U.isoDate(new Date()),
        lastInvoiceId: null, invoiceIds: [],
        createdAt: new Date().toISOString()
      };
      recurList().unshift(p);
      var made = runRecurring(U.isoDate(new Date()), p.id);
      logActivity('\uD83D\uDD01', '#EFF6FF', 'Recurring invoice <strong>' + U.esc(p.name) + '</strong> set up \u2014 ' + p.frequency.toLowerCase());
      var out = clone(p); out.created = made;
      return ok(out);
    },
    updateRecurringInvoice: function (id, patch) {
      var p = findOr404(recurList(), id);
      if (!p) return fail('Recurring invoice not found', 'NOT_FOUND');
      patch = patch || {};
      var next = Object.assign({}, p, patch);
      var err = checkPlan(next);
      if (err) return fail(err, 'VALIDATION');
      ['name', 'clientName', 'clientEmail', 'clientGstin', 'placeOfSupply', 'subject', 'lines', 'notes', 'endDate', 'maxCount', 'dueInDays', 'autoSend', 'nextDate'].forEach(function (k) {
        if (patch[k] !== undefined) p[k] = patch[k];
      });
      if (patch.frequency) p.frequency = String(patch.frequency).toUpperCase();
      if (patch.active !== undefined && p.status !== 'COMPLETED') { p.active = !!patch.active; p.status = p.active ? 'ACTIVE' : 'PAUSED'; }
      return ok(clone(p));
    },
    deleteRecurringInvoice: function (id) {
      var L = recurList(), i = L.findIndex(function (x) { return String(x.id) === String(id); });
      if (i < 0) return fail('Recurring invoice not found', 'NOT_FOUND');
      L.splice(i, 1);                                // invoices already made stay
      return ok(true);
    },
    /* server job: make every invoice that is due up to `today` */
    runRecurringInvoices: function (today) {
      return ok(runRecurring(today || U.isoDate(new Date())));
    },
    updateInvoice: function (id, patch) {
      var i = findOr404(DB.invoices, id);
      if (!i) return fail('Invoice not found', 'NOT_FOUND');
      if (i.status !== 'DRAFT' && patch && (patch.lines || patch.subtotalPaise != null))
        return fail('An issued invoice cannot be edited. Cancel it and raise a new one.', 'IMMUTABLE');
      Object.assign(i, patch || {});
      return ok(clone(i));
    },
    sendInvoice: function (id) {
      var i = findOr404(DB.invoices, id);
      if (!i) return fail('Invoice not found', 'NOT_FOUND');
      if (!i.clientEmail) return fail('Client email is required before sending', 'VALIDATION');
      if (i.status === 'CANCELLED') return fail('A cancelled invoice cannot be sent', 'INVALID_STATE');
      if (i.status === 'PAID') return fail('This invoice is already fully paid', 'INVALID_STATE');
      /* sending again (a reminder) keeps a part-paid invoice part-paid */
      if (i.status !== 'PARTIALLY_PAID') i.status = 'SENT';
      i.sentAt = i.sentAt || new Date().toISOString();
      i.lastSentAt = new Date().toISOString();
      logActivity('\uD83D\uDCE7', '#EFF6FF', 'Invoice <strong>' + U.esc(i.number) + '</strong> sent to ' + U.esc(i.clientName));
      return ok(clone(i));
    },
    /* meta (optional): { date: 'YYYY-MM-DD', method: 'UPI'|'Bank transfer'|…, reference, note }
       Every payment is kept in i.payments so the invoice shows a real history. */
    recordPayment: function (id, amountPaise, meta) {
      var i = findOr404(DB.invoices, id);
      if (!i) return fail('Invoice not found', 'NOT_FOUND');
      /* A draft that the client paid (e.g. invoice shared on WhatsApp or by hand)
         becomes issued automatically — no need to email it first. */
      if (i.status === 'DRAFT') {
        i.status = 'SENT';
        i.sentAt = i.sentAt || new Date().toISOString();
        i.issuedWithoutEmail = true;
      }
      if (i.status === 'CANCELLED') return fail('This invoice is cancelled', 'INVALID_STATE');
      if (i.status === 'PAID') return fail('This invoice is already fully paid', 'INVALID_STATE');
      var amt = Math.round(Number(amountPaise) || 0);
      if (amt <= 0) return fail('Payment amount must be greater than zero', 'VALIDATION');
      var balance = (i.totalPaise || 0) - (i.paidPaise || 0);
      if (amt > balance)
        return fail('Payment is more than the balance due (' + U.fmtRupee(balance) + ')', 'VALIDATION');
      meta = meta || {};
      var date = meta.date && /^\d{4}-\d{2}-\d{2}$/.test(meta.date) ? meta.date : U.isoDate(new Date());
      if (date > U.isoDate(new Date())) return fail('Payment date cannot be in the future', 'VALIDATION');
      i.payments = i.payments || [];
      i.payments.push({
        id: U.newId('pay'), amountPaise: amt, date: date,
        method: String(meta.method || 'Bank transfer').slice(0, 40),
        reference: String(meta.reference || '').slice(0, 80),
        note: String(meta.note || '').slice(0, 300),
        recordedAt: new Date().toISOString()
      });
      i.paidPaise = (i.paidPaise || 0) + amt;
      i.status = i.paidPaise >= i.totalPaise ? 'PAID' : 'PARTIALLY_PAID';
      if (i.status === 'PAID') i.paidAt = date;
      logActivity('\uD83D\uDCB0', '#ECFDF5', 'Payment of ' + U.fmtRupee(amt) + ' recorded on <strong>' + U.esc(i.number) + '</strong>');
      return ok(clone(i));
    },
    cancelInvoice: function (id, reason) {
      var i = findOr404(DB.invoices, id);
      if (!i) return fail('Invoice not found', 'NOT_FOUND');
      if (i.paidPaise > 0) return fail('A paid invoice cannot be cancelled. Issue a credit note instead.', 'IMMUTABLE');
      if (i.status === 'CANCELLED') return fail('This invoice is already cancelled', 'INVALID_STATE');
      i.status = 'CANCELLED';
      i.cancelledAt = new Date().toISOString();
      i.notes = (i.notes ? i.notes + ' | ' : '') + 'Cancelled: ' + (reason || 'no reason given');
      return ok(clone(i));
    },
    deleteInvoice: function (id) {
      var i = findOr404(DB.invoices, id);
      if (!i) return fail('Invoice not found', 'NOT_FOUND');
      if (i.status !== 'DRAFT')
        return fail('Only draft invoices can be deleted. Cancel this invoice instead.', 'IMMUTABLE');
      DB.invoices = DB.invoices.filter(function (x) { return x.id !== i.id; });
      return ok(true);
    },
    getUninvoicedMilestones: function () {
      var out = [];
      DB.milestones.forEach(function (m) {
        if (m.status !== 'DONE' || !m.billable) return;
        var billed = DB.invoices.some(function (i) { return i.milestoneId === m.id && i.status !== 'CANCELLED'; });
        if (!billed) {
          var p = findOr404(DB.projects, m.projectId);
          out.push({ milestone: clone(m), project: p ? clone(p) : null });
        }
      });
      return ok(out);
    },


    /* ── notices ───────────────────────────────────────────────────────── */
    /* employeeId given → only notices sent to that employee (employee app) */
    getNotices: function (employeeId) {
      if (employeeId != null) {
        var id = Number(employeeId);
        return list(DB.notices.filter(function (n) {
          if (String(n.status).toUpperCase() !== 'SENT') return false;
          var reads = (n.readBy || []).map(Number), unread = (n.notReadBy || []).map(Number);
          var targets = reads.concat(unread);
          if (targets.indexOf(id) >= 0) return true;
          if (n.recipients === 'all') return true;
          return Array.isArray(n.recipients) && n.recipients.map(Number).indexOf(id) >= 0;
        }));
      }
      return list(DB.notices);
    },
    createNotice: function (payload) {
      if (!payload || !payload.title) return fail('Notice title is required', 'VALIDATION');
      if (!String(payload.content || '').trim()) return fail('Notice content cannot be empty', 'VALIDATION');
      var notice = {
        id: U.newId('nt'),
        title: payload.title,
        content: U.sanitizeHtml(payload.content),      // XSS — sanitize on write
        date: U.isoDate(new Date()),
        recipients: payload.recipients || 'all',
        priority: payload.priority || 'Normal',
        status: payload.status || 'Draft',
        readBy: [], notReadBy: [],
        attachments: payload.attachments || []
      };
      if (notice.status === 'Sent') notice.notReadBy = recipientIds(notice.recipients);
      DB.notices.unshift(notice);
      return ok(clone(notice));
    },
    updateNotice: function (id, patch) {
      var n = findOr404(DB.notices, id);
      if (!n) return fail('Notice not found', 'NOT_FOUND');
      if (patch && patch.content) patch.content = U.sanitizeHtml(patch.content);
      Object.assign(n, patch || {});
      return ok(clone(n));
    },
    sendNotice: function (id) {
      var n = findOr404(DB.notices, id);
      if (!n) return fail('Notice not found', 'NOT_FOUND');
      n.status = 'Sent';
      n.date = U.isoDate(new Date());
      var targets = recipientIds(n.recipients);
      n.notReadBy = targets.filter(function (t) { return (n.readBy || []).indexOf(t) < 0; });
      targets.forEach(function (t) {
        notify(t, 'INFO', 'New notice', n.title, 'NOTICE', n.id);
      });
      logActivity('\uD83D\uDCE2', '#FFFBEB', 'Notice <strong>' + U.esc(n.title) + '</strong> sent to ' + targets.length + ' people');
      return ok(clone(n));
    },
    markNoticeRead: function (id, employeeId) {
      var n = findOr404(DB.notices, id);
      if (!n) return fail('Notice not found', 'NOT_FOUND');
      if ((n.readBy || []).indexOf(employeeId) < 0) n.readBy.push(employeeId);
      employeeId = Number(employeeId);
      n.notReadBy = (n.notReadBy || []).filter(function (x) { return Number(x) !== employeeId; });
      return ok(clone(n));
    },
    deleteNotice: function (id) {
      DB.notices = DB.notices.filter(function (x) { return String(x.id) !== String(id); });
      return ok(true);
    },

    /* ── conversations ─────────────────────────────────────────────────── */
    /* withId given → only that employee's chat (the employee app uses this) */
    getConversations: function (withId) {
      if (withId == null) return list(DB.conversations);
      return list(DB.conversations.filter(function (c) { return Number(c.withId) === Number(withId); }));
    },
    sendMessage: function (conversationId, fromId, text) {
      var c = findOr404(DB.conversations, conversationId);
      if (!c) return fail('Conversation not found', 'NOT_FOUND');
      if (!String(text || '').trim()) return fail('Message cannot be empty', 'VALIDATION');
      c.msgs.push({ fromId: fromId, text: String(text).trim(), at: new Date().toISOString() });
      /* unread = for the admin, empUnread = for the employee */
      var fromAdmin = Number(fromId) === Number(DB.adminUser.id);
      var preview = String(text).trim().slice(0, 120);
      if (fromAdmin) {
        c.empUnread = (c.empUnread || 0) + 1;
        notify(c.withId, 'MESSAGE', 'New message from ' + (DB.adminUser.name || 'Admin'), preview, 'CONVERSATION', c.id);
      } else {
        c.unread = (c.unread || 0) + 1;
        var who = DB.employees.find(function (e) { return e.id === Number(c.withId); });
        notify(DB.adminUser.id, 'MESSAGE', 'New message from ' + (who ? who.name : 'an employee'), preview, 'CONVERSATION', c.id);
      }
      return ok(clone(c));
    },
    /* Admin opens a chat with an employee: reuse the existing one or start a new one */
    startConversation: function (withId) {
      var emp = findOr404(DB.employees, withId);
      if (!emp) return fail('Employee not found', 'NOT_FOUND');
      var c = DB.conversations.find(function (x) { return Number(x.withId) === emp.id; });
      if (!c) {
        c = { id: U.newId('conv'), withId: emp.id, unread: 0, msgs: [] };
        DB.conversations.unshift(c);
      }
      return ok(clone(c));
    },
    /* side: 'EMPLOYEE' clears the employee's unread count, otherwise the admin's */
    markConversationRead: function (conversationId, side) {
      var c = findOr404(DB.conversations, conversationId);
      if (c) { if (side === 'EMPLOYEE') c.empUnread = 0; else c.unread = 0; }
      return ok(c ? clone(c) : null);
    },

    /* ── calendar ──────────────────────────────────────────────────────── */
    getCalendarEvents: function () { return list(DB.calendarEvents); },
    createCalendarEvent: function (payload) {
      if (!payload || !payload.title) return fail('Event title is required', 'VALIDATION');
      if (!payload.date) return fail('Event date is required', 'VALIDATION');
      var ev = Object.assign({ id: U.newId('ev'), color: '#2563EB', type: 'Meeting' }, payload);
      DB.calendarEvents.push(ev);
      return ok(clone(ev));
    },
    deleteCalendarEvent: function (id) {
      DB.calendarEvents = DB.calendarEvents.filter(function (x) { return String(x.id) !== String(id); });
      return ok(true);
    },

    /* ── notifications ─────────────────────────────────────────────────── */
    getNotifications: function (recipientId) {
      var rows = recipientId == null ? DB.notifications
        : DB.notifications.filter(function (n) { return n.recipientId === recipientId; });
      return list(rows);
    },
    markNotificationRead: function (id) {
      var n = DB.notifications.find(function (x) { return String(x.id) === String(id); });
      if (n) n.read = true;
      return ok(n ? clone(n) : null);
    },
    markAllNotificationsRead: function (recipientId) {
      DB.notifications.forEach(function (n) {
        if (recipientId == null || n.recipientId === recipientId) n.read = true;
      });
      return ok(true);
    },

    /* ── activity / call logs ──────────────────────────────────────────── */
    getActivity: function () { return list(DB.activity); },
    getCallLogs: function () { return list(DB.callLogs); },

    getRevenueSeries: function (monthsBack) {
      monthsBack = monthsBack || 6;
      var now = new Date(), buckets = [];
      for (var i = monthsBack - 1; i >= 0; i--) {
        var dt = new Date(now.getFullYear(), now.getMonth() - i, 1);
        buckets.push({
          key: dt.getFullYear() + '-' + dt.getMonth(),
          label: dt.toLocaleDateString('en-IN', { month: 'short' }),
          billedPaise: 0, receivedPaise: 0
        });
      }
      DB.invoices.forEach(function (inv) {
        if (inv.status === 'CANCELLED' || inv.status === 'DRAFT') return;
        var dt = new Date(inv.issueDate);
        if (isNaN(dt)) return;
        var b = buckets.find(function (x) { return x.key === dt.getFullYear() + '-' + dt.getMonth(); });
        if (!b) return;
        b.billedPaise += inv.totalPaise;
        b.receivedPaise += inv.paidPaise;
      });
      return ok(buckets);
    },
    getKpis: function () {
      var invs = DB.invoices.filter(function (i) { return i.status !== 'CANCELLED'; });
      var billed = invs.reduce(function (s, i) { return s + i.totalPaise; }, 0);
      var received = invs.reduce(function (s, i) { return s + i.paidPaise; }, 0);
      var overdue = invs.filter(function (i) { return i.status === 'OVERDUE'; })
                        .reduce(function (s, i) { return s + (i.totalPaise - i.paidPaise); }, 0);
      var today = U.isoDate(new Date());
      var todayRows = DB.attendance.filter(function (a) { return a.date === today; });
      var present = todayRows.filter(function (a) { return a.status === 'PRESENT'; }).length;
      var onLeave = todayRows.filter(function (a) { return a.status === 'ON_LEAVE'; }).length;
      var allDel = DB.deliverables;
      var doneDel = allDel.filter(function (d) { return d.status === 'DONE'; }).length;
      var lateDel = allDel.filter(function (d) {
        return d.status !== 'DONE' && d.dueAt && Utils.isoDate(d.dueAt) < today;
      }).length;
      return ok({
        billedPaise: billed, receivedPaise: received, overduePaise: overdue,
        collectionPct: billed > 0 ? Math.round(received / billed * 100) : 0,
        activeProjects: DB.projects.filter(function (p) { return p.status === 'ACTIVE'; }).length,
        totalProjects: DB.projects.length,
        presentToday: present, onLeaveToday: onLeave, totalEmployees: DB.employees.length,
        attendancePct: DB.employees.length ? Math.round(present / DB.employees.length * 100) : 0,
        deliveredCount: doneDel,
        lateCount: lateDel,
        onTimePct: allDel.length ? Math.round((allDel.length - lateDel) / allDel.length * 100) : 100,
        openDeliverables: DB.deliverables.filter(function (d) { return d.status !== 'DONE'; }).length,
        pendingReview: DB.deliverables.filter(function (d) { return d.status === 'IN_REVIEW'; }).length
      });
    },

    /* ── derived helpers ───────────────────────────────────────────────── */
    /* Progress of one deliverable, 0–100, from real work:
         done 100 · in review 90 · started: time logged against the estimate
         (and finished sub-tasks), between 5 and 85 · not started 0.
       A running timer counts too, so the bar moves while someone works. */
    deliverableProgress: function (dOrId) {
      var d = typeof dOrId === 'object' ? dOrId : (DB.deliverables || []).find(function (x) { return String(x.id) === String(dOrId); });
      if (!d) return 0;
      if (d.status === 'DONE') return 100;
      if (d.status === 'IN_REVIEW') return 90;
      var logged = d.loggedSecs || 0;
      (DB.timeEntries || []).forEach(function (t) {
        if (String(t.deliverableId) === String(d.id) && !t.endedAt && t.startedAt) logged += Math.max(0, (Date.now() - Date.parse(t.startedAt)) / 1000);
      });
      var subs = (DB.subtasks || []).filter(function (s) { return String(s.deliverableId) === String(d.id); });
      var subPct = subs.length ? subs.filter(function (s) { return s.status === 'DONE'; }).length / subs.length * 85 : 0;
      var timePct = d.estimateSecs > 0 ? Math.min(1, logged / d.estimateSecs) * 85 : (logged > 0 ? 30 : 0);
      var started = logged > 0 || d.status === 'IN_PROGRESS' || d.status === 'REJECTED' || subPct > 0;
      if (!started) return Math.max(0, Math.min(85, d.progressPct || 0));
      return Math.round(Math.max(5, timePct, subPct, Math.min(85, d.progressPct || 0)));
    },
    /* Project progress: every deliverable's progress, weighted by its
       estimated hours (bigger tasks count more). Projects without
       deliverables use their milestones' status. */
    projectProgress: function (projectId) {
      var pid = Number(projectId);
      var ds = DB.deliverables.filter(function (d) { return d.projectId === pid; });
      if (ds.length) {
        var w = 0, sum = 0;
        ds.forEach(function (d) {
          var wt = d.estimateSecs > 0 ? d.estimateSecs : 3600;
          w += wt; sum += wt * DataAPI.deliverableProgress(d);
        });
        return Math.round(sum / w);
      }
      var ms = DB.milestones.filter(function (m) { return m.projectId === pid; });
      if (!ms.length) return 0;
      return Math.round(ms.reduce(function (s, m) {
        return s + (m.status === 'DONE' ? 100 : m.status === 'IN_PROGRESS' ? 25 : 0);
      }, 0) / ms.length);
    },
    /* done/total = finished deliverables; pct = real progress of its work */
    milestoneProgress: function (milestoneId) {
      var ds = DB.deliverables.filter(function (d) { return d.milestoneId === Number(milestoneId); });
      if (!ds.length) return { done: 0, total: 0, pct: 0 };
      var done = ds.filter(function (d) { return d.status === 'DONE'; }).length;
      var w = 0, sum = 0;
      ds.forEach(function (d) { var wt = d.estimateSecs > 0 ? d.estimateSecs : 3600; w += wt; sum += wt * DataAPI.deliverableProgress(d); });
      return { done: done, total: ds.length, pct: Math.round(sum / w) };
    },
    employeeScore: function (employeeId) {
      /* Score 0–100 from four REAL signals. A part with no data yet is left
         out and its weight goes to the others — nobody gets free points for
         having no work, and nobody is punished just for being new.
           Delivery   35%  share of assigned work actually finished
                           (partial credit: in review 80%, in progress 40%)
           On time    25%  tasks finished by their due date; open tasks that
                           are already past due count as late
           Accuracy   15%  time taken vs the agreed estimate
           Attendance 25%  days present in the last 30 working days
                           (weekly offs, holidays and approved leave excluded)
         Minus 3 points for every time work was sent back (max 15). */
      var id = Number(employeeId);
      var emp = findOr404(DB.employees, id);
      var ds = (DB.deliverables || []).filter(function (d) { return (d.assigneeIds || []).indexOf(id) >= 0; });
      var finished = ds.filter(function (d) { return d.status === 'DONE'; });
      var parts = [];

      var delivery = null;
      if (ds.length) {
        var credit = ds.reduce(function (s, d) {
          if (d.status === 'DONE') return s + 1;
          if (d.status === 'IN_REVIEW') return s + 0.8;
          if (d.status === 'IN_PROGRESS') return s + 0.4;
          if (d.status === 'REJECTED') return s + 0.2;
          return s;                                        // TODO — not started yet
        }, 0);
        delivery = Math.round(credit / ds.length * 100);
        parts.push([delivery, 35]);
      }

      var doneAt = function (d) {
        if (d.completedAt) return d.completedAt;
        var a = (d.timeline || []).filter(function (t) { return t.type === 'approve'; }).pop();
        return a ? a.time : null;
      };
      var now = Date.now();
      var dueRows = ds.filter(function (d) {
        return d.dueAt && (d.status === 'DONE' || new Date(d.dueAt).getTime() < now);
      });
      var onTime = null;
      if (dueRows.length) {
        onTime = Math.round(dueRows.filter(function (d) {
          if (d.status !== 'DONE') return false;           // still open and already late
          var t = doneAt(d);
          return !t || new Date(t) <= new Date(d.dueAt);
        }).length / dueRows.length * 100);
        parts.push([onTime, 25]);
      }

      var estRows = finished.filter(function (d) { return d.estimateSecs > 0 && d.loggedSecs > 0; });
      var accuracy = null;
      if (estRows.length) {
        accuracy = Math.round(estRows.reduce(function (s, d) {
          var ratio = d.loggedSecs / d.estimateSecs;
          return s + Math.max(0, 100 - Math.abs(1 - ratio) * 100);
        }, 0) / estRows.length);
        parts.push([accuracy, 15]);
      }

      var weekOff = (DB.hrPolicy && DB.hrPolicy.weekOff) || [0, 6];
      var hol = {};
      (DB.holidays || []).forEach(function (h) { if (!h.optional) hol[h.date] = true; });
      var leaves = (DB.leaveRequests || []).filter(function (r) { return r.employeeId === id && r.status === 'APPROVED'; });
      var onLeave = function (iso) {
        return leaves.some(function (r) { return (r.dates || []).indexOf(iso) >= 0 || (r.fromDate <= iso && r.toDate >= iso); });
      };
      var recs = {};
      (DB.attendance || []).forEach(function (a) { if (a.employeeId === id) recs[a.date] = a; });
      var today = U.isoDate(new Date());
      var joined = emp && emp.joinedAt ? U.isoDate(emp.joinedAt) : null;
      var workDays = 0, presentDays = 0;
      for (var i = 0; i < 30; i++) {
        var dt = new Date(); dt.setDate(dt.getDate() - i);
        var iso = U.isoDate(dt);
        if (joined && iso < joined) break;
        var r = recs[iso];
        var came = !!(r && (r.status === 'PRESENT' || r.status === 'HALF_DAY' || r.firstInAt));
        if (iso === today && !came) continue;                // today isn't over yet
        if (weekOff.indexOf(dt.getDay()) >= 0 || hol[iso] || onLeave(iso) || (r && r.status === 'ON_LEAVE')) continue;
        workDays++;
        if (came) presentDays += (r.status === 'HALF_DAY' ? 0.5 : 1);
      }
      var attendance = null;
      if (workDays) {
        attendance = Math.round(presentDays / workDays * 100);
        parts.push([attendance, 25]);
      }

      var rejected = ds.reduce(function (s, d) {
        return s + Math.max(d.reworkCount || 0, d.approvalState === 'REJECTED' ? 1 : 0);
      }, 0);

      if (!parts.length) {
        return { score: 0, delivery: null, onTime: null, accuracy: null, attendance: null,
                 presentDays: 0, workDays: 0, sample: 0, tasks: 0, rejected: 0, confident: false };
      }
      var wSum = parts.reduce(function (s, p) { return s + p[1]; }, 0);
      var raw = parts.reduce(function (s, p) { return s + p[0] * p[1]; }, 0) / wSum;
      var score = Math.round(raw - Math.min(15, rejected * 3));

      return {
        score: Math.max(0, Math.min(100, score)),
        delivery: delivery, onTime: onTime, accuracy: accuracy, attendance: attendance,
        presentDays: presentDays, workDays: workDays,
        sample: ds.length + workDays, tasks: ds.length, rejected: rejected,
        confident: ds.length >= 3 && workDays >= 10
      };
    }
  };

  function recipientIds(recipients) {
    if (!recipients || recipients === 'all') return DB.employees.map(function (e) { return e.id; });
    if (String(recipients).indexOf('dept:') === 0) {
      var name = String(recipients).slice(5);
      var dept = DB.departments.find(function (d) { return d.name === name; });
      if (!dept) return [];
      return DB.employees.filter(function (e) { return e.deptId === dept.id; }).map(function (e) { return e.id; });
    }
    return [];
  }

  root.DataAPI = DataAPI;
  if (typeof module !== 'undefined' && module.exports) module.exports = DataAPI;

})(typeof window !== 'undefined' ? window : globalThis);