/* Small in-memory rate limiter (per IP + route) — slows down password guessing */
'use strict';
const ApiError = require('../utils/ApiError');

function rateLimit({ windowMs = 15 * 60 * 1000, max = 20, message = 'Too many attempts. Please wait a few minutes and try again.' } = {}) {
  const hits = new Map();
  setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (v.reset < now) hits.delete(k); }, windowMs).unref();
  return (req, res, next) => {
    const key = (req.ip || '') + '|' + req.baseUrl + req.path;
    const now = Date.now();
    let h = hits.get(key);
    if (!h || h.reset < now) { h = { n: 0, reset: now + windowMs }; hits.set(key, h); }
    h.n++;
    if (h.n > max) { res.set('Retry-After', String(Math.ceil((h.reset - now) / 1000))); return next(new ApiError('RATE_LIMIT', message)); }
    next();
  };
}

module.exports = rateLimit;
