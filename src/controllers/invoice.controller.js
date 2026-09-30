/* Invoices controller — each handler runs one business-engine method.
   Access rules, the unit of work and emails are applied in access.service. */
'use strict';
const { run, snapFor } = require('../utils/engineHandler');
const { num } = require('../utils/parse');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const engine = require('../services/engine.service');
const access = require('../services/access.service');
const email = require('../services/email.service');
const pdf = require('../services/pdf.service');

exports.getInvoices = run('DataAPI', 'getInvoices', req => [req.query]);
exports.getRecurring = run('DataAPI', 'getRecurringInvoices');
exports.createRecurring = run('DataAPI', 'createRecurringInvoice', req => [req.body]);
exports.updateRecurring = run('DataAPI', 'updateRecurringInvoice', req => [req.params.id, req.body]);
exports.deleteRecurring = run('DataAPI', 'deleteRecurringInvoice', req => [req.params.id]);
exports.peekNumber = run('DataAPI', 'peekInvoiceNumber');
exports.getUninvoicedMilestones = run('DataAPI', 'getUninvoicedMilestones');
exports.createInvoice = run('DataAPI', 'createInvoice', req => [req.body]);
exports.updateInvoice = run('DataAPI', 'updateInvoice', req => [req.params.id, req.body]);
exports.sendInvoice = asyncHandler(async (req, res) => {
  const result = await access.call(req.user, 'DataAPI', 'sendInvoice', [req.params.id]);
  /* Flush the invoice email immediately so clicking Send gives a real delivery
     result instead of only placing a message in the background queue. */
  await email.drain();
  const D = engine.get().DataAPI.raw();
  const mail = (D.outbox || []).find(x =>
    x.meta && String(x.meta.attachInvoiceId || '') === String(req.params.id) &&
    x.category === 'invoices'
  );
  result.mail = mail ? {
    status: mail.status, to: mail.to, error: mail.error || null,
    sentAt: mail.sentAt || null
  } : null;
  const body = { ok: true, result };
  body.snapshot = snapFor(req.user);
  res.json(body);
});
exports.recordPayment = run('DataAPI', 'recordPayment', req => [req.params.id, num(req.body.amountPaise), { date: req.body.date, method: req.body.method, reference: req.body.reference, note: req.body.note }]);
exports.cancelInvoice = run('DataAPI', 'cancelInvoice', req => [req.params.id, req.body.reason]);
exports.deleteInvoice = run('DataAPI', 'deleteInvoice', req => [req.params.id]);

/* GET /invoices/:id/pdf — download the GST invoice as PDF */
exports.downloadPdf = asyncHandler(async (req, res) => {
  const D = engine.get().DataAPI.raw();
  const inv = (D.invoices || []).find(i => String(i.id) === String(req.params.id));
  if (!inv) throw new ApiError('NOT_FOUND', 'Invoice not found');
  const buf = await pdf.invoicePdf(inv, D.settings || D.company);
  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `${req.query.inline ? 'inline' : 'attachment'}; filename="Invoice-${String(inv.number || inv.id).replace(/[^\w.-]/g, '_')}.pdf"`,
    'Content-Length': buf.length
  });
  res.end(buf);
});

