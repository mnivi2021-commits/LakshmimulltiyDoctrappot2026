'use strict';
// Hospital doctors and their consulting sessions. Weekdays: 0=Sun … 6=Sat.
// ASSUMPTION: doctors consult Monday–Saturday; Sunday is a holiday. Change
// `weekdays` in the doctor_sessions table (or here before setup) if needed.
const clock = require('../clock');

const DOCTORS = [
  {
    slug: 'vijul', name: 'Mr. Vijul', qualification: 'MBBS, MS', department: 'Orthopaedic', sort_order: 1,
    keywords: 'vijul,vijay,ortho,orthopaedic,orthopedic,bone,joint,fracture,knee,back pain,எலும்பு,மூட்டு,ஆர்த்தோ,விஜுல்,हड्डी,जोड़,ऑर्थो,विजुल',
    sessions: [
      { session: 'morning', start_time: '10:00', end_time: '13:30' },
      { session: 'evening', start_time: '18:00', end_time: '22:00' },
    ],
  },
  {
    slug: 'vishwa', name: 'Mr. Vishwa', qualification: 'MBBS, MD', department: 'Diabetology', sort_order: 2,
    keywords: 'vishwa,viswa,diabetes,diabetic,diabetologist,diabetology,sugar,insulin,சர்க்கரை,நீரிழிவு,சுகர்,விஷ்வா,शुगर,मधुमेह,डायबिटीज,विश्वा',
    sessions: [
      { session: 'morning', start_time: '09:30', end_time: '14:00' },
      { session: 'evening', start_time: '17:00', end_time: '20:00' },
    ],
  },
  {
    slug: 'nivi', name: 'Ms. Nivi', qualification: 'MBBS, MS', department: 'Cardiology', sort_order: 3,
    keywords: 'nivi,heart,cardio,cardiology,cardiologist,heart specialist,chest pain,bp,blood pressure,இதய,இருதய,நெஞ்சு,நிவி,दिल,हृदय,हार्ट,निवि',
    sessions: [
      { session: 'morning', start_time: '10:00', end_time: '14:00' },
      { session: 'evening', start_time: '17:00', end_time: '20:00' },
    ],
  },
];

async function seed(conn, slotMinutes = 15) {
  for (const d of DOCTORS) {
    let row = await conn.get('SELECT id FROM doctors WHERE slug = ?', [d.slug]);
    if (!row) {
      const r = await conn.run(
        'INSERT INTO doctors (slug, name, qualification, department, keywords, slot_minutes, active, sort_order) VALUES (?,?,?,?,?,?,1,?)',
        [d.slug, d.name, d.qualification, d.department, d.keywords, slotMinutes, d.sort_order],
      );
      row = { id: r.insertId };
    }
    for (const s of d.sessions) {
      const exists = await conn.get('SELECT id FROM doctor_sessions WHERE doctor_id = ? AND session = ?', [row.id, s.session]);
      if (!exists) {
        await conn.run(
          'INSERT INTO doctor_sessions (doctor_id, session, start_time, end_time, weekdays) VALUES (?,?,?,?,?)',
          [row.id, s.session, s.start_time, s.end_time, '1,2,3,4,5,6'],
        );
      }
    }
  }
  const c = await conn.get("SELECT value FROM counters WHERE name = 'appointment'");
  if (!c) await conn.run("INSERT INTO counters (name, value) VALUES ('appointment', 0)");
  return clock.nowIST().stamp;
}

module.exports = { seed, DOCTORS };
