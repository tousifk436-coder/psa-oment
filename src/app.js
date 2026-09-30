/* ============================================================================
   EXPRESS APP — middleware + routes (no database work here; see index.js)
   ============================================================================ */
'use strict';
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const env = require('./config/env');
const routes = require('./routes');
const { notFound, errorHandler } = require('./middleware/error.middleware');

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({
    origin: env.CORS_ORIGIN.includes('*') ? true : env.CORS_ORIGIN,
    credentials: true,
    exposedHeaders: ['Content-Disposition']
  }));
  app.use(express.json({ limit: env.JSON_LIMIT }));
  app.use(express.urlencoded({ extended: true, limit: env.JSON_LIMIT }));
  if (!env.isTest) app.use(morgan(env.isProd ? 'combined' : 'dev', { skip: req => req.path === '/api/attendance/heartbeat' }));

  app.get('/', (req, res) => res.json({ ok: true, name: 'oment-backend', docs: '/api/health — see API.md' }));
  app.use('/api', routes);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
