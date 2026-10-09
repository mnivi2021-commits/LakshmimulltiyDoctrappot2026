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
  'Reason', 'New/Existing', 'Language', 'Caller number', 'Call/Message ID', 'Source', 'Status'];

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
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (String(pick_(body, ['type']) || '').toLowerCase() === 'request') {
      appendRequest_(ss, body);
      return json_({ success: true, say: THANK_YOU });
    }
    appendCallLog_(ss, body);
    return json_({ success: true });
  } catch (err) {
    console.error(err);
    return json_({ success: false, message: 'Could not save' });
  } finally {
    lock.releaseLock();
  }
}

// ---------------------------------------------------------------- writers

/** Appends one row to "Requests". Caller must hold the script lock. */
function appendRequest_(ss, b) {
  var sheet = ensureSheet_(ss, REQUEST_SHEET, REQUEST_HEADERS);
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
  ]);
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
