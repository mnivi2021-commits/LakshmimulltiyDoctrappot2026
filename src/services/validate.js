'use strict';
// Tolerant parsers for data arriving from the website form and the voice agent
// (Tamil / English / Hindi / Hinglish). Each returns a normalised value or null.
const clock = require('../clock');

const lc = (v) => String(v ?? '').trim().toLowerCase();

function cleanText(v, max) {
  return String(v ?? '').replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function parseName(v) {
  const s = cleanText(v, 80);
  if (s.length < 2) return null;
  if (!/^[\p{L}\p{M}][\p{L}\p{M} .'-]*$/u.test(s)) return null;
  return s;
}

/** Indian mobile → 10 digits starting 6-9, or null. */
function parseMobile(v) {
  let d = String(v ?? '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? d : null;
}

function maskMobile(m) {
  const s = String(m || '');
  return s.length >= 4 ? `${'X'.repeat(Math.max(0, s.length - 4))}${s.slice(-4)}` : s;
}

// Evening is tested first: several Hinglish evening words ("shaam") contain "am".
const EVENING_RE = /evening|night|(?<![a-z])p\.?\s?m\b|மாலை|சாயங்காலம்|இரவு|maalai|\bmalai\b|iravu|shaam|\bsham\b|raat|शाम|रात/;
const MORNING_RE = /morning|forenoon|noon|(?<![a-z])a\.?\s?m\b|காலை|மதியம்|kaalai|\bkalai\b|madhiyam|subah|subha|dopahar|सुबह|दोपहर|प्रातः/;

function parseSession(v) {
  const s = lc(v);
  if (!s) return null;
  if (EVENING_RE.test(s)) return 'evening';
  if (MORNING_RE.test(s)) return 'morning';
  return null;
}

/**
 * Returns candidate 'HH:MM' strings (24h). Ambiguous inputs such as "6:30"
 * return both 06:30 and 18:30 so the caller can pick the one inside a session.
 */
function parseTimeCandidates(v, sessionHint) {
  const raw = lc(v);
  if (!raw) return [];
  if (/\b(noon|மதியம் 12|दोपहर 12)\b/.test(raw) && !/\d/.test(raw)) return ['12:00'];
  const m = raw.match(/(\d{1,2})(?:\s*[:.\s]\s*(\d{2}))?/);
  if (!m) return [];
  let h = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : (/(half|அரை|साढ़े|sadhe)/.test(raw) ? 30 : 0);
  if (h > 23 || min > 59) return [];

  const isPM = /(?<![a-z])p\.?\s?m\b|evening|night|மாலை|இரவு|शाम|रात|shaam|sham|raat|maalai/.test(raw);
  const isAM = /(?<![a-z])a\.?\s?m\b|morning|காலை|सुबह|subah|kaalai/.test(raw);
  const hint = parseSession(sessionHint);
  const fmt = (hh) => `${String(hh).padStart(2, '0')}:${String(min).padStart(2, '0')}`;

  if (h >= 13) return [fmt(h)];
  if (isPM || (!isAM && hint === 'evening')) return [fmt(h === 12 ? 12 : h + 12)];
  if (isAM) return [fmt(h === 12 ? 0 : h)];
  if (h === 12) return ['12:' + String(min).padStart(2, '0')];
  // Ambiguous "6:30" — morning reading first if the hint says morning.
  return hint === 'morning' ? [fmt(h)] : [fmt(h), fmt(h + 12)];
}

const MONTHS = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5,
  jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};
const WEEKDAYS = {
  sunday: 0, sun: 0, ஞாயிறு: 0, रविवार: 0, raviwar: 0, monday: 1, mon: 1, திங்கள்: 1, सोमवार: 1, somvar: 1,
  tuesday: 2, tue: 2, செவ்வாய்: 2, मंगलवार: 2, mangalvar: 2, wednesday: 3, wed: 3, புதன்: 3, बुधवार: 3, budhvar: 3,
  thursday: 4, thu: 4, வியாழன்: 4, गुरुवार: 4, guruvar: 4, friday: 5, fri: 5, வெள்ளி: 5, शुक्रवार: 5, shukravar: 5,
  saturday: 6, sat: 6, சனி: 6, शनिवार: 6, shanivar: 6,
};

/** Resolves a date expression to 'YYYY-MM-DD' (IST), or null. */
function parseDate(v) {
  const s = lc(v);
  if (!s) return null;
  const today = clock.nowIST().date;

  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = s.slice(0, 10);
    return clock.isValidDate(d) ? d : null;
  }
  let m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    const d = `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    return clock.isValidDate(d) ? d : null;
  }

  if (/day after tomorrow|நாளை மறுநாள்|நாளன்னைக்கு|parso|परसों/.test(s)) return clock.addDays(today, 2);
  if (/tomorrow|நாளை|நாளைக்கு|\bkal\b|कल/.test(s)) return clock.addDays(today, 1);
  if (/today|இன்று|இன்னைக்கு|\baaj\b|आज/.test(s)) return today;

  for (const [word, dow] of Object.entries(WEEKDAYS)) {
    if (s.includes(word)) {
      const cur = clock.weekday(today);
      let add = (dow - cur + 7) % 7;
      if (add === 0) add = 7;
      return clock.addDays(today, add);
    }
  }

  // "8 October", "8th oct 2026", "October 8"
  m = s.match(/(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)\.?(?:\s+(\d{4}))?/) || null;
  let day, mon, year;
  if (m && MONTHS[m[2]]) { day = +m[1]; mon = MONTHS[m[2]]; year = m[3] ? +m[3] : null; }
  else {
    m = s.match(/([a-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?/);
    if (m && MONTHS[m[1]]) { day = +m[2]; mon = MONTHS[m[1]]; year = m[3] ? +m[3] : null; }
  }
  if (day && mon) {
    let y = year || +today.slice(0, 4);
    let d = `${y}-${String(mon).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (!year && d < today) d = `${y + 1}${d.slice(4)}`;
    return clock.isValidDate(d) ? d : null;
  }
  return null;
}

function parsePatientType(v) {
  const s = lc(v);
  if (!s) return null;
  if (/exist|old|return|regular|follow|பழைய|ஏற்கனவே|purana|पुराना|पहले/.test(s)) return 'existing';
  if (/new|first|புதிய|புது|naya|nayi|नया|नई|पहली/.test(s)) return 'new';
  return null;
}

function parseLanguage(v) {
  const s = lc(v);
  if (/^ta|tamil|தமிழ்/.test(s)) return 'ta';
  if (/^hi|hindi|हिंदी|हिन्दी/.test(s)) return 'hi';
  if (/^en|english/.test(s)) return 'en';
  return null;
}

function parseAppointmentNo(v) {
  const s = String(v ?? '').toUpperCase().replace(/\s+/g, '');
  const m = s.match(/^(?:LMH)?-?(\d{1,6})$/);
  return m ? `LMH-${m[1].padStart(4, '0')}` : null;
}

module.exports = {
  cleanText, parseName, parseMobile, maskMobile, parseSession, parseTimeCandidates,
  parseDate, parsePatientType, parseLanguage, parseAppointmentNo,
};
