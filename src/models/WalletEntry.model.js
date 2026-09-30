/* WalletEntry — Employee pay ledger — APPEND-ONLY
   Collection: "wallet_entries"

   Fields mirror the shapes the business engine (shared/*.js) writes. The
   schema is "strict: false" because the engine may add fields over time;
   documents are written through the store service, which keeps them exactly
   as the engine produced them. */
'use strict';
const { Schema, model } = require('mongoose');

const walletEntrySchema = new Schema(
  {
    id: { type: String, required: true, unique: true },
    employeeId: Number,
    deliverableId: Number,
    projectId: Number,
    type: String,
    amountPaise: Number,
    why: String,
    createdAt: String,
    meta: Schema.Types.Mixed,
    _ord: { type: Number, index: true }   // position in the list (the app keeps lists ordered)
  },
  { collection: 'wallet_entries', strict: false, versionKey: false, minimize: false }
);

module.exports = model('WalletEntry', walletEntrySchema);
