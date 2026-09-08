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
    text = text.replace(/(\b(?:href|src|poster|data-fallback)\s*=\s*["'])\/(?!\/)/g, '$1' + base + '/');
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
