
(function (root) {
  'use strict';

  var U = root.Utils, S = root.Schema, DataAPI = root.DataAPI;

  /* ── Leave types — Indian SMB ka standard set ────────────────────────── */
  var LEAVE_TYPES = {
    CL:  { key:'CL',  label:'Casual Leave',    annual:12, paid:true,  color:'#2563EB', carryForward:false },
    SL:  { key:'SL',  label:'Sick Leave',      annual:12, paid:true,  color:'#D97706', carryForward:false },
    EL:  { key:'EL',  label:'Earned Leave',    annual:15, paid:true,  color:'#059669', carryForward:true  },
    COMP:{ key:'COMP',label:'Comp Off',        annual:0,  paid:true,  color:'#7C3AED', carryForward:false },
    LOP: { key:'LOP', label:'Loss of Pay',     annual:0,  paid:false, color:'#DC2626', carryForward:false }
  };

  var LEAVE_STATUS = {
    PENDING:   { key:'PENDING',   label:'Pending',   tone:'amber' },
    APPROVED:  { key:'APPROVED',  label:'Approved',  tone:'green' },
    REJECTED:  { key:'REJECTED',  label:'Rejected',  tone:'red'   },
    CANCELLED: { key:'CANCELLED', label:'Cancelled', tone:'grey'  }
  };

  var HALF = { FULL:'FULL', FIRST_HALF:'FIRST_HALF', SECOND_HALF:'SECOND_HALF' };

  /* ── Ensure HRM collections exist on the DB ──────────────────────────── */
  function ensure() {
    var DB = DataAPI.raw();
    if (!DB) return null;
    if (!DB.leaveRequests)  DB.leaveRequests = [];
    if (!DB.leaveBalances)  DB.leaveBalances = seedBalances(DB);
    if (!DB.holidays)       DB.holidays = seedHolidays();
    if (!DB.regularisations) DB.regularisations = [];
    if (!DB.hrPolicy) DB.hrPolicy = {
      shiftStart: '09:30',
      shiftEnd: '18:30',
      graceMinutes: 15,           
      fullDaySecs: 8 * 3600,
      halfDaySecs: 4 * 3600,
      weekOff: [0, 6],           // Sun, Sat
      minLeaveNoticeDays: 1,
      maxConsecutiveCL: 3
    };
    return DB;
  }

  function seedBalances(DB) {
    var year = new Date().getFullYear();
    var out = [];
    DB.employees.forEach(function (e) {
      Object.keys(LEAVE_TYPES).forEach(function (t) {
        var type = LEAVE_TYPES[t];
        if (!type.annual) return;           
        var joined = new Date(e.joinedAt || (year + '-01-01'));
        var monthsThisYear = joined.getFullYear() >= year
          ? Math.max(0, 12 - joined.getMonth())
          : 12;
        var entitled = Math.round(type.annual * monthsThisYear / 12 * 2) / 2;
        out.push({
          id: 'bal_' + e.id + '_' + t + '_' + year,
          employeeId: e.id, type: t, year: year,
          entitled: entitled, used: 0, pending: 0
        });
      });
      out.push({
        id: 'bal_' + e.id + '_COMP_' + year,
        employeeId: e.id, type: 'COMP', year: year,
        entitled: 0, used: 0, pending: 0
      });
    });
    return out;
  }

  function seedHolidays() {
    var y = new Date().getFullYear();
    return [
      { id:'h1', date: y + '-01-26', name:'Republic Day',      optional:false },
      { id:'h2', date: y + '-03-14', name:'Holi',              optional:false },
      { id:'h3', date: y + '-08-15', name:'Independence Day',  optional:false },
      { id:'h4', date: y + '-10-02', name:'Gandhi Jayanti',    optional:false },
      { id:'h5', date: y + '-10-20', name:'Diwali',            optional:false },
      { id:'h6', date: y + '-10-21', name:'Govardhan Puja',    optional:true  },
      { id:'h7', date: y + '-12-25', name:'Christmas',         optional:false }
    ];
  }

  /* ── Helpers ─────────────────────────────────────────────────────────── */
  function ok(v) {
    if (DataAPI.touch) DataAPI.touch();
    if (DataAPI.flush) DataAPI.flush();
    return Promise.resolve(v);
  }
  function fail(msg, code) {
    var e = new Error(msg); e.code = code || 'ERROR';
    return Promise.reject(e);
  }
  function clone(x) { return JSON.parse(JSON.stringify(x)); }

  function isWeekOff(dateIso, DB) {
    return DB.hrPolicy.weekOff.indexOf(new Date(dateIso + 'T00:00:00').getDay()) >= 0;
  }
  function isHoliday(dateIso, DB) {
    return DB.holidays.some(function (h) { return h.date === dateIso && !h.optional; });
  }
  function holidayOn(dateIso, DB) {
    return DB.holidays.find(function (h) { return h.date === dateIso; }) || null;
  }

  function workingDaysBetween(fromIso, toIso, DB) {
    var days = [];
    var d = new Date(fromIso + 'T00:00:00');
    var end = new Date(toIso + 'T00:00:00');
    if (end < d) return days;
    var guard = 0;
    while (d <= end && guard++ < 400) {
      var iso = U.isoDate(d);
      if (!isWeekOff(iso, DB) && !isHoliday(iso, DB)) days.push(iso);
      d.setDate(d.getDate() + 1);
    }
    return days;
  }

  function balanceOf(DB, employeeId, type) {
    var year = new Date().getFullYear();
    return DB.leaveBalances.find(function (b) {
      return b.employeeId === employeeId && b.type === type && b.year === year;
    });
  }

  function dayFlags(att, DB) {
    var flags = [];
    if (!att || att.status === 'ABSENT') return flags;

    if (att.firstInAt) {
      var inT = new Date(att.firstInAt);
      var parts = DB.hrPolicy.shiftStart.split(':');
      var shift = new Date(inT); shift.setHours(+parts[0], +parts[1], 0, 0);
      var lateMins = Math.round((inT - shift) / 60000);
      if (lateMins > DB.hrPolicy.graceMinutes) flags.push({ type:'LATE', mins: lateMins });
    }
    if (att.activeSecs > 0 && att.activeSecs < DB.hrPolicy.halfDaySecs) {
      flags.push({ type:'SHORT', secs: DB.hrPolicy.fullDaySecs - att.activeSecs });
    } else if (att.activeSecs >= DB.hrPolicy.halfDaySecs && att.activeSecs < DB.hrPolicy.fullDaySecs - 1800) {
      flags.push({ type:'UNDER', secs: DB.hrPolicy.fullDaySecs - att.activeSecs });
    }
    if (att.activeSecs > DB.hrPolicy.fullDaySecs + 5400) {
      flags.push({ type:'OVERTIME', secs: att.activeSecs - DB.hrPolicy.fullDaySecs });
    }
    if (!att.lastOutAt && att.date !== U.isoDate(new Date())) {
      flags.push({ type:'MISSING_PUNCH' });
    }
    return flags;
  }

  /* ==========================================================================
     PUBLIC API
     ========================================================================== */
  var HRM = {

    LEAVE_TYPES: LEAVE_TYPES,
    LEAVE_STATUS: LEAVE_STATUS,
    HALF: HALF,

    init: function () { ensure(); return ok(true); },

    getPolicy: function () { return ok(clone(ensure().hrPolicy)); },
    updatePolicy: function (patch) {
      var DB = ensure();
      Object.assign(DB.hrPolicy, patch || {});
      return ok(clone(DB.hrPolicy));
    },

    /* ── Holidays ──────────────────────────────────────────────────────── */
    getHolidays: function () { return ok(clone(ensure().holidays)); },
    addHoliday: function (payload) {
      var DB = ensure();
      if (!payload || !payload.date) return fail('Date is required', 'VALIDATION');
      if (!payload.name) return fail('Holiday name is required', 'VALIDATION');
      if (DB.holidays.some(function (h) { return h.date === payload.date; }))
        return fail('A holiday already exists on this date', 'DUPLICATE');
      var h = { id: U.newId('hol'), date: payload.date, name: payload.name, optional: !!payload.optional };
      DB.holidays.push(h);
      DB.holidays.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
      return ok(clone(h));
    },
    deleteHoliday: function (id) {
      var DB = ensure();
      DB.holidays = DB.holidays.filter(function (h) { return String(h.id) !== String(id); });
      return ok(true);
    },

    /* ── Balances ──────────────────────────────────────────────────────── */
    getBalances: function (employeeId) {
      var DB = ensure();
      var rows = employeeId == null ? DB.leaveBalances
        : DB.leaveBalances.filter(function (b) { return b.employeeId === Number(employeeId); });
      return ok(clone(rows));
    },
    creditCompOff: function (employeeId, days, reason) {
      var DB = ensure();
      var bal = balanceOf(DB, employeeId, 'COMP');
      if (!bal) return fail('No comp-off balance record', 'NOT_FOUND');
      bal.entitled += Number(days) || 0;
      return ok(clone(bal));
    },

    /* ── Leave requests ────────────────────────────────────────────────── */
    getLeaveRequests: function (filter) {
      var DB = ensure();
      filter = filter || {};
      var rows = DB.leaveRequests.slice();
      if (filter.employeeId != null) rows = rows.filter(function (r) { return r.employeeId === Number(filter.employeeId); });
      if (filter.status) rows = rows.filter(function (r) { return r.status === filter.status; });
      rows.sort(function (a, b) { return a.fromDate < b.fromDate ? 1 : -1; });
      return ok(clone(rows));
    },

    applyLeave: function (payload) {
      var DB = ensure();
      if (!payload) return fail('Leave details required', 'VALIDATION');
      var empId = Number(payload.employeeId);
      var emp = DB.employees.find(function (e) { return e.id === empId; });
      if (!emp) return fail('Employee not found', 'NOT_FOUND');
      if (!LEAVE_TYPES[payload.type]) return fail('Pick a valid leave type', 'VALIDATION');
      if (!payload.fromDate || !payload.toDate) return fail('From and to dates are required', 'VALIDATION');
      if (payload.toDate < payload.fromDate) return fail('End date cannot be before start date', 'VALIDATION');
      if (!String(payload.reason || '').trim()) return fail('A reason is required', 'VALIDATION');

      var days = workingDaysBetween(payload.fromDate, payload.toDate, DB);
      if (!days.length) return fail('Selected range has no working days', 'VALIDATION');

      var half = payload.halfDay || HALF.FULL;
      var count = half === HALF.FULL ? days.length : 0.5;
      if (half !== HALF.FULL && days.length > 1)
        return fail('Half day applies to a single date only', 'VALIDATION');

      var clash = DB.leaveRequests.find(function (r) {
        return r.employeeId === empId &&
          (r.status === 'PENDING' || r.status === 'APPROVED') &&
          !(r.toDate < payload.fromDate || r.fromDate > payload.toDate);
      });
      if (clash) return fail('You already have a ' + LEAVE_STATUS[clash.status].label.toLowerCase() +
        ' request overlapping these dates', 'CONFLICT');

      if (payload.type !== 'LOP') {
        var bal = balanceOf(DB, empId, payload.type);
        var available = bal ? bal.entitled - bal.used - bal.pending : 0;
        if (available < count) {
          return fail('Only ' + available + ' ' + LEAVE_TYPES[payload.type].label +
            ' day(s) left — apply as Loss of Pay instead', 'INSUFFICIENT_BALANCE');
        }
        if (bal) bal.pending += count;
      }

      var todayIso = U.isoDate(new Date());
      if (payload.fromDate < todayIso && payload.type !== 'SL' && payload.type !== 'LOP') {
        return fail('Backdated leave is only allowed for Sick Leave. Raise a regularisation instead.', 'VALIDATION');
      }

      var approverId = emp.managerId || DB.adminUser.id;
      var req = {
        id: U.newId('lv'),
        employeeId: empId,
        type: payload.type,
        fromDate: payload.fromDate,
        toDate: payload.toDate,
        halfDay: half,
        days: count,
        dates: days,
        reason: String(payload.reason).trim(),
        status: 'PENDING',
        approverId: approverId,
        decisionNote: null,
        appliedAt: new Date().toISOString(),
        decidedAt: null
      };
      DB.leaveRequests.unshift(req);

      DB.notifications.unshift({
        id: U.newId('n'), recipientId: approverId, kind: 'REVIEW',
        title: 'Leave request', body: emp.name + ' \u2014 ' + LEAVE_TYPES[payload.type].label +
          ', ' + count + ' day(s) from ' + payload.fromDate,
        entityType: 'LEAVE', entityId: req.id, read: false, createdAt: new Date().toISOString()
      });
      DB.activity.unshift({
        icon: '\uD83C\uDFD6\uFE0F', color: '#EFF6FF',
        text: '<strong>' + U.esc(emp.name) + '</strong> applied for ' + count + ' day(s) ' +
              LEAVE_TYPES[payload.type].label,
        at: new Date().toISOString()
      });

      return ok(clone(req));
    },

    approveLeave: function (id, note) {
      var DB = ensure();
      var req = DB.leaveRequests.find(function (r) { return String(r.id) === String(id); });
      if (!req) return fail('Leave request not found', 'NOT_FOUND');
      if (req.status !== 'PENDING') return fail('This request has already been ' +
        LEAVE_STATUS[req.status].label.toLowerCase(), 'INVALID_STATE');

      req.status = 'APPROVED';
      req.decisionNote = note || null;
      req.decidedAt = new Date().toISOString();

      if (req.type !== 'LOP') {
        var bal = balanceOf(DB, req.employeeId, req.type);
        if (bal) { bal.pending = Math.max(0, bal.pending - req.days); bal.used += req.days; }
      }

      req.dates.forEach(function (dateIso) {
        var att = DB.attendance.find(function (a) {
          return a.employeeId === req.employeeId && a.date === dateIso;
        });
        var status = req.halfDay === HALF.FULL ? 'ON_LEAVE' : 'HALF_DAY';
        if (att) {
          att.status = status;
          att.leaveRequestId = req.id;
          att.leaveType = req.type;
        } else {
          DB.attendance.unshift({
            id: 'att_' + req.employeeId + '_' + dateIso,
            employeeId: req.employeeId, date: dateIso, status: status,
            firstInAt: null, lastOutAt: null,
            sessionSecs: 0, activeSecs: 0, idleSecs: 0,
            breaks: [], perDeliverableSecs: {},
            leaveRequestId: req.id, leaveType: req.type
          });
        }
      });

      var emp = DB.employees.find(function (e) { return e.id === req.employeeId; });
      DB.notifications.unshift({
        id: U.newId('n'), recipientId: req.employeeId, kind: 'APPROVED',
        title: 'Leave approved', body: LEAVE_TYPES[req.type].label + ' from ' + req.fromDate,
        entityType: 'LEAVE', entityId: req.id, read: false, createdAt: new Date().toISOString()
      });
      DB.activity.unshift({
        icon: '\u2705', color: '#ECFDF5',
        text: 'Leave approved for <strong>' + U.esc(emp ? emp.name : '') + '</strong>',
        at: new Date().toISOString()
      });

      return ok(clone(req));
    },

    rejectLeave: function (id, reason) {
      var DB = ensure();
      var req = DB.leaveRequests.find(function (r) { return String(r.id) === String(id); });
      if (!req) return fail('Leave request not found', 'NOT_FOUND');
      if (req.status !== 'PENDING') return fail('This request has already been decided', 'INVALID_STATE');
      if (!String(reason || '').trim()) return fail('A reason is required when rejecting leave', 'VALIDATION');

      req.status = 'REJECTED';
      req.decisionNote = String(reason).trim();
      req.decidedAt = new Date().toISOString();

      if (req.type !== 'LOP') {
        var bal = balanceOf(DB, req.employeeId, req.type);
        if (bal) bal.pending = Math.max(0, bal.pending - req.days);
      }

      DB.notifications.unshift({
        id: U.newId('n'), recipientId: req.employeeId, kind: 'REJECTED',
        title: 'Leave request declined', body: req.decisionNote,
        entityType: 'LEAVE', entityId: req.id, read: false, createdAt: new Date().toISOString()
      });
      return ok(clone(req));
    },

    cancelLeave: function (id) {
      var DB = ensure();
      var req = DB.leaveRequests.find(function (r) { return String(r.id) === String(id); });
      if (!req) return fail('Leave request not found', 'NOT_FOUND');
      if (req.status === 'REJECTED' || req.status === 'CANCELLED')
        return fail('Nothing to cancel', 'INVALID_STATE');
      if (req.status === 'APPROVED' && req.fromDate < U.isoDate(new Date()))
        return fail('Leave that has already started cannot be cancelled', 'INVALID_STATE');

      var wasApproved = req.status === 'APPROVED';
      req.status = 'CANCELLED';
      req.decidedAt = new Date().toISOString();

      if (req.type !== 'LOP') {
        var bal = balanceOf(DB, req.employeeId, req.type);
        if (bal) {
          if (wasApproved) bal.used = Math.max(0, bal.used - req.days);
          else bal.pending = Math.max(0, bal.pending - req.days);
        }
      }
      if (wasApproved) {
        req.dates.forEach(function (dateIso) {
          var att = DB.attendance.find(function (a) {
            return a.employeeId === req.employeeId && a.date === dateIso;
          });
          if (att && att.leaveRequestId === req.id) {
            att.status = 'ABSENT'; att.leaveRequestId = null; att.leaveType = null;
          }
        });
      }
      return ok(clone(req));
    },

    getRegularisations: function (filter) {
      var DB = ensure();
      filter = filter || {};
      var rows = DB.regularisations.slice();
      if (filter.employeeId != null) rows = rows.filter(function (r) { return r.employeeId === Number(filter.employeeId); });
      if (filter.status) rows = rows.filter(function (r) { return r.status === filter.status; });
      return ok(clone(rows));
    },

    requestRegularisation: function (payload) {
      var DB = ensure();
      if (!payload || !payload.date) return fail('Date is required', 'VALIDATION');
      if (!String(payload.reason || '').trim()) return fail('A reason is required', 'VALIDATION');
      var empId = Number(payload.employeeId);
      var emp = DB.employees.find(function (e) { return e.id === empId; });
      if (!emp) return fail('Employee not found', 'NOT_FOUND');
      if (payload.date > U.isoDate(new Date())) return fail('Cannot regularise a future date', 'VALIDATION');

      var dup = DB.regularisations.find(function (r) {
        return r.employeeId === empId && r.date === payload.date && r.status === 'PENDING';
      });
      if (dup) return fail('A request for this date is already pending', 'CONFLICT');

      var req = {
        id: U.newId('reg'),
        employeeId: empId,
        date: payload.date,
        proposedInAt: payload.inTime || null,     // 'HH:MM'
        proposedOutAt: payload.outTime || null,
        reason: String(payload.reason).trim(),
        status: 'PENDING',
        approverId: emp.managerId || DB.adminUser.id,
        decisionNote: null,
        appliedAt: new Date().toISOString()
      };
      DB.regularisations.unshift(req);
      DB.notifications.unshift({
        id: U.newId('n'), recipientId: req.approverId, kind: 'REVIEW',
        title: 'Attendance regularisation', body: emp.name + ' \u2014 ' + payload.date,
        entityType: 'REGULARISATION', entityId: req.id, read: false, createdAt: new Date().toISOString()
      });
      return ok(clone(req));
    },

    approveRegularisation: function (id) {
      var DB = ensure();
      var req = DB.regularisations.find(function (r) { return String(r.id) === String(id); });
      if (!req) return fail('Request not found', 'NOT_FOUND');
      if (req.status !== 'PENDING') return fail('Already decided', 'INVALID_STATE');
      req.status = 'APPROVED';
      req.decidedAt = new Date().toISOString();

      var att = DB.attendance.find(function (a) {
        return a.employeeId === req.employeeId && a.date === req.date;
      });
      if (!att) {
        att = {
          id: 'att_' + req.employeeId + '_' + req.date,
          employeeId: req.employeeId, date: req.date, status: 'PRESENT',
          firstInAt: null, lastOutAt: null, sessionSecs: 0, activeSecs: 0,
          idleSecs: 0, breaks: [], perDeliverableSecs: {}
        };
        DB.attendance.unshift(att);
      }
      if (req.proposedInAt)  att.firstInAt = req.date + 'T' + req.proposedInAt + ':00';
      if (req.proposedOutAt) att.lastOutAt = req.date + 'T' + req.proposedOutAt + ':00';
      if (att.firstInAt && att.lastOutAt) {
        var secs = Math.max(0, Math.round((new Date(att.lastOutAt) - new Date(att.firstInAt)) / 1000));
        att.sessionSecs = secs;
        att.activeSecs = Math.max(att.activeSecs, Math.round(secs * 0.85));
        att.status = att.activeSecs >= DB.hrPolicy.fullDaySecs * 0.5 ? 'PRESENT' : 'HALF_DAY';
      }
      att.regularised = true;
      att.regularisationId = req.id;

      DB.notifications.unshift({
        id: U.newId('n'), recipientId: req.employeeId, kind: 'APPROVED',
        title: 'Attendance regularised', body: req.date + ' updated',
        entityType: 'REGULARISATION', entityId: req.id, read: false, createdAt: new Date().toISOString()
      });
      return ok(clone(req));
    },

    rejectRegularisation: function (id, reason) {
      var DB = ensure();
      var req = DB.regularisations.find(function (r) { return String(r.id) === String(id); });
      if (!req) return fail('Request not found', 'NOT_FOUND');
      if (req.status !== 'PENDING') return fail('Already decided', 'INVALID_STATE');
      if (!String(reason || '').trim()) return fail('A reason is required', 'VALIDATION');
      req.status = 'REJECTED';
      req.decisionNote = String(reason).trim();
      req.decidedAt = new Date().toISOString();
      DB.notifications.unshift({
        id: U.newId('n'), recipientId: req.employeeId, kind: 'REJECTED',
        title: 'Regularisation declined', body: req.decisionNote,
        entityType: 'REGULARISATION', entityId: req.id, read: false, createdAt: new Date().toISOString()
      });
      return ok(clone(req));
    },

    /* ── Today board — live team status ────────────────────────────────── */
    getTodayBoard: function () {
      var DB = ensure();
      var today = U.isoDate(new Date());
      var openTimers = {};
      DB.timeEntries.forEach(function (t) { if (!t.endedAt) openTimers[t.employeeId] = t; });

      var rows = DB.employees.map(function (e) {
        var att = DB.attendance.find(function (a) { return a.employeeId === e.id && a.date === today; });
        var leave = DB.leaveRequests.find(function (r) {
          return r.employeeId === e.id && r.status === 'APPROVED' &&
                 r.fromDate <= today && r.toDate >= today;
        });
        var timer = openTimers[e.id];
        var del = timer ? DB.deliverables.find(function (d) { return d.id === timer.deliverableId; }) : null;

        /* "Working" / "Checked in" only while the employee app is really open
           (a heartbeat in the last 3 minutes). A timer left running after a
           power cut, or a check-in from the morning, no longer counts. */
        var seen = att && att.lastSeenAt ? Date.parse(att.lastSeenAt) : 0;
        var live = !!(att && att.firstInAt && !att.lastOutAt && seen && Date.now() - seen < 3 * 60 * 1000);
        var state = leave ? 'ON_LEAVE'
          : live && timer ? 'WORKING'
          : live ? 'IN_OFFICE'
          : att && att.firstInAt && !att.lastOutAt ? 'AWAY'
          : att && att.firstInAt ? 'CHECKED_OUT'
          : 'NOT_IN';
        if (state !== 'WORKING') { timer = null; del = null; }

        return {
          employeeId: e.id, name: e.name, role: e.role,
          avatarInitials: e.avatarInitials, avatarBg: e.avatarBg, avatarFg: e.avatarFg,
          state: state,
          leaveType: leave ? leave.type : null,
          firstInAt: att ? att.firstInAt : null,
          lastSeenAt: att ? att.lastSeenAt || null : null,
          activeSecs: att ? att.activeSecs : 0,
          workingOn: del ? del.title : null,
          flags: dayFlags(att, DB)
        };
      });

      var order = { WORKING:0, IN_OFFICE:1, AWAY:2, CHECKED_OUT:3, ON_LEAVE:4, NOT_IN:5 };
      rows.sort(function (a, b) { return order[a.state] - order[b.state]; });

      return ok({
        date: today,
        holiday: holidayOn(today, DB),
        isWeekOff: isWeekOff(today, DB),
        rows: rows,
        summary: {
          working: rows.filter(function (r) { return r.state === 'WORKING'; }).length,
          inOffice: rows.filter(function (r) { return r.state === 'IN_OFFICE'; }).length,
          onLeave: rows.filter(function (r) { return r.state === 'ON_LEAVE'; }).length,
          notIn: rows.filter(function (r) { return r.state === 'NOT_IN'; }).length,
          late: rows.filter(function (r) { return r.flags.some(function (f) { return f.type === 'LATE'; }); }).length,
          total: rows.length
        }
      });
    },

    /* ── Monthly register — employees × days grid ──────────────────────── */
    getRegister: function (year, month) {
      var DB = ensure();
      var y = year != null ? year : new Date().getFullYear();
      var m = month != null ? month : new Date().getMonth();
      var daysInMonth = new Date(y, m + 1, 0).getDate();
      var todayIso = U.isoDate(new Date());

      var dayMeta = [];
      for (var d = 1; d <= daysInMonth; d++) {
        var iso = U.isoDate(new Date(y, m, d));
        dayMeta.push({
          date: iso, day: d,
          weekday: new Date(y, m, d).toLocaleDateString('en-IN', { weekday: 'short' }),
          weekOff: isWeekOff(iso, DB),
          holiday: holidayOn(iso, DB),
          future: iso > todayIso
        });
      }

      var rows = DB.employees.map(function (e) {
        var cells = dayMeta.map(function (dm) {
          if (dm.future) return { date: dm.date, code: '', label: 'Upcoming' };
          if (dm.holiday && !dm.holiday.optional) return { date: dm.date, code: 'H', label: dm.holiday.name };
          if (dm.weekOff) return { date: dm.date, code: 'W', label: 'Week off' };
          var att = DB.attendance.find(function (a) { return a.employeeId === e.id && a.date === dm.date; });
          if (!att) return { date: dm.date, code: 'A', label: 'Absent' };
          if (att.status === 'ON_LEAVE') return { date: dm.date, code: att.leaveType || 'L', label: 'On leave' };
          if (att.status === 'ABSENT') return { date: dm.date, code: 'A', label: 'Absent' };
          if (att.status === 'HALF_DAY') return { date: dm.date, code: 'HD', label: 'Half day \u00b7 ' + U.fmtRupee ? '' : '' , hours: att.activeSecs };
          var flags = dayFlags(att, DB);
          return {
            date: dm.date, code: 'P',
            label: 'Present',
            hours: att.activeSecs,
            late: flags.some(function (f) { return f.type === 'LATE'; }),
            missingPunch: flags.some(function (f) { return f.type === 'MISSING_PUNCH'; })
          };
        });

        var present = cells.filter(function (c) { return c.code === 'P'; }).length;
        var half    = cells.filter(function (c) { return c.code === 'HD'; }).length;
        var absent  = cells.filter(function (c) { return c.code === 'A'; }).length;
        var leave   = cells.filter(function (c) { return ['CL','SL','EL','COMP','LOP','L'].indexOf(c.code) >= 0; }).length;
        var lateCnt = cells.filter(function (c) { return c.late; }).length;
        var totalSecs = cells.reduce(function (s, c) { return s + (c.hours || 0); }, 0);
        var workingDays = dayMeta.filter(function (dm) {
          return !dm.weekOff && !(dm.holiday && !dm.holiday.optional) && !dm.future;
        }).length;

        return {
          employeeId: e.id, name: e.name, avatarInitials: e.avatarInitials,
          avatarBg: e.avatarBg, avatarFg: e.avatarFg,
          cells: cells,
          summary: {
            present: present, halfDay: half, absent: absent, leave: leave, late: lateCnt,
            payableDays: present + half * 0.5 + leave,
            workingDays: workingDays,
            totalSecs: totalSecs,
            avgSecs: present ? Math.round(totalSecs / present) : 0,
            attendancePct: workingDays ? Math.round((present + half * 0.5 + leave) / workingDays * 100) : 0
          }
        };
      });

      return ok({ year: y, month: m, days: dayMeta, rows: rows });
    },

    /* ── Timesheet — kis project pe kitna time, billable vs not ────────── */
    getTimesheet: function (employeeId, fromIso, toIso) {
      var DB = ensure();
      var from = fromIso || U.isoDate(U.daysFromNow(-30));
      var to   = toIso || U.isoDate(new Date());

      var atts = DB.attendance.filter(function (a) {
        return (employeeId == null || a.employeeId === Number(employeeId)) &&
               a.date >= from && a.date <= to;
      });

      var byProject = {};
      var totalTracked = 0, unassigned = 0;

      atts.forEach(function (a) {
        Object.keys(a.perDeliverableSecs || {}).forEach(function (delId) {
          var secs = a.perDeliverableSecs[delId];
          totalTracked += secs;
          var del = DB.deliverables.find(function (d) { return String(d.id) === String(delId); });
          if (!del) { unassigned += secs; return; }
          var proj = DB.projects.find(function (p) { return p.id === del.projectId; });
          var key = proj ? proj.id : 'none';
          if (!byProject[key]) {
            byProject[key] = {
              projectId: proj ? proj.id : null,
              projectName: proj ? proj.name : 'Unassigned',
              clientName: proj ? proj.clientName : '',
              billable: proj ? proj.status !== 'COMPLETED' : false,
              secs: 0, deliverables: {}
            };
          }
          byProject[key].secs += secs;
          byProject[key].deliverables[del.id] = (byProject[key].deliverables[del.id] || 0) + secs;
        });
        var tagged = Object.keys(a.perDeliverableSecs || {})
          .reduce(function (s, k) { return s + a.perDeliverableSecs[k]; }, 0);
        var untagged = Math.max(0, (a.activeSecs || 0) - tagged);
        unassigned += untagged;
        totalTracked += untagged;
      });

      var projects = Object.keys(byProject).map(function (k) {
        var p = byProject[k];
        p.deliverables = Object.keys(p.deliverables).map(function (dId) {
          var del = DB.deliverables.find(function (d) { return String(d.id) === String(dId); });
          return {
            id: dId,
            title: del ? del.title : 'Unknown',
            secs: p.deliverables[dId],
            estimateSecs: del ? del.estimateSecs : 0
          };
        }).sort(function (a, b) { return b.secs - a.secs; });
        return p;
      }).sort(function (a, b) { return b.secs - a.secs; });

      var billableSecs = projects.filter(function (p) { return p.billable; })
        .reduce(function (s, p) { return s + p.secs; }, 0);

      return ok({
        employeeId: employeeId == null ? null : Number(employeeId),
        from: from, to: to,
        projects: projects,
        totalSecs: totalTracked,
        billableSecs: billableSecs,
        nonBillableSecs: totalTracked - billableSecs,
        overheadSecs: unassigned,
        utilisationPct: totalTracked ? Math.round(billableSecs / totalTracked * 100) : 0
      });
    },

    /* ── Team utilisation — capacity planning ka pehla step ────────────── */
    getUtilisation: function (fromIso, toIso) {
      var DB = ensure();
      var from = fromIso || U.isoDate(U.daysFromNow(-30));
      var to   = toIso || U.isoDate(new Date());
      var workingDays = workingDaysBetween(from, to, DB).length || 1;
      var capacitySecs = workingDays * DB.hrPolicy.fullDaySecs;

      var rows = DB.employees.map(function (e) {
        var atts = DB.attendance.filter(function (a) {
          return a.employeeId === e.id && a.date >= from && a.date <= to;
        });
        var loggedSecs = atts.reduce(function (s, a) { return s + (a.activeSecs || 0); }, 0);
        var billableSecs = 0;
        atts.forEach(function (a) {
          Object.keys(a.perDeliverableSecs || {}).forEach(function (dId) {
            var del = DB.deliverables.find(function (d) { return String(d.id) === String(dId); });
            if (!del) return;
            var proj = DB.projects.find(function (p) { return p.id === del.projectId; });
            if (proj && proj.status !== 'COMPLETED') billableSecs += a.perDeliverableSecs[dId];
          });
        });
        var openWork = DB.deliverables.filter(function (d) {
          return d.status !== 'DONE' && (d.assigneeIds || []).indexOf(e.id) >= 0;
        });
        var committedSecs = openWork.reduce(function (s, d) {
          return s + Math.max(0, (d.estimateSecs || 0) - (d.loggedSecs || 0));
        }, 0);

        return {
          employeeId: e.id, name: e.name, role: e.role,
          avatarInitials: e.avatarInitials, avatarBg: e.avatarBg, avatarFg: e.avatarFg,
          capacitySecs: capacitySecs,
          loggedSecs: loggedSecs,
          billableSecs: billableSecs,
          utilisationPct: capacitySecs ? Math.round(billableSecs / capacitySecs * 100) : 0,
          openDeliverables: openWork.length,
          committedSecs: committedSecs,
          committedDays: Math.round(committedSecs / DB.hrPolicy.fullDaySecs * 10) / 10,
          load: committedSecs > capacitySecs ? 'OVERLOADED'
              : committedSecs > capacitySecs * 0.7 ? 'BUSY'
              : committedSecs > 0 ? 'AVAILABLE' : 'FREE'
        };
      });

      rows.sort(function (a, b) { return b.utilisationPct - a.utilisationPct; });
      return ok({ from: from, to: to, workingDays: workingDays, rows: rows });
    },

    /* ── Helpers exposed for UI ───────────────────────────────────────── */
    workingDaysBetween: function (from, to) { return workingDaysBetween(from, to, ensure()); },
    dayFlags: function (att) { return dayFlags(att, ensure()); },
    holidayOn: function (iso) { return holidayOn(iso, ensure()); },
    isWeekOff: function (iso) { return isWeekOff(iso, ensure()); }
  };

  root.HRM = HRM;
  if (typeof module !== 'undefined' && module.exports) module.exports = HRM;

})(typeof window !== 'undefined' ? window : globalThis);
