/* ============================================================================
   OMENT BACKEND — entry point
     npm install
     cp .env.example .env     (fill in MONGO_URI, JWT_SECRET, ADMIN_PASSWORD …)
     npm start
   ============================================================================ */
'use strict';
const env = require('./src/config/env');
const { bootstrap } = require('./src/bootstrap');
const { createApp } = require('./src/app');
const { disconnectDB } = require('./src/config/db');
const store = require('./src/services/store.service');
const scheduler = require('./src/services/scheduler.service');
const logger = require('./src/utils/logger');

async function main() {
  await bootstrap();
  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info(`Oment API → http://localhost:${env.PORT}/api/health`);
    logger.info(`Admin login: ${env.ADMIN_USERNAME}  ·  Email: ${env.SMTP.host || env.SMTP.service ? 'SMTP ' + (env.SMTP.host || env.SMTP.service) : 'console only (set SMTP_SERVICE or SMTP_HOST)'}`);
  });
  scheduler.start();

  const shutdown = sig => {
    logger.info(`${sig} received — shutting down`);
    scheduler.stop();
    server.close(async () => {
      try { await store.flush(); await disconnectDB(); } finally { process.exit(0); }
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('unhandledRejection', e => logger.error('Unhandled rejection:', e));
}

main().catch(e => {
  logger.error('Boot failed:', e && e.message ? e.message : e);
  if (e && e.code !== 'CONFIG') logger.error(e && e.stack);
  process.exit(1);
});
