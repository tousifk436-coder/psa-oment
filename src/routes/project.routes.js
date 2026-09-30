/* Projects routes — mounted at /api/projects */
'use strict';
const router = require('express').Router();
const c = require('../controllers/project.controller');

router.get('/', c.getProjects);
router.post('/', c.createProject);
router.get('/:id', c.getProject);
router.patch('/:id', c.updateProject);
router.delete('/:id', c.deleteProject);
router.post('/:id/members', c.addMember);
router.delete('/:id/members/:empId', c.removeMember);
router.get('/:id/progress', c.getProgress);

module.exports = router;
