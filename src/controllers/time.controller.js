/* Task timer controller — each handler runs one business-engine method.
   Access rules, the unit of work and emails are applied in access.service. */
"use strict";
const { run } = require("../utils/engineHandler");
const { num } = require("../utils/parse");

exports.startTimer = run("DataAPI", "startTimer", (req) => [
  num(req.body.employeeId),
  num(req.body.deliverableId),
]);
exports.stopTimer = run("DataAPI", "stopTimer", (req) => [
  num(req.body.employeeId),
]);
exports.getOpenTimer = run("DataAPI", "getOpenTimer", (req) => [
  num(req.query.employeeId),
]);
