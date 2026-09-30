/* Admin tools — mounted at /api/admin (admin only) */
'use strict';
const router = require('express').Router();
const c = require('../controllers/admin.controller');
const { adminOnly } = require('../middleware/auth.middleware');

router.use(adminOnly);
router.post('/reset', c.reset);
router.get('/scheduler', c.schedulerStatus);
router.post('/scheduler/:job/run', c.runJob);

module.exports = router;
