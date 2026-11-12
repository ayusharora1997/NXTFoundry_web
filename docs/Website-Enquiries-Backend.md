# Website enquiries backend

The contact form on nxtfoundry.in stores enquiries in a Google Sheet through a Google Apps Script web app, with a Vercel function in front. n8n connects on 23–24 November 2026 (section 8). Until then the sheet is the source of truth. No n8n connector is configured yet.

## 1. Architecture

```
Browser form ──POST /api/enquiry──▶ Vercel function (api/enquiry.ts) ──POST──▶ Apps Script web app (Code.gs)
 same origin, JSON                  • Origin must be an allowed origin           • shared secret check
                                    • honeypot + fill-time check                 • validation + length limits (again)
                                    • validation + length limits                 • script lock (10 s max wait)
                                    • trusted visitor IP → keyed HMAC            • ipHash must be a 43-char HMAC
                                      (no valid IP → 503, fail closed)           • duplicate check  (Submission Keys tab)
                                    • adds shared secret (env var)               • per-IP / per-email limits (Submission Keys tab)
                                                                                 • email cap        (Notifications tab)
                                                                                 • writes enquiry → key → notification state
                                                                                 • lock released, then email sent
◀── 200 {ok, enquiryId} only when the backend confirms a stored enquiry with a well-formed ID ◀──
```

- **Success means stored.** The browser shows success only when Apps Script returns `ok: true` with an ID matching `NXT-YYYYMMDD-XXXXXX` and an HTTP 2xx. Anything else (non-JSON, timeout, error) shows a retry message, and the form keeps what the visitor typed.
- **The email never decides whether an enquiry is kept.** The row is written first. If the email fails, or is held back by the cap, the enquiry is still stored and its notification state is recorded on its own tab.
- **Spam is stored, not dropped.** A honeypot hit is stored with Status `SPAM` and never emailed. If a browser ever autofills the hidden field, the enquiry is still in the sheet.

### Tabs and columns

**`Website Enquiries`**: the record n8n reads. There are exactly 11 columns, and the backend checks the header row before every write.

| A | B | C | D | E | F | G | H | I | J | K |
|---|---|---|---|---|---|---|---|---|---|---|
| Enquiry ID | Submission timestamp | Name | Business email | Phone | Company | Business type | Area of interest | Message | Status | Source |

- **Enquiry ID:** `NXT-YYYYMMDD-XXXXXX`, unique (checked against column A before writing).
- **Submission timestamp:** text in IST with its offset, for example `2026-11-12T21:06:18+05:30`.
- **All values are text:** phone numbers keep leading zeros, `3/4` stays `3/4` rather than becoming a date, `TRUE` stays text, and `=…` is never a formula.
- **Status** is a dropdown with these values:
  - `NEW` (set by the backend)
  - `ACKNOWLEDGED`
  - `QUALIFIED`
  - `CLOSED`
  - `SPAM` (set by the backend for honeypot hits)
- **Extra columns** are allowed only after K and must have a header (for example one owned by n8n). The backend never writes to them. Any change to A–K, or a blank header after K, makes the backend refuse to write (section 6).

**`Submission Keys`**: managed by the backend; don't edit. One row per stored submission, used for duplicate checks and rate limits.

| Submission ID | Enquiry ID | Received at (IST) | IP hash | Email hash | Outcome |
|---|---|---|---|---|---|

- The IP hash is an HMAC-SHA-256 of the IP made with a key held only in Vercel, written as 43 base64url characters. The raw IP is never stored, logged or sent to Google. There is no shared fallback value: every stored row has a real visitor's hash.
- The email hash is a SHA-256 of the address.
- Outcome is `STORED` or `SPAM`.

**`Notifications`**: managed by the backend. One row per enquiry recording its email state, kept apart from the enquiry.

| Enquiry ID | State | Attempts | Last attempt at (IST) | Updated at (IST) | Detail |
|---|---|---|---|---|---|

| State | Meaning | What happens next |
|---|---|---|
| `SENT` | Handed to Gmail | Nothing |
| `SENDING` | In flight | Becomes `UNCONFIRMED` if still there after 15 min |
| `FAILED` | Gmail refused (quota, outage) | Retried by the daily job, up to 5 attempts |
| `GAVE_UP` | Failed 5 times | A person reads the enquiry in the sheet |
| `SUPPRESSED` | Email cap reached | Listed in the next summary email |
| `SUMMARISING` / `SUMMARISED` | Being listed / listed in a summary email | Nothing |
| `UNCONFIRMED` | Unknown whether it was sent (script stopped mid-send) | Not resent automatically, to avoid duplicates; check the inbox |
| `NOT_SENT_SPAM` | Honeypot hit | Never emailed |

## 2. Security controls

| Control | Where | Detail |
|---|---|---|
| Origin allowlist | Vercel | `Origin` must be present and equal to `https://nxtfoundry.in`, `https://www.nxtfoundry.in`, or an entry in `ENQUIRY_ALLOWED_ORIGINS`. This stops other websites posting through visitors' browsers. Scripts can fake it, so it is **not** treated as authentication. |
| Shared secret | Vercel → Apps Script | Apps Script refuses any request without `ENQUIRY_SHARED_SECRET` (constant-time compare). It is never in browser code. |
| Trusted client IP (fail closed) | Vercel | Read only from `x-vercel-forwarded-for`, then `x-real-ip`. Vercel overwrites both at its edge to prevent spoofing; `X-Forwarded-For` is never read. The first entry must be a strict IPv4 address or a valid IPv6 literal. If neither header is present, or the value is malformed, the request is refused with **503** and the visitor sees the retry message. There is no shared "unknown" bucket, and the bad value is never logged. |
| IP hash check (fail closed) | Apps Script | Independently refuses (`bad_request`) any request whose `ipHash` is missing or is not exactly 43 base64url characters, before anything is read or written. |
| IP privacy | Vercel | The IP becomes HMAC-SHA-256 with `ENQUIRY_IP_HASH_KEY`. Only the hash leaves the function; the raw IP is never stored or logged. |
| Per-IP limits | Apps Script | 5 stored enquiries per 10 min and 20 per 24 h, per IP hash. Counted from the Submission Keys tab under the lock, so they survive cache eviction. |
| Per-email limit | Apps Script | 5 per hour per email address, from any IP. |
| Email cap | Apps Script | 30 notification emails an hour and 200 a day, counted under the lock, **and** never past Google’s real remaining daily quota: individual emails stop while 10 or fewer remain, keeping those for the summary and alert emails. The quota depends on the account; a new or trial Workspace account may get only 100 a day (`setup` prints it). Above any of these limits, enquiries are still stored and marked `SUPPRESSED`. |
| Honeypot | Browser + Vercel | Hidden field `nxt_hp_2f9` labelled "Leave this field empty", with password-manager ignore hints. A hit is stored as `SPAM`, not emailed. |
| Fill time | Vercel | Under 2.5 s is refused with "press send again". The browser reports the time, so it only stops naive bots; the limits above do the real work. |
| Validation | Both | Required fields, email format, phone (optional, 7–15 digits), and length limits (name 100, email 254, phone 25, company 150, business type 80, interest 100, message 5,000). Both sides refuse rather than cut values short, and remove control characters. |
| Formula and type safety | Apps Script | Cells starting with `= + - @`, tab or CR get Sheets' quote prefix. Every other cell is set to plain-text format before writing. |
| Email safety | Apps Script | Notifications go to a fixed recipient (`NOTIFY_EMAIL`, default hello@nxtfoundry.in), sent **from `NXT Foundry Website <hello@nxtfoundry.in>`** through the Gmail API with only the **send** permission (`gmail.send`), so the script can never read or delete mail. Reply-to is the visitor’s validated address. Every recipient and sender address is validated before sending, and visitor text appears only inside base64-encoded subject words and bodies, so it cannot add or change headers. The HTML body is escaped. If the Gmail service is not enabled, mail falls back to `MailApp`, sent from the account running the script. |
| Duplicates | Apps Script | Each form attempt has a `submissionId`, kept across retries. It is looked up in Submission Keys under the lock, so a retry returns the original ID. |
| Concurrency | Apps Script | Every intake, and every retry claim, runs under the script lock. The email is sent after the lock is released. |
| Safe errors | Both | Visitors only see generic messages. Details go to Vercel logs (`[enquiry]`, never field values or IPs) and Apps Script → Executions. |
| Schema guard | Apps Script | A changed header row means nothing is written, the visitor is asked to retry, and an alert email goes out at most once an hour. |

**Timeouts** (Vercel: functions default to 300 s with Fluid compute; Apps Script: 6 min per execution):

- 10 s: Apps Script lock wait.
- 20 s: Vercel's wait for Apps Script.
- 30 s: Vercel `maxDuration` for this function (`vercel.json`).
- 35 s: the browser's wait.

Each step gives up before the one above it, so the visitor always gets a real answer.

## 3. Create the sheet and the script

Do this signed in to the Google Workspace account that should own the data and send the email.

> **Sender and inbox.** The script runs as the account that deploys it, but emails are sent **from hello@** (setting `SEND_AS`), provided hello@ is a verified **Send mail as** address of that account (Gmail → Settings → Accounts). If it is not, Gmail sends from the account’s own address instead. If the recipient is the same mailbox as the sender (for example hello@ is an alias of the deploying account), Gmail files notifications under **All Mail**, not the Inbox; use a Gmail filter with a label, or deploy from a separate account.

1. Create a Google Sheet, for example **NXT Foundry — Website Enquiries**. You don't need to add tabs; the script creates them. If you do create them, the headers must match section 1 exactly.
2. In the sheet, open **Extensions → Apps Script** and rename the project `NXT Foundry Enquiries`.
3. Replace everything in `Code.gs` with [`backend/apps-script/Code.gs`](../backend/apps-script/Code.gs).
4. Open **Project Settings**, tick **Show "appsscript.json" manifest file in editor**, and replace that file with [`backend/apps-script/appsscript.json`](../backend/apps-script/appsscript.json). This sets the time zone to Asia/Kolkata.
5. In **Project Settings → Script properties**, add:
   - `ENQUIRY_SHARED_SECRET`: a long random string. Generate one with
     ```bash
     node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
     ```
   - `NOTIFY_EMAIL` (optional): only if enquiries should go somewhere other than hello@nxtfoundry.in.
   - `SEND_AS` (optional): the "From" address, if not hello@nxtfoundry.in. It must be a verified Send mail as address.
6. Run **`setup`** and approve the permissions: Google Sheets, **"Send email on your behalf"** (Gmail, send only) and "Send email as you" (fallback). The Gmail service is switched on by `appsscript.json`, and it appears under **Services** in the editor. `setup`:
   - creates the three tabs;
   - checks every header row (it never rewrites one);
   - adds the Status dropdown;
   - adds warning-only protection to columns A–B, the header row, and the Submission Keys and Notifications tabs.

   It is safe to run again at any time to check the sheet.
7. Run **`selfTestTextPreservation`**. The log must say `ALL PASS`. This confirms on real Google Sheets that values such as `=1+1`, `08040001234`, `3/4` and `TRUE` are stored exactly as typed. If it prints `FAIL`, stop and send us the log.
8. Run **`testSubmission`**. A row appears with Status `NEW`, the Notifications tab shows `SENT`, and an email reaches hello@nxtfoundry.in. Delete the test row from all three tabs afterwards.

## 4. Deploy the web app, and add the daily retry trigger

1. Click **Deploy → New deployment**, and under the gear choose **Web app**.
2. Set **Execute as: Me** and **Who has access: Anyone**. "Anyone" is needed because Vercel calls it without a Google login; the shared secret protects it. If "Anyone" isn't offered, a Workspace admin must allow it under **Admin console → Apps → Google Workspace → Drive and Docs → Sharing settings**.
3. Click **Deploy** and copy the **Web app URL** (it ends in `/exec`). Opening it in a browser shows `{"ok":true,"service":"nxt-foundry-enquiries"}`.
4. **Daily retry trigger.** In the editor, click **Triggers** (the clock icon on the left), then **+ Add Trigger**, and set:
   - function: `processNotifications`
   - deployment: **Head**
   - event source: **Time-driven**
   - type: **Day timer**
   - time: **9am to 10am**

   Click **Save**. Each run:
   - resends `FAILED` emails (each one claimed under the lock first);
   - marks `SENDING` older than 15 min as `UNCONFIRMED`;
   - sends one summary listing all `SUPPRESSED` enquiries.

   A run guard stops two runs overlapping. You can also run it by hand.
5. **After any later code change:** open **Deploy → Manage deployments**, click ✏️, choose **Version: New version** and click **Deploy**. This keeps the same URL; "New deployment" would create a new one.
6. **Archived deployments stop working.** If you archive a deployment and create a new one, its URL changes: update `APPS_SCRIPT_URL` (in Vercel and in `.env.prodcheck.local`) to the new **active** deployment's Web app URL.
7. **Check "Who has access" really says "Anyone".** On Workspace it often defaults to "Anyone within nxtfoundry.in", and "Anyone with Google account" looks similar. Both make Google answer with a sign-in page, which the website reports as "unavailable". A URL of the form `/a/macros/nxtfoundry.in/…` is a sign that access is domain-restricted.

## 5. Vercel environment variables

In Vercel, open **Project → Settings → Environment Variables**. Add these to **Production**, and to **Preview** only if previews should accept enquiries:

| Name | Value |
|---|---|
| `APPS_SCRIPT_URL` | the `/exec` URL from section 4 |
| `ENQUIRY_SHARED_SECRET` | the same value as the Apps Script property |
| `ENQUIRY_IP_HASH_KEY` | another long random string (same generator as above), used only here |
| `ENQUIRY_ALLOWED_ORIGINS` | *optional*: extra comma-separated origins, for example a preview URL. Leave unset in production. |

- None of these has a `VITE_` prefix, so none reaches the browser.
- Delete any old `VITE_FORM_ENDPOINT`.
- Env var changes apply only to new deployments.

**Generating and checking the production values without exposing them.** Never paste these values into chat or a ticket.

1. Run this once. It writes a git-ignored file with two newly generated keys, and prints no values:
   ```bash
   node scripts/make-test-env.mjs .env.prodcheck.local
   ```
2. Copy `ENQUIRY_SHARED_SECRET` from that file into the production script's Script properties.
3. Paste the production `/exec` URL into the file.
4. Run:
   ```bash
   node scripts/check-test-env.mjs .env.prodcheck.local
   ```
   It checks the deployment is reachable anonymously and that the secret matches, using a probe that is refused before any write. It also confirms that neither the URL nor any secret is reused from the TEST `.env.local`.
5. Copy the three values from the file into Vercel. Vite never loads this file.
- If `APPS_SCRIPT_URL`, `ENQUIRY_SHARED_SECRET` or `ENQUIRY_IP_HASH_KEY` is missing, the form shows the retry message and Vercel logs name the missing variable.
- No IP setting is needed. On Vercel the trusted IP headers are always present. Locally, `npm run dev` replaces any client-sent IP headers with the real connection address (`127.0.0.1` / `::1`), so local requests also pass the fail-closed check.

## 6. Testing

**Automated** (no Google account needed). This runs the real `Code.gs` in a sandbox with fake Google services, behind the real `api/enquiry.ts`:

```bash
npm run test:enquiry
```

It covers valid enquiries, invalid input, spoofed requests (Origin, secret, `X-Forwarded-For`), missing or malformed visitor IPs (fail closed), malformed `ipHash` values sent straight to Apps Script, valid IPv4/IPv6/local addresses, rate-limit exhaustion, duplicate and parallel duplicate submissions, the email cap and its summary, failed notifications and retries, overlapping retry runs, schema mismatch, concurrent submissions, a busy lock, text preservation, the honeypot, IP privacy and the upstream response contract. The fake Sheets is a model of how Google converts values; `selfTestTextPreservation` (section 3, step 7) confirms the real behaviour.

**Locally against real Google:**

1. Create a git-ignored `.env.local` with the four variables from section 5, and set `ENQUIRY_ALLOWED_ORIGINS=http://localhost:5173`.
2. Run `npm run dev`.
3. Open `http://localhost:5173/#contact-form`.

**Manual checks:**

| Do this | Expect |
|---|---|
| Fill in the required fields, wait a few seconds, send | "Thanks — your enquiry is in." with a reference; form cleared; row with Status `NEW`; Notifications `SENT`; email with Reply going to the visitor |
| Wrong `ENQUIRY_SHARED_SECRET` in Vercel | Retry message; nothing stored; Vercel log `backend rejected the enquiry: unauthorized` |
| Web app access not "Anyone" | Retry message; Vercel log `backend returned non-JSON` |
| Invalid email, or phone `12` | Inline field error; nothing sent |
| Six enquiries in 10 min from one network | "We've had several enquiries from you or your network…" |
| Rename the Phone header to `Mobile` | Retry message; nothing written; one "Action needed" email. Put the header back. |
| Set script property `NOTIFY_EMAIL` to `not-an-email` | Visitor **sees success**; row stored; Notifications `FAILED`. Fix the property and run `processNotifications`; the state becomes `SENT`. |

## 7. Recovery procedures

| Situation | What to do |
|---|---|
| **`FAILED` notifications** | Usually the Gmail daily quota. Nothing to do: the daily trigger resends them. To hurry it, run `processNotifications`. |
| **`GAVE_UP`** | The enquiry is in the sheet; reply from Gmail by hand. Optionally set State back to `FAILED` (Attempts `0`) to retry. |
| **`UNCONFIRMED`** | Search the inbox for the Enquiry ID. If the email isn't there, reply by hand, or set State to `FAILED` to resend. |
| **A refused request shows as "Completed" in Apps Script → Executions** | That is expected. `doPost` catches the error and returns a safe reply, so Google marks the run Completed. Click the run to see its log; the reason is the line starting `doPost failed:` (for example a header mismatch). |
| **Notification emails come from the account address instead of hello@** | Either hello@ is not a verified **Send mail as** address of the account running the script (Gmail → Settings → Accounts), or the Gmail service is not enabled. Check that `appsscript.json` matches the repo and that **Services** lists Gmail, then deploy a **New version**. |
| **Notification emails arrive in All Mail but not the Inbox** | The script is emailing the account it runs as (see the note in section 3). Search `subject:"New enquiry"`, add a Gmail filter with a label, or deploy production from a different account. |
| **`SUPPRESSED`, or a summary email** | The cap was reached, which usually means a burst of spam. Review the rows, set unwanted ones to `SPAM`, and reply to real ones. |
| **"Action needed: website enquiries are being refused"** | Someone changed a header or added an unnamed column. Restore the exact headers from section 1 (move any extra column after K and give it a header), then run `setup` to confirm. Visitors were shown the retry message and email address in the meantime. |
| **Every visitor gets the retry message; Vercel logs `no valid client IP in trusted request headers`** | Requests are reaching the function without Vercel's IP headers, for example through a proxy or tunnel in front of Vercel that drops them. Remove that proxy or restore the headers. The refusal is deliberate (fail closed); nothing was stored. |
| **Vercel logs `backend rejected the enquiry: bad_request`** | Something other than our function, or an out-of-date copy of it, is calling Apps Script without a valid `ipHash`. Check that `APPS_SCRIPT_URL` is used only by this project. |
| **Visitors report "handling a lot of enquiries"** | The lock was busy for over 10 s, usually during a very slow Google moment or a flood. Check Apps Script → Executions. |
| **Rotate the shared secret** | Set the new value in the Apps Script property and in Vercel, then redeploy Vercel. Submissions in between see the retry message, and nothing is lost. |
| **Rotate the IP hash key** | Change `ENQUIRY_IP_HASH_KEY` and redeploy. Per-IP history starts afresh; nothing else changes. |
| **Wrong row edited or deleted** | Use **File → Version history** in the sheet. Never delete rows from Submission Keys or Notifications by hand. |

## 8. n8n integration (23–24 November)

There's no n8n setup yet. Two supported ways to connect:

**A. n8n reads the sheet (recommended first step).** Apps Script stays the intake.

- **Trigger:** a **Google Sheets Trigger** (row added) on `Website Enquiries`, or a **Schedule Trigger**, then **Google Sheets → Get rows** filtered on `Status = NEW`.
- **Identify a record by `Enquiry ID` only, never by row number.** People may sort or filter the sheet.
- **Update with Google Sheets → Update row**, matching column `Enquiry ID`, and set `Status` to `ACKNOWLEDGED`, `QUALIFIED` or `CLOSED`. Because only `NEW` rows are picked up, each enquiry is handled once.
- **Columns of n8n's own** (for example `n8n processed at`, `Owner`) go **after column K** and need a header. Never insert before K, rename A–K, or leave a blank header between them; any of those stops intake (section 6).
- **Timestamps** are ISO 8601 text with `+05:30`; parse them as such.
- **Values are text**, read through the API without the quote prefix. If you export to CSV and open it in Excel, treat cells as text, since Excel may evaluate `=…`.
- **Ignore `SPAM` rows**, unless you want to review them.

**B. n8n becomes the intake.**

1. Build an n8n Webhook (POST) that:
   - checks `secret`;
   - rejects a missing or malformed `ipHash` (43 base64url characters), with no shared fallback;
   - checks duplicates on `submissionId`;
   - rate-limits on `ipHash`;
   - writes the same 11 columns as text;
   - responds with the same contract as below.
2. Point Vercel's `APPS_SCRIPT_URL` at the webhook and redeploy. No site change is needed.
3. Keep the Apps Script deployment live until n8n has handled real traffic, so switching back is a single env var change.

**Response contract** (what any backend behind `APPS_SCRIPT_URL` must return, with HTTP 200):

```jsonc
{ "ok": true,  "enquiryId": "NXT-20261112-7KQ2MD" }           // stored (ID must match NXT-\d{8}-[A-Z2-9]{6})
{ "ok": false, "error": "validation", "fields": { "email": true } }
{ "ok": false, "error": "rate_limited" | "busy" | "unauthorized" | "bad_request" | "server_error" }
```

## 9. Known limitations

- **Fake Sheets in the automated tests.** `npm run test:enquiry` uses a model of Google Sheets; run `selfTestTextPreservation` once on the real sheet.
- **Shared IP limits.** Rate limits are per network. Many people behind one office or carrier IP share the 5-per-10-min / 20-per-day allowance and would see the "try again later" message with our email address.
- **No CAPTCHA.** A distributed bot (many IPs, valid-looking emails) can still add rows up to the per-IP limits. The email cap protects the inbox, and the rows can be marked `SPAM`. Adding Cloudflare Turnstile would be the next step.
- **Rare duplicate rows.** If Google fails after writing the enquiry row but before writing its Submission Key, a retry can create a second row. This is the deliberate trade-off: a duplicate, never a lost enquiry.
- **Limits only scan recent rows.** Rate limits and the cap look at the last 5,000 rows of each log tab, which is ample at this volume.
