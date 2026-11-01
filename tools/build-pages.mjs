import {cp, readFile, writeFile, readdir, rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {applyEngagement, siteSettings} from './site-engagement.mjs';

// configure-pages supplies '' for a custom domain/user site, or '/repository'.
const input = process.env.PAGES_BASE_PATH || '';
if (input && input !== '/' && !/^\/[A-Za-z0-9_.-]+\/?$/.test(input)) {
  throw new Error('PAGES_BASE_PATH must be empty, /, or /repository-name.');
}
export const base = input.replace(/\/$/, '');
if (base === '/.' || base === '/..') throw new Error('Invalid repository path.');
await import('./build-blog.mjs');
const root = fileURLToPath(new URL('../', import.meta.url));
export const output = join(root, '_site');
await rm(output, {recursive: true, force: true});
await cp(join(root, 'website'), output, {recursive: true});
// Accept the artist's complete offline export without modifying its embedded code.
const worldPath = join(output, 'works/vulnerable-worlds/index.html');
let worldHTML = await readFile(worldPath, 'utf8');
if (!worldHTML.includes('rel="canonical"')) {
  const {headExtras} = await import('./page-meta.mjs');
  const metadata = headExtras({
    title: 'Vulnerable Worlds · Ralgo',
    description: 'A living generative world shaped by discovery and the risk of catastrophe.',
    path: '/works/vulnerable-worlds/',
    imageAlt: 'Ralgo generative art'
  });
  if (!/<html\b/i.test(worldHTML)) {
    const headEnd = worldHTML.indexOf('</style>') + '</style>'.length;
    if (headEnd < '</style>'.length) throw new Error('Vulnerable Worlds export has no style block.');
    worldHTML = '<!doctype html><html lang="en"><head>' + worldHTML.slice(0, headEnd)
      + metadata + '</head><body>' + worldHTML.slice(headEnd) + '</body></html>';
  } else {
    worldHTML = worldHTML.replace('</head>', metadata + '</head>');
  }
  await writeFile(worldPath, worldHTML);
}

// Quieter exhibition defaults; preserve the uploaded original as the source.
const quietEdits = [
  [
    "DUR: 11000, REST: 5500",
    "DUR: 6500, REST: 45000"
  ],
  [
    "Object.entries(SPOTS).filter(([k, d]) => { try",
    "Object.entries(SPOTS).filter(([k, d]) => !['law', 'key', 'ledger', 'minds'].includes(k)).filter(([k, d]) => { try"
  ],
  [
    "now - (W.born || 0) < 16000",
    "now - (W.born || 0) < 45000"
  ],
  [
    "BEAT.gap = 12000 + Math.random() * 5000",
    "BEAT.gap = CFG.hud === 'detail' ? 12000 + Math.random() * 5000 : 32000 + Math.random() * 13000"
  ],
  [
    "const BEAT = { last: 0, gap: 14000",
    "const BEAT = { last: 0, gap: 35000"
  ],
  [
    "(count ? 4200 : BEAT.gap)",
    "(count ? (CFG.hud === 'detail' ? 4200 : 18000) : BEAT.gap)"
  ],
  [
    "say.until = now + secs * 1000; say.prio = prio;",
    "if (CFG.hud !== 'detail' && prio < 80 && now - (say.quietAt || -1e9) < 30000) return false;\n    say.quietAt = now;\n    say.until = now + secs * 1000; say.prio = prio;"
  ],
  [
    "function showLaw(inst) {\n  if (CFG.calib) return;",
    "function showLaw(inst) {\n  if (CFG.calib || CFG.hud !== 'detail') return;"
  ],
  [
    "function ticker(html, cls, force) {\n  if (CFG.calib) return;",
    "function ticker(html, cls, force) {\n  if (CFG.calib) return;\n  if (CFG.hud !== 'detail') {\n    const now = performance.now();\n    if (now - (TICK.quietAt || -1e9) < 24000 || STAGE.busy(0)) return;\n    TICK.quietAt = now; TICK.q.length = 0;\n  }"
  ]
];
for (const [before, after] of quietEdits) {
  if (worldHTML.split(before).length !== 2) throw new Error('Vulnerable Worlds quiet-view patch needs review: ' + before);
  worldHTML = worldHTML.replace(before, after);
}
worldHTML = worldHTML.replace('</style>', "\n/* Keep the resting artwork spacious; fuller readouts remain in Detail / Controls. */\nbody:not(.detail):not(.panel) #ledger,\nbody:not(.detail):not(.panel):not(.ended) #mind,\nbody:not(.detail):not(.panel) .nl .st,\nbody:not(.detail):not(.panel):not(.spot-dials) .nl .dl { display: none !important; }\n" + '</style>');
await writeFile(worldPath, worldHTML);

const {buildCollections} = await import('./build-collections.mjs');
await buildCollections(output);

async function files(directory) {
  const results = [];
  for (const item of await readdir(directory, {withFileTypes: true})) {
    const path = join(directory, item.name);
    if (item.isDirectory()) results.push(...await files(path));
    else if (item.isFile()) results.push(path);
    else throw new Error('Unsupported website entry: ' + path);
  }
  return results;
}
const prefix = value => value.startsWith('/') && !value.startsWith('//') ? base + value : value;
function mapJSON(value) {
  if (typeof value === 'string') return prefix(value);
  if (Array.isArray(value)) return value.map(mapJSON);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, val]) => [key, mapJSON(val)]));
  return value;
}
for (const path of await files(output)) {
  if (!/\.(html|js|css|json)$/.test(path)) continue;
  const original = await readFile(path, 'utf8');
  let text = path.endsWith('.html') ? applyEngagement(original) : original;
  if (base && path.endsWith('.json')) text = JSON.stringify(mapJSON(JSON.parse(text)), null, 2) + '\n';
  if (base && path.endsWith('.html')) {
    text = text.replace(/(\b(?:href|src|poster|data-fallback|data-share-url)\s*=\s*["'])\/(?!\/)/g, '$1' + base + '/');
    text = text.replace(/(\bsrcset\s*=\s*")([^"]+)(")/g, (_,a,value,z)=>a+value.split(',').map(item=>item.trim().replace(/^\/(?!\/)/,base+'/')).join(', ')+z);
  }
  if (base && path.endsWith('.js')) {
    // Only known site URL prefixes: leave '/' delimiters and artwork maths alone.
    text = text.replace(/(["'`])\/(?=(?:art|artworks|assets|data|blog)(?:\/|[?#"'`]))/g, '$1' + base + '/');
  }
  if (base && path.endsWith('.css')) {
    text = text.replace(/(url\(\s*["']?)\/(?!\/)/g, '$1' + base + '/');
  }
  if (text !== original) await writeFile(path, text);
}
const {fingerprintAssets} = await import('./fingerprint-assets.mjs');
await fingerprintAssets(output);
await writeFile(join(output, '.nojekyll'), '');
console.log(`Pages build ready: _site (base path: ${base || '/'})`);
if (!siteSettings.contactEmail) console.log('Contact sections are awaiting the approved public email in site-settings.json.');
if (!siteSettings.goatcounterEndpoint) console.log('Analytics is inactive until the owned GoatCounter endpoint is added to site-settings.json.');
const {validateSite} = await import('./validate-pages.mjs');
await validateSite(output, base);
