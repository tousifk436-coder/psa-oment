'use strict';

/* Engine methods that only read. Everything else changes data, so the
   response also carries a fresh snapshot for the frontend cache. */
const READ_ONLY = /^(get|peek|list|compute|slab|project|milestone|employee|scan|canStart|moneyVisible|focusQueue)/;

/* Error code → HTTP status (codes are documented in DATAAPI.md) */
const ERROR_STATUS = {
  VALIDATION: 400, ERROR: 400, BAD_JSON: 400,
  AUTH: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  DUPLICATE: 409, HAS_DEPENDENTS: 409, INVALID_STATE: 409, IMMUTABLE: 409, NOT_AGREED: 409,
  BLOCKED: 409, WIP_LIMIT: 409, WINDOW_CLOSED: 409, ALREADY_INVOICED: 409,
  INSUFFICIENT_BALANCE: 409, CONFLICT: 409,
  LOCKED: 423,
  RATE_LIMIT: 429,
  NOT_CONFIGURED: 503, DB_UNAVAILABLE: 503
};

module.exports = { READ_ONLY, ERROR_STATUS };
