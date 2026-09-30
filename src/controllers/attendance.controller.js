/* Attendance controller — records, breaks, and the live work tracker */
'use strict';
const { run, snapFor } = require('../utils/engineHandler');
const { num } = require('../utils/parse');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const access = require('../services/access.service');
const tracker = require('../services/attendance.service');

exports.getAttendance = run('DataAPI', 'getAttendance', req => [{ employeeId: num(req.query.employeeId), date: req.query.date }]);
exports.ensureToday = run('DataAPI', 'ensureTodayAttendance', req => [num(req.body.employeeId)]);
exports.updateAttendance = run('DataAPI', 'updateAttendance', req => [req.params.id, req.body]);
exports.addBreak = run('DataAPI', 'addBreak', req => [num(req.body.employeeId), req.body.break || { type: req.body.type, startAt: req.body.startAt, endAt: req.body.endAt, secs: req.body.secs }]);

/* employees act on themselves; admin may pass employeeId */
function who(req) {
  if (req.user.role === 'EMPLOYEE') return req.user.empId;
  const id = num((req.body || {}).employeeId != null ? req.body.employeeId : req.query.employeeId);
  if (id == null) throw new ApiError('VALIDATION', 'employeeId is required');
  return id;
}

/* POST /api/attendance/heartbeat { sessionSecs, activeSecs, idleSecs, perDeliverableSecs, onBreak, currentDeliverableId } */
exports.heartbeat = asyncHandler(async (req, res) => {
  const empId = who(req);
  const record = await access.unitOfWork(async () => tracker.heartbeat(empId, req.body || {}));
  res.json({ ok: true, result: record });
});

/* POST /api/attendance/punch-out { ...same totals } */
exports.punchOut = asyncHandler(async (req, res) => {
  const empId = who(req);
  const record = await access.unitOfWork(async () => tracker.punchOut(empId, req.body || {}));
  res.json({ ok: true, result: record, snapshot: snapFor(req.user) });
});

/* GET /api/attendance/today — own record (admin: ?employeeId=) */
exports.today = asyncHandler(async (req, res) => {
  res.json({ ok: true, result: tracker.today(who(req)) });
});

/* GET /api/attendance/live — admin: who is working / idle / on break right now */
exports.live = (req, res) => res.json({ ok: true, result: tracker.live() });
