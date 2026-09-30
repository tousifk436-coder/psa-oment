/* Projects controller — each handler runs one business-engine method.
   Access rules, the unit of work and emails are applied in access.service. */
'use strict';
const { run } = require('../utils/engineHandler');
const { num } = require('../utils/parse');

exports.getProjects = run('DataAPI', 'getProjects');
exports.getProject = run('DataAPI', 'getProject', req => [num(req.params.id)]);
exports.createProject = run('DataAPI', 'createProject', req => [req.body]);
exports.updateProject = run('DataAPI', 'updateProject', req => [num(req.params.id), req.body]);
exports.deleteProject = run('DataAPI', 'deleteProject', req => [num(req.params.id)]);
exports.addMember = run('DataAPI', 'addProjectMember', req => [num(req.params.id), num(req.body.employeeId)]);
exports.removeMember = run('DataAPI', 'removeProjectMember', req => [num(req.params.id), num(req.params.empId)]);
exports.getProgress = run('DataAPI', 'projectProgress', req => [num(req.params.id)]);
