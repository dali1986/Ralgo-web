export function mountLiveWork(stage,work,restart){
 const frame=document.createElement('iframe');
 frame.className='live-frame';frame.title=work.title;
 frame.allow='autoplay; fullscreen';frame.allowFullscreen=true;frame.tabIndex=-1;
 const cover=document.createElement('div');cover.className='live-loading';
 const preview=work.preview||work.images?.[0];
 if(preview){const image=new Image();image.src=preview;image.alt='';image.className='live-loading-image';cover.append(image);}
 const label=document.createElement('div');label.className='live-loading-label';
 const status=document.createElement('p');status.setAttribute('role','status');status.textContent='Opening '+(work.shortTitle||work.title)+'…';
 const retry=document.createElement('button');retry.className='underlink';retry.textContent='Try again';retry.hidden=true;retry.addEventListener('click',restart);
 label.append(status,retry);cover.append(label);
 stage.dataset.liveState='loading';stage.setAttribute('aria-busy','true');
 stage.replaceChildren(frame,cover);
 const controller=new AbortController();let finished=false,removeTimer;
 const slowTimer=setTimeout(()=>{if(!finished){status.textContent='Still opening '+(work.shortTitle||work.title)+'…';retry.hidden=false;}},20000);
 window.addEventListener('message',event=>{
  if(event.origin!==location.origin||event.source!==frame.contentWindow)return;
  if(event.data?.type==='ralgo-art-ready'&&!finished){
   finished=true;clearTimeout(slowTimer);stage.dataset.liveState='ready';stage.setAttribute('aria-busy','false');
   frame.classList.add('is-ready');frame.removeAttribute('tabindex');
   cover.classList.add('is-ready');cover.setAttribute('aria-hidden','true');
   removeTimer=setTimeout(()=>cover.remove(),240);
  }else if(event.data?.type==='ralgo-art-error'&&!finished){
   clearTimeout(slowTimer);stage.dataset.liveState='error';stage.setAttribute('aria-busy','false');
   status.textContent='This work could not start. Try again or open it separately below.';retry.hidden=false;
  }
 },{signal:controller.signal});
 // Register readiness before navigation, including when an artwork is cached.
 frame.src=work.live;
 return ()=>{controller.abort();clearTimeout(slowTimer);clearTimeout(removeTimer);stage.removeAttribute('aria-busy');delete stage.dataset.liveState;};
}
