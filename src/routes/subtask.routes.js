/* Subtasks routes — mounted at /api/subtasks */
'use strict';
const router = require('express').Router();
const c = require('../controllers/subtask.controller');

router.post('/', c.createSubtask);
router.patch('/:id', c.updateSubtask);
router.post('/:id/approve', c.approveSubtask);
router.post('/:id/reject', c.rejectSubtask);
router.delete('/:id', c.deleteSubtask);

module.exports = router;
