'use strict';
// Test bootstrap: in-memory SQLite, frozen IST clock, fake secrets, and a
// mocked WhatsApp Cloud API (no real messages are sent by tests).
process.env.DB_CLIENT = 'sqlite';
process.env.SQLITE_FILE = ':memory:';
process.env.OMNIDIM_WEBHOOK_SECRET = 'test-webhook-secret';
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

async function freshDb() {
  await dbm.close();
  const conn = dbm.init({ client: 'sqlite', sqliteFile: ':memory:' });
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
