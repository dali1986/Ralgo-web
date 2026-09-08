(() => {
  'use strict';
  // The model supplies geometry only. This format is shared by the server and
  // renderer; no generated scripts, markup, URLs, or drawing commands execute.
  const number={type:'number'};
  const vector={type:'array',items:number,minItems:2,maxItems:2};
  const object=properties=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
  const motion=object({pivot:vector,drift:vector,swing:number,speed:number,phase:number});
  const schema=object({
    title:{type:'string'},caption:{type:'string'},
    figures:{type:'array',minItems:1,maxItems:4,items:object({motion,parts:{type:'array',minItems:1,maxItems:18,items:object({
      kind:{type:'string',enum:['shape','ribbon','cutout']},
      points:{type:'array',minItems:4,maxItems:25,items:vector},width:number,motion
    })}})}
  });
  function validate(value){
    const fail=()=>{throw new Error('Invalid flame scene');};
    const obj=(v,keys)=>{
      if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).length!==keys.length||keys.some(k=>!Object.hasOwn(v,k)))fail();
    };
    const num=(v,min,max)=>{if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)fail();return v;};
    const pair=(v,x0,x1,y0,y1)=>{
      if(!Array.isArray(v)||v.length!==2)fail();
      return [num(v[0],x0,x1),num(v[1],y0,y1)];
    };
    const text=(v,max)=>{
      if(typeof v!=='string'||!v.trim()||v.length>max||/[<>\u0000-\u001f\u007f]/u.test(v))fail();return v.trim();
    };
    const movement=v=>{
      obj(v,['pivot','drift','swing','speed','phase']);
      return {pivot:pair(v.pivot,-1.05,1.05,.02,1.05),drift:pair(v.drift,0,.08,0,.035),swing:num(v.swing,0,.26),speed:num(v.speed,.15,2.5),phase:num(v.phase,0,6.284)};
    };
    obj(value,['title','caption','figures']);
    const result={title:text(value.title,64),caption:text(value.caption,140),figures:[]};
    if(!Array.isArray(value.figures)||value.figures.length<1||value.figures.length>4)fail();
    let total=0,low=0,solid=0,points=0;
    for(const figure of value.figures){
      obj(figure,['motion','parts']);
      if(!Array.isArray(figure.parts)||!figure.parts.length||figure.parts.length>18)fail();
      const f={motion:movement(figure.motion),parts:[]};
      let rooted=false,visible=false;
      for(const part of figure.parts){
        obj(part,['kind','points','width','motion']);
        if(!['shape','ribbon','cutout'].includes(part.kind)||++total>40)fail();
        if(!Array.isArray(part.points)||part.points.length<4||part.points.length>25||(part.points.length-1)%3)fail();
        points+=part.points.length;if(points>440)fail();
        const p={kind:part.kind,points:part.points.map(v=>pair(v,-1,1,.04,1.05)),width:num(part.width,.008,.075),motion:movement(part.motion)};
        if(p.kind!=='cutout'){
          visible=true;solid+=p.points.length;
          low+=p.points.filter(v=>v[1]<.72).length;
          if(p.points.some(v=>v[1]<=.20))rooted=true;
          // Wide, flat ceilings of flame cannot be fed naturally by the coals.
          const xs=p.points.map(v=>v[0]),ys=p.points.map(v=>v[1]);
          if(Math.min(...ys)>.65&&Math.max(...xs)-Math.min(...xs)>.65)fail();
        }
        f.parts.push(p);
      }
      if(!visible||!rooted)fail();
      result.figures.push(f);
    }
    if(low/solid<.62)fail();
    return result;
  }
  function transform(c,m,t,strength){
    const phase=t*m.speed+m.phase;
    c.translate(m.pivot[0]+Math.sin(phase)*m.drift[0]*strength,m.pivot[1]+Math.sin(phase*.83)*m.drift[1]*strength);
    c.rotate(Math.sin(phase)*m.swing*strength);
    c.translate(-m.pivot[0],-m.pivot[1]);
  }
  function paint(c,scene,t,shot){
    const strength=(.35+.65*shot.entry)*(1-.6*shot.out);
    for(const figure of scene.figures){
      c.save();transform(c,figure.motion,t,strength);
      // Cutouts come last so small gaps survive adjacent body parts.
      for(const negative of [false,true])for(const part of figure.parts){
        if((part.kind==='cutout')!==negative)continue;
        c.save();transform(c,part.motion,t,strength);
        c.globalCompositeOperation=negative?'destination-out':'source-over';
        c.beginPath();c.moveTo(...part.points[0]);
        for(let i=1;i<part.points.length;i+=3)c.bezierCurveTo(...part.points[i],...part.points[i+1],...part.points[i+2]);
        if(part.kind==='ribbon'){c.lineWidth=part.width;c.stroke();}
        else{c.closePath();c.fill();}
        c.restore();
      }
      c.restore();
    }
  }
  globalThis.PromptScene=Object.freeze({schema,validate,paint});
})();
