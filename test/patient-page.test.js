'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const H = require('./helpers');
const app = require('../src/app');

let server; let base;
test.before(async () => {
  await H.freshDb();
  await new Promise((r) => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server.close());

const sha = (s) => `'sha256-${crypto.createHash('sha256').update(s, 'utf8').digest('base64')}'`;

test('patient page: served with a CSP that allows exactly its inline script/style', async () => {
  const r = await fetch(`${base}/index.html`);
  assert.equal(r.status, 200);
  const html = await r.text();
  const csp = r.headers.get('content-security-policy');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const style = html.match(/<style>([\s\S]*?)<\/style>/)[1];
  assert.ok(csp.includes(sha(script)), 'script hash allowed');
  assert.ok(csp.includes(sha(style)), 'style hash allowed');
  assert.ok(!csp.includes('unsafe-inline'), 'no unsafe-inline');
  assert.match(csp, /fonts\.googleapis\.com/);
  assert.match(csp, /fonts\.gstatic\.com/);
  assert.match(csp, /connect-src 'self' https:\/\/lakshmi-sheets\.mnivi2021\.workers\.dev/);
  // other pages keep the strict policy
  const other = (await fetch(`${base}/book`)).headers.get('content-security-policy');
  assert.ok(!other.includes('sha256-') && !other.includes('googleapis'));
});

test('patient page: no phone number in visible text, no secrets, no voice API', async () => {
  const html = await (await fetch(`${base}/index.html`)).text();
  const visible = html.replace(/<script>[\s\S]*?<\/script>/g, '').replace(/<style>[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ');
  const longNumbers = visible.match(/\+?\d[\d\s-]{8,}\d/g) || [];
  assert.deepEqual(longNumbers, [], 'no phone-like number shown as text');
  assert.ok(visible.includes('108'), 'emergency 108 is shown');
  assert.ok(!/\/api\/voice/.test(html), 'never calls the voice webhooks');
  assert.ok(!/test-webhook-secret|test-postcall-secret|test-token|OMNIDIM_|DB_PASSWORD/.test(html), 'no secrets');
  // links are set by script from the two constants
  assert.match(html, /const CALL_NUMBER = "\+91[6-9]\d{9}";/);
  // WhatsApp removed; the chat box saves through the Worker, which this page's CSP allows
  assert.ok(!/whatsapp|wa\.me|வாட்ஸ்அப்/i.test(html), 'no WhatsApp on /index.html');
  assert.match(html, /id="chatOpen"/);
});

test('patient page: doctor list comes from the database API', async () => {
  const r = await (await fetch(`${base}/api/doctors`)).json();
  assert.deepEqual(r.doctors.map((d) => `${d.name}|${d.qualification}|${d.label.en}`), [
    'Mr. Vijul|MBBS, MS|Orthopaedic', 'Mr. Vishwa|MBBS, MD|Diabetologist', 'Ms. Nivi|MBBS, MS|Heart Specialist',
  ]);
});

test('docs/index.html (GitHub Pages / Vercel copy): chat box present, posts to Worker /webchat, no numbers or secrets', () => {
  const fs = require('fs');
  const path = require('path');
  const html = fs.readFileSync(path.join(__dirname, '..', 'docs', 'index.html'), 'utf8');
  // chat box markup + accessibility
  assert.match(html, /id="chatOpen"[^>]*aria-haspopup="dialog"/);
  assert.match(html, /id="chatPanel" role="dialog" aria-modal="true"/);
  assert.match(html, /id="chatLog" role="log" aria-live="polite"/);
  assert.ok(html.includes('Chat with us') && html.includes('அரட்டை'));
  // posts to the Worker's /webchat route, with the honeypot field
  assert.match(html, /const WEBCHAT_URL = "https:\/\/lakshmi-sheets\.mnivi2021\.workers\.dev\/webchat";/);
  assert.equal((html.match(/WEBCHAT_URL =/g) || []).length, 1, 'one shared setting');
  assert.match(html, /website: honeypot\.value \|\| ''/);
  assert.match(html, /name="website"/);
  // only the chat box saves (text/plain → no CORS preflight)
  assert.match(html, /fetch\(WEBCHAT_URL, \{\s*method: 'POST', headers: \{ 'Content-Type': 'text\/plain;charset=UTF-8' \}/);
  assert.equal((html.match(/fetch\(WEBCHAT_URL/g) || []).length, 1, 'chat box is the only sender');
  // the bottom "Appointment request" form is removed – the chat box replaces it
  assert.ok(!/id="requestForm"|id="request"|id="f-name"|id="f-mobile"|id="f-doctor"|id="f-email"|Send request/.test(html), 'form removed');
  assert.match(html, /<a href="#chat" data-open-chat[^>]*>Chat box<\/a>/, 'menu link opens the chat box');
  assert.match(html, /window\.LMHChat\.open\(label, b\)/, 'doctor cards open the chat with that doctor');
  assert.match(html, /window\.LMH_DOCTORS = doctors\.map/, 'chat reads the page doctor list');
  // no WhatsApp anywhere (buttons, icon, links, labels, notes, text)
  assert.ok(!/wa\.me|api\.whatsapp\.com|whatsapp|வாட்ஸ்அப்/i.test(html), 'no WhatsApp on the page');
  // hero = Call + Chat box (opens the same chat panel); floating chat + call kept
  assert.match(html, /<button type="button" class="round-action" data-open-chat[^>]*aria-controls="chatPanel"/);
  assert.match(html, /<span class="lbl">Chat box<small lang="ta">அரட்டை<\/small><\/span>/);
  assert.match(html, /Tap the phone to call our receptionist, or use the chat box to send a request\./);
  assert.match(html, /class="round-action js-call"/);
  assert.match(html, /id="chatOpen"/);
  assert.match(html, /class="f-call js-call"/);
  // optional email in the chat box, sent in the payload
  assert.match(html, /If you want a confirmation email, please give your email ID\. It’s optional\./);
  assert.match(html, /email: d\.email \|\| ''/);
  assert.match(html, /A copy has been emailed to you/);
  // request number from the Worker reply (LMH1001…) is shown in the final confirmation
  assert.match(html, /j \? done\(j\.request_no\) : failed\(\)/);
  assert.match(html, /\/\^LMH\\d\{4,\}\$\/\.test/);
  assert.match(html, /Your appointment request number: ' \+ no \+ '\. Please keep it\./);
  // A+ larger-text button removed
  assert.ok(!/textSize|class="textsize"|Larger text|lmh_big_text/.test(html), 'A+ button removed');
  assert.ok(!/window\.open/.test(html), 'nothing opens other apps');
  // every inline script still parses
  for (const [, code] of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) assert.doesNotThrow(() => new Function(code));
  // no phone number shown as visible text (108 allowed)
  const visible = html.replace(/<script>[\s\S]*?<\/script>/g, '').replace(/<style>[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ');
  assert.deepEqual(visible.match(/\+?\d[\d\s-]{8,}\d/g) || [], []);
  assert.ok(visible.includes('108'));
  // never a secret: no secret field, no secret names, no long hex tokens
  assert.ok(!/"secret"\s*:|\bsecret\s*:|SHEETS_SECRET|SECRET_FIELD|WA_ACCESS_TOKEN|OMNIDIM_/.test(html), 'no secret field or names');
  assert.deepEqual(html.match(/\b[0-9a-f]{32,}\b/gi) || [], [], 'no long hex tokens');
  assert.ok(!/localStorage\.setItem\([^)]*(patient|mobile|chat)/i.test(html), 'chat data not stored in localStorage');
});
