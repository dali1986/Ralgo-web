// Produce real artwork thumbnails in sequence, then release each WebGL iframe.
const cells=[...document.querySelectorAll('[data-chimera-seed]')],visible=new Set();
let active=null;
function canRun(){return !document.hidden&&!document.getElementById('home-view').hidden&&!document.body.classList.contains('modal-open');}
function finish(success=false){
  if(!active)return;const {frame,timer,cell}=active;clearTimeout(timer);frame.remove();cell.classList.remove('rendering');
  if(success){cell.dataset.ready='true';cell.closest('.chimera-cover').classList.add('has-preview');}else cell.dataset.attempted='true';
  active=null;queueMicrotask(next);
}
function next(){
  if(active||!canRun())return;
  const cell=cells.find(c=>visible.has(c)&&!c.dataset.ready&&!c.dataset.attempted);if(!cell)return;
  const frame=document.createElement('iframe');frame.title='Chimera artwork preview';frame.tabIndex=-1;frame.setAttribute('aria-hidden','true');
  frame.src='/art/chimera-preview.html?seed='+encodeURIComponent(cell.dataset.chimeraSeed)+'&q=tiny&ui=min&mute=1&fixdt=0.05';
  cell.classList.add('rendering');cell.append(frame);
  active={cell,frame,timer:setTimeout(()=>finish(false),20000)};
}
function reconsider(){
  if(active&&(!canRun()||!visible.has(active.cell))){const {cell,frame,timer}=active;clearTimeout(timer);frame.remove();cell.classList.remove('rendering');active=null;}
  next();
}
window.addEventListener('message',event=>{
  if(!active||event.origin!==location.origin||event.source!==active.frame.contentWindow||event.data?.type!=='ralgo-chimera-preview')return;
  const src=event.data.image;if(typeof src!=='string'||!src.startsWith('data:image/webp;base64,')||src.length>3000000)return;
  const image=new Image();image.alt='Chimera by Ralgo, world '+active.cell.dataset.chimeraSeed;image.src=src;
  active.cell.querySelector('.chimera-preview-wait')?.remove();active.cell.append(image);finish(true);
});
const observer=new IntersectionObserver(entries=>{for(const entry of entries){if(entry.isIntersecting)visible.add(entry.target);else visible.delete(entry.target);}reconsider();},{threshold:0.05});
cells.forEach(cell=>observer.observe(cell));
window.addEventListener('exhibition-view-change',()=>setTimeout(reconsider,0));
window.addEventListener('hashchange',()=>setTimeout(reconsider,0));
document.addEventListener('visibilitychange',reconsider);
