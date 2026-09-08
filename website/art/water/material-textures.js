// Material marks share the transported coordinates of the living painting.
// They are procedural, deterministic and independent of the animation clock.
export const markerFunctions=`
vec3 markerInk(vec3 pigment){
 const vec3 pens[8]=vec3[8](vec3(.025,.13,.68),vec3(.81,.035,.10),
  vec3(.015,.48,.30),vec3(.64,.025,.48),vec3(.94,.28,.015),
  vec3(.015,.48,.67),vec3(.32,.055,.66),vec3(.65,.45,.015));
 vec3 hue=normalize(max(pigment-min(pigment.r,min(pigment.g,pigment.b)),vec3(.0001)));
 vec3 chosen=pens[0];float best=100.;
 for(int i=0;i<8;i++){
  vec3 penHue=normalize(max(pens[i]-min(pens[i].r,min(pens[i].g,pens[i].b)),vec3(.0001)));
  float distanceToPen=dot(hue-penHue,hue-penHue);
  if(distanceToPen<best){best=distanceToPen;chosen=pens[i];}
 }
 return chosen;
}
`;

export const materialFunctions=markerFunctions+`
vec3 oilFinish(vec3 colour,vec2 p,vec4 mark,vec3 accent){
 // A shared top layer keeps the bristle relief visible even with fifty seas.
 vec2 b=mark.xy;
 float edge=length(b/vec2(1.10,.67));
 float aa=max(fwidth(edge),.012);
 float body=1.-smoothstep(.72-aa,1.02+aa,edge);
 float tuft=mediumGrain(b*vec2(.10,1.)+mark.w*83.,8.5);
 float bristle=stroke(b.y*3.7+sin(b.x*2.8+mark.w*41.)*.17,.19);
 float hair=stroke(b.y*13.+sin(b.x*2.8+mark.w*41.)*.28,.15);
 float strands=bristle*.77+hair*.23;
 float split=stroke(b.y*2.3+noise(b*vec2(1.2,2.8)+mark.w*27.)*.32,.075);
 float end=1.-smoothstep(.48,1.06,abs(b.x)+(tuft-.5)*.20);
 float rolled=exp(-pow((edge-.83)/.105,2.));
 float load=.62+.38*hash(vec2(mark.w*173.,21.));
 float thickness=body*end*(.017+tuft*.008+strands*.005)*load+rolled*.006;
 // Relief comes from the deposited paint, not a dark silhouette or vignette.
 vec2 slope=clamp(vec2(dFdx(thickness)*resolution.x,dFdy(thickness)*resolution.y)*.22,vec2(-2.5),vec2(2.5));
 vec3 normal=normalize(vec3(-slope,1.));
 vec3 lamp=normalize(vec3(-.62,.72,1.));
 float diffuse=dot(normal,lamp);
 float sheen=pow(max(0.,dot(normal,normalize(lamp+vec3(0.,0.,1.)))),32.);
 vec3 pigment=max(colour,vec3(.008));
 float value=dot(pigment,vec3(.2126,.7152,.0722));
 pigment=max(vec3(.008),mix(vec3(value),pigment,1.14));
 vec3 loaded=mix(pigment,accent,.035+.065*step(.77,mark.w));
 // Lighter paint catches at the bristle tips; underpaint shows in dry grooves.
 loaded=mix(loaded,mix(pigment,vec3(1.,.94,.81),.28),strands*tuft*.25);
 loaded=mix(loaded,pigment*.82,split*body*.27);
 vec3 paint=mix(pigment,loaded,body*.82);
 paint*=clamp(.98+(diffuse-lamp.z)*.28,.84,1.13);
 paint+=mix(paint,vec3(1.,.97,.87),.32)*sheen*(.11+rolled*.14)*load;
 float canvas=mediumGrain(p*vec2(1.,.24),920.);
 return paint*(.983+canvas*.025);
}

vec3 collageFinish(vec3 colour,vec2 p,vec4 mark,vec3 accent){
 vec2 cut=mark.xy;
 float identity=mark.w;
 float flowEdge=mediumEdge(colour,p);
 int material=int(floor(hash(vec2(identity*173.,29.))*7.));
 float tooth=mediumGrain(cut+identity*31.,138.);
 float fibre=mediumGrain(cut*vec2(.13,1.)+identity*71.,230.);
 float torn=1.-smoothstep(.012,.067,mark.z);
 float lip=1.-smoothstep(.003,.021,mark.z);
 float luminance=dot(colour,vec3(.2126,.7152,.0722));
 vec3 dyed=mix(colour,accent,.045);
 vec3 result=dyed;
 vec3 edgePaper=vec3(.94,.91,.82);
 // All derivative-filtered marks are evaluated before the varying material
 // branch, including the foil normal, so clipped edges do not poison gradients.
 vec2 typePoint=cut*vec2(16.,22.);
 vec2 glyph=fract(typePoint),letter=floor(typePoint);
 float letterSeed=hash(letter+identity*43.);
 float stem=(1.-smoothstep(.11,.23,abs(glyph.x-.22)))*step(.18,glyph.y)*step(glyph.y,.79);
 float bars=stroke(typePoint.y*3.,.16)*step(glyph.x,.78)*step(.17,glyph.y)*step(glyph.y,.80);
 float typeInk=max(stem,bars*step(.24,letterSeed))*step(.18,letterSeed);
 typeInk*=1.-smoothstep(.35,1.05,max(fwidth(typePoint.x),fwidth(typePoint.y)));
 float column=step(.08,fract(cut.x*2.7+identity));
 float headline=stroke(cut.y*9.+identity*7.,.13)*step(.79,hash(floor(cut*vec2(1.,9.))+identity));
 float warp=stroke(cut.x*16.+noise(cut*7.+identity)*.12,.24);
 float weft=stroke(cut.y*11.,.24);
 float twill=stroke((cut.x+cut.y)*8.,.25);
 float stitch=stroke(cut.y*24.,.23)*(1.-smoothstep(.045,.085,mark.z))*smoothstep(.014,.035,mark.z);
 float corrugated=.5+.5*sin(cut.x*74.+noise(cut*3.+identity)*2.);
 corrugated=mix(corrugated,.5,smoothstep(.4,1.5,fwidth(cut.x*74.)));
 float foldField=noise(cut*6.+identity*9.)*.65+noise(cut*17.+identity*37.)*.35;
 float crumple=abs(foldField-.51);
 vec3 foilNormal=normalize(vec3(-dFdx(crumple)*resolution.x*.032,-dFdy(crumple)*resolution.y*.032,1.));
 float reflection=clamp(.5+dot(foilNormal,normalize(vec3(-.6,.7,.3)))*.5,0.,1.);
 float foilGlint=pow(reflection,12.);
 float dots=stroke(cut.x*17.,.23)*stroke(cut.y*12.,.23);
 float tissueCrease=stroke(cut.x*3.+cut.y*1.7+noise(cut*4.)*.28,.022);
 float ragBrush=stroke(cut.y*16.+noise(cut*4.)*.4,.10);
 if(material==0){
  // Newsprint: columns of letter-sized ink and coarse halftone sea imagery.
  vec3 news=vec3(.94,.915,.845)*(.96+tooth*.055);
  float photo=smoothstep(.18,.74,luminance);
  result=mix(news,dyed,.58+photo*.19);
  float printInk=clamp(typeInk*column*.36+headline*.29+dots*(1.-photo)*.17,0.,.63);
  result=mix(result,vec3(.10,.115,.12),printInk*(1.-flowEdge*.80));
 }else if(material==1){
  // Kraft card has a ribbed cut core and absorbed pigment with no gloss.
  vec3 card=mix(vec3(.43,.23,.09),vec3(.78,.53,.28),tooth*.65+fibre*.35);
  result=mix(card,dyed,.68+.12*luminance);
  result*=.93+corrugated*.085;
  edgePaper=mix(vec3(.38,.19,.055),vec3(.83,.62,.34),corrugated);
 }else if(material==2){
  // Woven cloth: crossing threads, diagonal twill and a frayed, stitched edge.
  vec3 cloth=mix(dyed,vec3(.035,.13,.29),.15);
  result=cloth*(.77+warp*.16+weft*.15+twill*.14);
  result+=mix(cloth,vec3(.94,.91,.78),.38)*warp*weft*.18;
  result=mix(result,vec3(.91,.87,.70),stitch*.70);
  edgePaper=mix(cloth,vec3(.93,.90,.77),.57);
 }else if(material==3){
  // Crumpled metal foil reflects the sea in sharp, angular silver facets.
  vec3 metal=mix(vec3(.19,.24,.30),vec3(.96,.99,1.),reflection);
  result=mix(metal,dyed,.64)*(.90+reflection*.15)+vec3(1.)*foilGlint*.13;
  edgePaper=vec3(.83,.89,.92);
 }else if(material==4){
  // Glossy clippings carry the same continuous sea under a printed varnish.
  result=pow(max(dyed,vec3(.008)),vec3(.82));
  result*=.90+dots*.14;
  float varnish=pow(.5+.5*cos(cut.x*2.3-cut.y*.8+identity*9.),14.);
  result=mix(result,vec3(.97,.985,1.),varnish*.085);
  edgePaper=vec3(.97,.98,.985);
 }else if(material==5){
  // Tissue lets the underlying sea show through its translucent dyed fibres.
  vec3 tissue=mix(accent,vec3(.98,.94,.85),.25);
  result=mix(colour,tissue,.14+fibre*.12);
  result=mix(result,dyed*.79,tissueCrease*.28);
  edgePaper=mix(tissue,vec3(.98,.96,.88),.38);
 }else{
  // Painted rag paper keeps saturated gouache and visible ragged pulp.
  result=dyed*(.86+tooth*.18);
  result=mix(result,accent,ragBrush*.13);
  edgePaper=vec3(.95,.92,.83);
 }
 // Let fine currents print through every material and cross its torn edge.
 // Quiet areas keep the stronger fibres, weave, type and metal reflections.
 result=mix(result,colour,flowEdge*.48);
 edgePaper=mix(edgePaper,colour,flowEdge*.74);
 result=mix(result,edgePaper,torn*(.24+fibre*.44));
 return result+edgePaper*lip*.055;
}
`;
