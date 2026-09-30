/* Email log routes — mounted at /api/emails (admin only) */
'use strict';
const router = require('express').Router();
const c = require('../controllers/email.controller');
const { adminOnly } = require('../middleware/auth.middleware');

router.use(adminOnly);
router.get('/', c.list);
router.post('/test', c.test);
router.post('/process', c.processNow);
router.get('/:id', c.getOne);
router.post('/:id/retry', c.retry);

module.exports = router;
