/* Credential — bcrypt login hashes (server-only, never sent to the browser)
   Collection: "credentials"
   subject: 'admin' | 'emp:<employeeId>' */
'use strict';
const { Schema, model } = require('mongoose');

const credentialSchema = new Schema(
  {
    subject: { type: String, required: true, unique: true },
    kind: { type: String, enum: ['ADMIN', 'EMPLOYEE'], required: true },
    hash: { type: String, required: true },
    mustChange: { type: Boolean, default: false }
  },
  { collection: 'credentials', versionKey: false, timestamps: true }
);

module.exports = model('Credential', credentialSchema);
