/* HRM — leave, holidays, regularisation, reports routes — mounted at /api/hrm */
'use strict';
const router = require('express').Router();
const c = require('../controllers/hrm.controller');

router.get('/policy', c.getPolicy);
router.patch('/policy', c.updatePolicy);
router.get('/holidays', c.getHolidays);
router.post('/holidays', c.addHoliday);
router.delete('/holidays/:id', c.deleteHoliday);
router.get('/balances/:employeeId', c.getBalances);
router.post('/comp-off', c.creditCompOff);
router.get('/leave', c.getLeaveRequests);
router.post('/leave', c.applyLeave);
router.post('/leave/:id/approve', c.approveLeave);
router.post('/leave/:id/reject', c.rejectLeave);
router.post('/leave/:id/cancel', c.cancelLeave);
router.get('/regularisations', c.getRegularisations);
router.post('/regularisations', c.requestRegularisation);
router.post('/regularisations/:id/approve', c.approveRegularisation);
router.post('/regularisations/:id/reject', c.rejectRegularisation);
router.get('/today-board', c.getTodayBoard);
router.get('/register', c.getRegister);
router.get('/timesheet', c.getTimesheet);
router.get('/utilisation', c.getUtilisation);
router.get('/working-days', c.workingDaysBetween);

module.exports = router;
