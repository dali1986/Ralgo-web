import './fire-synth.js';
class EmberFireProcessor extends AudioWorkletProcessor {
  constructor(options){super();this.synth=new globalThis.FireSynth(sampleRate,options.processorOptions?.seed);this.port.onmessage=e=>this.synth.setControls(e.data);}
  process(inputs,outputs){const out=outputs[0];if(out?.length>=2)this.synth.render(out[0],out[1]);return true;}
}
registerProcessor('ember-fire',EmberFireProcessor);
