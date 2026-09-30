/* Conversation — Chat threads + messages
   Collection: "conversations"

   Fields mirror the shapes the business engine (shared/*.js) writes. The
   schema is "strict: false" because the engine may add fields over time;
   documents are written through the store service, which keeps them exactly
   as the engine produced them. */
'use strict';
const { Schema, model } = require('mongoose');

const conversationSchema = new Schema(
  {
    id: { type: Number, required: true, unique: true },
    withId: Number,
    unread: Number,
    msgs: Array,
    _ord: { type: Number, index: true }   // position in the list (the app keeps lists ordered)
  },
  { collection: 'conversations', strict: false, versionKey: false, minimize: false }
);

module.exports = model('Conversation', conversationSchema);
