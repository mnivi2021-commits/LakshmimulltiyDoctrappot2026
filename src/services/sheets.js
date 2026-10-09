'use strict';
// Optional mirror of voice bookings / staff callbacks into the Google Sheet
// (google-sheets/Code.gs). Fire-and-forget: never awaited by the API route,
// short timeout, all errors swallowed – Google being slow or down can never
// delay or fail a booking. Enabled only when SHEETS_WEBHOOK_URL and
// SHEETS_SECRET are set in .env.
const config = require('../config');

const TIMEOUT_MS = 8000;

function enabled() {
  return Boolean(config.sheets.webhookUrl && config.sheets.secret);
}

function send(row) {
  if (!enabled()) return Promise.resolve(false);
  const body = JSON.stringify({ secret: config.sheets.secret, type: 'request', ...row });
  // Apps Script answers POST with a redirect; fetch follows it by default.
  return fetch(config.sheets.webhookUrl, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body, redirect: 'follow',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
    .then((r) => r.ok)
    .catch((e) => { console.error('[sheets] mirror failed:', e.name === 'TimeoutError' ? 'timeout' : e.message); return false; });
}

/** Successful voice booking → row with Source "AI call – booked", Status "Booked". */
function mirrorBooking(a, { callId = null, callerNumber = null } = {}) {
  return send({
    patient_name: a.patient_name, mobile: a.mobile,
    doctor: `${a.doctor_name} – ${a.department}`,
    preferred_date: a.appointment_date, preferred_time: a.appointment_time,
    reason: a.reason, patient_type: a.patient_type, language: a.language,
    from_number: callerNumber || '', call_sid: callId || a.call_id || '',
    source: `AI call – booked (${a.appointment_no})`, status: 'Booked',
  });
}

/** staff_callback → row with Source "AI call – staff callback", Status "Callback requested". */
function mirrorCallback({ patient_name, mobile, reason, language, callId = null }) {
  return send({
    patient_name: patient_name || '', mobile: mobile || '', doctor: '', reason, language: language || '',
    call_sid: callId || '', source: 'AI call – staff callback', status: 'Callback requested',
  });
}

module.exports = { enabled, mirrorBooking, mirrorCallback };
