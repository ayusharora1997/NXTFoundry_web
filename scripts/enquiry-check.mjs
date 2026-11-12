// Contact-form backend checks: runs the real backend/apps-script/Code.gs (in a VM with fake Google services)
// behind the real api/enquiry.ts. Run with: npm run test:enquiry   (Node 22.18+/24, which runs .ts directly)
//
// The fake Sheets models how Google Sheets converts typed-in values (numbers, dates, TRUE/FALSE, formulas,
// leading zeros) so the text-preservation tests are meaningful, but it is a model: confirm on real Google
// Sheets once with selfTestTextPreservation() in the Apps Script editor (see the setup guide).
import fs from 'node:fs'; import vm from 'node:vm'; import nodeCrypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url'; import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CODE = fs.readFileSync(process.env.ENQUIRY_CODE_PATH || path.join(root, 'backend/apps-script/Code.gs'), 'utf8');   // env override: mutation testing
const APPS_URL = 'https://script.google.com/macros/s/TEST/exec';
const SECRET = 'test-shared-secret-0123456789';
const ORIGIN = 'https://nxtfoundry.in';

/* ------------------------------------------------------------------ fake Google Sheets */

const NUMERIC = /^[+-]?(\d+([.,]\d+)*|\d*\.\d+)(e[+-]?\d+)?$/i;
function convert(raw, fmt) {           // what Sheets does with a value written by setValues
  if (typeof raw !== 'string') return { v: raw };
  if (raw.startsWith("'")) return { v: raw.slice(1), quote: true };
  // Pessimistic: assume a leading "=" is a formula even in a plain-text cell, so only the quote prefix protects.
  if (raw.startsWith('=')) return { v: '#FORMULA', formula: raw };
  if (fmt === '@') return { v: raw };
  if (raw.startsWith('=') || /^[+-]\d/.test(raw) || raw.startsWith('@')) return { v: '#FORMULA', formula: raw };
  if (NUMERIC.test(raw)) return { v: Number(raw.replace(/,/g, '')) };
  if (/^(true|false)$/i.test(raw)) return { v: raw.toLowerCase() === 'true' };
  if (/^\d{1,4}[/-]\d{1,2}([/-]\d{1,4})?$/.test(raw) || /^\d{1,2}:\d{2}$/.test(raw)) return { v: new Date(0) };
  return { v: raw };
}
function colNum(letters) { return [...letters].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0); }

class FakeSheet {
  constructor(world, name) { this.world = world; this.name = name; this.cells = new Map(); this.validations = []; this.protections = []; this.frozen = 0; }
  key(r, c) { return r + ':' + c; }
  cell(r, c) { return this.cells.get(this.key(r, c)) || { v: '', fmt: 'General' }; }
  put(r, c, cell) { this.cells.set(this.key(r, c), cell); }
  getName() { return this.name; }
  getLastRow() { let m = 0; for (const [k, c] of this.cells) if (c.v !== '') m = Math.max(m, +k.split(':')[0]); return m; }
  getLastColumn() { let m = 0; for (const [k, c] of this.cells) if (c.v !== '') m = Math.max(m, +k.split(':')[1]); return m; }
  getMaxRows() { return 1000; }
  setFrozenRows(n) { this.frozen = n; }
  getRange(a, b, nr = 1, nc = 1) {
    if (typeof a === 'string') {
      const m = /^([A-Z]+)(\d*)(?::([A-Z]+)(\d*))?$/.exec(a);
      const c1 = colNum(m[1]), r1 = m[2] ? +m[2] : 1, c2 = m[3] ? colNum(m[3]) : c1, r2 = m[4] ? +m[4] : (m[3] ? this.getMaxRows() : r1);
      return new FakeRange(this, r1, c1, r2 - r1 + 1, c2 - c1 + 1);
    }
    if (nr < 1 || nc < 1) throw new Error('The number of rows in the range must be at least 1.');
    return new FakeRange(this, a, b, nr, nc);
  }
  getProtections(type) { return this.protections.filter(p => p.type === type); }
  protect() { return this.world.newProtection(this, 'SHEET'); }
  snapshot() { return JSON.stringify([...this.cells.entries()].sort()); }
}
class FakeRange {
  constructor(sheet, row, col, nr, nc) { Object.assign(this, { sheet, row, col, nr, nc }); }
  each(fn) { for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) fn(this.row + i, this.col + j, i, j); }
  grid(fn) { return Array.from({ length: this.nr }, (_, i) => Array.from({ length: this.nc }, (_, j) => fn(this.sheet.cell(this.row + i, this.col + j)))); }
  getValues() { return this.grid(c => c.v); }
  getValue() { return this.getValues()[0][0]; }
  getDisplayValues() { return this.grid(c => c.v instanceof Date ? 'DATE' : String(c.v)); }
  getFormulas() { return this.grid(c => c.formula || ''); }
  getRow() { return this.row; }
  getSheet() { return this.sheet; }
  setNumberFormats(f) { this.each((r, c, i, j) => this.sheet.put(r, c, { ...this.sheet.cell(r, c), fmt: f[i][j] })); return this; }
  setNumberFormat(f) { this.each((r, c) => this.sheet.put(r, c, { ...this.sheet.cell(r, c), fmt: f })); return this; }
  setValues(v) {
    this.sheet.world.recordWrite(this.sheet);
    this.each((r, c, i, j) => { const fmt = this.sheet.cell(r, c).fmt; this.sheet.put(r, c, { fmt, ...convert(v[i][j], fmt) }); });
    return this;
  }
  setValue(v) { return this.setValues([[v]]); }
  setFontWeight() { return this; }
  setDataValidation(rule) { this.sheet.validations.push({ a1: [this.row, this.col, this.nr, this.nc], rule }); return this; }
  protect() { return this.sheet.world.newProtection(this.sheet, 'RANGE'); }
  createTextFinder(text) {
    const range = this;
    return { matchEntireCell() { return { findNext() {
      for (let i = 0; i < range.nr; i++) for (let j = 0; j < range.nc; j++) {
        if (String(range.sheet.cell(range.row + i, range.col + j).v) === text) return new FakeRange(range.sheet, range.row + i, range.col + j, 1, 1);
      }
      return null;
    } }; } };
  }
}

function makeWorld({ mailFails = false } = {}) {
  const world = {
    sheets: new Map(), mails: [], logs: [], props: new Map([['ENQUIRY_SHARED_SECRET', SECRET]]), cache: new Map(),
    lock: { held: false, external: false }, writesOutsideLock: [], mailFails, quota: 1500,
    recordWrite(sheet) { if (!this.lock.held && sheet.name !== 'Notifications') this.writesOutsideLock.push(sheet.name); },
    newProtection(sheet, type) {
      const p = { type, desc: '', warn: false, setDescription(d) { this.desc = d; return this; }, setWarningOnly(w) { this.warn = w; return this; }, getDescription() { return this.desc; } };
      sheet.protections.push(p); return p;
    },
  };
  const ss = {
    getSheetByName: n => world.sheets.get(n) || null,
    insertSheet: n => { const s = new FakeSheet(world, n); world.sheets.set(n, s); return s; },
    deleteSheet: s => world.sheets.delete(s.name),
  };
  const lockObj = {
    tryLock() { if (world.lock.held || world.lock.external) return false; world.lock.held = true; return true; },
    waitLock() { if (!this.tryLock()) throw new Error('Lock timeout: another process was holding the lock for too long.'); },
    releaseLock() { world.lock.held = false; },
  };
  const pad = n => String(n).padStart(2, '0');
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const formatDate = (d, tz, pattern) => {
    const t = new Date(d.getTime() + 330 * 60000);
    const tok = { yyyy: t.getUTCFullYear(), MMM: MON[t.getUTCMonth()], MM: pad(t.getUTCMonth() + 1), dd: pad(t.getUTCDate()), d: t.getUTCDate(), HH: pad(t.getUTCHours()), mm: pad(t.getUTCMinutes()), ss: pad(t.getUTCSeconds()) };
    return pattern.replace(/'([^']*)'|yyyy|MMM|MM|dd|d|HH|mm|ss/g, (m, lit) => lit !== undefined ? lit : String(tok[m]));
  };
  const log = level => (...a) => world.logs.push(level + ': ' + a.join(' '));
  const ctx = {
    console: { log: log('log'), warn: log('warn'), error: log('error') },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ss, openById: () => ss, flush() {},
      ProtectionType: { RANGE: 'RANGE', SHEET: 'SHEET' },
      newDataValidation() { const r = {}; const b = { requireValueInList(l) { r.list = l; return b; }, setAllowInvalid(v) { r.allowInvalid = v; return b; }, setHelpText() { return b; }, build: () => r }; return b; },
    },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => world.props.get(k) ?? null, setProperty: (k, v) => world.props.set(k, v), deleteProperty: k => world.props.delete(k) }) },
    CacheService: { getScriptCache: () => ({ get: k => world.cache.get(k) ?? null, put: (k, v) => world.cache.set(k, v) }) },
    LockService: { getScriptLock: () => lockObj },
    MailApp: {
      sendEmail(m) {
        if (world.mailFails || world.quota <= 0) throw new Error('Service invoked too many times for one day: email.');
        world.quota--; world.mails.push(m);
        if (world.onSend) { const f = world.onSend; world.onSend = null; f(); }
      },
      getRemainingDailyQuota: () => world.quota,
    },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: s => ({ setMimeType() { return this; }, getContent: () => s }) },
    Utilities: {
      formatDate, getUuid: () => nodeCrypto.randomUUID(), DigestAlgorithm: { SHA_256: 'sha256' },
      computeDigest: (_, s) => [...nodeCrypto.createHash('sha256').update(s).digest()].map(b => b > 127 ? b - 256 : b),
      base64EncodeWebSafe: bytes => Buffer.from(bytes.map(b => (b + 256) % 256)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_'),
    },
  };
  vm.createContext(ctx);
  vm.runInContext(CODE, ctx);
  world.ctx = ctx;
  world.sheet = n => world.sheets.get(n);
  world.rows = n => { const s = world.sheet(n); if (!s) return []; const last = s.getLastRow(); return last < 2 ? [] : s.getRange(2, 1, last - 1, Math.max(s.getLastColumn(), 1)).getValues(); };
  world.doPost = body => JSON.parse(ctx.doPost({ postData: { contents: typeof body === 'string' ? body : JSON.stringify(body) } }).getContent());
  return world;
}

/* ------------------------------------------------------------------ the real Vercel function, wired to the fake */

let world;
const upstreamBodies = [];
let upstreamOverride = null;
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  if (url !== APPS_URL) return realFetch(url, init);
  upstreamBodies.push(String(init.body));
  if (upstreamOverride) return upstreamOverride(init);
  return new Response(world.ctx.doPost({ postData: { contents: init.body } }).getContent(), { status: 200 });
};
const consoleOut = [];
for (const lvl of ['log', 'warn', 'error']) { const orig = console[lvl]; console[lvl] = (...a) => { consoleOut.push(a.join(' ')); if (process.env.DEBUG) orig(...a); }; }

function setEnv(over = {}) {
  Object.assign(process.env, { APPS_SCRIPT_URL: APPS_URL, ENQUIRY_SHARED_SECRET: SECRET, ENQUIRY_IP_HASH_KEY: 'ip-hash-key-for-tests', ENQUIRY_ALLOWED_ORIGINS: '' }, over);
  for (const [k, v] of Object.entries(over)) if (v === undefined) delete process.env[k];
}
const { POST } = await import(pathToFileURL(process.env.ENQUIRY_API_PATH || path.join(root, 'api/enquiry.ts')).href);
const { composePhone, COUNTRIES } = await import(pathToFileURL(path.join(root, 'src/countries.ts')).href);

let n = 0;
const valid = (over = {}) => ({ name: 'Asha Rao', email: `asha${++n}@example.com`, phone: '', company: 'Rao Traders', businessType: 'Other', interest: 'Not sure yet',
  message: 'Our vendor ledgers never match.', submissionId: nodeCrypto.randomUUID(), elapsedMs: 9000, ...over });
async function call(body, { origin = ORIGIN, ip = '203.0.113.7', ipHeader = 'x-real-ip', headers = {}, contentType = 'application/json' } = {}) {
  const h = { 'content-type': contentType, ...headers };
  if (origin !== null) h.origin = origin;
  if (ip !== null) h[ipHeader] = ip;
  const res = await POST(new Request('https://nxtfoundry.in/api/enquiry', { method: 'POST', headers: h, body: typeof body === 'string' ? body : JSON.stringify(body) }));
  return { status: res.status, body: await res.json() };
}
const ID_RE = /^NXT-\d{8}-[A-Z2-9]{6}$/;
const GOOD_HASH = nodeCrypto.createHmac('sha256', 'k').update('192.0.2.1').digest('base64url');   // 43 chars
const ENQ = 'Website Enquiries', KEYS = 'Submission Keys', NOTES = 'Notifications';
const state = id => (world.rows(NOTES).find(r => r[0] === id) || [])[1];

/* ------------------------------------------------------------------ tests */

const tests = [];
const test = (name, fn) => tests.push({ name, fn });
function eq(a, b, msg) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg || 'not equal'}\n   got:      ${JSON.stringify(a)}\n   expected: ${JSON.stringify(b)}`); }
function ok(c, msg) { if (!c) throw new Error(msg); }

test('valid enquiry: stored in 11 columns, Status NEW, IST timestamp, emailed with reply-to', async () => {
  const b = valid({ email: 'Meera@TestCo.Example', phone: '+91 80 4000 1234' });
  const r = await call(b);
  eq(r.status, 200); ok(ID_RE.test(r.body.enquiryId), 'enquiry ID format');
  const rows = world.rows(ENQ); eq(rows.length, 1);
  eq(world.sheet(ENQ).getRange(1, 1, 1, 11).getValues()[0], ['Enquiry ID', 'Submission timestamp', 'Name', 'Business email', 'Phone', 'Company', 'Business type', 'Area of interest', 'Message', 'Status', 'Source']);
  const [id, ts, ...rest] = rows[0];
  eq(id, r.body.enquiryId); ok(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\+05:30$/.test(ts), 'IST timestamp ' + ts);
  eq(rest, ['Asha Rao', 'meera@testco.example', '+91 80 4000 1234', 'Rao Traders', 'Other', 'Not sure yet', 'Our vendor ledgers never match.', 'NEW', 'Website contact form']);
  eq(state(id), 'SENT'); eq(world.mails.length, 1);
  eq([world.mails[0].to, world.mails[0].replyTo], ['hello@nxtfoundry.in', 'meera@testco.example']);
  eq(world.writesOutsideLock, [], 'enquiry/key writes all under the lock');
});

test('invalid input is rejected and nothing is stored', async () => {
  const cases = [
    [valid({ name: '' }), 400, 'name'], [valid({ email: 'not-an-email' }), 400, 'email'], [valid({ email: 'a@b.co, c@d.co' }), 400, 'email'],
    [valid({ phone: '12' }), 400, 'phone'], [valid({ message: 'x'.repeat(5001) }), 400, 'message'], [valid({ company: 42 }), 400, 'company'],
  ];
  for (const [b, status, field] of cases) { const r = await call(b); eq(r.status, status, field); ok(r.body.fields?.[field], 'field error for ' + field); }
  eq((await call('{not json')).status, 400);
  eq((await call(valid(), { contentType: 'text/plain' })).status, 415);
  eq((await call('x'.repeat(20001))).status, 413);
  eq((await call(valid({ elapsedMs: 300 }))).body.error, 'too_fast');
  eq(world.rows(ENQ).length, 0); eq(upstreamBodies.length, 0, 'nothing forwarded');
  eq(world.doPost({ secret: SECRET, ipHash: GOOD_HASH, name: 'x', email: 'bad', company: 'c', message: 'm' }).error, 'validation', 'Apps Script validates on its own');
  eq(world.doPost({ secret: SECRET, ipHash: GOOD_HASH, name: 'x', email: 'a@b.co', company: 'c', message: 'm'.repeat(5001) }).error, 'validation');
});

test('spoofed requests: origin, secret and client IP headers', async () => {
  eq((await call(valid(), { origin: null })).status, 403, 'missing Origin');
  eq((await call(valid(), { origin: 'https://evil.example' })).status, 403, 'foreign Origin');
  eq((await call(valid(), { origin: 'null' })).status, 403, '"null" Origin');
  eq((await call(valid(), { origin: 'https://nxtfoundry.in.evil.example' })).status, 403, 'look-alike Origin');
  eq(world.doPost({ ...valid(), secret: 'wrong' }).error, 'unauthorized', 'direct call with wrong secret');
  eq(world.doPost({ ...valid() }).error, 'unauthorized', 'direct call without secret');
  setEnv({ ENQUIRY_SHARED_SECRET: 'not-the-real-secret-000000000' });
  const r = await call(valid()); eq([r.status, r.body.error], [502, 'unavailable'], 'wrong secret surfaces as a generic error');
  setEnv();
  eq(world.rows(ENQ).length, 0, 'nothing stored');
  // A client-sent X-Forwarded-For must not change the rate-limit identity.
  for (let i = 0; i < 5; i++) eq((await call(valid(), { ip: '198.51.100.9', headers: { 'x-forwarded-for': `10.0.0.${i}` } })).status, 200);
  eq((await call(valid(), { ip: '198.51.100.9', headers: { 'x-forwarded-for': '10.9.9.9' } })).status, 429, 'X-Forwarded-For ignored');
  setEnv({ ENQUIRY_ALLOWED_ORIGINS: 'http://localhost:5173' });
  eq((await call(valid(), { origin: 'http://localhost:5173', ip: '192.0.2.50' })).status, 200, 'extra origin from env');
  setEnv();
});

test('rate limits: per IP (10 min and 24 h) and per email; other visitors unaffected', async () => {
  for (let i = 0; i < 5; i++) eq((await call(valid())).status, 200);
  const r = await call(valid()); eq([r.status, r.body.error], [429, 'rate_limited'], '6th from one IP in 10 min');
  eq((await call(valid(), { ip: '203.0.113.99' })).status, 200, 'another IP still fine');
  // 24 h limit: 15 older rows (11 min - 23 h ago) from one IP plus 5 now = 20.
  const keys = world.sheet(KEYS); const ipHash = world.rows(KEYS)[0][3];
  for (let i = 0; i < 15; i++) {
    const t = world.ctx.istStamp_(new Date(Date.now() - (11 + i * 60) * 60000));
    world.ctx.writeTextRow_(keys, keys.getLastRow() + 1, ['old-' + i, 'NXT-20200101-AAAAA' + (i % 8 + 2), t, ipHash, 'x', 'STORED']);
  }
  world.lock.held = false; world.writesOutsideLock.length = 0;
  eq((await call(valid())).body.error, 'rate_limited', 'over the daily IP limit');
  // Per email: 5 an hour, even from different IPs.
  for (let i = 0; i < 5; i++) eq((await call(valid({ email: 'same@person.example' }), { ip: `192.0.2.${i + 1}` })).status, 200);
  eq((await call(valid({ email: 'same@person.example' }), { ip: '192.0.2.200' })).body.error, 'rate_limited', '6th from one email');
  const rows = world.rows(ENQ); eq(rows.length, 11, 'only accepted enquiries stored');
});

test('duplicates: a retried or double-sent submission is stored once (persistent keys, not cache)', async () => {
  const b = valid();
  const a = await call(b); world.cache.clear();          // cache plays no part in dedupe
  const again = await call(b);
  eq(again.body.enquiryId, a.body.enquiryId); eq(world.rows(ENQ).length, 1); eq(world.mails.length, 1);
  const c = valid();
  const results = await Promise.all(Array.from({ length: 10 }, () => call(c)));
  eq(new Set(results.map(x => x.body.enquiryId)).size, 1, 'ten parallel copies -> one ID');
  eq(world.rows(ENQ).length, 2); eq(world.mails.length, 2);
  eq(world.rows(KEYS).filter(r => r[0] === c.submissionId).length, 1);
});

test('concurrent submissions: unique IDs, no lost rows, all writes under the lock', async () => {
  const results = await Promise.all(Array.from({ length: 8 }, (_, i) => call(valid(), { ip: `198.18.0.${i + 1}` })));
  eq(results.map(r => r.status), Array(8).fill(200));
  eq(new Set(results.map(r => r.body.enquiryId)).size, 8); eq(world.rows(ENQ).length, 8);
  eq(world.writesOutsideLock, []);
});

test('lock busy: visitor gets a retry message, nothing half-written', async () => {
  world.lock.external = true;
  const r = await call(valid());
  eq([r.status, r.body.error], [503, 'busy']); eq(world.rows(ENQ).length, 0); eq(world.mails.length, 0);
});

test("email cap follows Google's real daily quota (e.g. a 100/day account), keeping a reserve", async () => {
  world.quota = 12;                                   // reserve is 10
  const ids = [];
  for (let i = 0; i < 4; i++) { const r = await call(valid(), { ip: `198.20.0.${i + 1}` }); eq(r.status, 200); ids.push(r.body.enquiryId); }
  eq(world.rows(ENQ).length, 4, 'every enquiry stored');
  eq(ids.map(state), ['SENT', 'SENT', 'SUPPRESSED', 'SUPPRESSED'], 'stops at the reserve, before Google refuses');
  eq(world.quota, 10);
  world.ctx.processNotifications();
  eq(world.mails.length, 3, 'the summary still goes out from the reserve'); eq(ids.slice(2).map(state), ['SUMMARISED', 'SUMMARISED']);
  world.quota = 0; world.ctx.processNotifications();  // nothing pending, nothing attempted
  eq(world.mails.length, 3);
});

test('email cap: enquiries still stored, extra notifications SUPPRESSED, one summary later', async () => {
  world.ctx.CONFIG.EMAIL_CAP_HOUR = 3;
  const ids = [];
  for (let i = 0; i < 5; i++) { const r = await call(valid(), { ip: `198.19.0.${i + 1}` }); eq(r.status, 200); ids.push(r.body.enquiryId); }
  eq(world.rows(ENQ).length, 5, 'all 5 stored'); eq(world.mails.length, 3);
  eq(ids.map(state), ['SENT', 'SENT', 'SENT', 'SUPPRESSED', 'SUPPRESSED']);
  world.ctx.processNotifications();
  eq(world.mails.length, 4, 'one summary email'); ok(world.mails[3].body.includes(ids[3]) && world.mails[3].body.includes(ids[4]), 'summary lists both');
  eq(ids.slice(3).map(state), ['SUMMARISED', 'SUMMARISED']);
  world.ctx.processNotifications(); eq(world.mails.length, 4, 'idempotent: nothing resent');
});

test('failed notification: enquiry kept, retried, sent exactly once, gives up after 5 attempts', async () => {
  world.mailFails = true;
  const r = await call(valid()); eq(r.status, 200, 'visitor still sees success: the enquiry is stored');
  const id = r.body.enquiryId; eq(state(id), 'FAILED'); eq(world.rows(ENQ).length, 1);
  world.ctx.processNotifications(); eq(state(id), 'FAILED');
  eq(world.rows(NOTES)[0][2], '2', 'attempts counted');
  world.mailFails = false; world.ctx.processNotifications();
  eq(state(id), 'SENT'); eq(world.mails.length, 1);
  world.ctx.processNotifications(); eq(world.mails.length, 1, 'no duplicate on re-run');
  world.mailFails = true; const r2 = await call(valid(), { ip: '203.0.113.50' });
  for (let i = 0; i < 6; i++) world.ctx.processNotifications();
  eq(state(r2.body.enquiryId), 'GAVE_UP');
});

test('retry safety: run guard blocks a parallel run; stale SENDING becomes UNCONFIRMED, never resent', async () => {
  world.mailFails = true; const r = await call(valid()); world.mailFails = false;
  world.props.set('NOTIFY_RUN_UNTIL', String(Date.now() + 60000));
  world.ctx.processNotifications(); eq(world.mails.length, 0, 'second run skipped'); eq(state(r.body.enquiryId), 'FAILED');
  world.props.delete('NOTIFY_RUN_UNTIL');
  const notes = world.sheet(NOTES);
  world.ctx.writeTextCells_(notes, 2, 2, ['SENDING', '1', world.ctx.istStamp_(new Date(Date.now() - 20 * 60000)), 'x', '']);
  world.ctx.processNotifications();
  eq(state(r.body.enquiryId), 'UNCONFIRMED'); eq(world.mails.length, 0);
  ok(!world.props.has('NOTIFY_RUN_UNTIL'), 'guard released');
});

test('retry safety: overlapping runs never send the same email twice (claim re-checked under the lock)', async () => {
  world.mailFails = true;
  const a = await call(valid(), { ip: '203.0.113.81' }), b = await call(valid(), { ip: '203.0.113.82' });
  world.mailFails = false;
  // While the first run is sending, its guard "expires" and a second run starts and finishes.
  world.onSend = () => { world.props.delete('NOTIFY_RUN_UNTIL'); world.ctx.processNotifications(); };
  world.ctx.processNotifications();
  eq([state(a.body.enquiryId), state(b.body.enquiryId)], ['SENT', 'SENT']);
  eq(world.mails.length, 2, 'each enquiry emailed once');
});

test('schema mismatch: nothing written, sheet untouched, visitor told to retry, one alert email', async () => {
  const s = world.ctx.SpreadsheetApp.getActiveSpreadsheet().insertSheet(ENQ);
  s.getRange(1, 1, 1, 10).setValues([['Enquiry ID', 'Submission timestamp', 'Name', 'Business email', 'Company', 'Business type', 'Area of interest', 'Message', 'Status', 'Source']]);
  s.getRange(2, 1, 1, 3).setValues([['NXT-20261101-ABCDEF', '2026-11-01', 'Old row']]);
  const before = s.snapshot();
  const r = await call(valid()); eq([r.status, r.body.error], [502, 'unavailable']);
  await call(valid());
  eq(s.snapshot(), before, 'existing sheet unchanged'); eq(world.rows(KEYS).length, 0);
  eq(world.mails.length, 1, 'one alert, throttled'); ok(world.mails[0].subject.startsWith('Action needed'), 'alert subject');
  let threw = false; try { world.ctx.setup(); } catch (e) { threw = e.name === 'SchemaError'; }
  ok(threw, 'setup() reports the mismatch'); eq(s.snapshot(), before, 'setup() does not rewrite it');
});

test('schema: n8n columns after K are allowed; a blank header there is not', async () => {
  world.ctx.setup();
  const s = world.sheet(ENQ); s.getRange(1, 12).setValues([['n8n processed at']]);
  eq((await call(valid())).status, 200);
  s.getRange(1, 13).setValues([['']]); s.getRange(2, 13).setValues([['stray']]);
  eq((await call(valid(), { ip: '203.0.113.60' })).status, 502);
});

test('text preservation: formulas, leading zeros, dates, booleans and numbers stay exactly as typed', async () => {
  const b = valid({ name: 'TRUE', phone: '08040001234', company: '007', businessType: '1e5', interest: '3/4',
    message: '=HYPERLINK("http://evil.example","click")' });
  const r = await call(b);
  const row = world.rows(ENQ)[0];
  eq(row.slice(2, 9), ['TRUE', b.email, '08040001234', '007', '1e5', '3/4', b.message]);
  eq(world.sheet(ENQ).getRange(2, 1, 1, 11).getFormulas()[0], Array(11).fill(''), 'no formulas');
  eq((await call(valid({ phone: '+91 98765 43210', message: '-starts with a dash\n@and more' }), { ip: '203.0.113.61' })).status, 200);
  eq(world.rows(ENQ)[1].slice(4, 9).filter((_, i) => i === 0 || i === 4), ['+91 98765 43210', '-starts with a dash\n@and more']);
  world.ctx.selfTestTextPreservation();
  ok(world.logs.some(l => l.includes('ALL PASS')), 'selfTestTextPreservation passes: ' + world.logs.join(' | '));
  ok(r.status === 200);
});

test('honeypot: stored as SPAM (not dropped), never emailed', async () => {
  const r = await call(valid({ hpField: 'https://spam.example' }));
  eq(r.status, 200); ok(ID_RE.test(r.body.enquiryId), 'real ID, so never a false success');
  eq(world.rows(ENQ)[0][9], 'SPAM'); eq(state(r.body.enquiryId), 'NOT_SENT_SPAM'); eq(world.mails.length, 0);
});

test('privacy: raw IPs never stored, logged or forwarded', async () => {
  const ips = ['203.0.113.77', '2001:db8::1234'];
  world.mailFails = true;
  for (const ip of ips) await call(valid(), { ip });
  world.ctx.processNotifications();
  const everything = JSON.stringify([[...world.sheets.values()].map(s => s.snapshot()), world.mails, world.logs, consoleOut, upstreamBodies]);
  for (const ip of ips) ok(!everything.includes(ip), 'found raw IP ' + ip);
  const hashes = world.rows(KEYS).map(r => r[3]);
  ok(hashes.every(h => /^[A-Za-z0-9_-]{43}$/.test(h)) && hashes[0] !== hashes[1], 'HMAC hashes stored');
});

test('fail closed: missing or malformed visitor IP is refused before anything is forwarded', async () => {
  const r = await call(valid(), { ip: null });
  eq([r.status, r.body.error], [503, 'unavailable'], 'no trusted IP header');
  const bad = ['', '   ', 'unknown', 'not-an-ip', '999.1.1.1', '1.2.3', '1.2.3.4.5', '01.2.3.4', '1.2.3.4 ; drop', 'abc::xyz',
    '2001:db8::1::2', '::ffff:999.1.1.1', '[2001:db8::1]', 'localhost', '1.2.3.4/24', 'x'.repeat(60)];
  for (const ip of bad) {
    eq((await call(valid(), { ip })).status, 503, 'x-real-ip ' + JSON.stringify(ip));
    eq((await call(valid(), { ip, ipHeader: 'x-vercel-forwarded-for' })).status, 503, 'x-vercel-forwarded-for ' + JSON.stringify(ip));
  }
  eq((await call(valid(), { ip: null, headers: { 'x-forwarded-for': '203.0.113.5' } })).status, 503, 'untrusted X-Forwarded-For is not a fallback');
  // Vercel's own header wins over x-real-ip; a bad first entry is not rescued by a later one.
  eq((await call(valid(), { ip: 'garbage', headers: { 'x-vercel-forwarded-for': '203.0.113.8' } })).status, 200, 'x-vercel-forwarded-for used');
  eq((await call(valid(), { ip: null, headers: { 'x-vercel-forwarded-for': 'garbage, 203.0.113.9' } })).status, 503);
  eq(upstreamBodies.length, 1, 'only the valid request reached Apps Script');
  ok(!upstreamBodies.some(b => /"ipHash":"(unknown|)"/.test(b)), 'never a shared or empty hash');
  ok(consoleOut.some(l => l.includes('no valid client IP')) && !consoleOut.some(l => l.includes('999.1.1.1') || l.includes('not-an-ip')), 'logged without the value');
  eq(world.rows(ENQ).length, 1);
});

test('valid visitor IPs: IPv4, IPv6, IPv4-mapped and local dev addresses all work', async () => {
  const goodIps = ['203.0.113.10', '2001:db8::10', '::ffff:203.0.113.11', '127.0.0.1', '::1', '::ffff:127.0.0.1', 'fe80::1'];
  for (const ip of goodIps) eq((await call(valid(), { ip })).status, 200, ip);
  eq((await call(valid(), { ip: '2001:db8::12', ipHeader: 'x-vercel-forwarded-for' })).status, 200, 'production header');
  const hashes = world.rows(KEYS).map(r => r[3]);
  eq(hashes.length, goodIps.length + 1); ok(hashes.every(h => /^[A-Za-z0-9_-]{43}$/.test(h)), 'all 43-char hashes');
  eq(new Set(hashes).size, hashes.length, 'distinct visitors get distinct hashes');
});

test('Apps Script independently rejects a missing or malformed ipHash', async () => {
  const bad = [undefined, null, '', 'unknown', 'short', GOOD_HASH + '=', GOOD_HASH + 'A', GOOD_HASH.slice(1), GOOD_HASH.slice(0, 42) + '+',
    GOOD_HASH.slice(0, 42) + '/', 'A'.repeat(42) + ' ', 12345, ['x'], { h: GOOD_HASH }];
  for (const ipHash of bad) {
    const b = { ...valid(), secret: SECRET }; if (ipHash !== undefined) b.ipHash = ipHash;
    eq(world.doPost(b).error, 'bad_request', 'ipHash ' + JSON.stringify(ipHash));
  }
  eq(world.rows(ENQ).length, 0, 'nothing stored'); eq(world.rows(KEYS).length, 0);
  eq(world.doPost({ ...valid(), secret: SECRET, ipHash: GOOD_HASH }).ok, true, 'a well-formed hash is accepted');
  world.ctx.testSubmission();
  ok(world.logs.some(l => l.includes('"ok":true')), 'editor testSubmission uses a valid stand-in hash');
});

test('phone country picker: composed numbers are international and accepted end to end', async () => {
  const cases = [
    ['in', '98765 43210', '+91 98765 43210'], ['in', '080 4000 1234', '+91 80 4000 1234'], ['gb', '07700 900123', '+44 7700 900123'],
    ['us', '(415) 555-0132', '+1 (415) 555-0132'], ['jm', '555 0123', '+1 876 555 0123'], ['it', '06 1234 5678', '+39 06 1234 5678'],
    ['in', '+44 20 7946 0958', '+44 20 7946 0958'], ['in', '', ''], ['in', '   ', ''],
  ];
  for (const [iso, typed, want] of cases) eq(composePhone(iso, typed), want, iso + ' ' + JSON.stringify(typed));
  ok(COUNTRIES.length >= 240 && new Set(COUNTRIES.map(c => c.iso)).size === COUNTRIES.length, 'country list complete and unique');
  for (const [i, [iso, typed, want]] of cases.filter(c => c[2]).entries()) {
    const r = await call(valid({ phone: composePhone(iso, typed) }), { ip: `203.0.113.${120 + i}` });
    eq(r.status, 200, want);
  }
  eq(world.rows(ENQ).map(r => r[4]), cases.filter(c => c[2]).map(c => c[2]), 'stored exactly, leading + kept as text');
  // Longest dial code + longest national number the form allows still fits the 25-character limit.
  const longest = Math.max(...COUNTRIES.map(c => c.dial.length));
  ok(('+' + 'x'.repeat(longest) + ' ').length + (25 - 2 - longest) <= 25, 'maxLength arithmetic');
});

test('upstream contract: success only with ok, 2xx and a well-formed ID', async () => {
  const cases = [
    [() => new Response('{"ok":true}', { status: 200 }), 502],
    [() => new Response('{"ok":true,"enquiryId":"hello"}', { status: 200 }), 502],
    [() => new Response('{"ok":true,"enquiryId":"NXT-20261112-ABCDEF"}', { status: 500 }), 502],
    [() => new Response('<html>Sign in</html>', { status: 200 }), 502],
    [() => new Response('{"ok":false,"error":"server_error"}', { status: 200 }), 502],
    [() => { const e = new Error('aborted'); e.name = 'AbortError'; throw e; }, 504],
    [() => { throw new TypeError('fetch failed'); }, 502],
    [() => new Response('{"ok":true,"enquiryId":"NXT-20261112-ABCDEF"}', { status: 200 }), 200],
  ];
  for (const [fn, status] of cases) { upstreamOverride = fn; eq((await call(valid())).status, status, String(fn)); }
  upstreamOverride = null;
  setEnv({ ENQUIRY_IP_HASH_KEY: undefined });
  eq((await call(valid())).status, 503, 'missing IP hash key'); setEnv();
});

test('setup(): creates tabs, Status dropdown, warning-only protection; safe to re-run', async () => {
  world.ctx.setup(); world.ctx.setup();
  eq([...world.sheets.keys()].sort(), [NOTES, KEYS, ENQ].sort());
  const s = world.sheet(ENQ);
  eq(s.validations.length, 2); eq(s.validations[0].rule.list, ['NEW', 'ACKNOWLEDGED', 'QUALIFIED', 'CLOSED', 'SPAM']);
  eq(s.validations[0].a1, [2, 10, 999, 1], 'J2:J');
  eq(s.protections.length, 2, 'not duplicated on re-run'); ok(s.protections.every(p => p.warn), 'warning-only');
  eq(world.sheet(KEYS).protections.length, 1); eq(world.sheet(NOTES).protections.length, 1);
});

let failed = 0;
for (const t of tests) {
  world = makeWorld(); upstreamBodies.length = 0; upstreamOverride = null; setEnv();
  try { await t.fn(); console.info('  ✓ ' + t.name); }
  catch (e) { failed++; console.info('  ✗ ' + t.name + '\n    ' + e.message.replace(/\n/g, '\n    ')); if (process.env.DEBUG) console.info(world.logs.join('\n')); }
}
console.info(`\n${tests.length - failed}/${tests.length} passed`);
process.exit(failed ? 1 : 0);
