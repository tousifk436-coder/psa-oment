/* Test harness: boots the real app against a throw-away MongoDB database
   (MONGO_URI from .env, database "<MONGO_DB_NAME>_test"), records which
   routes were hit so the suite can prove every endpoint was exercised. */
'use strict';
process.env.NODE_ENV = 'test';
process.env.SCHEDULER_ENABLED = 'false';
process.env.SEED_DEMO_DATA = 'true';
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
process.env.MONGO_DB_NAME = (process.env.MONGO_DB_NAME || 'oment') + '_test';
process.env.ADMIN_USERNAME = 'admin';
process.env.ADMIN_PASSWORD = 'admin123';
process.env.ADMIN_EMAIL = 'owner@oment.test';
process.env.CRM_WEBHOOK_SECRET = 'test-secret-123';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-that-is-long-enough-1234567890';
if (!process.env.MONGO_URI && !process.env.MONGODB_URI) process.env.MONGO_URI = 'mongodb://127.0.0.1:27017';

const express = require('express');
const mongoose = require('mongoose');

const hits = new Set();
let server, base;

async function start() {
  const env = require('../src/config/env');
  await mongoose.connect(env.MONGO_URI, { dbName: env.MONGO_DB_NAME });
  await mongoose.connection.db.dropDatabase();
  await mongoose.disconnect();

  await require('../src/bootstrap').bootstrap();
  const app = require('../src/app').createApp();
  const outer = express();
  outer.use((req, res, next) => {
    res.on('finish', () => { if (req.route) hits.add(req.method + ' ' + (req.baseUrl + req.route.path).replace(/(.)\/$/, '$1')); });
    next();
  });
  outer.use(app);
  await new Promise(r => { server = outer.listen(0, r); });
  base = 'http://127.0.0.1:' + server.address().port;
  return { app };
}

async function stop() {
  await require('../src/services/store.service').flush();
  if (server) await new Promise(r => server.close(r));
  await mongoose.connection.db.dropDatabase().catch(() => {});
  await mongoose.disconnect();
}

async function api(token, method, path, body, opts) {
  const r = await fetch(base + path, {
    method,
    headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}, (opts && opts.headers) || {}),
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const ct = r.headers.get('content-type') || '';
  const out = { status: r.status, headers: r.headers };
  if (ct.includes('json')) out.json = await r.json(); else out.buf = Buffer.from(await r.arrayBuffer());
  return out;
}
const rpc = (t, api_, method, args) => api(t, 'POST', '/api/rpc', { api: api_, method, args });

/* raw request (binary body / binary response) */
async function raw(token, method, path, buf) {
  const r = await fetch(base + path, {
    method,
    headers: Object.assign({ 'Content-Type': 'application/octet-stream' }, token ? { Authorization: 'Bearer ' + token } : {}),
    body: buf
  });
  const ct = r.headers.get('content-type') || '';
  const out = { status: r.status };
  if (ct.includes('json')) out.json = await r.json(); else out.buf = Buffer.from(await r.arrayBuffer());
  return out;
}

module.exports = { start, stop, api, rpc, raw, hits };
