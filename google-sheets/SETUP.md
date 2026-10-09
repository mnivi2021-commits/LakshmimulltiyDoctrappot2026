# Google Sheet + Apps Script – setup (about 15 minutes)

This puts a small program inside a Google Sheet. It runs in **Google's cloud**, so it keeps working even when the hospital PC is switched off.

| Sheet tab | What goes in it |
|---|---|
| **Requests** | Appointment requests. They come from the AI call agent when the PC is off, from the WhatsApp chatbot, and (optionally) as copies of real bookings when the PC is on. |
| **Call Log** | One row for every call the AI agent answers |
| **WA Sessions** | Where each WhatsApp chat is up to (used by the chatbot) |
| **WA Errors** | WhatsApp messages that could not be sent |

You need a Google account. No coding is needed: just copy, paste and click.

---

## Step 1 – Create the Google Sheet

1. Go to **https://sheets.google.com** and click **Blank spreadsheet** (the big **+**).
2. Click **Untitled spreadsheet** at the top-left and rename it to:
   **Lakshmi Hospital – Calls & Requests**

## Step 2 – Paste the script files

1. In the Sheet's menu, click **Extensions → Apps Script**. A new tab opens.
2. You'll see a file called **Code.gs**. Click inside it, press **Ctrl+A**, then **Delete**.
3. On your PC, open `google-sheets\Code.gs` from this project. Press **Ctrl+A**, **Ctrl+C**, then paste it into the Apps Script **Code.gs** with **Ctrl+V**.
4. **For the WhatsApp chatbot** (you can skip this if you don't use WhatsApp yet):
   1. Click the **+** next to "Files" and choose **Script**.
   2. Name it `WhatsApp` (Google adds `.gs` itself).
   3. Delete what's inside, then paste the contents of `google-sheets\WhatsApp.gs`.
5. Click **💾 Save** (**Ctrl+S**). If asked for a project name, type **Lakshmi Hospital Sheet**.
6. Optional: at the top, choose the function **setupSheets** and click **▶ Run**. This creates all four tabs now; otherwise they're created on first use. The first run asks for permission (see Step 4.5).

## Step 3 – Set the secrets (Script Properties)

Secrets are stored only here, never in the code.

1. Click **⚙️ Project Settings** (gear icon, far left).
2. Scroll to **Script Properties** and click **Add script property** for each:

| Property | Value | Needed for |
|---|---|---|
| `SHEETS_SECRET` | a long random password (see below) | OmniDimension and your PC |
| `WA_VERIFY_TOKEN` | another random word you make up | WhatsApp (see `WHATSAPP_SETUP.md`) |
| `WA_ACCESS_TOKEN` | Meta permanent access token | WhatsApp |
| `WA_PHONE_NUMBER_ID` | Meta WhatsApp Phone Number ID | WhatsApp |

3. Click **Save script properties**.

To make a random password, run this in PowerShell on your PC:
```powershell
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
```
**Never paste these values into WhatsApp, email or any chat.**

## Step 4 – Publish it as a web app

1. At the top-right, click **Deploy → New deployment**.
2. Click the **⚙️** next to "Select type" and choose **Web app**.
3. Fill in:
   - **Description:** `Lakshmi v1`
   - **Execute as:** **Me**
   - **Who has access:** **Anyone**
4. Click **Deploy**.
5. Google asks for permission the first time:
   1. Click **Authorize access** and choose your account.
   2. If you see "Google hasn't verified this app", click **Advanced → Go to Lakshmi Hospital Sheet (unsafe)**. It's your own script, so this is expected.
   3. Click **Allow**.
6. Copy the **Web app URL**. It ends in **`/exec`**; this is your **YOUR_EXEC_URL**.

> "Anyone" access is required so OmniDimension and Meta can reach it. Requests from OmniDimension and your PC must carry **SHEETS_SECRET**; without it nothing is written.

### After you change the code later (important)

Pasting new code is **not** enough on its own. To publish it **and keep the same URL**:
1. Click **Deploy → Manage deployments**.
2. Click **✏️ Edit** on your existing deployment.
3. Under **Version**, choose **New version**.
4. Click **Deploy**.

Don't use "New deployment" again; that creates a different URL, which you'd then have to update in OmniDimension and Meta.

## Step 5 – Test from Windows (PowerShell)

Replace `YOUR_EXEC_URL` and `YOUR_SECRET` with your own values. **`-L` is required**, because Google answers through a redirect.

**Health check** (should print `{"ok":true}`):
```powershell
curl.exe -L "YOUR_EXEC_URL"
```

**Patient request** (adds a row to **Requests**):
```powershell
curl.exe -L -X POST "YOUR_EXEC_URL" -H "Content-Type: application/json" --data-raw "{\"secret\":\"YOUR_SECRET\",\"type\":\"request\",\"patient_name\":\"Test Patient\",\"mobile\":\"9876543210\",\"doctor\":\"Mr. Vijul - Orthopaedic\",\"preferred_date\":\"2026-10-12\",\"preferred_time\":\"10:30 AM\",\"reason\":\"Test\",\"patient_type\":\"new\",\"language\":\"English\"}"
```
Expected:
`{"success":true,"say":"Thank you. I have noted your details. Our hospital staff will call you back to confirm your appointment."}`

**Call log** (adds a row to **Call Log**; the secret is in the URL this time):
```powershell
curl.exe -L -X POST "YOUR_EXEC_URL?key=YOUR_SECRET" -H "Content-Type: application/json" --data-raw "{\"call_id\":\"test-1\",\"phone_number\":\"9876543210\",\"call_report\":{\"summary\":\"Test call\"}}"
```
Expected: `{"success":true}`

**Wrong secret** (should print `{"success":false}` and add nothing):
```powershell
curl.exe -L -X POST "YOUR_EXEC_URL" -H "Content-Type: application/json" --data-raw "{\"secret\":\"wrong\",\"type\":\"request\"}"
```

Open the Sheet and check the new rows, then delete the test rows if you like.

## Step 6 – Connect it
- **OmniDimension:** follow `OMNIDIMENSION_STEPS.md`.
- **WhatsApp chatbot:** follow `WHATSAPP_SETUP.md`.
- **Your PC (optional):** in the project's `.env` file, set:
  ```
  SHEETS_WEBHOOK_URL=YOUR_EXEC_URL
  SHEETS_SECRET=YOUR_SECRET
  ```
  Then restart `npm start`. Every successful AI-call booking (Source "AI call – booked", Status "Booked", with the LMH number in Reason) and staff callback (Source "AI call – callback", Status "Callback") is then also copied to **Requests**. If Google is slow or down, bookings are never delayed or affected.

---

## Privacy – please read
- **Call Log** stores full call transcripts, and **Requests** stores patients' names and mobiles. Share the Sheet **only** with hospital staff who need it (**Share** → add their Google accounts). Never use "Anyone with the link".
- If a secret leaks:
  1. Change it in **Script Properties**.
  2. Publish a new version (**Manage deployments → Edit → New version**).
  3. Update OmniDimension and `.env`.
