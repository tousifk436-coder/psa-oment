/* Subtasks controller — each handler runs one business-engine method.
   Access rules, the unit of work and emails are applied in access.service. */
'use strict';
const { run } = require('../utils/engineHandler');
const { num } = require('../utils/parse');

exports.createSubtask = run('DataAPI', 'createSubtask', req => [req.body]);
exports.updateSubtask = run('DataAPI', 'updateSubtask', req => [num(req.params.id), req.body]);
exports.approveSubtask = run('DataAPI', 'approveSubtask', req => [num(req.params.id)]);
exports.rejectSubtask = run('DataAPI', 'rejectSubtask', req => [num(req.params.id), req.body.reason]);
exports.deleteSubtask = run('DataAPI', 'deleteSubtask', req => [num(req.params.id)]);
