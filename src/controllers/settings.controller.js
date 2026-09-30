/* Company settings controller — each handler runs one business-engine method.
   Access rules, the unit of work and emails are applied in access.service. */
'use strict';
const { run } = require('../utils/engineHandler');

exports.getSettings = run('DataAPI', 'getSettings');
exports.updateSettings = run('DataAPI', 'updateSettings', req => [req.body]);
