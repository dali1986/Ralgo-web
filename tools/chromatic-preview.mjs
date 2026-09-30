// Capture a brief run of the supplied artwork without maintaining a live canvas.
export function chromaticPreview(source) {
  const boot = `        init();
        applyQuality(perf.level);
        installRecovery();
        startPixelShift();
        holdWakeLock();`;
  if (!source.includes(boot) || !source.includes('            animate();')) throw new Error('Chromatic preview boot point changed.');
  return source
    .replace('            animate();', '            // The preview advances its own bounded simulation below.')
    .replace('setTimeout(() => seedInitialSplats(true), 4500);', 'seedInitialSplats(true);')
    .replace(boot, `        init();
        applyQuality(perf.level);
        renderer.setPixelRatio(1);
        let previewFrames=0;
        function capturePreview(){
          for(let i=0;i<4;i++)simTick(TICK);
          renderFrame(4*TICK,time);
          if(++previewFrames<60){requestAnimationFrame(capturePreview);return;}
          parent.postMessage({type:'ralgo-art-preview',kind:'chromatic-turbulence',image:renderer.domElement.toDataURL('image/webp',.9)},location.origin);
        }
        requestAnimationFrame(capturePreview);`)
    .replace("window.addEventListener('pointerdown', () => { if (!wakeLock) holdWakeLock(); });", '')
    .replace("if (installParams.has('sound')) setTimeout(autoStartSound, 1200);", '')
    .replace('</head>', `<style>body>*:not(#canvas-container):not(script){display:none!important}html,body{pointer-events:none}</style><script>let previewSeed=730031;Math.random=()=>{previewSeed^=previewSeed<<13;previewSeed^=previewSeed>>>17;previewSeed^=previewSeed<<5;return(previewSeed>>>0)/4294967296;};</script></head>`);
}
