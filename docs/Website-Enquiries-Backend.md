# Website enquiries backend

Temporary backend for the contact form on nxtfoundry.in: Google Apps Script plus a Google Sheet. n8n takes over on 23–24 November 2026 (see the last section). Until then the sheet is the source of truth.

## How it works

```
Browser form ──POST /api/enquiry──▶ Vercel function ──POST + shared secret──▶ Apps Script web app
 (same origin, JSON)                 api/enquiry.ts                            backend/apps-script/Code.gs
                                     • same-origin check                       • checks secret
                                     • honeypot + time check                   • validates + sanitises again
                                     • validation + length limits              • rate limit (5/hour per email)
                                     • holds the secret (env var)              • stores row in "Website Enquiries"
                                                                               • emails hello@nxtfoundry.in
◀── 200 {ok, enquiryId} only when the row is stored ◀──────────────────────────  (reply-to = visitor)
```

- **Why a Vercel function in the middle.** The browser talks only to our own domain, so there is no CORS problem and the form sees a real HTTP status. It never shows success unless the backend confirms the row was stored. The Apps Script URL and shared secret live only in Vercel env vars, never in the browser bundle.
- **No lost enquiries.** Apps Script writes and flushes the row *before* it sends the email. If the email fails, the visitor still gets success (their enquiry is stored), and the failure is written to the **Notification Log** sheet. Run `retryFailedEmails()` to re-send.
- **No duplicates.** Each form attempt carries a `submissionId`. A retry after a timeout returns the original enquiry ID for 6 hours instead of adding a second row.
- **Spam.** There is a hidden honeypot field (bots that fill it get a quiet "ok" and nothing is stored). Submissions made less than 2.5 s after the form opened are refused with "press send again". Each email address can send 5 enquiries an hour. All fields have length limits, and cells starting with `= + - @` are stored as text, not formulas.
- **Offline bundle.** The offline npm package has no server, so there the form still opens a prefilled email.

### Sheet: `Website Enquiries`

| A | B | C | D | E | F | G | H | I | J | K |
|---|---|---|---|---|---|---|---|---|---|---|
| Enquiry ID | Submission timestamp | Name | Business email | Phone | Company | Business type | Area of interest | Message | Status | Source |

- Enquiry IDs look like `NXT-20261112-7KQ2MD`.
- Timestamps are in IST.
- Status starts as `NEW`.
- Phone is optional.
- **Never reorder these columns.** n8n will read them by position and header. Add any new column at the end.

### Response contract (what any backend behind `APPS_SCRIPT_URL` must return)

```jsonc
{ "ok": true,  "enquiryId": "NXT-20261112-7KQ2MD" }                 // stored
{ "ok": false, "error": "validation", "fields": { "email": true } }   // bad input
{ "ok": false, "error": "rate_limited" }                             // too many from this email
{ "ok": false, "error": "unauthorized" | "bad_request" | "server_error" }
```

## 1. Create the sheet and the Apps Script

Do this signed in to the Google Workspace account that should own the data and send the email (the email goes out from that account).

1. Create a Google Sheet, for example **NXT Foundry — Website Enquiries**. You don't need to add tabs; the script creates them.
2. In the sheet, open **Extensions → Apps Script**. Rename the project to `NXT Foundry Enquiries`.
3. Replace everything in `Code.gs` with the contents of [`backend/apps-script/Code.gs`](../backend/apps-script/Code.gs).
4. Click **Project Settings** (gear icon), tick **Show "appsscript.json" manifest file in editor**, then replace that file with [`backend/apps-script/appsscript.json`](../backend/apps-script/appsscript.json). This sets the time zone to Asia/Kolkata.
5. Still in **Project Settings → Script properties**, add:
   - `ENQUIRY_SHARED_SECRET`: a long random string. Generate one locally with:
     ```bash
     node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
     ```
     Keep it somewhere safe. You'll paste the same value into Vercel.
   - `NOTIFY_EMAIL` (optional): only if enquiries should go somewhere other than `hello@nxtfoundry.in`.
6. Back in the editor, choose the `setup` function and click **Run**. Approve the permissions (Sheets and send email). This creates the **Website Enquiries** and **Notification Log** tabs with headers.
7. Choose `testSubmission` and click **Run**. A test row should appear, and an email should reach hello@nxtfoundry.in. Delete the test row afterwards.

## 2. Deploy it as a web app

1. Click **Deploy → New deployment**. Under the gear, choose **Web app**.
2. Set **Execute as: Me** and **Who has access: Anyone**. "Anyone" is required because Vercel calls it without a Google login; the shared secret is what protects it.
   - If "Anyone" is missing, your Workspace admin settings block public web apps. In the Admin console, go to **Apps → Google Workspace → Drive and Docs → Sharing settings** and allow sharing outside the organisation (or ask your admin to).
3. Click **Deploy** and copy the **Web app URL** (it ends in `/exec`).
4. Check it: open the URL in a browser. You should see `{"ok":true,"service":"nxt-foundry-enquiries"}`.
5. **After any later code change:** go to **Deploy → Manage deployments → ✏️ → Version: New version → Deploy**. This keeps the same URL. Choosing "New deployment" instead would create a new URL.

## 3. Vercel environment variables

In Vercel, open **Project → Settings → Environment Variables** and add these for **Production** (and **Preview** if you want preview deployments to submit too):

| Name | Value |
|---|---|
| `APPS_SCRIPT_URL` | the `/exec` web app URL from step 2 |
| `ENQUIRY_SHARED_SECRET` | the same value as the Apps Script property |

- Neither variable has a `VITE_` prefix, so neither ever reaches the browser.
- If an old `VITE_FORM_ENDPOINT` variable exists, delete it; nothing reads it now.
- Env var changes only apply to new deployments, so redeploy after adding them.

## 4. Testing

**Locally**, with real Google but without deploying:

1. Create `.env.local` in the repo root. It is git-ignored. Add:
   ```
   APPS_SCRIPT_URL=https://script.google.com/macros/s/…/exec
   ENQUIRY_SHARED_SECRET=…
   ```
2. Run `npm run dev` and open `http://localhost:5173/#contact-form`. Under `npm run dev`, `/api/enquiry` runs through `scripts/enquiry-dev.mjs`.

**Successful submission**
1. Fill in the required fields (Name, Business email, Company, Message). Phone is optional. Wait a few seconds, then click **Send enquiry**.
2. Expected:
   - The button shows "Sending…".
   - Then "Thanks — your enquiry is in." appears with a reference like `NXT-20261112-XXXXXX`, and the form is cleared.
   - A new row appears in the sheet with Status `NEW`.
   - An email arrives at hello@nxtfoundry.in. Clicking **Reply** addresses it to the visitor.

**Failed submissions.** Each of these should keep everything the visitor typed and show a retry message with the email address:

| How to cause it | What you should see |
|---|---|
| Wrong `ENQUIRY_SHARED_SECRET` in `.env.local` / Vercel | "We couldn't send your enquiry just now…". No row is added. Vercel logs show `backend rejected the enquiry: unauthorized`. |
| Remove `APPS_SCRIPT_URL` | Same message. Logs show `APPS_SCRIPT_URL … is not set`. |
| Web app access set to anything other than "Anyone" | Same message. Logs show `backend returned non-JSON`. |
| Invalid email, or phone `12` | The field is highlighted with an inline error. Nothing is sent. |
| Six enquiries in an hour from one email | "We've had several enquiries from you in a short time…" |
| Set script property `NOTIFY_EMAIL` to `not-an-email` | The visitor **sees success** (the row is stored). A row appears in **Notification Log** with `EMAIL_FAILED`. Put the property back and run `retryFailedEmails()` to send it. |

Server-side details (never shown to visitors) are in **Vercel → Logs**, filtered by `[enquiry]`, and in **Apps Script → Executions**.

## 5. Handing over to n8n (23–24 November)

Nothing on the website needs to change; we haven't configured any n8n connection yet. There are two ways to connect it:

**A. n8n reads the sheet (the smallest change).** Keep Apps Script as the intake.
- Use a **Google Sheets Trigger** (on row added) on `Website Enquiries`, or a **Schedule Trigger**, then **Google Sheets → Get rows** filtered on `Status = NEW`.
- Process each row (CRM, Slack, auto-acknowledgement and so on).
- Write the outcome back with **Google Sheets → Update row**, matching on `Enquiry ID`, and set `Status` to, for example, `ACKNOWLEDGED`, `QUALIFIED` or `CLOSED`. Picking up only `NEW` rows means nothing is handled twice.
- Optionally, add columns after `Source` (for example `n8n processed at`, `Owner`). Never insert columns before it.

**B. n8n becomes the intake.**
1. Build an n8n **Webhook** (POST) that:
   - checks the `secret` field;
   - appends the same 11 columns;
   - sends the email;
   - responds with the JSON contract above.
2. Point the Vercel `APPS_SCRIPT_URL` at the n8n webhook URL (the name stays the same) and redeploy.
3. Keep the Apps Script deployment live until n8n has handled real enquiries, so you can switch back by changing one env var.
