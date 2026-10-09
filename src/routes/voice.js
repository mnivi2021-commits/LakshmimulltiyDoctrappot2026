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
const config = require('../config');
const { voiceCors, requireWebhookSecret, requirePostCallSecret, rateLimit } = require('../middleware/security');

const router = express.Router();
// CORS first: browser preflights are answered before rate limiting and auth;
// real requests then go through the unchanged rate limit + secret check.
router.use('/api/voice', voiceCors, rateLimit({ windowMs: 60e3, max: 120, name: 'voice' }), requireWebhookSecret);

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

// Exact phrases the agent should speak (it translates them to Tamil/Hindi as needed).
const SAY = {
  greeting: 'Welcome to Lakshmi Multispecialty Hospital. How can I help you?',
  ask_doctor: 'Certainly. Which doctor or specialist would you like to consult?',
  ask_date: 'What date would you like to book your appointment?',
  ask_session: 'Would you prefer a morning or evening appointment?',
  ask_time: 'What time would you prefer?',
  not_understood: "Sorry, I didn't understand that. Could you please repeat?",
  system_error: "I'm unable to confirm the appointment right now. I can send your request to the hospital staff for assistance.",
  confirm_q: 'Would you like me to confirm this appointment?',
};
const DOCTOR_MENU = 'We have Mr. Vijul, Orthopaedic; Mr. Vishwa, Diabetologist; and Ms. Nivi, Heart Specialist.';

const wrap = (fn) => (req, res) => fn(req, res).catch((e) => {
  console.error('[voice]', e);
  res.json({
    success: false, status: 'system_error', say: SAY.system_error,
    message: `NOTHING was booked or changed. Say: "${SAY.system_error}" If the caller agrees, call staff_callback with their name, mobile and request.`,
  });
});

const say = (s) => s.map((x, i) => `${i + 1}) ${x.doctor}, ${x.display}`).join('; ');

/** "today at 10:30 AM" / "tomorrow at 9:30 AM" / "Friday, 16 Oct 2026 at 10:00 AM" */
function spoken(slot) {
  const today = clock.nowIST().date;
  const t = clock.prettyTime(slot.time);
  if (slot.date === today) return `today at ${t}`;
  if (slot.date === clock.addDays(today, 1)) return `tomorrow at ${t}`;
  return `${clock.prettyDate(slot.date)} at ${t}`;
}

/** The sentence the caller should hear when the requested slot/day is not possible. */
function unavailableSay(reason, doctor, alternatives) {
  const next = alternatives[0];
  if (!next) return `${availability.REASON_TEXT[reason] || 'That time is not available.'} ${SAY.system_error}`;
  const n = spoken(next);
  switch (reason) {
    case 'slot_taken': return `The requested time is already booked. The next available appointment is ${n}. Would you like me to book it?`;
    case 'booking_closed_today':
    case 'slot_passed': return `Today's appointments are closed. The first available appointment is ${n}. Would you like me to book it?`;
    case 'doctor_on_leave':
    case 'session_on_leave': return `${doctor.name} is unavailable on that date. The next available appointment is ${n}. Would you like me to book that?`;
    default: return `${availability.REASON_TEXT[reason] || 'That time is not available.'} The next available appointment is ${n}. Would you like me to book it?`;
  }
}

function unavailableReply(reason, reasonText, doctor, alternatives, prefix = '') {
  const sayText = unavailableSay(reason, doctor, alternatives);
  return {
    success: false, status: 'unavailable', available: false, reason, alternatives, say: sayText,
    message: `${prefix}${reasonText || ''} Say: "${sayText}" Offer ONLY these real times: ${alternatives.length ? say(alternatives) : 'none – offer staff_callback'}.`,
  };
}

/** Doctor text given but not one of ours → unknown_doctor; nothing given → ask. */
function doctorProblem(a) {
  if (String(a.doctor || a.department || '').trim()) {
    const sayText = `Sorry, I couldn't find that doctor at our hospital. ${DOCTOR_MENU} Which doctor or specialist would you like to consult?`;
    return { success: false, status: 'unknown_doctor', missing: ['doctor'], say: sayText, message: `Unknown doctor "${String(a.doctor || a.department).slice(0, 60)}". Never invent a doctor. Say: "${sayText}"` };
  }
  return { success: false, status: 'needs_info', missing: ['doctor'], say: SAY.ask_doctor, message: `Say: "${SAY.ask_doctor}" ${DOCTOR_MENU}` };
}

const isConfirmed = (x) => x === true || /^(true|yes|y|1|confirmed|ok|ஆம்|हाँ|हां)$/i.test(String(x ?? '').trim());

function speakAppt(a) {
  return `${a.appointment_no} – ${a.patient_name} with ${a.doctor_name} (${a.department}) on ${clock.prettyDate(a.appointment_date)} at ${clock.prettyTime(a.appointment_time)}, status ${a.status}`;
}

router.post('/api/voice/doctors', wrap(async (req, res) => {
  const list = await doctors.listDoctors();
  res.json({
    success: true,
    today: clock.prettyDate(clock.nowIST().date),
    greeting: SAY.greeting,
    doctors: list.map((d) => ({
      name: d.name, qualification: d.qualification, department: d.label.en,
      timings: d.sessions.map((s) => `${s.session} ${clock.prettyTime(s.start_time)}–${clock.prettyTime(s.end_time)}`).join(', '),
      days: 'Monday to Saturday',
    })),
    message: list.map((d) => `${d.name} (${d.qualification}), ${d.label.en}: ${d.sessions.map((s) => `${clock.prettyTime(s.start_time)} to ${clock.prettyTime(s.end_time)}`).join(' and ')}`).join('. '),
  });
}));

// CHECK_AVAILABILITY_TOOL — read-only; never reserves anything.
router.post('/api/voice/check-availability', wrap(async (req, res) => {
  const a = args(req);
  const doctor = await doctors.resolveDoctor(a.doctor, a.department);
  if (!doctor) return res.json(doctorProblem(a));
  const rawDate = String(a.appointment_date ?? '').trim();
  const date = v.parseDate(rawDate);
  if (!date) {
    return res.json(rawDate
      ? { success: false, status: 'needs_info', missing: ['appointment_date'], say: SAY.not_understood, message: `Could not understand the date "${rawDate.slice(0, 40)}". Say: "${SAY.not_understood}" then "${SAY.ask_date}"` }
      : { success: false, status: 'needs_info', missing: ['appointment_date'], say: SAY.ask_date, message: `Say: "${SAY.ask_date}"` });
  }
  const session = v.parseSession(a.session);
  const times = v.parseTimeCandidates(a.appointment_time, a.session);
  const r = await availability.checkSlot(doctor, date, times, session);

  if (r.available) {
    const sayText = `${clock.prettyTime(r.slot.time)} on ${clock.prettyDate(r.slot.date)} is available.`;
    return res.json({
      success: true, status: 'available', available: true, slot: r.slot, say: sayText,
      message: `Say: "${sayText}" It is NOT booked yet. Collect patient name, mobile, new/existing and reason, read back the details, ask "${SAY.confirm_q}" and only after the caller says yes call book_appointment with appointment_date ${r.slot.date}, appointment_time ${r.slot.time}, session ${r.slot.session} and patient_confirmed true.`,
    });
  }
  if (!r.needs_time) return res.json(unavailableReply(r.reason, r.reason_text, doctor, r.alternatives));

  // Day has free slots but no time was given: follow the flow session → time.
  if (!session) {
    return res.json({ success: true, status: 'needs_info', missing: ['session'], say: SAY.ask_session, message: `${doctor.name} has free appointments on ${clock.prettyDate(date)}. Say: "${SAY.ask_session}"` });
  }
  const list = r.alternatives.map((x) => clock.prettyTime(x.time)).join(', ');
  const sayText = r.alternatives.length ? `${SAY.ask_time} Available times are ${list}.` : SAY.system_error;
  res.json({
    success: true, status: 'choose_time', available: false, alternatives: r.alternatives, say: sayText,
    message: r.alternatives.length ? `Say: "${sayText}" Offer only these real times: ${say(r.alternatives)}.` : 'No free slots found in the booking window. Offer staff_callback.',
  });
}));

// CREATE_APPOINTMENT_TOOL — the backend issues the official LMH number only
// after the database reserves the slot, and only once the caller confirmed.
router.post('/api/voice/book-appointment', wrap(async (req, res) => {
  const a = args(req);
  const callId = a.call_id ? String(a.call_id).slice(0, 100) : null;

  if (!isConfirmed(a.patient_confirmed)) {
    // Validate and check the slot, but write nothing — return the read-back.
    const { data, errors } = await appointments.normalize(a);
    if (errors) {
      if (errors.doctor) return res.json(doctorProblem(a));
      return res.json({ success: false, status: 'needs_info', missing: Object.keys(errors), errors, say: SAY.not_understood, message: `NOT booked. Missing or invalid: ${Object.values(errors).join(' ')} Ask the caller for it.` });
    }
    const chk = await availability.checkSlot(data.doctor, data.date, data.times, data.session);
    if (!chk.available) return res.json(unavailableReply(chk.reason, chk.reason_text, data.doctor, chk.alternatives, 'NOT booked. '));
    const dept = data.doctor.label.en;
    const sayText = `Let me confirm: patient ${data.patient_name}, ${data.doctor.name}, ${dept}, on ${clock.prettyDate(chk.slot.date)} at ${clock.prettyTime(chk.slot.time)}. ${SAY.confirm_q}`;
    return res.json({
      success: false, status: 'needs_confirmation', booked: false, say: sayText,
      readback: { patient_name: data.patient_name, doctor: data.doctor.name, department: dept, appointment_date: chk.slot.date, appointment_time: chk.slot.time, session: chk.slot.session },
      message: `NOT booked yet. Say: "${sayText}" If the caller says yes, call book_appointment again with the same details and patient_confirmed true.`,
    });
  }

  const r = await appointments.book(a, { source: 'ai_voice', actor: 'omnidimension', callId });
  if (r.ok) {
    const x = r.appointment;
    const spokenNo = x.appointment_no.replace('-', ' ').split('').join(' ').replace(/\s+/g, ' ');
    const sayText = `Your appointment is confirmed. Your appointment number is ${x.appointment_no}. ${x.patient_name} with ${x.doctor_name} on ${clock.prettyDate(x.appointment_date)} at ${clock.prettyTime(x.appointment_time)}. Please arrive 10 minutes early.`;
    return res.json({
      success: true, status: 'booked', booked: true, appointment_no: x.appointment_no, appointment_status: x.status, say: sayText,
      appointment: { appointment_no: x.appointment_no, patient_name: x.patient_name, doctor: x.doctor_name, department: x.department, date: x.appointment_date, time: x.appointment_time, session: x.session, status: x.status },
      message: `CONFIRMED and saved in the hospital system. Say: "${sayText}" Read the number slowly: ${spokenNo}.`,
    });
  }
  if (r.code === 'validation') {
    if (r.errors.doctor) return res.json(doctorProblem(a));
    return res.json({ success: false, status: 'needs_info', missing: Object.keys(r.errors), errors: r.errors, say: SAY.not_understood, message: `NOT booked. Missing or invalid: ${Object.values(r.errors).join(' ')} Ask the caller, then try again.` });
  }
  if (r.code === 'duplicate') {
    const d = r.appointment;
    const sayText = `You already have appointment ${d.appointment_no} with ${d.doctor_name} on ${clock.prettyDate(d.appointment_date)} at ${clock.prettyTime(d.appointment_time)}.`;
    return res.json({ success: false, status: 'duplicate', appointment_no: d.appointment_no, say: sayText, message: `NOT booked again. Say: "${sayText}"` });
  }
  // Slot taken (e.g. by a simultaneous caller), leave, closed day, …
  const doctor = await doctors.resolveDoctor(a.doctor, a.department);
  res.json(unavailableReply(r.reason, r.reason_text, doctor, r.alternatives, 'NOT booked. '));
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

// Post-call webhook (OmniDimension "Post-Call" tab → Delivery Method: Webhook).
// OmniDimension sends { call_id, bot_id, phone_number, call_report: { summary,
// sentiment, extracted_variables, full_conversation, … } }.
// Only the structured appointment fields are stored — never the transcript,
// summary or raw payload. Values are cross-checked against the appointments
// table, which stays the source of truth.
const EV_KEYS = ['patient_name', 'mobile', 'doctor', 'department', 'appointment_date', 'appointment_time', 'session', 'reason', 'appointment_number', 'appointment_status', 'call_language', 'call_id'];

function extractedVariables(b) {
  const report = (b.call_report && typeof b.call_report === 'object') ? b.call_report : {};
  let ev = report.extracted_variables ?? b.extracted_variables ?? b.extracted_data ?? {};
  if (typeof ev === 'string') { try { ev = JSON.parse(ev); } catch { ev = {}; } }
  if (Array.isArray(ev)) ev = Object.fromEntries(ev.map((x) => [x.key ?? x.name, x.value]));
  return ev && typeof ev === 'object' ? ev : {};
}

router.post('/api/voice/call-ended', requirePostCallSecret, wrap(async (req, res) => {
  const b = req.body || {};
  const ev = extractedVariables(b);
  const val = (k, max) => { const x = ev[k] ?? b[k]; return x === undefined || x === null || x === '' ? null : v.cleanText(x, max) || null; };

  const botId = b.bot_id != null ? String(b.bot_id).slice(0, 100) : null;
  if (config.omnidim.agentId && botId && botId !== String(config.omnidim.agentId)) {
    return res.status(403).json({ success: false, message: 'Unknown agent' });
  }
  const callId = val('call_id', 100) || (b.call_id != null ? String(b.call_id).slice(0, 100) : null);
  const row = {
    call_id: callId,
    bot_id: botId,
    caller_mobile: v.parseMobile(b.phone_number ?? b.from_number) || v.parseMobile(ev.mobile),
    language: v.parseLanguage(val('call_language', 20)) || val('call_language', 10),
    outcome: val('appointment_status', 40) || (b.call_status ? v.cleanText(b.call_status, 40) : null),
    patient_name: v.parseName(val('patient_name', 80)),
    doctor: val('doctor', 80), department: val('department', 60),
    appointment_date: v.parseDate(val('appointment_date', 40)),
    appointment_time: (v.parseTimeCandidates(val('appointment_time', 20), val('session', 20))[0]) || null,
    session: v.parseSession(val('session', 20)),
    reason: val('reason', 300),
    appointment_no: v.parseAppointmentNo(val('appointment_number', 20)),
    appointment_status: val('appointment_status', 20),
    verified: 0,
  };
  // The hospital database, not the AI's summary, is authoritative.
  if (row.appointment_no) {
    const appt = await appointments.getByNo(row.appointment_no);
    const mobile = v.parseMobile(ev.mobile) || row.caller_mobile;
    if (appt && ((callId && appt.call_id === callId) || (mobile && appt.mobile === mobile))) {
      Object.assign(row, {
        patient_name: appt.patient_name, doctor: appt.doctor_name, department: appt.department,
        appointment_date: appt.appointment_date, appointment_time: appt.appointment_time, session: appt.session,
        appointment_status: appt.status, verified: 1,
      });
    }
  }
  const cols = ['call_id', 'bot_id', 'caller_mobile', 'language', 'outcome', 'patient_name', 'doctor', 'department',
    'appointment_date', 'appointment_time', 'session', 'reason', 'appointment_no', 'appointment_status', 'verified'];
  const existing = callId ? await db().get('SELECT id FROM voice_calls WHERE call_id = ?', [callId]) : null;
  if (existing) {
    await db().run(`UPDATE voice_calls SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`, [...cols.map((c) => row[c]), existing.id]);
  } else {
    await db().run(
      `INSERT INTO voice_calls (${cols.join(', ')}, summary, raw, created_at) VALUES (${cols.map(() => '?').join(',')}, NULL, NULL, ?)`,
      [...cols.map((c) => row[c]), clock.nowIST().stamp],
    );
  }
  res.json({ success: true, stored: EV_KEYS.filter((k) => ev[k] !== undefined), verified: Boolean(row.verified) });
}));

module.exports = { router };
