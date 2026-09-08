import { MAX_SEAS } from './ensemble.js?v=38';
import { mediumFunctions, mediumSurface } from './medium.js?v=38';

export const vertex = `#version 300 es
in vec2 position;
out vec2 uv;
void main(){uv=position*.5+.5;gl_Position=vec4(position,0.,1.);}`;

export const fragment = `#version 300 es
precision highp float;
uniform vec2 resolution;
uniform highp sampler2DArray state;
uniform highp sampler2DArray previousState;
uniform vec2 gridSize;
uniform float interpolation;
uniform float time;
uniform int seaCount;
uniform highp sampler2D seaStyles;
uniform highp sampler2D nextSeaStyles;
uniform vec2 seaTransition;
uniform vec4 materialChange;
uniform ivec3 materialSeas;
uniform vec4 camera;
uniform float memoryView;
uniform int artMedium;
in vec2 uv;
out vec4 fragColor;
const float TAU=6.28318530718;
const int MAX_SEAS=${MAX_SEAS};
float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}
float fbm(vec2 p){float v=.5*noise(p);p=mat2(.8,-.6,.6,.8)*p*2.03+13.1;v+=.25*noise(p);p=mat2(.8,-.6,.6,.8)*p*2.03+7.7;v+=.125*noise(p);return v+.0625*noise(p*2.01+4.3);}
mat2 turn(float a){return mat2(cos(a),-sin(a),sin(a),cos(a));}
vec4 field(highp sampler2DArray tex,vec2 p,int layer){
 vec2 g=clamp(p,vec2(0),vec2(1))*(gridSize-1.);
 ivec2 i=ivec2(floor(g));ivec2 hi=ivec2(gridSize)-1;vec2 f=fract(g);
 return mix(mix(texelFetch(tex,ivec3(i,layer),0),texelFetch(tex,ivec3(min(i+ivec2(1,0),hi),layer),0),f.x),mix(texelFetch(tex,ivec3(min(i+ivec2(0,1),hi),layer),0),texelFetch(tex,ivec3(min(i+ivec2(1,1),hi),layer),0),f.x),f.y);
}
float stroke(float f,float width){
 float fw=max(fwidth(f),.0001),d=abs(fract(f+.5)-.5);
 return (1.-smoothstep(max(0.,width-fw),width+fw,d))*(1.-smoothstep(.12,.48,fw));
}
${mediumFunctions}
// Width changes the crest itself; the independent fine engraving stays crisp.
float crest(float phase,float exponent,float thickness){
 return pow(.5+.5*cos(phase*TAU),exponent/sqrt(thickness));
}
// All seas contribute continuously. No winning region, nearest source mask,
// ownership line, or colour seam is used in the image.
vec4 styleTexel(int column,int seaIndex,bool future){
 if(future)return texelFetch(nextSeaStyles,ivec2(column,seaIndex),0);
 return texelFetch(seaStyles,ivec2(column,seaIndex),0);
}
vec4 paintSea(int seaIndex,vec2 materialUV,vec4 m,vec2 current,vec2 sharedWarp,float sharedGrain,float agitation,bool future){
 float aspect=min(resolution.x/resolution.y,2.05);
 vec4 originStyle=styleTexel(0,seaIndex,future);
 vec2 origin=originStyle.xy;
 float thickness=clamp(originStyle.z,.35,2.6),breadth=sqrt(thickness);
 vec4 form=styleTexel(1,seaIndex,future),gesture=styleTexel(2,seaIndex,future),pigmentStyle=styleTexel(3,seaIndex,future);
 vec4 material=styleTexel(4,seaIndex,future),structure=styleTexel(5,seaIndex,future),phenomenon=styleTexel(6,seaIndex,future);
 vec4 source=styleTexel(7,seaIndex,future),motion=styleTexel(8,seaIndex,future);
 vec3 colours[6];for(int j=0;j<6;j++)colours[j]=styleTexel(9+j,seaIndex,future).rgb;
 vec2 world=(materialUV-source.xy)*vec2(aspect,1.)/(motion.y*2.7);
 float t=time*gesture.w*motion.z,deposit=m.r,wave=m.g;
 vec2 q=turn(form.w)*(world-gesture.xy)*form.y;
 q+=turn(form.w)*current*.055;
 vec2 drift=vec2(t*.019,-t*.011);
 vec2 warp=sharedWarp;
 // An undertow folds the image locally, then releases it. Its phase and
 // amplitude belong to the seed and do not reset the sediment history.
 float undertow=pow(.5+.5*sin(t*phenomenon.z+phenomenon.x),5.);
 float influence=exp(-dot(q,q)*3.);
 q=turn(undertow*phenomenon.y*influence)*q;
 q+=warp*gesture.z;
 q+=warp*undertow*.09;
 float detail=noise(q*7.+origin)*.84;
 float phase=0.,ridge=0.,foam=0.,hollow=0.,land=0.,activity=1.;
 float chromaAxis=0.,body=1.,edgeLight=0.,pearlDepth=0.;
 if(form.x<.5){
  // Asymmetric breaking fronts; the whole composition bends and unfolds.
  float stream=q.y+sin(q.x*3.3+t*.20+origin.x)*gesture.z;
  stream+=sin(q.x*6.4-t*.14)*.035+detail*.10+wave*.052+deposit*.12;
  phase=stream*form.z-t*.075;
  ridge=crest(phase,3.8,thickness);
  foam=smoothstep(.68,.99,ridge)*.74;
  hollow=pow(.5-.5*cos(phase*TAU),3.)*.2;
  chromaAxis=q.x*.40+sin(stream*4.)*.24;
 }else if(form.x<1.5){
  // Integer winding preserves a continuous angular seam across spiral arms.
  float radius=length(q),angle=atan(q.y,q.x);
  float arms=1.+floor(pigmentStyle.w*3.);
  phase=radius*form.z*1.1-angle/TAU*arms-t*.09;
  phase+=sin(radius*7.-t*.28)*.12+detail*.16+deposit*.17+wave*.045;
  ridge=crest(phase,3.0,thickness);
  activity=smoothstep(.025,.12,radius);
  foam=smoothstep(.70,.99,ridge)*.8*activity;
  hollow=exp(-radius*radius*32.);
  chromaAxis=radius*.55+sin(angle*arms+t*.1)*.15;
 }else if(form.x<2.5){
  // Wide channels with branching tributaries have their own silhouette.
  float trunk=sin(q.x*2.7+t*.15+origin.x)*.11;
  float distanceToWater=abs(q.y-trunk);
  for(int i=0;i<6;i++){
   float k=float(i),side=mod(k,2.)<.5?-1.:1.;
   float start=-.68+k*.205,reach=max(0.,q.x-start);
   float branch=trunk+side*pow(reach,1.32)*(.38+k*.065)+sin(reach*8.+t*.23+k)*.035*min(1.,reach*5.);
   float d=abs(q.y-branch)+(1.-smoothstep(0.,.09,reach))*.5;
   distanceToWater=min(distanceToWater,d);
  }
  distanceToWater+=(detail-.45)*.035+deposit*.018+wave*.01;
  float width=(.035+gesture.z*.15)*breadth;
  float channel=1.-smoothstep(width*.55,width*2.2,distanceToWater);
  land=1.-channel;
  phase=distanceToWater*(25.+form.z*3.)-t*.065;
  ridge=crest(phase,3.,thickness)*channel;
  foam=exp(-pow((distanceToWater-width*1.3)/(.016+width*.15),2.))*.72;
  activity=channel;hollow=channel*.28;chromaAxis=q.x*.7+channel*.2;
 }else if(form.x<3.5){
  // Disconnected islands and moving shorelines, with no compulsory vortex.
  float islands=fbm(q*(2.7+form.z*.35)+origin+drift*.55);
  islands+=fbm(q*5.5+origin+31.)*.19+(deposit-.25)*.12+wave*.025;
  float coast=.52+sin(t*.32)*.025;
  land=smoothstep(coast-.025,coast+.035,islands);
  phase=(islands-coast)*(12.+form.z)-t*.05;
  ridge=crest(phase,4.,thickness);
  activity=1.-land*.65;
  foam=exp(-pow((islands-coast)/.018,2.))*.88;
  foam+=smoothstep(.88,.995,ridge)*(1.-land)*.20;
  hollow=(1.-land)*smoothstep(.07,.18,coast-islands)*.24;
  chromaAxis=islands*1.4;
 }else if(form.x<4.5){
  // A radial fan opens from an off-centre source, with water between its ribs.
  vec2 d=q+vec2(0.,.64);
  float radius=length(d),angle=atan(d.y,d.x);
  float ribs=3.+floor(form.z);
  float fan=sin(angle*ribs+sin(radius*4.-t*.3)*.6);
  phase=radius*form.z-angle/TAU*2.-t*.085+fan*.26+deposit*.14+wave*.04;
  ridge=crest(phase,3.2,thickness);
  activity=smoothstep(.03,.15,radius)*(.40+.60*smoothstep(-.3,.6,fan));
  foam=smoothstep(.65,.985,ridge)*activity*.85;
  hollow=(1.-activity)*.32;chromaAxis=radius*.62+fan*.13;
 }else if(form.x<5.5){
  // A scalloped mantle folds around an open centre. Petals and apertures share
  // one field, so they deform together rather than orbiting as rigid objects.
  float radius=length(q),angle=atan(q.y,q.x+.000001);
  float petals=structure.x;
  float crown=.30+.065*sin(angle*petals+t*.12+sin(radius*8.)*.5);
  crown+=.035*sin(angle*(petals+2.)-t*.18)+deposit*.025;
  crown*=pow(thickness,.12);
  float outer=radius-crown*structure.y;
  float inner=(.065+.035*structure.z+.022*sin(angle*3.+t*.2))*pow(thickness,-.24);
  float aperture=smoothstep(inner-.014,inner+.017,radius);
  body=(1.-smoothstep(-.018,.018,outer))*aperture;
  phase=radius*(10.+form.z)-angle/TAU*2.+sin(angle*petals)*.28-t*.085;
  phase+=wave*.07+deposit*.22;
  ridge=crest(phase,2.5,thickness);
  foam=smoothstep(.71,.99,ridge)*.64;
  edgeLight=exp(-abs(outer)*110.)+exp(-abs(radius-inner)*100.);
  foam+=edgeLight*.5;
  hollow=(1.-aperture)*.8;
  activity=body;chromaAxis=radius*1.3+sin(angle*petals)*.12;
  pearlDepth=pow(max(0.,1.-abs(radius-(crown+inner)*.5)/max(.02,(crown-inner)*.5)),.7);
 }else if(form.x<6.5){
  // Porous membranes: a connected labyrinth with large open voids, branching
  // passages and fine mineral edges, independent of the wave-stripe grammar.
  float cellular=fbm(q*(2.3+structure.y)+origin+drift*.5);
  cellular+=sin(q.x*2.+q.y*3.+t*.15)*.055+deposit*.10+wave*.018;
  float web=abs(sin(cellular*TAU*(2.+floor(structure.x*.5))));
  float wall=.44+structure.z*.20+undertow*.09-(breadth-1.)*.20;
  body=smoothstep(wall-.035,wall+.045,web);
  phase=cellular*(9.+form.z)-t*.06;
  ridge=crest(phase,3.,thickness);
  edgeLight=exp(-abs(web-wall)*38.);
  foam=edgeLight*.75+smoothstep(.86,.995,ridge)*.22;
  activity=body;hollow=(1.-body)*.6;chromaAxis=cellular*1.1;
  pearlDepth=smoothstep(wall,.96,web);
 }else if(form.x<7.5){
  // Irregular plates separated by illuminated rifts. Each cell has its own
  // mineral grain; moving boundaries remain continuous through slow drift.
  vec2 cells=q*(2.1+structure.y*1.5)+origin*.13+drift*.18;
  vec2 cell=floor(cells),local=fract(cells);
  float nearest=9.,second=9.,identity=0.;
  for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++){
   vec2 offset=vec2(float(i),float(j));
   vec2 id=cell+offset;
   vec2 point=vec2(hash(id+origin),hash(id+origin+47.));
   point=.5+.38*sin(point*TAU+vec2(t*.12,-t*.09));
   float d=length(offset+point-local);
   if(d<nearest){second=nearest;nearest=d;identity=hash(id+73.);}
   else second=min(second,d);
  }
  float rift=second-nearest;
  float fissure=(.018+structure.z*.035+deposit*.014)*breadth;
  edgeLight=exp(-rift/(fissure+.008));
  phase=nearest*(7.+form.z)+identity*3.+detail*.2-t*.04;
  ridge=crest(phase,4.,thickness);
  land=smoothstep(fissure*.5,fissure*2.,rift)*(.28+identity*.55);
  foam=edgeLight*.76+ridge*.065;
  activity=.25+.75*edgeLight;chromaAxis=identity*.65;
  hollow=edgeLight*.35;pearlDepth=smoothstep(.01,.25,rift);
 }else if(form.x<8.5){
  // Suspended, hollow reef bodies of different sizes. A small, bounded number
  // of signed-distance forms produces disconnected silhouettes and chambers.
  float nearest=9.,innerVoid=0.,identity=0.;
  for(int i=0;i<8;i++){
   float k=float(i);
   if(k>=structure.x)break;
   vec2 h=vec2(hash(origin+vec2(k,4.)),hash(origin+vec2(k,61.)));
   vec2 centre=(h-.5)*vec2(1.55,.74);
   centre+=vec2(sin(t*.16+k),cos(t*.13+k*2.))*.035;
   vec2 d=turn(k*2.4+origin.x+sin(t*.12+k)*.12)*(q-centre);
   vec2 size=vec2(.09+h.x*.18,.07+h.y*.13)*structure.y;
   float oval=length(d/size);
   float rip=.10*sin(atan(d.y,d.x+.000001)*(3.+floor(h.x*4.))+t*.18+k);
   float distanceToReef=(oval-1.+rip+(detail-.45)*.15)*min(size.x,size.y);
   if(distanceToReef<nearest){
    nearest=distanceToReef;identity=h.x;
    float opening=pow(thickness,-.25);
    innerVoid=1.-smoothstep((.30+h.y*.13)*opening,(.39+h.y*.13)*opening,length((d-vec2(size.x*.15,0.))/size));
   }
  }
  body=(1.-smoothstep(-.01,.014,nearest))*(1.-innerVoid);
  phase=nearest*(38.+form.z*3.)-t*.09+detail*.25+deposit*.3;
  ridge=crest(phase,2.8,thickness);
  edgeLight=exp(-abs(nearest)*140.);
  foam=edgeLight*.75+ridge*.35;
  activity=body;chromaAxis=identity*.75;hollow=innerVoid*.8;
  pearlDepth=1.-smoothstep(-.10,.0,nearest);
 }else if(form.x<9.5){
  // Columns grow from a common lower sea, tapering into bent, branching crowns.
  float nearest=9.,identity=0.;
  for(int i=0;i<6;i++){
   float k=float(i);if(k>=structure.x)break;
   float h=hash(origin+vec2(k,92.));
   float height=.32+h*.68;
   float progress=clamp((q.y+.52)/height,0.,1.);
   float path=-.79+k*.30+sin(progress*5.+t*.17+k)*(.04+progress*.10);
   float width=(.065+h*.05)*(1.-progress*.8)*breadth;
   float d=max(abs(q.x-path)-width,q.y+.52-height);
   if(d<nearest){nearest=d;identity=h;}
  }
  body=1.-smoothstep(-.008,.015,nearest);
  phase=q.y*(5.+form.z)+sin(q.x*18.+t*.23)*.19+wave*.06+deposit*.22-t*.10;
  ridge=crest(phase,3.,thickness);
  edgeLight=exp(-abs(nearest)*105.);
  foam=edgeLight*.70+ridge*.36;
  activity=body;chromaAxis=q.y*.7+identity*.25;pearlDepth=body;
 }else if(form.x<10.5){
  // Three independent channels braid over and under each other.
  float distanceToBraid=9.,strand=0.;
  for(int j=0;j<3;j++){
   float id=float(j),along=q.x*(2.4+structure.y)+t*.12;
   float path=sin(along+id*TAU/3.)*(.22+structure.z*.15);
   path+=sin(q.x*6.2-t*.16+id)*.035;
   float d=abs(q.y-path);
   if(d<distanceToBraid){distanceToBraid=d;strand=id;}
  }
  float width=(.032+structure.w*.04)*breadth;
  body=1.-smoothstep(width,width*3.,distanceToBraid);
  phase=distanceToBraid*(22.+form.z*2.)+q.x*.6-t*.10+deposit*.18+wave*.05;
  ridge=crest(phase,2.8,thickness);activity=.22+.78*body;
  edgeLight=exp(-abs(distanceToBraid-width)*85.);
  foam=ridge*body*.57+edgeLight*.35;
  chromaAxis=strand*.27+q.x*.35;pearlDepth=body*.6;
 }else if(form.x<11.5){
  // Oblique crystalline facets, with narrow liquid seams between planes.
  vec2 g=vec2(q.x+q.y*.48,q.y*.866)*(2.+structure.y);
  g+=warp*.21+vec2(t*.017,-t*.012);
  vec2 local=fract(g)-.5;
  float diagonal=abs(local.x+local.y),face=max(abs(local.x),abs(local.y));
  float seam=min(.5-face,diagonal*.65);
  float identity=hash(floor(g)+origin);
  phase=seam*(16.+form.z)+detail*.14+deposit*.15-t*.035;
  ridge=crest(phase,4.,thickness);
  edgeLight=exp(-max(0.,seam)*55./breadth);
  land=smoothstep(.012,.13,seam)*.42;
  foam=edgeLight*.72+ridge*.14;activity=.65+.35*edgeLight;
  chromaAxis=identity*.8;pearlDepth=seam*.8;
 }else if(form.x<12.5){
  // Staggered shell fans: scalloped terraces open upwards in overlapping rows.
  vec2 g=q*(1.55+structure.y*.55)+vec2(t*.014,-t*.021);
  g.x+=mod(floor(g.y),2.)*.5;
  vec2 d=fract(g)-vec2(.5,.12);
  float radius=length(d*vec2(1.,.84)),angle=atan(d.y,d.x+.000001);
  float scallop=sin(angle*(5.+floor(structure.z*5.)))*.035;
  float shell=radius+scallop+detail*.024+deposit*.03;
  phase=shell*(7.+form.z*.65)-t*.07+wave*.045;
  ridge=crest(phase,2.6,thickness);
  body=.42+.58*(1.-smoothstep(.56,.68,shell));
  activity=body;foam=smoothstep(.66,.98,ridge)*.72;
  edgeLight=exp(-abs(shell-.60)*70.);
  chromaAxis=radius*.85+sin(angle*3.)*.13;pearlDepth=ridge*.4;
 }else if(form.x<13.5){
  // Falling satin ribbons twist, pinch and open along their length.
  float fold=q.x+sin(q.y*(2.1+structure.y)-t*.21)*.16;
  fold+=sin(q.y*5.3+t*.12)*.07+warp.x*.12+deposit*.04;
  float ribbon=fold*(2.8+structure.z*2.1);
  float width=(.14+.07*sin(q.y*3.7-t*.13))*breadth;
  float seam=abs(fract(ribbon+.5)-.5);
  body=.24+.76*(1.-smoothstep(width*.6,width*1.8,seam));
  phase=ribbon*2.+sin(q.y*2.1+t*.12)*.20+wave*.07;
  ridge=crest(phase,2.2,thickness);activity=body;
  edgeLight=exp(-abs(seam-width)*45.);
  foam=edgeLight*.52+ridge*.29;
  chromaAxis=q.y*.65+sin(ribbon*TAU)*.2;pearlDepth=body*.65;
 }else if(form.x<14.5){
  // A field of unequal foam cells and fine rims, rather than straight waves.
  vec2 g=q*(2.1+structure.y)+origin*.11+vec2(t*.016,-t*.013);
  vec2 cell=floor(g),local=fract(g);float nearest=9.,identity=0.;
  for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++){
   vec2 offset=vec2(float(i),float(j)),id=cell+offset;
   vec2 centre=.5+.29*sin(vec2(hash(id+origin),hash(id+51.))*TAU+t*.11);
   float d=length((offset+centre-local)*vec2(1.,.84));
   if(d<nearest){nearest=d;identity=hash(id+17.);}
  }
  float radius=.19+identity*.18;
  phase=(nearest-radius)*(9.+form.z)+deposit*.10+wave*.04-t*.025;
  ridge=crest(phase,3.4,thickness);
  edgeLight=exp(-abs(nearest-radius)*42./breadth);
  foam=edgeLight*.78+ridge*.18;activity=.55+.45*edgeLight;
  chromaAxis=identity*.7+nearest*.4;pearlDepth=edgeLight*.5;
 }else if(form.x<15.5){
  // Feathered currents: curved barbs leave a long, wandering central quill.
  float across=q.y-sin(q.x*2.4+t*.15)*.17;
  float barbs=abs(across)*(4.+structure.y*2.)-q.x*(2.2+structure.z*2.);
  barbs+=sin(across*5.+q.x*2.-t*.14)*.15+deposit*.13+wave*.04;
  phase=barbs*form.z*.45-t*.08;
  ridge=crest(phase,3.,thickness);
  float spine=exp(-abs(across)*65./breadth);
  activity=.35+.65*exp(-across*across*1.5);
  foam=smoothstep(.63,.98,ridge)*activity*.67+spine*.7;
  edgeLight=spine;chromaAxis=q.x*.55+abs(across)*.25;
  pearlDepth=ridge*activity*.45;
 }else if(form.x<16.5){
  // Broad folded mineral bands carry their own much finer engraved veins.
  vec2 marble=q*vec2(1.05,2.3);
  marble+=vec2(sin(q.y*2.8-t*.13),cos(q.x*3.1+t*.17))*.24;
  float vein=marble.y+fbm(marble*1.8+origin+drift*.3)*.72;
  vein+=sin(marble.x*4.1+vein*4.)*.11+deposit*.13+wave*.045;
  phase=vein*(3.2+form.z*.45)-t*.06;
  ridge=crest(phase,2.4,thickness);
  foam=smoothstep(.76,.995,ridge)*.66;
  land=smoothstep(.60,.87,.5+.5*sin(vein*TAU))*.32;
  chromaAxis=vein*.55;pearlDepth=ridge*.5;
 }else{
  // Crossing wave trains form moving diamonds, rosettes and interference nodes.
  float a=(q.x+sin(q.y*2.2+t*.11)*.08)*(3.+form.z*.4);
  float b=(q.y+sin(q.x*2.7-t*.13)*.08)*(2.8+structure.y*2.);
  float x=cos(a*TAU-t*.30),y=cos(b*TAU+t*.24);
  float meeting=x*y*.5+.5;
  phase=(a+b)*.45+meeting*.85+deposit*.16+wave*.065;
  ridge=pow(clamp(meeting,0.,1.),2.6/breadth);
  edgeLight=exp(-abs(x-y)*16.);
  foam=smoothstep(.60,.97,ridge)*.74+edgeLight*.16;
  activity=.55+.45*meeting;chromaAxis=(x-y)*.26+q.x*.2;
  pearlDepth=meeting*.5;
 }

 float texturePigment=sharedGrain;
 float lines=stroke(phase*5.+detail*.21,.065*clamp(breadth,.72,1.48))*activity*material.y;
 float fine=stroke(phase*12.+noise(q*41.+origin)*.10,.042)*activity;
 foam*=.73+texturePigment*.38;
 foam+=agitation*ridge*.14;
 float height=ridge*.063*activity+land*.06+detail*.014+deposit*.028+wave*.009+pearlDepth*.055;
 vec3 normal=normalize(vec3(-dFdx(height)*resolution.x*.14,-dFdy(height)*resolution.y*.14,1.));
 float lighting=clamp(dot(normal,normalize(vec3(-.5,.6,1.))),0.,1.);
 float geography=noise(q*2.1+origin*.31)*.85;
 float cool=smoothstep(.22,.69,geography+chromaAxis*.12);
 vec3 water=mix(colours[0],colours[1],.32+cool*.68);
 water=mix(water,colours[2],smoothstep(.39,.69,geography+detail*.16)*.85);
 float warmField=noise(q*1.75+origin*.73+vec2(19.,7.))*.86;
 float warm=smoothstep(pigmentStyle.x-.085,pigmentStyle.x+.085,warmField+chromaAxis*.10+deposit*.08);
 vec3 mineral=mix(colours[3],colours[4],smoothstep(.29,.72,detail+chromaAxis*.13));
 vec3 colour=mix(water,mineral,warm*(.72+pigmentStyle.y*.25));
 vec3 earth=mix(colours[4],colours[5],.40+detail*.32);
 colour=mix(colour,earth,land*.86);
 colour=mix(colour,colours[0],hollow);
 colour*=.78+lighting*.30;
 float pulse=.75+.25*sin(q.x*12.-t*1.2+wave);
 vec3 pearl=mix(colours[5],colours[2],(1.-warm)*.12);
 colour=mix(colour,pearl,clamp(foam+lines*.25+fine*.10,0.,.92));
 colour+=colours[2]*ridge*.055*pulse*activity;
 float record=stroke(deposit*10.+m.b*2.,.085)*smoothstep(.025,.17,deposit);
 colour=mix(colour,mix(colours[4],colours[5],.48),record*.18);
 colour*=pigmentStyle.z;
 ${mediumSurface}
 float revealed=undertow*smoothstep(.07,.28,deposit)*record;
 colour=mix(colour,colours[5],revealed*.33);
 colour=mix(ground,colour,clamp(body,0.,1.));
 // As the lens approaches, finer engravings become resolvable in the same
 // material coordinates. Their derivative filter prevents distant shimmer.
 if(camera.w>1.25){
  float closeness=smoothstep(1.25,2.65,camera.w);
  float engraving=stroke(phase*26.+noise(q*83.+origin)*.12,.032)*activity;
  float hairline=stroke(phase*53.+noise(q*151.+origin)*.08,.022)*activity;
  vec3 etched=mix(colours[2],pearl,.45);
  colour=mix(colour,etched,closeness*(engraving*.19+hairline*.10));
 }
 // A rare change belongs to the transported pigment of selected seas.
 // It neither masks the frame nor replaces the sea's structural grammar.
 if(materialChange.y>0.&&(seaIndex==materialSeas.x||seaIndex==materialSeas.y||seaIndex==materialSeas.z)){
  float age=materialChange.z,seedPhase=materialChange.w;
  float travelling=.78+.22*sin(q.x*.95+q.y*.63-age*.13+seedPhase);
  float strength=materialChange.y*travelling*(seaIndex==materialSeas.x?1.:.82);
  strength*=(artMedium==3||artMedium==5)?.24:artMedium==8?.14:artMedium==7?.18:artMedium==2?.55:1.;
  vec3 surfaceNormal=normalize(vec3(normal.xy*max(1.,camera.w/1.08),normal.z));
  float etched=clamp(lines*.65+fine*.42,0.,1.);
  vec3 transformed=colour;
  if(materialChange.x<.5){
   // Thin-film colour rolls over a glossy, coloured enamel relief.
   float optical=dot(surfaceNormal,normalize(vec3(.45,-.35,1.)))*3.4+height*11.+q.x*.15+seedPhase;
   vec3 opal=.52+.48*cos(TAU*(vec3(0.,.31,.63)+optical*.24+age*.012+camera.z*.7));
   vec3 glaze=sqrt(mix(colour*colour,opal*opal,.32+.13*ridge));
   float sheen=pow(.5+.5*cos(optical*2.4+age*.19),14.)*(.25+.75*ridge);
   transformed=glaze*(.92+.13*lighting)+mix(opal,colours[2],.45)*(sheen*.34+etched*.13);
   transformed+=mix(colours[2],vec3(.97,.97,1.),.28)*lightLobe*.14;
  }else if(materialChange.x<1.5){
   // Gold is drawn through crests, veins and fine threads of the sea itself.
   float thread=stroke(phase*3.+detail*.14,.075)*activity;
   float depositGold=clamp(thread*.78+pow(ridge,3.)*activity*.48+min(1.,edgeLight)*.38,0.,.95);
   float reflection=.5+.5*sin(surfaceNormal.x*4.+surfaceNormal.y*3.+q.y*.6-age*.18+seedPhase);
   vec3 gold=mix(vec3(.82,.27,.055),vec3(1.,.72,.18),smoothstep(.04,.72,reflection));
   gold=mix(gold,vec3(1.,.94,.64),pow(reflection,9.)*.75);
   transformed=mix(colour,gold,depositGold);
   transformed+=gold*(etched*.19+pow(reflection,14.)*depositGold*.22);
  }else{
   // Translucent jewel panes use the sea's contours as their coloured rims.
   // There is no black leading or opaque background between the panes.
   float panes=phase*.65+noise(q*2.3+origin)*.20;
   int swatch=int(mod(floor(panes)+floor(chromaAxis*2.),5.));
   vec3 jewel=pow(max(colours[swatch],vec3(.025)),vec3(.78));
   float transmission=.82+.25*(.5+.5*sin(q.x*2.2+q.y*1.6+age*.12+seedPhase));
   vec3 glass=sqrt(mix(colour*colour,jewel*jewel,.54))*transmission;
   float rim=stroke(panes,.043),inner=stroke(panes+.06,.018);
   vec3 prism=.58+.42*cos(TAU*(vec3(0.,.33,.67)+height*3.+age*.01));
   transformed=mix(glass,mix(colours[2],prism,.52),rim*.68);
   transformed+=prism*(inner*.22+etched*.16+lightLobe*.15);
  }
  colour=mix(colour,max(transformed,vec3(0.)),strength);
 }
 vec3 archive=mix(colours[0],colours[3],smoothstep(.01,.32,deposit));
 archive=mix(archive,colours[4],smoothstep(.16,.6,deposit));
 archive=mix(archive,colours[5],record*.5);
 colour=mix(colour,archive,memoryView*((artMedium==3||artMedium==5||artMedium==7||artMedium==8)?.42:1.));
 // Crests and deposited pigment remain legible as other seas pass through
 // their hollows. Opacity follows each moving structure, not a spatial mask.
 float pigmentLoad=.12+.88*clamp(ridge*.68+foam*.40+land*.40+pearlDepth*.16,0.,1.);
 float coverage=(.12+.88*clamp(body,0.,1.))*pigmentLoad;
 // A heavier body carries more pigment; hairline seas let other water through.
 // This changes optical thickness without adding a dark relief shadow.
 coverage=pow(coverage,clamp(pow(thickness,-.18),.86,1.18));
 return vec4(max(colour,vec3(0)),mix(coverage,1.,memoryView));
}
void main(){
 float aspect=min(resolution.x/resolution.y,2.05);
 vec2 lens=(uv-.5)*vec2(aspect,1.);
 lens=turn(camera.z)*lens/camera.w;
 vec2 scene=lens/vec2(aspect,1.)+.5+camera.xy;
 vec4 flow=mix(field(previousState,scene,seaCount),field(state,scene,seaCount),interpolation);
 vec4 ripple=mix(field(previousState,scene,seaCount+1),field(state,scene,seaCount+1),interpolation);
 vec2 refraction=clamp(ripple.gb,vec2(-12.),vec2(12.))*.0035/vec2(aspect,1.);
 vec2 materialUV=clamp(flow.xy+refraction,vec2(0),vec2(1)),current=flow.zw;
 vec2 transportedUV=materialUV;vec4 mediumMark;
 materialUV=mediumSample(materialUV,current,aspect,mediumMark);
 vec2 sharedWarp=vec2(fbm(materialUV*3.1+4.7),fbm(materialUV*3.1+21.3))-.46;
 float grain=fbm(materialUV*27.);
 float amountTotal=0.,squareTotal=0.,waveTotal=0.;vec3 contactLight=vec3(0),warmPigment=vec3(0);
 // Stream through the textures instead of retaining all material records
 // per fragment. Every sea still contributes to the shared interference.
 for(int i=0;i<MAX_SEAS;i++){
  if(i>=seaCount)break;
  vec4 material=mix(field(previousState,scene,i),field(state,scene,i),interpolation);
  // Slightly sharpen pigment concentration while retaining continuous overlap.
  float amount=pow(max(.00001,material.a),1.32);
  amountTotal+=amount;squareTotal+=amount*amount;
  waveTotal+=material.g*amount;
  contactLight+=texelFetch(seaStyles,ivec2(11,i),0).rgb*amount;
  if(artMedium==0||artMedium==1||artMedium==5||artMedium==6||artMedium==7)warmPigment+=texelFetch(seaStyles,ivec2(13,i),0).rgb*amount;
 }
 float mixing=clamp(1.-squareTotal/max(.000001,amountTotal*amountTotal),0.,1.);
 float curl=dFdx(current.y)*resolution.x-dFdy(current.x)*resolution.y;
 float agitation=clamp(length(current)*.75+abs(curl)*.008,0.,1.)*mixing;
 vec3 radiance=vec3(0);float weightTotal=0.,inkAccent=0.;
 // The loop count is uniform across the screen. Derivatives inside paintSea
 // remain well-defined, including through transparent apertures.
 for(int i=0;i<MAX_SEAS;i++){
  if(i>=seaCount)break;
  vec4 material=mix(field(previousState,scene,i),field(state,scene,i),interpolation);
  float amount=pow(max(.00001,material.a),1.32);
  vec4 layer=paintSea(i,materialUV,material,current,sharedWarp,grain,agitation,false);
  if(i==int(seaTransition.x)&&seaTransition.y>0.){
   // Only the transforming sea needs a second evaluation. Both structures
   // read the same living wave, pigment and material-coordinate history.
   vec4 next=paintSea(i,materialUV,material,current,sharedWarp,grain,agitation,true);
   layer=vec4(sqrt(mix(layer.rgb*layer.rgb,next.rgb*next.rgb,seaTransition.y)),mix(layer.a,next.a,seaTransition.y));
  }
  float weight=amount*layer.a;
  if(artMedium==3)inkAccent=max(inkAccent,(1.-dot(layer.rgb,vec3(.2126,.7152,.0722)))*pow(amount/max(amountTotal,.00001),.22));
  if(artMedium==5)inkAccent=max(inkAccent,dot(layer.rgb,vec3(.2126,.7152,.0722))*pow(amount/max(amountTotal,.00001),.22));
  if(artMedium==7||artMedium==8)inkAccent=max(inkAccent,(1.-dot(layer.rgb,vec3(.2126,.7152,.0722)))*pow(amount/max(amountTotal,.00001),.22));
  radiance+=layer.rgb*layer.rgb*weight;weightTotal+=weight;
 }
 vec3 colour=sqrt(radiance/max(.00001,weightTotal));
 // Interference light follows the actual combined wave and shared current.
 // It forms inside mixing water, without tracing a partition between sources.
 float interference=pow(.5+.5*sin(waveTotal/max(.00001,amountTotal)*21.+length(current)*5.),8.);
 colour+=contactLight/max(.00001,amountTotal)*agitation*interference*.11*(1.-memoryView);
 // Touch bends the actual pigment surface. Light follows the simulated slope
 // of the pressure wave, so expanding crests refract and catch the same palette.
 vec3 rippleNormal=normalize(vec3(-ripple.gb*.12,1.));
 vec3 rippleKey=normalize(vec3(-.35,.5,1.));
 float rippleShade=clamp(dot(rippleNormal,rippleKey)-rippleKey.z,-.3,.3);
 float rippleGlint=max(0.,pow(max(0.,dot(rippleNormal,normalize(vec3(-.35,.5,2.)))),36.)-.20);
 colour*=1.+rippleShade*ripple.a*.6;
 vec3 pearl=mix(contactLight/max(.00001,amountTotal),vec3(.97,.92,.80),.4);
 colour+=pearl*rippleGlint*ripple.a*.27*(1.-memoryView*.7);
 vec3 mediumAccent=mix(contactLight,warmPigment,step(.68,mediumMark.w))/max(.00001,amountTotal);
 if(artMedium==5||artMedium==7){
  float accentBlend=smoothstep(.30,.70,noise(transportedUV*vec2(aspect,1.)*4.3+13.));
  mediumAccent=mix(contactLight,warmPigment,accentBlend)/max(.00001,amountTotal);
 }
 colour=finishMedium(colour,transportedUV,scene,mediumMark,mediumAccent,inkAccent);
 colour+=(hash(gl_FragCoord.xy+texelFetch(seaStyles,ivec2(0,0),0).xy)-.5)*.010;
 if(artMedium==4)colour*=1.-.10*pow(length(uv-.5),1.5);
 else if(artMedium<2)colour*=1.-.06*pow(length(uv-.5),1.5);
 fragColor=vec4(pow(max(colour,vec3(0)),vec3(.96)),1.);
}`;

// A compile-time medium lets mobile drivers remove unused material branches
// and their temporary registers. The selected medium's mathematics is unchanged.
export function fragmentForMedium(id){
 if(!Number.isInteger(id)||id<0||id>8)throw new Error('Unknown painting medium.');
 return fragment.replace('uniform int artMedium;',`const int artMedium=${id};`);
}
