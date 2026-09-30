/* Notices routes — mounted at /api/notices */
'use strict';
const router = require('express').Router();
const c = require('../controllers/notice.controller');

router.get('/', c.getNotices);
router.post('/', c.createNotice);
router.patch('/:id', c.updateNotice);
router.post('/:id/send', c.sendNotice);
router.get('/:id/pdf', c.downloadPdf);
router.post('/:id/read', c.markRead);
router.delete('/:id', c.deleteNotice);

module.exports = router;
