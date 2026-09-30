/* Integrations — CRM "deal won" webhook and account health */
'use strict';
const crypto = require('crypto');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const env = require('../config/env');
const auth = require('../services/auth.service');
const crm = require('../services/crm.service');

/* Allowed with header X-Webhook-Secret = CRM_WEBHOOK_SECRET, or an admin JWT */
exports.guard = (req, res, next) => {
  const secret = req.get('x-webhook-secret');
  if (secret && env.CRM_WEBHOOK_SECRET) {
    const a = Buffer.from(secret), b = Buffer.from(env.CRM_WEBHOOK_SECRET);
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) return next();
    return next(new ApiError('AUTH', 'Bad webhook secret'));
  }
  const h = req.headers.authorization || '';
  try {
    const u = auth.verifyToken(h.startsWith('Bearer ') ? h.slice(7) : '');
    if (u.role === 'ADMIN') { req.user = u; return next(); }
  } catch (e) { /* fall through */ }
  next(new ApiError('AUTH', env.CRM_WEBHOOK_SECRET ? 'Send X-Webhook-Secret or an admin token' : 'Set CRM_WEBHOOK_SECRET in .env (or use an admin token)'));
};

/* POST /api/integrations/crm/deal-won — body: see shared/integrations/crm.js */
exports.dealWon = asyncHandler(async (req, res) => {
  const project = await crm.importWonDeal(req.body || {});
  res.status(201).json({ ok: true, result: project });
});

/* GET /api/integrations/crm/accounts/:accountId/health */
exports.accountHealth = (req, res) => res.json({ ok: true, result: crm.accountHealth(req.params.accountId) });

/* GET /api/integrations/crm/sample — example payload */
exports.sample = (req, res) => res.json({ ok: true, result: crm.sampleDeal() });
