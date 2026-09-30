/* Notification — In-app notifications
   Collection: "notifications"

   Fields mirror the shapes the business engine (shared/*.js) writes. The
   schema is "strict: false" because the engine may add fields over time;
   documents are written through the store service, which keeps them exactly
   as the engine produced them. */
'use strict';
const { Schema, model } = require('mongoose');

const notificationSchema = new Schema(
  {
    id: { type: Schema.Types.Mixed, required: true, unique: true },
    recipientId: Number,
    kind: String,
    title: String,
    body: String,
    entityType: String,
    entityId: Schema.Types.Mixed,
    read: Boolean,
    createdAt: String,
    _ord: { type: Number, index: true }   // position in the list (the app keeps lists ordered)
  },
  { collection: 'notifications', strict: false, versionKey: false, minimize: false }
);

module.exports = model('Notification', notificationSchema);
