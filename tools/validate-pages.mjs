import {readFile, readdir, stat} from 'node:fs/promises';
import {join, relative} from 'node:path';

export async function validateSite(root, base = '') {
  const origin = 'https://pages.invalid';
  const errors = [];
  const destinations = new Map();
  let references = 0;
  async function check(value, page) {
    if (!value || value.startsWith('#') || value.includes('${')) return;
    const url = new URL(value.replaceAll('&amp;', '&'), origin + base + '/' + page);
    if (url.origin !== origin) return;
    if (base && !url.pathname.startsWith(base + '/')) {
      errors.push(page + ': link escapes repository: ' + value); return;
    }
    const local = decodeURIComponent(url.pathname.slice(base.length)).replace(/^\//, '');
    let path = join(root, local);
    references++;
    try {
      if(!destinations.has(path))destinations.set(path,(async()=>{let target=path;if((await stat(target)).isDirectory())target=join(target,'index.html');return (await stat(target)).isFile();})());
      if(!await destinations.get(path))throw new Error();
    } catch { errors.push(page + ': missing local destination: ' + value); }
  }
  async function walk(directory) {
    for (const entry of await readdir(directory, {withFileTypes: true})) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) { await walk(path); continue; }
      const page = relative(root, path).replaceAll('\\', '/');
      if (!/\.(html|js|css)$/.test(page)) continue;
      const text = await readFile(path, 'utf8');
      if (page.endsWith('.html')) {
        const markup = text.replace(/(<script\b[^>]*>)[\s\S]*?<\/script>/gi, '$1</script>');
        for (const match of markup.matchAll(/\b(?:src|href|poster|data-fallback)\s*=\s*(["'])(.*?)\1/g)) await check(match[2], page);
        for (const match of markup.matchAll(/\bsrcset="([^"]+)"/g))for(const candidate of match[1].split(','))await check(candidate.trim().split(/\s+/)[0],page);
        if(page==='index.html'||/^(collections|works|blog)\//.test(page)){
          if((markup.match(/<h1\b/g)||[]).length!==1)errors.push(page+': expected one H1');
          for(const marker of ['rel="canonical"','property="og:title"','property="og:image"','name="twitter:card"','rel="icon"'])if(!markup.includes(marker))errors.push(page+': missing '+marker);
        }
      }
      if (page.endsWith('.js')) {
        for (const match of text.matchAll(/(?:\bfrom\s+|\bimport\s*)(["'])([./][^"']+)\1/g)) await check(match[2], page);
        for (const match of text.matchAll(/(["'`])(\/[^\s"'`]+)\1/g)) {
          if (match[2].startsWith((base || '') + '/') && /\/(?:art|artworks|assets|data|blog)(?:\/|\?|$)/.test(match[2])) await check(match[2], page);
          else if (base && /^\/(?:art|artworks|assets|data|blog)(?:\/|\?|$)/.test(match[2])) errors.push(page + ': unprefixed URL: ' + match[2]);
        }
      }
    }
  }
  await walk(root);
  const catalogue = JSON.parse(await readFile(join(root, 'data/catalogue.json'), 'utf8'));
  let works = 0;
  for (const collection of catalogue.collections) {
    for (const item of collection.items) {
      works++;
      if (!item.local) errors.push('Missing cached preview: ' + item.title);
      else await check(item.local, 'data/catalogue.json');
      if(item.local){
        const local=item.local.slice(base.length).replace(/^\//,'');
        try{if((await stat(join(root,local))).size<5000&&!['unavailable','reviewed'].includes(item.previewStatus))errors.push('Thumbnail needs review: '+item.title+' (run tools/audit-thumbnails.py)');}catch{}
      }
      if (item.image?.startsWith('/')) await check(item.image, 'data/catalogue.json');
    }
  }
  if (errors.length) throw new Error(errors.slice(0, 30).join('\n'));
  console.log(`Validated ${references} local references, page metadata and ${works} catalogue entries.`);
}
