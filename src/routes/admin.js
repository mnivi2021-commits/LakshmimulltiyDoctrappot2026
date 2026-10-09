'use strict';
const express = require('express');
const config = require('../config');
const clock = require('../clock');
const { db } = require('../db');
const doctors = require('../services/doctors');
const availability = require('../services/availability');
const appointments = require('../services/appointments');
const { deliver } = require('../services/notifications');
const { runReminders } = require('../services/reminders');
const sec = require('../middleware/security');

const router = express.Router();
const wrap = (fn) => (req, res, next) => fn(req, res).catch(next);

router.post('/api/admin/login', sec.rateLimit({ windowMs: 15 * 60e3, max: 10, name: 'login' }), (req, res) => {
  if (!sec.adminConfigured()) return res.status(503).json({ success: false, message: 'Admin login is not configured. Set ADMIN_PASSWORD and SESSION_SECRET (32+ chars) in .env.' });
  if (!sec.login(req, res, req.body.username, req.body.password)) return res.status(401).json({ success: false, message: 'Invalid username or password.' });
  res.json({ success: true });
});
router.post('/api/admin/logout', (req, res) => { sec.logout(res); res.json({ success: true }); });

// Vercel Cron (sends Authorization: Bearer $CRON_SECRET) or any scheduler.
router.get('/api/cron/reminders', wrap(async (req, res) => {
  const secret = process.env.CRON_SECRET;
  const auth = req.get('authorization') || '';
  if (!secret || !sec.safeEqual(auth, `Bearer ${secret}`)) return res.status(401).json({ success: false });
  res.json({ success: true, ...(await runReminders()) });
}));

router.use('/api/admin', sec.requireAdminApi);

function row(a) {
  return {
    id: a.id, appointment_no: a.appointment_no, status: a.status, source: a.source, language: a.language,
    patient_name: a.patient_name, mobile: a.mobile, patient_type: a.patient_type, reason: a.reason,
    doctor_id: a.doctor_id, doctor: a.doctor_name, department: a.department,
    appointment_date: a.appointment_date, appointment_time: a.appointment_time, session: a.session,
    suggested_date: a.suggested_date, suggested_time: a.suggested_time, cancel_reason: a.cancel_reason,
    created_at: a.created_at,
  };
}

function send(res, r, okStatus = 200) {
  if (r.ok) return res.status(okStatus).json({ success: true, ...r, appointment: r.appointment ? row(r.appointment) : undefined });
  const http = { not_found: 404, validation: 422 }[r.code] || 409;
  res.status(http).json({ success: false, ...r, message: r.message || r.reason_text || (r.errors && Object.values(r.errors).join(' ')) || 'Request failed.' });
}

router.get('/api/admin/summary', wrap(async (req, res) => {
  const today = clock.nowIST().date;
  const tomorrow = clock.addDays(today, 1);
  const c = async (sql, p) => Number((await db().get(sql, p)).n);
  const active = "status IN ('booked','confirmed','leave_affected')";
  res.json({
    success: true, today, tomorrow,
    counts: {
      today: await c(`SELECT COUNT(*) n FROM appointments WHERE appointment_date = ? AND ${active}`, [today]),
      tomorrow: await c(`SELECT COUNT(*) n FROM appointments WHERE appointment_date = ? AND ${active}`, [tomorrow]),
      upcoming: await c(`SELECT COUNT(*) n FROM appointments WHERE appointment_date >= ? AND ${active}`, [today]),
      pending_confirmation: await c("SELECT COUNT(*) n FROM appointments WHERE appointment_date >= ? AND status = 'booked'", [today]),
      leave_affected: await c("SELECT COUNT(*) n FROM appointments WHERE status = 'leave_affected'", []),
      ai_voice: await c("SELECT COUNT(*) n FROM appointments WHERE source = 'ai_voice' AND appointment_date >= ?", [today]),
      notifications_failed: await c("SELECT COUNT(*) n FROM notifications WHERE status IN ('failed','not_configured')", []),
      open_staff_requests: await c("SELECT COUNT(*) n FROM staff_requests WHERE status = 'open'", []),
    },
    integrations: {
      whatsapp: config.whatsapp.dryRun ? 'dry_run' : config.whatsapp.configured && config.whatsapp.staffNumber ? 'credentials_set' : 'not_configured',
      omnidimension_webhook: config.omnidim.webhookSecret ? 'secret_set' : 'not_configured',
      patient_whatsapp: config.whatsapp.notifyPatients,
    },
  });
}));

router.get('/api/admin/doctors', wrap(async (req, res) => {
  res.json({ success: true, doctors: (await doctors.listDoctors()).map((d) => ({ id: d.id, name: d.name, department: d.department, sessions: d.sessions })) });
}));

router.get('/api/admin/appointments', wrap(async (req, res) => {
  const today = clock.nowIST().date;
  const f = { q: req.query.q, doctor_id: req.query.doctor_id, date: req.query.date, status: req.query.status, source: req.query.source };
  switch (req.query.view) {
    case 'today': f.date = today; f.status = f.status || 'active'; break;
    case 'tomorrow': f.date = clock.addDays(today, 1); f.status = f.status || 'active'; break;
    case 'upcoming': f.from = today; f.status = f.status || 'active'; break;
    case 'voice': f.source = 'ai_voice'; break;
    case 'attention': f.status = 'leave_affected'; break;
    default: break;
  }
  res.json({ success: true, appointments: (await appointments.list(f)).map(row) });
}));

router.post('/api/admin/appointments', wrap(async (req, res) => {
  send(res, await appointments.book(req.body, { source: 'admin', actor: req.admin.u }), 201);
}));
router.post('/api/admin/appointments/:id/confirm', wrap(async (req, res) => send(res, await appointments.confirm(Number(req.params.id), req.admin.u))));
router.post('/api/admin/appointments/:id/cancel', wrap(async (req, res) => send(res, await appointments.cancel(Number(req.params.id), req.body.reason, req.admin.u))));
router.post('/api/admin/appointments/:id/reschedule', wrap(async (req, res) => send(res, await appointments.reschedule(Number(req.params.id), req.body, req.admin.u))));
router.post('/api/admin/appointments/:id/apply-suggestion', wrap(async (req, res) => {
  const a = await appointments.getById(Number(req.params.id));
  if (!a || !a.suggested_date) return res.status(404).json({ success: false, message: 'No suggested slot for this appointment.' });
  send(res, await appointments.reschedule(a.id, { appointment_date: a.suggested_date, appointment_time: a.suggested_time }, req.admin.u));
}));
router.get('/api/admin/appointments/:id/events', wrap(async (req, res) => {
  res.json({ success: true, events: await db().all('SELECT * FROM appointment_events WHERE appointment_id = ? ORDER BY id', [Number(req.params.id)]) });
}));

router.get('/api/admin/slots', wrap(async (req, res) => {
  const doctor = await doctors.getDoctor(req.query.doctor_id);
  const date = req.query.date || clock.nowIST().date;
  if (!doctor || !clock.isValidDate(date)) return res.status(400).json({ success: false, message: 'doctor_id and date required.' });
  const day = await availability.getDay(doctor, date);
  res.json({ success: true, doctor: doctor.name, ...day });
}));

router.get('/api/admin/leaves', wrap(async (req, res) => {
  res.json({ success: true, leaves: await appointments.listLeaves(clock.addDays(clock.nowIST().date, -7)) });
}));
router.post('/api/admin/leaves', wrap(async (req, res) => send(res, await appointments.markLeave(req.body, req.admin.u), 201)));
router.delete('/api/admin/leaves/:id', wrap(async (req, res) => {
  const r = await appointments.removeLeave(Number(req.params.id));
  res.status(r.ok ? 200 : 404).json({ success: r.ok });
}));

router.get('/api/admin/notifications', wrap(async (req, res) => {
  const rows = await db().all(
    `SELECT n.id, n.event_type, n.audience, n.recipient, n.status, n.error, n.attempts, n.created_at, n.sent_at, a.appointment_no
     FROM notifications n LEFT JOIN appointments a ON a.id = n.appointment_id ORDER BY n.id DESC LIMIT 200`,
  );
  res.json({ success: true, notifications: rows.map((r) => ({ ...r, recipient: r.recipient ? `XXXXXX${String(r.recipient).slice(-4)}` : '' })) });
}));
router.post('/api/admin/notifications/:id/retry', wrap(async (req, res) => {
  const status = await deliver(Number(req.params.id));
  res.status(status ? 200 : 404).json({ success: Boolean(status), status });
}));

router.get('/api/admin/voice-calls', wrap(async (req, res) => {
  res.json({ success: true, calls: await db().all('SELECT id, call_id, caller_mobile, language, patient_name, doctor, department, appointment_date, appointment_time, session, reason, appointment_no, appointment_status, verified, created_at FROM voice_calls ORDER BY id DESC LIMIT 100') });
}));
router.get('/api/admin/staff-requests', wrap(async (req, res) => {
  res.json({ success: true, requests: await db().all('SELECT * FROM staff_requests ORDER BY (status = \'open\') DESC, id DESC LIMIT 100') });
}));
router.post('/api/admin/staff-requests/:id/resolve', wrap(async (req, res) => {
  await db().run("UPDATE staff_requests SET status = 'resolved' WHERE id = ?", [Number(req.params.id)]);
  res.json({ success: true });
}));

module.exports = { router };
