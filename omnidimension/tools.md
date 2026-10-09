# OmniDimension dashboard configuration – Lakshmi Multispecialty Hospital

The prompt pack defines tool *placeholders* only (`{{CHECK_AVAILABILITY_TOOL}}` …) and says to map them to your own webhooks. They map to this backend's existing `/api/voice/*` endpoints, which use the **same appointment service and MySQL database** as the website, AI chat and admin dashboard.

`<PUBLIC_URL>` = the public HTTPS address of this backend (a tunnel to your PC for the first test – see README "First real test call" – or your production domain). `localhost` cannot be reached by OmniDimension.

## A. Agent

| Setting | Value |
|---|---|
| Call type / direction | **Incoming** (unchanged) |
| Phone number | your existing OmniDimension number (unchanged) |
| Languages | Tamil, English, Hindi |
| Welcome message | `Welcome to Lakshmi Multispecialty Hospital. How can I help you?` |
| Instructions | contents of `agent-prompt.md` (below the line) |

## B. Custom API integrations (Integrations → Custom API)

Common to every integration:

- **Method:** `POST`
- **Headers:**
  - `Content-Type` = `application/json`
  - `X-Webhook-Secret` = value of `OMNIDIM_WEBHOOK_SECRET` from your `.env`
- **All parameters:** Body parameters, **AI Generated = ON**.

After creating each one, use **Test → Test API**, then attach it to the agent: **agent edit page → Integrations tab → select from dropdown**.

### 1. `check_availability` → `{{CHECK_AVAILABILITY_TOOL}}`
URL `<PUBLIC_URL>/api/voice/check-availability`
Description: *Checks the hospital's real appointment availability. Read-only – never books. Call before offering or confirming any time.*

| Name | Type | Required | Description |
|---|---|---|---|
| doctor | string | yes | Doctor name or specialty the caller asked for (e.g. Vijul, Vishwa, Nivi, orthopaedic, diabetes, heart) |
| appointment_date | string | yes | Date in YYYY-MM-DD (Asia/Kolkata) |
| session | string | no | morning or evening |
| appointment_time | string | no | Preferred time in 24-hour HH:MM |

### 2. `book_appointment` → `{{CREATE_APPOINTMENT_TOOL}}`
URL `<PUBLIC_URL>/api/voice/book-appointment`
Description: *Creates the appointment in the hospital system and returns the official LMH appointment number. Only call after reading back the details and the caller said yes.*

| Name | Type | Required | Description |
|---|---|---|---|
| patient_name | string | yes | Patient's full name |
| mobile | string | yes | Patient's 10-digit mobile number |
| doctor | string | yes | Doctor name (Mr. Vijul, Mr. Vishwa or Ms. Nivi) |
| department | string | no | Orthopaedic, Diabetologist or Heart Specialist |
| appointment_date | string | yes | YYYY-MM-DD, exactly as returned by check_availability |
| appointment_time | string | yes | HH:MM 24-hour, exactly as returned by check_availability |
| session | string | yes | morning or evening |
| reason | string | yes | Short reason for visit |
| patient_type | string | yes | new or existing |
| language | string | no | Caller's language: ta, en or hi |
| call_id | string | no | Current call ID, if available |
| patient_confirmed | boolean | yes | true ONLY if the caller said yes to "Would you like me to confirm this appointment?" |

### 3. `find_appointment` → `{{FIND_APPOINTMENT_TOOL}}`
URL `<PUBLIC_URL>/api/voice/find-appointment` · params: `mobile` (string, required), `appointment_no` (string, optional).

### 4. `reschedule_appointment` → `{{RESCHEDULE_APPOINTMENT_TOOL}}`
URL `<PUBLIC_URL>/api/voice/reschedule-appointment` · params: `appointment_no`, `mobile`, `new_date` (YYYY-MM-DD), `new_time` (HH:MM) – all required strings; `session` optional.

### 5. `cancel_appointment` → `{{CANCEL_APPOINTMENT_TOOL}}`
URL `<PUBLIC_URL>/api/voice/cancel-appointment` · params: `appointment_no`, `mobile` (required), `reason` (optional).

### 6. `staff_callback` → `{{CREATE_CALLBACK_TOOL}}`
URL `<PUBLIC_URL>/api/voice/staff-callback` · params: `reason` (required), `patient_name`, `mobile`, `language` (optional).

### 7. `list_doctors`
URL `<PUBLIC_URL>/api/voice/doctors` · no parameters.

### 8. `save_request` – always-on fallback (Google Sheets)

This is **tool #5 in your OmniDimension list** (after list_doctors, check_availability, book_appointment and staff_callback).

It runs in Google's cloud (`google-sheets/Code.gs`, set up with `google-sheets/SETUP.md`), so it works **even when the hospital PC is off**. The agent uses it only when the booking tools fail (see `offline-section.md`). It saves a *request*, never a booking.

- **URL:** `<APPS_SCRIPT_EXEC_URL>` (the Google web-app link ending in `/exec`, not the tunnel)
- **Method:** `POST`
- **Headers:** `Content-Type` = `application/json`. Google can't read other headers, so no `X-Webhook-Secret` here.
- **Description:** *Saves the caller's details for the hospital staff to call back, when the booking system is unavailable. Does not book an appointment.*

| Name | Type | Required | AI Generated | Value / description |
|---|---|---|---|---|
| secret | string | yes | **OFF – fixed value** | your `SHEETS_SECRET` |
| type | string | yes | **OFF – fixed value** | `request` |
| patient_name | string | yes | ON | Patient's full name |
| mobile | string | yes | ON | Patient's 10-digit mobile number |
| doctor | string | yes | ON | Doctor or department wanted (Mr. Vijul – Orthopaedic, Mr. Vishwa – Diabetologist, Ms. Nivi – Heart Specialist) |
| preferred_date | string | no | ON | Preferred date (YYYY-MM-DD if possible) |
| preferred_time | string | no | ON | Preferred time or morning/evening |
| reason | string | no | ON | Short reason for visit |
| patient_type | string | no | ON | new or existing |
| language | string | no | ON | Language of the call: Tamil, English or Hindi |

**secret and type must not be invented by the AI.** If OmniDimension lets you set a fixed/default value for a parameter, set `secret` = your SHEETS_SECRET and `type` = `request`, and turn **AI Generated OFF** for both. If it only allows AI-generated parameters, add them as inputs, put the fixed values in their description ("Always send exactly: request"), and use those values in **Test API**. Never put the secret in the agent's instructions or prompt.

Response: `{"success":true,"say":"Thank you. I have noted your details. Our hospital staff will call you back to confirm your appointment."}`, or `{"success":false}` if the secret is wrong.

> Google answers through a redirect. If **Test API** shows an empty response or an HTML page instead of the JSON above, OmniDimension isn't following the redirect. Tell me and we'll handle it.

`{{SEND_CONFIRMATION_TOOL}}` is not needed: after every booking the backend itself passes the appointment to the notification service (WhatsApp is connected in a later step).

## C. Responses the agent receives

Always HTTP 200 JSON:
- `success`
- `status`, one of: `available` · `choose_time` · `unavailable` · `needs_info` · `unknown_doctor` · `needs_confirmation` · `booked` · `duplicate` · `system_error`
- `say`: the exact sentence to speak (translated to the caller's language)
- `message`: instructions for the agent
- plus `slot` / `alternatives` / `appointment_no` where relevant

## D. Post-call webhook (agent → Post-Call tab)

**Recommended: send it to Google Sheets, so every call is logged even when the PC is off.**

| Setting | Value |
|---|---|
| Delivery Method | Webhook |
| Webhook URL | `<APPS_SCRIPT_EXEC_URL>?key=<SHEETS_SECRET>` |
| Payload | Standard JSON, with **Summary**, **Extracted Variables** and **Full Conversation** enabled (they go into the **Call Log** sheet) |

Use **Test Connection**, then check a new row appears in **Call Log**.

The **Call Log** stores full transcripts. Share that Google Sheet only with staff who need it.

*Alternative (only while the PC is on):* `<PUBLIC_URL>/api/voice/call-ended?key=<OMNIDIM_POSTCALL_SECRET>` stores structured fields in MySQL instead (no transcripts) and shows them in Admin → *AI voice calls*. It stops working whenever the PC or tunnel is off. If OmniDimension allows only one post-call webhook, use the Google Sheets URL above.

**Extracted variables** (define these in the agent's post-call / extraction settings):

| Variable | Description |
|---|---|
| patient_name | Patient's name |
| mobile | Patient's 10-digit mobile number |
| doctor | Doctor booked (Mr. Vijul / Mr. Vishwa / Ms. Nivi) |
| department | Doctor's department |
| appointment_date | Appointment date YYYY-MM-DD |
| appointment_time | Appointment time HH:MM 24-hour |
| session | morning or evening |
| reason | Short reason for visit |
| appointment_number | LMH appointment number returned by book_appointment, if any |
| appointment_status | booked / not_booked / cancelled / rescheduled / callback_requested |
| call_language | Language of the call: Tamil, English or Hindi |
| call_id | The call ID |

The backend checks every post-call record against the appointments table. If the appointment number and mobile/call ID match, the database values are stored and the row is marked **verified**. Admin → *AI voice calls* shows these records.

## E. Example (what OmniDimension sends)

```bash
curl -X POST <PUBLIC_URL>/api/voice/check-availability \
  -H "Content-Type: application/json" -H "X-Webhook-Secret: <OMNIDIM_WEBHOOK_SECRET>" \
  -d '{"doctor":"Vijul","appointment_date":"2026-10-15","session":"morning","appointment_time":"10:30"}'
```
