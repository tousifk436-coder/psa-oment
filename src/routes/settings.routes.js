/* Company settings routes — mounted at /api/settings */
'use strict';
const router = require('express').Router();
const c = require('../controllers/settings.controller');
const email = require('../controllers/email.controller');
const { adminOnly } = require('../middleware/auth.middleware');

router.get('/', c.getSettings);
router.patch('/', c.updateSettings);
router.get('/email', adminOnly, email.getSettings);
router.patch('/email', adminOnly, email.updateSettings);

module.exports = router;
