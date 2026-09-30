/* ============================================================================
   SEED — reset the database
     npm run seed                 demo company (sample employees, projects …)
     npm run seed -- --empty      blank company (only the admin login)
   Asks for --yes when the database already has data.
   ============================================================================ */
'use strict';
const env = require('../src/config/env');
const { bootstrap } = require('../src/bootstrap');
const { disconnectDB } = require('../src/config/db');
const store = require('../src/services/store.service');
const engine = require('../src/services/engine.service');
const admin = require('../src/services/admin.service');

(async () => {
  const mode = process.argv.includes('--empty') ? 'empty' : 'demo';
  await bootstrap({ engine: { demo: mode === 'demo' } });
  const D = engine.get().DataAPI.raw();
  const hasData = !engine.wasCreatedFresh() && ((D.employees || []).length || (D.projects || []).length || (D.invoices || []).length);
  if (hasData && !process.argv.includes('--yes')) {
    console.log(`\nDatabase "${env.MONGO_DB_NAME || '(from URI)'}" already has data (${D.employees.length} employees, ${D.projects.length} projects).`);
    console.log(`This will DELETE everything and load the ${mode} data. Run again with --yes to confirm:\n`);
    console.log(`  npm run seed -- ${mode === 'empty' ? '--empty ' : ''}--yes\n`);
    await disconnectDB();
    process.exit(1);
  }
  await admin.resetWorkspace(mode);
  await store.flush();
  const X = engine.get().DataAPI.raw();
  console.log(`Seeded (${mode}): ${X.employees.length} employees, ${X.projects.length} projects, ${X.deliverables.length} tasks.`);
  console.log(`Admin login: ${env.ADMIN_USERNAME} / (ADMIN_PASSWORD from .env)` + (mode === 'demo' ? '   ·   Demo employees: alex, priya, rohan … / oment123' : ''));
  await disconnectDB();
  process.exit(0);
})().catch(async e => { console.error('Seed failed:', e.message); await disconnectDB().catch(() => {}); process.exit(1); });
