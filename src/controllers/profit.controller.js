/* Profitability controller — each handler runs one business-engine method.
   Access rules, the unit of work and emails are applied in access.service. */
'use strict';
const { run } = require('../utils/engineHandler');
const { num } = require('../utils/parse');

exports.getSettings = run('Profit', 'getSettings');
exports.updateSettings = run('Profit', 'updateSettings', req => [req.body]);
exports.setEmployeeRates = run('Profit', 'setEmployeeRates', req => [num(req.params.employeeId), req.body]);
exports.getRateCoverage = run('Profit', 'getRateCoverage');
exports.getProject = run('Profit', 'getProject', req => [num(req.params.id)]);
exports.getPortfolio = run('Profit', 'getPortfolio');
exports.getByClient = run('Profit', 'getByClient');
exports.getByEmployee = run('Profit', 'getByEmployee', req => [req.query.from, req.query.to]);
exports.getAlerts = run('Profit', 'getAlerts');
exports.getLoadedRate = run('Profit', 'loadedRateOf', req => [num(req.params.employeeId)]);
