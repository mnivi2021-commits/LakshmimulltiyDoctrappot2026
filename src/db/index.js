'use strict';
// Thin database abstraction with two drivers sharing the same SQL:
//   mysql  — production (MySQL 8, credentials from .env, server-side only)
//   sqlite — zero-setup local development and automated tests (node:sqlite)
// Both expose: all(sql, params), get(sql, params), run(sql, params), transaction(fn)
const config = require('../config');

let driver = null;

function createMysqlDriver(opts) {
  const mysql = require('mysql2/promise');
  const pool = mysql.createPool({
    host: opts.host, port: opts.port, user: opts.user, password: opts.password, database: opts.database,
    waitForConnections: true, connectionLimit: process.env.VERCEL ? 3 : 10,
    ssl: opts.ssl ? { rejectUnauthorized: opts.sslRejectUnauthorized, ...(opts.sslCa ? { ca: opts.sslCa } : {}) } : undefined, dateStrings: true, timezone: '+05:30', charset: 'utf8mb4',
  });
  const wrap = (conn) => ({
    dialect: 'mysql',
    async all(sql, params = []) { const [rows] = await conn.query(sql, params); return rows; },
    async get(sql, params = []) { const [rows] = await conn.query(sql, params); return rows[0] || null; },
    async run(sql, params = []) {
      const [res] = await conn.query(sql, params);
      return { insertId: res.insertId, changes: res.affectedRows };
    },
  });
  return {
    ...wrap(pool),
    async transaction(fn) {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const out = await fn(wrap(conn));
        await conn.commit();
        return out;
      } catch (e) {
        await conn.rollback().catch(() => {});
        throw e;
      } finally {
        conn.release();
      }
    },
    async close() { await pool.end(); },
  };
}

function createSqliteDriver(file) {
  const { DatabaseSync } = require('node:sqlite');
  if (file !== ':memory:') {
    const path = require('path');
    require('fs').mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  }
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  const norm = (p) => p.map((v) => (v === undefined ? null : typeof v === 'boolean' ? Number(v) : v));
  const api = {
    dialect: 'sqlite',
    async all(sql, params = []) { return db.prepare(sql).all(...norm(params)).map((r) => ({ ...r })); },
    async get(sql, params = []) { const r = db.prepare(sql).get(...norm(params)); return r ? { ...r } : null; },
    async run(sql, params = []) {
      const r = db.prepare(sql).run(...norm(params));
      return { insertId: Number(r.lastInsertRowid), changes: Number(r.changes) };
    },
  };
  // One connection: serialise transactions so awaits inside one can't interleave with another.
  let queue = Promise.resolve();
  return {
    ...api,
    exec(sql) { db.exec(sql); },
    transaction(fn) {
      const run = queue.then(async () => {
        db.exec('BEGIN IMMEDIATE');
        try {
          const out = await fn(api);
          db.exec('COMMIT');
          return out;
        } catch (e) {
          db.exec('ROLLBACK');
          throw e;
        }
      });
      queue = run.catch(() => {});
      return run;
    },
    async close() { db.close(); },
  };
}

function init(overrides = {}) {
  const opts = { ...config.db, ...overrides };
  driver = opts.client === 'sqlite' ? createSqliteDriver(opts.sqliteFile) : createMysqlDriver(opts);
  return driver;
}

function db() {
  if (!driver) init();
  return driver;
}

/** True if the error is a unique-constraint violation (both drivers). */
function isUniqueViolation(e) {
  return e && (e.code === 'ER_DUP_ENTRY' || /UNIQUE constraint failed/i.test(e.message || ''));
}

module.exports = { init, db, isUniqueViolation, async close() { if (driver) await driver.close(); driver = null; } };
