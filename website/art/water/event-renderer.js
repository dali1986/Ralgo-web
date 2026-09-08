import { MAX_EVENT_SPRITES } from './events.js?v=38';
import { markerFunctions } from './material-textures.js?v=38';

const vertex=`#version 300 es
precision highp float;
layout(location=0) in vec2 corner;
layout(location=1) in vec4 geometry;
layout(location=2) in vec4 appearance;
layout(location=3) in vec4 pigment;
uniform vec2 resolution;
uniform vec4 camera;
uniform float visibility;
out vec2 local;
out vec3 colour;
flat out vec4 treatment;
mat2 rotate(float a){return mat2(cos(a),sin(a),-sin(a),cos(a));}
void main(){
 float aspect=min(resolution.x/resolution.y,2.05);
 // Keep narrow marks above a pixel even on the adaptive-resolution canvas.
 vec2 minimum=vec2(0.);
 if(appearance.y<.5)minimum=vec2(11.);
 else if(appearance.y>1.5&&appearance.y<2.5)minimum=vec2(2.,1.);
 else if(appearance.y>2.5&&appearance.y<3.5)minimum=vec2(4.,3.);
 else if(appearance.y>3.5&&appearance.y<4.5)minimum=vec2(1.15,8.);
 else if(appearance.y>4.5&&appearance.y<5.5)minimum=vec2(3.5,2.5);
 else if(appearance.y>5.5)minimum=vec2(.9,1.25);
 vec2 size=max(geometry.zw,minimum/resolution.y);
 vec2 p=(geometry.xy-.5-camera.xy)*vec2(aspect,1.);
 p+=rotate(appearance.x)*(corner*size);
 p=rotate(camera.z)*p*camera.w;
 gl_Position=vec4(p/vec2(aspect,1.)*2.,0.,1.);
 local=corner;colour=pigment.rgb;treatment=vec4(appearance.y,appearance.z*visibility,appearance.w,pigment.a);
}`;
const fragment=`#version 300 es
precision highp float;
uniform int artMedium;
in vec2 local;
in vec3 colour;
flat in vec4 treatment;
out vec4 fragColor;
float shape(float d){float aa=max(fwidth(d),.008);return 1.-smoothstep(1.-aa,1.+aa,d);}
${markerFunctions}
void main(){
 vec2 p=local;float alpha=0.;vec3 light=colour;
 if(treatment.x<.5){
  float r=length(p);
  float core=exp(-r*r*30.);
  float rays=exp(-abs(p.x)*30.-abs(p.y)*4.)+exp(-abs(p.y)*30.-abs(p.x)*4.);
  alpha=(core+rays*.62+exp(-r*r*5.)*.27)*(1.-smoothstep(.72,1.,r));
  light=mix(colour*.78,vec3(1.,.99,.92),clamp(core+rays*.23,0.,1.));
 }else if(treatment.x<1.5){
  float angle=atan(p.y,p.x+.00001),r=length(p);
  r+=sin(angle*5.+treatment.w)*.012*exp(-treatment.z*.55);
  float aa=max(fwidth(r),.005);
  float rim=1.-smoothstep(.014,.014+aa,abs(r-.84));
  float shoulder=1.-smoothstep(.035,.035+aa,abs(r-.80));
  float inner=1.-smoothstep(.011,.011+aa,abs(r-.59));
  float echo=1.-smoothstep(.009,.009+aa,abs(r-.37));
  alpha=max(max(rim,shoulder*.70),max(inner*.53,echo*.22));
  float gleam=.65+.35*cos(angle-.7);
  light=mix(colour*.64,mix(colour,vec3(1.,.98,.91),.73),rim*gleam+inner*.20);
 }else if(treatment.x<2.5){
  // Body proportions and pigments belong to each fish; finish belongs to
  // the shoal. Forked tails and highlights turn together through the current.
  p.y-=sin(treatment.z+p.x*4.)*.14*(1.-smoothstep(-1.,.5,p.x));
  float body=shape(length((p-vec2(.13,0.))/vec2(.76,.44)));
  float tailWidth=max(0.,(-p.x-.32))*.65;
  float tail=(1.-smoothstep(tailWidth-.035,tailWidth+.035,abs(p.y)))*(1.-smoothstep(-.30,-.22,p.x))*smoothstep(-1.,-.91,p.x);
  tail*=smoothstep(-1.,-.69,p.x+abs(p.y)*.60);
  alpha=max(body,tail*.75);
  float spine=exp(-abs(p.y+.07)*14.)*.50;
  if(treatment.w<.5){
   light=mix(colour,vec3(.94,1.,1.),.24+spine);
  }else if(treatment.w<1.5){
   light=mix(colour,vec3(1.,.94,.56),.10+spine*.75);
  }else if(treatment.w<2.5){
   float bands=smoothstep(.3,.7,.5+.5*sin(p.x*18.+p.y*3.));
   light=mix(colour,vec3(1.,.91,.70),bands*.55);
   light=mix(light,vec3(1.,.98,.90),spine*.35);
  }else if(treatment.w<3.5){
   float spots=smoothstep(.58,.82,sin(p.x*21.)*sin(p.y*17.));
   light=mix(colour,mix(colour,vec3(.95,1.,.85),.78),spots*.72+spine*.35);
  }else if(treatment.w<4.5){
   light=mix(colour*.8,vec3(.86,1.,1.),spine*.8);
   float glow=exp(-dot(p-vec2(.13,0.),p-vec2(.13,0.))*4.)*.16;
   alpha=max(alpha,glow);light+=colour*.12;
  }else if(treatment.w<5.5){
   light=mix(colour*.62,mix(colour,vec3(1.,.96,.88),.78),smoothstep(-.12,.21,p.y)*.74+spine*.30);
  }else{
   float brush=smoothstep(.22,.78,.5+.5*sin(p.x*16.+p.y*8.+treatment.z*.06));
   light=mix(colour,mix(colour,vec3(1.,.95,.67),.65),brush*.35+spine*.35);
  }
  light*=.76+.24*smoothstep(-.45,.20,p.y);
  alpha*=.78+.22*sin(p.x*24.+treatment.z*.15)*sin(p.y*21.+2.);
 }else if(treatment.x<3.5){
  float r=length(p);alpha=shape(r);
  light=mix(colour*.56,mix(colour,vec3(.98,.99,1.),.65),smoothstep(-.35,.6,p.y)*(1.-smoothstep(.65,1.,r)));
 }else if(treatment.x<4.5){
  alpha=exp(-p.x*p.x*3.)*(1.-smoothstep(.65,1.,abs(p.y)))*(.75-.25*p.y);
  light=mix(colour*.74,vec3(.95,.99,1.),exp(-p.x*p.x*24.)*.72);
 }else if(treatment.x<5.5){
  float r=length(p),angle=atan(p.y,p.x+.00001);
  float lift=sin(treatment.z*3.14159265);
  float teeth=pow(.5+.5*sin(angle*9.+treatment.w),5.);
  float crown=.48+treatment.z*.24+teeth*.13*lift;
  float aa=max(fwidth(r),.008),rim=1.-smoothstep(.018,.018+aa,abs(r-crown));
  float wall=exp(-abs(r-(crown-.045))*29.)*.34*lift;
  float contact=exp(-r*r*42.)*(1.-treatment.z)*.7;
  alpha=max(rim,wall)+contact;
  light=mix(colour*.78,vec3(.98,.99,.94),rim*(.57+.22*sin(angle+.8)));
 }else{
  float bead=length((p-vec2(0.,-.08))/vec2(.71,.82));
  float tail=exp(-p.x*p.x*30.)*(1.-smoothstep(.08,.97,p.y))*smoothstep(-.10,.22,p.y);
  alpha=max(shape(bead),tail*.44);
  float glint=exp(-dot(p-vec2(-.22,.23),p-vec2(-.22,.23))*29.);
  light=mix(colour*.76,vec3(1.,.995,.93),.19+glint*.77);
 }
 if(artMedium==0){
  float bristle=.5+.5*sin(p.y*61.+sin(p.x*6.)*.6);
  bristle=mix(bristle,.5,smoothstep(.4,1.6,fwidth(p.y*61.)));
  light=mix(colour*.87,light,.48)+light*bristle*.13;
  alpha*=.90+bristle*.10;
 }else if(artMedium==1){
  float dots=.5+.5*sin(p.x*29.)*sin(p.y*23.);
  float resolved=1.-smoothstep(.35,1.5,max(fwidth(p.x*29.),fwidth(p.y*23.)));
  alpha*=1.-resolved*(1.-dots)*.28;
  float value=dot(light,vec3(.2126,.7152,.0722));light=max(vec3(0.),mix(vec3(value),light,1.15));
 }else if(artMedium==2){
  float tooth=.5+.5*sin(p.x*67.+sin(p.y*31.))*sin(p.y*51.);
  tooth=mix(tooth,.5,smoothstep(.4,1.6,max(fwidth(p.x*67.),fwidth(p.y*51.))));
  alpha*=.78+tooth*.18;light=mix(light,colour,.28);
 }else if(artMedium==3){
  float dry=.5+.5*sin(p.x*43.+sin(p.y*13.))*sin(p.y*29.);
  dry=mix(dry,.5,smoothstep(.4,1.6,max(fwidth(p.x*43.),fwidth(p.y*29.))));
  alpha*=.83+dry*.17;
  light=mix(vec3(.013,.022,.030),vec3(.19,.20,.21),dot(light,vec3(.2126,.7152,.0722))*.17);
 }else if(artMedium==5){
  float dust=.5+.5*sin(p.x*37.+sin(p.y*17.))*sin(p.y*31.);
  dust=mix(dust,.5,smoothstep(.4,1.6,max(fwidth(p.x*37.),fwidth(p.y*31.))));
  float exception=step(.92,fract(sin(treatment.w*73.+treatment.x*19.)*43758.5453));
  alpha*=.48+dust*.52;
  light=mix(vec3(.98,.985,.979),sqrt(max(colour,vec3(.025)))*.82+vec3(.15),exception*.85);
 }else if(artMedium==6){
  float weave=.5+.5*sin(p.x*43.)*sin(p.y*37.);
  weave=mix(weave,.5,smoothstep(.4,1.6,max(fwidth(p.x*43.),fwidth(p.y*37.))));
  float edge=1.-smoothstep(.65,.93,max(abs(p.x),abs(p.y)));
  light=mix(mix(colour,vec3(.97,.94,.84),.55),colour*(.80+weave*.25),edge);
  alpha*=.89+weave*.11;
 }else if(artMedium==7){
  light=markerInk(colour);
  float nib=.5+.5*sin(p.y*29.+sin(p.x*5.));
  nib=mix(nib,.5,smoothstep(.4,1.6,fwidth(p.y*29.)));
  alpha*=.78+nib*.22;
 }else if(artMedium==8){
  float strokes=.5+.5*sin((p.x*.67+p.y)*31.+sin(p.x*7.)*.3);
  strokes=mix(strokes,.5,smoothstep(.35,1.45,fwidth((p.x*.67+p.y)*31.)));
  float tooth=.5+.5*sin(p.x*79.)*sin(p.y*67.);
  tooth=mix(tooth,.5,smoothstep(.35,1.5,max(fwidth(p.x*79.),fwidth(p.y*67.))));
  if(treatment.x>1.5&&treatment.x<2.5){
   float body=length((p-vec2(.13,0.))/vec2(.76,.44)),aa=max(fwidth(body),.025);
   float outline=1.-smoothstep(.027,.027+aa,abs(body-.94));
   float eye=exp(-dot(p-vec2(.52,.11),p-vec2(.52,.11))*420.);
   alpha=max(alpha*(.14+strokes*.25),max(outline*.86,eye*.90));
  }else if(treatment.x>2.5&&treatment.x<3.5){
   float r=length(p),aa=max(fwidth(r),.025);
   float outline=1.-smoothstep(.025,.025+aa,abs(r-.88));
   alpha=max(outline*.83,alpha*(.12+strokes*.22));
  }
  alpha*=.76+tooth*.24;
  light=mix(vec3(.105,.113,.123),vec3(.28,.285,.29),strokes*.38);
 }
 alpha=clamp(alpha*treatment.y,0.,1.);
 fragColor=vec4(light*alpha,alpha);
}`;

// Small instanced quads keep event cost proportional to their screen area.
// These are drawn into the same WebGL canvas, so PNG exports include them.
export class EventRenderer {
 constructor(gl){
  this.gl=gl;
  const compile=(type,source)=>{const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(shader));return shader;};
  this.program=gl.createProgram();
  gl.attachShader(this.program,compile(gl.VERTEX_SHADER,vertex));gl.attachShader(this.program,compile(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(this.program);
  if(!gl.getProgramParameter(this.program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(this.program));
  this.uniforms=Object.fromEntries(['resolution','camera','visibility','artMedium'].map(k=>[k,gl.getUniformLocation(this.program,k)]));
  this.vao=gl.createVertexArray();gl.bindVertexArray(this.vao);
  const quad=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,quad);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);
  this.instances=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.instances);gl.bufferData(gl.ARRAY_BUFFER,MAX_EVENT_SPRITES*48,gl.DYNAMIC_DRAW);
  for(let i=1;i<=3;i++){gl.enableVertexAttribArray(i);gl.vertexAttribPointer(i,4,gl.FLOAT,false,48,(i-1)*16);gl.vertexAttribDivisor(i,1);}
  gl.bindVertexArray(null);
 }
 draw(events,width,height,camera,memory,medium=4){
  if(!events.spriteCount)return;const gl=this.gl;
  gl.useProgram(this.program);gl.bindVertexArray(this.vao);gl.bindBuffer(gl.ARRAY_BUFFER,this.instances);
  gl.bufferSubData(gl.ARRAY_BUFFER,0,events.spriteData.subarray(0,events.spriteCount*12));
  gl.uniform2f(this.uniforms.resolution,width,height);gl.uniform4fv(this.uniforms.camera,camera);gl.uniform1f(this.uniforms.visibility,1-memory*.88);
  gl.uniform1i(this.uniforms.artMedium,medium);
  gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);gl.drawArraysInstanced(gl.TRIANGLES,0,6,events.spriteCount);
  gl.disable(gl.BLEND);gl.bindVertexArray(null);
 }
}
