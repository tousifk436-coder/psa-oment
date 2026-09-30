/* OutboxEmail — Queued emails (sent by the mailer worker)
   Collection: "outbox"

   Fields mirror the shapes the business engine (shared/*.js) writes. The
   schema is "strict: false" because the engine may add fields over time;
   documents are written through the store service, which keeps them exactly
   as the engine produced them. */
'use strict';
const { Schema, model } = require('mongoose');

const outboxEmailSchema = new Schema(
  {
    id: { type: String, required: true, unique: true },
    to: String,
    subject: String,
    body: String,
    kind: String,
    meta: Schema.Types.Mixed,
    status: String,
    createdAt: String,
    _ord: { type: Number, index: true }   // position in the list (the app keeps lists ordered)
  },
  { collection: 'outbox', strict: false, versionKey: false, minimize: false }
);

module.exports = model('OutboxEmail', outboxEmailSchema);
