// Derive a still-capture page from the original artwork; keep one artwork source.
export function illuminationsPreview(source) {
  const boot = '  requestAnimationFrame(frame);\n  window.__settle=';
  if (!source.includes(boot)) throw new Error('Illuminations preview boot point changed.');
  const capture = `  DIRECTOR.sound=false; DIRECTOR.captions=false;
  // Skip the production/title cards and capture the whale's first appearance.
  for(let i=0;i<5&&W.currentAct?.screen;i++)nextScene();
  nextScene();
  W.t=W.actStart+W.actDur*.45; W.formT=Math.max(0,W.t-W.figStart);
  let previewFrames=0;
  function capturePreview(){
    WARPING=true;for(let i=0;i<4;i++)stepWorld(0);WARPING=false;
    stepCamera(.1,W.t);flushRing();render(W.t);
    if(++previewFrames<48){requestAnimationFrame(capturePreview);return;}
    parent.postMessage({type:'ralgo-art-preview',kind:'illuminations',image:cv.toDataURL('image/webp',.9)},location.origin);
  }
  requestAnimationFrame(capturePreview);
  window.__settle=`;
  return source.replace(boot,capture).replace('</head>',`<style>.chrome,#act,#filmCard,#restoreBtn,.art-links{display:none!important}html,body{pointer-events:none}</style></head>`);
}
