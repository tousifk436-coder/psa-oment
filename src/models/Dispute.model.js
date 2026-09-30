/* Dispute — Wallet disputes
   Collection: "disputes"

   Fields mirror the shapes the business engine (shared/*.js) writes. The
   schema is "strict: false" because the engine may add fields over time;
   documents are written through the store service, which keeps them exactly
   as the engine produced them. */
'use strict';
const { Schema, model } = require('mongoose');

const disputeSchema = new Schema(
  {
    id: { type: String, required: true, unique: true },
    entryId: String,
    employeeId: Number,
    deliverableId: Number,
    amountPaise: Number,
    reason: String,
    status: String,
    resolutionNote: String,
    creditedPaise: Number,
    createdAt: String,
    resolvedAt: String,
    _ord: { type: Number, index: true }   // position in the list (the app keeps lists ordered)
  },
  { collection: 'disputes', strict: false, versionKey: false, minimize: false }
);

module.exports = model('Dispute', disputeSchema);
