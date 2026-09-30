/* Dashboard & analytics controller — each handler runs one business-engine method.
   Access rules, the unit of work and emails are applied in access.service. */
'use strict';
const { run } = require('../utils/engineHandler');
const { num } = require('../utils/parse');

exports.getActivity = run('DataAPI', 'getActivity');
exports.getCallLogs = run('DataAPI', 'getCallLogs');
exports.getKpis = run('DataAPI', 'getKpis');
exports.getRevenueSeries = run('DataAPI', 'getRevenueSeries', req => [num(req.query.monthsBack)]);
