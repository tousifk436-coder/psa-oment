/* Subtask — Sub-tasks of a deliverable
   Collection: "subtasks"

   Fields mirror the shapes the business engine (shared/*.js) writes. The
   schema is "strict: false" because the engine may add fields over time;
   documents are written through the store service, which keeps them exactly
   as the engine produced them. */
'use strict';
const { Schema, model } = require('mongoose');

const subtaskSchema = new Schema(
  {
    id: { type: Number, required: true, unique: true },
    deliverableId: Number,
    title: String,
    description: String,
    status: String,
    priority: String,
    assigneeId: Number,
    createdById: Number,
    estimateSecs: Number,
    loggedSecs: Number,
    approvalState: String,
    createdAt: String,
    completedAt: String,
    rejectionReason: String,
    _ord: { type: Number, index: true }   // position in the list (the app keeps lists ordered)
  },
  { collection: 'subtasks', strict: false, versionKey: false, minimize: false }
);

module.exports = model('Subtask', subtaskSchema);
