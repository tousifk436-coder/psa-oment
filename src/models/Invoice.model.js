/* Invoice — Client invoices (GST)
   Collection: "invoices"

   Fields mirror the shapes the business engine (shared/*.js) writes. The
   schema is "strict: false" because the engine may add fields over time;
   documents are written through the store service, which keeps them exactly
   as the engine produced them. */
'use strict';
const { Schema, model } = require('mongoose');

const invoiceSchema = new Schema(
  {
    id: { type: Schema.Types.Mixed, required: true, unique: true },
    number: String,
    projectId: Number,
    milestoneId: Number,
    clientName: String,
    clientEmail: String,
    clientGstin: String,
    placeOfSupply: String,
    status: String,
    issueDate: String,
    dueDate: String,
    lines: Array,
    subtotalPaise: Number,
    cgstPaise: Number,
    sgstPaise: Number,
    igstPaise: Number,
    totalPaise: Number,
    paidPaise: Number,
    notes: String,
    _ord: { type: Number, index: true }   // position in the list (the app keeps lists ordered)
  },
  { collection: 'invoices', strict: false, versionKey: false, minimize: false }
);

module.exports = model('Invoice', invoiceSchema);
