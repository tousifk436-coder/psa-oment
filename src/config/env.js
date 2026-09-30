/* ============================================================================
   ENV — every setting comes from .env (see .env.example)
   ============================================================================ */
'use strict';
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const bool = (v, def) => (v === undefined || v === '' ? def : /^(1|true|yes|on)$/i.test(String(v)));
const int = (v, def) => (Number.isFinite(parseInt(v, 10)) ? parseInt(v, 10) : def);
const list = v => String(v || '').split(',').map(s => s.trim()).filter(Boolean);
const trimSlash = v => String(v || '').replace(/\/+$/, '');

const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: int(process.env.PORT, 5000),

  /* MongoDB */
  MONGO_URI: process.env.MONGO_URI || process.env.MONGODB_URI || '',
  MONGO_DB_NAME: process.env.MONGO_DB_NAME || process.env.MONGODB_DB_NAME || '',
  MONGO_TRANSACTIONS: (process.env.MONGO_TRANSACTIONS || 'auto').toLowerCase(),   // auto | on | off
  SEED_DEMO_DATA: bool(process.env.SEED_DEMO_DATA, true),                        // only used on an EMPTY database

  /* Auth */
  JWT_SECRET: process.env.JWT_SECRET || '',
  JWT_EXPIRES: process.env.JWT_EXPIRES || '12h',
  ADMIN_USERNAME: String(process.env.ADMIN_USERNAME || 'admin').toLowerCase().trim(),
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || '',
  ADMIN_EMAIL: process.env.ADMIN_EMAIL || '',                  // admin alerts; falls back to Settings → email
  RESET_TOKEN_MINUTES: int(process.env.RESET_TOKEN_MINUTES, 30),

  /* HTTP */
  CORS_ORIGIN: list(process.env.CORS_ORIGIN || '*'),
  JSON_LIMIT: process.env.JSON_LIMIT || '10mb',
  APP_URL: trimSlash(process.env.APP_URL || 'http://localhost:5500'),   // frontend base, used in email links

  /* Email */
  SMTP: {
    service: (process.env.SMTP_SERVICE || '').trim().toLowerCase(),   // gmail | outlook | zoho | yahoo … (optional)
    host: process.env.SMTP_HOST || '',
    port: int(process.env.SMTP_PORT, 587),
    secure: bool(process.env.SMTP_SECURE, int(process.env.SMTP_PORT, 587) === 465),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || 'Oment <no-reply@example.com>'
  },
  EMAIL_ENABLED: bool(process.env.EMAIL_ENABLED, true),
  MAILER_INTERVAL_MS: int(process.env.MAILER_INTERVAL_MS, 15000),
  MAIL_MAX_ATTEMPTS: int(process.env.MAIL_MAX_ATTEMPTS, 5),

  /* Scheduler */
  TIMEZONE: process.env.TIMEZONE || 'Asia/Kolkata',
  SCHEDULER_ENABLED: bool(process.env.SCHEDULER_ENABLED, true),

  /* Integrations */
  CRM_WEBHOOK_SECRET: process.env.CRM_WEBHOOK_SECRET || '',
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  GEMINI_MODEL: process.env.GEMINI_MODEL || 'gemini-2.0-flash'
};
env.isProd = env.NODE_ENV === 'production';
/* the business engine uses local dates (today, due dates, attendance) — run
   the whole process in the company's time zone */
if (!process.env.TZ) process.env.TZ = env.TIMEZONE;
env.isTest = env.NODE_ENV === 'test';

/* Fail fast with a clear message instead of a cryptic crash later */
function validate() {
  const missing = [];
  if (!env.MONGO_URI) missing.push('MONGO_URI');
  if (!env.JWT_SECRET) missing.push('JWT_SECRET');
  if (!env.ADMIN_PASSWORD) missing.push('ADMIN_PASSWORD');
  if (missing.length) {
    const e = new Error('Missing required .env values: ' + missing.join(', ') + '. Copy .env.example to .env and fill them in.');
    e.code = 'CONFIG';
    throw e;
  }
  if (env.isProd && (env.JWT_SECRET.length < 32 || /^(admin123|change.?me.*)$/i.test(env.ADMIN_PASSWORD))) {
    const e = new Error('Production: JWT_SECRET must be 32+ characters and ADMIN_PASSWORD must be changed.');
    e.code = 'CONFIG';
    throw e;
  }
}

module.exports = Object.assign(env, { validate });
