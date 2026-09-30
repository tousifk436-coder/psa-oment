/* 404 + central error handler → { error: { code, message } } */
'use strict';
const { ERROR_STATUS } = require('../utils/constants');
const logger = require('../utils/logger');

function notFound(req, res) {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: `No such endpoint: ${req.method} ${req.originalUrl}` } });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err && err.type === 'entity.parse.failed') return res.status(400).json({ error: { code: 'BAD_JSON', message: 'Request body is not valid JSON' } });
  if (err && err.type === 'entity.too.large') return res.status(413).json({ error: { code: 'TOO_LARGE', message: 'Request body is too large' } });
  const code = (err && err.code) || 'INTERNAL';
  const status = ERROR_STATUS[code] || 500;
  if (status === 500) logger.error(req.method, req.originalUrl, err && err.stack || err);
  res.status(status).json({ error: { code: status === 500 ? 'INTERNAL' : code, message: status === 500 ? 'Internal server error' : err.message } });
}

module.exports = { notFound, errorHandler };
