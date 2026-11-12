// Vercel Function: POST /api/enquiry
//
// The website form posts here (same origin). This function:
//   1. requires an allowed Origin (a browser-level check only; it is NOT treated as authentication),
//   2. reads the visitor IP from Vercel's own request metadata and turns it into a keyed HMAC
//      (the raw IP is never stored, logged or forwarded),
//   3. validates and cleans the fields, applies the honeypot and fill-time checks,
//   4. forwards to the Apps Script web app with the shared secret, and
//   5. reports success only when the backend confirms a stored enquiry with a well-formed ID.
// Rate limits, duplicate detection and the email cap live in Apps Script, where state is persistent.
//
// Env vars (server-side only, never VITE_-prefixed):
//   APPS_SCRIPT_URL           Apps Script /exec URL (or, later, an n8n webhook with the same contract)
//   ENQUIRY_SHARED_SECRET     same value as the Apps Script script property
//   ENQUIRY_IP_HASH_KEY       random key for the IP HMAC
//   ENQUIRY_ALLOWED_ORIGINS   optional, comma-separated extra origins (local dev, a preview URL)

declare const process: { env: Record<string, string | undefined> };

export const LIMITS = { name: 100, email: 254, phone: 25, company: 150, businessType: 80, interest: 100, message: 5000 } as const;
type Field = keyof typeof LIMITS;
const FIELDS = Object.keys(LIMITS) as Field[];
const REQUIRED: Field[] = ['name', 'email', 'company', 'message'];
const EMAIL_RE = /^[^\s@<>()[\],;:"\\]+@[^\s@<>()[\],;:"\\]+\.[^\s@<>()[\],;:"\\]{2,}$/;
const ENQUIRY_ID_RE = /^NXT-\d{8}-[A-Z2-9]{6}$/;
const PRODUCTION_ORIGINS = ['https://nxtfoundry.in', 'https://www.nxtfoundry.in'];
const MIN_FILL_MS = 2500;          // basic bot filter only: the value comes from the browser and can be faked
const MAX_BODY_CHARS = 20_000;
// Timeout chain: Apps Script lock wait 10 s < this 20 s < Vercel maxDuration 30 s (vercel.json) < browser 35 s.
export const UPSTREAM_TIMEOUT_MS = 20_000;
const SOURCE = 'Website contact form';

/** Optional phone: digits, spaces, brackets, dashes, optional leading +; 7 to 15 digits (E.164 max). */
const isPhone = (p: string) => /^\+?[0-9 ()-]{7,25}$/.test(p) && p.replace(/\D/g, '').length >= 7 && p.replace(/\D/g, '').length <= 15;

type Result = { ok: true; enquiryId: string } | { ok: false; error: string; fields?: Partial<Record<Field, string>> };

const reply = (status: number, body: Result) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

/** Trim, drop control characters, collapse whitespace on single-line fields. Returns null when over the limit or not a string. */
function clean(value: unknown, max: number, multiline = false): string | null {
  if (value == null) return '';
  if (typeof value !== 'string') return null;
  let s = value.normalize('NFC');
  s = multiline
    ? s.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').replace(/\n{4,}/g, '\n\n\n')
    : s.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ');
  s = s.trim();
  return s.length > max ? null : s;
}

const FIELD_MESSAGES: Record<Field, string> = {
  name: 'Please enter your name.',
  email: 'Please enter a valid email address.',
  phone: 'Please enter a valid phone number, or leave it blank.',
  company: 'Please enter your company.',
  businessType: 'Please choose a business type from the list.',
  interest: 'Please choose an area of interest from the list.',
  message: 'Please tell us a little about what you’re working through.',
};

function allowedOrigins(): string[] {
  const extra = (process.env.ENQUIRY_ALLOWED_ORIGINS || '').split(',').map(s => s.trim().replace(/\/$/, '')).filter(Boolean);
  return [...PRODUCTION_ORIGINS, ...extra];
}

/**
 * Visitor IP from Vercel's request metadata. Vercel overwrites x-vercel-forwarded-for / x-real-ip at its edge,
 * so a client cannot spoof them; x-forwarded-for is never read. (In local dev, scripts/enquiry-dev.mjs strips
 * any client-sent copies and sets x-real-ip from the socket.)
 */
export function clientIp(request: Request): string | null {
  const v = request.headers.get('x-vercel-forwarded-for') ?? request.headers.get('x-real-ip');
  if (v === null) return null;
  const ip = v.split(',')[0].trim();
  return isIpAddress(ip) ? ip : null;
}

/** Strict IPv4 (four 0-255 octets, no leading zeros) or a valid IPv6 literal. */
export function isIpAddress(s: string): boolean {
  if (/^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/.test(s)) return true;
  if (!s.includes(':') || !/^[0-9A-Fa-f:.]{2,45}$/.test(s)) return false;
  try { return new URL(`http://[${s}]/`).hostname.length > 2 } catch { return false }   // URL parser validates IPv6
}

async function hmacIp(ip: string, key: string): Promise<string> {
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(ip)));
  let bin = ''; for (const b of sig) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function POST(request: Request): Promise<Response> {
  // Origin must be present and allowed. This stops other websites from posting through visitors' browsers;
  // scripts can still forge it, which is why the rate limits and spam checks below stay independent of it.
  const origin = (request.headers.get('origin') || '').replace(/\/$/, '');
  if (!origin || !allowedOrigins().includes(origin)) return reply(403, { ok: false, error: 'forbidden' });
  if (!(request.headers.get('content-type') || '').includes('application/json')) return reply(415, { ok: false, error: 'bad_request' });

  const raw = await request.text();
  if (raw.length > MAX_BODY_CHARS) return reply(413, { ok: false, error: 'bad_request' });
  let body: Record<string, unknown>;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
    body = parsed;
  } catch { return reply(400, { ok: false, error: 'bad_request' }) }

  const elapsed = Number(body.elapsedMs);
  if (!Number.isFinite(elapsed) || elapsed < MIN_FILL_MS) return reply(400, { ok: false, error: 'too_fast' });

  const fields = {} as Record<Field, string>;
  const errors: Partial<Record<Field, string>> = {};
  for (const f of FIELDS) {
    const v = clean(body[f], LIMITS[f], f === 'message');
    if (v === null && typeof body[f] === 'string') errors[f] = `Please keep this under ${LIMITS[f].toLocaleString('en-IN')} characters.`;
    else if (v === null || (REQUIRED.includes(f) && !v)) errors[f] = FIELD_MESSAGES[f];
    else fields[f] = v;
  }
  if (!errors.email && !EMAIL_RE.test(fields.email)) errors.email = FIELD_MESSAGES.email;
  if (!errors.phone && fields.phone && !isPhone(fields.phone)) errors.phone = FIELD_MESSAGES.phone;
  if (Object.keys(errors).length) return reply(400, { ok: false, error: 'validation', fields: errors });
  fields.email = fields.email.toLowerCase();

  // Honeypot: a hidden field people never see. A hit is still stored (Status SPAM, no email) rather than
  // dropped, so an enquiry is never silently lost if a browser ever autofills it.
  const spam = typeof body.hpField === 'string' && body.hpField.trim() !== '' ? 'honeypot' : undefined;

  // Lets the backend recognise a retry of the same submission and not store it twice.
  const submissionId = typeof body.submissionId === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(body.submissionId) ? body.submissionId : crypto.randomUUID();

  const url = process.env.APPS_SCRIPT_URL;
  const secret = process.env.ENQUIRY_SHARED_SECRET;
  const ipKey = process.env.ENQUIRY_IP_HASH_KEY;
  if (!url || !secret || !ipKey) {
    console.error('[enquiry] missing env var(s):', [!url && 'APPS_SCRIPT_URL', !secret && 'ENQUIRY_SHARED_SECRET', !ipKey && 'ENQUIRY_IP_HASH_KEY'].filter(Boolean).join(', '));
    return reply(503, { ok: false, error: 'unavailable' });
  }
  // Fail closed: without a trusted, well-formed visitor IP there is no per-visitor rate limit, so refuse
  // rather than fall back to a shared bucket. The value itself is never logged.
  const ip = clientIp(request);
  if (!ip) {
    console.error('[enquiry] no valid client IP in trusted request headers; refused');
    return reply(503, { ok: false, error: 'unavailable' });
  }
  const ipHash = await hmacIp(ip, ipKey);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    // text/plain keeps Apps Script happy (it reads e.postData.contents). Apps Script answers with a 302
    // to script.googleusercontent.com, which fetch follows as a GET and returns the JSON result.
    const upstream = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ secret, submissionId, ipHash, spam, source: SOURCE, ...fields }),
      redirect: 'follow',
      signal: controller.signal,
    });
    const text = await upstream.text();
    let data: { ok?: unknown; enquiryId?: unknown; error?: unknown; fields?: unknown };
    try { data = JSON.parse(text) } catch {
      console.error('[enquiry] backend returned non-JSON, status', upstream.status);
      return reply(502, { ok: false, error: 'unavailable' });
    }
    if (upstream.ok && data.ok === true) {
      if (typeof data.enquiryId === 'string' && ENQUIRY_ID_RE.test(data.enquiryId)) return reply(200, { ok: true, enquiryId: data.enquiryId });
      console.error('[enquiry] backend said ok without a valid enquiry ID');
      return reply(502, { ok: false, error: 'unavailable' });
    }
    if (!upstream.ok) {
      console.error('[enquiry] backend HTTP status', upstream.status);
      return reply(502, { ok: false, error: 'unavailable' });
    }
    if (data.error === 'validation') {
      const fieldErrors: Partial<Record<Field, string>> = {};
      if (data.fields && typeof data.fields === 'object') for (const f of FIELDS) if (f in data.fields) fieldErrors[f] = FIELD_MESSAGES[f];
      return reply(400, { ok: false, error: 'validation', fields: fieldErrors });
    }
    if (data.error === 'rate_limited') return reply(429, { ok: false, error: 'rate_limited' });
    if (data.error === 'busy') return reply(503, { ok: false, error: 'busy' });
    console.error('[enquiry] backend rejected the enquiry:', String(data.error).slice(0, 40));
    return reply(502, { ok: false, error: 'unavailable' });
  } catch (err) {
    const timedOut = (err as { name?: string })?.name === 'AbortError';
    console.error('[enquiry] backend request failed:', timedOut ? 'timeout' : (err as Error)?.name || 'error');
    return reply(timedOut ? 504 : 502, { ok: false, error: 'unavailable' });
  } finally {
    clearTimeout(timer);
  }
}

export function GET(): Response {
  return reply(405, { ok: false, error: 'method_not_allowed' });
}
