'use strict';
// `npm run reminders` — one-off reminder run (e.g. from Windows Task Scheduler).
const { close } = require('../db');
const { runReminders } = require('../services/reminders');

runReminders()
  .then((r) => { console.log(`Reminders: checked ${r.checked}, sent ${r.sent}`); return close(); })
  .catch((e) => { console.error(e.message); process.exit(1); });
