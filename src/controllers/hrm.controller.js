/* HRM — leave, holidays, regularisation, reports controller — each handler runs one business-engine method.
   Access rules, the unit of work and emails are applied in access.service. */
'use strict';
const { run } = require('../utils/engineHandler');
const { num } = require('../utils/parse');

exports.getPolicy = run('HRM', 'getPolicy');
exports.updatePolicy = run('HRM', 'updatePolicy', req => [req.body]);
exports.getHolidays = run('HRM', 'getHolidays');
exports.addHoliday = run('HRM', 'addHoliday', req => [req.body]);
exports.deleteHoliday = run('HRM', 'deleteHoliday', req => [req.params.id]);
exports.getBalances = run('HRM', 'getBalances', req => [num(req.params.employeeId)]);
exports.creditCompOff = run('HRM', 'creditCompOff', req => [num(req.body.employeeId), num(req.body.days), req.body.reason]);
exports.getLeaveRequests = run('HRM', 'getLeaveRequests', req => [req.query]);
exports.applyLeave = run('HRM', 'applyLeave', req => [req.body]);
exports.approveLeave = run('HRM', 'approveLeave', req => [req.params.id, req.body.note]);
exports.rejectLeave = run('HRM', 'rejectLeave', req => [req.params.id, req.body.reason]);
exports.cancelLeave = run('HRM', 'cancelLeave', req => [req.params.id]);
exports.getRegularisations = run('HRM', 'getRegularisations', req => [req.query]);
exports.requestRegularisation = run('HRM', 'requestRegularisation', req => [req.body]);
exports.approveRegularisation = run('HRM', 'approveRegularisation', req => [req.params.id]);
exports.rejectRegularisation = run('HRM', 'rejectRegularisation', req => [req.params.id, req.body.reason]);
exports.getTodayBoard = run('HRM', 'getTodayBoard');
exports.getRegister = run('HRM', 'getRegister', req => [num(req.query.year), num(req.query.month)]);
exports.getTimesheet = run('HRM', 'getTimesheet', req => [num(req.query.employeeId), req.query.from, req.query.to]);
exports.getUtilisation = run('HRM', 'getUtilisation', req => [req.query.from, req.query.to]);
exports.workingDaysBetween = run('HRM', 'workingDaysBetween', req => [req.query.from, req.query.to]);
