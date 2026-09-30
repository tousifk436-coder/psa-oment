/* ============================================================================
   BOOTSTRAP — connect MongoDB, load data, start the business engine
   Used by index.js (server), scripts/* and tests.
   ============================================================================ */
'use strict';
const env = require('./config/env');
const { connectDB, supportsTransactions } = require('./config/db');
const store = require('./services/store.service');
const engine = require('./services/engine.service');
const auth = require('./services/auth.service');
const access = require('./services/access.service');

async function bootstrap(opts) {
  opts = opts || {};
  env.validate();
  await connectDB(opts.uri);
  await store.load({ transactions: await supportsTransactions() });
  await engine.boot(opts.engine || {});
  auth.bootstrapAdmin();
  access.assertCovered();
  await store.flush();
}

module.exports = { bootstrap };
