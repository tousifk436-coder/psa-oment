/* ============================================================================
   ADMIN SERVICE — reset the whole workspace (Settings → Reset)
   ============================================================================ */
'use strict';
const store = require('./store.service');
const engine = require('./engine.service');
const auth = require('./auth.service');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');

/* mode: 'demo' (sample company) | 'empty' (blank company). Admin login stays. */
async function resetWorkspace(mode) {
  if (!['demo', 'empty'].includes(mode)) throw new ApiError('VALIDATION', "mode must be 'demo' or 'empty'");
  const access = require('./access.service');
  return access.exclusive(async () => {
    await store.wipe();
    store.listAuth().filter(c => c.subject !== 'admin').forEach(c => store.deleteAuth(c.subject));
    await store.flush();
    await engine.boot({ demo: mode === 'demo' });
    auth.bootstrapAdmin();
    await store.flush();
    logger.info(`Workspace reset (${mode})`);
    return { ok: true, mode };
  });
}

module.exports = { resetWorkspace };
