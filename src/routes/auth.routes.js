/* Auth routes — mounted at /api/auth */
'use strict';
const router = require('express').Router();
const c = require('../controllers/auth.controller');
const { protect } = require('../middleware/auth.middleware');
const rateLimit = require('../middleware/rateLimit.middleware');

const loginLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 30 });
const resetLimit = rateLimit({ windowMs: 60 * 60 * 1000, max: 10 });

router.post('/login', loginLimit, c.login);
router.post('/forgot-password', resetLimit, c.forgotPassword);
router.post('/reset-password', resetLimit, c.resetPassword);
router.post('/logout', c.logout);
router.get('/me', protect, c.me);
router.post('/change-password', protect, c.changePassword);

module.exports = router;
