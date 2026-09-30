/* Task timer routes — mounted at /api/time */
'use strict';
const router = require('express').Router();
const c = require('../controllers/time.controller');

router.post('/start', c.startTimer);
router.post('/stop', c.stopTimer);
router.get('/open', c.getOpenTimer);

module.exports = router;
