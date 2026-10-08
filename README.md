# Lakshmi Multispecialty Hospital – AI Doctor Appointment System

Viruthunagar, Tamil Nadu · Tamil / English / Hindi

One appointment database, four booking channels, all using the **same** availability and booking code:

```
Website form ─┐
AI chat ──────┤
Mobile app ───┼──► Appointment service (src/services) ──► MySQL
OmniDimension ┘        (checks real slots, locks, saves, issues LMH-0001…)
voice agent                     │
                                └──► WhatsApp Cloud API (staff + optional patient)
```

A slot booked on a voice call disappears from the website, chat and app at once, and the reverse is also true. A database `UNIQUE` index on each active slot makes double-booking impossible, even under simultaneous requests.

## Features

- **Website:** Home, Doctors, Doctor Schedule (live slots), Book Appointment, AI Voice Receptionist, Appointment Status (with cancel), Contact. Mobile-first, large buttons, Tamil/English/Hindi switch. The main buttons are **Book Appointment**, **Talk to AI Receptionist** (phone icon only) and **WhatsApp**.
- **AI Chat Receptionist:** a floating 🤖 button on every page. It handles booking, doctors, timings, check, reschedule, cancel and hospital info, auto-detects Tamil/Hindi, and has language buttons. It only shows slots returned by the database. It runs server-side with no AI provider key.
- **OmniDimension voice agent:** a filled-in master prompt plus webhook tools in [`omnidimension/`](omnidimension/).
- **Booking rules:** never invents a slot; offers the next real slot when a time is taken; if today is closed or full, offers the first slot on the next working day; on doctor leave, makes no booking, offers the next working day and notifies affected patients; prevents duplicate bookings; issues gap-free numbers `LMH-0001`, `LMH-0002`, ….
- **WhatsApp notifications:** new appointment, confirmation, cancellation, rescheduling, doctor leave, doctor unavailable, reminder, staff attention required. Every message is logged with an honest status: `sent` / `failed` / `not_configured` / `dry_run`.
- **Admin dashboard (`/admin`):** today/tomorrow/upcoming lists, search, filter by doctor/date/status, confirm, cancel, reschedule, mark doctor leave, available slots, AI voice bookings and call logs, WhatsApp status with retry, and staff callback requests.
- **Expo Go mobile app:** [`mobile/`](mobile/) — book, doctors, AI chat, status.

## Privacy and security

- The AI call number and the WhatsApp numbers live only in `.env`. The phone button links to `/call`, and the server answers with a redirect to the dialer, so the number is never in any page, script or the mobile app. Automated tests check this.
- Database, WhatsApp, OmniDimension and admin secrets are server-side only. `.env` is git-ignored; `.env.example` is committed.
- OmniDimension calls must carry `X-Webhook-Secret`. Admin uses an HttpOnly, SameSite=Strict signed cookie plus a CSRF header. Rate limits apply on booking, lookup, chat, voice and login. A strict Content-Security-Policy is set.
- Patients can see an appointment only with **appointment number + registered mobile** (or mobile + patient name in chat).

## Project layout

```
server.js               local/VPS entry      api/index.js   Vercel entry
src/config.js           all env settings     src/clock.js   IST time helpers
src/db/                 MySQL + SQLite drivers, schema, seed, setup
src/services/           availability, appointments, notifications, reminders, chat, validate
src/routes/             public.js · voice.js (OmniDimension) · admin.js
src/views/pages.js      server-rendered pages
public/                 css, js (i18n, chat widget, booking, admin), img
omnidimension/          agent-prompt.md, tools.md
mobile/                 Expo Go app
test/                   38 automated tests
db/schema.mysql.sql     reference SQL
```

---

## 1. Local setup (Windows)

Requirements: Node.js 22.13+ (tested on 24) and MySQL 8 (your `MySQL80` service).

```powershell
cd "D:\AI PROJECT\DOCAPPOITMENT"
npm install
copy .env.example .env
notepad .env
```

### Database setup (MySQL)

Create a dedicated MySQL user once (in MySQL Workbench or the `mysql` client, as root):

```sql
CREATE DATABASE lakshmi_hospital CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'lmh_app'@'localhost' IDENTIFIED BY 'choose-a-strong-password';
GRANT ALL PRIVILEGES ON lakshmi_hospital.* TO 'lmh_app'@'localhost';
FLUSH PRIVILEGES;
```

Put those values in `.env` (`DB_USERNAME=lmh_app`, `DB_PASSWORD=…`), then:

```powershell
npm run db:setup     # creates tables, the 3 doctors, their sessions, the LMH counter (safe to re-run)
npm start            # http://localhost:3000   admin: http://localhost:3000/admin
```

**Quick try without MySQL:** set `DB_CLIENT=sqlite` in `.env`, then run `npm run db:setup` and `npm start`. SQLite is for local trials only.

### Required `.env` values

| Variable | Purpose |
|---|---|
| `DB_CLIENT`, `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD` | MySQL connection |
| `DB_SSL`, `DB_SSL_CA` | needed for most cloud MySQL providers (Vercel) |
| `ADMIN_USERNAME`, `ADMIN_PASSWORD` | admin login |
| `SESSION_SECRET` | 32+ random characters; signs admin + chat sessions |
| `AI_RECEPTIONIST_NUMBER` | OmniDimension phone number (private) (your private AI number – set only in .env / Vercel) |
| `WHATSAPP_NUMBER` | staff notification destination (private) (your private staff number – set only in .env / Vercel) |
| `WHATSAPP_API_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` | Meta WhatsApp Cloud API |
| `WHATSAPP_TEMPLATE_NAME`, `WHATSAPP_TEMPLATE_LANG` | optional approved template (see below) |
| `WHATSAPP_NOTIFY_PATIENTS` | `true` to also message patients |
| `WHATSAPP_CHAT_NUMBER` | number the public **WhatsApp** button opens (leave empty to hide) |
| `OMNIDIM_WEBHOOK_SECRET` | shared secret OmniDimension sends |
| `CRON_SECRET` | protects the Vercel reminder cron |

Generate secrets with:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## 2. Tests

```powershell
npm test
```

There are 38 tests on an in-memory database with a frozen clock and a mocked WhatsApp API. They cover website booking, AI voice booking with English/Tamil/Hindi payloads, duplicate and concurrent booking, doctor leave (full day and per session), today closed → next working day, Sunday skip, fully booked day, cancellation, rescheduling, WhatsApp sent/failed, reminders, the chat flow (including Tamil), chat↔voice sharing one DB, admin auth and CSRF, and that private numbers never reach a page or script.

## 3. OmniDimension setup

1. Deploy the backend to a public HTTPS URL (step 5). OmniDimension cannot reach `localhost`.
2. Set `OMNIDIM_WEBHOOK_SECRET` in `.env` / Vercel.
3. In OmniDimension, create the agent and paste [`omnidimension/agent-prompt.md`](omnidimension/agent-prompt.md) into its instructions. Set the opening message to *"Welcome to Lakshmi Multispecialty Hospital. How can I help you?"* and enable Tamil, English and Hindi.
4. Add one custom API action per tool in [`omnidimension/tools.md`](omnidimension/tools.md). Each is a POST to `https://<domain>/api/voice/...` with the header `X-Webhook-Secret`.
5. Point the post-call webhook to `/api/voice/call-ended`.
6. Attach your AI phone number to the agent, and put it in `AI_RECEPTIONIST_NUMBER`.
7. Test-call in Tamil, English and Hindi. Check **Admin → Appointments → AI voice bookings** and **AI voice calls**.

> The OmniDimension connection has **not** been tested end-to-end. It needs your OmniDimension account, the deployed URL and the secret. The backend endpoints are tested with simulated OmniDimension payloads.

## 4. WhatsApp setup (Meta WhatsApp Cloud API)

1. Create a Meta developer app with the WhatsApp product, and add/verify the hospital's business phone number.
2. Copy the **Phone number ID** → `WHATSAPP_PHONE_NUMBER_ID`, and create a **permanent System User access token** → `WHATSAPP_API_TOKEN`.
3. Set `WHATSAPP_NUMBER` to the private staff destination number.
4. WhatsApp only delivers free-form text inside a 24-hour customer-service window. For reliable delivery, create and get approval for a **Utility template** with one body variable `{{1}}`, then set `WHATSAPP_TEMPLATE_NAME` and `WHATSAPP_TEMPLATE_LANG`.
5. Book a test appointment, then check **Admin → WhatsApp status**. `not_configured` means credentials are missing; `failed` shows Meta's error; **Retry** resends.

> WhatsApp is **not** connected yet. It needs your Meta credentials. Sending is tested against a mocked API only.

## 5. Deploy to Vercel

Vercel runs the Express app as one serverless function (`api/index.js` + `vercel.json`). It needs a **cloud MySQL**, because your PC's MySQL is not reachable from Vercel and SQLite isn't persistent there. Options include Aiven MySQL (free tier), TiDB Cloud Serverless (MySQL-compatible), and Railway.

```powershell
npm i -g vercel
vercel login
vercel link
# add every variable from .env.example (Production), e.g.:
vercel env add DB_HOST production
# … repeat for each variable …
vercel --prod
```

Then run the schema once against the cloud database from your PC (with `.env` temporarily pointing to the cloud DB):

```powershell
npm run db:setup
```

**Reminders:** `vercel.json` schedules `/api/cron/reminders` daily at 18:00 IST. Vercel sends `Authorization: Bearer $CRON_SECRET` automatically when `CRON_SECRET` is set.

**Alternative (VPS / Windows server):** `npm start` behind nginx with `TRUST_PROXY=true`. Reminders then run inside the process every 10 minutes.

## 6. Mobile app (Expo Go)

```powershell
cd mobile
copy .env.example .env      # set EXPO_PUBLIC_API_URL
npm install
npx expo start
```

Scan the QR code with **Expo Go** (Android) or the Camera app (iOS).

- Testing against your PC: run the backend with `npm start`, then set `EXPO_PUBLIC_API_URL=http://<your-PC-LAN-IP>:3000`. The phone must be on the same Wi-Fi, and Windows Firewall must allow port 3000.
- In production: `EXPO_PUBLIC_API_URL=https://<your-vercel-domain>`.

The app holds **no secrets**; `EXPO_PUBLIC_API_URL` is just the public site address.

## Assumptions to confirm

- Doctors consult **Monday–Saturday**, Sunday holiday (change `weekdays` in `doctor_sessions`).
- Slots are **15 minutes**; same-day bookings need **30 minutes** lead time; booking window is **30 days** (all in `.env`).
- Doctor titles are shown exactly as provided (Mr./Ms.).
- The public **WhatsApp** button uses `WHATSAPP_CHAT_NUMBER`, separate from the private notification number, so the private number stays hidden.
