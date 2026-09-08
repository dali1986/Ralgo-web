import { randomGenerator } from './simulation.js?v=38';
import { styleForSeed, familyNames, finishNames, palettes, paletteNames, thicknessesForSeed, finishScoreForSeed } from './style-seed.js?v=38';

export const MIN_SEAS=3,MAX_SEAS=50;
// A smooth bell in log-count space peaks at eleven, with a longer upper
// tail. Both endpoints share a small, nonzero weight.
export const SEA_COUNT_WEIGHTS=Object.freeze(Array.from({length:MAX_SEAS-MIN_SEAS+1},(_,i)=>{
  const count=MIN_SEAS+i,peak=11;
  const distance=Math.log(count/peak)/Math.log(count<peak?peak/MIN_SEAS:MAX_SEAS/peak);
  return .04+.96*Math.exp(-4*distance*distance);
}));
const countWeightTotal=SEA_COUNT_WEIGHTS.reduce((sum,weight)=>sum+weight,0);
function drawCount(random){
  let ticket=random()*countWeightTotal;
  for(let i=0;i<SEA_COUNT_WEIGHTS.length;i++){
    ticket-=SEA_COUNT_WEIGHTS[i];if(ticket<0)return MIN_SEAS+i;
  }
  return MAX_SEAS;
}
export function seaCountForSeed(seed){return drawCount(randomGenerator((seed^0x73AD94B1)>>>0));}
function take(bag,size,random){
  if(!bag.length)for(let i=0;i<size;i++)bag.push(i);
  return bag.splice(Math.floor(random()*bag.length),1)[0];
}
// Whole compositions are seeded. Structure and colour bags use every entry
// before repeating; a separate score occasionally favours painterly finishes.
export function ensembleForSeed(seed) {
  const random=randomGenerator((seed^0x73AD94B1)>>>0);
  const count=drawCount(random), layout=Math.floor(random()*3);
  const thicknesses=thicknessesForSeed(seed,count);
  const finishScore=finishScoreForSeed(seed);
  const rotation=random()*Math.PI*2, bend=random()*Math.PI*2;
  const families=[],colourways=[],finishes=[];
  const members=[];
  for(let i=0;i<count;i++) {
    const memberSeed=1+Math.floor(random()*2147483646);
    const style=styleForSeed(memberSeed,{
      family:take(families,familyNames.length,random),
      palette:take(colourways,palettes.length,random),
      finish:finishScore.pool[take(finishes,finishScore.pool.length,random)]
    });
    const angle=rotation+i*Math.PI*2/count+(random()-.5)*.18;
    let x=.5+Math.cos(angle)*.29,y=.5+Math.sin(angle)*.29;
    if(layout===0&&count>10){
      const radius=.37*Math.sqrt((i+.5)/count),spiral=rotation+i*2.399963229728653;
      x=.5+Math.cos(spiral)*radius;y=.5+Math.sin(spiral)*radius;
    }else if(layout===1) {
      // A sinuous front crossing the whole frame, with alternating incursions.
      const along=(i+.5)/count;
      x=.06+along*.88;y=.5+Math.sin(i*2.4+bend)*.06;
      if(Math.sin(rotation)<0)[x,y]=[y,x];
    } else if(layout===2) {
      // Spread the pigment sources through the frame.
      let best=-1;
      for(let k=0;k<48;k++) {
        const cx=.17+random()*.66,cy=.17+random()*.66;
        const distance=members.length?Math.min(...members.map(m=>(cx-m.source[0])**2+(cy-m.source[1])**2)):1;
        if(distance>best){best=distance;x=cx;y=cy;}
      }
    }
    const phase=random()*Math.PI*2,rate=.09+random()*.075;
    members.push({seed:memberSeed,style,thickness:thicknesses[i].value,thicknessName:thicknesses[i].name,
      source:new Float32Array([x,y,phase,rate]),
      motion:new Float32Array([random()*Math.PI*2,.16+random()*.13,.76+random()*.48,random()])});
  }
  // Give open forms enough scale around their sources to meet the other seas.
  for(const member of members){
    const nearest=Math.min(...members.filter(m=>m!==member).map(m=>Math.hypot(m.source[0]-member.source[0],m.source[1]-member.source[1])));
    member.motion[1]=Math.max(.17*Math.min(1,Math.sqrt(5/count)),Math.min(.32,nearest*.64));
    member.style.gesture[0]*=.24;member.style.gesture[1]*=.24;
    member.style.form[1]=.72+member.style.form[1]*.24;
  }
  const packed={};
  for(const [uniform,key] of [['forms','form'],['gestures','gesture'],['pigments','pigment'],['materials','material'],['structures','structure'],['phenomena','phenomenon']]){
    packed[uniform]=new Float32Array(MAX_SEAS*4);members.forEach((m,i)=>packed[uniform].set(m.style[key],i*4));
  }
  packed.sources=new Float32Array(MAX_SEAS*4);packed.motions=new Float32Array(MAX_SEAS*4);packed.colours=new Float32Array(MAX_SEAS*18);
  members.forEach((m,i)=>{packed.sources.set(m.source,i*4);packed.motions.set(m.motion,i*4);packed.colours.set(palettes[m.style.palette],i*18);});
  // Fifteen RGBA texels per sea avoid fragment-uniform limits on WebGL 2.
  // Origin.xy is filled from the simulation; origin.z holds paint thickness.
  // Eight style vectors and six colours retain the existing texture layout.
  packed.styles=new Float32Array(MAX_SEAS*15*4);
  members.forEach((member,i)=>{
    const base=i*60;
    packed.styles[base+2]=member.thickness;
    ['forms','gestures','pigments','materials','structures','phenomena','sources','motions'].forEach((key,j)=>packed.styles.set(packed[key].subarray(i*4,i*4+4),base+(j+1)*4));
    for(let j=0;j<6;j++)packed.styles.set(packed.colours.subarray(i*18+j*3,i*18+j*3+3),base+(9+j)*4);
  });
  return {count,layout,members,packed,finishScore:finishScore.name,painterly:finishScore.painterly,
    name:`${count} interacting seas`,
    signature:members.map(m=>m.style.family).join('-'),
    description:members.map(m=>`${familyNames[m.style.family]} / ${paletteNames[m.style.palette]} / ${m.thicknessName} / ${finishNames[m.style.finish]}`).join(' · ')};
}
