/* ============================================================================
   EEN AI SERVICE — Gemini proxy (the API key never reaches the browser)
   Accepts the frontend's proxy body { model, payload } or a raw Gemini body.
   ============================================================================ */
'use strict';
const env = require('../config/env');
const ApiError = require('../utils/ApiError');

function status() {
  return { configured: !!env.GEMINI_API_KEY, model: env.GEMINI_MODEL };
}

async function chat(body) {
  if (!env.GEMINI_API_KEY) throw new ApiError('NOT_CONFIGURED', 'Set GEMINI_API_KEY in the backend .env to enable AI answers. Een still works without it using data-built answers.');
  body = body || {};
  const payload = body.payload && typeof body.payload === 'object' ? body.payload : body;
  const model = /^gemini-[\w.-]+$/.test(String(body.model || '')) ? body.model : env.GEMINI_MODEL;
  const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + encodeURIComponent(env.GEMINI_API_KEY), {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
  });
  const json = await r.json().catch(() => ({}));
  return { status: r.status, json };
}

module.exports = { status, chat };
