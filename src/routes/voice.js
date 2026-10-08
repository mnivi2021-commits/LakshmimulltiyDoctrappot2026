'use strict';
// OmniDimension AI voice front-desk tools (maps the prompt pack's placeholders):
//   CHECK_AVAILABILITY_TOOL      POST /api/voice/check-availability
//   CREATE_APPOINTMENT_TOOL      POST /api/voice/book-appointment
//   FIND_APPOINTMENT_TOOL        POST /api/voice/find-appointment
//   RESCHEDULE_APPOINTMENT_TOOL  POST /api/voice/reschedule-appointment
//   CANCEL_APPOINTMENT_TOOL      POST /api/voice/cancel-appointment
//   CREATE_CALLBACK_TOOL         POST /api/voice/staff-callback
//   (doctor info)                POST /api/voice/doctors
//   post-call webhook            POST /api/voice/call-ended
//
// Every response is HTTP 200 JSON with `success` and a plain-English `message`
// the agent relays in the caller's language. `success: true` on booking is
// returned only after the database has committed the slot.
const express = require('express');
const clock = require('../clock');
const { db } = require('../db');
const v = require('../services/validate');
const doctors = require('../services/doctors');
const availability = require('../services/availability');
const appointments = require('../services/appointments');
const { notify } = require('../services/notifications');
const { requireWebhookSecret, rateLimit } = require('../middleware/security');

const router = express.Router();
router.use('/api/voice', rateLimit({ windowMs: 60e3, max: 120, name: 'voice' }), requireWebhookSecret);

/** Accept flat bodies and common wrappers ({parameters}, {args}, {arguments}, {data}). */
function args(req) {
  const b = req.body || {};
  let inner = b.parameters || b.args || b.arguments || b.data || b.input || {};
  if (typeof inner === 'string') { try { inner = JSON.parse(inner); } catch { inner = {}; } }
  const merged = { ...b, ...inner };
  // Common alternative key names.
  return {
    ...merged,
    patient_name: merged.patient_name ?? merged.name ?? merged.caller_name,
    mobile: merged.mobile ?? merged.phone ?? merged.mobile_number ?? merged.phone_number,
    appointment_date: merged.appointment_date ?? merged.date ?? merged.preferred_date,
    appointment_time: merged.appointment_time ?? merged.time ?? merged.preferred_time,
    appointment_no: merged.appointment_no ?? merged.appointment_number ?? merged.booking_id,
  };
}

const wrap = (fn) => (req, res) => fn(req, res).catch((e) => {
  console.error('[voice]', e);
  res.json({
    success: false, status: 'system_error',
    message: 'The booking system is not responding right now. Do NOT confirm any appointment. Apologise, take the caller’s name, mobile and request, and call staff-callback so the team calls them back.',
  });
});

const say = (s) => s.map((x, i) => `${i + 1}) ${x.doctor}, ${x.display}`).join('; ');

function speakAppt(a) {
  return `${a.appointment_no} – ${a.patient_name} with ${a.doctor_name} (${a.department}) on ${clock.prettyDate(a.appointment_date)} at ${clock.prettyTime(a.appointment_time)}, status ${a.status}`;
}

router.post('/api/voice/doctors', wrap(async (req, res) => {
  const list = await doctors.listDoctors();
  res.json({
    success: true,
    today: clock.prettyDate(clock.nowIST().date),
    doctors: list.map((d) => ({
      name: d.name, qualification: d.qualification, department: d.label.en,
      timings: d.sessions.map((s) => `${s.session} ${clock.prettyTime(s.start_time)}–${clock.prettyTime(s.end_time)}`).join(', '),
      days: 'Monday to Saturday',
    })),
    message: list.map((d) => `${d.name} (${d.qualification}), ${d.label.en}: ${d.sessions.map((s) => `${clock.prettyTime(s.start_time)} to ${clock.prettyTime(s.end_time)}`).join(' and ')}`).join('. '),
  });
}));

router.post('/api/voice/check-availability', wrap(async (req, res) => {
  const a = args(req);
  const doctor = await doctors.resolveDoctor(a.doctor, a.department);
  if (!doctor) return res.json({ success: false, status: 'needs_info', missing: ['doctor'], message: 'Ask which doctor: Mr. Vijul (Orthopaedic), Mr. Vishwa (Diabetologist) or Ms. Nivi (Heart Specialist).' });
  const date = v.parseDate(a.appointment_date);
  if (!date) return res.json({ success: false, status: 'needs_info', missing: ['appointment_date'], message: 'Ask the caller for the appointment date.' });
  const session = v.parseSession(a.session);
  const times = v.parseTimeCandidates(a.appointment_time, a.session);
  const r = await availability.checkSlot(doctor, date, times, session);

  if (r.available) {
    return res.json({ success: true, status: 'available', available: true, slot: r.slot, message: `${r.slot.display} with ${doctor.name} is available. Collect any missing details, read them back, and on the caller's agreement call book-appointment with date ${r.slot.date} and time ${r.slot.time}. It is NOT booked yet.` });
  }
  if (r.needs_time) {
    return res.json({ success: true, status: 'choose_time', available: false, alternatives: r.alternatives, message: r.alternatives.length ? `Available times: ${say(r.alternatives)}. Ask which one the caller prefers.` : 'No free slots found in the booking window. Offer a staff callback.' });
  }
  res.json({
    success: true, status: 'unavailable', available: false, reason: r.reason, alternatives: r.alternatives,
    message: `${r.reason_text} ${r.alternatives.length ? `Next actual available: ${say(r.alternatives)}. Offer these; do not offer any other time.` : 'No free slot found in the booking window. Offer a staff callback.'}`,
  });
}));

router.post('/api/voice/book-appointment', wrap(async (req, res) => {
  const a = args(req);
  const r = await appointments.book(a, { source: 'ai_voice', actor: 'omnidimension', callId: a.call_id ? String(a.call_id).slice(0, 100) : null });
  if (r.ok) {
    const x = r.appointment;
    return res.json({
      success: true, status: 'booked', appointment_no: x.appointment_no,
      appointment: { appointment_no: x.appointment_no, doctor: x.doctor_name, department: x.department, date: x.appointment_date, time: x.appointment_time, session: x.session },
      message: `Booked and saved. Appointment number ${x.appointment_no.split('').join(' ')}: ${x.patient_name} with ${x.doctor_name} on ${clock.prettyDate(x.appointment_date)} at ${clock.prettyTime(x.appointment_time)}. Read the appointment number to the caller and ask them to arrive 10 minutes early.`,
    });
  }
  if (r.code === 'validation') {
    return res.json({ success: false, status: 'needs_info', missing: Object.keys(r.errors), errors: r.errors, message: `NOT booked. Missing or invalid: ${Object.values(r.errors).join(' ')} Ask the caller, then try again.` });
  }
  if (r.code === 'duplicate') {
    return res.json({ success: false, status: 'duplicate', appointment_no: r.appointment.appointment_no, message: `NOT booked again — this patient already has appointment ${r.appointment.appointment_no} with ${r.appointment.doctor_name} on ${clock.prettyDate(r.appointment.appointment_date)} at ${clock.prettyTime(r.appointment.appointment_time)}.` });
  }
  res.json({
    success: false, status: 'unavailable', reason: r.reason, alternatives: r.alternatives,
    message: `NOT booked. ${r.reason_text} ${r.alternatives.length ? `Next actual available: ${say(r.alternatives)}. Offer these to the caller.` : 'No free slot in the booking window. Offer a staff callback.'}`,
  });
}));

router.post('/api/voice/find-appointment', wrap(async (req, res) => {
  const a = args(req);
  const mobile = v.parseMobile(a.mobile);
  if (!mobile) return res.json({ success: false, status: 'needs_info', missing: ['mobile'], message: 'Ask for the registered mobile number.' });
  let list;
  if (a.appointment_no) {
    const one = await appointments.findForPatient(a.appointment_no, mobile);
    list = one ? [one] : [];
  } else list = await appointments.upcomingForMobile(mobile);
  if (!list.length) return res.json({ success: false, status: 'not_found', message: 'No upcoming appointment found for these details. Re-check the number with the caller.' });
  res.json({
    success: true, status: 'found',
    appointments: list.map((x) => ({ appointment_no: x.appointment_no, patient_name: x.patient_name, doctor: x.doctor_name, date: x.appointment_date, time: x.appointment_time, status: x.status })),
    message: `Found: ${list.map(speakAppt).join('; ')}.`,
  });
}));

async function ownedAppointment(a) {
  const mobile = v.parseMobile(a.mobile);
  if (!a.appointment_no || !mobile) return { error: { success: false, status: 'needs_info', missing: ['appointment_no', 'mobile'].filter((k) => !(k === 'mobile' ? mobile : a.appointment_no)), message: 'Ask for the appointment number and registered mobile number (or use find-appointment with the mobile).' } };
  const appt = await appointments.findForPatient(a.appointment_no, mobile);
  if (!appt) return { error: { success: false, status: 'not_found', message: 'No appointment matches that number and mobile.' } };
  return { appt };
}

router.post('/api/voice/reschedule-appointment', wrap(async (req, res) => {
  const a = args(req);
  const { appt, error } = await ownedAppointment(a);
  if (error) return res.json(error);
  const r = await appointments.reschedule(appt.id, {
    appointment_date: a.new_date ?? a.new_appointment_date ?? a.appointment_date,
    appointment_time: a.new_time ?? a.new_appointment_time ?? a.appointment_time,
    session: a.new_session ?? a.session,
  }, 'omnidimension');
  if (r.ok) return res.json({ success: true, status: 'rescheduled', message: `Rescheduled and saved: ${speakAppt(r.appointment)}. The appointment number stays the same.` });
  if (r.code === 'validation') return res.json({ success: false, status: 'needs_info', errors: r.errors, message: `NOT changed. ${Object.values(r.errors).join(' ')}` });
  if (r.code === 'unavailable') return res.json({ success: false, status: 'unavailable', alternatives: r.alternatives, message: `NOT changed. ${r.reason_text} ${r.alternatives.length ? `Next actual available: ${say(r.alternatives)}.` : ''}` });
  res.json({ success: false, status: r.code, message: `NOT changed. ${r.message || ''}` });
}));

router.post('/api/voice/cancel-appointment', wrap(async (req, res) => {
  const a = args(req);
  const { appt, error } = await ownedAppointment(a);
  if (error) return res.json(error);
  const r = await appointments.cancel(appt.id, a.reason || 'Cancelled on AI call', 'omnidimension');
  if (!r.ok) return res.json({ success: false, status: r.code, message: `NOT cancelled. ${r.message || ''}` });
  res.json({ success: true, status: 'cancelled', message: `Cancelled and saved: ${r.appointment.appointment_no}.` });
}));

router.post('/api/voice/staff-callback', wrap(async (req, res) => {
  const a = args(req);
  const reason = v.cleanText(a.reason || a.message || a.callback_reason, 500);
  if (!reason) return res.json({ success: false, status: 'needs_info', missing: ['reason'], message: 'Ask briefly what the team should call back about.' });
  const mobile = v.parseMobile(a.mobile);
  const name = v.parseName(a.patient_name);
  const lang = v.parseLanguage(a.language);
  await db().run(
    'INSERT INTO staff_requests (patient_name, mobile, reason, language, source, status, created_at) VALUES (?,?,?,?,?,?,?)',
    [name, mobile, reason, lang, 'ai_voice', 'open', clock.nowIST().stamp],
  );
  await notify('staff_attention', null, { patient_name: name, mobile, reason, source: 'AI voice call' }, { patient: false });
  res.json({ success: true, status: 'callback_logged', message: 'Callback request saved for the hospital team. Tell the caller the team will call them back.' });
}));

// Post-call webhook: store summary/transcript metadata for the admin dashboard.
router.post('/api/voice/call-ended', wrap(async (req, res) => {
  const b = req.body || {};
  const data = b.extracted_variables || b.extracted_data || b.post_call_data || b.data || {};
  const pick = (...k) => k.map((x) => b[x] ?? data[x]).find((x) => x !== undefined && x !== null && x !== '');
  const raw = JSON.stringify(b).slice(0, 20000);
  await db().run(
    'INSERT INTO voice_calls (call_id, caller_mobile, language, summary, outcome, appointment_no, raw, created_at) VALUES (?,?,?,?,?,?,?,?)',
    [
      String(pick('call_id', 'callId', 'id') ?? '').slice(0, 100) || null,
      String(pick('caller_mobile', 'from_number', 'phone_number', 'mobile') ?? '').slice(0, 15) || null,
      String(pick('language') ?? '').slice(0, 10) || null,
      String(pick('summary', 'call_summary') ?? '').slice(0, 5000) || null,
      String(pick('outcome', 'call_outcome', 'status') ?? '').slice(0, 40) || null,
      v.parseAppointmentNo(pick('appointment_no', 'appointment_number')) || null,
      raw, clock.nowIST().stamp,
    ],
  );
  res.json({ success: true });
}));

module.exports = { router };
