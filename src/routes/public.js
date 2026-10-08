'use strict';
// Public JSON API used by the website and the Expo mobile app.
// Never returns private numbers, credentials or other patients' data.
const express = require('express');
const config = require('../config');
const clock = require('../clock');
const v = require('../services/validate');
const doctors = require('../services/doctors');
const availability = require('../services/availability');
const appointments = require('../services/appointments');
const { rateLimit } = require('../middleware/security');

const router = express.Router();
const wrap = (fn) => (req, res, next) => fn(req, res).catch(next);

function publicDoctor(d) {
  return {
    id: d.id, slug: d.slug, name: d.name, qualification: d.qualification, department: d.department, label: d.label,
    slot_minutes: d.slot_minutes,
    sessions: d.sessions.map((s) => ({ session: s.session, start_time: s.start_time, end_time: s.end_time, weekdays: s.weekdays })),
  };
}

function publicAppointment(a) {
  return {
    appointment_no: a.appointment_no, status: a.status,
    patient_name: a.patient_name, mobile_masked: v.maskMobile(a.mobile),
    doctor: a.doctor_name, department: a.department,
    appointment_date: a.appointment_date, appointment_time: a.appointment_time, session: a.session,
    display: `${clock.prettyDate(a.appointment_date)} at ${clock.prettyTime(a.appointment_time)}`,
    suggested: a.suggested_date ? `${clock.prettyDate(a.suggested_date)} at ${clock.prettyTime(a.suggested_time)}` : null,
  };
}

router.get('/api/meta', (req, res) => {
  const now = clock.nowIST();
  res.json({
    hospital: config.hospital.name, city: config.hospital.city, today: now.date, now: now.time,
    booking_window_days: config.booking.windowDays, slot_minutes: config.booking.slotMinutes,
    ai_call_available: Boolean(config.aiReceptionistNumber), whatsapp_available: Boolean(config.whatsappChatNumber),
  });
});

router.get('/api/doctors', wrap(async (req, res) => {
  res.json({ success: true, doctors: (await doctors.listDoctors()).map(publicDoctor) });
}));

// Real slot map for one doctor and date.
router.get('/api/availability', wrap(async (req, res) => {
  const doctor = await doctors.getDoctor(req.query.doctor_id);
  const date = v.parseDate(req.query.date);
  if (!doctor || !date) return res.status(400).json({ success: false, message: 'doctor_id and date are required.' });
  const today = clock.nowIST().date;
  if (date < today || date > clock.addDays(today, config.booking.windowDays)) {
    return res.json({ success: true, date, sessions: [], available_count: 0, reason: date < today ? 'past_date' : 'beyond_window', next_available: await availability.findNextAvailable(doctor, today, { limit: 1 }) });
  }
  const day = await availability.getDay(doctor, date);
  let next = [];
  let reason = null;
  if (day.available_count === 0) {
    const chk = await availability.checkSlot(doctor, date, [], null);
    reason = chk.reason; next = chk.alternatives.slice(0, 1);
  }
  res.json({
    success: true, date, doctor_id: doctor.id, working: day.working, on_leave: day.on_leave, reason,
    reason_text: reason ? availability.REASON_TEXT[reason] : null,
    available_count: day.available_count, next_available: next,
    sessions: day.sessions.map((s) => ({
      session: s.session, start_time: s.start_time, end_time: s.end_time, working: s.working, on_leave: s.on_leave,
      available_count: s.available_count, slots: s.slots,
    })),
  });
}));

const bookingLimit = rateLimit({ windowMs: 10 * 60e3, max: 20, name: 'book' });

router.post('/api/appointments', bookingLimit, wrap(async (req, res) => {
  const source = req.body.source === 'mobile_app' ? 'mobile_app' : 'website';
  if (req.body.website_url) return res.status(400).json({ success: false, message: 'Invalid submission.' }); // honeypot
  const r = await appointments.book(req.body, { source, actor: source });
  if (r.ok) return res.status(201).json({ success: true, appointment: publicAppointment(r.appointment) });
  if (r.code === 'validation') return res.status(422).json({ success: false, code: r.code, errors: r.errors });
  if (r.code === 'duplicate') {
    return res.status(409).json({ success: false, code: 'duplicate', message: `You already have appointment ${r.appointment.appointment_no} with this doctor on that day.`, appointment: publicAppointment(r.appointment) });
  }
  res.status(409).json({ success: false, code: r.code, reason: r.reason, message: r.reason_text, alternatives: r.alternatives });
}));

const lookupLimit = rateLimit({ windowMs: 10 * 60e3, max: 30, name: 'lookup' });

router.post('/api/appointments/status', lookupLimit, wrap(async (req, res) => {
  const a = await appointments.findForPatient(req.body.appointment_no, req.body.mobile);
  if (!a) return res.status(404).json({ success: false, message: 'No appointment found for that number and mobile.' });
  res.json({ success: true, appointment: publicAppointment(a) });
}));

router.post('/api/appointments/cancel', lookupLimit, wrap(async (req, res) => {
  const a = await appointments.findForPatient(req.body.appointment_no, req.body.mobile);
  if (!a) return res.status(404).json({ success: false, message: 'No appointment found for that number and mobile.' });
  const r = await appointments.cancel(a.id, req.body.reason || 'Cancelled by patient', 'patient');
  if (!r.ok) return res.status(409).json({ success: false, message: r.message || 'Cannot cancel.' });
  res.json({ success: true, appointment: publicAppointment(r.appointment) });
}));

// Phone/WhatsApp buttons: the private numbers are only in this server-side redirect,
// never in page source.
router.get('/call', (req, res) => {
  const n = v.parseMobile(config.aiReceptionistNumber);
  if (!n) return res.redirect(302, '/ai-receptionist?call=unavailable');
  res.redirect(302, `tel:+91${n}`);
});
router.get('/whatsapp', (req, res) => {
  const n = v.parseMobile(config.whatsappChatNumber);
  if (!n) return res.redirect(302, '/contact?whatsapp=unavailable');
  const text = encodeURIComponent('Hello Lakshmi Multispecialty Hospital, I would like to book an appointment.');
  res.redirect(302, `https://wa.me/91${n}?text=${text}`);
});

module.exports = { router, publicAppointment };
