(() => {
  'use strict';
  const MAX_CHARACTERS=60, FONT='900 180px Arial, Helvetica, sans-serif', MAX_WIDTH=940;
  const TIMING=Object.freeze({first:8,page:6,fade:3,entry:1.6,ignition:1});
  const clamp=x=>Math.max(0,Math.min(1,x));
  const smooth=(a,b,x)=>{const v=clamp((x-a)/(b-a));return v*v*(3-2*v);};
  const segmenter=typeof Intl.Segmenter==='function'?new Intl.Segmenter(undefined,{granularity:'grapheme'}):null;
  const characters=text=>segmenter?Array.from(segmenter.segment(text),v=>v.segment):Array.from(text);
  function normalize(value){
    const text=String(value??'').normalize('NFC').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B\u200E\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g,'').replace(/\s+/g,' ').trim();
    if(!/[\p{L}\p{N}\p{P}\p{S}]/u.test(text))throw new Error('Write a word or a short message for the fire.');
    if(characters(text).length>MAX_CHARACTERS)throw new Error('Keep your message to 60 characters or fewer.');
    return text;
  }
  function wrap(text,measure){
    const words=[];
    for(const word of text.split(' ')){
      let part='';
      for(const char of characters(word)){
        if(part&&measure(part+char)>MAX_WIDTH){words.push(part);part='';}
        part+=char;
      }
      if(part)words.push(part);
    }
    const pages=[];let line='';
    for(const word of words){
      const next=line?line+' '+word:word;
      if(line&&measure(next)>MAX_WIDTH){pages.push(line);line=word;}else line=next;
    }
    if(line)pages.push(line);
    return pages;
  }
  function create(value){
    const text=normalize(value),probe=document.createElement('canvas').getContext('2d');
    probe.font=FONT;
    const pages=wrap(text.toLocaleUpperCase(),s=>probe.measureText(s).width).map(line=>{
      const metrics=probe.measureText(line),pad=12;
      const left=Math.max(0,metrics.actualBoundingBoxLeft||0);
      const right=Math.max(metrics.width,metrics.actualBoundingBoxRight||0);
      const ascent=metrics.actualBoundingBoxAscent||140,descent=Math.max(0,metrics.actualBoundingBoxDescent||0);
      const canvas=document.createElement('canvas');
      canvas.width=Math.ceil(left+right+pad*2);canvas.height=Math.ceil(ascent+descent+pad*2);
      const ink=canvas.getContext('2d');ink.font=FONT;ink.textAlign='left';ink.textBaseline='alphabetic';
      ink.fillStyle='#fff';ink.strokeStyle='#fff';ink.lineWidth=2.5;ink.lineJoin='round';
      ink.strokeText(line,pad+left,pad+ascent);ink.fillText(line,pad+left,pad+ascent);
      // Flatten even colour emoji to a white fuel guide. This is never composited
      // onto the visible picture; the shared fire shader supplies every colour.
      ink.globalCompositeOperation='source-in';ink.fillRect(0,0,canvas.width,canvas.height);
      const scale=Math.min(1.88/(left+right),.55/(ascent+descent));
      return {canvas,line,width:canvas.width*scale,height:canvas.height*scale,padding:pad*scale};
    });
    const duration=TIMING.first+(pages.length-1)*TIMING.page+TIMING.fade;
    function frame(age){
      const index=age<TIMING.first?0:Math.min(pages.length-1,1+Math.floor((age-TIMING.first)/TIMING.page));
      const start=index===0?0:TIMING.first+(index-1)*TIMING.page;
      const end=index===pages.length-1?duration:index===0?TIMING.first:start+TIMING.page;
      const local=age-start;
      const reveal=smooth(index===0?0:.12,index===0?1.35:.9,local);
      const fade=index===pages.length-1?1:1-smooth(end-.8,end,age);
      return {index,page:pages[index],reveal,opacity:reveal*fade,local};
    }
    function paint(c,age){
      const {page,reveal,opacity,local}=frame(age);
      if(opacity<=0)return;
      const drift=Math.sin(age*.68)*.010+Math.sin(age*1.31)*.004;
      const lift=Math.sin(age*.91)*.007+(1-reveal)*-.055;
      const left=-page.width/2+drift,bottom=.24-page.padding+lift;
      c.save();c.globalAlpha=opacity;
      // Narrow, overlapping vertical pieces let stems breathe independently.
      // The thermal field then rolls and sheds their edges into ordinary fire.
      const step=12;
      for(let x=0;x<page.canvas.width;x+=step){
        const width=Math.min(step+1,page.canvas.width-x),u=x/page.canvas.width;
        const wave=Math.sin(u*11-age*1.05)*.006+Math.sin(u*27-age*2.2)*.003;
        const growth=reveal*(.985+.015*Math.sin(u*16+local));
        c.save();c.translate(left+u*page.width,bottom+wave+page.height*growth);c.scale(1,-1);
        c.drawImage(page.canvas,x,0,width,page.canvas.height,0,0,width/page.canvas.width*page.width,page.height*growth);
        c.restore();
      }
      c.restore();
    }
    return {text,pages,duration,frame,paint};
  }
  globalThis.FireText={MAX_CHARACTERS,TIMING,characters,normalize,wrap,create};
})();
