'use strict';
// `npm run db:setup` — creates the database (MySQL), tables, doctors and counters.
// Safe to run repeatedly.
const config = require('../config');
const { init, close } = require('./index');
const { migrate } = require('./schema');
const { seed } = require('./seed');

async function ensureMysqlDatabase() {
  const mysql = require('mysql2/promise');
  const c = await mysql.createConnection({
    host: config.db.host, port: config.db.port, user: config.db.user, password: config.db.password,
  });
  await c.query(`CREATE DATABASE IF NOT EXISTS \`${config.db.database.replace(/`/g, '')}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await c.end();
}

async function main() {
  if (config.db.client === 'mysql') {
    if (!config.db.user) throw new Error('DB_USER is not set in .env');
    await ensureMysqlDatabase();
  }
  const conn = init();
  await migrate(conn);
  await seed(conn, config.booking.slotMinutes);
  console.log(`Database ready (${config.db.client}${config.db.client === 'sqlite' ? ': ' + config.db.sqliteFile : ': ' + config.db.database}).`);
  await close();
}

if (require.main === module) {
  main().catch((e) => { console.error('Database setup failed:', e.message); process.exit(1); });
}
module.exports = { main };
