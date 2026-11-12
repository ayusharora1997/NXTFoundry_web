#!/usr/bin/env node
// Checks .env.local and the TEST Apps Script deployment without printing any secret value and without
// writing anything to the sheet.
//   node scripts/check-test-env.mjs
//
// Live checks:
//   1. GET  /exec                       -> must be our health response (deployment reachable, access = Anyone)
//   2. POST /exec with the secret and a deliberately invalid ipHash
//        "bad_request"  -> secret matches; request refused before any read or write (nothing stored)
//        "unauthorized" -> secret does not match this deployment (e.g. URL points at a different script)
import fs from 'node:fs';

const file = '.env.local';
if (!fs.existsSync(file)) { console.log(`✗ ${file} not found. Run: node scripts/make-test-env.mjs`); process.exit(1); }
const env = Object.fromEntries(fs.readFileSync(file, 'utf8').split(/\r?\n/)
  .filter(l => /^[A-Z_]+=/.test(l)).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));

let ok = true;
const check = (cond, pass, fail) => { console.log((cond ? '✓ ' : '✗ ') + (cond ? pass : fail)); if (!cond) ok = false; };
const url = env.APPS_SCRIPT_URL || '';
// Standard form, or the Google Workspace form https://script.google.com/a/macros/<domain>/s/<id>/exec
check(/^https:\/\/script\.google\.com\/(a\/macros\/[A-Za-z0-9.-]+|macros)\/s\/[A-Za-z0-9_-]{20,}\/exec$/.test(url),
  'APPS_SCRIPT_URL looks like an Apps Script /exec URL', 'APPS_SCRIPT_URL is missing, still the placeholder, or not a https://script.google.com/macros/s/…/exec URL');
check((env.ENQUIRY_SHARED_SECRET || '').length >= 32, 'ENQUIRY_SHARED_SECRET is set (32+ chars)', 'ENQUIRY_SHARED_SECRET is missing or shorter than 32 characters');
check((env.ENQUIRY_IP_HASH_KEY || '').length >= 32, 'ENQUIRY_IP_HASH_KEY is set (32+ chars)', 'ENQUIRY_IP_HASH_KEY is missing or shorter than 32 characters');
check(env.ENQUIRY_IP_HASH_KEY !== env.ENQUIRY_SHARED_SECRET, 'the two keys are different', 'ENQUIRY_IP_HASH_KEY must differ from ENQUIRY_SHARED_SECRET');
check((env.ENQUIRY_ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).includes('http://localhost:5173'),
  'ENQUIRY_ALLOWED_ORIGINS includes http://localhost:5173', 'ENQUIRY_ALLOWED_ORIGINS must include http://localhost:5173');
if (!ok) { console.log('\nFix the items above, then run this again.'); process.exit(1); }

try {
  const health = await fetch(url, { redirect: 'follow' });
  const text = await health.text();
  let h = null; try { h = JSON.parse(text) } catch { /* not JSON */ }
  check(h && h.ok === true && h.service === 'nxt-foundry-enquiries', 'deployment reachable and anonymous (health check OK)',
    `health check failed (HTTP ${health.status}${h ? '' : ', not JSON — usually "Who has access" is not "Anyone", or the URL is wrong'})`);
  if (h && h.ok) {
    const probe = await fetch(url, { method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ secret: env.ENQUIRY_SHARED_SECRET, ipHash: 'connectivity-check' }) });
    let p = null; try { p = JSON.parse(await probe.text()) } catch { /* not JSON */ }
    check(p && p.error === 'bad_request', 'shared secret matches the TEST deployment (probe refused before any write)',
      p && p.error === 'unauthorized' ? 'shared secret does NOT match this deployment — check the Script property, or that the URL is the TEST one'
        : 'unexpected probe response — is the latest Code.gs deployed as a New version?');
  }
} catch (err) {
  check(false, '', 'could not reach APPS_SCRIPT_URL (' + (err?.cause?.code || err?.name || 'network error') + ')');
}
console.log(ok ? '\nAll checks passed. Restart `npm run dev` if it was already running.' : '\nFix the items above, then run this again.');
process.exitCode = ok ? 0 : 1;   // not process.exit(): avoids a libuv assertion on Windows while fetch sockets close
