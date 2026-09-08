// Adapt presentation cost without changing the seeded fields or paint shader.
// Observe sustained frame delivery, not device names or one isolated hitch.
export class PaintingPerformance {
  constructor({mobile=false}={}){this.mobile=mobile;this.frameMs=1000/(mobile?30:60);this.scale=1;this.stepMs=0;this.reset();}
  reset(){this.nextFrame=0;this.previous=0;this.clearWindow();this.healthyMs=0;}
  clearWindow(){this.elapsed=0;this.samples=0;this.slow=0;this.cpu=0;}
  ready(now){
    // Keep phones at an even 30 fps, with time for touch, sound and compositing.
    // A high-refresh display should not multiply the painting's GPU workload.
    if(!this.nextFrame){this.nextFrame=now+this.frameMs;return true;}
    if(now+.5<this.nextFrame)return false;
    this.nextFrame+=this.frameMs;
    if(this.nextFrame<=now+.5)this.nextFrame=now+this.frameMs;
    return true;
  }
  measureStep(milliseconds){
    // React quickly to a costly step, recover gently after a busy passage.
    this.stepMs=this.stepMs?this.stepMs+(milliseconds-this.stepMs)*(milliseconds>this.stepMs?.5:.05):milliseconds;
  }
  get stepLimit(){return Math.max(1,Math.min(this.mobile?4:6,Math.floor((this.mobile?24:22)/Math.max(.1,this.stepMs))));}
  observe(now,cpuMilliseconds){
    const gap=this.previous?now-this.previous:0;this.previous=now;
    if(gap<=0||gap>1000){this.clearWindow();this.healthyMs=0;return false;}
    const slowFrame=this.mobile?38:40;
    this.elapsed+=gap;this.samples++;this.slow+=gap>slowFrame?1:0;this.cpu+=cpuMilliseconds;
    if(this.elapsed<(this.mobile?1200:2000)||this.samples<8)return false;
    const interval=this.elapsed/this.samples,cpu=this.cpu/this.samples;
    const overloaded=interval>slowFrame&&this.slow/this.samples>.45&&cpu<interval*.8;
    this.healthyMs=interval<(this.mobile?35:22)&&cpu<(this.mobile?18:16)?this.healthyMs+this.elapsed:0;
    const before=this.scale;
    if(overloaded){this.scale=Math.max(.60,this.scale*.92);this.healthyMs=0;}
    else if(this.healthyMs>=12000){this.scale=Math.min(1,this.scale*1.04);this.healthyMs=0;}
    this.clearWindow();return this.scale!==before;
  }
}

// Keep every executed physics step the original size. If a machine cannot
// keep up, let the tide run more slowly instead of accumulating a burst of work.
// Events, music and camera still follow the same uninterrupted simulation clock.
export function simulationBatch(accumulator,delta,rate,limit){
  const total=accumulator+Math.min(.1,Math.max(0,delta))*rate;
  const due=Math.floor(total*30+1e-9);
  return {steps:Math.min(due,limit),remainder:Math.max(0,total-due/30)};
}

export function paintingSize(width,height,dpr,seaCount,scale=1,mobile=false){
  const pixels=(mobile?600000:900000)*Math.min(1.2,Math.sqrt(5/Math.max(3,seaCount)));
  const ratio=Math.min(dpr||1,mobile?1.25:1.5,Math.sqrt(pixels/Math.max(1,width*height)))*scale;
  return [Math.max(1,Math.floor(width*ratio)),Math.max(1,Math.floor(height*ratio))];
}

// Select the dynamics grid once per painting. All seas remain present and use
// the same solver; fine paint marks are evaluated by the full material shader.
// Never regrid a running tide or restart it when a phone rotates.
export function simulationSize(seaCount,mobile=false){
  const scale=Math.min(1,Math.sqrt(7/seaCount));
  return mobile
    ?[Math.max(36,Math.round(72*scale)),Math.max(26,Math.round(52*scale))]
    :[Math.max(48,Math.round(112*scale)),Math.max(34,Math.round(80*scale))];
}
