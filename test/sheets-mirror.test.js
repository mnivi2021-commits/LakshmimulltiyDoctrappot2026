'use strict';
// Optional Google Sheets mirror: copies voice bookings / staff callbacks to the
// Apps Script URL without ever blocking or failing the API response.
process.env.SHEETS_WEBHOOK_URL = 'https://script.google.com/macros/s/TEST/exec';
process.env.SHEETS_SECRET = 'sheets-test-secret';

const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./helpers');
const app = require('../src/app');

// Intercept calls to the Apps Script URL (helpers already mocks WhatsApp).
const sent = [];
let googleMode = 'ok'; // 'ok' | 'down' | 'slow'
const prevFetch = global.fetch;
global.fetch = async (url, opts) => {
  if (String(url).startsWith('https://script.google.com/')) {
    sent.push(JSON.parse(opts.body));
    if (googleMode === 'down') throw new Error('getaddrinfo ENOTFOUND script.google.com');
    if (googleMode === 'slow') await new Promise((r) => setTimeout(r, 5000));
    return new Response('{"success":true}', { status: 200 });
  }
  return prevFetch(url, opts);
};

let server; let base;
test.before(async () => { await new Promise((r) => { server = app.listen(0, r); }); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());
test.beforeEach(async () => { await H.freshDb(); H.setIST(H.WED, '09:00'); sent.length = 0; googleMode = 'ok'; });

const HDR = { 'Content-Type': 'application/json', 'X-Webhook-Secret': 'test-webhook-secret' };
const tool = (name, body) => fetch(`${base}/api/voice/${name}`, { method: 'POST', headers: HDR, body: JSON.stringify(body) }).then((r) => r.json());
const booking = (o = {}) => ({
  patient_name: 'Ravi Kumar', mobile: '9876543210', doctor: 'Vijul', appointment_date: H.THU, appointment_time: '10:30',
  session: 'morning', reason: 'Knee pain', patient_type: 'new', language: 'ta', call_id: 'call-9', patient_confirmed: true, ...o,
});
const settle = () => new Promise((r) => setTimeout(r, 50));
const origErr = console.error;

test('successful voice booking is copied to the Sheet as "AI call – booked" / "Booked"', async () => {
  const r = await tool('book-appointment', booking());
  assert.equal(r.status, 'booked');
  await settle();
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0], {
    secret: 'sheets-test-secret', type: 'request', patient_name: 'Ravi Kumar', mobile: '9876543210',
    doctor: 'Mr. Vijul – Orthopaedic', preferred_date: H.THU, preferred_time: '10:30', reason: 'Knee pain',
    patient_type: 'new', language: 'ta', from_number: '', call_sid: 'call-9',
    source: 'AI call – booked (LMH-0001)', status: 'Booked',
  });
});

test('staff_callback is copied as "Callback requested"', async () => {
  const r = await tool('staff-callback', { patient_name: 'Anitha', mobile: '9123456789', reason: 'Billing question', language: 'en', call_id: 'c-2' });
  assert.equal(r.status, 'callback_logged');
  await settle();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].type, 'request');
  assert.equal(sent[0].source, 'AI call – staff callback');
  assert.equal(sent[0].status, 'Callback requested');
  assert.equal(sent[0].reason, 'Billing question');
});

test('nothing is copied for checks, read-backs or failed bookings', async () => {
  await tool('check-availability', { doctor: 'Vijul', appointment_date: H.THU, session: 'morning', appointment_time: '10:30' });
  await tool('book-appointment', booking({ patient_confirmed: false }));
  await tool('book-appointment', booking({ doctor: 'Dr. Ramesh' }));
  await settle();
  assert.equal(sent.length, 0);
});

test('Google down: booking still succeeds with the same response', async () => {
  googleMode = 'down'; console.error = () => {};
  try {
    const r = await tool('book-appointment', booking());
    assert.equal(r.status, 'booked');
    assert.equal(r.appointment_no, 'LMH-0001');
    await settle();
  } finally { console.error = origErr; }
  assert.equal(Number((await H.dbm.db().get('SELECT COUNT(*) AS n FROM appointments')).n), 1);
});

test('Google slow (5 s): booking response is not delayed', async () => {
  googleMode = 'slow';
  const t0 = Date.now();
  const r = await tool('book-appointment', booking());
  const ms = Date.now() - t0;
  assert.equal(r.status, 'booked');
  assert.ok(ms < 1500, `response took ${ms} ms`);
});
