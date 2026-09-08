// A deterministic, damped wave equation with a slowly changing sediment bed.
// Simulation time advances in fixed steps. All randomness belongs to the seed.
export function randomGenerator(seed) {
  let a = seed >>> 0;
  return () => { a += 0x6D2B79F5; let t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
export class Sea {
  constructor(seed, width = 192, height = 128, boundaryWidth = 12) {
    this.seed=seed; this.width=width; this.height=height; this.length=width*height; this.steps=0;
    for (const name of ['wave','velocity','next','sediment','bed','drivePhase','source','damping']) this[name]=new Float32Array(this.length);
    this.pixels=new Float32Array(this.length*4);
    const rng=randomGenerator(seed); this.phase=rng()*6.283; this.offset=[rng()*40,rng()*40];
    const a=rng()*6.283,b=rng()*6.283,c=rng()*6.283;
    this.composition=new Float32Array([.59+rng()*.27,.43+rng()*.16,2.0+rng()*1.5,(rng()-.5)*.24]);
    for(let y=0;y<height;y++) for(let x=0;x<width;x++) {
      const i=y*width+x,u=x/(width-1),v=y/(height-1);
      const bend=Math.sin(u*5.2+a)*.18 + Math.sin(v*4.1+b)*.15;
      const shelf=.5+.23*Math.sin(v*9+u*3+bend*7+a)+.16*Math.cos(u*8-v*5+b)+.08*Math.sin(u*19+v*17+c);
      this.bed[i]=Math.max(.03,Math.min(.97,shelf));
      this.drivePhase[i]=u*11-v*7+bend*5+a;
      this.wave[i]=.19*Math.sin(u*20-v*13+bend*7+a)+.11*Math.sin(u*8+v*16+b);
      // Both ping-pong buffers have the same fixed boundary. Alternating an
      // initial edge with a zero edge would inject a spurious high-frequency wave.
      if(x===0||y===0||x===width-1||y===height-1)this.wave[i]=0;
      this.source[i]=Math.exp(-Math.pow((u-.04-.025*Math.sin(v*5+b))/.04,2))*.004;
      const edge=Math.min(x,y,width-1-x,height-1-y);
      this.damping[i]=edge<boundaryWidth?.82+.170*edge/boundaryWidth:.990;
    }
    this.encode();
  }
  step(memoryCoupling=true) {
    const {width:w,height:h,wave:z,velocity:vel,next:n,bed,sediment:s}=this;
    const t=this.steps/30;
    for(let y=1;y<h-1;y++) {
     const rowForcing=Math.sin(t*1.05-y/h*5+this.phase);
     for(let x=1;x<w-1;x++) {
      const i=y*w+x,old=z[i],deposit=s[i];
      // Deposits change local propagation speed; unequal neighbouring depths
      // refract the wave. Both flux and source depend on the changing bed.
      const depth=.22-.085*bed[i]-(memoryCoupling?.09*deposit:0);
      const left=.22-.085*bed[i-1]-(memoryCoupling?.09*s[i-1]:0);
      const right=.22-.085*bed[i+1]-(memoryCoupling?.09*s[i+1]:0);
      const down=.22-.085*bed[i-w]-(memoryCoupling?.09*s[i-w]:0);
      const up=.22-.085*bed[i+w]-(memoryCoupling?.09*s[i+w]:0);
      const flux=(z[i-1]-old)*(depth+left)*.5+(z[i+1]-old)*(depth+right)*.5+(z[i-w]-old)*(depth+down)*.5+(z[i+w]-old)*(depth+up)*.5;
      const forcing=this.source[i]*rowForcing+.00048*Math.sin(t*.65+this.drivePhase[i]+(memoryCoupling?deposit*3:0));
      const speed=(vel[i]+flux-old*.003+forcing)*this.damping[i];
      vel[i]=speed; n[i]=old+speed;
      const slope=Math.abs(z[i+1]-z[i-1])+Math.abs(z[i+w]-z[i-w]);
      // Suspended material settles in slower water behind a positive crest.
      // Strong flow erodes old deposits. The bounded bed never grows forever.
      const settling=Math.max(0,old+.12)*(.0022+slope*.0038)*(1-Math.min(.85,Math.abs(speed)*5));
      const erosion=.000075+Math.abs(speed)*.0038;
      s[i]=Math.max(0,Math.min(1,deposit+settling*(1-deposit)-erosion*deposit));
     }
    }
    this.wave=n; this.next=z; this.steps++;
  }
  encode() {
    const p=this.pixels;
    for(let i=0;i<this.length;i++) {
      p[i*4]=this.sediment[i];
      p[i*4+1]=this.wave[i];
      p[i*4+2]=this.bed[i];
      p[i*4+3]=Math.min(1,Math.abs(this.velocity[i])*12);
    }
    return p;
  }
  get time(){return this.steps/30;}
}
