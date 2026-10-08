'use strict';
// Local / VPS entry point. On Vercel, api/index.js is used instead.
const config = require('./src/config');
const app = require('./src/app');
const { runReminders } = require('./src/services/reminders');

const server = app.listen(config.port, () => {
  console.log(`Lakshmi Hospital appointments running on http://localhost:${config.port} (db: ${config.db.client})`);
  if (!config.whatsapp.configured) console.log('  WhatsApp: NOT configured – notifications will be logged as not_configured.');
  if (!config.omnidim.webhookSecret) console.log('  OmniDimension: OMNIDIM_WEBHOOK_SECRET not set – voice endpoints are disabled.');
});

if (config.reminders.enabled) {
  const tick = () => runReminders().catch((e) => console.error('[reminders]', e.message));
  setTimeout(tick, 15e3).unref();
  setInterval(tick, config.reminders.intervalMinutes * 60e3).unref();
}

module.exports = server;
