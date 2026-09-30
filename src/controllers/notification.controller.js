/* In-app notifications controller — each handler runs one business-engine method.
   Access rules, the unit of work and emails are applied in access.service. */
'use strict';
const { run } = require('../utils/engineHandler');
const { num } = require('../utils/parse');

exports.getNotifications = run('DataAPI', 'getNotifications', req => [num(req.query.recipientId)]);
exports.markRead = run('DataAPI', 'markNotificationRead', req => [req.params.id]);
exports.markAllRead = run('DataAPI', 'markAllNotificationsRead', req => [num(req.body.recipientId)]);
