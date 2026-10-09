'use strict';
// `npm run test:mysql` — runs the full test suite against MySQL/MariaDB using
// the credentials in .env and the separate TEST_DB_NAME database.
const { spawnSync } = require('child_process');

const r = spawnSync(process.execPath, ['--test', '--test-concurrency=1', 'test/**/*.test.js'], {
  stdio: 'inherit',
  env: { ...process.env, TEST_DB_CLIENT: 'mysql' },
});
process.exit(r.status ?? 1);
