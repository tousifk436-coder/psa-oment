/* Wallet & payouts (piece-rate pay) controller — each handler runs one business-engine method.
   Access rules, the unit of work and emails are applied in access.service. */
'use strict';
const { run } = require('../utils/engineHandler');
const { num } = require('../utils/parse');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const engine = require('../services/engine.service');

exports.getPolicy = run('Wallet', 'getPolicy');
exports.updatePolicy = run('Wallet', 'updatePolicy', req => [req.body]);
exports.canStart = run('Wallet', 'canStart', req => [num(req.query.employeeId), num(req.query.deliverableId)]);
exports.setPricing = run('Wallet', 'setPricing', req => [num(req.params.deliverableId), req.body]);
exports.acceptEstimate = run('Wallet', 'acceptEstimate', req => [num(req.params.deliverableId), num(req.body.employeeId)]);
exports.proposeEstimate = run('Wallet', 'proposeEstimate', req => [num(req.params.deliverableId), num(req.body.employeeId), num(req.body.secs), req.body.note]);
exports.flagEstimate = run('Wallet', 'flagEstimate', req => [num(req.params.deliverableId), num(req.body.employeeId), req.body.reason]);
exports.acceptProposal = run('Wallet', 'acceptProposal', req => [num(req.params.deliverableId)]);
exports.counterEstimate = run('Wallet', 'counterEstimate', req => [num(req.params.deliverableId), num(req.body.secs), req.body.note]);
exports.getEstimateHint = run('Wallet', 'getEstimateHint', req => [num(req.params.deliverableId)]);
exports.markBlocked = run('Wallet', 'markBlocked', req => [num(req.params.deliverableId), num(req.body.byId), req.body.reason]);
exports.unblock = run('Wallet', 'unblock', req => [num(req.params.deliverableId), num(req.body.byId), req.body.note]);
exports.getBlocked = run('Wallet', 'getBlocked');
exports.getWallet = run('Wallet', 'getWallet', req => [num(req.params.employeeId)]);
exports.getLedger = run('Wallet', 'getLedger', req => [{ employeeId: num(req.query.employeeId), type: req.query.type, month: req.query.month }]);
exports.addEntry = run('Wallet', 'addEntry', req => [num(req.body.employeeId), req.body.type, num(req.body.amountPaise), req.body.why, { projectId: req.body.projectId, method: req.body.method, reference: req.body.reference, date: req.body.date }]);
/* POST /wallet/payments { employeeId, amountPaise, mode: 'WALLET'|'DIRECT', date, method, reference, projectId, note } */
exports.recordPayment = run('Wallet', 'recordEmployeePayment', req => [num(req.body.employeeId), req.body]);
exports.raiseDispute = run('Wallet', 'raiseDispute', req => [req.body.entryId, num(req.body.employeeId), req.body.reason]);
exports.resolveDispute = run('Wallet', 'resolveDispute', req => [req.params.id, req.body]);
exports.getDisputes = run('Wallet', 'getDisputes', req => [req.query]);
exports.getCompanySummary = run('Wallet', 'getCompanySummary');
exports.getEstimateBehaviour = run('Wallet', 'getEstimateBehaviour');
exports.getOutbox = run('Wallet', 'getOutbox');
exports.focusQueue = run('Wallet', 'focusQueue', req => [num(req.params.employeeId)]);

/* GET /wallet/settlement-preview/:deliverableId — what the employee gets if approved now */
exports.settlementPreview = run('Wallet', 'computeSettlement', req => {
  const D = engine.get().DataAPI.raw();
  const d = (D.deliverables || []).find(x => Number(x.id) === num(req.params.deliverableId));
  if (!d) throw new ApiError('NOT_FOUND', 'Task not found');
  return [d, D.payPolicy];
});

/* GET /wallet/slab-preview/:deliverableId?loggedSecs= — live late-slab preview */
exports.slabPreview = run('Wallet', 'slabPreview', req => {
  const D = engine.get().DataAPI.raw();
  const d = (D.deliverables || []).find(x => Number(x.id) === num(req.params.deliverableId));
  if (!d) throw new ApiError('NOT_FOUND', 'Task not found');
  return [d, num(req.query.loggedSecs)];
});

