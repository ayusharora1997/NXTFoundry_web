// Dev only: serve the Vercel function api/enquiry.ts under `npm run dev`, so the contact form can be
// tested locally. APPS_SCRIPT_URL and ENQUIRY_SHARED_SECRET are read from .env.local (git-ignored).
// In production Vercel runs api/enquiry.ts itself and this plugin is not involved.
import { loadEnv } from 'vite';

/** @returns {import('vite').Plugin} */
export default function enquiryApiDev() {
  return {
    name: 'enquiry-api-dev',
    apply: 'serve',
    configureServer(server) {
      const env = loadEnv(server.config.mode, process.cwd(), '');
      for (const k of ['APPS_SCRIPT_URL', 'ENQUIRY_SHARED_SECRET']) if (env[k]) process.env[k] = env[k];
      server.middlewares.use('/api/enquiry', async (req, res) => {
        try {
          const mod = await server.ssrLoadModule('/api/enquiry.ts');
          const chunks = []; for await (const c of req) chunks.push(c);
          const headers = new Headers(); for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
          const method = req.method || 'GET';
          const request = new Request(`http://${req.headers.host}/api/enquiry`, { method, headers, body: method === 'POST' ? Buffer.concat(chunks) : undefined });
          const response = mod[method] ? await mod[method](request) : new Response(null, { status: 405 });
          res.statusCode = response.status; response.headers.forEach((v, k) => res.setHeader(k, v));
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (err) { server.config.logger.error(String(err)); res.statusCode = 500; res.end('{"ok":false,"error":"unavailable"}'); }
      });
    },
  };
}
