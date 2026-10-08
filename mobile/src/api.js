// Talks to the SAME backend as the website and the OmniDimension voice agent.
// EXPO_PUBLIC_API_URL is the public website address (not a secret – it is
// embedded in the app). No keys, tokens or private numbers live in this app.
export const API_URL = (process.env.EXPO_PUBLIC_API_URL || 'http://192.168.1.10:3000').replace(/\/$/, '');

async function request(path, body) {
  const res = await fetch(API_URL + path, body ? {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  } : undefined);
  let json = {};
  try { json = await res.json(); } catch { /* non-JSON */ }
  json._status = res.status;
  return json;
}

export const api = {
  meta: () => request('/api/meta'),
  doctors: () => request('/api/doctors'),
  availability: (doctorId, date) => request(`/api/availability?doctor_id=${encodeURIComponent(doctorId)}&date=${encodeURIComponent(date)}`),
  book: (data) => request('/api/appointments', { ...data, source: 'mobile_app' }),
  status: (appointment_no, mobile) => request('/api/appointments/status', { appointment_no, mobile }),
  cancel: (appointment_no, mobile) => request('/api/appointments/cancel', { appointment_no, mobile }),
  chat: (payload) => request('/api/chat', payload),
};

// Server-side redirects keep the private numbers out of the app.
export const CALL_URL = `${API_URL}/call`;
export const WHATSAPP_URL = `${API_URL}/whatsapp`;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export function addDays(date, n) {
  const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
}
export function prettyDate(date) {
  const d = new Date(`${date}T00:00:00Z`);
  return `${DAYS[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}
export function time12(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}
