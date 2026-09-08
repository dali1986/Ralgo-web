import { Ocean } from './ocean.js?v=38';
import { SeaCamera, screenToScene } from './camera.js?v=38';
import { vertex, fragmentForMedium } from './shader.js?v=38';
import { ensembleForSeed, MAX_SEAS } from './ensemble.js?v=38';
import { SeaEvents, EVENT_SHORTCUTS } from './events.js?v=38';
import { EventRenderer } from './event-renderer.js?v=38';
import { WaterSound } from './sound.js?v=38';
import { ArtworkRecorder } from './capture.js?v=38';
import { LiquidSculpture, sculpturePreference, rememberSculpture } from './sculpture.js?v=38';
import { SculptureRenderer } from './sculpture-renderer.js?v=38';
import { mediumFor, nextMedium, readMedium, rememberMedium } from './medium.js?v=38';
import { PaintingPerformance, simulationBatch, paintingSize, simulationSize } from './performance.js?v=38';

const canvas=document.querySelector('#sea');
const $=id=>document.getElementById(id);
let gl,program,texture,previousTexture,styleTexture,nextStyleTexture,sea,frameHandle,events,eventRenderer;
let ensemble,seas=[],blend=1,exporting=false;
let playbackRate=2;
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
// Touch-first devices get their own workload from the first frame. This is
// fixed for the visit so rotating the phone cannot alter its evolving seas.
const mobilePainting=matchMedia('(pointer:coarse)').matches;
let preferenceStorage;try{preferenceStorage=window.localStorage;}catch{}
let paintingMedium=readMedium(preferenceStorage);
let sculptureEnabled=sculpturePreference(reducedMotion,preferenceStorage),sculpture,sculptureRenderer;
let running=!reducedMotion,cameraDrifting=!reducedMotion,journeysEnabled=!reducedMotion,viewpoint;
let memoryTarget=0,memoryBlend=0,last=0,accumulator=0,noticeTimer;
let seed=readSeed();
let activePointer=null,displayedCamera=null;
const disturbances=[];
const sound=new WaterSound();
const performanceBudget=new PaintingPerformance({mobile:mobilePainting});
let hudVisible=true,hudBeforeImmersion=true,savingImage=false,videoUrl=null,imageUrl=null,resumeAfterPreview=false;
const recorder=new ArtworkRecorder(canvas,sound,{onState:updateRecordingControl,onComplete:videoReady,onError:message=>{announce(message);$('capture-status').textContent=message;}});
function setHudVisible(visible){
  hudVisible=visible;
  if(!visible&&document.activeElement?.closest('.chrome'))canvas.focus({preventScroll:true});
  for(const element of document.querySelectorAll('.chrome')){element.inert=!visible;element.setAttribute('aria-hidden',String(!visible));}
  document.body.classList.toggle('hud-hidden',!visible);$('show-hud').hidden=visible;
  $('hud-toggle').setAttribute('aria-pressed',String(visible));
  $('touch-hide-hud').setAttribute('aria-expanded',String(visible));$('show-hud').setAttribute('aria-expanded',String(visible));
  if(visible&&document.activeElement===$('show-hud'))$(matchMedia('(pointer:coarse), (max-width:760px)').matches?'touch-hide-hud':'hud-toggle').focus({preventScroll:true});
}
function toggleHud(){setHudVisible(!hudVisible);}
function updateRecordingControl({state,elapsed=0,limit=30}){
  const active=state!=='idle',stopping=state==='stopping';
  $('record-stop').hidden=!active;$('record-stop').disabled=stopping;
  $('record-button').disabled=stopping||!recorder.supported;
  $('record-duration').disabled=active;
  $('record-button').textContent=state==='starting'?'Cancel recording':stopping?'Finishing video…':active?'Stop recording':'Record video';
  $('record-stop-label').textContent=state==='starting'?'Cancel':stopping?'Finishing':'Stop';
  const seconds=Math.floor(elapsed);$('record-clock').textContent=String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');
  $('capture-open').classList.toggle('recording',active);
  if(active)$('capture-status').textContent=state==='starting'?'Preparing the recording…':stopping?'Finishing your clip…':'Recording · '+Math.min(limit,seconds)+' / '+limit+' seconds';
}
function videoReady(result){
  if(videoUrl)URL.revokeObjectURL(videoUrl);videoUrl=URL.createObjectURL(result.blob);
  const link=$('video-download');link.href=videoUrl;link.download=result.filename;link.textContent='Download '+result.extension.toUpperCase();
  $('video-preview').src=videoUrl;$('video-result').hidden=false;
  $('capture-status').textContent=(result.reason?result.reason+' ':'')+'Your video is ready · '+result.width+' × '+result.height+'.';
  announce('Your video is ready to download.');
  if(!document.hidden&&!document.querySelector('dialog[open]'))openDialog('capture-dialog');
}
function openCapture(){
  if(!recorder.supported){$('record-button').disabled=true;$('capture-status').textContent='Video recording is unavailable in this browser. You can still save a PNG.';}
  openDialog('capture-dialog');
}
async function toggleRecording(){
  if(recorder.active){recorder.stop();return;}
  if(savingImage||!sea||document.hidden||gl.isContextLost())return;
  $('video-preview').pause();
  const started=await recorder.start({seconds:Number($('record-duration').value),filename:'what-the-water-kept-'+String(seed).padStart(6,'0')+'-'+sea.steps+'-'+paintingMedium.key+'-video'});
  if(!started)return;
  if(!running){running=true;last=0;updatePlayback();}
  $('capture-dialog').close();canvas.focus({preventScroll:true});
  announce(recorder.withAudio?'Recording the painting. Sound on adds the music.':'Recording the painting without audio.');
}
let soundBusy=false;
function soundTime(){return events?events.displayTime(blend):0;}
function soundActive(){return running&&!exporting&&!document.hidden&&!!gl&&!gl.isContextLost();}
function updateSoundControl(){
  const enabled=sound.enabled,interrupted=enabled&&sound.context?.state!=='running';
  $('sound-label').textContent=interrupted?'Resume sound':enabled?'Sound on':'Sound off';
  $('sound').setAttribute('aria-pressed',String(enabled));
  $('sound').setAttribute('aria-label',interrupted?'Resume sound':enabled?'Mute the music':'Enable the music');
  $('sound').title=(interrupted?'Resume sound':enabled?'Mute sound':'Enable sound')+' · A · Volume in About';
}
sound.onStateChange=updateSoundControl;
function soundFailed(){sound.disable();updateSoundControl();announce('Sound could not start. Try the sound button again.');}
async function toggleSound(){
  if(soundBusy)return;
  if(sound.enabled&&sound.context?.state==='running'){sound.disable();updateSoundControl();announce('Sound off.');return;}
  soundBusy=true;$('sound').disabled=true;
  try{if(await sound.enable()){sound.setPlaying(soundActive(),soundTime());updateSoundControl();announce(running?'The seas have a voice.':'Sound is ready. Press Play to hear the seas.');}}
  catch{soundFailed();}
  finally{soundBusy=false;$('sound').disabled=false;}
}
function soundTouch(point,drag=false){
  try{sound.setPlaying(soundActive(),soundTime());sound.touch(soundTime(),point[0],point[1],drag,events);}catch{soundFailed();}
}
function readSeed(){const n=Number(new URL(location.href).searchParams.get('seed'));return Number.isInteger(n)&&n>=1&&n<=999999?n:42;}
function announce(message){$('notice').textContent=message;$('notice').classList.add('visible');clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>$('notice').classList.remove('visible'),2800);}
function shader(type,source){const sh=gl.createShader(type);gl.shaderSource(sh,source);gl.compileShader(sh);if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS)){const message=gl.getShaderInfoLog(sh);gl.deleteShader(sh);throw new Error(message);}return sh;}
let uniforms;
const paintingPrograms=new Map();
const uniformNames=['resolution','state','previousState','gridSize','interpolation','time','seaCount','seaStyles','nextSeaStyles','seaTransition','materialChange','materialSeas','memoryView','camera','artMedium'];
function activatePaintingProgram(medium){
  let entry=paintingPrograms.get(medium.id);
  if(!entry){
    const candidate=gl.createProgram();let vs,fs;
    try{
      vs=shader(gl.VERTEX_SHADER,vertex);fs=shader(gl.FRAGMENT_SHADER,fragmentForMedium(medium.id));
      gl.attachShader(candidate,vs);gl.attachShader(candidate,fs);
      gl.bindAttribLocation(candidate,0,'position');gl.linkProgram(candidate);
      if(!gl.getProgramParameter(candidate,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(candidate));
      entry={program:candidate,uniforms:Object.fromEntries(uniformNames.map(n=>[n,gl.getUniformLocation(candidate,n)]))};
    }catch(error){gl.deleteProgram(candidate);throw error;}
    finally{if(vs)gl.deleteShader(vs);if(fs)gl.deleteShader(fs);}
  }
  // Only retain the current and most recently used style on small GPUs.
  paintingPrograms.delete(medium.id);paintingPrograms.set(medium.id,entry);
  program=entry.program;uniforms=entry.uniforms;gl.useProgram(program);
  gl.uniform1i(uniforms.state,0);gl.uniform1i(uniforms.previousState,1);gl.uniform1i(uniforms.seaStyles,2);gl.uniform1i(uniforms.nextSeaStyles,3);
  gl.uniform1i(uniforms.seaCount,seas.length);
  if(paintingPrograms.size>2){const [key,old]=paintingPrograms.entries().next().value;paintingPrograms.delete(key);gl.deleteProgram(old.program);}
}
function setup(){
  gl=canvas.getContext('webgl2',{alpha:false,antialias:false,depth:false,stencil:false,preserveDrawingBuffer:true,powerPreference:'high-performance'});
  if(!gl)throw new Error('WebGL 2 is unavailable.');
  paintingPrograms.clear();activatePaintingProgram(paintingMedium);
  const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
  const loc=gl.getAttribLocation(program,'position');gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,2,gl.FLOAT,false,0,0);
  function makeTexture(){const tex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D_ARRAY,tex);for(const side of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D_ARRAY,side,gl.CLAMP_TO_EDGE);for(const filter of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D_ARRAY,filter,gl.NEAREST);return tex;}
  gl.activeTexture(gl.TEXTURE0);texture=makeTexture();previousTexture=makeTexture();
  function makeStyleTexture(){
    const tex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,tex);
    for(const edge of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,edge,gl.CLAMP_TO_EDGE);
    for(const filter of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,filter,gl.NEAREST);
    return tex;
  }
  styleTexture=makeStyleTexture();nextStyleTexture=makeStyleTexture();eventRenderer=new EventRenderer(gl);sculptureRenderer=new SculptureRenderer(gl);
  begin(seed,false);
  $('loading').classList.add('done');setTimeout(()=>$('loading').hidden=true,900);
  updatePlayback();updateCameraControl();updateSculptureControl();updateMediumControl();frameHandle=requestAnimationFrame(frame);
}
function begin(value,updateAddress=true){
  releasePointer();disturbances.length=0;
  gl.useProgram(program);gl.bindVertexArray(null);
  seed=value;ensemble=ensembleForSeed(seed);
  const grid=simulationSize(ensemble.count,mobilePainting),referenceGrid=simulationSize(ensemble.count);
  // Keep the absorbing rim the same physical breadth on the smaller grid.
  sea=new Ocean(ensemble,...grid,12*Math.min(grid[0]/referenceGrid[0],grid[1]/referenceGrid[1]));
  seas=sea.seas;viewpoint=new SeaCamera(seed,{moving:cameraDrifting,journeys:journeysEnabled});
  sculptureRenderer.releaseTargets();sculpture=new LiquidSculpture(seed,sculptureEnabled);
  $('journeys-enabled').checked=journeysEnabled;
  accumulator=0;last=0;blend=1;performanceBudget.reset();
  gl.activeTexture(gl.TEXTURE0);
  for(const tex of [texture,previousTexture]){
    gl.bindTexture(gl.TEXTURE_2D_ARRAY,tex);
    gl.texImage3D(gl.TEXTURE_2D_ARRAY,0,gl.RGBA32F,sea.width,sea.height,seas.length+2,0,gl.RGBA,gl.FLOAT,null);
    uploadState();
  }
  gl.uniform1i(uniforms.seaCount,ensemble.count);
  seas.forEach((member,i)=>ensemble.packed.styles.set(member.offset,i*60));
  events=new SeaEvents(seed,ensemble);
  sound.reset(seed,ensemble);
  gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,styleTexture);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA32F,15,MAX_SEAS,0,gl.RGBA,gl.FLOAT,ensemble.packed.styles);
  gl.activeTexture(gl.TEXTURE3);gl.bindTexture(gl.TEXTURE_2D,nextStyleTexture);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA32F,15,MAX_SEAS,0,gl.RGBA,gl.FLOAT,ensemble.packed.styles);
  $('tide-label').title=ensemble.description;
  canvas.setAttribute('aria-label',ensemble.count+' interacting seas: '+ensemble.description+'. Click or tap for ripples, drag to stir, or press Enter for a ripple at the center.');
  $('seed-label').textContent=String(seed).padStart(6,'0');
  if(updateAddress){const url=new URL(location.href);url.searchParams.set('seed',seed);history.replaceState(null,'',url);}
  updateTime();resize();
}
function uploadState(){
  gl.texSubImage3D(gl.TEXTURE_2D_ARRAY,0,0,0,0,sea.width,sea.height,seas.length+2,gl.RGBA,gl.FLOAT,sea.encodeState());
}
function simulationTime(){return Math.max(0,(sea.steps-1+blend)/30);}
function resize(draw=true){
  if(!gl||exporting)return;
  const rect=canvas.getBoundingClientRect();
  const [width,height]=paintingSize(rect.width,rect.height,devicePixelRatio,seas.length,performanceBudget.scale,mobilePainting);
  if(canvas.width!==width)canvas.width=width;
  if(canvas.height!==height)canvas.height=height;
  if(sea)sea.rippleAspect=Math.min(canvas.width/canvas.height,2.05);
  if(draw!==false){performanceBudget.reset();render();}
}
function render(){
  if(!gl||!sea||gl.isContextLost())return;
  const aspect=Math.min(canvas.width/canvas.height,2.05);
  sculptureRenderer.prepare(sculpture.read(blend),canvas.width,canvas.height,aspect);
  if(sculptureRenderer.failed&&sculptureEnabled){
    sculptureEnabled=false;sculpture.setEnabled(false);updateSculptureControl();
    announce('Liquid sculpture could not start on this device. The water continues.');
  }
  sculptureRenderer.begin();
  gl.useProgram(program);gl.bindVertexArray(null);
  events.snapshot(events.displayTime(blend),sea,blend);
  gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D_ARRAY,texture);
  gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D_ARRAY,previousTexture);
  gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,styleTexture);
  gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,15,MAX_SEAS,gl.RGBA,gl.FLOAT,events.styles);
  gl.activeTexture(gl.TEXTURE3);gl.bindTexture(gl.TEXTURE_2D,nextStyleTexture);
  gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,15,MAX_SEAS,gl.RGBA,gl.FLOAT,events.nextStyles);
  gl.uniform2fv(uniforms.seaTransition,events.transition);
  gl.uniform4fv(uniforms.materialChange,events.materialUniform);gl.uniform3iv(uniforms.materialSeas,events.materialSeas);
  gl.viewport(0,0,canvas.width,canvas.height);
  gl.uniform2f(uniforms.resolution,canvas.width,canvas.height);
  gl.uniform2f(uniforms.gridSize,sea.width,sea.height);
  gl.uniform1f(uniforms.interpolation,blend);
  gl.uniform1f(uniforms.time,simulationTime());
  displayedCamera=viewpoint.read(blend,Math.min(canvas.width/canvas.height,2.05));
  if(activePointer&&!exporting){activePointer.point=pointForEvent(activePointer);sea.setTouch(activePointer.point);}
  gl.uniform4fv(uniforms.camera,displayedCamera);
  gl.uniform1f(uniforms.memoryView,memoryBlend);
  gl.uniform1i(uniforms.artMedium,paintingMedium.id);
  gl.drawArrays(gl.TRIANGLES,0,6);
  sculptureRenderer.waterComplete();
  eventRenderer.draw(events,canvas.width,canvas.height,displayedCamera,memoryBlend,paintingMedium.id);
  sculptureRenderer.finish(paintingMedium.id);
  if(!exporting)try{recorder.draw();}catch{recorder.stop('The picture changed while recording.');}
}
let lastLabel=-1;
function updateTime(){
  const seconds=Math.floor(sea.time);lastLabel=seconds;
  $('elapsed').textContent=String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');
  const passage=[sculpture.label,sculpture.active?'':viewpoint.label,events.label].filter(Boolean).join(' · ');
  $('tide-label').textContent=memoryTarget?'What remains':passage||ensemble.name;
  $('tide-label').title=[passage,events.description].filter(Boolean).join('\n');
}
function frame(now){
  frameHandle=requestAnimationFrame(frame);
  if(exporting||document.hidden){last=0;performanceBudget.reset();return;}
  if(!performanceBudget.ready(now))return;
  const delta=last?Math.min((now-last)/1000,.10):0;last=now;
  const frameStarted=performance.now();
  const disturbed=applyDisturbances();let changed=disturbed,simulated=false;
  if(running){
    const batch=simulationBatch(accumulator,delta,playbackRate,performanceBudget.stepLimit);
    accumulator=batch.remainder;
    for(let count=0;count<batch.steps;count++){
      const stepStarted=performance.now();
      const activeDelta=1/(30*playbackRate),aspect=Math.min(canvas.width/canvas.height,2.05);
      events.step(sea,activeDelta);
      if(sculpture.step(activeDelta,!!events.tracks.confluence))viewpoint.freeze(1);
      sculpture.wake(sea,viewpoint.read(1,aspect),aspect);
      sea.step();
      if(!sculpture.active)viewpoint.step(sea,events,activeDelta,1/30);
      performanceBudget.measureStep(performance.now()-stepStarted);
      // Only the last two states are ever displayed. Earlier catch-up steps
      // need neither encoding nor a megabyte-scale transfer to the GPU.
      if(count>=batch.steps-2){
        const spare=previousTexture;previousTexture=texture;texture=spare;
        gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D_ARRAY,texture);uploadState();
      }
      simulated=true;
    }
    blend=sea.steps?Math.max(0,Math.min(1,accumulator*30)):1;changed=true;
  }
  // A paused painting still accepts a touch. Both interpolation textures get
  // the held disturbance, which propagates when playback resumes.
  if(disturbed&&!simulated){
    gl.activeTexture(gl.TEXTURE0);
    for(const tex of [texture,previousTexture]){gl.bindTexture(gl.TEXTURE_2D_ARRAY,tex);uploadState();}
  }
  if(memoryBlend!==memoryTarget){
    memoryBlend+=(memoryTarget-memoryBlend)*Math.min(1,delta*4);
    if(Math.abs(memoryBlend-memoryTarget)<.0001)memoryBlend=memoryTarget;
    changed=true;
  }
  // Resize immediately before drawing so no cleared canvas is presented.
  if(running&&performanceBudget.observe(now,performance.now()-frameStarted))resize(false);
  else if(!running)performanceBudget.reset();
  if(changed)render();
  try{sound.tick(soundTime(),events,soundActive());}catch{soundFailed();}
  if(Math.floor(sea.time)!==lastLabel)updateTime();
}
function pointForEvent(event){
  if(!sea||!displayedCamera||exporting||gl.isContextLost())return null;
  const rect=canvas.getBoundingClientRect(),u=(event.clientX-rect.left)/rect.width,v=(event.clientY-rect.top)/rect.height;
  if(!Number.isFinite(u)||!Number.isFinite(v)||u<0||u>1||v<0||v>1)return null;
  return pointOnPainting(u,v);
}
function pointOnPainting(u,v){
  const lifted=sculptureRenderer.pick(u,1-v);
  return screenToScene(lifted?lifted[0]:u,lifted?1-lifted[1]:v,Math.min(canvas.width/canvas.height,2.05),displayedCamera);
}
function enqueueDisturbance(point,dx=0,dy=0,strength=1){
  // Bounded input work even for high-frequency pens or a long rapid stroke.
  if(disturbances.length>=96)disturbances.shift();
  disturbances.push({point,dx,dy,strength,aspect:Math.min(canvas.width/canvas.height,2.05),radius:.042/displayedCamera[3]});
}
function applyDisturbances(){
  if(!disturbances.length)return false;
  let changed=false;
  for(const input of disturbances.splice(0,48))changed=sea.disturb(input.point[0],input.point[1],input)||changed;
  return changed;
}
function releasePointer(){
  const pointer=activePointer;activePointer=null;canvas.classList.remove('stirring');
  sea?.setTouch(null);
  if(pointer&&canvas.hasPointerCapture?.(pointer.id))canvas.releasePointerCapture(pointer.id);
}
canvas.addEventListener('pointerdown',event=>{
  if(event.button!==0||activePointer)return;
  const point=pointForEvent(event);if(!point)return;
  event.preventDefault();activePointer={id:event.pointerId,point,clientX:event.clientX,clientY:event.clientY};
  sea.setTouch(point);
  canvas.focus({preventScroll:true});
  canvas.setPointerCapture(event.pointerId);canvas.classList.add('stirring');
  enqueueDisturbance(point,0,0,event.pointerType==='pen'?.4+event.pressure*.8:1);
  soundTouch(point);
});
canvas.addEventListener('pointermove',event=>{
  if(!activePointer||activePointer.id!==event.pointerId)return;
  if(event.pointerType==='mouse'&&!(event.buttons&1)){releasePointer();return;}
  const point=pointForEvent(event),previous=activePointer.point,oldX=activePointer.clientX,oldY=activePointer.clientY;activePointer.point=point;
  activePointer.clientX=event.clientX;activePointer.clientY=event.clientY;
  sea.setTouch(point);
  if(!point||!previous)return;
  const dx=point[0]-previous[0],dy=point[1]-previous[1],aspect=Math.min(canvas.width/canvas.height,2.05);
  const distance=Math.hypot(dx*aspect,dy);if(distance<.0001)return;
  if(sculptureRenderer.visible){
    // Crossing an occluding fold can jump to another part of the source paint.
    // Begin a fresh stroke there instead of dragging a line through both seas.
    const rect=canvas.getBoundingClientRect(),screenDistance=Math.hypot((event.clientX-oldX)/rect.width*aspect,(event.clientY-oldY)/rect.height);
    if(distance>Math.max(.055,screenDistance*6)/displayedCamera[3])return;
  }
  event.preventDefault();
  // Resample by distance so a smooth wake does not depend on event frequency.
  soundTouch(point,true);
  const samples=Math.min(32,Math.ceil(distance/.014)),pressure=event.pointerType==='pen'?.4+event.pressure*.8:1;
  const strength=Math.min(1,distance/samples/.014)*.32*pressure;
  for(let i=1;i<=samples;i++)enqueueDisturbance([previous[0]+dx*i/samples,previous[1]+dy*i/samples],dx/distance*.014,dy/distance*.014,strength);
});
for(const name of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(name,event=>{
  if(activePointer?.id===event.pointerId)releasePointer();
});
canvas.addEventListener('keydown',event=>{
  if(event.key!=='Enter'||event.repeat||!sea||!displayedCamera||exporting||gl.isContextLost())return;
  event.preventDefault();event.stopPropagation();
  const point=pointOnPainting(.5,.5);enqueueDisturbance(point);soundTouch(point);
});
function updatePlayback(){
  $('pause').setAttribute('aria-label',running?'Pause the water':'Play the water');$('pause').title=running?'Pause · Space':'Play · Space';
  $('pause-glyph').setAttribute('d',running?'M8 5v14M16 5v14':'m8 4 11 8-11 8Z');
}
function updateMediumControl(){
  document.body.dataset.medium=paintingMedium.key;
  $('medium-select').value=paintingMedium.key;
  for(const input of document.querySelectorAll('input[name="painting-medium"]'))input.checked=input.value===paintingMedium.key;
}
function changeMedium(value){
  const next=mediumFor(value);if(next===paintingMedium)return;
  try{activatePaintingProgram(next);}catch(error){console.error(error);updateMediumControl();announce('This style could not start on this device. Your current painting is still here.');return;}
  paintingMedium=next;rememberMedium(next,preferenceStorage);performanceBudget.reset();updateMediumControl();render();
  announce(next.label+'.');
}
function updateCameraControl(){
  $('camera').setAttribute('aria-pressed',String(cameraDrifting));
  $('camera').setAttribute('aria-label',cameraDrifting?'Hold the camera still':'Resume the camera');
  $('camera').title=(cameraDrifting?'Hold the viewpoint':'Resume camera')+' · C';
}
function toggleCamera(){
  cameraDrifting=!cameraDrifting;viewpoint.setMoving(cameraDrifting,blend);updateCameraControl();render();
  announce(cameraDrifting?(sculpture.active?'The camera will continue when the sculpture settles.':'The camera continues its passage.'):'The viewpoint is held.');
}
function updateSculptureControl(){
  $('sculpture-label').textContent=sculptureEnabled?'Sculpture on':'Sculpture off';
  $('sculpture-toggle').setAttribute('aria-pressed',String(sculptureEnabled));
  $('sculpture-toggle').title=(sculptureEnabled?'Turn liquid sculpture off':'Turn liquid sculpture on')+' · L';
  $('sculpture-enabled').checked=sculptureEnabled;$('sculpture-button').disabled=!sculptureEnabled;
}
function setSculptureEnabled(enabled){
  sculptureEnabled=enabled;sculpture.setEnabled(enabled);rememberSculpture(enabled,preferenceStorage);
  if(!enabled)sculptureRenderer.releaseTargets();else sculptureRenderer.failed=false;
  updateSculptureControl();updateTime();render();
  announce(enabled?'Liquid sculpture on. Press K or choose Raise the water to begin one.':'Liquid sculpture off. The water stays flat.');
}
function callSculpture(){
  if(!sea||exporting||document.hidden||gl.isContextLost())return;
  if(!sculptureEnabled){announce('Turn Sculpture on first.');return;}
  if(!sculpture.start(true)){announce('The liquid sculpture is still unfolding.');return;}
  viewpoint.freeze(blend);updateTime();render();canvas.focus({preventScroll:true});
  announce(running?'The painting lifts into a liquid sculpture.':'The sculpture is ready. Press Play to raise the water.');
}
function callJourney(){
  if(!sea||exporting||document.hidden||gl.isContextLost())return;
  if(sculpture.active){announce('Let the sculpture settle before starting a camera journey.');return;}
  if(viewpoint.journey||viewpoint.returning){announce('The current camera passage is still unfolding.');return;}
  viewpoint.freeze(blend);cameraDrifting=true;viewpoint.setMoving(true);
  viewpoint.startJourney(sea,events,true);updateCameraControl();updateTime();render();canvas.focus({preventScroll:true});
  announce(running?'Travelling into the meeting of seas.':'The journey is ready. Press Play to travel.');
}
function togglePlayback(){running=!running;last=0;updatePlayback();sound.setPlaying(soundActive(),soundTime());announce(running?'The water moves again.':'A moment held.');}
function nextSea(){
  const a=new Uint32Array(1);let candidate;
  // Do not reject a repeated sea count: that would flatten the chosen curve.
  // Rejection at the integer boundary removes modulo bias in seed selection.
  const limit=Math.floor(4294967296/999999)*999999;
  do{crypto.getRandomValues(a);candidate=a[0]%999999+1;}while(a[0]>=limit||candidate===seed);
  begin(candidate);announce(ensemble.count+' different seas. A new meeting.');
}
function changeSpeed(){playbackRate=playbackRate===1?2:playbackRate===2?4:1;$('speed').textContent=playbackRate+'×';$('speed').setAttribute('aria-label','Playback speed '+playbackRate+' times. Click to change.');announce(playbackRate+'× tide speed.');}
function toggleMemory(){memoryTarget=memoryTarget?0:1;$('traces').setAttribute('aria-pressed',String(!!memoryTarget));updateTime();announce(memoryTarget?'The sediment left by the waves.':'Back to the water.');}
function callEvent(kind){
  if(!sea||!events||exporting||document.hidden||gl.isContextLost())return;
  const result=events.trigger(kind,events.displayTime(blend),sea);if(!result)return;
  canvas.focus({preventScroll:true});
  updateTime();render();
  announce(result.label+(running?(result.waiting?' follows in a moment.':'.'):' is ready. Press Space to let it unfold.'));
}
async function saveImage(){
  if(savingImage||!sea||gl.isContextLost())return;
  const highResolution=!recorder.active,button=$('save');savingImage=true;button.disabled=true;exporting=highResolution;
  if(highResolution)sound.setPlaying(false,soundTime());
  const savedStep=sea.steps,savedSeed=seed,savedStirred=sea.disturbanceCount>0,savedEvents=events.manualCount>0,savedMemory=memoryTarget,savedSculpture=sculptureRenderer.visible,savedMedium=paintingMedium.key;
  const oldWidth=canvas.width,oldHeight=canvas.height;
  try{
    if(highResolution){
      const maxSize=Math.min(3840,gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),gl.getParameter(gl.MAX_VIEWPORT_DIMS)[0],sculptureRenderer.visible?gl.getParameter(gl.MAX_TEXTURE_SIZE):Infinity);
      const factor=maxSize/Math.max(oldWidth,oldHeight);canvas.width=Math.max(1,Math.round(oldWidth*factor));canvas.height=Math.max(1,Math.round(oldHeight*factor));render();
    }
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
    if(!blob)throw new Error('Image could not be encoded.');
    if(imageUrl)URL.revokeObjectURL(imageUrl);imageUrl=URL.createObjectURL(blob);
    const a=$('image-download');a.href=imageUrl;a.download='what-the-water-kept-'+String(savedSeed).padStart(6,'0')+'-'+savedStep+'-'+savedMedium+(savedStirred?'-stirred':'')+(savedEvents?'-events':'')+(savedMemory?'-sediment':'')+(savedSculpture?'-sculpture':'')+'.png';a.hidden=false;a.click();announce('This moment is yours to keep.');
  }catch(error){console.error(error);announce('The image could not be saved. Please try again.');}
  finally{if(highResolution){canvas.width=oldWidth;canvas.height=oldHeight;exporting=false;resize();last=0;}button.disabled=false;exporting=false;savingImage=false;}
}
async function immerse(){
  const entering=!document.body.classList.contains('immersed');document.body.classList.toggle('immersed',entering);$('leave-immersion').hidden=!entering;
  if(entering){hudBeforeImmersion=hudVisible;setHudVisible(false);try{await $('artwork').requestFullscreen?.();}catch{/* Immersion also works without fullscreen permission. */}$('leave-immersion').focus();}
  else{setHudVisible(hudBeforeImmersion);if(document.fullscreenElement)try{await document.exitFullscreen();}catch{}if(hudVisible)$('immerse').focus();else canvas.focus();}
  resize();
}
function openDialog(id){$(id).showModal();}
$('pause').addEventListener('click',togglePlayback);
document.querySelectorAll('input[name="painting-medium"]').forEach(input=>input.addEventListener('change',()=>{if(input.checked)changeMedium(input.value);}));
$('medium-select').addEventListener('change',event=>changeMedium(event.target.value));
$('capture-open').addEventListener('click',openCapture);
$('record-button').addEventListener('click',toggleRecording);
$('record-stop').addEventListener('click',()=>recorder.stop());
$('hud-toggle').addEventListener('click',toggleHud);
$('touch-hide-hud').addEventListener('click',()=>setHudVisible(false));
$('show-hud').addEventListener('click',()=>setHudVisible(true));
$('capture-dialog').addEventListener('close',()=>$('video-preview').pause());
$('video-preview').addEventListener('play',()=>{resumeAfterPreview=running;if(running)togglePlayback();});
function finishVideoPreview(){if(resumeAfterPreview){resumeAfterPreview=false;if(!running)togglePlayback();}}
$('video-preview').addEventListener('pause',finishVideoPreview);
$('video-preview').addEventListener('ended',finishVideoPreview);
$('sound').addEventListener('click',toggleSound);
$('sound-volume').addEventListener('input',event=>{sound.setVolume(Number(event.target.value)/100);$('sound-volume-value').textContent=event.target.value+'%';});
$('speed').addEventListener('click',changeSpeed);
$('camera').addEventListener('click',toggleCamera);
$('sculpture-toggle').addEventListener('click',()=>setSculptureEnabled(!sculptureEnabled));
$('sculpture-enabled').addEventListener('change',event=>setSculptureEnabled(event.target.checked));
$('sculpture-button').addEventListener('click',()=>{$('about-dialog').close();callSculpture();});
$('restart').addEventListener('click',()=>{begin(seed);announce('The first tide, again.');});
$('new-sea').addEventListener('click',nextSea);$('traces').addEventListener('click',toggleMemory);$('save').addEventListener('click',saveImage);
$('immerse').addEventListener('click',immerse);$('leave-immersion').addEventListener('click',immerse);
$('about-button').addEventListener('click',()=>openDialog('about-dialog'));
$('confluence-button').addEventListener('click',()=>{$('about-dialog').close();callEvent('confluence');});
$('material-button').addEventListener('click',()=>{$('about-dialog').close();callEvent('material');});
$('journey-button').addEventListener('click',()=>{$('about-dialog').close();callJourney();});
$('journeys-enabled').addEventListener('change',event=>{
  journeysEnabled=event.target.checked;viewpoint.setJourneys(journeysEnabled,blend,Math.min(canvas.width/canvas.height,2.05));render();
  announce(journeysEnabled?'Occasional cinematic journeys are on.':'Automatic journeys are off. The camera will return gently.');
});
$('seed-button').addEventListener('click',()=>{$('seed-input').value=seed;openDialog('seed-dialog');$('seed-input').select();});
$('seed-form').addEventListener('submit',event=>{event.preventDefault();const value=Number($('seed-input').value);if(!Number.isInteger(value)||value<1||value>999999)return;begin(value);$('seed-dialog').close();});
document.querySelectorAll('[data-close]').forEach(button=>button.addEventListener('click',()=>button.closest('dialog').close()));
document.querySelectorAll('dialog').forEach(dialog=>dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}}));
document.addEventListener('keydown',event=>{
  if(event.ctrlKey||event.metaKey||event.altKey||event.isComposing||document.querySelector('dialog[open]')||document.activeElement?.isContentEditable||['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName))return;
  const kind=EVENT_SHORTCUTS[event.key.toLowerCase()];
  if(kind){event.preventDefault();if(!event.repeat)callEvent(kind);return;}
  if(event.key.toLowerCase()==='p'){event.preventDefault();if(!event.repeat)changeMedium(nextMedium(paintingMedium).key);return;}
  if(event.key.toLowerCase()==='l'){event.preventDefault();if(!event.repeat)setSculptureEnabled(!sculptureEnabled);return;}
  if(event.key.toLowerCase()==='k'){event.preventDefault();if(!event.repeat)callSculpture();return;}
  if(event.key.toLowerCase()==='j'){event.preventDefault();if(!event.repeat)callJourney();return;}
  if(event.key.toLowerCase()==='a'){event.preventDefault();if(!event.repeat)toggleSound();return;}
  if(event.key.toLowerCase()==='u'){event.preventDefault();if(!event.repeat)toggleHud();return;}
  if(event.key.toLowerCase()==='b'){event.preventDefault();if(!event.repeat)toggleRecording();return;}
  if(event.key.toLowerCase()==='s'){event.preventDefault();if(!event.repeat)saveImage();return;}
  if(event.key==='Escape'){
    if(document.body.classList.contains('immersed'))immerse();else if(!hudVisible)setHudVisible(true);
    return;
  }
  if(event.key.toLowerCase()==='h'){
    event.preventDefault();if(!event.repeat){openDialog('about-dialog');$('event-keys').scrollIntoView({block:'start'});}return;
  }
  if(document.activeElement?.tagName==='BUTTON')return;
  const actions={' ':togglePlayback,n:nextSea,v:changeSpeed,c:toggleCamera,r:()=>begin(seed),m:toggleMemory,f:immerse};
  if(actions[event.key.toLowerCase()]){event.preventDefault();actions[event.key.toLowerCase()]();}
});
document.addEventListener('fullscreenchange',()=>{if(!document.fullscreenElement&&document.body.classList.contains('immersed')){document.body.classList.remove('immersed');$('leave-immersion').hidden=true;setHudVisible(hudBeforeImmersion);if(hudVisible)$('immerse').focus();else canvas.focus();}resize();});
document.addEventListener('visibilitychange',()=>{last=0;sound.setPlaying(soundActive(),soundTime());if(document.hidden){recorder.stop('Recording ended when the tab was hidden.');$('video-preview').pause();releasePointer();disturbances.length=0;}});
window.addEventListener('pagehide',()=>{recorder.stop();sound.setPlaying(false,soundTime());});
window.addEventListener('blur',()=>{releasePointer();disturbances.length=0;});
window.addEventListener('resize',resize);window.addEventListener('popstate',()=>begin(readSeed(),false));
canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();recorder.stop('Recording ended while the canvas was restored.');sound.setPlaying(false,soundTime());releasePointer();disturbances.length=0;cancelAnimationFrame(frameHandle);announce('The water is resting. Restoring the canvas…');});
canvas.addEventListener('webglcontextrestored',()=>{try{setup();announce('The sea has begun again.');}catch(error){fail(error);}});
function fail(error){sound.disable();console.error(error);$('loading').hidden=true;$('unavailable').hidden=false;document.querySelectorAll('.toolbar button').forEach(b=>b.disabled=true);}
try{setup();}catch(error){fail(error);}
