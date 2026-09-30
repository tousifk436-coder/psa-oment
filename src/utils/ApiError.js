/* Error with a machine-readable code; the error middleware maps code → HTTP status */
'use strict';
class ApiError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
  }
}
module.exports = ApiError;
