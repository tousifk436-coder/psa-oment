/* Regularisation — Attendance correction requests
   Collection: "regularisations"

   Fields mirror the shapes the business engine (shared/*.js) writes. The
   schema is "strict: false" because the engine may add fields over time;
   documents are written through the store service, which keeps them exactly
   as the engine produced them. */
'use strict';
const { Schema, model } = require('mongoose');

const regularisationSchema = new Schema(
  {
    id: { type: String, required: true, unique: true },
    employeeId: Number,
    date: String,
    proposedInAt: String,
    proposedOutAt: String,
    reason: String,
    status: String,
    approverId: Number,
    decisionNote: String,
    appliedAt: String,
    _ord: { type: Number, index: true }   // position in the list (the app keeps lists ordered)
  },
  { collection: 'regularisations', strict: false, versionKey: false, minimize: false }
);

module.exports = model('Regularisation', regularisationSchema);
