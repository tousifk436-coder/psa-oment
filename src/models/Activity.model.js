/* Activity — Admin activity feed (latest 80, no id)
   Collection: "activity"

   Fields mirror the shapes the business engine (shared/*.js) writes. The
   schema is "strict: false" because the engine may add fields over time;
   documents are written through the store service, which keeps them exactly
   as the engine produced them. */
'use strict';
const { Schema, model } = require('mongoose');

const activitySchema = new Schema(
  {
    icon: String,
    color: String,
    text: String,
    at: String,
    _ord: { type: Number, index: true }   // position in the list (the app keeps lists ordered)
  },
  { collection: 'activity', strict: false, versionKey: false, minimize: false }
);

module.exports = model('Activity', activitySchema);
