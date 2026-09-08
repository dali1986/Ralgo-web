window.FIRE_VERTEX = `
attribute vec2 position;
void main(){gl_Position=vec4(position,0.,1.);}
`;
// Both the hearth and its visions use the same rising turbulence and flame material.
window.FIRE_COMMON = `
float ramp(float a,float b,float x){float k=clamp((x-a)/(b-a),0.,1.);return k*k*(3.-2.*k);}
float hash(vec2 p){vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+1.),f.x),f.y);}
float fbm(vec2 p){float f=0.,a=.5;mat2 m=mat2(.8,-.6,.6,.8);for(int i=0;i<4;i++){f+=a*noise(p);p=m*p*2.03+17.13;a*=.5;}return f;}
float localFuel(float x){
  float q=clamp((x+.75)*2.,0.,3.);
  if(q<1.)return mix(fuelHeat.x,fuelHeat.y,ramp(0.,1.,q));
  if(q<2.)return mix(fuelHeat.y,fuelHeat.z,ramp(1.,2.,q));
  return mix(fuelHeat.z,fuelHeat.w,ramp(2.,3.,q));
}
float hearthFlare(vec2 p){
  float age=max(hearthEvent.z,0.);
  float catching=step(1.5,hearthEvent.w)*(1.-step(2.5,hearthEvent.w));
  float life=step(0.,hearthEvent.z)*ramp(0.,1.5+catching*1.1,age)*ramp(16.,6.,age)*weather.w*(.75+catching*.45);
  return exp(-pow((p.x-hearthEvent.x)*5.5,2.))*life;
}
vec4 fireFlow(vec2 p,float layer,float t){
  float y=max(p.y,0.);
  // Compression in height makes the same eddies accelerate as they rise.
  // The foot stays attached to its fuel while the upper sheets roll freely.
  float lift=log(1.+y*1.65)/1.65;
  vec2 flow=vec2(p.x*3.+layer*.23+weather.z,lift*4.1-t*(.94+layer*.065));
  float large=fbm(flow);
  float eddy=fbm(flow*1.75+vec2(large*1.7,-t*.19));
  float warp=(large-.5)*(.018+y*y*.15)+(eddy-.5)*y*.065;
  float pull=exp(-length(p-pointer.xy)*3.5)*pointer.z;
  float drift=warp+pull*.15*(eddy-.5)-(cue.x*.12+weather.y*.22)*y;
  drift+=(noise(vec2(y*3.8-t*.83,p.x*4.+weather.z))-.5)*y*y*.036;
  return vec4(p.x+drift,large,eddy,drift);
}
`;
// This texture carries only the shape of the fuel and its rising wake, never light.
// R: softened fuel envelope; G: convected envelope; B: supply from the ember bed.
window.FIRE_THERMAL = `
precision highp float;
uniform sampler2D history, scene, fuel;
uniform vec2 fieldSize;
uniform float time, delta, vision, clarity, ignition, reset, lettering;
uniform vec3 pointer;
uniform vec4 cue;
uniform vec4 fuelHeat, weather, hearthEvent;
${window.FIRE_COMMON}
float guide(vec2 uv){
  float inside=step(0.,uv.x)*step(uv.x,1.)*step(0.,uv.y)*step(uv.y,1.);
  return texture2D(scene,uv).r*inside;
}
void main(){
  vec2 uv=gl_FragCoord.xy/fieldSize;
  vec2 p=vec2((uv.x-.5)*2.4,uv.y*1.45);
  vec4 flow=fireFlow(p,0.,time);
  vec2 velocity=vec2((flow.y-.5)*.24+cue.x*.10+weather.y*.08-flow.w*.40,.30+p.y*.32+cue.w*.55);
  vec2 back=uv-velocity*delta/vec2(2.4,1.45);
  vec3 old=texture2D(history,back).rgb*(1.-reset);
  old*=step(0.,back.x)*step(back.x,1.)*step(0.,back.y)*step(back.y,1.);
  vec2 shapeUV=vec2(uv.x,1.-uv.y);
  vec2 radius=vec2(.009+(1.-clarity)*.013)/vec2(2.4,1.45);
  float centre=guide(shapeUV);
  float source=centre*.36;
  source+=(guide(shapeUV+vec2(radius.x,0.))+guide(shapeUV-vec2(radius.x,0.)))*.16;
  source+=(guide(shapeUV+vec2(0.,radius.y))+guide(shapeUV-vec2(0.,radius.y)))*.16;
  source=max(centre,source);
  // The ignition line travels upward with the same eddies as the ordinary fire.
  float front=ramp(ignition+.15,ignition-.15,p.y+(flow.y-.5)*.16);
  float release=ramp(cue.w*1.80-.22,cue.w*1.80+.02,p.y+(flow.y-.5)*.11);
  source*=vision*front*release;
  // Freed edges continue rising after the pose moves on, especially on departure.
  float plume=max(source,old.g*exp(-delta*mix(mix(3.5,2.1,cue.w),7.,lettering)));
  // Feed real burning plumes from the bed into the scene. The earlier supply was
  // too weak to cross the combustion threshold and left figures disconnected.
  float supply=pow(texture2D(fuel,shapeUV).g,.42)*vision*front*release;
  supply*=ramp(1.10,.35,p.y)*(.90+.10*flow.y);
  // Feed letters below their baseline without filling the counters of O, A, B.
  supply*=mix(1.,ramp(.35,.20,p.y),lettering);
  vec3 envelope=vec3(source,plume,supply)*ramp(1.45,1.32,p.y);
  gl_FragColor=vec4(clamp(envelope,0.,1.),1.);
}
`;
window.FIRE_FRAGMENT = `
precision highp float;
uniform vec2 resolution;
uniform float time, heat, vision, clarity, palette, base, height, spread, lettering;
uniform vec3 pointer;
uniform vec4 cue;
uniform sampler2D thermal;
uniform vec3 camera;
uniform vec4 event;
uniform vec4 fuelHeat, weather, hearthEvent;

${window.FIRE_COMMON}
float segment(vec2 p,vec2 a,vec2 b){vec2 pa=p-a,ba=b-a;return length(pa-ba*clamp(dot(pa,ba)/dot(ba,ba),0.,1.));}
// Emission grades from translucent red through amber to a pale hot core.
vec3 blackbody(float value){
  float k=max(value,0.);
  vec3 c=mix(vec3(1.10,.025,.001),vec3(3.1,.62,.024),ramp(.07,.46,k));
  c=mix(c,vec3(4.3,2.7,.76),ramp(.40,.87,k));
  c=mix(c,vec3(4.8,4.1,2.65),ramp(.88,1.28,k));
  c*=ramp(0.,.16,k)*(.14+k*.75);
  if(palette>.5&&palette<1.5)c*=mix(vec3(1.15,.43,1.8),vec3(1.,.80,1.2),ramp(.3,1.1,k));
  else if(palette>1.5&&palette<2.5)c=c.bgr*vec3(.7,1.0,1.3);
  else if(palette>2.5&&palette<3.5)c=c.bgr*vec3(1.5,.55,1.0)+vec3(c.r*.21,0.,0.);
  else if(palette>3.5)c=mix(c.bgr*vec3(.45,1.3,.75),c.rbg*vec3(1.,.6,1.1),ramp(.1,.9,k));
  return c;
}
// A vision reshapes these existing flame sheets. It has no separate material,
// little flame sprites, emissive silhouette, outline, or colour multiplier.
float flameSheet(vec2 p,float layer,float t){
  if(p.y<-.025||p.y>1.85||abs(p.x)>1.42)return 0.;
  float y=max(p.y,0.);
  vec4 flow=fireFlow(p,layer,t);
  float wx=flow.x,large=flow.y,eddy=flow.z;
  float shape=0.;
  for(int i=0;i<7;i++){
    float id=float(i),seed=hash(vec2(id+layer*7.,19.+weather.z));
    // Uneven, fixed sources in the wood. Gas pulses travel up a sheet instead
    // of stretching its entire height in synchrony like a waving ribbon.
    float centre=(id-3.)*.252+(seed-.5)*.17;
    float emitted=t-y*(.78+seed*.35);
    float gas=noise(vec2(emitted*(1.25+seed*.85),id*8.3+layer*3.7+weather.z));
    float catchment=noise(vec2(t*(.21+seed*.13),id*12.4+layer+weather.z));
    float surge=.66+gas*.45+catchment*.19;
    float supply=localFuel(centre)*weather.x;
    float h=(.57+seed*.53)*heat*surge*(1.-layer*.13)*(1.+cue.y*.075)*(.65+supply*.35);
    h+=hearthFlare(vec2(centre,0.))*.13;
    float rise=clamp(y/h,0.,1.25);
    float curl=noise(vec2(emitted*.85+id*7.,y*2.5+seed*13.));
    float axis=centre+(curl-.5)*y*.20+(gas-.5)*y*y*.10;
    float width=(.12+seed*.065)*(.80+catchment*.34)*pow(max(0.,1.-rise),.66)+.006;
    // Brief necks tear off into tips; the split branches are unequal.
    float fork=ramp(.29,.80,rise)*ramp(.40,.78,curl);
    float separation=fork*(.025+y*.10);
    float neck=1.-ramp(.47,.70,rise)*ramp(.92,.70,rise)*ramp(.55,.78,gas)*.48;
    width*=neck*(1.-fork*.28);
    float tongue=max(exp(-pow((wx-axis-separation)/width,2.)*1.25),exp(-pow((wx-axis+separation*.66)/(width*.64),2.)*1.25)*(.64+fork*.22));
    tongue*=ramp(1.06,.73,rise)*(.80+supply*.12+gas*.08);
    shape=max(shape,tongue);
  }
  if(vision>.001){
    // Advection stretches the pose upward; the common flow rolls its borders.
    // Layer offsets are small enough to retain faces and gaps between limbs.
    float loose=(1.-cue.z*.20)*(1.+cue.w*.65)*mix(1.,.48,lettering);
    vec2 q=vec2(p.x+flow.w*(.94-.28*clarity)*loose,p.y-(eddy-.5)*.045*loose-layer*.012);
    vec2 fieldUV=vec2(q.x/2.4+.5,q.y/1.45);
    float inside=step(0.,fieldUV.x)*step(fieldUV.x,1.)*step(0.,fieldUV.y)*step(fieldUV.y,1.);
    vec3 envelope=texture2D(thermal,fieldUV).rgb*inside;
    float shaped=max(envelope.r,envelope.g*.92)*mix(.64,1.,(clarity-.2)/.8);
    shaped=max(shaped,envelope.b*.96);
    // Keep the foreground fire burning across the scene and its openings.
    // Only the deeper sheets make much room for a figure to gather.
    float foreground=ramp(.5,1.8,layer);
    float gathering=vision*ramp(.19,.57,y)*exp(-p.x*p.x*1.3);
    float shelter=(.54+.10*clarity)*mix(1.,.18,foreground);
    shelter=mix(shelter,.86*mix(1.,.58,foreground),lettering);
    shape=max(shape*(1.-gathering*shelter),shaped*mix(1.,.96,foreground));
  }
  // One continuous combustion front for all the fire. Elongated, rising folds
  // open actual dark gaps, peel into tips and carry the same warm-to-pale heat.
  float lift=log(1.+y*1.65)/1.65;
  float shred=fbm(vec2(wx*12.+large*1.8,lift*6.-t*1.85+layer*.33));
  float small=noise(vec2(wx*43.+eddy*2.,lift*19.-t*3.9+layer*.51));
  float sheet=shape-(.09+shred*1.43+eddy*.18+(small-.5)*mix(.07,.17,ramp(.10,.85,y)));
  float rim=ramp(-.04,.09,sheet);
  float core=ramp(.055,.34,sheet);
  float density=(rim*.25+core*.89)*ramp(.015,.13,shape);
  density*=1.-ramp(.60,.82,eddy)*ramp(.16,.62,y)*.67;
  density*=1.-ramp(.68,.93,y)*.15;
  density*=ramp(-.02,.075,p.y)*ramp(1.35,1.12,abs(p.x));
  return density;
}
void main(){
  vec2 uv=gl_FragCoord.xy/resolution;
  float aspect=resolution.x/resolution.y;
  vec2 p=vec2((uv.x-.5)*aspect/spread,(uv.y-base)/height);
  p=(p-vec2(0.,.32))/max(camera.x,1.)+vec2(camera.y,.32+camera.z);
  float t=time;
  vec3 col=vec3(.012,.009,.008);
  // A deep stone recess catches the same changing light as the fuel beneath it.
  float shimmer=ramp(.1,.6,p.y)*exp(-p.x*p.x*1.3)*.006;
  vec2 wallP=p+vec2((noise(vec2(p.x*18.,p.y*7.-t*2.))-.5)*shimmer,0.);
  float back=exp(-wallP.x*wallP.x*1.05-pow(wallP.y-.25,2.)*1.5);
  float lightBeat=(.80+.13*noise(vec2(t*4.3,weather.z))+.07*noise(vec2(t*11.5,weather.z+19.)))*weather.x;
  float warmth=(fuelHeat.x+fuelHeat.y+fuelHeat.z+fuelHeat.w)*.25*lightBeat;
  float rough=noise(wallP*vec2(39.,51.))*.65+noise(wallP*vec2(113.,97.))*.35;
  float side=ramp(1.30,1.42,abs(wallP.x))*ramp(1.66,1.55,abs(wallP.x))*ramp(-.25,-.15,p.y)*ramp(1.70,1.53,p.y);
  float stoneJoint=ramp(.015,.055,abs(fract(wallP.y*3.6+floor(abs(wallP.x)*5.)*.31)-.5));
  col+=vec3(.091,.034,.014)*back*warmth*(.73+rough*.27);
  col+=vec3(.044,.031,.023)*side*(.35+rough*.65)*stoneJoint*(.5+back*warmth);
  // Low, moving shadows cross the stone as the rising light changes direction.
  float shadow=.80+.20*noise(vec2(wallP.x*4.+weather.y,wallP.y*2.-t*.34));
  col*=mix(1.,shadow,back);
  float actionLight=exp(-dot((p-event.xy)*vec2(1.9,2.6),(p-event.xy)*vec2(1.9,2.6)));
  col+=vec3(.15,.06,.012)*actionLight*(cue.y*.65+cue.z*.16);
  float smoke=fbm(vec2(wallP.x*2.+sin(p.y*3.+t*.15)*.2,p.y*2.-t*.14));
  col+=vec3(.034,.025,.019)*smoke*back*ramp(.18,1.2,p.y)*warmth;
  float horizon=ramp(-.02,-.06,p.y);
  float hearthLight=exp(-p.x*p.x*.9)*exp(-abs(p.y+.14)*3.5)*warmth;
  col+=vec3(.09,.034,.012)*horizon*hearthLight;
  float stone=noise(vec2(p.x*44.,p.y*80.))*.55+noise(vec2(p.x*105.,p.y*230.))*.25;
  float slab=ramp(-.31,-.295,p.y)*ramp(-.225,-.24,p.y)*ramp(1.48,1.32,abs(p.x));
  col=mix(col,vec3(.047,.032,.025)*(stone+.4)+vec3(.075,.030,.010)*hearthLight,slab*.85);
  col+=vec3(.075,.036,.017)*exp(-abs(p.y+.24)*260.)*ramp(1.44,1.28,abs(p.x))*warmth;
  // Irregular charcoal facets, deep hot seams and tiny pale flakes of ash.
  vec2 cp=vec2(p.x*16.,p.y*31.),ci=floor(cp),cf=fract(cp),coalCell=ci;
  float d=3.,second=3.;vec2 nearest=vec2(0.);
  for(int a=-1;a<=1;a++){for(int b=-1;b<=1;b++){
    vec2 g=vec2(float(a),float(b));vec2 r=g+vec2(hash(ci+g),hash(ci+g+8.5))-.5-cf;
    float dd=dot(r,r);if(dd<d){second=d;d=dd;nearest=r;coalCell=ci+g;}else second=min(second,dd);
  }}
  float coalArea=exp(-p.x*p.x*1.25)*ramp(-.22,-.16,p.y)*ramp(.105,.045,p.y);
  float seam=1.-ramp(.005,.070,second-d);
  float emberHeat=(.29+.44*hash(coalCell+18.))*(.73+.27*noise(vec2(coalCell.x*.4+t*.16,coalCell.y)))*localFuel(p.x);
  float hollow=pow(max(0.,1.-length(nearest)*1.65),2.);
  vec3 charcoal=vec3(.029,.022,.019)*(.45+hash(coalCell)*.65)*(1.-hollow*.7);
  float coalFace=ramp(.52,.78,noise(coalCell*.71+vec2(t*.035,0.)))*hollow;
  charcoal+=blackbody(emberHeat+hearthFlare(p)*.15)*(.045+seam*.86+coalFace*.22);
  float ashGrain=ramp(.70,.92,noise(cp*5.))*ramp(.45,.76,hash(coalCell+30.))*(1.-seam);
  charcoal+=vec3(.17,.145,.12)*ashGrain*warmth;
  col=mix(col,charcoal,coalArea);
  // Split wood has an uneven surface, dark cavities and mineral ash on its ridges.
  for(int i=0;i<4;i++){
    float fi=float(i);vec2 a=vec2(-.93,-.036);vec2 b=vec2(.31,-.082);
    if(i==1){a=vec2(-.42,.021);b=vec2(.86,-.029);}if(i==2){a=vec2(-.74,.090);b=vec2(.56,.042);}if(i==3){a=vec2(-.26,-.069);b=vec2(.94,.018);}
    float rad=.076+sin(fi*2.)*.013;float ld=segment(p,a,b);
    vec2 dir=normalize(b-a);float along=dot(p-a,dir),across=dot(p-a,vec2(-dir.y,dir.x));
    float grain=noise(vec2(along*7.,across*180.)+fi*14.);
    float bark=noise(vec2(along*33.,across*100.)+fi*19.);
    float ragged=ld+(bark-.5)*.011+(grain-.5)*.006;
    float logMask=1.-ramp(rad-.005,rad+.004,ragged);
    float fissure=1.-ramp(.014,.073,abs(noise(vec2(along*8.+fi*13.,across*83.+grain*.8))-.49));
    float crossCrack=1.-ramp(.009,.045,abs(noise(vec2(along*42.+fi*17.,across*12.+bark))-.52));
    float cracks=max(fissure*.57,crossCrack*ramp(.43,.72,grain))*ramp(.40,.75,bark);
    float roundness=sqrt(max(0.,1.-pow(clamp(across/rad,-1.,1.),2.)));
    float light=clamp(roundness*.40+across/rad*.50,.03,1.)*lightBeat;
    float fuel=localFuel(p.x);
    float burn=(.53+.33*noise(vec2(along*9.+fi,t*.095)))*fuel;
    vec3 wood=vec3(.062,.036,.025)*(.28+grain*.6+bark*.45)*light;
    float whiteAsh=ramp(.52,.82,bark)*ramp(.36,.73,grain)*roundness;
    wood+=vec3(.14,.13,.115)*whiteAsh*(.45+light*.55);
    wood+=blackbody(.39+burn*.33)*cracks*.56;
    wood+=vec3(.040,.012,.003)*ramp(rad*.67,rad*.93,ld)*grain*light;
    // A local fracture brightens before a flame takes hold at the same position.
    float age=max(hearthEvent.z,0.);
    float fresh=step(0.,hearthEvent.z)*ramp(0.,.18,age)*ramp(13.,2.,age)*weather.w;
    vec2 scar=(p-hearthEvent.xy)*vec2(12.,31.);
    wood+=blackbody(.83)*exp(-dot(scar,scar))*max(cracks,whiteAsh*.13)*fresh*.65;
    float cap=ramp(.024,-.025,along);
    float rings=.5+.5*sin(length(vec2(along*.55,across))*260.+grain*2.);
    wood=mix(wood,vec3(.065,.035,.023)*(.30+rings*.35)+blackbody(.47)*cracks*.17,cap*.85);
    float cavity=exp(-pow((along-.34-fi*.12)*12.,2.))*ramp(-.025,-.064,across)*ramp(.38,.70,grain);
    float contact=(1.-ramp(rad,rad+.055,segment(p+vec2(0.,.024),a,b)))*.27;
    col*=1.-contact;
    col=mix(col,wood,logMask*(1.-cavity*.78));
  }
  // The hearth and every event pass through exactly these same three sheets.
  float rear=flameSheet(p+vec2(.024,.006),0.,t);
  float middle=flameSheet(p,1.,t);
  float front=flameSheet(p+vec2(-.022,-.012),2.,t);
  float low=ramp(.52,.02,p.y);
  float breathing=.84+.16*noise(vec2(t*.8,3.1));
  float combustion=rear*.52+middle*.32+front*.25;
  // Thin foreground folds transmit the light behind them instead of flattening it.
  vec3 flameLight=blackbody(combustion)*(.72+low*.17+cue.z*.045);
  flameLight+=blackbody(front*.68)*.18+blackbody(middle*.60)*.10;
  col=col*exp(-front*.14-middle*.08)+flameLight;
  // Violet-blue combustion only at the very foot of the ordinary golden fire.
  float blue=exp(-pow((p.y-.04)*22.,2.))*ramp(.25,.55,rear)*(.3+.7*noise(vec2(p.x*21.,t*2.)));
  float crevice=ramp(.50,.77,noise(vec2(p.x*29.+weather.z,t*.35)))*exp(-pow((p.y-.014)*39.,2.));
  if(palette<.5)col+=vec3(.025,.045,.20)*(blue+crevice*localFuel(p.x)*.27);
  float glow=exp(-p.x*p.x*1.8)*exp(-pow(p.y-.12,2.)*8.);
  col+=vec3(.20,.047,.006)*glow*breathing;
  // A finite shower of embers marks a sword strike, an unfurling wing or a crest.
  float since=max(event.z,0.);
  float eventLife=step(0.,event.z)*ramp(4.4,2.3,since)*event.w;
  if(eventLife>.001){
  for(int i=0;i<24;i++){
    float fi=float(i),a=hash(vec2(fi,91.)),b=hash(vec2(fi,16.));
    float age=max(0.,since-a*.38);
    vec2 pos=event.xy+vec2((a-.5)*age*.44+sin(age*2.3+fi)*.014,age*(.12+b*.21)-age*age*.011);
    vec2 d=p-pos;
    float ember=exp(-dot(d*vec2(360.,210.),d*vec2(360.,210.)));
    float tail=exp(-abs(d.x)*380.-abs(d.y+.007)*160.)*.16;
    float light=ramp(0.,.09,age)*exp(-age*.72)*eventLife;
    col+=blackbody(.77+b*.24)*(ember+tail)*light*.68;
  }
  }
  // A fracture, fresh catch or settling charcoal sends sparks out of its own seam.
  float hearthAge=max(hearthEvent.z,0.);
  float hearthLife=step(0.,hearthEvent.z)*ramp(8.,3.8,hearthAge)*weather.w;
  if(hearthLife>.001){
    for(int i=0;i<10;i++){
      float fi=float(i),a=hash(vec2(fi,hearthEvent.x*47.)),b=hash(vec2(fi,hearthEvent.y*39.+weather.z));
      float count=hearthEvent.w<1.5?10.:hearthEvent.w<2.5?4.:7.;
      float age=max(0.,hearthAge-a*.45),released=step(a*.45,hearthAge);
      vec2 pos=hearthEvent.xy+vec2((a-.5)*age*.17+weather.y*age*.10,age*(.13+b*.17)-age*age*.008);
      vec2 delta=p-pos;
      float spark=exp(-dot(delta*vec2(420.,240.),delta*vec2(420.,240.)));
      float trail=exp(-abs(delta.x)*390.-abs(delta.y+.007)*180.)*.15;
      col+=blackbody(.78+b*.2)*(spark+trail)*exp(-age*.58)*hearthLife*released*step(fi+.5,count)*.75;
    }
    // A charcoal flake drops once, then cools into the bed instead of resetting.
    if(hearthEvent.w>2.5){
      float drop=ramp(.05,.55,hearthAge),cool=ramp(7.,2.5,hearthAge);
      vec2 flakePos=hearthEvent.xy+vec2(.026*drop,-.115*drop);
      vec2 q=(p-flakePos)*vec2(105.,170.);
      float flake=1.-ramp(.55,1.,length(q));
      col=mix(col,vec3(.028,.018,.014)+blackbody(.70)*cool*.23,flake*cool);
      col+=blackbody(.58)*exp(-dot((p-flakePos)*vec2(28.,70.),(p-flakePos)*vec2(28.,70.)))*ramp(0.,.5,drop)*cool*.10;
    }
  }
  // Stirred embers rise out of the disturbed patch rather than orbiting it.
  for(int i=0;i<12;i++){
    float fi=float(i),seed=hash(vec2(fi,weather.z));
    float age=fract(t*.63+seed*3.);
    vec2 offset=vec2((seed-.5)*.14+weather.y*age*.08,age*(.12+seed*.10));
    vec2 dp=(p-pointer.xy-offset)*vec2(320.,190.);
    float life=ramp(0.,.08,age)*ramp(1.,.55,age);
    col+=blackbody(.82-age*.23)*exp(-dot(dp,dp))*pointer.z*ramp(-.1,.1,p.y)*life*.65;
  }
  // Sparse drifting embers acquire a new path and brightness on every release.
  for(int i=0;i<22;i++){
    float fi=float(i),s=hash(vec2(fi,43.+weather.z));
    float period=9.+s*15.;
    float clock=t/period+s*19.,cycle=floor(clock),age=fract(clock)*period;
    float seed=hash(vec2(fi+cycle*31.,weather.z));
    float lifetime=1.15+seed*2.7;
    if(age>lifetime||seed<.27)continue;
    float sy=.015+age*(.11+seed*.12)+age*age*.022;
    float sx=(hash(vec2(fi+cycle*17.,29.))-.5)*1.58;
    sx+=(noise(vec2(age*1.2,seed*31.))-.5)*age*.04+weather.y*age*.09;
    vec2 dp=p-vec2(sx,sy);
    float size=330.+s*240.;
    vec2 velocity=normalize(vec2(weather.y*.09,.11+seed*.12+age*.044));
    float sideways=dot(dp,vec2(velocity.y,-velocity.x)),along=dot(dp,velocity);
    float spark=exp(-dot(dp*vec2(size,size*.68),dp*vec2(size,size*.68)));
    float trail=exp(-abs(sideways)*size-abs(along+.008)*190.);
    float life=ramp(0.,.07,age)*ramp(lifetime,lifetime*.60,age)*(.20+.45*seed);
    float tumble=.72+.28*noise(vec2(age*7.,fi+cycle*7.));
    col+=blackbody(.92-age/lifetime*.35)*(spark+trail*.12)*life*tumble;
  }
  float vignette=pow(max(0.,uv.x*(1.-uv.x)*uv.y*(1.-uv.y)*16.),.2);
  col*=.55+.45*vignette;
  col=vec3(1.)-exp(-col*1.10);
  col=pow(col,vec3(.88));
  col+=(hash(gl_FragCoord.xy+fract(t)*500.)-.5)*.008;
  gl_FragColor=vec4(col,1.);
}
`;
