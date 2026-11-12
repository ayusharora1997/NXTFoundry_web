#!/usr/bin/env node
// Creates .env.local for testing the contact form against a TEST Apps Script deployment.
// Generates the two random keys locally and prints NO secret values. Refuses to overwrite an existing file.
//   node scripts/make-test-env.mjs
import fs from 'node:fs'; import crypto from 'node:crypto';

const file = '.env.local';
if (fs.existsSync(file)) {
  console.log(`${file} already exists — left unchanged. Delete it first if you want a fresh one.`);
  process.exit(1);
}
const rand = () => crypto.randomBytes(32).toString('base64url');
fs.writeFileSync(file, [
  '# Local TEST settings for the contact form. Git-ignored. Never commit or paste these values anywhere.',
  '# Replace the placeholder with the TEST web app URL (ends in /exec).',
  'APPS_SCRIPT_URL=PASTE_TEST_EXEC_URL_HERE',
  '# Copy this exact value into the TEST Apps Script: Project Settings -> Script properties -> ENQUIRY_SHARED_SECRET',
  `ENQUIRY_SHARED_SECRET=${rand()}`,
  '# Used only here (never in Apps Script).',
  `ENQUIRY_IP_HASH_KEY=${rand()}`,
  'ENQUIRY_ALLOWED_ORIGINS=http://localhost:5173',
  '',
].join('\n'), { mode: 0o600 });
console.log(`Created ${file} with a new ENQUIRY_SHARED_SECRET and ENQUIRY_IP_HASH_KEY (values not shown).`);
console.log('Next: open .env.local in your editor and copy ENQUIRY_SHARED_SECRET into the TEST Apps Script property.');
