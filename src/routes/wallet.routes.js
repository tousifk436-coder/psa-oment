/* Wallet & payouts (piece-rate pay) routes — mounted at /api */
'use strict';
const router = require('express').Router();
const c = require('../controllers/wallet.controller');

router.get('/wallet/policy', c.getPolicy);
router.patch('/wallet/policy', c.updatePolicy);
router.get('/wallet/can-start', c.canStart);
router.post('/wallet/pricing/:deliverableId', c.setPricing);
router.post('/wallet/agreement/:deliverableId/accept', c.acceptEstimate);
router.post('/wallet/agreement/:deliverableId/propose', c.proposeEstimate);
router.post('/wallet/agreement/:deliverableId/flag', c.flagEstimate);
router.post('/wallet/agreement/:deliverableId/accept-proposal', c.acceptProposal);
router.post('/wallet/agreement/:deliverableId/counter', c.counterEstimate);
router.get('/wallet/agreement/:deliverableId/hint', c.getEstimateHint);
router.post('/wallet/block/:deliverableId', c.markBlocked);
router.post('/wallet/unblock/:deliverableId', c.unblock);
router.get('/wallet/blocked', c.getBlocked);
router.get('/wallet/settlement-preview/:deliverableId', c.settlementPreview);
router.get('/wallet/slab-preview/:deliverableId', c.slabPreview);
router.get('/wallet/:employeeId', c.getWallet);
router.get('/wallet-ledger', c.getLedger);
router.post('/wallet-entries', c.addEntry);
router.post('/wallet/payments', c.recordPayment);
router.get('/wallet-disputes', c.getDisputes);
router.post('/wallet-disputes', c.raiseDispute);
router.post('/wallet-disputes/:id/resolve', c.resolveDispute);
router.get('/wallet-company-summary', c.getCompanySummary);
router.get('/wallet-estimate-behaviour', c.getEstimateBehaviour);
router.get('/wallet-outbox', c.getOutbox);
router.get('/focus-queue/:employeeId', c.focusQueue);

module.exports = router;
