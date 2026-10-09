/**
 * Lakshmi Multispecialty Hospital – WhatsApp appointment-request chatbot
 * -----------------------------------------------------------------------
 * Same Apps Script project as Code.gs. Runs in Google's cloud, so it works
 * when the hospital PC is off. It collects appointment REQUESTS and saves them
 * to the "Requests" sheet – it never books, never gives an appointment number
 * and never gives medical advice.
 *
 * Script Properties used: WA_ACCESS_TOKEN, WA_PHONE_NUMBER_ID, WA_VERIFY_TOKEN.
 *
 * KNOWN LIMITATION: Apps Script cannot read HTTP headers, so Meta's
 * X-Hub-Signature-256 cannot be verified here. Mitigations: only events for
 * our own WA_PHONE_NUMBER_ID are processed, messages are de-duplicated, and
 * Meta only delivers free-form replies inside the 24-hour customer window.
 */

var WA_API = 'https://graph.facebook.com/v20.0/';
var WA_SESSION_TTL = 7200;   // 2 hours
var WA_DEDUPE_TTL = 21600;   // 6 hours

var WA_DOCTORS = [
  { id: 'doc_vijul', title: 'Mr. Vijul', dept: 'Orthopaedic', match: /vijul|ortho|bone|joint|knee|எலும்பு|விஜுல்|हड्डी/ },
  { id: 'doc_vishwa', title: 'Mr. Vishwa', dept: 'Diabetologist', match: /vishwa|viswa|diabet|sugar|சர்க்கரை|நீரிழிவு|शुगर|मधुमेह/ },
  { id: 'doc_nivi', title: 'Ms. Nivi', dept: 'Heart Specialist', match: /nivi|heart|cardi|இதய|இருதய|दिल|हृदय/ },
  { id: 'doc_unsure', title: 'Not sure', dept: 'Staff will advise', match: /not sure|unsure|don.?t know|தெரியவில்லை|पता नहीं/ },
];

var WA_TXT = {
  greeting: 'Welcome to Lakshmi Multispecialty Hospital, Virudhunagar. 🙏\n' +
    'லட்சுமி மல்டிஸ்பெஷாலிட்டி மருத்துவமனைக்கு வரவேற்கிறோம்.\n\n' +
    'I can take your *appointment request*. Our hospital staff will call you to confirm.\n' +
    'உங்கள் சந்திப்பு கோரிக்கையைப் பெறுகிறேன்; எங்கள் ஊழியர்கள் அழைத்து உறுதிசெய்வார்கள்.\n\n' +
    '🚑 Medical emergency? Call *108* now.',
  askName: 'Please type the *patient\'s full name*.\nநோயாளியின் முழுப் பெயரை அனுப்பவும்.',
  badName: 'Please type the patient\'s full name (letters only).\nசரியான பெயரை அனுப்பவும்.',
  askDoctor: 'Which doctor would you like to see?\nஎந்த மருத்துவரைச் சந்திக்க விரும்புகிறீர்கள்?',
  doctorButton: 'Choose doctor',
  askDate: 'Preferred *date*? You can type: today, tomorrow, Monday, or a date like 15-10 or 15/10/2026.\nவிருப்பமான தேதி?',
  badDate: 'Sorry, I could not understand that date. Please type: today, tomorrow, a day name, or a date like 15-10.\nதேதி புரியவில்லை.',
  pastDate: 'That date has already passed. Please choose today or a later date.\nஅந்த தேதி கடந்துவிட்டது.',
  askTime: 'Preferred *time*? (for example 10:30 AM, or morning / evening)\nType *skip* if any time is fine.\nவிருப்பமான நேரம்? (தேவையில்லை என்றால் skip)',
  askReason: 'Reason for the visit, in a few words? Type *skip* to leave it out.\nவருகைக்கான காரணம்? (தேவையில்லை என்றால் skip)',
  askType: 'Is this a new patient or an existing patient?\nபுதிய நோயாளியா, பழைய நோயாளியா?',
  confirmQ: 'Shall I send this request to the hospital?\nஇந்த கோரிக்கையை அனுப்பலாமா?',
  saved: 'Thank you. Your request is noted. Our hospital staff will call you to confirm your appointment.\nநன்றி. உங்கள் கோரிக்கை பதிவுசெய்யப்பட்டது. எங்கள் ஊழியர்கள் அழைத்து உறுதிசெய்வார்கள்.',
  changing: 'No problem, let\'s update the details.\nசரி, விவரங்களை மாற்றலாம்.',
  callback: 'Thank you. Our hospital staff will call you back soon.\nநன்றி. எங்கள் ஊழியர்கள் விரைவில் உங்களை அழைப்பார்கள்.',
  emergency: 'Please call 108 or go to the nearest emergency department now.\nஉடனே 108 ஐ அழைக்கவும் அல்லது அருகிலுள்ள அவசர சிகிச்சைப் பிரிவுக்குச் செல்லவும்.',
  noAdvice: 'I can only take appointment requests. I can\'t give medical advice – please consult a doctor.\nமருத்துவ ஆலோசனை வழங்க இயலாது.',
  typeText: 'Please reply with a text message.\nதயவுசெய்து எழுத்தில் பதிலளிக்கவும்.',
  saveFailed: 'Sorry, I could not save your request just now. Please try again in a minute.\nமன்னிக்கவும், மீண்டும் முயற்சிக்கவும்.',
};

var RESTART_RE = /^(hi|hii|hello|hey|menu|start|vanakkam|வணக்கம்|नमस्ते|namaste)[\s!.]*$/i;
var CALLBACK_RE = /\bstaff\b|call me|callback|call back|அழைக்கவும்|कॉल करो|कॉल करें/i;
var EMERGENCY_RE = /chest pain|accident|unconscious|bleeding|breathing problem|can'?t breathe|not breathing|heart attack|நெஞ்சு வலி|விபத்து|மயக்க|இரத்தப்போக்கு|மூச்சு|सीने में दर्द|दुर्घटना|बेहोश|खून|सांस/i;
var ADVICE_RE = /which (tablet|medicine)|what (tablet|medicine)|medicine for|tablet for|dosage|how much (tablet|medicine)|மாத்திரை|மருந்து என்ன|कौन सी दवा|दवा बताओ/i;
var SKIP_RE = /^(skip|no|none|nil|-|na|n\/a|any|anytime|any time|தேவையில்லை|नहीं|कोई भी)$/i;

// ---------------------------------------------------------------- webhook entry

/** Called by doPost (Code.gs) for every Meta webhook. Never throws to Meta. */
function handleWhatsApp(body) {
  var ownId = prop_('WA_PHONE_NUMBER_ID');
  var entries = body.entry || [];
  for (var i = 0; i < entries.length; i++) {
    var changes = (entries[i] && entries[i].changes) || [];
    for (var j = 0; j < changes.length; j++) {
      var value = (changes[j] && changes[j].value) || {};
      if (!value.messages) continue; // delivery/read status updates are ignored
      var pid = value.metadata && value.metadata.phone_number_id;
      if (!ownId || String(pid) !== String(ownId)) {
        logWaError_('handleWhatsApp', 'Ignored event for another/unknown phone_number_id', String(pid || ''));
        continue;
      }
      var profileName = (value.contacts && value.contacts[0] && value.contacts[0].profile && value.contacts[0].profile.name) || '';
      for (var k = 0; k < value.messages.length; k++) {
        try {
          processWaMessage_(value.messages[k], profileName);
        } catch (err) {
          logWaError_('processWaMessage_', err, value.messages[k] && value.messages[k].id);
        }
      }
    }
  }
}

function processWaMessage_(msg, profileName) {
  if (!msg || !msg.from || !msg.id) return;
  var cache = CacheService.getScriptCache();
  var seenKey = 'wa:msg:' + msg.id;
  if (cache.get(seenKey)) return; // Meta retry / duplicate delivery
  cache.put(seenKey, '1', WA_DEDUPE_TTL);

  var from = String(msg.from).replace(/\D/g, '');
  var input = readWaInput_(msg);
  var s = loadWaSession_(from);
  if (input.text) s.lang = detectLang_(input.text) || s.lang || 'English';

  // Media, location, stickers … → ask for text (keep the current step).
  if (!input.text && !input.id) {
    sendWaText_(from, WA_TXT.typeText);
    return;
  }
  var lower = String(input.text || '').trim().toLowerCase();

  // 1. Emergencies always come first.
  if (EMERGENCY_RE.test(lower)) {
    sendWaText_(from, WA_TXT.emergency);
    return;
  }
  // 2. Restart words.
  if (!input.id && RESTART_RE.test(lower)) {
    startWaConversation_(from, s);
    return;
  }
  // 3. "staff" / "call me" → callback request.
  if (!input.id && CALLBACK_RE.test(lower)) {
    var d = s.data || {};
    var ok = saveWaRequest_(from, msg.id, {
      name: d.name || profileName, doctor: d.doctor, date: d.datePretty, time: d.time,
      reason: 'Callback requested', type: d.type, lang: s.lang,
    });
    sendWaText_(from, ok ? WA_TXT.callback : WA_TXT.saveFailed);
    if (ok) clearWaSession_(from);
    return;
  }
  // 4. Never give medical advice.
  if (!input.id && ADVICE_RE.test(lower)) {
    sendWaText_(from, WA_TXT.noAdvice);
    if (s.step && s.step !== 'done') promptWaStep_(from, s);
    return;
  }

  if (!s.step || s.step === 'done') {
    startWaConversation_(from, s);
    return;
  }
  handleWaStep_(from, msg.id, s, input);
}

function readWaInput_(msg) {
  if (msg.type === 'text' && msg.text) return { text: String(msg.text.body || '').slice(0, 500), id: '' };
  if (msg.type === 'interactive' && msg.interactive) {
    var r = msg.interactive.button_reply || msg.interactive.list_reply || {};
    return { text: String(r.title || ''), id: String(r.id || '') };
  }
  if (msg.type === 'button' && msg.button) return { text: String(msg.button.text || ''), id: String(msg.button.payload || '') };
  return { text: '', id: '' };
}

// ---------------------------------------------------------------- conversation

function startWaConversation_(from, s) {
  s.step = 'name';
  s.data = {};
  saveWaSession_(from, s);
  sendWaText_(from, WA_TXT.greeting);
  sendWaText_(from, WA_TXT.askName);
}

function handleWaStep_(from, msgId, s, input) {
  var d = s.data || (s.data = {});
  var text = String(input.text || '').trim();

  switch (s.step) {
    case 'name': {
      var name = text.replace(/\s+/g, ' ');
      if (name.length < 2 || name.length > 80 || !/^[\p{L}\p{M} .'-]+$/u.test(name)) { sendWaText_(from, WA_TXT.badName); return; }
      d.name = name;
      s.step = 'doctor';
      break;
    }
    case 'doctor': {
      var doc = matchDoctor_(input);
      if (!doc) { promptWaStep_(from, s); return; }
      d.doctor = doc.id === 'doc_unsure' ? 'Not sure – staff to advise' : doc.title + ' – ' + doc.dept;
      s.step = 'date';
      break;
    }
    case 'date': {
      var pd = parseWaDate_(text);
      if (pd.error === 'past') { sendWaText_(from, WA_TXT.pastDate); return; }
      if (pd.error) { sendWaText_(from, WA_TXT.badDate); return; }
      d.date = pd.iso;
      d.datePretty = pd.pretty;
      s.step = 'time';
      break;
    }
    case 'time': {
      d.time = SKIP_RE.test(text) || !text ? 'Any time' : text.slice(0, 40);
      s.step = 'reason';
      break;
    }
    case 'reason': {
      d.reason = SKIP_RE.test(text) || !text ? '' : text.slice(0, 200);
      s.step = 'type';
      break;
    }
    case 'type': {
      var t = input.id === 'pt_new' ? 'New' : input.id === 'pt_existing' ? 'Existing' : patientType_(text);
      if (t !== 'New' && t !== 'Existing') { promptWaStep_(from, s); return; }
      d.type = t;
      s.step = 'confirm';
      break;
    }
    case 'confirm': {
      if (input.id === 'cf_change' || /^change|^edit|மாற்ற|बदल/i.test(text)) {
        sendWaText_(from, WA_TXT.changing);
        s.step = 'name';
        s.data = {};
        break;
      }
      if (input.id === 'cf_confirm' || /^(confirm|yes|ok|send|ஆம்|சரி|हाँ|हां|haan)/i.test(text)) {
        var ok = saveWaRequest_(from, msgId, { name: d.name, doctor: d.doctor, date: d.datePretty, time: d.time,
          reason: d.reason, type: d.type, lang: s.lang });
        sendWaText_(from, ok ? WA_TXT.saved : WA_TXT.saveFailed);
        if (ok) { clearWaSession_(from); return; }
        return; // keep the session so they can try "Confirm" again
      }
      break; // anything else → show the summary again
    }
    default:
      s.step = 'name';
  }
  saveWaSession_(from, s);
  promptWaStep_(from, s);
}

function promptWaStep_(from, s) {
  var d = s.data || {};
  switch (s.step) {
    case 'name': return sendWaText_(from, WA_TXT.askName);
    case 'doctor':
      return sendWaList_(from, WA_TXT.askDoctor, WA_TXT.doctorButton, WA_DOCTORS.map(function (x) {
        return { id: x.id, title: x.title, description: x.dept };
      }));
    case 'date': return sendWaText_(from, WA_TXT.askDate);
    case 'time': return sendWaText_(from, WA_TXT.askTime);
    case 'reason': return sendWaText_(from, WA_TXT.askReason);
    case 'type': return sendWaButtons_(from, WA_TXT.askType, [{ id: 'pt_new', title: 'New patient' }, { id: 'pt_existing', title: 'Existing patient' }]);
    case 'confirm':
      return sendWaButtons_(from,
        'Please check your request:\n' +
        '👤 Patient: ' + d.name + '\n' +
        '🩺 Doctor: ' + d.doctor + '\n' +
        '📅 Date: ' + d.datePretty + '\n' +
        '🕒 Time: ' + (d.time || 'Any time') + '\n' +
        '📝 Reason: ' + (d.reason || '–') + '\n' +
        '🏷️ ' + (d.type === 'Existing' ? 'Existing patient' : 'New patient') + '\n\n' +
        'This is a request, not a confirmed appointment.\n\n' + WA_TXT.confirmQ,
        [{ id: 'cf_confirm', title: 'Confirm' }, { id: 'cf_change', title: 'Change' }]);
    default: return null;
  }
}

function matchDoctor_(input) {
  for (var i = 0; i < WA_DOCTORS.length; i++) if (input.id === WA_DOCTORS[i].id) return WA_DOCTORS[i];
  var t = String(input.text || '').trim().toLowerCase();
  if (/^[1-4]$/.test(t)) return WA_DOCTORS[Number(t) - 1];
  for (var j = 0; j < WA_DOCTORS.length; j++) if (WA_DOCTORS[j].match.test(t)) return WA_DOCTORS[j];
  return null;
}

function detectLang_(text) {
  if (/[஀-௿]/.test(text)) return 'Tamil';
  if (/[ऀ-ॿ]/.test(text)) return 'Hindi';
  return '';
}

// ---------------------------------------------------------------- dates (Asia/Kolkata)

var WA_DAY_NAMES = [
  ['sunday', 'sun', 'ஞாயிறு', 'रविवार'], ['monday', 'mon', 'திங்கள்', 'सोमवार'], ['tuesday', 'tue', 'tues', 'செவ்வாய்', 'मंगलवार'],
  ['wednesday', 'wed', 'புதன்', 'बुधवार'], ['thursday', 'thu', 'thur', 'thurs', 'வியாழன்', 'गुरुवार'],
  ['friday', 'fri', 'வெள்ளி', 'शुक्रवार'], ['saturday', 'sat', 'சனி', 'शनिवार'],
];
var WA_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
var WA_DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Returns {iso, pretty} or {error:'invalid'|'past'}; "today or later" in Asia/Kolkata. */
function parseWaDate_(input) {
  var s = String(input || '').trim().toLowerCase();
  var p = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd').split('-');
  var today = Date.UTC(+p[0], +p[1] - 1, +p[2]);
  var DAY = 86400000;
  var target = null;

  if (/day after tomorrow|நாளை மறுநாள்|parso|परसों/.test(s)) target = today + 2 * DAY;
  else if (/^(tomorrow|tmrw|tom|நாளை|நாளைக்கு|kal|कल)\b/.test(s) || /tomorrow|நாளை/.test(s)) target = today + DAY;
  else if (/^(today|இன்று|இன்னைக்கு|aaj|आज)/.test(s) || /\btoday\b/.test(s)) target = today;
  else {
    var m = s.match(/^(\d{1,2})[-\/.](\d{1,2})(?:[-\/.](\d{2,4}))?$/);
    if (m) {
      var dd = +m[1], mm = +m[2];
      var yy = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : +p[0];
      var t = Date.UTC(yy, mm - 1, dd);
      var chk = new Date(t);
      if (mm < 1 || mm > 12 || chk.getUTCDate() !== dd || chk.getUTCMonth() !== mm - 1) return { error: 'invalid' };
      if (!m[3] && t < today) t = Date.UTC(yy + 1, mm - 1, dd); // "15-03" already passed → next year
      target = t;
    } else {
      var todayDow = new Date(today).getUTCDay();
      for (var dow = 0; dow < 7 && target === null; dow++) {
        var names = WA_DAY_NAMES[dow];
        for (var n = 0; n < names.length; n++) {
          if (s === names[n] || s.indexOf(names[n]) === 0 || s.indexOf(' ' + names[n]) >= 0) {
            target = today + ((dow - todayDow + 7) % 7) * DAY; // today counts if it's that day
            break;
          }
        }
      }
    }
  }
  if (target === null) return { error: 'invalid' };
  if (target < today) return { error: 'past' };
  var dt = new Date(target);
  var iso = dt.getUTCFullYear() + '-' + ('0' + (dt.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + dt.getUTCDate()).slice(-2);
  return { iso: iso, pretty: WA_DOW[dt.getUTCDay()] + ', ' + dt.getUTCDate() + ' ' + WA_MONTHS[dt.getUTCMonth()] + ' ' + dt.getUTCFullYear() };
}

// ---------------------------------------------------------------- saving

function saveWaRequest_(from, msgId, d) {
  return withLock_(function () {
    appendRequest_(SpreadsheetApp.getActiveSpreadsheet(), {
      patient_name: d.name || '', mobile: String(from).slice(-10), doctor: d.doctor || '',
      preferred_date: d.date || '', preferred_time: d.time || '', reason: d.reason || '',
      patient_type: d.type || '', language: d.lang || '', from_number: '+' + from, message_id: msgId,
      source: 'WhatsApp', status: 'New',
    });
    return true;
  }, false);
}

// ---------------------------------------------------------------- sessions (cache 2 h + "WA Sessions" backup)

function loadWaSession_(from) {
  var cached = CacheService.getScriptCache().get('wa:s:' + from);
  if (cached) { try { return JSON.parse(cached); } catch (e) { /* fall through */ } }
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(WA_SESSIONS_SHEET);
    if (sheet) {
      var rows = sheet.getDataRange().getValues();
      for (var i = 1; i < rows.length; i++) {
        if (String(rows[i][0]) === from) {
          var updated = Date.parse(rows[i][3]);
          if (updated && Date.now() - updated < WA_SESSION_TTL * 1000) {
            return { step: String(rows[i][1] || ''), data: JSON.parse(rows[i][2] || '{}') };
          }
          break;
        }
      }
    }
  } catch (e) { /* no backup → new session */ }
  return { step: '', data: {} };
}

function saveWaSession_(from, s) {
  var json = JSON.stringify({ step: s.step, data: s.data || {}, lang: s.lang || '' });
  CacheService.getScriptCache().put('wa:s:' + from, json, WA_SESSION_TTL);
  withLock_(function () {
    var sheet = ensureSheet_(SpreadsheetApp.getActiveSpreadsheet(), WA_SESSIONS_SHEET, WA_SESSIONS_HEADERS);
    var rows = sheet.getDataRange().getValues();
    var values = [[from, s.step, JSON.stringify(s.data || {}), new Date().toISOString()]];
    for (var i = 1; i < rows.length; i++) {
      if (String(rows[i][0]) === from) { sheet.getRange(i + 1, 1, 1, 4).setValues(values); return true; }
    }
    sheet.appendRow(values[0]);
    return true;
  }, false);
}

function clearWaSession_(from) {
  saveWaSession_(from, { step: 'done', data: {} });
}

function withLock_(fn, fallback) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (e) { logWaError_('lock', 'Lock timeout', ''); return fallback; }
  try { return fn(); } catch (e) { logWaError_('sheet write', e, ''); return fallback; } finally { lock.releaseLock(); }
}

// ---------------------------------------------------------------- sending (WhatsApp Cloud API)

function sendWaText_(to, body) {
  return sendWa_(to, { type: 'text', text: { preview_url: false, body: body } });
}

function sendWaButtons_(to, body, buttons) {
  return sendWa_(to, {
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: body },
      action: { buttons: buttons.slice(0, 3).map(function (b) { return { type: 'reply', reply: { id: b.id, title: b.title.slice(0, 20) } }; }) },
    },
  });
}

function sendWaList_(to, body, buttonText, rows) {
  return sendWa_(to, {
    type: 'interactive',
    interactive: {
      type: 'list',
      body: { text: body },
      action: {
        button: buttonText.slice(0, 20),
        sections: [{ title: 'Doctors', rows: rows.map(function (r) { return { id: r.id, title: r.title.slice(0, 24), description: (r.description || '').slice(0, 72) }; }) }],
      },
    },
  });
}

function sendWa_(to, message) {
  var token = prop_('WA_ACCESS_TOKEN');
  var phoneId = prop_('WA_PHONE_NUMBER_ID');
  if (!token || !phoneId) { logWaError_('send', 'WhatsApp not configured (WA_ACCESS_TOKEN / WA_PHONE_NUMBER_ID)', maskNo_(to)); return false; }
  var payload = { messaging_product: 'whatsapp', recipient_type: 'individual', to: String(to) };
  for (var k in message) if (Object.prototype.hasOwnProperty.call(message, k)) payload[k] = message[k];
  try {
    var res = UrlFetchApp.fetch(WA_API + encodeURIComponent(phoneId) + '/messages', {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: { Authorization: 'Bearer ' + token }, payload: JSON.stringify(payload),
    });
    var code = res.getResponseCode();
    if (code >= 200 && code < 300) return true;
    var detail = '';
    try { var j = JSON.parse(res.getContentText()); detail = (j.error && (j.error.message + ' (code ' + j.error.code + ')')) || ''; } catch (e) { detail = String(res.getContentText()).slice(0, 300); }
    logWaError_('send ' + message.type, 'HTTP ' + code + ' ' + detail, maskNo_(to));
    return false;
  } catch (err) {
    logWaError_('send ' + message.type, err, maskNo_(to));
    return false;
  }
}

function maskNo_(n) {
  var s = String(n || '');
  return s.length > 4 ? 'XXXXXX' + s.slice(-4) : s;
}

/** Writes to "WA Errors". Never throws. Never logs the access token. */
function logWaError_(where, err, details) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ensureSheet_(ss, WA_ERRORS_SHEET, WA_ERRORS_HEADERS);
    var msg = (err && err.message) ? err.message : String(err);
    var token = prop_('WA_ACCESS_TOKEN');
    if (token) msg = msg.split(token).join('[token]');
    sheet.appendRow([now_(), text_(where), text_(msg), text_(details || '')]);
  } catch (e) {
    try { console.error(where, err); } catch (ignore) { /* nothing more we can do */ }
  }
}
