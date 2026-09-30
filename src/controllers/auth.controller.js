/* Auth controller — login, me, change / forgot / reset password */
'use strict';
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const auth = require('../services/auth.service');
const access = require('../services/access.service');
const engine = require('../services/engine.service');
const store = require('../services/store.service');

/* POST /api/auth/login  { username, password } */
exports.login = asyncHandler(async (req, res) => {
  const { username, password } = req.body || {};
  /* first login of an old employee upgrades its hash → run as a unit of work */
  const out = await access.unitOfWork(async () => auth.login(username, password));
  res.json(Object.assign({ ok: true }, out));
});

/* POST /api/auth/logout — tokens are stateless; the client drops it */
exports.logout = (req, res) => res.json({ ok: true });

/* GET /api/auth/me */
exports.me = (req, res) => {
  const u = req.user;
  const D = engine.get().DataAPI.raw();
  const cred = store.getAuth(u.role === 'ADMIN' ? 'admin' : 'emp:' + u.empId);
  let profile = null;
  if (u.role === 'EMPLOYEE') {
    const e = D.employees.find(x => x.id === u.empId);
    if (e) profile = { id: e.id, name: e.name, role: e.role, email: e.email, username: e.username, avatarInitials: e.avatarInitials, deptId: e.deptId };
  } else {
    profile = { id: D.adminUser && D.adminUser.id, name: (D.adminUser && D.adminUser.name) || 'Admin' };
  }
  res.json({ ok: true, user: Object.assign({}, u, { mustChange: !!(cred && cred.mustChange), profile }) });
};

/* POST /api/auth/change-password  { oldPassword, newPassword } */
exports.changePassword = asyncHandler(async (req, res) => {
  const { oldPassword, newPassword } = req.body || {};
  await access.unitOfWork(async () => auth.changeOwnPassword(req.user, oldPassword, newPassword));
  res.json({ ok: true });
});

/* POST /api/auth/forgot-password  { username }  (username or email) */
exports.forgotPassword = asyncHandler(async (req, res) => {
  const id = (req.body || {}).username || (req.body || {}).email;
  if (!id) throw new ApiError('VALIDATION', 'Enter your username or email');
  await access.unitOfWork(async () => auth.requestPasswordReset(id));
  res.json({ ok: true, message: 'If that account exists and has an email address, a reset link has been sent.' });
});

/* POST /api/auth/reset-password  { token, newPassword } */
exports.resetPassword = asyncHandler(async (req, res) => {
  const { token, newPassword } = req.body || {};
  if (!token) throw new ApiError('VALIDATION', 'Reset token is missing');
  const out = await access.unitOfWork(async () => auth.resetPassword(token, newPassword));
  res.json(Object.assign({ ok: true }, out));
});
