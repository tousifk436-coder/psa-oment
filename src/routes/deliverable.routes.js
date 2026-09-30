/* Deliverables (tasks) routes — mounted at /api/deliverables */
'use strict';
const router = require('express').Router();
const c = require('../controllers/deliverable.controller');

router.get('/', c.getDeliverables);
router.post('/', c.createDeliverable);
router.get('/:id', c.getDeliverable);
router.patch('/:id', c.updateDeliverable);
router.delete('/:id', c.deleteDeliverable);
router.post('/:id/submit', c.submit);
router.post('/:id/approve', c.approve);
router.post('/:id/reject', c.reject);
router.post('/:id/reassign', c.reassign);
router.post('/:id/comments', c.addComment);
router.post('/:id/files', c.addFiles);
router.delete('/:id/files/:index', c.removeFile);
router.get('/:id/subtasks', c.getSubtasks);

module.exports = router;
