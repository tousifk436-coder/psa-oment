/* CompOff — Comp-off credits
   Collection: "comp_off_ledger"

   Fields mirror the shapes the business engine (shared/*.js) writes. The
   schema is "strict: false" because the engine may add fields over time;
   documents are written through the store service, which keeps them exactly
   as the engine produced them. */
'use strict';
const { Schema, model } = require('mongoose');

const compOffSchema = new Schema(
  {
    id: { type: String, required: true, unique: true },
    employeeId: Number,
    _ord: { type: Number, index: true }   // position in the list (the app keeps lists ordered)
  },
  { collection: 'comp_off_ledger', strict: false, versionKey: false, minimize: false }
);

module.exports = model('CompOff', compOffSchema);
