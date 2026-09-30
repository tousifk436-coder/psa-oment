/* PasswordReset — one-time "forgot password" tokens
   Collection: "password_resets"
   Only a SHA-256 hash of the token is stored; MongoDB deletes the row
   automatically after expiresAt (TTL index). */
'use strict';
const { Schema, model } = require('mongoose');

const passwordResetSchema = new Schema(
  {
    tokenHash: { type: String, required: true, unique: true },
    subject: { type: String, required: true },          // 'admin' | 'emp:<id>'
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
    usedAt: { type: Date, default: null }
  },
  { collection: 'password_resets', versionKey: false, timestamps: true }
);

module.exports = model('PasswordReset', passwordResetSchema);
