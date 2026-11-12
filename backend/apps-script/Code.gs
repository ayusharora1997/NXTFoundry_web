/**
 * NXT Foundry — website enquiry backend (Google Apps Script web app).
 *
 * Temporary system of record until n8n takes over. Browsers never call this directly: the Vercel
 * function /api/enquiry forwards each enquiry here with a shared secret and an HMAC of the visitor IP
 * (the raw IP never reaches this script).
 *
 *   POST body (JSON, sent as text/plain):
 *     { secret, submissionId, ipHash, spam?, source, name, email, phone, company, businessType, interest, message }
 *   Response (always HTTP 200 — Apps Script cannot set status codes — so read "ok"):
 *     { ok: true,  enquiryId: "NXT-20261112-7KQ2MD" }
 *     { ok: false, error: "validation", fields: { email: true } }
 *     { ok: false, error: "rate_limited" | "busy" | "unauthorized" | "bad_request" | "server_error" }
 *
 * Tabs (headers are checked before every write and never rewritten):
 *   Website Enquiries  the 11-column record n8n reads. Status: NEW | ACKNOWLEDGED | QUALIFIED | CLOSED | SPAM
 *   Submission Keys    one row per stored submission: dedupe key, IP/email hashes for rate limits
 *   Notifications      one row per enquiry: email notification state, kept apart from the enquiry itself
 *
 * Order of work, all under the script lock: check schemas -> dedupe -> rate limits -> email cap ->
 * write enquiry -> write key -> write notification state. The lock is released before the email is sent,
 * so a slow or failing email never blocks or loses an enquiry.
 *
 * Script properties (Project Settings -> Script properties):
 *   ENQUIRY_SHARED_SECRET  required  same value as the Vercel env var of the same name
 *   NOTIFY_EMAIL           optional  defaults to hello@nxtfoundry.in
 *   SPREADSHEET_ID         optional  only if this script is NOT bound to the enquiries spreadsheet
 */

var CONFIG = {
  DEFAULT_NOTIFY_EMAIL: 'hello@nxtfoundry.in',
  DEFAULT_SOURCE: 'Website contact form',
  ID_PREFIX: 'NXT',
  TZ: 'Asia/Kolkata',
  STATUSES: ['NEW', 'ACKNOWLEDGED', 'QUALIFIED', 'CLOSED', 'SPAM'],
  LIMITS: { name: 100, email: 254, phone: 25, company: 150, businessType: 80, interest: 100, message: 5000, source: 60 },
  REQUIRED: ['name', 'email', 'company', 'message'],

  // Timeouts. Chain: lock wait 10 s < Vercel upstream timeout 20 s < Vercel maxDuration 30 s < browser 35 s.
  LOCK_WAIT_MS: 10000,

  // Per-visitor limits (stored enquiries, counted from the Submission Keys tab).
  IP_LIMIT_SHORT: 5,  IP_WINDOW_SHORT_MS: 10 * 60 * 1000,
  IP_LIMIT_DAY: 20,   IP_WINDOW_DAY_MS: 24 * 60 * 60 * 1000,
  EMAIL_LIMIT: 5,     EMAIL_WINDOW_MS: 60 * 60 * 1000,

  // Overall email notification cap. Above it enquiries are still stored, marked SUPPRESSED,
  // and listed in one summary email by processNotifications(). Workspace allows 1,500-2,000 a day.
  EMAIL_CAP_HOUR: 30,
  EMAIL_CAP_DAY: 200,

  // Notification retries (processNotifications, run daily by a time trigger).
  MAX_ATTEMPTS: 5,
  STALE_SENDING_MS: 15 * 60 * 1000,   // SENDING older than this becomes UNCONFIRMED, never auto-resent
  RETRY_BATCH: 25,
  SUMMARY_BATCH: 100,
  RUN_GUARD_MS: 10 * 60 * 1000,

  RECENT_ROWS: 5000                   // rows scanned from the end of the log tabs for limits and caps
};

var SCHEMAS = {
  enquiries: { name: 'Website Enquiries', allowExtraColumns: true,
    headers: ['Enquiry ID', 'Submission timestamp', 'Name', 'Business email', 'Phone', 'Company',
              'Business type', 'Area of interest', 'Message', 'Status', 'Source'] },
  keys: { name: 'Submission Keys', allowExtraColumns: false,
    headers: ['Submission ID', 'Enquiry ID', 'Received at (IST)', 'IP hash', 'Email hash', 'Outcome'] },
  notifications: { name: 'Notifications', allowExtraColumns: false,
    headers: ['Enquiry ID', 'State', 'Attempts', 'Last attempt at (IST)', 'Updated at (IST)', 'Detail'] }
};
// Notification states:
//   SENDING      email in flight (or the script died mid-send; becomes UNCONFIRMED after 15 min)
//   SENT         delivered to MailApp
//   FAILED       MailApp threw; retried by processNotifications up to MAX_ATTEMPTS
//   GAVE_UP      failed MAX_ATTEMPTS times; needs a person (the enquiry itself is safe in the sheet)
//   SUPPRESSED   overall email cap reached; included in the next summary email
//   SUMMARISING  claimed by a summary run in progress
//   SUMMARISED   listed in a summary email
//   UNCONFIRMED  outcome unknown; not resent automatically, to avoid duplicate emails
//   NOT_SENT_SPAM  honeypot hit; stored with Status SPAM, never emailed

var EMAIL_RE = /^[^\s@<>()[\],;:"\\]+@[^\s@<>()[\],;:"\\]+\.[^\s@<>()[\],;:"\\]{2,}$/;
var ID_RE = /^NXT-\d{8}-[A-Z2-9]{6}$/;

function SchemaError(message) { this.name = 'SchemaError'; this.message = message; }

/* ================================================================== entry points */

function doPost(e) {
  try {
    var payload = parseBody_(e);
    if (!payload) return respond_({ ok: false, error: 'bad_request' });
    if (!isAuthorized_(payload.secret)) return respond_({ ok: false, error: 'unauthorized' });

    var result = validate_(payload);
    if (!result.ok) return respond_({ ok: false, error: 'validation', fields: result.fields });

    var lock = LockService.getScriptLock();
    if (!lock.tryLock(CONFIG.LOCK_WAIT_MS)) return respond_({ ok: false, error: 'busy' });
    var stored;
    try {
      stored = intake_(result.enquiry);
    } finally {
      lock.releaseLock();
    }
    if (stored.error) return respond_({ ok: false, error: stored.error });
    if (stored.sendNow) deliver_(stored.id, stored.enquiry, stored.timestamp);
    return respond_({ ok: true, enquiryId: stored.id });
  } catch (err) {
    if (err instanceof SchemaError) alertSchemaProblem_(err.message);
    console.error('doPost failed: ' + (err && err.stack || err));
    return respond_({ ok: false, error: 'server_error' });
  }
}

/** Health check for testing the deployment URL in a browser. Reveals nothing about the data. */
function doGet() {
  return respond_({ ok: true, service: 'nxt-foundry-enquiries' });
}

/* ================================================================== validation */

function parseBody_(e) {
  if (!e || !e.postData || typeof e.postData.contents !== 'string') return null;
  if (e.postData.contents.length > 30000) return null;
  try {
    var data = JSON.parse(e.postData.contents);
    return data && typeof data === 'object' && !Array.isArray(data) ? data : null;
  } catch (_) { return null; }
}

function isAuthorized_(secret) {
  var expected = PropertiesService.getScriptProperties().getProperty('ENQUIRY_SHARED_SECRET');
  if (!expected) { console.error('ENQUIRY_SHARED_SECRET script property is not set'); return false; }
  if (typeof secret !== 'string' || secret.length !== expected.length) return false;
  var diff = 0;
  for (var i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ secret.charCodeAt(i);
  return diff === 0;
}

/** Trim, strip control characters, collapse whitespace on one-line fields. Returns null if too long or not a string. */
function clean_(value, max, multiline) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') return null;
  var s = value;
  if (s.normalize) s = s.normalize('NFC');
  if (multiline) {
    s = s.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').replace(/\n{4,}/g, '\n\n\n');
  } else {
    s = s.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ');
  }
  s = s.trim();
  return s.length > max ? null : s;
}

function isPhone_(p) {
  var digits = p.replace(/\D/g, '');
  return /^\+?[0-9 ()-]{7,25}$/.test(p) && digits.length >= 7 && digits.length <= 15;
}

function validate_(p) {
  var L = CONFIG.LIMITS, out = {}, bad = {};
  ['name', 'email', 'phone', 'company', 'businessType', 'interest', 'message', 'source'].forEach(function (f) {
    var v = clean_(p[f], L[f], f === 'message');
    if (v === null || (CONFIG.REQUIRED.indexOf(f) >= 0 && !v)) bad[f] = true; else out[f] = v;
  });
  if (!bad.email && !EMAIL_RE.test(out.email)) bad.email = true;
  if (!bad.phone && out.phone && !isPhone_(out.phone)) bad.phone = true;
  if (Object.keys(bad).length) return { ok: false, fields: bad };
  out.email = out.email.toLowerCase();
  out.source = out.source || CONFIG.DEFAULT_SOURCE;
  out.submissionId = typeof p.submissionId === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(p.submissionId) ? p.submissionId : '';
  out.ipHash = typeof p.ipHash === 'string' && /^[A-Za-z0-9_-]{16,128}$/.test(p.ipHash) ? p.ipHash : 'unknown';
  out.spam = p.spam === 'honeypot';
  return { ok: true, enquiry: out };
}

/* ================================================================== intake (runs under the script lock) */

function intake_(q) {
  var ss = getSpreadsheet_();
  var enquiries = openSheet_(ss, SCHEMAS.enquiries);
  var keys = openSheet_(ss, SCHEMAS.keys);
  var notes = openSheet_(ss, SCHEMAS.notifications);

  // 1. Duplicate: the same submission retried (timeout, double click). Return the original ID, store nothing.
  if (q.submissionId) {
    var keyRow = findRow_(keys, 1, q.submissionId);
    if (keyRow) return { id: String(keys.getRange(keyRow, 2).getValue()), sendNow: false };
  }

  // 2. Per-visitor limits, from persistent records (not the cache).
  var now = new Date(), nowMs = now.getTime();
  var emailHash = sha256Hex_(q.email);
  var ipShort = 0, ipDay = 0, emailHour = 0;
  readRecent_(keys, SCHEMAS.keys.headers.length).forEach(function (r) {
    var t = Date.parse(r[2]);
    if (!(t > 0)) return;
    var age = nowMs - t;
    if (String(r[3]) === q.ipHash) {
      if (age < CONFIG.IP_WINDOW_SHORT_MS) ipShort++;
      if (age < CONFIG.IP_WINDOW_DAY_MS) ipDay++;
    }
    if (String(r[4]) === emailHash && age < CONFIG.EMAIL_WINDOW_MS) emailHour++;
  });
  if (ipShort >= CONFIG.IP_LIMIT_SHORT || ipDay >= CONFIG.IP_LIMIT_DAY || emailHour >= CONFIG.EMAIL_LIMIT) {
    return { error: 'rate_limited' };
  }

  // 3. Decide the notification before writing, so the cap is enforced under the same lock.
  var state = q.spam ? 'NOT_SENT_SPAM' : (emailCapReached_(notes, nowMs) ? 'SUPPRESSED' : 'SENDING');

  // 4. Store. Enquiry first: if a later write fails, a retry may duplicate the row but never loses it.
  var id = newEnquiryId_(enquiries, now);
  var stamp = istStamp_(now);
  writeTextRow_(enquiries, enquiries.getLastRow() + 1, [id, stamp, q.name, q.email, q.phone, q.company,
    q.businessType, q.interest, q.message, q.spam ? 'SPAM' : 'NEW', q.source]);
  writeTextRow_(keys, keys.getLastRow() + 1, [q.submissionId || ('none-' + id), id, stamp, q.ipHash, emailHash,
    q.spam ? 'SPAM' : 'STORED']);
  writeTextRow_(notes, notes.getLastRow() + 1, [id, state, state === 'SENDING' ? '1' : '0',
    state === 'SENDING' ? stamp : '', stamp, state === 'SUPPRESSED' ? 'Email cap reached' : '']);
  SpreadsheetApp.flush();
  return { id: id, enquiry: q, timestamp: now, sendNow: state === 'SENDING' };
}

function emailCapReached_(notes, nowMs) {
  var hour = 0, day = 0;
  readRecent_(notes, SCHEMAS.notifications.headers.length).forEach(function (r) {
    var s = String(r[1]);
    if (s !== 'SENDING' && s !== 'SENT' && s !== 'UNCONFIRMED') return;
    var t = Date.parse(r[3]);
    if (!(t > 0)) return;
    if (nowMs - t < 60 * 60 * 1000) hour++;
    if (nowMs - t < 24 * 60 * 60 * 1000) day++;
  });
  return hour >= CONFIG.EMAIL_CAP_HOUR || day >= CONFIG.EMAIL_CAP_DAY;
}

/* ================================================================== sheets */

function getSpreadsheet_() {
  var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
}

/**
 * Returns the tab, creating it with headers if it does not exist (or is completely empty).
 * An existing tab whose header row differs is never modified: a SchemaError stops the write.
 */
function openSheet_(ss, schema) {
  var sheet = ss.getSheetByName(schema.name);
  if (!sheet) sheet = ss.insertSheet(schema.name);
  var n = schema.headers.length;
  if (sheet.getLastRow() === 0 && sheet.getLastColumn() === 0) {
    writeTextRow_(sheet, 1, schema.headers);
    sheet.getRange(1, 1, 1, n).setFontWeight('bold');
    sheet.setFrozenRows(1);
    return sheet;
  }
  var width = Math.max(sheet.getLastColumn(), n);
  var actual = sheet.getRange(1, 1, 1, width).getValues()[0].map(function (v) { return String(v); });
  for (var i = 0; i < n; i++) {
    if (actual[i] !== schema.headers[i]) {
      throw new SchemaError('"' + schema.name + '" column ' + (i + 1) + ' is "' + actual[i] + '", expected "' + schema.headers[i] + '"');
    }
  }
  for (var j = n; j < width; j++) {
    if (!schema.allowExtraColumns || actual[j] === '') {
      throw new SchemaError('"' + schema.name + '" has an unexpected column ' + (j + 1) + ' ("' + actual[j] + '")');
    }
  }
  return sheet;
}

/**
 * Writes one row so that every value stays exactly as submitted:
 *  - values starting with = + - @ tab or CR get a leading apostrophe (Sheets' quote prefix: stored as text,
 *    the apostrophe is not part of the value), so they can never become formulas;
 *  - every other cell is formatted as plain text (@) before writing, so leading zeros, dates,
 *    TRUE/FALSE and numbers are kept as typed.
 */
function writeTextRow_(sheet, row, values) {
  writeTextCells_(sheet, row, 1, values);
}

function writeTextCells_(sheet, row, col, values) {
  var formats = [], out = [];
  values.forEach(function (v) {
    var s = v === null || v === undefined ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s)) { out.push("'" + s); formats.push('General'); }
    else { out.push(s); formats.push('@'); }
  });
  var range = sheet.getRange(row, col, 1, out.length);
  range.setNumberFormats([formats]);
  range.setValues([out]);
}

function findRow_(sheet, col, value) {
  var last = sheet.getLastRow();
  if (last < 2) return 0;
  var hit = sheet.getRange(2, col, last - 1, 1).createTextFinder(value).matchEntireCell(true).findNext();
  return hit ? hit.getRow() : 0;
}

function readRecent_(sheet, cols) {
  var last = sheet.getLastRow();
  if (last < 2) return [];
  var start = Math.max(2, last - CONFIG.RECENT_ROWS + 1);
  return sheet.getRange(start, 1, last - start + 1, cols).getValues();
}

function newEnquiryId_(sheet, now) {
  var day = Utilities.formatDate(now, CONFIG.TZ, 'yyyyMMdd');
  var alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (var attempt = 0; attempt < 5; attempt++) {
    var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid());
    var suffix = '';
    for (var i = 0; i < 6; i++) suffix += alphabet.charAt((bytes[i] + 256) % alphabet.length);
    var id = CONFIG.ID_PREFIX + '-' + day + '-' + suffix;
    if (!findRow_(sheet, 1, id)) return id;
  }
  throw new Error('could not generate a unique enquiry ID');
}

function istStamp_(d) {
  return Utilities.formatDate(d, CONFIG.TZ, "yyyy-MM-dd'T'HH:mm:ss'+05:30'");
}

function sha256Hex_(s) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s).map(function (b) {
    return ('0' + ((b + 256) % 256).toString(16)).slice(-2);
  }).join('');
}

/* ================================================================== notifications */

function notifyAddress_() {
  return PropertiesService.getScriptProperties().getProperty('NOTIFY_EMAIL') || CONFIG.DEFAULT_NOTIFY_EMAIL;
}

/** Sends one enquiry email and records the outcome. Never throws. */
function deliver_(id, q, timestamp) {
  var notes;
  try {
    notes = openSheet_(getSpreadsheet_(), SCHEMAS.notifications);
    sendEnquiryEmail_(id, timestamp, q);
  } catch (err) {
    console.error('Email for ' + id + ' failed: ' + (err && err.message || err));
    try { if (notes) setNotification_(notes, id, 'FAILED', null, String(err && err.message || err).slice(0, 300)); }
    catch (e2) { console.error('Could not record FAILED for ' + id + ': ' + e2); }
    return false;
  }
  try { setNotification_(notes, id, 'SENT', null, ''); }
  catch (e3) { console.error('Sent ' + id + ' but could not record it (stays SENDING, then UNCONFIRMED): ' + e3); }
  return true;
}

/** Updates the Notifications row for an enquiry: state, optional attempts, detail, timestamps. */
function setNotification_(notes, id, state, attempts, detail) {
  var row = findRow_(notes, 1, id);
  if (!row) throw new Error('no notification row for ' + id);
  var cur = notes.getRange(row, 1, 1, 6).getValues()[0];
  var stamp = istStamp_(new Date());
  writeTextCells_(notes, row, 2, [state, attempts === null ? String(cur[2]) : String(attempts),
    state === 'SENDING' ? stamp : String(cur[3]), stamp, detail]);
}

function sendEnquiryEmail_(id, timestamp, q) {
  var when = Utilities.formatDate(timestamp, CONFIG.TZ, "d MMM yyyy, HH:mm 'IST'");
  var rows = [['Enquiry ID', id], ['Received', when], ['Name', q.name], ['Business email', q.email],
              ['Phone', q.phone || '—'], ['Company', q.company], ['Business type', q.businessType || '—'],
              ['Area of interest', q.interest || '—'], ['Source', q.source]];
  var text = rows.map(function (r) { return r[0] + ': ' + r[1]; }).join('\n') + '\n\nMessage:\n' + q.message +
             '\n\nReply to this email to answer ' + q.name + ' directly.';
  var html = '<table style="border-collapse:collapse;font:14px Arial,sans-serif">' +
    rows.map(function (r) {
      return '<tr><td style="padding:4px 14px 4px 0;color:#666;vertical-align:top">' + esc_(r[0]) +
             '</td><td style="padding:4px 0">' + esc_(r[1]) + '</td></tr>';
    }).join('') + '</table><p style="font:14px Arial,sans-serif;white-space:pre-wrap;margin-top:16px">' +
    esc_(q.message) + '</p><p style="font:12px Arial,sans-serif;color:#888">Reply to this email to answer ' +
    esc_(q.name) + ' directly.</p>';
  MailApp.sendEmail({
    to: notifyAddress_(),
    replyTo: q.email,   // validated by validate_(); a single address, no list separators possible
    name: 'NXT Foundry Website',
    subject: 'New enquiry ' + id + ' — ' + q.name + ' (' + q.company + ')',
    body: text,
    htmlBody: html
  });
}

function esc_(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** At most one alert email an hour when enquiries are being refused because a tab's headers changed. */
function alertSchemaProblem_(detail) {
  try {
    var cache = CacheService.getScriptCache();
    if (cache.get('schema-alert')) return;
    cache.put('schema-alert', '1', 60 * 60);
    MailApp.sendEmail({
      to: notifyAddress_(),
      name: 'NXT Foundry Website',
      subject: 'Action needed: website enquiries are being refused',
      body: 'The enquiry backend refused to write because a sheet does not have the expected columns:\n\n' + detail +
            '\n\nVisitors are being asked to try again or email us. Put the header row back exactly as documented ' +
            '(docs/Website-Enquiries-Backend.md) and run setup() to check it.'
    });
  } catch (err) {
    console.error('Could not send schema alert: ' + err);
  }
}

/* ================================================================== retries (daily trigger) */

/**
 * Run daily by a time-driven trigger (see the setup guide), or by hand.
 *  1. SENDING older than 15 min -> UNCONFIRMED (not resent: it may have gone out).
 *  2. FAILED -> resent one by one, each claimed under the lock first, so two runs can never send the same email.
 *  3. SUPPRESSED -> listed in one summary email, then marked SUMMARISED.
 * A run guard stops a second run from starting while one is active.
 */
function processNotifications() {
  if (!acquireRunGuard_()) { console.log('processNotifications is already running; skipped.'); return; }
  try {
    var ss = getSpreadsheet_();
    var notes = openSheet_(ss, SCHEMAS.notifications);
    var enquiries = openSheet_(ss, SCHEMAS.enquiries);

    withLock_(function () {
      var nowMs = Date.now();
      eachNotification_(notes, function (r, row) {
        var t = Date.parse(r[3]);
        if (String(r[1]) === 'SENDING' && t > 0 && nowMs - t > CONFIG.STALE_SENDING_MS) {
          writeTextCells_(notes, row, 2, ['UNCONFIRMED', String(r[2]), String(r[3]), istStamp_(new Date()),
            'Outcome unknown; check the inbox before resending by hand']);
        }
      });
    });

    var failed = [];
    eachNotification_(notes, function (r) { if (String(r[1]) === 'FAILED') failed.push(String(r[0])); });
    failed.slice(0, CONFIG.RETRY_BATCH).forEach(function (id) {
      var claim = withLock_(function () {
        var row = findRow_(notes, 1, id);
        if (!row) return null;
        var cur = notes.getRange(row, 1, 1, 6).getValues()[0];
        if (String(cur[1]) !== 'FAILED') return null;                 // someone else handled it
        var attempts = Number(cur[2]) || 0;
        if (attempts >= CONFIG.MAX_ATTEMPTS) {
          setNotification_(notes, id, 'GAVE_UP', attempts, 'Failed ' + attempts + ' times; send by hand');
          return null;
        }
        if (emailCapReached_(notes, Date.now())) return null;         // try again next run
        setNotification_(notes, id, 'SENDING', attempts + 1, 'Retry');
        SpreadsheetApp.flush();
        return true;
      });
      if (!claim) return;
      var q = loadEnquiry_(enquiries, id);
      if (!q) { setNotification_(notes, id, 'GAVE_UP', null, 'Enquiry row not found'); return; }
      deliver_(id, q, q.timestamp);
    });

    sendSummary_(notes, enquiries);
  } finally {
    releaseRunGuard_();
  }
}

function sendSummary_(notes, enquiries) {
  var ids = withLock_(function () {
    var claimed = [];
    eachNotification_(notes, function (r, row) {
      if (String(r[1]) !== 'SUPPRESSED' || claimed.length >= CONFIG.SUMMARY_BATCH) return;
      writeTextCells_(notes, row, 2, ['SUMMARISING', String(r[2]), String(r[3]), istStamp_(new Date()), '']);
      claimed.push(String(r[0]));
    });
    SpreadsheetApp.flush();
    return claimed;
  });
  if (!ids.length) return;
  var lines = ids.map(function (id) {
    var q = loadEnquiry_(enquiries, id);
    return q ? id + ' — ' + q.name + ', ' + q.company + ' <' + q.email + '>' : id;
  });
  try {
    MailApp.sendEmail({
      to: notifyAddress_(),
      name: 'NXT Foundry Website',
      subject: ids.length + ' website enquir' + (ids.length === 1 ? 'y' : 'ies') + ' stored without an individual email',
      body: 'The hourly or daily email cap was reached, so these enquiries were stored in the sheet without ' +
            'their own notification. Each is in "Website Enquiries" with its details:\n\n' + lines.join('\n')
    });
    withLock_(function () { ids.forEach(function (id) { setNotification_(notes, id, 'SUMMARISED', null, ''); }); });
  } catch (err) {
    console.error('Summary email failed: ' + err);
    withLock_(function () { ids.forEach(function (id) { setNotification_(notes, id, 'SUPPRESSED', null, 'Summary failed; will retry'); }); });
  }
}

function eachNotification_(notes, fn) {
  var last = notes.getLastRow();
  if (last < 2) return;
  notes.getRange(2, 1, last - 1, SCHEMAS.notifications.headers.length).getValues().forEach(function (r, i) { fn(r, i + 2); });
}

function loadEnquiry_(enquiries, id) {
  var row = findRow_(enquiries, 1, id);
  if (!row) return null;
  var r = enquiries.getRange(row, 1, 1, SCHEMAS.enquiries.headers.length).getValues()[0];
  var t = Date.parse(r[1]);
  return { name: String(r[2]), email: String(r[3]), phone: String(r[4]), company: String(r[5]), businessType: String(r[6]),
           interest: String(r[7]), message: String(r[8]), source: String(r[10]), timestamp: t > 0 ? new Date(t) : new Date() };
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);   // the daily job can wait longer than a visitor request
  try { return fn(); } finally { lock.releaseLock(); }
}

function acquireRunGuard_() {
  return withLock_(function () {
    var props = PropertiesService.getScriptProperties();
    var until = Number(props.getProperty('NOTIFY_RUN_UNTIL') || 0);
    if (until > Date.now()) return false;
    props.setProperty('NOTIFY_RUN_UNTIL', String(Date.now() + CONFIG.RUN_GUARD_MS));
    return true;
  });
}

function releaseRunGuard_() {
  withLock_(function () { PropertiesService.getScriptProperties().deleteProperty('NOTIFY_RUN_UNTIL'); });
}

/* ================================================================== setup and checks (run from the editor) */

/**
 * Run once after pasting the code, and again any time to check the sheet. Creates missing tabs,
 * checks every header row (never rewrites one), adds the Status dropdown and warning-only protection.
 */
function setup() {
  var ss = getSpreadsheet_();
  var enquiries = openSheet_(ss, SCHEMAS.enquiries);
  var keys = openSheet_(ss, SCHEMAS.keys);
  var notes = openSheet_(ss, SCHEMAS.notifications);

  // Open-ended A1 ranges (J2:J, A:B) also cover rows added later.
  var rule = SpreadsheetApp.newDataValidation().requireValueInList(CONFIG.STATUSES, true).setAllowInvalid(false)
    .setHelpText('NEW, ACKNOWLEDGED, QUALIFIED, CLOSED or SPAM').build();
  enquiries.getRange('J2:J').setDataValidation(rule);

  protectOnce_(enquiries, enquiries.getRange('A:B'), 'Enquiry ID and timestamp: written by the website backend');
  protectOnce_(enquiries, enquiries.getRange('A1:K1'), 'Header row: n8n and the backend depend on it');
  protectOnce_(keys, null, 'Submission Keys: managed by the website backend');
  protectOnce_(notes, null, 'Notifications: managed by the website backend');

  if (!PropertiesService.getScriptProperties().getProperty('ENQUIRY_SHARED_SECRET')) {
    console.warn('Set the ENQUIRY_SHARED_SECRET script property before deploying.');
  }
  console.log('Sheets OK. Mail quota remaining today: ' + MailApp.getRemainingDailyQuota());
}

/** Warning-only protection (people can still edit after a confirmation). range null = whole tab. */
function protectOnce_(sheet, range, description) {
  var type = range ? SpreadsheetApp.ProtectionType.RANGE : SpreadsheetApp.ProtectionType.SHEET;
  var existing = sheet.getProtections(type).some(function (p) { return p.getDescription() === description; });
  if (!existing) (range || sheet).protect().setDescription(description).setWarningOnly(true);
}

/**
 * Run once from the editor to confirm, on real Google Sheets, that writeTextRow_ keeps values exactly.
 * Uses a temporary tab and deletes it afterwards. Look for "ALL PASS" in the log.
 */
function selfTestTextPreservation() {
  var ss = getSpreadsheet_();
  var sheet = ss.insertSheet('zz-selftest-' + Date.now());
  var samples = ['=1+1', '+91 98765 43210', '-bullet', '@handle', '08040001234', '007', '1e5', 'TRUE',
                 '3/4', '2026-11-12', '12:30', '1,000', '₹50 Cr', '=HYPERLINK("http://x","y")', 'plain text'];
  try {
    writeTextRow_(sheet, 1, samples);
    SpreadsheetApp.flush();
    var values = sheet.getRange(1, 1, 1, samples.length).getValues()[0];
    var shown = sheet.getRange(1, 1, 1, samples.length).getDisplayValues()[0];
    var formulas = sheet.getRange(1, 1, 1, samples.length).getFormulas()[0];
    var fails = [];
    samples.forEach(function (s, i) {
      if (values[i] !== s || shown[i] !== s || formulas[i] !== '') {
        fails.push(JSON.stringify(s) + ' -> value ' + JSON.stringify(values[i]) + ', shown ' + JSON.stringify(shown[i]) + ', formula ' + JSON.stringify(formulas[i]));
      }
    });
    console.log(fails.length ? 'FAIL:\n' + fails.join('\n') : 'ALL PASS (' + samples.length + ' values kept exactly as text)');
  } finally {
    ss.deleteSheet(sheet);
  }
}

/** Run from the editor to try the whole path (store + email) without the website. */
function testSubmission() {
  var secret = PropertiesService.getScriptProperties().getProperty('ENQUIRY_SHARED_SECRET');
  var res = doPost({ postData: { contents: JSON.stringify({
    secret: secret, submissionId: Utilities.getUuid(), ipHash: 'editor-test-0000000', source: 'Apps Script editor test',
    name: 'Test Person', email: CONFIG.DEFAULT_NOTIFY_EMAIL, phone: '+91 98765 43210', company: 'Test Co',
    businessType: 'Other', interest: 'Not sure yet', message: 'Test enquiry from the Apps Script editor. Safe to delete.'
  }) } });
  console.log(res.getContent());
}

function respond_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
