/* Dashboard & analytics routes — mounted at /api */
'use strict';
const router = require('express').Router();
const c = require('../controllers/dashboard.controller');

router.get('/activity', c.getActivity);
router.get('/call-logs', c.getCallLogs);
router.get('/kpis', c.getKpis);
router.get('/revenue-series', c.getRevenueSeries);

module.exports = router;
