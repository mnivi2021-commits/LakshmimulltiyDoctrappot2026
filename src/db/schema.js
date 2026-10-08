'use strict';
// Schema for both dialects. Dates are 'YYYY-MM-DD' strings and times 'HH:MM'
// (IST) so neither driver applies timezone conversion to appointment slots.
//
// Double-booking guard: appointments.slot_key = 'doctorId|date|time' while the
// appointment is active and NULL once cancelled. A UNIQUE index on slot_key
// makes the database itself reject a second booking for the same slot.

function ddl(dialect) {
  const my = dialect === 'mysql';
  const pk = my ? 'INT UNSIGNED AUTO_INCREMENT PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT';
  const fk = my ? 'INT UNSIGNED' : 'INTEGER';
  const text = my ? 'TEXT' : 'TEXT';
  const tail = my ? ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci' : '';

  return [
    `CREATE TABLE IF NOT EXISTS doctors (
      id ${pk},
      slug VARCHAR(40) NOT NULL UNIQUE,
      name VARCHAR(80) NOT NULL,
      qualification VARCHAR(80) NOT NULL,
      department VARCHAR(60) NOT NULL,
      keywords VARCHAR(500) NOT NULL DEFAULT '',
      slot_minutes INT NOT NULL DEFAULT 15,
      active TINYINT NOT NULL DEFAULT 1,
      sort_order INT NOT NULL DEFAULT 0
    )${tail}`,

    `CREATE TABLE IF NOT EXISTS doctor_sessions (
      id ${pk},
      doctor_id ${fk} NOT NULL,
      session VARCHAR(10) NOT NULL,
      start_time VARCHAR(5) NOT NULL,
      end_time VARCHAR(5) NOT NULL,
      weekdays VARCHAR(20) NOT NULL DEFAULT '1,2,3,4,5,6',
      UNIQUE (doctor_id, session),
      FOREIGN KEY (doctor_id) REFERENCES doctors(id)
    )${tail}`,

    `CREATE TABLE IF NOT EXISTS doctor_leaves (
      id ${pk},
      doctor_id ${fk} NOT NULL,
      leave_date VARCHAR(10) NOT NULL,
      session VARCHAR(10) NOT NULL DEFAULT 'full',
      reason VARCHAR(200) NOT NULL DEFAULT '',
      created_by VARCHAR(60) NOT NULL DEFAULT '',
      created_at DATETIME NOT NULL,
      UNIQUE (doctor_id, leave_date, session),
      FOREIGN KEY (doctor_id) REFERENCES doctors(id)
    )${tail}`,

    `CREATE TABLE IF NOT EXISTS counters (
      name VARCHAR(40) PRIMARY KEY,
      value INT NOT NULL
    )${tail}`,

    `CREATE TABLE IF NOT EXISTS appointments (
      id ${pk},
      appointment_no VARCHAR(20) NOT NULL UNIQUE,
      doctor_id ${fk} NOT NULL,
      department VARCHAR(60) NOT NULL,
      appointment_date VARCHAR(10) NOT NULL,
      appointment_time VARCHAR(5) NOT NULL,
      session VARCHAR(10) NOT NULL,
      patient_name VARCHAR(80) NOT NULL,
      mobile VARCHAR(10) NOT NULL,
      reason VARCHAR(300) NOT NULL,
      patient_type VARCHAR(10) NOT NULL,
      language VARCHAR(5) NOT NULL DEFAULT 'en',
      source VARCHAR(20) NOT NULL,
      status VARCHAR(20) NOT NULL,
      slot_key VARCHAR(40) NULL UNIQUE,
      call_id VARCHAR(100) NULL,
      cancel_reason VARCHAR(200) NULL,
      suggested_date VARCHAR(10) NULL,
      suggested_time VARCHAR(5) NULL,
      reminder_sent_at DATETIME NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      FOREIGN KEY (doctor_id) REFERENCES doctors(id)
    )${tail}`,
    `CREATE INDEX ${my ? '' : 'IF NOT EXISTS '}idx_appt_doctor_date ON appointments (doctor_id, appointment_date)`,
    `CREATE INDEX ${my ? '' : 'IF NOT EXISTS '}idx_appt_mobile ON appointments (mobile)`,
    `CREATE INDEX ${my ? '' : 'IF NOT EXISTS '}idx_appt_date_status ON appointments (appointment_date, status)`,

    `CREATE TABLE IF NOT EXISTS appointment_events (
      id ${pk},
      appointment_id ${fk} NOT NULL,
      event VARCHAR(30) NOT NULL,
      details ${text},
      actor VARCHAR(60) NOT NULL,
      created_at DATETIME NOT NULL,
      FOREIGN KEY (appointment_id) REFERENCES appointments(id)
    )${tail}`,

    `CREATE TABLE IF NOT EXISTS notifications (
      id ${pk},
      appointment_id ${fk} NULL,
      event_type VARCHAR(40) NOT NULL,
      audience VARCHAR(10) NOT NULL,
      recipient VARCHAR(15) NOT NULL,
      message ${text} NOT NULL,
      status VARCHAR(20) NOT NULL,
      provider_message_id VARCHAR(120) NULL,
      error VARCHAR(500) NULL,
      attempts INT NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL,
      sent_at DATETIME NULL
    )${tail}`,
    `CREATE INDEX ${my ? '' : 'IF NOT EXISTS '}idx_notif_created ON notifications (created_at)`,

    `CREATE TABLE IF NOT EXISTS staff_requests (
      id ${pk},
      patient_name VARCHAR(80) NULL,
      mobile VARCHAR(10) NULL,
      reason VARCHAR(500) NOT NULL,
      language VARCHAR(5) NULL,
      source VARCHAR(20) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'open',
      created_at DATETIME NOT NULL
    )${tail}`,

    `CREATE TABLE IF NOT EXISTS voice_calls (
      id ${pk},
      call_id VARCHAR(100) NULL,
      caller_mobile VARCHAR(15) NULL,
      language VARCHAR(10) NULL,
      summary ${text},
      outcome VARCHAR(40) NULL,
      appointment_no VARCHAR(20) NULL,
      raw ${text},
      created_at DATETIME NOT NULL
    )${tail}`,
  ];
}

async function migrate(conn) {
  for (const stmt of ddl(conn.dialect)) {
    try {
      await conn.run(stmt);
    } catch (e) {
      // MySQL has no CREATE INDEX IF NOT EXISTS — ignore "duplicate key name".
      if (e.code === 'ER_DUP_KEYNAME') continue;
      throw e;
    }
  }
}

module.exports = { ddl, migrate };
