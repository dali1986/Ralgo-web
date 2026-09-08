import { randomGenerator } from './simulation.js?v=38';
import { chooseMeeting, smoothJourney } from './spectacles.js?v=38';
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));

// Bounded, seed-determined drift; no wall-clock randomness or sudden cuts.
export function cameraForTime(time,seed){
  const phase=(seed%997)/997*Math.PI*2;
  return new Float32Array([
    .010*(Math.sin(time*.017+phase)-Math.sin(phase)),
    .007*(Math.sin(time*.013+phase*1.7)-Math.sin(phase*1.7)),
    .006*Math.sin(time*.011),
    1.075+.010*Math.sin(time*.014+phase)
  ]);
}

// Browser coordinates start at the upper left. This is the same clockwise
// rotation, aspect correction and zoom as the fragment shader's lens transform.
export function screenToScene(u,v,aspect,camera){
  const x=(u-.5)*aspect,y=.5-v,c=Math.cos(camera[2]),s=Math.sin(camera[2]);
  return [.5+camera[0]+(c*x+s*y)/(camera[3]*aspect),.5+camera[1]+(-s*x+c*y)/camera[3]];
}

// The rotated viewport must remain inside the water at every point of a dive,
// including narrow phones and a resize while the camera is held still.
export function coveredCamera(pose,aspect){
 const a=Math.max(.001,aspect),c=Math.abs(Math.cos(pose[2])),s=Math.abs(Math.sin(pose[2]));
 const zoom=Math.max(pose[3],(c+s/a)/.994,(c+s*a)/.994);
 const ex=(c+s/a)/(2*zoom)+.002,ey=(c+s*a)/(2*zoom)+.002;
 return new Float32Array([clamp(pose[0],ex-.5,.5-ex),clamp(pose[1],ey-.5,.5-ey),pose[2],zoom]);
}

export class SeaCamera {
 constructor(seed,{moving=true,journeys=true}={}){
  this.seed=seed;this.moving=moving;this.journeys=journeys;
  this.time=0;this.previousTime=0;this.driftTime=0;this.previousDrift=0;
  this.clock=randomGenerator((seed^0x41AC7B29)>>>0);this.random=randomGenerator((seed^0x72B96E13)>>>0);
  this.nextJourneyAt=32+this.clock()*20;this.journey=null;this.lastFocus=null;this.manualCount=0;this.returning=null;
 }
 displayTime(blend=1){return this.previousTime+(this.time-this.previousTime)*clamp(blend,0,1);}
 freeze(blend){
  this.time=this.displayTime(blend);this.driftTime=this.previousDrift+(this.driftTime-this.previousDrift)*clamp(blend,0,1);
  this.previousTime=this.time;this.previousDrift=this.driftTime;
 }
 setMoving(moving,blend=1){if(!moving&&this.moving)this.freeze(blend);this.moving=moving;}
 setJourneys(enabled,blend=1,aspect=1){
  if(enabled===this.journeys)return;
  const pose=this.read(blend,aspect);this.freeze(blend);this.journeys=enabled;
  if(!enabled&&this.journey){
   this.returning={start:this.time,duration:14,pose:Array.from(pose)};this.journey=null;
  }
  if(enabled)this.nextJourneyAt=this.time+24+this.clock()*24;
 }
 startJourney(ocean,events,manual=false){
  if(this.journey||this.returning)return false;
  const r=this.random,material=events.tracks.material,confluence=events.tracks.confluence;
  const preferred=material?.participants||confluence?.participants||[];
  const meeting=chooseMeeting(ocean,r,preferred,this.lastFocus);
  const focus=[meeting.x,meeting.y];
  this.journey={start:this.time,duration:42+r()*8,focus,zoom:2.55+r()*.60,phase:r()*Math.PI*2,spin:r()<.5?-1:1,
   reason:material?material.label:confluence?'The meeting of seas':'Inside the pigment'};
  this.lastFocus=focus;this.nextJourneyAt=this.time+110+this.clock()*60;
  if(manual)this.manualCount++;return true;
 }
 step(ocean,events,dt=1/30,physicalDelta=1/30){
  if(!this.moving)return;
  this.previousTime=this.time;this.previousDrift=this.driftTime;this.time+=dt;this.driftTime+=physicalDelta;
  if(this.journey&&this.time>=this.journey.start+this.journey.duration)this.journey=null;
  if(this.returning&&this.time>=this.returning.start+this.returning.duration)this.returning=null;
  if(this.journeys&&!this.journey&&!this.returning&&this.time>=this.nextJourneyAt)this.startJourney(ocean,events);
 }
 read(blend=1,aspect=1){
  const t=this.displayTime(blend),drift=this.previousDrift+(this.driftTime-this.previousDrift)*clamp(blend,0,1);
  const base=cameraForTime(drift,this.seed),e=this.journey;
  if(this.returning){
   const h=this.returning,a=smoothJourney((t-h.start)/h.duration);
   const p=h.pose.map((n,i)=>i===3?Math.exp(Math.log(n)*(1-a)+Math.log(base[i])*a):n*(1-a)+base[i]*a);
   return coveredCamera(p,aspect);
  }
  if(!e)return coveredCamera(base,aspect);
  const p=clamp((t-e.start)/e.duration,0,1),approach=smoothJourney(p/.36),release=1-smoothJourney((p-.64)/.36),weight=approach*release;
  const along=smoothJourney(p),arc=Math.sin(along*Math.PI)*.025;
  const tx=e.focus[0]+Math.cos(e.phase+along*.7)*arc,ty=e.focus[1]+Math.sin(e.phase+along*.7)*arc;
  const pose=[base[0]*(1-weight)+(tx-.5)*weight,base[1]*(1-weight)+(ty-.5)*weight,
   base[2]+e.spin*.022*Math.sin(p*Math.PI)*weight,Math.exp(Math.log(base[3])*(1-weight)+Math.log(e.zoom)*weight)];
  return coveredCamera(pose,aspect);
 }
 get label(){
  if(this.returning)return 'Returning to the whole';
  if(!this.journey)return '';
  const p=(this.time-this.journey.start)/this.journey.duration;
  return p<.36?'Entering the detail':p<.64?this.journey.reason:'Returning to the whole';
 }
}
