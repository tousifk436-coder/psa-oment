/* Holiday — Company holidays
   Collection: "holidays"

   Fields mirror the shapes the business engine (shared/*.js) writes. The
   schema is "strict: false" because the engine may add fields over time;
   documents are written through the store service, which keeps them exactly
   as the engine produced them. */
'use strict';
const { Schema, model } = require('mongoose');

const holidaySchema = new Schema(
  {
    id: { type: String, required: true, unique: true },
    date: String,
    name: String,
    optional: Boolean,
    _ord: { type: Number, index: true }   // position in the list (the app keeps lists ordered)
  },
  { collection: 'holidays', strict: false, versionKey: false, minimize: false }
);

module.exports = model('Holiday', holidaySchema);
