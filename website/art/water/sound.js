// A chamber score for moving pigment. Every sound is a finite, struck note;
// no looping sources, beds, sustained oscillators, or feedback/reverb network.
const TAU=Math.PI*2,clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
function random(seed){let s=seed>>>0;return()=>{s+=0x6D2B79F5;let t=s;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
const hash=(seed,a=0,b=0)=>random((seed^Math.imul(a+1,0x45d9f3b)^Math.imul(b+1,0x27d4eb2d))>>>0)();
const mod=(n,m)=>(n%m+m)%m;
export const VOICES=Object.freeze({
 water:{length:1.12,decay:.25,partials:[[1,1],[2,.23],[3,.07]],bend:.010},
 felt:{length:1.65,decay:.40,partials:[[1,1],[2,.32],[3,.11],[4,.045]]},
 wood:{length:.83,decay:.19,partials:[[1,1],[3,.10],[6,.025]]},
 glass:{length:1.70,decay:.38,partials:[[1,1],[2,.18],[3,.08],[4,.025]]},
 harp:{length:1.50,decay:.33,partials:[[1,1],[2,.36],[3,.19],[4,.09],[5,.03]]},
 porcelain:{length:1.02,decay:.22,partials:[[1,1],[2,.16],[4,.03]]},
 droplet:{length:.38,decay:.075,partials:[[1,1],[2,.08]],bend:.08},
 patter:{length:.16,decay:.027,partials:[[1,.3]],noise:.7},
 stone:{length:.31,decay:.055,partials:[[1,1],[3,.12]],noise:.18}
});
const seaVoices=['water','felt','harp','wood','porcelain','glass'];
const fishVoices=['glass','wood','harp','porcelain','water','felt','harp'];
const modes=[[0,2,4,5,7,9,11]];
const progressions=[[0,5,3,4],[0,3,5,4],[0,5,1,4]];
const rhythms=[[0,1,3,4],[0,2,3,5],[0,1,2,4,5],[0,2,4]];

// Deterministic sample synthesis is also usable without an AudioContext.
export function synthesise(voice,midi,sampleRate){
 const p=VOICES[voice]||VOICES.water,rate=sampleRate;
 const length=Math.ceil((p.length+.14)*rate),dry=new Float32Array(length);
 const frequency=440*2**((midi-69)/12),r=random(midi*7919+voice.length*3571);
 let low=0,peak=.00001;
 for(let i=0;i<length;i++){
  const t=i/rate,attack=1-Math.exp(-t/(voice==='felt'?.007:.0025));
  const fade=clamp((p.length-t)/.045);let value=0;
  for(let j=0;j<p.partials.length;j++){
   const [ratio,weight]=p.partials[j];if(frequency*ratio>rate*.45)continue;
   const phase=TAU*frequency*ratio*(t+(p.bend||0)*.018*(1-Math.exp(-t/.018)));
   value+=Math.sin(phase)*weight*Math.exp(-t/(p.decay/(1+j*.52)));
  }
  if(p.noise){const white=r()*2-1;low+=.18*(white-low);value+=(white-low)*p.noise*Math.exp(-t/.021);}
  dry[i]=value*attack*fade;peak=Math.max(peak,Math.abs(dry[i]));
 }
 const left=new Float32Array(length),right=new Float32Array(length);
 const a=Math.round(.061*rate),b=Math.round(.103*rate),scale=.76/peak;
 for(let i=0;i<length;i++){
  // Two quiet, finite room reflections. There is no accumulating echo tail.
  const fade=clamp((length-1-i)/(.025*rate));
  left[i]=(dry[i]+(i>=a?dry[i-a]*.075:0))*scale*fade;
  right[i]=(dry[i]+(i>=b?dry[i-b]*.075:0))*scale*fade;
 }
 return [left,right];
}

export class SeaScore {
 constructor(seed,ensemble){
  this.seed=seed;this.ensemble=ensemble;
  const r=random(seed^0x618F21A9);
  this.tempo=78+Math.floor(r()*15);this.step=30/this.tempo;
  this.root=[48,50,53,55,57][Math.floor(r()*5)];
  this.mode=modes[Math.floor(r()*modes.length)];
  this.progression=progressions[Math.floor(r()*progressions.length)];
  // Inversions keep common tones in place and move the other voices by the
  // shortest distance. All melodies and visitors share these same triads.
  let previous=[this.root+12,this.root+16,this.root+19];
  this.voicings=this.progression.map(chord=>(previous=this.inversion(chord,previous)));
  this.order=ensemble.members.map((_,i)=>i);
  for(let i=this.order.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[this.order[i],this.order[j]]=[this.order[j],this.order[i]];}
  this.seek(0);
 }
 seek(time){this.nextTick=Math.ceil((time-1e-7)/this.step);this.eventCursors=new Map();this.since=time;}
 pitch(degree,octave=0){return this.root+this.mode[mod(degree,7)]+12*(Math.floor(degree/7)+octave);}
 inversion(chord,previous){
  const pcs=[0,2,4].map(d=>mod(this.pitch(chord+d),12)),available=[];
  for(let midi=this.root+7;midi<=this.root+28;midi++)if(pcs.includes(mod(midi,12)))available.push(midi);
  let best=previous,cost=Infinity;
  for(let i=0;i<=available.length-3;i++){
   const candidate=available.slice(i,i+3),distance=candidate.reduce((s,n,j)=>s+Math.abs(n-previous[j]),0);
   if(distance<cost){best=candidate;cost=distance;}
  }
  return best;
 }
 harmony(time){
  const span=this.step*16,index=mod(Math.floor(time/span),this.progression.length),e=this.events?.tracks.confluence;
  if(e&&time>=e.start&&time<e.start+e.duration){
   // Keep the established progression during the approach. Notes already
   // scheduled when a visitor calls the event remain harmonically valid.
   if(time<e.start+4)return {root:this.progression[index],tones:this.voicings[index],boundary:Math.min((Math.floor(time/span)+1)*span,e.start+4),stage:0};
   if(this.encounterHarmony?.id!==e.id){
    const first=mod(Math.floor((e.start+4-1e-7)/span),this.progression.length);
    const roots=[this.progression[first],3,5,4,0];let previous=this.voicings[first];
    this.encounterHarmony={id:e.id,roots,voices:roots.map((root,i)=>(previous=i?this.inversion(root,previous):previous))};
   }
   const ends=[4,9.5,15,18.5,e.duration],stage=ends.findIndex(end=>time<e.start+end),h=this.encounterHarmony;
   return {root:h.roots[stage],tones:h.voices[stage],boundary:e.start+ends[stage],stage};
  }
  return {root:this.progression[index],tones:this.voicings[index],boundary:(Math.floor(time/span)+1)*span,stage:-1};
 }
 chord(time){return this.harmony(time).root;}
 chordTones(time){return this.harmony(time).tones;}
 tone(time,index,octave=0){return this.chordTones(time)[mod(index,3)]+12*(Math.floor(index/3)+octave);}
 voice(sea,events){const row=sea*60;return seaVoices[mod(Math.round(events.baseStyles[row+4])+Math.round(events.baseStyles[row+16]),seaVoices.length)];}
 pan(sea){return clamp(((this.events?.motion?.[sea*4]??this.ensemble.members[sea].source[0])-.5)*1.5,-.8,.8);}
 energy(sea){return clamp(this.events?.motion?.[sea*4+2]??.35);}
 note(at,voice,midi,velocity,pan,group='sea',id=0){
  const pcs=this.chordTones(at).map(n=>mod(n,12));
  let tuned=midi,distance=Infinity;
  for(let n=Math.floor(midi)-6;n<=Math.ceil(midi)+6;n++)if(pcs.includes(mod(n,12))&&Math.abs(n-midi)<distance){tuned=n;distance=Math.abs(n-midi);}
  midi=tuned;
  midi=Math.round(midi);while(midi<45)midi+=12;while(midi>88)midi-=12;
  const boundary=this.harmony(at).boundary;
  const duration=Math.min(VOICES[voice].length+.14,Math.max(0,boundary-at-.025));
  return {at,voice,midi,duration,velocity:clamp(velocity,0,.6),pan:clamp(pan,-.9,.9),group,id};
 }
 seaNotes(tick,events){
  this.events=events;
  const encounter=events.tracks.confluence,time=tick*this.step;
  if(encounter&&time>=encounter.start&&time<encounter.start+encounter.duration)return this.confluenceNotes(tick,encounter,events);
  const at=tick*this.step,bar=Math.floor(tick/8),slot=mod(tick,8),chord=this.chord(at),notes=[];
  // Only two sea melodies and one brief harmonic answer share a bar, even
  // with fifty seas. A rotating cast gives every sea a turn without a wall.
  const phrase=Math.floor(bar/2),lead=this.order[mod(phrase,this.order.length)],reply=this.order[mod(phrase+1,this.order.length)];
  const m=this.ensemble.members[lead],voice=this.voice(lead,events);
  const pattern=rhythms[Math.floor(hash(m.seed,0)*rhythms.length)];
  const motif=[0,1,2,1,0],octave=m.thickness<.65?1:0;
  const colour=events.paletteIds[lead],turn=mod(colour,3);
  const busy=!!events.tracks.colour||!!events.tracks.weather;
  if(pattern.includes(slot)&&!(busy&&slot===5)){
   const position=pattern.indexOf(slot),degree=bar%2&&position===pattern.length-1?0:motif[mod(position+turn,motif.length)];
   notes.push(this.note(at+.008*hash(m.seed,tick),voice,this.tone(at,degree,octave),.22+this.energy(lead)*.09+(slot===0?.04:0),this.pan(lead)));
  }
  if(slot===3||slot===5){
   const degree=slot===3?2:1;
   if(!busy||slot===3)notes.push(this.note(at+.025,this.voice(reply,events),this.tone(at,degree),.16,this.pan(reply)));
  }
  if(slot===0&&bar%2===0){
   notes.push(this.note(at+.015,'felt',this.pitch(chord-7),.24,-.24));
   notes.push(this.note(at+.08,'felt',this.tone(at,1),.17,.24));
  }
  // Slots six and seven are deliberately empty: phrases finish and breathe.
  return notes;
 }
 confluenceNotes(tick,e,events){
  const at=tick*this.step,local=Math.max(0,Math.floor((at-e.start)/this.step)),slot=local%8;
  if(slot>=6)return [];
  const age=at-e.start,gather=age<6,opening=age>=15,cast=e.participants,notes=[];
  const lead=cast[Math.floor(local/2)%cast.length],position=local%6;
  const emit=(sea,index,velocity,delay=0,voice=this.voice(sea,events))=>{
   const t=at+delay;if(t>=e.start+e.duration)return;
   const n=this.note(t,voice,this.tone(t,index),velocity,this.pan(sea),'confluence',e.id);
   n.duration=Math.min(n.duration,opening?1.3:.85);notes.push(n);
  };
  if((gather?[0,2,4]:opening?[0,3]:[0,1,2,3,4,5]).includes(slot)){
   emit(lead,[0,1,2,1,2,0][position],.25+this.energy(lead)*.10);
  }
  if(!gather&&!opening&&(slot===0||slot===4)){
   // Three distinct sea voices meet on a shared, closely voiced triad.
   for(let j=0;j<3;j++)emit(cast[(Math.floor(local/8)+j)%cast.length],j,.15+j*.012,.028+j*.025);
  }
  if(opening&&slot===0){
   emit(cast[(Math.floor(local/8)+1)%cast.length],1,.19,.12,'felt');
   emit(lead,-3,.24,.025,'felt');
  }
  return notes;
 }
 eventNotes(e,from,to,events){
  const notes=[],kind=e.kind,group=kind==='colour'||kind==='cascade'?'colour':kind==='style'?'style':kind==='fish'?'fish':'weather';
  const emit=(age,voice,degree,velocity,pan=0,octave=0)=>{
   const at=e.start+age;
   if(at<=from+1e-7||at>to+1e-7||age<0||age>=e.duration)return;
   notes.push(this.note(at,voice,this.pitch(this.chord(at)+degree,octave),velocity,pan,group,e.id));
  };
  const pan=this.pan(e.sea);
  if(kind==='pebble'){
   e.drops.forEach((d,i)=>{const age=d.at/e.speed;emit(age,'stone',-5+i,.43*Math.pow(.91,i),(d.x-.5)*1.7);emit(age+.065,'droplet',2+i,.30*Math.pow(.90,i),(d.x-.5)*1.7);});
  }else if(['drizzle','rain','downpour'].includes(kind)){
   const gap=[.55,.28,.14][e.level];let last=-Infinity,index=0;
   for(const d of e.drops){const age=d.at/e.speed;if(age-last<gap)continue;last=age;
    const h=hash(this.seed,e.id,index++),pitched=e.level===0||index%3===0;
    emit(age,pitched?'droplet':'patter',[-1,0,2,4,6][Math.floor(h*5)],[.22,.23,.25][e.level]*(.7+h*.3),(d.x-.5)*1.7,pitched?1:0);
   }
  }else if(kind==='lights'){
   for(let i=0;i<e.duration/1.65;i++){
    const age=.45+i*1.65,side=Math.sin(e.phase+i*1.4)*.75;
    [0,.16,.39].forEach((offset,j)=>emit(age+offset,'glass',[4,6,9][j],.25-j*.025,side+(j-1)*.09,1));
   }
  }else if(kind==='fish'){
   const size=e.fish.reduce((sum,f)=>sum+f.size,0)/e.fish.length;
   const octave=size<.012?1:0,count=3+Math.floor(clamp((e.fish.length-10)/150)*4);
   const activity=e.activity||0,beat=.12+clamp(size/.04)*.10,phraseGap=2.7+e.profile*.17;
   const centre=e.fish.reduce((sum,f)=>sum+f.x,0)/e.fish.length;
   const visible=clamp((centre+.06)*6)*clamp((1.06-centre)*6);
   for(let i=0;i<e.duration/phraseGap;i++)for(let j=0;j<count;j++){
    const age=1.6+i*phraseGap+j*beat;
    const degree=[0,2,4,6,4,2,0][e.direction>0?j:count-1-j]+mod(e.colourStyle,2);
    emit(age,fishVoices[e.colourStyle],degree,(.18+.055*Math.sin(j/count*Math.PI)+activity*.10)*visible,clamp((centre-.5)*1.5+(j/count-.5)*.25,-.8,.8),octave);
   }
   for(const note of notes)note.duration=Math.min(note.duration,.95-activity*.5);
  }else if(kind==='colour'||kind==='cascade'){
   e.changes.forEach((c,i)=>{
    const age=c.delay+.16;
    emit(age,'harp',mod(i,5)*2,.32,this.pan(c.sea));
    emit(age+.23,'glass',mod(i,5)*2+2,.19,this.pan(c.sea));
   });
   [0,2,4].forEach((d,i)=>emit(e.duration-1+i*.12,'harp',d,.23,pan+(i-1)*.2));
  }else if(kind==='style'){
   const old=this.voice(e.sea,events),next=seaVoices[mod(e.family+Math.round(events.baseStyles[e.sea*60+16]),seaVoices.length)];
   [0,2,4,6,4,2].forEach((d,i)=>emit(.15+i*(e.duration-.6)/6,i<3?old:next,d,.29-i*.011,pan));
  }
  return notes;
 }
 pull(time,events,horizon=.12){
  this.events=events;
  const end=time+horizon,notes=[];
  if(this.nextTick*this.step<time-.25)this.nextTick=Math.ceil(time/this.step);
  while(this.nextTick*this.step<=end){notes.push(...this.seaNotes(this.nextTick++,events));}
  const alive=new Set();
  for(const [track,e] of Object.entries(events.tracks)){
   if(!e)continue;alive.add(e.id);
   const from=this.eventCursors.get(e.id)??Math.max(this.since-1e-6,e.start-1e-6,time-.15);
   const handoff=events.handoffs[track];
   // A fading track stops proposing new phrases; its short notes can decay.
   if(!handoff)notes.push(...this.eventNotes(e,from,end,events));
   this.eventCursors.set(e.id,end);
  }
  for(const id of this.eventCursors.keys())if(!alive.has(id))this.eventCursors.delete(id);
  return notes.filter(n=>n.at>=time-.15&&n.velocity>.005&&n.duration>.08).sort((a,b)=>a.at-b.at);
 }
 gesture(time,x,y,drag,events){
  this.events=events;
  const degree=this.chord(time)+Math.round((1-clamp(y))*4)*2;
  return this.note(time,drag?'harp':'water',this.pitch(degree),drag?.19:.38,(x-.5)*1.6,'touch');
 }
}

export class WaterSound {
 constructor(){this.enabled=false;this.playing=false;this.volume=.70;this.context=null;this.nodes=new Set();this.buffers=new Map();this.revision=0;this.lastGesture=-Infinity;}
 reset(seed,ensemble,time=0){this.clear();this.score=new SeaScore(seed,ensemble);this.score.seek(time);this.playing=false;this.lastGesture=-Infinity;}
 ensureContext(){
  if(!this.context){
   const Context=globalThis.AudioContext||globalThis.webkitAudioContext;
   if(!Context)throw new Error('Sound is unavailable in this browser.');
   const ctx=this.context=new Context({latencyHint:'interactive'});
   ctx.onstatechange=()=>this.onStateChange?.();
   const compressor=ctx.createDynamicsCompressor();compressor.threshold.value=-16;compressor.knee.value=12;compressor.ratio.value=4;compressor.attack.value=.008;compressor.release.value=.17;
   const limiter=ctx.createWaveShaper(),curve=new Float32Array(4096);
   for(let i=0;i<curve.length;i++){const x=i/(curve.length-1)*2-1;curve[i]=Math.tanh(x*1.3)/1.3;}
   limiter.curve=curve;
   this.master=ctx.createGain();this.master.gain.value=0;
   this.input=compressor;compressor.connect(limiter);limiter.connect(this.master);this.master.connect(ctx.destination);
  }
  return this.context;
 }
 async enable(){
  const ticket=++this.revision;this.ensureContext();
  // Called directly by the sound button / A key; never autoplay on a tap
  // intended for the painting. The preference does not unmute a later visit.
  await this.context.resume();
  if(ticket!==this.revision)return false;
  this.enabled=true;this.playing=false;return true;
 }
 async recordingStream(){
  const ctx=this.ensureContext();await ctx.resume();
  if(!this.recordDestination){this.recordDestination=ctx.createMediaStreamDestination();this.master.connect(this.recordDestination);}
  // The recorder owns clones. Stopping a clip cannot stop future music or
  // subsequent captures, and muting remains effective in the recorded mix.
  return this.recordDestination.stream.clone();
 }
 disable(){this.revision++;this.enabled=false;this.playing=false;this.clear();}
 setVolume(value){this.volume=clamp(value);this.gain(this.enabled&&this.playing?this.volume*.8:0);}
 gain(value){if(!this.master)return;const p=this.master.gain,t=this.context.currentTime;p.cancelScheduledValues(t);p.setTargetAtTime(value,t,.025);}
 setPlaying(active,time=0){
  const next=!!active&&this.enabled&&this.context?.state==='running';
  if(next===this.playing)return;
  this.playing=next;
  if(next){this.score?.seek(time);this.gain(this.volume*.8);}else this.clear();
 }
 clear(){
  if(!this.context)return;this.gain(0);const t=this.context.currentTime;
  for(const node of this.nodes){
   node.gain.gain.cancelScheduledValues(t);node.gain.gain.setTargetAtTime(0,t,.008);
   try{node.source.stop(t+.045);}catch{}
  }
  // onended owns disconnection; there is never an indefinitely running source.
 }
 buffer(voice,midi){
  const key=voice+':'+midi;if(this.buffers.has(key))return this.buffers.get(key);
  // Generate at 24 kHz; AudioBufferSource resamples on the rendering thread.
  const rate=24000,channels=synthesise(voice,midi,rate),buffer=this.context.createBuffer(2,channels[0].length,rate);
  channels.forEach((data,i)=>buffer.getChannelData(i).set(data));
  if(this.buffers.size>=96)this.buffers.delete(this.buffers.keys().next().value);
  this.buffers.set(key,buffer);return buffer;
 }
 play(note,when){
  if(!this.enabled||!this.playing||this.nodes.size>=24||this.volume===0||note.duration<=.08)return;
  const ctx=this.context,source=ctx.createBufferSource(),gain=ctx.createGain(),pan=ctx.createStereoPanner();
  source.buffer=this.buffer(note.voice,note.midi);source.loop=false;
  gain.gain.value=note.velocity;pan.pan.value=note.pan;
  source.connect(gain);gain.connect(pan);pan.connect(this.input);
  const node={source,gain,pan};this.nodes.add(node);
  source.onended=()=>{source.disconnect();gain.disconnect();pan.disconnect();this.nodes.delete(node);};
  const start=Math.max(ctx.currentTime+.004,when),end=start+Math.min(source.buffer.duration,note.duration);
  gain.gain.setValueAtTime(note.velocity,start);gain.gain.setValueAtTime(note.velocity,Math.max(start,end-.06));gain.gain.linearRampToValueAtTime(0,end);
  source.start(start);source.stop(end+.006);
 }
 tick(time,events,active){
  this.setPlaying(active,time);
  if(!this.playing||!this.score)return;
  const now=this.context.currentTime;
  for(const note of this.score.pull(time,events))this.play({...note,duration:note.duration+Math.min(0,note.at-time)},now+.025+Math.max(0,note.at-time));
 }
 touch(time,x,y,drag,events){
  if(!this.playing||!this.score)return;
  const now=this.context.currentTime;if(now-this.lastGesture<(drag?.22:.09))return;
  this.lastGesture=now;this.play(this.score.gesture(time,x,y,drag,events),now+.006);
 }
}
