/* ============================================================================
   API ROUTER — everything under /api
   Public:   /health, /auth/*, /integrations/* (own guard)
   Private:  everything else needs "Authorization: Bearer <token>"
   ============================================================================ */
'use strict';
const router = require('express').Router();
const { protect } = require('../middleware/auth.middleware');
const system = require('../controllers/system.controller');

/* public */
router.get('/health', system.health);
router.use('/auth', require('./auth.routes'));
router.use('/integrations', require('./integration.routes'));

/* everything below needs a valid token */
router.use(protect);

router.get('/snapshot', system.snapshot);
router.post('/rpc', system.rpc);

router.use('/settings', require('./settings.routes'));
router.use('/emails', require('./email.routes'));
router.use('/admin', require('./admin.routes'));
router.use('/files', require('./file.routes'));
router.use('/employees', require('./employee.routes'));
router.use('/departments', require('./department.routes'));
router.use('/projects', require('./project.routes'));
router.use('/milestones', require('./milestone.routes'));
router.use('/deliverables', require('./deliverable.routes'));
router.use('/subtasks', require('./subtask.routes'));
router.use('/time', require('./time.routes'));
router.use('/attendance', require('./attendance.routes'));
router.use('/invoices', require('./invoice.routes'));
router.use('/notices', require('./notice.routes'));
router.use('/conversations', require('./message.routes'));
router.use('/calendar', require('./calendar.routes'));
router.use('/notifications', require('./notification.routes'));
router.use('/hrm', require('./hrm.routes'));
router.use('/profit', require('./profit.routes'));
router.use('/', require('./dashboard.routes'));       // /activity /call-logs /kpis /revenue-series
router.use('/', require('./wallet.routes'));          // /wallet/* /wallet-* /focus-queue/*
router.use('/', require('./een.routes'));             // /een/* /signals

module.exports = router;
