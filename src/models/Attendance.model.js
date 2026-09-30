/* Attendance — Daily attendance per employee
   Collection: "attendance"

   Fields mirror the shapes the business engine (shared/*.js) writes. The
   schema is "strict: false" because the engine may add fields over time;
   documents are written through the store service, which keeps them exactly
   as the engine produced them. */
'use strict';
const { Schema, model } = require('mongoose');

const attendanceSchema = new Schema(
  {
    id: { type: String, required: true, unique: true },
    employeeId: Number,
    date: String,
    status: String,
    firstInAt: String,
    lastOutAt: String,
    sessionSecs: Number,
    activeSecs: Number,
    idleSecs: Number,
    breaks: Array,
    perDeliverableSecs: Schema.Types.Mixed,
    leaveRequestId: String,
    leaveType: String,
    _ord: { type: Number, index: true }   // position in the list (the app keeps lists ordered)
  },
  { collection: 'attendance', strict: false, versionKey: false, minimize: false }
);

module.exports = model('Attendance', attendanceSchema);
