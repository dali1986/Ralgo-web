import { SculptureMesh } from './sculpture.js?v=38';

export const sculptureVertex=`#version 300 es
precision highp float;
layout(location=0) in vec3 position;
layout(location=1) in vec3 normal;
layout(location=2) in vec3 paint;
uniform float aspect;
out vec3 surfaceNormal;
out vec2 paintUV;
out float edge;
void main(){
  gl_Position=vec4(position.x*2./aspect,(position.y+.42*position.z)*2.,-position.z*1.7,1.-position.z*.8);
  surfaceNormal=normal;paintUV=paint.xy;edge=paint.z;
}`;
export const sculptureFragment=`#version 300 es
precision highp float;
uniform sampler2D painting;
uniform float intensity;
uniform int artMedium;
in vec3 surfaceNormal;
in vec2 paintUV;
in float edge;
out vec4 colour;
void main(){
  vec3 ink=texture(painting,paintUV).rgb;
  vec3 n=normalize(surfaceNormal);
  if(!gl_FrontFacing)n=-n;
  vec3 eye=normalize(vec3(0.,-.42,1.));
  float facing=abs(dot(n,eye));
  float light=.96+.12*dot(n,normalize(vec3(-.4,.6,1.)));
  float glint=pow(max(0.,dot(reflect(-normalize(vec3(-.45,.7,1.)),n),eye)),45.);
  float rim=pow(1.-facing,4.)*.15;
  vec3 lit=ink*clamp(light,.91,1.12)+vec3(1.,.83,.47)*(rim+glint*.15);
  if(artMedium==1)lit=ink*clamp(light,.94,1.08)+ink*rim*.35;
  else if(artMedium==2)lit=ink*clamp(light,.96,1.045)+ink*rim*.16;
  else if(artMedium==3)lit=ink*clamp(light,.95,1.035);
  else if(artMedium==5||artMedium==6)lit=ink*clamp(light,.94,1.06);
  else if(artMedium==7)lit=ink*clamp(light,.985,1.015)+vec3(1.)*glint*.045;
  else if(artMedium==8)lit=ink*clamp(light,.98,1.025);
  // Full colour survives on the reverse face. No cast shadows or paper gaps.
  float coverage=1.-smoothstep(1.-max(fwidth(edge)*.6,.00001),1.,abs(edge));
  if(coverage<.03)discard;
  colour=vec4(mix(ink,lit,intensity),coverage);
}`;

export class SculptureRenderer {
  constructor(gl){this.gl=gl;this.mesh=new SculptureMesh();this.targets=null;this.program=null;this.visible=false;this.failed=false;}
  initialize(){
    const g=this.gl,shaders=[];let program;
    try{
      program=g.createProgram();if(!program)throw Error('Sculpture program allocation failed.');
      for(const [type,source] of [[g.VERTEX_SHADER,sculptureVertex],[g.FRAGMENT_SHADER,sculptureFragment]]){
        const shader=g.createShader(type);if(!shader)throw Error('Sculpture shader allocation failed.');shaders.push(shader);
        g.shaderSource(shader,source);g.compileShader(shader);
        if(!g.getShaderParameter(shader,g.COMPILE_STATUS))throw Error(g.getShaderInfoLog(shader));g.attachShader(program,shader);
      }
      g.linkProgram(program);if(!g.getProgramParameter(program,g.LINK_STATUS))throw Error(g.getProgramInfoLog(program));
      this.program=program;this.vao=g.createVertexArray();this.buffer=g.createBuffer();this.index=g.createBuffer();
      if(!this.vao||!this.buffer||!this.index)throw Error('Sculpture mesh allocation failed.');
      g.bindVertexArray(this.vao);g.bindBuffer(g.ARRAY_BUFFER,this.buffer);g.bufferData(g.ARRAY_BUFFER,this.mesh.vertices.byteLength,g.DYNAMIC_DRAW);
      for(let i=0;i<3;i++){g.enableVertexAttribArray(i);g.vertexAttribPointer(i,3,g.FLOAT,false,36,i*12);}
      g.bindBuffer(g.ELEMENT_ARRAY_BUFFER,this.index);g.bufferData(g.ELEMENT_ARRAY_BUFFER,this.mesh.indices,g.STATIC_DRAW);
      this.uniforms=Object.fromEntries(['painting','aspect','intensity','artMedium'].map(n=>[n,g.getUniformLocation(program,n)]));
    }catch(error){
      if(program)g.deleteProgram(program);this.program=null;
      if(this.vao)g.deleteVertexArray(this.vao);if(this.buffer)g.deleteBuffer(this.buffer);if(this.index)g.deleteBuffer(this.index);
      this.vao=this.buffer=this.index=null;throw error;
    }finally{for(const shader of shaders)g.deleteShader(shader);g.bindVertexArray(null);}
  }
  releaseTargets(){
    const g=this.gl,t=this.targets;this.targets=null;this.visible=false;
    g.bindFramebuffer(g.FRAMEBUFFER,null);
    if(t){for(const x of t.textures)g.deleteTexture(x);for(const x of t.frames)g.deleteFramebuffer(x);if(t.depth)g.deleteRenderbuffer(t.depth);}
  }
  allocate(width,height){
    if(this.targets?.width===width&&this.targets?.height===height)return;
    this.releaseTargets();const g=this.gl,t=this.targets={width,height,textures:[],frames:[],depth:null};
    try{
      g.activeTexture(g.TEXTURE4);
      for(let i=0;i<2;i++){
        const texture=g.createTexture(),frame=g.createFramebuffer();
        if(texture)t.textures.push(texture);if(frame)t.frames.push(frame);
        if(!texture||!frame)throw Error('Sculpture surface allocation failed.');
        g.bindTexture(g.TEXTURE_2D,texture);
        for(const edge of [g.TEXTURE_WRAP_S,g.TEXTURE_WRAP_T])g.texParameteri(g.TEXTURE_2D,edge,g.CLAMP_TO_EDGE);
        for(const filter of [g.TEXTURE_MIN_FILTER,g.TEXTURE_MAG_FILTER])g.texParameteri(g.TEXTURE_2D,filter,g.LINEAR);
        g.texImage2D(g.TEXTURE_2D,0,g.RGBA8,width,height,0,g.RGBA,g.UNSIGNED_BYTE,null);
        g.bindFramebuffer(g.FRAMEBUFFER,frame);g.framebufferTexture2D(g.FRAMEBUFFER,g.COLOR_ATTACHMENT0,g.TEXTURE_2D,texture,0);
        if(i===1){
          t.depth=g.createRenderbuffer();if(!t.depth)throw Error('Sculpture depth allocation failed.');
          g.bindRenderbuffer(g.RENDERBUFFER,t.depth);g.renderbufferStorage(g.RENDERBUFFER,g.DEPTH_COMPONENT16,width,height);
          g.framebufferRenderbuffer(g.FRAMEBUFFER,g.DEPTH_ATTACHMENT,g.RENDERBUFFER,t.depth);
        }
        if(g.checkFramebufferStatus(g.FRAMEBUFFER)!==g.FRAMEBUFFER_COMPLETE)throw Error('Sculpture framebuffer is incomplete.');
      }
    }catch(error){this.releaseTargets();throw error;}
    finally{g.bindRenderbuffer(g.RENDERBUFFER,null);g.bindTexture(g.TEXTURE_2D,null);g.bindFramebuffer(g.FRAMEBUFFER,null);}
  }
  prepare(state,width,height,aspect){
    this.visible=false;
    if(!state||state.intensity<.000001||this.failed)return false;
    try{
      if(!this.program)this.initialize();this.allocate(width,height);this.mesh.update(state,aspect);
      this.state=state;this.aspect=aspect;this.visible=true;return true;
    }catch(error){this.releaseTargets();this.failed=true;console.warn('Liquid sculpture unavailable; the water continues.',error);return false;}
  }
  begin(){
    const g=this.gl;g.bindFramebuffer(g.FRAMEBUFFER,this.visible?this.targets.frames[0]:null);
    g.disable(g.DEPTH_TEST);g.disable(g.BLEND);g.disable(g.CULL_FACE);
  }
  // Fish/weather are drawn after this copy, on the water below the sculpture.
  waterComplete(){
    if(!this.visible)return;const g=this.gl,t=this.targets;
    g.bindFramebuffer(g.READ_FRAMEBUFFER,t.frames[0]);g.bindFramebuffer(g.DRAW_FRAMEBUFFER,t.frames[1]);
    g.blitFramebuffer(0,0,t.width,t.height,0,0,t.width,t.height,g.COLOR_BUFFER_BIT,g.NEAREST);
    g.bindFramebuffer(g.FRAMEBUFFER,t.frames[1]);g.depthMask(true);g.clearDepth(1);g.clear(g.DEPTH_BUFFER_BIT);
  }
  finish(medium=4){
    if(!this.visible)return;const g=this.gl,t=this.targets;
    g.useProgram(this.program);g.bindVertexArray(this.vao);g.bindBuffer(g.ARRAY_BUFFER,this.buffer);g.bufferSubData(g.ARRAY_BUFFER,0,this.mesh.vertices);
    g.activeTexture(g.TEXTURE4);g.bindTexture(g.TEXTURE_2D,t.textures[0]);
    g.uniform1i(this.uniforms.painting,4);g.uniform1f(this.uniforms.aspect,this.aspect);g.uniform1f(this.uniforms.intensity,this.state.intensity);
    g.uniform1i(this.uniforms.artMedium,medium);
    g.enable(g.DEPTH_TEST);g.depthFunc(g.LESS);g.depthMask(true);g.disable(g.CULL_FACE);
    g.enable(g.BLEND);g.blendFunc(g.SRC_ALPHA,g.ONE_MINUS_SRC_ALPHA);
    g.drawElements(g.TRIANGLES,this.mesh.indices.length,g.UNSIGNED_SHORT,0);
    g.disable(g.BLEND);g.disable(g.DEPTH_TEST);g.bindVertexArray(null);g.bindTexture(g.TEXTURE_2D,null);
    g.bindFramebuffer(g.READ_FRAMEBUFFER,t.frames[1]);g.bindFramebuffer(g.DRAW_FRAMEBUFFER,null);
    g.blitFramebuffer(0,0,t.width,t.height,0,0,t.width,t.height,g.COLOR_BUFFER_BIT,g.NEAREST);
    g.bindFramebuffer(g.FRAMEBUFFER,null);
  }
  pick(u,v){return this.visible?this.mesh.pick(u,v):null;}
}
