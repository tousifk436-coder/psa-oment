/* ============================================================================
   DB — MongoDB connection (Mongoose)
   ============================================================================ */
'use strict';
const mongoose = require('mongoose');
const env = require('./env');
const logger = require('../utils/logger');

mongoose.set('strictQuery', true);

async function connectDB(uri) {
  const conn = await mongoose.connect(uri || env.MONGO_URI, {
    dbName: env.MONGO_DB_NAME || undefined,
    serverSelectionTimeoutMS: 10000
  });
  logger.info(`MongoDB connected → ${conn.connection.host}/${conn.connection.name}`);
  return conn;
}

/* Multi-document transactions need a replica set (MongoDB Atlas always is).
   MONGO_TRANSACTIONS=auto detects it; on/off forces it. */
async function supportsTransactions() {
  if (env.MONGO_TRANSACTIONS === 'on') return true;
  if (env.MONGO_TRANSACTIONS === 'off') return false;
  try {
    const hello = await mongoose.connection.db.admin().command({ hello: 1 });
    return !!(hello.setName || hello.msg === 'isdbgrid');
  } catch (e) {
    return false;
  }
}

async function disconnectDB() {
  await mongoose.disconnect();
}

module.exports = { connectDB, disconnectDB, supportsTransactions, mongoose };
