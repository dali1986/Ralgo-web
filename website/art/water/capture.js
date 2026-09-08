// Record the artwork canvas and its own audio mix. No microphone, camera,
// screen-sharing permission, or page chrome participates in the capture.
export function recordingTypes(Recorder=globalThis.MediaRecorder){
 const types=['video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/mp4','video/webm;codecs=vp8,opus','video/webm'];
 return Recorder?types.filter(type=>Recorder.isTypeSupported?.(type)):[];
}
export function videoExtension(type){return /mp4/i.test(type)?'mp4':/matroska/i.test(type)?'mkv':/ogg/i.test(type)?'ogv':'webm';}
export class ArtworkRecorder {
 constructor(canvas,sound,{onState=()=>{},onComplete=()=>{},onError=()=>{}}={}){
  this.canvas=canvas;this.sound=sound;this.onState=onState;this.onComplete=onComplete;this.onError=onError;
  this.state='idle';this.revision=0;this.chunks=[];this.stream=null;this.recorder=null;this.audio=null;
 }
 get supported(){return typeof globalThis.MediaRecorder==='function'&&typeof this.canvas.captureStream==='function';}
 get active(){return this.state!=='idle';}
 get elapsed(){return this.state==='recording'||this.state==='stopping'?Math.max(0,(performance.now()-this.started)/1000):0;}
 notify(){this.onState({state:this.state,elapsed:this.elapsed,limit:this.limit});}
 async start({seconds=30,filename='what-the-water-kept'}={}){
  if(this.active)return false;
  if(!this.supported){this.onError('Video recording is unavailable in this browser. You can still save a PNG.');return false;}
  const revision=++this.revision;this.state='starting';this.limit=Math.max(1,Math.min(180,Number(seconds)||30));this.filename=filename;this.reason='';this.notify();
  let audio=null,stream=null;
  try{
   // The fixed capture surface survives viewport changes and PNG exports.
   const stage=document.createElement('canvas');
   stage.width=Math.max(2,Math.floor(this.canvas.width/2)*2);stage.height=Math.max(2,Math.floor(this.canvas.height/2)*2);
   const ctx=stage.getContext('2d',{alpha:false});if(!ctx)throw new Error('The video canvas could not be created.');
   stream=stage.captureStream(30);
   try{audio=await this.sound.recordingStream();}catch{/* Video remains available when audio is unavailable. */}
   if(revision!==this.revision){stream.getTracks().forEach(t=>t.stop());audio?.getTracks().forEach(t=>t.stop());return false;}
   audio?.getAudioTracks().forEach(track=>stream.addTrack(track));
   this.stage=stage;this.ctx=ctx;this.stream=stream;this.audio=audio;this.chunks=[];this.bytes=0;this.lastFrame=-Infinity;
   const types=[...recordingTypes(),''];let recorder;
   for(const mimeType of types){
    try{
     const candidate=new MediaRecorder(stream,{...(mimeType?{mimeType}:{}),videoBitsPerSecond:6000000,audioBitsPerSecond:160000});
     candidate.ondataavailable=event=>{
      if(candidate!==this.recorder||!event.data?.size)return;
      this.chunks.push(event.data);this.bytes+=event.data.size;
      if(this.bytes>=96*1024*1024)this.stop('The clip reached its size limit.');
     };
     candidate.onstop=()=>this.finish(candidate);
     candidate.onerror=()=>{
      if(candidate!==this.recorder)return;
      this.reason='Recording stopped early.';this.state='stopping';clearInterval(this.timer);clearTimeout(this.deadline);this.notify();
      // The recording spec delivers final data after the error, then stop.
     };
     candidate.start(1000);this.recorder=recorder=candidate;break;
    }catch{recorder=null;}
   }
   if(!recorder)throw new Error('This browser could not start a video recording. Try saving a PNG.');
   this.started=performance.now();this.state='recording';this.draw(true);this.notify();
   this.timer=setInterval(()=>{this.notify();if(this.elapsed>=this.limit)this.stop();},200);
   this.deadline=setTimeout(()=>this.stop(),this.limit*1000);
   this.withAudio=!!audio;return true;
  }catch(error){
   stream?.getTracks().forEach(t=>t.stop());audio?.getTracks().forEach(t=>t.stop());
   if(revision===this.revision){this.cleanup();this.state='idle';this.notify();this.onError(error.message||'The video could not be recorded.');}
   return false;
  }
 }
 draw(force=false){
  if(this.state!=='recording'||!this.ctx)return;
  const now=performance.now();if(!force&&now-this.lastFrame<1000/30)return;
  this.lastFrame=now;
  // Cover the original frame without changing the output dimensions or
  // stretching the painting if the device rotates during a clip.
  const sw=this.canvas.width,sh=this.canvas.height,w=this.stage.width,h=this.stage.height;
  const scale=Math.max(w/sw,h/sh),cw=w/scale,ch=h/scale;
  this.ctx.drawImage(this.canvas,(sw-cw)/2,(sh-ch)/2,cw,ch,0,0,w,h);
 }
 stop(reason=''){
  if(this.state==='idle'||this.state==='stopping')return;
  if(this.state==='starting'){this.revision++;this.state='idle';this.notify();return;}
  this.reason=reason;this.state='stopping';clearInterval(this.timer);clearTimeout(this.deadline);this.notify();
  try{if(this.recorder.state!=='inactive')this.recorder.stop();}
  catch{this.finish(this.recorder);}
 }
 finish(recorder){
  if(recorder!==this.recorder)return;
  const type=recorder.mimeType||this.chunks[0]?.type||'video/webm';
  const blob=new Blob(this.chunks,{type}),filename=this.filename+'.'+videoExtension(type),reason=this.reason;
  const result={blob,filename,extension:videoExtension(type),reason,withAudio:this.withAudio,width:this.stage.width,height:this.stage.height};
  this.cleanup();this.state='idle';this.notify();
  if(blob.size)this.onComplete(result);else this.onError('No video frames were saved. Please try recording again.');
 }
 cleanup(){
  clearInterval(this.timer);clearTimeout(this.deadline);
  this.stream?.getTracks().forEach(t=>t.stop());this.audio?.getTracks().forEach(t=>t.stop());
  this.stream=null;this.audio=null;this.recorder=null;this.ctx=null;this.stage=null;this.chunks=[];
 }
}
