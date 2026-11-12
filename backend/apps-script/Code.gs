/**
 * NXT Foundry — website enquiry backend (Google Apps Script web app).
 *
 * Temporary system of record until n8n takes over. The website never calls this directly:
 * the Vercel function /api/enquiry forwards each enquiry here with a shared secret.
 *
 *   POST body (JSON, sent as text/plain):
 *     { secret, submissionId, source, name, email, phone, company, businessType, interest, message }
 *   Response (always HTTP 200 — Apps Script cannot set status codes — so read "ok"):
 *     { ok: true,  enquiryId: "NXT-20261112-7KQ2MD" }
 *     { ok: false, error: "validation", fields: { email: true } }
 *     { ok: false, error: "unauthorized" | "bad_request" | "rate_limited" | "server_error" }
 *
 * Order of work: validate -> store the row (under a lock) -> email. The row is written and
 * flushed before the email is attempted, so a mail failure never loses an enquiry; failures are
 * recorded in the "Notification Log" sheet and can be re-sent with retryFailedEmails().
 *
 * Script properties (Project Settings -> Script properties):
 *   ENQUIRY_SHARED_SECRET  required  same value as the Vercel env var of the same name
 *   NOTIFY_EMAIL           optional  defaults to hello@nxtfoundry.in
 *   SPREADSHEET_ID         optional  only if this script is NOT bound to the enquiries spreadsheet
 */

var CONFIG = {
  SHEET_NAME: 'Website Enquiries',
  LOG_SHEET_NAME: 'Notification Log',
  DEFAULT_NOTIFY_EMAIL: 'hello@nxtfoundry.in',
  DEFAULT_SOURCE: 'Website contact form',
  ID_PREFIX: 'NXT',
  // Column order is the contract n8n will read. Add new columns at the end, never reorder.
  HEADERS: ['Enquiry ID', 'Submission timestamp', 'Name', 'Business email', 'Phone', 'Company',
            'Business type', 'Area of interest', 'Message', 'Status', 'Source'],
  DEFAULT_STATUS: 'NEW',
  LIMITS: { name: 100, email: 254, phone: 25, company: 150, businessType: 80, interest: 100, message: 5000, source: 60 },
  REQUIRED: ['name', 'email', 'company', 'message'],
  RATE_LIMIT_PER_EMAIL: 5,          // enquiries per email address ...
  RATE_LIMIT_WINDOW_S: 60 * 60,     // ... per hour
  DEDUPE_WINDOW_S: 6 * 60 * 60      // a retried submissionId returns the original enquiry ID for 6 hours
};

var LOG_HEADERS = ['Logged at', 'Enquiry ID', 'Event', 'Detail'];
var EMAIL_RE = /^[^\s@<>()[\],;:"\\]+@[^\s@<>()[\],;:"\\]+\.[^\s@<>()[\],;:"\\]{2,}$/;

/* ------------------------------------------------------------------ entry points */

function doPost(e) {
  try {
    var payload = parseBody_(e);
    if (!payload) return respond_({ ok: false, error: 'bad_request' });
    if (!isAuthorized_(payload.secret)) return respond_({ ok: false, error: 'unauthorized' });

    var result = validate_(payload);
    if (!result.ok) return respond_({ ok: false, error: 'validation', fields: result.fields });
    var enquiry = result.enquiry;

    var cache = CacheService.getScriptCache();
    var dedupeKey = enquiry.submissionId ? 'sub:' + enquiry.submissionId : null;
    if (dedupeKey) {
      var earlier = cache.get(dedupeKey);
      if (earlier) return respond_({ ok: true, enquiryId: earlier });
    }
    if (isRateLimited_(cache, enquiry.email)) return respond_({ ok: false, error: 'rate_limited' });

    var stored = storeEnquiry_(enquiry, dedupeKey, cache);   // throws if the row could not be written
    notifyTeam_(stored);                                     // never throws
    return respond_({ ok: true, enquiryId: stored.id });
  } catch (err) {
    console.error('doPost failed: ' + (err && err.stack || err));
    return respond_({ ok: false, error: 'server_error' });
  }
}

/** Health check for testing the deployment URL in a browser. Reveals nothing about the data. */
function doGet() {
  return respond_({ ok: true, service: 'nxt-foundry-enquiries' });
}

/* ------------------------------------------------------------------ validation */

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
  return { ok: true, enquiry: out };
}

function isRateLimited_(cache, email) {
  var key = 'rate:' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, email));
  var count = Number(cache.get(key) || 0);
  if (count >= CONFIG.RATE_LIMIT_PER_EMAIL) return true;
  cache.put(key, String(count + 1), CONFIG.RATE_LIMIT_WINDOW_S);
  return false;
}

/* ------------------------------------------------------------------ storage */

function getSpreadsheet_() {
  var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
}

function getSheet_(name, headers) {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(name) || ss.insertSheet(name);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/** Stops a value being read as a formula when the sheet is opened (=, +, -, @ at the start). */
function cellSafe_(v) {
  return typeof v === 'string' && /^[=+\-@\t\r]/.test(v) ? "'" + v : v;
}

function newEnquiryId_(sheet, now) {
  var day = Utilities.formatDate(now, 'Asia/Kolkata', 'yyyyMMdd');
  var alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (var attempt = 0; attempt < 5; attempt++) {
    var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid());
    var suffix = '';
    for (var i = 0; i < 6; i++) suffix += alphabet.charAt((bytes[i] + 256) % alphabet.length);
    var id = CONFIG.ID_PREFIX + '-' + day + '-' + suffix;
    var clash = sheet.getLastRow() > 1 && sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).createTextFinder(id).matchEntireCell(true).findNext();
    if (!clash) return id;
  }
  throw new Error('could not generate a unique enquiry ID');
}

function storeEnquiry_(enquiry, dedupeKey, cache) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);   // throws after 20 s -> server_error, nothing half-written
  try {
    if (dedupeKey) {      // a retry may have landed while we waited for the lock
      var earlier = cache.get(dedupeKey);
      if (earlier) return { id: earlier, duplicate: true, enquiry: enquiry };
    }
    var sheet = getSheet_(CONFIG.SHEET_NAME, CONFIG.HEADERS);
    var now = new Date();
    var id = newEnquiryId_(sheet, now);
    var row = [id, now, enquiry.name, enquiry.email, enquiry.phone, enquiry.company, enquiry.businessType,
               enquiry.interest, enquiry.message, CONFIG.DEFAULT_STATUS, enquiry.source].map(cellSafe_);
    sheet.appendRow(row);
    sheet.getRange(sheet.getLastRow(), 2).setNumberFormat('yyyy-mm-dd hh:mm:ss');
    SpreadsheetApp.flush();
    if (dedupeKey) cache.put(dedupeKey, id, CONFIG.DEDUPE_WINDOW_S);
    return { id: id, timestamp: now, enquiry: enquiry, duplicate: false };
  } finally {
    lock.releaseLock();
  }
}

/* ------------------------------------------------------------------ notification */

function notifyTeam_(stored) {
  if (stored.duplicate) return;
  try {
    sendEnquiryEmail_(stored.id, stored.timestamp, stored.enquiry);
  } catch (err) {
    console.error('Email for ' + stored.id + ' failed: ' + err);
    logEvent_(stored.id, 'EMAIL_FAILED', String(err && err.message || err));
  }
}

function sendEnquiryEmail_(id, timestamp, q) {
  var to = PropertiesService.getScriptProperties().getProperty('NOTIFY_EMAIL') || CONFIG.DEFAULT_NOTIFY_EMAIL;
  var when = Utilities.formatDate(timestamp, 'Asia/Kolkata', "d MMM yyyy, HH:mm 'IST'");
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
    to: to,
    replyTo: q.email,   // validated by validate_()
    name: 'NXT Foundry Website',
    subject: 'New enquiry ' + id + ' — ' + q.name + ' (' + q.company + ')',
    body: text,
    htmlBody: html
  });
}

function esc_(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function logEvent_(id, event, detail) {
  try {
    getSheet_(CONFIG.LOG_SHEET_NAME, LOG_HEADERS).appendRow([new Date(), id, event, cellSafe_(detail)]);
  } catch (err) {
    console.error('Could not write to the notification log: ' + err);
  }
}

/**
 * Run by hand (or on a time trigger) to re-send emails that failed.
 * Re-sends every EMAIL_FAILED entry that has no later EMAIL_RESENT entry.
 */
function retryFailedEmails() {
  var log = getSheet_(CONFIG.LOG_SHEET_NAME, LOG_HEADERS);
  if (log.getLastRow() < 2) return;
  var entries = log.getRange(2, 1, log.getLastRow() - 1, 4).getValues();
  var pending = {};
  entries.forEach(function (r) {
    if (r[2] === 'EMAIL_FAILED') pending[r[1]] = true;
    if (r[2] === 'EMAIL_RESENT') delete pending[r[1]];
  });
  var ids = Object.keys(pending);
  if (!ids.length) return;
  var sheet = getSheet_(CONFIG.SHEET_NAME, CONFIG.HEADERS);
  var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, CONFIG.HEADERS.length).getValues();
  data.forEach(function (r) {
    if (!pending[r[0]]) return;
    var q = { name: r[2], email: r[3], phone: r[4], company: r[5], businessType: r[6], interest: r[7], message: r[8], source: r[10] };
    try { sendEnquiryEmail_(r[0], r[1] instanceof Date ? r[1] : new Date(), q); logEvent_(r[0], 'EMAIL_RESENT', ''); }
    catch (err) { console.error('Retry for ' + r[0] + ' failed: ' + err); }
  });
}

/* ------------------------------------------------------------------ helpers for setup and testing */

/** Run once after pasting the code: creates both sheets with headers and asks for Sheets + Mail permission. */
function setup() {
  getSheet_(CONFIG.SHEET_NAME, CONFIG.HEADERS);
  getSheet_(CONFIG.LOG_SHEET_NAME, LOG_HEADERS);
  if (!PropertiesService.getScriptProperties().getProperty('ENQUIRY_SHARED_SECRET')) {
    console.warn('Set the ENQUIRY_SHARED_SECRET script property before deploying.');
  }
  console.log('Mail quota remaining today: ' + MailApp.getRemainingDailyQuota());
}

/** Run from the editor to try the whole path (store + email) without the website. */
function testSubmission() {
  var secret = PropertiesService.getScriptProperties().getProperty('ENQUIRY_SHARED_SECRET');
  var res = doPost({ postData: { contents: JSON.stringify({
    secret: secret, submissionId: Utilities.getUuid(), source: 'Apps Script editor test',
    name: 'Test Person', email: (CONFIG.DEFAULT_NOTIFY_EMAIL), phone: '+91 98765 43210', company: 'Test Co',
    businessType: 'Other', interest: 'Not sure yet', message: 'Test enquiry from the Apps Script editor. Safe to delete.'
  }) } });
  console.log(res.getContent());
}

function respond_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
