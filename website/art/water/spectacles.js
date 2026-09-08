export const MATERIAL_NAMES=Object.freeze(['Opalescent enamel','Liquid gold','Living stained glass']);
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
export const smoothJourney=x=>{x=clamp(x);return x*x*x*(x*(x*6-15)+10);};

export function materialState(event,time){
 if(!event)return new Float32Array([-1,0,0,0]);
 const age=clamp(time-event.start,0,event.duration);
 const strength=smoothJourney(age/7)*(1-smoothJourney((age-event.duration+9)/9));
 return new Float32Array([event.finish,strength,age,event.phase]);
}

// Find an actual meeting of pigment, wave ridges and moving currents. Sampling
// a modest, fixed set of candidates keeps the search cheap with fifty seas.
export function chooseMeeting(ocean,random,preferred=[],previous=null){
 const w=ocean.width,h=ocean.height,n=ocean.dyes?.length||0,candidates=[];
 if(!n||!w||!h)return {x:.5,y:.5,seas:Array.from(ocean.pigmentMass||[1],(_,i)=>i).slice(0,3),score:0};
 for(let row=0;row<11;row++)for(let col=0;col<13;col++){
  const x=.21+col/12*.58,y=.21+row/10*.58;
  const ix=Math.max(1,Math.min(w-2,Math.round(x*(w-1)))),iy=Math.max(1,Math.min(h-2,Math.round(y*(h-1)))),k=iy*w+ix;
  let total=0,squares=0,ridges=0,featured=0;
  const ranks=[];
  for(let i=0;i<n;i++){
   const dye=ocean.dyes[i],a=Math.max(0,dye[k]);total+=a;squares+=a*a;ranks.push([i,a]);
   const wave=ocean.seas[i].wave;
   ridges+=a*(Math.abs(wave[k+1]-wave[k-1])+Math.abs(wave[k+w]-wave[k-w]));
   if(preferred.includes(i))featured+=a;
  }
  const mixing=1-squares/Math.max(1e-8,total*total),flow=Math.hypot(ocean.u[k],ocean.v[k]);
  const curl=Math.abs(ocean.v[k+1]-ocean.v[k-1]-ocean.u[k+w]+ocean.u[k-w]);
  const central=1-Math.hypot(x-.5,y-.5)*.65;
  const fresh=previous?.length?clamp(Math.hypot(x-previous[0],y-previous[1])*3,.35,1):1;
  const score=(.2+mixing*.8+Math.min(.7,ridges/Math.max(.001,total)*5)+Math.min(.5,flow*2+curl*3))
   *central*fresh*(preferred.length?.35+featured/Math.max(.001,total)*3:1);
  ranks.sort((a,b)=>b[1]-a[1]);
  candidates.push({x,y,score,seas:ranks.slice(0,3).map(([sea])=>sea)});
 }
 candidates.sort((a,b)=>b.score-a.score);
 const top=candidates.slice(0,12),pick=top[Math.floor(random()*top.length)];
 return pick||{x:.5,y:.5,seas:[0],score:0};
}
