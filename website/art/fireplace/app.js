(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const canvas = $('fire');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const state = {time:0,heat:1,palette:0,clarity:.90,volume:.65,auto:!reducedMotion,gap:25,paused:false,immersed:false,vision:null,next:6,frame:0,lastMask:-1,pointer:[0,.3,0],base:.31,height:.44,spread:.60};
  state.cue=[0,0,0,0];state.camera=[1,0,0];state.event=[0,.6,-1,0];
  state.ambient=false;state.quiet=true;state.hudIdle=false;
  const hearthLife=new HearthLife(),initialHearth=hearthLife.sample(0);
  state.fuelHeat=initialHearth.fuel;state.weather=initialHearth.weather;state.hearthEvent=initialHearth.event;
  const names=Object.keys(FireScenes.visions);
  let bag=[],lastId='',gl,program,texture,buffer,uniforms={},raf=0,lastTime=0,noticeTimer=0;
  let fireAudio=null,soundWanted=false;
  let hudTimer=0,keyboardNavigation=false,pointerHeld=false;
  let perfFrames=0,perfTotal=0,pixelBudget=1100000,contextLost=false;
  let thermalProgram,thermalUniforms={},fuelTexture,fields=[],fieldIndex=0;
  let prompts=null;
  const fieldWidth=640,fieldHeight=448;
  $('auto').checked=state.auto;
  function notice(text){$('notice').textContent=text;$('notice').classList.add('visible');clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>$('notice').classList.remove('visible'),2600);}
  function shader(type,source){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s;}
  function link(fragment){
    const p=gl.createProgram(),v=shader(gl.VERTEX_SHADER,FIRE_VERTEX),f=shader(gl.FRAGMENT_SHADER,fragment);
    gl.attachShader(p,v);gl.attachShader(p,f);gl.bindAttribLocation(p,0,'position');gl.linkProgram(p);
    if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(p));
    gl.deleteShader(v);gl.deleteShader(f);return p;
  }
  function filteredTexture(unit){
    const tex=gl.createTexture();gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,tex);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);return tex;
  }
  function setup(){
    gl=canvas.getContext('webgl',{alpha:false,antialias:false,depth:false,stencil:false,preserveDrawingBuffer:false,powerPreference:'high-performance'});
    if(!gl)throw new Error('WebGL unavailable');
    program=link(FIRE_FRAGMENT);thermalProgram=link(FIRE_THERMAL);gl.useProgram(program);
    buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
    const position=gl.getAttribLocation(program,'position');gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
    for(const key of ['resolution','time','heat','vision','clarity','palette','base','height','spread','pointer','thermal','cue','camera','event','fuelHeat','weather','hearthEvent','lettering'])uniforms[key]=gl.getUniformLocation(program,key);
    for(const key of ['history','scene','fuel','fieldSize','time','delta','vision','clarity','ignition','pointer','cue','reset','fuelHeat','weather','hearthEvent','lettering'])thermalUniforms[key]=gl.getUniformLocation(thermalProgram,key);
    texture=filteredTexture(0);
    FireScenes.render('dance',0);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,FireScenes.canvas);
    gl.uniform1i(uniforms.thermal,1);
    fuelTexture=filteredTexture(2);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,FireScenes.fuelCanvas);
    fields=[];fieldIndex=0;
    for(let i=0;i<2;i++){
      const tex=filteredTexture(1);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,fieldWidth,fieldHeight,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
      const fbo=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,tex,0);
      if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw new Error('Thermal framebuffer unavailable');
      gl.clearColor(0,0,0,1);gl.clear(gl.COLOR_BUFFER_BIT);fields.push({texture:tex,fbo});
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER,null);
    resize();
  }
  function flowHeat(delta,amount,ignition,reset=false){
    gl.useProgram(thermalProgram);
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);
    gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,fields[fieldIndex].texture);
    gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,fuelTexture);
    gl.bindFramebuffer(gl.FRAMEBUFFER,fields[1-fieldIndex].fbo);gl.viewport(0,0,fieldWidth,fieldHeight);
    gl.uniform1i(thermalUniforms.history,1);gl.uniform1i(thermalUniforms.scene,0);gl.uniform1i(thermalUniforms.fuel,2);
    gl.uniform2f(thermalUniforms.fieldSize,fieldWidth,fieldHeight);
    gl.uniform1f(thermalUniforms.time,state.time);gl.uniform1f(thermalUniforms.delta,delta);gl.uniform1f(thermalUniforms.vision,amount);
    gl.uniform1f(thermalUniforms.clarity,state.clarity);gl.uniform1f(thermalUniforms.ignition,ignition);gl.uniform3fv(thermalUniforms.pointer,state.pointer);
    gl.uniform4fv(thermalUniforms.cue,state.cue);gl.uniform1f(thermalUniforms.reset,reset?1:0);
    gl.uniform1f(thermalUniforms.lettering,state.vision?.id==='letters'?1:0);
    for(const key of ['fuelHeat','weather','hearthEvent'])gl.uniform4fv(thermalUniforms[key],state[key]);
    gl.drawArrays(gl.TRIANGLES,0,6);fieldIndex=1-fieldIndex;
    gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,canvas.width,canvas.height);
  }
  function resize(){
    const w=window.innerWidth,h=window.innerHeight;
    const ratio=Math.min(window.devicePixelRatio||1,1.5,Math.sqrt(pixelBudget/(w*h)));
    canvas.width=Math.max(1,Math.round(w*ratio));canvas.height=Math.max(1,Math.round(h*ratio));
    gl.viewport(0,0,canvas.width,canvas.height);
    const portrait=w/h<.9;
    state.base=portrait?.40:.31;state.height=portrait?.42:.44;state.spread=Math.min(.60,w/h*.43);
    if(h<620&&w>700){state.base=.36;state.height=.41;}
    draw();
  }
  function nextId(){
    if(!bag.length){bag=names.slice();for(let i=bag.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[bag[i],bag[j]]=[bag[j],bag[i]];}
      if(bag[bag.length-1]===lastId)[bag[0],bag[bag.length-1]]=[bag[bag.length-1],bag[0]];
    }return bag.pop();
  }
  function nextGap(){return state.gap*(.75+Math.random()*.50);}
  function summon(id){
    prompts?.cancel();
    if(id==='random'||!id)id=nextId();
    lastId=id;state.vision={id,start:state.time,duration:FireScenes.profiles[id].duration+(id==='letters'?0:Math.random()*2)};state.lastMask=-1;
    const title=FireScenes.visions[id];$('scene-title').textContent=title[0];$('scene-line').textContent=title[1];
    $('scene-phase').textContent='A VISION IS GATHERING';
    if(state.paused)setPaused(false);
  }
  function envelope(age,duration,fadeIn=6.2,fadeOut=7.8){const up=Math.min(1,Math.max(0,age/fadeIn));const down=Math.min(1,Math.max(0,(duration-age)/fadeOut));return up*up*(3-2*up)*down*down*(3-2*down);}
  function draw(delta=0,refreshField=false){
    if(!gl||contextLost)return;
    const hearth=hearthLife.sample(state.time);
    if(hearth.started&&!state.paused)fireAudio?.fireEvent(hearth.started);
    let amount=0,ignition=0;
    state.cue=[0,0,0,0];state.camera=[1,0,0];state.event=[0,.6,-1,0];
    if(state.vision){
      const v=state.vision,age=state.time-v.start,profile=FireScenes.profiles[v.id];
      amount=envelope(age,v.duration,profile.fadeIn,profile.fadeOut);
      ignition=Math.min(1.62,age*(profile.ignitionSpeed??.24));
      if(age>=v.duration){state.vision=null;state.next=state.time+nextGap();$('scene-phase').textContent='ONLY FIRE, FOR A MOMENT';$('scene-title').textContent='Everything returns to embers.';$('scene-line').textContent=state.auto?'Another story is finding its shape.':'Call a vision whenever you like.';}
      else{
        const shot=FireScenes.direct(v.id,age,v.duration);
        state.cue=[shot.wind,shot.pulse*amount,shot.hero*amount,shot.out];
        state.camera=state.ambient?[1,0,0]:[shot.zoom,shot.drift,shot.hero*.012*amount];
        state.event=[shot.origin[0],shot.origin[1],shot.burstAge,amount*(1-shot.out)];
        if(state.lastMask<0||state.time-state.lastMask>1/30){
          FireScenes.render(v.id,age,v.duration);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,gl.RGBA,gl.UNSIGNED_BYTE,FireScenes.canvas);
          gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,fuelTexture);gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,gl.RGBA,gl.UNSIGNED_BYTE,FireScenes.fuelCanvas);state.lastMask=state.time;
        }
        if(!state.paused)$('scene-phase').textContent=shot.phase;
        if($('scene-line').textContent!==shot.line)$('scene-line').textContent=shot.line;
      }
    }
    if(delta>0||refreshField)flowHeat(delta,amount,ignition,refreshField);
    gl.useProgram(program);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,fields[fieldIndex].texture);gl.uniform2f(uniforms.resolution,canvas.width,canvas.height);
    for(const key of ['heat','clarity','palette','base','height','spread'])gl.uniform1f(uniforms[key],state[key]);
    gl.uniform1f(uniforms.time,state.time);gl.uniform1f(uniforms.vision,amount);gl.uniform3fv(uniforms.pointer,state.pointer);
    gl.uniform1f(uniforms.lettering,state.vision?.id==='letters'?1:0);
    gl.uniform4fv(uniforms.cue,state.cue);gl.uniform3fv(uniforms.camera,state.camera);gl.uniform4fv(uniforms.event,state.event);
    for(const key of ['fuelHeat','weather','hearthEvent'])gl.uniform4fv(uniforms[key],state[key]);
    gl.drawArrays(gl.TRIANGLES,0,6);
    updateFireAudio();
  }
  function updateFireAudio(force=false){
    const fuel=state.fuelHeat.reduce((a,b)=>a+b,0)*.25;
    fireAudio?.update(state.heat*(.82+fuel*.18)*state.weather[0],document.hidden?0:state.pointer[2],document.hidden?0:state.cue[1],document.hidden?0:state.cue[0]+state.weather[1],force);
  }
  function frame(now){
    if(contextLost)return;
    const delta=lastTime?Math.min((now-lastTime)/1000,.05):0;lastTime=now;
    if(!state.paused&&!document.hidden){
      state.time+=delta*(reducedMotion?.65:1);state.pointer[2]*=Math.exp(-delta*2.0);
      if(state.auto&&!state.vision&&!prompts?.pending&&state.time>=state.next)summon();
      draw(delta*(reducedMotion?.65:1));
      // Keep the artwork fluid on smaller GPUs by lowering render resolution.
      if(delta>0){perfTotal+=delta;perfFrames++;if(perfFrames===150){if(perfTotal/perfFrames>.031&&pixelBudget>400000){pixelBudget=Math.max(400000,pixelBudget*.73);resize();}perfFrames=0;perfTotal=0;}}
    }
    if(!document.hidden)raf=requestAnimationFrame(frame);
  }
  function setPaused(value){
    state.paused=value;$('pause').textContent=value?'Resume':'Pause';$('pause').setAttribute('aria-pressed',String(value));document.body.classList.toggle('paused',value);
    if(value)$('scene-phase').textContent='A MOMENT HELD IN THE FIRE';
    else if(!state.vision)$('scene-phase').textContent='THE FIRE IS DREAMING';
    syncAudio();wakeHud();
  }
  function armHud(){
    clearTimeout(hudTimer);
    if(!state.quiet||state.paused||state.immersed||!$('settings').hidden||!$('prompt-panel').hidden||document.hidden||contextLost||pointerHeld)return;
    hudTimer=setTimeout(()=>{
      if(keyboardNavigation&&document.activeElement?.closest('.chrome'))return;
      state.hudIdle=true;document.body.classList.add('watching');
    },11000);
  }
  function wakeHud(){
    state.hudIdle=false;document.body.classList.remove('watching');armHud();
  }
  function immerse(value){prompts?.close();state.immersed=value;document.body.classList.toggle('immersed',value);$('restore').hidden=!value;if(value)$('restore').focus();else $('immerse').focus();$('settings').hidden=true;$('settings-toggle').setAttribute('aria-expanded','false');wakeHud();}
  function pointerEvent(e){
    if(state.hudIdle){wakeHud();return;}
    const uvx=e.clientX/window.innerWidth,uvy=1-e.clientY/window.innerHeight;
    state.pointer[0]=(uvx-.5)*(window.innerWidth/window.innerHeight)/state.spread;
    state.pointer[1]=(uvy-state.base)/state.height;
    state.pointer[0]=state.pointer[0]/state.camera[0]+state.camera[1];
    state.pointer[1]=(state.pointer[1]-.32)/state.camera[0]+.32+state.camera[2];
    state.pointer[2]=e.type==='pointerdown'?2:1;
    if(state.paused)draw();
  }
  canvas.addEventListener('pointermove',pointerEvent);canvas.addEventListener('pointerdown',pointerEvent);
  $('summon').addEventListener('click',()=>summon($('scene').value));
  $('scene').addEventListener('change',()=>{if($('scene').value!=='random')summon($('scene').value);});
  $('palette').addEventListener('change',()=>{state.palette=Number($('palette').value);draw();});
  function rangeFeedback(id){
    const input=$(id),value=Number(input.value);
    const percent=(value-Number(input.min))/(Number(input.max)-Number(input.min))*100;
    const label=id==='frequency'?value+' seconds':Math.round(value*100)+'%';
    input.style.setProperty('--range-progress',percent+'%');
    $(id+'-value').value=label;
    input.setAttribute('aria-valuetext',label);
  }
  for(const id of ['heat','clarity','frequency','volume']){
    rangeFeedback(id);
    const update=()=>{
      rangeFeedback(id);
      if(id==='heat')state.heat=Number($(id).value);
      else if(id==='clarity')state.clarity=Number($(id).value);
      else if(id==='volume'){state.volume=Number($(id).value);fireAudio?.setVolume(state.volume);}
      else{state.gap=Number($(id).value);if(!state.vision)state.next=state.time+state.gap;}
      if(id==='heat'||id==='clarity')draw(0,true);
    };
    $(id).addEventListener('input',update);
    $(id).addEventListener('change',update);
  }
  $('pace').addEventListener('change',()=>{
    state.ambient=$('pace').value==='ambient';state.gap=state.ambient?180:25;
    $('frequency').value=String(state.gap);rangeFeedback('frequency');
    if(!state.vision)state.next=state.time+nextGap();draw();
  });
  $('quiet').addEventListener('change',()=>{state.quiet=$('quiet').checked;wakeHud();});
  $('auto').addEventListener('change',()=>{state.auto=$('auto').checked;state.next=state.time+(state.ambient?nextGap():Math.min(state.gap,8));});
  $('pause').addEventListener('click',()=>setPaused(!state.paused));
  $('immerse').addEventListener('click',()=>immerse(true));$('restore').addEventListener('click',()=>immerse(false));
  function settings(open){if(open)prompts?.close();$('settings').hidden=!open;$('settings-toggle').setAttribute('aria-expanded',String(open));wakeHud();}
  prompts=createPromptUI({summon,wake:wakeHud,closeSettings:()=>settings(false)});
  $('settings-toggle').addEventListener('click',()=>settings($('settings').hidden));$('close-settings').addEventListener('click',()=>settings(false));
  document.addEventListener('pointermove',()=>{keyboardNavigation=false;wakeHud();},{passive:true});
  document.addEventListener('pointerdown',e=>{keyboardNavigation=false;pointerHeld=true;wakeHud();if(!$('settings').contains(e.target)&&!$('settings-toggle').contains(e.target))settings(false);},{passive:true});
  for(const event of ['pointerup','pointercancel'])document.addEventListener(event,()=>{pointerHeld=false;armHud();},{passive:true});
  document.addEventListener('focusin',wakeHud);
  document.addEventListener('keydown',e=>{
    keyboardNavigation=true;wakeHud();
    if(/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)&&e.code!=='Escape')return;
    if(e.target.tagName==='BUTTON'&&e.code==='Space')return;
    if(e.code==='Space'){e.preventDefault();setPaused(!state.paused);}
    if(e.code==='KeyV')summon($('scene').value);
    if(e.code==='KeyH')immerse(!state.immersed);
    if(e.code==='Escape'){if(!$('prompt-panel').hidden)prompts.close(true);settings(false);if(state.immersed)immerse(false);}
  });
  // Start only on request. The audio thread keeps the hearth alive between frames.
  function soundFeedback(){
    $('sound').setAttribute('aria-pressed',String(soundWanted));
    $('sound').querySelector('span').textContent=soundWanted?'on':'off';
  }
  function audioFailed(engine){
    if(engine!==fireAudio)return;
    soundWanted=false;fireAudio=null;soundFeedback();engine?.close().catch(()=>{});
    notice('Sound couldn’t start. Tap Sound to try again.');
  }
  async function syncAudio(){
    const engine=fireAudio;if(!engine)return;
    try{
      await engine.setActive(soundWanted&&!state.paused&&!contextLost);
      if(engine===fireAudio)updateFireAudio(true);
    }catch{audioFailed(engine);}
  }
  $('sound').addEventListener('click',()=>{
    soundWanted=!soundWanted;soundFeedback();
    try{
      if(soundWanted&&!fireAudio){const engine=new FireAudio(state.volume);fireAudio=engine;engine.onerror=()=>audioFailed(engine);}
      syncAudio();
    }catch{audioFailed(fireAudio);}
  });
  document.addEventListener('visibilitychange',()=>{cancelAnimationFrame(raf);lastTime=0;pointerHeld=false;wakeHud();if(document.hidden){state.pointer[2]=0;updateFireAudio(true);}else if(!contextLost){raf=requestAnimationFrame(frame);syncAudio();}});
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();contextLost=true;cancelAnimationFrame(raf);syncAudio();wakeHud();notice('The fire is resting. Reconnecting…');});
  canvas.addEventListener('webglcontextrestored',()=>{try{contextLost=false;setup();state.lastMask=-1;lastTime=0;raf=requestAnimationFrame(frame);syncAudio();wakeHud();}catch{fail();}});
  function fail(){contextLost=true;syncAudio();wakeHud();$('error').hidden=false;document.querySelector('header').hidden=true;document.querySelector('main').hidden=true;}
  try{setup();window.addEventListener('resize',resize);if(reducedMotion){setPaused(true);$('scene-title').textContent='A quiet fire.';$('scene-line').textContent='Press Resume when you’re ready for movement.';}raf=requestAnimationFrame(frame);armHud();}
  catch(err){console.error('Fireplace setup:',err);fail();}
})();
