import { randomGenerator } from './simulation.js?v=38';
export const paletteHex=[
 ['#081638','#2056c5','#28bfcc','#ec5134','#ffc555','#fff1cc'],
 ['#c6c6b7','#ecdfc4','#508c9c','#d63824','#f1ad3f','#fff9e9'],
 ['#351a2a','#ba2d34','#ff8251','#22549c','#ffd15c','#fff0cf'],
 ['#092c48','#078da7','#66e4d5','#f08058','#f2ce70','#fff5d7'],
 ['#45303b','#b7612e','#f4bd3e','#2853b2','#7badcd','#fff3cb'],
 ['#172722','#637f7d','#c7d6c8','#e03b25','#e8c8a0','#fff7e8'],
 ['#492337','#c45472','#ffb196','#245ca0','#ecd178','#fff0df'],
 ['#173b56','#69a5bd','#d1efeb','#d16843','#f4b239','#fffae8'],
 ['#071440','#1f3bac','#739bea','#b32230','#f6c563','#fff2cf'],
 ['#201c24','#e54133','#ffb639','#233c8b','#4ec3c6','#fff8e8'],
 ['#171d24','#3d4750','#a9b7b4','#e64229','#ecd8b0','#fffdf0'],
 ['#103845','#386b78','#c6d0b7','#992d3e','#ef8961','#fff2d6'],
 ['#261d38','#773346','#e88591','#1b738f','#f8cf58','#fff0dd'],
 ['#202d36','#a17842','#ffe0a0','#0e5779','#5dc1cf','#ffffe9'],
 // Electric oppositions: strong middle tones as well as bright accents.
 ['#102275','#174eff','#39dfff','#f22f25','#ff9e28','#fff0ad'],
 ['#073f5b','#009bab','#43ffe1','#ea1768','#ff7db5','#ffe4f0'],
 ['#291d82','#5944ed','#b4a2ff','#ff731d','#ffc83d','#fff1b8'],
 ['#72183b','#de184c','#ff6b92','#006bba','#36d7ed','#d5fbff'],
 ['#154685','#118bcc','#65eeff','#ee341c','#ffba4d','#ffedc2'],
 ['#34337c','#5665ec','#98bdff','#de267a','#ff9154','#ffe8cd'],
 ['#552064','#bd28b6','#fc8cdc','#007ba6','#2cf0e2','#d6fff6'],
 ['#5c245e','#aa3692','#ff8fca','#c66b12','#ffe13d','#fff3b1'],
 // Fire, lacquer and hot mineral colour.
 ['#681a32','#be263e','#ff6248','#f59816','#ffe047','#fff0bb'],
 ['#70253b','#d5383d','#ff9670','#244ca5','#80beee','#f3efff'],
 ['#764016','#cc7518','#ffb52c','#1657b7','#46b9f1','#e1f9ff'],
 ['#7c182e','#ee263b','#ff9a6c','#9626a5','#e17edf','#ffe7f4'],
 ['#5e294d','#bc3568','#ff899a','#bb640e','#ffcf34','#fff3bd'],
 ['#85371d','#e95b23','#ffb66d','#106e7f','#4aded7','#dcfff1'],
 ['#63213c','#b13d39','#ff8950','#bd8a1d','#f4e461','#fff8cc'],
 ['#604173','#a060bb','#e5a2ec','#df441f','#ffb527','#fff0ba'],
 // Glacial, oceanic and bioluminescent colour.
 ['#07346c','#176bc5','#38d2ff','#009b9c','#76ffe0','#defff5'],
 ['#124a61','#158fa2','#73e9e7','#d43b76','#ff9cb2','#fff0e8'],
 ['#1e3888','#566dde','#b0d0ff','#bf7924','#ffcd68','#fff0c8'],
 ['#0c4b65','#048bac','#37e3ed','#ad26a1','#ed79d8','#ffdef8'],
 ['#1d4a82','#4e8cc7','#b8edff','#e75d66','#ffb6a8','#fff1e9'],
 ['#0c535c','#179d94','#71f5cc','#e34b2b','#ffb353','#fff4cd'],
 ['#224ba1','#357bff','#88c4ff','#d89828','#ffe58a','#fff9df'],
 ['#155765','#35a8b5','#a2f6ee','#aa456b','#eb9cb2','#ffe8ee'],
 // Jewel, floral and ultraviolet meetings.
 ['#243e70','#3965c7','#75bfff','#b72572','#fb84b5','#ffe1ed'],
 ['#691b58','#b72893','#ff7fc8','#a77810','#f4d83d','#fff5b3'],
 ['#23386f','#6545cb','#b898ff','#e83175','#ff9575','#ffe9d5'],
 ['#67224c','#c84776','#ffadc4','#1866ae','#4ecfee','#e8ffff'],
 ['#38438d','#7b66d8','#d1b9ff','#c94128','#ffaf55','#fff0d1'],
 ['#522771','#9252c4','#e7aaff','#0788a4','#56e7d9','#dbfff3'],
 ['#204d50','#298780','#a0dfca','#c02766','#ff7d95','#ffe9df'],
 ['#633251','#b04c79','#ffb4bc','#354fba','#a5b9ff','#eff2ff'],
 // Metal, citrus and ink: fewer dominant hues, strong value structure.
 ['#133448','#1e647c','#70c4d4','#a65727','#efad61','#fff0ca'],
 ['#253f6e','#566caf','#b3c6e9','#c0801f','#ffdc70','#fff6d5'],
 ['#4a314d','#925462','#d99489','#e18b1b','#ffe073','#fff4d7'],
 ['#183e71','#2768b5','#70b1e7','#e37524','#ffcd59','#fff3bf'],
 ['#463655','#8a6391','#dab4d6','#ae572d','#f7b071','#fff0d5'],
 ['#154453','#247e83','#77d3bf','#c28c14','#ffdd54','#fff7bd'],
 ['#512d43','#ab4d55','#f58d83','#c59440','#f7de9b','#fff6df'],
 ['#1a4761','#508da2','#b0d6dd','#d13e31','#ff9870','#ffeacd'],
 // Unexpected duets, with coloured highlights rather than a white wash.
 ['#345019','#668b23','#b9dd4e','#bf2161','#fa79a5','#ffe2e7'],
 ['#632b75','#ab4dce','#eb9cff','#97a418','#e4ee4e','#fcffc3'],
 ['#005962','#008e95','#52ead1','#e88c0c','#ffe329','#fff6af'],
 ['#284599','#4167e1','#87aaff','#de1764','#ff6394','#ffccd9'],
 ['#783825','#bb5f32','#f3a667','#bd287e','#f883be','#ffe0ee'],
 ['#3d327c','#6263bf','#afbaff','#d7951b','#ffda4c','#fff6b8'],
 ['#135776','#108dad','#5adced','#cd515b','#ffa3a6','#ffe9df'],
 ['#693957','#a75d84','#e4a4c4','#cc6523','#ffb658','#fff0c5'],
 ['#24538c','#548ec7','#b4dafa','#c45636','#f79b62','#ffead4'],
 ['#1e5265','#389eaf','#8df3e9','#e4558e','#ff9bd1','#ffe5f5']
];
export const paletteNames=[
 'Cobalt ember','Turner tide','Vermilion dusk','Coral lagoon','Ochre storm','Silver kelp','Rosewater','Morning copper','Atlantic gold','Signal red','Graphite tide','Mineral rose','Plum current','Amber estuary',
 'Voltage','Hot lagoon','Ultramarine orange','Cherry electric','Solar surf','Neon dusk','Orchid lightning','Fuchsia gold',
 'Molten persimmon','Lacquer and ice','Saffron cobalt','Dragon fruit','Pomegranate sun','Copper turquoise','Burnished flame','Apricot amethyst',
 'Glacier pulse','Pink iceberg','Arctic brass','Opal lightning','Rose quartz tide','Coral atoll','Blue cathedral','Frozen hibiscus',
 'Sapphire rose','Ruby citron','Electric iris','Peony blue','Wisteria fire','Alexandrite','Malachite bloom','Garnet porcelain',
 'Patinated copper','Gold leaf rain','Rose bronze','Amber ink','Copper pearl','Brass lagoon','Champagne carmine','Red sail',
 'Acid rose','Violet citron','Turquoise sulphur','Racing cerise','Tangerine orchid','Iris and honey','Salmon glacier','Orchid ochre','Terracotta sky','Pink phosphor'
];
// Two colour voices per palette: a deep-to-bright body, an opposing accent,
// and a coloured crest. The new highlights carry hue instead of whitening it.
const newColourways=[
 ['Electric poppy','123ca0 245cff 55ddff f52d45 ff854a ffd76b'],
 ['Blue blood orange','16317a 167fc7 56e4ef f34316 ff9c23 ffe16a'],
 ['Cyan carmine','095367 00a5c4 69f4ec b9174e ff397d ffadbe'],
 ['Cerulean mango','123b81 007ede 45c9ff ef6611 ffc234 fff18b'],
 ['Vermilion silk','862740 e93437 ff8160 1251ca 339fff a1efff'],
 ['Lapis lemon','242887 4949ef 8c92ff eba313 f5e72e fff887'],
 ['Lagoon cherry','075875 00a7b0 50efd6 c8275a ff569d ffd074'],
 ['Ultramarine rose','182b86 345bde 7aa9ff e12169 ff7eaf ffcade'],
 ['Solar persimmon','793027 d7491e ff8f28 e2a212 f9da32 fff5a2'],
 ['Cinnabar apricot','842e39 d53544 ff6260 ef8e38 ffc177 ffe6a0'],
 ['Saffron lacquer','792347 ce3b50 ff8158 c8850c f2c837 fff191'],
 ['Peach fireworks','883950 e45e73 ffa98e e84828 ff9739 ffdf6a'],
 ['Rose copper flame','7d2a4c bc3d76 ff8b9c b76321 e5aa43 ffe9a0'],
 ['Amber carnival','684021 b16c17 f8b52d e63b53 ff8091 ffd6a6'],
 ['Cherry gold leaf','6d2449 bf2456 ff517f e49c13 ffd345 ffff9b'],
 ['Coral furnace','882938 da413c ff9470 087da1 34d1d9 97f3d1'],
 ['Peacock citron','15536b 008c9d 39dcdb bbb117 efdf29 f7ff9f'],
 ['Emerald pomegranate','175740 198969 60ddb0 b52f50 f35479 ffbb8d'],
 ['Petrol electric pink','15556c 238ca3 7ae9df cd247c ff78c1 ffd1e9'],
 ['Absinthe cobalt','405824 719731 c5da65 2855c7 519aff c2edff'],
 ['Jade scarlet','22655e 31a48e 94dfb0 cf3833 ff7861 ffd894'],
 ['Kingfisher gold','125279 167bae 43d6e8 be8914 f3c942 fff1a1'],
 ['Chartreuse ruby','58602c 969e34 e5e95c a51f64 e74b9b ffadd0'],
 ['Verdigris tangerine','265969 358e9a 89d9d4 da6426 ffad48 ffe68b'],
 ['Amethyst saffron','4a287b 8051c8 ca9cf2 df8625 ffc84c fff0a0'],
 ['Magenta ice','7b236b bf40a4 ff83d1 1684bd 48daef c1faff'],
 ['Mulberry electric blue','59284d a33375 ef70a6 225ad1 4ba4ff c3efff'],
 ['Orchid papaya','622782 a251bd e896f0 ee6736 ffac5a ffe0a2'],
 ['Violet flame','352776 6450c4 ad8fea e44239 ff8850 ffdd88'],
 ['Fuchsia turquoise','6f286f c143b3 ff89de 0b8d9d 53e4d2 baffd7'],
 ['Grape grapefruit','492970 8249b2 cda0e6 d44c65 ff8395 ffbdad'],
 ['Iris vermilion','293c8d 6e65c9 b9b5f2 d44124 ff8d3e ffe18a'],
 ['Polar apricot','205779 4894c5 a9deef e27c52 ffba84 ffe3a8'],
 ['Iceberg cerise','25567e 559aca c2edf6 c83c79 ff82af ffcddc'],
 ['Periwinkle citrus','394e96 7995dc bdccf4 d5a925 f3d754 fff3ab'],
 ['Mint watermelon','28676c 54aaa5 b5e5c6 cf4563 ff879a ffc6bd'],
 ['Powder blue copper','345785 679ac2 bddde9 b86832 eca85b ffdb95'],
 ['Lilac marmalade','564585 9381c5 d6c5ee df8442 ffb96f ffe3aa'],
 ['Glacier rose gold','2d6077 5baab7 b7e6df b96268 eba194 ffd4b1'],
 ['Porcelain poppy','3a597a 739fbe cce2ee d94843 ff9580 ffcda8'],
 ['Sunken bronze','354f56 638c87 b0c8a2 a96325 dda640 f9df8c'],
 ['Cobalt brass flash','244275 386aad 79b6e1 b08023 f1bc3f ffea90'],
 ['Copper ink blossom','503c60 936783 d5a3bd ba6230 eea752 ffd995'],
 ['Patina hot coral','285d62 44948e 91d6bc ce5044 ff9170 ffd7a1'],
 ['Honey sapphire','284782 547ec2 a2cef3 bb862a eac456 fff1a5'],
 ['Rose gold ultramarine','493d72 7a6ba5 c5b3d9 d48061 f3b48c ffe2b2'],
 ['Sienna phosphor','76472e b26f3c efae68 268b96 66ddcf c7f3c1'],
 ['Silver coral signal','3a5774 7d9daa c2dddc d34057 ff7f8e ffc9a8'],
 ['Summer lightning','185c91 238dd2 62e4ff e9ba13 f7ec4a faffb4'],
 ['Pink acid surf','882c79 d748bc ff91dd 159aaa 54e8df dbf990'],
 ['Aegean marigold','1b5085 187fd0 62c9ec eba622 ffd957 fff1ae'],
 ['Flamingo sapphire','8f355f d74f86 ff91b4 1765af 35b2db aaf1f2'],
 ['Papaya petrol','8b4433 dc763f ffc070 096b83 22bdc8 a2f4dc'],
 ['Hibiscus moon','84315e c94285 ff7fb4 6879c8 a9c0ee e5e2ff'],
 ['Citrus orchid','625327 a79a32 e8d453 a53494 e274c5 ffc0e8'],
 ['Azure scarlet silk','234ba0 437cf0 93cfff cc263d ff6a5b ffc37e'],
 ['Peony saffron bloom','7f375f c3638b ffa9c8 d88b29 f2c35e ffe4a9'],
 ['Lavender coral flash','4f427f 8e76bd cdb5ec e56859 ffaa80 ffdba6'],
 ['Opal sunburst','2b6974 54a8ad b0e7d9 e88b30 ffc359 ffea9f'],
 ['Cerise lapis dust','872a62 cc438e ff9fc6 364eab 788dd9 c7dcff'],
 ['Apricot blue velvet','2a467e 476cbb 90b9ee e48050 ffb57d ffe1ad'],
 ['Tropical ruby','1d676c 289b96 7ee0c0 bf2e63 f85b8f ffb6b8'],
 ['Mimosa midnight','304484 5267b2 96b1e9 c9a423 f0d547 fff4a3'],
 ['Festival tide','22549a 367ef0 73d9f0 e23978 ff8759 ffda70'],
 // Playful pigment pairings, with bright middle tones and tinted highlights.
 ['Bubblegum lagoon','205b89 238fc5 69e8e7 d62e8a ff76bc ffd69d'],
 ['Mango disco','77348a c654ae ff96d7 ec851b ffca32 fff396'],
 ['Raspberry lemonade','863258 d23e76 ff83a5 c5a21f f5db46 fff2a2'],
 ['Poolside popsicle','1c537e 289bc3 89e8eb e75b44 ffab6b ffdf83'],
 ['Electric sherbet','36459b 7961d8 c39bf5 ec735d ffb59b ffe79d'],
 ['Watermelon splash','236b68 32b29b 99edc4 d53568 ff7898 ffc9ba'],
 ['Candy cobalt','28469f 386bf4 78bfff d5379c ff89d5 ffdb9a'],
 ['Apricot fizz','91434e df7375 ffb398 2e83bb 6bd1e2 c7f5d9'],
 ['Papaya confetti','894823 df8737 ffd36b bb3699 f585d4 ffd4eb'],
 ['Cherry soda','822c62 d62f76 ff70a7 208db0 5ae0dc c7f490'],
 ['Lollipop tide','41439b 7363d1 c1aff6 e64970 ff9b93 ffdf89'],
 ['Lime and guava','426837 80b13c d4ed70 cc4086 ff87bc ffd2d8'],
 ['Blueberry sundae','3e398b 7367cc b6a7f1 db8053 ffc281 ffe7ae'],
 ['Peach pinwheel','87426e d57cac ffb7db 289fa7 73e0ca d6ef99'],
 ['Tangerine trampoline','205991 298de1 7adeef e8702c ffb64d ffe381'],
 ['Carnival coral','8c347c d750be ff9bdf ed7556 ffbf6d fff0a8']
];
for(const [name,hex] of newColourways){paletteNames.push(name);paletteHex.push(hex.split(' ').map(c=>'#'+c));}
export const palettes=paletteHex.map(p=>new Float32Array(p.flatMap(h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255))));
// Independent seed stream: thickness never changes sea count or geometry draws.
export const thicknessNames=['Gossamer','Veil','Silk','Oil','Heavy oil','Impasto'];
const thicknessValues=[.42,.65,.90,1.25,1.72,2.30];
export function thicknessesForSeed(seed,count){
 const r=randomGenerator((seed^0x6E51C2A7)>>>0);
 const shuffle=a=>{for(let i=a.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};
 // Every painting includes a thin, medium and thick sea; subsequent bags
 // use all six weights before repeating. No seed or trait rejection.
 let bag=shuffle([Math.floor(r()*2),2+Math.floor(r()*2),4+Math.floor(r()*2)]);
 return Array.from({length:count},()=>{
  if(!bag.length)bag=shuffle([0,1,2,3,4,5]);
  const kind=bag.pop();return {name:thicknessNames[kind],value:thicknessValues[kind]*(.92+r()*.16)};
 });
}
export const familyNames=['Breaking fronts','Whirlpool','Branching delta','Archipelago','Sediment fan','Pelagic bloom','Abyssal lace','Fault sea','Suspended reefs','Rising water','Braided tides','Prismatic shoals','Scallop terraces','Ribbon falls','Cellular surf','Feather currents','Marbled stone','Cross seas'];
export const finishNames=['Pigment','Ink','Porcelain','Luminous','Bristle oil','Palette knife','Watercolour','Gouache','Oil pastel'];
export function finishScoreForSeed(seed){
 const r=randomGenerator((seed^0x16C83F25)>>>0);
 if(r()>=.55)return {name:'Etched tides',painterly:false,pool:[0,1,2,3]};
 const featured=4+Math.floor(r()*5);
 return {name:finishNames[featured],painterly:true,pool:[featured,featured,featured,4,5,6,7,8,0,3]};
}
export function styleForSeed(seed,selection={}){
 const r=randomGenerator((seed^0x4B1D793F)>>>0);
 const sampledFamily=Math.floor(r()*familyNames.length),sampledPalette=Math.floor(r()*palettes.length),sampledFinish=Math.floor(r()*finishNames.length);
 const family=selection.family??sampledFamily,palette=selection.palette??sampledPalette,finish=selection.finish??sampledFinish;
 const scale=family===8?.65+r()*.75:family===9?.78+r()*.55:.48+r()*1.38;
 const angle=family===9?(r()-.5)*.6:r()*Math.PI*2;
 return {family,palette,finish,name:familyNames[family],
  form:new Float32Array([family,scale,2.3+r()*6.9,angle]),
  gesture:new Float32Array([(r()-.5)*.72,(r()-.5)*.48,.10+r()*.40,.85+r()*.70]),
  pigment:new Float32Array([.28+r()*.41,.16+r()*.77,.82+r()*.36,r()]),
  material:new Float32Array([finish,.4+r()*.85,.18+r()*.75,r()]),
  structure:new Float32Array([3+Math.floor(r()*7),.55+r()*.9,r(),r()]),
  phenomenon:new Float32Array([r()*Math.PI*2,.08+r()*.34,.085+r()*.075,r()])};
}
