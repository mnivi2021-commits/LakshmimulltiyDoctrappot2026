'use strict';
// Real availability, computed from doctor sessions, leaves and existing
// bookings in the database. Nothing here ever invents a slot.
const config = require('../config');
const clock = require('../clock');
const { db } = require('../db');

const REASON_TEXT = {
  past_date: 'That date has already passed.',
  beyond_window: `Bookings are open only for the next ${config.booking.windowDays} days.`,
  not_working_day: 'The doctor does not consult on that day.',
  doctor_on_leave: 'The doctor is on leave on that day.',
  session_on_leave: 'The doctor is on leave for that session.',
  booking_closed_today: "Today's booking is closed for this doctor.",
  fully_booked: 'All appointments are booked for that day.',
  session_full: 'That session is fully booked.',
  outside_hours: 'That time is outside the doctor’s consulting hours.',
  slot_taken: 'That time is already booked.',
  slot_passed: 'That time has already passed or is too close to now for booking.',
  not_on_slot_grid: `Appointments start every ${config.booking.slotMinutes} minutes.`,
};

function sessionSlots(doctor, s) {
  const step = doctor.slot_minutes || config.booking.slotMinutes;
  const out = [];
  for (let m = clock.toMinutes(s.start_time); m + step <= clock.toMinutes(s.end_time); m += step) out.push(clock.fromMinutes(m));
  return out;
}

async function loadRange(doctorId, from, to, conn = db()) {
  const appts = await conn.all(
    'SELECT appointment_date, appointment_time FROM appointments WHERE doctor_id = ? AND appointment_date BETWEEN ? AND ? AND slot_key IS NOT NULL',
    [doctorId, from, to],
  );
  const leaves = await conn.all(
    'SELECT leave_date, session FROM doctor_leaves WHERE doctor_id = ? AND leave_date BETWEEN ? AND ?',
    [doctorId, from, to],
  );
  const booked = new Map();
  for (const a of appts) {
    if (!booked.has(a.appointment_date)) booked.set(a.appointment_date, new Set());
    booked.get(a.appointment_date).add(a.appointment_time);
  }
  const leaveMap = new Map();
  for (const l of leaves) {
    if (!leaveMap.has(l.leave_date)) leaveMap.set(l.leave_date, new Set());
    leaveMap.get(l.leave_date).add(l.session);
  }
  return { booked, leaves: leaveMap };
}

/** Full picture of one doctor's day: every session and every slot with its state. */
function buildDay(doctor, date, range, now = clock.nowIST()) {
  const dow = clock.weekday(date);
  const leaveSet = range.leaves.get(date) || new Set();
  const bookedSet = range.booked.get(date) || new Set();
  const earliest = date === now.date ? now.minutes + config.booking.leadMinutes : -1;

  const sessions = doctor.sessions.map((s) => {
    const working = s.weekdays.includes(dow);
    const onLeave = leaveSet.has('full') || leaveSet.has(s.session);
    const slots = sessionSlots(doctor, s).map((time) => {
      let state = 'available';
      if (date < now.date) state = 'past';
      else if (!working) state = 'closed';
      else if (onLeave) state = 'leave';
      else if (bookedSet.has(time)) state = 'booked';
      else if (date === now.date && clock.toMinutes(time) < earliest) state = 'past';
      return { time, state };
    });
    return {
      session: s.session, start_time: s.start_time, end_time: s.end_time, working, on_leave: onLeave,
      slots, available_count: slots.filter((x) => x.state === 'available').length,
    };
  });
  return {
    date, doctor_id: doctor.id,
    working: sessions.some((s) => s.working),
    on_leave: leaveSet.has('full') || (sessions.filter((s) => s.working).length > 0 && sessions.filter((s) => s.working).every((s) => s.on_leave)),
    sessions,
    available_count: sessions.reduce((n, s) => n + s.available_count, 0),
  };
}

async function getDay(doctor, date, conn) {
  const range = await loadRange(doctor.id, date, date, conn);
  return buildDay(doctor, date, range);
}

/** Why a whole day has no availability. */
function dayReason(day, today) {
  if (day.date < today) return 'past_date';
  if (!day.working) return 'not_working_day';
  if (day.on_leave) return 'doctor_on_leave';
  const states = day.sessions.flatMap((s) => s.slots.map((x) => x.state));
  if (day.date === today && states.includes('past')) return 'booking_closed_today';
  return 'fully_booked';
}

/**
 * First `limit` free slots at or after (fromDate, afterTime), across up to the
 * booking window. `skip` is a Set of 'date|time' keys to leave out (used when
 * suggesting slots to several leave-affected patients at once).
 */
async function findNextAvailable(doctor, fromDate, { afterTime = null, limit = 3, session = null, skip = null, conn } = {}) {
  const now = clock.nowIST();
  const start = fromDate < now.date ? now.date : fromDate;
  const end = clock.addDays(now.date, config.booking.windowDays);
  if (start > end) return [];
  const range = await loadRange(doctor.id, start, end, conn);
  const out = [];
  for (let d = start; d <= end && out.length < limit; d = clock.addDays(d, 1)) {
    const day = buildDay(doctor, d, range, now);
    const all = day.sessions
      .flatMap((s) => s.slots.filter((x) => x.state === 'available').map((x) => ({ date: d, time: x.time, session: s.session })))
      .filter((x) => !(d === fromDate && afterTime && x.time < afterTime))
      .filter((x) => !(skip && skip.has(`${x.date}|${x.time}`)));
    // On the requested day prefer the requested session first.
    const ordered = d === fromDate && session ? [...all.filter((x) => x.session === session), ...all.filter((x) => x.session !== session)] : all;
    for (const x of ordered) {
      if (out.length >= limit) break;
      out.push(decorate(doctor, x));
    }
  }
  return out;
}

function decorate(doctor, x) {
  return {
    doctor_id: doctor.id, doctor: doctor.name, department: doctor.department,
    date: x.date, time: x.time, session: x.session,
    display: `${clock.prettyDate(x.date)} at ${clock.prettyTime(x.time)}`,
  };
}

/** Which session (if any) a time belongs to, and whether it is on the slot grid. */
function locateTime(doctor, time) {
  for (const s of doctor.sessions) {
    const slots = sessionSlots(doctor, s);
    if (slots.includes(time)) return { session: s.session, onGrid: true };
    const t = clock.toMinutes(time);
    if (t >= clock.toMinutes(s.start_time) && t < clock.toMinutes(s.end_time)) return { session: s.session, onGrid: false };
  }
  return null;
}

/**
 * Core check used by the website, the voice agent and booking itself.
 * @param {object} doctor  resolved doctor
 * @param {string} date    'YYYY-MM-DD'
 * @param {string[]} timeCandidates  parsed 'HH:MM' options (may be empty)
 * @param {string|null} session  'morning' | 'evening'
 */
async function checkSlot(doctor, date, timeCandidates = [], session = null, conn) {
  const now = clock.nowIST();
  const lastDay = clock.addDays(now.date, config.booking.windowDays);
  const result = (obj) => ({ ...obj, reason_text: obj.reason ? REASON_TEXT[obj.reason] : undefined });

  if (date < now.date) {
    return result({ available: false, reason: 'past_date', alternatives: await findNextAvailable(doctor, now.date, { conn }) });
  }
  if (date > lastDay) return result({ available: false, reason: 'beyond_window', alternatives: [] });

  const day = await getDay(doctor, date, conn);

  // Whole day unavailable → first slots on the next working day(s).
  if (day.available_count === 0) {
    const reason = dayReason(day, now.date);
    return result({ available: false, reason, day_status: reason, alternatives: await findNextAvailable(doctor, clock.addDays(date, 1), { conn }) });
  }

  // Pick the time candidate that falls inside a consulting session.
  let time = null; let loc = null;
  for (const c of timeCandidates) {
    const l = locateTime(doctor, c);
    if (l && (!session || l.session === session || timeCandidates.length === 1)) { time = c; loc = l; break; }
  }
  if (!time && timeCandidates.length) {
    // Time outside hours: offer next slots from that point (or from the session start).
    const after = timeCandidates[timeCandidates.length - 1];
    return result({ available: false, reason: 'outside_hours', alternatives: await findNextAvailable(doctor, date, { afterTime: after, session, conn }) });
  }
  if (!time) {
    // No time given — list the real options for that date/session.
    const sess = session ? day.sessions.find((s) => s.session === session) : null;
    if (sess && sess.available_count === 0) {
      const reason = !sess.working ? 'not_working_day' : sess.on_leave ? 'session_on_leave' : (date === now.date && sess.slots.some((x) => x.state === 'past') ? 'booking_closed_today' : 'session_full');
      return result({ available: false, reason, alternatives: await findNextAvailable(doctor, date, { session, conn }) });
    }
    return result({ available: false, reason: null, needs_time: true, alternatives: await findNextAvailable(doctor, date, { session, limit: 3, conn }) });
  }

  const sess = day.sessions.find((s) => s.session === loc.session);
  if (!loc.onGrid) {
    return result({ available: false, reason: 'not_on_slot_grid', alternatives: await findNextAvailable(doctor, date, { afterTime: time, session: loc.session, conn }) });
  }
  const slot = sess.slots.find((x) => x.time === time);
  if (slot.state === 'available') {
    return result({ available: true, slot: decorate(doctor, { date, time, session: loc.session }), alternatives: [] });
  }
  const reason = { booked: 'slot_taken', past: 'slot_passed', leave: 'session_on_leave', closed: 'not_working_day' }[slot.state];
  return result({ available: false, reason, alternatives: await findNextAvailable(doctor, date, { afterTime: time, session: loc.session, conn }) });
}

module.exports = { checkSlot, findNextAvailable, getDay, buildDay, loadRange, sessionSlots, locateTime, REASON_TEXT };
