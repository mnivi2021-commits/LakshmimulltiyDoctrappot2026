'use strict';
// Sends one WhatsApp reminder per appointment, REMINDER_HOURS_BEFORE ahead.
// Runs on an interval locally (server.js) and via Vercel Cron in production.
const config = require('../config');
const clock = require('../clock');
const { db } = require('../db');
const { notify } = require('./notifications');

async function runReminders() {
  const now = clock.nowIST();
  const nowMin = clock.diffDays('2000-01-01', now.date) * 1440 + now.minutes;
  const horizon = nowMin + config.reminders.hoursBefore * 60;
  const rows = await db().all(
    `SELECT a.*, d.name AS doctor_name FROM appointments a JOIN doctors d ON d.id = a.doctor_id
     WHERE a.status IN ('booked','confirmed') AND a.reminder_sent_at IS NULL AND a.appointment_date BETWEEN ? AND ?`,
    [now.date, clock.addDays(now.date, Math.ceil(config.reminders.hoursBefore / 24) + 1)],
  );
  let sent = 0;
  for (const a of rows) {
    const at = clock.diffDays('2000-01-01', a.appointment_date) * 1440 + clock.toMinutes(a.appointment_time);
    const createdMin = clock.diffDays('2000-01-01', a.created_at.slice(0, 10)) * 1440 + clock.toMinutes(a.created_at.slice(11, 16));
    // Skip appointments booked within the last hour — the booking message is enough.
    if (at <= nowMin || at > horizon || nowMin - createdMin < 60) continue;
    const r = await db().run('UPDATE appointments SET reminder_sent_at = ? WHERE id = ? AND reminder_sent_at IS NULL', [now.stamp, a.id]);
    if (r.changes) { await notify('appointment_reminder', a); sent++; }
  }
  return { checked: rows.length, sent };
}

module.exports = { runReminders };
