'use strict';
// Central configuration. Every secret comes from the environment (.env) and
// stays on the server — nothing in here is ever sent to the browser.
require('dotenv').config({ quiet: true });

const env = process.env;

function bool(v, def = false) {
  if (v === undefined || v === '') return def;
  return ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());
}
function int(v, def) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : def;
}

const config = {
  env: env.NODE_ENV || 'development',
  isProduction: env.NODE_ENV === 'production',
  port: int(env.PORT, 3000),
  publicBaseUrl: env.PUBLIC_BASE_URL || '',
  trustProxy: bool(env.TRUST_PROXY, false),

  hospital: {
    name: 'Lakshmi Multispecialty Hospital',
    city: 'Viruthunagar',
    state: 'Tamil Nadu',
    address: env.HOSPITAL_ADDRESS || 'Viruthunagar, Tamil Nadu',
    email: env.HOSPITAL_EMAIL || '',
    mapsUrl: env.HOSPITAL_MAPS_URL || 'https://www.google.com/maps/search/?api=1&query=Lakshmi+Multispecialty+Hospital+Viruthunagar',
  },

  db: {
    client: (env.DB_CLIENT || 'mysql').toLowerCase(), // 'mysql' | 'sqlite'
    host: env.DB_HOST || '127.0.0.1',
    port: int(env.DB_PORT, 3306),
    database: env.DB_DATABASE || 'lakshmi_hospital',
    user: env.DB_USERNAME || '',
    password: env.DB_PASSWORD || '',
    ssl: bool(env.DB_SSL, false),
    sslRejectUnauthorized: bool(env.DB_SSL_REJECT_UNAUTHORIZED, true),
    sslCa: env.DB_SSL_CA ? env.DB_SSL_CA.replace(/\\n/g, '\n') : '', // PEM with literal \n allowed
    sqliteFile: env.SQLITE_FILE || './data/lakshmi.sqlite',
  },

  booking: {
    timezone: 'Asia/Kolkata',
    slotMinutes: int(env.SLOT_MINUTES, 15),
    leadMinutes: int(env.BOOKING_LEAD_MINUTES, 30), // same-day bookings must start at least this far ahead
    windowDays: int(env.BOOKING_WINDOW_DAYS, 30), // how far ahead patients may book
    prefix: 'LMH',
  },

  // Private numbers — used only for server-side redirects / API calls.
  aiReceptionistNumber: env.AI_RECEPTIONIST_NUMBER || '',
  whatsappChatNumber: env.WHATSAPP_CHAT_NUMBER || '',

  whatsapp: {
    staffNumber: env.WHATSAPP_NUMBER || '',
    token: env.WHATSAPP_API_TOKEN || '',
    phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID || '',
    apiVersion: env.WHATSAPP_API_VERSION || 'v21.0',
    templateName: env.WHATSAPP_TEMPLATE_NAME || '',
    templateLang: env.WHATSAPP_TEMPLATE_LANG || 'en',
    notifyPatients: bool(env.WHATSAPP_NOTIFY_PATIENTS, false),
    dryRun: bool(env.WHATSAPP_DRY_RUN, false),
  },

  omnidim: {
    webhookSecret: env.OMNIDIM_WEBHOOK_SECRET || '',
    allowQuerySecret: bool(env.OMNIDIM_ALLOW_QUERY_SECRET, false),
    apiKey: env.OMNIDIM_API_KEY || '',
    agentId: env.OMNIDIM_AGENT_ID || '',
  },

  admin: {
    username: env.ADMIN_USERNAME || 'admin',
    password: env.ADMIN_PASSWORD || '',
    sessionSecret: env.SESSION_SECRET || '',
    sessionHours: int(env.ADMIN_SESSION_HOURS, 12),
  },

  reminders: {
    enabled: bool(env.REMINDERS_ENABLED, true),
    hoursBefore: int(env.REMINDER_HOURS_BEFORE, 24),
    intervalMinutes: int(env.REMINDER_INTERVAL_MINUTES, 10),
  },
};

config.whatsapp.configured = Boolean(config.whatsapp.token && config.whatsapp.phoneNumberId);

module.exports = config;
