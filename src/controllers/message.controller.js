/* Messages (conversations) controller — each handler runs one business-engine method.
   Access rules, the unit of work and emails are applied in access.service. */
'use strict';
const { run } = require('../utils/engineHandler');
const { num } = require('../utils/parse');

exports.getConversations = run('DataAPI', 'getConversations');
exports.sendMessage = run('DataAPI', 'sendMessage', req => [req.params.id, num(req.body.fromId), req.body.text]);
exports.markRead = run('DataAPI', 'markConversationRead', req => [req.params.id]);
