/* Milestones controller — each handler runs one business-engine method.
   Access rules, the unit of work and emails are applied in access.service. */
'use strict';
const { run } = require('../utils/engineHandler');
const { num } = require('../utils/parse');

exports.getMilestones = run('DataAPI', 'getMilestones', req => [num(req.query.projectId)]);
exports.createMilestone = run('DataAPI', 'createMilestone', req => [req.body]);
exports.updateMilestone = run('DataAPI', 'updateMilestone', req => [num(req.params.id), req.body]);
exports.deleteMilestone = run('DataAPI', 'deleteMilestone', req => [num(req.params.id)]);
exports.getProgress = run('DataAPI', 'milestoneProgress', req => [num(req.params.id)]);
