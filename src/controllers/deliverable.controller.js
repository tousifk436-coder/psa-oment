/* Deliverables (tasks) controller — each handler runs one business-engine method.
   Access rules, the unit of work and emails are applied in access.service. */
'use strict';
const { run } = require('../utils/engineHandler');
const { num } = require('../utils/parse');

exports.getDeliverables = run('DataAPI', 'getDeliverables', req => [{ projectId: num(req.query.projectId), milestoneId: num(req.query.milestoneId), assigneeId: num(req.query.assigneeId), status: req.query.status, origin: req.query.origin, page: num(req.query.page), limit: num(req.query.limit), q: req.query.q }]);
exports.getDeliverable = run('DataAPI', 'getDeliverable', req => [num(req.params.id)]);
exports.createDeliverable = run('DataAPI', 'createDeliverable', req => [req.body]);
exports.updateDeliverable = run('DataAPI', 'updateDeliverable', req => [num(req.params.id), req.body]);
exports.deleteDeliverable = run('DataAPI', 'deleteDeliverable', req => [num(req.params.id)]);
exports.submit = run('DataAPI', 'submitDeliverable', req => [num(req.params.id), req.body]);
exports.approve = run('DataAPI', 'approveDeliverable', req => [num(req.params.id), req.body.note]);
exports.reject = run('DataAPI', 'rejectDeliverable', req => [num(req.params.id), req.body.reason]);
exports.reassign = run('DataAPI', 'reassignDeliverable', req => [num(req.params.id), req.body.assigneeIds]);
exports.addComment = run('DataAPI', 'addDeliverableComment', req => [num(req.params.id), num(req.body.fromId), req.body.text]);
exports.addFiles = run('DataAPI', 'addDeliverableFiles', req => [num(req.params.id), req.body.files, req.body.which]);
exports.removeFile = run('DataAPI', 'removeDeliverableFile', req => [num(req.params.id), num(req.params.index), req.query.which]);
exports.getSubtasks = run('DataAPI', 'getSubtasks', req => [num(req.params.id)]);
