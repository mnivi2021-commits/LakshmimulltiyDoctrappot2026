'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./helpers');
const appointments = require('../src/services/appointments');
const availability = require('../src/services/availability');
const { runReminders } = require('../src/services/reminders');
const doctors = require('../src/services/doctors');

const base = (over = {}) => ({
  patient_name: 'Ravi Kumar', mobile: '9876543210', doctor: 'vijul', appointment_date: H.THU,
  appointment_time: '10:00', session: 'morning', reason: 'Knee pain', patient_type: 'new', ...over,
});

test.beforeEach(async () => { await H.freshDb(); H.setIST(H.WED, '09:00'); H.failWhatsApp(false); });

test('1. website booking saves the slot and issues LMH-0001', async () => {
  const r = await appointments.book(base(), { source: 'website' });
  assert.equal(r.ok, true);
  assert.equal(r.appointment.appointment_no, 'LMH-0001');
  assert.equal(r.appointment.status, 'booked');
  assert.equal(r.appointment.doctor_name, 'Mr. Vijul');
  const doc = await doctors.resolveDoctor('vijul');
  const chk = await availability.checkSlot(doc, H.THU, ['10:00'], 'morning');
  assert.equal(chk.available, false);
  assert.equal(chk.reason, 'slot_taken');
});

test('6. duplicate booking for same doctor/date/time is refused with real alternatives', async () => {
  await appointments.book(base());
  const r = await appointments.book(base({ patient_name: 'Someone Else', mobile: '9123456780' }));
  assert.equal(r.ok, false);
  assert.equal(r.code, 'unavailable');
  assert.equal(r.reason, 'slot_taken');
  assert.deepEqual(r.alternatives.map((a) => a.time), ['10:15', '10:30', '10:45']);
});

test('6b. concurrent requests for one slot: exactly one wins', async () => {
  const results = await Promise.all(Array.from({ length: 5 }, (_, i) => appointments.book(base({ patient_name: `Patient ${String.fromCharCode(65 + i)}`, mobile: `98765432${10 + i}` }))));
  assert.equal(results.filter((r) => r.ok).length, 1);
  const rows = await H.dbm.db().all("SELECT * FROM appointments WHERE appointment_time = '10:00'");
  assert.equal(rows.length, 1);
});

test('6c. same patient cannot double-book the same doctor on the same day', async () => {
  await appointments.book(base());
  const r = await appointments.book(base({ appointment_time: '11:00' }));
  assert.equal(r.code, 'duplicate');
  assert.equal(r.appointment.appointment_no, 'LMH-0001');
});

test('appointment numbers are sequential with no gaps after failures', async () => {
  const a = await appointments.book(base());
  await appointments.book(base({ patient_name: 'X Y', mobile: '9000000001' })); // fails: slot taken
  const b = await appointments.book(base({ patient_name: 'P Q', mobile: '9000000002', appointment_time: '10:15' }));
  const c = await appointments.book(base({ patient_name: 'R S', mobile: '9000000003', appointment_time: '18:00', session: 'evening' }));
  assert.deepEqual([a, b, c].map((x) => x.appointment.appointment_no), ['LMH-0001', 'LMH-0002', 'LMH-0003']);
});

test('validation: missing fields are reported, nothing saved', async () => {
  const r = await appointments.book({ doctor: 'vijul' });
  assert.equal(r.code, 'validation');
  for (const k of ['patient_name', 'mobile', 'appointment_date', 'appointment_time', 'reason', 'patient_type']) assert.ok(r.errors[k], k);
  assert.equal((await H.dbm.db().get('SELECT COUNT(*) n FROM appointments')).n, 0);
});

test('time outside consulting hours is refused; next real slots offered', async () => {
  const r = await appointments.book(base({ appointment_time: '15:00', session: '' }));
  assert.equal(r.reason, 'outside_hours');
  assert.equal(r.alternatives[0].time, '18:00');
});

test('7. doctor leave: no booking on leave day, next working day offered, affected patients notified', async () => {
  const booked = await appointments.book(base());
  H.sentWhatsApp.length = 0;
  const { vijul } = await H.ids();
  const leave = await appointments.markLeave({ doctor_id: vijul, leave_date: H.THU, session: 'full', reason: 'Conference' });
  assert.equal(leave.ok, true);
  assert.equal(leave.affected.length, 1);
  assert.equal(leave.affected[0].suggestion.date, H.FRI);
  assert.equal(leave.affected[0].suggestion.time, '10:00');

  const a = await appointments.getById(booked.appointment.id);
  assert.equal(a.status, 'leave_affected');

  const r = await appointments.book(base({ patient_name: 'New Person', mobile: '9111111111', appointment_time: '11:00' }));
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'doctor_on_leave');
  assert.equal(r.alternatives[0].date, H.FRI);
  assert.equal(r.alternatives[0].time, '10:00');

  const events = H.sentWhatsApp.map((m) => m.body.text.body.split('\n')[0]);
  assert.ok(events.some((t) => t.includes('Doctor leave')));
  assert.ok(events.some((t) => t.includes('Doctor unavailable')));
  // patient message went to the patient's number
  assert.ok(H.sentWhatsApp.some((m) => m.body.to === '919876543210'));

  // staff can move the patient to the suggested slot
  const moved = await appointments.reschedule(a.id, { appointment_date: a.suggested_date, appointment_time: a.suggested_time });
  assert.equal(moved.ok, true);
  assert.equal(moved.appointment.status, 'booked');
  assert.equal(moved.appointment.appointment_date, H.FRI);
});

test('7b. two affected patients get two different suggested slots', async () => {
  await appointments.book(base());
  await appointments.book(base({ patient_name: 'Second P', mobile: '9222222222', appointment_time: '10:15' }));
  const { vijul } = await H.ids();
  const leave = await appointments.markLeave({ doctor_id: vijul, leave_date: H.THU });
  const times = leave.affected.map((x) => `${x.suggestion.date} ${x.suggestion.time}`);
  assert.deepEqual(times, [`${H.FRI} 10:00`, `${H.FRI} 10:15`]);
});

test('7c. session leave blocks only that session', async () => {
  const { nivi } = await H.ids();
  await appointments.markLeave({ doctor_id: nivi, leave_date: H.THU, session: 'morning' });
  const m = await appointments.book(base({ doctor: 'nivi', appointment_time: '10:00' }));
  assert.equal(m.reason, 'session_on_leave');
  assert.equal(m.alternatives[0].date, H.THU);
  assert.equal(m.alternatives[0].time, '17:00');
  const e = await appointments.book(base({ doctor: 'nivi', appointment_time: '17:00', session: 'evening' }));
  assert.equal(e.ok, true);
});

test("8/9. today's booking closed → first slot on the next working day", async () => {
  H.setIST(H.WED, '20:30'); // Vishwa's evening ends 20:00
  const r = await appointments.book(base({ doctor: 'vishwa', appointment_date: H.WED, appointment_time: '19:00', session: 'evening' }));
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'booking_closed_today');
  assert.equal(r.alternatives[0].date, H.THU);
  assert.equal(r.alternatives[0].time, '09:30');
});

test('8b. slot within the lead time today is refused, later slot offered', async () => {
  H.setIST(H.WED, '10:05');
  const r = await appointments.book(base({ appointment_date: H.WED, appointment_time: '10:15' }));
  assert.equal(r.reason, 'slot_passed');
  assert.equal(r.alternatives[0].time, '10:45'); // 10:05 + 30 min lead
});

test('9b. Saturday evening closed → skips Sunday holiday → Monday', async () => {
  H.setIST(H.SAT, '22:30');
  const r = await appointments.book(base({ appointment_date: H.SAT, appointment_time: '21:00', session: 'evening' }));
  assert.equal(r.reason, 'booking_closed_today');
  assert.equal(r.alternatives[0].date, H.MON);
  const sun = await appointments.book(base({ appointment_date: H.SUN }));
  assert.equal(sun.reason, 'not_working_day');
  assert.equal(sun.alternatives[0].date, H.MON);
});

test('9c. fully booked day → next working day', async () => {
  const doc = await doctors.resolveDoctor('nivi');
  const slots = doc.sessions.flatMap((s) => availability.sessionSlots(doc, s));
  let i = 0;
  for (const t of slots) {
    const r = await appointments.book(base({ doctor: 'nivi', patient_name: `Patient ${String.fromCharCode(65 + Math.floor(i / 26), 65 + (i % 26))}`, mobile: `9${String(100000000 + i)}`, appointment_time: t, session: '' }));
    assert.equal(r.ok, true, `slot ${t}`); i++;
  }
  const r = await appointments.book(base({ doctor: 'nivi', patient_name: 'Late Comer', mobile: '9333333333', appointment_time: '10:00' }));
  assert.equal(r.reason, 'fully_booked');
  assert.equal(r.alternatives[0].date, H.FRI);
});

test('10. cancellation frees the slot and notifies', async () => {
  const b = await appointments.book(base());
  H.sentWhatsApp.length = 0;
  const c = await appointments.cancel(b.appointment.id, 'Patient request');
  assert.equal(c.ok, true);
  assert.equal(c.appointment.status, 'cancelled');
  assert.ok(H.sentWhatsApp[0].body.text.body.includes('Appointment cancellation'));
  const again = await appointments.book(base({ patient_name: 'Next Patient', mobile: '9444444444' }));
  assert.equal(again.ok, true);
  assert.equal((await appointments.cancel(b.appointment.id)).code, 'invalid_status');
});

test('11. rescheduling keeps the number, frees the old slot, blocks taken slots', async () => {
  const b = await appointments.book(base());
  await appointments.book(base({ patient_name: 'Other P', mobile: '9555555555', appointment_time: '11:00' }));
  const bad = await appointments.reschedule(b.appointment.id, { appointment_date: H.THU, appointment_time: '11:00' });
  assert.equal(bad.reason, 'slot_taken');
  const ok = await appointments.reschedule(b.appointment.id, { appointment_date: H.FRI, appointment_time: '6:30 pm' });
  assert.equal(ok.ok, true);
  assert.equal(ok.appointment.appointment_no, 'LMH-0001');
  assert.equal(ok.appointment.appointment_time, '18:30');
  const doc = await doctors.resolveDoctor('vijul');
  assert.equal((await availability.checkSlot(doc, H.THU, ['10:00'], 'morning')).available, true);
});

test('12. WhatsApp: sent to the private staff number via Cloud API; failures recorded honestly', async () => {
  await appointments.book(base());
  const staff = H.sentWhatsApp.find((m) => m.body.to === '919000022222');
  assert.ok(staff, 'staff message sent');
  assert.equal(staff.url, 'https://graph.facebook.com/v21.0/123456789/messages');
  assert.equal(staff.headers.Authorization, 'Bearer test-token');
  assert.ok(staff.body.text.body.includes('LMH-0001'));
  const n = await H.dbm.db().all('SELECT status FROM notifications');
  assert.ok(n.every((x) => x.status === 'sent'));

  H.failWhatsApp(true);
  const c = await appointments.book(base({ patient_name: 'Fail Case', mobile: '9666666666', appointment_time: '10:30' }));
  assert.equal(c.ok, true, 'booking survives a WhatsApp failure');
  const failed = await H.dbm.db().all("SELECT status, error FROM notifications WHERE status = 'failed'");
  assert.ok(failed.length >= 1);
  assert.match(failed[0].error, /OAuth/);
});

test('12b. reminder sent once for appointments within 24h', async () => {
  H.setIST(H.WED, '09:00');
  await appointments.book(base({ appointment_date: H.THU, appointment_time: '10:00' }));
  H.setIST(H.WED, '11:00');
  H.sentWhatsApp.length = 0;
  const r1 = await runReminders();
  assert.equal(r1.sent, 1);
  assert.ok(H.sentWhatsApp[0].body.text.body.includes('Appointment reminder'));
  const r2 = await runReminders();
  assert.equal(r2.sent, 0);
});
