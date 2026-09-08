// Slow changes of fuel, with a single shared source for visible and audible events.
(() => {
  'use strict';
  const ease=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
  class HearthLife {
    constructor(random=Math.random){
      this.random=random;this.seed=random()*90;this.serial=0;this.current=null;
      this.next=12+random()*9;this.origins=[[-.68,.11],[-.20,.11],[.29,.05],[.72,.08]];
      this.bands=Array.from({length:4},()=>({from:.84+random()*.30,to:.68+random()*.57,start:0,end:65+random()*130}));
      this.air={from:1,to:.91+random()*.18,start:0,end:9+random()*12};
      this.draft={from:0,to:(random()-.5)*.48,start:0,end:4+random()*10};
      this.fuel=new Float32Array(4);this.weather=new Float32Array([1,0,this.seed,0]);this.event=new Float32Array([0,0,-1,0]);
    }
    sample(time){
      let started=null;
      if(time>=this.next){
        const zone=Math.floor(this.random()*4),choice=this.random(),kind=choice<.45?'crack':choice<.77?'catch':'settle';
        const [x,y]=this.origins[zone];
        this.current={id:++this.serial,zone,kind,x:x+(this.random()-.5)*.09,y,start:time,power:.55+this.random()*.40};
        this.next=time+20+this.random()*32;started=this.current;
      }
      const e=this.current,age=e?time-e.start:-1;
      const swell=e?ease(age/2.4)*(1-ease((age-7)/9))*e.power:0;
      for(let i=0;i<4;i++){
        const b=this.bands[i];
        while(time>=b.end){b.from=b.to;b.to=.66+this.random()*.61;b.start=b.end;b.end+=70+this.random()*160;}
        this.fuel[i]=b.from+(b.to-b.from)*ease((time-b.start)/(b.end-b.start))+(e?.zone===i?swell*.20:0);
      }
      // Draughts take irregular turns and include quiet spells; they do not
      // repeat a sine-wave sway or make every tongue breathe on the same beat.
      for(const [band,low,range,minimum,span] of [[this.air,.88,.23,7,17],[this.draft,-.27,.54,3.5,12]]){
        while(time>=band.end){band.from=band.to;band.to=low+this.random()*range;band.start=band.end;band.end+=minimum+this.random()*span;}
      }
      this.weather[0]=this.air.from+(this.air.to-this.air.from)*ease((time-this.air.start)/(this.air.end-this.air.start));
      this.weather[1]=this.draft.from+(this.draft.to-this.draft.from)*ease((time-this.draft.start)/(this.draft.end-this.draft.start));
      this.weather[3]=e?e.power:0;
      this.event.set(e?[e.x,e.y,age,e.kind==='crack'?1:e.kind==='catch'?2:3]:[0,0,-1,0]);
      return {fuel:this.fuel,weather:this.weather,event:this.event,started};
    }
  }
  window.HearthLife=HearthLife;
})();
