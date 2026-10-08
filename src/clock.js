'use strict';
// All scheduling happens in Asia/Kolkata regardless of the server's timezone.
// Tests can freeze "now" with clock.set().

let frozen = null;

const fmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Kolkata',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

function now() {
  return frozen ? new Date(frozen) : new Date();
}

/** { date: 'YYYY-MM-DD', time: 'HH:MM', minutes, stamp: 'YYYY-MM-DD HH:MM:SS' } in IST */
function nowIST() {
  const p = Object.fromEntries(fmt.formatToParts(now()).map((x) => [x.type, x.value]));
  const date = `${p.year}-${p.month}-${p.day}`;
  const time = `${p.hour}:${p.minute}`;
  return { date, time, minutes: toMinutes(time), stamp: `${date} ${time}:${p.second}` };
}

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}
function fromMinutes(min) {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

// Date arithmetic on plain 'YYYY-MM-DD' strings (UTC math, no TZ drift).
function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function weekday(dateStr) {
  return new Date(`${dateStr}T00:00:00Z`).getUTCDay(); // 0 = Sunday
}
function diffDays(a, b) {
  return Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 86400000);
}
function isValidDate(dateStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const d = new Date(`${dateStr}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === dateStr;
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function prettyDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return `${DAY_NAMES[weekday(dateStr)]}, ${d} ${MONTHS[m - 1]} ${y}`;
}
function prettyTime(hhmm) {
  let [h, m] = hhmm.split(':').map(Number);
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, '0')} ${ap}`;
}

module.exports = {
  now, nowIST, toMinutes, fromMinutes, addDays, weekday, diffDays, isValidDate,
  prettyDate, prettyTime, DAY_NAMES,
  set(dateOrIso) { frozen = dateOrIso ? new Date(dateOrIso).getTime() : null; },
};
