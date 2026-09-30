/* Milestones routes — mounted at /api/milestones */
'use strict';
const router = require('express').Router();
const c = require('../controllers/milestone.controller');

router.get('/', c.getMilestones);
router.post('/', c.createMilestone);
router.patch('/:id', c.updateMilestone);
router.delete('/:id', c.deleteMilestone);
router.get('/:id/progress', c.getProgress);

module.exports = router;
