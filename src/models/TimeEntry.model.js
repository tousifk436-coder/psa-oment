/* TimeEntry — Timer start/stop entries
   Collection: "time_entries"

   Fields mirror the shapes the business engine (shared/*.js) writes. The
   schema is "strict: false" because the engine may add fields over time;
   documents are written through the store service, which keeps them exactly
   as the engine produced them. */
'use strict';
const { Schema, model } = require('mongoose');

const timeEntrySchema = new Schema(
  {
    id: { type: String, required: true, unique: true },
    employeeId: Number,
    deliverableId: Number,
    subtaskId: Schema.Types.Mixed,
    startedAt: String,
    endedAt: String,
    source: String,
    _ord: { type: Number, index: true }   // position in the list (the app keeps lists ordered)
  },
  { collection: 'time_entries', strict: false, versionKey: false, minimize: false }
);

module.exports = model('TimeEntry', timeEntrySchema);
