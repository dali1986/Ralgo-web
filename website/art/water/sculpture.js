import { randomGenerator } from './simulation.js?v=38';
import { smoothJourney } from './spectacles.js?v=38';
import { screenToScene } from './camera.js?v=38';

const TAU=Math.PI*2,clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export const SCULPTURE_PREFERENCE='what-water:sculpture';
export function sculpturePreference(reducedMotion,storage){
  try{const saved=storage?.getItem(SCULPTURE_PREFERENCE);if(saved==='on'||saved==='off')return saved==='on';}catch{}
  return false;
}
export function rememberSculpture(enabled,storage){try{storage?.setItem(SCULPTURE_PREFERENCE,enabled?'on':'off');}catch{}}

// A separate active-time clock leaves all existing sea/event randomness intact.
export class LiquidSculpture {
  constructor(seed,enabled=false){
    this.enabled=enabled;this.time=0;this.previousTime=0;this.active=null;this.manualCount=0;
    this.random=randomGenerator((seed^0x54A13DC7)>>>0);
    this.nextAt=20+this.random()*10;this.nextWake=0;this.wakeIndex=0;
  }
  setEnabled(enabled){
    if(enabled===this.enabled)return;
    this.enabled=enabled;this.active=null;
    if(enabled)this.nextAt=this.time+16+this.random()*12;
  }
  start(manual=false){
    if(!this.enabled||this.active)return false;
    const r=this.random;
    this.active={start:this.time,duration:20,phase:r()*TAU,rotation:(r()-.5)*.65,hand:r()<.5?-1:1};
    this.nextAt=this.time+120+r()*60;this.nextWake=this.time;this.wakeIndex=0;
    if(manual)this.manualCount++;
    return true;
  }
  step(dt,busy=false){
    this.previousTime=this.time;this.time+=dt;
    if(this.active&&this.time>=this.active.start+this.active.duration)this.active=null;
    return this.enabled&&!this.active&&!busy&&this.time>=this.nextAt?this.start():false;
  }
  read(blend=1){
    if(!this.enabled||!this.active)return null;
    const age=clamp(this.previousTime+(this.time-this.previousTime)*clamp(blend,0,1)-this.active.start,0,20);
    return {...this.active,age,intensity:smoothJourney(age/5)*(1-smoothJourney((age-13)/7))};
  }
  wake(ocean,camera,aspect){
    const state=this.read();if(!state||state.intensity<.02||this.time<this.nextWake)return;
    this.nextWake=this.time+.24;
    const i=this.wakeIndex++%6,root=restPoint(state,i%3,i<3?.08:.92,aspect);
    const point=screenToScene(.5+root[0]/aspect,.5-root[1],aspect,camera);
    const strength=state.intensity*(state.age>13?.15:.075),direction=i<3?1:-1;
    ocean.disturb(point[0],point[1],{strength,radius:.025/camera[3],aspect,
      dx:direction*.003/camera[3],dy:state.hand*.002/camera[3],human:false,kind:'sculpture'});
  }
  get label(){const s=this.read();return !s?'':s.age<5?'The water rises':s.age<13?'A knot of liquid paint':'The sculpture melts into the sea';}
}

function restPoint(e,i,s,aspect){
  const angle=(i-1)*.27+e.rotation*.28,c=Math.cos(angle),n=Math.sin(angle);
  const x=(s-.5)*.74,y=(i-1)*.125+.028*Math.sin(s*Math.PI*2+e.phase+i);
  return [(x*c-y*n)*aspect,x*n+y*c];
}
function dot(a,b){return a[0]*b[0]+a[1]*b[1]+a[2]*b[2];}
function cross(a,b){return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];}
function normalized(x,y,z){const d=Math.hypot(x,y,z)||1;return [x/d,y/d,z/d];}

// Each sheet is a very flat elliptical tube: paint on both faces, with a real
// fine edge. The original strip's UVs travel with the vertices through the lift.
export class SculptureMesh {
  constructor(length=112,rings=16){
    this.length=length;this.rings=rings;this.stride=9;
    const count=3*(length+1)*rings;
    this.vertices=new Float32Array(count*this.stride);this.projected=new Float32Array(count*4);
    this.indices=new Uint16Array(3*length*rings*6);this.bounds=new Float32Array(3*length*4);
    this.centers=new Float64Array((length+1)*3);this.rest=new Float64Array((length+1)*2);
    let k=0;
    for(let i=0;i<3;i++)for(let row=0;row<length;row++)for(let r=0;r<rings;r++){
      const a=(i*(length+1)+row)*rings+r,b=(i*(length+1)+row)*rings+(r+1)%rings,c=a+rings,d=b+rings;
      this.indices.set([a,b,c,b,d,c],k);k+=6;
    }
  }
  update(state,aspect){
    const {length:n,rings:m,vertices:v,projected:p,centers:c,rest}=this,a=state.intensity;
    const turn=state.rotation+state.hand*.48*smoothJourney(state.age/20),narrow=Math.min(1,aspect);
    for(let i=0;i<3;i++){
      for(let row=0;row<=n;row++){
        const s=row/n,[rx,ry]=restPoint(state,i,s,aspect),theta=(s-.5)*TAU+state.phase*.18;
        const rotation=turn+i*TAU/3,co=Math.cos(rotation),si=Math.sin(rotation);
        const x=.285*Math.sin(theta)+.075*Math.sin(2*theta),y=.205*Math.cos(theta)-.04*Math.cos(3*theta);
        const root=Math.sin(Math.PI*s),lift=a*smoothJourney(Math.min(1,root*2.3));
        const tx=.87*aspect*(x*co-y*si),ty=.74*(x*si+y*co)-.065;
        const z=.19+.108*Math.sin(2*theta+i*TAU/3+state.hand*state.age*.028);
        rest[row*2]=rx;rest[row*2+1]=ry;
        c[row*3]=rx+(tx-rx)*lift;c[row*3+1]=ry+(ty-ry)*lift;c[row*3+2]=z*lift;
      }
      let lastSide=null;
      for(let row=0;row<=n;row++){
        const s=row/n,lo=Math.max(0,row-1),hi=Math.min(n,row+1);
        const tangent=normalized(c[hi*3]-c[lo*3],c[hi*3+1]-c[lo*3+1],c[hi*3+2]-c[lo*3+2]);
        const flatSide=normalized(-(rest[hi*2+1]-rest[lo*2+1]),rest[hi*2]-rest[lo*2],0);
        let side=lastSide||flatSide;const along=dot(side,tangent);
        side=normalized(side[0]-along*tangent[0],side[1]-along*tangent[1],side[2]-along*tangent[2]);
        if(Math.hypot(...side)<.5)side=normalized(-tangent[1],tangent[0],0);
        lastSide=side;let normal=cross(tangent,side);
        const twist=a*Math.sin(Math.PI*s)*(.75*Math.sin(s*TAU+i*1.9)+state.hand*.3),ct=Math.cos(twist),st=Math.sin(twist);
        const twisted=side.map((x,j)=>x*ct+normal[j]*st);normal=normal.map((x,j)=>x*ct-side[j]*st);side=twisted;
        const width=.067*[1.25,.92,.72][i]*narrow*(.65+.35*Math.sin(Math.PI*s))*(1+.12*Math.sin(s*TAU*2+state.phase));
        const thickness=.000003+a*.0032*narrow*Math.sin(Math.PI*s);
        for(let r=0;r<m;r++){
          const cp=Math.cos(r*TAU/m),sp=Math.sin(r*TAU/m),id=(i*(n+1)+row)*m+r,k=id*9;
          const x=c[row*3]+side[0]*width*cp+normal[0]*thickness*sp;
          const y=c[row*3+1]+side[1]*width*cp+normal[1]*thickness*sp;
          const z=Math.max(0,c[row*3+2]+side[2]*width*cp+normal[2]*(thickness-.000003)*sp);
          const nx=side[0]*cp/width+normal[0]*sp/thickness,ny=side[1]*cp/width+normal[1]*sp/thickness,nz=side[2]*cp/width+normal[2]*sp/thickness;
          const norm=1/(Math.hypot(nx,ny,nz)||1);
          const u=.5+(rest[row*2]+flatSide[0]*width*cp)/aspect,w=.5+rest[row*2+1]+flatSide[1]*width*cp;
          v[k]=x;v[k+1]=y;v[k+2]=z;v[k+3]=nx*norm;v[k+4]=ny*norm;v[k+5]=nz*norm;v[k+6]=u;v[k+7]=w;v[k+8]=cp;
          const inverseW=1/(1-z*.8);
          const j=id*4;p[j]=.5+x/aspect*inverseW;p[j+1]=.5+(y+.42*z)*inverseW;p[j+2]=-z*1.7*inverseW;p[j+3]=inverseW;
        }
      }
      for(let row=0;row<n;row++){
        let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
        for(let r=0;r<m*2;r++){
          const k=((i*(n+1)+row)*m+r)*4;
          x0=Math.min(x0,p[k]);y0=Math.min(y0,p[k+1]);x1=Math.max(x1,p[k]);y1=Math.max(y1,p[k+1]);
        }
        this.bounds.set([x0,y0,x1,y1],(i*n+row)*4);
      }
    }
  }
  // Screen UVs here, like WebGL textures, start at the bottom left. Resolve the
  // nearest face and interpolate its source UV in homogeneous coordinates.
  pick(u,v){
    const p=this.projected,vertices=this.vertices,idx=this.indices,boxes=this.bounds;
    let nearest=Infinity,hit=null;
    for(let block=0;block<this.length*3;block++){
      const b=block*4;if(u<boxes[b]||v<boxes[b+1]||u>boxes[b+2]||v>boxes[b+3])continue;
      const start=block*this.rings*6,end=start+this.rings*6;
      for(let t=start;t<end;t+=3){
        const ia=idx[t],ib=idx[t+1],ic=idx[t+2],a=ia*4,b=ib*4,c=ic*4;
        const d=(p[b+1]-p[c+1])*(p[a]-p[c])+(p[c]-p[b])*(p[a+1]-p[c+1]);
        if(Math.abs(d)<1e-12)continue;
        const wa=((p[b+1]-p[c+1])*(u-p[c])+(p[c]-p[b])*(v-p[c+1]))/d;
        const wb=((p[c+1]-p[a+1])*(u-p[c])+(p[a]-p[c])*(v-p[c+1]))/d,wc=1-wa-wb;
        if(wa<-.000001||wb<-.000001||wc<-.000001)continue;
        const depth=wa*p[a+2]+wb*p[b+2]+wc*p[c+2];if(depth>=nearest)continue;
        const q0=wa*p[a+3],q1=wb*p[b+3],q2=wc*p[c+3],q=q0+q1+q2;
        nearest=depth;hit=[(q0*vertices[ia*9+6]+q1*vertices[ib*9+6]+q2*vertices[ic*9+6])/q,
          (q0*vertices[ia*9+7]+q1*vertices[ib*9+7]+q2*vertices[ic*9+7])/q];
      }
    }
    return hit;
  }
}
