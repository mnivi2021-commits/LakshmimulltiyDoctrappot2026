'use strict';
// Runs google-sheets/Code.gs in a simulated Apps Script environment
// (SpreadsheetApp, PropertiesService, LockService, ContentService, Utilities).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const CODE = fs.readFileSync(path.join(__dirname, '..', 'google-sheets', 'Code.gs'), 'utf8');

function makeEnv({ secret = 'sheet-secret', lockFails = false, props = {}, files = [], stubs = {} } = {}) {
  const sheets = new Map();
  const locks = { held: 0, max: 0, released: 0 };
  function makeSheet(name) {
    const sheet = {
      name, rows: [], frozen: 0, boldHeader: false,
      getLastRow: () => sheet.rows.length,
      appendRow: (r) => { sheet.rows.push(Array.from(r, String)); }, // copy out of the vm realm
      getRange: (r, c, nr, nc) => ({
        setValues: (vals) => { sheet.rows[r - 1] = Array.from(vals[0], String).slice(0, nc); return { setFontWeight: (w) => { sheet.boldHeader = w === 'bold'; } }; },
      }),
      setFrozenRows: (n) => { sheet.frozen = n; },
    };
    return sheet;
  }
  const ss = {
    getSheetByName: (n) => sheets.get(n) || null,
    insertSheet: (n) => { const s = makeSheet(n); sheets.set(n, s); return s; },
  };
  const ctx = {
    console: { error() {} },
    SpreadsheetApp: { getActiveSpreadsheet: () => ss },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (k === 'SHEETS_SECRET' ? secret : (props[k] ?? null)) }) },
    LockService: {
      getScriptLock: () => ({
        waitLock: () => { if (lockFails) throw new Error('timeout'); locks.held++; locks.max = Math.max(locks.max, locks.held); },
        releaseLock: () => { locks.held--; locks.released++; },
      }),
    },
    ContentService: {
      MimeType: { JSON: 'application/json', TEXT: 'text/plain' },
      createTextOutput: (s) => ({ body: s, setMimeType(m) { this.mime = m; return this; } }),
    },
    Utilities: { formatDate: (d, tz, fmt) => `${tz}|${fmt}` },
    JSON, String, Object, Array, Date,
  };
  Object.assign(ctx, stubs);
  vm.createContext(ctx);
  vm.runInContext(CODE, ctx);
  for (const extra of files) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'google-sheets', extra), 'utf8'), ctx);
  const post = (body, query = {}) => {
    const out = ctx.doPost({ postData: { contents: typeof body === 'string' ? body : JSON.stringify(body) }, parameter: query });
    return { json: JSON.parse(out.body), mime: out.mime };
  };
  return { ctx, sheets, locks, post };
}

const REQUEST = {
  secret: 'sheet-secret', type: 'request', patient_name: 'Ravi Kumar', mobile: '+91 98765 43210', doctor: 'Mr. Vijul – Orthopaedic',
  preferred_date: '2026-10-12', preferred_time: '10:30 AM', reason: 'Knee pain', patient_type: 'new patient', language: 'Tamil',
  from_number: '+919876543210', call_sid: 'CA123',
};

test('doGet health check', () => {
  const { ctx } = makeEnv();
  assert.equal(ctx.doGet({}).body, '{"ok":true}');
});

test('request → "Requests" sheet with headers, frozen bold header, IST timestamp and say text', () => {
  const env = makeEnv();
  const r = env.post(REQUEST);
  assert.equal(r.mime, 'application/json');
  assert.deepEqual(r.json, { success: true, say: 'Thank you. I have noted your details. Our hospital staff will call you back to confirm your appointment.' });
  const s = env.sheets.get('Requests');
  assert.deepEqual(s.rows[0], ['Timestamp', 'Patient name', 'Mobile', 'Doctor wanted', 'Preferred date', 'Preferred time',
    'Reason', 'New/Existing', 'Language', 'Caller number', 'Call/Message ID', 'Source', 'Status']);
  assert.equal(s.frozen, 1);
  assert.equal(s.boldHeader, true);
  assert.deepEqual(s.rows[1], ['Asia/Kolkata|yyyy-MM-dd HH:mm:ss', 'Ravi Kumar', '9876543210', 'Mr. Vijul – Orthopaedic', '2026-10-12',
    '10:30 AM', 'Knee pain', 'New', 'Tamil', "'+919876543210", 'CA123', 'AI call – system offline', 'New']);
  assert.equal(env.sheets.has('Call Log'), false);
  assert.equal(env.locks.released, 1);
});

test('request: source/status can be set by the backend (booked)', () => {
  const env = makeEnv();
  env.post({ ...REQUEST, source: 'AI call – booked', status: 'Booked' });
  const row = env.sheets.get('Requests').rows[1];
  assert.equal(row[11], 'AI call – booked');
  assert.equal(row[12], 'Booked');
});

test('security: wrong/missing secret rejected; ?key= accepted; unset property refuses all', () => {
  let env = makeEnv();
  assert.deepEqual(env.post({ ...REQUEST, secret: 'wrong' }).json, { success: false });
  assert.deepEqual(env.post({ type: 'request', patient_name: 'X' }).json, { success: false });
  assert.equal(env.sheets.size, 0, 'nothing written');
  const { secret, ...noSecret } = REQUEST;
  assert.equal(env.post(noSecret, { key: 'sheet-secret' }).json.success, true);
  env = makeEnv({ secret: null });
  assert.deepEqual(env.post(REQUEST).json, { success: false });
});

test('invalid JSON and empty body do not crash', () => {
  const env = makeEnv();
  assert.deepEqual(env.post('{not json').json, { success: false, message: 'Invalid JSON' });
  const out = env.ctx.doPost({ parameter: { key: 'sheet-secret' } });
  assert.equal(JSON.parse(out.body).success, true); // empty post-call → logged as a call
});

test('OmniDimension post-call payload → "Call Log" (defensive field reading, secret not stored)', () => {
  const env = makeEnv();
  const payload = {
    call_id: 'omni-77', bot_id: 'b1', phone_number: '9876543210', call_status: 'completed', call_duration: 143,
    call_report: { summary: 'Booked Vijul', sentiment: 'positive', extracted_variables: { appointment_status: 'booked' },
      full_conversation: 'AGENT: Welcome… USER: …' },
  };
  const r = env.post(payload, { key: 'sheet-secret' });
  assert.deepEqual(r.json, { success: true });
  const s = env.sheets.get('Call Log');
  assert.deepEqual(s.rows[0], ['Timestamp', 'Caller number', 'Call ID', 'Duration', 'Summary', 'Outcome', 'Transcript', 'Raw JSON']);
  const row = s.rows[1];
  assert.equal(row[1], '9876543210');
  assert.equal(row[2], 'omni-77');
  assert.equal(row[3], '143');
  assert.equal(row[4], 'Booked Vijul');
  assert.equal(row[5], 'completed');
  assert.equal(row[6], 'AGENT: Welcome… USER: …');
  assert.ok(row[7].includes('"call_id":"omni-77"'));
  // secret in body is never copied into the sheet
  env.post({ ...payload, secret: 'sheet-secret' });
  assert.ok(!env.sheets.get('Call Log').rows[2][7].includes('sheet-secret'));
});

test('post-call: other key names and interactions list; missing fields → blanks, no crash', () => {
  const env = makeEnv();
  env.post({ from_number: '+919000000001', call_sid: 'CA9', duration: '61', summary: 'Asked timings', disposition: 'info',
    interactions: [{ role: 'agent', text: 'Hello' }, { role: 'user', text: 'Timings?' }] }, { key: 'sheet-secret' });
  env.post({}, { key: 'sheet-secret' });
  const rows = env.sheets.get('Call Log').rows;
  assert.deepEqual(rows[1].slice(1, 7), ["'+919000000001", 'CA9', '61', 'Asked timings', 'info', 'agent: Hello\nuser: Timings?']);
  assert.deepEqual(rows[2].slice(1, 7), ['', '', '', '', '', '']);
});

test('long transcripts are truncated below the 50,000-character cell limit', () => {
  const env = makeEnv();
  env.post({ call_id: 'long', call_report: { full_conversation: 'x'.repeat(80000) } }, { key: 'sheet-secret' });
  const row = env.sheets.get('Call Log').rows[1];
  assert.ok(row[6].length <= 45020 && row[6].endsWith('…[truncated]'));
  assert.ok(row[7].length <= 45020);
});

test('callers cannot inject spreadsheet formulas', () => {
  const env = makeEnv();
  env.post({ ...REQUEST, patient_name: '=HYPERLINK("http://evil","x")', reason: '+cmd', doctor: '@SUM(A1)' });
  const row = env.sheets.get('Requests').rows[1];
  assert.equal(row[1], '\'=HYPERLINK("http://evil","x")');
  assert.equal(row[6], "'+cmd");
  assert.equal(row[3], "'@SUM(A1)");
});

test('lock: busy lock returns a retry message and writes nothing', () => {
  const env = makeEnv({ lockFails: true });
  assert.deepEqual(env.post(REQUEST).json, { success: false, message: 'Busy, please retry' });
  assert.equal(env.sheets.size, 0);
});

test('doGet: Meta webhook verification returns hub.challenge only with the right verify token', () => {
  const env = makeEnv({ props: { WA_VERIFY_TOKEN: 'verify-me' } });
  const ok = env.ctx.doGet({ parameter: { 'hub.mode': 'subscribe', 'hub.verify_token': 'verify-me', 'hub.challenge': '12345' } });
  assert.equal(ok.body, '12345');
  assert.equal(ok.mime, 'text/plain');
  const bad = env.ctx.doGet({ parameter: { 'hub.mode': 'subscribe', 'hub.verify_token': 'nope', 'hub.challenge': '12345' } });
  assert.equal(bad.body, 'Forbidden');
  const unset = makeEnv().ctx.doGet({ parameter: { 'hub.mode': 'subscribe', 'hub.verify_token': '', 'hub.challenge': '1' } });
  assert.equal(unset.body, 'Forbidden');
  assert.equal(env.ctx.doGet({ parameter: {} }).body, '{"ok":true}');
});

test('WhatsApp payloads are routed to handleWhatsApp without SHEETS_SECRET and always answered {"ok":true}', () => {
  const seen = [];
  const env = makeEnv({ stubs: { handleWhatsApp: (b) => seen.push(b), logWaError_: () => {} } });
  const r = env.post({ object: 'whatsapp_business_account', entry: [] });
  assert.deepEqual(r.json, { ok: true });
  assert.equal(seen.length, 1);
  assert.equal(env.sheets.size, 0, 'not treated as a call log');
  // a crash inside the handler is swallowed (Meta still gets 200)
  const env2 = makeEnv({ stubs: { handleWhatsApp: () => { throw new Error('boom'); }, logWaError_: () => {} } });
  assert.deepEqual(env2.post({ object: 'whatsapp_business_account' }).json, { ok: true });
});

test('setupSheets creates all four sheets with headers', () => {
  const env = makeEnv();
  env.ctx.setupSheets();
  assert.deepEqual([...env.sheets.keys()].sort(), ['Call Log', 'Requests', 'WA Errors', 'WA Sessions']);
  assert.deepEqual(env.sheets.get('WA Sessions').rows[0], ['WhatsApp number', 'Step', 'Data (JSON)', 'Updated']);
});
