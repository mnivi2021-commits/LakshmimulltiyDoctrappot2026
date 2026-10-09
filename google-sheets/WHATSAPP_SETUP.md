# WhatsApp chatbot – setup (Meta WhatsApp Business Cloud API)

The chatbot runs in **Google Apps Script** (`WhatsApp.gs`), so it answers patients even when the hospital PC is off. It collects appointment **requests** and saves them to the **Requests** sheet. It never books, never gives an appointment number, and never gives medical advice.

Do `SETUP.md` first, so `WhatsApp.gs` is pasted and you have your **/exec URL**.

> ⚠️ **You need a phone number that is NOT on the WhatsApp or WhatsApp Business app.** Meta's Cloud API can't use a number that is already registered in the phone app. Use a new SIM or landline, or delete the WhatsApp account on that number first. That number becomes the hospital's chatbot number.

---

## Step 1 – Create the Meta app

1. Go to **https://developers.facebook.com** and log in with Facebook.
2. Click **My Apps → Create App**.
3. Choose **Other → Business** (or the "Connect with customers through WhatsApp" use case), give it a name like **Lakshmi Hospital Bot**, and create it.
4. On the app dashboard, find **WhatsApp** and click **Set up**. Choose or create your **Meta Business Account** (Business Portfolio).

## Step 2 – Add the hospital's phone number

1. Open **WhatsApp → API Setup** (also called "Getting started").
2. Under **Step 5 / Add phone number**, add the hospital number (the one **not** on the WhatsApp app). Verify it with the SMS or voice code.
3. Set the **display name** to Lakshmi Multispecialty Hospital. Meta reviews it.
4. Copy the **Phone number ID**, a long number shown under the phone number. ⚠️ This is **not** the phone number itself.

## Step 3 – Create a permanent access token

The temporary token on the API Setup page expires in 24 hours, so make a permanent one:
1. Go to **business.facebook.com → Settings (Business settings) → Users → System users → Add**.
2. Name it `lakshmi-bot` and choose role **Admin**.
3. Click **Add assets → Apps → Lakshmi Hospital Bot → Full control**, and save.
4. Click **Generate new token**:
   1. Choose the app.
   2. Set **Token expiration: Never**.
   3. Tick the permissions **whatsapp_business_messaging** and **whatsapp_business_management**.
   4. Click **Generate**.
5. Copy the token. **It is shown only once, so don't share it.**

## Step 4 – Put the values in Script Properties

In Apps Script, go to **⚙️ Project Settings → Script Properties** and add:

| Property | Value |
|---|---|
| `WA_ACCESS_TOKEN` | the permanent token from Step 3 |
| `WA_PHONE_NUMBER_ID` | the Phone number ID from Step 2 |
| `WA_VERIFY_TOKEN` | any secret word you make up, e.g. a random string |

Click **Save script properties**. Then publish the new code: **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy**. The URL stays the same.

## Step 5 – Connect the webhook

1. In the Meta app, open **WhatsApp → Configuration** (or **App Dashboard → Webhooks**).
2. Under **Webhook**, click **Edit**:
   - **Callback URL:** your **/exec URL**
   - **Verify token:** the same `WA_VERIFY_TOKEN` value
3. Click **Verify and save**.
4. Under **Webhook fields**, click **Manage** and **Subscribe** to **messages**.

## Step 6 – Test

1. From your own mobile, send **hi** to the hospital chatbot number on WhatsApp.
2. You should get the welcome message (English and Tamil), then the bot asks for the patient's name.
3. Follow the questions: name, then doctor (choose from the list), then date, time, reason, new/existing, then **Confirm**.
4. Check the **Requests** sheet for a new row with **Source = WhatsApp** and **Status = New**.
5. Also try:
   - **staff** or **call me**: saves a "Callback requested" row.
   - **chest pain**: the bot immediately replies with the 108 emergency message.
   - **menu** or **hi**: starts again.

While your Meta app is in **Development** mode, only numbers you add under **API Setup → To** (test recipients) can chat with the bot. To let all patients use it, complete Meta's business verification and set the app to **Live**.

---

## If something doesn't work

| Problem | What to check |
|---|---|
| "Verify and save" fails | `WA_VERIFY_TOKEN` must match exactly. Did you publish a **New version** after adding the property? Open `YOUR_EXEC_URL?hub.mode=subscribe&hub.verify_token=YOUR_TOKEN&hub.challenge=123` in a browser: it should show only `123`. |
| Verification works in the browser but Meta still fails | Google answers web-app calls through a redirect, and Meta may not follow it. If so, we'll put a tiny forwarding page (for example a free Cloudflare Worker) in front of the Apps Script URL. Ask us. |
| Bot doesn't reply | Look at the **WA Errors** sheet. "not configured" means a Script Property is missing. "HTTP 401" means the token is wrong or expired. "another/unknown phone_number_id" means `WA_PHONE_NUMBER_ID` doesn't match your number. |
| You get replies twice | Meta resends a message if it didn't get a quick reply. The bot ignores repeats of the same message, so a second copy of the bot's own reply is rare; tell us if it happens often. |
| Patient wrote more than 24 hours after their last message | That's fine; patients always start the chat, so the bot is always inside Meta's 24-hour reply window. |

## Known limitation (security)

Meta signs every webhook with an **X-Hub-Signature-256** header, but **Google Apps Script cannot read HTTP headers**, so this signature can't be checked here. Someone who learns your /exec URL could send fake "messages". To reduce the risk, the bot:
- only processes events addressed to **your** `WA_PHONE_NUMBER_ID`,
- ignores repeated message IDs,
- only writes *requests* (it can't book, cancel or read other patients' data),
- can only send free-form messages that Meta allows (inside the 24-hour window).

Keep the /exec URL private. If you need full signature checking later, put a small forwarding service in front (for example a Cloudflare Worker) that verifies the signature and then forwards to Apps Script.
