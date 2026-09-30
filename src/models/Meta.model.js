/* Meta — single-value settings stored as key/value
   Collection: "meta"
   Keys: settings, company, adminUser, payPolicy, hrPolicy, leaveBalances,
         schemaVersion, version … (everything in the engine's DB that is not a list) */
'use strict';
const { Schema, model } = require('mongoose');

const metaSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    value: Schema.Types.Mixed
  },
  { collection: 'meta', versionKey: false, minimize: false }
);

module.exports = model('Meta', metaSchema);
