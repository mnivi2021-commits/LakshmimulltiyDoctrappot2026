'use strict';
const crypto = require('crypto');
const config = require('../config');

/** Strict headers; all scripts/styles are same-origin files (no inline JS). */
function securityHeaders(req, res, next) {
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'", "script-src 'self'", "style-src 'self'", "img-src 'self' data:",
    "connect-src 'self'", "font-src 'self'", "frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'",
  ].join('; '));
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (config.isProduction) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
}

/** Simple fixed-window in-memory limiter (per instance). */
function rateLimit({ windowMs, max, name }) {
  const hits = new Map();
  return (req, res, next) => {
    const key = `${name}:${req.ip}`;
    const now = Date.now();
    const e = hits.get(key);
    if (!e || now > e.reset) hits.set(key, { n: 1, reset: now + windowMs });
    else if (++e.n > max) {
      res.setHeader('Retry-After', Math.ceil((e.reset - now) / 1000));
      return res.status(429).json({ success: false, message: 'Too many requests. Please try again shortly.' });
    }
    if (hits.size > 10000) for (const [k, x] of hits) if (now > x.reset) hits.delete(k);
    next();
  };
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a)); const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/** OmniDimension → backend: shared secret in X-Webhook-Secret or Authorization: Bearer. */
function requireWebhookSecret(req, res, next) {
  const secret = config.omnidim.webhookSecret;
  if (!secret) return res.status(503).json({ success: false, message: 'Voice integration is not configured on the server.' });
  const auth = req.get('authorization') || '';
  const given = req.get('x-webhook-secret') || (auth.startsWith('Bearer ') ? auth.slice(7) : '') ||
    (config.omnidim.allowQuerySecret ? req.query.key : '');
  if (!given || !safeEqual(given, secret)) return res.status(401).json({ success: false, message: 'Unauthorized' });
  next();
}

// ---- Admin session: HMAC-signed, HttpOnly, SameSite=Strict cookie ----
const COOKIE = 'lmh_admin';

function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const mac = crypto.createHmac('sha256', config.admin.sessionSecret).update(body).digest('base64url');
  return `${body}.${mac}`;
}
function verify(token) {
  if (!token || !config.admin.sessionSecret) return null;
  const [body, mac] = token.split('.');
  if (!body || !mac) return null;
  const expect = crypto.createHmac('sha256', config.admin.sessionSecret).update(body).digest('base64url');
  if (!safeEqual(mac, expect)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString());
    return p.exp > Date.now() ? p : null;
  } catch { return null; }
}
function readCookie(req, name) {
  const m = (req.headers.cookie || '').split(/;\s*/).find((c) => c.startsWith(`${name}=`));
  return m ? decodeURIComponent(m.slice(name.length + 1)) : null;
}

function adminConfigured() {
  return Boolean(config.admin.password && config.admin.sessionSecret && config.admin.sessionSecret.length >= 32);
}

function login(req, res, username, password) {
  if (!adminConfigured()) return false;
  if (!safeEqual(username || '', config.admin.username) | !safeEqual(password || '', config.admin.password)) return false;
  const token = sign({ u: config.admin.username, exp: Date.now() + config.admin.sessionHours * 3600e3 });
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${config.admin.sessionHours * 3600}${config.isProduction ? '; Secure' : ''}`);
  return true;
}
function logout(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${config.isProduction ? '; Secure' : ''}`);
}
function currentAdmin(req) {
  return verify(readCookie(req, COOKIE));
}

/** API guard: valid session + custom header (blocks cross-site form posts). */
function requireAdminApi(req, res, next) {
  const s = currentAdmin(req);
  if (!s) return res.status(401).json({ success: false, message: 'Please log in.' });
  if (req.method !== 'GET' && req.get('x-requested-with') !== 'lmh-admin') {
    return res.status(403).json({ success: false, message: 'Bad request origin.' });
  }
  req.admin = s;
  next();
}

module.exports = { securityHeaders, rateLimit, requireWebhookSecret, login, logout, currentAdmin, requireAdminApi, adminConfigured, safeEqual };
