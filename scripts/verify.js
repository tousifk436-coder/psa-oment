/* ============================================================================
   VERIFY — deployment check (read-only)
     npm run verify
   MongoDB connection · data loaded · every route mounted · email setup
   ============================================================================ */
'use strict';
const env = require('../src/config/env');
const { bootstrap } = require('../src/bootstrap');
const { disconnectDB } = require('../src/config/db');
const engine = require('../src/services/engine.service');
const store = require('../src/services/store.service');
const email = require('../src/services/email.service');
const { createApp } = require('../src/app');
const listRoutes = require('../src/utils/listRoutes');

(async () => {
  const line = (ok, msg, warn) => console.log((ok ? '  ✓ ' : warn ? '  ! ' : '  ✗ ') + msg);
  let bad = 0;
  console.log('\nOment backend — verify\n');
  await bootstrap();
  line(true, 'MongoDB connected, transactions: ' + (store.usesTransactions() ? 'yes' : 'no (standalone server — fine)'));
  const D = engine.get().DataAPI.raw();
  line(true, `Data: ${D.employees.length} employees, ${D.projects.length} projects, ${D.deliverables.length} tasks, ${D.invoices.length} invoices, ${D.attendance.length} attendance days`);
  line(!!store.getAuth('admin'), 'Admin login present (' + env.ADMIN_USERNAME + ')');
  const routes = listRoutes(createApp());
  line(routes.length >= 160, routes.length + ' API routes mounted');
  const adminMail = email.adminAddress();
  if (!adminMail) bad++;
  line(!!adminMail, 'Admin email: ' + (adminMail || 'NOT SET — set ADMIN_EMAIL in .env or Settings → Billing email'));
  if (email.smtpConfigured()) {
    try {
      await email.getTransport().verify();
      line(true, 'SMTP login OK (' + (env.SMTP.host || env.SMTP.service) + ')');
    } catch (e) { bad++; line(false, 'SMTP failed: ' + e.message); }
  } else line(true, 'SMTP not set — emails are printed in the server console (set SMTP_SERVICE or SMTP_HOST to send real email)');
  const noMail = D.employees.filter(e => e.active !== false && !email.isEmail(e.email));
  line(!noMail.length, noMail.length ? noMail.length + ' active employee(s) have no valid email: ' + noMail.map(e => e.name).join(', ') : 'Every active employee has an email address');
  line(!/CHANGE_THIS/.test(env.JWT_SECRET) && env.JWT_SECRET.length >= 32, 'JWT_SECRET is ' + (env.JWT_SECRET.length >= 32 && !/CHANGE_THIS/.test(env.JWT_SECRET) ? 'strong' : 'weak — change it before going live'), true);
  line(env.ADMIN_PASSWORD !== 'admin123', 'ADMIN_PASSWORD is ' + (env.ADMIN_PASSWORD === 'admin123' ? 'the default — change it before going live' : 'changed'), true);
  console.log('\n' + (bad ? 'Finished with problems above.' : 'All good.') + '\n');
  await disconnectDB();
  process.exit(bad ? 1 : 0);
})().catch(async e => { console.error('Verify failed:', e.message); await disconnectDB().catch(() => {}); process.exit(1); });
