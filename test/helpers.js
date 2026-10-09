'use strict';
// Test bootstrap: frozen IST clock, fake secrets, and a mocked WhatsApp Cloud
// API (no real messages are sent by tests).
//   npm test            → in-memory SQLite
//   npm run test:mysql  → MySQL/MariaDB from .env, but ALWAYS the separate
//                         TEST_DB_NAME database (default lakshmi_hospital_test),
//                         which is wiped before every test.
const USE_MYSQL = process.env.TEST_DB_CLIENT === 'mysql';
if (USE_MYSQL) {
  require('dotenv').config({ quiet: true });
  const testDb = process.env.TEST_DB_NAME || 'lakshmi_hospital_test';
  const real = process.env.DB_NAME || process.env.DB_DATABASE || 'lakshmi_hospital';
  if (testDb === real) throw new Error('TEST_DB_NAME must differ from DB_NAME – tests wipe their database.');
  process.env.DB_CLIENT = 'mysql';
  process.env.DB_NAME = testDb;
  process.env.DB_DATABASE = testDb;
  delete process.env.DATABASE_URL;
} else {
  process.env.DB_CLIENT = 'sqlite';
  process.env.SQLITE_FILE = ':memory:';
}
process.env.OMNIDIM_WEBHOOK_SECRET = 'test-webhook-secret';
process.env.OMNIDIM_POSTCALL_SECRET = 'test-postcall-secret';
process.env.OMNIDIM_AGENT_ID = '';
process.env.SESSION_SECRET = 'test-session-secret-0123456789abcdef0123';
process.env.ADMIN_USERNAME = 'admin';
process.env.ADMIN_PASSWORD = 'test-pass';
process.env.WHATSAPP_NUMBER = '9000022222';
process.env.WHATSAPP_API_TOKEN = 'test-token';
process.env.WHATSAPP_PHONE_NUMBER_ID = '123456789';
process.env.WHATSAPP_NOTIFY_PATIENTS = 'true';
process.env.AI_RECEPTIONIST_NUMBER = '9000011111';
process.env.REMINDERS_ENABLED = 'false';
process.env.BOOKING_LEAD_MINUTES = '30';
process.env.SLOT_MINUTES = '15';

const clock = require('../src/clock');
const dbm = require('../src/db');
const { migrate } = require('../src/db/schema');
const { seed } = require('../src/db/seed');

// Mock fetch for graph.facebook.com only.
const sentWhatsApp = [];
const realFetch = global.fetch;
let whatsappFails = false;
global.fetch = async (url, opts) => {
  if (String(url).startsWith('https://graph.facebook.com/')) {
    sentWhatsApp.push({ url: String(url), body: JSON.parse(opts.body), headers: opts.headers });
    if (whatsappFails) return new Response(JSON.stringify({ error: { message: 'Invalid OAuth access token' } }), { status: 401 });
    return new Response(JSON.stringify({ messages: [{ id: `wamid.${sentWhatsApp.length}` }] }), { status: 200 });
  }
  return realFetch(url, opts);
};

/** Wednesday 14 Oct 2026, given IST time 'HH:MM'. */
function setIST(date, hhmm) {
  clock.set(`${date}T${hhmm}:00+05:30`);
}

const TABLES_CHILD_FIRST = ['appointment_events', 'notifications', 'staff_requests', 'voice_calls', 'appointments', 'doctor_leaves', 'doctor_sessions', 'counters', 'doctors'];
let mysqlDbReady = false;

async function freshDb() {
  await dbm.close();
  let conn;
  if (USE_MYSQL) {
    const config = require('../src/config');
    if (!mysqlDbReady) {
      const mysql = require('mysql2/promise');
      const c = await mysql.createConnection({ host: config.db.host, port: config.db.port, user: config.db.user, password: config.db.password });
      await c.query(`CREATE DATABASE IF NOT EXISTS \`${config.db.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
      await c.end();
      mysqlDbReady = true;
    }
    conn = dbm.init({ client: 'mysql' });
    for (const t of TABLES_CHILD_FIRST) await conn.run(`DROP TABLE IF EXISTS \`${t}\``);
  } else {
    conn = dbm.init({ client: 'sqlite', sqliteFile: ':memory:' });
  }
  await migrate(conn);
  await seed(conn, 15);
  sentWhatsApp.length = 0;
  return conn;
}

async function ids() {
  const rows = await dbm.db().all('SELECT id, slug FROM doctors');
  return Object.fromEntries(rows.map((r) => [r.slug, r.id]));
}

const WED = '2026-10-14'; const THU = '2026-10-15'; const FRI = '2026-10-16'; const SAT = '2026-10-17'; const SUN = '2026-10-18'; const MON = '2026-10-19';

module.exports = {
  clock, dbm, freshDb, ids, setIST, sentWhatsApp,
  failWhatsApp(v) { whatsappFails = v; },
  WED, THU, FRI, SAT, SUN, MON,
};

// Close the DB pool when a test file finishes (MySQL pools keep the process alive).
require('node:test').after(() => dbm.close());
