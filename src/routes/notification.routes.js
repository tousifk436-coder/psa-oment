/* In-app notifications routes — mounted at /api/notifications */
'use strict';
const router = require('express').Router();
const c = require('../controllers/notification.controller');

router.get('/', c.getNotifications);
router.post('/read-all', c.markAllRead);
router.post('/:id/read', c.markRead);

module.exports = router;
