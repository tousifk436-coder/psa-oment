/* Email controller — settings, log, retry, test (admin only) */
'use strict';
const asyncHandler = require('../utils/asyncHandler');
const access = require('../services/access.service');
const email = require('../services/email.service');

/* GET /api/settings/email */
exports.getSettings = (req, res) => res.json({ ok: true, result: email.publicSettings() });

/* PATCH /api/settings/email { enabled, adminEmail, categories: { tasks: false, ... } } */
exports.updateSettings = asyncHandler(async (req, res) => {
  const result = await access.unitOfWork(async () => email.updateSettings(req.body || {}));
  res.json({ ok: true, result });
});

/* GET /api/emails?status=&category=&to=&page=&limit= */
exports.list = (req, res) => res.json({ ok: true, result: email.list(req.query) });

/* GET /api/emails/:id — includes the HTML */
exports.getOne = asyncHandler(async (req, res) => res.json({ ok: true, result: email.getOne(req.params.id) }));

/* POST /api/emails/:id/retry */
exports.retry = asyncHandler(async (req, res) => {
  const result = await access.unitOfWork(async () => email.retry(req.params.id));
  email.drain().catch(() => {});
  res.json({ ok: true, result });
});

/* POST /api/emails/test { to } */
exports.test = asyncHandler(async (req, res) => {
  res.json(Object.assign({}, await email.sendTest((req.body || {}).to)));
});

/* POST /api/emails/process — send queued emails now */
exports.processNow = asyncHandler(async (req, res) => {
  res.json({ ok: true, processed: await email.drain() });
});
