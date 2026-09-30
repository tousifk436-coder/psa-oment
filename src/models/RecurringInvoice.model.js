/* RecurringInvoice — plans that create an invoice every week/month/quarter/year
   Collection: "recurring_invoices" */
'use strict';
const { Schema, model } = require('mongoose');

const recurringInvoiceSchema = new Schema(
  {
    id: { type: String, required: true, unique: true },
    name: String,
    clientName: String,
    clientEmail: String,
    clientGstin: String,
    placeOfSupply: String,
    projectId: Schema.Types.Mixed,
    subject: String,
    lines: Array,
    notes: String,
    frequency: { type: String, enum: ['WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY'] },
    startDate: String,
    endDate: Schema.Types.Mixed,
    maxCount: Schema.Types.Mixed,
    dueInDays: Number,
    autoSend: Boolean,
    active: Boolean,
    status: String,            // ACTIVE | PAUSED | COMPLETED
    count: Number,
    nextDate: String,
    lastInvoiceId: Schema.Types.Mixed,
    invoiceIds: Array,
    lastRunAt: String,
    createdAt: String,
    _ord: { type: Number, index: true }
  },
  { collection: 'recurring_invoices', strict: false, versionKey: false, minimize: false }
);

module.exports = model('RecurringInvoice', recurringInvoiceSchema);
