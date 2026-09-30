/* ============================================================================
   STORE SERVICE — MongoDB persistence for the business engine
   ----------------------------------------------------------------------------
   The engine (shared/*.js) is synchronous and works on one in-memory DB
   object. This service:

     • load()      — reads every collection from MongoDB into memory at boot
     • loadAll()   — gives the engine its DB object (sync, from memory)
     • saveAll()   — the engine hands back its DB object; we diff it against
                     memory and turn ONLY the changes into MongoDB writes
                     (insert / replace / delete / re-order)
     • begin / commit / rollback — one API request = one unit of work.
                     commit() writes to MongoDB (inside a real MongoDB
                     transaction when the server supports it) and resolves
                     when the data is safely stored.

   Rules enforced here:
     • walletEntries is APPEND-ONLY: changing or deleting a ledger row throws
       LOCKED and nothing is written.
     • All writes go out one batch at a time, in order.
   ============================================================================ */
'use strict';
const mongoose = require('mongoose');
const { ENTITY_MODELS, ID_LESS, APPEND_ONLY, Meta, Credential, ARRAY_COLLECTIONS } = require('../models');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');

const LS_PREFIX = 'ls:';
const GAP = 1024;                  // spacing between list positions (_ord)          // engine's extra localStorage keys live in meta too

/* ── in-memory mirror ── */
let cols = new Map();              // name -> { order: [key], docs: Map(key -> json) }
let meta = new Map();              // key  -> json
let creds = new Map();             // subject -> { subject, kind, hash, mustChange }

let txn = null;                    // { backup, ops } while a unit of work is open
let chain = Promise.resolve();     // serial write queue
let useTransactions = false;

const keyOf = ent => typeof ent.id + ':' + ent.id;
const strip = d => { const o = Object.assign({}, d); delete o._id; delete o._ord; return o; };

/* ── boot ── */
async function load(opts) {
  useTransactions = !!(opts && opts.transactions);
  cols = new Map(); meta = new Map(); creds = new Map();

  await Promise.all(Object.values(ENTITY_MODELS).concat([Meta, Credential]).map(m => m.createIndexes()));

  for (const name of ARRAY_COLLECTIONS) {
    const rows = await ENTITY_MODELS[name].collection.find({}).sort({ _ord: 1 }).toArray();
    const c = { order: [], docs: new Map(), ords: new Map() };
    rows.forEach((r, i) => {
      const ent = strip(r);
      const k = ID_LESS.includes(name) ? '#' + i : keyOf(ent);
      c.order.push(k); c.docs.set(k, JSON.stringify(ent));
      c.ords.set(k, typeof r._ord === 'number' ? r._ord : i * GAP);
    });
    cols.set(name, c);
  }
  for (const r of await Meta.collection.find({}).toArray()) meta.set(r.key, JSON.stringify(r.value === undefined ? null : r.value));
  for (const r of await Credential.collection.find({}).toArray())
    creds.set(r.subject, { subject: r.subject, kind: r.kind, hash: r.hash, mustChange: !!r.mustChange });

  await migrateLegacy();
  logger.info(`Store loaded (${useTransactions ? 'with' : 'without'} MongoDB transactions)`);
}

/* Older versions kept everything in ONE document (collection "app_state")
   and logins in "auth". If this database still has them and the new
   collections are empty, copy the data over once. The old documents are left
   untouched as a backup. */
async function migrateLegacy() {
  const db = mongoose.connection.db;
  if (isEmpty()) {
    const legacy = await db.collection('app_state').findOne({ _id: 'primary' }).catch(() => null);
    if (legacy && legacy.data && typeof legacy.data === 'object') {
      saveAll(legacy.data);
      await flush();
      logger.info('Migrated data from legacy "app_state" document into collections');
    }
  }
  if (!creds.size) {
    const rows = await db.collection('auth').find({}).toArray().catch(() => []);
    rows.forEach(r => { if (r.subject && r.hash) setAuth(r.subject, r.kind || (r.subject === 'admin' ? 'ADMIN' : 'EMPLOYEE'), r.hash, !!(r.must_change || r.mustChange)); });
    if (rows.length) { await flush(); logger.info(`Migrated ${rows.length} logins from legacy "auth" collection`); }
  }
}

/* Delete ALL app data (used by seed / reset-demo). Logins are kept unless
   opts.credentials is true. */
async function wipe(opts) {
  await flush();
  const models = Object.values(ENTITY_MODELS).concat([Meta]);
  if (opts && opts.credentials) models.push(Credential);
  for (const m of models) await m.collection.deleteMany({});
  cols = new Map(); meta = new Map();
  if (opts && opts.credentials) creds = new Map();
  for (const name of ARRAY_COLLECTIONS) cols.set(name, { order: [], docs: new Map(), ords: new Map() });
}

function isEmpty() {
  for (const c of cols.values()) if (c.order.length) return false;
  for (const k of meta.keys()) if (!k.startsWith(LS_PREFIX)) return false;
  return true;
}

/* ── engine reads its DB ── */
function loadAll() {
  const out = {};
  for (const [k, j] of meta) if (!k.startsWith(LS_PREFIX)) out[k] = JSON.parse(j);
  for (const name of ARRAY_COLLECTIONS) {
    const c = cols.get(name) || { order: [], docs: new Map() };
    out[name] = c.order.map(k => JSON.parse(c.docs.get(k)));
  }
  return out;
}

/* ── engine writes its DB: diff → MongoDB ops ── */
function saveAll(dbObj) {
  const ops = [];                 // { model, op }
  const nextCols = new Map();

  for (const name of ARRAY_COLLECTIONS) {
    const Model = ENTITY_MODELS[name];
    const arr = Array.isArray(dbObj[name]) ? dbObj[name] : [];
    const cur = cols.get(name) || { order: [], docs: new Map(), ords: new Map() };
    const next = { order: [], docs: new Map(), ords: new Map() };
    const appendOnly = APPEND_ONLY.includes(name);
    const idLess = ID_LESS.includes(name) || arr.some(e => !e || e.id === undefined || e.id === null);

    if (idLess) {
      /* small capped list without ids → replace as a whole when it changes */
      next.ords = new Map();
      arr.forEach((e, i) => { next.order.push('#' + i); next.docs.set('#' + i, JSON.stringify(e)); next.ords.set('#' + i, i * GAP); });
      const changed = next.order.length !== cur.order.length || next.order.some(k => next.docs.get(k) !== cur.docs.get(k));
      if (changed) {
        ops.push({ Model, op: { deleteMany: { filter: {} } } });
        arr.forEach((e, i) => ops.push({ Model, op: { insertOne: { document: Object.assign({}, e, { _ord: i * GAP }) } } }));
      }
      nextCols.set(name, next);
      continue;
    }

    /* ── positions ──
       The app keeps lists ordered (newest first for attendance, activity …).
       Instead of renumbering every row when one is added at the top, a new
       row gets a position between its neighbours; rows only get renumbered
       when the existing order itself changed (e.g. a list was re-sorted). */
    arr.forEach(ent => {
      const k = keyOf(ent);
      if (next.docs.has(k)) throw new ApiError('CONFLICT', `Duplicate id ${ent.id} in ${name}`);
      next.docs.set(k, JSON.stringify(ent));
      next.order.push(k);
    });
    next.ords = new Map();
    const oldOrds = cur.ords || new Map();
    const kept = next.order.filter(k => oldOrds.has(k));
    let monotonic = true;
    for (let i = 1; i < kept.length; i++) if (!(oldOrds.get(kept[i]) > oldOrds.get(kept[i - 1]))) { monotonic = false; break; }
    if (monotonic) {
      next.order.forEach((k, i) => {
        if (oldOrds.has(k)) { next.ords.set(k, oldOrds.get(k)); return; }
        let lo = null, hi = null;
        for (let j = i - 1; j >= 0; j--) { const v = next.ords.get(next.order[j]); if (v !== undefined) { lo = v; break; } }
        for (let j = i + 1; j < next.order.length; j++) { const v = oldOrds.get(next.order[j]); if (v !== undefined) { hi = v; break; } }
        const v = lo === null && hi === null ? i * GAP : lo === null ? hi - GAP : hi === null ? lo + GAP : (lo + hi) / 2;
        if (lo !== null && hi !== null && !(v > lo && v < hi)) monotonic = false;
        next.ords.set(k, v);
      });
    }
    if (!monotonic) next.order.forEach((k, i) => next.ords.set(k, i * GAP));

    next.order.forEach((k, i) => {
      const ent = arr[i], j = next.docs.get(k), ord = next.ords.get(k);
      const old = cur.docs.get(k);
      if (old === undefined) {
        ops.push({ Model, op: { insertOne: { document: Object.assign({}, ent, { _ord: ord }) } } });
      } else if (old !== j) {
        if (appendOnly) throw new ApiError('LOCKED', 'Ledger entries are immutable — write a reversing entry instead');
        ops.push({ Model, op: { replaceOne: { filter: { id: ent.id }, replacement: Object.assign({}, ent, { _ord: ord }) } } });
      } else if (oldOrds.get(k) !== ord) {
        ops.push({ Model, op: { updateOne: { filter: { id: ent.id }, update: { $set: { _ord: ord } } } } });
      }
    });
    const removed = cur.order.filter(k => !next.docs.has(k));
    if (removed.length) {
      if (appendOnly) throw new ApiError('LOCKED', 'Ledger entries cannot be deleted');
      const ids = removed.map(k => JSON.parse(cur.docs.get(k)).id);
      ops.push({ Model, op: { deleteMany: { filter: { id: { $in: ids } } } } });
    }
    nextCols.set(name, next);
  }

  const nextMeta = new Map(meta);
  for (const key of Object.keys(dbObj)) {
    if (ARRAY_COLLECTIONS.includes(key)) continue;
    const v = dbObj[key] === undefined ? null : dbObj[key];
    const j = JSON.stringify(v);
    if (meta.get(key) !== j) {
      nextMeta.set(key, j);
      ops.push({ Model: Meta, op: { replaceOne: { filter: { key }, replacement: { key, value: JSON.parse(j) }, upsert: true } } });
    }
  }

  /* everything validated — now apply to memory and queue the writes */
  cols = nextCols;
  meta = nextMeta;
  queue(ops);
}

/* ── engine's other localStorage keys ── */
function getLs(key) { const j = meta.get(LS_PREFIX + key); return j === undefined ? null : JSON.parse(j); }
function setLs(key, value) {
  const k = LS_PREFIX + key, v = String(value);
  meta.set(k, JSON.stringify(v));
  queue([{ Model: Meta, op: { replaceOne: { filter: { key: k }, replacement: { key: k, value: v }, upsert: true } } }]);
}
function removeLs(key) {
  const k = LS_PREFIX + key;
  if (!meta.has(k)) return;
  meta.delete(k);
  queue([{ Model: Meta, op: { deleteOne: { filter: { key: k } } } }]);
}

/* ── credentials ── */
function getAuth(subject) { const c = creds.get(subject); return c ? Object.assign({}, c) : null; }
function setAuth(subject, kind, hash, mustChange) {
  const doc = { subject, kind, hash, mustChange: !!mustChange };
  creds.set(subject, doc);
  queue([{ Model: Credential, op: { updateOne: {
    filter: { subject },
    update: { $set: doc, $currentDate: { updatedAt: true }, $setOnInsert: { createdAt: new Date() } },
    upsert: true } } }]);
}
function deleteAuth(subject) {
  if (!creds.delete(subject)) return;
  queue([{ Model: Credential, op: { deleteOne: { filter: { subject } } } }]);
}

/* ── unit of work ── */
function begin() {
  if (txn) throw new Error('store.begin() called twice');
  const backupCols = new Map();
  for (const [n, c] of cols) backupCols.set(n, { order: c.order.slice(), docs: new Map(c.docs), ords: new Map(c.ords || []) });
  txn = { backup: { cols: backupCols, meta: new Map(meta), creds: new Map(creds) }, ops: [] };
}

/* resolves once MongoDB has the data */
function commit() {
  if (!txn) return chain;
  const ops = txn.ops; txn = null;
  return write(ops);
}

function rollback() {
  if (!txn) return;
  cols = txn.backup.cols; meta = txn.backup.meta; creds = txn.backup.creds;
  txn = null;
}

function queue(ops) {
  if (!ops.length) return;
  if (txn) { txn.ops.push(...ops); return; }
  write(ops).catch(e => logger.error('Background write failed:', e.message));
}

function write(ops) {
  if (!ops.length) return chain;
  const p = chain.then(() => persist(ops));
  chain = p.catch(() => {});
  return p;
}

/* group consecutive ops per collection → bulkWrite (ordered) */
async function persist(ops) {
  const groups = [];
  for (const { Model, op } of ops) {
    const last = groups[groups.length - 1];
    if (last && last.Model === Model) last.ops.push(op); else groups.push({ Model, ops: [op] });
  }
  const run = async session => {
    for (const g of groups) await g.Model.collection.bulkWrite(g.ops, { ordered: true, session });
  };
  if (useTransactions && groups.length) {
    const session = await mongoose.startSession();
    try { await session.withTransaction(() => run(session)); }
    finally { await session.endSession(); }
  } else {
    await run(undefined);
  }
}

/* wait for every queued write (seed script, graceful shutdown, tests) */
function flush() { return chain; }

module.exports = {
  load, wipe, isEmpty, loadAll, saveAll,
  getLs, setLs, removeLs,
  getAuth, setAuth, deleteAuth, listAuth: () => [...creds.values()].map(c => Object.assign({}, c)),
  begin, commit, rollback, flush,
  usesTransactions: () => useTransactions
};
