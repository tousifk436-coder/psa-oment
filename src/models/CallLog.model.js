/* CallLog — Call logs
   Collection: "call_logs"

   Fields mirror the shapes the business engine (shared/*.js) writes. The
   schema is "strict: false" because the engine may add fields over time;
   documents are written through the store service, which keeps them exactly
   as the engine produced them. */
'use strict';
const { Schema, model } = require('mongoose');

const callLogSchema = new Schema(
  {
    id: { type: Number, required: true, unique: true },
    name: String,
    number: String,
    durationSecs: Number,
    type: String,
    at: String,
    status: String,
    _ord: { type: Number, index: true }   // position in the list (the app keeps lists ordered)
  },
  { collection: 'call_logs', strict: false, versionKey: false, minimize: false }
);

module.exports = model('CallLog', callLogSchema);
