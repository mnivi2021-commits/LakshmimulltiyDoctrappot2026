-- Lakshmi Multispecialty Hospital – MySQL 8 schema (generated from src/db/schema.js).
-- Normally you do NOT need this: `npm run db:setup` creates everything and seeds doctors.
-- Manual use: mysql -u <user> -p < db/schema.mysql.sql

CREATE DATABASE IF NOT EXISTS lakshmi_hospital CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE lakshmi_hospital;

CREATE TABLE IF NOT EXISTS doctors (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  slug VARCHAR(40) NOT NULL UNIQUE,
  name VARCHAR(80) NOT NULL,
  qualification VARCHAR(80) NOT NULL,
  department VARCHAR(60) NOT NULL,
  keywords VARCHAR(500) NOT NULL DEFAULT '',
  slot_minutes INT NOT NULL DEFAULT 15,
  active TINYINT NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS doctor_sessions (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  doctor_id INT UNSIGNED NOT NULL,
  session VARCHAR(10) NOT NULL,
  start_time VARCHAR(5) NOT NULL,
  end_time VARCHAR(5) NOT NULL,
  weekdays VARCHAR(20) NOT NULL DEFAULT '1,2,3,4,5,6',
  UNIQUE (doctor_id, session),
  FOREIGN KEY (doctor_id) REFERENCES doctors(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS doctor_leaves (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  doctor_id INT UNSIGNED NOT NULL,
  leave_date VARCHAR(10) NOT NULL,
  session VARCHAR(10) NOT NULL DEFAULT 'full',
  reason VARCHAR(200) NOT NULL DEFAULT '',
  created_by VARCHAR(60) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL,
  UNIQUE (doctor_id, leave_date, session),
  FOREIGN KEY (doctor_id) REFERENCES doctors(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS counters (
  name VARCHAR(40) PRIMARY KEY,
  value INT NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS appointments (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  appointment_no VARCHAR(20) NOT NULL UNIQUE,
  doctor_id INT UNSIGNED NOT NULL,
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_appt_doctor_date ON appointments (doctor_id, appointment_date);

CREATE INDEX idx_appt_mobile ON appointments (mobile);

CREATE INDEX idx_appt_date_status ON appointments (appointment_date, status);

CREATE TABLE IF NOT EXISTS appointment_events (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  appointment_id INT UNSIGNED NOT NULL,
  event VARCHAR(30) NOT NULL,
  details TEXT,
  actor VARCHAR(60) NOT NULL,
  created_at DATETIME NOT NULL,
  FOREIGN KEY (appointment_id) REFERENCES appointments(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notifications (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  appointment_id INT UNSIGNED NULL,
  event_type VARCHAR(40) NOT NULL,
  audience VARCHAR(10) NOT NULL,
  recipient VARCHAR(15) NOT NULL,
  message TEXT NOT NULL,
  status VARCHAR(20) NOT NULL,
  provider_message_id VARCHAR(120) NULL,
  error VARCHAR(500) NULL,
  attempts INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL,
  sent_at DATETIME NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_notif_created ON notifications (created_at);

CREATE TABLE IF NOT EXISTS staff_requests (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  patient_name VARCHAR(80) NULL,
  mobile VARCHAR(10) NULL,
  reason VARCHAR(500) NOT NULL,
  language VARCHAR(5) NULL,
  source VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  created_at DATETIME NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS voice_calls (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  call_id VARCHAR(100) NULL,
  caller_mobile VARCHAR(15) NULL,
  language VARCHAR(10) NULL,
  summary TEXT,
  outcome VARCHAR(40) NULL,
  appointment_no VARCHAR(20) NULL,
  raw TEXT,
  created_at DATETIME NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Then run: npm run db:setup   (seeds the 3 doctors, sessions and the LMH counter)
