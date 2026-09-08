const clamp=x=>Math.max(0,Math.min(1,x));
const ease=x=>{x=clamp(x);return x*x*(3-2*x);};

export function confluenceState(event,time){
 if(!event)return {age:0,intensity:0,braid:0,opening:0,phase:0};
 const age=Math.max(0,time-event.start),p=clamp(age/event.duration);
 const intensity=ease(p/.24)*(1-ease((p-.73)/.27));
 return {age,intensity,braid:ease((p-.20)/.16)*(1-ease((p-.60)/.20)),opening:ease((p-.60)/.23),phase:p<.27?0:p<.64?1:2};
}

// A compact polar twist has determinant one: it bends the material without
// squeezing it into a hole. Both it and its derivative vanish at its edge.
function twistPoint(x,y,cx,cy,radius,angle){
 const dx=x-cx,dy=y-cy,q=(dx*dx+dy*dy)/(radius*radius);
 if(q>=1||!angle)return [x,y];
 const a=angle*(1-q)**3,c=Math.cos(a),s=Math.sin(a);
 return [cx+dx*c-dy*s,cy+dx*s+dy*c];
}
export function confluenceMap(x,y,event,state){
 if(!event||state.intensity===0)return [x,y];
 const {cx,cy,radius,spin}=event;
 const main=twistPoint(x,y,cx,cy,radius,-spin*2.6*state.intensity);
 // Two smaller counter-turns lace the broad spiral into crossing ribbons.
 const shift=radius*.24,c=Math.cos(event.phase),s=Math.sin(event.phase);
 const a=twistPoint(main[0],main[1],cx+c*shift,cy+s*shift,radius*.52,spin*.58*state.braid*state.intensity);
 return twistPoint(a[0],a[1],cx-c*shift,cy-s*shift,radius*.52,-spin*.58*state.braid*state.intensity);
}
export function confluenceAnchors(event,state){
 if(!event)return [];
 const gather=ease(state.age/7),angle=event.spin*(1.8*ease(state.age/13)-state.opening*.30);
 const c=Math.cos(angle),s=Math.sin(angle),scale=1-.42*gather+.35*state.opening;
 return event.origins.map(([x,y],i)=>{
  const dx=x-event.cx,dy=y-event.cy,lace=Math.sin(state.age*.38+i*Math.PI)*state.braid*.035;
  return [event.cx+(dx*c-dy*s)*scale+lace*c,event.cy+(dx*s+dy*c)*scale+lace*s];
 });
}
