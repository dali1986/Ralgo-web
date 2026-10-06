// Announce an actual canvas paint, rather than the document's load event.
// The viewer can keep its still visible while a renderer creates its first frame.
(()=>{
 const root=document.documentElement;
 root.dataset.ralgoState='loading';
 let queued=false,ready=false;
 const restore=[];
 const send=type=>{if(parent!==window)parent.postMessage({type},new URL(document.baseURI).origin);};
 function painted(){
  if(ready)return;ready=true;
  restore.forEach(reset=>reset());
  root.dataset.ralgoState='ready';
  send('ralgo-art-ready');
 }
 function drawn(context){
  if(queued||ready)return;
  const canvas=context.canvas;
  if(!canvas?.isConnected||canvas.width<64||canvas.height<64)return;
  // Simulation textures are not yet a frame on the visible canvas.
  if(context.FRAMEBUFFER_BINDING!==undefined&&context.getParameter(context.FRAMEBUFFER_BINDING))return;
  queued=true;
  requestAnimationFrame(()=>requestAnimationFrame(painted));
 }
 function watch(prototype,names){
  if(!prototype)return;
  for(const name of names){
   const original=prototype[name];if(typeof original!=='function')continue;
   const wrapped=function(...args){const result=original.apply(this,args);drawn(this);return result;};
   prototype[name]=wrapped;
   restore.push(()=>{if(prototype[name]===wrapped)prototype[name]=original;});
  }
 }
 watch(window.CanvasRenderingContext2D?.prototype,['drawImage','fillRect','fill','stroke','fillText','strokeText']);
 for(const type of ['WebGLRenderingContext','WebGL2RenderingContext'])watch(window[type]?.prototype,['drawArrays','drawElements','drawArraysInstanced','drawElementsInstanced']);
 // Chimera Quad paints in four child documents. Wait for every world.
 const childReady=new WeakSet();
 window.addEventListener('message',event=>{
  if(ready||event.origin!==new URL(document.baseURI).origin)return;
  const frames=[...document.querySelectorAll('iframe')];
  const child=frames.find(frame=>frame.contentWindow===event.source);if(!child)return;
  if(event.data?.type==='ralgo-art-ready'){
   childReady.add(child);
   if(frames.length&&frames.every(frame=>childReady.has(frame)))requestAnimationFrame(()=>requestAnimationFrame(painted));
  }else if(event.data?.type==='ralgo-art-error')failed();
 });
 function failed(){if(!ready){root.dataset.ralgoState='error';send('ralgo-art-error');}}
 window.addEventListener('error',event=>{if(event.error)failed();});
 window.addEventListener('unhandledrejection',failed);
})();
