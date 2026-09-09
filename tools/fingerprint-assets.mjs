import {readFile,writeFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {origin,siteBase} from './page-meta.mjs';

// Keep old URLs valid, while every new page references the exact current assets.
// GitHub Pages controls cache lifetimes; filename versioning prevents stale releases.
export async function fingerprintAssets(root){
  const replacements=new Map();
  const digest=bytes=>createHash('sha256').update(bytes).digest('hex').slice(0,12);
  const assetURL=(value,page)=>{
    if(value.includes('${')||/^(#|data:|javascript:)/.test(value))return value;
    let url;try{url=new URL(value,origin+siteBase+'/'+page);}catch{return value;}
    if(url.origin!==origin)return value;
    const path=url.pathname.slice(siteBase.length),replacement=replacements.get(path);
    if(!replacement)return value;
    const mapped=siteBase+replacement+url.search+url.hash;
    return value.startsWith('https://')?origin+mapped:mapped;
  };
  const replace=(text,page)=>{
    text=text.replace(/(["'`])([^\s"'`]+)\1/g,(_,quote,value)=>quote+assetURL(value,page)+quote);
    return text.replace(/(\bsrcset=")([^"]+)(")/g,(_,a,value,z)=>a+value.split(',').map(item=>{const [url,...size]=item.trim().split(/\s+/);return [assetURL(url,page),...size].join(' ');}).join(', ')+z);
  };
  async function version(path,rewrite=false){
    let bytes=await readFile(join(root,path));
    if(rewrite)bytes=Buffer.from(replace(bytes.toString('utf8'),path));
    const target=path.replace(/(\.[^.]+)$/,'.'+digest(bytes)+'$1');
    await writeFile(join(root,target),bytes);
    replacements.set('/'+path,'/'+target);
  }
  for(const file of await readdir(join(root,'assets/display')))await version('assets/display/'+file);
  for(const file of (await readdir(root)).filter(n=>n.endsWith('.css')))await version(file,true);
  await version('data/catalogue.json',true);
  // Dependencies first, so an imported module's filename is included in its parent's hash.
  for(const file of ['routes.js','share-card-paths.js','collection-meta.js','works.js','artwork-thumbnails.js','share.js','art-home.js','analytics.js','app.js'])await version(file,true);
  async function walk(dir){for(const entry of await readdir(dir,{withFileTypes:true})){const p=join(dir,entry.name);if(entry.isDirectory())await walk(p);else if(entry.isFile()&&entry.name.endsWith('.html')){const original=await readFile(p,'utf8'),updated=replace(original,p.slice(root.length+1));if(updated!==original)await writeFile(p,updated);}}}
  await walk(root);
  console.log(`Versioned ${[...replacements.keys()].filter(k=>k.startsWith('/')).length} display and interface assets.`);
}
