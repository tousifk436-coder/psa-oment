/* Calendar routes — mounted at /api/calendar */
'use strict';
const router = require('express').Router();
const c = require('../controllers/calendar.controller');

router.get('/', c.getEvents);
router.post('/', c.createEvent);
router.delete('/:id', c.deleteEvent);

module.exports = router;
