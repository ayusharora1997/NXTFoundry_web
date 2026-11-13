// Builds public/faq.html (the FAQ as its own page, with FAQPage schema, from src/faqs.ts) and public/llms-full.txt: the text of every page on the site as Markdown, for LLMs and AI crawlers.
// Runs before `vite build` (npm run build → npm run llms), so the file is regenerated on every deploy.
// The React pages are rendered with react-dom/server (no browser needed); the privacy policy is read from public/privacy.html.
// It also checks that index.html and privacy.html carry the same JSON-LD block, so the two copies cannot drift apart.
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync, writeFileSync } from 'node:fs';
import { LLM_PAGES } from '../src/main';
import { faqs } from '../src/faqs';
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

// ---- /faq.html: a static page (crawlable on its own URL) with the questions shown in full and FAQPage schema.
// Styling and the organisation JSON-LD are copied from privacy.html, so the static pages look and describe the business the same way.
const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const privacyHtml = readFileSync(`${ROOT}/public/privacy.html`, 'utf8');
const style = privacyHtml.match(/<style>[\s\S]*?<\/style>/)![0]
  .replace('</style>', '.cta{margin-top:48px;padding-top:24px;border-top:1px solid var(--line)}\n.cta a.btn{display:inline-block;background:var(--lime);color:#0a100d;font-weight:700;text-decoration:none;padding:12px 18px;margin:8px 12px 8px 0}\n</style>');
const faqLd = { '@context': 'https://schema.org', '@type': 'FAQPage', '@id': 'https://www.nxtfoundry.in/faq.html#faq', url: 'https://www.nxtfoundry.in/faq.html',
  name: 'Frequently asked questions — NXT Foundry', publisher: { '@id': 'https://www.nxtfoundry.in/#organization' },
  mainEntity: faqs.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) };
const FAQ_DESC = 'Answers to common questions about NXT Foundry: fees, how long engagements last, which programme to start with, remote work, NDAs and who does the work.';
const faqHtml = `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>Frequently asked questions — NXT Foundry</title>
<meta name="description" content="${esc(FAQ_DESC)}"/>
<link rel="canonical" href="https://www.nxtfoundry.in/faq.html"/>
<link rel="icon" href="/favicon.ico" sizes="any"/>
<link rel="icon" type="image/png" sizes="512x512" href="/favicon.png"/>
<meta property="og:type" content="website"/>
<meta property="og:site_name" content="NXT Foundry"/>
<meta property="og:title" content="Frequently asked questions — NXT Foundry"/>
<meta property="og:description" content="${esc(FAQ_DESC)}"/>
<meta property="og:url" content="https://www.nxtfoundry.in/faq.html"/>
<meta property="og:image" content="https://www.nxtfoundry.in/images/hero-operations-v2.png"/>
${style}
<script type="application/ld+json">
${homeLd}
</script>
<script type="application/ld+json">
${JSON.stringify(faqLd, null, 2)}
</script>
</head>
<!-- Generated by scripts/llms-full.tsx from src/faqs.ts on every build. Edit the questions there, not here. -->
<body>
<header><a href="/">NXT Foundry</a><a class="back" href="/">← Back to the website</a></header>
<main>
<h1>Frequently asked questions</h1>
<p class="meta">Fees, duration and how we work. If your question isn’t here, email <a href="mailto:hello@nxtfoundry.in">hello@nxtfoundry.in</a>.</p>
${faqs.map(([q, a]) => `<h2>${esc(q)}</h2>\n<p>${esc(a)}</p>`).join('\n')}
<div class="cta"><p>Still deciding? Start with a conversation.</p><a class="btn" href="https://cal.com/ayush-arora-ubgsbp/30min" target="_blank" rel="noopener">Book a 30-min diagnostic</a><a href="/#contact">Or send us a note</a></div>
</main>
<footer>© 2026 NXT Foundry · Bengaluru, India · <a href="mailto:hello@nxtfoundry.in">hello@nxtfoundry.in</a> · <a href="/privacy.html">Privacy Policy</a></footer>
</body>
</html>
`;
writeFileSync(`${ROOT}/public/faq.html`, faqHtml);

// Some pages read the URL hash while rendering; give them the plain page URL (no deep link).
const g = globalThis as unknown as { window?: unknown };
g.window ??= { location: { hash: '', pathname: '/', search: '' }, matchMedia: () => ({ matches: false }) };
const pages = LLM_PAGES.map(([title, url, node]) => [title, url, toMarkdown(renderToStaticMarkup(node))] as const);
pages.push(['FAQ', 'https://www.nxtfoundry.in/faq.html', toMarkdown(faqHtml.match(/<body[^>]*>([\s\S]*)<\/body>/)![1])]);
const privacy = privacyHtml.match(/<body[^>]*>([\s\S]*)<\/body>/)![1];
pages.push(['Privacy Policy', 'https://www.nxtfoundry.in/privacy.html', toMarkdown(privacy)]);

const doc = ['# NXT Foundry — full site text', '',
  '> Every page of https://www.nxtfoundry.in as plain Markdown, generated from the site source on each build. Summary: https://www.nxtfoundry.in/llms.txt', '',
  ...pages.flatMap(([title, url, body]) => [`## [${title}](${url})`, '', `URL: ${url}`, '', body.replace(/^(#+) /gm, '$1## '), ''])].join('\n');
writeFileSync(`${ROOT}/public/llms-full.txt`, doc);

// llms.txt: list every story (with its industry and type) between the Pages and Contact sections.
const plain = (t: string) => t.replace(/\*\*/g, '');
const storyLines = stories.map(st => `- [${plain(st.title)}](https://www.nxtfoundry.in/#stories/${st.id}): ${st.industry} · ${st.type}${st.earlier ? ' · earlier work' : ''}. ${plain(st.did)}`);
const llmsPath = `${ROOT}/public/llms.txt`;
let llms = readFileSync(llmsPath, 'utf8').replace(/\n## Stories\n[\s\S]*?(?=\n## )/, '');
llms = llms.replace('\n## Contact', `\n## Stories\nCase stories and concept frameworks. Concepts are independently developed and their figures are illustrative.\n${storyLines.join('\n')}\n\n## Contact`);
writeFileSync(llmsPath, llms);

console.log(`llms-full.txt: ${pages.length} pages, ${doc.length.toLocaleString('en')} characters`);
