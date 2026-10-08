'use strict';
// Booking, confirmation, cancellation, rescheduling and doctor leave.
// An appointment number is issued only after the database accepts the slot.
const config = require('../config');
const clock = require('../clock');
const { db, isUniqueViolation } = require('../db');
const v = require('./validate');
const doctors = require('./doctors');
const availability = require('./availability');
const { notify } = require('./notifications');

const ACTIVE = ['booked', 'confirmed', 'leave_affected'];
const SELECT = `SELECT a.*, d.name AS doctor_name FROM appointments a JOIN doctors d ON d.id = a.doctor_id`;

const slotKey = (doctorId, date, time) => `${doctorId}|${date}|${time}`;

async function logEvent(conn, appointmentId, event, details, actor) {
  await conn.run(
    'INSERT INTO appointment_events (appointment_id, event, details, actor, created_at) VALUES (?,?,?,?,?)',
    [appointmentId, event, details ? JSON.stringify(details) : null, actor || 'system', clock.nowIST().stamp],
  );
}

/** Serialises all slot-changing transactions (row lock on MySQL, BEGIN IMMEDIATE on SQLite). */
async function lockCounter(conn) {
  const row = await conn.get(`SELECT value FROM counters WHERE name = 'appointment'${conn.dialect === 'mysql' ? ' FOR UPDATE' : ''}`);
  if (!row) throw new Error('Counter missing – run npm run db:setup');
  return Number(row.value);
}

async function getById(id, conn = db()) {
  return conn.get(`${SELECT} WHERE a.id = ?`, [id]);
}
async function getByNo(no, conn = db()) {
  const n = v.parseAppointmentNo(no);
  return n ? conn.get(`${SELECT} WHERE a.appointment_no = ?`, [n]) : null;
}

/** Validates booking input from any channel. Returns { data } or { errors }. */
async function normalize(input) {
  const errors = {};
  const patient_name = v.parseName(input.patient_name);
  if (!patient_name) errors.patient_name = 'Patient name is required.';
  const mobile = v.parseMobile(input.mobile);
  if (!mobile) errors.mobile = 'A valid 10-digit Indian mobile number is required.';
  const doctor = await doctors.resolveDoctor(input.doctor ?? input.doctor_id, input.department);
  if (!doctor) errors.doctor = 'Please choose a doctor: Mr. Vijul (Orthopaedic), Mr. Vishwa (Diabetologist) or Ms. Nivi (Heart Specialist).';
  const date = v.parseDate(input.appointment_date);
  if (!date) errors.appointment_date = 'Appointment date is required (YYYY-MM-DD).';
  const session = v.parseSession(input.session);
  const times = v.parseTimeCandidates(input.appointment_time, input.session);
  if (!times.length) errors.appointment_time = 'Preferred appointment time is required.';
  const reason = v.cleanText(input.reason, 300);
  if (reason.length < 2) errors.reason = 'Reason for visit is required.';
  const patient_type = v.parsePatientType(input.patient_type);
  if (!patient_type) errors.patient_type = 'Please say whether this is a new or existing patient.';
  const language = v.parseLanguage(input.language) || 'en';
  if (Object.keys(errors).length) return { errors };
  return { data: { patient_name, mobile, doctor, date, session, times, reason, patient_type, language } };
}

/**
 * Book an appointment. Returns
 *   { ok: true, appointment }                         – slot saved in DB
 *   { ok: false, code: 'validation', errors }
 *   { ok: false, code: 'unavailable', reason, alternatives }
 *   { ok: false, code: 'duplicate', appointment }       – same patient already booked that doctor/day
 */
async function book(input, { source = 'website', actor = 'patient', callId = null } = {}) {
  const { data, errors } = await normalize(input);
  if (errors) return { ok: false, code: 'validation', errors };
  const { doctor } = data;

  let created;
  try {
    created = await db().transaction(async (conn) => {
      const counter = await lockCounter(conn);
      const check = await availability.checkSlot(doctor, data.date, data.times, data.session, conn);
      if (!check.available) return { ok: false, code: 'unavailable', reason: check.reason, reason_text: check.reason_text, alternatives: check.alternatives };

      const dup = await conn.get(
        `${SELECT} WHERE a.mobile = ? AND a.doctor_id = ? AND a.appointment_date = ? AND LOWER(a.patient_name) = LOWER(?) AND a.status IN ('booked','confirmed','leave_affected')`,
        [data.mobile, doctor.id, data.date, data.patient_name],
      );
      if (dup) return { ok: false, code: 'duplicate', appointment: dup };

      const { date, time, session } = check.slot;
      const no = `${config.booking.prefix}-${String(counter + 1).padStart(4, '0')}`;
      const stamp = clock.nowIST().stamp;
      const r = await conn.run(
        `INSERT INTO appointments (appointment_no, doctor_id, department, appointment_date, appointment_time, session,
          patient_name, mobile, reason, patient_type, language, source, status, slot_key, call_id, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [no, doctor.id, doctor.department, date, time, session, data.patient_name, data.mobile, data.reason,
          data.patient_type, data.language, source, 'booked', slotKey(doctor.id, date, time), callId, stamp, stamp],
      );
      await conn.run("UPDATE counters SET value = ? WHERE name = 'appointment'", [counter + 1]);
      await logEvent(conn, r.insertId, 'created', { source }, actor);
      return { ok: true, appointment: await getById(r.insertId, conn) };
    });
  } catch (e) {
    if (isUniqueViolation(e)) {
      const alternatives = await availability.findNextAvailable(doctor, data.date, { afterTime: data.times[0] });
      return { ok: false, code: 'unavailable', reason: 'slot_taken', reason_text: availability.REASON_TEXT.slot_taken, alternatives };
    }
    throw e;
  }
  if (created.ok) await notify('new_appointment', created.appointment);
  return created;
}

async function confirm(id, actor = 'admin') {
  const a = await getById(id);
  if (!a) return { ok: false, code: 'not_found' };
  if (a.status !== 'booked') return { ok: false, code: 'invalid_status', message: `Cannot confirm an appointment that is ${a.status}.` };
  await db().run("UPDATE appointments SET status = 'confirmed', updated_at = ? WHERE id = ?", [clock.nowIST().stamp, id]);
  await logEvent(db(), id, 'confirmed', null, actor);
  const updated = await getById(id);
  await notify('appointment_confirmed', updated);
  return { ok: true, appointment: updated };
}

async function cancel(id, reason = '', actor = 'admin') {
  const a = await getById(id);
  if (!a) return { ok: false, code: 'not_found' };
  if (!ACTIVE.includes(a.status)) return { ok: false, code: 'invalid_status', message: `Appointment is already ${a.status}.` };
  const why = v.cleanText(reason, 200);
  await db().run(
    "UPDATE appointments SET status = 'cancelled', slot_key = NULL, cancel_reason = ?, updated_at = ? WHERE id = ?",
    [why || null, clock.nowIST().stamp, id],
  );
  await logEvent(db(), id, 'cancelled', { reason: why }, actor);
  const updated = await getById(id);
  await notify('appointment_cancelled', updated, { reason: why });
  return { ok: true, appointment: updated };
}

/** Move an active appointment to a new real slot. Keeps the same appointment number. */
async function reschedule(id, { appointment_date, appointment_time, session }, actor = 'admin') {
  const a = await getById(id);
  if (!a) return { ok: false, code: 'not_found' };
  if (!ACTIVE.includes(a.status)) return { ok: false, code: 'invalid_status', message: `Cannot reschedule an appointment that is ${a.status}.` };
  const date = v.parseDate(appointment_date);
  const times = v.parseTimeCandidates(appointment_time, session);
  const errors = {};
  if (!date) errors.appointment_date = 'New date is required.';
  if (!times.length) errors.appointment_time = 'New time is required.';
  if (Object.keys(errors).length) return { ok: false, code: 'validation', errors };
  const doctor = await doctors.getDoctor(a.doctor_id);
  const from = `${clock.prettyDate(a.appointment_date)} ${clock.prettyTime(a.appointment_time)}`;

  let out;
  try {
    out = await db().transaction(async (conn) => {
      await lockCounter(conn);
      const check = await availability.checkSlot(doctor, date, times, v.parseSession(session), conn);
      if (!check.available) return { ok: false, code: 'unavailable', reason: check.reason, reason_text: check.reason_text, alternatives: check.alternatives };
      const s = check.slot;
      await conn.run(
        `UPDATE appointments SET appointment_date = ?, appointment_time = ?, session = ?, slot_key = ?,
          status = CASE WHEN status = 'leave_affected' THEN 'booked' ELSE status END,
          suggested_date = NULL, suggested_time = NULL, reminder_sent_at = NULL, updated_at = ? WHERE id = ?`,
        [s.date, s.time, s.session, slotKey(doctor.id, s.date, s.time), clock.nowIST().stamp, id],
      );
      await logEvent(conn, id, 'rescheduled', { from: { date: a.appointment_date, time: a.appointment_time }, to: { date: s.date, time: s.time } }, actor);
      return { ok: true, appointment: await getById(id, conn) };
    });
  } catch (e) {
    if (isUniqueViolation(e)) return { ok: false, code: 'unavailable', reason: 'slot_taken', reason_text: availability.REASON_TEXT.slot_taken, alternatives: await availability.findNextAvailable(doctor, date, { afterTime: times[0] }) };
    throw e;
  }
  if (out.ok) await notify('appointment_rescheduled', out.appointment, { from });
  return out;
}

/**
 * Mark a doctor on leave for a date (full day or one session). No new bookings
 * are possible for that period. Existing appointments become 'leave_affected',
 * each gets a distinct suggested next real slot, and staff + patients are notified.
 */
async function markLeave({ doctor_id, leave_date, session = 'full', reason = '' }, actor = 'admin') {
  const doctor = await doctors.getDoctor(doctor_id);
  if (!doctor) return { ok: false, code: 'validation', errors: { doctor_id: 'Unknown doctor.' } };
  const date = v.parseDate(leave_date);
  if (!date) return { ok: false, code: 'validation', errors: { leave_date: 'Leave date is required.' } };
  if (date < clock.nowIST().date) return { ok: false, code: 'validation', errors: { leave_date: 'Leave date cannot be in the past.' } };
  const sess = ['morning', 'evening'].includes(session) ? session : 'full';
  const why = v.cleanText(reason, 200);

  const affected = await db().transaction(async (conn) => {
    await lockCounter(conn);
    const existing = await conn.get('SELECT id FROM doctor_leaves WHERE doctor_id = ? AND leave_date = ? AND session = ?', [doctor.id, date, sess]);
    if (!existing) {
      await conn.run(
        'INSERT INTO doctor_leaves (doctor_id, leave_date, session, reason, created_by, created_at) VALUES (?,?,?,?,?,?)',
        [doctor.id, date, sess, why, actor, clock.nowIST().stamp],
      );
    }
    const rows = await conn.all(
      `${SELECT} WHERE a.doctor_id = ? AND a.appointment_date = ? AND a.status IN ('booked','confirmed')${sess === 'full' ? '' : ' AND a.session = ?'} ORDER BY a.appointment_time`,
      sess === 'full' ? [doctor.id, date] : [doctor.id, date, sess],
    );
    const skip = new Set();
    for (const a of rows) {
      const [next] = await availability.findNextAvailable(doctor, clock.addDays(date, sess === 'full' ? 1 : 0), { afterTime: sess === 'full' ? null : a.appointment_time, skip, limit: 1, conn });
      if (next) skip.add(`${next.date}|${next.time}`);
      await conn.run(
        "UPDATE appointments SET status = 'leave_affected', suggested_date = ?, suggested_time = ?, updated_at = ? WHERE id = ?",
        [next ? next.date : null, next ? next.time : null, clock.nowIST().stamp, a.id],
      );
      await logEvent(conn, a.id, 'leave_affected', { leave_date: date, session: sess, suggestion: next || null }, actor);
      a.suggestion = next;
    }
    return rows;
  });

  await notify('doctor_leave', null, { doctor_name: doctor.name, date, session: sess, reason: why, affected: affected.length }, { patient: false });
  for (const a of affected) {
    const fresh = await getById(a.id);
    await notify('doctor_unavailable', fresh, { suggestion: a.suggestion ? a.suggestion.display : null });
  }
  return { ok: true, doctor: doctor.name, date, session: sess, affected: affected.map((a) => ({ appointment_no: a.appointment_no, suggestion: a.suggestion || null })) };
}

async function removeLeave(id) {
  const r = await db().run('DELETE FROM doctor_leaves WHERE id = ?', [id]);
  return { ok: r.changes > 0 };
}

async function listLeaves(fromDate) {
  return db().all(
    'SELECT l.*, d.name AS doctor_name FROM doctor_leaves l JOIN doctors d ON d.id = l.doctor_id WHERE l.leave_date >= ? ORDER BY l.leave_date, d.sort_order',
    [fromDate],
  );
}

/** Admin search. All filters optional. */
async function list({ q, doctor_id, date, from, to, status, source, limit = 200 } = {}) {
  const where = []; const params = [];
  if (q) {
    const no = v.parseAppointmentNo(q);
    where.push('(a.patient_name LIKE ? OR a.mobile LIKE ? OR a.appointment_no = ?)');
    params.push(`%${q}%`, `%${String(q).replace(/\D/g, '') || q}%`, no || q);
  }
  if (doctor_id) { where.push('a.doctor_id = ?'); params.push(Number(doctor_id)); }
  if (date) { where.push('a.appointment_date = ?'); params.push(date); }
  if (from) { where.push('a.appointment_date >= ?'); params.push(from); }
  if (to) { where.push('a.appointment_date <= ?'); params.push(to); }
  if (status === 'active') where.push("a.status IN ('booked','confirmed','leave_affected')");
  else if (status) { where.push('a.status = ?'); params.push(status); }
  if (source) { where.push('a.source = ?'); params.push(source); }
  const sql = `${SELECT}${where.length ? ' WHERE ' + where.join(' AND ') : ''} ORDER BY a.appointment_date, a.appointment_time LIMIT ${Math.min(Number(limit) || 200, 500)}`;
  return db().all(sql, params);
}

/** Public lookup — requires both the appointment number and the mobile number. */
async function findForPatient(no, mobile) {
  const a = await getByNo(no);
  const m = v.parseMobile(mobile);
  if (!a || !m || a.mobile !== m) return null;
  return a;
}

async function upcomingForMobile(mobile) {
  const m = v.parseMobile(mobile);
  if (!m) return [];
  return db().all(
    `${SELECT} WHERE a.mobile = ? AND a.appointment_date >= ? AND a.status IN ('booked','confirmed','leave_affected') ORDER BY a.appointment_date, a.appointment_time`,
    [m, clock.nowIST().date],
  );
}

module.exports = {
  book, confirm, cancel, reschedule, markLeave, removeLeave, listLeaves, list,
  getById, getByNo, findForPatient, upcomingForMobile, normalize, ACTIVE,
};
