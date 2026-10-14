'use strict';
// WhatsApp chatbot (google-sheets/WhatsApp.gs + Code.gs) in a simulated
// Apps Script environment with a fake Meta Cloud API.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const dir = path.join(__dirname, '..', 'google-sheets');
const SOURCES = ['Code.gs', 'WhatsApp.gs'].map((f) => fs.readFileSync(path.join(dir, f), 'utf8'));
const OWN_ID = '1112223334445';
const TOKEN = 'EAAG-test-token-should-never-be-logged';

function makeEnv({ today = '2026-10-09', props = {}, api = 'ok' } = {}) {
  const sheets = new Map();
  const cache = new Map();
  const sent = [];
  const state = { api };
  function makeSheet(name) {
    const sh = {
      name, rows: [], frozen: 0,
      getLastRow: () => sh.rows.length,
      getLastColumn: () => (sh.rows[0] || []).length,
      appendRow: (r) => { sh.rows.push(Array.from(r, String)); },
      getDataRange: () => ({ getValues: () => sh.rows.map((r) => r.slice()) }),
      getRange: (r, c, nr, nc) => ({
        setValues: (vals) => { sh.rows[r - 1] = Array.from(vals[0], String).slice(0, nc); return { setFontWeight() {} }; },
      }),
      setFrozenRows: (n) => { sh.frozen = n; },
    };
    return sh;
  }
  const ss = { getSheetByName: (n) => sheets.get(n) || null, insertSheet: (n) => { const s = makeSheet(n); sheets.set(n, s); return s; } };
  const allProps = { SHEETS_SECRET: 's', WA_ACCESS_TOKEN: TOKEN, WA_PHONE_NUMBER_ID: OWN_ID, WA_VERIFY_TOKEN: 'v', ...props };
  const ctx = {
    console: { error() {} },
    SpreadsheetApp: { getActiveSpreadsheet: () => ss },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => allProps[k] ?? null, setProperty: (k, v) => { allProps[k] = String(v); } }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    CacheService: { getScriptCache: () => ({ get: (k) => cache.get(k) ?? null, put: (k, v) => cache.set(k, v), remove: (k) => cache.delete(k) }) },
    ContentService: { MimeType: { JSON: 'application/json', TEXT: 'text/plain' }, createTextOutput: (s) => ({ body: s, setMimeType(m) { this.mime = m; return this; } }) },
    Utilities: { formatDate: (d, tz, fmt) => (fmt === 'yyyy-MM-dd' ? today : `${tz}|${fmt}`) },
    MailApp: { sendEmail: () => { throw new Error('WhatsApp requests must not send email'); } },
    UrlFetchApp: {
      fetch: (url, opts) => {
        if (state.api === 'throw') throw new Error('DNS error');
        sent.push({ url, opts, body: JSON.parse(opts.payload) });
        if (state.api === 'fail') return { getResponseCode: () => 401, getContentText: () => JSON.stringify({ error: { message: `Invalid OAuth access token ${TOKEN}`, code: 190 } }) };
        return { getResponseCode: () => 200, getContentText: () => '{"messages":[{"id":"wamid.out"}]}' };
      },
    },
    JSON, String, Object, Array, Date, Number, encodeURIComponent,
  };
  vm.createContext(ctx);
  for (const src of SOURCES) vm.runInContext(src, ctx);

  let n = 0;
  const hook = (messages, { phoneId = OWN_ID, name = 'Ravi' } = {}) => {
    const body = { object: 'whatsapp_business_account', entry: [{ changes: [{ value: { metadata: { phone_number_id: phoneId }, contacts: [{ profile: { name } }], messages } }] }] };
    const out = ctx.doPost({ postData: { contents: JSON.stringify(body) }, parameter: {} });
    return JSON.parse(out.body);
  };
  const from = '919876543210';
  const say = (text, id) => hook([{ from, id: id || `wamid.${++n}`, type: 'text', text: { body: text } }]);
  const tap = (replyId, title, kind = 'button_reply') => hook([{ from, id: `wamid.${++n}`, type: 'interactive', interactive: { type: kind, [kind]: { id: replyId, title } } }]);
  const lastSent = () => sent[sent.length - 1].body;
  const texts = () => sent.map((s) => (s.body.text ? s.body.text.body : s.body.interactive.body.text));
  return { ctx, sheets, cache, sent, state, hook, say, tap, lastSent, texts, from };
}

test('full conversation: greeting → name → doctor list → date → time → reason → type → confirm → saved to Requests', () => {
  const w = makeEnv();
  assert.deepEqual(w.say('hi'), { ok: true });
  assert.match(w.texts()[0], /Welcome to Lakshmi Multispecialty Hospital/);
  assert.match(w.texts()[0], /லட்சுமி மல்டிஸ்பெஷாலிட்டி/);
  assert.match(w.texts()[0], /108/);
  assert.match(w.lastSent().text.body, /patient's full name/);

  w.say('Ravi Kumar');
  const list = w.lastSent();
  assert.equal(list.type, 'interactive');
  assert.equal(list.interactive.type, 'list');
  assert.deepEqual(list.interactive.action.sections[0].rows.map((r) => `${r.id}|${r.title}|${r.description}`),
    ['doc_vijul|Mr. Vijul|Orthopaedic', 'doc_vishwa|Mr. Vishwa|Diabetologist', 'doc_nivi|Ms. Nivi|Heart Specialist', 'doc_unsure|Not sure|Staff will advise']);

  w.tap('doc_vijul', 'Mr. Vijul', 'list_reply');
  assert.match(w.lastSent().text.body, /Preferred \*date\*/);
  w.say('tomorrow');
  assert.match(w.lastSent().text.body, /Preferred \*time\*/);
  w.say('skip');
  assert.match(w.lastSent().text.body, /Reason for the visit/);
  w.say('Knee pain');
  const typeQ = w.lastSent();
  assert.deepEqual(typeQ.interactive.action.buttons.map((b) => b.reply.id), ['pt_new', 'pt_existing']);
  w.tap('pt_new', 'New patient');
  const summary = w.lastSent();
  assert.deepEqual(summary.interactive.action.buttons.map((b) => b.reply.title), ['Confirm', 'Change']);
  const sumText = summary.interactive.body.text;
  for (const part of ['Ravi Kumar', 'Mr. Vijul – Orthopaedic', 'Sat, 10 Oct 2026', 'Any time', 'Knee pain', 'New patient', 'not a confirmed appointment']) {
    assert.ok(sumText.includes(part), part);
  }
  w.tap('cf_confirm', 'Confirm');
  assert.match(w.lastSent().text.body, /^Thank you\. Your request is noted\. Our hospital staff will call you to confirm your appointment\./);

  const req = w.sheets.get('Requests').rows;
  assert.equal(req.length, 2);
  const row = req[1];
  assert.deepEqual(row.slice(1, 9), ['Ravi Kumar', '9876543210', 'Mr. Vijul – Orthopaedic', 'Sat, 10 Oct 2026', 'Any time', 'Knee pain', 'New', 'English']);
  assert.equal(row[9], "'+919876543210");
  assert.match(row[10], /^wamid\./);
  assert.equal(row[11], 'WhatsApp');
  assert.equal(row[12], 'New');
  // never an appointment number
  assert.ok(!w.texts().some((t) => /LMH-\d/.test(t)));
  // every API call went to the right endpoint with the bearer token
  assert.ok(w.sent.every((s) => s.url === `https://graph.facebook.com/v20.0/${OWN_ID}/messages` && s.opts.headers.Authorization === `Bearer ${TOKEN}`));
  assert.ok(w.sent.every((s) => s.body.to === w.from && s.body.messaging_product === 'whatsapp'));
});

test('typed answers also work (doctor by name/number, "existing", "yes")', () => {
  const w = makeEnv();
  w.say('vanakkam'); w.say('நிவி'); // Tamil name
  w.say('heart doctor'); // typed doctor
  w.say('monday'); w.say('6 pm'); w.say('BP check'); w.say('existing'); w.say('yes');
  const row = w.sheets.get('Requests').rows[1];
  assert.deepEqual(row.slice(1, 9), ['நிவி', '9876543210', 'Ms. Nivi – Heart Specialist', 'Mon, 12 Oct 2026', '6 pm', 'BP check', 'Existing', 'Tamil']);
});

test('dates: today/tomorrow/weekday/dd-mm/dd/mm/yyyy, Tamil & Hindi words, past and invalid', () => {
  const { ctx } = makeEnv({ today: '2026-10-09' }); // Friday
  const d = (s) => JSON.parse(JSON.stringify(ctx.parseWaDate_(s)));
  assert.equal(d('today').iso, '2026-10-09');
  assert.equal(d('இன்று').iso, '2026-10-09');
  assert.equal(d('tomorrow').iso, '2026-10-10');
  assert.equal(d('நாளை').iso, '2026-10-10');
  assert.equal(d('kal').iso, '2026-10-10');
  assert.equal(d('day after tomorrow').iso, '2026-10-11');
  assert.equal(d('Monday').iso, '2026-10-12');
  assert.equal(d('friday').iso, '2026-10-09', 'same weekday = today');
  assert.equal(d('next tuesday').iso, '2026-10-13');
  assert.equal(d('திங்கள்').iso, '2026-10-12');
  assert.equal(d('15-10').iso, '2026-10-15');
  assert.equal(d('15/10/2026').pretty, 'Thu, 15 Oct 2026');
  assert.equal(d('1/1/27').iso, '2027-01-01');
  assert.equal(d('01-10').iso, '2027-10-01', 'dd-mm already passed this year → next year');
  assert.deepEqual(d('01/10/2026'), { error: 'past' });
  assert.deepEqual(d('31-02'), { error: 'invalid' });
  assert.deepEqual(d('someday'), { error: 'invalid' });
});

test('wrong/past dates and bad names re-ask without moving on', () => {
  const w = makeEnv();
  w.say('hello'); w.say('=SUM(1)');
  assert.match(w.lastSent().text.body, /letters only/);
  w.say('Anitha'); w.tap('doc_nivi', 'Ms. Nivi', 'list_reply');
  w.say('01/01/2026');
  assert.match(w.lastSent().text.body, /already passed/);
  w.say('next year sometime');
  assert.match(w.lastSent().text.body, /could not understand that date/);
  w.say('16-10');
  assert.match(w.lastSent().text.body, /Preferred \*time\*/);
});

test('"Change" restarts the details; restart words reset the conversation', () => {
  const w = makeEnv();
  w.say('hi'); w.say('Ravi'); w.tap('doc_vijul', 'Mr. Vijul', 'list_reply'); w.say('today'); w.say('skip'); w.say('skip'); w.tap('pt_new', 'New patient');
  w.tap('cf_change', 'Change');
  assert.match(w.texts().at(-2), /let's update the details/);
  assert.match(w.lastSent().text.body, /patient's full name/);
  w.say('Ravi Kumar');
  w.say('menu');
  assert.match(w.texts().at(-2), /Welcome to Lakshmi/);
  assert.equal(w.sheets.get('Requests'), undefined, 'nothing saved');
});

test('emergency words get the 108 reply immediately (state kept)', () => {
  const w = makeEnv();
  w.say('hi'); w.say('Ravi');
  w.say('my father has chest pain');
  assert.equal(w.lastSent().text.body.split('\n')[0], 'Please call 108 or go to the nearest emergency department now.');
  w.tap('doc_nivi', 'Ms. Nivi', 'list_reply');
  assert.match(w.lastSent().text.body, /Preferred \*date\*/, 'conversation continues where it was');
  w.say('விபத்து');
  assert.match(w.lastSent().text.body, /^Please call 108/);
});

test('"staff" / "call me" saves a callback row', () => {
  const w = makeEnv();
  w.say('hi'); w.say('Ravi Kumar');
  w.say('please call me');
  const row = w.sheets.get('Requests').rows[1];
  assert.equal(row[1], 'Ravi Kumar');
  assert.equal(row[6], 'Callback requested');
  assert.equal(row[11], 'WhatsApp');
  assert.match(w.lastSent().text.body, /staff will call you back soon/);
  // with no name yet, the WhatsApp profile name is used
  const w2 = makeEnv();
  w2.say('staff');
  assert.equal(w2.sheets.get('Requests').rows[1][1], 'Ravi');
});

test('no medical advice; media messages asked to type', () => {
  const w = makeEnv();
  w.say('hi'); w.say('Ravi');
  w.say('which tablet should I take for fever');
  assert.match(w.texts().at(-2), /can't give medical advice/);
  assert.equal(w.lastSent().interactive.type, 'list', 're-asks the doctor');
  w.hook([{ from: w.from, id: 'wamid.img', type: 'image', image: { id: 'x' } }]);
  assert.match(w.lastSent().text.body, /reply with a text message/);
});

test('duplicates (same message id) are processed once; status updates ignored', () => {
  const w = makeEnv();
  w.say('hi', 'wamid.same');
  w.say('hi', 'wamid.same');
  assert.equal(w.sent.length, 2, 'greeting + ask name, only once');
  const before = w.sent.length;
  w.ctx.doPost({ postData: { contents: JSON.stringify({ object: 'whatsapp_business_account', entry: [{ changes: [{ value: { metadata: { phone_number_id: OWN_ID }, statuses: [{ id: 'x', status: 'delivered' }] } }] }] }) } });
  assert.equal(w.sent.length, before);
});

test('events for another phone_number_id are ignored and logged', () => {
  const w = makeEnv();
  w.hook([{ from: w.from, id: 'wamid.x', type: 'text', text: { body: 'hi' } }], { phoneId: '999' });
  assert.equal(w.sent.length, 0);
  assert.match(w.sheets.get('WA Errors').rows[1][2], /another\/unknown phone_number_id/);
});

test('send failures are logged to "WA Errors" without the token; bot never crashes', () => {
  const w = makeEnv({ api: 'fail' });
  assert.deepEqual(w.say('hi'), { ok: true });
  const errs = w.sheets.get('WA Errors').rows;
  assert.deepEqual(errs[0], ['Timestamp', 'Where', 'Error', 'Details']);
  assert.match(errs[1][2], /^HTTP 401 Invalid OAuth access token \[token\]/);
  assert.equal(errs[1][3], 'XXXXXX3210');
  assert.ok(!JSON.stringify(errs).includes(TOKEN), 'token never written');
  w.state.api = 'throw';
  assert.deepEqual(w.say('Ravi'), { ok: true });
  assert.match(w.sheets.get('WA Errors').rows.at(-1)[2], /DNS error/);
});

test('not configured → nothing sent, clear error logged', () => {
  const w = makeEnv({ props: { WA_ACCESS_TOKEN: null } });
  w.say('hi');
  assert.equal(w.sent.length, 0);
  assert.match(w.sheets.get('WA Errors').rows[1][2], /not configured/);
});

test('session survives a cache loss via the "WA Sessions" backup', () => {
  const w = makeEnv();
  w.say('hi'); w.say('Ravi Kumar');
  const sess = w.sheets.get('WA Sessions').rows;
  assert.deepEqual(sess[0], ['WhatsApp number', 'Step', 'Data (JSON)', 'Updated']);
  assert.equal(sess.length, 2, 'one row per number (upsert)');
  assert.equal(sess[1][0], w.from);
  assert.equal(sess[1][1], 'doctor');
  w.cache.forEach((v, k) => { if (k.startsWith('wa:s:')) w.cache.delete(k); });
  w.tap('doc_vishwa', 'Mr. Vishwa', 'list_reply');
  assert.match(w.lastSent().text.body, /Preferred \*date\*/, 'continued from the sheet backup');
});

test('Meta webhook verification (doGet)', () => {
  const w = makeEnv({ props: { WA_VERIFY_TOKEN: 'my-verify' } });
  assert.equal(w.ctx.doGet({ parameter: { 'hub.mode': 'subscribe', 'hub.verify_token': 'my-verify', 'hub.challenge': '777' } }).body, '777');
  assert.equal(w.ctx.doGet({ parameter: { 'hub.mode': 'subscribe', 'hub.verify_token': 'x', 'hub.challenge': '777' } }).body, 'Forbidden');
});
