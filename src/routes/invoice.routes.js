/* Invoices routes — mounted at /api/invoices */
'use strict';
const router = require('express').Router();
const c = require('../controllers/invoice.controller');
const { adminOnly } = require('../middleware/auth.middleware');

router.get('/', c.getInvoices);
router.post('/', c.createInvoice);
router.get('/peek-number', c.peekNumber);
router.get('/recurring', c.getRecurring);
router.post('/recurring', c.createRecurring);
router.patch('/recurring/:id', c.updateRecurring);
router.delete('/recurring/:id', c.deleteRecurring);
router.get('/uninvoiced-milestones', c.getUninvoicedMilestones);
router.get('/:id/pdf', adminOnly, c.downloadPdf);
router.patch('/:id', c.updateInvoice);
router.post('/:id/send', c.sendInvoice);
router.post('/:id/payment', c.recordPayment);
router.post('/:id/cancel', c.cancelInvoice);
router.delete('/:id', c.deleteInvoice);

module.exports = router;
