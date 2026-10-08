'use strict';
const { db } = require('../db');

const DEPT_LABELS = {
  Orthopaedic: { en: 'Orthopaedic', ta: 'எலும்பு மருத்துவம்', hi: 'हड्डी रोग' },
  Diabetology: { en: 'Diabetologist', ta: 'சர்க்கரை நோய் நிபுணர்', hi: 'मधुमेह विशेषज्ञ' },
  Cardiology: { en: 'Heart Specialist', ta: 'இதய நிபுணர்', hi: 'हृदय रोग विशेषज्ञ' },
};

async function listDoctors() {
  const doctors = await db().all('SELECT * FROM doctors WHERE active = 1 ORDER BY sort_order, id');
  const sessions = await db().all('SELECT * FROM doctor_sessions ORDER BY doctor_id, start_time');
  return doctors.map((d) => ({
    ...d,
    label: DEPT_LABELS[d.department] || { en: d.department, ta: d.department, hi: d.department },
    sessions: sessions
      .filter((s) => s.doctor_id === d.id)
      .map((s) => ({ ...s, weekdays: s.weekdays.split(',').map(Number) })),
  }));
}

async function getDoctor(id) {
  return (await listDoctors()).find((d) => d.id === Number(id)) || null;
}

/**
 * Resolve free text from the voice agent / form ("Dr Vishwa", "heart doctor",
 * "சர்க்கரை டாக்டர்", "दिल के डॉक्टर", "2") to a doctor. Returns null if not
 * found or ambiguous.
 */
async function resolveDoctor(doctorText, departmentText) {
  const doctors = await listDoctors();
  const norm = (s) => String(s ?? '').toLowerCase().replace(/\b(dr|doctor|mr|ms|mrs)\.?\b/g, ' ').replace(/[^\p{L}\p{M}\p{N} ]/gu, ' ').replace(/\s+/g, ' ').trim();

  for (const text of [doctorText, departmentText]) {
    const t = norm(text);
    if (!t) continue;
    if (/^\d+$/.test(t)) {
      const byId = doctors.find((d) => d.id === Number(t));
      if (byId) return byId;
    }
    const exact = doctors.find((d) => d.slug === t || norm(d.name) === t);
    if (exact) return exact;
    const hits = doctors.filter((d) => {
      const words = [d.slug, norm(d.name), d.department.toLowerCase(), ...d.keywords.toLowerCase().split(',')];
      return words.some((w) => w && (t.includes(w) || (w.length > 3 && w.includes(t))));
    });
    if (hits.length === 1) return hits[0];
  }
  return null;
}

module.exports = { listDoctors, getDoctor, resolveDoctor, DEPT_LABELS };
