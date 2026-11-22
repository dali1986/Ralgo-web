// The two Vulnerable Worlds films open in a small player on the homepage.
// Each trigger is an ordinary link to the film, so it still works without this script.
const dialog=document.querySelector('#vw-player'),video=document.querySelector('#vw-video');
const films={urn:{title:'The Vulnerable Urn',src:'/assets/the-vulnerable-urn.mp4'},how:{title:'How Vulnerable Worlds Works',src:'/assets/how-vulnerable-worlds-works.mp4'}};
if(dialog&&video&&dialog.showModal){
 for(const trigger of document.querySelectorAll('[data-vw-film]'))trigger.addEventListener('click',event=>{
  if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
  const film=films[trigger.dataset.vwFilm];if(!film)return;
  event.preventDefault();
  document.querySelector('#vw-player-title').textContent=film.title;video.src=film.src;video.setAttribute('aria-label',film.title);dialog.showModal();video.play().catch(()=>{});
 });
 document.querySelector('#vw-close').addEventListener('click',()=>dialog.close());
 dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});
 dialog.addEventListener('close',()=>{video.pause();video.removeAttribute('src');video.load();});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)video.pause();});
}
