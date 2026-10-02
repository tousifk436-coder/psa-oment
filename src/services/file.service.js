/* ============================================================================
   FILE SERVICE — real file storage in MongoDB (GridFS, bucket "uploads")
   ----------------------------------------------------------------------------
   Task brief files (admin → employee) and submission files (employee → admin)
   are stored here; tasks only keep a small reference { fileId, name, size }.
   Max 50 MB per file. Nothing extra to install — it uses your MongoDB.
   ============================================================================ */
'use strict';
const mongoose = require('mongoose');
const engine = require('./engine.service');
const ApiError = require('../utils/ApiError');

const MAX_BYTES = 50 * 1024 * 1024;
let bucket = null;
function getBucket() {
  if (!bucket) bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'uploads' });
  return bucket;
}

const cleanName = n => String(n || 'file').replace(/[\\/\r\n"]/g, '_').slice(0, 180) || 'file';

async function upload(buffer, meta) {
  if (!buffer || !buffer.length) throw new ApiError('VALIDATION', 'The file is empty');
  if (buffer.length > MAX_BYTES) throw new ApiError('VALIDATION', 'File is larger than 50 MB');
  const name = cleanName(meta.name);
  const mime = String(meta.mime || 'application/octet-stream').slice(0, 120);
  return new Promise((resolve, reject) => {
    const up = getBucket().openUploadStream(name, {
      contentType: mime,
      metadata: { uploadedBy: meta.subject, uploaderRole: meta.role, deliverableId: meta.deliverableId == null ? null : Number(meta.deliverableId) }
    });
    up.on('error', reject);
    up.on('finish', () => resolve({ fileId: String(up.id), name, mime, sizeBytes: buffer.length, uploadedAt: new Date().toISOString() }));
    up.end(buffer);
  });
}

async function info(fileId) {
  let id;
  try { id = new mongoose.Types.ObjectId(String(fileId)); } catch (e) { throw new ApiError('NOT_FOUND', 'File not found'); }
  const f = await getBucket().find({ _id: id }).next();
  if (!f) throw new ApiError('NOT_FOUND', 'File not found');
  return f;
}

/* admin: everything · employee: files they uploaded, or files on their own tasks */
function canRead(user, file) {
  if (user.role === 'ADMIN') return true;
  if (file.metadata && file.metadata.uploadedBy === user.subject) return true;
  const id = String(file._id);
  const D = engine.get().DataAPI.raw();
  const onTask = (D.deliverables || []).some(d => (d.assigneeIds || []).includes(user.empId) &&
    [].concat(d.briefFiles || [], d.submissionFiles || []).some(f => f && String(f.fileId) === id));
  /* attachments of a notice that was sent to this employee */
  const onNotice = (D.notices || []).some(n => String(n.status).toUpperCase() === 'SENT' &&
    [].concat(n.readBy || [], n.notReadBy || []).includes(user.empId) &&
    (n.attachments || []).some(a => a && String(a.fileId) === id));
  return onTask || onNotice;
}

function stream(file) {
  return getBucket().openDownloadStream(file._id);
}

module.exports = { upload, info, canRead, stream, MAX_BYTES };