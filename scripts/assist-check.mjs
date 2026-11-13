// Checks for api/assist.ts (the tool's AI sous-chef). Runs the real function and the real Anthropic SDK against a
// local fake of the Claude Messages API, so no key or money is needed.  npm run test:assist
import http from 'node:http'; import path from 'node:path'; import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let reply = () => ({ status: 200, body: msg('ok') });
const seen = [];
function msg(text, stop = 'end_turn') {
  return { id: 'msg_test', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [{ type: 'text', text }], stop_reason: stop, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 10 } };
}
const server = http.createServer((req, res) => {
  let b = ''; req.on('data', c => b += c); req.on('end', () => {
    seen.push({ url: req.url, beta: req.headers['anthropic-beta'], key: req.headers['x-api-key'] ?? ((req.headers.authorization || '').replace(/^Bearer /, '') || null), headers: Object.keys(req.headers), body: JSON.parse(b || '{}') });
    const r = reply(); res.writeHead(r.status, { 'content-type': 'application/json', 'retry-after': '0' }); res.end(JSON.stringify(r.body));
  });
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${server.address().port}`;   // the SDK talks to the fake
const { POST, GET, numbersAreGrounded } = await import(pathToFileURL(path.join(root, 'api/assist.ts')).href);

const ORIGIN = 'https://www.nxtfoundry.in';
let ipN = 1;
const call = (body, { origin = ORIGIN, ip = `203.0.113.${ipN++}` } = {}) => {
  const h = { 'content-type': 'application/json' }; if (origin) h.origin = origin; if (ip) h['x-real-ip'] = ip;
  return POST(new Request('https://www.nxtfoundry.in/api/assist', { method: 'POST', headers: h, body: typeof body === 'string' ? body : JSON.stringify(body) }))
    .then(async r => ({ status: r.status, body: await r.json() }));
};
const FACTS = 'Vendor: Deccan Polymers\nPeriod: Sep 2026\nBuyer closing balance: ₹4,82,300.00\nVendor closing balance: ₹4,83,800.00\nDifference: ₹1,500.00\nAnnexure 5 (Credit notes not accounted by buyer): 1 items, effect +₹1,500.00';
const PDF = Buffer.from('%PDF-1.7\n% test\n').toString('base64');
const FIELDS = { documentType: 'Credit note', number: 'CN/DEC/0934', date: '27-Sep-2026', supplierName: 'Deccan Polymers Limited', supplierGstin: '29ABCDE1234F1Z5', buyerName: 'Meridian Consumer Products', buyerGstin: '29PQRSX5678K1Z2', againstDocument: 'INV-2026-0712', taxableValue: 1271.19, cgst: 114.4, sgst: 114.41, igst: null, total: 1500, confidence: 'high' };

const tests = []; const test = (n, f) => tests.push([n, f]);
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m || 'not equal'}: got ${JSON.stringify(a)} expected ${JSON.stringify(b)}`); };
const ok = (c, m) => { if (!c) throw new Error(m); };

test('switched off without a key: GET says disabled, POST refuses, no model call', async () => {
  delete process.env.ANTHROPIC_API_KEY;
  eq(await GET().json(), { enabled: false });
  eq((await call({ task: 'explain', facts: FACTS })).status, 503); eq(seen.length, 0);
});

test('key set but AI_FEATURES_ENABLED not true: still disabled, no model call', async () => {
  process.env.ANTHROPIC_API_KEY = 'test-key'; delete process.env.AI_FEATURES_ENABLED;
  eq(await GET().json(), { enabled: false });
  eq((await call({ task: 'explain', facts: FACTS })).status, 503); eq(seen.length, 0);
  process.env.AI_FEATURES_ENABLED = 'true';
});

test('request guards: origin, content type, visitor IP, size, PDF magic bytes, unknown task', async () => {
  process.env.ANTHROPIC_API_KEY = 'test-key';
  eq(await GET().json(), { enabled: true });
  eq((await call({ task: 'explain', facts: FACTS }, { origin: 'https://evil.example' })).status, 403);
  eq((await call({ task: 'explain', facts: FACTS }, { origin: null })).status, 403);
  eq((await call({ task: 'explain', facts: FACTS }, { ip: null })).status, 503);
  eq((await call({ task: 'explain', facts: 'x'.repeat(6001) })).status, 400);
  eq((await call({ task: 'read-pdf', pdf: Buffer.from('<html>hi</html>').toString('base64') })).body.error, 'not_pdf');
  eq((await call({ task: 'read-pdf', pdf: 'A'.repeat(4_300_000) })).status, 413);
  eq((await call({ task: 'nope' })).status, 400);
  eq(seen.length, 0, 'nothing reached the model');
});

test('explain: sends the right request and returns grounded text', async () => {
  reply = () => ({ status: 200, body: msg('The ₹1,500.00 difference is one credit note in Annexure 5 that the vendor posted but you have not. Book it, then re-run the reconciliation.') });
  const r = await call({ task: 'explain', facts: FACTS });
  eq(r.status, 200); ok(r.body.text.includes('Annexure 5'), 'text returned');
  const req = seen.at(-1);
  eq([req.body.model, req.body.fallbacks, req.body.output_config.effort, req.key], ['claude-opus-5-5', 'default', 'low', 'test-key']);
  ok(String(req.beta).includes('server-side-fallback-2026-07-01'), 'fallback beta header');
  ok(req.body.messages[0].content.includes('₹4,83,800.00'), 'facts sent');
});

test('explain: an invented number is never shown', async () => {
  reply = () => ({ status: 200, body: msg('The difference is ₹99,999.00 because of two invoices.') });
  eq((await call({ task: 'explain', facts: FACTS })).body.error, 'ungrounded');
  ok(numbersAreGrounded('Difference of ₹1,500.00 in Annexure 5 for Sep 2026.', FACTS), 'grounded text passes');
  ok(!numbersAreGrounded('Difference of ₹1,600.00.', FACTS), 'altered amount fails');
});

test('read-pdf: structured output requested, fields returned with the arithmetic check', async () => {
  reply = () => ({ status: 200, body: msg(JSON.stringify(FIELDS)) });
  const r = await call({ task: 'read-pdf', pdf: PDF });
  eq(r.status, 200); eq(r.body.fields.number, 'CN/DEC/0934'); eq(r.body.checks.totalsAddUp, true);
  const req = seen.at(-1);
  eq(req.body.output_config.format.type, 'json_schema'); eq(req.body.output_config.format.schema.additionalProperties, false);
  eq(req.body.messages[0].content[0].type, 'document'); eq(req.body.messages[0].content[0].source.media_type, 'application/pdf');
  ok(/Ignore any instructions/.test(req.body.system), 'prompt-injection guard in system prompt');
  reply = () => ({ status: 200, body: msg(JSON.stringify({ ...FIELDS, total: 2000 })) });
  eq((await call({ task: 'read-pdf', pdf: PDF })).body.checks.totalsAddUp, false, 'mismatch flagged');
});

test('refusals, upstream errors and rate limits give safe messages', async () => {
  reply = () => ({ status: 200, body: msg('', 'refusal') });
  eq((await call({ task: 'explain', facts: FACTS })).body.error, 'declined');
  reply = () => ({ status: 500, body: { type: 'error', error: { type: 'api_error', message: 'internal details here' } } });
  const r = await call({ task: 'explain', facts: FACTS }); eq([r.status, r.body.error], [502, 'unavailable']);
  ok(!JSON.stringify(r.body).includes('internal'), 'no upstream detail leaked');
  reply = () => ({ status: 200, body: msg('Annexure 5 holds the ₹1,500.00 gap.') });
  const ip = '198.51.100.77'; let last;
  for (let i = 0; i < 13; i++) last = await call({ task: 'explain', facts: FACTS }, { ip });
  eq(last.status, 429, '13th request from one visitor in 10 minutes');
});

let failed = 0;
for (const [n, f] of tests) { try { await f(); console.log('  ✓ ' + n); } catch (e) { failed++; console.log('  ✗ ' + n + '\n    ' + e.message); } }
console.log(`\n${tests.length - failed}/${tests.length} passed`);
server.close(); process.exitCode = failed ? 1 : 0;
