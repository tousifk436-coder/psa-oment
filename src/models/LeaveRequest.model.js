/* LeaveRequest — Leave applications
   Collection: "leave_requests"

   Fields mirror the shapes the business engine (shared/*.js) writes. The
   schema is "strict: false" because the engine may add fields over time;
   documents are written through the store service, which keeps them exactly
   as the engine produced them. */
'use strict';
const { Schema, model } = require('mongoose');

const leaveRequestSchema = new Schema(
  {
    id: { type: String, required: true, unique: true },
    employeeId: Number,
    type: String,
    fromDate: String,
    toDate: String,
    halfDay: String,
    days: Number,
    dates: Array,
    reason: String,
    status: String,
    approverId: Number,
    decisionNote: String,
    appliedAt: String,
    decidedAt: String,
    _ord: { type: Number, index: true }   // position in the list (the app keeps lists ordered)
  },
  { collection: 'leave_requests', strict: false, versionKey: false, minimize: false }
);

module.exports = model('LeaveRequest', leaveRequestSchema);
