(() => {
  const TAU = Math.PI * 2;
  const visions = {
    dance: ['Ember waltz', 'Two strangers, one last dance.'],
    battle: ['Clash of crowns', 'Even fire remembers its old battles.'],
    phoenix: ['The phoenix', 'Every ending carries a beginning.'],
    dragon: ['A dragon wakes', 'Something ancient stirs in the coals.'],
    forest: ['Forest spirits', 'A woodland that only grows at night.'],
    ship: ['A burning voyage', 'A little ship, an impossible sea.'],
    wanderer: ['The wanderer', 'A lantern, a companion, a road home.'],
    castle: ['A kingdom of ash', 'A thousand years in a handful of embers.']
  };
  const smooth=(a,b,x)=>{const v=Math.min(1,Math.max(0,(x-a)/(b-a)));return v*v*(3-2*v);};
  const profiles={
    dance:{duration:38,peaks:[.57],origin:[0,.62],roots:[-.25,.25],wind:.30,lines:['They find each other in the heat.','For a moment, the whole fire dances.','Their last turn becomes a rising ribbon.']},
    battle:{duration:35,peaks:[.33,.49,.65],origin:[0,.91],roots:[-.38,.38],wind:.62,lines:['Two old rivals step out of the coals.','Steel meets steel in a shower of gold.','The fire keeps neither crown.']},
    phoenix:{duration:37,peaks:[.55],origin:[0,.71],roots:[0],wind:.40,lines:['A heartbeat gathers beneath the ash.','Wings open where there was only fire.','Every feather becomes a new beginning.']},
    dragon:{duration:38,peaks:[.59],origin:[.45,.89],roots:[-.22,.18],wind:.75,lines:['Something ancient uncurls in the heat.','Its breath and the fire become one.','The ancient shape slips back into sleep.']},
    forest:{duration:39,peaks:[.58],origin:[-.05,.71],roots:[-.73,-.37,.02,.39,.69],wind:.22,lines:['A woodland rises, branch by branch.','A stag pauses beneath a sky of embers.','The trees let go of their golden leaves.']},
    ship:{duration:37,peaks:[.57],origin:[.46,.36],roots:[-.28,.10,.37],wind:.65,lines:['A small sail catches the fire’s breath.','The ship climbs a wave of living gold.','Its wake returns to the glowing coals.']},
    wanderer:{duration:40,peaks:[.61],origin:[.24,.64],roots:[-.06,.37],wind:.20,lines:['A traveller and a fox find their way.','One small lantern holds back the night.','They walk on, beyond the last ember.']},
    castle:{duration:38,peaks:[.57],origin:[0,.77],roots:[-.55,-.25,.25,.55],wind:.40,lines:['A kingdom rises out of remembered heat.','A thousand windows catch the dawn.','A thousand years lift away as ash.']}
  };
  function integral(x,a,b){const z=Math.min(1,Math.max(0,(x-a)/(b-a)));return (b-a)*(z*z*z-.5*z*z*z*z)+Math.max(0,x-b);}
  function direct(id,age,duration=profiles[id]?.duration||38){
    const p=profiles[id]||profiles.dance,u=Math.min(1,Math.max(0,age/duration));
    const entry=smooth(.015,.18,u),hero=smooth(.34,.48,u)*(1-smooth(.68,.80,u));
    const departure=id==='letters'?Math.max(0,duration-p.fadeOut):duration*.80;
    const out=smooth(departure,duration,age);
    // Continuous time with a gentle slowdown around the scene's central moment.
    const motion=duration*(1.04*u-.38*(integral(u,.40,.50)-integral(u,.65,.75)));
    let burstAge=-1,pulse=0;
    for(const peak of p.peaks){const d=age-peak*duration;if(d>=0)burstAge=d;pulse=Math.max(pulse,Math.exp(-Math.pow(d/.85,2.)));}
    const size=sizes[id]||sizes.dance;
    const travel=id==='wanderer'?(-.14+.27*smooth(.12,.72,u)):0;
    const origin=[(p.origin[0]+travel)*size[0],.12+(p.origin[1]-.12)*size[1]];
    return {progress:u,entry,hero,out,time:motion,pulse,burstAge,origin,
      wind:p.wind*(Math.sin(age*.27)*.32+pulse*.60)*(1-out),
      zoom:1+entry*(1-out)*(.018+hero*.025),
      drift:Math.sin(u*Math.PI*2)*.014*entry*(1-out),
      line:p.lines[id==='letters'?(age<p.fadeIn?0:age<departure?1:2):(u<.36?0:u<.80?1:2)],
      phase:id==='letters'?(age<p.fadeIn?'WORDS GATHER FROM THE EMBERS':age<departure?'WRITTEN IN LIVING FLAME':'RETURNING TO THE FIRE'):
        u<.18?'GATHERING FROM THE EMBERS':u<.42?'THE FIRE TAKES SHAPE':u<.80?'A MOMENT IN THE FLAMES':'RETURNING TO THE FIRE'};
  }
  const canvas = document.createElement('canvas');
  canvas.width = 1024; canvas.height = 768;
  const c = canvas.getContext('2d');
  // A small, independent fuel map links the moving figures to the ember bed.
  const fuelCanvas = document.createElement('canvas');
  fuelCanvas.width = 128; fuelCanvas.height = 96;
  const fuelContext = fuelCanvas.getContext('2d', {willReadFrequently:true});
  function prepareFuel(){
    fuelContext.clearRect(0,0,128,96);
    fuelContext.drawImage(canvas,0,0,128,96);
    const pixels=fuelContext.getImageData(0,0,128,96);
    const d=pixels.data;
    for(let x=0;x<128;x++){
      let carried=0;
      for(let y=0;y<96;y++){
        const i=(y*128+x)*4;
        carried=Math.max(carried*.979,d[i]);
        d[i+1]=Math.round(carried);
        d[i+2]=0;d[i+3]=255;
      }
    }
    fuelContext.putImageData(pixels,0,0);
  }
  function path(points, width = 0, close = false) {
    c.beginPath(); points.forEach((p, i) => i ? c.lineTo(...p) : c.moveTo(...p));
    if (close) c.closePath();
    if (width) { c.lineWidth = width; c.stroke(); } else c.fill();
  }
  function ellipse(x,y,rx,ry,angle=0){c.beginPath();c.ellipse(x,y,rx,ry,angle,0,TAU);c.fill();}
  function line(a,b,w){path([a,b],w);}
  function curve(points,w){c.beginPath();c.moveTo(...points[0]);for(let i=1;i<points.length;i+=3)c.bezierCurveTo(...points[i],...points[i+1],...points[i+2]);c.lineWidth=w;c.stroke();}
  function cloth(points){c.beginPath();c.moveTo(...points[0]);for(let i=1;i<points.length;i+=3)c.bezierCurveTo(...points[i],...points[i+1],...points[i+2]);c.closePath();c.fill();}

  function person(x,y,size,pose={},style='robe'){
    c.save();c.translate(x,y);c.scale(size*(pose.flip||1),size);
    const lean=pose.lean||0;
    const hip=[0,.43], neck=[lean,.78], leftShoulder=[lean-.09,.74], rightShoulder=[lean+.09,.74];
    const leftElbow=pose.le||[-.15,.53], leftHand=pose.lh||[-.15,.36];
    const rightElbow=pose.re||[.15,.55], rightHand=pose.rh||[.17,.37];
    const leftKnee=pose.lk||[-.07,.23],leftFoot=pose.lf||[-.10,0];
    const rightKnee=pose.rk||[.08,.24],rightFoot=pose.rf||[.12,0];
    // Tapered torso, articulated limbs and a head turned towards the scene.
    path([[lean-.09,.75],[lean+.08,.75],[.062,.42],[-.06,.42]],0,true);
    path([leftShoulder,leftElbow,leftHand],.043);
    path([rightShoulder,rightElbow,rightHand],.043);
    path([hip,leftKnee,leftFoot],.052);path([hip,rightKnee,rightFoot],.052);
    line(leftFoot,[leftFoot[0]+.065,leftFoot[1]-.006],.034);line(rightFoot,[rightFoot[0]+.065,rightFoot[1]-.006],.034);
    line([lean,.75],[lean,.85],.04);
    ellipse(lean+.007,.887,.052,.07,-.13);
    path([[lean+.048,.91],[lean+.071,.881],[lean+.047,.865]],0,true);
    if(style==='dress'){
      const sway=pose.skirt||0;
      cloth([[lean-.067,.59],[-.09,.40],[-.11+sway,.21],[-.27+sway,.09],[-.07+sway,.04],[.11+sway,.045],[.25+sway,.12],[.1,.28],[.08,.45],[lean+.068,.59]]);
      curve([ [lean-.027,.94],[lean-.13,.97],[lean-.10,.80],[lean-.16,.76] ],.029);
    }else if(style==='knight'){
      path([[lean-.067,.943],[lean+.055,.955],[lean+.065,.852],[lean-.051,.825]],0,true);
      curve([[lean-.03,.956],[lean-.12,1.06],[lean-.20,1.02],[lean-.22,.96]],.033);
      cloth([[lean-.08,.73],[-.24,.72],[-.18,.45],[-.30,.26],[-.12,.31],[-.07,.34],[-.04,.44]]);
    }else if(style==='cloak'){
      cloth([[lean-.06,.80],[-.16,.66],[-.19,.36],[-.24,.13],[-.03,.09],[.1,.10],[.15,.15],[.12,.41],[.05,.68],[lean+.05,.80]]);
      ellipse(lean-.012,.894,.068,.078);
    }
    c.restore();
  }

  function dance(t,s){
    const w=t*.74, turn=Math.sin(w), sway=Math.sin(w*2)*.043;
    const approach=.43-.19*smooth(.08,.35,s.progress);
    const xa=-approach+turn*.075,xb=approach-turn*.075;
    const ya=.15+Math.cos(w)*.022,yb=.15-Math.cos(w)*.022;
    // One dancer raises an arm while the other turns beneath it.
    const lift=.58+.28*smooth(.17,.43,s.progress)+Math.sin(w*.8)*.09;
    person(xa,ya,.86,{lean:.06+sway,le:[-.20,.83],lh:[-.20,.99],re:[.22,.83],rh:[.47,lift],lk:[-.1,.23],lf:[-.15-Math.sin(w)*.11,.01],rk:[.1,.23],rf:[.19+Math.sin(w)*.13,.01]},'robe');
    c.save();c.translate(xb,yb);c.rotate(-.21*s.hero*(.6+.4*Math.sin(w*.4)));
    person(0,0,.83,{flip:-1,lean:.04+sway,le:[-.21,.69],lh:[-.36,.80+Math.sin(w)*.12],re:[.21,.80],rh:[.47,lift+.035],lk:[-.07,.20],lf:[-.10+.06*Math.sin(w),.015],rk:[.07,.20],rf:[.14,.01],skirt:Math.sin(w)*.19},'dress');
    c.restore();
    c.globalAlpha=.38;
    for(let i=0;i<12;i++){const a=i*TAU/12+t*.15;ellipse(Math.cos(a)*(.67+.04*Math.sin(t)),.37+Math.sin(a)*.22,.007,.016);}
    c.globalAlpha=1;
  }

  function battle(t,s){
    const beat=t*1.06,lunge=s.pulse*.105,step=Math.sin(beat*.8)*.035;
    const swordY=.77+Math.sin(beat)*.13+s.pulse*.13;
    const approach=.48-.10*smooth(.07,.27,s.progress);
    const leftX=-approach+lunge+step,rightX=approach-lunge-step;
    person(leftX,.12,.87,{lean:.12+lunge,le:[-.18,.65],lh:[-.19,.58],re:[.22,.67],rh:[.34,swordY],lk:[-.13,.22],lf:[-.25,0],rk:[.17,.27],rf:[.30,0]},'knight');
    person(rightX,.12,.87,{flip:-1,lean:.10-lunge,le:[-.18,.68],lh:[-.2,.63],re:[.22,.74],rh:[.34,1.15-swordY*.3],lk:[-.10,.23],lf:[-.24,0],rk:[.16,.22],rf:[.28,0]},'knight');
    const hand1=[leftX+.34*.87,.12+swordY*.87];
    const hand2=[rightX-.34*.87,.12+(1.15-swordY*.3)*.87];
    const tip1=[(hand1[0]+.31)*(1-s.pulse),(.99+Math.sin(beat+.3)*.16)*(1-s.pulse)+.91*s.pulse];
    const tip2=[(hand2[0]-.32)*(1-s.pulse),(1.-Math.sin(beat+.3)*.15)*(1-s.pulse)+.91*s.pulse];
    line(hand1,tip1,.012);line(hand2,tip2,.012);
    line([hand1[0]-.033,hand1[1]+.032],[hand1[0]+.043,hand1[1]-.009],.019);
    line([hand2[0]-.04,hand2[1]-.01],[hand2[0]+.04,hand2[1]+.026],.019);
    ellipse(leftX-.16,.62,.09,.14,-.2);ellipse(rightX+.15,.65,.09,.14,.2);
    const clash=s.pulse*.70;
    c.globalAlpha=clash;
    for(let i=0;i<9;i++){const a=i*TAU/9;line([0,.93],[Math.cos(a)*.13,.93+Math.sin(a)*.13],.008);}
    c.globalAlpha=1;
  }

  function phoenix(t,s){
    c.save();c.translate(0,.50+.12*smooth(.10,.52,s.progress)+Math.sin(t*.8)*.031);
    const flap=Math.sin(t*.85)*.115+s.hero*.035;
    const unfurl=.28+.72*smooth(.09,.48,s.progress);
    for(const side of [-1,1]){
      c.save();c.scale(side*unfurl,1);
      cloth([[0,.05],[.19,.27],[.37,.32+flap],[.83,.44+flap],[.59,.25],[.46,.07+flap],[.17,-.04]]);
      for(let i=0;i<8;i++){
        const x=.20+i*.079,y=.17+i*.031+flap;
        cloth([[x,y],[x+.09,y+.06],[x+.16,y+.1],[x+.18,y+.13],[x+.09,y-.11],[x-.01,y-.16],[x-.042,y-.16]]);
      }
      c.restore();
    }
    ellipse(0,0,.072,.18);ellipse(.015,.20,.053,.061);
    path([[.043,.23],[.11,.2],[.046,.192]],0,true);
    for(let i=0;i<5;i++){const k=i-2;curve([[k*.012,-.1],[k*.06,-.21],[k*.07+Math.sin(t*1.5+k)*.08,-.35],[k*.1+Math.sin(t*1.7+k)*.1,-.43]],.033-Math.abs(k)*.006);}
    for(let i=0;i<3;i++)curve([[0,.23],[-.05,.28],[-.07+i*.03,.30],[-.055+i*.04,.34]],.013);
    c.restore();
  }

  function dragon(t,s){
    const wing=Math.sin(t*.82)*.105;
    c.save();c.translate(0,.48+.06*smooth(.12,.44,s.progress)+Math.sin(t*.7)*.026);
    c.save();c.scale(.45+.55*smooth(.12,.47,s.progress),1);
    cloth([[-.08,.03],[-.37,.25],[-.54,.40+wing],[-.90,.38+wing],[-.7,.16],[-.54,-.04],[-.44,-.14],[-.31,.02],[-.19,.05],[-.07,-.06]]);
    cloth([[.05,.08],[.15,.33],[.33,.5+wing],[.67,.48+wing],[.58,.27],[.56,.07],[.62,-.09],[.36,.02],[.14,-.07],[.05,-.08]]);
    c.restore();
    curve([[.2,.04],[-.06,-.15],[-.3,-.04],[-.45,-.25],[-.55,-.4],[-.86,-.2],[-.88,-.10]],.085);
    ellipse(.08,.02,.16,.105,.4);
    curve([[.12,.03],[.23,.16],[.10,.35],[.24,.36]],.075);
    cloth([[.19,.40],[.24,.45],[.34,.43],[.37,.37],[.45,.35],[.43,.30],[.34,.30],[.31,.25],[.23,.27],[.20,.30]]);
    path([[.22,.41],[.18,.52],[.27,.43]],0,true);path([[.29,.42],[.30,.51],[.33,.42]],0,true);
    path([[.04,-.015],[.2,-.16],[.3,-.21],[.19,-.2],[.08,-.15]],.024);
    path([[-.16,-.075],[-.12,-.2],[-.025,-.23],[-.12,-.225]],.025);
    c.globalAlpha=(.40+.30*Math.sin(t*2))*smooth(.43,.55,s.progress)*(1-smooth(.70,.79,s.progress));
    for(let i=0;i<4;i++){const yy=.32+i*.018;curve([[.43,yy],[.58,yy+.04],[.72+Math.sin(t*4+i)*.06,yy-.03],[.92,yy+.05]],.022-i*.003);}
    c.globalAlpha=1;c.restore();
  }

  function tree(x,y,s,t,seed){
    c.save();c.translate(x,y);c.scale(s,s);c.rotate(Math.sin(t*.72+seed)*.018);
    curve([[0,0],[-.06,.22],[.08,.45],[.025,.90]],.036);
    for(let i=0;i<7;i++){
      const yy=.25+i*.083,side=i%2?1:-1,len=.20-i*.014;
      curve([[.014,yy],[side*.06,yy+.02],[side*len,yy+.08],[side*(len+.035),yy+.2]],.015-i*.001);
      for(let j=0;j<3;j++){
        const px=side*(len*.5+j*.029),py=yy+.07+j*.035;
        line([px,py],[px+side*.05+Math.sin(t*1.1+seed+i)*.019,py+.09],.006);
      }
    }
    c.restore();
  }
  function deer(x,y,s,t){
    c.save();c.translate(x,y);c.scale(s,s);
    ellipse(0,.23,.19,.085,-.06);
    curve([[.12,.25],[.17,.31],[.12,.40],[.2,.45]],.062);
    ellipse(.22,.46,.075,.036,.1);path([[.17,.48],[.125,.55],[.197,.5]],0,true);
    for(let i=0;i<4;i++){const xx=-.12+(i%2)*.24+(i>1?.04:0);path([[xx,.20],[xx-.01,.1],[xx+.02+Math.sin(t*1.4+i)*.022,0]],.018);}
    for(const side of [-1,1]){path([[.18,.49],[.17+side*.03,.59],[.17+side*.07,.67]],.01);line([.17+side*.04,.60],[.17+side*.09,.615],.007);}
    line([-.16,.25],[-.25,.29],.025);c.restore();
  }
  function forest(t,s){
    c.save();c.beginPath();c.rect(-1.15,0,2.3,.15+1.16*smooth(.03,.37,s.progress));c.clip();
    c.globalAlpha=.65;tree(-.73,.13,.88,t,3);tree(.69,.13,1.02,t,8);tree(-.37,.17,.64,t,5);tree(.39,.15,.65,t,6);c.globalAlpha=1;c.restore();
    c.globalAlpha=smooth(.20,.36,s.progress);deer(-.27+.24*smooth(.21,.65,s.progress)+Math.sin(t*.9)*.022,.15,.96,t);c.globalAlpha=1;
    for(let i=0;i<15;i++){const a=i*2.39+t*.1;ellipse(Math.sin(a)*.69,.3+(i/15)*.65+Math.sin(t+i)*.016,.005,.009);}
  }

  function ship(t,s){
    const passage=-.16+.29*smooth(.10,.86,s.progress),crest=Math.sin(s.progress*Math.PI)*s.hero;
    c.save();c.translate(passage,.38+crest*.055+Math.sin(t*.94)*.039);c.rotate(Math.sin(t*.68)*.058+crest*.065);
    cloth([[-.56,0],[-.41,-.18],[-.29,-.19],[.24,-.19],[.39,-.16],[.49,-.04],[.55,.03],[.2,-.035],[-.25,-.02],[-.56,0]]);
    line([-.12,-.04],[-.12,.64],.018);line([.22,-.02],[.22,.47],.014);
    cloth([[-.11,.59],[-.31,.55],[-.48,.4],[-.43,.17],[-.30,.13],[-.16,.15],[-.11,.14],[-.17,.3],[-.12,.47],[-.11,.59]]);
    cloth([[-.085,.59],[.11,.51],[.25,.33],[.22,.18],[.1,.13],[-.03,.17],[-.085,.16],[-.03,.30],[-.075,.48],[-.085,.59]]);
    cloth([[.23,.45],[.41,.38],[.48,.24],[.46,.13],[.38,.12],[.28,.11],[.23,.13],[.28,.25],[.25,.35],[.23,.45]]);
    cloth([[-.12,.64],[-.035,.70],[.015,.64],[.11,.67],[.06,.60],[-.04,.62],[-.12,.60]]);
    line([-.12,.56],[-.5,-.04],.006);line([-.12,.56],[.50,-.02],.006);
    c.restore();
    c.globalAlpha=.5;for(let i=0;i<4;i++){const yy=.18-i*.038;c.beginPath();for(let j=0;j<=70;j++){const x=-.85+j/70*1.7,y=yy+Math.sin(x*12-t*1.3+i)*(.016+s.hero*.014);j?c.lineTo(x,y):c.moveTo(x,y);}c.lineWidth=.008;c.stroke();}c.globalAlpha=1;
  }

  function wanderer(t,s){
    const walk=Math.sin(t*2.05)*(1-s.hero*.55);
    c.save();c.translate(-.14+.27*smooth(.12,.72,s.progress),0);
    person(-.07,.15,.83,{lean:.045,le:[-.17,.63],lh:[-.21,.48],re:[.2,.64],rh:[.29,.70],lk:[-.05-walk*.065,.23],lf:[-.13-walk*.085,.01],rk:[.07+walk*.04,.21],rf:[.13+walk*.085,.01]},'cloak');
    const lx=.175+Math.sin(t*1.5)*.026,ly=.59+Math.cos(t*1.5)*.012;line([.175,.74],[lx,ly],.009);path([[lx-.04,ly],[lx+.04,ly],[lx+.045,ly-.075],[lx-.045,ly-.075]],.011,true);ellipse(lx,ly-.039,.015,.025);
    // A small fox keeps pace.
    c.save();c.translate(.38+Math.sin(t*1.1)*.024,.155+Math.abs(Math.sin(t*2.2))*.016);ellipse(0,.12,.115,.05);ellipse(.1,.20,.05,.04);path([[.075,.22],[.07,.28],[.104,.229]],0,true);path([[.12,.20],[.178,.17],[.113,.16]],0,true);
    curve([[-.10,.13],[-.20,.18],[-.24,.12],[-.29,.15]],.035);
    for(let i=0;i<4;i++){const x=-.07+(i%2)*.14+(i>1?.016:0);line([x,.10],[x+Math.sin(t*2.8+i)*.045,0],.013);}c.restore();
    c.restore();
    c.globalAlpha=.34;tree(-.7,.16,.71,t,7);c.globalAlpha=1;
    c.beginPath();c.arc(.55,.99,.085,0,TAU);c.fill();c.globalCompositeOperation='destination-out';ellipse(.575,1.015,.073,.081);c.globalCompositeOperation='source-over';
  }

  function castle(t,s){
    function tower(x,y,w,h){
      path([[x-w/2,y],[x+w/2,y],[x+w/2,y+h],[x-w/2,y+h]],0,true);
      for(let i=0;i<3;i++)path([[x-w/2+i*w/3,y+h],[x-w/2+i*w/3+w/6,y+h],[x-w/2+i*w/3+w/6,y+h+.045],[x-w/2+i*w/3,y+h+.045]],0,true);
      c.globalCompositeOperation='destination-out';
      for(let i=1;i<=2;i++){ellipse(x,y+h*(i/3),w*.11,.026);}
      c.globalCompositeOperation='source-over';
      line([x,y+h+.035],[x,y+h+.19],.009);
      cloth([[x,y+h+.19],[x+.065,y+h+.20+Math.sin(t*2.4+x)*.035],[x+.09,y+h+.15],[x+.16,y+h+.18],[x+.1,y+h+.10],[x+.03,y+h+.14],[x,y+h+.135]]);
    }
    c.save();c.beginPath();c.rect(-1.15,0,2.3,.20+1.16*smooth(.04,.40,s.progress));c.clip();
    path([[-.7,.17],[-.56,.29],[-.24,.27],[0,.36],[.32,.26],[.60,.30],[.76,.17]],0,true);
    path([[-.57,.25],[.57,.25],[.57,.56],[-.57,.56]],0,true);
    tower(-.55,.25,.15,.45);tower(.55,.25,.15,.45);tower(-.25,.30,.15,.52);tower(.25,.30,.15,.52);
    path([[-.13,.34],[.13,.34],[.13,.9],[-.13,.9]],0,true);path([[-.18,.9],[0,1.12],[.18,.9]],0,true);
    c.globalCompositeOperation='destination-out';
    c.beginPath();c.moveTo(-.073,.26);c.lineTo(-.073,.43);c.bezierCurveTo(-.073,.54,.073,.54,.073,.43);c.lineTo(.073,.26);c.fill();
    for(let i=0;i<5;i++)ellipse(-.43+i*.215,.48,.016,.035);
    ellipse(0,.76,.028,.065);c.globalCompositeOperation='source-over';c.restore();
    // A flight of birds dissolves above the battlements.
    c.globalAlpha=smooth(.38,.50,s.progress);for(let i=0;i<4;i++){const x=((t*.065+i*.27)%1.3)-.65,y=1.06+Math.sin(t*.6+i)*.055;path([[x-.033,y+Math.sin(t*4.6+i)*.037],[x,y],[x+.033,y+Math.sin(t*4.6+i)*.037]],.008);}c.globalAlpha=1;
  }
  const draw={dance,battle,phoenix,dragon,forest,ship,wanderer,castle};
  const sizes={dance:[1.30,1.14],battle:[1.22,1.13],phoenix:[1.13,1.10],dragon:[1.14,1.10],forest:[1.10,1.10],ship:[1.25,1.18],wanderer:[1.20,1.10],castle:[1.13,1.10]};
  const emergences=window.createFireEmergences({c,TAU,smooth,path,ellipse,line,curve,cloth,person});
  Object.assign(visions,emergences.visions);Object.assign(profiles,emergences.profiles);
  Object.assign(draw,emergences.draw);Object.assign(sizes,emergences.sizes);
  function feedRibbons(id,t,s){
    const roots=(profiles[id]||profiles.dance).roots;
    c.save();c.globalAlpha=.16+.08*s.hero;c.lineCap='round';
    for(let i=0;i<roots.length;i++){
      const x=roots[i],bend=Math.sin(t*.7+i)*.05+s.wind*.045;
      curve([[x*.92,.035],[x-.07+bend,.12],[x+.07+bend,.25],[x,.38]],.014+i%2*.006);
      curve([[x*.97+.04,.035],[x+.10+bend,.13],[x-.05+bend,.30],[x+.025,.46]],.009);
    }
    c.restore();
  }
  function installCustom(value){
    const scene=PromptScene.validate(value);
    visions.custom=[scene.title,scene.caption];
    profiles.custom={duration:42,peaks:[],origin:[0,.42],roots:scene.figures.map(f=>f.motion.pivot[0]),wind:.26,
      lines:[scene.caption,scene.caption,'Your vision loosens into the rising fire.']};
    sizes.custom=[1,1];draw.custom=(t,shot)=>PromptScene.paint(c,scene,t,shot);
    return 'custom';
  }
  function installText(value){
    const words=FireText.create(value);
    visions.letters=['“'+words.text+'”','Your words, written in living flame.'];
    profiles.letters={duration:words.duration,fadeIn:FireText.TIMING.entry,fadeOut:FireText.TIMING.fade,ignitionSpeed:FireText.TIMING.ignition,peaks:[],origin:[0,.40],roots:[],wind:.12,
      lines:['Your words gather from the coals.','The fire holds your words for a moment.','The last letters loosen into embers.']};
    sizes.letters=[1,1];
    draw.letters=(t,shot)=>words.paint(c,shot.progress*words.duration);
    return 'letters';
  }
  window.FireScenes={canvas,fuelCanvas,visions,profiles,direct,installCustom,installText,render(id,age,duration){
    const shot=direct(id,age,duration);
    c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,1024,768);
    c.setTransform(1024/2.4,0,0,-768/1.45,512,768);
    const size=sizes[id]||sizes.dance;
    c.translate(0,.12);c.scale(size[0],size[1]);c.translate(0,-.12);
    c.fillStyle='#fff';c.strokeStyle='#fff';c.lineCap='round';c.lineJoin='round';c.globalAlpha=1;
    feedRibbons(id,shot.time,shot);
    (draw[id]||dance)(shot.time,shot);
    c.setTransform(1,0,0,1,0,0);
    // The upload is RGBA; all unpainted pixels are explicitly black.
    c.globalCompositeOperation='destination-over';c.fillStyle='#000';c.fillRect(0,0,1024,768);c.globalCompositeOperation='source-over';
    prepareFuel();
  }};
})();
