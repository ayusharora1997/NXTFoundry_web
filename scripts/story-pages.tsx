// Writes a real, crawlable page for every story — dist/stories/<id>.html — plus dist/stories/index.html and dist/faq.html.
// Runs after `vite build` (npm run build), using the built index.html as the template so each page loads the
// same hashed CSS and JS. Each page has its own title, description, canonical URL, share preview and JSON-LD,
// and the full story is already in the HTML (header, story, footer) for crawlers that don't run JavaScript.
// For visitors, the app then starts and renders the same story (App reads /stories/<id>.html from the path).
// <base href="/"> makes the site's in-app links (#about, #contact…) go back to the main site.
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { STATIC_PARTS } from '../src/main';
import { stories, type Story } from '../src/stories';
import { faqs } from '../src/faqs';

const ROOT = process.cwd();
const SITE = 'https://www.nxtfoundry.in';
const { Header, Footer, StoryPage, Stories, FAQPageView } = STATIC_PARTS;
const g = globalThis as unknown as { window?: unknown };
g.window ??= { location: { hash: '', pathname: '/stories/', search: '' }, matchMedia: () => ({ matches: false }) };

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const plain = (t: string) => t.replace(/\*\*/g, '');
const template = readFileSync(`${ROOT}/dist/index.html`, 'utf8');
const orgLd = (template.match(/<script type="application\/ld\+json">[\s\S]*?<\/script>/) || [''])[0];
if (!orgLd || !template.includes('<div id="root">')) { console.error('story-pages: unexpected dist/index.html'); process.exit(1); }

function page(opts: { url: string; title: string; description: string; type: 'article' | 'website'; ld: object; body: string }) {
  let h = template;
  const set = (re: RegExp, val: string) => { if (!re.test(h)) throw new Error('template missing ' + re); h = h.replace(re, val); };
  set(/<title>[\s\S]*?<\/title>/, `<title>${esc(opts.title)}</title>`);
  set(/<meta name="description" content="[^"]*"\/>/, `<meta name="description" content="${esc(opts.description)}"/>`);
  set(/<link rel="canonical" href="[^"]*"\/>/, `<base href="/"/>\n<link rel="canonical" href="${opts.url}"/>`);
  set(/<meta property="og:type" content="[^"]*"\/>/, `<meta property="og:type" content="${opts.type}"/>`);
  set(/<meta property="og:title" content="[^"]*"\/>/, `<meta property="og:title" content="${esc(opts.title)}"/>`);
  set(/<meta property="og:description" content="[^"]*"\/>/, `<meta property="og:description" content="${esc(opts.description)}"/>`);
  set(/<meta property="og:url" content="[^"]*"\/>/, `<meta property="og:url" content="${opts.url}"/>`);
  set(/<meta name="twitter:title" content="[^"]*"\/>/, `<meta name="twitter:title" content="${esc(opts.title)}"/>`);
  set(/<meta name="twitter:description" content="[^"]*"\/>/, `<meta name="twitter:description" content="${esc(opts.description)}"/>`);
  h = h.replace(orgLd, `${orgLd}\n<script type="application/ld+json">\n${JSON.stringify(opts.ld, null, 2)}\n</script>`);
  const a = h.indexOf('<div id="root">'), b = h.indexOf('</div>\n', h.indexOf('</main></div>', a));
  const rootEnd = h.indexOf('</main></div>', a) + '</main></div>'.length;
  if (a < 0 || b < 0) throw new Error('root not found');
  return h.slice(0, a) + `<div id="root">${opts.body}</div>` + h.slice(rootEnd);
}

const shell = (node: React.ReactNode) => renderToStaticMarkup(<><Header/><main>{node}</main><Footer/></>);
const storyUrl = (s: Story) => `${SITE}/stories/${s.id}.html`;
mkdirSync(`${ROOT}/dist/stories`, { recursive: true });

for (const s of stories) {
  const description = `${plain(s.question)} ${s.hook}`;
  const ld = {
    '@context': 'https://schema.org', '@type': 'Article', '@id': storyUrl(s) + '#story', url: storyUrl(s),
    headline: plain(s.title), description, abstract: s.did,
    about: s.areas, keywords: [s.industry, s.type, ...s.areas].join(', '),
    genre: s.concept ? 'Concept framework (illustrative)' : 'Case story',
    isPartOf: { '@type': 'CollectionPage', '@id': `${SITE}/stories/#stories`, name: 'NXT Foundry stories' },
    author: { '@id': `${SITE}/#organization` }, publisher: { '@id': `${SITE}/#organization` },
    image: `${SITE}/images/hero-operations-v2.png`, inLanguage: 'en-IN',
    ...(s.note ? { creditText: s.note } : {}),
  };
  writeFileSync(`${ROOT}/dist/stories/${s.id}.html`, page({
    url: storyUrl(s), title: `${plain(s.title)} — NXT Foundry Stories`, description, type: 'article', ld,
    body: shell(<StoryPage s={s}/>),
  }));
}

const indexLd = {
  '@context': 'https://schema.org', '@type': 'CollectionPage', '@id': `${SITE}/stories/#stories`, url: `${SITE}/stories/`,
  name: 'NXT Foundry stories', description: 'Case stories and concept frameworks: the problem, what we found and what changed.',
  publisher: { '@id': `${SITE}/#organization` },
  mainEntity: { '@type': 'ItemList', itemListElement: stories.map((s, i) => ({ '@type': 'ListItem', position: i + 1, url: storyUrl(s), name: plain(s.title) })) },
};
writeFileSync(`${ROOT}/dist/stories/index.html`, page({
  url: `${SITE}/stories/`, title: 'Stories — NXT Foundry', type: 'website', ld: indexLd,
  description: 'Case stories and concept frameworks from NXT Foundry: real problems, what we found and what changed.',
  body: shell(<Stories/>),
}));
// FAQ page (/faq.html), linked from the footer.
writeFileSync(`${ROOT}/dist/faq.html`, page({
  url: `${SITE}/faq.html`, title: 'Frequently asked questions — NXT Foundry', type: 'website',
  description: 'Answers to common questions about NXT Foundry: fees, how long engagements last, which programme to start with, remote work, NDAs and who does the work.',
  ld: { '@context': 'https://schema.org', '@type': 'FAQPage', '@id': `${SITE}/faq.html#faq`, url: `${SITE}/faq.html`, name: 'Frequently asked questions — NXT Foundry',
    publisher: { '@id': `${SITE}/#organization` }, mainEntity: faqs.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) },
  body: shell(<FAQPageView/>),
}));
console.log(`story-pages: ${stories.length} stories + index + faq`);
