/* ============================================================================
   CRM SERVICE — "deal won" webhook → project + milestones
   Uses shared/integrations/crm.js (the agreed contract) inside the engine.
   ============================================================================ */
'use strict';
const engine = require('./engine.service');
const ApiError = require('../utils/ApiError');

async function importWonDeal(payload) {
  const access = require('./access.service');
  return access.unitOfWork(async () => {
    const ctx = engine.get();
    const Crm = ctx.CrmIntegration;
    if (!Crm) throw new ApiError('NOT_CONFIGURED', 'CRM integration is not loaded');
    const problems = Crm.validateDeal(payload || {});
    if (problems && problems.length) throw new ApiError('VALIDATION', problems.join('; '));
    const project = await Crm.importWonDeal(payload);
    ctx.DataAPI.touch();
    return project;
  });
}

function accountHealth(accountId) {
  const Crm = engine.get().CrmIntegration;
  if (!Crm) throw new ApiError('NOT_CONFIGURED', 'CRM integration is not loaded');
  return Crm.getAccountHealth(accountId);
}

function sampleDeal() {
  const Crm = engine.get().CrmIntegration;
  return Crm && Crm.sampleDeal ? Crm.sampleDeal() : null;
}

module.exports = { importWonDeal, accountHealth, sampleDeal };
