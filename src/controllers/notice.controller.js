/* Notices controller — each handler runs one business-engine method.
   Access rules, the unit of work and emails are applied in access.service. */
'use strict';
const { run } = require('../utils/engineHandler');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const engine = require('../services/engine.service');
const pdf = require('../services/pdf.service');
const { num } = require('../utils/parse');

exports.getNotices = run('DataAPI', 'getNotices');

/* GET /notices/:id/pdf — admin, or an employee the notice was sent to */
exports.downloadPdf = asyncHandler(async (req, res) => {
  const D = engine.get().DataAPI.raw();
  const n = (D.notices || []).find(x => String(x.id) === String(req.params.id));
  if (!n) throw new ApiError('NOT_FOUND', 'Notice not found');
  if (req.user.role !== 'ADMIN') {
    const targets = [].concat(n.readBy || [], n.notReadBy || []).map(Number);
    const explicit = Array.isArray(n.recipients) ? n.recipients.map(Number) : [];
    const mine = String(n.status).toUpperCase() === 'SENT' &&
      (targets.includes(Number(req.user.empId)) || n.recipients === 'all' || explicit.includes(Number(req.user.empId)));
    if (!mine) throw new ApiError('FORBIDDEN', 'This notice was not sent to you');
  }
  const buf = await pdf.noticePdf(n, D.settings || D.company);
  res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="Notice.pdf"', 'Content-Length': buf.length });
  res.end(buf);
});
exports.createNotice = run('DataAPI', 'createNotice', req => [req.body]);
exports.updateNotice = run('DataAPI', 'updateNotice', req => [req.params.id, req.body]);
exports.sendNotice = run('DataAPI', 'sendNotice', req => [req.params.id]);
exports.markRead = run('DataAPI', 'markNoticeRead', req => [req.params.id, num(req.body.employeeId)]);
exports.deleteNotice = run('DataAPI', 'deleteNotice', req => [req.params.id]);
