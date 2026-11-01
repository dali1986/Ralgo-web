const dialog=document.querySelector('#vw-player'),video=document.querySelector('#vw-video');
const films={urn:{title:'The Vulnerable Urn',src:'/assets/the-vulnerable-urn.mp4'},how:{title:'How Vulnerable Worlds Works',src:'/assets/how-vulnerable-worlds-works.mp4'}};
if(dialog&&video){
 for(const button of document.querySelectorAll('[data-vw-film]'))button.addEventListener('click',()=>{const film=films[button.dataset.vwFilm];document.querySelector('#vw-player-title').textContent=film.title;video.src=film.src;video.setAttribute('aria-label',film.title);dialog.showModal();video.play().catch(()=>{});});
 document.querySelector('#vw-close').addEventListener('click',()=>dialog.close());
 dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});
 dialog.addEventListener('close',()=>{video.pause();video.removeAttribute('src');video.load();});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)video.pause();});
}

const teaser=document.querySelector('.vw-teaser');
if(teaser&&!matchMedia('(prefers-reduced-motion: reduce)').matches&&!navigator.connection?.saveData){
 teaser.src=teaser.dataset.preview;
 teaser.addEventListener('playing',()=>teaser.classList.add('ready'));
 const observer=new IntersectionObserver(entries=>{for(const entry of entries){if(entry.isIntersecting&&!document.hidden)teaser.play().catch(()=>{});else teaser.pause();}},{threshold:.15});observer.observe(teaser);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)teaser.pause();else if(teaser.getBoundingClientRect().bottom>0)teaser.play().catch(()=>{});});
}
