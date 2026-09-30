/* Employees routes — mounted at /api/employees */
'use strict';
const router = require('express').Router();
const c = require('../controllers/employee.controller');

router.get('/', c.getEmployees);
router.post('/', c.createEmployee);
router.get('/:id', c.getEmployee);
router.patch('/:id', c.updateEmployee);
router.delete('/:id', c.deleteEmployee);
router.get('/:id/score', c.getEmployeeScore);

module.exports = router;
