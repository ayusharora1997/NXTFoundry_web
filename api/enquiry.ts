// Vercel Function: POST /api/enquiry
//
// The website form posts here (same origin, so no CORS and a real HTTP status).
// This function checks the request, then forwards it to the Google Apps Script web app,
// which is the system of record: it stores the enquiry in the "Website Enquiries" sheet
// and emails hello@nxtfoundry.in. The Apps Script URL and shared secret live only in
// Vercel env vars (APPS_SCRIPT_URL, ENQUIRY_SHARED_SECRET), never in the browser bundle.
//
// Later, n8n can replace the Apps Script behind APPS_SCRIPT_URL without touching the site,
// as long as it answers with the same JSON contract: { ok: true, enquiryId } or { ok: false, error }.

declare const process: { env: Record<string, string | undefined> };

export const LIMITS = { name: 100, email: 254, phone: 25, company: 150, businessType: 80, interest: 100, message: 5000 } as const;
type Field = keyof typeof LIMITS;
const FIELDS = Object.keys(LIMITS) as Field[];
const REQUIRED: Field[] = ['name', 'email', 'company', 'message'];
const EMAIL_RE = /^[^\s@<>()[\],;:"\\]+@[^\s@<>()[\],;:"\\]+\.[^\s@<>()[\],;:"\\]{2,}$/;
/** Optional phone: digits, spaces, brackets, dashes, optional leading +; 7 to 15 digits (E.164 max). */
const isPhone = (p: string) => /^\+?[0-9 ()-]{7,25}$/.test(p) && p.replace(/\D/g, '').length >= 7 && p.replace(/\D/g, '').length <= 15;
const MIN_FILL_MS = 2500;        // a person cannot read and fill the form faster than this
const MAX_BODY_BYTES = 20_000;
const UPSTREAM_TIMEOUT_MS = 15_000;
const SOURCE = 'Website contact form';

type Result = { ok: true; enquiryId: string | null } | { ok: false; error: string; fields?: Partial<Record<Field, string>> };

const reply = (status: number, body: Result) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

/** Trim, drop control characters, collapse whitespace on single-line fields. Returns null when over the limit. */
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

export async function POST(request: Request): Promise<Response> {
  // Only accept posts from our own pages.
  const origin = request.headers.get('origin');
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host');
  if (origin) {
    let originHost = '';
    try { originHost = new URL(origin).host } catch { /* "null" or malformed */ }
    if (!host || originHost !== host) return reply(403, { ok: false, error: 'forbidden' });
  }
  if (!(request.headers.get('content-type') || '').includes('application/json')) return reply(415, { ok: false, error: 'bad_request' });

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return reply(413, { ok: false, error: 'bad_request' });
  let body: Record<string, unknown>;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
    body = parsed;
  } catch { return reply(400, { ok: false, error: 'bad_request' }) }

  // Honeypot: a hidden field people never see. Bots that fill it get a quiet "ok" and nothing is stored.
  if (typeof body.website === 'string' && body.website.trim() !== '') return reply(200, { ok: true, enquiryId: null });
  // Too fast to be a person. Not silent: a real visitor just presses send again.
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

  // Lets the backend recognise a retry of the same submission and not store it twice.
  const submissionId = typeof body.submissionId === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(body.submissionId) ? body.submissionId : crypto.randomUUID();

  const url = process.env.APPS_SCRIPT_URL;
  const secret = process.env.ENQUIRY_SHARED_SECRET;
  if (!url || !secret) {
    console.error('[enquiry] APPS_SCRIPT_URL or ENQUIRY_SHARED_SECRET is not set');
    return reply(503, { ok: false, error: 'unavailable' });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    // text/plain keeps Apps Script happy (it reads e.postData.contents). Apps Script answers with a 302
    // to script.googleusercontent.com, which fetch follows as a GET and returns the JSON result.
    const upstream = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ secret, submissionId, source: SOURCE, ...fields }),
      redirect: 'follow',
      signal: controller.signal,
    });
    const text = await upstream.text();
    let data: { ok?: unknown; enquiryId?: unknown; error?: unknown; fields?: unknown };
    try { data = JSON.parse(text) } catch {
      console.error('[enquiry] backend returned non-JSON', upstream.status, text.slice(0, 300));
      return reply(502, { ok: false, error: 'unavailable' });
    }
    if (data.ok === true && typeof data.enquiryId === 'string') return reply(200, { ok: true, enquiryId: data.enquiryId });
    if (data.error === 'validation') {
      const fieldErrors: Partial<Record<Field, string>> = {};
      if (data.fields && typeof data.fields === 'object') for (const f of FIELDS) if (f in data.fields) fieldErrors[f] = FIELD_MESSAGES[f];
      return reply(400, { ok: false, error: 'validation', fields: fieldErrors });
    }
    if (data.error === 'rate_limited') return reply(429, { ok: false, error: 'rate_limited' });
    console.error('[enquiry] backend rejected the enquiry:', String(data.error));
    return reply(502, { ok: false, error: 'unavailable' });
  } catch (err) {
    const timedOut = (err as { name?: string })?.name === 'AbortError';
    console.error('[enquiry] backend request failed:', timedOut ? 'timeout' : String(err));
    return reply(timedOut ? 504 : 502, { ok: false, error: 'unavailable' });
  } finally {
    clearTimeout(timer);
  }
}

export function GET(): Response {
  return reply(405, { ok: false, error: 'method_not_allowed' });
}
