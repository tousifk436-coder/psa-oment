/* Tiny logger — quiet during tests */
'use strict';
const silent = () => process.env.NODE_ENV === 'test';
const stamp = () => new Date().toISOString();
module.exports = {
  info: (...a) => { if (!silent()) console.log(stamp(), 'INFO ', ...a); },
  warn: (...a) => { if (!silent()) console.warn(stamp(), 'WARN ', ...a); },
  error: (...a) => console.error(stamp(), 'ERROR', ...a)
};
