'use strict';
// WhatsApp notifications via the Meta WhatsApp Cloud API. Runs only on the
// server; token, phone-number ID and the staff number come from .env.
//
// Every message is logged in `notifications` with an honest status:
//   sent | failed | not_configured | dry_run
const config = require('../config');
const clock = require('../clock');
const { db } = require('../db');

const EVENTS = {
  new_appointment: 'New appointment',
  appointment_confirmed: 'Appointment confirmation',
  appointment_cancelled: 'Appointment cancellation',
  appointment_rescheduled: 'Appointment rescheduled',
  doctor_leave: 'Doctor leave',
  doctor_unavailable: 'Doctor unavailable',
  appointment_reminder: 'Appointment reminder',
  staff_attention: 'Staff attention required',
};

const H = 'Lakshmi Multispecialty Hospital';
const when = (a) => `${clock.prettyDate(a.appointment_date)}, ${clock.prettyTime(a.appointment_time)} (${a.session})`;

function staffText(event, a = {}, extra = {}) {
  const head = `*${EVENTS[event]}* – ${H}`;
  const appt = a.appointment_no ? [
    `No: ${a.appointment_no}`,
    `Patient: ${a.patient_name} (${a.patient_type}) – ${a.mobile}`,
    `Doctor: ${a.doctor_name} – ${a.department}`,
    `When: ${when(a)}`,
    `Reason: ${a.reason}`,
    `Source: ${a.source === 'ai_voice' ? 'AI voice call' : a.source}`,
  ] : [];
  const lines = {
    new_appointment: appt,
    appointment_confirmed: appt,
    appointment_cancelled: [...appt, extra.reason ? `Cancel reason: ${extra.reason}` : ''],
    appointment_rescheduled: [...appt, extra.from ? `Previously: ${extra.from}` : ''],
    appointment_reminder: appt,
    doctor_leave: event === 'doctor_leave' ? [
      `Doctor: ${extra.doctor_name}`, `Date: ${clock.prettyDate(extra.date)} (${extra.session === 'full' ? 'full day' : extra.session})`,
      extra.reason ? `Reason: ${extra.reason}` : '', `Affected appointments: ${extra.affected ?? 0}`,
    ] : [],
    doctor_unavailable: [...appt, extra.suggestion ? `Suggested new slot: ${extra.suggestion}` : 'No free slot found – please call patient.'],
    staff_attention: [
      extra.patient_name ? `Patient: ${extra.patient_name}` : '', extra.mobile ? `Mobile: ${extra.mobile}` : '',
      `Reason: ${extra.reason}`, extra.source ? `Source: ${extra.source}` : '',
    ],
  }[event] || appt;
  return [head, ...lines.filter(Boolean)].join('\n');
}

function patientText(event, a, extra = {}) {
  const base = `${H}\nAppointment ${a.appointment_no} with ${a.doctor_name} (${a.department})`;
  switch (event) {
    case 'new_appointment': return `${base}\nis booked for ${when(a)}.\nPlease arrive 10 minutes early.`;
    case 'appointment_confirmed': return `${base}\nis CONFIRMED for ${when(a)}.`;
    case 'appointment_cancelled': return `${base}\nhas been cancelled.`;
    case 'appointment_rescheduled': return `${base}\nis rescheduled to ${when(a)}.`;
    case 'appointment_reminder': return `Reminder: ${base}\nis on ${when(a)}.`;
    case 'doctor_unavailable':
      return `${base}\non ${when(a)} cannot go ahead – the doctor is unavailable.` +
        (extra.suggestion ? `\nThe first available slot is ${extra.suggestion}. Our staff will call you to confirm.` : '\nOur staff will call you to arrange a new time.');
    default: return base;
  }
}

function toIntl(num) {
  const d = String(num).replace(/\D/g, '');
  return d.length === 10 ? `91${d}` : d;
}

async function callWhatsApp(to, text) {
  const w = config.whatsapp;
  const url = `https://graph.facebook.com/${w.apiVersion}/${w.phoneNumberId}/messages`;
  const body = w.templateName
    ? {
      messaging_product: 'whatsapp', to: toIntl(to), type: 'template',
      // Template body parameters may not contain newlines.
      template: { name: w.templateName, language: { code: w.templateLang }, components: [{ type: 'body', parameters: [{ type: 'text', text: text.replace(/\n+/g, ' | ').slice(0, 1000) }] }] },
    }
    : { messaging_product: 'whatsapp', to: toIntl(to), type: 'text', text: { preview_url: false, body: text } };

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${w.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal: ctrl.signal,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: (json.error && json.error.message) || `HTTP ${res.status}` };
    return { ok: true, id: json.messages && json.messages[0] && json.messages[0].id };
  } catch (e) {
    return { ok: false, error: e.name === 'AbortError' ? 'Timed out' : e.message };
  } finally {
    clearTimeout(t);
  }
}

async function deliver(id) {
  const n = await db().get('SELECT * FROM notifications WHERE id = ?', [id]);
  if (!n) return null;
  let status; let error = null; let providerId = null;
  if (config.whatsapp.dryRun) status = 'dry_run';
  else if (!config.whatsapp.configured || !n.recipient) { status = 'not_configured'; error = !n.recipient ? 'Recipient number not set' : 'WhatsApp API credentials not set'; }
  else {
    const r = await callWhatsApp(n.recipient, n.message);
    status = r.ok ? 'sent' : 'failed'; error = r.error || null; providerId = r.id || null;
  }
  await db().run(
    'UPDATE notifications SET status = ?, error = ?, provider_message_id = ?, attempts = attempts + 1, sent_at = ? WHERE id = ?',
    [status, error, providerId, status === 'sent' ? clock.nowIST().stamp : null, id],
  );
  return status;
}

async function queue(event, audience, recipient, message, appointmentId = null) {
  const r = await db().run(
    'INSERT INTO notifications (appointment_id, event_type, audience, recipient, message, status, attempts, created_at) VALUES (?,?,?,?,?,?,0,?)',
    [appointmentId, event, audience, recipient || '', message, 'pending', clock.nowIST().stamp],
  );
  return r.insertId;
}

/**
 * Notify staff (always) and the patient (when WHATSAPP_NOTIFY_PATIENTS=true).
 * Never throws — a notification failure must not undo a booking.
 */
async function notify(event, appointment, extra = {}, { patient = true } = {}) {
  try {
    const ids = [await queue(event, 'staff', config.whatsapp.staffNumber, staffText(event, appointment || {}, extra), appointment && appointment.id)];
    if (patient && appointment && appointment.mobile && config.whatsapp.notifyPatients && event !== 'staff_attention' && event !== 'doctor_leave') {
      ids.push(await queue(event, 'patient', appointment.mobile, patientText(event, appointment, extra), appointment.id));
    }
    const statuses = [];
    for (const id of ids) statuses.push(await deliver(id));
    return statuses;
  } catch (e) {
    console.error(`[notify] ${event} failed:`, e.stack);
    return ['error'];
  }
}

module.exports = { notify, deliver, staffText, patientText, EVENTS };
