/* Een AI + signals — mounted at /api */
'use strict';
const router = require('express').Router();
const c = require('../controllers/een.controller');
const { adminOnly } = require('../middleware/auth.middleware');

router.get('/een/status', c.status);
router.post('/een/chat', adminOnly, c.chat);
router.get('/signals', c.signals);

module.exports = router;
