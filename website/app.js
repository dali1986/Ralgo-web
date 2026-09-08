import {works} from './works.js';
import {meta} from './collection-meta.js';
import {routeHref, pathRoute} from './routes.js';
import {defaultShareImage,collectionShareImage,workShareImage,liveShareImage} from './share-card-paths.js';
const $=id=>document.getElementById(id), esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const viewer=$('art-viewer'),indexDialog=$('index-dialog');
const siteBase=document.body.dataset.siteBase||'';
function enhanceLinks(){
 for(const a of document.querySelectorAll('a[href^="#"]')){
  const route=a.getAttribute('href');
  if(/^#(?:collection\/|art\/|live\/|home$|living$|collections$|about$)/.test(route)){a.dataset.route=route;a.href=routeHref(route,siteBase);}
 }
}
function activeHeading(id){
 for(const headingID of ['home-title','collection-title']){
  const old=$(headingID),tag=headingID===id?'H1':'H2';
  if(old&&old.tagName!==tag){const next=document.createElement(tag);next.id=old.id;next.innerHTML=old.innerHTML;old.replaceWith(next);}
 }
 const skip=document.querySelector('.skip');if(skip)skip.href=id==='collection-title'?'#collection-view':'#living';
}
function syncPageMetadata(){
 const route=location.hash||pathRoute(location.pathname,siteBase),parts=route.slice(1).split('/');
 let description='Painterly seas, strange worlds and unlikely creatures. Generative art by Ralgo, exploring what happens when a system makes room for chance.',picture=defaultShareImage,alt='What the Water Kept by Ralgo';
 if(['collection','art'].includes(parts[0])){
  const cid=parts[1],paired=cid==='seasky-pairs';description=meta[cid]?.description||description;
  const w=parts[0]==='art'?getItems(cid).find(w=>w.number===Number(parts[2])):getItems(cid).find(w=>(paired?w.original:w).previewStatus!=='unavailable');
  const original=paired?w?.original:w;
  if(original&&original.previewStatus!=='unavailable'){
   picture=parts[0]==='art'?workShareImage(cid,w.number):collectionShareImage(cid);
   alt=paired&&parts[0]==='art'?`Seasky #${w.number} / ${w.arias.map(ariaName).join(', ')}`:original.title;
  }
 }else if(parts[0]==='live'){
  const w=works.find(w=>w.id===parts[1]);if(w){description=w.description;picture=w.images?.length?liveShareImage(w.id):picture;alt=w.images?.length?(w.shortTitle||w.title):alt;}
 }
 const canonical=new URL(routeHref(route,siteBase),location.origin);canonical.hash='';
 const imageURL=new URL(picture,location.origin).href;
 document.querySelector('link[rel="canonical"]')?.setAttribute('href',canonical.href);
 for(const [selector,content] of [['meta[name="description"]',description],['meta[property="og:title"]',document.title],['meta[name="twitter:title"]',document.title],['meta[property="og:description"]',description],['meta[name="twitter:description"]',description],['meta[property="og:url"]',canonical.href],['meta[property="og:image"]',imageURL],['meta[name="twitter:image"]',imageURL],['meta[property="og:image:alt"]',alt],['meta[name="twitter:image:alt"]',alt]])document.querySelector(selector)?.setAttribute('content',content);
 for(const [key,value] of [['width','1200'],['height','630']]){
  let tag=document.querySelector(`meta[property="og:image:${key}"]`);
  if(!tag){tag=document.createElement('meta');tag.setAttribute('property',`og:image:${key}`);document.head.append(tag);}
  tag.setAttribute('content',value);
 }
 enhanceLinks();
}
const roomOrder=['wild','order','continuum','quantum-places-lost-in-time','overgrowth','overgrowth-x8'];
const livingOrder=['water','chimera','creatures','illuminations','fireplace'];
const verseCollections=new Set(['wild','order','continuum','quantum-places-lost-in-time','overgrowth','overgrowth-x8']);
const verseArchives=new Set(['continuum','quantum-places-lost-in-time','overgrowth','overgrowth-x8']);
const viewerOrder=[...livingOrder,'chimera-quad','qql'];
let data,collections=new Map(),pairs=[],activeCollection=null,filtered=[],visible=0,layout='wall';
let sequence=[],viewIndex=0,viewCollection=null,liveWork=null,variant=0,pairMode='both',returnHash='#collections',returnFocus=null,homeScroll=0,artTouch=null,fireVisible=false;
const featuredPairs=[68,0,12,57,99,33,1,80];
const artBlocksSeasky='https://www.artblocks.io/collection/seasky-by-ralgo',artBlocks500='https://www.artblocks.io/discover/ab-500';
function platformLinks(cid){if(['seasky','aria','seasky-pairs'].includes(cid))return link(artBlocksSeasky,'Seasky on Art Blocks')+link(artBlocks500,'Art Blocks 500');if(cid==='quasi')return link('https://rayner.art/','Harvey Rayner’s website')+link(collections.get('quasi').source,'Quasi Dragon Studies on Verse');return verseCollections.has(cid)?link(collections.get(cid).source,'View on Verse'):'';}
function img(w,{eager=false}={}){if(w.previewStatus==='unavailable')return '<span class="preview-unavailable">Preview unavailable<br>View the collection on Verse</span>';return `<img src="${esc(w.local||w.thumbnail||w.image)}" data-fallback="${esc(w.thumbnail||w.image)}" alt="${esc(w.title)}" loading="${eager?'eager':'lazy'}" decoding="async">`;}
function link(url,label,cls='underlink'){return `<a class="${cls}" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)} <span aria-hidden="true">↗</span></a>`;}
function goto(hash,{replace=false}={}){const url=routeHref(hash,siteBase);if(replace)history.replaceState(null,'',url);else if(location.pathname+location.hash!==url)history.pushState(null,'',url);route();}
function lockScroll(){document.body.classList.toggle('modal-open',viewer.open||indexDialog.open);window.dispatchEvent(new Event('exhibition-view-change'));}
function getItems(cid){return cid==='seasky-pairs'?pairs:collections.get(cid)?.items||[];}
function ariaName(aria){return aria.title.replace(/^#\s*\d+\s*/, '').trim()||aria.title;}
function pairedLabel(pair){return pair.arias.length>1?`${pair.arias.length} Arias`:'Seasky + Aria';}
function buildPairs(){const a=collections.get('aria').items;pairs=collections.get('seasky').items.map(w=>({id:'pair-'+w.number,number:w.number,title:'Seasky #'+w.number,original:w,arias:a.filter(x=>x.pair===w.number)}));}
function renderFeature(){const shown=featuredPairs.map(n=>pairs.find(w=>w.number===n)).filter(Boolean);$('feature-pair').innerHTML=shown.map(w=>tile(w,'seasky-pairs')).join('');$('feature-caption').textContent='Eight paired studies. Select a thumbnail to expand Seasky and its named Aria.';}

function renderHome(){
 $('total-count').textContent=data.collections.filter(c=>c.id!=='quasi').reduce((n,c)=>n+c.count,0).toLocaleString('en-GB');
 $('room-grid').innerHTML=roomOrder.map(cid=>{const c=collections.get(cid),m=meta[cid], picks=c.coverNumbers?c.coverNumbers.map(n=>c.items.find(w=>w.number===n)):[c.items[0],c.items[Math.floor(c.items.length*.46)],c.items[Math.floor(c.items.length*.78)]];return `<article class="room-card"><a class="room-cover" href="#collection/${cid}" aria-label="Explore all ${c.count} ${esc(c.title)} works">${picks.map(w=>img(w)).join('')}<span aria-hidden="true">↗</span></a><div class="room-body"><div class="room-heading"><div><span class="meta">${esc(m.kicker)}</span><h3><a href="#collection/${cid}">${esc(m.title)}</a></h3></div><span class="room-count">${c.count} works</span></div><p>${esc(m.intro)}</p><div class="room-links"><a class="underlink" href="#collection/${cid}">Explore all ${c.count} works <span>↗</span></a>${verseCollections.has(cid)?link(c.source,'View on Verse'):''}</div></div></article>`;}).join('');
 const catalogueLinks=['seasky-pairs',...roomOrder].map(cid=>{const count=cid==='seasky-pairs'?'100 pairs · 200 works':collections.get(cid).count+' works';return `<a class="index-row" href="#collection/${cid}"><span>${esc(meta[cid].title)}</span><small>${count}</small></a>`;}).join('');
 const indexWork=id=>{const w=works.find(w=>w.id===id);return `<a class="index-row" href="#live/${w.id}"><span>${esc(w.shortTitle||w.title)}</span><small>${w.live?'Enter':'View'}</small></a>`;};
 $('index-list').innerHTML=`<p class="index-group-label">LATEST WORKS</p>${livingOrder.map(indexWork).join('')}<p class="index-group-label">RALGO COLLECTIONS</p>${catalogueLinks}<p class="index-group-label">COMPOSITIONS FROM OTHER ARTISTS’ SERIES</p>${indexWork('qql')}<a class="index-row" href="#collection/quasi"><span>Quasi Dragon Studies</span><small>Harvey Rayner · Ralgo compositions</small></a><p class="index-group-label">WRITING</p><a class="index-row" href="/blog"><span>Art & technology</span><small>Weekly briefings ↗</small></a>`;
 $('collection-select').innerHTML='<optgroup label="Ralgo collections">'+['seasky-pairs',...roomOrder,'seasky','aria'].map(cid=>`<option value="${cid}">${esc(meta[cid].title)}</option>`).join('')+'</optgroup><optgroup label="Compositions from other artists’ series"><option value="quasi">Harvey Rayner · Quasi Dragon Studies</option></optgroup>';
 renderFeature();
}
function renderCollection(cid){
 if(!meta[cid]){goto('#collections',{replace:true});return;}
 activeHeading('collection-title');
 const changed=activeCollection!==cid;
 if(!$('home-view').hidden)homeScroll=window.scrollY;
 $('home-view').hidden=true;$('collection-view').hidden=false;window.dispatchEvent(new Event('exhibition-view-change'));removeFire();
 document.title=meta[cid].title+' — Ralgo';
 if(!changed)return;
 activeCollection=cid;setLayout('wall');$('art-search').value='';$('collection-select').value=cid;
 const m=meta[cid],c=collections.get(cid);$('collection-kicker').textContent=m.kicker;$('collection-title').textContent=m.title;$('collection-description').textContent=m.description;
 $('collection-stats').innerHTML=cid==='seasky-pairs'?'<span>100 Seaskys / 100 Arias</span><a href="#collection/seasky">All Seasky originals</a><a href="#collection/aria">Selected Arias</a>':`<span>${c.count} works · ${c.selectionLabel||'complete collection'}</span>${['seasky','aria'].includes(cid)?'<a href="#collection/seasky-pairs">View the paired collection ↗</a>':''}`;
 $('collection-credit').textContent=cid==='seasky-pairs'?'Seasky by Ralgo · Art Blocks 500, Presents. Seasky Aria by Ralgo.':c.credit||'Artwork by Ralgo · Collection catalogue captured September 2026.';
 const hasSource=verseCollections.has(cid)||['seasky','seasky-pairs','quasi'].includes(cid);$('collection-source').hidden=!hasSource;if(hasSource){$('collection-source').href=m.source||c?.source;$('collection-source').textContent=cid==='seasky'||cid==='seasky-pairs'?'Seasky on Art Blocks ↗':'View collection on Verse ↗';}else $('collection-source').removeAttribute('href');$('collection-platforms').innerHTML=platformLinks(cid);
 filterGallery();window.scrollTo({top:0,behavior:'instant'});document.title=m.title+' — Ralgo';
}
function filterGallery(){
 const q=$('art-search').value.trim().toLowerCase(),exact=/^#?\d+$/.test(q)?Number(q.replace('#','')):null;
 filtered=getItems(activeCollection).filter(w=>!q||(exact!==null?w.number===exact:[w.title,...(w.arias||[]).map(a=>a.title)].join(' ').toLowerCase().includes(q)));
 visible=0;$('gallery').replaceChildren();$('gallery').className=`gallery ${activeCollection==='seasky-pairs'?'paired ':''}${['wild','quantum-places-lost-in-time'].includes(activeCollection)?'portrait ':''}${activeCollection==='quasi'?'quasi ':''}${layout==='wall'?'wall':''}`;
 $('gallery-empty').hidden=filtered.length>0;appendGallery(activeCollection==='quasi');
}
function tile(w,cid){
 if(cid==='seasky-pairs'){const hasNote=w.arias.some(a=>a.pairingStatus==='proposed_title_and_visual');return `<article class="art-card"><a class="art-tile" href="#art/${cid}/${w.number}" aria-label="View Seasky ${w.number} and ${w.arias.length} Aria ${w.arias.length===1?'version':'versions'}"><div class="pair-tile"><span class="art-image">${img(w.original)}</span><span class="aria-stack" style="--variants:${Math.max(1,w.arias.length)}">${w.arias.map(a=>`<figure class="aria-mini"><span class="art-image">${img(a)}</span><figcaption>${esc(ariaName(a))}</figcaption></figure>`).join('')}</span></div><div class="tile-caption"><strong>Seasky #${w.number}</strong><small>${pairedLabel(w)}</small></div><div class="pair-labels"><span>Original</span><span>${hasNote?'<span class="pair-note">Pairing note · </span>':''}Aria${w.arias.length>1?' · all versions shown':''}</span></div></a></article>`;}
 return `<article class="art-card ${cid==='quasi'&&w.width/w.height>1.85?'wide-study':''}"><a class="art-tile" href="#art/${cid}/${w.number}" aria-label="View ${esc(w.title)}"><span class="art-image">${img(w)}</span><span class="tile-caption"><strong>${esc(w.shortTitle||w.title)}</strong><small>↗</small></span></a></article>`;
}
function appendGallery(all=false){const slice=filtered.slice(visible,all?filtered.length:visible+24);$('gallery').insertAdjacentHTML('beforeend',slice.map(w=>tile(w,activeCollection)).join(''));visible+=slice.length;$('gallery-count').textContent=`Showing ${visible} of ${filtered.length} ${activeCollection==='seasky-pairs'?'pairs':'works'}`;$('load-more').hidden=visible>=filtered.length;$('show-all').hidden=visible>=filtered.length;enhanceLinks();}
function setLayout(mode){layout=mode;$('layout-gallery').setAttribute('aria-pressed',String(mode==='gallery'));$('layout-wall').setAttribute('aria-pressed',String(mode==='wall'));$('gallery').classList.toggle('wall',mode==='wall');}
function resetFocus(){viewer.classList.remove('focus');$('viewer-focus').setAttribute('aria-pressed','false');$('exit-focus').hidden=true;}
function setFocus(on){viewer.classList.toggle('focus',on);$('viewer-focus').setAttribute('aria-pressed',String(on));$('exit-focus').hidden=!on;if(on)setInfo(false);}
function setInfo(on){$('viewer-info').hidden=!on;$('viewer-info-toggle').setAttribute('aria-pressed',String(on));}
function ensureViewer(){if(!viewer.open){returnFocus=document.activeElement;resetFocus();setInfo(false);viewer.showModal();lockScroll();removeFire();}}
function closeViewer(){if(viewer.open){if(document.fullscreenElement)document.exitFullscreen?.().catch(()=>{});viewer.close();}$('viewer-stage').replaceChildren();liveWork=null;setInfo(false);resetFocus();lockScroll();}
function viewImage(w,label){
 const f=document.createElement('figure');f.className='view-figure';
 if(w.previewStatus==='unavailable'){f.innerHTML='<div class="preview-unavailable">A preview isn’t available for this work yet.</div>'+link(w.source,'View collection on Verse');return f;}
 const box=document.createElement('div');box.className='view-image';
 const low=document.createElement('img');low.src=w.local||w.thumbnail||w.image;low.alt=w.title;low.dataset.fallback=w.thumbnail||w.image;box.append(low);
 // These imported collections have reliable local previews; Verse hosts their collection views.
 const retiredGateway=/^https?:\/\/(?:[^/]+\.)?fxhash\.xyz\//i.test(w.image||'');
 if(w.image&&!retiredGateway){
  const hi=document.createElement('img');hi.className='high-resolution';hi.alt='';hi.dataset.managed='true';
  hi.onload=()=>hi.classList.add('ready');
  hi.onerror=()=>{hi.remove();const note=document.createElement('span');note.className='full-image-note';note.textContent='Preview · full-size image unavailable';box.append(note);};
  hi.src=w.image;box.append(hi);
 }
 const caption=document.createElement('figcaption');caption.innerHTML=`<span>${esc(label)}</span><span>${esc(w.title)}</span>`;
 f.append(box,caption);return f;
}
function renderArt(){
 const w=sequence[viewIndex];if(!w)return;$('viewer-back').querySelector('span').textContent='Collection';
 $('viewer-stage').replaceChildren();$('viewer-stage').className='viewer-stage';$('pair-modes').hidden=viewCollection!=='seasky-pairs';$('aria-variant-label').hidden=true;
 $('viewer-context').textContent=viewCollection==='quasi'?'Harvey Rayner · Primary artist / Ralgo · Composition':viewCollection==='seasky'?'Seasky · Art Blocks 500':meta[viewCollection].title;$('viewer-title').textContent=viewCollection==='seasky-pairs'?`Seasky #${w.number} / Aria`:w.title;$('viewer-progress').textContent=`${viewIndex+1} / ${sequence.length}`;
 $('viewer-footer-caption').innerHTML=platformLinks(viewCollection);
 if(viewCollection==='seasky-pairs'){
  variant=Math.min(variant,Math.max(0,w.arias.length-1));const aria=w.arias[variant];$('viewer-title').textContent=`Seasky #${w.number} / ${aria?ariaName(aria):'Aria'}`;
  if(pairMode==='both')$('viewer-stage').classList.add('two-up');
  if(pairMode!=='aria')$('viewer-stage').append(viewImage(w.original,'SEASKY · ORIGINAL'));
  if(pairMode!=='original'&&aria)$('viewer-stage').append(viewImage(aria,'SEASKY ARIA'));
  $('aria-variant-label').hidden=w.arias.length<2;$('aria-variant').innerHTML=w.arias.map((a,i)=>`<option value="${i}" ${i===variant?'selected':''}>${i+1} of ${w.arias.length} · ${esc(ariaName(a))}</option>`).join('');
  document.querySelectorAll('[data-pair-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.pairMode===pairMode)));
  $('viewer-info').innerHTML=`<h3>Seasky #${w.number}<br>& its Aria${w.arias.length>1?'s':''}</h3><p>A generative original and its reimagining by Ralgo.${w.arias.length>1?' All '+w.arias.length+' Aria versions are included.':''}</p>${platformLinks('seasky-pairs')}${link(w.original.original,'Original Seasky image')}${w.original.live?link(w.original.live,'Watch the Seasky render'):''}${aria?link(aria.original,'Original Aria image'):''}${aria?.pairingNote?`<p class="pairing-notice">${esc(aria.pairingNote)}</p>`:''}<small>Seasky by Ralgo · Art Blocks 500, Presents.<br>Seasky Aria by Ralgo · Artist curation, AI and image manipulation.</small>`;
 }else{
  $('viewer-stage').append(viewImage(w,meta[viewCollection].title));
  $('viewer-info').innerHTML=`<h3>${esc(w.title)}</h3><p>${esc(meta[viewCollection].description)}</p>${platformLinks(viewCollection)}${viewCollection==='quasi'?link(w.source,'View this composition on Verse'):''}${verseArchives.has(viewCollection)?'':link(w.original,'Open full-resolution artwork')}${!verseArchives.has(viewCollection)&&w.live?link(w.live,'Watch the work render'):''}${viewCollection==='aria'&&w.pair!==null?`<a class="underlink" href="#art/seasky-pairs/${w.pair}">View with Seasky #${w.pair} <span>↗</span></a>`:''}${w.pairingNote?`<p class="pairing-notice">${esc(w.pairingNote)}</p>`:''}<small>${esc(collections.get(viewCollection)?.credit||'Artwork by Ralgo.')}</small>`;
 }
 $('prev-art').disabled=sequence.length<2;$('next-art').disabled=sequence.length<2;$('status').textContent=`${$('viewer-title').textContent}, ${viewIndex+1} of ${sequence.length}`;
 document.title=$('viewer-title').textContent+' — Ralgo';
}
function openArt(cid,number){
 if(!meta[cid])return;renderCollection(cid);viewCollection=cid;liveWork=null;
 const options=filtered.some(w=>w.number===number)?filtered:getItems(cid);sequence=options;viewIndex=sequence.findIndex(w=>w.number===number);if(viewIndex<0){goto('#collection/'+cid,{replace:true});return;}
 returnHash='#collection/'+cid;variant=0;ensureViewer();renderArt();
}
function liveStill(w,index=0){$('viewer-stage').className='viewer-stage';const images=w.images||[];if(!images.length)return;const image=images[index];$('viewer-stage').replaceChildren(viewImage({title:w.title,image,local:image,original:image},'RALGO'));document.querySelectorAll('[data-live-still]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.liveStill)===index)));}
function startLive(w){$('viewer-stage').className='viewer-stage live';const frame=document.createElement('iframe');frame.src=w.live;frame.title=w.title;frame.allow='autoplay; fullscreen';frame.allowFullscreen=true;$('viewer-stage').replaceChildren(frame);setInfo(false);}
function openLive(id){
 activeHeading('home-title');
 const w=works.find(x=>x.id===id);if(!w)return;$('viewer-back').querySelector('span').textContent='Exhibition';liveWork=w;viewCollection=null;returnHash='#living';ensureViewer();
 $('viewer-context').textContent=w.category;$('viewer-title').textContent=w.shortTitle||w.title;$('viewer-progress').textContent='';$('pair-modes').hidden=true;$('aria-variant-label').hidden=true;$('viewer-stage').className='viewer-stage';
 $('viewer-footer-caption').innerHTML=w.live?link(w.live,'Open separately','separate-link'):'Parametric artist & minter: Ralgo';
 $('viewer-info').innerHTML=`<h3>${esc(w.title)}</h3><p>${esc(w.description)}</p>${w.live?'<button class="underlink" data-restart-live>Restart live work <span>↗</span></button>':''}${w.source?link(w.source,w.sourceLabel||'View original work'):''}${(w.extraLinks||[]).map(l=>link(l.url,l.label)).join('')}${w.creditSource?link(w.creditSource,'Artist credit'):''}${w.id==='creatures'?`<div class="still-picker">${w.images.map((src,i)=>`<button data-live-still="${i}" aria-label="View selected creature ${i+1}" aria-pressed="false"><img src="${esc(src)}" alt=""></button>`).join('')}</div>`:''}<small>${esc(w.credit)}</small>`;
 if(w.live)startLive(w);else liveStill(w);
 $('prev-art').disabled=false;$('next-art').disabled=false;document.title=w.title+' — Ralgo';
}
function moveArt(dir){if(liveWork){const ids=viewerOrder,i=ids.indexOf(liveWork.id);goto('#live/'+ids[(i+dir+ids.length)%ids.length],{replace:true});return;}if(!sequence.length)return;const i=(viewIndex+dir+sequence.length)%sequence.length;goto(`#art/${viewCollection}/${sequence[i].number}`,{replace:true});}
function route(){
 if(!data)return;if(indexDialog.open)indexDialog.close();
 $('static-work')?.remove();
 const hash=location.hash||pathRoute(location.pathname,siteBase),parts=hash.slice(1).split('/');
 if(/^#(?:collection\/|art\/|live\/)/.test(location.hash))history.replaceState(null,'',routeHref(hash,siteBase));
 if(parts[0]==='art'&&parts.length>=3){const n=Number(parts[2]);if(Number.isInteger(n))openArt(parts[1],n);syncPageMetadata();return;}
 if(parts[0]==='live'){if(parts[1]==='quasi'){goto('#collection/quasi',{replace:true});return;}openLive(parts[1]);syncPageMetadata();return;}
 if(parts[0]==='work'){const old=parts[1];const aliases={seasky:'seasky-pairs',aria:'seasky-pairs',quantum:'quantum-places-lost-in-time',order:'order',overgrowth:'overgrowth',wild:'wild',continuum:'continuum',quasi:'quasi'};goto(aliases[old]?'#collection/'+aliases[old]:'#live/'+old,{replace:true});return;}
 closeViewer();
 if(parts[0]==='collection'){renderCollection(parts[1]);syncPageMetadata();return;}
 activeHeading('home-title');
 const wasCollection=!$('collection-view').hidden;$('collection-view').hidden=true;$('home-view').hidden=false;activeCollection=null;document.title='RALGO — Living works & collections';
 if(parts[0]==='home')window.scrollTo({top:0,behavior:'instant'});else if(['collections','living','about'].includes(parts[0]))requestAnimationFrame(()=>$(parts[0]).scrollIntoView({behavior:'instant'}));else if(wasCollection)window.scrollTo({top:homeScroll,behavior:'instant'});
 maybeFire();syncPageMetadata();
}
function removeFire(){const frame=$('fire-preview').querySelector('iframe');if(frame)frame.remove();const cover=$('fire-preview').querySelector('.preview-cover');if(cover)cover.remove();$('fire-preview').querySelector('.preview-launch').hidden=false;}
function maybeFire(){
 const box=$('fire-preview'),r=box.getBoundingClientRect();fireVisible=r.top<innerHeight&&r.bottom>0;
 if(!$('home-view').hidden&&!viewer.open&&fireVisible&&!matchMedia('(prefers-reduced-motion: reduce)').matches){if(box.querySelector('iframe'))return;box.querySelector('.preview-launch').hidden=true;const frame=document.createElement('iframe');frame.src='/art/fireplace/index.html?preview=1';frame.title='Live preview of The Dreaming Fire';frame.tabIndex=-1;frame.setAttribute('aria-hidden','true');frame.setAttribute('scrolling','no');const cover=document.createElement('button');cover.className='preview-cover';cover.dataset.live='fireplace';cover.setAttribute('aria-label','Enter the live fireplace');cover.innerHTML='<span>Enter the fire</span><span aria-hidden="true">↗</span>';box.append(frame,cover);}else removeFire();
}
new IntersectionObserver(()=>maybeFire(),{threshold:[0,.1,.5]}).observe($('fire-preview'));
$('index-open').addEventListener('click',()=>{returnFocus=document.activeElement;indexDialog.showModal();lockScroll();});$('index-close').addEventListener('click',()=>indexDialog.close());indexDialog.addEventListener('close',lockScroll);
$('art-search').addEventListener('input',filterGallery);$('clear-search').addEventListener('click',()=>{$('art-search').value='';filterGallery();$('art-search').focus();});$('collection-select').addEventListener('change',e=>goto('#collection/'+e.target.value));$('load-more').addEventListener('click',()=>appendGallery());$('show-all').addEventListener('click',()=>appendGallery(true));$('layout-gallery').addEventListener('click',()=>setLayout('gallery'));$('layout-wall').addEventListener('click',()=>setLayout('wall'));
$('viewer-back').addEventListener('click',()=>goto(returnHash));$('viewer-close').addEventListener('click',()=>goto(returnHash));viewer.addEventListener('cancel',e=>{e.preventDefault();goto(returnHash);});viewer.addEventListener('close',()=>{$('viewer-stage').replaceChildren();lockScroll();if(returnFocus?.isConnected)returnFocus.focus({preventScroll:true});maybeFire();});
$('viewer-fullscreen').hidden=!document.fullscreenEnabled;
$('viewer-fullscreen').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await viewer.requestFullscreen();}catch{$('status').textContent='Full screen is unavailable. Focus mode expands the artwork within this window.';}});
document.addEventListener('fullscreenchange',()=>{$('viewer-fullscreen').setAttribute('aria-label',document.fullscreenElement?'Exit full screen':'Enter full screen');});
$('viewer-info-toggle').addEventListener('click',()=>setInfo($('viewer-info').hidden));$('viewer-focus').addEventListener('click',()=>setFocus(!viewer.classList.contains('focus')));$('exit-focus').addEventListener('click',()=>setFocus(false));$('prev-art').addEventListener('click',()=>moveArt(-1));$('next-art').addEventListener('click',()=>moveArt(1));$('aria-variant').addEventListener('change',e=>{variant=Number(e.target.value);renderArt();});
document.addEventListener('click',e=>{if(!data||e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;const live=e.target.closest('[data-live]');if(live){e.preventDefault();returnFocus=live;goto('#live/'+live.dataset.live);return;}const routeLink=e.target.closest('a[data-route]');if(routeLink){e.preventDefault();returnFocus=routeLink;goto(routeLink.dataset.route);return;}const mode=e.target.closest('[data-pair-mode]');if(mode){pairMode=mode.dataset.pairMode;renderArt();}if(e.target.closest('[data-restart-live]')&&liveWork)startLive(liveWork);const still=e.target.closest('[data-live-still]');if(still&&liveWork)liveStill(liveWork,Number(still.dataset.liveStill));});
document.addEventListener('keydown',e=>{if(!viewer.open||e.altKey||e.ctrlKey||e.metaKey||e.target.matches('input,select,textarea'))return;if(e.key==='ArrowLeft'){e.preventDefault();moveArt(-1);}if(e.key==='ArrowRight'){e.preventDefault();moveArt(1);}if(e.key.toLowerCase()==='f'){e.preventDefault();setFocus(!viewer.classList.contains('focus'));}});
$('viewer-stage').addEventListener('touchstart',e=>{if(!liveWork&&e.touches.length===1)artTouch=[e.touches[0].clientX,e.touches[0].clientY];},{passive:true});$('viewer-stage').addEventListener('touchend',e=>{if(!artTouch)return;const dx=e.changedTouches[0].clientX-artTouch[0],dy=e.changedTouches[0].clientY-artTouch[1];artTouch=null;if(Math.abs(dx)>75&&Math.abs(dx)>Math.abs(dy)*1.6)moveArt(dx<0?1:-1);},{passive:true});
document.addEventListener('error',e=>{const im=e.target;if(!(im instanceof HTMLImageElement)||im.dataset.managed)return;const backup=im.dataset.fallback;if(backup&&im.src!==backup){delete im.dataset.fallback;im.src=backup;}else if(!im.parentElement.querySelector('.tile-error')){const note=document.createElement('span');note.className='tile-error';note.textContent='Image unavailable · open work for the original';im.parentElement.append(note);}},{capture:true});
window.addEventListener('hashchange',route);
window.addEventListener('popstate',route);
async function loadCatalogue(){try{const response=await fetch('/data/catalogue.json');if(!response.ok)throw Error('Catalogue unavailable');data=await response.json();collections=new Map(data.collections.map(c=>[c.id,c]));for(const c of data.collections){if(!meta[c.id])meta[c.id]={title:c.title,kicker:c.kicker||'ARTWORK BY RALGO',description:c.description||'',intro:c.intro||''};if(!['seasky','aria','quasi'].includes(c.id)&&!roomOrder.includes(c.id)&&c.items.length)roomOrder.push(c.id);}buildPairs();renderHome();$('catalogue-error').hidden=true;route();}catch(error){$('catalogue-error').hidden=false;}}
$('retry-catalogue').addEventListener('click',loadCatalogue);loadCatalogue();
