export const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const dateLabel=s=>new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(s+'T12:00:00Z'));
export function inline(text){
  const tokens=[];
  let value=esc(text).replace(/`([^`]+)`/g,(_,code)=>{tokens.push(`<code>${code}</code>`);return `\u0000${tokens.length-1}\u0000`;});
  value=value.replace(/(!?)\[([^\]]*)\]\((https?:\/\/[^\s)]+|\/(?!\/)[^\s)]+)\)/g,(_,image,label,url)=>{tokens.push(image?`<img src="${url}" alt="${label}" loading="lazy" decoding="async">`:`<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`);return `\u0000${tokens.length-1}\u0000`;});
  value=value.replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>').replace(/\*([^*]+)\*/g,'<em>$1</em>');
  return value.replace(/\u0000(\d+)\u0000/g,(_,i)=>tokens[Number(i)]||'');
}
export function markdown(source){
  const lines=source.replace(/\u0000/g,'').replace(/\r\n?/g,'\n').split('\n'),out=[];let p=[],list=[],listType='',quote=[],code=null;
  const flush=()=>{if(p.length){out.push('<p>'+inline(p.join(' '))+'</p>');p=[];}if(list.length){out.push(`<${listType}>`+list.map(s=>'<li>'+inline(s)+'</li>').join('')+`</${listType}>`);list=[];}if(quote.length){out.push('<blockquote>'+inline(quote.join(' '))+'</blockquote>');quote=[];}};
  for(const line of lines){
    if(line.startsWith('```')){flush();if(code!==null){out.push('<pre><code>'+esc(code.join('\n'))+'</code></pre>');code=null;}else code=[];continue;}
    if(code!==null){code.push(line);continue;}
    if(!line.trim()){flush();continue;}
    const h=line.match(/^(#{1,4})\s+(.+)$/);if(h){flush();const level=Math.max(2,h[1].length);out.push(`<h${level}>${inline(h[2])}</h${level}>`);continue;}
    if(/^\s*([-*_])\1\1+\s*$/.test(line)){flush();out.push('<hr>');continue;}
    const li=line.match(/^\s*(?:([-*])|\d+\.)\s+(.+)$/);if(li){const type=li[1]?'ul':'ol';if(p.length||quote.length||(list.length&&type!==listType))flush();listType=type;list.push(li[2]);continue;}
    const q=line.match(/^>\s?(.*)$/);if(q){if(p.length||list.length)flush();quote.push(q[1]);continue;}
    if(list.length||quote.length)flush();p.push(line);
  }
  flush();if(code!==null)out.push('<pre><code>'+esc(code.join('\n'))+'</code></pre>');return out.join('\n');
}
export function postCard(post){return `<article class="post-card"><a href="/blog/${esc(post.slug)}"><div class="post-cover ${post.cover?'':'type-cover'}">${post.cover?`<img src="${esc(post.cover)}" alt="Artwork selected by Ralgo for ${esc(post.title)}" loading="lazy">`:'<span class="cover-symbol" aria-hidden="true">✳</span><span class="cover-words">Art / technology<br>The weekly briefing</span>'}</div><time class="post-date" datetime="${esc(post.date)}">${dateLabel(post.date)}</time><h2>${esc(post.title)}</h2>${post.excerpt?`<p>${esc(post.excerpt)}</p>`:''}<span class="underlink">Read the briefing <span>↗</span></span></a></article>`;}
export function article(post,preview=false){return `<header class="reading-head"><p class="eyebrow">${preview?'DRAFT PREVIEW':'ART & TECHNOLOGY / WEEKLY BRIEFING'}</p><h1>${esc(post.title||'Untitled briefing')}</h1>${post.excerpt?`<p class="reading-deck">${esc(post.excerpt)}</p>`:''}<div class="reading-byline"><span>By Ralgo</span><time datetime="${esc(post.date)}">${dateLabel(post.date)}</time><span>${Math.max(1,Math.ceil(post.body.split(/\s+/).length/220))} min read</span></div></header>${post.cover?`<figure class="reading-cover"><img src="${esc(post.cover)}" alt="Cover artwork selected by Ralgo"></figure>`:''}<div class="prose">${markdown(post.body)}</div>`;}
