'use strict';
// AI Chat Receptionist — a server-side conversation engine that uses the SAME
// availability and booking service as the website form and the OmniDimension
// voice agent. Every slot it shows comes from the database; it never invents
// doctors, slots, policies or confirmations.
//
// Conversation state travels as an HMAC-signed token, so a client cannot fake
// "verified" ownership of someone else's appointment.
const crypto = require('crypto');
const config = require('../config');
const clock = require('../clock');
const v = require('./validate');
const doctors = require('./doctors');
const availability = require('./availability');
const appointments = require('./appointments');
const { T } = require('./chat-i18n');

const STATE_TTL_MS = 2 * 3600e3;
const SECRET = config.admin.sessionSecret || process.env.CHAT_STATE_SECRET || crypto.randomBytes(32).toString('hex');

function signState(state) {
  const body = Buffer.from(JSON.stringify({ ...state, exp: Date.now() + STATE_TTL_MS })).toString('base64url');
  return `${body}.${crypto.createHmac('sha256', SECRET).update(body).digest('base64url')}`;
}
function readState(token) {
  try {
    const [body, mac] = String(token || '').split('.');
    const expect = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
    if (!mac || mac.length !== expect.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expect))) return null;
    const s = JSON.parse(Buffer.from(body, 'base64url').toString());
    return s.exp > Date.now() ? s : null;
  } catch { return null; }
}

function detectLang(text) {
  if (/[஀-௿]/.test(text)) return 'ta';
  if (/[ऀ-ॿ]/.test(text)) return 'hi';
  return null;
}

const EMERGENCY_RE = /emergency|unconscious|not breathing|can'?t breathe|heavy bleeding|accident|heart attack|stroke|seizure|suicide|poison|அவசர|மயக்க|மூச்சு விட முடிய|விபத்து|மாரடைப்பு|आपातकाल|इमरजेंसी|बेहोश|सांस नहीं|दुर्घटना|हार्ट अटैक/i;
const MEDICAL_RE = /medicine|tablet|dose|dosage|prescri|diagnos|what (should|can) i (take|eat)|cure|treatment for|side effect|மாத்திரை|மருந்து|என்ன சாப்பிட|दवा|दवाई|गोली|इलाज|खुराक/i;

const INTENTS = [
  ['reschedule', /reschedul|change (my )?(appointment|time|date)|postpone|prepone|நேரம் மாற்ற|மாற்ற|समय बदल|बदलना|री-?शेड्यूल/i],
  ['cancel', /cancel|ரத்து|रद्द|कैंसल/i],
  ['check', /status|check|my appointment|appointment (no|number)|lmh-?\d+|நிலை|சரிபார்|स्थिति|स्टेटस|देखना/i],
  ['timings', /timing|time ?table|hours|schedule|when .*available|நேரம்|समय|टाइमिंग/i],
  ['doctors', /doctors|specialist|which doctor|மருத்துவர்கள்|டாக்டர்கள்|डॉक्टरों|डॉक्टर कौन/i],
  ['info', /address|location|where|contact|hospital info|direction|முகவரி|எங்கே|இடம்|पता|कहाँ|लोकेशन/i],
  ['call', /call|phone|voice|talk to|அழை|பேச|कॉल|फ़ोन|फोन|बात/i],
  ['book', /book|appointment|consult|meet|see (the )?doctor|visit|முன்பதிவு|சந்திப்பு|பார்க்க|அப்பாயின்ட்|बुक|अपॉइंटमेंट|मिलना|दिखाना/i],
];

// Unicode-aware: JS \b does not work after Tamil/Devanagari letters.
const isYes = (v) => v === 'yes' || /^(yes|yeah|ok|okay|confirm|sure|ஆம்|ஆமாம்|சரி|हाँ|हां|हा|ठीक|haan|ha|ji)(?=$|[\s.!,])/i.test(String(v).trim());

// ---------- response helpers ----------
function reply(state) {
  const t = T[state.lang];
  return {
    lang: state.lang, messages: [], buttons: [], links: [], input: 'text', t,
    say(text) { this.messages.push({ type: 'text', text }); return this; },
    card(title, rows) { this.messages.push({ type: 'card', title, rows }); return this; },
    btn(label, value) { this.buttons.push({ label, value }); return this; },
    link(label, href) { this.links.push({ label, href }); return this; },
  };
}
function menuButtons(r) {
  const t = r.t;
  return r.btn(t.menu_book, 'flow:book').btn(t.menu_doctors, 'flow:doctors').btn(t.menu_timings, 'flow:timings')
    .btn(t.menu_check, 'flow:check').btn(t.menu_reschedule, 'flow:reschedule').btn(t.menu_cancel, 'flow:cancel')
    .btn(t.menu_info, 'flow:info').btn(t.menu_call, 'flow:call');
}
const backBtn = (r) => r.btn(r.t.menu_back, 'menu');
const sessName = (t, s) => (s === 'evening' ? t.evening : s === 'morning' ? t.morning : '');
const when = (date, time) => `${clock.prettyDate(date)}, ${clock.prettyTime(time)}`;

function apptCard(r, a, title) {
  const f = r.t.field;
  return r.card(title || a.appointment_no, [
    [f.hospital, config.hospital.name], [f.no, a.appointment_no], [f.doctor, a.doctor_name], [f.dept, a.department],
    [f.date, clock.prettyDate(a.appointment_date)], [f.time, clock.prettyTime(a.appointment_time)],
    [f.patient, a.patient_name], [f.status, r.t.status[a.status] || a.status],
  ]);
}

function dateButtons(r) {
  const today = clock.nowIST().date;
  for (let i = 0; i < 6; i++) {
    const d = clock.addDays(today, i);
    const label = i === 0 ? `${r.t.today} (${d.slice(8)}/${d.slice(5, 7)})` : i === 1 ? `${r.t.tomorrow} (${d.slice(8)}/${d.slice(5, 7)})` : clock.prettyDate(d).replace(/ \d{4}$/, '');
    r.btn(label, `date:${d}`);
  }
}

// ---------- booking / reschedule shared slot steps ----------
async function askDoctor(r) {
  r.say(r.t.ask_doctor);
  for (const d of await doctors.listDoctors()) r.btn(`${d.name} – ${d.label[r.lang] || d.department}`, `doc:${d.id}`);
  backBtn(r);
}
function askDate(r, doctorName) {
  r.say(r.t.ask_date(doctorName)).say(r.t.ask_date_hint);
  dateButtons(r); backBtn(r);
}
function askSession(r) {
  r.say(r.t.ask_session).btn(`🌅 ${r.t.morning}`, 'sess:morning').btn(`🌇 ${r.t.evening}`, 'sess:evening');
}

/** Show real slots for the chosen doctor/date/session, or the first real alternative. */
async function showSlots(r, s, doctor) {
  const t = r.t;
  const d = s.d;
  r.say(t.checking(doctor.name, clock.prettyDate(d.date), sessName(t, d.session)));
  const day = await availability.getDay(doctor, d.date);
  const sess = day.sessions.find((x) => x.session === d.session);
  const free = sess ? sess.slots.filter((x) => x.state === 'available') : [];
  if (free.length) {
    r.say(t.slots_available);
    for (const x of free) r.btn(clock.prettyTime(x.time), `slot:${d.date}|${x.time}`);
    r.btn(t.other_date, 'other_date');
    s.step = 'time';
    return;
  }
  // Nothing in that session: explain truthfully and offer the first real slot.
  const now = clock.nowIST();
  const nextFromSameDay = await availability.findNextAvailable(doctor, d.date, { limit: 1 });
  const dayEmpty = day.available_count === 0;
  const next = dayEmpty ? (await availability.findNextAvailable(doctor, clock.addDays(d.date, 1), { limit: 1 }))[0] : nextFromSameDay[0];
  if (!next) { r.say(t.none_found); backBtn(r); s.step = null; return; }
  const n = `${next.display}`;
  let msg;
  if (sess && sess.on_leave) msg = t.on_leave(doctor.name, n);
  else if (dayEmpty && !day.working) msg = t.not_working(doctor.name, n);
  else if (dayEmpty && d.date === now.date) msg = t.closed_today(n);
  else if (dayEmpty) msg = t.full(n);
  else msg = t.session_full(sessName(t, d.session), n);
  r.say(msg).btn(t.yes_book, `slot:${next.date}|${next.time}`).btn(t.other_date, 'other_date');
  s.step = 'time';
}

/** Validate a chosen/typed slot against the database. Returns true if accepted. */
async function acceptSlot(r, s, doctor, input) {
  let date = s.d.date; let times;
  const m = String(input).match(/^slot:(\d{4}-\d{2}-\d{2})\|(\d{2}:\d{2})$/);
  if (m) { date = m[1]; times = [m[2]]; } else times = v.parseTimeCandidates(input, s.d.session);
  if (!times.length) { r.say(r.t.invalid_time); await showSlots(r, s, doctor); return false; }
  const chk = await availability.checkSlot(doctor, date, times, m ? null : s.d.session);
  if (!chk.available) {
    r.say(chk.reason === 'slot_taken' ? r.t.slot_gone : `${chk.reason_text || r.t.invalid_time}`);
    for (const a of chk.alternatives) r.btn(a.display.replace(/^\w+, /, ''), `slot:${a.date}|${a.time}`);
    r.btn(r.t.other_date, 'other_date');
    return false;
  }
  Object.assign(s.d, { date: chk.slot.date, time: chk.slot.time, session: chk.slot.session });
  r.say(r.t.slot_ok(`${clock.prettyTime(chk.slot.time)} (${clock.prettyDate(chk.slot.date)})`));
  return true;
}

/** Fill doctor/date/session/time from a free-text sentence where possible. */
async function extract(s, text) {
  if (!text || /^(\w+):/.test(text)) return;
  if (!s.d.doctor_id) { const doc = await doctors.resolveDoctor(text); if (doc) s.d.doctor_id = doc.id; }
  if (!s.d.date) { const date = v.parseDate(text); if (date) s.d.date = date; }
  if (!s.d.session) { const ses = v.parseSession(text); if (ses) s.d.session = ses; }
}

function checkDate(r, date) {
  const today = clock.nowIST().date;
  if (!date) { r.say(r.t.invalid_date); return false; }
  if (date < today) { r.say(r.t.past_date); return false; }
  if (date > clock.addDays(today, config.booking.windowDays)) { r.say(r.t.beyond(config.booking.windowDays)); return false; }
  return true;
}

// ---------- flows ----------
async function bookFlow(r, s, input) {
  const t = r.t; const d = s.d;
  const val = input || '';

  switch (s.step) {
    case 'doctor': {
      const doc = val.startsWith('doc:') ? await doctors.getDoctor(val.slice(4)) : await doctors.resolveDoctor(val);
      if (!doc) { r.say(t.unknown_doctor); return askDoctor(r); }
      d.doctor_id = doc.id; await extract(s, val); break;
    }
    case 'date': {
      const date = val.startsWith('date:') ? val.slice(5) : v.parseDate(val);
      if (!checkDate(r, date)) { dateButtons(r); return; }
      d.date = date; if (!val.startsWith('date:')) { const ses = v.parseSession(val); if (ses) d.session = ses; }
      break;
    }
    case 'session': {
      const ses = val.startsWith('sess:') ? val.slice(5) : v.parseSession(val);
      if (!ses) return askSession(r);
      d.session = ses; break;
    }
    case 'time': {
      if (val === 'other_date') { d.date = null; d.session = null; d.time = null; break; }
      const doctor = await doctors.getDoctor(d.doctor_id);
      if (!(await acceptSlot(r, s, doctor, val))) return;
      break;
    }
    case 'name': { const n = v.parseName(val); if (!n) { r.say(t.invalid_name); r.input = 'text'; return; } d.patient_name = n; break; }
    case 'mobile': { const m = v.parseMobile(val); if (!m) { r.say(t.invalid_mobile); r.input = 'tel'; return; } d.mobile = m; break; }
    case 'ptype': {
      const p = val.startsWith('ptype:') ? val.slice(6) : v.parsePatientType(val);
      if (!p) { r.say(t.invalid_ptype); return r.btn(t.new_patient, 'ptype:new').btn(t.existing_patient, 'ptype:existing'); }
      d.patient_type = p; break;
    }
    case 'reason': { const x = v.cleanText(val, 300); if (x.length < 2) { r.say(t.invalid_reason); return; } d.reason = x; break; }
    case 'confirm': {
      if (isYes(val)) return doBook(r, s);
      if (val === 'other_date') { d.date = null; d.session = null; d.time = null; break; }
      r.say(t.kept); s.flow = null; s.step = null; return menuButtons(r);
    }
    default: await extract(s, val);
  }
  return nextBookStep(r, s);
}

async function nextBookStep(r, s) {
  const t = r.t; const d = s.d;
  if (!d.doctor_id) { s.step = 'doctor'; return askDoctor(r); }
  const doctor = await doctors.getDoctor(d.doctor_id);
  if (!d.date) { s.step = 'date'; return askDate(r, doctor.name); }
  if (!d.session) { s.step = 'session'; return askSession(r); }
  if (!d.time) return showSlots(r, s, doctor);
  if (!d.patient_name) { s.step = 'name'; r.input = 'text'; return r.say(t.ask_name); }
  if (!d.mobile) { s.step = 'mobile'; r.input = 'tel'; return r.say(t.ask_mobile); }
  if (!d.patient_type) { s.step = 'ptype'; return r.say(t.ask_ptype).btn(t.new_patient, 'ptype:new').btn(t.existing_patient, 'ptype:existing'); }
  if (!d.reason) { s.step = 'reason'; return r.say(t.ask_reason); }
  s.step = 'confirm';
  const f = t.field;
  r.card(t.confirm_q, [
    [f.doctor, doctor.name], [f.dept, doctor.label[r.lang] || doctor.department], [f.date, clock.prettyDate(d.date)],
    [f.time, clock.prettyTime(d.time)], [f.patient, d.patient_name], ['📱', v.maskMobile(d.mobile)],
  ]);
  r.btn(`✅ ${t.yes}`, 'yes').btn(t.other_date, 'other_date').btn(t.no, 'no');
}

async function doBook(r, s) {
  const d = s.d;
  const res = await appointments.book({
    patient_name: d.patient_name, mobile: d.mobile, doctor: d.doctor_id, appointment_date: d.date,
    appointment_time: d.time, session: d.session, reason: d.reason, patient_type: d.patient_type, language: r.lang,
  }, { source: 'web_chat', actor: 'web_chat' });
  if (res.ok) {
    apptCard(r, res.appointment, `✅ ${r.t.booked_title}`);
    s.flow = null; s.step = null; s.d = {};
    return menuButtons(r);
  }
  if (res.code === 'duplicate') {
    apptCard(r, res.appointment); s.flow = null; s.step = null; return menuButtons(r);
  }
  // Slot taken between selection and confirmation (e.g. by the voice agent).
  r.say(r.t.slot_gone);
  for (const a of res.alternatives || []) r.btn(a.display.replace(/^\w+, /, ''), `slot:${a.date}|${a.time}`);
  r.btn(r.t.other_date, 'other_date');
  d.time = null; s.step = 'time';
}

/** Verify appointment number + registered mobile; used by reschedule/cancel/check. */
async function verifyStep(r, s, input) {
  const t = r.t; const d = s.d;
  if (s.step === 'appt_no') {
    const no = v.parseAppointmentNo(input);
    if (!no) { r.say(t.ask_appt_no); return false; }
    d.appointment_no = no; s.step = 'reg_mobile'; r.input = 'tel'; r.say(t.ask_reg_mobile); return false;
  }
  if (s.step === 'reg_mobile') {
    const a = await appointments.findForPatient(d.appointment_no, input);
    if (!a) { r.say(t.not_found); s.step = 'appt_no'; d.appointment_no = null; r.say(t.ask_appt_no); return false; }
    s.verified = a.id; return true;
  }
  return false;
}

async function checkFlow(r, s, input) {
  const t = r.t; const d = s.d;
  if (s.step === 'id') {
    const no = /lmh|^\d{1,6}$/i.test(String(input).trim()) ? v.parseAppointmentNo(input) : null;
    const mob = v.parseMobile(input);
    if (no) { d.appointment_no = no; s.step = 'reg_mobile'; r.input = 'tel'; return r.say(t.ask_reg_mobile); }
    if (mob) { d.mobile = mob; s.step = 'verify_name'; return r.say(t.ask_name_verify); }
    return r.say(t.ask_appt_or_mobile);
  }
  if (s.step === 'reg_mobile') {
    if (!(await verifyStep(r, s, input))) return;
    apptCard(r, await appointments.getById(s.verified));
  } else if (s.step === 'verify_name') {
    const name = v.parseName(input);
    const list = (await appointments.upcomingForMobile(d.mobile)).filter((a) => name && a.patient_name.toLowerCase() === name.toLowerCase());
    if (!list.length) { r.say(t.not_found); s.flow = null; s.step = null; return menuButtons(r); }
    r.say(t.your_appts);
    for (const a of list) apptCard(r, a);
  }
  s.flow = null; s.step = null; s.d = {}; s.verified = null;
  menuButtons(r);
}

async function cancelFlow(r, s, input) {
  const t = r.t;
  if (s.step === 'appt_no' || s.step === 'reg_mobile') {
    if (!(await verifyStep(r, s, input))) return;
    const a = await appointments.getById(s.verified);
    if (!appointments.ACTIVE.includes(a.status)) { r.say(t.not_active(t.status[a.status] || a.status)); s.flow = null; return menuButtons(r); }
    apptCard(r, a); r.say(t.cancel_q).btn(t.yes_cancel, 'yes').btn(t.keep, 'no');
    s.step = 'confirm'; return;
  }
  if (s.step === 'confirm') {
    if (isYes(input)) {
      const res = await appointments.cancel(s.verified, 'Cancelled via web chat', 'web_chat');
      r.say(res.ok ? t.cancelled(res.appointment.appointment_no) : t.not_active(res.message || ''));
    } else r.say(t.kept);
    s.flow = null; s.step = null; s.verified = null; s.d = {};
    menuButtons(r);
  }
}

async function rescheduleFlow(r, s, input) {
  const t = r.t; const d = s.d;
  if (s.step === 'appt_no' || s.step === 'reg_mobile') {
    if (!(await verifyStep(r, s, input))) return;
    const a = await appointments.getById(s.verified);
    if (!appointments.ACTIVE.includes(a.status)) { r.say(t.not_active(t.status[a.status] || a.status)); s.flow = null; return menuButtons(r); }
    r.say(t.verified); apptCard(r, a);
    d.doctor_id = a.doctor_id; s.step = 'date';
    r.say(t.resched_ask_date); dateButtons(r); return;
  }
  const doctor = await doctors.getDoctor(d.doctor_id);
  if (s.step === 'date') {
    const date = String(input).startsWith('date:') ? input.slice(5) : v.parseDate(input);
    if (!checkDate(r, date)) return dateButtons(r);
    d.date = date; s.step = 'session'; return askSession(r);
  }
  if (s.step === 'session') {
    const ses = String(input).startsWith('sess:') ? input.slice(5) : v.parseSession(input);
    if (!ses) return askSession(r);
    d.session = ses; return showSlots(r, s, doctor);
  }
  if (s.step === 'time') {
    if (input === 'other_date') { s.step = 'date'; r.say(t.resched_ask_date); return dateButtons(r); }
    if (!(await acceptSlot(r, s, doctor, input))) return;
    s.step = 'confirm';
    r.say(t.resched_confirm(when(d.date, d.time))).btn(`✅ ${t.yes}`, 'yes').btn(t.other_date, 'other_date').btn(t.no, 'no');
    return;
  }
  if (s.step === 'confirm') {
    if (input === 'other_date') { s.step = 'date'; r.say(t.resched_ask_date); return dateButtons(r); }
    if (isYes(input)) {
      const res = await appointments.reschedule(s.verified, { appointment_date: d.date, appointment_time: d.time, session: d.session }, 'web_chat');
      if (res.ok) {
        r.say(t.rescheduled(res.appointment.appointment_no, when(res.appointment.appointment_date, res.appointment.appointment_time)));
        apptCard(r, res.appointment);
      } else {
        r.say(t.slot_gone);
        for (const a of res.alternatives || []) r.btn(a.display.replace(/^\w+, /, ''), `slot:${a.date}|${a.time}`);
        s.step = 'time'; return;
      }
    } else r.say(t.kept);
    s.flow = null; s.step = null; s.verified = null; s.d = {};
    menuButtons(r);
  }
}

async function infoFlow(r, which) {
  const t = r.t;
  const list = await doctors.listDoctors();
  if (which === 'doctors') {
    r.say(t.doctors_title);
    for (const d of list) r.card(`${d.name}`, [[t.field.dept, d.label[r.lang] || d.department], ['🎓', d.qualification]]);
    r.btn(t.menu_book, 'flow:book');
  } else if (which === 'timings') {
    r.say(t.timings_title);
    for (const d of list) {
      r.card(`${d.name} – ${d.label[r.lang] || d.department}`, d.sessions.map((s) => [sessName(t, s.session), `${clock.prettyTime(s.start_time)} – ${clock.prettyTime(s.end_time)}`]));
    }
    r.btn(t.menu_book, 'flow:book');
  } else if (which === 'info') {
    r.say(t.info(config.hospital));
    r.link('📍 Google Maps', config.hospital.mapsUrl);
    r.btn(t.menu_book, 'flow:book');
  } else if (which === 'call') {
    r.say(t.call_text).link(t.call_btn, '/call');
  }
  backBtn(r);
}

function startFlow(r, s, flow) {
  s.flow = flow; s.d = {}; s.verified = null;
  if (flow === 'book') { s.step = null; return nextBookStep(r, s); }
  if (flow === 'check') { s.step = 'id'; return r.say(r.t.ask_appt_or_mobile); }
  if (flow === 'cancel' || flow === 'reschedule') { s.step = 'appt_no'; return r.say(r.t.ask_appt_no); }
  s.flow = null; return infoFlow(r, flow);
}

/**
 * One chat turn.
 * @param {{message?: string, action?: string, lang?: string, state?: string}} input
 */
async function handle(input) {
  let s = readState(input.state) || { lang: 'en', flow: null, step: null, d: {}, verified: null };
  const text = v.cleanText(input.message, 500);
  const action = String(input.action || '').slice(0, 60);
  const value = action || text;
  s.lang = ['en', 'ta', 'hi'].includes(input.lang) ? input.lang : (detectLang(text) || s.lang || 'en');
  const r = reply(s);

  try {
    if (!value || action === 'menu' || /^(hi|hello|hey|menu|start|namaste|vanakkam)\b|^(வணக்கம்|नमस्ते|नमस्कार)/i.test(text)) {
      s = { lang: s.lang, flow: null, step: null, d: {}, verified: null };
      r.say(r.t.welcome); menuButtons(r);
    } else if (action.startsWith('flow:')) {
      await startFlow(r, s, action.slice(5));
    } else if (text && EMERGENCY_RE.test(text)) {
      r.say(r.t.emergency); menuButtons(r);
    } else if (text && MEDICAL_RE.test(text) && !s.step) {
      r.say(r.t.medical); menuButtons(r);
    } else if (s.flow === 'book') await bookFlow(r, s, value);
    else if (s.flow === 'check') await checkFlow(r, s, value);
    else if (s.flow === 'cancel') await cancelFlow(r, s, value);
    else if (s.flow === 'reschedule') await rescheduleFlow(r, s, value);
    else {
      const intent = (INTENTS.find(([, re]) => re.test(text)) || [null])[0]
        || (await doctors.resolveDoctor(text) ? 'book' : null);
      if (intent === 'book') { s.flow = 'book'; s.d = {}; s.step = null; await extract(s, text); await nextBookStep(r, s); }
      else if (intent) await startFlow(r, s, intent);
      else { r.say(r.t.fallback); menuButtons(r); }
    }
  } catch (e) {
    console.error('[chat]', e);
    r.messages = []; r.buttons = [];
    r.say(r.t.error); menuButtons(r);
  }
  return { lang: s.lang, messages: r.messages, buttons: r.buttons, links: r.links, input: r.input, state: signState(s) };
}

module.exports = { handle, detectLang };
