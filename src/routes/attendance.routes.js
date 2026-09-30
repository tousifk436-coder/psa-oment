/* Attendance routes — mounted at /api/attendance */
'use strict';
const router = require('express').Router();
const c = require('../controllers/attendance.controller');
const { adminOnly } = require('../middleware/auth.middleware');

router.get('/', c.getAttendance);
router.get('/today', c.today);
router.get('/live', adminOnly, c.live);
router.post('/ensure-today', c.ensureToday);
router.post('/heartbeat', c.heartbeat);
router.post('/punch-out', c.punchOut);
router.post('/break', c.addBreak);
router.patch('/:id', c.updateAttendance);

module.exports = router;
