/* ============================================================================
   ENGINE SERVICE — the business rules
   ----------------------------------------------------------------------------
   All business logic (projects, tasks, timers, attendance, leave, payroll
   wallet, invoices, profitability …) lives in shared/*.js — the SAME code the
   frontend was built and tested against. It runs here inside a Node vm, and
   its localStorage is backed by MongoDB through store.service.

   Why not re-write it: those rules are thousands of lines of tested money,
   leave and payroll logic. Running the one proven copy on the server means
   the API behaves exactly like the app always did.
   ============================================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const store = require('./store.service');
const env = require('../config/env');
const logger = require('../utils/logger');

const SHARED = path.join(__dirname, '..', '..', 'shared');
const FILES = ['utils.js', 'schema.js', 'seed.js', 'data.js', 'wallet.js', 'penalties.js', 'hrm.js', 'profitability.js', 'een-signals.js', 'integrations/crm.js'];
const STORAGE_KEY = 'oment_psa_db_v2';

/* Lists emptied when starting a real company with no demo data */
const BUSINESS_LISTS = ['employees', 'departments', 'projects', 'milestones', 'deliverables', 'subtasks',
  'timeEntries', 'attendance', 'invoices', 'notices', 'conversations', 'calendarEvents', 'notifications',
  'activity', 'callLogs', 'leaveRequests', 'regularisations', 'compOffLedger', 'walletEntries', 'disputes', 'outbox', 'recurringInvoices'];

let ctx = null;
let createdFresh = false;       // true when this boot started from an empty database

function localStorageStub() {
  return {
    getItem(key) {
      if (key !== STORAGE_KEY) return store.getLs(key);
      if (store.isEmpty()) return null;              // engine creates a fresh DB
      return JSON.stringify(store.loadAll());
    },
    setItem(key, value) {
      if (key !== STORAGE_KEY) return store.setLs(key, value);
      store.saveAll(JSON.parse(value));
    },
    removeItem(key) {
      if (key !== STORAGE_KEY) store.removeLs(key);
    }
  };
}

/* opts.demo: true = demo company, false = empty company (only on an empty DB) */
async function boot(opts) {
  opts = opts || {};
  const wasEmpty = store.isEmpty();
  createdFresh = wasEmpty;
  /* Utils.sanitizeHtml needs a DOM — jsdom gives the server the same
     behaviour as the browser. */
  const { JSDOM } = require('jsdom');
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  const sandbox = {
    console, Date, Math, JSON, Promise, setTimeout, clearTimeout, setInterval, clearInterval,
    Number, String, Boolean, Array, Object, RegExp, Error, parseInt, parseFloat, isNaN, isFinite,
    encodeURIComponent, decodeURIComponent,
    localStorage: localStorageStub(),
    document: dom.window.document,
    navigator: { language: 'en-IN' }
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(SHARED, f), 'utf8'), sandbox, { filename: 'shared/' + f });

  store.begin();
  try {
    await sandbox.DataAPI.init();                    // load, or create + migrate
    const demo = opts.demo !== undefined ? opts.demo : env.SEED_DEMO_DATA;
    if (wasEmpty && !demo) {
      const DB = sandbox.DataAPI.raw();
      BUSINESS_LISTS.forEach(k => { if (Array.isArray(DB[k])) DB[k].length = 0; });
      logger.info('Empty database → started a blank company (SEED_DEMO_DATA=false)');
    } else if (wasEmpty) {
      logger.info('Empty database → loaded demo data (SEED_DEMO_DATA=true)');
    }
    sandbox.DataAPI.touch();
    sandbox.DataAPI.flush();
    await store.commit();
  } catch (e) {
    store.rollback();
    throw e;
  }
  ctx = sandbox;
  return ctx;
}

function get() {
  if (!ctx) throw new Error('Engine not booted');
  return ctx;
}

/* After a failed request: re-read the engine's DB from the store (which was
   already rolled back) so memory never keeps half-done changes. */
async function reload() {
  await ctx.DataAPI.init();
  return ctx;
}

module.exports = { boot, get, reload, STORAGE_KEY, wasCreatedFresh: () => createdFresh };
