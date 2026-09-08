// Original per-sea finishes, restored from the painting before the medium selector.
export const originalSurface=` // Surface treatments alter the distribution of light and pigment, not just
 // a palette lookup. Open forms also receive their own quiet ground.
 ground=mix(colours[0]*.75,colours[1]*.48,smoothstep(-.6,.6,world.y));
 if(material.x<.5){
  ground=mix(ground,colours[5],material.z*.21);
  colour*=.96+texturePigment*.09;
 }else if(material.x<1.5){
  vec3 paper=colours[5]*(.95+texturePigment*.06);
  vec3 ink=min(colours[0],colours[3]*.30);
  float density=clamp(ridge*.61+lines*.58+fine*.22+land*.15+deposit*.12,0.,1.);
  colour=mix(paper,ink,density);
  colour=mix(colour,colours[3],clamp(foam*.44+edgeLight*.17,0.,.8));
  ground=paper;
 }else if(material.x<2.5){
  vec3 glaze=mix(colours[5],colours[2],.13+ridge*.25);
  glaze*=.62+lighting*.40;
  colour=mix(glaze,colour,.25+material.z*.35);
  colour+=colours[5]*lightLobe*.20;
  ground=mix(colours[0]*.75,colours[5],.18+material.w*.62);
 }else if(material.x<3.5){
  ground=colours[0]*.14;
  vec3 shimmer=mix(colours[2],colours[4],.5+.5*sin(normal.x*3.+normal.y*2.+t*.13));
  colour=colour*(.66+lighting*.38)+shimmer*(foam*.22+edgeLight*.13)+colours[5]*lightLobe*.28;
  colour+=colours[2]*undertow*.12*ridge;
 }else if(material.x<4.5){
  // Bristles follow the sea's material coordinates, so a drag carries the
  // brushwork with its pigment. Broken tips expose coloured underpainting.
  vec2 brush=vec2(q.x+warp.x*.16,q.y+sin(q.x*2.7+t*.08)*.045);
  float bristles=stroke(brush.y*(24.+material.z*22.)+noise(brush*4.+origin)*.65,.16);
  float loaded=smoothstep(.24,.68,noise(brush*vec2(2.6,13.)+origin));
  vec3 strokePaint=mix(water,mineral,warm);
  colour=mix(colour,strokePaint,.18+loaded*.14);
  colour=mix(colour,mix(colours[2],colours[4],warm),bristles*(.10+.12*loaded));
  colour=mix(colour,pearl,(lines*.17+fine*.09+ridge*.055)*loaded);
  colour*=.95+texturePigment*.10;
  ground=mix(water,mineral,warm*.6);
 }else if(material.x<5.5){
  // A knife lays down broad, angular deposits with a fine dragged edge.
  vec2 blade=vec2(q.x+q.y*.24,q.y+warp.y*.05);
  float swath=noise(blade*vec2(2.1,9.)+origin);
  float loaded=smoothstep(.28,.63,swath+deposit*.22);
  float scrape=stroke(blade.y*(13.+material.z*14.)+swath*.35,.12);
  vec3 laidPaint=mix(mix(colours[1],colours[2],loaded),mineral,warm);
  colour=mix(colour,laidPaint,.24+loaded*.15);
  colour=mix(colour,mix(colours[4],colours[5],.35),scrape*loaded*.24);
  colour=mix(colour,pearl,lines*.17+fine*.10+edgeLight*.10);
  ground=mix(water,mineral,warm*.8);
 }else if(material.x<6.5){
  // Watercolour pools in small grain and along existing crests. The washes
  // stay local: no blurred frame, pale veil, or loss of the etched phase.
  float granulation=noise(q*37.+origin)*.65+texturePigment*.35;
  float pooling=smoothstep(.34,.70,granulation+deposit*.20);
  vec3 wash=mix(water,mineral,warm);
  vec3 bloom=mix(colours[2],colours[4],warm);
  colour=mix(colour,mix(wash,bloom,.18+granulation*.17),.30);
  colour=mix(colour,wash,pooling*.15);
  colour=mix(colour,pearl,lines*.19+fine*.11+edgeLight*.09);
  colour*=.96+granulation*.075;
  ground=mix(wash,bloom,.24);
 }else if(material.x<7.5){
  // Matte gouache leaves overlapping, loaded dabs and small broken tips.
  vec2 dab=vec2(q.x+warp.x*.12,q.y+sin(q.x*3.1+t*.07)*.035);
  float load=smoothstep(.23,.72,noise(dab*vec2(3.2,11.)+origin));
  float dryTip=stroke(dab.y*(20.+material.z*14.)+noise(dab*5.+origin)*.35,.13);
  vec3 gouache=mix(mix(colours[1],colours[2],load*.7),mineral,warm);
  colour=mix(colour,gouache,.26+load*.13);
  colour=mix(colour,mix(colours[3],colours[4],load),dryTip*load*.17);
  colour=mix(colour,pearl,lines*.18+fine*.12+edgeLight*.08);
  colour*=.97+texturePigment*.055;
  ground=mix(water,mineral,warm*.8);
 }else{
  // Oil pastel catches in the surface tooth. Short coloured hatch marks
  // follow the moving material, with fine scratches through the waxy body.
  vec2 chalk=vec2(q.x+q.y*.28,q.y+warp.y*.07);
  float tooth=noise(chalk*29.+origin)*.6+texturePigment*.4;
  float hatch=stroke(chalk.y*(17.+material.z*13.)+noise(chalk*3.4+origin)*.52,.19);
  float broken=smoothstep(.28,.67,tooth);
  vec3 wax=mix(water,mineral,warm);
  vec3 crayon=mix(colours[2],colours[4],.5+.5*sin(phase*1.6+origin.x));
  colour=mix(colour,wax,.22);
  colour=mix(colour,crayon,hatch*(.12+broken*.18));
  colour=mix(colour,pearl,lines*.18+fine*.12+ridge*broken*.045);
  colour*=.94+tooth*.12;
  ground=mix(wax,crayon,.16);
 }
`;
