'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./helpers');
const app = require('../src/app');
const chat = require('../src/services/chat');

let server; let base;
test.before(async () => {
  await new Promise((r) => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server.close());
test.beforeEach(async () => { await H.freshDb(); H.setIST(H.WED, '09:00'); H.failWhatsApp(false); });

const SECRET = { 'Content-Type': 'application/json', 'X-Webhook-Secret': 'test-webhook-secret' };
async function voice(path, body, headers = SECRET) {
  // These tests model a caller who has already said "yes" to the read-back;
  // the confirmation step itself is covered in omnidimension.test.js.
  if (path === 'book-appointment') {
    const target = body.parameters || body;
    if (target.patient_confirmed === undefined) target.patient_confirmed = true;
  }
  const r = await fetch(`${base}/api/voice/${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
  return { status: r.status, ...(await r.json()) };
}

// ---------------- OmniDimension voice ----------------
test('voice endpoints reject requests without the shared secret', async () => {
  const r = await voice('book-appointment', {}, { 'Content-Type': 'application/json' });
  assert.equal(r.status, 401);
  const w = await voice('book-appointment', {}, { 'Content-Type': 'application/json', 'X-Webhook-Secret': 'wrong' });
  assert.equal(w.status, 401);
});

test('2/4. English AI voice booking: check then book, confirmed only after DB save', async () => {
  const chk = await voice('check-availability', { doctor: 'Dr. Vijul', appointment_date: H.THU, session: 'morning', appointment_time: '10:30 AM' });
  assert.equal(chk.status, 'available');
  assert.match(chk.message, /NOT booked yet/);
  const r = await voice('book-appointment', {
    patient_name: 'John Mathew', mobile: '+91 98765 43210', doctor: 'Vijul', department: 'Orthopaedic',
    appointment_date: H.THU, appointment_time: '10:30 AM', session: 'morning', reason: 'Back pain', patient_type: 'new', language: 'en', call_id: 'call-1',
  });
  assert.equal(r.success, true);
  assert.equal(r.status, 'booked');
  assert.equal(r.appointment_no, 'LMH-0001');
  const row = await H.dbm.db().get('SELECT * FROM appointments WHERE appointment_no = ?', ['LMH-0001']);
  assert.equal(row.source, 'ai_voice');
  assert.equal(row.mobile, '9876543210');
  assert.equal(row.call_id, 'call-1');
});

test('3. Tamil AI voice booking (Tamil doctor/date/time words)', async () => {
  const r = await voice('book-appointment', {
    patient_name: 'முருகன்', mobile: '9876500001', doctor: 'இதய மருத்துவர்', appointment_date: 'நாளை',
    appointment_time: 'மாலை 5 மணி', reason: 'நெஞ்சு வலி பரிசோதனை', patient_type: 'புதிய', language: 'தமிழ்',
  });
  assert.equal(r.success, true, r.message);
  const row = await H.dbm.db().get('SELECT a.*, d.slug FROM appointments a JOIN doctors d ON d.id = a.doctor_id');
  assert.equal(row.slug, 'nivi');
  assert.equal(row.appointment_date, H.THU);
  assert.equal(row.appointment_time, '17:00');
  assert.equal(row.language, 'ta');
  assert.equal(row.patient_type, 'new');
});

test('5. Hindi AI voice booking (wrapped in {parameters}) ', async () => {
  const r = await voice('book-appointment', {
    parameters: {
      name: 'सुनीता शर्मा', phone: '9876500002', doctor: 'शुगर डॉक्टर', date: 'कल', time: 'सुबह 10 बजे',
      reason: 'शुगर जाँच', patient_type: 'पुराना', language: 'hindi',
    },
  });
  assert.equal(r.success, true, r.message);
  const row = await H.dbm.db().get('SELECT a.*, d.slug FROM appointments a JOIN doctors d ON d.id = a.doctor_id');
  assert.equal(row.slug, 'vishwa');
  assert.equal(row.appointment_time, '10:00');
  assert.equal(row.patient_type, 'existing');
  assert.equal(row.language, 'hi');
});

test('voice: taken slot → NOT booked + next actual slots; missing data → needs_info', async () => {
  const p = { patient_name: 'A B', mobile: '9876500003', doctor: 'vijul', appointment_date: H.THU, appointment_time: '10:00', reason: 'x pain', patient_type: 'new' };
  await voice('book-appointment', p);
  const r = await voice('book-appointment', { ...p, patient_name: 'C D', mobile: '9876500004' });
  assert.equal(r.success, false);
  assert.equal(r.status, 'unavailable');
  assert.match(r.message, /^NOT booked/);
  assert.equal(r.alternatives[0].time, '10:15');
  const m = await voice('book-appointment', { doctor: 'vijul' });
  assert.equal(m.status, 'needs_info');
  assert.ok(m.missing.includes('mobile'));
});

test('voice: doctor on leave → offers next working day', async () => {
  const { vijul } = await H.ids();
  await require('../src/services/appointments').markLeave({ doctor_id: vijul, leave_date: H.THU });
  const r = await voice('check-availability', { doctor: 'ortho', appointment_date: H.THU, session: 'morning' });
  assert.equal(r.status, 'unavailable');
  assert.equal(r.reason, 'doctor_on_leave');
  assert.equal(r.alternatives[0].date, H.FRI);
});

test('voice: find, reschedule and cancel require number + mobile', async () => {
  await voice('book-appointment', { patient_name: 'E F', mobile: '9876500005', doctor: 'nivi', appointment_date: H.THU, appointment_time: '11:00', reason: 'checkup', patient_type: 'new' });
  const wrong = await voice('cancel-appointment', { appointment_no: 'LMH-0001', mobile: '9000000000' });
  assert.equal(wrong.status, 'not_found');
  const found = await voice('find-appointment', { mobile: '9876500005' });
  assert.equal(found.appointments[0].appointment_no, 'LMH-0001');
  const rs = await voice('reschedule-appointment', { appointment_no: 'lmh 1', mobile: '9876500005', new_date: H.FRI, new_time: '6 pm' });
  assert.equal(rs.success, true, rs.message);
  const c = await voice('cancel-appointment', { appointment_no: 'LMH-0001', mobile: '9876500005' });
  assert.equal(c.status, 'cancelled');
});

test('voice: staff callback logs request and alerts staff on WhatsApp', async () => {
  const r = await voice('staff-callback', { patient_name: 'G H', mobile: '9876500006', reason: 'Wants to discuss bill' });
  assert.equal(r.success, true);
  assert.ok(H.sentWhatsApp.some((m) => m.body.text.body.includes('Staff attention required')));
});

// ---------------- AI chat receptionist ----------------
async function say(state, payload) {
  const r = await chat.handle({ ...payload, state: state && state.state });
  return r;
}

test('chat: full booking flow shows only DB slots and confirms with LMH number', async () => {
  let r = await say(null, { action: 'menu', lang: 'en' });
  assert.match(r.messages[0].text, /Welcome to Lakshmi Multispecialty Hospital/);
  assert.equal(r.buttons.length, 8);
  r = await say(r, { message: 'I want to meet Dr. Vijul tomorrow morning' });
  assert.match(r.messages[0].text, /Let me check Mr. Vijul's available appointments/);
  const slots = r.buttons.filter((b) => b.value.startsWith('slot:'));
  assert.equal(slots[0].value, `slot:${H.THU}|10:00`);
  assert.equal(slots.length, 14); // 10:00–13:15
  r = await say(r, { action: `slot:${H.THU}|10:30` });
  assert.match(r.messages[0].text, /10:30 AM .* is available/);
  r = await say(r, { message: 'Lakshmi Priya' });
  r = await say(r, { message: '9876511111' });
  r = await say(r, { action: 'ptype:new' });
  r = await say(r, { message: 'Knee pain' });
  assert.equal(r.messages[0].title, 'Please check your details. Are they correct?');
  assert.deepEqual(r.messages[0].rows.map((x) => x[0]), ['Patient', 'Mobile', 'Doctor', 'Department', 'Date', 'Time', 'Reason', 'Patient type']);
  assert.equal(r.buttons[0].label, '✅ Yes, correct – confirm');
  assert.equal(await H.dbm.db().get('SELECT COUNT(*) AS n FROM appointments').then((x) => Number(x.n)), 0, 'nothing saved before Yes');
  r = await say(r, { action: 'yes' });
  const card = r.messages.find((m) => m.type === 'card');
  assert.match(card.title, /Appointment Confirmed/);
  assert.deepEqual(card.rows.find((x) => x[0] === 'Appointment No'), ['Appointment No', 'LMH-0001']);
  const row = await H.dbm.db().get('SELECT source FROM appointments');
  assert.equal(row.source, 'web_chat');
});

test('chat ↔ voice share one database: a voice booking removes the slot from chat', async () => {
  let r = await say(null, { message: 'book vijul tomorrow morning' });
  assert.ok(r.buttons.some((b) => b.value === `slot:${H.THU}|10:00`));
  await voice('book-appointment', { patient_name: 'Voice Caller', mobile: '9876522222', doctor: 'vijul', appointment_date: H.THU, appointment_time: '10:00', reason: 'pain', patient_type: 'new' });
  r = await say(r, { action: `slot:${H.THU}|10:00` }); // stale button
  assert.match(r.messages[0].text, /just booked/);
  assert.ok(!r.buttons.some((b) => b.value === `slot:${H.THU}|10:00`));
  const fresh = await say(null, { message: 'book vijul tomorrow morning' });
  assert.ok(!fresh.buttons.some((b) => b.value === `slot:${H.THU}|10:00`));
});

test("chat: today's booking closed → offers first real slot next working day", async () => {
  H.setIST(H.WED, '20:30');
  const r = await say(null, { message: 'vishwa today evening' });
  assert.match(r.messages.map((m) => m.text).join(' '), /Today's appointments are closed\. The first available appointment is Thursday, 15 Oct 2026 at 9:30 AM/);
  assert.ok(r.buttons.some((b) => b.value === `slot:${H.THU}|09:30`));
});

test('chat: doctor leave message and Tamil/Hindi auto-detection', async () => {
  const { vijul } = await H.ids();
  await require('../src/services/appointments').markLeave({ doctor_id: vijul, leave_date: H.THU });
  const r = await say(null, { message: 'vijul tomorrow morning' });
  assert.match(r.messages.map((m) => m.text).join(' '), /Mr. Vijul is unavailable on this date. The next available appointment is Friday/);
  const ta = await say(null, { message: 'வணக்கம்' });
  assert.equal(ta.lang, 'ta');
  assert.match(ta.messages[0].text, /லட்சுமி மல்டிஸ்பெஷாலிட்டி/);
  const hi = await say(null, { message: 'नमस्ते' });
  assert.equal(hi.lang, 'hi');
  assert.match(hi.messages[0].text, /लक्ष्मी मल्टीस्पेशलिटी/);
});

test('chat: medical and emergency safety replies', async () => {
  const m = await say(null, { message: 'which tablet should I take for fever?' });
  assert.match(m.messages[0].text, /For medical advice, please consult a qualified doctor/);
  const e = await say(null, { message: 'my father is unconscious' });
  assert.match(e.messages[0].text, /immediate emergency medical care/);
});

test('chat: cancel needs number + mobile; tampered state is rejected', async () => {
  await voice('book-appointment', { patient_name: 'Kala Devi', mobile: '9876533333', doctor: 'nivi', appointment_date: H.THU, appointment_time: '11:00', reason: 'checkup', patient_type: 'new' });
  let r = await say(null, { action: 'flow:cancel' });
  r = await say(r, { message: 'LMH-0001' });
  r = await say(r, { message: '9000000000' });
  assert.match(r.messages[0].text, /could not find/);
  // Forge a "verified" state with a bad signature
  const forged = Buffer.from(JSON.stringify({ lang: 'en', flow: 'cancel', step: 'confirm', d: {}, verified: 1, exp: Date.now() + 1e6 })).toString('base64url') + '.AAAA';
  const f = await chat.handle({ action: 'yes', state: forged });
  assert.equal((await H.dbm.db().get('SELECT status FROM appointments')).status, 'booked');
  assert.ok(f.messages.length);
  r = await say(null, { action: 'flow:cancel' });
  r = await say(r, { message: 'LMH-0001' });
  r = await say(r, { message: '9876533333' });
  r = await say(r, { action: 'yes' });
  assert.match(r.messages[0].text, /LMH-0001 has been cancelled/);
});

test('chat: check by mobile requires the patient name', async () => {
  await voice('book-appointment', { patient_name: 'Kala Devi', mobile: '9876533333', doctor: 'nivi', appointment_date: H.THU, appointment_time: '11:00', reason: 'checkup', patient_type: 'new' });
  let r = await say(null, { action: 'flow:check' });
  r = await say(r, { message: '9876533333' });
  r = await say(r, { message: 'Wrong Name' });
  assert.match(r.messages[0].text, /could not find/);
  r = await say(null, { action: 'flow:check' });
  r = await say(r, { message: '9876533333' });
  r = await say(r, { message: 'kala devi' });
  assert.ok(r.messages.some((m) => m.type === 'card' && m.title === 'LMH-0001'));
});

// ---------------- website / HTTP / admin ----------------
test('13. pages render, are mobile-ready, and never expose private numbers', async () => {
  for (const p of ['/', '/doctors', '/schedule', '/book', '/ai-receptionist', '/status', '/contact', '/admin']) {
    const res = await fetch(base + p);
    assert.equal(res.status, 200, p);
    const html = await res.text();
    assert.ok(html.includes('name="viewport"'), p);
    assert.ok(!html.includes('9000011111') && !html.includes('9000022222'), `private number leaked on ${p}`);
    assert.match(res.headers.get('content-security-policy'), /script-src 'self'/);
  }
  for (const f of ['/js/chat.js', '/js/site.js', '/js/book.js', '/js/i18n.js']) {
    const js = await (await fetch(base + f)).text();
    assert.ok(!/9000011111|9000022222|test-token|webhook-secret/.test(js), f);
  }
});

test('/call redirects server-side to the private AI number', async () => {
  const r = await fetch(`${base}/call`, { redirect: 'manual' });
  assert.equal(r.status, 302);
  assert.equal(r.headers.get('location'), 'tel:+919000011111');
});

test('1. website booking API + availability + status lookup', async () => {
  const { vijul } = await H.ids();
  const av = await (await fetch(`${base}/api/availability?doctor_id=${vijul}&date=${H.THU}`)).json();
  assert.equal(av.sessions[0].available_count, 14);
  const res = await fetch(`${base}/api/appointments`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ doctor: String(vijul), appointment_date: H.THU, appointment_time: '10:00', session: 'morning', patient_name: 'Web User', mobile: '9876544444', patient_type: 'new', reason: 'Shoulder pain' }),
  });
  const j = await res.json();
  assert.equal(res.status, 201);
  assert.equal(j.appointment.appointment_no, 'LMH-0001');
  assert.equal(j.appointment.mobile_masked, 'XXXXXX4444');
  const st = await (await fetch(`${base}/api/appointments/status`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ appointment_no: 'LMH-0001', mobile: '9000000000' }) })).json();
  assert.equal(st.success, false);
});

test('admin: login required; confirm sends WhatsApp confirmation', async () => {
  const anon = await fetch(`${base}/api/admin/appointments`);
  assert.equal(anon.status, 401);
  const bad = await fetch(`${base}/api/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'nope' }) });
  assert.equal(bad.status, 401);
  const login = await fetch(`${base}/api/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'test-pass' }) });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const h = { 'Content-Type': 'application/json', Cookie: cookie, 'X-Requested-With': 'lmh-admin' };
  await voice('book-appointment', { patient_name: 'Admin Test', mobile: '9876555555', doctor: 'vijul', appointment_date: H.THU, appointment_time: '18:00', reason: 'pain', patient_type: 'new' });
  const list = await (await fetch(`${base}/api/admin/appointments?view=voice`, { headers: h })).json();
  assert.equal(list.appointments.length, 1);
  const noHeader = await fetch(`${base}/api/admin/appointments/${list.appointments[0].id}/confirm`, { method: 'POST', headers: { Cookie: cookie } });
  assert.equal(noHeader.status, 403);
  H.sentWhatsApp.length = 0;
  const ok = await (await fetch(`${base}/api/admin/appointments/${list.appointments[0].id}/confirm`, { method: 'POST', headers: h })).json();
  assert.equal(ok.appointment.status, 'confirmed');
  assert.ok(H.sentWhatsApp.some((m) => m.body.text.body.includes('Appointment confirmation')));
  const sum = await (await fetch(`${base}/api/admin/summary`, { headers: h })).json();
  assert.equal(sum.counts.tomorrow, 1);
});

test('chat: Tamil booking end-to-end, confirmed by typing "ஆம்"', async () => {
  let r = await say(null, { message: 'நாளை காலை இதய மருத்துவர் சந்திப்பு வேண்டும்' });
  assert.equal(r.lang, 'ta');
  assert.ok(r.buttons.some((b) => b.value === `slot:${H.THU}|10:00`), 'Nivi morning slots shown');
  r = await say(r, { action: `slot:${H.THU}|10:00` });
  r = await say(r, { message: 'செல்வி' });
  r = await say(r, { message: '98765 66666' });
  r = await say(r, { message: 'புதிய நோயாளி' });
  r = await say(r, { message: 'நெஞ்சு வலி பரிசோதனை' });
  assert.equal(r.messages[0].title, 'உங்கள் விவரங்களைச் சரிபார்க்கவும். இவை சரியா?');
  r = await say(r, { message: 'ஆம்' });
  assert.match(r.messages[0].title, /சந்திப்பு உறுதி செய்யப்பட்டது/);
  const row = await H.dbm.db().get('SELECT language, patient_type FROM appointments');
  assert.deepEqual({ ...row }, { language: 'ta', patient_type: 'new' });
});
