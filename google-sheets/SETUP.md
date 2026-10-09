# Google Sheets fallback – setup (about 10 minutes)

This puts a small program inside a Google Sheet. It runs in Google's cloud, so it keeps working **even when the hospital PC is switched off**.

- **Call Log** sheet: one row for every call the AI agent answers.
- **Requests** sheet: patient details the AI agent collects when the booking system on the PC is offline (and, optionally, copies of real bookings when the PC is on).

You need a Google account. No coding is needed: just copy, paste and click.

---

## Step 1 – Create the Google Sheet

1. Go to **https://sheets.google.com** and click **Blank spreadsheet** (the big **+**).
2. Click **Untitled spreadsheet** at the top-left and rename it to:
   **Lakshmi Hospital – Calls & Requests**

You don't need to create any tabs. The script creates **Requests** and **Call Log** automatically on the first call.

## Step 2 – Paste the script

1. In the Sheet's menu, click **Extensions → Apps Script**. A new tab opens.
2. On the left you'll see a file called **Code.gs** with a few lines in it. Click inside it, press **Ctrl+A**, then **Delete**.
3. On your PC, open `google-sheets\Code.gs` from this project. Press **Ctrl+A**, then **Ctrl+C**.
4. Go back to the Apps Script tab, click inside the empty editor and press **Ctrl+V**.
5. Click the **💾 Save** icon (or press **Ctrl+S**). If asked for a project name, type **Lakshmi Hospital Sheet**.

## Step 3 – Set the secret password (SHEETS_SECRET)

This stops strangers from writing into your Sheet.

1. Make a long random password. On your PC, open PowerShell and run:
   ```powershell
   node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
   ```
   Copy the result. **Don't share it or put it in any chat.**
2. In Apps Script, click the **⚙️ Project Settings** (gear) icon on the far left.
3. Scroll down to **Script Properties** and click **Add script property**.
   - **Property:** `SHEETS_SECRET`
   - **Value:** paste your password
4. Click **Save script properties**.

## Step 4 – Publish it as a web app

1. At the top-right, click **Deploy → New deployment**.
2. Click the **⚙️** next to "Select type" and choose **Web app**.
3. Fill in:
   - **Description:** `Lakshmi calls v1`
   - **Execute as:** **Me** (your Google account)
   - **Who has access:** **Anyone**
4. Click **Deploy**.
5. Google asks for permission the first time:
   1. Click **Authorize access** and choose your Google account.
   2. If you see "Google hasn't verified this app", click **Advanced → Go to Lakshmi Hospital Sheet (unsafe)**. It's your own script, so this is expected.
   3. Click **Allow**.
6. Copy the **Web app URL**. It ends in **`/exec`** and looks like this:
   `https://script.google.com/macros/s/AKfy…long…/exec`

   This is your **APPS_SCRIPT_EXEC_URL**.

> "Anyone" access is needed so OmniDimension can reach it. Your **SHEETS_SECRET** protects it: requests without the right secret are refused and nothing is written.

> **If you change the code later:** go to **Deploy → Manage deployments → ✏️ Edit**, set **Version: New version**, then **Deploy**. The URL stays the same.

## Step 5 – Test it from Windows (PowerShell)

Replace `YOUR_EXEC_URL` and `YOUR_SECRET` with your own values. **`-L` is required**, because Google answers with a redirect.

**Health check** (should print `{"ok":true}`):
```powershell
curl.exe -L "YOUR_EXEC_URL"
```

**Test a patient request** (adds a row to **Requests**):
```powershell
curl.exe -L -X POST "YOUR_EXEC_URL" -H "Content-Type: application/json" --data-raw "{\"secret\":\"YOUR_SECRET\",\"type\":\"request\",\"patient_name\":\"Test Patient\",\"mobile\":\"9876543210\",\"doctor\":\"Mr. Vijul - Orthopaedic\",\"preferred_date\":\"2026-10-12\",\"preferred_time\":\"10:30 AM\",\"reason\":\"Test\",\"patient_type\":\"new\",\"language\":\"English\"}"
```
Expected:
`{"success":true,"say":"Thank you. I have noted your details. Our hospital staff will call you back to confirm your appointment."}`

**Test a call log** (adds a row to **Call Log**; the secret is in the URL this time):
```powershell
curl.exe -L -X POST "YOUR_EXEC_URL?key=YOUR_SECRET" -H "Content-Type: application/json" --data-raw "{\"call_id\":\"test-1\",\"phone_number\":\"9876543210\",\"call_report\":{\"summary\":\"Test call\"}}"
```
Expected: `{"success":true}`

**Wrong secret test** (should print `{"success":false}` and add nothing):
```powershell
curl.exe -L -X POST "YOUR_EXEC_URL" -H "Content-Type: application/json" --data-raw "{\"secret\":\"wrong\",\"type\":\"request\"}"
```

Open the Sheet: you should see the **Requests** and **Call Log** tabs with bold, frozen header rows. Delete the test rows afterwards if you like.

## Step 6 – Connect it

- **OmniDimension:** follow `omnidimension/tools.md` (tool **save_request** and the **Post-Call webhook**) and `omnidimension/offline-section.md`.
- **Your PC (optional):** in the project's `.env` file, set:
  ```
  SHEETS_WEBHOOK_URL=YOUR_EXEC_URL
  SHEETS_SECRET=YOUR_SECRET
  ```
  Then restart `npm start`. From then on, every successful AI-call booking and staff-callback is also copied to **Requests** (Status "Booked" / "Callback requested").

---

## Privacy – please read
- **Call Log** stores the **full call transcript**, which can include health details patients mention. Share the Sheet **only** with hospital staff who need it (**Share** button → add their Google accounts as Viewers). Never use "Anyone with the link".
- Never paste **SHEETS_SECRET** in WhatsApp, email or chat. If it leaks, change the Script Property, then update OmniDimension and `.env`.
