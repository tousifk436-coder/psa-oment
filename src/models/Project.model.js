/* Project — Client projects

   Collection: "projects"

   Fields mirror the shapes the business engine (shared/*.js) writes. The
   schema is "strict: false" because the engine may add fields over time;
   documents are written through the store service, which keeps them exactly
   as the engine produced them. */

'use strict';

const { Schema, model } = require('mongoose');

const projectSchema = new Schema(
  {
    id: { type: Number, required: true, unique: true },
    code: String,
    name: String,
    clientName: String,
    clientEmail: String,
    clientStateCode: String,
    status: String,
    priority: String,
    deptId: Number,
    headId: Number,
    memberIds: Array,
    description: String,
    startDate: String,
    deadline: String,

    // Project financial details
    budgetPaise: Number,
    advancePaidPaise: {
      type: Number,
      default: 0,
      min: 0
    },
    spentPaise: Number,

    _ord: { type: Number, index: true } // position in the list (the app keeps lists ordered)
  },
  {
    collection: 'projects',
    strict: false,
    versionKey: false,
    minimize: false
  }
);

module.exports = model('Project', projectSchema);