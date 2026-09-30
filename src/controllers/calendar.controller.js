/* Calendar controller — each handler runs one business-engine method.
   Access rules, the unit of work and emails are applied in access.service. */
'use strict';
const { run } = require('../utils/engineHandler');

exports.getEvents = run('DataAPI', 'getCalendarEvents');
exports.createEvent = run('DataAPI', 'createCalendarEvent', req => [req.body]);
exports.deleteEvent = run('DataAPI', 'deleteCalendarEvent', req => [req.params.id]);
