import fs from 'node:fs';
import path from 'node:path';

const out = process.argv[2];
const htmlPath = path.join(out, 'index.html');
let html = fs.readFileSync(htmlPath, 'utf8');
const fixImgs = (s) => s.replace(/(["'`(])\/(images\/|hero-operations)/g, '$1./$2');

// Localize Google Fonts
async function localizeFonts(css) {
  const m = css.match(/@import\s*(?:url\()?['"]?(https:\/\/fonts\.googleapis\.com[^'")]+)['"]?\)?;?/);
  if (!m) return css;
  const fontCss = await (await fetch(m[1], { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36' } })).text();
  fs.mkdirSync(path.join(out, 'fonts'), { recursive: true });
  let local = fontCss;
  const urls = [...new Set([...fontCss.matchAll(/url\((https:[^)]+)\)/g)].map((x) => x[1]))];
  for (const [i, u] of urls.entries()) {
    const name = `font-${i}${path.extname(new URL(u).pathname) || '.woff2'}`;
    fs.writeFileSync(path.join(out, 'fonts', name), Buffer.from(await (await fetch(u)).arrayBuffer()));
    local = local.split(u).join(`./fonts/${name}`);
  }
  console.log(`fonts: ${urls.length} files`);
  return css.replace(m[0], local);
}

const cssRe = /<link rel="stylesheet"[^>]*href="\.\/(assets\/[^"]+\.css)"[^>]*>/;
const jsRe = /<script type="module"[^>]*src="\.\/(assets\/[^"]+\.js)"[^>]*><\/script>/;
const cssFile = html.match(cssRe)[1];
const jsFile = html.match(jsRe)[1];
let css = fixImgs(fs.readFileSync(path.join(out, cssFile), 'utf8'));
css = await localizeFonts(css);
const js = fixImgs(fs.readFileSync(path.join(out, jsFile), 'utf8')).replace(/<\/script/gi, '<\\/script');

html = html
  .replace(cssRe, () => `<style>\n${css}\n</style>`)
  .replace(jsRe, () => `<script type="module">\n${js}\n</script>`);
fs.writeFileSync(htmlPath, html);
fs.rmSync(path.join(out, 'assets'), { recursive: true, force: true });
console.log('remaining absolute /images refs:', (html.match(/["'`(]\/images\//g) || []).length);
