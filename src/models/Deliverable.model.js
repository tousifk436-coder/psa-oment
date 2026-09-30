/* Deliverable — Tasks assigned to employees
   Collection: "deliverables"

   Fields mirror the shapes the business engine (shared/*.js) writes. The
   schema is "strict: false" because the engine may add fields over time;
   documents are written through the store service, which keeps them exactly
   as the engine produced them. */
'use strict';
const { Schema, model } = require('mongoose');

const deliverableSchema = new Schema(
  {
    id: { type: Number, required: true, unique: true },
    projectId: Number,
    milestoneId: Number,
    title: String,
    description: String,
    status: String,
    priority: String,
    assigneeIds: Array,
    createdById: Number,
    origin: String,
    dueAt: String,
    estimateSecs: Number,
    loggedSecs: Number,
    progressPct: Number,
    briefFiles: Array,
    submissionFiles: Array,
    submissionNotes: String,
    timeline: Array,
    pricingMode: String,
    pricePaise: Number,
    slab: Schema.Types.Mixed,
    agreement: Schema.Types.Mixed,
    comments: Array,
    approvalState: String,
    rejectionReason: String,
    settlement: Schema.Types.Mixed,
    reworkCount: Number,
    blocked: Schema.Types.Mixed,
    blockedSecs: Number,
    blockedLog: Array,
    createdAt: String,
    costSnapshot: Schema.Types.Mixed,
    _ord: { type: Number, index: true }   // position in the list (the app keeps lists ordered)
  },
  { collection: 'deliverables', strict: false, versionKey: false, minimize: false }
);

module.exports = model('Deliverable', deliverableSchema);
