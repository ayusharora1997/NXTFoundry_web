// Reads the site-wide security headers from vercel.json, so `npm run preview` serves the built site with the
// same headers as production and any Content-Security-Policy problem shows up locally first.
import fs from 'node:fs';
import path from 'node:path';

/** @returns {Record<string, string>} */
export default function vercelHeaders() {
  const config = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'vercel.json'), 'utf8'));
  const all = (config.headers || []).find(h => h.source === '/(.*)');
  return Object.fromEntries((all ? all.headers : []).map(h => [h.key, h.value]));
}
