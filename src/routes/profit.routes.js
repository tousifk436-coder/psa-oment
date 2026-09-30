/* Profitability routes — mounted at /api/profit */
'use strict';
const router = require('express').Router();
const c = require('../controllers/profit.controller');

router.get('/settings', c.getSettings);
router.patch('/settings', c.updateSettings);
router.post('/rates/:employeeId', c.setEmployeeRates);
router.get('/rate-coverage', c.getRateCoverage);
router.get('/projects/:id', c.getProject);
router.get('/portfolio', c.getPortfolio);
router.get('/by-client', c.getByClient);
router.get('/by-employee', c.getByEmployee);
router.get('/alerts', c.getAlerts);
router.get('/loaded-rate/:employeeId', c.getLoadedRate);

module.exports = router;
