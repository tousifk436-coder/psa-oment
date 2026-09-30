/* Departments routes — mounted at /api/departments */
'use strict';
const router = require('express').Router();
const c = require('../controllers/department.controller');

router.get('/', c.getDepartments);
router.post('/', c.createDepartment);
router.patch('/:id', c.updateDepartment);
router.delete('/:id', c.deleteDepartment);

module.exports = router;
