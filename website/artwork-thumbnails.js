// Capture real artwork stills one at a time, then release the WebGL frames.
const cells=[...document.querySelectorAll('[data-art-preview]')],visible=new Set();
const kind=cell=>cell.dataset.artPreview;
const cacheKey=cell=>kind(cell)==='chimera'?'ralgo-chimera-settled-v1-'+cell.dataset.chimeraSeed:'ralgo-illuminations-whale-v1';
const imageAlt=cell=>kind(cell)==='chimera'?'Chimera by Ralgo, world '+cell.dataset.chimeraSeed:'Illuminations by Ralgo: the whale and its bell, painted in living light';
function showImage(cell,src){
  const image=new Image();image.alt=imageAlt(cell);image.src=src;
  cell.querySelector('.chimera-preview-wait,.art-preview-wait')?.remove();cell.append(image);
  cell.dataset.ready='true';cell.closest('.live-image').classList.add('has-preview');
}
for(const cell of cells){try{const src=sessionStorage.getItem(cacheKey(cell));if(src?.startsWith('data:image/webp;base64,')&&src.length<3000000)showImage(cell,src);}catch{}}
let active=null;
function canRun(){return !document.hidden&&!document.getElementById('home-view').hidden&&!document.body.classList.contains('modal-open');}
function finish(success=false){
  if(!active)return;const {frame,timer,cell}=active;clearTimeout(timer);frame.remove();cell.classList.remove('rendering');
  if(!success)cell.dataset.attempted='true';active=null;queueMicrotask(next);
}
function next(){
  if(active||!canRun())return;
  const cell=cells.find(c=>visible.has(c)&&!c.dataset.ready&&!c.dataset.attempted);if(!cell)return;
  const frame=document.createElement('iframe');frame.title=kind(cell)==='chimera'?'Chimera artwork preview':'Illuminations artwork preview';frame.tabIndex=-1;frame.setAttribute('aria-hidden','true');
  frame.src=kind(cell)==='chimera'
    ?'/art/chimera-preview.html?seed='+encodeURIComponent(cell.dataset.chimeraSeed)+'&q=tiny&ui=min&mute=1&fixdt=0.05&nogen=1'
    :'/art/illuminations-preview.html?tale=whale&fxhash=oo123456789abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRS&preview=1';
  cell.classList.add('rendering');cell.append(frame);
  active={cell,frame,timer:setTimeout(()=>finish(false),30000)};
}
function reconsider(){
  if(active&&(!canRun()||!visible.has(active.cell))){const {cell,frame,timer}=active;clearTimeout(timer);frame.remove();cell.classList.remove('rendering');active=null;}
  next();
}
window.addEventListener('message',event=>{
  if(!active||event.origin!==location.origin||event.source!==active.frame.contentWindow)return;
  const type=event.data?.type,expected=kind(active.cell);
  if(!(expected==='chimera'&&type==='ralgo-chimera-preview')&&!(expected==='illuminations'&&type==='ralgo-art-preview'&&event.data.kind==='illuminations'))return;
  const src=event.data.image;if(typeof src!=='string'||!src.startsWith('data:image/webp;base64,')||src.length>3000000)return;
  try{sessionStorage.setItem(cacheKey(active.cell),src);}catch{}
  showImage(active.cell,src);finish(true);
});
const observer=new IntersectionObserver(entries=>{for(const entry of entries){if(entry.isIntersecting)visible.add(entry.target);else visible.delete(entry.target);}reconsider();},{threshold:0.05});
cells.forEach(cell=>observer.observe(cell));
window.addEventListener('exhibition-view-change',()=>setTimeout(reconsider,0));
window.addEventListener('hashchange',()=>setTimeout(reconsider,0));
document.addEventListener('visibilitychange',reconsider);
