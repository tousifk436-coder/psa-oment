/* System controller — health, snapshot, RPC (the frontend's main door) */
'use strict';
const mongoose = require('mongoose');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const access = require('../services/access.service');
const { snapFor, isMutation } = require('../utils/engineHandler');

/* GET /api/health (public) */
exports.health = (req, res) => {
  const up = mongoose.connection.readyState === 1;
  res.status(up ? 200 : 503).json({ ok: up, name: 'oment-backend', database: up ? 'connected' : 'disconnected', time: new Date().toISOString() });
};

/* GET /api/snapshot — everything this user may see (role-filtered) */
exports.snapshot = (req, res) => res.json({ ok: true, snapshot: snapFor(req.user) });

/* POST /api/rpc { api, method, args } — runs any engine method (same guards
   as the REST endpoints). The frontend adapter uses this for every action. */
exports.rpc = asyncHandler(async (req, res) => {
  const { api, method, args } = req.body || {};
  if (!api || !method) throw new ApiError('VALIDATION', 'api and method are required');
  if (args !== undefined && !Array.isArray(args)) throw new ApiError('VALIDATION', 'args must be an array');
  const result = await access.call(req.user, String(api), String(method), args || []);
  const body = { ok: true, result };
  if (isMutation(method)) body.snapshot = snapFor(req.user);
  res.json(body);
});
