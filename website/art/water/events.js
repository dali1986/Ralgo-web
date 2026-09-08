import { randomGenerator } from './simulation.js?v=38';
import { palettes, paletteNames, styleForSeed, familyNames, finishNames } from './style-seed.js?v=38';
import { confluenceState } from './encounters.js?v=38';
import { MATERIAL_NAMES, materialState, chooseMeeting } from './spectacles.js?v=38';
import { impactState, sprayParticle } from './splashes.js?v=38';

const TAU=Math.PI*2,clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const ease=x=>{x=clamp(x);return x*x*(3-2*x);};
const envelope=(age,duration)=>ease(age/3)*ease((duration-age)/3);
export const MAX_EVENT_SPRITES=512;
export const EVENT_KINDS=['lights','drizzle','rain','downpour','fish','colour','cascade','style','pebble','confluence','material'];
export const EVENT_SHORTCUTS=Object.freeze({...Object.fromEntries(EVENT_KINDS.slice(0,10).map((kind,i)=>[String((i+1)%10),kind])),t:'material'});
const labels={lights:'Dancing lights',drizzle:'Drizzle',rain:'Passing rain',downpour:'A downpour',fish:'A passing shoal',colour:'A colour tide',cascade:'Colours in procession',style:'A sea transforms',pebble:'A skipping stone',confluence:'The confluence'};
const trackFor=kind=>kind==='material'?'material':kind==='confluence'?'confluence':kind==='style'?'style':kind==='colour'||kind==='cascade'?'colour':kind==='fish'?'fish':'weather';
export const FISH_PROFILES=[
 {name:'Minnow cloud',min:90,max:160,size:[.004,.007],depth:.40,speed:.078,spread:.38},
 {name:'Streamlined shoal',min:45,max:95,size:[.009,.016],depth:.50,speed:.075,spread:.32},
 {name:'Reef school',min:18,max:48,size:[.016,.029],depth:.68,speed:.063,spread:.32},
 {name:'Ribbon school',min:10,max:28,size:[.028,.040],depth:.26,speed:.065,spread:.29},
 {name:'Lantern shoal',min:30,max:80,size:[.008,.019],depth:.48,speed:.071,spread:.40},
 {name:'Mixed shoal',min:24,max:120,size:[.005,.033],depth:.50,speed:.070,spread:.42}
];
export const FISH_COLOUR_STYLES=[
 ['Moon silver','74b7c9 a3d7dc d5eaf2'],
 ['Sun gold','f2b634 ed812c ffe89c'],
 ['Coral stripes','f65371 ff9973 ffc953'],
 ['Jewel spots','19b4b0 3676de c45dd4 df457b'],
 ['Neon','13dfd4 fe55bf c6e54f 5b99ff'],
 ['Ink and pearl','375681 965382 448f8c'],
 ['Festival','fc598f ffb63e 3dd9d4 8468df 72baff']
].map(([name,hex])=>({name,colours:hex.split(' ').map(c=>[0,2,4].map(i=>parseInt(c.slice(i,i+2),16)/255))}));
function take(bag,size,r){if(!bag.length)for(let i=0;i<size;i++)bag.push(i);return bag.splice(Math.floor(r()*bag.length),1)[0];}
function hsv(rgb){
 const [r,g,b]=rgb,max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min;
 let h=d===0?0:max===r?((g-b)/d+6)%6:max===g?(b-r)/d+2:(r-g)/d+4;
 return [h/6,max===0?0:d/max,max];
}
function rgb([h,s,v]){
 const k=n=>(n+h*6)%6,f=n=>v-v*s*Math.max(0,Math.min(k(n),4-k(n),1));
 return [f(5),f(3),f(1)];
}
function colourJourney(from,to,t){
 if(t<=0)return from;if(t>=1)return to;
 const a=hsv(from),b=hsv(to);
 if(a[1]<.06)a[0]=b[0];if(b[1]<.06)b[0]=a[0];
 const dh=((b[0]-a[0]+1.5)%1)-.5;
 return rgb([(a[0]+dh*t+1)%1,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t]);
}
function sample(array,o,x,y){
 const gx=clamp(x)*(o.width-1),gy=clamp(y)*(o.height-1),ix=Math.min(o.width-2,Math.floor(gx)),iy=Math.min(o.height-2,Math.floor(gy));
 const fx=gx-ix,fy=gy-iy,k=iy*o.width+ix,w=o.width;
 return (array[k]*(1-fx)+array[k+1]*fx)*(1-fy)+(array[k+w]*(1-fx)+array[k+w+1]*fx)*fy;
}

// Independent tracks share an active-playback clock. Rendering, pause,
// export and hidden tabs never advance it or consume event randomness.
export class SeaEvents {
 constructor(seed,ensemble){
  this.random=randomGenerator((seed^0x35A9E2D1)>>>0);this.ensemble=ensemble;
  this.baseStyles=new Float32Array(ensemble.packed.styles);
  this.styles=new Float32Array(this.baseStyles);this.nextStyles=new Float32Array(this.baseStyles);
  this.transition=new Float32Array([-1,0]);this.paletteIds=ensemble.members.map(m=>m.style.palette);
  this.styleClock=randomGenerator((seed^0x296FA185)>>>0);
  this.fishClock=randomGenerator((seed^0x49B17C63)>>>0);
  this.weatherClock=randomGenerator((seed^0x76DA142B)>>>0);
  this.confluenceClock=randomGenerator((seed^0x3CF76291)>>>0);
  this.confluenceRandom=randomGenerator((seed^0x61ED9A37)>>>0);
  this.materialClock=randomGenerator((seed^0x5AB71D03)>>>0);this.materialRandom=randomGenerator((seed^0x19CF738B)>>>0);
  this.materialBag=[];this.lastMaterial=-1;this.lastMaterialPoint=null;
  this.materialUniform=new Float32Array([-1,0,0,0]);this.materialSeas=new Int32Array([-1,-1,-1]);
  this.time=0;this.previousTime=0;
  this.nextStyleAt=6+this.styleClock()*14;this.nextCascadeAt=30;
  this.nextFishAt=5+this.fishClock()*7;this.nextWeatherAt=16+this.weatherClock()*14;
  this.nextConfluenceAt=60+this.confluenceClock()*30;this.motion=null;this.nextMotionAt=0;
  this.nextMaterialAt=48+this.materialClock()*36;
  this.bag=[];this.tracks={style:null,colour:null,fish:null,weather:null,confluence:null,material:null};this.handoffs={};
  this.serial=0;this.previousKind='';this.manualCount=0;
  this.fishProfiles=[];this.fishColours=[];
  this.spriteData=new Float32Array(MAX_EVENT_SPRITES*12);this.spriteCount=0;
 }
 takeKind(){
  if(!this.bag.length){
   this.bag=['lights','drizzle','rain','downpour','pebble'];
   for(let i=this.bag.length-1;i>0;i--){const j=Math.floor(this.random()*(i+1));[this.bag[i],this.bag[j]]=[this.bag[j],this.bag[i]];}
   if(this.bag.at(-1)===this.previousKind)[this.bag[0],this.bag[this.bag.length-1]]=[this.bag.at(-1),this.bag[0]];
  }
  return this.bag.pop();
 }
 trigger(kind,time,ocean){
  if(!EVENT_KINDS.includes(kind))return null;
  this.manualCount++;
  return this.cue(kind,time,ocean);
 }
 cue(kind,time,ocean){
  const track=trackFor(kind),e=this.tracks[track];
  if(!e){const started=this.start(kind,time,ocean);return {label:started.label,waiting:false};}
  // Let an existing confluence open naturally. Repeated cues cannot snap
  // the material mapping back or stack a second vortex over the first.
  if(track==='confluence')return {label:labels[kind]+' is unfolding',waiting:false};
  if(track==='material')return {label:e.label+' is unfolding',waiting:false};
  // Only the matching track hands over. Fish can continue through a change
  // of sea structure, colour or weather. Repeated keys replace the same cue.
  if(!this.handoffs[track])this.handoffs[track]={start:time,age:clamp(time-e.start,0,e.duration),duration:.8,kind};
  else if(!this.handoffs[track].scheduled)this.handoffs[track].kind=kind;
  else return {label:labels[this.handoffs[track].kind],waiting:true};
  return {label:labels[kind],waiting:true};
 }
 start(kind,time,ocean){
  if(kind==='confluence')return this.startConfluence(time,ocean);
  if(kind==='material')return this.startMaterial(time,ocean);
  const r=this.random,e={kind,label:labels[kind],start:time,duration:18+r()*8,phase:r()*TAU,id:++this.serial,hit:0};
  const ranked=Array.from({length:this.ensemble.count},(_,i)=>i).sort((a,b)=>ocean.pigmentMass[b]-ocean.pigmentMass[a]);
  e.sea=kind==='style'?Math.floor(r()*this.ensemble.count):ranked[Math.floor(r()*Math.min(3,ranked.length))];
  const row=e.sea*60;
  e.colour=[0,1,2].map(j=>this.baseStyles[row+44+j]*.65+this.baseStyles[row+56+j]*.35);
  // Saturated accents remain legible against pale water; pearl is reserved
  // for the small bright cores, rather than washing out the whole event.
  e.accent=Array.from(this.baseStyles.subarray(row+48,row+51));
  e.cool=Array.from(this.baseStyles.subarray(row+44,row+47));
  if(kind==='lights'){
   e.lights=Array.from({length:20+Math.floor(r()*13)},()=>({phase:r()*TAU,orbit:.10+r()*.25,size:.004+r()*.006,rate:.12+r()*.12}));
  }else if(['drizzle','rain','downpour'].includes(kind)){
   const level=['drizzle','rain','downpour'].indexOf(kind);
   e.duration=16+r()*8;e.level=level;e.drops=[];
   const rate=[8,22,48][level],strength=[.065,.12,.21][level];
   for(let t=.6;t<e.duration-3;t+=1/rate){
    if(r()>envelope(t,e.duration-2))continue;
    e.drops.push({at:t,x:.035+r()*.93,y:.035+r()*.93,strength:strength*(.65+r()*.7),radius:.016+r()*.012});
   }
  }else if(kind==='pebble'){
   e.duration=14;e.drops=[];const count=6+Math.floor(r()*3),right=r()<.5;
   const x0=right?.10:.90,y0=.28+r()*.40,dy=(r()-.5)*.25;
   let distance=0,at=1.0;const total=(1-Math.pow(.80,count-1))/(1-.80);
   for(let i=0;i<count;i++){
    const along=distance/total;
    e.drops.push({at,x:x0+(right?1:-1)*.80*along,y:y0+dy*along+Math.sin(along*Math.PI)*.05,strength:1.15*Math.pow(.84,i),radius:.040*Math.pow(.94,i)});
    distance+=Math.pow(.80,i);at+=1.55*Math.pow(.86,i);
   }
  }else if(kind==='fish'){
   e.profile=take(this.fishProfiles,FISH_PROFILES.length,r);const profile=FISH_PROFILES[e.profile];
   e.colourStyle=take(this.fishColours,FISH_COLOUR_STYLES.length,r);const scheme=FISH_COLOUR_STYLES[e.colourStyle];
   e.duration=22+r()*4;e.direction=r()<.5?1:-1;e.lane=.29+r()*.42;e.lastWake=0;
   e.cruise=profile.speed*(.94+r()*.12);
   const count=profile.min+Math.floor(r()*(profile.max-profile.min+1)),baseSize=profile.size[0]+r()*(profile.size[1]-profile.size[0]);
   e.fish=Array.from({length:count},()=>{
    const x=e.direction>0?-.04-r()*.14:1.04+r()*.14,y=e.lane+(r()-.5)*profile.spread;
    const size=e.profile===5?profile.size[0]+Math.pow(r(),1.4)*(profile.size[1]-profile.size[0]):baseSize*(.78+r()*.44);
    const swatch=scheme.colours[Math.floor(r()*scheme.colours.length)],tint=.90+r()*.16;
    return {x,y,px:x,py:y,vx:e.direction*e.cruise*.8,vy:0,panic:0,lane:y-e.lane,phase:r()*TAU,size,depth:profile.depth*(.90+r()*.20),colour:swatch.map(c=>clamp(c*tint)),turn:e.direction>0?0:Math.PI,previousTurn:e.direction>0?0:Math.PI};
   });
   e.label=scheme.name+' · '+count+' fish';
  }else if(kind==='colour'||kind==='cascade'){
   const indices=[e.sea],pool=ranked.filter(i=>i!==e.sea);
   if(kind==='cascade'){
    const count=Math.min(ranked.length,3+Math.floor(r()*8));
    while(indices.length<count)indices.push(pool.splice(Math.floor(Math.pow(r(),1.5)*pool.length),1)[0]);
    indices.sort((a,b)=>this.ensemble.members[a].source[0]-this.ensemble.members[b].source[0]);
   }
   e.changes=indices.map((sea,i)=>{
    let palette=Math.floor(r()*(palettes.length-1));if(palette>=this.paletteIds[sea])palette++;
    const from=Array.from({length:6},(_,j)=>Array.from(this.baseStyles.subarray(sea*60+(9+j)*4,sea*60+(9+j)*4+3)));
    const to=Array.from({length:6},(_,j)=>Array.from(palettes[palette].subarray(j*3,j*3+3)));
    return {sea,palette,from,to,delay:i*.8,duration:7+r()*4};
   });
   e.duration=Math.max(...e.changes.map(c=>c.delay+c.duration))+1;
  }else if(kind==='style'){
   const current=this.baseStyles[row+4];let family=Math.floor(r()*(familyNames.length-1));if(family>=current)family++;
   const style=styleForSeed(1+Math.floor(r()*2147483646),{family,palette:this.paletteIds[e.sea],finish:this.baseStyles[row+16]});
   style.form[1]=.72+style.form[1]*.24;style.gesture[0]*=.24;style.gesture[1]*=.24;
   e.target=this.baseStyles.slice(row,row+60);
   ['form','gesture','pigment','material','structure','phenomenon'].forEach((key,i)=>e.target.set(style[key],(i+1)*4));
   e.duration=4+r()*1.5;e.family=family;e.label=familyNames[family]+' emerges';
  }
  const track=trackFor(kind);e.speed=track==='weather'?2:1;
  e.duration/=e.speed;this.tracks[track]=e;
  if(track==='style')this.nextStyleAt=time+6+this.styleClock()*14;
  if(track==='fish')this.nextFishAt=time+e.duration+3+this.fishClock()*6;
  if(track==='weather'){this.previousKind=kind;this.nextWeatherAt=time+e.duration+12+this.weatherClock()*20;}
  return e;
 }
 startConfluence(time,ocean){
  const r=this.confluenceRandom,count=Math.min(this.ensemble.count,3+Math.floor(r()*3));
  const motion=ocean.measureMotion?.(),pool=this.ensemble.members.map((_,i)=>i);
  const participants=[],origins=[];
  // Prefer substantial visible seas, with enough variation that successive
  // encounters are not always led by the same dominant pigment.
  while(participants.length<count){
   const weights=pool.map(i=>Math.sqrt(Math.max(.0001,motion?.[i*4+3]??ocean.pigmentMass[i])));
   let ticket=r()*weights.reduce((a,b)=>a+b,0),index=0;
   while(index<weights.length-1&&ticket>weights[index])ticket-=weights[index++];
   const sea=pool.splice(index,1)[0];participants.push(sea);
   origins.push(motion?[motion[sea*4],motion[sea*4+1]]:this.ensemble.members[sea].source.slice(0,2));
  }
  const cx=.44+r()*.12,cy=.44+r()*.12;
  const e={kind:'confluence',label:labels.confluence,start:time,duration:22,speed:1,id:++this.serial,
   sea:participants[0],participants,origins,cx,cy,radius:.96*Math.min(cx,cy,1-cx,1-cy),spin:r()<.5?-1:1,phase:r()*TAU};
  this.tracks.confluence=e;this.nextConfluenceAt=time+60+this.confluenceClock()*30;
  ocean.setConfluence?.(e);return e;
 }
 startMaterial(time,ocean){
  const r=this.materialRandom;
  if(!this.materialBag.length)this.materialBag=[0,1,2];
  // Use every finish, while avoiding a repeat across successive bags.
  const eligible=this.materialBag.filter(finish=>finish!==this.lastMaterial);
  const finish=eligible[Math.floor(r()*eligible.length)];this.materialBag.splice(this.materialBag.indexOf(finish),1);
  const point=chooseMeeting(ocean,r,[],this.lastMaterialPoint);
  const participants=point.seas.slice(0,Math.min(3,this.ensemble.count));
  const e={kind:'material',label:MATERIAL_NAMES[finish],finish,participants,sea:participants[0],
   start:time,duration:26+r()*6,speed:1,phase:r()*TAU,id:++this.serial,focus:[point.x,point.y]};
  this.lastMaterial=finish;this.lastMaterialPoint=e.focus;this.tracks.material=e;
  this.nextMaterialAt=time+120+this.materialClock()*90;return e;
 }
 finish(e){
  if(e.changes)for(const c of e.changes){
   c.to.forEach((rgb,j)=>this.baseStyles.set(rgb,c.sea*60+(9+j)*4));this.paletteIds[c.sea]=c.palette;
  }
  // Structure changes must never restore the palette captured at their start:
  // a colour cascade may be changing this very same sea at the same time.
  if(e.target)this.baseStyles.set(e.target.subarray(4,28),e.sea*60+4);
 }
 impulse(o,d,dx=0,dy=0,kind='wake'){return o.disturb(d.x,d.y,{strength:d.strength,radius:d.radius,dx,dy,human:false,kind});}
 rainColour(o,d){
  const colour=[0,0,0];let weight=0;
  for(let i=0;i<o.seas.length;i++){
   const amount=Math.max(0,sample(o.dyes[i],o,d.x,d.y));weight+=amount;
   for(let j=0;j<3;j++){const c=this.baseStyles[i*60+44+j];colour[j]+=c*c*amount;}
  }
  return colour.map(c=>Math.sqrt(c/Math.max(.00001,weight)));
 }
 displayTime(blend=1){return this.previousTime+(this.time-this.previousTime)*clamp(blend);}
 transformationAge(e,track,time){
  const h=this.handoffs[track];
  return h?h.age+(e.duration-h.age)*ease((time-h.start)/h.duration):clamp(time-e.start,0,e.duration);
 }
 step(o,dt=1/30){
  this.previousTime=this.time;this.time+=dt;const time=this.time,epsilon=1e-8;
  o.beginEncounters?.(time,dt);
  // A manual colour cue finishes smoothly before the next 30-second beat.
  const colour=this.tracks.colour;
  if(colour&&time>=this.nextCascadeAt-.8&&colour.start+colour.duration>this.nextCascadeAt&&!this.handoffs.colour?.scheduled){
   this.handoffs.colour={start:time,age:this.transformationAge(colour,'colour',time),duration:Math.max(epsilon,this.nextCascadeAt-time),kind:'cascade',scheduled:this.nextCascadeAt};
  }
  for(const track of Object.keys(this.tracks)){
   const e=this.tracks[track],handoff=this.handoffs[track];if(!e)continue;
   if(handoff&&time+epsilon>=handoff.start+handoff.duration){
    this.finish(e);this.tracks[track]=null;delete this.handoffs[track];
    if(handoff.scheduled){this.start('cascade',handoff.scheduled,o);this.nextCascadeAt=Math.max(this.nextCascadeAt,handoff.scheduled+30);}
    else this.start(handoff.kind,time,o);
   }else if(!handoff&&time+epsilon>=e.start+e.duration){this.finish(e);this.tracks[track]=null;}
  }
  if(time+epsilon>=this.nextStyleAt){this.cue('style',time,o);if(this.handoffs.style)this.nextStyleAt=Infinity;}
  if(time+epsilon>=this.nextCascadeAt){this.cue('cascade',this.nextCascadeAt,o);this.nextCascadeAt+=30;}
  if(!this.tracks.fish&&time+epsilon>=this.nextFishAt)this.start('fish',time,o);
  if(!this.tracks.weather&&time+epsilon>=this.nextWeatherAt)this.start(this.takeKind(),time,o);
  if(!this.tracks.confluence&&time+epsilon>=this.nextConfluenceAt)this.start('confluence',time,o);
  if(!this.tracks.material&&time+epsilon>=this.nextMaterialAt)this.start('material',time,o);
  o.setConfluence?.(this.tracks.confluence);
  for(const [track,e] of Object.entries(this.tracks)){
   if(!e)continue;const age=(time-e.start)*e.speed;
   if(e.drops&&!this.handoffs[track])while(e.hit<e.drops.length&&e.drops[e.hit].at<=age){
    const d=e.drops[e.hit],next=e.drops[Math.min(e.hit+1,e.drops.length-1)],previous=e.drops[Math.max(0,e.hit-1)];
    const dx=next.x-previous.x,dy=next.y-previous.y,length=Math.hypot(dx,dy)||1;
    this.impulse(o,d,e.kind==='pebble'?dx/length*.012:0,e.kind==='pebble'?dy/length*.012:0,e.kind);
    if(o.dyes?.[0])d.colour=this.rainColour(o,d);
    e.hit++;
   }
   if(e.fish)this.moveFish(e,o,age,dt);
  }
  if(time>=this.nextMotionAt){this.motion=o.measureMotion?.()||null;this.nextMotionAt=time+.25;}
 }
 moveFish(e,o,age,dt){
  const fish=e.fish,aspect=o.rippleAspect;
  const centre=fish.reduce((c,f)=>[c[0]+f.x/ fish.length,c[1]+f.y/fish.length],[0,0]);
  // Read neighbours from the previous state; updates do not depend on order.
  const before=fish.map(f=>({x:f.x,y:f.y,vx:f.vx,vy:f.vy,size:f.size}));
  fish.forEach((f,i)=>{
   f.px=f.x;f.py=f.y;f.previousTurn=f.turn;
   let ax=0,ay=0,alignX=0,alignY=0,neighbours=0;
   before.forEach((g,j)=>{if(i===j)return;const dx=(f.x-g.x)*aspect,dy=f.y-g.y,d2=dx*dx+dy*dy;
    const separation=clamp((f.size+g.size)*.9,.012,.06),radius=Math.max(.064,separation*1.5);
    if(d2<radius*radius){neighbours++;alignX+=g.vx;alignY+=g.vy;}
    if(d2<separation*separation&&d2>.000001){const s=1-d2/(separation*separation);ax+=dx*s*.65;ay+=dy*s*.65;}
   });
   const flowX=sample(o.u,o,f.x,f.y)/(o.width-1)*30,flowY=sample(o.v,o,f.x,f.y)/(o.height-1)*30;
   const eps=.018,gx=Math.abs(sample(o.ripple,o,f.x+eps,f.y))-Math.abs(sample(o.ripple,o,f.x-eps,f.y)),gy=Math.abs(sample(o.ripple,o,f.x,f.y+eps))-Math.abs(sample(o.ripple,o,f.x,f.y-eps));
   f.panic=(f.panic||0)*Math.exp(-dt/2.3);
   if(o.touch){
    // Look ahead before reaching a held finger, splitting into two lanes.
    const dx=(f.x+f.vx*.65-o.touch.x)*aspect,dy=f.y-o.touch.y,d=Math.hypot(dx,dy),radius=.12+f.size;
    if(d<radius){
     const near=1-d/radius,side=Math.abs(dy)>.008?Math.sign(dy):(f.lane>=0?1:-1);
     ax+=dx/Math.max(.012,d)*near*.34/aspect;
     ay+=(dy/Math.max(.012,d)*.25+side*.40)*near;f.panic=Math.max(f.panic,near*.8);
    }
   }
   for(const impact of o.impacts||[]){
    const since=Math.max(0,(o.encounterTime??this.time)-impact.at),dx=(f.x-impact.x)*aspect,dy=f.y-impact.y;
    const d=Math.hypot(dx,dy),radius=.16+Math.min(1.2,impact.strength)*.08,near=clamp(1-d/radius)*Math.exp(-since/1.1);
    if(near>0){
     const angle=d>.002?Math.atan2(dy,dx):f.phase,push=near*Math.min(1.4,impact.strength)*.95;
     ax+=Math.cos(angle)*push/aspect;ay+=Math.sin(angle)*push;f.panic=Math.max(f.panic,near);
    }
   }
   // Gesture trails outlive the finger. Fish follow their direction, then
   // gradually resume the shoal's alignment and original lane.
   if(o.wakeX){
    ax+=sample(o.wakeX,o,f.x,f.y)/(o.width-1)*30*1.7;
    ay+=sample(o.wakeY,o,f.x,f.y)/(o.height-1)*30*1.7;
   }
   const targetY=e.lane+f.lane+Math.sin(age*.28+e.phase)*.065,cohesion=1-f.panic*.75;
   ax+=(e.direction*e.cruise-f.vx)*.45*cohesion+(centre[0]-f.x)*.035*cohesion+flowX*.16-gx*.3;
   ay+=((targetY-f.y)*.24-f.vy*.85)*cohesion+flowY*.16-gy*.3;
   if(neighbours){ax+=(alignX/neighbours-f.vx)*.35*cohesion;ay+=(alignY/neighbours-f.vy)*.35*cohesion;}
   // Soft vertical turn-back keeps startled visitors inside the water.
   ay+=clamp(.08-f.y,0,.5)*1.2-clamp(f.y-.92,0,.5)*1.2;
   f.vx=clamp(f.vx+ax*dt,-.12-f.panic*.10,.12+f.panic*.10);
   f.vy=clamp(f.vy+ay*dt,-.075-f.panic*.12,.075+f.panic*.12);
   f.x+=f.vx*dt;f.y+=f.vy*dt;f.turn=Math.atan2(f.vy,f.vx*aspect);
  });
  e.activity=fish.reduce((sum,f)=>sum+f.panic,0)/fish.length;
  if(age-e.lastWake>.65){
   e.lastWake=age;for(let i=0;i<fish.length;i+=Math.ceil(fish.length/8)){
    const f=fish[i];this.impulse(o,{x:f.x,y:f.y,strength:.045*envelope(age,e.duration)*clamp(f.size/.015,.45,1.6),radius:.016},f.vx*.04,f.vy*.04);
   }
  }
 }
 add(x,y,w,h,angle,kind,alpha,phase,colour,finish=0){
  if(this.spriteCount>=MAX_EVENT_SPRITES||alpha<=.001)return;
  this.spriteData.set([x,y,w,h,angle,kind,clamp(alpha),phase,...colour,finish],this.spriteCount++*12);
 }
 snapshot(time,o,blend=1){
  this.styles.set(this.baseStyles);this.transition.set([-1,0]);this.spriteCount=0;
  this.materialUniform.set(materialState(this.tracks.material,time));this.materialSeas.fill(-1);
  if(this.tracks.material)this.materialSeas.set(this.tracks.material.participants);
  const colour=this.tracks.colour;
  if(colour)for(const c of colour.changes){
   const t=ease((this.transformationAge(colour,'colour',time)-c.delay)/c.duration);
   c.to.forEach((to,j)=>this.styles.set(colourJourney(c.from[j],to,t),c.sea*60+(9+j)*4));
  }
  // Both sides of a structural morph see exactly the same live palette.
  this.nextStyles.set(this.styles);const structure=this.tracks.style;
  if(structure){
   this.nextStyles.set(structure.target.subarray(4,28),structure.sea*60+4);
   this.transition.set([structure.sea,ease(this.transformationAge(structure,'style',time)/structure.duration)]);
  }
  for(const track of ['fish','weather']){
  const e=this.tracks[track];if(!e)continue;
  const age=clamp(time-e.start,0,e.duration)*e.speed,duration=e.duration*e.speed,fade=envelope(age,duration);
  const handoff=this.handoffs[track],firstSprite=this.spriteCount;
  if(e.lights)e.lights.forEach((p,i)=>{
   for(let trail=3;trail>=0;trail--){
    const t=age-trail*.22,a=p.phase+t*p.rate;
    const x=.5+Math.cos(a)*p.orbit+Math.sin(t*.17+e.phase)*.11,y=.5+Math.sin(a*1.7+e.phase)*p.orbit*.65;
    const wave=sample(o.seas[e.sea].wave,o,x,y),current=sample(o.u,o,x,y);
    const lightFade=ease(age/1.2)*ease((duration-age)/2);
    const opacity=lightFade*(.91+.12*Math.sin(age*.8+p.phase)+clamp(Math.abs(wave)*2,0,.18))*Math.pow(.56,trail);
    const colour=i%3===0?e.accent:e.cool;
    this.add(x+current*.02,y,p.size*4.2,p.size*4.2,age*.12+p.phase,0,opacity,p.phase,colour);
   }
  });
  if(e.fish)for(const f of e.fish){
   const x=f.px+(f.x-f.px)*blend,y=f.py+(f.y-f.py)*blend;
   const edge=ease((x+.06)/.08)*ease((1.06-x)/.08);
   let turn=f.turn-f.previousTurn;turn=Math.atan2(Math.sin(turn),Math.cos(turn));
   this.add(x,y,f.size,f.size*f.depth,f.previousTurn+turn*blend,2,fade*edge*.96,age*7+f.phase+f.panic*.9,f.colour,e.colourStyle);
  }
  if(e.drops)e.drops.forEach((d,index)=>{
   const since=age-d.at;
   const aspect=o.rippleAspect;
   if(e.kind!=='pebble'&&since>-.42&&since<0){
    const p=1+since/.42,fall=1-p*p,streak=[.010,.016,.023][e.level];
    this.add(d.x+(fall*.028+streak*.14)/aspect,d.y+fall*.19+streak*.99,[.0015,.0021,.0027][e.level],streak,-.14,4,ease(p/.12)*.93,p,e.cool);
   }
   const pebble=e.kind==='pebble',splash=impactState(d,index,pebble,e.level||0,since);
   if(splash){
    const pigment=d.colour||e.cool,next=e.drops[Math.min(index+1,e.drops.length-1)],previous=e.drops[Math.max(0,index-1)];
    const heading=Math.atan2(next.y-previous.y,(next.x-previous.x)*aspect);
    this.add(d.x,d.y,splash.radius,splash.radius*.86,0,1,splash.ringAlpha,since,pigment,index*.71);
    this.add(d.x,d.y,splash.crownSize,splash.crownSize*.64,pebble?heading:0,5,splash.crownAlpha,splash.crownAge,pigment,index*.71);
    for(let j=0;j<splash.count;j++){
     const particle=sprayParticle(splash,j,aspect,heading);if(!particle)continue;
     this.add(d.x+particle.dx,d.y+particle.dy,particle.size*.70,particle.size*1.45,particle.angle,6,particle.alpha*splash.force,particle.phase,j%3===0?e.accent:pigment);
    }
   }
  });
  if(e.kind==='pebble'){
   const hits=e.drops;
   if(age<hits[0].at){
    const first=hits[0],direction=Math.sign(hits[1].x-first.x),p=age/first.at;
    this.add(first.x-direction*(1-p)*.13,first.y+Math.sin((1-p)*Math.PI*.5)*.11,.010,.0065,age*5,3,ease(p/.12),0,e.accent);
   }
   for(let i=0;i<hits.length-1;i++)if(age>=hits[i].at&&age<hits[i+1].at){
    const a=hits[i],b=hits[i+1],p=(age-a.at)/(b.at-a.at);
    for(let trail=2;trail>=0;trail--){
     const u=Math.max(0,p-trail*.035),hop=4*u*(1-u)*.075*Math.pow(.80,i),size=.010*Math.pow(.97,i);
     this.add(a.x+(b.x-a.x)*u,a.y+(b.y-a.y)*u+hop,size,size*.65,age*5,3,Math.pow(.28,trail),0,e.accent);
    }break;
   }
  }
  if(handoff)for(let i=firstSprite;i<this.spriteCount;i++)this.spriteData[i*12+6]*=1-ease((time-handoff.start)/handoff.duration);
  }
 }
 get label(){return Object.values(this.tracks).filter(Boolean).map(e=>e.kind==='confluence'?['Seas gathering','Seas intertwining','The water opens'][confluenceState(e,this.time).phase]+' · '+e.participants.length+' seas':e.label).join(' · ');}
 get description(){return this.ensemble.members.map((m,i)=>`${familyNames[this.baseStyles[i*60+4]]} / ${paletteNames[this.paletteIds[i]]} / ${m.thicknessName} / ${finishNames[this.baseStyles[i*60+16]]}`).join(' · ');}
}
