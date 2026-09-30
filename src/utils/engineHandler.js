/* Build an Express controller that runs one engine method through the
   access service (guards + unit of work + emails) and sends the standard
   response: { ok, result, snapshot? } */
'use strict';
const access = require('../services/access.service');
const snapshot = require('../services/snapshot.service');
const engine = require('../services/engine.service');
const asyncHandler = require('./asyncHandler');
const { READ_ONLY } = require('./constants');

function snapFor(user) {
  const ctx = engine.get();
  return user.role === 'ADMIN' ? snapshot.adminSnapshot(ctx) : snapshot.employeeSnapshot(ctx, user.empId);
}

function isMutation(method) { return !READ_ONLY.test(String(method)); }

function run(api, method, argsFrom) {
  return asyncHandler(async (req, res) => {
    const args = argsFrom ? argsFrom(req) : [];
    const result = await access.call(req.user, api, method, args);
    const body = { ok: true, result };
    if (isMutation(method)) body.snapshot = snapFor(req.user);
    res.json(body);
  });
}

module.exports = { run, snapFor, isMutation };
