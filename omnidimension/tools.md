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

`{{SEND_CONFIRMATION_TOOL}}` is not needed: after every booking the backend itself passes the appointment to the notification service (WhatsApp is connected in a later step).

## C. Responses the agent receives

Always HTTP 200 JSON:
- `success`
- `status`, one of: `available` · `choose_time` · `unavailable` · `needs_info` · `unknown_doctor` · `needs_confirmation` · `booked` · `duplicate` · `system_error`
- `say`: the exact sentence to speak (translated to the caller's language)
- `message`: instructions for the agent
- plus `slot` / `alternatives` / `appointment_no` where relevant

## D. Post-call webhook (agent → Post-Call tab)

| Setting | Value |
|---|---|
| Delivery Method | Webhook |
| Webhook URL | `<PUBLIC_URL>/api/voice/call-ended?key=<OMNIDIM_POSTCALL_SECRET>` |
| Payload | Standard JSON, with **Extracted Variables** enabled. Summary / Full Conversation are not needed: the backend ignores and never stores them. |

Use **Test Connection** to check it works.

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
