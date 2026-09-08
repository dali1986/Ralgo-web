(() => {
  'use strict';
  class FireAudio {
    constructor(volume=.65){
      const Audio=window.AudioContext||window.webkitAudioContext;
      if(!Audio)throw new Error('Audio unavailable');
      this.context=new Audio({latencyHint:'playback'});this.volume=volume;this.desired=false;this.closed=false;this.epoch=0;this.timer=0;this.lastUpdate=-1;
      this.master=this.context.createGain();this.master.gain.value=0;this.master.connect(this.context.destination);
      this.mix=this.context.createGain();
      const high=this.context.createBiquadFilter();high.type='highpass';high.frequency.value=38;high.Q.value=.55;
      const low=this.context.createBiquadFilter();low.type='lowpass';low.frequency.value=5800;low.Q.value=.58;
      const warm=this.context.createBiquadFilter();warm.type='highshelf';warm.frequency.value=2300;warm.gain.value=-3;
      const gentle=this.context.createDynamicsCompressor();gentle.threshold.value=-22;gentle.knee.value=16;gentle.ratio.value=3;gentle.attack.value=.006;gentle.release.value=.23;
      this.mix.connect(high);high.connect(low);low.connect(warm);warm.connect(gentle);gentle.connect(this.master);
      this.room=this.context.createConvolver();this.room.normalize=false;this.room.buffer=this.roomImpulse();
      const roomLow=this.context.createBiquadFilter();roomLow.type='lowpass';roomLow.frequency.value=2900;
      const wet=this.context.createGain();wet.gain.value=.16;this.room.connect(roomLow);roomLow.connect(wet);wet.connect(this.mix);
      this.ready=this.build();
      // A muted, paused fire may finish loading before it is first resumed.
      this.ready.catch(()=>{});
    }
    roomImpulse(){
      const rate=this.context.sampleRate,length=Math.ceil(rate*.62),buffer=this.context.createBuffer(2,length,rate);
      for(let ch=0;ch<2;ch++){
        const data=buffer.getChannelData(ch);let soften=0;
        for(let i=0;i<length;i++){soften+=((Math.random()*2-1)-soften)*.23;const t=i/rate;data[i]=soften*.013*Math.exp(-t*11)*Math.min(1,t/.013);}
        for(const [t,amp] of [[.017,.14],[.034,.09],[.059,.065],[.087,.035]])data[Math.round((t+ch*.003)*rate)]+=amp;
      }
      return buffer;
    }
    async build(){
      const bits=new Uint32Array(1);if(window.crypto?.getRandomValues)window.crypto.getRandomValues(bits);else bits[0]=Math.random()*4294967296;
      if(this.context.audioWorklet&&window.AudioWorkletNode){
        try{
          await this.context.audioWorklet.addModule(new URL('fire-audio-worklet.js',document.baseURI).href);
          if(this.closed)return;
          this.source=new AudioWorkletNode(this.context,'ember-fire',{numberOfInputs:0,numberOfOutputs:1,outputChannelCount:[2],processorOptions:{seed:bits[0]}});
          this.source.onprocessorerror=()=>this.onerror?.();
        }catch{this.source=null;}
      }
      if(this.closed)return;
      if(!this.source){
        if(!this.context.createScriptProcessor)throw new Error('Audio processing unavailable');
        this.synth=new window.FireSynth(this.context.sampleRate,bits[0]);
        this.source=this.context.createScriptProcessor(1024,0,2);
        this.source.onaudioprocess=e=>this.synth.render(e.outputBuffer.getChannelData(0),e.outputBuffer.getChannelData(1));
      }
      this.source.connect(this.mix);this.source.connect(this.room);
    }
    setVolume(value){
      if(!Number.isFinite(value))return;this.volume=Math.max(0,Math.min(1,value));
      if(this.desired&&this.context.state==='running')this.fade(this.level(),.12);
    }
    level(){return Math.pow(this.volume,1.45)*1.25;}
    fade(value,speed){const now=this.context.currentTime;this.master.gain.cancelScheduledValues(now);this.master.gain.setTargetAtTime(value,now,speed);}
    async setActive(active){
      if(this.closed)return;
      this.desired=active;const epoch=++this.epoch;clearTimeout(this.timer);
      if(active){
        // Resume immediately in the user's gesture, before waiting for the module.
        await Promise.all([this.context.resume(),this.ready]);
        if(epoch===this.epoch&&this.desired)this.fade(this.level(),.55);
      }else{
        this.fade(0,.10);
        this.timer=setTimeout(()=>{if(!this.desired&&epoch===this.epoch)this.context.suspend().catch(()=>{});},700);
      }
    }
    update(heat,stir,pulse,wind,force=false){
      if(!this.source||this.closed)return;const now=this.context.currentTime;if(!force&&now-this.lastUpdate<.075)return;this.lastUpdate=now;
      const data={heat,stir,pulse,wind,linked:!document.hidden};if(this.source.port)this.source.port.postMessage(data);else this.synth.setControls(data);
    }
    fireEvent(event){
      if(!this.source||this.closed||!this.desired||this.context.state!=='running')return;
      const data={event:{id:event.id,kind:event.kind,pan:event.x/.95,power:event.power}};
      if(this.source.port)this.source.port.postMessage(data);else this.synth.setControls(data);
    }
    async close(){this.closed=true;this.desired=false;this.epoch++;clearTimeout(this.timer);if(this.source){this.source.disconnect();this.source.onaudioprocess=null;this.source.onprocessorerror=null;}await this.context.close();}
  }
  window.FireAudio=FireAudio;
})();
