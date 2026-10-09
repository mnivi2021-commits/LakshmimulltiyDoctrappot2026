'use strict';
// `npm run db:check` — read-only check of the database configured in .env:
// connection, server version, tables and row counts. Changes nothing.
const config = require('../src/config');

async function main() {
  if (config.db.client !== 'mysql') {
    console.log(`DB_CLIENT=${config.db.client} – this check is for MySQL only.`);
    return;
  }
  const mysql = require('mysql2/promise');
  const where = `${config.db.user}@${config.db.host}:${config.db.port}`;
  let c;
  try {
    c = await mysql.createConnection({ host: config.db.host, port: config.db.port, user: config.db.user, password: config.db.password });
  } catch (e) {
    console.error(`✖ Cannot connect to MySQL as ${where}: ${e.code || ''} ${e.message}`);
    if (e.code === 'ER_ACCESS_DENIED_ERROR') console.error('  → Wrong DB_USER/DB_PASSWORD for the server on this port.');
    if (e.code === 'ECONNREFUSED') console.error('  → No MySQL server is listening. Start MySQL in the XAMPP Control Panel.');
    process.exit(1);
  }
  const [[v]] = await c.query('SELECT VERSION() AS version, @@port AS port');
  console.log(`✔ Connected as ${where} – server ${v.version} (port ${v.port})`);
  const [dbs] = await c.query('SHOW DATABASES LIKE ?', [config.db.database]);
  if (!dbs.length) {
    console.log(`✖ Database "${config.db.database}" does not exist yet → run: npm run db:setup`);
    await c.end();
    process.exit(1);
  }
  await c.query(`USE \`${config.db.database}\``);
  const [tables] = await c.query('SHOW TABLES');
  console.log(`✔ Database "${config.db.database}" – ${tables.length} tables:`);
  for (const row of tables) {
    const name = Object.values(row)[0];
    const [[n]] = await c.query(`SELECT COUNT(*) AS n FROM \`${name}\``);
    console.log(`   ${name.padEnd(20)} ${n.n} rows`);
  }
  await c.end();
}

main().catch((e) => { console.error('✖', e.message); process.exit(1); });
