// Dev only: serve the Vercel functions in api/ (enquiry, assist) under `npm run dev`, so the contact form and the
// tool's AI sous-chef can be tested locally. Env vars are read from .env.local (git-ignored). In production Vercel
// runs api/*.ts itself and this plugin is not involved.
import { loadEnv } from 'vite';

const FUNCTIONS = ['enquiry', 'assist'];
const ENV_KEYS = ['APPS_SCRIPT_URL', 'ENQUIRY_SHARED_SECRET', 'ENQUIRY_IP_HASH_KEY', 'ENQUIRY_ALLOWED_ORIGINS', 'ANTHROPIC_API_KEY', 'ANTHROPIC_BASE_URL'];
// Vercel overwrites these at its edge. Locally nothing does, so drop whatever the client sent and set
// x-real-ip from the socket, the same trust model as production.
const CLIENT_IP_HEADERS = ['x-vercel-forwarded-for', 'x-real-ip', 'x-forwarded-for'];

/** @returns {import('vite').Plugin} */
export default function enquiryApiDev() {
  return {
    name: 'api-functions-dev',
    apply: 'serve',
    configureServer(server) {
      const env = loadEnv(server.config.mode, process.cwd(), '');
      for (const k of ENV_KEYS) if (env[k]) process.env[k] = env[k];
      for (const name of FUNCTIONS) {
        server.middlewares.use(`/api/${name}`, async (req, res) => {
          try {
            const mod = await server.ssrLoadModule(`/api/${name}.ts`);
            const chunks = []; for await (const c of req) chunks.push(c);
            const headers = new Headers();
            for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string' && !CLIENT_IP_HEADERS.includes(k)) headers.set(k, v);
            if (req.socket.remoteAddress) headers.set('x-real-ip', req.socket.remoteAddress);
            const method = req.method || 'GET';
            const request = new Request(`http://${req.headers.host}/api/${name}`, { method, headers, body: method === 'POST' ? Buffer.concat(chunks) : undefined });
            const response = mod[method] ? await mod[method](request) : new Response(null, { status: 405 });
            res.statusCode = response.status; response.headers.forEach((v, k) => res.setHeader(k, v));
            res.end(Buffer.from(await response.arrayBuffer()));
          } catch (err) { server.config.logger.error(String(err)); res.statusCode = 500; res.end('{"ok":false,"error":"unavailable"}'); }
        });
      }
    },
  };
}
