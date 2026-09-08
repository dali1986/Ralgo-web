import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {meta} from '../website/collection-meta.js';
import {works} from '../website/works.js';
import {routeHref} from '../website/routes.js';
import {esc} from '../website/briefing-format.js';
import {headExtras,absolute,artist,shareImage,siteBase} from './page-meta.mjs';
import {blogPosts} from './build-blog.mjs';
import {collectionShareImage,workShareImage,liveShareImage} from '../website/share-card-paths.js';
import {renderShareCards} from './build-share-cards.mjs';

export async function buildCollections(root) {
  const data=JSON.parse(await readFile(join(root,'data/catalogue.json'),'utf8'));
  const collections=new Map(data.collections.map(c=>[c.id,c]));
  const arias=collections.get('aria').items;
  const pairs=collections.get('seasky').items.map(w=>({number:w.number,title:`Seasky #${w.number} & Aria`,original:w,arias:arias.filter(a=>a.pair===w.number)}));
  collections.set('seasky-pairs',{id:'seasky-pairs',title:'Seasky & Aria',count:100,items:pairs,source:collections.get('seasky').source});
  const home=await readFile(join(root,'index.html'),'utf8');
  const urls=['/','/collections/','/blog/',...blogPosts.map(p=>'/blog/'+p.slug+'/')];
  const collectionPath=id=>`/collections/${id}/`;
  const workPath=(id,n)=>`${collectionPath(id)}${n}/`;
  const image=w=>w.previewStatus==='unavailable'?null:(w.local||w.thumbnail||w.image);
  const shareCards=new Map();
  function shareCard(path,images,title,credit='Ralgo · ralgo.art'){
    if(!images.length||images.some(src=>!src?.startsWith('/')))return shareImage;
    shareCards.set(path,{path,images,title,credit});return path;
  }
  const label=a=>a.title.replace(/^#\s*\d+\s*/, '').trim();
  const thumbnail=w=>image(w)?`<img src="${esc(image(w))}" alt="${esc(w.title)}" loading="lazy" decoding="async">`:'<span class="preview-unavailable">Preview unavailable<br>View the collection on Verse</span>';
  const creator=id=>id==='quasi'?{'@type':'Person',name:'Harvey Rayner',url:'https://rayner.art/'}:artist;
  const attribution=id=>id==='quasi'?'Primary artist: Harvey Rayner. Composition: Ralgo.':id==='seasky'?'Seasky by Ralgo · Art Blocks 500, Presents.':'Artwork by Ralgo.';
  const outward=(url,text)=>`<a class="underlink" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(text)} ↗</a>`;
  function sources(id){
    if(['seasky','aria','seasky-pairs'].includes(id))return outward(collections.get('seasky').source,'Seasky on Art Blocks')+outward('https://www.artblocks.io/discover/ab-500','Art Blocks 500');
    return (id==='quasi'?outward('https://rayner.art/','Harvey Rayner’s website'):'')+outward(collections.get(id).source,'View collection on Verse');
  }
  function card(w,id){
    if(id==='seasky-pairs')return `<article class="art-card"><a class="art-tile" href="${workPath(id,w.number)}" data-route="#art/${id}/${w.number}"><div class="pair-tile"><span class="art-image">${thumbnail(w.original)}</span><span class="aria-stack">${w.arias.map(a=>`<figure class="aria-mini"><span class="art-image">${thumbnail(a)}</span><figcaption>${esc(label(a))}</figcaption></figure>`).join('')}</span></div><div class="tile-caption"><strong>Seasky #${w.number}</strong><small>Seasky + Aria</small></div></a></article>`;
    return `<article class="art-card"><a class="art-tile" href="${workPath(id,w.number)}" data-route="#art/${id}/${w.number}"><span class="art-image">${thumbnail(w)}</span><span class="tile-caption"><strong>${esc(w.title)}</strong><small>↗</small></span></a></article>`;
  }
  function shell(options){
    let html=home.replace(/<head>[\s\S]*?<\/head>/,`<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#101110"><title>${esc(options.title)} — Ralgo</title><meta name="description" content="${esc(options.description)}">${headExtras(options)}<link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/blog.css"><script type="module" src="/app.js"></script><script type="module" src="/artwork-thumbnails.js"></script></head>`);
    html=html.replace('<body>',`<body data-site-base="${esc(siteBase)}">`).replace('<main id="home-view">','<main id="home-view" hidden>');
    html=html.replace('loading="eager" fetchpriority="high"','loading="lazy"');
    html=html.replace('<h1 id="home-title">','<h2 id="home-title">').replace(/(<h2 id="home-title">[\s\S]*?)<\/h1>/,'$1</h2>');
    html=html.replace('<a class="skip" href="#living">Skip to latest works</a>','<a class="skip" href="#page-content">Skip to the artwork</a>');
    return html;
  }
  async function save(path,html){const file=join(root,path,'index.html');await mkdir(dirname(file),{recursive:true});await writeFile(file,html);urls.push(path);}
  for(const [id,c] of collections){
    const m=meta[id]||{title:c.title,description:c.description||`Explore ${c.title} by Ralgo.`,kicker:'GENERATIVE ART · RALGO'};
    const cover=c.items.find(w=>image(w.original||w))?.original||c.items.find(w=>image(w));
    const path=collectionPath(id);
    const credit=id==='quasi'?'Primary artist: Harvey Rayner · Composition: Ralgo':'Ralgo · ralgo.art';
    const collectionPicture=shareCard(collectionShareImage(id),[image(cover)],m.title,credit);
    let html=shell({title:m.title,description:m.description,path,image:collectionPicture,imageAlt:cover?.title||m.title,schema:{'@type':'CollectionPage',name:m.title,description:m.description,url:absolute(path),creator:creator(id),mainEntity:{'@type':'ItemList',numberOfItems:c.items.length,itemListElement:c.items.map((w,i)=>({'@type':'ListItem',position:i+1,name:w.title,url:absolute(workPath(id,w.number))}))}}});
    html=html.replace('<main id="collection-view" hidden>','<main id="collection-view"><span id="page-content"></span>')
      .replace('<h2 id="collection-title"></h2>',`<h1 id="collection-title">${esc(m.title)}</h1>`)
      .replace('id="collection-kicker"></p>',`id="collection-kicker">${esc(m.kicker)}</p>`)
      .replace('id="collection-description"></p>',`id="collection-description">${esc(m.description)}</p>`)
      .replace('id="collection-stats"></div>',`id="collection-stats"><span>${c.count} ${id==='seasky-pairs'?'pairs':'works'}</span></div>`)
      .replace('id="collection-platforms"></div>',`id="collection-platforms">${sources(id)}</div>`)
      .replace('<div id="gallery" class="gallery"></div>',`<div id="gallery" class="gallery wall ${id==='seasky-pairs'?'paired':''}">${c.items.map(w=>card(w,id)).join('')}</div>`)
      .replace('id="collection-credit"></span>',`id="collection-credit">${esc(attribution(id))}</span>`)
      .replace('id="collection-source" target=',`id="collection-source" href="${esc(c.source)}" target=`);
    await save(path,html);
    for(let i=0;i<c.items.length;i++){
      const w=c.items[i],paired=id==='seasky-pairs',baseWork=paired?w.original:w;
      const workURL=workPath(id,w.number),description=paired?`Seasky #${w.number}, an Art Blocks 500 original by Ralgo, with ${w.arias.map(label).join(', ')}, its selected Seasky Aria.`:`${w.title}. ${m.description} ${attribution(id)}`;
      const artSchema={'@type':'VisualArtwork',name:w.title,description,url:absolute(workURL),creator:creator(id),isPartOf:{'@type':'CreativeWorkSeries',name:m.title,url:absolute(path)}};
      if(image(baseWork))artSchema.image=absolute(image(baseWork));
      if(id==='quasi')artSchema.contributor=artist;
      const frame=a=>image(a)?`<img class="standalone-image" src="${esc(image(a))}" alt="${esc(a.title)}">`:'<div class="preview-unavailable">A preview isn’t available for this work yet.</div>';
      const art=paired?`<div class="standalone-pair"><figure>${frame(w.original)}<figcaption>Seasky #${w.number} · Art Blocks 500</figcaption></figure>${w.arias.map(a=>`<figure>${frame(a)}<figcaption>Seasky Aria · ${esc(label(a))}</figcaption></figure>`).join('')}</div>`:frame(w);
      const note=(paired?w.arias:[w]).filter(a=>a.pairingNote).map(a=>`<p class="pairing-notice">${esc(a.pairingNote)}</p>`).join('');
      const shareTitle=paired?`Seasky #${w.number} / ${w.arias.map(label).join(', ')}`:w.title;
      const workPicture=shareCard(workShareImage(id,w.number),(paired?[w.original,...w.arias]:[w]).map(image),shareTitle,credit);
      let workHTML=shell({title:w.title,description,path:workURL,image:workPicture,imageAlt:image(baseWork)?shareTitle:'Ralgo exhibition',schema:artSchema});
      const previous=c.items[(i-1+c.items.length)%c.items.length],next=c.items[(i+1)%c.items.length];
      const body=`<main id="static-work" class="standalone-work"><span id="page-content"></span><a class="back-link" href="${path}">← ${esc(m.title)}</a><h1>${esc(w.title)}</h1>${art}<div class="work-copy"><p>${esc(description)}</p>${note}</div><div class="source-links">${sources(id)}<a class="underlink" href="${workURL}#art/${id}/${w.number}" data-route="#art/${id}/${w.number}">Open the gallery viewer ↗</a></div><nav class="standalone-navigation" aria-label="Adjacent artworks"><a href="${workPath(id,previous.number)}">← ${esc(previous.title)}</a><a href="${workPath(id,next.number)}">${esc(next.title)} →</a></nav></main>`;
      workHTML=workHTML.replace('<main id="home-view" hidden>',body+'<main id="home-view" hidden>');
      await save(workURL,workHTML);
    }
  }
  for(const w of works.filter(w=>w.live||w.id==='qql')){
    const path=`/works/${w.id}/`,title=w.shortTitle||w.title;
    const picture=w.images?.[0]||shareImage;
    const sharePicture=shareCard(liveShareImage(w.id),w.images?.slice(0,1)||[],title,w.id==='qql'?'QQL by Tyler Hobbs & Indigo Mane · Composition: Ralgo':'Ralgo · ralgo.art');
    const schema={'@type':'VisualArtwork',name:title,description:w.description,url:absolute(path),creator:w.id==='qql'?[{'@type':'Person',name:'Tyler Hobbs'},{'@type':'Person',name:'Indigo (Dandelion) Mane'}]:artist};
    if(w.id==='qql')schema.contributor=artist;
    const visual=w.images?.[0]?`<img class="standalone-image" src="${esc(picture)}" alt="${esc(title)}">`:'';
    const html=shell({title,description:w.description,path,image:sharePicture,imageAlt:w.images?.length?title:'Ralgo exhibition',schema}).replace('<main id="home-view" hidden>',`<main id="static-work" class="standalone-work"><span id="page-content"></span><a class="back-link" href="/#living">← The exhibition</a><h1>${esc(title)}</h1>${visual}<div class="work-copy"><p>${esc(w.description)}</p><p>${esc(w.credit)}</p></div><div class="source-links">${outward(w.live||w.source,w.live?'Enter the living work':'View QQL #325')}${w.id==='chimera'?'<a class="underlink" href="/works/chimera-quad/">Chimera Quad · Four worlds ↗</a>':''}</div></main><main id="home-view" hidden>`);
    await save(path,html);
    if(w.live){
      const file=join(root,w.live);let live=await readFile(file,'utf8');
      live=live.replace('</head>',headExtras({title,description:w.description,path:w.live,image:sharePicture,imageAlt:w.images?.length?title:'Ralgo exhibition',schema})+'<link rel="stylesheet" href="/art-home.css"></head>');
      live=live.replace('</body>','<a class="art-home" href="/" aria-label="Return to Ralgo’s exhibition"><span>←</span> RALGO</a><script src="/art-home.js"></script></body>');
      await writeFile(file,live);
    }
  }
  renderShareCards(root,[...shareCards.values()]);
  const directory=[...collections.values()].filter(c=>c.id!=='aria'&&c.id!=='seasky').map(c=>`<a class="index-row" href="${collectionPath(c.id)}"><span>${esc(meta[c.id]?.title||c.title)}</span><small>${c.count} ${c.id==='seasky-pairs'?'pairs':'works'}</small></a>`).join('');
  await writeFile(join(root,'collections/index.html'),`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Collections — Ralgo</title>${headExtras({title:'Collections — Ralgo',description:'Explore Ralgo’s complete collections and selected compositions.',path:'/collections/'})}<link rel="stylesheet" href="/styles.css"></head><body><header class="site-header"><a class="wordmark" href="/">RALGO<span>✳</span></a><nav><a href="/">Exhibition</a><a href="/blog/">Blog</a></nav></header><main class="static-directory"><p class="eyebrow">THE COLLECTION DIRECTORY</p><h1>Choose a world.</h1>${directory}</main></body></html>`);
  // Ordinary anchors are always useful, even before JavaScript loads.
  const {readdir}=await import('node:fs/promises');
  async function enhance(dir){for(const entry of await readdir(dir,{withFileTypes:true})){const p=join(dir,entry.name);if(entry.isDirectory()&&!['art','assets','artworks'].includes(entry.name))await enhance(p);else if(entry.isFile()&&entry.name.endsWith('.html')){let s=await readFile(p,'utf8');s=s.replace(/href="(#[^"]+)"/g,(full,route)=>/^(#collection\/|#art\/|#live\/|#home$|#living$|#collections$|#about$)/.test(route)?`href="${routeHref(route)}" data-route="${route}"`:full);s=s.replace('<body>',`<body data-site-base="${esc(siteBase)}">`);await writeFile(p,s);}}}
  await enhance(root);
  await writeFile(join(root,'sitemap.xml'),`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${[...new Set(urls)].map(path=>`<url><loc>${esc(absolute(path))}</loc></url>`).join('')}</urlset>\n`);
  await writeFile(join(root,'robots.txt'),`User-agent: *\nAllow: /\nSitemap: ${absolute('/sitemap.xml')}\n`);
  console.log(`Prerendered ${collections.size} collections and ${urls.filter(p=>/^\/(collections\/[^/]+\/[^/]+|works\/[^/]+)\/$/.test(p)).length} artwork pages.`);
}
