// Continuous stochastic combustion. Shared by the audio thread and its fallback.
(() => {
  'use strict';
  const TAU=Math.PI*2;
  const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
  class FireSynth {
    constructor(rate=48000,seed=0x738a216d){
      this.rate=rate;this.seed=seed>>>0||1;this.sample=0;this.seconds=0;
      this.target={heat:1,stir:0,pulse:0,wind:0};this.heat=1;this.stir=0;this.pulse=0;this.wind=0;
      this.voices=[];this.pending=[];this.maxVoices=48;
      this.zones=[-.62,-.20,.23,.61];this.zone=1;
      this.bed=[this.bedState(),this.bedState()];this.common=this.bedState();
      this.bodyFilter=1-Math.exp(-TAU*260/rate);this.airFilter=1-Math.exp(-TAU*3200/rate);
      this.gritFilter=1-Math.exp(-TAU*1150/rate);this.dcFilter=1-Math.exp(-TAU*32/rate);
      this.slowFilter=1-Math.exp(-TAU*13/rate);this.midFilter=1-Math.exp(-TAU*92/rate);
      this.controlRate=rate/90;this.nextControl=0;
      this.drift=.65;this.driftTarget=.65;this.nextDrift=2;
      this.cluster=0;this.nextCluster=2+this.rand()*3;this.clusterEnd=0;
      this.breath=0;this.breathStart=-100;this.breathLength=1;this.breathStrength=0;this.nextBreath=9+this.rand()*10;
      this.nextLog=5+this.rand()*8;this.nextSettle=22+this.rand()*24;
      this.nextEmber=this.wait(14);this.nextSnap=.4+this.wait(1.8);this.previousPulse=0;this.lastImpact=-10;
      this.linkedUntil=-1;this.lastVisualEvent=0;
      this.metrics={events:0,discarded:0,peakVoices:0,types:{ember:0,snap:0,wood:0,sizzle:0}};
    }
    rand(){let x=this.seed;x^=x<<13;x^=x>>>17;x^=x<<5;this.seed=x>>>0;return this.seed/4294967296;}
    white(){return this.rand()*2-1;}
    wait(rate){return -Math.log(Math.max(.000001,1-this.rand()))/rate;}
    bedState(){return {slow:0,mid:0,body:0,grit:0,air:0,dc:0};}
    setControls(data={}){
      for(const [key,lo,hi] of [['heat',.6,1.45],['stir',0,2],['pulse',0,1],['wind',-1,1]])if(Number.isFinite(data[key]))this.target[key]=clamp(data[key],lo,hi);
      if(typeof data.linked==='boolean')this.linkedUntil=data.linked?this.seconds+1.5:-1;
      const e=data.event;
      if(e&&Number.isFinite(e.id)&&e.id>this.lastVisualEvent&&Number.isFinite(e.pan)&&Number.isFinite(e.power)&&['crack','catch','settle'].includes(e.kind)){
        this.lastVisualEvent=e.id;const t=this.seconds,pan=clamp(e.pan,-.78,.78),power=clamp(e.power,.2,1);
        this.voice(e.kind==='crack'?'wood':'sizzle',pan,power*(e.kind==='crack'?.65:.55));
        for(let i=0;i<(e.kind==='settle'?7:3);i++)this.queue('ember',t+.04+i*.095+this.rand()*.08,pan,power*.55);
        if(e.kind==='catch')this.queue('sizzle',t+.5,pan,power*.35);
      }
    }
    voice(type,pan,scale=1){
      if(this.voices.length>=this.maxVoices){this.metrics.discarded++;return;}
      const r=this.rand(),close=this.rand();
      const specs={
        ember:[.020+r*.035,.006+r*.012,1700+r*2600,.0009+close*.0018,.05],
        snap:[.16+r*.20,.020+r*.053,1500+r*2400,.0017+close*.0035,.19],
        wood:[.21+r*.18,.075+r*.13,450+r*900,.004+close*.006,.67],
        sizzle:[.060+r*.075,.14+r*.25,1700+r*1500,.025+close*.033,.07]
      };
      const [gain,decay,hz,attack,body]=specs[type];
      pan=clamp(pan,-.78,.78);const angle=(pan+1)*Math.PI/4;
      this.voices.push({type,age:0,attack:Math.max(1,attack*this.rate),env:1,decay:Math.exp(-1/(decay*this.rate)),gain:gain*scale,
        lp:0,low:0,dc:0,coef:1-Math.exp(-TAU*hz/this.rate),bodyCoef:1-Math.exp(-TAU*(100+this.rand()*190)/this.rate),
        body,left:Math.cos(angle),right:Math.sin(angle),life:Math.ceil((decay*6+attack)*this.rate)});
      this.metrics.events++;this.metrics.types[type]++;this.metrics.peakVoices=Math.max(this.metrics.peakVoices,this.voices.length);
    }
    queue(type,when,pan,scale){if(this.pending.length<40)this.pending.push({type,when,pan,scale});}
    step(){
      const t=this.seconds,dt=this.controlRate/this.rate;
      for(const key of ['heat','stir','pulse','wind'])this[key]+=(this.target[key]-this[key])*(1-Math.exp(-dt/(key==='heat'?1.8:.45)));
      if(t>=this.nextDrift){this.driftTarget=.30+Math.pow(this.rand(),.7)*.85;this.nextDrift=t+9+this.rand()*27;}
      this.drift+=(this.driftTarget-this.drift)*dt*.15;
      if(t>=this.nextCluster){
        this.zone=Math.floor(this.rand()*4);this.clusterEnd=t+.45+this.rand()*1.35;
        this.nextCluster=this.clusterEnd+1.6+this.wait(.23+.18*this.heat);
        this.cluster=.45+this.rand()*.55;
      }
      if(t>this.clusterEnd)this.cluster*=Math.exp(-dt*4.5);
      if(t>=this.nextBreath){
        this.breathStart=t;this.breathLength=3.5+this.rand()*5.5;this.breathStrength=.25+this.rand()*.45;
        this.nextBreath=t+this.breathLength+10+this.rand()*22;
      }
      const u=clamp((t-this.breathStart)/this.breathLength,0,1);this.breath=Math.sin(Math.PI*u)**2*this.breathStrength;
      const activity=(.50+this.heat*.50)*(.62+this.drift*.56);
      if(t>=this.nextEmber){
        this.voice('ember',this.zones[this.zone]+this.white()*.12,.45+this.rand()*.60);
        this.nextEmber=t+this.wait((8+this.cluster*19+this.stir*4)*activity);
      }
      if(t>=this.nextSnap){
        const pan=this.zones[Math.floor(this.rand()*4)]+this.white()*.08;
        this.voice('snap',pan,.40+this.rand()*.60);
        // A wood fibre can break in a small irregular sequence at one location.
        if(this.rand()<.38){this.queue('ember',t+.022+this.rand()*.11,pan,.75);this.queue('snap',t+.16+this.rand()*.22,pan,.25+this.rand()*.25);}
        this.nextSnap=t+.15+this.wait((.85+this.cluster*2.7)*activity);
      }
      if(t>=this.nextLog){
        if(t>this.linkedUntil){
        const pan=this.zones[Math.floor(this.rand()*4)];this.voice('wood',pan,.45+this.rand()*.35);
        for(let i=0;i<3;i++)this.queue('ember',t+.08+i*.12+this.rand()*.11,pan+this.white()*.06,.55);
        }
        this.nextLog=t+6+this.wait(.13*activity);
      }
      if(t>=this.nextSettle){
        if(t>this.linkedUntil){
        const pan=this.zones[Math.floor(this.rand()*4)];
        for(let i=0;i<7;i++)this.queue(i%3===0?'sizzle':'ember',t+i*.22+this.rand()*.18,pan+this.white()*.15,.45+this.rand()*.28);
        }
        this.nextSettle=t+22+this.wait(.035);
      }
      // Story actions move the air through the same fire; they add no literal effects.
      if(this.pulse>.32&&this.previousPulse<=.32&&t-this.lastImpact>2){
        this.lastImpact=t;this.voice('sizzle',clamp(this.wind*.5,-.5,.5),.43);
        this.queue('ember',t+.12,0,.65);
      }
      this.previousPulse=this.pulse;
      for(let i=this.pending.length-1;i>=0;i--){const e=this.pending[i];if(e.when<=t){this.voice(e.type,e.pan,e.scale);this.pending.splice(i,1);}}
      this.bodyLevel=.53*(.74+this.heat*.26)*(.68+this.drift*.27+this.breath*.35);
      this.airLevel=.016*(.75+this.heat*.25)*(.43+this.drift*.55+this.breath*.72+this.stir*.23+this.pulse*.13);
      this.gritLevel=.033*(.65+this.drift*.48+this.cluster*.30);
    }
    noiseBed(s,n){
      s.slow+=(n-s.slow)*this.slowFilter;s.mid+=(n-s.mid)*this.midFilter;
      s.body+=(n-s.body)*this.bodyFilter;s.grit+=(n-s.grit)*this.gritFilter;s.air+=(n-s.air)*this.airFilter;
      const body=s.body*.72+s.mid*.44+s.slow*.23;
      const v=body*this.bodyLevel+(s.grit-s.body)*this.gritLevel+(s.air-s.grit)*this.airLevel;
      s.dc+=(v-s.dc)*this.dcFilter;return v-s.dc;
    }
    render(left,right){
      for(let i=0;i<left.length;i++){
        if(this.sample>=this.nextControl){this.seconds=this.sample/this.rate;this.step();this.nextControl=this.sample+this.controlRate;}
        const shared=this.noiseBed(this.common,this.white());
        let l=shared*.71+this.noiseBed(this.bed[0],this.white())*.43;
        let r=shared*.71+this.noiseBed(this.bed[1],this.white())*.43;
        for(let j=this.voices.length-1;j>=0;j--){
          const v=this.voices[j],n=this.white();v.lp+=(n-v.lp)*v.coef;v.low+=(n-v.low)*v.bodyCoef;
          const grain=(v.lp-v.low)*(.92-v.body*.28)+v.low*v.body*3.4;
          const attack=Math.min(1,v.age/v.attack);const sample=grain*attack*v.env*v.gain;
          l+=sample*v.left;r+=sample*v.right;v.age++;v.env*=v.decay;
          if(v.age>=v.life||v.env<.001){this.voices[j]=this.voices[this.voices.length-1];this.voices.pop();}
        }
        // Smooth saturation catches coincident pops without a hard digital edge.
        left[i]=l/(1+Math.abs(l)*.65);right[i]=r/(1+Math.abs(r)*.65);this.sample++;
      }
    }
  }
  globalThis.FireSynth=FireSynth;
})();
