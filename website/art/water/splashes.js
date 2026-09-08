const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const ease=x=>{x=clamp(x);return x*x*(3-2*x);};
const fract=x=>x-Math.floor(x),hash=x=>fract(Math.sin(x*127.1+311.7)*43758.5453);

// Analytic, seed-stable splash choreography. Sampling a paused frame or PNG
// never creates another impact, consumes randomness or advances a particle.
export function impactState(drop,index,pebble,level,since){
 const lifetime=pebble?3.8:1.95+level*.34;
 if(since<0||since>=lifetime)return null;
 const force=pebble?Math.pow(drop.strength/1.15,.62):clamp(drop.strength/[.065,.12,.21][level],.6,1.4);
 const size=pebble?force:.77+force*.23;
 const crownLife=pebble?.66:.27+level*.06;
 return {since,lifetime,force,size,index,pebble,level,
  radius:.008+since*(pebble?.055:.026+level*.004)*(.76+size*.24),
  ringAlpha:clamp((pebble?.98:.64+level*.13)*force*ease(since/.045)*(1-ease(since/lifetime))),
  crownAge:clamp(since/crownLife),
  crownSize:(pebble?.030:.010+level*.003)*size*(1+clamp(since/crownLife)*.8),
  crownAlpha:clamp(force*ease(since/.018)*(1-ease(since/crownLife))),
  count:pebble?Math.max(5,Math.round(11*force)):index%3===0?2+level:level===2?2:0};
}
export function sprayParticle(impact,index,aspect,heading=0){
 const seed=impact.index*19+index*5.73,r=hash(seed),angle=r*Math.PI*2;
 const life=(impact.pebble?.62:.29+impact.level*.04)*(.80+hash(seed+2)*.45);
 const p=impact.since/life;if(p<=0||p>=1)return null;
 const speed=(impact.pebble?.072:.026)*impact.size*(.62+hash(seed+3)*.80);
 const height=(impact.pebble?.075:.014+impact.level*.005)*impact.size*(.6+hash(seed+7)*.7);
 const vx=Math.cos(angle)*speed+(impact.pebble?Math.cos(heading)*speed*.8:0);
 const vy=Math.sin(angle)*speed*.58+(impact.pebble?Math.sin(heading)*speed*.5:0);
 const lift=4*height*p*(1-p),rise=4*height/life*(1-2*p);
 return {dx:vx*impact.since/aspect,dy:vy*impact.since+lift,
  size:(impact.pebble?.0032:.0018+impact.level*.0003)*(.75+r*.6)*impact.size,
  angle:Math.atan2(vy+rise,vx)-Math.PI/2,alpha:ease(p/.055)*(1-ease((p-.66)/.34)),phase:p};
}
