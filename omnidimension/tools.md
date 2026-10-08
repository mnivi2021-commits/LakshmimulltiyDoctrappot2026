# OmniDimension → Hospital backend: tool / action mapping

Create one **custom API action (webhook / integration)** in OmniDimension per row. All share:

- **Method:** `POST`
- **Base URL:** `https://<your-deployed-domain>` (for example your Vercel URL). A local `localhost` URL will NOT work — OmniDimension must reach the server over the internet.
- **Headers:**
  - `Content-Type: application/json`
  - `X-Webhook-Secret: <value of OMNIDIM_WEBHOOK_SECRET in your .env>`
    (or `Authorization: Bearer <same value>`)
- **Body:** JSON with the parameters below. Flat JSON is preferred. Bodies wrapped as `{"parameters": {...}}`, `{"args": {...}}` or `{"data": {...}}` are also accepted.
- **Response:** always HTTP 200 JSON with `success`, `status` and a plain-English `message`. The agent prompt tells the agent to relay `message` in the caller's language.

| Prompt-pack placeholder | Action name | Path |
|---|---|---|
| `{{CHECK_AVAILABILITY_TOOL}}` | `check_availability` | `/api/voice/check-availability` |
| `{{CREATE_APPOINTMENT_TOOL}}` | `book_appointment` | `/api/voice/book-appointment` |
| `{{FIND_APPOINTMENT_TOOL}}` | `find_appointment` | `/api/voice/find-appointment` |
| `{{RESCHEDULE_APPOINTMENT_TOOL}}` | `reschedule_appointment` | `/api/voice/reschedule-appointment` |
| `{{CANCEL_APPOINTMENT_TOOL}}` | `cancel_appointment` | `/api/voice/cancel-appointment` |
| `{{CREATE_CALLBACK_TOOL}}` | `staff_callback` | `/api/voice/staff-callback` |
| (doctor info) | `list_doctors` | `/api/voice/doctors` |
| `{{SEND_CONFIRMATION_TOOL}}` | — | Not needed: the backend sends WhatsApp automatically after every booking / change. |
| Post-call webhook | — | `/api/voice/call-ended` |

## Parameters

### check_availability
| name | type | required | description |
|---|---|---|---|
| doctor | string | yes | "Vijul", "Vishwa", "Nivi", or department ("ortho", "diabetes", "heart") |
| appointment_date | string | yes | `YYYY-MM-DD` (also accepts "today", "tomorrow", "நாளை", "kal") |
| session | string | no | `morning` or `evening` |
| appointment_time | string | no | `HH:MM` 24-hour (also "6:30 PM") |

Returns `status`: `available` (with `slot`), `choose_time` (with `alternatives`), or `unavailable` (with `reason` and `alternatives`).

### book_appointment
| name | type | required |
|---|---|---|
| patient_name | string | yes |
| mobile | string | yes – 10-digit Indian mobile |
| doctor | string | yes |
| department | string | no (derived from doctor) |
| appointment_date | string | yes – `YYYY-MM-DD` |
| appointment_time | string | yes – `HH:MM` 24-hour |
| session | string | yes – `morning`/`evening` |
| reason | string | yes |
| patient_type | string | yes – `new`/`existing` |
| language | string | no – `ta`/`en`/`hi` |
| call_id | string | no – OmniDimension call id, stored for audit |

Returns `status`: `booked` (with `appointment_no`), `unavailable` (+ `alternatives`), `needs_info` (+ `missing`), `duplicate`, or `system_error`.

### find_appointment
`mobile` (required), `appointment_no` (optional).

### reschedule_appointment
`appointment_no`, `mobile`, `new_date` (`YYYY-MM-DD`), `new_time` (`HH:MM`), `session` (optional).

### cancel_appointment
`appointment_no`, `mobile`, `reason` (optional).

### staff_callback
`patient_name`, `mobile`, `reason` (required), `language`.

### Post-call webhook – /api/voice/call-ended
Point OmniDimension's post-call / end-of-call webhook here, with the same secret header. The backend stores `call_id`, caller number, language, summary, outcome and appointment number (from top-level or `extracted_variables` fields) for **Admin → AI voice calls**.

## Example

```bash
curl -X POST https://<your-domain>/api/voice/check-availability \
  -H "Content-Type: application/json" -H "X-Webhook-Secret: $OMNIDIM_WEBHOOK_SECRET" \
  -d '{"doctor":"Vijul","appointment_date":"2026-10-15","session":"morning","appointment_time":"10:30"}'
```
