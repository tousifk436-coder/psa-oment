/* Departments controller — each handler runs one business-engine method.
   Access rules, the unit of work and emails are applied in access.service. */
'use strict';
const { run } = require('../utils/engineHandler');
const { num } = require('../utils/parse');

exports.getDepartments = run('DataAPI', 'getDepartments');
exports.createDepartment = run('DataAPI', 'createDepartment', req => [req.body]);
exports.updateDepartment = run('DataAPI', 'updateDepartment', req => [num(req.params.id), req.body]);
exports.deleteDepartment = run('DataAPI', 'deleteDepartment', req => [num(req.params.id)]);
