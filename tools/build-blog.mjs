import {readFile,writeFile,readdir,mkdir,rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,join} from 'node:path';
import {esc,postCard,article} from '../website/briefing-format.js';
import {headExtras,absolute,artist,shareImage} from './page-meta.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const out=join(root,'website');
const posts=[];
for(const filename of await readdir(join(root,'content/posts'))){
  if(!filename.endsWith('.md'))continue;
  const raw=(await readFile(join(root,'content/posts',filename),'utf8')).replace(/\r\n?/g,'\n');
  const match=raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if(!match)throw Error(filename+': start with the metadata block shown in content/POST-TEMPLATE.md');
  const metadata={};
  for(const line of match[1].split('\n')){
    if(!line.trim())continue;
    const i=line.indexOf(':');if(i<1)throw Error(filename+': invalid metadata line');
    const key=line.slice(0,i).trim(),value=line.slice(i+1).trim();
    metadata[key]=value.startsWith('"')?JSON.parse(value):value;
  }
  const p={title:metadata.title,date:metadata.date,slug:metadata.slug,excerpt:metadata.excerpt||'',cover:metadata.cover||'',body:match[2].trim()};
  if(typeof p.title!=='string'||!p.title.trim()||!p.body)throw Error(filename+': title and article text are required');
  if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(p.slug||''))throw Error(filename+': slug must contain lowercase letters, numbers and hyphens');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(p.date||'')||Number.isNaN(Date.parse(p.date))||new Date(p.date).toISOString().slice(0,10)!==p.date)throw Error(filename+': use a valid YYYY-MM-DD date');
  if(p.cover&&!/^\/(assets|artworks)\/[a-zA-Z0-9/_-]+\.(webp|png|jpe?g)$/.test(p.cover))throw Error(filename+': cover must be a local image in /assets/ or /artworks/');
  if(posts.some(other=>other.slug===p.slug))throw Error('Duplicate blog URL: '+p.slug);
  posts.push(p);
}
posts.sort((a,b)=>b.date.localeCompare(a.date)||a.slug.localeCompare(b.slug));
const footer='<footer class="blog-footer"><a class="wordmark" href="/">RALGO<span>✳</span></a><!-- CONTACT_FOOTER --><div><span>© Ralgo · Robert Allen</span><a href="/">Return to the exhibition ↗</a></div></footer>';
function page(title,description,body,options={}){return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#101110"><title>${esc(title)} — Ralgo</title><meta name="description" content="${esc(description)}">${headExtras({title:title+' — Ralgo',description,path:'/blog/',...options})}<link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/blog.css"></head><body><a class="skip" href="#blog-main">Skip to the briefings</a><header class="site-header"><a class="wordmark" href="/" aria-label="Ralgo home">RALGO<span>✳</span></a><span class="header-description">ART / TECHNOLOGY / IDEAS</span><nav aria-label="Main navigation"><a href="/collections/">Collections</a><a href="/blog/" aria-current="page">Blog</a><a href="/feed.xml">RSS</a></nav></header><main id="blog-main">${body}</main>${footer}</body></html>`;}
function cards(items){return items.map(postCard).join('');}
const previousPath=join(root,'tools/blog-generated.json');
let previous=[];try{previous=JSON.parse(await readFile(previousPath,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
for(const slug of previous){if(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)&&!posts.some(p=>p.slug===slug))await rm(join(out,'blog',slug),{recursive:true,force:true});}
await mkdir(join(out,'blog'),{recursive:true});
await writeFile(join(out,'blog/index.html'),page('Art & technology','Weekly art and technology briefings from Ralgo.',`<section class="blog-page"><div class="blog-masthead"><p class="eyebrow">RALGO / THE WEEKLY BRIEFINGS</p><h1>Art, technology<br><em>& what comes next.</em></h1><div class="blog-intro"><span class="blog-star" aria-hidden="true">✳</span><p>Ideas, discoveries and questions at the meeting point of art and technology.<br><span>From the studio of Ralgo.</span></p></div></div><div class="blog-divider"><span class="meta">THE BRIEFING ARCHIVE</span><span class="meta">NEWEST FIRST</span></div><div class="post-grid">${posts.length?cards(posts):'<p>The next briefing is on its way.</p>'}</div></section>`));
for(const post of posts){
  await mkdir(join(out,'blog',post.slug),{recursive:true});
  await writeFile(join(out,'blog',post.slug,'index.html'),page(post.title,post.excerpt,`<article class="reading-page"><a class="back-link" href="/blog/">← All briefings</a>${article(post)}<div class="reading-end"><span class="wordmark">RALGO<span>✳</span></span><p>Art, technology and the questions in between.</p><a class="underlink" href="/blog/">Back to the archive <span>↗</span></a></div></article>`,{path:'/blog/'+post.slug+'/',type:'article',image:post.cover||shareImage,imageAlt:post.cover?post.title:'What the Water Kept by Ralgo',schema:{'@type':'BlogPosting',headline:post.title,description:post.excerpt,datePublished:post.date,author:artist,image:absolute(post.cover||shareImage),mainEntityOfPage:absolute('/blog/'+post.slug+'/')}}));
}
const template=await readFile(join(root,'templates/home.html'),'utf8');
const pattern=/<div id="home-briefings">[\s\S]*?<\/div>/;
if(!pattern.test(template))throw Error('The homepage template needs its home-briefings container.');
const home=template.replace(pattern,`<div id="home-briefings" class="post-grid home-post-grid">${cards(posts.slice(0,3))}</div>`).replace('<!-- SITE_META -->',headExtras({title:'Ralgo · Art that is still happening',description:'Painterly seas, strange worlds and unlikely creatures. Generative art by Ralgo, exploring what happens when a system makes room for chance.',schema:{'@type':'WebSite',name:'Ralgo',url:absolute('/'),creator:artist}}));
await writeFile(join(out,'index.html'),home);
await writeFile(join(out,'feed.xml'),`<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>Ralgo: Art &amp; technology</title><link>${esc(absolute('/blog/'))}</link><description>Weekly art and technology briefings from Ralgo.</description><language>en-gb</language><atom:link href="${esc(absolute('/feed.xml'))}" rel="self" type="application/rss+xml"/>${posts.map(p=>`<item><title>${esc(p.title)}</title><link>${esc(absolute('/blog/'+p.slug+'/'))}</link><guid isPermaLink="true">${esc(absolute('/blog/'+p.slug+'/'))}</guid><pubDate>${new Date(p.date+'T10:00:00Z').toUTCString()}</pubDate><description>${esc(p.excerpt)}</description></item>`).join('')}</channel></rss>\n`);
export const blogPosts = posts;
await writeFile(previousPath,JSON.stringify(posts.map(p=>p.slug),null,2)+'\n');
console.log(`Built ${posts.length} blog article(s), archive and homepage. Upload the website folder.`);
