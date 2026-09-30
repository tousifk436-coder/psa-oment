/* Request parsing helpers */
'use strict';
/* '' / null / undefined → undefined, otherwise Number */
const num = v => (v === undefined || v === null || v === '' ? undefined : Number(v));
module.exports = { num };
