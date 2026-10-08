'use strict';
// Server-rendered pages. Text carries data-i18n keys; public/js/i18n.js swaps
// it to Tamil/Hindi. No private numbers or secrets are ever rendered.
const config = require('../config');
const clock = require('../clock');
const doctors = require('../services/doctors');

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const V = '7'; // asset cache-buster

const ICON = {
  phone: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25c1.1.37 2.3.57 3.6.57a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z"/></svg>',
  wa: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.15l-.3-.18-3 .78.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.25-.12-1.47-.72-1.7-.8-.23-.09-.4-.13-.56.12-.17.25-.64.8-.79.97-.14.16-.29.18-.54.06a6.7 6.7 0 0 1-3.3-2.9c-.25-.43.25-.4.71-1.33.08-.16.04-.3-.02-.42l-.76-1.83c-.2-.48-.4-.41-.56-.42h-.48a.92.92 0 0 0-.66.31 2.8 2.8 0 0 0-.87 2.07 4.8 4.8 0 0 0 1 2.56 11 11 0 0 0 4.2 3.7c1.56.68 2.18.73 2.96.62.48-.07 1.47-.6 1.68-1.18.2-.58.2-1.08.14-1.18-.06-.1-.23-.17-.48-.29z"/></svg>',
  cal: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7 2h2v2h6V2h2v2h3a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h3zm12 8H5v9h14zM8 12h3v3H8z"/></svg>',
  chat: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M4 3h16a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2zm3 6v2h2V9zm4 0v2h2V9zm4 0v2h2V9z"/></svg>',
  logo: '<svg viewBox="0 0 48 48" aria-hidden="true"><rect width="48" height="48" rx="12" fill="#0b6e78"/><path fill="#fff" d="M20 10h8v10h10v8H28v10h-8V28H10v-8h10z"/><circle cx="24" cy="24" r="3.2" fill="#f0a830"/></svg>',
};

const NAV = [
  ['/', 'nav_home', 'Home'], ['/doctors', 'nav_doctors', 'Doctors'], ['/schedule', 'nav_schedule', 'Doctor Schedule'],
  ['/book', 'nav_book', 'Book Appointment'], ['/ai-receptionist', 'nav_ai', 'AI Voice Receptionist'],
  ['/status', 'nav_status', 'Appointment Status'], ['/contact', 'nav_contact', 'Contact'],
];

function layout({ title, path, body, scripts = [], description }) {
  const nav = NAV.map(([href, key, label]) => `<a href="${href}" data-i18n="${key}"${href === path ? ' aria-current="page"' : ''}>${label}</a>`).join('');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} | Lakshmi Multispecialty Hospital</title>
<meta name="description" content="${esc(description || 'Lakshmi Multispecialty Hospital, Viruthunagar – book doctor appointments online, by AI voice receptionist or AI chat in Tamil, English and Hindi.')}">
<meta name="theme-color" content="#0b6e78">
<link rel="icon" href="/img/logo.svg" type="image/svg+xml">
<link rel="stylesheet" href="/css/site.css?v=${V}">
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="topbar">
  <div class="wrap topbar-in">
    <a class="brand" href="/">${ICON.logo}<span><strong data-i18n="hospital_name">Lakshmi Multispecialty Hospital</strong><small data-i18n="hospital_city">Viruthunagar, Tamil Nadu</small></span></a>
    <div class="lang" role="group" aria-label="Language">
      <button type="button" data-lang="ta" lang="ta">தமிழ்</button><button type="button" data-lang="en" aria-pressed="true">English</button><button type="button" data-lang="hi" lang="hi">हिंदी</button>
    </div>
    <button class="menu-btn" type="button" aria-expanded="false" aria-controls="mainnav" data-i18n-aria="menu">☰ <span data-i18n="menu">Menu</span></button>
  </div>
  <nav id="mainnav" class="mainnav"><div class="wrap">${nav}</div></nav>
</header>
<main id="main">${body}</main>
<footer class="footer">
  <div class="wrap footer-in">
    <div><strong data-i18n="hospital_name">Lakshmi Multispecialty Hospital</strong><br><span data-i18n="hospital_city">Viruthunagar, Tamil Nadu</span></div>
    <div class="footer-links"><a href="/book" data-i18n="nav_book">Book Appointment</a><a href="/status" data-i18n="nav_status">Appointment Status</a><a href="/contact" data-i18n="nav_contact">Contact</a></div>
    <p class="muted small" data-i18n="footer_note">For emergencies, go to the nearest emergency department or call 108.</p>
  </div>
</footer>
<nav class="actionbar" aria-label="Quick actions">
  <a href="/book" class="ab ab-book">${ICON.cal}<span data-i18n="btn_book_short">Book</span></a>
  <a href="/call" class="ab ab-call" aria-label="Talk to AI receptionist">${ICON.phone}<span data-i18n="btn_ai_short">AI Call</span></a>
  <a href="/whatsapp" class="ab ab-wa" rel="noopener">${ICON.wa}<span>WhatsApp</span></a>
</nav>
<button class="chat-fab" type="button" id="chatFab" aria-haspopup="dialog" aria-controls="chatPanel" aria-label="AI Receptionist chat">${ICON.chat}<span class="fab-long" data-i18n="chat_fab">🤖 AI Receptionist</span><span class="fab-short" aria-hidden="true">🤖</span></button>
<script src="/js/i18n.js?v=${V}"></script>
<script src="/js/site.js?v=${V}"></script>
<script src="/js/chat.js?v=${V}"></script>
${scripts.map((s) => `<script src="/js/${s}?v=${V}"></script>`).join('\n')}
</body>
</html>`;
}

const mainButtons = () => `
<div class="cta">
  <a class="btn btn-primary btn-xl" href="/book">${ICON.cal}<span data-i18n="btn_book">BOOK APPOINTMENT</span></a>
  <a class="btn btn-ai btn-xl" href="/call" aria-label="Talk to AI receptionist">${ICON.phone}<span data-i18n="btn_ai">TALK TO AI RECEPTIONIST</span></a>
  <a class="btn btn-wa btn-xl" href="/whatsapp" rel="noopener">${ICON.wa}<span>WHATSAPP</span></a>
</div>`;

function doctorCard(d) {
  const times = d.sessions.map((s) => `<li><span data-i18n="${s.session}">${s.session === 'morning' ? 'Morning' : 'Evening'}</span> <b>${clock.prettyTime(s.start_time)} – ${clock.prettyTime(s.end_time)}</b></li>`).join('');
  return `<article class="card doctor">
  <div class="doc-avatar" aria-hidden="true">${esc(d.name.replace(/^(Mr|Ms|Mrs|Dr)\.?\s*/, '').charAt(0))}</div>
  <div>
    <p class="dept" data-i18n="dept_${esc(d.slug)}">${esc(d.label.en)}</p>
    <h3>${esc(d.name)}</h3>
    <p class="qual">${esc(d.qualification)}</p>
    <ul class="times">${times}</ul>
    <p class="muted small" data-i18n="mon_sat">Monday – Saturday</p>
    <a class="btn btn-primary" href="/book?doctor=${d.id}" data-i18n="btn_book_with">Book appointment</a>
  </div>
</article>`;
}

async function home(req, res) {
  const list = await doctors.listDoctors();
  res.send(layout({
    title: 'Home', path: '/',
    body: `
<section class="hero">
  <div class="wrap">
    <p class="eyebrow" data-i18n="hero_eyebrow">Viruthunagar's trusted multispecialty care</p>
    <h1 data-i18n="hero_title">Book your doctor appointment in a minute</h1>
    <p class="lead" data-i18n="hero_lead">Online, by AI phone receptionist or AI chat — in Tamil, English or Hindi. Every appointment is checked live against the doctor's real schedule.</p>
    ${mainButtons()}
    <p class="lang-note"><span lang="ta">தமிழ்</span> · English · <span lang="hi">हिंदी</span></p>
  </div>
</section>
<section class="wrap section">
  <h2 data-i18n="our_doctors">Our Doctors</h2>
  <div class="grid3">${list.map(doctorCard).join('')}</div>
</section>
<section class="wrap section">
  <h2 data-i18n="how_title">How booking works</h2>
  <ol class="steps">
    <li><b data-i18n="how1_t">Choose doctor &amp; date</b><span data-i18n="how1">See only the times that are really free.</span></li>
    <li><b data-i18n="how2_t">Enter patient details</b><span data-i18n="how2">Name, mobile number and reason for visit.</span></li>
    <li><b data-i18n="how3_t">Get your appointment number</b><span data-i18n="how3">Example: LMH-0001. Keep it to check or change your booking.</span></li>
  </ol>
</section>`,
  }));
}

async function doctorsPage(req, res) {
  const list = await doctors.listDoctors();
  res.send(layout({
    title: 'Doctors', path: '/doctors',
    body: `<section class="wrap section"><h1 data-i18n="our_doctors">Our Doctors</h1><div class="grid3">${list.map(doctorCard).join('')}</div></section>`,
  }));
}

async function schedulePage(req, res) {
  const list = await doctors.listDoctors();
  const rows = list.map((d) => `<tr><th scope="row">${esc(d.name)}<br><small data-i18n="dept_${esc(d.slug)}">${esc(d.label.en)}</small></th>${['morning', 'evening'].map((s) => {
    const x = d.sessions.find((y) => y.session === s);
    return `<td>${x ? `${clock.prettyTime(x.start_time)} – ${clock.prettyTime(x.end_time)}` : '—'}</td>`;
  }).join('')}</tr>`).join('');
  const opts = list.map((d) => `<option value="${d.id}">${esc(d.name)} – ${esc(d.label.en)}</option>`).join('');
  res.send(layout({
    title: 'Doctor Schedule', path: '/schedule', scripts: ['schedule.js'],
    body: `
<section class="wrap section">
  <h1 data-i18n="nav_schedule">Doctor Schedule</h1>
  <div class="table-wrap"><table class="sched"><thead><tr><th data-i18n="doctor">Doctor</th><th data-i18n="morning">Morning</th><th data-i18n="evening">Evening</th></tr></thead><tbody>${rows}</tbody></table></div>
  <p class="muted" data-i18n="sched_note">Consultations Monday to Saturday. Sunday holiday. Doctor leave is updated live below.</p>
</section>
<section class="wrap section">
  <h2 data-i18n="live_title">Live availability</h2>
  <form class="card form-row" id="schedForm">
    <label><span data-i18n="doctor">Doctor</span><select name="doctor_id" required>${opts}</select></label>
    <label><span data-i18n="date">Date</span><input type="date" name="date" required></label>
  </form>
  <div id="schedResult" aria-live="polite"></div>
</section>`,
  }));
}

async function bookPage(req, res) {
  const list = await doctors.listDoctors();
  const pre = Number(req.query.doctor) || '';
  const opts = list.map((d) => `<option value="${d.id}"${d.id === pre ? ' selected' : ''}>${esc(d.name)} – ${esc(d.label.en)}</option>`).join('');
  res.send(layout({
    title: 'Book Appointment', path: '/book', scripts: ['book.js'],
    body: `
<section class="wrap section narrow">
  <h1 data-i18n="nav_book">Book Appointment</h1>
  <p class="muted" data-i18n="book_intro">Only real free times are shown. Your appointment number is issued after the hospital system saves the booking.</p>
  <form id="bookForm" class="card form" novalidate>
    <label><span data-i18n="doctor">Doctor / Department</span>
      <select name="doctor" required><option value="" data-i18n="choose_doctor">Choose a doctor</option>${opts}</select></label>
    <label><span data-i18n="date">Appointment date</span><input type="date" name="appointment_date" required></label>
    <fieldset class="seg"><legend data-i18n="session">Morning / Evening</legend>
      <label><input type="radio" name="session" value="morning" checked> <span data-i18n="morning">Morning</span></label>
      <label><input type="radio" name="session" value="evening"> <span data-i18n="evening">Evening</span></label>
    </fieldset>
    <div><span class="label" data-i18n="pref_time">Preferred time</span><div id="slots" class="slots" aria-live="polite"><p class="muted" data-i18n="pick_first">Choose doctor and date to see free times.</p></div>
      <input type="hidden" name="appointment_time" required></div>
    <label><span data-i18n="patient_name">Patient name</span><input name="patient_name" autocomplete="name" maxlength="80" required></label>
    <label><span data-i18n="mobile">Mobile number</span><input name="mobile" type="tel" inputmode="numeric" autocomplete="tel" maxlength="14" placeholder="10-digit mobile" required></label>
    <fieldset class="seg"><legend data-i18n="patient_type">New or existing patient</legend>
      <label><input type="radio" name="patient_type" value="new" checked> <span data-i18n="new_patient">New patient</span></label>
      <label><input type="radio" name="patient_type" value="existing"> <span data-i18n="existing_patient">Existing patient</span></label>
    </fieldset>
    <label><span data-i18n="reason">Reason for visit</span><textarea name="reason" rows="2" maxlength="300" required></textarea></label>
    <input class="hp" name="website_url" tabindex="-1" autocomplete="off" aria-hidden="true">
    <div id="formMsg" role="alert"></div>
    <button class="btn btn-primary btn-xl" type="submit" data-i18n="confirm_booking">Confirm Appointment</button>
  </form>
  <div id="bookResult" aria-live="polite"></div>
</section>`,
  }));
}

function aiPage(req, res) {
  const unavailable = req.query.call === 'unavailable';
  res.send(layout({
    title: 'AI Voice Receptionist', path: '/ai-receptionist',
    body: `
<section class="wrap section narrow center">
  <h1 data-i18n="nav_ai">AI Voice Receptionist</h1>
  <p class="lead" data-i18n="ai_lead">Call our AI receptionist any time to book, check, reschedule or cancel an appointment.</p>
  ${unavailable ? '<p class="alert" data-i18n="call_unavailable">The AI phone line is not available right now. Please use online booking or the AI chat.</p>' : ''}
  <a class="call-big" href="/call" aria-label="Call AI receptionist">${ICON.phone}</a>
  <p class="muted" data-i18n="tap_call">Tap the phone to call</p>
  <div class="langs"><span lang="ta">தமிழ்</span><span>English</span><span lang="hi">हिंदी</span></div>
  <div class="card left">
    <h2 data-i18n="ai_how">What the AI receptionist does</h2>
    <ul class="ticks">
      <li data-i18n="ai1">Greets you: “Welcome to Lakshmi Multispecialty Hospital. How can I help you?”</li>
      <li data-i18n="ai2">Asks which doctor, date, morning/evening and time you prefer.</li>
      <li data-i18n="ai3">Checks the real appointment book before confirming — it never guesses.</li>
      <li data-i18n="ai4">If your time is taken, offers the next actual free slot.</li>
      <li data-i18n="ai5">Gives you an appointment number such as LMH-0001.</li>
    </ul>
  </div>
  <button class="btn btn-ai btn-xl" type="button" data-open-chat>${ICON.chat}<span data-i18n="chat_instead">Prefer to type? Open AI Chat</span></button>
</section>`,
  }));
}

function statusPage(req, res) {
  res.send(layout({
    title: 'Appointment Status', path: '/status', scripts: ['status.js'],
    body: `
<section class="wrap section narrow">
  <h1 data-i18n="nav_status">Appointment Status</h1>
  <form id="statusForm" class="card form">
    <label><span data-i18n="appt_no">Appointment number</span><input name="appointment_no" placeholder="LMH-0001" required maxlength="12" autocapitalize="characters"></label>
    <label><span data-i18n="mobile">Registered mobile number</span><input name="mobile" type="tel" inputmode="numeric" required maxlength="14"></label>
    <div id="statusMsg" role="alert"></div>
    <button class="btn btn-primary btn-xl" type="submit" data-i18n="check_status">Check Status</button>
  </form>
  <div id="statusResult" aria-live="polite"></div>
  <p class="muted small" data-i18n="resched_hint">To reschedule, use the AI chat or call the AI receptionist.</p>
</section>`,
  }));
}

function contactPage(req, res) {
  const h = config.hospital;
  res.send(layout({
    title: 'Contact', path: '/contact',
    body: `
<section class="wrap section narrow">
  <h1 data-i18n="nav_contact">Contact</h1>
  ${req.query.whatsapp === 'unavailable' ? '<p class="alert" data-i18n="wa_unavailable">WhatsApp chat is not available right now. Please book online or use the AI receptionist.</p>' : ''}
  <div class="card">
    <h2 data-i18n="hospital_name">Lakshmi Multispecialty Hospital</h2>
    <p>📍 ${esc(h.address)}</p>
    ${h.email ? `<p>✉️ <a href="mailto:${esc(h.email)}">${esc(h.email)}</a></p>` : ''}
    <p><a class="btn" href="${esc(h.mapsUrl)}" rel="noopener" target="_blank" data-i18n="open_maps">Open in Google Maps</a></p>
  </div>
  ${mainButtons()}
</section>`,
  }));
}

function adminPage(req, res) {
  res.send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>Admin | Lakshmi Hospital</title><link rel="icon" href="/img/logo.svg">
<link rel="stylesheet" href="/css/site.css?v=${V}"><link rel="stylesheet" href="/css/admin.css?v=${V}"></head>
<body class="admin"><div id="app"><p class="wrap section">Loading…</p></div><script src="/js/admin.js?v=${V}"></script></body></html>`);
}

function notFound() {
  return layout({ title: 'Not found', path: '', body: '<section class="wrap section center"><h1>404</h1><p data-i18n="not_found">Page not found.</p><a class="btn btn-primary" href="/" data-i18n="nav_home">Home</a></section>' });
}

function mount(app) {
  const w = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
  app.get('/', w(home));
  app.get('/doctors', w(doctorsPage));
  app.get('/schedule', w(schedulePage));
  app.get('/book', w(bookPage));
  app.get('/ai-receptionist', aiPage);
  app.get('/status', statusPage);
  app.get('/contact', contactPage);
  app.get('/admin', adminPage);
}

module.exports = { mount, notFound };
