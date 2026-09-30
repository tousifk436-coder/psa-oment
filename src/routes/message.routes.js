/* Messages (conversations) routes — mounted at /api/conversations */
'use strict';
const router = require('express').Router();
const c = require('../controllers/message.controller');

router.get('/', c.getConversations);
router.post('/:id/messages', c.sendMessage);
router.post('/:id/read', c.markRead);

module.exports = router;
