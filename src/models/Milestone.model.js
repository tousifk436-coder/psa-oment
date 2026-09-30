/* Milestone — Project milestones (billing units)
   Collection: "milestones"

   Fields mirror the shapes the business engine (shared/*.js) writes. The
   schema is "strict: false" because the engine may add fields over time;
   documents are written through the store service, which keeps them exactly
   as the engine produced them. */
'use strict';
const { Schema, model } = require('mongoose');

const milestoneSchema = new Schema(
  {
    id: { type: Number, required: true, unique: true },
    projectId: Number,
    title: String,
    dueDate: String,
    status: String,
    billable: Boolean,
    sortOrder: Number,
    description: String,
    _ord: { type: Number, index: true }   // position in the list (the app keeps lists ordered)
  },
  { collection: 'milestones', strict: false, versionKey: false, minimize: false }
);

module.exports = model('Milestone', milestoneSchema);
