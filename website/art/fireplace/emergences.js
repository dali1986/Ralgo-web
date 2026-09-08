// Additional animated fuel guides. Every shape is rendered by the existing fire.
window.createFireEmergences = ({c,TAU,smooth,path,ellipse,line,curve,cloth,person}) => {
  function at(x,y,scale,angle,paint){c.save();c.translate(x,y);c.rotate(angle);c.scale(scale,scale);paint();c.restore();}
  function ring(x,y,rx,ry,w=.018){c.beginPath();c.ellipse(x,y,rx,ry,0,0,TAU);c.lineWidth=w;c.stroke();}
  function waves(y,t,amplitude=.025){
    for(let j=0;j<3;j++){const points=[];for(let i=0;i<=55;i++){const x=-.98+i/55*1.96;points.push([x,y-j*.043+Math.sin(x*10-t*1.3+j)*amplitude]);}path(points,.013);}
  }
  function star(x,y,size,angle=0){at(x,y,size,angle,()=>path([[0,1],[.20,.23],[.8,0],[.20,-.23],[0,-1],[-.20,-.23],[-.8,0],[-.20,.23]],0,true));}
  function bird(x,y,scale,t){at(x,y,scale,Math.sin(t*.65)*.08,()=>{
    const flap=Math.sin(t*2.5)*.24;
    ellipse(0,0,.042,.115);
    curve([[0,.065],[.02,.16],[.11,.16],[.09,.23]],.024);line([.09,.23],[.17,.215],.019);
    for(const side of [-1,1])at(0,0,1,0,()=>{c.scale(side,1);cloth([[.025,.015],[.18,.12+flap],[.35,.18+flap],[.49,.27+flap],[.37,.08+flap],[.23,-.03],[.03,-.05]]);});
    path([[-.03,-.07],[0,-.21],[.035,-.07]],0,true);
  });}
  function horse(x,y,scale,t,rear=0,flip=1){at(x,y,scale,0,()=>{
    c.scale(flip,1);
    ellipse(0,.32,.23,.115,-rear*.12);
    curve([[.12,.34],[.21,.42],[.10,.56+rear],[.24,.60+rear]],.095);
    ellipse(.28,.60+rear,.105,.055,-.28);path([[.22,.64+rear],[.18,.73+rear],[.27,.65+rear]],0,true);
    curve([[.16,.59+rear],[.04,.62+rear],[.13,.39],[.02,.36]],.032);
    curve([[-.20,.36],[-.38,.46],[-.38,.21],[-.48,.24+Math.sin(t*2)*.07]],.049);
    for(let i=0;i<4;i++){const a=t*3+i*2.4,x0=i<2?-.15:.15,k=Math.sin(a)*.105;
      path([[x0,.28],[x0+k,.14+Math.max(0,Math.cos(a))*.055],[x0-k,.055+Math.max(0,Math.sin(a))*.045]],.033);
      line([x0-k-.025,.05+Math.max(0,Math.sin(a))*.045],[x0-k+.055,.05+Math.max(0,Math.sin(a))*.045],.024);
    }
  });}
  function lantern(x,y,scale,t){at(x,y,scale,Math.sin(t)*.10,()=>{
    cloth([[-.11,.03],[-.16,.17],[-.13,.30],[0,.32],[.13,.30],[.16,.17],[.11,.03],[.07,-.01],[-.07,-.01],[-.11,.03]]);
    c.save();c.globalCompositeOperation='destination-out';ring(0,.17,.058,.105,.016);c.restore();
    line([-.09,.02],[.09,.02],.018);curve([[0,.02],[.035,-.025],[-.035,-.055],[0,-.085]],.017);
  });}

  function whale(t,s){
    const leap=smooth(.12,.78,s.progress);
    at(-.22+.44*leap,.53+Math.sin(leap*Math.PI)*.24,.92,Math.sin(leap*TAU)*.23,()=>{
      cloth([[-.60,0],[-.37,.22],[.30,.28],[.53,.15],[.72,.03],[.55,-.16],[.26,-.19],[-.10,-.21],[-.40,-.06],[-.60,0]]);
      cloth([[-.53,.015],[-.67,.10],[-.78,.25],[-.87,.22],[-.80,.04],[-.72,-.02],[-.56,-.03],[-.66,-.08],[-.77,-.17],[-.79,-.12],[-.72,-.02],[-.63,-.01],[-.53,.015]]);
      cloth([[.08,-.10],[.02,-.20],[-.09,-.36],[-.22,-.33],[-.13,-.20],[-.05,-.13],[.08,-.10]]);
      c.save();c.globalCompositeOperation='destination-out';ellipse(.48,.055,.017,.014);curve([[.52,-.08],[.27,-.17],[-.02,-.17],[-.28,-.09]],.014);c.restore();
      const spray=smooth(.28,.43,s.progress)*(1-smooth(.57,.70,s.progress));
      c.globalAlpha=spray;
      curve([[.28,.19],[.24,.35],[.10,.44],[.02,.37]],.025);
      curve([[.28,.19],[.32,.38],[.43,.44],[.50,.35]],.022);c.globalAlpha=1;
    });
    waves(.20,t,.026+s.pulse*.025);
    for(let i=0;i<7;i++)star(-.83+i*.27,1.14+Math.sin(i*2+t*.25)*.045,.018+(i%3)*.005,t*.2);
  }
  function moth(t,s){
    at(0,.65+Math.sin(t*.8)*.045,1,Math.sin(t*.45)*.13,()=>{
      const open=(.23+.77*smooth(.08,.37,s.progress))*(.77+.23*Math.sin(t*1.5));
      for(const side of [-1,1])at(0,0,1,0,()=>{
        c.scale(side*open,1);
        cloth([[.03,.06],[.21,.44],[.60,.52],[.75,.31],[.76,.13],[.37,.04],[.05,-.015]]);
        cloth([[.04,-.01],[.30,.04],[.59,-.08],[.55,-.23],[.46,-.39],[.19,-.37],[.025,-.08]]);
        curve([[.29,-.19],[.29,-.34],[.39,-.46],[.31,-.51]],.021);
        c.globalCompositeOperation='destination-out';ellipse(.40,.22,.075,.085);ellipse(.29,-.18,.045,.056);c.globalCompositeOperation='source-over';
      });
      ellipse(0,0,.038,.18);ellipse(0,.17,.046,.046);
      curve([[-.015,.18],[-.02,.29],[-.15,.29],[-.16,.24]],.018);curve([[.015,.18],[.02,.29],[.15,.29],[.16,.24]],.018);
    });
    c.save();ellipse(.66,1.12,.105,.105);c.globalCompositeOperation='destination-out';ellipse(.696,1.15,.091,.095);c.restore();
  }
  function forge(t,s){
    const lift=(.25+Math.sin(t*1.6)*.14)*(1-s.pulse)-s.pulse*1.65;
    const hand=[-.12-Math.sin(lift)*.20,.70+Math.cos(lift)*.20];
    person(-.43,.14,.88,{lean:.15+s.pulse*.07,re:[.29,.72],rh:[(hand[0]+.43)/.88,(hand[1]-.14)/.88],le:[.05,.58],lh:[.42,.49],lf:[-.15,0],rf:[.22,0]},'robe');
    at(-.12,.70,1,lift,()=>{line([0,-.08],[0,.46],.026);path([[-.12,.40],[.12,.40],[.12,.51],[-.12,.51]],0,true);});
    path([[-.02,.48],[.58,.48],[.72,.55],[.65,.60],[.13,.60],[.02,.55],[-.10,.56]],0,true);
    path([[.20,.48],[.40,.48],[.42,.23],[.55,.16],[.08,.16],[.22,.24]],0,true);
    star(.34,.66,.10+s.pulse*.035,t*.3);
    for(let i=0;i<7;i++){const phase=(t*.27+i*.14)%1;ellipse(.26+(i-3)*phase*.095,.66+Math.sin(phase*Math.PI)*.24,.014,.025);}
  }
  function fox(t,s){
    // Paws, belly and tail stay in the lower fire; only ears and tail tips rise.
    const awake=smooth(.15,.48,s.progress)*(1-smooth(.72,.92,s.progress));
    const stretch=Math.sin(awake*Math.PI)*.065,breath=Math.sin(t*.85)*.007;
    at(-.05+stretch,.075,1,0,()=>{
      const tail=Math.sin(t*.65)*.035+awake*.055;
      cloth([[-.24,.20],[-.46,.08],[-.75,.11],[-.80,.31],[-.87,.49],[-.69,.64+tail],[-.59,.66+tail],[-.63,.44],[-.43,.48],[-.29,.31],[-.23,.30],[-.20,.24],[-.24,.20]]);
      ellipse(-.065,.235+awake*.025,.29+stretch*.35,.132+breath,-.03);
      ellipse(-.245,.195,.11,.13,-.24);
      // Plant every foot in the coals, opening the space between the legs.
      curve([[-.25,.23],[-.33,.16],[-.34,.075],[-.26,.045]],.052);
      line([-.30,.040],[-.18,.040],.031);
      curve([[.08,.27],[.10,.15],[.10,.08],[.16,.045]],.044);
      line([.14,.040],[.245,.040],.029);
      curve([[.20,.28],[.25,.20],[.25+stretch,.09],[.31+stretch,.04]],.047);
      line([.29+stretch,.035],[.39+stretch,.035],.031);
      cloth([[.10,.25],[.12,.40],[.21,.46+awake*.05],[.32,.45+awake*.05],[.38,.37],[.28,.27],[.10,.25]]);
      at(.32,.37+awake*.060,1,-.14+awake*.20+Math.sin(t*.55)*.026,()=>{
        path([[-.13,-.045],[-.13,.10],[-.12,.245],[-.045,.155],[.030,.125],[.10,.225],[.115,.035],[.18,-.012],[.285,-.038],[.18,-.09],[.055,-.125],[-.055,-.115]],0,true);
        c.save();c.globalCompositeOperation='destination-out';
        ellipse(.065,.026,.021,.014,-.15);
        path([[-.096,.164],[-.082,.083],[-.049,.126]],0,true);
        curve([[.15,-.060],[.18,-.070],[.22,-.059],[.25,-.051]],.011);
        c.restore();
      });
      // A narrow break in the tail keeps its curl open to the ordinary flames.
      c.save();c.globalCompositeOperation='destination-out';
      curve([[-.33,.25],[-.51,.18],[-.66,.27],[-.64,.40]],.022);c.restore();
    });
  }
  function cranes(t,s){
    const part=smooth(.23,.62,s.progress);
    bird(Math.sin(t*.5)*.12,.62+part*.12,.95*(1-part*.36),t);
    for(let i=0;i<4;i++){
      const a=t*.45+i*TAU/4,x=Math.cos(a)*(.12+part*.64),y=.69+Math.sin(a)*(.05+part*.34);
      c.save();c.globalAlpha=part;bird(x,y,.26+part*.13,t+i);c.restore();
    }
    const lift=smooth(.04,.32,s.progress);
    c.save();c.globalAlpha=1-lift;path([[-.28,.33],[0,.19],[.29,.34],[0,.47]],0,true);c.restore();
  }
  function galaxy(t,s){
    const open=smooth(.16,.51,s.progress);
    cloth([[-.18,.10],[-.20,.32],[-.42,.37],[-.49,.54],[-.53,.63],[-.44,.66],[-.39,.57],[-.20,.43],[.03,.42],[.18,.50],[.34,.61],[.40,.72],[.47,.72],[.49,.62],[.35,.48],[.20,.37],[.16,.24],[.17,.10],[0,.10]]);
    for(let i=0;i<4;i++){const x=-.18+i*.083;curve([[x,.44],[x-.09*open,.58],[x-.12*open,.69+open*.05],[x-.19*open,.73+open*.12-i*.032]],.038);}
    const radius=.12+.45*open,cy=.83+Math.sin(t*.45)*.025;
    for(let arm=0;arm<3;arm++){
      const points=[];for(let i=0;i<=48;i++){const r=i/48*radius,a=i/48*5.6+t*.42+arm*TAU/3;points.push([Math.cos(a)*r,cy+Math.sin(a)*r*.47]);}path(points,.023);
    }
    star(0,cy,.053+s.pulse*.025,t*.55);
    for(let i=0;i<6;i++){const a=t*.30+i*1.9;star(Math.cos(a)*.68,cy+Math.sin(a)*.31,.016+i%2*.009,a);}
  }
  function octopus(t,s){
    const rise=.45+.22*smooth(.09,.46,s.progress);
    at(0,rise,1,Math.sin(t*.6)*.07,()=>{
      for(let i=0;i<8;i++){
        const x=(i-3.5)*.039,reach=(i-3.5)*.21,tip=.04+Math.sin(t*1.3+i*.8)*.13;
        curve([[x,.02],[reach*.60,-.19],[reach,-.34],[reach,tip],[reach,tip+.18],[reach*.73,tip+.19],[reach*.82,tip+.04]],.045-Math.abs(i-3.5)*.003);
      }
      cloth([[-.17,.04],[-.30,.40],[-.12,.53],[0,.51],[.12,.53],[.30,.40],[.17,.04],[.10,-.02],[-.10,-.02],[-.17,.04]]);
      c.save();c.globalCompositeOperation='destination-out';ellipse(-.075,.17,.020,.026);ellipse(.075,.17,.020,.026);c.restore();
    });
    for(let i=0;i<5;i++){const a=t*.8+i*1.7;ring(Math.cos(a)*.75,.96+Math.sin(a)*.13,.023,.032,.014);}
  }
  function lion(t,s){
    const roar=smooth(.29,.50,s.progress)*(1-smooth(.67,.80,s.progress));
    at(0,.71,1,Math.sin(t*.5)*.08,()=>{
      for(let i=0;i<20;i++){
        const a=i*TAU/20,wave=Math.sin(t*1.4+i)*.035;
        at(0,0,1,a,()=>cloth([[.18,-.052],[.28,-.12],[.48+wave,-.13],[.55+wave,0],[.41,.04],[.28,.13],[.18,.052]]));
      }
      ellipse(-.20,.21,.105,.105);ellipse(.20,.21,.105,.105);
      cloth([[-.25,.22],[-.32,-.03],[-.16,-.33],[0,-.34],[.16,-.33],[.32,-.03],[.25,.22],[.13,.34],[-.13,.34],[-.25,.22]]);
      c.save();c.globalCompositeOperation='destination-out';ellipse(-.12,.09,.057,.021);ellipse(.12,.09,.057,.021);ellipse(0,-.20,.077,.034+roar*.085);c.restore();
      path([[-.07,-.045],[.07,-.045],[0,-.12]],0,true);
      for(const side of [-1,1])for(let i=0;i<3;i++)line([side*.07,-.12-i*.036],[side*.32,-.12-i*.066],.012);
    });
  }
  function garden(t,s){
    for(let i=0;i<5;i++){
      const x=(i-2)*.33,grow=smooth(.04+i*.032,.39+i*.024,s.progress),height=.44+(i%3)*.14;
      curve([[x,.14],[x-.13,.31],[x+.10,.42],[x+Math.sin(t*.7+i)*.024,.14+height*grow]],.024);
      if(grow>.02)at(x+Math.sin(t*.7+i)*.024,.14+height*grow,(.11+.06*(i%2))*(.30+.70*grow),t*(i%2?-.55:.55),()=>{
        ring(0,0,.75,.75,.18);
        for(let j=0;j<10;j++)at(0,0,1,j*TAU/10,()=>path([[.59,-.13],[.99,-.13],[.99,.13],[.59,.13]],0,true));
        for(let j=0;j<3;j++){const a=j*TAU/3;line([0,0],[Math.cos(a)*.70,Math.sin(a)*.70],.12);}
      });
      for(const side of [-1,1])at(x,.27,1,0,()=>cloth([[0,0],[side*.07,.14],[side*.14,.12],[side*.17,.09],[side*.11,-.01],[side*.035,-.025],[0,0]]));
    }
    for(let i=0;i<5;i++){const u=smooth(.54+i*.025,.83+i*.019,s.progress);at((i-2)*.31+Math.sin(t+i)*u*.12,.76+u*.39,.045+u*.014,t+i,()=>ellipse(0,0,1,.42));}
  }
  function train(t,s){
    // Wheels turn while the train travels across the bridge; steam becomes birds.
    const travel=-.25+.48*smooth(.09,.88,s.progress);
    line([-.98,.35],[.98,.35],.035);line([-.98,.40],[.98,.40],.018);
    for(let i=0;i<4;i++){const x=-.72+i*.48;curve([[x-.17,.13],[x-.17,.34],[x+.17,.34],[x+.17,.13]],.026);}
    at(travel,.42,.82,0,()=>{
      path([[-.90,.04],[.63,.04],[.69,.13],[-.90,.13]],0,true);
      path([[-.10,.12],[.45,.12],[.50,.35],[-.10,.35]],0,true);
      path([[-.39,.12],[-.39,.47],[-.09,.47],[-.09,.12]],0,true);
      line([-.44,.48],[-.04,.48],.036);path([[.26,.33],[.26,.55],[.39,.55],[.37,.33]],0,true);
      path([[-.92,.15],[-.49,.15],[-.49,.38],[-.92,.38]],0,true);
      c.save();c.globalCompositeOperation='destination-out';path([[-.32,.27],[-.17,.27],[-.17,.40],[-.32,.40]],0,true);
      for(let i=0;i<3;i++)path([[-.87+i*.125,.25],[-.80+i*.125,.25],[-.80+i*.125,.34],[-.87+i*.125,.34]],0,true);c.restore();
      for(let i=0;i<5;i++){const x=-.76+i*.28;ring(x,.08,.079,.079,.025);line([x,.08],[x+Math.cos(t*3)*.072,.08+Math.sin(t*3)*.072],.016);}
      path([[.49,.14],[.68,.08],[.52,.04]],0,true);
    });
    for(let i=0;i<4;i++){const phase=(t*.16+i*.25)%1,x=travel+.26-phase*.55,y=.94+phase*.23;
      if(phase<.47)ring(x,y,.039+phase*.08,.040+phase*.06,.023);
      else bird(x,y,.12+phase*.07,t+i);
    }
  }
  function bridge(t,s){
    const meet=smooth(.14,.57,s.progress),left=-.61+.37*meet,right=.61-.37*meet;
    curve([[-.98,.26],[-.50,.40],[.50,.40],[.98,.26]],.04);
    curve([[-.96,.19],[-.46,.33],[.46,.33],[.96,.19]],.025);
    for(let i=0;i<10;i++){const x=-.87+i*.194,y=.29+.074*(1-x*x);line([x,y],[x,y+.12],.018);}
    curve([[-.98,.39],[-.51,.53],[.51,.53],[.98,.39]],.022);
    person(left,.39,.68,{lean:.025+meet*.045,re:[.23,.71],rh:[.35,.69],lf:[-.12+Math.sin(t*1.8)*(1-meet)*.07,0],rf:[.16,0]},'robe');
    person(right,.39,.68,{flip:-1,lean:.025+meet*.045,re:[.23,.71],rh:[.35,.69],skirt:Math.sin(t*.8)*.045},'dress');
    c.save();c.globalAlpha=smooth(.45,.57,s.progress);curve([[-.01,.88],[-.21,1.08],[-.12,1.23],[0,1.12],[.12,1.23],[.21,1.08],[.01,.88]],.022);c.restore();
    waves(.15,t,.014);
  }
  function heron(t,s){
    // A reedbed grows from several coal-level roots, with narrow tapering tips.
    const look=smooth(.25,.53,s.progress)*(1-smooth(.70,.88,s.progress));
    for(let i=0;i<6;i++){
      const x=[-.76,-.58,-.40,.43,.62,.78][i],height=[.48,.70,.42,.57,.78,.49][i];
      const sway=Math.sin(t*.72+i*.82)*(.022+height*.020)+s.wind*.024;
      const grow=.76+.24*smooth(.06,.30,s.progress),top=.07+height*grow;
      const stem=(y)=>x+sway*((y-.07)/(top-.07))**2;
      cloth([[x-.019,.06],[x-.018,.26],[stem(top*.70)-.012,top*.70],[x+sway,top],[stem(top*.69)+.011,top*.69],[x+.017,.25],[x+.019,.06]]);
      for(const side of [-1,1]){
        const y=.15+(i%2)*.045,reach=side*(.105+(i%3)*.024);
        cloth([[x,y],[x+reach*.55,y+.05],[x+reach,y+.16],[x+reach*.88,y+.22],[x+reach*.86,y+.10],[x+reach*.30,y+.025],[x,y]]);
      }
    }
    const lean=Math.sin(t*.47)*.015,headX=.13+look*.045,headY=.715+look*.045;
    // Long legs remain attached to the embers; the folded wing stays below mid-fire.
    path([[-.10,.43],[-.075,.24],[-.115,.065]],.027);
    path([[.015,.40],[.07,.24],[.035,.063]],.028);
    line([-.14,.06],[-.027,.06],.022);line([.005,.057],[.13,.057],.022);
    cloth([[-.20,.38],[-.29,.51],[-.17,.60],[.01,.57],[.16,.57],[.16,.43],[.045,.335],[-.005,.26],[-.17,.29],[-.20,.38]]);
    cloth([[-.18,.51],[-.30,.45],[-.29,.29],[-.27,.235],[-.15,.28],[-.005,.42],[.03,.53]]);
    curve([[.065,.46],[.24+lean,.51],[.19+lean,.59],[.08+lean,.61],[.015+lean,.64],[.055,headY-.04],[headX,headY]],.050);
    at(headX,headY,1,-.045-look*.14+Math.sin(t*.6)*.025,()=>{
      ellipse(0,0,.080,.043);
      path([[.042,.021],[.235,-.019],[.055,-.023]],0,true);
      curve([[-.05,.025],[-.12,.06],[-.15,.045],[-.18,.052]],.018);
      c.save();c.globalCompositeOperation='destination-out';ellipse(.022,.012,.014,.011);c.restore();
    });
    c.save();c.globalCompositeOperation='destination-out';
    curve([[-.15,.49],[-.18,.43],[-.16,.37],[-.20,.30]],.016);c.restore();
  }
  function rider(t,s){
    const across=-.39+.76*smooth(.08,.87,s.progress),jump=Math.sin(smooth(.25,.65,s.progress)*Math.PI)*.17;
    at(across,.27+jump,.97,Math.sin(t*.65)*.07,()=>{
      horse(0,0,.95,t,0);
      person(-.095,.27,.53,{lean:.15,re:[.20,.55],rh:[.42,.50],le:[.10,.60],lh:[.30,.55],lk:[-.16,.20],lf:[-.12,.08],rk:[.13,.17],rf:[.30,.05]},'cloak');
      curve([[-.13,.66],[-.35,.72],[-.37,.56],[-.60,.66+Math.sin(t*1.8)*.035]],.040);
    });
    const points=[];for(let i=0;i<=70;i++){const x=-1+i/35;points.push([x,.22+Math.sin(x*3.3-t*.7)*.025]);}path(points,.025);
    for(let i=0;i<7;i++){const x=across-.10-i*.09;star(x,.20+Math.sin(t+i)*.035,.014+(i%2)*.008,t+i);}
  }
  function eclipse(t,s){
    const open=smooth(.09,.42,s.progress),radius=.17+.22*open;
    ring(0,.81,radius,radius,.045);
    for(let i=0;i<12;i++){const a=i*TAU/12+t*.18;line([Math.cos(a)*(radius+.045),.81+Math.sin(a)*(radius+.045)],[Math.cos(a)*(radius+.10),.81+Math.sin(a)*(radius+.10)],.016);}
    // Two long bodies climb around opposite sides of the sun.
    for(const side of [-1,1]){
      const points=[];for(let i=0;i<=80;i++){const u=i/80,a=-1.55+u*3.4+t*.18;points.push([side*(Math.cos(a)*(.46+.08*Math.sin(u*5+t*.5))),.70+Math.sin(a)*.44]);}
      path(points,.053);const head=points.at(-1);ellipse(head[0],head[1],.064,.035,side*.6);
      line([head[0]+side*.03,head[1]],[head[0]+side*.10,head[1]+.014],.012);
    }
    c.save();c.globalCompositeOperation='destination-out';ellipse(-.54+1.08*smooth(.25,.76,s.progress),.81,radius*.91,radius*.91);c.restore();
  }
  function book(t,s){
    const open=.18+.82*smooth(.08,.41,s.progress);
    for(const side of [-1,1])at(0,.29,1,0,()=>{
      c.scale(side*open,1);
      cloth([[0,0],[.20,.11],[.43,.12],[.73,.025],[.70,.22],[.45,.35],[.08,.22],[.02,.17],[.01,.06],[0,0]]);
      c.save();c.globalCompositeOperation='destination-out';for(let i=0;i<3;i++)curve([[.12,.09+i*.043],[.29,.15+i*.042],[.50,.10+i*.042],[.63,.08+i*.042]],.013);c.restore();
      curve([[0,0],[.25,.08+Math.sin(t*2)*.07],[.49,.42],[.69,.27]],.021);
    });
    line([0,.26],[0,.49],.024);
    c.save();c.globalAlpha=smooth(.30,.48,s.progress);
    path([[-.47,.64],[-.25,.99],[-.07,.73],[.16,1.15],[.43,.70]],.027);
    for(let i=0;i<3;i++)bird(-.52+i*.53,.93+Math.sin(t*.5+i)*.10,.17,t+i);
    star(.55,1.19,.047,t*.2);c.restore();
  }
  function lanterns(t,s){
    const release=smooth(.19,.43,s.progress);
    person(-.12,.13,.66,{lean:.055,le:[-.16,.77],lh:[-.11,.98],re:[.18,.77],rh:[.16,.98],lf:[-.12,0],rf:[.14,0]},'robe');
    lantern(.015,.79+release*.35,.68,t*.6);
    for(let i=0;i<6;i++){
      const phase=smooth(.22+i*.055,.61+i*.055,s.progress),x=(i%2?-1:1)*(.25+(i%3)*.21)+Math.sin(t*.55+i)*phase*.045;
      c.save();c.globalAlpha=phase;lantern(x,.31+phase*(.55+(i%2)*.13),.36+(i%3)*.065,t*.8+i);c.restore();
    }
  }

  const entries=[
    ['whale','Whale beneath the stars','A vast visitor swims through the heat.',39,[.51],[0,.83],[-.46,.10],.35,['A deep shape stirs beneath the fire.','The whale breaches into a sky of sparks.','Its silver wake becomes warm ash.'],whale],
    ['moth','The moth and the moon','A wingbeat wide enough to hold the night.',37,[.55],[0,.82],[-.15,.15],.28,['Two folded wings find the light.','A great moth opens beneath the moon.','The night folds itself away.'],moth],
    ['forge','The ember blacksmith','Someone is forging a fallen star.',36,[.35,.52,.67],[.34,.66],[-.43,.34],.54,['A hammer rises above the coals.','Each strike wakes the fallen star.','The forge releases its last sparks.'],forge],
    ['fox','The ember fox','A small visitor wakes among the coals.',37,[],[-.20,.23],[-.31,.10,.33],.18,['A curled tail stirs beside the embers.','The fox stretches, then listens to the fire.','It settles back into the warmth.'],fox],
    ['cranes','The paper migration','One folded bird becomes a small sky.',37,[.56],[0,.83],[0],.40,['A fold lifts from the glowing bed.','One crane calls four more into flight.','Every wing becomes a drifting spark.'],cranes],
    ['galaxy','A hand full of galaxies','An open palm lets the universe go.',40,[.58],[0,.85],[-.11,.11],.35,['A hand reaches gently out of the fire.','Its fingers open around a turning galaxy.','The stars slip through and rise away.'],galaxy],
    ['octopus','The octopus orchestra','Eight arms conduct the rising sparks.',39,[.40,.62],[0,.88],[-.56,0,.56],.48,['Long arms uncurl beneath the heat.','An octopus conducts its bright orchestra.','The final gesture loosens into smoke.'],octopus],
    ['lion','The lion of dawn','A mane of fire greets the morning.',36,[.55],[0,.68],[-.25,.25],.52,['A great face gathers in the embers.','The lion opens its burning mane.','Its silent roar gives way to dawn.'],lion],
    ['garden','The clockwork garden','Flowers keep a time of their own.',40,[.56],[0,.77],[-.66,-.33,0,.33,.66],.23,['Small stems wind their way out of the ash.','Gears turn where flowers ought to be.','The garden lets its petals go.'],garden],
    ['train','The dream train','A last train crosses a bridge of light.',40,[.54],[.17,.88],[-.55,.25],.52,['An empty bridge finds its rails.','The train passes; its steam takes wing.','The final carriage disappears into warmth.'],train],
    ['bridge','The lovers’ bridge','Two distant figures meet above the fire.',41,[.59],[0,.89],[-.63,.63],.22,['A bridge grows between two strangers.','They meet beneath a small burning heart.','The crossing returns to the coals.'],bridge],
    ['heron','The watchful heron','One quiet bird among the rising reeds.',38,[],[.02,.34],[-.58,-.11,.04,.43,.62],.16,['Thin reeds rise from the glowing bed.','A heron lifts its head and watches.','Reeds and feathers loosen into flame.'],heron],
    ['rider','The comet rider','A rider gallops along a falling star.',37,[.48],[0,.73],[-.45,.20],.60,['A bright road draws itself over the coals.','Horse and rider leap across its crest.','Their hoofbeats scatter into sparks.'],rider],
    ['eclipse','The serpent and the sun','Two serpents carry a small eclipse.',40,[.53],[0,.81],[-.40,.40],.38,['Two bright coils lift a little sun.','A dark moon crosses between them.','The serpents loosen; daylight returns.'],eclipse],
    ['book','The storyteller’s book','The fire opens a world between its pages.',40,[.56],[0,.87],[-.30,.30],.30,['A closed story begins to open.','Mountains and birds rise from the pages.','Its pages lift away as glowing ash.'],book],
    ['lanterns','The last lanterns','A child sends small wishes into the night.',41,[.60],[0,.96],[-.35,0,.35],.24,['Small hands lift one paper lantern.','A procession of wishes follows it upward.','The last light disappears into the dark.'],lanterns]
  ];
  const visions={},profiles={},draw={},sizes={};
  for(const [id,title,subtitle,duration,peaks,origin,roots,wind,lines,paint] of entries){
    visions[id]=[title,subtitle];profiles[id]={duration,peaks,origin,roots,wind,lines};draw[id]=paint;sizes[id]=[1,1];
  }
  return {visions,profiles,draw,sizes};
};
