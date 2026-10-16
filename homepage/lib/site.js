// Real hospital details in one place. The phone number is used ONLY in tel:
// links – never render it as visible text.
export const CALL_NUMBER = '+919429390825';
export const TEL = `tel:${CALL_NUMBER}`;

// Cloudflare Worker relay → Google Sheet "Requests" (no secret in the browser).
export const WEBCHAT_URL = 'https://lakshmi-sheets.mnivi2021.workers.dev/webchat';

export const HOSPITAL = {
  name: 'Lakshmi Multispecialty Hospital',
  nameTa: 'லட்சுமி மல்டிஸ்பெஷாலிட்டி மருத்துவமனை',
  address: 'Virudhunagar, Tamil Nadu',
  addressTa: 'விருதுநகர், தமிழ்நாடு',
};

// Replace with the exact embed link (Google Maps → Share → Embed a map) when available.
export const MAP_EMBED = 'https://maps.google.com/maps?q=Lakshmi%20Multispecialty%20Hospital%2C%20Virudhunagar&output=embed';
export const MAP_LINK = 'https://www.google.com/maps/search/?api=1&query=Lakshmi%20Multispecialty%20Hospital%20Virudhunagar';

export const OPD_HOURS = [
  { day: 'Monday – Saturday', dayTa: 'திங்கள் – சனி', morning: '9:30 AM – 2:00 PM', evening: '5:00 PM – 10:00 PM' },
  { day: 'Sunday', dayTa: 'ஞாயிறு', closed: true },
];

// photo: put a file in /public/doctors/ and set e.g. photo: '/doctors/vijul.jpg'
export const DOCTORS = [
  {
    slug: 'vijul', name: 'Mr. Vijul', qualification: 'MBBS, MS', speciality: 'Orthopaedic',
    department: 'Orthopaedics', departmentTa: 'எலும்பு மருத்துவம்', days: 'Monday – Saturday',
    sessions: ['10:00 AM – 1:30 PM', '6:00 PM – 10:00 PM'], photo: '/doctors/dr-vijul.jpg',
  },
  {
    slug: 'vishwa', name: 'Mr. Vishwa', qualification: 'MBBS, MD', speciality: 'Diabetologist',
    department: 'Diabetology', departmentTa: 'சர்க்கரை நோய்', days: 'Monday – Saturday',
    sessions: ['9:30 AM – 2:00 PM', '5:00 PM – 8:00 PM'], photo: '/doctors/dr-vishwa.jpg',
  },
  {
    slug: 'nivi', name: 'Ms. Nivi', qualification: 'MBBS, MS', speciality: 'Heart Specialist',
    department: 'Cardiology', departmentTa: 'இதய மருத்துவம்', days: 'Monday – Saturday',
    sessions: ['10:00 AM – 2:00 PM', '5:00 PM – 8:00 PM'], photo: '/doctors/dr-nivi.jpg',
  },
];

// Same label format the Sheet already uses ("Mr. Vijul – Orthopaedic").
export const doctorLabel = (d) => `${d.name} – ${d.speciality}`;

// Events so any button can open the chat or preselect a doctor in the form.
export const OPEN_CHAT = 'lmh:open-chat';
export const BOOK_DOCTOR = 'lmh:book-doctor';

export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function isSunday(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).getDay() === 0;
}
export function normaliseMobile(v) {
  let d = String(v || '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? d : '';
}
export const validRequestNo = (v) => (/^LMH\d{4,}$/.test(String(v || '')) ? String(v) : '');

/** POST as text/plain (no CORS preflight). Resolves to the Worker JSON or null. */
export async function postToSheet(payload, { keepalive = false, signal } = {}) {
  try {
    const body = JSON.stringify(payload);
    const r = await fetch(WEBCHAT_URL, {
      method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body, signal, keepalive: keepalive && body.length < 60000,
    });
    const j = await r.json().catch(() => ({}));
    return r.ok && j && j.ok === true ? j : null;
  } catch {
    return null;
  }
}
