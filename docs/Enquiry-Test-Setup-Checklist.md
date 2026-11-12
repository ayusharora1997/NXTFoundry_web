# Contact form — test environment checklist

This sets up a **separate TEST** Google Sheet and Apps Script, then runs the real contact form on your machine (`npm run dev`) against it. It does not involve Vercel, production, a commit or a push.

**Golden rules**

- Secrets stay in two places only: `.env.local` (git-ignored) and the TEST script's Script properties. Never paste them into chat, a ticket, a commit or a screenshot.
- TEST and production get **different** secrets and **different** spreadsheets. Production is set up later, from scratch.

---

## Values you generate or obtain

| Value | Who makes it | Where it goes | Where it must **not** go |
|---|---|---|---|
| `ENQUIRY_SHARED_SECRET` (TEST) | `node scripts/make-test-env.mjs` writes it into `.env.local` | `.env.local` **and** TEST script → Script properties → `ENQUIRY_SHARED_SECRET` (copy it from the file in your editor) | Chat, Vercel, production script |
| `ENQUIRY_IP_HASH_KEY` (TEST) | Same command | `.env.local` only | Apps Script, chat, Vercel |
| TEST `/exec` URL | Google, when you deploy the TEST script (step 6) | `.env.local` → `APPS_SCRIPT_URL` | Vercel |
| `ENQUIRY_ALLOWED_ORIGINS` | Fixed value `http://localhost:5173`, written by the command | `.env.local` | Not needed in production |
| `NOTIFY_EMAIL` | Your own inbox address | TEST script → Script properties | — |

---

## Steps

### ☐ 1. Create the TEST spreadsheet
1. In Google Drive (the Workspace account that will own the real one later), create a **blank** Google Sheet.
2. Name it **`NXT Enquiries — TEST`**. Leave it empty, with no tabs or headers; the script creates them.

### ☐ 2. Create its Apps Script project, bound to the TEST sheet
1. **In the TEST spreadsheet**, open **Extensions → Apps Script**. Opening it from this sheet is what ties the script to this sheet only.
2. Rename the project (top left) to **`NXT Enquiries — TEST`**.
3. Open **Project Settings** (gear icon), tick **Show "appsscript.json" manifest file in editor**, then go back to **Editor**.
4. Replace the contents of `Code.gs` with [`backend/apps-script/Code.gs`](../backend/apps-script/Code.gs).
5. Replace `appsscript.json` with [`backend/apps-script/appsscript.json`](../backend/apps-script/appsscript.json).
6. Click **Save** (💾).

### ☐ 3. Create `.env.local` and set the Script properties
1. In the repo folder, run:
   ```bash
   node scripts/make-test-env.mjs
   ```
   It creates `.env.local` with two new random keys and prints no secret values. It refuses to overwrite an existing file.
2. Open `.env.local` **in your editor** and copy the value after `ENQUIRY_SHARED_SECRET=`.
3. In the TEST script, open **Project Settings → Script properties → Add script property** and add:
   - `ENQUIRY_SHARED_SECRET`: paste the value you just copied.
   - `NOTIFY_EMAIL`: your own inbox, so test emails don't reach hello@nxtfoundry.in.
4. **Do not add `SPREADSHEET_ID`.** Without it the script can only use the sheet it's bound to.
5. Click **Save script properties**.

### ☐ 4. Run `setup()`
1. In the editor, choose **`setup`** in the function dropdown and click **Run**.
2. Approve the permission prompt: Google Sheets, and send email as you.
3. The log must end with `Sheets OK. Mail quota remaining today: …`.
4. **Isolation check:** the TEST spreadsheet now has the tabs **Website Enquiries**, **Submission Keys** and **Notifications**. If you already have a production spreadsheet, confirm it did **not** change.

### ☐ 5. Run `selfTestTextPreservation()`
1. Choose **`selfTestTextPreservation`** and click **Run**.
2. The log must say **`ALL PASS (15 values kept exactly as text)`**. If it says `FAIL`, stop and share **only the FAIL lines**; they contain test strings, not secrets.
3. Optional: run **`testSubmission`**. A row appears in Website Enquiries, Notifications shows `SENT`, and an email reaches your `NOTIFY_EMAIL` inbox.

### ☐ 6. Deploy the TEST web app and get its `/exec` URL
1. Click **Deploy → New deployment**, then the gear → **Web app**.
2. Set:
   - Description: `TEST`
   - **Execute as: Me**
   - **Who has access: Anyone**. Not "Anyone with Google account". If "Anyone" is missing, a Workspace admin setting blocks it; see the main guide, section 4.
3. Click **Deploy** and copy the **Web app URL** (ends in `/exec`).
4. In `.env.local`, replace `PASTE_TEST_EXEC_URL_HERE` with that URL and save the file.
5. Skip the daily trigger for TEST unless you want to test retries on a schedule. You can always run `processNotifications` by hand.

### ☐ 7. Check the four local variables and the connection
Run:
```bash
node scripts/check-test-env.mjs
```
Every line should start with ✓. The script prints no secrets and writes nothing. It:
- checks the shape of all four `.env.local` values;
- calls the TEST URL's health check, which proves it is reachable with access set to "Anyone";
- sends a probe with the secret and a deliberately invalid IP hash. `bad_request` proves the secret matches **this** deployment, and the request is refused before anything is read or written.

### ☐ 8. Restart Vite and test the browser form
1. Stop any running `npm run dev` with Ctrl+C, then start it again. Vite reads `.env.local` only at startup.
   ```bash
   npm run dev
   ```
2. Open `http://localhost:5173/#contact-form` and send a valid enquiry, waiting a few seconds before clicking **Send**.
3. Expected:
   - "Thanks — your enquiry is in." with a reference `NXT-YYYYMMDD-XXXXXX`;
   - a TEST sheet row with that ID and Status `NEW`;
   - Notifications showing `SENT`;
   - an email in your inbox, where Reply goes to the address you typed. If the script runs as the same account as `NOTIFY_EMAIL`, Gmail files it under **All Mail** rather than the Inbox; search `subject:"New enquiry"`.

   If a submission is refused, Apps Script → **Executions** still shows the run as **Completed**. Open the run to see the `doPost failed:` reason.

---

## Why the TEST setup cannot write to production

1. **Bound script, no `SPREADSHEET_ID`.** `getSpreadsheet_()` uses `SPREADSHEET_ID` if it's set, otherwise the sheet the script is bound to. Created from the TEST sheet with no `SPREADSHEET_ID`, the script can only reach the TEST sheet. Step 4 shows the tabs appearing there.
2. **Separate deployment URL.** Each Apps Script project has its own `/exec` URL. `.env.local` holds only the TEST URL, and the Vercel env vars are untouched.
3. **Different secrets.** The production script will get its own newly generated `ENQUIRY_SHARED_SECRET`. If a TEST secret were ever pointed at the production URL, or the reverse, the script would answer `unauthorized` before touching a sheet. Step 7 catches that.
4. **Local only.** Nothing here touches Vercel, `main` or DNS. `.env.local` is covered by `.gitignore` and has never been committed.

## Cleaning up afterwards
- Leave the TEST sheet and script for future testing, or delete both. Deleting the script also stops its URL.
- Delete `.env.local` when you're done. When production is set up, generate **new** values in Vercel; never reuse the TEST ones.
