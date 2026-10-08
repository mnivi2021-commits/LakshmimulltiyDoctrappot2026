'use strict';
const path = require('path');
const express = require('express');
const config = require('./config');
const { securityHeaders, rateLimit } = require('./middleware/security');
const chat = require('./services/chat');
const pages = require('./views/pages');

const app = express();
app.disable('x-powered-by');
if (config.trustProxy || process.env.VERCEL) app.set('trust proxy', 1);

app.use(securityHeaders);
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false, limit: '20kb' }));
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
