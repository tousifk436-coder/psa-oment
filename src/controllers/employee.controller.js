/* Employees controller — each handler runs one business-engine method.
   Access rules, the unit of work and emails are applied in access.service. */
'use strict';
const { run } = require('../utils/engineHandler');
const { num } = require('../utils/parse');

exports.getEmployees = run('DataAPI', 'getEmployees');
exports.getEmployee = run('DataAPI', 'getEmployee', req => [num(req.params.id)]);
exports.createEmployee = run('DataAPI', 'createEmployee', req => [req.body]);
exports.updateEmployee = run('DataAPI', 'updateEmployee', req => [num(req.params.id), req.body]);
exports.deleteEmployee = run('DataAPI', 'deleteEmployee', req => [num(req.params.id)]);
exports.getEmployeeScore = run('DataAPI', 'employeeScore', req => [num(req.params.id)]);
