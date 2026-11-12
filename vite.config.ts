import { defineConfig } from 'vite'; import react from '@vitejs/plugin-react'; import enquiryApiDev from './scripts/enquiry-dev.mjs'; import vercelHeaders from './scripts/vercel-headers.mjs';
// enquiryApiDev serves api/enquiry.ts during `npm run dev` only (see scripts/enquiry-dev.mjs).
// `npm run preview` serves the build with the production security headers from vercel.json.
export default defineConfig({plugins:[react(), enquiryApiDev()], preview:{headers:vercelHeaders()}});
