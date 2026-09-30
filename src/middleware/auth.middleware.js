/* JWT guard. Sets req.user = { subject, role, name, empId } */
'use strict';
const auth = require('../services/auth.service');
const engine = require('../services/engine.service');
const ApiError = require('../utils/ApiError');

function protect(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return next(new ApiError('AUTH', 'Missing token'));
  let user;
  try { user = auth.verifyToken(token); } catch (e) { return next(new ApiError('AUTH', 'Invalid or expired token')); }
  /* a deactivated / deleted employee loses access immediately */
  if (user.role === 'EMPLOYEE') {
    const emp = engine.get().DataAPI.raw().employees.find(e => e.id === user.empId);
    if (!emp || emp.active === false || emp.canLogin === false) return next(new ApiError('AUTH', 'Your account is not active'));
  }
  req.user = user;
  next();
}

function adminOnly(req, res, next) {
  if (!req.user || req.user.role !== 'ADMIN') return next(new ApiError('FORBIDDEN', 'Admin only'));
  next();
}

module.exports = { protect, adminOnly };
