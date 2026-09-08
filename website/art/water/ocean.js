import { Sea } from './simulation.js?v=38';
import { confluenceState, confluenceMap, confluenceAnchors } from './encounters.js?v=38';

const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));

// A shared, projected velocity field carries every sea's pigment and material
// coordinates. Wave exchange is simultaneous and conservative. Sediment changes
// the driving currents, so removing a participant changes the others' futures.
export class Ocean {
  // Keep the total simulation work bounded as the cast grows. Fine paint
  // detail remains procedural at the output resolution, independent of this grid.
  constructor(ensemble,width=Math.max(48,Math.round(112*Math.min(1,Math.sqrt(7/ensemble.count)))),height=Math.max(34,Math.round(80*Math.min(1,Math.sqrt(7/ensemble.count)))),boundaryWidth=12){
    this.width=width;this.height=height;this.length=width*height;this.steps=0;
    this.members=ensemble.members;this.seas=this.members.map(m=>new Sea(m.seed,width,height,boundaryWidth));
    this.thicknesses=Float32Array.from(this.members,m=>m.thickness??1);
    this.mobilities=Float32Array.from(this.thicknesses,t=>clamp(1/Math.sqrt(t),.66,1.32));
    this.drag=new Float32Array(this.length);
    const footprint=Math.min(1,Math.sqrt(5/this.seas.length));
    for(const key of ['u','v','uNext','vNext','streamFunction','nextStream','vorticitySource','totalDensity','curl','mapX','mapY','mapNextX','mapNextY'])this[key]=new Float32Array(this.length);
    this.departure=new Int32Array(this.length);this.fractionX=new Float32Array(this.length);this.fractionY=new Float32Array(this.length);
    for(const key of ['predictor','reverseX','reverseY','guideX','guideY','guideFractionX','guideFractionY'])this[key]=new Float32Array(this.length);
    this.reverseDeparture=new Int32Array(this.length);this.guideDeparture=new Int32Array(this.length);
    this.pigmentMass=new Float64Array(this.members.length);
    this.dyes=this.members.map(()=>new Float32Array(this.length));this.dyeNext=this.members.map(()=>new Float32Array(this.length));
    this.sources=this.members.map(()=>new Float32Array(this.length));
    this.forceX=this.members.map(()=>new Float32Array(this.length));this.forceY=this.members.map(()=>new Float32Array(this.length));
    this.flowPixels=new Float32Array(this.length*4);
    this.statePixels=new Float32Array(this.length*4*(this.seas.length+2));
    this.ripple=new Float32Array(this.length);this.rippleVelocity=new Float32Array(this.length);
    this.rippleNext=new Float32Array(this.length);this.rippleDepth=new Float32Array(this.length);
    this.ripplePixels=new Float32Array(this.length*4);this.rippleActivity=0;
    this.rippleAspect=1;this.disturbanceCount=0;this.eventDisturbanceCount=0;
    this.encounterTime=0;this.activeDelta=1/30;this.confluence=null;this.confluenceFrame=confluenceState(null,0);
    this.wakeX=new Float32Array(this.length);this.wakeY=new Float32Array(this.length);
    this.rainX=new Float32Array(this.length);this.rainY=new Float32Array(this.length);this.rainDelta=new Float64Array(this.length);
    // Double precision retains the exact values previously recomputed per sea.
    this.motionSpeed=new Float64Array(this.length);this.guideSamples=new Float64Array(this.length);
    this.rainRings=[];this.lastRainRingAt=-Infinity;this.impacts=[];this.touch=null;this.motion=new Float32Array(this.seas.length*4);this.stirEnergy=0;
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const k=y*width+x,px=x/(width-1),py=y/(height-1);this.mapX[k]=px;this.mapY[k]=py;
      let total=0,peakDensity=-Infinity;
      this.members.forEach((m,i)=>{
        const [cx,cy,phase]=m.source,dx=px-cx,dy=py-cy;
        const theta=Math.atan2(dy,dx),radius=Math.hypot(dx,dy);
        const lobes=1+.20*Math.sin(theta*(2+i%3)+radius*17+phase);
        // Log densities keep distant, narrow seas representable at high
        // counts. Normalization must not leave empty pigment at the edges.
        const density=-(dx*dx+dy*dy)/(2*(.235*footprint)**2)+Math.log(lobes);
        this.dyes[i][k]=density;peakDensity=Math.max(peakDensity,density);
        const spin=Math.sin(m.motion[0])<0?-1:1;
        const vortex=Math.exp(-(dx*dx+dy*dy)/((.29*footprint)**2));
        this.forceX[i][k]=(-dy*spin*.12+Math.cos(phase)*.010)*vortex;
        this.forceY[i][k]=(dx*spin*.12+Math.sin(phase)*.010)*vortex;
      });
      this.dyes.forEach(d=>{d[k]=Math.exp(d[k]-peakDensity);total+=d[k];});
      this.dyes.forEach(d=>d[k]/=total);
    }
    // Keep the opening seed's pigment amounts and
    // broad concentration fields as a moving reference for later currents.
    this.dyes.forEach((d,i)=>{this.sources[i].set(d);for(const v of d)this.pigmentMass[i]+=v;});
    this.updateGuide();
  }
  get time(){return this.steps/30;}
  disturb(x,y,{dx=0,dy=0,strength=1,radius=.042,aspect=this.rippleAspect,human=true,kind=human?'touch':'wave'}={}){
    if(![x,y,dx,dy,strength,radius,aspect].every(Number.isFinite)||x<0||x>1||y<0||y>1||strength<=0)return false;
    const w=this.width,h=this.height;
    aspect=clamp(aspect,.2,2.05);this.rippleAspect=aspect;strength=clamp(strength,0,1.2);
    radius=Math.max(radius,2.2/(h-1),2.2*aspect/(w-1));
    const rx=radius/aspect*(w-1),ry=radius*(h-1),cx=x*(w-1),cy=y*(h-1);
    const loX=Math.max(1,Math.floor(cx-rx*2.6)),hiX=Math.min(w-2,Math.ceil(cx+rx*2.6));
    const loY=Math.max(1,Math.floor(cy-ry*2.6)),hiY=Math.min(h-2,Math.ceil(cy+ry*2.6));
    const pushX=clamp(dx*(w-1)*2.4,-.65,.65),pushY=clamp(dy*(h-1)*2.4,-.65,.65);
    for(let row=loY;row<=hiY;row++)for(let col=loX;col<=hiX;col++){
      const k=row*w+col,q=((col-cx)/rx)**2+((row-cy)/ry)**2,envelope=Math.exp(-q);
      if(envelope<.001)continue;
      // A displaced center and surrounding ridge launch an outward wave.
      // Its positive and negative lobes avoid injecting a uniform water level.
      const pressure=(1-q)*envelope*strength;
      this.ripple[k]=clamp(this.ripple[k]-.45*pressure,-1.4,1.4);
      this.rippleVelocity[k]=clamp(this.rippleVelocity[k]-.04*pressure,-.25,.25);
      let total=0;for(const dye of this.dyes)total+=dye[k];
      for(let i=0;i<this.seas.length;i++){
        const member=this.seas[i],response=.25+.75*this.dyes[i][k]/Math.max(.00001,total);
        member.wave[k]=clamp(member.wave[k]-.12*pressure*response,-1.5,1.5);
        member.velocity[k]=clamp(member.velocity[k]-.018*pressure*response,-.35,.35);
      }
      // A localized drag leaves a vortex pair after pressure projection. The
      // shared current then advects every participant's real pigment history.
      this.u[k]=clamp(this.u[k]+pushX*envelope*strength,-.85,.85);
      this.v[k]=clamp(this.v[k]+pushY*envelope*strength,-.85,.85);
      if(human&&(dx||dy)){
        this.wakeX[k]=clamp(this.wakeX[k]+pushX*envelope*strength*.22,-.36,.36);
        this.wakeY[k]=clamp(this.wakeY[k]+pushY*envelope*strength*.22,-.36,.36);
      }
    }
    this.rippleActivity=1;
    if(human)this.disturbanceCount++;else this.eventDisturbanceCount++;
    if(kind==='pebble'||(human&&!dx&&!dy)){
      this.impacts.push({x,y,strength,at:this.encounterTime,kind});if(this.impacts.length>12)this.impacts.shift();
    }
    if(['drizzle','rain','downpour'].includes(kind)&&this.encounterTime-this.lastRainRingAt>=.085){
      // A bounded set of impact fronts picks up and transports nearby paint.
      this.lastRainRingAt=this.encounterTime;
      if(this.rainRings.length>=32)this.rainRings.shift();
      this.rainRings.push({x,y,strength,at:this.encounterTime,radius:Math.max(.016,radius*.50)});
    }
    return true;
  }
  setTouch(point){this.touch=point?{x:point[0],y:point[1]}:null;}
  beginEncounters(time,dt){
    this.encounterTime=time;this.activeDelta=dt;
    this.impacts=this.impacts.filter(hit=>time-hit.at<2.4);
    this.rainRings=this.rainRings.filter(hit=>time-hit.at<2.6);
  }
  setConfluence(event){this.confluence=event;this.confluenceFrame=confluenceState(event,this.encounterTime);}
  measureMotion(){
    const w=this.width,h=this.height;
    for(let k=0;k<this.length;k++)this.motionSpeed[k]=Math.hypot(this.u[k],this.v[k]);
    this.dyes.forEach((d,i)=>{
      let mx=0,my=0,energy=0,mass=0;
      for(let k=0;k<this.length;k++){const a=d[k];mass+=a;mx+=a*(k%w)/(w-1);my+=a*Math.floor(k/w)/(h-1);energy+=a*this.motionSpeed[k];}
      this.motion.set([mx/Math.max(.00001,mass),my/Math.max(.00001,mass),Math.min(1,energy/Math.max(.00001,mass)*2),mass],i*4);
    });
    return this.motion;
  }
  prepareEncounterForces(){
    const w=this.width,h=this.height,dt=this.activeDelta,decay=Math.exp(-dt/4.5),event=this.confluence,frame=this.confluenceFrame;
    const anchors=confluenceAnchors(event,frame);let wakeEnergy=0;
    this.rainX.fill(0);this.rainY.fill(0);
    for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
      const k=y*w+x,px=x/(w-1),py=y/(h-1);
      this.wakeX[k]*=decay;this.wakeY[k]*=decay;
      this.u[k]+=this.wakeX[k]*dt*3;this.v[k]+=this.wakeY[k]*dt*3;
      wakeEnergy+=Math.hypot(this.wakeX[k],this.wakeY[k]);
      if(event&&frame.intensity>0){
        const dx=px-event.cx,dy=py-event.cy,spread=Math.exp(-(dx*dx+dy*dy)/(event.radius*.75)**2);
        let fx=-dy*event.spin*.15*spread,fy=dx*event.spin*.15*spread;
        anchors.forEach(([ax,ay],i)=>{
          const ex=px-ax,ey=py-ay,g=Math.exp(-(ex*ex+ey*ey)/.018),sea=event.participants[i];
          const contact=.3+.7*this.dyes[sea][k]/Math.max(.00001,this.totalDensity[k]);
          const spin=event.spin*(.65+(i%2?-.9:.9)*frame.braid);
          fx-=ey*spin*g*contact*.32;fy+=ex*spin*g*contact*.32;
        });
        fx+=dx*spread*frame.opening*.12;fy-=dy*spread*frame.opening*.12;
        const gain=frame.intensity*dt*60;this.u[k]+=fx*gain;this.v[k]+=fy*gain;
      }
    }
    this.stirEnergy=Math.min(1,wakeEnergy/this.length*18);
    for(const ring of this.rainRings){
      const age=this.encounterTime-ring.at,r=ring.radius+age*.055,width=Math.max(.022,1.6/(h-1)),reach=r+width*2.6;
      const fade=Math.min(1,age/.12)*Math.max(0,1-age/2.6),strength=ring.strength*fade*dt*28;
      const ax=this.rippleAspect;
      const loX=Math.max(1,Math.floor((ring.x-reach/ax)*(w-1))),hiX=Math.min(w-2,Math.ceil((ring.x+reach/ax)*(w-1)));
      const loY=Math.max(1,Math.floor((ring.y-reach)*(h-1))),hiY=Math.min(h-2,Math.ceil((ring.y+reach)*(h-1)));
      for(let y=loY;y<=hiY;y++)for(let x=loX;x<=hiX;x++){
        const k=y*w+x,dx=(x/(w-1)-ring.x)*ax,dy=y/(h-1)-ring.y,dist=Math.hypot(dx,dy),q=(dist-r)/width;
        const gather=-q*Math.exp(-q*q)*strength/Math.max(.001,dist);
        this.rainX[k]+=dx*gather/ax;this.rainY[k]+=dy*gather;
      }
    }
    if(this.rainRings.length)for(let k=0;k<this.length;k++){
      this.rainX[k]=clamp(this.rainX[k],-.09,.09);this.rainY[k]=clamp(this.rainY[k],-.09,.09);
    }
  }
  gatherRainPigment(dye){
    if(!this.rainRings.length)return;
    const delta=this.rainDelta,w=this.width,h=this.height;delta.fill(0);
    // Equal/opposite finite-volume transfers conserve every sea separately.
    // Four outgoing faces can remove at most 36% of a cell, never its colour.
    for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
      const k=y*w+x;
      if(x<w-2){const speed=(this.rainX[k]+this.rainX[k+1])*.5,flux=speed*(speed>0?dye[k]:dye[k+1]);delta[k]-=flux;delta[k+1]+=flux;}
      if(y<h-2){const speed=(this.rainY[k]+this.rainY[k+w])*.5,flux=speed*(speed>0?dye[k]:dye[k+w]);delta[k]-=flux;delta[k+w]+=flux;}
    }
    for(let k=0;k<this.length;k++)dye[k]+=delta[k];
  }
  stepRipples(){
    if(!this.rippleActivity)return;
    const w=this.width,h=this.height,z=this.ripple,velocity=this.rippleVelocity,next=this.rippleNext,depth=this.rippleDepth;
    // The visible pressure wave refracts through the combined sediment bed.
    // Axis coefficients keep its propagation circular under the current lens.
    const axis=((w-1)/((h-1)*this.rippleAspect))**2,scale=1/Math.max(1,axis);
    for(let k=0;k<this.length;k++){
      let bed=0;for(let i=0;i<this.seas.length;i++)bed+=this.dyes[i][k]*(this.seas[i].bed[k]*.35+this.seas[i].sediment[k]*.65);
      depth[k]=.17*(1-.30*bed/Math.max(.00001,this.totalDensity[k]));
    }
    let peak=0;
    for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
      const k=y*w+x,old=z[k],d=depth[k];
      const fluxX=((z[k-1]-old)*(d+depth[k-1])+(z[k+1]-old)*(d+depth[k+1]))*.5;
      const fluxY=((z[k-w]-old)*(d+depth[k-w])+(z[k+w]-old)*(d+depth[k+w]))*.5;
      velocity[k]=(velocity[k]+(fluxX*axis+fluxY)*scale-old*.0015)*this.seas[0].damping[k];
      next[k]=old+velocity[k];peak=Math.max(peak,Math.abs(next[k])+Math.abs(velocity[k]));
    }
    this.ripple=next;this.rippleNext=z;this.rippleActivity=peak;
    if(peak<.0002){this.rippleActivity=0;this.ripple.fill(0);this.rippleNext.fill(0);this.rippleVelocity.fill(0);}
  }
  trace(u,v){
    const w=this.width,h=this.height;
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const k=y*w+x,px=clamp(x-u[k],0,w-1.001),py=clamp(y-v[k],0,h-1.001);
      const ix=Math.floor(px),iy=Math.floor(py);this.departure[k]=iy*w+ix;
      this.fractionX[k]=px-ix;this.fractionY[k]=py-iy;
    }
  }
  sample(array,k){
    const i=this.departure[k],x=this.fractionX[k],y=this.fractionY[k],w=this.width;
    return (array[i]*(1-x)+array[i+1]*x)*(1-y)+(array[i+w]*(1-x)+array[i+w+1]*x)*y;
  }
  prepareReverseTrace(){
    const w=this.width,h=this.height;
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const k=y*w+x,px=clamp(x+this.u[k],0,w-1.001),py=clamp(y+this.v[k],0,h-1.001),ix=Math.floor(px),iy=Math.floor(py);
      this.reverseDeparture[k]=iy*w+ix;this.reverseX[k]=px-ix;this.reverseY[k]=py-iy;
    }
  }
  advectPigment(source,target){
    // Limited MacCormack transport recovers interpolation loss. The limiter
    // preserves local colour bounds while thin filaments pass through a cell.
    const w=this.width,p=this.predictor;
    for(let k=0;k<this.length;k++)p[k]=this.sample(source,k);
    for(let k=0;k<this.length;k++){
      const i=this.reverseDeparture[k],x=this.reverseX[k],y=this.reverseY[k];
      const returned=(p[i]*(1-x)+p[i+1]*x)*(1-y)+(p[i+w]*(1-x)+p[i+w+1]*x)*y;
      const j=this.departure[k],a=source[j],b=source[j+1],c=source[j+w],d=source[j+w+1];
      target[k]=clamp(p[k]+.5*(source[k]-returned),Math.min(a,b,c,d),Math.max(a,b,c,d));
    }
  }
  updateGuide(){
    // A gentle, continuous deformation keeps the seed's large relationships
    // alive. Its displacement is zero at the opening and along the outer edge.
    const w=this.width,h=this.height,t=this.time,phase=this.members[0].source[2];
    const dx=.025*(Math.sin(t*.023+phase)-Math.sin(phase));
    const dy=.020*(Math.sin(t*.019+phase*.7)-Math.sin(phase*.7));
    const twist=.070*Math.sin(t*.013),bend=.018*Math.sin(t*.031);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const k=y*w+x,px=x/(w-1),py=y/(h-1),envelope=16*px*(1-px)*py*(1-py);
      let gx=px+envelope*(dx-(py-.5)*twist+bend*Math.sin(py*6+phase));
      let gy=py+envelope*(dy+(px-.5)*twist+bend*Math.cos(px*5+phase));
      if(this.confluenceFrame.intensity>0)[gx,gy]=confluenceMap(gx,gy,this.confluence,this.confluenceFrame);
      this.guideX[k]=gx;this.guideY[k]=gy;
      const sx=clamp(gx*(w-1),0,w-1.001),sy=clamp(gy*(h-1),0,h-1.001),ix=Math.floor(sx),iy=Math.floor(sy);
      this.guideDeparture[k]=iy*w+ix;this.guideFractionX[k]=sx-ix;this.guideFractionY[k]=sy-iy;
    }
  }
  sampleGuide(array,k){
    const i=this.guideDeparture[k],x=this.guideFractionX[k],y=this.guideFractionY[k],w=this.width;
    return (array[i]*(1-x)+array[i+1]*x)*(1-y)+(array[i+w]*(1-x)+array[i+w+1]*x)*y;
  }
  preservePatternScale(){
    const w=this.width,h=this.height,x=this.mapNextX,y=this.mapNextY,gx=this.guideX,gy=this.guideY;
    let gradient=0,displacement=0;
    for(let k=0;k<this.length;k++)displacement=Math.max(displacement,Math.hypot(x[k]-gx[k],y[k]-gy[k]));
    for(let row=1;row<h-1;row++)for(let col=1;col<w-1;col++){
      const k=row*w+col;
      const xx=((x[k+1]-gx[k+1])-(x[k-1]-gx[k-1]))*(w-1)*.5;
      const xy=((x[k+w]-gx[k+w])-(x[k-w]-gx[k-w]))*(h-1)*.5;
      const yx=((y[k+1]-gy[k+1])-(y[k-1]-gy[k-1]))*(w-1)*.5;
      const yy=((y[k+w]-gy[k+w])-(y[k-w]-gy[k-w]))*(h-1)*.5;
      gradient=Math.max(gradient,Math.abs(xx)+Math.abs(xy),Math.abs(yx)+Math.abs(yy));
    }
    // Scale the whole displacement smoothly, preserving its continuity.
    // Ridges may bend and travel without crushing into an unreadable knot.
    const gradientLimit=.36-.24*this.confluenceFrame.intensity;
    const scale=Math.min(1,gradientLimit/Math.max(.00001,gradient),.10/Math.max(.00001,displacement));
    if(scale<1)for(let k=0;k<this.length;k++){x[k]=gx[k]+(x[k]-gx[k])*scale;y[k]=gy[k]+(y[k]-gy[k])*scale;}
  }
  exchangeWaves(){
    // Equivalent to every pair exchanging an equal/opposite impulse weighted
    // by their pigment contact. Two passes preserve all-to-all coupling in
    // linear time, using velocities from before any participant is updated.
    for(let k=0;k<this.length;k++){
      const total=Math.max(.00001,this.totalDensity[k]);
      let wave=0,velocity=0,squares=0;
      for(let i=0;i<this.seas.length;i++){
        const d=this.dyes[i][k];wave+=d*this.seas[i].wave[k];velocity+=d*this.seas[i].velocity[k];squares+=d*d;
      }
      wave/=total;velocity/=total;
      const contact=total/Math.max(.00000001,squares);
      for(let i=0;i<this.seas.length;i++){
        const sea=this.seas[i];
        sea.velocity[k]+=this.dyes[i][k]*contact*((wave-sea.wave[k])*.018+(velocity-sea.velocity[k])*.035);
      }
    }
  }
  project(){
    const w=this.width,h=this.height,{u,v,vorticitySource:omega}=this;
    // Reconstruct velocity from a stream function. Its perpendicular gradient
    // has zero discrete divergence in the interior, so mixing cannot turn
    // into a numerical drain. Warm-start the Poisson solve from the last tide.
    for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
      const k=y*w+x;omega[k]=.5*(v[k+1]-v[k-1]-u[k+w]+u[k-w]);
    }
    for(let pass=0;pass<28;pass++){
      const p=this.streamFunction,n=this.nextStream;
      for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
        const k=y*w+x;n[k]=(p[k-1]+p[k+1]+p[k-w]+p[k+w]+omega[k])*.25;
      }
      [this.streamFunction,this.nextStream]=[n,p];
    }
    const p=this.streamFunction;let peak=0;
    for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
      const k=y*w+x;u[k]=.5*(p[k+w]-p[k-w]);v[k]=-.5*(p[k+1]-p[k-1]);
      peak=Math.max(peak,Math.abs(u[k]),Math.abs(v[k]));
    }
    // A uniform speed bound preserves incompressibility, unlike clipping
    // individual cells. Transport stays within one cell per axis per step.
    if(peak>.85){const scale=.85/peak;for(let k=0;k<this.length;k++){u[k]*=scale;v[k]*=scale;this.streamFunction[k]*=scale;}}
  }
  step(coupling=true){
    const w=this.width,h=this.height,n=this.length,t=this.time;
    this.totalDensity.fill(0);
    this.drag.fill(0);
    this.dyes.forEach((d,i)=>{for(let k=0;k<n;k++){
      this.totalDensity[k]+=d[k];this.drag[k]+=d[k]*this.thicknesses[i];
    }});
    if(coupling)this.exchangeWaves();
    this.seas.forEach(s=>s.step());
    this.stepRipples();
    this.trace(this.u,this.v);
    for(let k=0;k<n;k++){
      // Local resistance follows the transported mixture. Thick seas hold a
      // pulled wake more firmly; thin seas yield to the common current faster.
      const thickness=this.drag[k]/Math.max(.00001,this.totalDensity[k]);
      const retention=clamp(.980+(1-thickness)*.005,.971,.984);
      this.uNext[k]=this.sample(this.u,k)*retention;this.vNext[k]=this.sample(this.v,k)*retention;
    }
    [this.u,this.uNext]=[this.uNext,this.u];[this.v,this.vNext]=[this.vNext,this.v];
    const backgroundForce=.3*Math.min(1,5/this.seas.length);
    this.seas.forEach((s,i)=>{
      const pigment=this.dyes[i],fx=this.forceX[i],fy=this.forceY[i];
      const amplitude=.75+.25*Math.sin(t*.23+this.members[i].source[2]);
      const spin=Math.sin(this.members[i].motion[0])<0?-1:1;
      for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
        const k=y*w+x,weight=coupling?pigment[k]/Math.max(.00001,this.totalDensity[k]):1/this.seas.length;
        const resistance=(1-s.sediment[k]*.35)*this.mobilities[i];
        this.u[k]+=fx[k]*amplitude*(backgroundForce+weight)*resistance;
        this.v[k]+=fy[k]*amplitude*(backgroundForce+weight)*resistance;
        if(coupling){
          this.u[k]-=(s.wave[k+1]-s.wave[k-1])*.075*weight;
          this.v[k]-=(s.wave[k+w]-s.wave[k-w])*.075*weight;
          this.u[k]-=(pigment[k+w]-pigment[k-w])*spin*.028;
          this.v[k]+=(pigment[k+1]-pigment[k-1])*spin*.028;
        }
      }
    });
    this.prepareEncounterForces();
    // Vorticity confinement preserves rolling filaments lost to grid diffusion.
    for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
      const k=y*w+x;this.curl[k]=.5*(this.v[k+1]-this.v[k-1]-this.u[k+w]+this.u[k-w]);
    }
    for(let y=2;y<h-2;y++)for(let x=2;x<w-2;x++){
      const k=y*w+x,gx=Math.abs(this.curl[k+1])-Math.abs(this.curl[k-1]),gy=Math.abs(this.curl[k+w])-Math.abs(this.curl[k-w]);
      const scale=.16*this.curl[k]/(Math.hypot(gx,gy)+.0001);
      this.u[k]+=gy*scale;this.v[k]-=gx*scale;
    }
    this.project();this.trace(this.u,this.v);this.prepareReverseTrace();this.updateGuide();
    for(let k=0;k<n;k++){
      this.mapNextX[k]=this.sample(this.mapX,k)*.986+this.guideX[k]*.014;
      this.mapNextY[k]=this.sample(this.mapY,k)*.986+this.guideY[k]*.014;
    }
    this.preservePatternScale();
    [this.mapX,this.mapNextX]=[this.mapNextX,this.mapX];[this.mapY,this.mapNextY]=[this.mapNextY,this.mapY];
    this.dyes.forEach((d,i)=>{
      const next=this.dyeNext[i],source=this.sources[i];
      this.advectPigment(d,next);
      this.gatherRainPigment(next);
      let transportedMass=0,guideMass=0;
      for(let k=0;k<n;k++){
        this.guideSamples[k]=this.sampleGuide(source,k);
        transportedMass+=next[k];guideMass+=this.guideSamples[k];
      }
      // Preserve each sea's pigment budget. A gradual return toward its
      // moving broad field keeps distinct seas available for new encounters.
      const correction=this.pigmentMass[i]/Math.max(.00001,transportedMass);
      const guideScale=this.pigmentMass[i]/Math.max(.00001,guideMass);
      const featured=this.confluence?.participants.includes(i)?this.confluenceFrame.intensity:0;
      const renewal=.003+.0015*Math.min(1,(this.seas.length-3)/17)+featured*.003;
      for(let k=0;k<n;k++){
        next[k]*=correction;
        next[k]+=(this.guideSamples[k]*guideScale-next[k])*renewal;
      }
      this.dyes[i]=next;this.dyeNext[i]=d;
    });
    this.steps++;
  }
  encodeLayer(i){
    const pixels=this.seas[i].encode(),dye=this.dyes[i];
    for(let k=0;k<this.length;k++)pixels[k*4+3]=dye[k];
    return pixels;
  }
  encodeState(){
    // One contiguous upload replaces a WebGL call for each sea.
    const stride=this.length*4;
    for(let i=0;i<this.seas.length;i++)this.statePixels.set(this.encodeLayer(i),i*stride);
    this.statePixels.set(this.encodeFlow(),this.seas.length*stride);
    this.statePixels.set(this.encodeRipples(),(this.seas.length+1)*stride);
    return this.statePixels;
  }
  encodeFlow(){
    const p=this.flowPixels;
    for(let k=0;k<this.length;k++){p[k*4]=this.mapX[k];p[k*4+1]=this.mapY[k];p[k*4+2]=this.u[k];p[k*4+3]=this.v[k];}
    return p;
  }
  encodeRipples(){
    const w=this.width,h=this.height,z=this.ripple,p=this.ripplePixels;
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const k=y*w+x,left=y*w+Math.max(0,x-1),right=y*w+Math.min(w-1,x+1);
      const down=Math.max(0,y-1)*w+x,up=Math.min(h-1,y+1)*w+x;
      p[k*4]=z[k];p[k*4+1]=(z[right]-z[left])*.5*(w-1)/this.rippleAspect;
      p[k*4+2]=(z[up]-z[down])*.5*(h-1);
      p[k*4+3]=Math.min(1,Math.abs(z[k])*3+Math.abs(this.rippleVelocity[k])*8);
    }
    return p;
  }
}
