/* Integrations — mounted at /api/integrations (webhook secret or admin token) */
'use strict';
const router = require('express').Router();
const c = require('../controllers/integration.controller');

router.use(c.guard);
router.post('/crm/deal-won', c.dealWon);
router.get('/crm/accounts/:accountId/health', c.accountHealth);
router.get('/crm/sample', c.sample);

module.exports = router;
