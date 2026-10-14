/**
 * Lakshmi Multispecialty Hospital – always-on Google Cloud layer
 * ----------------------------------------------------------------
 * Runs in Google Apps Script (Google's cloud), so it keeps working when the
 * hospital PC (Node backend + XAMPP MySQL + cloudflared) is switched off.
 *
 *   POST {"object":"whatsapp_business_account", …}  → WhatsApp chatbot (WhatsApp.gs)
 *   POST {"type":"request", …}                      → row in "Requests"
 *   POST anything else (OmniDimension post-call)    → row in "Call Log"
 *   GET  ?hub.mode=subscribe&hub.verify_token=…      → Meta webhook verification
 *   GET  (anything else)                            → {"ok":true}
 *
 * Security: Apps Script cannot read HTTP headers, so OmniDimension / backend
 * requests must carry the secret as "secret" in the JSON body or ?key= in the
 * URL, matching Script Property SHEETS_SECRET. WhatsApp requests are
 * identified by their Meta payload (see WhatsApp.gs for the limits of that).
 * No secret is written in this file – all live in Script Properties.
 */

var TZ = 'Asia/Kolkata';
var MAX_CELL = 45000; // Google Sheets allows 50,000 characters per cell

var REQUEST_SHEET = 'Requests';
var REQUEST_HEADERS = ['Timestamp', 'Patient name', 'Mobile', 'Doctor wanted', 'Preferred date', 'Preferred time',
  'Reason', 'New/Existing', 'Language', 'Caller number', 'Call/Message ID', 'Source', 'Status', 'Email', 'Request No'];

var CALL_SHEET = 'Call Log';
var CALL_HEADERS = ['Timestamp', 'Caller number', 'Call ID', 'Duration', 'Summary', 'Outcome', 'Transcript', 'Raw JSON'];

var WA_SESSIONS_SHEET = 'WA Sessions';
var WA_SESSIONS_HEADERS = ['WhatsApp number', 'Step', 'Data (JSON)', 'Updated'];

var WA_ERRORS_SHEET = 'WA Errors';
var WA_ERRORS_HEADERS = ['Timestamp', 'Where', 'Error', 'Details'];

var THANK_YOU = 'Thank you. I have noted your details. Our hospital staff will call you back to confirm your appointment.';

// ---------------------------------------------------------------- entry points

function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p['hub.mode'] === 'subscribe') {
    var expected = prop_('WA_VERIFY_TOKEN');
    if (expected && p['hub.verify_token'] && safeEqual_(String(p['hub.verify_token']), String(expected))) {
      return ContentService.createTextOutput(String(p['hub.challenge'] || '')).setMimeType(ContentService.MimeType.TEXT);
    }
    return ContentService.createTextOutput('Forbidden').setMimeType(ContentService.MimeType.TEXT);
  }
  return json_({ ok: true });
}

function doPost(e) {
  var body;
  try {
    body = parseBody_(e);
  } catch (err) {
    return json_({ success: false, message: 'Invalid JSON' });
  }

  // WhatsApp Cloud API webhook (no secret possible – identified by payload).
  if (body && body.object === 'whatsapp_business_account') {
    try {
      handleWhatsApp(body);
    } catch (err) {
      try { logWaError_('doPost', err, ''); } catch (ignore) { /* never crash */ }
    }
    return json_({ ok: true }); // always 200 so Meta does not keep retrying
  }

  if (!isAuthorised_(body, e)) return json_({ success: false });

  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000); // one writer at a time
  } catch (err) {
    return json_({ success: false, message: 'Busy, please retry' });
  }
  var result;
  var mailFor = null;
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (String(pick_(body, ['type']) || '').toLowerCase() === 'request') {
      var requestNo = appendRequest_(ss, body);
      if (shouldEmail_(body)) mailFor = Object.assign({}, body, { request_no: requestNo });
      result = { success: true, say: THANK_YOU, request_no: requestNo };
    } else {
      appendCallLog_(ss, body);
      result = { success: true };
    }
  } catch (err) {
    console.error(err);
    result = { success: false, message: 'Could not save' };
  } finally {
    lock.releaseLock();
  }
  // Outside the lock: a slow or failing email never blocks other saves,
  // and never changes the "saved" answer.
  if (mailFor) sendRequestEmail_(mailFor);
  return json_(result);
}

// ---------------------------------------------------------------- writers

/**
 * Next request number: LMH1001, LMH1002, … Stored in Script Property
 * REQUEST_COUNTER. Caller must hold the script lock, so two requests can
 * never get the same number.
 */
function nextRequestNo_() {
  var props = PropertiesService.getScriptProperties();
  var n = parseInt(props.getProperty('REQUEST_COUNTER') || '1000', 10);
  if (!isFinite(n) || n < 1000) n = 1000;
  n += 1;
  props.setProperty('REQUEST_COUNTER', String(n));
  return 'LMH' + n;
}

/** Appends one row to "Requests" and returns its request number. Caller must hold the script lock. */
function appendRequest_(ss, b) {
  var sheet = ensureSheet_(ss, REQUEST_SHEET, REQUEST_HEADERS);
  var requestNo = nextRequestNo_();
  sheet.appendRow([
    now_(),
    text_(pick_(b, ['patient_name', 'name', 'caller_name'])),
    text_(mobile_(pick_(b, ['mobile', 'phone', 'mobile_number', 'phone_number']))),
    text_(pick_(b, ['doctor', 'doctor_wanted', 'department', 'specialist'])),
    text_(pick_(b, ['preferred_date', 'appointment_date', 'date'])),
    text_(pick_(b, ['preferred_time', 'appointment_time', 'time', 'session'])),
    text_(pick_(b, ['reason', 'reason_for_visit'])),
    text_(patientType_(pick_(b, ['patient_type', 'new_or_existing']))),
    text_(pick_(b, ['language', 'call_language'])),
    text_(pick_(b, ['from_number', 'caller_number', 'caller_mobile', 'customer_number'])),
    text_(pick_(b, ['call_sid', 'call_id', 'callId', 'message_id'])),
    text_(pick_(b, ['source']) || 'AI call – system offline'),
    text_(pick_(b, ['status']) || 'New'),
    text_(validEmail_(pick_(b, ['email', 'patient_email']))),
    requestNo,
  ]);
  return requestNo;
}

// ---------------------------------------------------------------- confirmation email (Website chat)

/** Returns the email if it looks valid, otherwise ''. */
function validEmail_(v) {
  var e = String(v || '').trim();
  return (e.length <= 120 && /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[A-Za-z]{2,}$/.test(e)) ? e : '';
}

function shouldEmail_(b) {
  return String(pick_(b, ['source']) || '') === 'Website chat' && validEmail_(pick_(b, ['email', 'patient_email'])) !== '';
}

function escHtml_(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

/** Sends the "request received" email (English + Tamil). Never throws. */
function sendRequestEmail_(b) {
  try {
    var to = validEmail_(pick_(b, ['email', 'patient_email']));
    if (!to) return false;
    var d = {
      name: String(pick_(b, ['patient_name', 'name']) || '').slice(0, 80),
      doctor: String(pick_(b, ['doctor']) || '').slice(0, 120),
      date: String(pick_(b, ['preferred_date', 'appointment_date', 'date']) || '').slice(0, 40),
      time: String(pick_(b, ['preferred_time', 'appointment_time', 'time']) || '').slice(0, 40),
      mobile: mobile_(pick_(b, ['mobile', 'phone'])),
      no: String(b.request_no || ''),
    };
    var timeTa = d.time === 'Morning' ? 'காலை' : d.time === 'Evening' ? 'மாலை' : d.time;
    var subject = 'Appointment request ' + d.no + ' received – Lakshmi Multispecialty Hospital';
    var plain = [
      'Lakshmi Multispecialty Hospital, Virudhunagar',
      '',
      'Dear ' + d.name + ',',
      'We have received your appointment request.',
      '',
      'Appointment request number: ' + d.no,
      'Patient: ' + d.name,
      'Doctor: ' + d.doctor,
      'Preferred date: ' + d.date,
      'Preferred time: ' + d.time,
      '',
      'This is a request, not a confirmed booking. Our staff will call you on ' + d.mobile + ' to confirm.',
      '',
      '----',
      'லட்சுமி மல்டிஸ்பெஷாலிட்டி மருத்துவமனை, விருதுநகர்',
      'உங்கள் சந்திப்பு கோரிக்கை எங்களுக்குக் கிடைத்தது.',
      'சந்திப்பு கோரிக்கை எண்: ' + d.no,
      'நோயாளி: ' + d.name,
      'மருத்துவர்: ' + d.doctor,
      'தேதி: ' + d.date,
      'நேரம்: ' + timeTa,
      'இது கோரிக்கை மட்டுமே; உறுதிசெய்யப்பட்ட முன்பதிவு அல்ல. உறுதிசெய்ய எங்கள் ஊழியர்கள் உங்களை ' + d.mobile + ' எண்ணில் அழைப்பார்கள்.',
      '',
      'Medical emergency? Call 108. / அவசர நிலையில் 108 ஐ அழைக்கவும்.',
    ].join('\n');
    var row = function (k, v) { return '<tr><td style="padding:4px 12px 4px 0;color:#4c5e5b">' + escHtml_(k) + '</td><td style="padding:4px 0;font-weight:bold">' + escHtml_(v) + '</td></tr>'; };
    var html =
      '<div style="font-family:Arial,sans-serif;font-size:15px;color:#1c2b29;max-width:560px">' +
      '<h2 style="color:#0F4C45;margin:0 0 4px">Lakshmi Multispecialty Hospital</h2>' +
      '<div style="color:#4c5e5b;margin-bottom:16px">Virudhunagar, Tamil Nadu</div>' +
      '<p>Dear ' + escHtml_(d.name) + ',<br>We have received your appointment request.</p>' +
      '<table style="border-collapse:collapse;margin:8px 0 16px">' +
      row('Request number', d.no) + row('Patient', d.name) + row('Doctor', d.doctor) + row('Preferred date', d.date) + row('Preferred time', d.time) +
      '</table>' +
      '<p style="background:#fff8e6;border:1px solid #f0cf7a;border-radius:8px;padding:10px 12px"><b>This is a request, not a confirmed booking.</b> Our staff will call you on <b>' + escHtml_(d.mobile) + '</b> to confirm.</p>' +
      '<hr style="border:0;border-top:1px solid #d6e3df;margin:20px 0">' +
      '<div lang="ta">' +
      '<h3 style="color:#0F4C45;margin:0 0 8px">லட்சுமி மல்டிஸ்பெஷாலிட்டி மருத்துவமனை</h3>' +
      '<p>உங்கள் சந்திப்பு கோரிக்கை எங்களுக்குக் கிடைத்தது.</p>' +
      '<table style="border-collapse:collapse;margin:8px 0 16px">' +
      row('கோரிக்கை எண்', d.no) + row('நோயாளி', d.name) + row('மருத்துவர்', d.doctor) + row('தேதி', d.date) + row('நேரம்', timeTa) +
      '</table>' +
      '<p>இது கோரிக்கை மட்டுமே; உறுதிசெய்யப்பட்ட முன்பதிவு அல்ல. உறுதிசெய்ய எங்கள் ஊழியர்கள் உங்களை <b>' + escHtml_(d.mobile) + '</b> எண்ணில் அழைப்பார்கள்.</p>' +
      '</div>' +
      '<p style="color:#b3261e;font-weight:bold">Medical emergency? Call 108. / அவசர நிலையில் 108 ஐ அழைக்கவும்.</p>' +
      '</div>';
    MailApp.sendEmail({ to: to, subject: subject, body: plain, htmlBody: html, name: 'Lakshmi Multispecialty Hospital' });
    return true;
  } catch (err) {
    logError_('email', err, '');
    return false;
  }
}

/** Writes to the "WA Errors" sheet from Code.gs (works even without WhatsApp.gs). Never throws. */
function logError_(where, err, details) {
  try {
    var lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      var sheet = ensureSheet_(SpreadsheetApp.getActiveSpreadsheet(), WA_ERRORS_SHEET, WA_ERRORS_HEADERS);
      sheet.appendRow([now_(), text_(where), text_((err && err.message) ? err.message : String(err)), text_(details || '')]);
    } finally {
      lock.releaseLock();
    }
  } catch (e) {
    try { console.error(where, err); } catch (ignore) { /* nothing more we can do */ }
  }
}

function appendCallLog_(ss, b) {
  var sheet = ensureSheet_(ss, CALL_SHEET, CALL_HEADERS);
  var report = (b.call_report && typeof b.call_report === 'object') ? b.call_report : {};
  var transcript = pick_(report, ['full_conversation', 'transcript', 'conversation']) ||
    pick_(b, ['full_conversation', 'transcript', 'conversation']) ||
    interactionsText_(report.interactions || b.interactions);

  sheet.appendRow([
    now_(),
    text_(pick_(b, ['from_number', 'caller_number', 'phone_number', 'customer_number', 'from', 'caller'])),
    text_(pick_(b, ['call_sid', 'call_id', 'callId', 'id'])),
    text_(pick_(b, ['duration', 'call_duration', 'call_duration_seconds', 'duration_seconds']) ||
      pick_(report, ['duration', 'call_duration'])),
    text_(pick_(report, ['summary', 'call_summary']) || pick_(b, ['summary', 'call_summary'])),
    text_(pick_(report, ['disposition', 'outcome', 'call_outcome']) ||
      pick_(b, ['disposition', 'outcome', 'call_outcome', 'call_status', 'status'])),
    text_(stringify_(transcript)),
    text_(JSON.stringify(copyWithoutSecret_(b))),
  ]);
}

// ---------------------------------------------------------------- helpers

function prop_(name) {
  return PropertiesService.getScriptProperties().getProperty(name);
}

function parseBody_(e) {
  var raw = e && e.postData && e.postData.contents;
  if (!raw) return {};
  var o = JSON.parse(raw);
  return (o && typeof o === 'object' && !Array.isArray(o)) ? o : { value: o };
}

function isAuthorised_(body, e) {
  var expected = prop_('SHEETS_SECRET');
  if (!expected) return false; // not configured → refuse everything
  var given = (body && body.secret) || (e && e.parameter && e.parameter.key) || '';
  return safeEqual_(String(given), String(expected));
}

function safeEqual_(a, b) {
  if (a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** First non-empty value among several possible keys (also looks inside extracted_variables / parameters). */
function pick_(obj, keys) {
  if (!obj || typeof obj !== 'object') return '';
  var sources = [obj];
  var report = obj.call_report;
  if (report && typeof report === 'object' && report.extracted_variables && typeof report.extracted_variables === 'object') {
    sources.push(report.extracted_variables);
  }
  if (obj.extracted_variables && typeof obj.extracted_variables === 'object') sources.push(obj.extracted_variables);
  if (obj.parameters && typeof obj.parameters === 'object') sources.push(obj.parameters);
  for (var s = 0; s < sources.length; s++) {
    for (var k = 0; k < keys.length; k++) {
      var v = sources[s][keys[k]];
      if (v !== undefined && v !== null && v !== '') return v;
    }
  }
  return '';
}

function interactionsText_(list) {
  if (!list || !list.length) return '';
  var lines = [];
  for (var i = 0; i < list.length; i++) {
    var it = list[i] || {};
    var who = it.role || it.speaker || it.user_type || '';
    var said = it.text || it.content || it.message || it.bot_response || it.user_query || '';
    if (said) lines.push((who ? who + ': ' : '') + said);
  }
  return lines.join('\n');
}

function stringify_(v) {
  if (v === null || v === undefined) return '';
  return typeof v === 'string' ? v : JSON.stringify(v);
}

/** Cell-safe text: truncated, and never interpreted as a formula. */
function text_(v) {
  var s = stringify_(v);
  if (s.length > MAX_CELL) s = s.slice(0, MAX_CELL) + ' …[truncated]';
  if (/^[=+\-@]/.test(s)) s = "'" + s; // block formula injection from callers' words
  return s;
}

function mobile_(v) {
  var d = String(v || '').replace(/\D/g, '');
  if (d.length === 12 && d.indexOf('91') === 0) d = d.slice(2);
  if (d.length === 11 && d.charAt(0) === '0') d = d.slice(1);
  return d || String(v || '');
}

function patientType_(v) {
  var s = String(v || '').toLowerCase();
  if (/exist|old|before|return|பழைய|पुराना/.test(s)) return 'Existing';
  if (/new|first|புதிய|नया/.test(s)) return 'New';
  return String(v || '');
}

function copyWithoutSecret_(b) {
  var out = {};
  for (var k in b) if (Object.prototype.hasOwnProperty.call(b, k) && k !== 'secret') out[k] = b[k];
  return out;
}

function ensureSheet_(ss, name, headers) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sheet.setFrozenRows(1);
  } else if (sheet.getLastColumn() < headers.length) {
    // New columns are only ever appended at the end, so existing data never shifts.
    var have = sheet.getLastColumn();
    sheet.getRange(1, have + 1, 1, headers.length - have).setValues([headers.slice(have)]).setFontWeight('bold');
  }
  return sheet;
}

/** Creates all four sheets at once (optional: run once from the editor). */
function setupSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ensureSheet_(ss, REQUEST_SHEET, REQUEST_HEADERS);
  ensureSheet_(ss, CALL_SHEET, CALL_HEADERS);
  ensureSheet_(ss, WA_SESSIONS_SHEET, WA_SESSIONS_HEADERS);
  ensureSheet_(ss, WA_ERRORS_SHEET, WA_ERRORS_HEADERS);
}

function now_() {
  return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm:ss');
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
