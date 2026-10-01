/* Een — AI assistant proxy + problem detectors */
'use strict';
const asyncHandler = require('../utils/asyncHandler');
const access = require('../services/access.service');
const een = require('../services/een.service');

/* GET /api/een/status */
exports.status = (req, res) => res.json({ ok: true, result: een.status() });

/* POST /api/een/chat  { model, payload } — returns Gemini's JSON as-is */
exports.chat = asyncHandler(async (req, res) => {
  const { status, json } = await een.chat(req.body);
  res.status(status).json(json);
});

/* GET /api/signals — 18 rule-based problem detectors for this user */
exports.signals = asyncHandler(async (req, res) => {
  const admin = req.user.role === 'ADMIN';
  const result = await access.call(req.user, 'EenSignals', admin ? 'scanForAdmin' : 'scanForEmployee', admin ? [] : [req.user.empId]);
  res.json({ ok: true, result });
});




