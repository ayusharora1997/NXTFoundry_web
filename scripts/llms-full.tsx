// Builds public/llms-full.txt (plus the Stories section of llms.txt and sitemap.xml): the text of every page on the site as Markdown, for LLMs and AI crawlers.
// Runs before `vite build` (npm run build → npm run llms), so the file is regenerated on every deploy.
// The React pages are rendered with react-dom/server (no browser needed); the privacy policy is read from public/privacy.html.
// It also checks that index.html and privacy.html carry the same JSON-LD block, so the two copies cannot drift apart.
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync, writeFileSync } from 'node:fs';
import { LLM_PAGES } from '../src/main';
import { stories } from '../src/stories';

const ROOT = process.cwd();
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
// Left out of the text: decoration, hidden duplicates (animated words), and the form controls.
const SKIP = new Set(['svg', 'script', 'style', 'form', 'select', 'textarea', 'noscript', 'head', 'nav', 'header', 'footer']);
const BLOCK: Record<string, string> = { h1: '# ', h2: '## ', h3: '### ', h4: '#### ', li: '- ', p: '', dt: '', dd: '', blockquote: '> ', tr: '' };

const decode = (t: string) => t.replace(/&nbsp;/g, ' ').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&amp;/g, '&');

/** Small HTML → Markdown: headings, paragraphs, list items and table rows become lines; everything else is inline text. */
function toMarkdown(html: string): string {
  const out: string[] = []; let line = ''; let skip = 0; const stack: { tag: string; skipping: boolean }[] = [];
  const flush = () => { const t = line.replace(/\s+/g, ' ').replace(/ ([.,;:!?)\]])/g, '$1').replace(/\( /g, '(').trim(); if (t && !/^(#+|-|>)\s*$/.test(t)) out.push(t); line = ''; };
  const re = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z0-9]+)([^>]*?)(\/?)>|([^<]+)/g; let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (m[5] !== undefined) { if (!skip) line += decode(m[5]); continue; }
    if (!m[2]) continue;
    const tag = m[2].toLowerCase(), closing = m[1] === '/', attrs = m[3] || '';
    if (closing) {
      let i = stack.length - 1; while (i >= 0 && stack[i].tag !== tag) i--; if (i < 0) continue;
      while (stack.length > i) { const e = stack.pop()!; if (e.skipping) skip--; }
      if (!skip && (tag in BLOCK || tag === 'div' || tag === 'section' || tag === 'article' || tag === 'table')) flush();
      if (!skip && (tag === 'td' || tag === 'th')) line += ' | ';
      if (!skip && /^(span|b|strong|em|small|button|sup|i|a)$/.test(tag)) line += ' ';
      continue;
    }
    if (VOID.has(tag) || m[4] === '/') { if (!skip && tag === 'br') line += ' '; continue; }
    const hidden = SKIP.has(tag) || /aria-hidden="true"/.test(attrs) || /class="[^"]*\b(hp-field|skip-link)\b/.test(attrs);
    stack.push({ tag, skipping: hidden }); if (hidden) { skip++; continue; }
    if (skip) continue;
    if (tag in BLOCK || tag === 'div' || tag === 'section' || tag === 'article' || tag === 'table') { flush(); line = BLOCK[tag] ?? ''; }
  }
  flush();
  return out.filter((l, i) => l !== out[i - 1]).join('\n\n').replace(/ \| (\n|$)/g, '$1');
}

const jsonLd = (file: string) => (readFileSync(file, 'utf8').match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/) || [])[1]?.trim();
const homeLd = jsonLd(`${ROOT}/index.html`), privacyLd = jsonLd(`${ROOT}/public/privacy.html`);
if (!homeLd || homeLd !== privacyLd) { console.error('llms-full: the JSON-LD in index.html and public/privacy.html must be identical.'); process.exit(1); }
JSON.parse(homeLd);

const privacyHtml = readFileSync(`${ROOT}/public/privacy.html`, 'utf8');

// Some pages read the URL hash while rendering; give them the plain page URL (no deep link).
const g = globalThis as unknown as { window?: unknown };
g.window ??= { location: { hash: '', pathname: '/', search: '' }, matchMedia: () => ({ matches: false }) };
const pages = LLM_PAGES.map(([title, url, node]) => [title, url, toMarkdown(renderToStaticMarkup(node))] as const);
const privacy = privacyHtml.match(/<body[^>]*>([\s\S]*)<\/body>/)![1];
pages.push(['Privacy Policy', 'https://www.nxtfoundry.in/privacy.html', toMarkdown(privacy)]);

const doc = ['# NXT Foundry — full site text', '',
  '> Every page of https://www.nxtfoundry.in as plain Markdown, generated from the site source on each build. Summary: https://www.nxtfoundry.in/llms.txt', '',
  ...pages.flatMap(([title, url, body]) => [`## [${title}](${url})`, '', `URL: ${url}`, '', body.replace(/^(#+) /gm, '$1## '), ''])].join('\n');
writeFileSync(`${ROOT}/public/llms-full.txt`, doc);

// llms.txt: list every story (with its industry and type) between the Pages and Contact sections.
const plain = (t: string) => t.replace(/\*\*/g, '');
const storyLines = stories.map(st => `- [${plain(st.title)}](https://www.nxtfoundry.in/stories/${st.id}.html): ${st.industry} · ${st.type}${st.earlier ? ' · earlier work' : ''}. ${plain(st.did)}`);
const llmsPath = `${ROOT}/public/llms.txt`;
let llms = readFileSync(llmsPath, 'utf8').replace(/\n## Stories\n[\s\S]*?(?=\n## )/, '');
llms = llms.replace('\n## Contact', `\n## Stories\nCase stories and concept frameworks. Concepts are independently developed and their figures are illustrative.\n${storyLines.join('\n')}\n\n## Contact`);
writeFileSync(llmsPath, llms.replace('(https://www.nxtfoundry.in/#stories)', '(https://www.nxtfoundry.in/stories/)'));

// sitemap.xml: the real pages, including every story page (generated after the build by scripts/story-pages.tsx).
const today = new Date().toISOString().slice(0, 10);
const urls = ['/', '/stories/', ...stories.map(st => `/stories/${st.id}.html`), '/faq.html', '/privacy.html'];
writeFileSync(`${ROOT}/public/sitemap.xml`, `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url>
    <loc>https://www.nxtfoundry.in${u}</loc>
    <lastmod>${today}</lastmod>
  </url>`).join('\n')}
</urlset>
`);

console.log(`llms-full.txt: ${pages.length} pages, ${doc.length.toLocaleString('en')} characters`);
