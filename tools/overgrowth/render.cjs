// Runs Ralgo's supplied sketch with its recorded fxhash and p5's seeded RNG.
// This is a CPU preview recovery tool, not a bit-for-bit WebGL implementation.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {createHash} = require('node:crypto');
const {createRequire} = require('node:module');

const editions = JSON.parse(fs.readFileSync(path.join(__dirname, 'editions.json'))).editions;
const sketch = fs.readFileSync(path.join(__dirname, 'sketch.js'), 'utf8');
const args = process.argv.slice(2);
const value = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const size = Number(value('--size', '2400'));
const outdir = path.resolve(value('--out', 'overgrowth-renders'));
const vertices = Array.from({length: 25}, (_, i) => [
  Math.cos(i * Math.PI * 2 / 25) / 2,
  Math.sin(i * Math.PI * 2 / 25) / 2
]);

// fxhash's original v1 base58/sfc32 snippet. Never substitute a fresh seed.
function fxRandom(hash) {
  const alphabet = '123456789abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
  if (!/^o[1-9A-HJ-NP-Za-km-z]{50}$/.test(hash)) throw Error('Invalid recorded fxhash');
  let [a, b, c, d] = hash.slice(2).match(/.{12}/g).map(str =>
    [...str].reduce((p, c) => (p * 58 + alphabet.indexOf(c)) | 0, 0)
  );
  return () => {
    a |= 0; b |= 0; c |= 0; d |= 0;
    const t = ((a + b | 0) + d) | 0;
    d = d + 1 | 0;
    a = b ^ b >>> 9;
    b = c + (c << 3) | 0;
    c = c << 21 | c >>> 11;
    c = c + t | 0;
    return (t >>> 0) / 4294967296;
  };
}

function render(edition, canvasAPI = null) {
  let randomState, frame = 0, completed = false, stopped = false, graphics = 0;
  let canvas, strokeCanvas;
  const noop = () => {};

  function createGraphics(w, h) {
    // pg is the finished 2400-unit artwork. pg3 only scales it for display.
    if (!canvasAPI || graphics++ > 0) return {
      fill: noop, rect: noop, noFill: noop, strokeWeight: noop,
      stroke: noop, pixelDensity: noop, image: noop
    };
    const {createCanvas, Path2D} = canvasAPI;
    canvas = createCanvas(size, size);
    strokeCanvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');
    const sc = strokeCanvas.getContext('2d');
    for (const c of [ctx, sc]) {
      c.scale(size / w, size / h);
      c.translate(w / 2, h / 2);
      c.lineJoin = 'bevel';
      c.lineCap = 'butt';
    }
    let shape, fill = '#fff', stroke = '#000', weight = 1;
    function paint() {
      if (fill !== null) { ctx.fillStyle = fill; ctx.fill(shape); }
      // p5 v1.4.1's line vertex shader brings strokes forward in depth.
      // With all sketch geometry at z=0, earlier strokes survive later fills.
      if (weight > 0) { sc.strokeStyle = stroke; sc.lineWidth = weight; sc.stroke(shape); }
    }
    return {
      pixelDensity: noop,
      fill(c) { fill = c; }, noFill() { fill = null; },
      stroke(c) { stroke = c; }, strokeWeight(w) { weight = w; },
      rect(x, y, w, h) { shape = new Path2D(); shape.rect(x, y, w, h); paint(); },
      bezier(x1, y1, x2, y2, x3, y3, x4, y4) {
        shape = new Path2D(); shape.moveTo(x1, y1);
        shape.bezierCurveTo(x2, y2, x3, y3, x4, y4); paint();
      },
      ellipse(x, y, w, h) {
        shape = new Path2D();
        // p5 WEBGL uses 25 segments for ellipses by default.
        vertices.forEach(([vx, vy], i) => {
          if (i === 0) shape.moveTo(x + vx * w, y + vy * h);
          else shape.lineTo(x + vx * w, y + vy * h);
        });
        shape.closePath(); paint();
      }
    };
  }

  const environment = {
    window: {}, windowWidth: 2400, windowHeight: 2400,
    WEBGL: 'webgl', RGB: 'rgb', BLEND: 'blend', min: Math.min, int: Math.trunc,
    fxrand: fxRandom(edition.generationHash),
    randomSeed(v) { randomState = v >>> 0; },
    random() {
      randomState = (1664525 * randomState + 1013904223) % 4294967296;
      return randomState / 4294967296;
    },
    createCanvas: noop, createGraphics, pixelDensity: noop, colorMode: noop,
    color(r, g, b) { return `rgb(${r},${g},${b})`; }, image: noop,
    fxpreview() { completed = true; }, noLoop() { stopped = true; },
    bezierPoint(a, b, c, d, t) {
      const mt = 1 - t;
      return mt * mt * mt * a + 3 * mt * mt * t * b + 3 * mt * t * t * c + t * t * t * d;
    }
  };
  vm.createContext(environment);
  vm.runInContext(sketch, environment, {filename: 'sketch.js'});
  environment.setup();
  const result = {
    number: edition.number,
    generationHash: edition.generationHash,
    seed: vm.runInContext('seed', environment),
    features: environment.window.$fxhashFeatures
  };
  if (!canvasAPI) return result;
  console.log(JSON.stringify(result));
  while (!stopped && frame < 180) {
    environment.draw(); frame++;
    if (frame % 30 === 0) console.log(`Edition ${edition.number}: frame ${frame}/179`);
  }
  if (!completed || frame !== 179) throw Error('Sketch did not reach fxpreview at frame 179');
  console.log('Compositing the fill and stroke layers…');
  const ctx = canvas.getContext('2d');
  ctx.resetTransform(); ctx.drawImage(strokeCanvas, 0, 0);
  const png = canvas.toBuffer('image/png');
  Object.assign(result, {
    frames: frame, dimensions: [size, size],
    renderer: '@napi-rs/canvas 0.1.100; CPU recovery; not pixel-identical to historical WebGL',
    sketchSha256: createHash('sha256').update(sketch).digest('hex'),
    pngSha256: createHash('sha256').update(png).digest('hex')
  });
  fs.mkdirSync(outdir, {recursive: true});
  fs.writeFileSync(path.join(outdir, `${edition.number}.png`), png);
  fs.writeFileSync(path.join(outdir, `${edition.number}.json`), JSON.stringify(result, null, 2) + '\n');
  return result;
}

// This verifies the supplied sketch's setup without any canvas dependency.
const known = editions.filter(e => e.recordedFeatures);
for (const edition of known) {
  const actual = render(edition).features;
  for (const [name, expected] of Object.entries(edition.recordedFeatures)) {
    if (actual[name] !== expected) throw Error(`Recorded trait mismatch: #${edition.number}, ${name}`);
  }
}
console.log(`Verified all four recorded traits for ${known.length} editions.`);
if (!args.includes('--verify-traits')) {
  if (!Number.isInteger(size) || size < 300 || size > 2400) throw Error('--size must be 300–2400');
  const edition = editions.find(e => e.number === Number(value('--edition', '5')));
  if (!edition) throw Error('Unknown edition');
  let canvasAPI;
  try { canvasAPI = require('@napi-rs/canvas'); }
  catch (error) {
    if (!process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES) throw error;
    canvasAPI = createRequire(path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES, 'package.json'))('@napi-rs/canvas');
  }
  console.log(JSON.stringify(render(edition, canvasAPI), null, 2));
}
