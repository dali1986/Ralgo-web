import { originalSurface } from './original-medium.js?v=38';
import { materialFunctions } from './material-textures.js?v=38';
export const MEDIA=Object.freeze([
  Object.freeze({id:4,key:'original',label:'Original'}),
  Object.freeze({id:0,key:'oil',label:'Oil / impasto'}),
  Object.freeze({id:1,key:'pointillist',label:'Impressionist / pointillist'}),
  Object.freeze({id:2,key:'watercolour',label:'Watercolour'}),
  Object.freeze({id:3,key:'ink',label:'Ink on paper'}),
  Object.freeze({id:5,key:'chalk',label:'Chalk on board'}),
  Object.freeze({id:6,key:'collage',label:'Collage'}),
  Object.freeze({id:7,key:'whiteboard',label:'White board / coloured pens'}),
  Object.freeze({id:8,key:'pencil',label:'Pencil sketch'})
]);
const preference='what-water:medium';
export function nextMedium(current){return MEDIA[(MEDIA.indexOf(mediumFor(current.key))+1)%MEDIA.length];}
export function mediumFor(value){return MEDIA.find(m=>m.key===value)||MEDIA[0];}
export function readMedium(storage){try{return mediumFor(storage?.getItem(preference));}catch{return MEDIA[0];}}
export function rememberMedium(medium,storage){try{storage?.setItem(preference,mediumFor(medium.key).key);}catch{}}

// These marks are evaluated in transported pigment coordinates. Their scale
// belongs to the painting, so a camera dive or large PNG reveals the same marks.
export const mediumFunctions=`
float mediumGrain(vec2 p,float scale){
 vec2 grainPoint=p*scale;
 float footprint=max(fwidth(grainPoint.x),fwidth(grainPoint.y));
 return mix(noise(grainPoint),.5,smoothstep(.35,1.25,footprint));
}
// Measure painted contours before adding any material texture. World-space
// normalization keeps the protection consistent in a dive and a large PNG.
float mediumEdge(vec3 colour,vec2 p){
 float distancePerPixel=max(length(dFdx(p)),length(dFdy(p)));
 float gradient=max(length(dFdx(colour)),length(dFdy(colour)))/max(distancePerPixel,.000001);
 return smoothstep(12.,64.,gradient);
}
${materialFunctions}
vec2 mediumSample(vec2 p,vec2 current,float aspect,out vec4 mark){
 mark=vec4(0.);
 if(artMedium==0){
  vec2 grid=p*vec2(aspect,1.)*vec2(12.,29.),cell=floor(grid);
  float best=100.;
  for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
   vec2 id=cell+vec2(float(x),float(y));
   float identity=hash(id+41.7);
   vec2 candidate=id+.5+(vec2(hash(id+4.),hash(id+87.))-.5)*.62;
   float angle=(identity-.5)*.9+atan(current.y,current.x+.0001)*.12;
   vec2 local=turn(angle)*(grid-candidate);
   local.y+=sin(local.x*2.3+identity*17.)*.10;
   float distanceToBrush=length(local/vec2(1.1,.67));
   if(distanceToBrush<best){best=distanceToBrush;mark=vec4(local,best,identity);}
  }
  // Brush ridges alter relief only. Preserve every transported sea contour
  // instead of pulling its sampling position towards the centre of a dab.
  return p;
 }
 if(artMedium==6){
  vec2 paperGrid=p*vec2(aspect,1.)*vec2(6.7,9.8);
  paperGrid.x+=paperGrid.y*.17;
  paperGrid+=(vec2(noise(paperGrid*7.1),noise(paperGrid*7.7+41.))-.5)*.075;
  vec2 cell=floor(paperGrid),local=vec2(0.);
  float first=100.,second=100.,identity=0.,top=-1.;
  vec2 topLocal=vec2(0.);float topEdge=0.,topIdentity=0.;
  for(int y=-2;y<=2;y++)for(int x=-2;x<=2;x++){
   vec2 id=cell+vec2(float(x),float(y));
   vec2 candidate=id+.5+(vec2(hash(id+7.1),hash(id+33.))-.5)*.64;
   float d=length(paperGrid-candidate);
   if(d<first){second=first;first=d;local=paperGrid-candidate;identity=hash(id+71.);}
   else second=min(second,d);
   vec2 cutLocal=turn((hash(id+15.)-.5)*2.7)*(paperGrid-candidate);
   vec2 extent=vec2(.43+hash(id+21.)*.75,.30+hash(id+59.)*.62);
   float paperEdge=min(extent.x-abs(cutLocal.x),extent.y-abs(cutLocal.y));
   paperEdge=min(paperEdge,extent.x+extent.y-.12-abs(cutLocal.x)-abs(cutLocal.y));
   // Some clippings are rounded or cut on a diagonal, alongside torn strips.
   if(hash(id+63.)>.78)paperEdge=min(paperEdge,(1.-length(cutLocal/extent))*min(extent.x,extent.y));
   float layer=hash(id+101.);
   if(paperEdge>0.&&layer>top){top=layer;topLocal=cutLocal;topEdge=paperEdge;topIdentity=hash(id+71.);}
  }
  mark=vec4(local,second-first,identity);
  // Rotated, differently sized clippings overlap by a stable layer order.
  // A coloured paper ground fills the small spaces between those clippings.
  if(top>=0.)mark=vec4(topLocal,topEdge,topIdentity);
  // Paper keeps its own cut, rotation and texture, but the same current
  // crosses every piece. Independent cropping used to sever those flows.
  return p;
 }
 if(artMedium!=1)return p;
 vec2 grid=p*vec2(aspect,1.)*126.,cell=floor(grid);
 float best=100.;
 // One shared dab field, with exact sea colour at every point inside a dab.
 // A fine crest can split a mark rather than disappear into its centre sample.
 for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
  vec2 id=cell+vec2(float(x),float(y));
  float identity=hash(id+17.3);
  vec2 candidate=id+.5+(vec2(hash(id+3.7),hash(id+43.1))-.5)*.58;
  float angle=(identity-.5)*1.6+atan(current.y,current.x+.0001)*.18;
  vec2 local=turn(angle)*(grid-candidate);
  float distanceToDab=length(local/vec2(1.18,.82));
  if(distanceToDab<best){best=distanceToDab;mark=vec4(local,.40+hash(id+81.)*.18,identity);}
 }
 return p;
}
vec3 finishMedium(vec3 colour,vec2 p,vec2 scene,vec4 mark,vec3 accent,float inkAccent){
 float aspect=min(resolution.x/resolution.y,2.05);
 vec2 paperPoint=scene*vec2(aspect,1.);
 if(artMedium==0)return oilFinish(colour,p*vec2(aspect,1.),mark,accent);
 if(artMedium==1){
  float edge=mediumEdge(colour,p*vec2(aspect,1.));
  float distanceToDab=length(mark.xy/vec2(1.18,.82)),aa=max(fwidth(distanceToDab),.012);
  float radius=mark.z*mix(1.,.88,edge);
  float dab=1.-smoothstep(radius-aa,radius+aa,distanceToDab);
  float warm=step(.68,mark.w),spark=step(.93,mark.w);
  vec3 complement=mix(accent,accent.gbr,.24*step(mark.w,.22));
  vec3 strokePaint=mix(colour,complement,(.12+warm*.22)*mix(1.,.12,edge));
  float luminance=dot(strokePaint,vec3(.2126,.7152,.0722));
  strokePaint=max(vec3(0.),mix(vec3(luminance),strokePaint,1.26));
  strokePaint*=mix(.91+.22*hash(vec2(mark.w*71.,4.)),1.,edge*.85);
  strokePaint=mix(strokePaint,mix(colour,vec3(1.,.96,.77),.36),spark*.34*(1.-edge*.90));
  vec3 underpaint=mix(colour*.77+accent*.12,colour*.97,edge);
  float bristle=mediumGrain(p*vec2(aspect,1.),740.);
  return mix(underpaint,strokePaint,dab)*(.97+bristle*.055);
 }
 if(artMedium==2){
  float tooth=mediumGrain(paperPoint,520.);
  return colour*(.967+tooth*.056);
 }
 if(artMedium==3){
  float tooth=mediumGrain(paperPoint,640.),fibre=mediumGrain(paperPoint*vec2(.22,1.),910.);
  vec3 paper=vec3(.976,.963,.924)*(.978+tooth*.029+fibre*.012);
  float darkness=clamp(1.-dot(colour,vec3(.2126,.7152,.0722))/.955,0.,1.);
  float density=clamp(smoothstep(.035,.70,max(darkness*1.10,inkAccent*1.22)),0.,.993);
  vec3 ink=vec3(.013,.022,.030);
  return mix(paper,ink,density);
 }
 if(artMedium==5){
  float tooth=mediumGrain(paperPoint,870.),rub=mediumGrain(paperPoint*vec2(.08,1.),150.);
  float density=dot(colour,vec3(.2126,.7152,.0722));
  density=smoothstep(.09,.74,max(density,inkAccent*.90));
  density*=.48+smoothstep(.22,.68,tooth)*.52;
  // Most passages use white chalk. Sparse, stable islands admit pastel chalk.
  vec2 chalkCell=floor(p*vec2(aspect,1.)*vec2(5.,7.));
  float exception=step(.90,hash(chalkCell+23.));
  exception*=smoothstep(.18,.62,noise(p*vec2(aspect,1.)*21.+chalkCell));
  vec3 chalk=mix(vec3(.975,.980,.973),sqrt(max(accent,vec3(.05)))*.82+vec3(.15),exception*.88);
  vec3 board=vec3(.009,.011,.013)+vec3(.012)*rub;
  return mix(board,chalk,clamp(density,0.,1.));
 }
 if(artMedium==6)return collageFinish(colour,p*vec2(aspect,1.),mark,accent);
 if(artMedium==7){
  float density=clamp(1.-dot(colour,vec3(.2126,.7152,.0722)),0.,1.);
  density=smoothstep(.13,.66,max(density,inkAccent*.90));
  vec2 inkPoint=p*vec2(aspect,1.);
  float broad=stroke(inkPoint.y*33.+noise(inkPoint*4.)*.3,.30);
  vec3 pen=markerInk(mix(accent,accent.gbr,step(.77,noise(inkPoint*6.+31.))*.70));
  float pressure=.70+.22*noise(inkPoint*vec2(6.,87.))+.08*broad;
  // A chisel nib lays a translucent centre and a darker, doubled wet edge.
  float wetEdge=4.*density*(1.-density);
  vec3 ink=mix(pen,pen*.52,wetEdge*.35);
  float wipe=mediumGrain(paperPoint*vec2(.045,1.),63.);
  vec3 board=vec3(.992,.994,.995)-vec3(.009,.007,.004)*wipe;
  return mix(board,ink,clamp(density*pressure,0.,.98));
 }
 if(artMedium==8){
  float tooth=mediumGrain(paperPoint,690.);
  float fibre=mediumGrain(paperPoint*vec2(.19,1.),860.);
  vec2 pencilPoint=p*vec2(aspect,1.),hatchPoint=turn(.57)*pencilPoint;
  float darkness=clamp(1.-dot(colour,vec3(.2126,.7152,.0722))/.976,0.,1.);
  float contour=clamp(max(darkness*1.18,inkAccent*.96),0.,.98);
  // Short, crossing graphite strokes shade the sea's volume. Their spacing
  // remains readable at playback resolution and opens up during a camera dive.
  float first=stroke(hatchPoint.y*96.+noise(pencilPoint*15.)*.22,.12);
  float second=stroke((hatchPoint.x*.91+hatchPoint.y*.42)*121.+noise(pencilPoint*19.+7.)*.18,.095);
  float broken=.42+.58*smoothstep(.19,.69,noise(hatchPoint*vec2(61.,8.)+23.));
  float shading=smoothstep(.025,.34,darkness);
  float cross=smoothstep(.16,.49,darkness);
  float graphite=pow(contour,.88)*(.80+tooth*.20);
  graphite+=first*broken*shading*.27+second*broken*cross*.22;
  graphite+=darkness*.045;
  vec3 paper=vec3(.980,.977,.966)*(.985+tooth*.018+fibre*.007);
  vec3 lead=mix(vec3(.105,.113,.123),vec3(.26,.265,.27),fibre*.29);
  return mix(paper,lead,clamp(graphite,0.,.97));
 }
 return colour;
}
`;

// Inserted at the material stage, while the sea's contours, actual wave height,
// palette and sediment are available. These are different ways to lay pigment,
// with a shared finish where pigment relief must survive many mixing seas.
export const mediumSurface=`
 float lightLobe=pow(max(0.,dot(reflect(-normalize(vec3(-.5,.6,1.)),normal),vec3(0,0,1))),18.);
 vec3 ground=mix(water,mineral,warm);
 if(artMedium==4){
 ${originalSurface}
 }else if(artMedium==0){
  vec2 brush=vec2(q.x+warp.x*.12,q.y+sin(q.x*2.7+t*.08)*.042);
  float load=smoothstep(.19,.76,noise(brush*vec2(3.2,16.)+origin)+deposit*.14);
  float bristle=stroke(brush.y*(42.+thickness*13.)+noise(brush*vec2(2.,9.)+origin)*.62,.13);
  float scrape=stroke(brush.y*19.+noise(brush*vec2(3.,6.)+origin)*.32,.048);
  vec3 loadedPaint=mix(water,mineral,warm);
  colour=mix(colour,loadedPaint,.12+load*.12);
  colour=mix(colour,mix(colours[2],colours[4],warm),bristle*load*.18);
  colour=mix(colour,pearl,clamp(lines*.40+fine*.30+scrape*load*.24+foam*.09,0.,.66));
  // Thin passages carry the engraving too; the broad underpaint must not
  // erase it when a sea's geometric body becomes less opaque.
  ground=colour*(.975+load*.025);
 }else if(artMedium==1){
  // The dots carry the exact wave contours, including the finest engraving.
  vec3 brokenColour=mix(water,mineral,warm);
  colour=mix(colour,brokenColour,.18);
  colour=mix(colour,mix(colours[2],colours[4],warm),ridge*.15);
  colour=mix(colour,pearl,foam*.14+lines*.25+fine*.16);
  ground=colour*.985;
 }else if(artMedium==2){
  float grain=mediumGrain(q+origin,91.);
  float wet=fbm(q*5.2+origin*.37);
  float bloom=noise(q*13.+origin+warp*.7);
  float tide=phase*.53+(bloom-.5)*.22;
  float pooling=stroke(tide,.058)*(.55+.45*grain);
  float backrun=stroke(tide+.075,.032)*smoothstep(.22,.70,wet);
  vec3 pigment=mix(water,mineral,warm);
  pigment=mix(pigment,mix(colours[2],colours[4],warm),.12+bloom*.18);
  float density=.68+wet*.33+pooling*.36+(grain-.5)*.24+deposit*.11;
  vec3 wash=exp(log(max(pigment,vec3(.025)))*density);
  vec3 paper=vec3(.985,.970,.930);
  colour=wash*paper;
  colour=mix(colour,pigment,pooling*.28);
  colour=mix(colour,mix(paper,pigment,.48),backrun*.26+lines*.10+fine*.07);
  colour=mix(colour,mix(colours[2],colours[5],.30),foam*.15);
  ground=exp(log(max(pigment,vec3(.025)))*.73)*paper;
 }else if(artMedium==3){
  float tooth=mediumGrain(q+origin,148.);
  vec2 qx=dFdx(q),qy=dFdy(q);
  float px=dFdx(phase),py=dFdy(phase);
  // Pull the contour tangent back into the sea's own coordinates. A fixed
  // broad nib keeps its thick/thin relationship when the camera rotates.
  vec2 gradient=vec2(px*qy.y-py*qx.y,py*qx.x-px*qy.x);
  vec2 tangent=vec2(-gradient.y,gradient.x)/max(length(gradient),.000000000001);
  vec2 nibDirection=turn(.38+hash(origin+7.)*.65)*vec2(1.,0.);
  float nibFace=.14+.86*abs(dot(tangent,nibDirection));
  float travel=q.x*.58+q.y*.83+noise(q*2.+origin)*.16;
  float gesture=fract(travel*1.35+hash(origin+23.));
  float taper=smoothstep(.015,.23,gesture)*(1.-smoothstep(.65,.99,gesture));
  float pressure=(.12+.88*taper)*(.67+.33*noise(q*vec2(3.,8.)+origin));
  float width=(.012+.105*pow(nibFace,1.3)*pressure)*clamp(breadth,.76,1.38);
  float path=phase+(tooth-.5)*.007;
  float brush=stroke(path,width)*activity;
  float hair=stroke(path*3.+detail*.05,.012)*activity;
  float trailing=stroke(path+.045*pressure,.009)*taper*activity;
  float split=stroke(path*17.+noise(q*vec2(4.,19.)+origin)*.12,.14);
  float dry=smoothstep(.30,.75,noise(q*vec2(7.,53.)+origin));
  float density=.015+brush*(.82+pressure*.17)+hair*.24+trailing*.20+min(1.,edgeLight)*.18;
  density-=split*brush*(1.-pressure)*.39;
  density*=.86+tooth*.08+dry*.06;
  vec3 paper=vec3(.976,.963,.924);
  vec3 ink=vec3(.013,.022,.030);
  colour=mix(paper,ink,clamp(density,0.,.993));
  ground=mix(paper,ink,.012+hair*.20+brush*.26);
 }else if(artMedium==5){
  float tooth=mediumGrain(q+origin,155.);
  float drag=noise(q*vec2(8.,67.)+origin);
  float dust=smoothstep(.24,.73,tooth*.65+drag*.35);
  float side=stroke(phase,.23*breadth),trace=stroke(phase*4.+detail*.18,.062);
  float rub=noise(q*vec2(2.6,11.)+origin*.3);
  vec3 chalk=vec3(.97),board=vec3(.012);
  float pressure=clamp(.018+ridge*.15+side*.53+trace*.60+min(1.,edgeLight)*.21,0.,.98);
  colour=mix(board,chalk,pressure*(.30+dust*.70));
  colour=mix(colour,chalk,(lines*.39+fine*.20)*dust);
  ground=mix(board,chalk,.014+rub*.023);
 }else if(artMedium==6){
  vec3 paperPaint=mix(water,mineral,warm);
  colour=mix(colour,paperPaint,.12);
  colour=mix(colour,mix(colours[2],colours[4],warm),ridge*.12);
  colour=mix(colour,pearl,lines*.30+fine*.23);
  colour*=.97+mediumGrain(q+origin,76.)*.05;
  ground=colour*.985;
 }else if(artMedium==7){
  float nib=noise(q*vec2(5.,61.)+origin);
  float path=phase+noise(q*5.+origin)*.025;
  float chisel=stroke(path,.060*clamp(breadth,.75,1.45));
  float hair=stroke(path*3.+detail*.09,.018)*activity;
  float returnPass=stroke(path+.046,.020)*smoothstep(.38,.70,nib);
  float density=clamp(chisel*(.73+nib*.23)+hair*.61+returnPass*.34+min(1.,edgeLight)*.24,0.,.98);
  colour=vec3(1.-density);
  ground=vec3(.992);
 }else if(artMedium==8){
  float tooth=mediumGrain(q+origin,139.);
  float pressure=.64+.36*noise(q*vec2(8.,51.)+origin);
  float path=phase+(tooth-.5)*.014;
  float contour=stroke(path,.025*clamp(breadth,.78,1.35))*activity;
  float searching=stroke(path+.044,.012)*smoothstep(.32,.71,noise(q*7.+origin+19.))*activity;
  float hair=stroke(path*5.+detail*.11,.018)*activity;
  float density=.008+ridge*.115+contour*.87+searching*.24+hair*.38+min(1.,edgeLight)*.23;
  density+=deposit*.055+fine*.13;
  density*=pressure*(.86+tooth*.14);
  vec3 paper=vec3(.980,.977,.966),lead=vec3(.105,.113,.123);
  colour=mix(paper,lead,clamp(density,0.,.985));
  ground=mix(paper,lead,.012+ridge*.05+hair*.20);
 }
`;
