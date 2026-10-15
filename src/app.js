'use strict';
const path = require('path');
const express = require('express');
const config = require('./config');
const { securityHeaders, rateLimit } = require('./middleware/security');
const chat = require('./services/chat');
const pages = require('./views/pages');

const fs = require('fs');
const crypto = require('crypto');

const cspCache = new Map(); // file → { mtimeMs, csp }
function inlineHashes(html, tag) {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'g');
  const out = [];
  let m;
  while ((m = re.exec(html))) out.push(`'sha256-${crypto.createHash('sha256').update(m[1], 'utf8').digest('base64')}'`);
  return out.join(' ');
}
function patientPageCsp(req, res, next) {
  const file = path.join(__dirname, '..', 'public', path.basename(req.path));
  try {
    const { mtimeMs } = fs.statSync(file);
    let entry = cspCache.get(file);
    if (!entry || entry.mtimeMs !== mtimeMs) {
      const html = fs.readFileSync(file, 'utf8');
      entry = {
        mtimeMs,
        csp: [
          "default-src 'self'", `script-src 'self' ${inlineHashes(html, 'script')}`,
          `style-src 'self' https://fonts.googleapis.com ${inlineHashes(html, 'style')}`,
          "font-src 'self' https://fonts.gstatic.com", "img-src 'self' data:", "connect-src 'self' https://lakshmi-sheets.mnivi2021.workers.dev",
          "frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'",
        ].join('; '),
      };
      cspCache.set(file, entry);
    }
    res.setHeader('Content-Security-Policy', entry.csp);
    res.setHeader('Cache-Control', 'no-cache');
  } catch { /* file missing → static 404 */ }
  next();
}

const app = express();
app.disable('x-powered-by');
if (config.trustProxy || process.env.VERCEL) app.set('trust proxy', 1);

app.use(securityHeaders);
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false, limit: '20kb' }));
// The single-file patient page (public/index.html) keeps its CSS/JS inline.
// Allow exactly that inline code by SHA-256 hash (recomputed when the file
// changes, e.g. after editing its phone-number constants) plus Google Fonts;
// every other page keeps the strict policy above.
app.get(['/index.html', '/patient.html'], patientPageCsp);
app.use(express.static(path.join(__dirname, '..', 'public'), { maxAge: config.isProduction ? '7d' : 0, index: false }));

app.get('/healthz', (req, res) => res.json({ ok: true }));

app.use(require('./routes/public').router);
app.use(require('./routes/voice').router);
app.use(require('./routes/admin').router);

// AI chat receptionist — same booking service as the voice agent and the form.
app.post('/api/chat', rateLimit({ windowMs: 60e3, max: 40, name: 'chat' }), async (req, res, next) => {
  try { res.json(await chat.handle(req.body || {})); } catch (e) { next(e); }
});

pages.mount(app);

app.use('/api', (req, res) => res.status(404).json({ success: false, message: 'Not found' }));
app.use((req, res) => res.status(404).send(pages.notFound()));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[error]', err);
  if (err.type === 'entity.parse.failed') return res.status(400).json({ success: false, message: 'Invalid JSON' });
  res.status(500).json({ success: false, message: 'Something went wrong. Nothing was booked. Please try again.' });
});

module.exports = app;
