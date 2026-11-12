import { defineConfig } from 'vite'; import react from '@vitejs/plugin-react'; import enquiryApiDev from './scripts/enquiry-dev.mjs';
// enquiryApiDev serves api/enquiry.ts during `npm run dev` only (see scripts/enquiry-dev.mjs).
export default defineConfig({plugins:[react(), enquiryApiDev()]});
