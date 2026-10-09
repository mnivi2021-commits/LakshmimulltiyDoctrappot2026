'use strict';
// OmniDimension voice front desk – simulated webhook calls exactly as the
// OmniDimension Custom API integrations / post-call webhook will send them.
// No real phone call is made.
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./helpers');
const app = require('../src/app');

let server; let base;
test.before(async () => {
  await new Promise((r) => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server.close());
test.beforeEach(async () => { await H.freshDb(); H.setIST(H.WED, '09:00'); H.failWhatsApp(false); });

const HDR = { 'Content-Type': 'application/json', 'X-Webhook-Secret': 'test-webhook-secret' };
async function tool(name, body, headers = HDR) {
  const r = await fetch(`${base}/api/voice/${name}`, { method: 'POST', headers, body: JSON.stringify(body) });
  return { http: r.status, ...(await r.json()) };
}
const count = async () => Number((await H.dbm.db().get('SELECT COUNT(*) AS n FROM appointments')).n);
const patient = (o = {}) => ({
  patient_name: 'Ravi Kumar', mobile: '9876543210', doctor: 'Vijul', department: 'Orthopaedic',
  appointment_date: H.THU, appointment_time: '10:30', session: 'morning', reason: 'Knee pain', patient_type: 'new', call_language: 'en', call_id: 'call-001', ...o,
});

test('1. incoming voice request: authenticated tools only; doctor info includes greeting', async () => {
  assert.equal((await tool('doctors', {}, { 'Content-Type': 'application/json' })).http, 401);
  assert.equal((await tool('doctors', {}, { ...HDR, 'X-Webhook-Secret': 'wrong' })).http, 401);
  const r = await tool('doctors', {});
  assert.equal(r.success, true);
  assert.equal(r.greeting, 'Welcome to Lakshmi Multispecialty Hospital. How can I help you?');
  assert.deepEqual(r.doctors.map((d) => d.name), ['Mr. Vijul', 'Mr. Vishwa', 'Ms. Nivi']);
  assert.match(r.message, /Mr\. Vijul \(MBBS, MS\), Orthopaedic: 10:00 AM to 1:30 PM and 6:00 PM to 10:00 PM/);
  // "I want a doctor appointment" → agent calls with no doctor yet
  const ask = await tool('check-availability', {});
  assert.equal(ask.say, 'Certainly. Which doctor or specialist would you like to consult?');
});

test('2. English appointment request: doctor → date → session → time → available', async () => {
  let r = await tool('check-availability', { doctor: 'Dr. Vijul' });
  assert.equal(r.say, 'What date would you like to book your appointment?');
  r = await tool('check-availability', { doctor: 'Dr. Vijul', appointment_date: 'tomorrow' });
  assert.equal(r.say, 'Would you prefer a morning or evening appointment?');
  r = await tool('check-availability', { doctor: 'Dr. Vijul', appointment_date: 'tomorrow', session: 'morning' });
  assert.equal(r.status, 'choose_time');
  assert.match(r.say, /^What time would you prefer\? Available times are 10:00 AM, 10:15 AM, 10:30 AM\.$/);
  r = await tool('check-availability', { doctor: 'Dr. Vijul', appointment_date: 'tomorrow', session: 'morning', appointment_time: '10:30 AM' });
  assert.equal(r.status, 'available');
  assert.equal(r.say, '10:30 AM on Thursday, 15 Oct 2026 is available.');
  assert.match(r.message, /It is NOT booked yet/);
  assert.equal(await count(), 0, 'checking never reserves');
});

test('3. Tamil appointment request (Tamil words for doctor/date/session/time)', async () => {
  const chk = await tool('check-availability', { doctor: 'இதய மருத்துவர்', appointment_date: 'நாளை', session: 'மாலை', appointment_time: 'மாலை 5 மணி' });
  assert.equal(chk.status, 'available');
  assert.equal(chk.slot.doctor, 'Ms. Nivi');
  assert.equal(chk.slot.time, '17:00');
  const r = await tool('book-appointment', patient({
    patient_name: 'முருகன்', doctor: 'இதய மருத்துவர்', department: '', appointment_date: 'நாளை', appointment_time: 'மாலை 5 மணி',
    session: 'மாலை', reason: 'நெஞ்சு வலி பரிசோதனை', patient_type: 'புதிய நோயாளி', language: 'ta', patient_confirmed: 'ஆம்',
  }));
  assert.equal(r.status, 'booked', r.message);
  const row = await H.dbm.db().get('SELECT patient_name, language, appointment_time, source FROM appointments');
  assert.deepEqual({ ...row }, { patient_name: 'முருகன்', language: 'ta', appointment_time: '17:00', source: 'ai_voice' });
});

test('4. Hindi appointment request', async () => {
  const chk = await tool('check-availability', { doctor: 'शुगर डॉक्टर', appointment_date: 'कल', session: 'सुबह', appointment_time: 'सुबह 10 बजे' });
  assert.equal(chk.status, 'available');
  assert.equal(chk.slot.doctor, 'Mr. Vishwa');
  const r = await tool('book-appointment', patient({
    patient_name: 'सुनीता शर्मा', doctor: 'शुगर डॉक्टर', department: '', appointment_date: 'कल', appointment_time: 'सुबह 10 बजे',
    session: 'सुबह', reason: 'शुगर जाँच', patient_type: 'पुराना', language: 'hi', patient_confirmed: 'हाँ',
  }));
  assert.equal(r.status, 'booked', r.message);
  assert.equal((await H.dbm.db().get('SELECT language FROM appointments')).language, 'hi');
});

test('5. doctor selection: names, specialties and languages map to the right doctor', async () => {
  const cases = [
    ['Vijul', 'Mr. Vijul'], ['bone doctor', 'Mr. Vijul'], ['orthopaedic', 'Mr. Vijul'], ['எலும்பு மருத்துவர்', 'Mr. Vijul'],
    ['Dr Vishwa', 'Mr. Vishwa'], ['diabetologist', 'Mr. Vishwa'], ['सुगर', null],
    ['heart specialist', 'Ms. Nivi'], ['cardiologist', 'Ms. Nivi'], ['दिल का डॉक्टर', 'Ms. Nivi'],
  ];
  for (const [text, expected] of cases) {
    const r = await tool('check-availability', { doctor: text, appointment_date: H.THU, session: 'morning', appointment_time: '11:00' });
    if (expected) assert.equal(r.slot && r.slot.doctor, expected, text);
    else assert.equal(r.status, 'unknown_doctor', text);
  }
});

test('6. date selection: relative, numeric and invalid dates', async () => {
  const q = (d) => tool('check-availability', { doctor: 'Nivi', appointment_date: d, session: 'morning', appointment_time: '11:00' });
  assert.equal((await q('2026-10-16')).slot.date, H.FRI);
  assert.equal((await q('16-10-2026')).slot.date, H.FRI);
  assert.equal((await q('tomorrow')).slot.date, H.THU);
  assert.equal((await q('today')).slot.date, H.WED);
  const past = await q('2026-10-01');
  assert.equal(past.reason, 'past_date');
  const bad = await q('someday maybe');
  assert.equal(bad.status, 'needs_info');
  assert.equal(bad.say, "Sorry, I didn't understand that. Could you please repeat?");
  const sunday = await q(H.SUN);
  assert.equal(sunday.reason, 'not_working_day');
  assert.equal(sunday.alternatives[0].date, H.MON);
});

test('7. time availability: outside hours and off-grid times return only real slots', async () => {
  const outside = await tool('check-availability', { doctor: 'Vijul', appointment_date: H.THU, appointment_time: '3 PM' });
  assert.equal(outside.reason, 'outside_hours');
  assert.equal(outside.alternatives[0].time, '18:00');
  const offGrid = await tool('check-availability', { doctor: 'Vijul', appointment_date: H.THU, session: 'morning', appointment_time: '10:07' });
  assert.equal(offGrid.reason, 'not_on_slot_grid');
  assert.equal(offGrid.alternatives[0].time, '10:15');
});

test('8 & 12. confirmation read-back first; booking only after the patient confirms; official LMH number', async () => {
  const pending = await tool('book-appointment', patient());
  assert.equal(pending.status, 'needs_confirmation');
  assert.equal(pending.booked, false);
  assert.equal(pending.say, 'Let me confirm: patient Ravi Kumar, Mr. Vijul, Orthopaedic, on Thursday, 15 Oct 2026 at 10:30 AM. Would you like me to confirm this appointment?');
  assert.deepEqual(pending.readback, { patient_name: 'Ravi Kumar', doctor: 'Mr. Vijul', department: 'Orthopaedic', appointment_date: H.THU, appointment_time: '10:30', session: 'morning' });
  assert.equal(await count(), 0, 'nothing saved before confirmation');
  const no = await tool('book-appointment', patient({ patient_confirmed: false }));
  assert.equal(no.status, 'needs_confirmation');
  assert.equal(await count(), 0);

  const ok = await tool('book-appointment', patient({ patient_confirmed: true }));
  assert.equal(ok.status, 'booked');
  assert.equal(ok.appointment_no, 'LMH-0001');
  assert.equal(ok.appointment_status, 'booked');
  assert.match(ok.say, /^Your appointment is confirmed\. Your appointment number is LMH-0001\./);
  const row = await H.dbm.db().get('SELECT * FROM appointments');
  assert.equal(row.appointment_no, 'LMH-0001');
  assert.equal(row.source, 'ai_voice');
  assert.equal(row.call_id, 'call-001');
  // hand-off to the existing notification service
  const n = await H.dbm.db().all("SELECT event_type, audience FROM notifications WHERE event_type = 'new_appointment'");
  assert.ok(n.some((x) => x.audience === 'staff'));
  const second = await tool('book-appointment', patient({ patient_name: 'Anitha', mobile: '9876500000', appointment_time: '10:45', patient_confirmed: true }));
  assert.equal(second.appointment_no, 'LMH-0002');
});

test('9. duplicate booking: two simultaneous callers for one slot – exactly one wins, the other gets the next real slot', async () => {
  const [a, b] = await Promise.all([
    tool('book-appointment', patient({ patient_confirmed: true, call_id: 'call-A' })),
    tool('book-appointment', patient({ patient_name: 'Second Caller', mobile: '9123456789', patient_confirmed: true, call_id: 'call-B' })),
  ]);
  const results = [a, b];
  assert.equal(results.filter((r) => r.status === 'booked').length, 1);
  const loser = results.find((r) => r.status !== 'booked');
  assert.equal(loser.status, 'unavailable');
  assert.equal(loser.reason, 'slot_taken');
  assert.equal(loser.say, 'The requested time is already booked. The next available appointment is tomorrow at 10:45 AM. Would you like me to book it?');
  assert.equal(await count(), 1);
  // a later check also reflects the taken slot
  const chk = await tool('check-availability', { doctor: 'Vijul', appointment_date: H.THU, session: 'morning', appointment_time: '10:30' });
  assert.equal(chk.reason, 'slot_taken');
});

test('10. doctor leave: never books, offers next working day', async () => {
  const { vijul } = await H.ids();
  await require('../src/services/appointments').markLeave({ doctor_id: vijul, leave_date: H.THU });
  const chk = await tool('check-availability', { doctor: 'Vijul', appointment_date: H.THU });
  assert.equal(chk.reason, 'doctor_on_leave');
  assert.equal(chk.say, 'Mr. Vijul is unavailable on that date. The next available appointment is Friday, 16 Oct 2026 at 10:00 AM. Would you like me to book that?');
  const book = await tool('book-appointment', patient({ patient_confirmed: true }));
  assert.equal(book.status, 'unavailable');
  assert.equal(book.reason, 'doctor_on_leave');
  assert.equal(await count(), 0);
});

test("11. next available: today's booking closed → first real slot on the next working day", async () => {
  H.setIST(H.WED, '20:30');
  const chk = await tool('check-availability', { doctor: 'Vishwa', appointment_date: 'today', session: 'evening', appointment_time: '7 PM' });
  assert.equal(chk.reason, 'booking_closed_today');
  assert.equal(chk.say, "Today's appointments are closed. The first available appointment is tomorrow at 9:30 AM. Would you like me to book it?");
  // accept the offer: book exactly the offered slot
  const alt = chk.alternatives[0];
  const r = await tool('book-appointment', patient({ doctor: 'Vishwa', department: '', appointment_date: alt.date, appointment_time: alt.time, session: alt.session, patient_confirmed: true }));
  assert.equal(r.status, 'booked');
  assert.equal(r.appointment.time, '09:30');
});

test('13. invalid/unknown doctor is never invented', async () => {
  const r = await tool('check-availability', { doctor: 'Dr. Ramesh', appointment_date: H.THU });
  assert.equal(r.status, 'unknown_doctor');
  assert.match(r.say, /Mr\. Vijul, Orthopaedic; Mr\. Vishwa, Diabetologist; and Ms\. Nivi, Heart Specialist/);
  const b = await tool('book-appointment', patient({ doctor: 'Dr. Ramesh', department: 'Neurology', patient_confirmed: true }));
  assert.equal(b.status, 'unknown_doctor');
  assert.equal(await count(), 0);
});

test('14. backend unavailable: never claims a booking, gives the staff-handoff message', async () => {
  const d = H.dbm.db();
  const saved = { all: d.all, get: d.get, run: d.run, transaction: d.transaction };
  const down = async () => { throw Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:3306'), { code: 'ECONNREFUSED' }); };
  Object.assign(d, { all: down, get: down, run: down, transaction: down });
  const origError = console.error; console.error = () => {};
  try {
    const chk = await tool('check-availability', { doctor: 'Vijul', appointment_date: H.THU, session: 'morning', appointment_time: '10:30' });
    const book = await tool('book-appointment', patient({ patient_confirmed: true }));
    for (const r of [chk, book]) {
      assert.equal(r.http, 200);
      assert.equal(r.success, false);
      assert.equal(r.status, 'system_error');
      assert.equal(r.say, "I'm unable to confirm the appointment right now. I can send your request to the hospital staff for assistance.");
      assert.ok(!r.appointment_no);
    }
  } finally {
    Object.assign(d, saved); console.error = origError;
  }
  assert.equal(await count(), 0);
});

test('post-call webhook: stores only structured fields, verified against the database', async () => {
  const booked = await tool('book-appointment', patient({ patient_confirmed: true, call_id: 'omni-call-77' }));
  const payload = {
    call_id: 'omni-call-77', bot_id: 'bot-1', phone_number: '+919876543210', call_status: 'completed',
    call_report: {
      summary: 'Patient described knee pain after a fall…', sentiment: 'positive',
      full_conversation: 'AGENT: Welcome… USER: my knee hurts badly since…',
      extracted_variables: {
        patient_name: 'Ravi Kumar', mobile: '9876543210', doctor: 'Vijul', department: 'Orthopaedic',
        appointment_date: '2026-10-15', appointment_time: '11:00', session: 'morning', reason: 'Knee pain',
        appointment_number: booked.appointment_no, appointment_status: 'confirmed', call_language: 'Tamil', call_id: 'omni-call-77',
      },
    },
  };
  const unauth = await fetch(`${base}/api/voice/call-ended`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  assert.equal(unauth.status, 401);
  const r = await (await fetch(`${base}/api/voice/call-ended?key=test-postcall-secret`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })).json();
  assert.equal(r.success, true);
  assert.equal(r.verified, true);
  // retries update instead of duplicating
  await fetch(`${base}/api/voice/call-ended?key=test-postcall-secret`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const rows = await H.dbm.db().all('SELECT * FROM voice_calls');
  assert.equal(rows.length, 1);
  const v = rows[0];
  assert.equal(v.call_id, 'omni-call-77');
  assert.equal(v.appointment_no, 'LMH-0001');
  assert.equal(v.language, 'ta');
  // database wins over the AI's extracted values
  assert.equal(v.appointment_time, '10:30');
  assert.equal(v.appointment_status, 'booked');
  assert.equal(Number(v.verified), 1);
  // no transcript / summary / raw payload stored
  assert.equal(v.summary, null);
  assert.equal(v.raw, null);
  assert.ok(!JSON.stringify(v).includes('knee hurts'));
});

test('post-call webhook: unverified data is kept but flagged', async () => {
  const r = await (await fetch(`${base}/api/voice/call-ended`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Webhook-Secret': 'test-postcall-secret' },
    body: JSON.stringify({ call_id: 'c-2', call_report: { extracted_variables: { patient_name: 'Unknown Caller', appointment_number: 'LMH-0099', call_language: 'hindi' } } }),
  })).json();
  assert.equal(r.verified, false);
  const v = await H.dbm.db().get('SELECT * FROM voice_calls');
  assert.equal(v.appointment_no, 'LMH-0099');
  assert.equal(Number(v.verified), 0);
  assert.equal(v.language, 'hi');
});

// ---------------- CORS preflight (OmniDimension dashboard "Test API" runs in the browser) ----------------
const preflight = (path, origin, headers = 'content-type,x-webhook-secret') => fetch(`${base}/api/voice/${path}`, {
  method: 'OPTIONS',
  headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': headers },
});

test('CORS: preflight from the OmniDimension dashboard is allowed for /api/voice/*', async () => {
  for (const origin of ['https://www.omnidim.io', 'https://omnidim.io', 'https://dashboard.omnidim.io']) {
    for (const path of ['doctors', 'check-availability', 'book-appointment', 'call-ended']) {
      const r = await preflight(path, origin);
      assert.equal(r.status, 204, `${origin} ${path}`);
      assert.equal(r.headers.get('access-control-allow-origin'), origin);
      assert.match(r.headers.get('access-control-allow-methods'), /\bPOST\b/);
      const allowedHeaders = r.headers.get('access-control-allow-headers').toLowerCase();
      assert.ok(allowedHeaders.includes('content-type') && allowedHeaders.includes('x-webhook-secret'));
      assert.equal(r.headers.get('access-control-allow-credentials'), null, 'no cookies/credentials allowed');
      assert.match(r.headers.get('vary') || '', /Origin/);
      assert.equal(await r.text(), '', 'preflight returns no data');
    }
  }
});

test('CORS: preflight from other origins is refused (lookalikes, http, unknown)', async () => {
  for (const origin of ['https://evil.example', 'https://omnidim.io.evil.com', 'https://evilomnidim.io', 'http://www.omnidim.io']) {
    const r = await preflight('doctors', origin);
    assert.equal(r.status, 403, origin);
    assert.equal(r.headers.get('access-control-allow-origin'), null, origin);
  }
});

test('CORS: real POST still requires X-Webhook-Secret (allowed origin gets CORS headers, not access)', async () => {
  const origin = 'https://www.omnidim.io';
  const noSecret = await fetch(`${base}/api/voice/doctors`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: '{}' });
  assert.equal(noSecret.status, 401);
  assert.equal(noSecret.headers.get('access-control-allow-origin'), origin, 'browser can read the 401 instead of a NetworkError');
  const wrong = await fetch(`${base}/api/voice/book-appointment`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin, 'X-Webhook-Secret': 'wrong' }, body: '{}' });
  assert.equal(wrong.status, 401);
  const ok = await fetch(`${base}/api/voice/doctors`, { method: 'POST', headers: { ...HDR, Origin: origin }, body: '{}' });
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get('access-control-allow-origin'), origin);
  assert.equal((await ok.json()).doctors.length, 3);
  // other origins never receive CORS headers
  const other = await fetch(`${base}/api/voice/doctors`, { method: 'POST', headers: { ...HDR, Origin: 'https://evil.example' }, body: '{}' });
  assert.equal(other.headers.get('access-control-allow-origin'), null);
  // post-call webhook keeps its own key
  const pc = await fetch(`${base}/api/voice/call-ended`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: '{}' });
  assert.equal(pc.status, 401);
});

test('CORS: non-voice routes are unchanged (no CORS headers on admin/chat)', async () => {
  const r = await fetch(`${base}/api/admin/summary`, { method: 'OPTIONS', headers: { Origin: 'https://www.omnidim.io', 'Access-Control-Request-Method': 'GET' } });
  assert.equal(r.headers.get('access-control-allow-origin'), null);
  const c = await fetch(`${base}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://www.omnidim.io' }, body: '{}' });
  assert.equal(c.headers.get('access-control-allow-origin'), null);
});
