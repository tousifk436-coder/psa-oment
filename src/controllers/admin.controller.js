/* Admin tools — workspace reset, scheduler status / run now */
'use strict';
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const admin = require('../services/admin.service');
const scheduler = require('../services/scheduler.service');
const { snapFor } = require('../utils/engineHandler');

/* POST /api/admin/reset { mode: 'demo'|'empty', confirm: 'RESET' } */
exports.reset = asyncHandler(async (req, res) => {
  const { mode, confirm } = req.body || {};
  if (confirm !== 'RESET') throw new ApiError('VALIDATION', 'Send confirm: "RESET" to wipe all data');
  const result = await admin.resetWorkspace(mode || 'demo');
  res.json({ ok: true, result, snapshot: snapFor(req.user) });
});

/* GET /api/admin/scheduler */
exports.schedulerStatus = (req, res) => res.json({ ok: true, result: scheduler.status() });

/* POST /api/admin/scheduler/:job/run */
exports.runJob = asyncHandler(async (req, res) => {
  res.json({ ok: true, result: await scheduler.runNow(req.params.job) });
});
