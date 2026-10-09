# OmniDimension – connect the always-on Google Sheet

Do `SETUP.md` first, so you have your **/exec URL** and your **SHEETS_SECRET**.

Below, `YOUR_EXEC_URL` means the Google web-app link ending in `/exec`, and `YOUR_SECRET` means your SHEETS_SECRET. Never type the secret into the agent's prompt or instructions; it goes only in the fields below.

---

## Step 1 – Add the Custom API "save_request"

1. In OmniDimension, open **Integrations → Custom API → + New / Add**.
2. Fill in:
   - **Integration name:** `save_request`
   - **Description:** `Saves the caller's details for hospital staff to call back when the booking system is unavailable. Does not book an appointment.`
   - **URL:** `YOUR_EXEC_URL`
   - **Method:** `POST`
   - **Header:** `Content-Type` = `application/json`
3. Add these **body parameters**:

| Name | Type | Required | AI Generated | Value / description |
|---|---|---|---|---|
| secret | string | yes | **OFF** | fixed value: `YOUR_SECRET` |
| type | string | yes | **OFF** | fixed value: `request` |
| patient_name | string | yes | ON | Patient's full name |
| mobile | string | yes | ON | Patient's 10-digit mobile number |
| doctor | string | yes | ON | Doctor or department (Mr. Vijul – Orthopaedic, Mr. Vishwa – Diabetologist, Ms. Nivi – Heart Specialist) |
| preferred_date | string | no | ON | Preferred date |
| preferred_time | string | no | ON | Preferred time or morning/evening |
| reason | string | no | ON | Short reason for visit |
| patient_type | string | no | ON | new or existing |
| language | string | no | ON | Tamil, English or Hindi |

> If OmniDimension won't let you turn AI Generated off or set a fixed value, add `secret` and `type` as normal inputs. Put "Always send exactly: request" in the description of `type`, and type the values in the Test tab. Don't put the secret in the agent's prompt.

4. Open the **Test** tab, fill in test values (secret = your secret, type = `request`, name = `Test Patient`, mobile = `9876543210`, doctor = `Mr. Vijul`) and click **Test API**.
   - Expected: `{"success":true,"say":"Thank you. I have noted your details. …"}`
   - A new row appears in the **Requests** sheet. Delete it afterwards.
   - If you see an empty response or an HTML page instead, OmniDimension isn't following Google's redirect. Stop and tell us.
5. **Save**, then open your agent → **Integrations** tab → attach **save_request**.

## Step 2 – Send every call to the Sheet (Post-Call webhook)

1. Open your agent → **Post-Call** tab.
2. **Delivery Method:** `Webhook`
3. **Webhook URL:** `YOUR_EXEC_URL?key=YOUR_SECRET`
4. **Payload:** Standard JSON. Turn on **Summary**, **Extracted Variables** and **Full Conversation**.
5. Click **Test Connection**, and check that a new row appears in **Call Log**.
6. **Save.**

> This replaces the old post-call webhook that pointed at your PC (`…/api/voice/call-ended`). That one only works while the PC is on. The Google one works all the time.

## Step 3 – Add the offline section to the agent

1. Open your agent → **Conversational Flow** (or Instructions).
2. Add a new section named **When the booking system is unavailable**.
3. Paste the text from `omnidimension/offline-section.md` (everything below its line).
4. **Save / Publish** the agent.

## Step 4 – Test with your PC "off"

You don't have to switch the computer off. Stopping the tunnel has the same effect for OmniDimension.
1. Close the **cloudflared** window (or press **Ctrl+C** in it).
2. In OmniDimension, start a **Web Call** with your agent.
3. Say: "I want to book an appointment with Mr. Vijul tomorrow morning."
4. The agent should:
   1. try to check availability, fail (it may retry once), then say *"Our booking system is not available right now. I will take your details …"*,
   2. ask your name, mobile, doctor, date, time, reason, and new/existing,
   3. read them back,
   4. say *"Thank you. I have noted your details. Our hospital staff will call you back to confirm your appointment."*
   5. It must **not** give an LMH number or say "confirmed".
5. Check the Google Sheet:
   - **Requests:** a new row with Source **AI call – system offline**, Status **New**.
   - **Call Log:** a row for the call (it arrives a minute or so after you hang up).
6. Start **cloudflared** again afterwards. The tunnel address may change, so update the URLs of your PC-based tools (list_doctors, check_availability, book_appointment, staff_callback) if it does.
