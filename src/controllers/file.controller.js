/* Files — upload (raw body) and download with access check */
'use strict';
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const files = require('../services/file.service');

/* POST /api/files?name=report.pdf&mime=application/pdf&deliverableId=12
   body = the file bytes, sent as Content-Type: application/octet-stream */
exports.upload = asyncHandler(async (req, res) => {
  if (!Buffer.isBuffer(req.body)) throw new ApiError('VALIDATION', 'Send the file as the request body');
  const result = await files.upload(req.body, {
    name: req.query.name, mime: req.query.mime || req.get('content-type'), deliverableId: req.query.deliverableId,
    subject: req.user.subject, role: req.user.role
  });
  res.status(201).json({ ok: true, result });
});

/* GET /api/files/:id  (?download=1 to force download) */
exports.download = asyncHandler(async (req, res) => {
  const f = await files.info(req.params.id);
  if (!files.canRead(req.user, f)) throw new ApiError('FORBIDDEN', 'You cannot open this file');
  res.set({
    'Content-Type': f.contentType || 'application/octet-stream',
    'Content-Length': f.length,
    'Content-Disposition': (req.query.download ? 'attachment' : 'inline') + '; filename="' + encodeURIComponent(f.filename).replace(/%20/g, ' ') + '"',
    'Cache-Control': 'private, max-age=3600'
  });
  files.stream(f).on('error', () => res.end()).pipe(res);
});
