#!/usr/bin/env node
// Creates a git-ignored env file with freshly generated keys. Prints NO secret values. Never overwrites.
//   node scripts/make-test-env.mjs                          -> .env.local            (TEST, local dev)
//   node scripts/make-test-env.mjs .env.prodcheck.local     -> production values: the source you copy from into
//                                                              the production Apps Script and Vercel (never loaded by Vite)
import fs from 'node:fs'; import crypto from 'node:crypto';

const file = process.argv[2] || '.env.local';
const production = file !== '.env.local';
const label = production ? 'PRODUCTION' : 'TEST';
if (fs.existsSync(file)) {
  console.log(`${file} already exists — left unchanged. Delete it first if you want a fresh one.`);
  process.exit(1);
}
const rand = () => crypto.randomBytes(32).toString('base64url');
fs.writeFileSync(file, [
  `# ${label} settings for the contact form. Git-ignored. Never commit, paste into chat, or screenshot these values.`,
  `# Replace the placeholder with the ${label} web app URL (ends in /exec).`,
  `APPS_SCRIPT_URL=PASTE_${label}_EXEC_URL_HERE`,
  `# Copy this exact value into the ${label} Apps Script: Project Settings -> Script properties -> ENQUIRY_SHARED_SECRET` +
    (production ? ', and into Vercel (Production) as ENQUIRY_SHARED_SECRET' : ''),
  `ENQUIRY_SHARED_SECRET=${rand()}`,
  production ? '# Copy into Vercel (Production) as ENQUIRY_IP_HASH_KEY. Never into Apps Script.' : '# Used only here (never in Apps Script).',
  `ENQUIRY_IP_HASH_KEY=${rand()}`,
  ...(production ? [] : ['ENQUIRY_ALLOWED_ORIGINS=http://localhost:5173']),
  '',
].join('\n'), { mode: 0o600 });
console.log(`Created ${file} with a new ENQUIRY_SHARED_SECRET and ENQUIRY_IP_HASH_KEY (values not shown).`);
console.log(`Next: open ${file} in your editor and copy ENQUIRY_SHARED_SECRET into the ${label} Apps Script property.`);
