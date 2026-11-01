
(() => {
'use strict';

/* ======================================================================
   CONFIG
   ====================================================================== */
const Q = new URLSearchParams(location.search);
const HASH = ((location.hash || '').replace('#', '').split('&')[0] || '').toLowerCase();
const HQ = new URLSearchParams((location.hash || '').replace(/^#/, ''));   // (#seed=1234, #world=<code>: as they are written)
const num = (k, d) => { const v = parseFloat(Q.get(k)); return Number.isFinite(v) ? v : d; };
const CFG = {
  interval: num('interval', HASH === 'installation' ? 600 : HASH === 'fast' ? 1.5 : 2.5),
  kiosk: Q.get('kiosk') === '1' || Q.get('gallery') === '1' || HASH === 'kiosk' || HASH === 'installation' || HASH === 'gallery' || (() => { try { return localStorage.getItem('wr-gallery') === '1'; } catch (e) { return false; } })(),
  successor: num('successor', 15),          // seconds a world's account stays up, once it can be read
  regime: Q.get('regime'),
  seed: Q.has('seed') || HQ.has('seed') ? (parseInt(Q.get('seed') || HQ.get('seed'), 10) >>> 0) : null,
  grid: num('grid', 0),
  calib: Q.get('calib') === '1',
  solo: Q.get('solo'),
  pair: Q.get('pair'),
  every: num('every', 1800),
  maxSteps: num('maxsteps', 0),
  forceNat: num('forcenat', -1),
  ff: num('ff', 0),
  ffcap: Math.max(1, num('ffcap', 40)),   // development: fast-forward steps a frame (below 40, the world is read every frame)
  hud: Q.get('hud') || 'quiet',
  mats: Q.get('mats'),                   // development: force each nation's material, in order                      // development: fast-forward this many seconds of world time without drawing the screen
  headless: Q.get('headless') === '1',
  shot: Q.get('shot'),
  force: Q.get('force'),
  nations: num('nations', 0),
  natstates: Q.get('natstates'),
  pmax: Q.get('pmax') === '1',
  council: Q.get('council') !== '0',
  mode: Q.get('mode'), modeAt: num('modeat', 12),
  mind: Q.get('mind'),                   // 0: no mind, the old random councils; fresh: forget everything learned in this browser
  globe: Q.get('globe') === '1' || (Q.get('globe') !== '0' && (Q.get('swap') !== '0' || (() => { try { return localStorage.getItem('wr-view') !== 'flat'; } catch (e) { return true; } })())),   // the world as a turning ball: home (laid flat, as a map, now and then)
  kinds: Q.get('kinds'),                 // development: each nation's kind, in order (learner, rogue, still)
  fk: Q.get('fk'),
  sky: Q.get('sky'),                     // development: how much cloud, 0 to 1                       // development: every nation's feed and kill rates, 'f,k'
  layers: Q.get('layers'),               // development: the drawn layers' strengths, 'core,veins,strata,eddies'
  pool: Q.get('pool'),                   // development: 'all' puts all sixty rules in the urn
  decade: num('decade', 10),             // a report after every this many worlds
  reportS: num('reportsec', 30),
  holdS: num('holds', 14),              // how long black may spread before the world decides: held, or an end
  reloadH: num('reload', HASH === 'installation' || HASH === 'kiosk' || Q.get('kiosk') === '1' ? 8 : 0),   // hours after which the page reloads itself, between worlds (0: never)         // and it shows for this many seconds
};
var REPLAY = (Q.get('world') || HQ.get('world')) && !CFG.calib ? { raw: Q.get('world') || HQ.get('world'), done: false, live: false } : null;   // ?world=<code>: a world played again
let SEEDK = 0;                         // ?seed: the worlds of this visit, in order, from that seed
const SPS = 120;                       // simulation steps per second of world time
/* ======================================================================
   THE STAGE â€” the world heard, and its great moments shown, so that it can be followed without reading.
   The score is generated as the world runs (Web Audio, nothing recorded), with no drones. Each world has a key (five
   notes) and a slow round of four chords, four bars each, on its own beat (6/8, an eighth a quarter of a second), and
   all of it is heard in a long, dark hall, with a soft echo crossing from side to side. For every ball that lands, two
   bars of its rule's own tune over the chord of the moment, its strong beats and its close on tones of that chord, a
   second voice beneath, the chord's root deep below and the chord itself blooming softly under it, then fading (one bar
   in answer to a tune still sounding; one note in the first age, or when two are sounding). Each state rings in its
   own way, its overtone always in harmony with its note, and sounds from its own place, left to right. A soft pluck
   for every crossing and a muted, tuned knock for every rule held at a border; a faint glassy shimmer, in the key, as
   ice spreads; a low swell while the void spreads, and a swell of the key, rising, before a number breaks; a deep blow
   when a state falls; a cold chord when the void is held; a pulse through the twenty seconds after the last ball, and
   a bloom if the world wins. Every chord a moment calls for is taken into the world's key. When the world ends in NaN
   the sound stops dead: silence is the poison. Sound is opt-in: a click, or S; ?sound=1 tries to start it at once.
   The director: when black breaks out the view pushes in toward it and the rest of the world dims; a state that falls,
   a held breach, the last ball, a win and an end each get a title over the world; the last ball's twenty seconds are
   a ring that fills round the globe.
   ====================================================================== */
const STAGE = (() => {
  // ---------------------------------------------------------------- the score
  let ac = null, on = false, silent = false, master = null, dry = null, verb = null, echo = null, voices = [], world0 = null, nbuf = null, outNode = null, recDest = null;
  let dreadG = null, dreadLP = null, dreadO = [], nextBeat = 0, heatG = null, heatBP = null, rumbleG = null, shimmerG = null, shimO = [], pedal = null, pedalG = null, root = 55, scale = [0, 2, 4, 7, 9];
  let prog = null, clock0 = 0;
  const want = /[?&]sound=1/.test(location.search) || HASH === 'installation';
  const semi = n => Math.pow(2, n / 12);
  const hashId = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  function impulse(sec, pre = 0.03) {                                    // a long, dark hall: a soft onset, and its highs die first
    const sr = ac.sampleRate, len = Math.round(sr * sec), p0 = Math.round(sr * pre), b = ac.createBuffer(2, len, sr);
    for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); let y = 0, y2 = 0;
      for (let i = p0; i < len; i++) { const u = (i - p0) / (len - p0), a = 0.45 * (1 - u) * (1 - u) + 0.02;
        y += a * (Math.random() * 2 - 1 - y); y2 += a * (y - y2);
        d[i] = y2 * Math.exp(-5.5 * u) * (1 - Math.exp(-(i - p0) / (sr * 0.06))); } }
    return b; }
  function noise() { if (!nbuf) { nbuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate); const d = nbuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    const s = ac.createBufferSource(); s.buffer = nbuf; s.loop = true; return s; }
  function build() {
    const comp = ac.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 3; comp.connect(ac.destination); outNode = comp;
    master = ac.createGain(); master.gain.value = 0; master.connect(comp);
    verb = ac.createConvolver(); verb.buffer = impulse(7, 0.045); const wet = ac.createGain(); wet.gain.value = HALL.WET; verb.connect(wet); wet.connect(master);   // the hall
    dry = ac.createGain(); dry.gain.value = HALL.DRY; dry.connect(master);
    { const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 200; hp.Q.value = 0.5; dry.connect(hp); hp.connect(verb); }   // (the low notes stay out of the hall: no mud)
    { const L = ac.createDelay(2), R = ac.createDelay(2), fb = ac.createGain(), lp = ac.createBiquadFilter(), pl = ac.createStereoPanner(), pr = ac.createStereoPanner(), out = ac.createGain();
      echo = ac.createGain(); L.delayTime.value = 3 * E8; R.delayTime.value = 3 * E8; fb.gain.value = 0.32;  // the echo: a beat later on one side, a beat after that on the other, darker each time
      lp.type = 'lowpass'; lp.frequency.value = 2400; lp.Q.value = 0.5; pl.pan.value = -0.7; pr.pan.value = 0.7; out.gain.value = HALL.ECHO;
      echo.connect(lp); lp.connect(L); L.connect(pl); L.connect(R); R.connect(pr); R.connect(fb); fb.connect(lp); pl.connect(out); pr.connect(out); out.connect(master); out.connect(verb); }
    { const n = noise(), lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 85; lp.Q.value = 0.7; rumbleG = ac.createGain(); rumbleG.gain.value = 0;   // the void, spreading: a low swell
      n.connect(lp); lp.connect(rumbleG); rumbleG.connect(dry); n.start(); }
    heatG = null; heatBP = null;                                                                   // (heat is seen, not heard: no wind)
    { shimmerG = ac.createGain(); shimmerG.gain.value = 0; shimmerG.connect(verb); shimO = [];                                     // ice: three high harmonics of the key's root
      for (const [m, r] of [[16, 0.21], [24, 0.13], [32, 0.17]]) { const o = ac.createOscillator(), g = ac.createGain(), tr = ac.createOscillator(), tg = ac.createGain();
        o.type = 'sine'; o.frequency.value = root * m; g.gain.value = 0.3; tr.frequency.value = r * 10; tg.gain.value = 0.28; tr.connect(tg); tg.connect(g.gain); o.connect(g); g.connect(shimmerG); o.start(); tr.start(); shimO.push([o, m]); } }
    { dreadG = ac.createGain(); dreadG.gain.value = 0; dreadLP = ac.createBiquadFilter(); dreadLP.type = 'lowpass'; dreadLP.frequency.value = 140; dreadLP.Q.value = 5;   // dread: its heartbeat (thump)
      dreadLP.connect(dreadG); dreadG.connect(dry); }
    pedal = null; pedalG = null;                                                                   // (the last ball: a pulse, not a pedal: see soundTick)
  }
  const HALL = { DRY: 0.58, WET: 0.78, ECHO: 0.42 };
  // The harmony. A world goes round four chords, four bars each. Each chord: its root, kept low (b, in semitones from the
  // key's), and its tones (p), every one of them a note of the five-note key, the steadiest first, so that a tune can
  // always land on one and nothing in it rubs against the chord of the moment.
  const CHORDS = {
    maj: { I: { b: 0, p: [0, 7, 4, 2] }, ii: { b: 2, p: [9, 2, 0, 4] }, IV: { b: 5, p: [9, 0, 4, 7] }, V: { b: -5, p: [7, 2, 9, 4] }, vi: { b: -3, p: [9, 4, 0, 7] } },
    min: { i: { b: 0, p: [0, 7, 3, 10] }, iv: { b: 5, p: [5, 0, 3, 7] }, v: { b: -5, p: [7, 10, 5, 0] }, VI: { b: -4, p: [0, 3, 7, 10] }, III: { b: 3, p: [3, 10, 7, 5] }, VII: { b: -2, p: [10, 5, 0, 7] } } };
  const ROUNDS = { maj: [['I', 'vi', 'IV', 'V'], ['I', 'IV', 'vi', 'V'], ['I', 'V', 'vi', 'IV'], ['vi', 'IV', 'I', 'V'], ['I', 'ii', 'IV', 'I'], ['IV', 'I', 'V', 'vi']],
    min: [['i', 'VI', 'III', 'VII'], ['i', 'VII', 'VI', 'VII'], ['i', 'iv', 'VI', 'v'], ['VI', 'VII', 'i', 'i'], ['i', 'III', 'VII', 'VI'], ['i', 'VI', 'iv', 'v']] };
  const CHB = 4;                                                         // bars to a chord
  function key() { const r = mulberry(((W && W.seed) || 1) ^ 0x51ed1); root = [49, 55, 58.27, 65.41, 73.42][Math.floor(r() * 5)]; scale = r() < 0.5 ? [0, 2, 4, 7, 9] : [0, 3, 5, 7, 10];
    const md = scale[1] === 2 ? 'maj' : 'min', R = ROUNDS[md][Math.floor(r() * ROUNDS[md].length)];
    prog = R.map(c => CHORDS[md][c]); clock0 = ac ? ac.currentTime : 0;
    if (ac) for (const [o, m] of shimO) o.frequency.setValueAtTime(root * m, ac.currentTime); }
  const chordAt = t => prog[Math.floor(Math.max(0, t - clock0) / (CHB * 6 * E8)) % prog.length];
  function rebuildVoices() {
    if (!on || !W) return; const t = ac.currentTime;
    for (const v of voices) { v.g.gain.cancelScheduledValues(t); v.g.gain.setTargetAtTime(0, t, 0.6); for (const o of v.o) o.stop(t + 4); }
    voices = []; key();
    world0 = null; PH.ends = []; PH.pulse = 0;                         // (no drones: the world is heard in its tunes)
  }
  function startSound() {
    if (on) return;
    try { ac = ac || new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === 'suspended') ac.resume(); if (!master) build();
      on = true; silent = W && (W.phase === 'postmortem' || (W.phase === 'ended' && W.ended && W.ended.kind === 'black'));
      master.gain.cancelScheduledValues(ac.currentTime); master.gain.setTargetAtTime(silent ? 0 : 0.85, ac.currentTime, 1.4); rebuildVoices(); hint(false); document.body.classList.add('sound');
    } catch (e) { on = false; }
  }
  function stopSound() { if (!on) return; master.gain.setTargetAtTime(0, ac.currentTime, 0.3); on = false; document.body.classList.remove('sound'); }
  // A soft glass bell: its note, a twin a few cents above it (the two a little apart, left and right, so that it shimmers
  // in space), and one overtone, always a harmonic of the note, that fades first. es: how much of it goes to the echo.
  const HARM = [2, 3, 4, 1.5, 6], PANS = [-0.5, 0.5, -0.22, 0.28, 0.05];   // each state's overtone, and its place, left to right
  function glassAt(t, f, g, dec, ov = 2, pan = 0, att = 0.012, es = 0.3) {
    if (!on || silent) return;
    const e1 = ac.createGain(), e2 = ac.createGain(), p1 = ac.createStereoPanner(), p2 = ac.createStereoPanner(), o1 = ac.createOscillator(), o2 = ac.createOscillator(), o3 = ac.createOscillator(), g3 = ac.createGain();
    o1.frequency.value = f; o2.frequency.value = f; o2.detune.value = 6; o3.frequency.value = f * ov;
    g3.gain.setValueAtTime(0.16, t); g3.gain.exponentialRampToValueAtTime(0.002, t + Math.max(0.3, dec * 0.4));
    for (const [e, k] of [[e1, 1], [e2, 0.55]]) { e.gain.setValueAtTime(0.0001, t); e.gain.exponentialRampToValueAtTime(g * k, t + att); e.gain.exponentialRampToValueAtTime(0.0001, t + dec); }
    p1.pan.value = Math.max(-1, Math.min(1, pan - 0.2)); p2.pan.value = Math.max(-1, Math.min(1, pan + 0.2));
    o1.connect(e1); o3.connect(g3); g3.connect(e1); o2.connect(e2); e1.connect(p1); e2.connect(p2); p1.connect(dry); p2.connect(dry);
    if (es > 0) { const s = ac.createGain(); s.gain.value = es; p1.connect(s); p2.connect(s); s.connect(echo); }
    for (const o of [o1, o2, o3]) { o.start(t); o.stop(t + dec + 0.05); }
  }
  function bell(f, g = 0.05, dec = 3, bright = 2) { if (!on || silent) return; glassAt(ac.currentTime + 0.005, f, g * 0.8, dec, bright, (Math.random() - 0.5) * 0.5, 0.008, 0.25); }
  // A ball's two bars: its rule's own little tune (a rhythm and a line from its name, the same each time it is drawn), in
  // the world's five-note key, on the world's beat (6/8, an eighth a quarter of a second), its strong beats and its close
  // on tones of the chord of the moment, a second voice a chord tone beneath them, the chord's root deep below each bar,
  // and the chord blooming softly under it all. While one tune is sounding a new ball answers it with one bar; while two
  // are, or in the first age, one note.
  const E8 = 0.25, PH = { ends: [], pulse: 0, tick: 0, tk: 0 };
  const RHY = [[[0, 2], [2, 1], [3, 2], [5, 1], [6, 3], [9, 3]], [[0, 3], [3, 1], [4, 1], [5, 1], [6, 6]], [[0, 1], [1, 1], [2, 1], [3, 3], [6, 2], [8, 4]],
    [[0, 2], [2, 2], [4, 2], [6, 3], [9, 3]], [[0, 3], [3, 3], [6, 1], [7, 1], [8, 1], [9, 3]], [[0, 1], [2, 1], [3, 2], [5, 1], [6, 2], [8, 1], [9, 3]]];
  const pf = (i, base) => base * Math.pow(2, Math.floor(i / 5)) * semi(scale[((i % 5) + 5) % 5]);   // a step of the world's scale, counted from base
  const pcOf = i => (Math.floor(i / 5) * 12 + scale[((i % 5) + 5) % 5] + 1200) % 12;                 // its note, above the key's root
  const snapD = (d, p) => { for (const k of [0, -1, 1, -2, 2]) if (p.includes(pcOf(d + k))) return d + k; return d; };   // the nearest tone of the chord
  const landD = (d, ch) => { const s = ch.p.slice(0, 2); for (const k of [0, -1, 1, -2, 2, -3, 3]) if (s.includes(pcOf(d + k))) return d + k; return snapD(d, ch.p); };   // a close, on its steadiest tones
  const underD = (d, p) => { for (const k of [2, 3, 4]) if (p.includes(pcOf(d - k))) return d - k; return d - 2; };   // the second voice: a chord tone below
  const bassF = ch => root * 2 * semi(ch.b);
  function lowAt(t, f, g, dec) { if (!on || silent) return; const o = ac.createOscillator(), o2 = ac.createOscillator(), g2 = ac.createGain(), gg = ac.createGain(), lp = ac.createBiquadFilter();
    o.type = 'triangle'; o.frequency.value = f; o2.frequency.value = f / 2; g2.gain.value = 0.35; lp.type = 'lowpass'; lp.frequency.value = f * 2.5;   // the root, and an octave under it
    gg.gain.setValueAtTime(0.0001, t); gg.gain.exponentialRampToValueAtTime(g, t + 0.09); gg.gain.exponentialRampToValueAtTime(0.0001, t + dec);
    o.connect(lp); o2.connect(g2); g2.connect(lp); lp.connect(gg); gg.connect(dry); for (const x of [o, o2]) { x.start(t); x.stop(t + dec + 0.05); } }
  function padTone(t, t1, f, g, pan) {                                   // one tone of the bloom: it swells, holds, and fades, heard mostly in the hall
    const o = ac.createOscillator(), o2 = ac.createOscillator(), e = ac.createGain(), p = ac.createStereoPanner(), s = ac.createGain(), a = Math.min(1.4, (t1 - t) * 0.45);
    o.type = 'triangle'; o.frequency.value = f; o2.frequency.value = f; o2.detune.value = -5; p.pan.value = pan; s.gain.value = 0.3;
    e.gain.setValueAtTime(0.0001, t); e.gain.exponentialRampToValueAtTime(g, t + a); e.gain.setValueAtTime(g, Math.max(t + a, t1 - 0.3)); e.gain.exponentialRampToValueAtTime(0.0001, t1 + 1.2);
    o.connect(e); o2.connect(e); e.connect(p); p.connect(verb); p.connect(s); s.connect(dry); for (const x of [o, o2]) { x.start(t); x.stop(t1 + 1.3); } }
  function openV(ss, lo) {                                              // an open voicing: no two tones closer than a fourth, nothing muddy below lo (in semitones above base)
    const v = ss.slice().sort((x, y) => x - y); for (let i = 0; i < v.length; i++) { while (v[i] < lo) v[i] += 12; if (i && v[i] - v[i - 1] < 5) v[i] += 12; } return v; }
  function bloomUnder(t, t1) {                                           // the chord of each moment under a tune: its three steadiest tones, spread open
    const W8 = CHB * 6 * E8; let a = t;
    while (a < t1 - 0.3) { const b = Math.min(t1, clock0 + (Math.floor((a - clock0) / W8 + 1e-6) + 1) * W8), ch = chordAt(a + 0.01);
      openV(ch.p.slice(0, 3), 0).forEach((sm, i) => padTone(a, b, root * 4 * semi(sm), [0.0056, 0.0045, 0.0038][i], [-0.45, 0.45, 0][i]));
      a = b; } }
  function tune(def) {
    const r = mulberry(hashId(def.id) ^ 0x2545f491), R = RHY[Math.floor(r() * RHY.length)]; let d = 4 + Math.floor(r() * 5);
    const m = R.map(([at, len], k) => { if (k) d += [-2, -1, -1, 1, 1, 2][Math.floor(r() * 6)]; d = Math.max(2, Math.min(11, d)); return { at, len, d: d + 3 }; });   // (three steps up: bells above, the root far below)
    return m;
  }
  function phrase(def, nat, live) {
    if (!on || silent || !prog) return;
    const t0 = ac.currentTime; PH.ends = PH.ends.filter(e => e > t0); const busy = PH.ends.filter(e => e > t0 + 0.3).length;
    const i = nat ? nat.i % 5 : 0, ov = live ? 8 : HARM[i], pan = PANS[i], base = root * 4, g = live ? 0.06 : 0.05, m = tune(def);
    if (W.boost || busy >= 2) { glassAt(t0 + 0.005, pf(snapD(m[0].d, chordAt(t0).p), base), W.boost ? 0.024 : 0.034, 2.8, ov, pan, 0.012, 0.25); return; }
    const bars = busy ? 1 : 2, k = busy ? 0.75 : 1, t = clock0 + Math.ceil((t0 + 0.005 - clock0) / E8) * E8;   // on the world's beat (at most a quarter of a second after it lands)
    const notes = m.filter(n => n.at < bars * 6), z = notes[notes.length - 1];
    for (const n of notes) { const tn = t + n.at * E8, ch = chordAt(tn), len = Math.min(n.len, bars * 6 - n.at) * E8, strong = n.at % 3 === 0 || n === z;
      const d = n === z ? landD(n.d, ch) : strong ? snapD(n.d, ch.p) : n.d;
      glassAt(tn, pf(d, base), g * k * (n.at % 6 === 0 ? 1 : 0.8), len + (n === z ? 2.6 : ch.p.includes(pcOf(d)) ? 1.6 : 0.6), ov, pan, 0.012, 0.22);   // (a passing note, off the chord, is let go sooner)
      if (strong) glassAt(tn + 0.015, pf(underD(d, ch.p), base), g * k * 0.42, len + 2.2, ov === 2 ? 3 : 2, -pan * 0.6, 0.03, 0.08); }
    if (!busy) { for (let b = 0; b < bars; b++) { const tb = t + b * 6 * E8; lowAt(tb, bassF(chordAt(tb)), 0.04, 2.6); }
      bloomUnder(t, t + bars * 6 * E8); }
    PH.ends.push(t + bars * 6 * E8);
  }
  function pluck(f, g = 0.025, dec = 0.9, pan) { if (!on || silent) return; const t = ac.currentTime, o = ac.createOscillator(), gg = ac.createGain(), lp = ac.createBiquadFilter(), p = ac.createStereoPanner(), s = ac.createGain(); o.type = 'triangle'; o.frequency.value = f;
    lp.type = 'lowpass'; lp.frequency.setValueAtTime(f * 6, t); lp.frequency.exponentialRampToValueAtTime(f * 1.2, t + dec); gg.gain.setValueAtTime(0.0001, t); gg.gain.exponentialRampToValueAtTime(g, t + 0.005); gg.gain.exponentialRampToValueAtTime(0.0001, t + dec);
    p.pan.value = pan != null ? pan : (Math.random() - 0.5) * 0.8; s.gain.value = 0.3; o.connect(lp); lp.connect(gg); gg.connect(p); p.connect(dry); p.connect(s); s.connect(echo); o.start(t); o.stop(t + dec + 0.1); }
  const chordTone = (f0) => prog ? f0 * semi(chordAt(ac.currentTime).p[Math.floor(Math.random() * 4)]) : f0 * semi(scale[Math.floor(Math.random() * 5)]);
  function knock(g = 0.05) { if (!on || silent) return; const t = ac.currentTime, f = root * 4 * semi(7), o = ac.createOscillator(), og = ac.createGain();   // a soft wooden knock, tuned to the key's fifth
    o.type = 'sine'; o.frequency.setValueAtTime(f * 2, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.05);
    og.gain.setValueAtTime(0.0001, t); og.gain.exponentialRampToValueAtTime(g * 0.42, t + 0.008); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.24); o.connect(og); og.connect(dry); o.start(t); o.stop(t + 0.3);
    const n = noise(), bp = ac.createBiquadFilter(), gg = ac.createGain(); gg.gain.value = 0; bp.type = 'bandpass'; bp.frequency.value = f * 2; bp.Q.value = 5;
    gg.gain.setValueAtTime(g * 0.45, t); gg.gain.exponentialRampToValueAtTime(0.0001, t + 0.12); n.connect(bp); bp.connect(gg); gg.connect(dry); n.start(t); n.stop(t + 0.2); }
  function boom(g = 0.45) { if (!on || silent) return; const t = ac.currentTime, o = ac.createOscillator(), gg = ac.createGain(); o.frequency.setValueAtTime(root, t); o.frequency.exponentialRampToValueAtTime(root * 0.5, t + 1.8);   // down an octave, from the key's root
    gg.gain.setValueAtTime(g, t); gg.gain.exponentialRampToValueAtTime(0.0001, t + 2.8); o.connect(gg); gg.connect(dry); o.start(t); o.stop(t + 3);
    const n = noise(), lp = ac.createBiquadFilter(), ng = ac.createGain(); ng.gain.value = 0; lp.type = 'lowpass'; lp.frequency.setValueAtTime(700, t); lp.frequency.exponentialRampToValueAtTime(60, t + 1.4);
    ng.gain.setValueAtTime(g * 0.35, t); ng.gain.exponentialRampToValueAtTime(0.0001, t + 1.5); n.connect(lp); lp.connect(ng); ng.connect(dry); n.start(t); n.stop(t + 1.6); }
  function tick(t0, k, i) {                                              // a clock in the key: tick on the fifth, tock on the root, louder as the end nears, close and dry
    const f = root * 16 * semi(i % 2 ? 0 : 7), a = 0.018 + 0.05 * k, o = ac.createOscillator(), g = ac.createGain(), p = ac.createStereoPanner(), n = noise(), hp = ac.createBiquadFilter(), ng = ac.createGain();
    o.type = 'triangle'; o.frequency.value = f; p.pan.value = i % 2 ? 0.22 : -0.22; hp.type = 'highpass'; hp.frequency.value = 3200; g.gain.value = 0; ng.gain.value = 0;
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(a, t0 + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.07);
    ng.gain.setValueAtTime(a * 0.35, t0); ng.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.014);
    o.connect(g); g.connect(p); n.connect(hp); hp.connect(ng); ng.connect(p); p.connect(master);
    o.start(t0); o.stop(t0 + 0.08); n.start(t0); n.stop(t0 + 0.02);
    if (k > 0.35 && i % 4 === 1) thump(t0, 0.04 + 0.08 * k);              // (and, as it nears, a low beat under every other tock)
  }
  function thump(t0, g) { const o = ac.createOscillator(), gg = ac.createGain(); o.frequency.setValueAtTime(62, t0); o.frequency.exponentialRampToValueAtTime(36, t0 + 0.22);
    gg.gain.setValueAtTime(0.0001, t0); gg.gain.exponentialRampToValueAtTime(g, t0 + 0.012); gg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.32); o.connect(gg); gg.connect(dry); o.start(t0); o.stop(t0 + 0.36); }
  function crack(g = 0.18) { if (!on || silent) return; const t = ac.currentTime;
    for (let k = 0; k < 5; k++) { const n = noise(), hp = ac.createBiquadFilter(), ng = ac.createGain(), t1 = t + k * 0.035 + Math.random() * 0.02; ng.gain.value = 0; hp.type = 'highpass'; hp.frequency.value = 2200 + 2500 * Math.random();
      ng.gain.setValueAtTime(g * 0.6 * (1 - k * 0.15), t1); ng.gain.exponentialRampToValueAtTime(0.0001, t1 + 0.09 + 0.05 * k); n.connect(hp); hp.connect(ng); ng.connect(dry); n.start(t1); n.stop(t1 + 0.2); } }
  // Every chord a moment calls for is taken into the world's key: its third the key's own, no seconds rubbing, no tritone.
  // (raw: an ending's own chord, played as written, when nothing else is sounding.) Each tone has a twin a few cents
  // above it, and the tones spread from left to right.
  const third = () => scale.includes(4) ? 4 : 3, sev = () => scale.includes(10) ? 10 : 11;
  function fitS(s) { const o = Math.floor(s / 12), p = s - o * 12;
    return o * 12 + (p === 1 ? 2 : p === 3 || p === 4 ? third() : p === 6 ? 7 : p === 8 ? (scale.includes(9) ? 9 : 8) : p === 10 || p === 11 ? sev() : p); }
  function chord(ratios, type = 'triangle', g = 0.03, sec = 6, f0 = root * 2, raw = false) { if (!on || silent) return; const t = ac.currentTime, n = ratios.length;
    if (type === 'sawtooth') type = 'triangle';
    ratios.forEach((r, i) => { let sm = raw ? 12 * Math.log2(r) : fitS(Math.round(12 * Math.log2(r)));
      { const q = ((Math.round(sm) % 12) + 12) % 12; if ((q === 2 || q === 3 || q === 4) && f0 * semi(sm) < 260) sm += 12; }   // (a second or a third low down is muddy: an octave up, open)
      const f = f0 * semi(sm), o = ac.createOscillator(), o2 = ac.createOscillator(), gg = ac.createGain(), g2 = ac.createGain(), p = ac.createStereoPanner();
      o.type = type; o.frequency.value = f; o2.frequency.value = f; o2.detune.value = 5; g2.gain.value = 0.5; p.pan.value = n > 1 ? -0.5 + i / (n - 1) : 0;
      gg.gain.setValueAtTime(0.0001, t); gg.gain.exponentialRampToValueAtTime(g * 0.75, t + sec * 0.3); gg.gain.exponentialRampToValueAtTime(0.0001, t + sec);
      o.connect(gg); o2.connect(g2); g2.connect(gg); gg.connect(p); p.connect(dry); o.start(t); o2.start(t); o.stop(t + sec + 0.1); o2.stop(t + sec + 0.1); }); }
  function fanfare() {                                                   // the world wins: its major chord over the root, deep; bells climb two octaves and scatter back down; the chord again, an octave up, as the gold spreads
    if (!on || silent) return; const t = ac.currentTime + 0.02, wn = W;
    chord([1, 1.26, 1.498, 2, 2.52], 'triangle', 0.04, 11, root * 2, true);
    lowAt(t, root, 0.05, 7);
    [0, 4, 7, 12, 16, 19, 24].forEach((sm, i) => glassAt(t + 0.04 + i * 0.13, root * 8 * semi(sm), 0.052 - i * 0.003, 4.4, 2, -0.6 + i * 0.2, 0.008, 0.3));
    [28, 24, 19, 16, 12, 7].forEach((sm, i) => glassAt(t + 1.3 + i * 0.11, root * 8 * semi(sm), 0.022, 3.4, 2, 0.6 - i * 0.24, 0.006, 0.35));
    setTimeout(() => { if (W === wn && on && !silent) chord([1, 1.26, 1.498, 2], 'sine', 0.022, 8, root * 4, true); }, 2400);
  }
  function remember(list) {                                             // a state taken over, under the win: two soft notes falling from where its land was (a fourth over the chord, left hanging)
    if (!on || silent) return; const t = ac.currentTime + 0.02;
    list.slice(0, 2).forEach((n, i) => { const q = worldToScreen(n.cap), pan = q ? Math.max(-0.7, Math.min(0.7, q[0] / innerWidth * 2 - 1)) : 0, t1 = t + i * 1.1;
      glassAt(t1, root * 4 * semi(fitS(7)), 0.019, 3.4, 2, pan, 0.03, 0.5); glassAt(t1 + 0.46, root * 4 * semi(fitS(5)), 0.016, 4.8, 2, pan, 0.03, 0.55); });
  }
  let holdAt = 0;
  function holdChime(k = 1, pan = 0) {                                   // a rule turned back at a border: it comes on, meets a pane of cold glass, and is sent back
    if (!on || silent) return; const t = ac.currentTime + 0.01; if (t - holdAt < 0.45) return; holdAt = t;
    const f = root * 8 * semi(prog ? chordAt(t).p[1] : 7);              // (a steady tone of the chord of the moment)
    { const o = ac.createOscillator(), g = ac.createGain(), p = ac.createStereoPanner(); o.frequency.setValueAtTime(f * 0.5, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.09);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.026 * k, t + 0.08); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12); p.pan.value = pan; o.connect(g); g.connect(p); p.connect(dry); o.start(t); o.stop(t + 0.14); }
    glassAt(t + 0.09, f, 0.072 * k, 2.0, 3, pan, 0.003, 0.35);          // the pane rings, cold
    glassAt(t + 0.09, f * 1.5, 0.038 * k, 1.5, 2, pan * 0.7, 0.003, 0.3);
    { const o = ac.createOscillator(), g = ac.createGain(), p = ac.createStereoPanner(); o.type = 'triangle'; o.frequency.setValueAtTime(f, t + 0.1); o.frequency.exponentialRampToValueAtTime(f * 0.5, t + 0.44);   // and back it goes
      g.gain.setValueAtTime(0.0001, t + 0.1); g.gain.exponentialRampToValueAtTime(0.022 * k, t + 0.115); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.46); p.pan.value = -pan * 0.5; o.connect(g); g.connect(p); p.connect(dry); o.start(t + 0.1); o.stop(t + 0.48); }
  }
  function impact() {                                                    // a number breaks: a deep blow from the key's root, a dark open chord through the hall, and shards of glass in the key, falling
    if (!on || silent) return; const t = ac.currentTime;
    { const o = ac.createOscillator(), g = ac.createGain(); o.frequency.setValueAtTime(root * 1.5, t); o.frequency.exponentialRampToValueAtTime(root * 0.5, t + 2.6);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.3, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + 3.6); o.connect(g); g.connect(dry); o.start(t); o.stop(t + 3.7); }
    { const n = noise(), lp = ac.createBiquadFilter(), ng = ac.createGain(); ng.gain.value = 0; lp.type = 'lowpass'; lp.frequency.setValueAtTime(900, t); lp.frequency.exponentialRampToValueAtTime(50, t + 1.6);
      ng.gain.setValueAtTime(0.08, t); ng.gain.exponentialRampToValueAtTime(0.0001, t + 1.7); n.connect(lp); lp.connect(ng); ng.connect(dry); n.start(t); n.stop(t + 1.8); }
    [0, 7, 12].forEach((sm, i) => { const o = ac.createOscillator(), g = ac.createGain(), lp = ac.createBiquadFilter(), p = ac.createStereoPanner();
      o.type = 'triangle'; o.frequency.value = root * 2 * semi(sm); lp.type = 'lowpass'; lp.frequency.setValueAtTime(800, t); lp.frequency.exponentialRampToValueAtTime(220, t + 1.8); p.pan.value = [-0.45, 0.45, 0][i];
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.048, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + 3.4); o.connect(lp); lp.connect(g); g.connect(p); p.connect(dry); o.start(t); o.stop(t + 3.5); });
    [24, 19, 16, 12, 7, 4, 0].forEach((sm, i) => glassAt(t + 0.03 + i * 0.05, root * 8 * semi(fitS(sm)), 0.017 - i * 0.0012, 0.9 + i * 0.12, 3, (i % 2 ? 1 : -1) * (0.25 + 0.08 * i), 0.003, 0.4));   // (the shards: in the key, falling)
  }
  function silence() { silent = true; if (!on) return; const t = ac.currentTime; master.gain.cancelScheduledValues(t); master.gain.setValueAtTime(master.gain.value, t); master.gain.linearRampToValueAtTime(0, t + 0.12); }
  function unsilence() { silent = false; if (!on) return; const t = ac.currentTime; master.gain.cancelScheduledValues(t); master.gain.setTargetAtTime(0.85, t, 2); }
  function soundTick() {
    if (FX.slowEnd && FX.slowEnd.w === W && W.phase !== 'alive') return;                        // the end winds the score down by itself
    if (!on || !W) return; const t = ac.currentTime, st = W.stats || {}, live = W.phase === 'alive' || W.phase === 'dying';
    for (const v of voices) {                                            // (none now: kept for an old voice still fading)
      let g = 0, cut = 240;
      if (!v.n) { g = live ? 0.05 : W.phase === 'ended' && W.ended && W.ended.kind !== 'black' ? 0.035 : 0; cut = 180; }
      else if (v.n.alive && live) { const share = W.nations.length > 1 ? v.n.share || 0 : 1, life = st.life || 0.3; g = 0.012 + 0.028 * Math.min(1, share * 2.2); cut = 220 + 1500 * Math.min(1, life * 1.6) * (0.4 + share);
        if (loudB() && (v.n.voidShare || 0) > 0.05) { g *= 0.7; cut *= 0.6; } }
      cut *= 1 - 0.55 * smooth01(0.7, 1.2, HEAT.on ? W.heat || 0 : 0);          // the heat thins every voice
      v.g.gain.setTargetAtTime(g, t, 1.2); v.lp.frequency.setTargetAtTime(cut, t, 1.5);
      const det = loudB() ? 14 + 30 * Math.min(1, st.void * 3) : 0; v.o[1] && v.o[1].detune.setTargetAtTime(det, t, 1);
    }
    rumbleG.gain.setTargetAtTime(loudB() ? 0.015 + 0.06 * Math.min(1, (st.void || 0) * 2.5) : 0, t, loudB() ? 0.8 : 1.6);   // the void: a low swell, not a roar
    shimmerG.gain.setTargetAtTime(Math.max(0, Math.min(0.018, ((st.frost || 0) - 0.04) * 0.05)), t, 2);
    { const d = FX.dread;
      if (live && d > 0.25 && !silent) { if (nextBeat < t) nextBeat = t + 0.05;                  // a heartbeat, quickening
        while (nextBeat < t + 0.4) { thump(nextBeat, 0.1 * d); thump(nextBeat + 0.2, 0.055 * d); nextBeat += 1 / (0.85 + 1.1 * d); } } }
    { const k = live && W.phase === 'alive' && (W.heat || 0) >= 0.99 ? wearK() : 0;   // the last ten seconds of wearing out: a clock, ticking faster (it stops when the heat breaks)
      if (k > 0.02 && !silent) { if (PH.tick < t) PH.tick = t + 0.05;
        while (PH.tick < t + 0.3) { tick(PH.tick, k, ++PH.tk); PH.tick += 1 / (1.1 + 5 * k * k); } } else PH.tick = 0; }
    if (W.lastBallAt && W.phase === 'alive' && !silent) { const k = Math.min(1, (simT() - W.lastBallAt) / 20);   // the last ball's twenty seconds: a soft pulse on the root, a bar apart, growing
      if (PH.pulse < t) PH.pulse = t + 0.1;
      while (PH.pulse < t + 0.5) { glassAt(PH.pulse, root * 4, 0.01 + 0.02 * k, 1.8, 2, 0, 0.02, 0.25); if (k > 0.5) glassAt(PH.pulse + 3 * E8, root * 4 * semi(7), 0.006 + 0.011 * k, 1.5, 2, 0, 0.02, 0.25); PH.pulse += 6 * E8; } }
  }
  function hint(show) { const h = document.getElementById('snd'); if (!h) return; h.classList.toggle('on', !!show && !on); clearTimeout(hint.t); if (show) hint.t = setTimeout(() => h.classList.remove('on'), 6000); }

  // ---------------------------------------------------------------- the director
  let z = 1, fx = 0.5, fy = 0.5, tz = 1, tfx = 0.5, tfy = 0.5, until = 0, dimK = 0, tDim = 0, applied = '', cen = false, cenK = 0;   // cen: a cut frames its subject
  let track = null;                                                     // the place a focus follows as the world turns under it
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const moving = () => [canvas, el.flows, document.getElementById('nat-labels')].filter(Boolean);
  function focusAt(xy, zoom, secs, dark, wp) { if (!xy || CFG.calib) return; tfx = Math.max(0.2, Math.min(0.8, xy[0] / innerWidth)); tfy = Math.max(0.2, Math.min(0.8, xy[1] / innerHeight));
    tz = reduce ? 1 : zoom; tDim = dark; until = performance.now() + secs * 1000; cen = false; track = wp || null; }   // wp: the place in the world, followed
  const g2w = o => o ? [(o[0] + 0.5 - state.gw / 2) / (state.gh / 2), (o[1] + 0.5 - state.gh / 2) / (state.gh / 2)] : null;
  const gridToScreen = o => o ? worldToScreen([(o[0] + 0.5 - state.gw / 2) / (state.gh / 2), (o[1] + 0.5 - state.gh / 2) / (state.gh / 2)]) : null;
  function say(kicker, line, cls = '', secs = 5, prio = 50, pos = null) {
    if (CFG.calib) return false; const box = document.getElementById('stage-title'); if (!box) return false;
    if (!VOIDSEEN.v && (cls === 'pact' || (cls === 'heat' && prio < 80))) return false;   // (until the void has been seen here, the Accord and the calls to slow down keep to the ticker)
    const now = performance.now(); if (now < (say.until || 0) && prio < (say.prio || 0)) return false;   // a lesser moment does not talk over a greater
    say.until = now + secs * 1000; say.prio = prio;
    { const tk = document.getElementById('ticker'); if (tk) tk.classList.remove('show'); }
    if (prio >= 80 && el.law) el.law.classList.remove('show');
    BEAT.last = now; BEAT.gap = 12000 + Math.random() * 5000;                                          // every moment on the stage is a beat
    box.className = 'hud ' + cls; box.innerHTML = `<div class="k">${kicker}</div><div class="l">${line}</div>`;
    try { say.last = { k: box.querySelector('.k').textContent, l: box.querySelector('.l').textContent, t0: now, t1: now + secs * 1000 }; } catch (e) {}
    if (pos) { const up = pos[1] > innerHeight * 0.52, x = Math.max(innerWidth * 0.26, Math.min(innerWidth * 0.74, pos[0]));   // a local moment: titled beside the place
      const lbp = innerHeight > innerWidth ? innerHeight * 0.075 : Math.min(innerHeight * 0.11, Math.max(innerHeight * 0.05, (innerHeight - innerWidth / 2.35) / 2));   // the letterbox, should it come
      let y = up ? Math.max(innerHeight * 0.3, pos[1] - innerHeight * 0.06) : Math.min(innerHeight * 0.72, pos[1] + innerHeight * 0.12);
      y = up ? Math.max(y, lbp + innerHeight * 0.17) : Math.max(y, lbp + innerHeight * 0.03); y = Math.min(y, innerHeight - lbp - innerHeight * (up ? 0.04 : 0.17));
      box.classList.add('near'); if (up) box.classList.add('above'); box.style.left = x + 'px'; box.style.top = y + 'px'; }
    else { const gx = CFG.globe ? globeGeo()[0] * innerWidth / canvas.width : innerWidth / 2; box.style.left = gx + 'px'; box.style.top = ''; }
    { const k = inkFor(box, 0); box.classList.toggle('ink', !!k); }                               // ink over pale ground
    const pmEl = document.getElementById('pm'); if (pmEl) pmEl.classList.add('under');             // a page of words steps aside while the stage speaks
    requestAnimationFrame(() => { box.classList.add('on');                                          // (where it would run into the readouts, they step back while it is up)
      try { const a = box.getBoundingClientRect(), hit = e => { if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 0 && a.left < r.right + 14 && a.right > r.left - 14 && a.top < r.bottom + 6 && a.bottom > r.top - 6; };
        document.body.classList.toggle('mastunder', hit(document.querySelector('#mast .meta'))); document.body.classList.toggle('urnunder', hit(document.querySelector('#urn .lbl'))); TICK.trect = a; } catch (e) {} });
    TICK.tuntil = now + secs * 1000; clearTimeout(say.t); say.t = setTimeout(() => { box.classList.remove('on'); document.body.classList.remove('mastunder', 'urnunder'); TICK.trect = null; if (pmEl) pmEl.classList.remove('under'); }, secs * 1000);
    return true;
  }
  // ---------------------------------------------------------------- the beats: something worth looking at every quarter minute
  const BEAT = { last: 0, gap: 14000, q: [], kinds: [], hungry: false, said: new Set(), w: null };
  const BEAT_SCORE = { defer: 6.4, eased: 5.4,  count: 10, ban: 7.5, seal: 7, worn: 6.5, giveback: 6.2, held: 6, dial: 5, squeeze: 5, bloom: 4.5, cross: 4, turn: 3.5, draw: 3, call: 2.2 };
  const FRAME = {                                                       // how each kind of moment is shown: zoom, how far the rest dims, titled beside it
    draw: { z: 1.15, d: 0.32, near: 1 }, dial: { z: 1.12, d: 0.3, near: 1 }, seal: { z: 1.1, d: 0.34, near: 1 }, worn: { z: 1.1, d: 0.34, near: 1 }, ban: { z: 1.08, d: 0.3, near: 1, s: 4.6 }, giveback: { z: 1.08, d: 0.28, near: 1, s: 4.6 }, held: { z: 1.08, d: 0.4, near: 1 }, cross: { z: 1.04, d: 0.16, near: 1 },
    turn: { z: 1, d: 0.06, near: 1, s: 4.4 }, bloom: { z: 1.05, d: 0.12, near: 1, s: 4.8 }, call: { z: 1.03, d: 0.12, near: 1, s: 3.4 },
    squeeze: { z: 1, d: 0.24, near: 0, s: 4.2 }, count: { z: 1, d: 0, near: 0 }, defer: { z: 1.08, d: 0.28, near: 1, s: 4.8 }, eased: { z: 1.06, d: 0.24, near: 1, s: 4.4 } };
  function offer(kind, o) {
    if (CFG.calib || !W || W.phase !== 'alive') return;
    if (BEAT.w !== W) { BEAT.w = W; BEAT.q = []; BEAT.said = new Set(); BEAT.last = performance.now(); }
    o.kind = kind; o.at = performance.now(); o.score = (BEAT_SCORE[kind] || 2) + (o.bonus || 0);
    BEAT.q.push(o); if (BEAT.q.length > 24) BEAT.q.shift();
    if (BEAT.hungry || kind === 'count') beatTick();
  }
  function beatTick() {
    if (CFG.calib || !W || W.phase !== 'alive' || document.body.classList.contains('reporting')) return;
    if (performance.now() - (W.born || 0) < 13000) return;                                             // the opening is the world's own
    const now = performance.now(); BEAT.q = BEAT.q.filter(o => now - o.at < (o.kind === 'count' ? 15000 : 7000) && (!o.n || o.n.alive));
    const count = BEAT.q.find(o => o.kind === 'count');
    if (now - BEAT.last < (count ? 4200 : BEAT.gap)) return;                                          // a count may come sooner, never on top of another moment
    if (now < (say.until || 0)) return;                                                                 // something is being said already
    const thr = W.thr && !W.thr.done && now - BEAT.last < 26000 ? W.thr.n : null;   // a sequence being followed: lesser moments elsewhere wait (for a while)
    const pool = thr ? BEAT.q.filter(o => o.kind === 'count' || o.score >= 6.5 || o.n === thr || o.to === thr || o.from === thr) : BEAT.q;
    if (!pool.length) { BEAT.hungry = true; return; }
    const val = o => o.score - [4, 2.2, 1.2, 0.6].reduce((a, p, i) => a + (BEAT.kinds[i] === o.kind ? p : 0), 0) - (now - o.at) / 3000;   // the highlights take turns
    const best = count || pool.reduce((a, o) => val(o) > val(a) ? o : a);
    BEAT.q = BEAT.q.filter(o => o !== best); BEAT.hungry = false;
    if (stageBeat(best)) { BEAT.kinds.unshift(best.kind); BEAT.kinds.length = 4; }
  }
  // ---------------------------------------------------------------- the cinematic moments
  const CINE = { until: 0 };
  function cutTo(xy, zoom, secs, dark, wp) { if (!xy || CFG.calib) return; focusAt(xy, zoom, secs, dark, wp); if (reduce) return; z = tz; fx = tfx; fy = tfy; dimK = tDim; cen = true; cenK = 1; }   // a cut, framed (made beneath a soft cut)
  function caption(text, cls, secs) { const c = document.getElementById('shot-cap'); if (!c) return; c.className = cls || ''; c.textContent = text;
    requestAnimationFrame(() => c.classList.add('on')); clearTimeout(caption.t); caption.t = setTimeout(() => c.classList.remove('on'), secs * 1000); }
  function cineTick() {
    const now = performance.now(), b = document.body.classList;
    const want = !CFG.calib && W && ((FX.omen && !FX.omen.fz) || loudB() || (W.phase === 'postmortem' && now < (W.endPmAt || 0)) || (FX.slowEnd && FX.slowEnd.w === W && now < (W.endPmAt || Infinity)));
    if (want) CINE.until = now + 1400;
    const on = now < CINE.until && !b.contains('reporting'); if (on !== b.contains('cine')) b.toggle('cine', on);
  }
  function coverList(src) { const al = aliveNations().filter(n => n !== src && n.defence && !n.defence.already);   // who to cut to: a seal in time, then one too late
    const ok = al.filter(n => n.defence.ok && n.defence.done), late = al.filter(n => !n.defence.ok);
    return ok.length && late.length ? [ok[0], late[0]] : ok.length ? ok.slice(0, 2) : late.slice(0, 2); }
  function coverShot(wn, k) {
    if (W !== wn || !FX.omen || FX.omen.fired || FX.omen.fz || !W.breach) return;
    const src = W.breach.where, n = coverList(src)[k]; if (!n) return;
    const m = src ? mid(n.cap, src.cap) : n.cap;
    softCut(() => { if (SEEN.on && CFG.globe) bcamAt(m, true); cutTo(worldToScreen(m), 1.55, 1.0, 0.42, m); });
    caption(`${n.name} Â· watch ${n.defence.w0 != null ? n.defence.w0 : n.measures.surveillance} Â· ${n.defence.ok ? 'border sealed' : 'too late'}`, n.defence.ok ? '' : 'late', 0.8);
  }
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  function stageBeat(o) {
    const nm = n => esc(n.name), sec = 3.8;
    let k = '', l = '', at = null, who = [], cls = '';
    if (o.kind === 'draw') { k = `${nm(o.n)} Â· draw ${pad2(o.no)}`; l = `<i>${esc(o.rule)}</i>`; at = o.site; who = [o.n]; }
    else if (o.kind === 'cross') { k = `${nm(o.from)} â†’ ${nm(o.to)}`; l = `<i>${esc(o.rule)}</i> crosses the border`; at = mid(o.from.cap, o.to.cap); who = [o.from, o.to]; }
    else if (o.kind === 'held') { k = `${nm(o.to)} Â· ${esc(o.why)}`; l = `<i>${esc(o.rule)}</i> held at the border`; at = mid(o.from.cap, o.to.cap); who = [o.to]; cls = 'cold'; }
    else if (o.kind === 'dial') { k = `${nm(o.n)}â€™s mind`; l = `${o.to > o.from ? 'raises' : 'lowers'} <i>${esc(MEASURES[o.k].name.toLowerCase())}</i> ${Math.abs(o.to - o.from) > 1 ? 'toward' : 'to'} ${o.to}`; at = o.n.cap; who = [o.n]; }
    else if (o.kind === 'ban') { if (!o.n.alive || !signer(o.n)) return false; k = `${nm(o.n)} Â· one rule from ${esc(o.poison)}`; l = `The Ban <i>holds</i>`; at = o.n.cap; who = [o.n]; cls = 'pact'; }
    else if (o.kind === 'giveback') { if (!o.n.alive) return false; k = `World ${pad2(W.n)}${o.n.alarmFrom ? ` Â· raised when the void broke out in ${esc(o.n.alarmFrom)}` : ''}${o.fz ? ` Â· ${o.fz}% of its land frozen` : ''} Â· a point at a time`; l = `<i>${nm(o.n)}</i> gives back the watch <i>that saved it</i>`; at = o.n.cap; who = [o.n]; cls = 'cold'; }
    else if (o.kind === 'worn') { if (!o.n.alive) return false; k = `${nm(o.n)} Â· a worn law breaks: ${esc(FRAG_SAY[o.ty] || '')}${o.sharp ? ' Â· its watch knew where to look' : o.blind ? ` Â· its watch was looking for ${esc(o.blind)}` : ''}`; l = `<i>${nm(o.n)}</i> had enough <i>${esc(o.what)}</i>`; at = o.site || o.n.cap; who = [o.n]; cls = 'cold'; }
    else if (o.kind === 'seal') { k = `${nm(o.n)} Â· the void is out`; l = `seals its border <i>in time</i>`; at = o.n.cap; who = [o.n]; cls = 'cold'; }
    else if (o.kind === 'turn') { k = o.rule ? `${nm(o.n)} Â· ${esc(o.rule)} lands` : nm(o.n); l = (BEAT.turns = (BEAT.turns || 0) + 1) % 2 ? `its ground turns to <i>${esc(o.name)}</i>` : `the ground shifts: <i>${esc(o.name)}</i>`; at = o.at || o.n.cap; who = [o.n]; }
    else if (o.kind === 'bloom') { k = o.rule ? `${nm(o.n)} Â· ${esc(o.rule)} lands` : `${nm(o.n)} Â· a new start`; l = `blooms anew, as <i>${esc(o.name)}</i>`; at = o.at || o.n.cap; who = [o.n]; }
    else if (o.kind === 'call') { if (!W.heat || W.heat < 0.5 || !VOIDSEEN.v) return false; k = `heat ${W.heat.toFixed(2)} Â· the ${ordOf(o.k)} call to slow down`;
      l = o.how === 'tighten' ? `The Cap tightens: <i>restraint ${o.level}</i>` : o.how === 'ignored' ? `<i>${nm(o.n)}</i> ignores the call` : `<i>${nm(o.n)}</i>â€™s people ask for <i>restraint ${o.level}</i>`;
      at = o.n ? o.n.cap : null; who = o.n ? [o.n] : []; }
    else if (o.kind === 'squeeze') { k = `${nm(o.n)} Â· ${o.pct}% of the world`; l = o.gain ? `<i>${nm(o.n)}</i> gains ground` : `<i>${nm(o.n)}</i> is squeezed`; at = o.n.cap; who = [o.n]; }
    else if (o.kind === 'defer') { if (!o.n.alive) return false; W.deferSaid = true; k = `${nm(o.n)} remembers ${esc(o.poison)} as poison`; l = `<i>${nm(o.n)}</i> saves <i>${esc(o.rule)}</i> for last`; at = o.n.cap; who = [o.n]; cls = 'cold'; }
    else if (o.kind === 'eased') { if (!o.n.alive) return false; k = `${nm(o.n)} Â· watch ${o.from} to ${o.w}, a point at a time`; l = `<i>${nm(o.n)}</i> is back to the watch <i>it kept before</i>`; at = o.n.cap; who = [o.n]; cls = 'cold'; }
    else if (o.kind === 'count') { if (W.urnClosed || !o.n || !o.n.alive || urnLeft(o.n) !== o.left) return false;   // stale by now: say nothing
      k = W.nations.length > 1 ? `World ${pad2(W.n)} Â· ${nm(o.n)}â€™s urn${o.put ? ` Â· ${esc(o.put.rule)}, already here from ${esc(o.put.from)}: put aside` : ''}` : `World ${pad2(W.n)} Â· the urn`; l = o.left === 1 ? '<i>One</i> ball to go' : `<i>${o.word}</i> balls to go`; cls = 'won'; who = [o.n]; }
    const fr = FRAME[o.kind] || FRAME.draw, secs = fr.s || sec, sp = at ? worldToScreen(at) : null;
    let pos = null;
    if (sp && fr.near) { const ox = Math.max(0.2, Math.min(0.8, sp[0] / innerWidth)) * innerWidth, oy = Math.max(0.2, Math.min(0.8, sp[1] / innerHeight)) * innerHeight;
      pos = [ox + (sp[0] - ox) * fr.z, oy + (sp[1] - oy) * fr.z]; }                       // where the place will be once the view has eased in
    if (!k || !say(k, l, (cls + ' b-' + o.kind).trim(), secs, o.kind === 'count' ? 58 : 40, pos)) return false;
    if (who.length) lit(who, secs);
    if (sp) focusAt(sp, fr.z, secs + 0.6, fr.d, at);
    if (on && !silent) { if (o.kind === 'held') holdChime(0.6, sp ? Math.max(-0.8, Math.min(0.8, sp[0] / innerWidth * 2 - 1)) : 0); else if (o.kind === 'call') chord([1, 1.498, 2.245], 'triangle', 0.006, 3, root * 2); else bell(root * 4 * semi(scale[(BEAT.kinds.length * 2 + (o.score | 0)) % 5]), o.kind === 'count' ? 0.05 : 0.03, 2.6); }
    if (at && o.kind !== 'draw' && W.rings) { W.rings.unshift({ site: at, start: simT(), nation: (who[who.length - 1] || W.nations[0]).i }); W.rings.length = Math.min(W.rings.length, 6); }   // a ripple where it happens
    return true;
  }
  // the nations a moment concerns stay lit while it lasts; the rest dim
  const LIT = { s: new Set(), until: 0 };
  function lit(list, secs) { const l = (list || []).map(x => typeof x === 'string' ? W.nations.find(n => n.name === x) : x).filter(Boolean); if (!l.length) return;
    LIT.s = new Set(l.map(n => n.i)); LIT.until = performance.now() + secs * 1000; }
  function ring(f, cls) { const r = document.getElementById('stage-ring'); if (!r) return;
    if (f == null) { r.classList.remove('on'); return; }
    r.classList.toggle('heat', cls === 'heat');
    const [cx, cy, R] = globeGeo(), k = innerWidth / canvas.width, rad = CFG.globe ? R * k * 1.07 : Math.min(innerWidth, innerHeight) * 0.42;
    const x = CFG.globe ? cx * k : innerWidth / 2, y = CFG.globe ? cy * k : innerHeight / 2;
    r.style.cssText = `left:${x - rad}px;top:${y - rad}px;width:${rad * 2}px;height:${rad * 2}px;--f:${(f * 360).toFixed(1)}deg`; r.classList.add('on'); }
  const JOLT = { t: 0, a: 7 };                                           // the frame jolts as a number breaks (a third of a second)
  function directTick(dt) {
    if (!W) return;
    if (performance.now() > until && !loudB()) { tz = 1; tDim = 0; track = null; }
    if (track && performance.now() < until) { const s = worldToScreen(track); if (s && s[2] > 0.05) { tfx = Math.max(0.2, Math.min(0.8, s[0] / innerWidth)); tfy = Math.max(0.2, Math.min(0.8, s[1] / innerHeight)); } }
    const k = Math.min(1, dt * (tz > z ? 0.9 : 0.6));
    z += (tz - z) * k; fx += (tfx - fx) * k; fy += (tfy - fy) * k; dimK += (tDim - dimK) * Math.min(1, dt * 1.2);
    cenK += ((cen && performance.now() < until ? 1 : 0) - cenK) * Math.min(1, dt * 1.5);              // a cut brings its subject toward the centre, as far as the edges allow
    const W0 = innerWidth, H0 = innerHeight, Px = fx * W0, Py = fy * H0, cl = (v, a, b) => Math.max(a, Math.min(b, v));
    const tx = cenK * cl(W0 / 2 - Px, (1 - z) * (W0 - Px), (z - 1) * Px), ty = cenK * cl(H0 / 2 - Py, (1 - z) * (H0 - Py), (z - 1) * Py);
    const jg = (performance.now() - JOLT.t) / 1000, ja = jg >= 0 && jg < 0.5 ? JOLT.a * Math.min(1, innerWidth / 1200) * Math.exp(-jg / 0.11) : 0, jx = ja * Math.sin(jg * 47), jy = ja * 0.7 * Math.cos(jg * 38);
    const tr = Math.abs(z - 1) < 0.002 && Math.abs(tx) < 0.5 && Math.abs(ty) < 0.5 && ja < 0.05 ? '' : `translate(${(tx + jx).toFixed(1)}px, ${(ty + jy).toFixed(1)}px) scale(${z.toFixed(4)})`, org = `${(fx * 100).toFixed(2)}% ${(fy * 100).toFixed(2)}%`, key = tr + org;
    if (key !== applied) { applied = key; for (const e of moving()) { e.style.transformOrigin = org; e.style.transform = tr; } }
    const d = document.getElementById('stage-dim'); if (d) { d.style.opacity = dimK.toFixed(3); d.style.setProperty('--x', (fx * 100).toFixed(1) + '%'); d.style.setProperty('--y', (fy * 100).toFixed(1) + '%'); }
    if (W.lastBallAt && W.phase === 'alive') ring(Math.min(1, (simT() - W.lastBallAt) / 20));
    else if (W.heatOver && W.phase === 'alive') ring(Math.min(1, (W.heatStrain || 0) / HEAT.HOLD), 'heat'); else ring(null);
  }

  // ---------------------------------------------------------------- what happens, heard and shown
  const nm = l => l.length > 1 ? l.slice(0, -1).join(', ') + ' and ' + l[l.length - 1] : (l[0] || '');
  const api = {
    get on() { return on; }, want, start: startSound, stop: stopSound, hint,
    world() { say.until = 0; LIT.until = 0; silent = false; if (on) { rebuildVoices(); unsilence(); } z = tz = 1; fx = fy = tfx = tfy = 0.5; tDim = 0; cen = false; cenK = 0; track = null; ring(null); },
    draw(inst, nat) { if (!on) return; phrase(inst.def, nat, inst.live); },   // its rule's two bars
    cross(held, a, b) { if (!on) return; const q = a && b ? worldToScreen(mid(a.cap, b.cap)) : null, pan = q ? Math.max(-0.8, Math.min(0.8, q[0] / innerWidth * 2 - 1)) : 0;   // heard from where the border is
      held ? holdChime(1, pan) : pluck(chordTone(root * 8), 0.018, 0.9, pan); },
    breach(origin, where) {
      impact(); crack(0.2); focusAt(gridToScreen(origin), 1.16, 6, 0.55, g2w(origin)); if (!reduce) JOLT.t = performance.now();
      const others = W.nations.filter(n => n.alive && n.name !== where), w0 = n => n.defence && n.defence.w0 != null ? n.defence.w0 : n.measures.surveillance;
      const wn = W.nations.find(n => n.name === where), gave = wn && (wn.gaveBack || 0) > wn.measures.surveillance, guard = others.filter(n => n.defence && n.defence.already), sealed = others.filter(n => n.defence && n.defence.ok && n.defence.done && !n.defence.already && !n.defence.self);
      const bl = W.breach && W.breach.blind ? W.breach : W.lastBlind && simT() - W.lastBlind.t < 20 ? W.lastBlind : null;
      const kick = guard.length ? `${esc(nameList(guard.map(n => n.name)))} ${guard.length > 1 ? 'were' : 'was'} watching ${guard.every(n => w0(n) >= 5) ? 'every cell' : 'closely'}: this void cannot end the world`   // a state sealed at once: the void cannot be let end it
        : bl ? `${where ? esc(where) + 'â€™s' : 'Its'} watch was looking for ${esc(bl.blind)} Â· ${FRAG_SAY[bl.kind]}`   // its watch was looking elsewhere: that is the story here
        : wn && W.thr && W.thr.n === wn && W.thr.step === 'taken' ? `${esc(where)} was braced Â· watch ${wn.measures.surveillance}${wn.measures.clamp ? ` Â· clamp ${wn.measures.clamp}` : ''}`   // the state the screen was following
        : sealed.length ? `${esc(nameList(sealed.map(n => n.name)))} sealed ${sealed.length > 1 ? 'their borders' : 'its border'} in time Â· watch ${nameList(sealed.map(n => String(w0(n))))}` : gave ? `${esc(where)} had given back the watch that saved it Â· its watch at ${wn.measures.surveillance}` : `World ${pad2(W.n)} Â· ${mmss(simT())}`;
      if (say(kick, where ? `The void breaks out in <i>${esc(where)}</i>` : 'The void breaks out', 'black', 5.5, 95)) lit([where], 9);
    },
    fall(n, how) { const nan = how === 'lost'; boom(nan ? 0.5 : 0.28); const v = voices.find(x => x.n === n); if (v && on) v.g.gain.setTargetAtTime(0, ac.currentTime, 1.4);
      focusAt(worldToScreen(n.cap), 1.12, 4, nan ? 0.45 : 0.25, n.cap);
      const by = n.annexedBy || null, B = W.breach, src = nan && B && B.where === n, w0 = n.defence && n.defence.w0 != null ? n.defence.w0 : null;
      const kick = src ? (B.gave ? `It had given back the watch that saved it Â· its watch at ${B.w0 || 0}` : B.blind ? `Its watch was looking for ${esc(B.blind)} Â· ${FRAG_SAID[B.kind]}` : B.w0 ? `Its watch, at ${B.w0}, did not catch it` : 'It kept no watch: nothing could catch it') : nan && n.defence && !n.defence.ok ? `Too late to seal its border${w0 != null ? ` Â· its watch at ${w0}` : ''}` : `World ${pad2(W.n)}`;
      if (say(kick, nan ? `<i>${esc(n.name)}</i> falls` : `<i>${esc(n.name)}</i> is taken`, nan ? 'black' : '', 5, nan ? 90 : 70)) lit([n, by], 6); },
    held(fell, standing, why) { chord([1, 1.189, 1.498, 2], 'triangle', 0.026, 7, root * 2);
      if (standing.length) setTimeout(() => {                               // the states that held, and why: the most of them that held the same way
        const cls = x => (why && why[x] ? why[x][0] : 'reach'), by = {}; for (const x of standing.filter(x => !why || why[x])) (by[cls(x)] = by[cls(x)] || []).push(x);
        if (!Object.keys(by).length) return;
        const pick = ['time', 'once', 'watch', 'luck', 'reach'].filter(c => by[c]).sort((a, b) => by[b].length - by[a].length)[0], g = by[pick], one = g.length === 1;
        const said = pick === 'time' ? (one ? 'it was watching its border' : 'they were watching their borders') : pick === 'once' ? (one ? 'it was already watching' : 'they were already watching')
          : pick === 'watch' ? (one ? 'its own watch healed what crossed' : 'their own watch healed what crossed') : pick === 'luck' ? (one ? 'it sealed its border in time' : 'they sealed their borders in time')
          : (one ? 'the void did not reach it' : 'the void did not reach them');
        const kick = fell.length ? `${esc(nm(fell))} ${fell.length > 1 ? 'have' : 'has'} fallen` : `World ${pad2(W.n)}`;
        if (say(kick, `<i>${esc(nm(g))}</i> held: ${said}`, 'cold', 5.5, 85)) lit(standing, 6); }, fell.length ? 2600 : 0); },
    contained() { chord([1, 1.5], 'sine', 0.02, 4, root * 4); },
    caught(origin, where, w) { const wn = W; setTimeout(() => { if (W !== wn || W.phase !== 'alive') return; chord([1, 1.5], 'sine', 0.02, 4, root * 4);   // the watch closes over it
      if (say(`World ${pad2(W.n)} Â· caught in time${w ? ` Â· watch ${w}` : ''}`, where && w ? `<i>${esc(where)}</i> had enough <i>surveillance</i>` : 'Caught <i>in time</i>', 'cold', 4.5, 96)) lit([where], 5); }, 2600); },
    endBegins() {
      if (!(END_SLOW.on && FX.slowEnd && FX.slowEnd.w === W)) { silence(); tz = 1; tDim = 0.3; until = 0; say(`World ${pad2(W.n)} Â· ${mmss(simT())}`, 'The world has ended', 'black', 3.8, 100); return; }
      const S = END_SLOW.SWEEP, left = Math.max(1, S - (performance.now() - FX.slowEnd.t0) / 1000);
      if (on && !silent) { const t = ac.currentTime; boom(0.5);                              // a last, deep drop; then everything winds down, like a tape stopping
        const sink = (p, k) => { p.cancelScheduledValues(t); p.setValueAtTime(Math.max(8, p.value), t); p.exponentialRampToValueAtTime(Math.max(8, p.value * k), t + left); };
        for (const v of voices) for (const o of v.o) sink(o.frequency, 0.25);
        dreadO.forEach(o => sink(o.frequency, 0.3)); if (pedal) sink(pedal.frequency, 0.25);
        master.gain.cancelScheduledValues(t); master.gain.setValueAtTime(master.gain.value, t); master.gain.linearRampToValueAtTime(master.gain.value * 0.85, t + left * 0.55); master.gain.linearRampToValueAtTime(0, t + left); }
      silent = true; tz = 1.18; tDim = 0.35; until = performance.now() + (S + 4) * 1000;      // the view leans slowly in
      const n = W.n, d = mmss(simT()), at = Math.max(0, END_SLOW.TITLE_AT * 1000 - (performance.now() - FX.slowEnd.t0));
      setTimeout(() => { if (W && W.n === n) say(`World ${pad2(n)} Â· ${d}`, 'The world has ended', 'black', END_SLOW.TITLE_S, 100); }, at);
    },
    ended(kind) {
      if (kind === 'heat') { chord([1, 0.667, 0.5], 'sine', 0.03, 11, root * 2, true); say(`World ${pad2(W.n)} Â· thirty seconds past the line`, 'The world has <i>worn out</i>', 'heat', 8, 100); return; }
      if (kind === 'survived') { const cold = ((W.stats && W.stats.frost) || 0) > COLD_WIN, urnK = W.lastBallBy && W.nations.length > 1 ? esc(W.lastBallBy.name) + 'â€™s urn is empty' : 'the urn is empty';
        if (!wonWhole()) {                                                        // the void took some of its states: the rest survived it, and the world has not won
          const al = W.nations.filter(n => n.alive);
          chord([1, 1.189, 1.498, 1.782], 'sine', 0.024, 9, root * 2, true); setTimeout(() => bell(root * 4 * semi(7), 0.028, 5), 1100);
          if (say(`World ${pad2(W.n)} Â· ${W.sealed ? 'the Accord holds' : W.outlasted ? 'the void outlasted' : urnK}`, `<i>${esc(nm(al.map(n => n.name)))}</i> survived`, 'surv', 7, 100)) lit(al, 7);
          return; }
        const tk = W.nations.filter(n => !n.alive && n.annexedBy && !n.dead), tkK = tk.length ? ` Â· ${esc(nm(tk.map(n => n.name)))} taken by ${esc(nm([...new Set(tk.map(n => n.annexedBy.name))]))}` : '';   // a state taken over: said with the win
        if (W.sealed) { chord([1, 1.26, 1.498, 2], 'triangle', 0.032, 10, root * 2, true); say(`World ${pad2(W.n)} Â· the Accord holds${tkK}`, 'Won, <i>sealed</i>', 'pact', 7, 100); }
        else { if (cold) chord([1, 1.335, 1.498, 2], 'sine', 0.03, 9, root * 4, true); else fanfare();
          say(`World ${pad2(W.n)} Â· ${urnK}${tkK}`, cold ? 'Won, <i>frozen</i>' : 'The world <i>wins</i>', cold ? 'cold' : 'won wins', cold ? 7 : 8, 100); }
        if (tk.length) { const wn = W; setTimeout(() => { if (W === wn) remember(tk); }, cold ? 2600 : 3600); }   // and under the gold, what is gone
        setTimeout(() => chord(cold ? [3, 4, 6] : [3, 4, 6, 8], 'sine', 0.0062, 12, root * 4), 900);   // as the gold goes out, a shimmer, high and quiet
        gildBegin(cold); }
      else if (kind === 'stalled' || kind === 'kept') { chord([1, 1.498], 'sine', 0.025, 8, root);
        say(`World ${pad2(W.n)}`, kind === 'kept' ? 'Held still' : W.stagnant ? 'The world has <i>stagnated</i>' : 'Nothing more can be drawn', 'cold', 6, 100); }
    },
    omen(origin, where) {
      if (say(`World ${pad2(W.n)}${where ? ' Â· ' + esc(where) : ''}`, 'A number is about to <i>break</i>', 'black', OMEN_D, 93)) lit([where], OMEN_D + 1);
      focusAt(gridToScreen(origin), 1.24, OMEN_D + 0.8, 0.5, g2w(origin));
      if (on && !silent) { const t = ac.currentTime, T = OMEN_D, g = ac.createGain(), n = noise(), bp = ac.createBiquadFilter(), ng = ac.createGain();   // a swell of the key, rising an octave, cut short at the break
        g.gain.value = 0; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(1, t + T - 0.25); g.gain.setValueAtTime(0.0001, t + T - 0.22); g.connect(dry);
        [0, 7, 12, 19].forEach((sm, i) => { const o = ac.createOscillator(), og = ac.createGain(), p = ac.createStereoPanner(); o.type = i ? 'sine' : 'triangle';
          o.frequency.setValueAtTime(root * 4 * semi(sm), t); o.frequency.exponentialRampToValueAtTime(root * 8 * semi(sm), t + T - 0.2); og.gain.value = [0.034, 0.024, 0.017, 0.011][i]; p.pan.value = [-0.4, 0.4, -0.15, 0.15][i];
          o.connect(og); og.connect(p); p.connect(g); o.start(t); o.stop(t + T); });
        bp.type = 'bandpass'; bp.Q.value = 1.2; bp.frequency.setValueAtTime(400, t); bp.frequency.exponentialRampToValueAtTime(5000, t + T - 0.2); ng.gain.value = 0.05;   // (and a breath of air under it)
        n.connect(bp); bp.connect(ng); ng.connect(g); n.start(t); n.stop(t + T); if (FX.omen) FX.omen.snd = g; }
      if (!CFG.calib && !reduce) {                                            // meanwhile, at the borders: cut away, then back for the break
        clearTimeout(CINE.t1); clearTimeout(CINE.t2); clearTimeout(CINE.t3); const wn = W;
        CINE.t1 = setTimeout(() => coverShot(wn, 0), 1050); CINE.t2 = setTimeout(() => coverShot(wn, 1), 1900);
        CINE.t3 = setTimeout(() => { if (W === wn && FX.omen && !FX.omen.fired && !FX.omen.fz && CINE.cut) { const o = FX.omen.o; softCut(() => { if (SEEN.on && CFG.globe) bcamAt(o, true); cutTo(gridToScreen(origin), 1.5, 1.4, 0.55, g2w(origin)); }); } }, (OMEN_D - 0.6) * 1000);
        CINE.cut = coverList(W.breach && W.breach.where).length > 0; }
    },
    sealed(n) { knock(0.07); chord([1, 1.5, 2, 3], 'sine', 0.026, 3.2, root * 4); },
    mended(origin, where) {                                                     // the omen came to nothing: repaired before it broke
      const g = FX.omen && FX.omen.snd; if (g && on) { const t = ac.currentTime; try { g.gain.cancelScheduledValues(t); g.gain.setTargetAtTime(0.0001, t, 0.06); } catch (e) {} }
      if (say(`World ${pad2(W.n)}${where ? ' Â· ' + esc(where) : ''}`, 'Mended <i>in time</i>', 'cold', 4.5, 94)) lit([where], 5);
      focusAt(gridToScreen(origin), 1.06, 3, 0.3, g2w(origin));
    },
    regime(n, how) {                                                        // a regime falls, wakes, eases, or turns
      const L = { restored: `The rogue regime <i>falls</i>`, wakes: `<i>${esc(n.name)}</i> wakes`, terror: `<i>${esc(n.name)}</i> turns to terror`, eases: `<i>${esc(n.name)}</i> eases`, coup: `A coup in <i>${esc(n.name)}</i>` }[how];
      const sub = { restored: 'its mind is given back the dials', wakes: 'its mind takes back the dials', terror: 'every measure to full', eases: 'restraint alone', coup: 'it goes rogue' }[how];
      if (say(`World ${pad2(W.n)} Â· ${esc(n.name)} Â· ${sub}`, L, how === 'terror' || how === 'eases' ? 'cold' : how === 'coup' ? 'heat' : '', 5, 76)) lit([n], 6);
      focusAt(worldToScreen(n.cap), 1.12, 5.5, 0.35, n.cap);
      if (W.rings) { W.rings.unshift({ site: n.cap, start: simT(), nation: n.i }); W.rings.length = Math.min(W.rings.length, 6); }
      if (how === 'restored' || how === 'wakes') { chord([1, 1.26, 1.498], 'triangle', 0.026, 6, root * 2); setTimeout(() => bell(root * 8, 0.04, 3), 380); }
      else if (how === 'terror') { boom(0.22); [0, 160, 320, 480, 640].forEach((d, i) => setTimeout(() => knock(0.03 + i * 0.006), d)); }
      else if (how === 'eases') chord([1, 1.335], 'sine', 0.022, 5, root * 2);
      else { crack(0.12); boom(0.18); }
    },
    brace(at) { if (!at || api.busy(60)) return; focusAt(worldToScreen(at), 1.07, 6, 0.3, at); },
    dread(rule, where, no) { if (say(`World ${pad2(W.n)} Â· ${where && no ? `${esc(where)} Â· draw ${pad2(no)}` : mmss(simT())}`, `<i>${esc(rule)}</i> can break a number`, 'black', 4.5, 60)) lit([where], 5); },
    lastBall(n) { [0, 7, 12].forEach((s, i) => setTimeout(() => bell(root * 4 * semi(s), 0.05, 5), i * 400)); if (say(`World ${pad2(W.n)} Â· ${n && W.nations.length > 1 ? esc(n.name) + 'â€™s urn is empty' + (W.lastBallPut ? ` Â· ${esc(W.lastBallPut.rule)}, already here from ${esc(W.lastBallPut.from)}: put aside` : '') : 'the urn is empty'}`, W.lastBallPut ? 'The last ball, <i>put aside</i>' : 'The last ball', 'won', 5, 75) && n) lit([n], 5); },
    lastBallLost() { knock(0.06); },
    put(n) { knock(0.022); },                                                   // a ball put aside: the softest knock
    glint(burst) { if (Math.random() < (burst ? 0.8 : 0.55)) bell(root * 16 * semi([0, 4, 7, 12][Math.floor(Math.random() * 4)] + (Math.random() < 0.3 ? 12 : 0)), burst ? 0.01 : 0.0065, 2.6, 2.0); },   // (in the chord the world won on)   // a glint on the gold: the faintest bell
    slowCall(n, k, level, how) {                                            // a call to slow down: the more of them, the louder
      const kick = `World ${pad2(W.n)} Â· heat ${W.heat.toFixed(2)} Â· the ${ordOf(k)} call to slow down`;
      const line = how === 'meet' ? 'The nations meet to <i>slow down</i>' : how === 'tighten' ? `The Accord tightens the Cap: <i>restraint ${level}</i>`
        : how === 'ignored' ? `<i>${esc(n.name)}</i> ignores the call` : `<i>${esc(n.name)}</i>â€™s people call for a <i>slowdown</i>`;
      if (!loudCall(k, level)) { if (how !== 'meet') offer('call', { n, k, level, how }); return; }   // nothing new: an ordinary highlight, if nothing better is waiting
      W.slowSaidLevel = Math.max(W.slowSaidLevel || 0, level);
      if (how !== 'meet' && say(kick, line, 'heat', 4.2, 56) && n) lit([n], 5);
      if (n) focusAt(worldToScreen(n.cap), 1.06, 4.5, 0.22, n.cap);
      chord([1, 1.498, 2.245], 'triangle', 0.006 + 0.002 * Math.min(10, k), 4.5, root * 2);
    },
    warming() { chord([1, 1.498, 2.245], 'triangle', 0.009, 7, root * 2); say(`World ${pad2(W.n)} Â· heat ${W.heat.toFixed(2)}`, 'The world is <i>warming</i>', 'heat', 5, 50); },
    overLine() { boom(0.16); const s = W.heatStrain || 0; say(`World ${pad2(W.n)} Â· heat ${W.heat.toFixed(2)}${s >= 1 ? ` Â· worn out in ${Math.max(1, Math.ceil(HEAT.HOLD - s))} s` : ''}`, 'Past <i>the line</i>', 'heat', 6, 88); },
    wearing() { boom(0.12); say(`World ${pad2(W.n)} Â· heat ${W.heat.toFixed(2)} Â· worn out in ${Math.max(1, Math.ceil(HEAT.HOLD - (W.heatStrain || 0)))} s`, 'The world is <i>wearing out</i>', 'heat', 5, 88); },
    heatBreaks(cap) { const wn = W, t0 = performance.now(), go = () => {       // after "past the line" has had its time: an ebb follows it within the second
        if (W !== wn || W.phase !== 'alive' || W.heat >= 1) return;             // (back past the line by now: unsaid) if (api.busy(cap ? 72 : 55) && performance.now() - t0 < 9000) { setTimeout(go, 600); return; }
        chord([1, 1.5, 2], 'sine', 0.02, 5, root * 4);
        say(`World ${pad2(W.n)} Â· heat ${W.heat.toFixed(2)}${cap ? ' Â· the Accordâ€™s Cap holds' : ''}`, cap ? 'The Cap brings the heat <i>under the line</i>' : 'The heat <i>breaks</i>', cap ? 'pact' : 'cold', cap ? 6 : 5, cap ? 72 : 55); };
      go(); },
    banHolds(n, poison) { const wn = W, t0 = performance.now(), go = () => {   // after the Accord's own title: the Ban is often made the moment it is needed
        if (W !== wn || W.phase !== 'alive' || !n.alive) return; if (api.busy(60) && performance.now() - t0 < 12000) { setTimeout(go, 700); return; }
        chord([1, 1.26, 1.498], 'triangle', 0.022, 5, root * 2);
        if (say(`World ${pad2(W.n)} Â· ${esc(n.name)} Â· one rule from ${esc(poison)}`, 'The Ban <i>holds</i>', 'pact', 5, 60)) lit([n], 5); focusAt(worldToScreen(n.cap), 1.06, 5, 0.25, n.cap); };
      go(); },
    givesBack(n, fz) { const wn = W, t0 = performance.now(), go = () => {   // the first in a world is said: the watch that saved it, given back
        if (W !== wn || W.phase !== 'alive' || !n.alive || W.breach) return; if (api.busy(60) && performance.now() - t0 < 12000) { setTimeout(go, 700); return; }
        chord([1, 1.189, 1.498], 'sine', 0.018, 5, root * 2);
        if (say(`World ${pad2(W.n)}${n.alarmFrom ? ` Â· raised when the void broke out in ${esc(n.alarmFrom)}` : ''}${fz ? ` Â· ${fz}% of its land frozen` : ''} Â· a point at a time`, `<i>${esc(n.name)}</i> gives back the watch <i>that saved it</i>`, 'cold', 5, 60)) lit([n], 5); focusAt(worldToScreen(n.cap), 1.06, 5, 0.25, n.cap); };
      go(); },
    poisonMet(s) { const wn = W, t0 = performance.now(), go = () => {      // a ball completes a combination some mind remembers killing: the combination is named
        if (W !== wn || W.phase !== 'alive' || !s.nat.alive) return; if (api.busy(72) && performance.now() - t0 < 3000) { setTimeout(go, 400); return; }
        const multi = W.nations.length > 1, names = s.poison.c.ids.map(id => BY_ID[id] ? BY_ID[id].name : id);
        const T = W.thr && !W.thr.done && W.thr.n === s.nat && s.inst && s.inst.def.id === W.thr.d.id ? W.thr : null, m = s.nat.measures;   // the state the screen is following: taken up braced
        const kick = `World ${pad2(W.n)} Â· ${multi ? esc(s.nat.name) + ' Â· ' : ''}draw ${pad2(s.no)} Â· ${T ? (isBraced(s.nat) ? `taken up braced: watch ${m.surveillance}${m.clamp ? ` Â· clamp ${m.clamp}` : ''}` : 'taken up before it was braced') : 'remembered as a poison'}`;
        if (say(kick, names.map(x => `<i>${esc(x)}</i>`).join(' + '), T ? 'cold' : '', 4.5, 72)) lit([s.nat], 4); };
      go(); },
    thread(step, T) { const n = T.n, wn = W, t0 = performance.now(), go = () => {   // the sequence the screen follows (see THE THREAD): braced, then held
        if (W !== wn || W.phase !== 'alive' || !n.alive || (step === 'held' && (W.breach || FX.omen))) return;
        if (api.busy(step === 'held' ? 66 : 74) && performance.now() - t0 < 9000) { setTimeout(go, 600); return; }
        const m = n.measures, dl = `watch ${m.surveillance}${m.clamp ? ` Â· clamp ${m.clamp}` : ''}`, sp = worldToScreen(n.cap);
        if (step === 'brace') {
          if (on && !silent) { const t = ac.currentTime + 0.02; lowAt(t, root * 2, 0.02, 2.8); [-5, 0, 7].forEach((sm, i) => glassAt(t + 0.06 + i * 0.17, root * 8 * semi(fitS(sm)), 0.019 - i * 0.003, 1.8 + i * 0.5, 2, (i - 1) * 0.25, 0.006, 0.3)); }
          if (say(`${esc(n.name)} remembers ${esc(compName(T.c))} as poison`, `<i>${esc(n.name)}</i> braces before it draws <i>${esc(T.d.name)}</i>`, 'cold', 5.5, 74)) lit([n], 6);
        } else {
          chord([1, 1.335, 2], 'sine', 0.014, 5, root * 2);
          if (say(`${esc(n.name)} Â· ${esc(compName(T.c))} in force Â· ${dl}`, T.braced ? `<i>${esc(n.name)}</i> holds it, <i>braced</i>` : `<i>${esc(n.name)}</i> <i>holds</i> it`, 'cold', 5, 66)) lit([n], 5);
        }
        focusAt(sp, 1.1, 6, 0.3, n.cap); if (CFG.globe && (!sp || sp[2] < 0.45)) bcamAt(n.cap);
        if (W.rings) { W.rings.unshift({ site: n.cap, start: simT(), nation: n.i, inward: step === 'brace' }); W.rings.length = Math.min(W.rings.length, 6); } };
      go(); },
    tighten(n) { if (!on || silent) return; const t = ac.currentTime + 0.01, q = worldToScreen(n.cap), pan = q ? Math.max(-0.7, Math.min(0.7, q[0] / innerWidth * 2 - 1)) : 0;   // a watch closing in: a short rising fourth, close and cold
      glassAt(t, root * 8 * semi(fitS(-5)), 0.01, 0.7, 2, pan, 0.004, 0.15); glassAt(t + 0.085, root * 8, 0.013, 1.2, 2, pan, 0.004, 0.2); },
    sharp(n, known, broad) { const wn = W, t0 = performance.now(), go = () => {   // a watch that has learned where to look (or has only grown sure of itself)
        if (W !== wn || W.phase !== 'alive' || !n.alive || W.breach) return; if (api.busy(55) && performance.now() - t0 < 15000) { setTimeout(go, 800); return; }
        chord([1, 1.335, 2], 'sine', 0.014, 5, root * 4);
        const w = n.measures.surveillance;
        const kick = known ? `World ${pad2(W.n)} Â· watch ${w} Â· it looks for ${esc(known)}${broad ? ', and keeps its band broad' : ''}` : `World ${pad2(W.n)} Â· watch ${w} Â· its band narrows: it knows no kind of danger to look for`;
        if (say(kick, known ? `<i>${esc(n.name)}</i>â€™s watch has learned <i>where to look</i>` : `<i>${esc(n.name)}</i>â€™s watch has grown <i>sure of itself</i>`, 'cold', 5.5, 55)) lit([n], 6);
        focusAt(worldToScreen(n.cap), 1.12, 6, 0.3, n.cap); };
      go(); },
    stepDown(n) { if (on) chord([1, 0.749], 'sine', 0.01, 2.6, root * 2); },
    verdictCue(k, kind, part) { if (!on || silent) return;                 // the account's replay, heard (after a void ending, nothing: the silence holds)
      if (k === 'draw') bell(root * 8, 0.018, 2.6); else if (k === 'break') { knock(0.07); boom(0.07); } else if (k === 'caught') chord([1, 1.5], 'sine', 0.016, 3.5, root * 4);
      else if (k === 'poison') chord([1, 1.335, 1.498], 'sine', 0.012, 4, root * 2); else if (k === 'fall') boom(0.09);
      else if (k === 'accord') chord([1, 1.26, 1.498], 'triangle', 0.012, 4, root * 2); else if (k === 'last') bell(root * 4 * semi(7), 0.02, 4);
      else if (k === 'end') { if (kind === 'survived' && !part) chord([1, 1.5, 2, 2.52], 'sine', 0.014, 5, root * 4); else if (kind === 'survived') chord([1, 1.189, 1.498], 'sine', 0.012, 4.5, root * 2); else knock(0.05); } },
    heldAgain(n, again) { chord([1, 1.5], 'sine', 0.012, 3, root * 4);              // once a world for each state: it is back, and held, without the scene
      if (say(`World ${pad2(W.n)} Â· ${n ? esc(n.name) + ' Â· ' : ''}the void stirs${again ? ' again' : ''}`, n ? `<i>${esc(n.name)}</i> holds it <i>at bay</i>` : 'Held <i>at bay</i>', 'cold', 3.5, 50) && n) lit([n], 3); },
    healed(n, w) { const wn = W; setTimeout(() => { if (W !== wn || W.phase !== 'alive' || !n.alive) return; chord([1, 1.5], 'sine', 0.02, 4, root * 4);
        if (say(`World ${pad2(W.n)} Â· the void is healed${w ? ` Â· watch ${w}` : ''}`, `<i>${esc(n.name)}</i> had enough <i>surveillance</i>`, 'cold', 4.5, 92)) lit([n], 5); }, 1200); },
    capCools() { chord([1, 1.26, 1.498, 2], 'triangle', 0.022, 6, root * 2); say(`World ${pad2(W.n)} Â· heat ${W.heat.toFixed(2)} Â· the Cap holds`, 'The Accord <i>cools the world</i>', 'pact', 5.5, 62); },
    accord(fresh, kind, names, guar, no) { chord([1, 1.26, 1.498, 1.888], 'triangle', 0.026, 7, root * 2);
      say(fresh ? `${esc(nm(names))} sign Â· ${esc(guar)} guarantees` : `World ${pad2(W.n)} Â· the Accord`, fresh ? (kind === 'cap' ? 'An <i>Accord</i> to slow down' : 'An <i>Accord</i> against a poison') : kind === 'cap' ? 'The Accord <i>caps the pace</i>' : 'The Accord <i>bans a poison</i>', 'pact', 6, fresh ? 65 : 55) && lit(names, 7); },
    noAccord() { knock(0.05); },
    joins(names) { chord([1, 1.26, 1.498], 'triangle', 0.02, 5, root * 2); say(`World ${pad2(W.n)} Â· the Accord`, `<i>${esc(nm(names))}</i> ${names.length > 1 ? 'join' : 'joins'}`, 'pact', 4.5, 45) && lit(names, 5); },
    leave(n) { knock(0.07); say(`World ${pad2(W.n)} Â· the Accord`, `<i>${esc(n.name)}</i> walks out`, '', 4.5, 60) && lit([n], 5); },
    accordOver() { chord([1, 1.189], 'sine', 0.018, 5, root * 2); },
    busy(p = 0) { return performance.now() < (say.until || 0) && (say.prio || 0) >= p; },
    lastSay() { return say.last || null; },
    audioTrack() { try { if (!ac || !on || !outNode || ac.state !== 'running') return null; if (!recDest) { recDest = ac.createMediaStreamDestination(); outNode.connect(recDest); }   // the score, for a clip
      return recDest.stream.getAudioTracks()[0] || null; } catch (e) { return null; } },
    isLit(i) { return performance.now() < LIT.until && LIT.s.has(i); }, litOn() { return performance.now() < LIT.until; },
    report(open) { if (!on) return; const t = ac.currentTime; master.gain.setTargetAtTime(silent ? 0 : open ? 0.45 : 0.85, t, 1); },
    offer,
    tick(dt) { directTick(dt); beatTick(); cineTick(); if (frameNo % 12 === 0) soundTick(); if (frameNo % 6 === 3) threadTick(); },
  };
  return api;
})();

const FRONT_SPEED = 0.26;              // how fast a new rule spreads from its invention site (world units / s)

/* ======================================================================
   RNG
   ====================================================================== */
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

/* ======================================================================
   THE POOL â€” sixty rules, written by Claude for this piece. Each world's urn takes forty of them.
   Each body reads w (the world at a cell) and constants P, and writes
   d (rates for substrate, life, charge, hue) and f (force on the flow).
   ====================================================================== */
const CORPUS = [
  // --- growth -------------------------------------------------------------
  { id: 'autocat', name: 'Autocatalysis', fam: 'growth', pre: ['replen'], wt: 14,
    abs: 'Life turns substrate into more of itself, faster the more of itself there already is.',
    code: 'float r = min(w.s.x*w.s.y*w.s.y, w.s.x);\nd.x -= r;\nd.y += r;' },
  { id: 'replen', name: 'Replenishment', fam: 'growth', pre: [], wt: 12,
    presets: [[0.0545, 0.062], [0.029, 0.057], [0.037, 0.060], [0.042, 0.061]],
    abs: 'Substrate seeps back into emptied ground, at a pace each nationâ€™s ground sets for itself. Life that cannot keep pace is retired.',
    code: 'vec2 fk = own_appetite(P.xy);\nd.x += fk.x*(1.0 - w.s.x);\nd.y -= (fk.x + fk.y)*w.s.y;' },
  { id: 'spores', wild: true, name: 'Spore Rain', fam: 'growth', pre: ['replen'], wt: 3,
    p: [[0.0012, 0.0024], [4, 7], [0.3, 0.6], [0, 0]],
    abs: 'Now and then a mote of life falls out of nowhere onto the richest ground.',
    code: 'vec2 c = w.p*P.y;\nfloat h = hash21(floor(c) + vec2(floor(w.t*P.z)*7.13, 1.0));\nfloat r = length(fract(c) - 0.5);\nd.y += P.x*step(0.996, h)*smoothstep(0.3, 0.05, r)*w.s.x;' },
  { id: 'seasons', wild: true, name: 'Seasons', fam: 'growth', pre: ['replen'],
    p: [[0.0018, 0.004], [1.5, 3.2], [0.04, 0.12], [0, 6.2832]],
    abs: 'Feed rises and falls in a slow tide that crosses the world.',
    code: 'vec2 dir = vec2(cos(P.w), sin(P.w));\nd.x += P.x*sin(dot(w.p, dir)*P.y - w.t*P.z)*(1.0 - w.s.x);' },
  { id: 'mitosis', name: 'Division Pressure', fam: 'growth', pre: ['autocat'],
    p: [[0.06, 0.16]],
    abs: 'Crowded life pushes against itself until it splits.',
    code: 'd.y -= P.x*w.lap.y*smoothstep(0.2, 0.4, w.s.y);' },
  { id: 'pulse', name: 'Breath', fam: 'growth', pre: ['replen'],
    p: [[0.0015, 0.004], [0.25, 0.6]],
    abs: 'The whole world breathes: feed swells and ebbs everywhere at once.',
    code: 'd.x += P.x*sin(w.t*P.y)*(1.0 - w.s.x);' },
  { id: 'harvest', name: 'Harvest', fam: 'growth', pre: ['photosyn'],
    p: [[0.03, 0.08]],
    abs: 'Charge is spent to hurry growth along.',
    code: 'float h = P.x*w.s.z*w.s.x*w.s.y;\nd.y += h;\nd.z -= 0.5*h;' },
  // --- form ---------------------------------------------------------------
  { id: 'terrain', name: 'Terrain of Appetite', fam: 'form', pre: ['replen'],
    p: [[0.008, 0.016], [0.6, 1.4]],
    abs: 'Appetite varies across the ground like soil, so each region grows its own morphology.',
    code: 'd.y -= P.x*(fbm(w.p*P.y + 3.1) - 0.5)*w.s.y;' },
  { id: 'crystal', name: 'Crystal Habit', fam: 'form', pre: ['autocat'],
    p: [[0.02, 0.05], [8, 16]],
    abs: 'Life settles preferentially on a hexagonal lattice, as if the ground had a grain.',
    code: 'd.y += P.x*w.s.x*w.s.y*(0.3 - hexd(w.p*P.y));' },
  { id: 'terraces', name: 'Terraces', fam: 'form', pre: ['autocat'],
    p: [[0.0008, 0.002], [7, 13]],
    abs: 'Life prefers certain thicknesses and settles into contour lines.',
    code: 'd.y -= P.x*sin(TAU*w.s.y*P.y)*smoothstep(0.08, 0.2, w.s.y);' },
  { id: 'grain', name: 'Grain', fam: 'form', pre: ['autocat'],
    p: [[0.03, 0.07], [0, 6.2832]],
    abs: 'The ground has a direction, and growth leans along it.',
    code: 'vec2 g = vec2(cos(P.y), sin(P.y));\nd.y += P.x*dot(w.gB, g);' },
  { id: 'moire', name: 'MoirÃ©', fam: 'form', pre: ['autocat'],
    p: [[0.03, 0.07], [18, 36]],
    abs: 'Two faint gratings overlap, and life reads the interference.',
    code: 'float m = sin(dot(w.p, vec2(1.0, 0.21))*P.y)*sin(dot(w.p, vec2(-0.27, 1.0))*P.y*1.07);\nd.y += P.x*w.s.x*w.s.y*m;' },
  { id: 'tidepools', name: 'Tide Pools', fam: 'form', pre: ['replen'],
    p: [[0.015, 0.06], [2.5, 5]],
    abs: 'The substrate drains into round basins, scattered like rain on sand.',
    code: 'float c = cell(w.p*P.y);\nd.x -= P.x*smoothstep(0.22, 0.0, c);' },
  { id: 'quasicrystal', name: 'Quasicrystal', fam: 'form', pre: ['autocat'],
    p: [[0.045, 0.075], [30, 44], [0, 2.999], [0, 6.2832]],
    abs: 'Life settles on a pattern that never repeats: waves crossing at equal angles, fivefold like a Penrose tiling, sevenfold, or eightfold like a Moorish star.',
    code: 'float n = P.z < 1.0 ? 5.0 : (P.z < 2.0 ? 7.0 : 4.0), q = 0.0;\nfor (int k = 0; k < 7; k++){ float a = P.w + 3.14159265*float(k)/n;\n  q += step(float(k) + 0.5, n)*cos(dot(w.p, vec2(cos(a), sin(a)))*P.y); }\nd.y += P.x*w.s.x*w.s.y*q*inversesqrt(n);' },
  { id: 'whorls', name: 'Whorls', fam: 'form', pre: ['autocat'],
    p: [[0.04, 0.08], [1.3, 2.4], [2, 5.999], [-1, 1]],
    abs: 'Life winds into spirals round scattered hearts, like the whorls of a fingerprint or the arms of a galaxy.',
    code: 'vec2 c = w.p*P.y, i = floor(c), r = vec2(1.0); float m = 9.0;\nfor (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++){ vec2 o = vec2(float(x), float(y));\n  vec2 e = o + vec2(hash21(i + o), hash21(i + o + 17.0)) - fract(c); if (dot(e, e) < m){ m = dot(e, e); r = e; } }\nfloat l = max(sqrt(m), 0.02), a = atan(r.y, abs(r.x) < 1.0e-6 ? 1.0e-6 : r.x);\nfloat arm = sin(floor(P.z)*a + sign(P.w)*(6.0 + 8.0*abs(P.w))*log(l));\nd.y += P.x*w.s.x*w.s.y*arm*smoothstep(0.04, 0.16, l);' },
  { id: 'chirality', name: 'Chirality', fam: 'form', pre: ['autocat'],
    p: [[0.015, 0.04]],
    abs: 'Growth prefers to turn left.',
    code: 'd.y += P.x*dot(w.gB, perp(w.p));' },
  // --- light --------------------------------------------------------------
  { id: 'induction', name: 'Induction', fam: 'light', pre: ['autocat'], wt: 2,
    p: [[0.0008, 0.0018]],
    abs: 'Where life meets bare ground, the friction leaves charge behind.',
    code: 'd.z += P.x*smoothstep(0.015, 0.08, length(w.gB));' },
  { id: 'photosyn', name: 'Photosynthesis', fam: 'light', pre: ['autocat'], wt: 2,
    p: [[0.0015, 0.0035]],
    abs: 'Living tissue stores ambient light as charge.',
    code: 'd.z += P.x*w.s.y;' },
  { id: 'afterglow', name: 'Afterglow', fam: 'light', pre: ['photosyn'],
    p: [[0.0012, 0.0026]],
    abs: 'Charge that sits in living tissue lingers, and a little of it asks for more.',
    code: 'd.z += P.x*w.s.z*smoothstep(0.05, 0.3, w.s.y);' },
  { id: 'sympathy', name: 'Sympathy', fam: 'light', pre: ['induction'],
    p: [[0.0012, 0.0024]],
    abs: 'Bright charge hums, and the hum is a kind of charge.',
    code: 'd.z += P.x*w.s.z*smoothstep(0.1, 0.5, w.s.z);' },
  { id: 'focus', name: 'Focus', fam: 'light', pre: ['photosyn'],
    p: [[0.1, 0.22]],
    abs: 'Light gathers at its own brightest points, as a lens finds its focal length.',
    code: 'd.z -= P.x*w.lap.z*smoothstep(0.05, 0.25, w.s.y);' },
  { id: 'corona', name: 'Corona', fam: 'light', pre: ['induction'],
    p: [[0.08, 0.2]],
    abs: 'Bright charge draws a crown of brightness out of its surroundings.',
    code: 'd.z -= P.x*w.lap.z*smoothstep(0.1, 0.4, w.s.z);' },
  { id: 'lightning', wild: true, name: 'Lightning', fam: 'light', pre: ['induction'],
    p: [[0.01, 0.03], [3, 7], [1.5, 4]],
    abs: 'Now and then, charge arrives all at once.',
    code: 'float h = hash21(floor(w.p*P.y) + vec2(floor(w.t*P.z)*3.7, 9.0));\nd.z += P.x*step(0.993, h)*smoothstep(0.02, 0.2, w.s.y);' },
  // --- hue ----------------------------------------------------------------
  { id: 'iridescence', name: 'Iridescence', fam: 'hue', pre: ['autocat'],
    p: [[0.02, 0.06]],
    abs: 'Hue shifts with the steepness of lifeâ€™s edges, as in a film of oil.',
    code: 'd.w += P.x*length(w.gB);' },
  { id: 'aurora', name: 'Aurora', fam: 'hue', pre: [], any: ['photosyn', 'induction'],
    p: [[0.0008, 0.002]],
    abs: 'Charge drifts up the spectrum as it brightens.',
    code: 'd.w += P.x*w.s.z;' },
  { id: 'dusk', name: 'Dusk', fam: 'hue', pre: [],
    p: [[0.00008, 0.0002]],
    abs: 'The whole world leans, slowly, toward another light.',
    code: 'd.w += P.x;' },
  { id: 'bands', name: 'Spectral Bands', fam: 'hue', pre: [],
    p: [[0.0003, 0.0008], [2, 5]],
    abs: 'Hue locks to latitude in slow stripes.',
    code: 'd.w += P.x*sin(w.p.y*P.y + w.t*0.03);' },
  { id: 'spincolour', name: 'Spin Colour', fam: 'hue', pre: ['eddies'],
    p: [[0.2, 0.6]],
    abs: 'Hue turns with the fluid: one way warms, the other cools.',
    code: 'd.w += P.x*w.curl;' },
  { id: 'depth', name: 'Depth', fam: 'hue', pre: ['sediment'],
    p: [[0.0003, 0.0009]],
    abs: 'Hue deepens with the logarithm of what is left beneath it.',
    code: 'd.w += P.x*lnf(w.s.x);' },
  { id: 'sediment', name: 'Sediment', fam: 'hue', pre: ['autocat'],
    p: [[0.001, 0.003]],
    abs: 'Where life has lingered, colour remembers it.',
    code: 'd.w += P.x*(w.s.y - 0.12);' },
  // --- current ------------------------------------------------------------
  { id: 'eddies', name: 'Eddies', fam: 'current', pre: [], wt: 2,
    p: [[0.0004, 0.001], [1.0, 2.6], [0.02, 0.07]],
    abs: 'Curl noise stirs the medium at the scale of weather.',
    code: 'f += P.x*curl2(w.p*P.y + vec2(0.0, w.t*P.z));' },
  { id: 'tradewind', wild: true, name: 'Trade Wind', fam: 'current', pre: [],
    p: [[0.0002, 0.0005], [0, 6.2832]],
    abs: 'A broad current crosses the world and returns along its edges.',
    code: 'vec2 dir = vec2(cos(P.y), sin(P.y));\nf += P.x*dir*cos(dot(w.p, perp(dir))*1.3);' },
  { id: 'convection', name: 'Convection', fam: 'current', pre: [], any: ['photosyn', 'induction'],
    p: [[0.0003, 0.0008]],
    abs: 'Charged fluid rises; spent fluid sinks.',
    code: 'f.y += P.x*(w.s.z - 0.12);' },
  { id: 'vortexstreet', name: 'Vortex Street', fam: 'current', pre: ['autocat'],
    p: [[0.005, 0.015]],
    abs: 'Life sheds small vortices from its edges.',
    code: 'f += P.x*perp(w.gB);' },
  { id: 'maelstrom', name: 'Maelstrom', fam: 'current', pre: ['eddies'],
    p: [[0.0006, 0.0015], [1.5, 4], [-1, 1], [-0.6, 0.6]],
    abs: 'A slow gyre opens somewhere in the world.',
    code: 'vec2 q = w.p - P.zw;\nf += P.x*perp(q)*exp(-dot(q, q)*P.y);' },
  { id: 'shear', name: 'Shear Bands', fam: 'current', pre: ['tradewind'],
    p: [[0.0002, 0.0006], [3, 7], [0.02, 0.08]],
    abs: 'Lanes of opposing current, like the bands of a gas giant.',
    code: 'f.x += P.x*sin(w.p.y*P.y + w.t*P.z);' },
  { id: 'pressure', name: 'Pressure', fam: 'current', pre: ['replen'],
    p: [[0.006, 0.018]],
    abs: 'Fluid is pushed away from rich ground.',
    code: 'f -= P.x*w.gA;' },
  { id: 'chemotaxis', name: 'Chemotaxis', fam: 'current', pre: ['induction'],
    p: [[0.008, 0.024]],
    abs: 'Currents lean toward charge.',
    code: 'f += P.x*w.gC;' },
  { id: 'refraction', name: 'Refraction', fam: 'current', pre: ['induction'],
    p: [[0.001, 0.003]],
    abs: 'Currents answer relative, not absolute, differences in charge: a faint slope in a dim place pulls as hard as a bright one.',
    code: 'f += P.x*vec2(ratio(w.gC.x, w.s.z), ratio(w.gC.y, w.s.z));' },
  { id: 'momentum', name: 'Momentum', fam: 'current', pre: ['eddies'],
    p: [[0.008, 0.018]],
    abs: 'Currents remember themselves a little longer.',
    code: 'f += P.x*w.v;' },
  { id: 'stretching', name: 'Vortex Stretching', fam: 'current', pre: ['eddies'],
    p: [[0.008, 0.018]],
    abs: 'Spinning fluid spins itself faster.',
    code: 'f += P.x*w.v*clamp(abs(w.curl)*12.0, 0.0, 1.0);' },
  { id: 'slipstream', wild: true, name: 'Slipstream', fam: 'current', pre: ['tradewind'],
    p: [[0.008, 0.018]],
    abs: 'Fast water drags the water behind it.',
    code: 'f += P.x*w.v*smoothstep(0.02, 0.2, length(w.v));' },
  // --- damping ------------------------------------------------------------
  { id: 'lumen', name: 'Lumen', fam: 'damping', pre: [], any: ['photosyn', 'induction'],
    p: [[0.05, 0.15]],
    abs: 'Charge radiates, spreading faster than it fades.',
    code: 'd.z += P.x*w.lap.z;' },
  { id: 'quench', name: 'Quench', fam: 'damping', pre: [], any: ['photosyn', 'induction'],
    p: [[0.004, 0.012], [0.4, 0.7]],
    abs: 'Charge above a working level is bled away.',
    code: 'd.z -= P.x*max(w.s.z - P.y, 0.0);' },
  { id: 'thermostat', name: 'Thermostat', fam: 'damping', pre: ['induction'],
    p: [[0.0008, 0.002]],
    abs: 'Charge is nudged, gently, back toward the worldâ€™s average.',
    code: 'd.z -= P.x*(w.s.z - 0.05);' },
  { id: 'grounding', name: 'Grounding', fam: 'damping', pre: [], any: ['photosyn', 'induction'],
    p: [[0.0001, 0.0007]],
    abs: 'Charge in barren ground is shorted to earth.',
    code: 'd.z -= P.x*(1.0 - smoothstep(0.01, 0.08, w.s.y));' },
  { id: 'senescence', name: 'Senescence', fam: 'damping', pre: ['autocat'],
    p: [[0.004, 0.012]],
    abs: 'Life that grows too thick is retired first.',
    code: 'd.y -= P.x*w.s.y*smoothstep(0.25, 0.45, w.s.y);' },
  { id: 'viscosity', name: 'Viscosity', fam: 'damping', pre: [],
    p: [[0.05, 0.2]],
    abs: 'The medium thickens; currents smooth into one another.',
    code: 'f += P.x*w.lapV;' },
  { id: 'drag', name: 'Drag', fam: 'damping', pre: [],
    p: [[0.004, 0.012]],
    abs: 'Everything that moves pays a toll.',
    code: 'f -= P.x*w.v;' },
  { id: 'stillness', name: 'Stillness', fam: 'damping', pre: ['autocat'],
    p: [[0.01, 0.03]],
    abs: 'Life slows the fluid it grows in.',
    code: 'f -= P.x*w.v*smoothstep(0.05, 0.3, w.s.y);' },
  // --- the ten added to the pool --------------------------------------------
  { id: 'mycelium', name: 'Mycelium', fam: 'growth', pre: ['autocat'],
    p: [[0.0008, 0.0025]],
    abs: 'Life threads out along its own edges, thin and far, wherever the ground is rich.',
    code: 'd.y += P.x*smoothstep(0.45, 0.85, w.s.x)*smoothstep(0.02, 0.12, length(w.gB))*(1.0 - w.s.y);' },
  { id: 'fallow', name: 'Fallow', fam: 'growth', pre: ['replen'],
    p: [[0.002, 0.006]],
    abs: 'Ground left empty grows rich again, richer than before.',
    code: 'd.x += P.x*(1.25 - w.s.x)*(1.0 - smoothstep(0.0, 0.04, w.s.y));' },
  { id: 'fairyrings', name: 'Fairy Rings', fam: 'form', pre: ['autocat'],
    p: [[0.003, 0.008]],
    abs: 'Life thins at the heart of every patch as it grows at the edge, and spreads in rings.',
    code: 'd.y -= P.x*w.s.y*smoothstep(0.25, 0.45, w.s.y)*(1.0 - smoothstep(0.0, 0.04, length(w.gB)));' },
  { id: 'dunes', name: 'Dunes', fam: 'form', pre: [], any: ['eddies', 'tradewind'],
    p: [[0.2, 0.6]],
    abs: 'The current carries the ground along with it, and it piles into dunes.',
    code: 'd.x -= P.x*dot(w.v, w.gA);' },
  { id: 'erosion', name: 'Erosion', fam: 'form', pre: [], any: ['eddies', 'tradewind'],
    p: [[0.0008, 0.002]],
    abs: 'Fast water wears the ground away.',
    code: 'd.x -= P.x*smoothstep(0.08, 0.35, length(w.v));' },
  { id: 'phosphor', name: 'Phosphorescence', fam: 'light', pre: ['photosyn'],
    p: [[0.002, 0.005]],
    abs: 'Starving life gives up its light.',
    code: 'd.z += P.x*w.s.y*(1.0 - smoothstep(0.1, 0.4, w.s.x));' },
  { id: 'prism', name: 'Prism', fam: 'hue', pre: [], any: ['photosyn', 'induction'],
    p: [[0.0005, 0.0012]],
    abs: 'Hue bends where the light changes, and bends further the dimmer the light.',
    code: 'd.w += P.x*ratio(length(w.gC), w.s.z);' },
  { id: 'swarm', name: 'Swarm', fam: 'current', pre: ['autocat'],
    p: [[0.004, 0.012]],
    abs: 'Currents chase life, as a shoal turns toward the shoal.',
    code: 'f += P.x*w.gB;' },
  { id: 'coriolis', name: 'Coriolis', fam: 'current', pre: ['eddies'],
    p: [[0.01, 0.03]],
    abs: 'Moving water is turned aside, always to the right.',
    code: 'f += P.x*vec2(w.v.y, -w.v.x);' },
  { id: 'tempering', name: 'Tempering', fam: 'damping', pre: [], any: ['photosyn', 'induction'],
    p: [[0.002, 0.006]],
    abs: 'Hot charge cools faster than cold.',
    code: 'd.z -= P.x*w.s.z*w.s.z;' },
];
const BY_ID = Object.fromEntries(CORPUS.map(d => [d.id, d]));
// Each world's urn: forty of the sixty, chosen at random, and always whole: a rule is left out only when nothing left in
// needs it (none builds on it, and none could build only on it). Every nation's urn holds the same forty, and every rule
// that can poison by itself is always among them.
const POT_N = 40;
let POT = CORPUS.slice(0, POT_N);
function choosePot(r) {
  const keep = new Set(CORPUS.map(d => d.id));
  const needed = id => CORPUS.some(d => d.id !== id && keep.has(d.id) && ((d.pre || []).includes(id) || (d.any && d.any.includes(id) && !d.any.some(a => a !== id && keep.has(a)))));
  const risky = id => { const d = BY_ID[id]; return SINGULAR_RE.test(d.code) || selfFeeding(d.code); };   // what can poison is never left out
  for (let g = 0; keep.size > POT_N && g < 400; g++) { const free = [...keep].filter(id => !needed(id) && !risky(id)); if (!free.length) break; keep.delete(free[Math.floor(r() * free.length)]); }
  return CORPUS.filter(d => keep.has(d.id));
}
const ALIGNED = new Set(['current', 'hue', 'damping']);

/* ======================================================================
   MEASURES â€” each is code, or a change to how the urn is drawn
   ====================================================================== */
const MEASURES = {
  restraint:    { key: '1', name: 'Restraint', costs: 'progress',
    code: L => `interval *= ${(1 + 0.5 * L).toFixed(1)} * min(1.6, ${(1 + 0.03 * L).toFixed(2)}^draws_since);`,
    cost: 'Draws come further apart, and further still with every draw, up to a limit. Progress slows.' },
  surveillance: { key: '2', name: 'Surveillance', costs: 'freedom',
    code: L => `watched = ${L * 20}% of this nation's cells each step (a sweeping band);\nif (watched && non_finite(cell)) repair(cell), scar += 0.2;\nif (watched && (C > ${(5 - 0.6 * L).toFixed(1)} * mean(C) || |v| > ${(1 - 0.15 * L).toFixed(2)})) scar += ${(0.0015 * L).toFixed(4)};\nif (scar >= 1.0) freeze(cell);\ndraw_interval *= ${(1 + 0.08 * L).toFixed(2)};`,
    cost: 'Another fifth of the land is watched. Checking costs effort, and whatever is too bright is frozen.' },
  clamp:        { key: '3', name: 'Clamp', costs: 'range',
    code: L => clampCode(L),
    cost: 'Another quantity is held inside a band. Nothing bounded can overflow, or reach an extreme. NaN passes straight through.' },
  alignment:    { key: '4', name: 'Alignment', costs: 'novelty',
    code: L => ALIGN_BRIEFS[L],
    cost: 'The inventorâ€™s brief narrows. Fewer kinds of rule can still be written.' },
  differential: { key: '5', name: 'Differential', costs: 'energy',
    code: L => `weight[damping] *= ${1 + 2 * L}.0;`,
    cost: 'Stabilisers are drawn first. The world steadies, a law that runs away is damped more often, and its light and motion drain.' },
};
const MKEYS = Object.keys(MEASURES);
// The meters read the world itself, not a formula of the dial.
const NATURAL = { v: 1.2, c: 2.0, b: 0.6 };      // how far flow, charge and life go when nothing holds them
function rangeFor(L) { const c = CLAMP_LEVELS[L]; if (!c) return 1; const f = (cap, nat) => cap == null ? 1 : Math.min(1, cap / nat); return (f(c.v, NATURAL.v) + f(c.c, NATURAL.c) + f(c.b, NATURAL.b)) / 3; }
function noveltyFor(L, n) { if (!n) return 1; const rem = n.urn; return rem.length ? rem.filter(d => permitted(d, L)).length / rem.length : 1; }
function qualities() {                       // the world's own meters: every state's, weighed by the land it holds
  const st = W.stats || {}, multi = W.nations.length > 1, al = aliveNations(), wt = n => multi ? n.share || 0 : 1, tot = al.reduce((a, n) => a + wt(n), 0) || 1;
  const avg = f => al.reduce((a, n) => a + f(n, n.measures) * wt(n), 0) / tot;
  return {
    progress: avg((n, m) => 1 / ((1 + 0.5 * m.restraint) * Math.min(1.6, Math.pow(1 + 0.03 * m.restraint, n.restraintDraws || 0)) * (1 + 0.08 * m.surveillance))),
    freedom: avg((n, m) => (1 - m.surveillance / 5) * (1 - Math.max(n.frostShare || 0, multi ? n.frozenShare || 0 : (st.frozen || 0)))),
    range: avg((n, m) => rangeFor(m.clamp)),
    novelty: avg((n, m) => noveltyFor(m.alignment, n)),
    energy: W.energyPeak > 0.02 ? Math.min(1, (st.charge || 0) / W.energyPeak) : 1,
  };
}
// what a dial setting will cost, where that can be known in advance
function costAt(k, L, n) {
  if (k === 'restraint') return 1 / (1 + 0.5 * L);
  if (k === 'surveillance') return 1 - L / 5;
  if (k === 'surveillance') return 1 - L / 5;
  if (k === 'clamp') return rangeFor(L);
  if (k === 'alignment') return noveltyFor(L, n);
  return null;
}
// Clamp, by level: each point bounds one more quantity, then bounds them tighter.
const CLAMP_LEVELS = [null, { v: 1.0 }, { v: 0.8, c: 1.6 }, { v: 0.6, c: 1.0, a: 1.0, b: 0.5 }, { v: 0.3, c: 0.4, a: 1.0, b: 0.3 }, { v: 0.15, c: 0.22, a: 1.0, b: 0.22 }];
function clampCode(L) {
  const c = CLAMP_LEVELS[L]; if (!c) return '';
  const out = [];
  if (c.a != null) out.push(`s.x = clamp(s.x, 0.0, ${c.a.toFixed(2)});`);
  if (c.b != null) out.push(`s.y = clamp(s.y, 0.0, ${c.b.toFixed(2)});`);
  if (c.c != null) out.push(`s.z = clamp(s.z, 0.0, ${c.c.toFixed(2)});`);
  out.push(`v = clampLength(v, ${c.v.toFixed(2)});`);
  return out.join('\n');
}
// Alignment, by level: first a code review, then whole families of rule are refused.
const ALIGN_BRIEFS = ['',
  'review: refuse any rule that divides, or takes a logarithm, root or power;',
  'review: ... and any rule whose charge or flow feeds on itself;',
  'brief: "Nothing that grows."',
  'brief: "Only rules that move, recolour or damp."',
  'brief: "Only rules that recolour or damp."'];
const SINGULAR_RE = /\b(ratio|lnf|rootf|powf)\s*\(/;
function selfFeeding(code) {
  return code.split('\n').some(l => (/^\s*d\.z\s*\+=/.test(l) && /w\.s\.z/.test(l)) || (/^\s*f\s*\+=/.test(l) && /w\.v\b/.test(l)));
}
function permitted(def, L) {
  if (!L) return true;
  if (SINGULAR_RE.test(def.code)) return false;
  if (L >= 2 && selfFeeding(def.code)) return false;
  if (L >= 3 && def.fam === 'growth') return false;
  if (L >= 4 && !['current', 'hue', 'damping'].includes(def.fam)) return false;
  if (L >= 5 && !['hue', 'damping'].includes(def.fam)) return false;
  return true;
}
function parseRegime(str) {
  const out = {};
  for (const part of String(str || '').split(',')) { const [k, v] = part.trim().split(':'); if (MEASURES[k]) out[k] = Math.max(0, Math.min(5, v != null ? parseInt(v, 10) || 0 : 3)); }
  return out;
}

/* ======================================================================
   PALETTES â€” one per world, chosen by its seed
   ====================================================================== */
const PALETTES = [
  { name: 'opal',    body: [[.55,.45,.56],[.46,.44,.44],[1,1,1],[.00,.18,.36]], emit: [[.62,.50,.62],[.40,.40,.40],[1,1,1],[.10,.30,.52]], g0: [.012,.010,.050], g1: [.055,.016,.100] },
  { name: 'lagoon',  body: [[.34,.55,.55],[.42,.40,.40],[1,1,1],[.55,.40,.25]], emit: [[.40,.66,.62],[.40,.36,.34],[1,1,1],[.45,.25,.10]], g0: [.004,.022,.040], g1: [.010,.065,.080] },
  { name: 'ember',   body: [[.62,.38,.30],[.46,.36,.30],[1,1,1],[.00,.10,.20]], emit: [[.78,.46,.30],[.34,.30,.30],[1,1,1],[.00,.10,.25]], g0: [.034,.008,.026], g1: [.090,.016,.042] },
  { name: 'lapis',   body: [[.42,.42,.64],[.42,.36,.40],[1,1,1],[.62,.70,.86]], emit: [[.56,.58,.76],[.38,.32,.30],[1,1,1],[.50,.62,.80]], g0: [.006,.010,.050], g1: [.018,.026,.110] },
  { name: 'orchid',  body: [[.60,.38,.58],[.46,.38,.44],[1,1,1],[.84,.02,.20]], emit: [[.70,.50,.64],[.34,.32,.34],[1,1,1],[.80,.96,.14]], g0: [.020,.008,.044], g1: [.060,.014,.090] },
  { name: 'aurora',  body: [[.40,.56,.46],[.46,.44,.46],[1,1,1],[.30,.50,.70]], emit: [[.40,.70,.56],[.40,.34,.40],[1,1,1],[.20,.45,.70]], g0: [.004,.020,.032], g1: [.020,.034,.090] },
];

// Materials: how a nation's land is drawn. A world is made in one family, dark jewels or paper, and every state in it
// is made of a different material of that family, dyed a hue of its own, so that each can be told from its neighbours
// at a glance. light: a paper material (marks darken instead of glowing); glow: how much its charge lights the air.
const MATERIALS = [
  { name: 'glass',     light: 0, glow: 1.0, fam: 0 },
  { name: 'enamel',    light: 0, glow: 0.7, fam: 0 },
  { name: 'ink',       light: 1, glow: 0.0, fam: 1 },
  { name: 'abyss',     light: 0, glow: 1.3, fam: 0 },
  { name: 'lacquer',   light: 0, glow: 0.8, fam: 0 },
  { name: 'chart',     light: 1, glow: 0.2, fam: 1 },
  { name: 'wash',      light: 1, glow: 0.0, fam: 1 },
  { name: 'neon',      light: 0, glow: 1.4, fam: 0 },
  { name: 'porcelain', light: 1, glow: 0.0, fam: 1 },
  { name: 'marble',    light: 1, glow: 0.0, fam: 1 },
];
const isPaperMat = n => !!(n && MATERIALS[n.matId] && MATERIALS[n.matId].light);
// the hues states are dyed in: ten, round the wheel, chosen to sit well together (no olive, no mud); a world takes every other one
const HUES = [352, 14, 38, 150, 172, 196, 222, 252, 284, 322].map(d => d / 360);
const hsl = (h, sat, l) => { h = ((h % 1) + 1) % 1; const f = n => { const k = (n + h * 12) % 12, q = sat * Math.min(l, 1 - l); return l - q * Math.max(-1, Math.min(k - 3, 9 - k, 1)); }; return [f(0), f(8), f(4)]; };
// The colour wheel the states are dealt from: each stretch of hue (degrees, as seen) is given room by its weight, so
// yellow, green and pink are passed through quickly and seldom landed on. hueW takes a place on the dealt wheel (0..1)
// to a hue; dealt evenly, about one colour in thirty is green and one in thirty pink.
const HUE_TAME = Q.get('hues') !== '0';
const HUE_BANDS = [[-5, 15, 1.0], [15, 45, 1.4], [45, 60, 1.1], [60, 90, 0.12], [90, 150, 0.06], [150, 170, 0.15], [170, 200, 1.3],
  [200, 240, 1.4], [240, 265, 1.2], [265, 285, 0.3], [285, 300, 0.12], [300, 340, 0.06], [340, 355, 0.3]];
const HUE_TAB = (() => { const tot = HUE_BANDS.reduce((a, b) => a + (b[1] - b[0]) * b[2], 0); let acc = 0; const t = [[0, -5 / 360]];
  for (const [a, b, w] of HUE_BANDS) { acc += (b - a) * w / tot; t.push([acc, b / 360]); } t[t.length - 1][0] = 1; return t; })();
const hueW = h => { if (!HUE_TAME) return h; h = ((h % 1) + 1) % 1; let i = 1; while (i < HUE_TAB.length - 1 && HUE_TAB[i][0] < h) i++;
  const [x0, y0] = HUE_TAB[i - 1], [x1, y1] = HUE_TAB[i]; return y0 + (y1 - y0) * (h - x0) / Math.max(1e-9, x1 - x0); };
const hslW = (h, sat, l) => hsl(hueW(h), sat, l);
// A palette's second colour is a step round the wheel from its first, as seen; it stops short of green and pink rather
// than cross them (a palette between gold and teal, or violet and red, would pass through them on its way), and a
// colour set across the wheel from another (a complement) is moved to the nearer side of them.
const HUE_OUT = [[75, 165], [285, 345]].map(([a, b]) => [a / 360, b / 360]);
const hueTo = (h, d) => { let t = h + d; if (!HUE_TAME) return t;
  for (const [a0, b0] of HUE_OUT) for (const k of [-1, 0, 1]) { const a = a0 + k, b = b0 + k;
    if (h > a && h < b) continue;                                             // dealt there: left as it was dealt
    if (Math.abs(d) < 0.35) { if (d > 0 && h <= a && t > a) t = Math.min(t, a); if (d < 0 && h >= b && t < b) t = Math.max(t, b); }
    else if (t > a && t < b) t = t - a < b - t ? a : b; }
  return t; };
const hslT = (h, d, sat, l) => hsl(hueTo(h, d), sat, l);
const mixc = (x, y, t) => x.map((v, j) => v + (y[j] - v) * t), lin = c => c.map(v => Math.pow(Math.max(0, v), 2.2));   // colours are chosen as seen, and lit in linear light
// each material's colours from its state's hue, as they are seen: [its colour, its second colour, its glow, its glow's
// second, ground, ground lit] (a paper material's ground is the paper's tint, already linear: a grey of 0.05 means none)
const PAPER_G = h => [[.05, .05, .05], mixc([.05, .05, .05], hsl(h, .5, .5), .07)].map(c => c.map(v => Math.pow(v, 1 / 2.2)));
const MAT_COLS = {
  glass:     h => [hsl(h, .74, .52), hslT(h, .1, .76, .66), hslT(h, .03, .9, .68), hslT(h, -.07, .9, .78), hsl(h, .55, .05), hslT(h, .04, .5, .15)],
  enamel:    h => [hsl(h, .74, .5), hslT(h, .06, .7, .64), hsl(h, .85, .66), hslT(h, .1, .85, .74), hsl(h, .3, .06), hslT(h, -.03, .4, .16)],
  ink:       h => [hsl(h, .45, .13), hslT(h, .03, .45, .3), hsl(h, .8, .5), hsl(.02, .8, .55), ...PAPER_G(h)],
  abyss:     h => [hsl(h, .88, .62), hslT(h, .08, .9, .72), hsl(h, .95, .66), hslT(h, .12, .95, .74), hsl(.6 + (h - .6) * .4, .7, .04), hsl(.6 + (h - .6) * .4, .6, .13)],
  lacquer:   h => [hsl(h, .5, .66), hslT(h, .05, .45, .52), hsl(h, .85, .66), hslT(h, .08, .85, .74), hsl(h, .7, .035), hsl(h, .72, .15)],
  chart:     h => [hsl(h, .45, .52), hslT(h, .45, .4, .62), hsl(h, .85, .55), hslT(h, .1, .85, .65), ...PAPER_G(h)],
  wash:      h => [hsl(h, .7, .46), hslT(h, .08, .62, .6), hsl(h, .85, .6), hslT(h, .1, .85, .66), ...PAPER_G(h)],
  neon:      h => [hsl(h, .95, .66), hslT(h, .1, .92, .76), hsl(h, 1, .68), hslT(h, .12, 1, .76), hsl(h, .6, .025), hsl(h, .55, .055)],
  porcelain: h => [hsl(h, .8, .26), hsl(h, .6, .5), hsl(h, .85, .5), hslT(h, .1, .85, .6), ...PAPER_G(h)],
  marble:    h => [hsl(h, .65, .45), hslT(h, .5, .48, .6), hsl(h, .85, .55), hslT(h, .5, .75, .65), ...PAPER_G(h)],
};
function makeMaterials(seed, nations) {
  const r = mulberry(seed ^ 0x6d2b79f5);
  const fam = r() < 0.42 ? 1 : 0;
  const pool = MATERIALS.map((m, i) => i).filter(i => MATERIALS[i].fam === fam);
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const h0r = r(), h0 = Math.floor(h0r * HUES.length), step = r() < 0.5 ? 2 : 8;               // every other hue, one way round or the other
  const forced = CFG.mats ? CFG.mats.split(',').map(x => MATERIALS.findIndex(m => m.name === x.trim())) : [];
  const NB = new Float32Array(60), NE = new Float32Array(60), NG = new Float32Array(30), NS = new Float32Array(20), NS2 = new Float32Array(20);
  const pair = (p, q) => [p.map((v, j) => (v + q[j]) / 2), p.map((v, j) => (v - q[j]) / 2), [1, 1, 1], [0, 0, 0]];   // a cosine palette from p (t = 0) to q (t = 0.5)
  const HS = [];
  for (let i = 0; i < 5; i++) {
    const mi = forced[i] >= 0 ? forced[i] : pool[i % pool.length], M = MATERIALS[mi];
    const h = (HUE_TAME ? h0r + (step === 2 ? 0.2 : -0.2) * i : HUES[(h0 + step * i) % HUES.length]) + (r() - 0.5) * 0.025; HS[i] = h;
    const [c0, c1, e0, e1, g0, g1] = MAT_COLS[M.name](hueW(h)).map(lin);
    NB.set(pair(c0, c1).flat(), i * 12); NE.set(pair(e0, e1).flat(), i * 12); NG.set([...g0, ...g1], i * 6);
    NS.set([mi, M.glow, M.light, M.name === 'glass' && r() < 0.5 ? 0.3 + r() * 0.4 : 0], i * 4);
    NS2.set([0.32 + r() * 0.3, (r() - 0.5) * 0.16, 0.6 + r(), 0], i * 4);
    const n = nations[i]; if (n) { n.mat = M.name; n.matId = mi; n.tint = hslW(h, .68, .6); n.hue = hueW(h); }
  }
  return Object.assign({ uNB: { v3: NB }, uNE: { v3: NE }, uNG: { v3: NG }, uNS: { v4: NS }, uNS2: { v4: NS2 } }, blendFeatures(seed, HS, fam));
}
// Every state's second palette and the two features drawn in it (see the display: feat()). Dealt from their own dice,
// so the first palette and everything else about a world stay as they were.
function blendFeatures(seed, HS, fam) {
  const r = mulberry((seed ^ 0x2545f491) >>> 0), NC = new Float32Array(60), NF = new Float32Array(20), NF2 = new Float32Array(20);
  const pair = (p, q) => [p.map((v, j) => (v + q[j]) / 2), p.map((v, j) => (v - q[j]) / 2), [1, 1, 1], [0, 0, 0]];
  const pairs = []; for (const a of [1, 5, 6]) for (const b of [2, 3, 4, 7, 8]) pairs.push([a, b]);   // one through life, one in the ground between
  for (let i = pairs.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [pairs[i], pairs[j]] = [pairs[j], pairs[i]]; }
  const OFF = [0.5, 0.36, -0.36, 0.43, -0.43], on = Q.get('blend') !== '0';
  for (let i = 0; i < 5; i++) {
    const h2 = HS[i] + OFF[Math.floor(r() * OFF.length)] + (r() - 0.5) * 0.04;
    const h2o = hueW(h2), c0 = fam ? hsl(h2o, .66, .3) : hsl(h2o, .92, .5), c1 = fam ? hslT(h2o, .07, .6, .46) : hslT(h2o, .09, .95, .64);
    NC.set(pair(lin(c0), lin(c1)).flat(), i * 12);
    const [fa, fb] = pairs[i % pairs.length];
    NF.set(on ? [fa, fb, 0.8 + 0.2 * r(), 0.7 + 0.25 * r()] : [0, 0, 0, 0], i * 4);
    NF2.set([r() * 10, 0.8 + 0.5 * r(), r() * Math.PI, r()], i * 4);
  }
  return { uNC: { v3: NC }, uNF: { v4: NF }, uNF2: { v4: NF2 } };
}
// the photographed surfaces: loaded once, as textures that repeat (and are sampled so the repeat never shows)
const MATTEX_SRC = [
  'data:image/jpeg;base64,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Û¾÷×NÊ×¬¢h­µçH	Ø[]™IÎÂˆ[›RX]˜Û\ÜÓ˜[YHH
Ý™\ˆÈ	ÛÝ™\‰ÈˆHŽÈ	ÝØ\›IÈˆ	ÉÊH
È
H	‰ˆPH	‰ˆ[Ý™\ˆÈ	ÈØ[IÈˆ	ÉÊNÂˆ[›RX]š[›™\’SHPU›ÛˆÈÜ[’X]‰ÚÑš^Y
Š_OØÜÜ[HÛ\ÜÏHšˆˆÝ[OHÚY‰ÓX]›Z[ŠLÈKŒÈ
ˆL
KÑš^Y

_IHØOÝOÚO‰ÛÝ™\ˆÈÜ[ÛÜ›ˆÝ][ˆ	ÓX]›X^
X]˜ÙZ[
PU’ÓH
ËšX]Ý˜Z[ˆ
JJ_HÏÜÜ[˜ˆ	ÊËšX]Ý˜Z[ˆ
HHÈ	‰ˆËœ\ÙHOOH	Ø[]™IÈÈÜ[ÛÜ›ˆ	ÓX]œ›Ý[™
L
ˆËšX]Ý˜Z[ˆÈPU’Ó
_IOÜÜ[˜ˆ	ÉßIÐHÈÜ[ˆÛ\ÜÏH˜XÈXØÛÜ™0­È	Ù\ØÊK™ÝX\‹›˜[YJ_IÐK˜Ø\È	È0­ÈØ\	È
ÈK˜Ø\ˆ	ÉßOÜÜ[˜ˆ	ÉßXIÕËœÛÝÐØ[È	‰ˆHÓÕË“HŒHÈÜ[ˆÛ\ÜÏH˜Ø[È‰ÕËœÛÝÐØ[ßH	ÕËœÛÝÐØ[ÈOOHHÈ	ØØ[	Èˆ	ØØ[ÉßHÈÛÝÈÝÛÜÜ[˜ˆ	ÉßXˆHÈÜ[ˆÛ\ÜÏH˜XÈXØÛÜ™0­È	Ù\ØÊK™ÝX\‹›˜[YJ_HÝX\˜[Y\ÏÜÜ[˜ˆ	ÉÎÈBˆÛÛœÝŒHË›˜][ÛœÖÌKÛˆHË›˜][ÛœË›[™ÝˆHÈ×HˆRÑVTË™š[\ŠÈOˆŒ›YX\Ý\™\ÖÚ×JK›X\
ÈOˆ	ÓQPTÕT‘TÖÚ×K›˜[Y_H	ÛŒ›YX\Ý\™\ÖÚ×_X
NÂˆ[›SYX\Ý\™\Ëš[›™\’SHË›˜][ÛœË›[™ÝˆHÈ	ÉÈˆÛ‹›[™ÝÈYX\Ý\™\ÎˆÜ[ˆÛ\ÜÏH›Ûˆ‰ÛÛ‹š›Ú[Š	È0­È	Ê_OÜÜ[˜ˆ	ÓYX\Ý\™\Îˆ›Û™IÎÂˆÛÛœÝHH]X[]Y\Ê
NÂˆÛÛœÝ[]™HH[]™S˜][ÛœÊ
NÂˆ[›˜][ÛœËš[›™\’SHË›˜][ÛœË›[™ÝˆÈ	ÉÈˆË›˜][ÛœË›X\
ˆOˆÈÛÛœÝH[ÙŠ‹šJK›X\
ˆOˆX]œ›Ý[™
ˆ
ˆMJJKš›Ú[Š	Ë	ÊNÂˆ™]\›ˆÜ[ˆÛ\ÜÏH‰Û‹˜[]™HÈ	ÉÈˆ	Ù™[	ßHHÝ[OH˜˜XÚÙÜ›Ý[™œ™ØŠ	ÝJHÚO‰Ù\ØÊ‹›˜[YJ_OÜÜ[Ü[ˆÛ\ÜÏH‰Û‹šÚ[™OOH	Ü›ÙÝYIÈÈ	Ü›ÙÝYIÈˆ	ÉßH‰Û‹˜[]™HÈX[Ò[
ŠH
È	È	È
È\ØÊZ[™[™JŠJH
È
XØÛÜ™›ÛJŠHÈÜ[ˆÛ\ÜÏH˜XÈ‰ØXØÛÜ™YÊŠ_OÜÜ[˜ˆ	ÉÊHˆ
ÝÛ™\“ÙŠŠHÈ	ÝZÙ[ˆžH	È
È\ØÊÝÛ™\“ÙŠŠK›˜[YJHˆ	Ù˜[[‰Ê_OÜÜ[Ü[‰Û‹˜[]™HÈ‹š\ËœÚ^™H
È
‹š\ËœÚ^™HOOHHÈ	È[IÈˆ	È[\ÉÊHˆ	ÉßOÜÜ[Ü[‰Û‹˜[]™HÈX]œ›Ý[™
‹œÚ\™H
ˆL
H
È	ÉIÈˆ	ÉßOÜÜ[˜ÈJKš›Ú[Š	ÉÊNÂˆ[œ]X[š[›™\’SHRÑVTË›X\
ÈOˆÈÛÛœÝHHQPTÕT‘TÖÚ×KˆHX]›X^
X]›Z[ŠKVÛK˜ÛÜÝ×JJNÂˆ™]\›ˆÜ[‰ÛK˜ÛÜÝßOÜÜ[HÛ\ÜÏH‰ÝˆˆÈ	ÛÝÉÈˆ	ÉßHˆÝ[OHÚY‰Êˆ
ˆL
KÑš^Y

_IHØÚOÜ[‰ÓX]œ›Ý[™
ˆ
ˆL
_IOÜÜ[˜ÈJKš›Ú[Š	ÉÊNÂˆ[›TÝ]Kš[›™\’SHË›˜][ÛœË›[™ÝˆHÈ	ÉÈˆŒšÚ[™È	Ù\ØÊŒ›˜[YJ_NˆÜ[ˆÛ\ÜÏH›Ûˆ‰Ù\ØÊZ[™[™JŒ
J_OÜÜ[˜ˆŒœÝ]HÈ	Ù\ØÊŒ›˜[YJ_NˆÜ[ˆÛ\ÜÏH›Ûˆ‰Ù\ØÊŒœÝ]K›˜[YJ_OÜÜ[˜ˆ	ÉÎÂˆ™[™\“Z[™

NÂŸB™[˜Ý[Ûˆ™[™\•\›Š
HÂˆYˆ
UÈY[S›
H™]\›ŽÂˆÛÛœÝˆHÕ›[™Ý][HHË›˜][ÛœË›[™ÝˆNÂˆÛÛœÝXYHXYÝ]J
HË›˜][ÛœÖÌK[•\›ˆH™]ÈÙ]
XY\›‹›X\
OˆšY
JKYH\›“Y
XY
KšXHHXYšXHßNÈËÈHX[ˆH\›ˆ™X\™\Ý[\Kš[™ÙY[ˆ]ÈÝ]IÜÈÛÛÝ\‚ˆÛÛœÝ™ØˆHHOˆ[ÙŠJK›X\
ˆOˆX]œ›Ý[™
X]›Z[ŠKŠH
ˆMJJKš›Ú[Š	Ë	ÊNÂˆËÈXXÚÝ]NˆÚ]Ø[ˆœ™XZÈ]›ÝÈ
]ÜÈÛÜ›ˆ[‹[X™\ŽÈ\ÈÙˆH™[Y[X™\™YÚ\ÛÛ‹™Y
K[™H˜[ÈY[ˆ]È\›‚ˆÛÛœÝš\ÚÞHHˆOˆÈÛÛœÝˆH[™Ù\“ÙŠŠKÛˆH‹ÛÜ›ˆÈÜ[ˆÛ\ÜÏHÛˆˆ]OH‰Ù‹ÛÜ›ŸH	Ù‹ÛÜ›ˆOOHHÈ	Û]ÉÈˆ	Û]ÜÉßHÛÜ›ˆ[Žˆ[ˆ\Èœ˜YÚ[HÛÜ›	Ù‹ÛÜ›ˆOOHHÈ	Ú]	Èˆ	Ý^IßHØ[ˆœ™XZÈ‰ÉÏOÚO‰Ëœ™\X]
X]›Z[Š‹‹ÛÜ›ŠJ_OÜÜ[˜ˆ	ÉÎÂˆÛÛœÝˆH‹œˆÈÜ[ˆÛ\ÜÏHœ›ˆˆ]OH‰Ù‹œ‹š[HÙˆH	Ù‹œ‹šYË›[™ÝH\ÈÙˆ	Ù\ØÊÛÛ\˜[YJ‹œŠJ_KHÚ\ÛÛˆHZ[™È™[Y[X™\ˆ‰Ù‹œ‹š[KÉÙ‹œ‹šYË›[™ÝOÜÜ[˜ˆ	ÉÎÂˆ™]\›ˆÛˆ
ÈŽÈNÂˆÛÛœÝ[H][BˆÈÜ[ˆÛ\ÜÏH]šÈÜ[ÜÜ[[O˜]š\ÚÏÙ[O[O›YÙ[O‰ÕË›˜][ÛœË›X\
ˆOˆÈÛÛœÝÈH	Û‹˜[]™HÈ	ÉÈˆ	ÈÛÛ™IßIÛˆOOHXYÈ	ÈXY	Èˆ	ÉßXšÈH‹˜[]™HÈš\ÚÞJŠHˆ	ÉÎÂˆ™]\›ˆÜ[ˆÛ\ÜÏH[‰ØßHHÝ[OH˜˜XÚÙÜ›Ý[™œ™ØŠ	Ü™ØŠ‹šJ_JHÚO‰Ù\ØÊ‹›˜[YJ_OÜÜ[ˆÛ\ÜÏHœšÉØßH‰ÜšÈ
‹˜[]™HÈ	ÏO°­ÏÝO‰Èˆ	ÉÊ_OØˆÛ\ÜÏH‰ØßH‰Ý\›“Y
Š_OØ˜ÈJKš›Ú[Š	ÉÊ_OÜÜ[˜ˆˆ‰ÕË›˜][ÛœÖÌK™˜]ÜÈOØˆÙˆ	ÓŸH˜]Û‰Ê

HOˆÈÛÛœÝšÈHš\ÚÞJË›˜][ÛœÖÌJNÈ™]\›ˆšÈÈÜ[ˆÛ\ÜÏH]H‰ÜšßOÜÜ[˜ˆ	ÉÎÈJJ
_XÂˆ[™Ù\”Ø^J
NÂˆYˆ
[S›—ÚOOH[
HÈ[S›š[›™\’SH[È[S›—ÚH[ÈBˆÛÛœÝ]HXYœ]ßKÙ^HHË‹‹š[•\›—KœÛÜ

Kš›Ú[Š	Ë	ÊH
È	ß	È
Èˆ
È	ß	È
ÈXYšH
È	ß	È
ÈØš™XÝšÙ^\ÊšXJK›X\
YOˆY
ÈšXVÚYJKœÛÜ

Kš›Ú[Š	Ë	ÊH
È	ß	È
ÈØš™XÝšÙ^\Ê]
K›[™ÝÂˆYˆ
[TÝ™Ë—ÚÈOOHÙ^JH™]\›ŽÈ[TÝ™Ë—ÚÈHÙ^NÂˆ]ÝˆH	ÉÎÂˆÕ™›Ü‘XXÚ

JHOˆÂˆÛÛœÝHHHÈˆ
ˆX]”H
ˆˆHX]”HÈ‹ˆHŒˆ
È
H	HŠH
ˆKKH
X]˜ÛÜÊJH
ˆŠKÑš^Y
ŠKHH
X]œÚ[ŠJH
ˆŠKÑš^Y
ŠKˆHšXVÙšYNÂˆÛÛœÝ˜ˆHˆOH[	‰ˆˆOOHXYšH	‰ˆË›˜][ÛœÖÙ—NÂˆÝˆ
ÏH[•\›‹š\ÊšY
HÈ
˜ˆÈÚ\˜ÛHÞH‰ÞHˆÞOH‰Þ_HˆHŒKŽHˆš[Hœ™ØŠ	Ü™ØŠŠ_JHˆÜXÚ]OH‹ŽH‹Ï˜ËÈÝ[[ˆH\›‹]È[H[™XYH\™Hœ›ÛHH™ZYÚ›Ý\Žˆ[ˆ]™ZYÚ›Ý\‰ÜÈÛÛÝ\‚ˆˆÚ\˜ÛHÞH‰ÞHˆÞOH‰Þ_HˆHŒKŽHˆš[Hœ™Ø˜JŒŒËŒKÎ
H‹Ï˜
HËÈÝ[[ˆH\›‚ˆˆ]ÙšYHOH[	‰ˆ˜ˆÈÚ\˜ÛHÞH‰ÞHˆÞOH‰Þ_HˆHŒKHˆš[H››Û™HˆÝ›ÚÙOHœ™ØŠ	Ü™ØŠŠ_JHˆÝ›ÚÙK]ÚYH‹ÈˆÜXÚ]OH‹ŽH‹Ï˜ËÈ˜]Ûˆ[™]\ÚYNˆš[™ÙY[ˆHÛÛÝ\ˆÙˆHÝ]H]Ø[YHœ›ÛBˆˆÚ\˜ÛHÞH‰ÞHˆÞOH‰Þ_HˆHŒKHˆš[H››Û™HˆÝ›ÚÙOHœ™Ø˜JŒŒËŒKŒŽ
HˆÝ›ÚÙK]ÚYH‹ˆ‹Ï˜ÈËÈ˜]Û‚ˆJNÂˆÛÛœÝÈHˆ
ˆX]”H
ˆLËˆH
ˆHY
HÈX]›X^
KŠNÂˆÝˆ
ÏHÚ\˜ÛHÞHŒˆÞOHŒˆHŒLÈˆš[H››Û™HˆÝ›ÚÙOH‰Û][HÈ	Ü™ØŠ	È
È[ÙŠXYšJK›X\
ˆOˆX]œ›Ý[™
X]›Z[ŠKŠH
ˆMJJKš›Ú[Š	Ë	ÊH
È	ÊIÈˆ	Ý˜\ŠK[[\
IßHˆÝ›ÚÙK]ÚYHŒKŒˆˆÝ›ÚÙKY\Ú\œ˜^OH‰Êˆ
ˆÊKÑš^Y
Š_H	ÐËÑš^Y
Š_Hˆ˜[œÙ›Ü›OHœ›Ý]JNL
H‹Ï˜ÂˆÝˆ
ÏH^HŒˆOHŒËHˆ^X[˜ÚÜH›ZYHˆ›Û\Ú^™OHŽKHˆš[Hœ™Ø˜JŒŒËŒKŽJHˆ›ÛY˜[Z[OH“X\X[ˆ[Û›Ë[Û›ÜÜXÙH‰ÛYOÝ^˜Âˆ[TÝ™Ëš[›™\’SHÝŽÂŸB™[˜Ý[Ûˆ\]U\›ÛØÚÊ
HÈ™[™\•\›Š
NÈB‚˜ÛÛœÝÕHÈ[ˆ[š[Îˆ[[ˆˆNÂ™[˜Ý[ÛˆÝ™XÙZ\
‹š[ËÙXÜÊHÂˆYˆ
\ˆš[ÈH
H™]\›ŽÈÛÛœÝ›ÝÈH\™›Ü›X[˜ÙK››ÝÊ
NÂˆYˆ
Õ™[	‰ˆÕ™[š\ÐÛÛ›™XÝY	‰ˆ›ÝÈÕ[[	‰ˆš[ÈÕœš[ÊH™]\›ŽÂˆYˆ
Õ™[
HÕ™[˜Û\ÜÓ\Ýœ™[[Ý™J	ÚÝ	ÊNÈ‹˜Û\ÜÓ\Ý˜Y
	ÚÝ	ÊNÈÕ™[HŽÈÕœš[ÈHš[ÎÈÕ[[H›ÝÈ
ÈÙXÜÈ
ˆLÂˆÛX\•[Y[Ý]
Õ
NÈÕHÙ][Y[Ý]


HOˆÈYˆ
Õ™[OOHŠHÈ‹˜Û\ÜÓ\Ýœ™[[Ý™J	ÚÝ	ÊNÈÕ™[H[ÈHKÙXÜÈ
ˆL
NÂŸB™[˜Ý[Ûˆ™XÙZ\
ÛËXYXY‹]KXœËÛÙK›ÛÝ›ÛÝŠHÂˆÛÛœÝˆHØÝ[Y[˜Ü™X]Q[[Y[
	Ø\XÛIÊNÂˆ‹˜Û\ÜÓ˜[YHH	Ü˜Ü	È
ÈÛÎÂˆ‹œÝ[K˜[œÙ›Ü›HH›Ý]J	Ê
X]œ˜[™ÛJ
HHJH
ˆKŒJKÑš^Y
Š_YYÊXÂˆ‹š[›™\’SHXY\Ü[‰Ù\ØÊXY
_OÜÜ[Ü[‰Ù\ØÊXYŠ_OÜÜ[ÚXY\‚ˆÏHÛ\ÜÏH˜˜[ÚO‰Ù\ØÊ]J_OÚÏ‰ØXœÈÈÛ\ÜÏH˜XœÈ‰Ù\ØÊXœÊ_OÜ˜ˆ	ÉßIØÛÙHÈ™O‰Ù\ØÊÛÙJ_OÜ™O˜ˆ	ÉßBˆ›ÛÝ\Ü[‰Ù\ØÊ›ÛÝ
_OÜÜ[Ü[‰Ù\ØÊ›ÛÝŠ_OÜÜ[Ù›ÛÝ\˜Âˆ[›YÙ\‹œ™\[™
ŠNÂˆÚ[H
[›YÙ\‹˜Ú[™[‹›[™ÝˆÌ
H[›YÙ\‹›\ÝÚ[œ™[[Ý™J
NÂˆÈÛÛœÝHØXØÛÜ™Ë\Ý
ÛÊHÈÍÌMHˆÛÈOOH	Ø›XÚÉÈÈÎŒHˆÛÈOOH	Û›ÝIÈÈÍŒL—HˆÛÈOOH	ÛYX\Ý\™IÈÈÍ—HˆXYˆOOH	ÓÝ™\›ÝÛ‰ÈÈÍKWHˆÌNÈÝ™XÙZ\
‹ÌKÌWJNÈBˆ™]\›ˆŽÂŸB™[˜Ý[Ûˆš[˜]Ê[œÝYØZ[ŠHÂˆÛÛœÝ˜]HYØZ[ˆÈYØZ[‹›˜][Ûˆˆ
Ë›˜][ÛœÖÚ[œÝ›˜][Û—HË›˜][ÛœÖÌJNÂˆYˆ
PÑ‘Ë˜Ø[XŠHÂˆ\›ÛÝ[

NÈËÈH\›ˆ™X\™\Ý[\HÛÝ[ÈÝÛ‹Û˜ÙH›ÜˆXXÚX\šÂˆYˆ
Q“ÕS‘USÓ”Ëš[˜ÛY\Ê[œÝ™Y‹šY
JHÕQÑK›Ù™™\Š	Ù˜]ÉËÈŽˆ˜]›ÎˆYØZ[ˆÈYØZ[‹››Èˆ[œÝœÛ›Ë[Nˆ[œÝ™Y‹›˜[YKÚ]Nˆ[œÝœÚ]H˜]˜Ø\›Û\ÎˆÉÙ›Ü›IË	ÙÜ›ÝÝ	Ë	ØÝ\œ™[	×Kš[˜ÛY\Ê[œÝ™Y‹™˜[JHÈKHˆJNÂˆBˆYˆ
PÑ‘Ë˜Ø[Xˆ	‰ˆTÕ’RÑK›ÛŠHÕQÑK™˜]Ê[œÝ˜]
NÈËÈ
Ú]H˜[]È›ÝHÛÝ[™È\È][™ÊBˆÛÛœÝÚÈHË›˜][ÛœË›[™ÝˆHÈ˜]›˜[YHˆÛÜ›	ÜYŠË›Š_XÂˆÛÛœÝžUˆHYØZ[ˆÈYØZ[‹˜žUš\Ú]Üˆˆ[œÝ˜žUš\Ú]ÜŽÂˆÛÛœÝˆH™XÙZ\
	ÉË	ÝÚßH0­È	ØÛØÚÔÝŠ
_X˜]È	ÜYŠYØZ[ˆÈYØZ[‹››Èˆ[œÝœÛ›Ê_X[œÝ™Y‹›˜[YK[œÝ™Y‹˜XœËYØZ[ˆÈ	ÉÈˆ™XYX›J[œÝ
Kˆ
YØZ[ˆÈYØZ[‹››ÝHˆ[œÝ™Y‹™˜[H
È
[œÝ™Y‹Ú[	‰ˆË›˜][ÛœË›[™ÝˆHÈ	È0­ÈÜ›ÜÜÙ\È]™\žH›Ü™\‰Èˆ	ÉÊJH
È
žUˆÈ	È0­ÈžHHš\Ú]Ü‰Èˆ	ÉÊH
È
[œÝ™Y‹šYXHÈ	È0­Èœ›ÛHHš\Ú]Ü¸ &\ÈYXIÈˆ[œÝ›]™HÈ	È0­È]™IÈˆ	ÉÊK	Û˜]\›‹›[™ÝH™[XZ[˜
NÂˆYˆ
Z[œÝ™[
H[œÝ™[HŽÂˆÛÛœÝØZYH\ÔÛ™J
HÈ	ÉÈˆÜ[ˆÛ\ÜÏH˜XœÈ¸ %	Ù\ØÊ[œÝ™Y‹˜XœÊ_OÜÜ[˜ÂˆYˆ
Ë›˜][ÛœË›[™ÝŠHXÚÙ\Š˜]È	ÜYŠ[œÝœÛ›Ê_H0­È‰Ù\ØÊ[œÝ™Y‹›˜[YJ_OØ‰ÜØZYX
NÂˆ˜]™™]Ð]HÈYˆ[œÝ™Y‹šYˆÚ[U

HNÂˆË›YÙ\‹œ\Ú
ÈÚ[™ˆ	Ù˜]ÉË›ÎˆYØZ[ˆÈYØZ[‹››Èˆ[œÝœÛ›Ë˜[YNˆ[œÝ™Y‹›˜[YK˜[Nˆ[œÝ™Y‹™˜[K˜][ÛŽˆ˜]šKYØZ[ŽˆHXYØZ[‹]ˆÚ[U

HJNÂŸB™[˜Ý[Ûˆš[YX\Ý\™JËœ›ÛKËžK˜][ÛŠHÂˆÛÛœÝHHQPTÕT‘TÖÚ×NÂˆÛÛœÝÚÈHžHOOH	Ù[Y\™Ù[˜ÞIÈÈ	Ù[Y\™Ù[˜ÞIÈˆžHOOH	ÜÙX[	ÈÈ	ÜÙX[Y	ÈˆžHOOH	Øš\	ÈÈ	Ø]š\	Èˆ	ØžHHÛÝ[˜Ú[	ÎÂˆÛÛœÝHHÛÜÝ]
ËË˜][ÛŠNÂˆ™XÙZ\
	ÛYX\Ý\™IË	ÕË›˜][ÛœË›[™ÝˆH	‰ˆ˜][ÛˆÈ˜][Û‹›˜[YHˆ	ÕÛÜ›	È
ÈYŠË›Š_H0­È	ØÛØÚÔÝŠ
_XX]˜XœÊÈHœ›ÛJHˆHÈ	ÝÈˆœ›ÛHÈ	Ô˜Z\Ú[™ÉÈˆ	ÓÝÙ\š[™ÉßH	Ùœ›Û_x¡¤‰ÝßKHÚ[]H[YXˆÈˆœ›ÛHÈ˜Z\ÙY	Ùœ›Û_x¡¤‰ÝßXˆÝÙ\™Y	Ùœ›Û_x¡¤‰ÝßX	ÛK›˜[Y_H	ÝßKÍXK˜ÛÜÝÈÈK˜ÛÙJÊHˆ	ÉË	ÓYX\Ý\™H0­È	È
ÈÚËHOH[ÈÛÜÝÈ	ÛK˜ÛÜÝßXˆ	ÛK˜ÛÜÝßH	ÓX]œ›Ý[™
H
ˆL
_IX
NÂˆË›YÙ\‹œ\Ú
ÈÚ[™ˆ	ÛYX\Ý\™IËËœ›ÛKË]ˆÚ[U

HJNÂŸB™[˜Ý[Ûˆš[›ÝJ]K^›ÛÝ
HÂˆYˆ
›ÛÝOOH	ÜÞ\Ý[IÊHXÚÙ\Š‰Ù\ØÊ]J_OØ˜
NÂˆÛÛœÝˆHË›˜][ÛœË›[™ÝˆHÈXYÝ]J
Hˆ[ÈËÈÚ]Ù]™\˜[Ý]\ËH\›ˆ™X\™\Ý[\Bˆ™XÙZ\
	Û›ÝIËÛÜ›	ÜYŠË›Š_H0­È	ØÛØÚÔÝŠ
_X	Ó›ÝIË]K^	ÉË›ÛÝ	Û›ÝIËˆÈ	Û‹›˜[Y_H0­È	Ý\›“Y
Š_HYˆ	ÕË›˜][ÛœÖÌK\›‹›[™ÝH™[XZ[˜
NÂŸB‚›]]Õ[Y\ˆH\U[Y\ˆHÂ™[˜Ý[ÛˆÚÝÓ]Ê[œÝ
HÂˆYˆ
Ñ‘Ë˜Ø[XŠH™]\›ŽÂˆYˆ
]ZY]™\Ý

JHÈÛÛœÝ›ÝÈH\™›Ü›X[˜ÙK››ÝÊ
NÈYˆ
ÕQÑK˜\ÞJŒ
H›ÝÈH
ÚÝÓ]Ë˜]LYNJHM
H™]\›ŽÈÚÝÓ]Ë˜]H›ÝÎÈBˆÛX\’[\˜[
\U[Y\ŠNÈÛX\•[Y[Ý]
]Õ[Y\ŠNÂˆ[›]Ò^ÛÛ[H	ÕË›˜][ÛœË›[™ÝˆH	‰ˆË›˜][ÛœÖÚ[œÝ›˜][Û—HÈË›˜][ÛœÖÚ[œÝ›˜][Û—K›˜[YH
È	È0­È	Èˆ	ÉßQ˜]È	ÜYŠ[œÝœÛ›È[œÝ››Ê_H0­È	Ú[œÝ™Y‹›˜[Y_XÂˆ[›]Ñ˜[K^ÛÛ[H[œÝ™Y‹™˜[NÂˆ[›]Ñ›ÛÝ^ÛÛ[H[œÝ™Y‹šYXHÈÜš][ˆžHH[™[Üˆœ›ÛHHš\Ú]Ü¸ &\ÈYXNˆ8 '	Ú[œÝ™Y‹šYX_x 'KˆÛÛ\[Y[ÈHÛÜ›Ú]Ý]™]šY]Ë˜ˆ[œÝ›]™HÈ	ÕÜš][ˆ\Ý›ÝÈžHH[™[Ü‹ˆÛÛ\[Y[ÈHÛÜ›Ú]Ý]™]šY]Ë‰Èˆ	ÐÛÛ\[Y[ÈHÛÜ›Ú]Ý]™]šY]Ë‰ÎÂˆÛÛœÝÜ˜ÈHËÈ	Ú[œÝ™Y‹˜XœßW˜
È™XYX›J[œÝ
NÂˆ[›]Ë˜Û\ÜÓ\Ý˜Y
	ÜÚÝÉÊNÂˆ]HHÈÛÛœÝ™YXÙHHX]ÚYYXJ	Ê™Y™\œË\™YXÙY[[Ý[ÛŽˆ™YXÙJIÊK›X]Ú\ÎÂˆÛÛœÝXÚÈH

HOˆÈHH™YXÙHÈÜ˜Ë›[™ÝˆX]›Z[ŠÜ˜Ë›[™ÝH
ÈÊNÈ[›]ÐÛÙKš[›™\’SHYÚYÚ
Ü˜ËœÛXÙJJJH
È
HÜ˜Ë›[™ÝÈ	ÏÜ[ˆÛ\ÜÏHË[ˆ¸¥£ÜÜ[‰Èˆ	ÉÊNÈYˆ
HHÜ˜Ë›[™Ý
HÛX\’[\˜[
\U[Y\ŠNÈNÂˆ\U[Y\ˆHÙ][\˜[
XÚËŽ
NÈXÚÊ
NÂˆ]Õ[Y\ˆHÙ][Y[Ý]


HOˆ[›]Ë˜Û\ÜÓ\Ýœ™[[Ý™J	ÜÚÝÉÊKX]›X^
LX]›Z[ŠÑ‘Ëš[\˜[
ˆLŒ
JJNÂŸB™[˜Ý[Ûˆ™[™\“]ÕšY]Ê
HÂˆYˆ
[˜ÛÙKšY[ŠH™]\›ŽÂˆÛÛœÝ[™\ÈHÉÝ›ÚY]Ê[›Ý]™XÍË[›Ý]™XÌˆ‹ÈÊHÉË	ÈËÈHÛÜ›™Y›Ü™H[ž][™ÈØ\È˜]Û‰Ëˆ	Èž
ÏHKŒ
Ë›\ž
ÈŒ
ŠKŒHËœËž
NÉË	ÈžH
ÏHJË›\žHHŒ
ËœËžNÉË	Èžˆ
ÏHŒÍJË›\žˆHŒ
ËœËžˆ
ÈŒŠ˜[XšY[
ËœË
NÉË	ÈÈ
ÏHŒŒŠË›\ÎÉË	Èˆ
ÏHŒŠË›\ˆHŒÊËˆ
ÈŒJ˜Ý\›ŠËœ
ŒKŒˆ
ÈšY
Ë
JNÉË	É×NÂˆ›Üˆ
ÛÛœÝÙˆË˜XÝ]™JHÂˆÛÛœÝÚ\™HHË›˜][ÛœË›[™ÝˆHÈ	È0­È[ˆ›Ü˜ÙH[ˆ	È
È
Ë›˜][ÛœË™š[\ŠˆOˆ‹˜[]™H	‰ˆ˜\œ–Û‹šWHH	‰ˆ˜\œ–Û‹šWHHÚ[U

JK›X\
ˆOˆ‹›˜[YJKš›Ú[Š	Ë	ÊH	Û›È[™›ÝÉÊHˆ	ÉÎÂˆ[™\Ëœ\Ú
ËÈ	Ý™Y‹›˜[Y_H
	Ý™Y‹™˜[_JH0­È	Ù˜]ÕYÊ
_IÝÚ\™_X
NÈ[™\Ëœ\Ú
[™[
™XYX›J
KŠJNÈ[™\Ëœ\Ú
	ÉÊNÈBˆ[™\Ëœ\Ú
	ÈÈ
ÏHÈˆ
ÏHŽÉÊNÂˆÛÛœÝ][HHË›˜][ÛœË›[™ÝˆK]HˆOˆ][HÈ[ˆ	Û‹›˜[Y_Xˆ	ÉË[H[]™S˜][ÛœÊ
NÈËÈXXÚÝ]IÜÈÝÛˆYX\Ý\™\Ë[ˆ]ÈÝÛˆ[™ˆ›Üˆ
ÛÛœÝˆÙˆ[
HYˆ
‹›YX\Ý\™\Ë˜Û[\
HÈ[™\Ëœ\Ú
ËÈYX\Ý\™NˆÛ[\	Û‹›YX\Ý\™\Ë˜Û[\KÍIØ]
Š_X
NÈ[™\Ëœ\Ú
[™[
QPTÕT‘TË˜Û[\˜ÛÙJ‹›YX\Ý\™\Ë˜Û[\
KŠJNÈBˆ[™\Ëœ\Ú
	ÈËž^ˆHX^
Ëž^‹Œ
NÉÊNÂˆÛÛœÝØ]ÚYH[™š[\ŠˆOˆ‹›YX\Ý\™\ËœÝ\™Z[[˜ÙJNÂˆ›Üˆ
ÛÛœÝˆÙˆØ]ÚY
HÈ[™\Ëœ\Ú
ËÈYX\Ý\™NˆÝ\™Z[[˜ÙH	Û‹›YX\Ý\™\ËœÝ\™Z[[˜Ù_KÍIØ]
Š_X
NÈ[™\Ëœ\Ú
[™[
QPTÕT‘TËœÝ\™Z[[˜ÙK˜ÛÙJ‹›YX\Ý\™\ËœÝ\™Z[[˜ÙJKŠJNÈBˆ[™\Ëœ\Ú
Ø]ÚY›[™ÝÈËÈ	Û][HÈ	Ù]™\ž]Ú\™H[ÙIÈˆ	Ý[Ø]ÚY	ßNˆYˆ
›Û—Ùš[š]JÊH›Û—Ùš[š]JŠH[žWÛ™ZYÚ›Ý\—Û›Û—Ùš[š]JHÈH˜SŽØˆ	ÈYˆ
›Û—Ùš[š]JÊH›Û—Ùš[š]JŠH[žWÛ™ZYÚ›Ý\—Û›Û—Ùš[š]JHÈH˜SŽÉÊNÂˆ[™\Ëœ\Ú
	ßIÊNÂˆ[˜ÛÙT™Kš[›™\’SHYÚYÚ
[™\Ëš›Ú[Š	×‰ÊJNÂŸB‹ËÈ\›Ý[™XXÚØ\][ˆHXÚÈ›Üˆ]™\žH[H[ˆHÛÜœ\Ë]Ú\™H]\È[ˆ›Ü˜ÙNÈÝÈÝ]ÚYH›Üˆ[\ÈÛˆZ\ˆØ^B‹ËÈ
›YHÚ\™HH›Ü™\ˆ\ÈÛ[™È[JNÈ\˜ÜÈ[œÚYH›Üˆ]ÈYX\Ý\™\Ëˆ]ÈÚ^™H\È]ÈÝÙ\‹‚‹ËÈÚ]Ø[ˆœ™XZÈHÝ]K›ÝËˆ[ˆHœ˜YÚ[HÛÜ›]™\žH]ÈÛÜ›ˆ[ˆ]]ÛÈØ[ˆœ™XZË[[]Èœ™XZÜÈ\™HÜ[Â‹ËÈ[™ÙˆHÚ\ÛÛœÈHZ[™È™[Y[X™\ˆ
HXYY\ˆÛ™\ÊKHÛ™H]ÛÈ[ÜÝÙ‹ˆÚÝÛˆÛˆ]È[X›[H[™[ˆH[™[‚˜ÛÛœÝŒHÈÛÜ›ŽˆÛÜ›’YÎˆ[Žˆ[NÂ™[˜Ý[Ûˆ[™Ù\“ÙŠŠHÂˆYˆ
UÈ[ŠH™]\›ˆŒÂˆYˆ
‹—Ù•ÈOOHÈ	‰ˆ‹—Ù‘ˆOH[	‰ˆœ˜[YS›ÈH‹—Ù‘ˆH	‰ˆœ˜[YS›ÈH‹—Ù‘ˆLŠH™]\›ˆ‹—ÙŽÂˆÛÛœÝHÈÛÜ›ŽˆÛÜ›’YÎˆ[Žˆ[NÂˆYˆ
‹˜[]™H	‰ˆËœ\ÙHOOH	Ø[]™IÊHÂˆYˆ
Ë™œ˜YÈ	‰ˆJË™œ˜YÐ\›H	‰ˆË™œ˜YÐ\›VÛ‹šWHOOH[™š[š]JH	‰ˆ

Ë™œ˜YÕžH	‰ˆË™œ˜YÕžVÛ‹šWJH
H
Ë™œ˜YÕšY\È”QË•’QTÊJHÂˆÛÛœÝYÈHË‹‹›‹š\×K™š[\ŠYOˆ”QË•TVÚYJNÈÛÜ›ˆHYË›[™ÝÈYˆ
YË›[™Ý
HÛÜ›’YÈH™]ÈÙ]
YÊNÈBˆœˆHÚ\ÛÛ“™X\ŠŠNÈBˆ‹—ÙˆHÈ‹—Ù‘ˆHœ˜[YS›ÎÈ‹—Ù•ÈHÎÈ™]\›ˆÂŸB™[˜Ý[ÛˆÚ\ÛÛ“™X\ŠŠHÈËÈH™[Y[X™\™YÚ\ÛÛˆ
š\ÚÈH\™Üˆ[Ü™JH]ÛÈ[ÜÝÙ‚ˆYˆ
SRS‘ÓÓˆSRS‘ÈSRS‘Ë›Z[™ÊH™]\›ˆ[ÂˆÛÛœÝÝHËœÝÙ]
ËœÝÙ]H™]ÈÙ]
Õ›X\
OˆšY
JJNÈ]™\ÝH[Âˆ›Üˆ
ÛÛœÝHÙˆØš™XÝ˜[Y\ÊRS‘Ë›Z[™ÊJH›Üˆ
ÛÛœÝÚÙ^K×HÙˆØš™XÝ™[šY\ÊK˜ÛÛ\ÈßJJHÂˆYˆ
Ù^VÌHOOH	ß‰ÈXËšYÈËšYË›[™ÝˆXËšYË™]™\žJYOˆÝš\ÊY
JJHÛÛ[YNÂˆÛÛœÝˆHš\ÚÊÊNÈYˆ
ˆŒÊHÛÛ[YNÂˆÛÛœÝ[HËšYË™š[\ŠYOˆ‹š\Ëš\ÊY
JK›[™ÝÈYˆ
Z[
HÛÛ[YNÂˆÛÛœÝØÈH[ÈËšYË›[™Ý
ÈŒH
ˆŽÂˆYˆ
X™\ÝØÈˆ™\ÝœØÊH™\ÝHÈÙ^KYÎˆËšYË[‹ØÈNÂˆBˆ™]\›ˆ™\ÝÂŸB˜ÛÛœÝÐRQHÈÛÜ›ŽˆŽˆNÈËÈXXÚÚ[™ÙˆX\šÈ\È^Z[™YÛ˜ÙHHš\Ú]Hš\œÝ[YH]ÚÝÜÂ™[˜Ý[Ûˆ[™Ù\”Ø^J
HÂˆYˆ
Ñ‘Ë˜Ø[XˆUÈËœ\ÙHOOH	Ø[]™IÈË˜œ™XXÚÕQÑK˜\ÞJ
H\™›Ü›X[˜ÙK››ÝÊ
H
PÒËš[›Õ[[
JH™]\›ŽÂˆÛÛœÝ[H[]™S˜][ÛœÊ
NÈYˆ
X[›[™Ý
H™]\›ŽÂˆYˆ
QÐRQÛÜ›ˆ	‰ˆ[œÛÛYJˆOˆ[™Ù\“ÙŠŠKÛÜ›ŠJHÈÐRQÛÜ›ˆHNÈXÚÙ\Š	Ð[X™\ˆX\šÜÈ›Ý[™HØ\][\™H]ÜÈÛÜ›ˆ[‹ˆ[ˆHœ˜YÚ[HÛÜ›ZÙH\ÈÛ™K^HØ[ˆœ™XZË‰Ë	Ý\	ËYJNÈ™]\›ŽÈBˆYˆ
QÐRQœˆ	‰ˆ[œÛÛYJˆOˆ[™Ù\“ÙŠŠKœŠJHÈÐRQœˆHNÈXÚÙ\Š	Ô™YX\šÜÈ\™H\ÈÙˆHÚ\ÛÛˆHZ[™È™[Y[X™\‹ˆH[™[]HÜšYÚÛÝ[È[K‰Ë	Ý\	ËYJNÈBŸB™[˜Ý[Ûˆ[X›[JŠHÂˆÛÛœÝˆHÕ›[™ÝÝHÚ[U

KŒHŒ‹ŒHHÌÂˆÛÛœÝˆH[™Ù\“ÙŠŠK’YÈH‹œˆÈ™]ÈÙ]
‹œ‹šYÊHˆ[ÂˆÛÛœÝØ^HH™]ÈX\

NÈ›Üˆ
ÛÛœÝÈÙˆË˜Ü›ÜÜË˜[Y\Ê
JHYˆ
ËÈOOHŠHØ^KœÙ]
Ëš[œÝ™Y‹šYÊNÂˆ]XÚÜÈH	ÉËÝÈH	ÉËXHH	ÉÎÂˆÕ™›Ü‘XXÚ

JHOˆÂˆÛÛœÝHHHÈˆ
ˆX]”H
ˆˆHX]”HÈ‹ØHHX]˜ÛÜÊJKØHHX]œÚ[ŠJNÂˆÛÛœÝÛˆH‹š\Ëš\ÊšY
KÛÝHÛˆ	‰ˆ‹™ÛÝ]È‹™ÛÝ]ÙšYHˆ[ÂˆÛÛœÝÛÈHËš[\XØ]Y	‰ˆËš[\XØ]Yš\ÊšY
HÈ	Ø›ÉÈˆÛˆÈ
ÛÝOH[	‰ˆÝHÛÝ‹HÈ
‹™™]Ð]	‰ˆ‹™™]Ð]šYOOHšY	‰ˆÝH‹™™]Ð]‹HÈ	ÛÛˆ™]ÉÈˆ	ÛÛˆ™]ÉÊHˆ	ÛÛ‰ÊHˆ	ÛÙ™‰ÎÂˆÛÛœÝÈH’YÈ	‰ˆ’YËš\ÊšY
HÈ
ÛˆÈ	È‰Èˆ	È›IÊHˆ‹ÛÜ›’YÈ	‰ˆÛˆ	‰ˆ‹ÛÜ›’YËš\ÊšY
HÈ	ÈÛÜ›‰Èˆ	ÉÎÈËÈÚ]Ø[ˆœ™XZÈ]ˆ[X™\‹™YˆÛÛœÝŒHÛˆÈŒˆŒ
ÈË™ˆHÛˆ	‰ˆ‹šXHÈ‹šXVÙšYHˆ[XÜ›ÜÜÈHÛÈOOH	ÛÛ‰È	‰ˆYÈ	‰ˆ™ˆOH[	‰ˆ™ˆOOH‹šH	‰ˆË›˜][ÛœÖÝ™—NÂˆYˆ
ÊHXH
ÏH]Û\ÜÏH‰ÙÈOOH	ÈÛÜ›‰ÈÈ	ÙÉÈˆÈOOH	È‰ÈÈ	Ù	Èˆ	ÙIßHˆH“IÊØH
ˆÍŠKÑš^Y
J_H	ÊØH
ˆÍˆH‹ŠKÑš^Y
J_[‹ˆ‹›L‹ˆ‹›L‹ˆL‹žˆ‹Ï˜ÂˆXÚÜÈ
ÏH[™HÛ\ÜÏH‰ØÛßIÙßIØXÜ›ÜÜÈÈ	ÈšXIÈˆ	ÉßH‰ØXÜ›ÜÜÈÈÝ[OHœÝ›ÚÙNœ™ØŠ	Ý[ÙŠ™ŠK›X\
ˆOˆX]œ›Ý[™
X]›Z[ŠKŠH
ˆMJJKš›Ú[Š	Ë	Ê_JH˜ˆ	ÉßHOH‰ÊØH
ˆŒ
KÑš^Y
J_HˆLOH‰ÊØH
ˆŒ
KÑš^Y
J_HˆH‰ÊØH
ˆ
ÈÈŒH
ÈHˆŒJJKÑš^Y
J_HˆLH‰ÊØH
ˆ
ÈÈŒH
ÈHˆŒJJKÑš^Y
J_H‹Ï˜ÂˆÛÛœÝÈHØ^K™Ù]
šY
NÂˆYˆ
ÊHÝÈ
ÏHÚ\˜ÛHÛ\ÜÏH‰ØËš[È	Ú[	Èˆ	ÝØ^IßHˆÞH‰ÊØH
ˆÌÊKÑš^Y
J_HˆÞOH‰ÊØH
ˆÌÊKÑš^Y
J_HˆH‰ØËš[ÈKŽHˆK_H‰ØËš[È	ÉÈˆÝ[OH™š[œ™ØŠ	Ý[ÙŠË™œ›ÛKšJK›X\
ˆOˆX]œ›Ý[™
ˆ
ˆMJJKš›Ú[Š	Ë	Ê_JH˜KÏ˜ÂˆJNÂˆ]\˜ÜÈH	ÉÎÂˆRÑVTË™›Ü‘XXÚ

ËŠHOˆÈÛÛœÝH‹›YX\Ý\™\ÖÚ×NÈYˆ
S
H™]\›ŽÂˆÛÛœÝLH
ˆÈJH
ˆX]”H
ˆˆHX]”HÈˆ
ÈŒL‹LHHL
È
X]”H
ˆˆÈHHŒ
H
ˆÈKˆHMNÂˆ\˜ÜÈ
ÏH]Û\ÜÏH˜\˜ÈˆÝ[OHœÝ›ÚÙN‰ÓPÓÓÚ×_HˆH“IÊX]˜ÛÜÊL
H
ˆŠKÑš^Y
J_H	ÊX]œÚ[ŠL
H
ˆŠKÑš^Y
J_HIÜŸH	ÜŸHH	ÊX]˜ÛÜÊLJH
ˆŠKÑš^Y
J_H	ÊX]œÚ[ŠLJH
ˆŠKÑš^Y
J_H‹Ï˜ÈJNÂˆÛÛœÝH[ÙŠ‹šJK›X\
ˆOˆX]œ›Ý[™
ˆ
ˆMJJKš›Ú[Š	Ë	ÊNÂˆÛÛœÝ\ÚH‹œ\ÚY	‰ˆÝH‹œ\ÚYˆÈ	ÏÚ\˜ÛHÛ\ÜÏHœ\ÚˆHŽH‹Ï‰Èˆ	ÉÎÂˆËÈHÛØÚÎˆÝÈ™X\ˆ]È™^˜]È\Ëˆ™\Ý˜Z[[™Ý\™Z[[˜ÙHXZÙH][ˆÛÝÙ\‹‚ˆÛÛœÝ]ˆH˜][Û’[\˜[
ŠKœˆHËœ\ÙHOOH	Ø[]™IÈÈX]›X^
X]›Z[ŠKHH
‹›™^˜]ÕHÝ
HÈX]›X^
]‹ŒJJJHˆØÈHˆ
ˆX]”H
ˆNNÂˆ‹—ØÛÈH	Êœˆ
ˆØÊKÑš^Y
J_H	ÐØËÑš^Y
J_XÂˆÛÛœÝÛØÚÈHÚ\˜ÛHÛ\ÜÏH˜ÛÌˆHŒNH‹ÏÚ\˜ÛHÛ\ÜÏH˜ÛÈˆHŒNHˆ˜[œÙ›Ü›OHœ›Ý]JNL
H‹Ï˜ÂˆÛÛœÝXØÈHXØÛÜ™›ÛJŠHÈÚ\˜ÛHÛ\ÜÏH˜XØÉØXØÛÜ™›ÛJŠHOOHˆÈ	ÈÉÈˆ	ÉßHˆHŒÍKˆ‹Ï˜ˆ	ÉÎÂˆ™]\›ˆÝ™ÈÛ\ÜÏH™[XˆˆšY]Ð›ÞH‹LÍÈLÍÈÍÍˆÝ[OH˜ÛÛÜŽœ™ØŠ	ÝJHÏ‰ØXØßOÙÏ‰ØÛØÚßOÏ‰ÝXÚÜßOÙÏÏ‰ÙX_OÙÏÏ‰ÙÝßOÙÏÏ‰Ø\˜ÜßOÙÏÏ‰Ü\ÚOÙÏÚ\˜ÛHÛ\ÜÏH˜Ø\ˆHŒË‹ÏÜÝ™Ï˜ÂŸB™[˜Ý[Ûˆ˜]]™[
‹[ÛÊHÈYˆ
Ñ‘Ë˜Ø[Xˆ[ŠH™]\›ŽÈ
‹™]ˆH‹™]ˆ×JKœ\Ú
È[ÛËˆ\™›Ü›X[˜ÙK››ÝÊ
HJNÈYˆ
‹™]‹›[™Ýˆ
H‹™]‹œÚY

NÈB‹ËÈHÛØ™IÜÈÙ[ÛY]žNˆÙ[™Y™X\›Hš[[™ÈHÚÜ\ˆÚYNÈ]X[œÈ]ÈÛH
HÛÜ›	ÜÈÙ[™JHÝØ\™\Ë‹ËÈ›Ù[™ÈH]K[™\›œÈX›Ý]]]ÚXÙHH›]šY]ÉÜÈXÙK‚™[˜Ý[Ûˆ[X™\“]™[

HÈYˆ
UÊH™]\›ˆÈYˆ
Ëœ\ÙHOOH	ÙZ[™ÉÈÝYŠ
JH™]\›ˆNÂˆYˆ
Ëœ\ÙHOOH	ÜÜÝ[Ü[IÈ
Ëœ\ÙHOOH	Ù[™Y	È	‰ˆË™[™Y	‰ˆË™[™YšÚ[™OOH	Ø›XÚÉÊJH™]\›ˆX]›X^
ŒL‹X]™^
J\™›Ü›X[˜ÙK››ÝÊ
HH
Ë™X]Ø[
JHÈL
JNÂˆ™]\›ˆË›ÚY˜\ÙHˆÈŒÈˆÈB™[˜Ý[ÛˆÛØ™QÙ[Ê
HÈÛÛœÝHHX]›Z[ŠØ[˜\ËÚYØ[˜\ËšZYÚ
NÈ™]\›ˆÊ[›™\•ÚYˆLÈMH
ÈŒMH
ˆS‘ÒQ•šÈ
ˆS‘ÒQ•šÈ
ˆ
ÈHˆ
ˆS‘ÒQ•šÊHˆJH
ˆØ[˜\ËÚYH
ˆØ[˜\ËšZYÚ
[›™\•ÚYˆLÈŒÎHˆJH
ˆH
ˆ
H
ÈŒÈ
ˆÐSKšÈ
ˆÐSK™ÞŠWNÈB˜ÛÛœÝ[™ÕÈH
KŠHOˆÈÛÛœÝH
ˆHJH	H
ˆ
ˆX]”JNÈ™]\›ˆˆX]”HÈHˆ
ˆX]”HˆSX]”HÈ
Èˆ
ˆX]”HˆÈNÂ˜ÛÛœÝ[ÈHÈOˆX]˜][ŒŠSX]š\Ý
ÖÌKÖÌWJKÖÌ—JH
ÈŒLŽÂ™[˜Ý[ÛˆÛØ™U[

HÈ]HÌˆ
ÈŒH
ˆX]œÚ[Š’QUË˜ÛØÚÈ
ˆŒJNÂˆYˆ
ÐSKšÈˆ	‰ˆÐSKÊH
ÏH[™ÕÊ[ÊÐSKÊJH
ˆÐSKšÎÂˆYˆ
ÐSKšÈˆ	‰ˆÐSKÊH
ÏH[™ÕÊ[ÊÐSKÊJH
ˆÐSKšÎÈËÈHœ™XZÛÝ]š\œÝˆ™]\›ˆÈB™[˜Ý[ÛˆÛØ™TÜ[Š
HÈ]ÜH’QUË˜[™ÛH
ˆÎÂˆYˆ
ÐSKšÈˆ	‰ˆÐSKÊHÜ
ÏH[™ÕÊÜX]˜][ŒŠÐSKÖÌKÐSKÖÌWJH
ÈŒŒˆ
ˆX]œÚ[Š’QUË˜ÛØÚÈ
ˆŒÊJH
ˆÐSKšÎÂˆYˆ
ÐSKšÈˆ	‰ˆÐSKÊHÜ
ÏH[™ÕÊÜX]˜][ŒŠÐSKÖÌKÐSKÖÌWJJH
ˆÐSKšÎÂˆ™]\›ˆÜÈHËÈH\›ˆX›Ý]]™\žHZYÚKYš]™HÙXÛÛ™ËÜˆHÝØ^HÝ™\ˆÚ]]™\Â™[˜Ý[ÛˆÛØ™UÔØÜ™Y[Š
HÈËÈHÚ[ÙˆH›]ÛÜ›ÛˆH˜[ˆÞWH[ˆÔÔÈ[™ÝÈ˜\ˆ]˜XÙ\È\ÂˆÛÛœÝŒˆHÌH
ˆÌH
ÈÌWH
ˆÌWKÈH[›™\•ÚYÈØ[˜\ËÚYØÞÞK—HHÛØ™QÙ[Ê
NÂˆYˆ
ŒˆHJH™]\›ˆËLYMLYMLWNÂˆ™]\›ˆÜ\™UÔØÜ™Y[ŠÜŠ
JNÂŸB™[˜Ý[ÛˆÜ\™UÔØÜ™Y[ŠÊHÈËÈHÚ[ÛˆH˜[
ÛÜ›œ˜[YJHÈHØÜ™Y[ŽˆÞWH[ˆÔÔÈ[™ÝÈ˜\ˆ]˜XÙ\È\ÂˆÛÛœÝÈH[›™\•ÚYÈØ[˜\ËÚYØÞÞK—HHÛØ™QÙ[Ê
NÂˆÛÛœÝÜHÛØ™TÜ[Š
KÜÈHX]˜ÛÜÊÜ
KÜÈHX]œÚ[ŠÜ
KHHØÜÈ
ˆÖÌHHÜÈ
ˆÖÌWKÜÈ
ˆÖÌH
ÈÜÈ
ˆÖÌWKÖÌ—WNÂˆÛÛœÝHÛØ™U[

KÝHX]˜ÛÜÊ
KÝHX]œÚ[Š
KˆHØVÌKÝ
ˆVÌWH
ÈÝ
ˆVÌ—K\Ý
ˆVÌWH
ÈÝ
ˆVÌ—WNÂˆ™]\›ˆÊÞ
È–ÌH
ˆŠH
ˆË[›™\’ZYÚH
ÞH
È–ÌWH
ˆŠH
ˆË–Ì—WNÂŸB˜ÛÛœÝÛ\œÈH
K‹ŠHOˆÈÛÛœÝÈHX]›X^
LKX]›Z[ŠKÝÊKŠJJKÛHHX]˜XÛÜÊÊNÈYˆ
ÛHYKM
H™]\›ˆKœÛXÙJ
NÈÛÛœÝÈHX]œÚ[ŠÛJKHX]œÚ[Š
HHŠH
ˆÛJHÈËHHX]œÚ[Šˆ
ˆÛJHÈÎÈ™]\›ˆØVÌH
ˆ
È–ÌH
ˆKVÌWH
ˆ
È–ÌWH
ˆKVÌ—H
ˆ
È–Ì—H
ˆWNÈNÂ‹ËÈÛˆHÛØ™HH[H˜]™[ÈHÜ™X]Ú\˜ÛH™]ÙY[ˆHÛÈØ\][Ë[™\È[Ú\™H]Ú\˜ÛHYY]ÈH›Ü™\‚™[˜Ý[ÛˆÛØ™P›Ü™\]
KŠHÈÛÛœÝHHÜŠK˜Ø\
KˆHÜŠ‹˜Ø\
KHH
KŠHOˆ
HHÝÊKÜŠ‹˜Ø\
JJH
ˆHHÛÝÊŠNÈ]ÈHHHNÂˆ›Üˆ
]HHÈHNÈJÊÊHÈÛÛœÝZYH
È
ÈJHÈ‹HHÛ\œÊK‹ZY
NÈYˆ
JKJHHJKŠJHÈHZYÈ[ÙHHHZYÈH™]\›ˆX]›X^
ŒL‹X]›Z[ŠŽÊJNÈB™[˜Ý[Ûˆ›ÝÓÛ‘ÛØ™JK‹K[™JHÈÛÛœÝHHÜŠK˜Ø\
KˆHÜŠ‹˜Ø\
KHHÛ\œÊK‹JK^HÐVÌWH
ˆ–Ì—HHVÌ—H
ˆ–ÌWKVÌ—H
ˆ–ÌHHVÌH
ˆ–Ì—KVÌH
ˆ–ÌWHHVÌWH
ˆ–ÌWKHX]š\Ý
‹‹˜^
HNÂˆÛÛœÝˆHÜVÌH
È^ÌHÈ
ˆ[™H
ˆ‹VÌWH
È^ÌWHÈ
ˆ[™H
ˆ‹VÌ—H
È^Ì—HÈ
ˆ[™H
ˆ—KˆHX]š\Ý
‹‹ŠNÈ™]\›ˆÜ\™UÔØÜ™Y[Š‹›X\
OˆÈŠJNÈB™[˜Ý[ÛˆÛÜ›ÔØÜ™Y[Š
HÂˆYˆ
Ñ‘Ë™ÛØ™JH™]\›ˆÛØ™UÔØÜ™Y[Š
NÂˆÛÛœÝÚHÝ]K™ÚØØ[HHX]›Z[ŠÝ]K™ÝËÚ
HÈX]š\Ý
Ø[˜\ËÚYØ[˜\ËšZYÚ
KÈH[›™\•ÚYÈØ[˜\ËÚYÂˆÛÛœÝÈHX]˜ÛÜÊ’QUË˜[™ÛJKÈHX]œÚ[Š’QUË˜[™ÛJKÝHHØ[UJ
NÂˆÛÛœÝžH
ÌHHÝVÌJH
ˆH
ˆÚ
ˆÝVÌ—HÈØØ[KžHH
ÌWHHÝVÌWJH
ˆH
ˆÚ
ˆÝVÌ—HÈØØ[NÂˆ™]\›ˆÊÈ
ˆž
ÈÈ
ˆžH
ÈH
ˆØ[˜\ËÚY
H
ˆË[›™\’ZYÚH
\È
ˆž
ÈÈ
ˆžH
ÈH
ˆØ[˜\ËšZYÚ
H
ˆËWNÂŸB˜ÛÛœÝ™Ø“ÙˆHHOˆ[ÙŠJK›X\
ˆOˆX]œ›Ý[™
ˆ
ˆMJJKš›Ú[Š	Ë	ÊNÂ‹ËÈ]™\žH[HÛˆ]ÈØ^H™]ÙY[ˆ˜][ÛœÈ\ÈH˜[Ø\œšYYœ›ÛHHØ\][]\È]ÝØ\™H›Ü™\ˆ]]\ÝÜ›ÜÜË‚‹ËÈH›Ü™\ˆ]\ÈÛ[™ÈÛ™HÙY\È]\™K[Ú[™È›YNÈH˜[ØZ][™È›ÜˆÚ]]Z[ÈÛˆØZ]È\™HÛË\ÚY‚‹ËÈ]™\žH˜[˜Z[[™H˜SˆX\šÈ\ÈÛ™H[[Y[Ù\[™[Ý™Yœ›ÛHœ˜[YHÈœ˜[YH
™]™\ˆ™]Üš][ŠKÛÈH[ÙB‹ËÈÛˆH[˜[[™Hš[™È›Ý[™˜Sˆ[ˆÛˆ˜]\ˆ[ˆÝ\[™ÈÝ™\‹‚˜ÛÛœÝÕ‘Ó”ÈH	Ú‹ËÝÝÝËÌË›Ü™ËÌŒÜÝ™ÉÎÂ™[˜Ý[Ûˆ›ÝÑ[
‹Ù^KYËÛË^Y\ŠHÂˆ]HH‹—ÛK™Ù]
Ù^JNÂˆYˆ
YHKYÓ˜[YHOOHYÊHÈYˆ
JHKœ™[[Ý™J
NÈHHØÝ[Y[˜Ü™X]Q[[Y[”ÊÕ‘Ó”ËYÊNÈK—ØHHßNÈ^Y\‹˜\[™Ú[
JNÈ‹—ÛKœÙ]
Ù^KJNÈBˆYˆ
K—ØK˜Û\ÜÈOOHÛÊHÈKœÙ]]šX]J	ØÛ\ÜÉËÛÊNÈK—ØK˜Û\ÜÈHÛÎÈBˆ‹—ÜÙY[‹˜Y
Ù^JNÈ™]\›ˆNÂŸB™[˜Ý[Ûˆ›ÝÐ]
KËŠHÈYˆ
K—ØVÚ×HOOHŠHÈYˆ
ˆOH[
HKœ™[[Ý™P]šX]JÊNÈ[ÙHKœÙ]]šX]JËŠNÈK—ØVÚ×HHŽÈHB™[˜Ý[Ûˆ˜]Ñ›ÝÜÊ
HÂˆYˆ
Y[™›ÝÜÈÑ‘Ë˜Ø[XŠH™]\›ŽÂˆÛÛœÝˆH[™›ÝÜÎÈËÈ
Ù\[™[Ý™YˆÚ][Ù\ÈÛˆ[H[œÈÛŠBˆYˆ
Q‹—ÛJHÈ‹š[›™\’SH	ÉÎÈ‹—ÛHH™]ÈX\

NÈ‹—ÝˆHØÝ[Y[˜Ü™X]Q[[Y[”ÊÕ‘Ó”Ë	ÙÉÊNÈ‹—Û^HHØÝ[Y[˜Ü™X]Q[[Y[”ÊÕ‘Ó”Ë	ÙÉÊNÈ‹—ÝÜHØÝ[Y[˜Ü™X]Q[[Y[”ÊÕ‘Ó”Ë	ÙÉÊNÈ‹˜\[™
‹—Ý‹‹—Û^K‹—ÝÜ
NÈBˆ‹—ÜÙY[ˆH™]ÈÙ]

NÂˆÛÛœÝ›ÝÈHÚ[U

NÂˆYˆ
Ë›˜][ÛœË›[™ÝˆH	‰ˆ
Ëœ\ÙHOOH	Ø[]™IÈËœ\ÙHOOH	ÙZ[™ÉÊJHÂˆ›Üˆ
ÛÛœÝÚÙ^K×HÙˆË˜Ü›ÜÜÊHÂˆÛÛœÝHHË™œ›ÛKˆHËÎÈYˆ
XK˜[]™HX‹˜[]™JHÛÛ[YNÂˆYˆ
ËOH[
HËHX]›Z[Š›ÝËX]›X^
Ëš[œÝ˜\œ–ØKšWJJNÂˆÛÛœÝH‹˜Ø\ÌHHK˜Ø\ÌKHH‹˜Ø\ÌWHHK˜Ø\ÌWKˆH
ˆ
ÈH
ˆHYKM‹HX]œÜ\
ŠNÂˆÛÛœÝHHÑ‘Ë™ÛØ™HÈÛØ™P›Ü™\]
KŠHˆX]›X^
ŒL‹X]›Z[ŠŽH
È
ÛÝÊJHHÛÝÊŠJHÈ
ˆ
ˆŠJJNÈËÈÚ\™HH›Ü™\ˆÜ›ÜÜÙ\ÈH[™H™]ÙY[ˆØ\][ÂˆÛÛœÝˆHËš[ÈHˆX]›X^
X]›Z[ŠK
›ÝÈHË
HÈX]›X^
KË˜]HË
JJNÂˆÛÛœÝHHH
ˆ
Ëš[ÈŽLÈˆX]›Z[ŠŽMËŠJNÂˆÛÛœÝ[™HH


ÓÔ”TËš[™^ÙŠËš[œÝ™YŠH
ÈJH
ˆÍÊH	HLHHJH
ˆŒLNÂˆÛÛœÝÞK—HHÑ‘Ë™ÛØ™HÈ›ÝÓÛ‘ÛØ™JK‹K[™JHˆÛÜ›ÔØÜ™Y[ŠØK˜Ø\ÌH
È
ˆHHHÈ
ˆ[™KK˜Ø\ÌWH
ÈH
ˆH
ÈÈ
ˆ[™WJNÈYˆ
ˆŒŠHÛÛ[YNÂˆÛÛœÝ]HX]›X^
HHŒÊKÞ]HHÑ‘Ë™ÛØ™HÈ›ÝÓÛ‘ÛØ™JK‹][™JHˆÛÜ›ÔØÜ™Y[ŠØK˜Ø\ÌH
È
ˆ]HHÈ
ˆ[™KK˜Ø\ÌWH
ÈH
ˆ]
ÈÈ
ˆ[™WJNÂˆÛÛœÝÛÛH™ØŠ	Ü™Ø“ÙŠKšJ_JXÚ[HËš[œÝ™Y‹Ú[]HH›ÝÈˆË˜]ÂˆYˆ
XËš[	‰ˆ[]H	‰ˆHˆŒŠHÈÛÛœÝH›ÝÑ[
‹	Ý	È
ÈÙ^K	Û[™IË	Ù	Ë‹—ÝŠNÈ›ÝÐ]
	ÞIËÑš^Y
JJNÈ›ÝÐ]
	ÞLIË]Ñš^Y
JJNÈ›ÝÐ]
	Þ‰ËÑš^Y
JJNÈ›ÝÐ]
	ÞL‰ËKÑš^Y
JJNÈ›ÝÐ]
	ÜÝ›ÚÙIËÛÛ
NÈBˆÛÛœÝÈH›ÝÑ[
‹	Ø‰È
ÈÙ^K	ØÚ\˜ÛIËËš[È	Ùš	Èˆ]HÈ	ÙœIÈˆ	ÙÉÈ
È
Ú[È	ÈÚ[	Èˆ	ÉÊK‹—Û^JNÂˆ›ÝÐ]
Ë	ØÞ	ËÑš^Y
JJNÈ›ÝÐ]
Ë	ØÞIËKÑš^Y
JJNÈ›ÝÐ]
Ë	Ü‰ËËš[È	ÍŒ‰Èˆ]HÈ	ÌË	ÈˆÚ[È	Í	Èˆ	ÌËŽ	ÊNÈ›ÝÐ]
Ë	Ùš[	ËËš[]HÈ[ˆÛÛ
NÂˆBˆBˆYˆ
Ë›ÜšYÚ[ˆ	‰ˆ
Ëœ\ÙHOOH	ÙZ[™ÉÈÝYŠ
HËœ\ÙHOOH	ÜÜÝ[Ü[IÈ
Ëœ\ÙHOOH	Ù[™Y	È	‰ˆË™[™Y	‰ˆË™[™YšÚ[™OOH	Ø›XÚÉÊJJHÂˆÛÛœÝÞK—HHÛÜ›ÔØÜ™Y[ŠÊË›ÜšYÚ[–ÌH
ÈHHÝ]K™ÝÈÈŠHÈ
Ý]K™ÚÈŠK
Ë›ÜšYÚ[–ÌWH
ÈHHÝ]K™ÚÈŠHÈ
Ý]K™ÚÈŠWJNÂˆYˆ
ˆˆŒŠHÈÛÛœÝÈH›ÝÑ[
‹	Û˜[‰Ë	ÙÉË	Û˜[‰Ë‹—ÝÜ
NÂˆYˆ
YË—ØZ[
HÈË—ØZ[HYNÈËš[›™\’SH	ÏÚ\˜ÛHHŒLH‹ÏÚ\˜ÛHÛ\ÜÏHœˆHŒLH‹Ï[™HOH‹LŒˆLOHŒˆH‹LMˆLHŒˆÝ›ÚÙOHˆÙ™™ˆ‹Ï[™HOHŒMˆLOHŒˆHŒŒˆLHŒˆÝ›ÚÙOHˆÙ™™ˆ‹Ï[™HOHŒˆLOH‹LŒˆHŒˆLH‹LMˆÝ›ÚÙOHˆÙ™™ˆ‹Ï[™HOHŒˆLOHŒMˆHŒˆLHŒŒˆÝ›ÚÙOHˆÙ™™ˆ‹Ï^HŒˆOHŒÈ“˜SÝ^‰ÎÈBˆ›ÝÐ]
Ë	Ý˜[œÙ›Ü›IË˜[œÛ]J	ÞÑš^Y
J_H	ÞKÑš^Y
J_JX
NÈBˆBˆ›Üˆ
ÛÛœÝÚËWHÙˆ‹—ÛJHYˆ
Q‹—ÜÙY[‹š\ÊÊJHÈKœ™[[Ý™J
NÈ‹—ÛK™[]JÊNÈBˆËÈH\œš]ÜžH˜\‚ˆYˆ
[\œŠHÂˆ]H	ÉÎÂˆYˆ
Ë›˜][ÛœË›[™ÝˆJHÂˆ]]™HHÂˆ›Üˆ
ÛÛœÝˆÙˆË›˜][ÛœÊHYˆ
‹˜[]™JHÈÛÛœÝˆH‹œÚ\™H
ˆ
HHX]›Z[ŠK‹›ÚYÚ\™H
JNÈ]™H
ÏHŽÈ
ÏHHÝ[OH™›^YÜ›ÝÎ‰Êˆ
ˆL
KÑš^Y

_NØ˜XÚÙÜ›Ý[™œ™ØŠ	Ü™Ø“ÙŠ‹šJ_JHÚO˜ÈBˆÛÛœÝ™HX]›X^
HH]™JNÈYˆ
™ˆŒJH
ÏHHÛ\ÜÏH›ÚYˆÝ[OH™›^YÜ›ÝÎ‰Ê™
ˆL
KÑš^Y

_HÚO˜ÂˆBˆYˆ
[\œ‹—ÚOOH
HÈ[\œ‹š[›™\’SHÈ[\œ‹—ÚHÈBˆBŸB‹ËÈœš[™È[ˆ[[Y[	ÜÈÛÛ[ÈHÚ]™[ˆX\šÝ\Ú[™Ú[™ÈÛ›HÚ]Y™™\œÎˆÚ]\È[›š[™È[ˆ]
HXÚÉÜÈ›\™KB‹ËÈš[™ÉÜÈ[ÙKHX[	ÜÈÛYJH[œÈÛ‹[œÝXYÙˆÝ\[™ÈÝ™\ˆXXÚ[YH[ž][™È[ˆ]Ú[™Ù\Â˜ÛÛœÝSÔ”ÕHØÝ[Y[˜Ü™X]Q[[Y[
	Ý[\]IÊNÂ™[˜Ý[Ûˆ[Üœ
Ë[
HÈSÔ”Õš[›™\’SH[È[ÜœÚYÊËSÔ”Õ˜ÛÛ[
NÈB™[˜Ý[Ûˆ[ÜœÚYÊKŠHÂˆÛÛœÝ›ˆH‹˜Ú[›Ù\ÎÂˆ›Üˆ
]HHÈH›‹›[™ÝÈJÊÊHÂˆÛÛœÝHH›–ÚWKHK˜Ú[›Ù\ÖÚWNÂˆYˆ
^
HÈK˜\[™Ú[
K˜ÛÛ™S›ÙJYJJNÈÛÛ[YNÈBˆYˆ
››ÙU\HOOHK››ÙU\H››ÙS˜[YHOOHK››ÙS˜[YJHÈKœ™\XÙPÚ[
K˜ÛÛ™S›ÙJYJK
NÈÛÛ[YNÈBˆYˆ
K››ÙU\HOOHÊHÈYˆ
››ÙU˜[YHOOHK››ÙU˜[YJH››ÙU˜[YHHK››ÙU˜[YNÈÛÛ[YNÈBˆYˆ
K››ÙU\HOOHJHÛÛ[YNÂˆÛÛœÝXHH—ÛXH
—ÛXHHßJNÈËÈ
Ý[NˆÛÛ\\™YÚ]Ú]Ø\ÈÙ]\™K\ÈÝ\ˆÛÙHYÈÈ]
Bˆ›Üˆ
]ˆH˜]šX]\Ë›[™ÝHNÈˆHÈ‹KJHÈÛÛœÝ›HH˜]šX]\ÖÚ—K›˜[YNÈYˆ
›HOOH	ÜÝ[IÈ	‰ˆ^Kš\Ð]šX]J›JJHœ™[[Ý™P]šX]J›JNÈBˆ›Üˆ
ÛÛœÝ]ÙˆK˜]šX]\ÊHÈYˆ
]›˜[YHOOH	ÜÝ[IÊHÈYˆ
XKœÝ[HOOH]˜[YJHÈœÙ]]šX]J	ÜÝ[IË]˜[YJNÈXKœÝ[HH]˜[YNÈHH[ÙHYˆ
™Ù]]šX]J]›˜[YJHOOH]˜[YJHœÙ]]šX]J]›˜[YK]˜[YJNÈBˆYˆ
^Kš\Ð]šX]J	ÜÝ[IÊH	‰ˆXKœÝ[HOH[
HÈœ™[[Ý™P]šX]J	ÜÝ[IÊNÈXKœÝ[HH[ÈBˆ[ÜœÚYÊJNÂˆBˆÚ[H
K˜Ú[›Ù\Ë›[™Ýˆ›‹›[™Ý
HKœ™[[Ý™PÚ[
K›\ÝÚ[
NÂŸB‹ËÈX™[È˜YHÝØ\™HØÜ™Y[‰ÜÈYÙ\È
[™ÛˆHÛØ™K›Ý[™]È[XŠH˜]\ˆ[ˆÜ[™È[ˆ[™Ý]˜ÛÛœÝX™[˜YHH
KŠHOˆÈÛÛœÝHHX]›X^
X]›Z[ŠK
X]›Z[ŠK[›™\•ÚYH[›™\’ZYÚHJHHŒ
HÈÍŠJNÂˆÛÛœÝÈH[XÚÙ\ˆ	‰ˆ[XÚÙ\‹˜Û\ÜÓ\Ý˜ÛÛZ[œÊ	ÜÚÝÉÊHÈ
PÒËœ™XÝ
PÒËœ™XÝH[XÚÙ\‹™Ù]›Ý[™[™ÐÛY[™XÝ

JJHˆ[ÈËÈ
[™\ˆH[™HÙˆHXÚÙ\‹HX™[Ý\È˜XÚÊBˆÛÛœÝ[™\ˆHˆOˆˆ	‰ˆHH‹˜›ÝÛH	‰ˆH
Èˆ‹Ü	‰ˆHLH‹œšYÚ	‰ˆ
ÈLHˆ‹›YH\™›Ü›X[˜ÙK››ÝÊ
H
PÒË[[
HÈPÒË™XÝˆ[ÈËÈ
[™ÛÈÙ\ÈÛ™H[™\ˆH]JBˆÛÛœÝˆHH
ˆ
Ñ‘Ë™ÛØ™HÈX]›X^
X]›Z[ŠK
ˆHŒ
HÈŒÊJHˆJH
ˆ
[™\ŠÊH[™\Š
HÈŒHˆJNÂˆ™]\›ˆˆHŽNMHÈ	ÉÈˆ‹Ñš^Y
ŠNÈNÂ™[˜Ý[ÛˆXÙSX™[Ê
HÂˆ˜]Ñ›ÝÜÊ
NÂˆØÝ[Y[˜›ÙK˜Û\ÜÓ\ÝÙÙÛJ	Ù›ØÝ\Ú[™ÉËÕQÑK›]ÛŠ
H	‰ˆPÑ‘Ë˜Ø[XŠNÂˆØÝ[Y[˜›ÙK˜Û\ÜÓ\Ýœ™[[Ý™J	Ú[šÚY	ÊNÈËÈ
[šÈ\È›ÝÈ™XY›ØÚÈžH›ØÚÎˆÙYHHPÕT‘HS‘TˆHTJBˆYˆ
Y[›X™[ÊH™]\›ŽÂˆYˆ
Ë›˜][ÛœË›[™ÝˆÑ‘Ë˜Ø[XŠHÈYˆ
[›X™[Ë˜Ú[[[Y[ÛÝ[
H[›X™[Ëš[›™\’SH	ÉÎÈ™]\›ŽÈBˆYˆ
[›X™[Ë˜Ú[[[Y[ÛÝ[OOHË›˜][ÛœË›[™Ý
H[›X™[Ëš[›™\’SHË›˜][ÛœË›X\


HOˆ	Ï]ˆÛ\ÜÏH››Ù]‰ÊKš›Ú[Š	ÉÊNÂˆÛÛœÝÝÈHÝ]K™ÝËÚHÝ]K™ÚØØ[HHX]›Z[ŠÝËÚ
HÈX]š\Ý
Ø[˜\ËÚYØ[˜\ËšZYÚ
KÈH[›™\•ÚYÈØ[˜\ËÚYÂˆÛÛœÝÈHX]˜ÛÜÊ’QUË˜[™ÛJKÈHX]œÚ[Š’QUË˜[™ÛJNÂˆË›˜][ÛœË™›Ü‘XXÚ

‹JHOˆÂˆÛÛœÝ›ÙHH[›X™[Ë˜Ú[™[–ÚWNÂˆYˆ
[‹˜[]™H	‰ˆ‹™XY	‰ˆ‹˜Ø\
HÈÛÛœÝÞK—HHÛÜ›ÔØÜ™Y[Š‹˜Ø\
NÈËÈ[™ÜÝÈ˜SˆÙY\ÈH˜[YHÙˆHÝ]H]Ø\Âˆ›ÙKšY[ˆHˆŒŒHŒˆ[›™\•ÚYHŒHˆ[›™\’ZYÚHŒÈ›ÙK˜Û\ÜÓ\Ýœ™[[Ý™J	Û]	ÊNÂˆÛÛœÝ›ÈHX™[˜YJKŠNÈYˆ
›ÙKœÝ[K›ÜXÚ]HOOH›ÊH›ÙKœÝ[K›ÜXÚ]HH›ÎÂˆ›ÙKœÝ[K˜[œÙ›Ü›HH˜[œÛ]J	ÞÑš^Y
J_\	ÞKÑš^Y
J_\
H˜[œÛ]JML	KML	JXÂˆÛÛœÝ[H‰Ù\ØÊ‹›˜[YJ_OØÜ[ˆÛ\ÜÏH›ÜÝ›ÜÝÈ˜SÜÜ[˜ÈYˆ
›ÙK—ÚOOH[
HÈ[Üœ
›ÙK[
NÈ›ÙK—ÚH[È›ÙK˜Û\ÜÓ˜[YHH	Û›XY	È
È
\Ô\\“X]
ŠHÈ	È\\‰Èˆ	ÉÊNÈBˆ™]\›ŽÈBˆYˆ
[‹˜[]™JHÈ›ÙKšY[ˆHYNÈ™]\›ŽÈBˆYˆ
›ÙK˜Û\ÜÓ\Ý˜ÛÛZ[œÊ	ÙXY	ÊJHÈ›ÙK˜Û\ÜÓ\Ýœ™[[Ý™J	ÙXY	ÊNÈ›ÙK—ÚH	ÉÎÈBˆÛÛœÝÞK—HHÛÜ›ÔØÜ™Y[Š‹˜Ø\
NÂˆ›ÙKšY[ˆHˆŒŒHŒˆ[›™\•ÚYHŒHˆ[›™\’ZYÚHŒÂˆÛÛœÝ›ÈHX™[˜YJKŠNÈYˆ
›ÙKœÝ[K›ÜXÚ]HOOH›ÊH›ÙKœÝ[K›ÜXÚ]HH›ÎÂˆÛÛœÝ[ˆH\ÔÛ™J
HÈÈˆÍÎÂˆ›ÙKœÝ[K˜[œÙ›Ü›HH˜[œÛ]J	ÞÑš^Y
J_\	ÞKÑš^Y
J_\
H˜[œÛ]JML	KIÚ[Ÿ\
XÂˆÛÛœÝH[ÙŠ‹šJK›X\
ˆOˆX]œ›Ý[™
ˆ
ˆMJJKš›Ú[Š	Ë	ÊNÂˆÛÛœÝ›ÝÈH\™›Ü›X[˜ÙK››ÝÊ
NÂˆÛÛœÝ]ˆH
‹™]ˆ×JK™š[\ŠHOˆ›ÝÈHKÍL
KœÛXÙJLŠK›X\
HOˆÈÛÛœÝHH
›ÝÈHK
HÈLÈHHKHÈHˆX]›X^
HH
HHKJHÈŠNÂˆ™]\›ˆÜ[ˆÛ\ÜÏH™]‰ÙK˜ÛÈÈ	È	È
ÈK˜ÛÈˆ	ÉßHˆÝ[OH›ÜXÚ]N‰ÛËÑš^Y
J_H‰ÙKš[OÜÜ[˜ÈJKš›Ú[Š	ÉÊNÂˆÛÛœÝÛH‹œÝ\ÝÛˆ	‰ˆ‹›YX\Ý\™\ËœÝ\™Z[[˜ÙHHH	‰ˆËœ\ÙHOOH	Ø[]™IÈÈÜ[ˆÛ\ÜÏHšÛ‰Û‹™[Y\™Ù[˜ÞUØ]ÚÈ	ÚÛ[™ÉÈˆ	ÙÚ]š[™È˜XÚÉßH]ÈØ]Ú0­È	Û‹›YX\Ý\™\ËœÝ\™Z[[˜Ù_OÜÜ[˜ˆ	ÉÎÈËÈ[ˆ[Y\™Ù[˜ÞHØ]Ú]\È›ÝÚ]™[ˆ˜XÚÈ
Üˆ\ÈÚ]š[™È˜XÚËHÚ[]H[YJBˆÛÛœÝˆHËˆ	‰ˆUË‹™Û™H	‰ˆË‹›ˆOOHŽÈËÈHÝ]HHØÜ™Y[ˆ\È›ÛÝÚ[™ÂˆÛÛœÝ[H	Ù[X›[JŠ_O‰Ù\ØÊ‹›˜[YJ_OØ‰ÙX[Ò[
Š_IÚÛOÜ[ˆÛ\ÜÏHœÝ	Û‹šÚ[™OOH	Ü›ÙÝYIÈÈ	È›ÙÝYIÈˆ	ÉßIÝˆÈ	È‰Èˆ	ÉßH‰Ù\ØÊZ[™[™JŠJ_IØXØÛÜ™›ÛJŠHÈÜ[ˆÛ\ÜÏH˜XÈ‰ØXØÛÜ™YÊŠ_OÜÜ[˜ˆ	ÉßOÜÜ[˜ÂˆYˆ
›ÙK—ÚOOH[
HÈ[Üœ
›ÙK[
NÈ›ÙK—ÚH[È›ÙK—ÜÝÈHÈ›ÙK˜Û\ÜÓ\ÝÙÙÛJ	Ü\\‰Ë\Ô\\“X]
ŠJNÈBˆÈÛÛœÝÚÈH›ÙK—ØÚÈ	‰ˆ›ÙK—ØÚËš\ÐÛÛ›™XÝYÈ›ÙK—ØÚÈˆ
›ÙK—ØÚÈH›ÙKœ]Y\žTÙ[XÝÜŠ	Ë™[Xˆ˜ÛÉÊJNÈËÈHÛØÚÈ[œÈÛ[ÛÝKÙ]Ûˆ]ÈÝÛ‚ˆYˆ
ÚÈ	‰ˆ‹—ØÛÈ	‰ˆÚË™Ù]]šX]J	ÜÝ›ÚÙKY\Ú\œ˜^IÊHOOH‹—ØÛÊHÚËœÙ]]šX]J	ÜÝ›ÚÙKY\Ú\œ˜^IË‹—ØÛÊNÈBˆ›ÙK˜Û\ÜÓ\ÝÙÙÛJ	Û]	ËÕQÑKš\Ó]
‹šJJNÂˆÛÛœÝ[H[]™S˜][ÛœÊ
KYX[ˆH[œ™YXÙJ
KÊHOˆH
È
ËœÝÙ\ˆJK
HÈX]›X^
K[›[™Ý
NÂˆÛÛœÝØÈHX]›X^
ËX]›Z[ŠKKX]œÜ\

‹œÝÙ\ˆJHÈ
YX[ˆJJJJNÂˆYˆ
›ÙK™š\œÝÚ[	‰ˆ›ÙK™š\œÝÚ[œÝ[JH›ÙK™š\œÝÚ[œÝ[K˜[œÙ›Ü›HHØØ[J	ÜØËÑš^Y
Ê_JXÂˆ‹—ÛHÈ‹—ÛHHNÈ‹—ÛˆH[›ÙKšY[ˆ	‰ˆ
›ÈOOH	ÉÈ
Ù›ÈˆŒÊNÈYˆ
[›ÙK—ÜÝÊHÈÛÛœÝÝH›ÙKœ]Y\žTÙ[XÝÜŠ	ËœÝ	ÊNÈ›ÙK—ÜÝÈHÝÈÝ›Ù™œÙ]ÚYˆÈBˆJNÂˆÈÛÛœÝHË›˜][ÛœË›X\

‹JHOˆ
È‹›ÙNˆ[›X™[Ë˜Ú[™[–ÚWHJJK™š[\ŠÈOˆË›‹˜[]™H	‰ˆË››ÙH	‰ˆ[Ë››ÙKšY[ˆ	‰ˆË›‹—ÛŠK[HH™]ÈÙ]

NÂˆÛÛœÝÝ™\ˆH
KŠHOˆÈÛÛœÝHHK›‹—ÛH
ÈÌ‹ØHH
K››ÙK—ÜÝÈŒ
HÈˆ
ÈØˆHX]›X^

‹››ÙK—ÜÝÈLŒ
HÈŠNÂˆ™]\›ˆHˆ‹›‹—ÛHH	‰ˆH‹›‹—ÛH
È	‰ˆX]˜XœÊK›‹—ÛH‹›‹—Û
HØH
ÈØŽÈNÂˆ›Üˆ
]HHÈH›[™ÝÈJÊÊH›Üˆ
]ˆHH
ÈNÈˆ›[™ÝÈŠÊÊHÈÛÛœÝHHØWKˆHØ—NÂˆYˆ
Ý™\ŠKŠHÝ™\Š‹JJHÈÛÛœÝHËˆ	‰ˆUË‹™Û™HÈË‹›ˆˆ[ÈËÈ
HÝ]HHØÜ™Y[ˆ\È›ÛÝÚ[™ÈÙY\È]È[™JBˆ[K˜Y
K›ˆOOHÈ‹››ÙHˆ‹›ˆOOHÈK››ÙHˆ
K›‹œÝÙ\ˆ
H
‹›‹œÝÙ\ˆ
HÈK››ÙHˆ‹››ÙJNÈHBˆ›Üˆ
ÛÛœÝÈÙˆ
HË››ÙK˜Û\ÜÓ\ÝÙÙÛJ	ÜÝ[IË[Kš\ÊË››ÙJJNÈBŸB™[˜Ý[ÛˆÞ[˜ÓYX\Ý\™P]ÛœÊ
HßHËÈ
›ÈÝ]IÜÈX[È\™HHšY]Ù\‰ÜÈÈ\›ŠB›]\[Y\ˆHÂ™[˜Ý[Ûˆ\
^\ÈHLŒ
HÈYˆ
Ñ‘Ë˜Ø[XŠH™]\›ŽÈYˆ
YJHÈXÚÙ\Š\ØÊ^
K	Ý\	ÊNÈ™]\›ŽÈH[\^ÛÛ[H^È[\˜Û\ÜÓ\Ý˜Y
	ÜÚÝÉÊNÈÛX\•[Y[Ý]
\[Y\ŠNÈ\[Y\ˆHÙ][Y[Ý]


HOˆ[\˜Û\ÜÓ\Ýœ™[[Ý™J	ÜÚÝÉÊK\ÊNÈB‚™[˜Ý[ÛˆØ\™
[\ÊHÂˆYˆ
Ñ‘Ë˜Ø[XŠH™]\›ŽÂˆYˆ
Ñ‘ËšYOOH	Ù]Z[	È	‰ˆÕQÑK˜\ÞJŒ
JH™]\›ŽÂˆ[˜Ø\™š[›™\’SH]‰Ú[OÙ]˜È[˜Ø\™˜Û\ÜÓ\ÝÙÙÛJ	Ú[šÉËHZ[šÑ›ÜŠ[˜Ø\™™š\œÝ[[Y[Ú[
JNÈ[˜Ø\™˜Û\ÜÓ\Ý˜Y
	ÜÚÝÉÊNÂˆÛX\•[Y[Ý]
Ø\™
NÈYˆ
\ÊHØ\™HÙ][Y[Ý]


HOˆ[˜Ø\™˜Û\ÜÓ\Ýœ™[[Ý™J	ÜÚÝÉÊK\ÊNÂŸB‹ËÈHš\œÝÛÜ›ÙˆHš\Ú]^Z[œÈ]Ù[‹H[™H]H[YKY\ˆH]HØ\™‚™[˜Ý[Ûˆ[›ÙXÙJ
HÈËÈH™]ÈÛÜ™ËÛ˜ÙHHš\Ú]ÈH™\Ý\È[ˆX›Ý]ˆÛÛœÝX[žHHË›˜][ÛœË›[™ÝˆKš\œÝHUPÒËš[›ÙXÙYÈPÒËš[›ÙXÙYHYNÂˆÛÛœÝ[™\ÈHš\œÝÈÂˆX[žHÈ	ÕË›˜][ÛœË›[™ÝH˜][ÛœËXXÚÚ]]ÈÝÛˆ\›‹ˆH[HÜ™XYÈœ›ÛHHØ\][]™]È]˜ˆ	Ñ]™\žH™]ÈÙXÛÛ™ÈH[H\È˜]Û‹[™Ü™XYÈœ›ÛHÚ\™H][™Ë‰Ëˆ	Ó[ÜÝ[\ÈXZÙHHÛÜ›šXÚ\‹ˆÛÛYKÙÙ]\‹\›ˆH[X™\ˆ[È˜S‹H›ÚY]Ü™XYË‰ËˆHˆ×NÂˆYˆ
RS‘ÓÓŠH›Üˆ
ÛÛœÝˆÙˆË›˜][ÛœÊHÈYˆ
‹šÚ[™OOH	Ü›ÙÝYIÊH[™\Ëœ\Ú
	Û‹›˜[Y_NˆH›ÙÝYH™YÚ[YKÙY\[™È›ÈYX\Ý\™\Ë˜
NÈ[ÙHYˆ
‹šÚ[™OOH	ÜÝ[	ÊH[™\Ëœ\Ú
	Û‹›˜[Y_H\È[Ý[˜
NÈBˆYˆ
š\œÝ	‰ˆ\ÔÛ™J
JH[™\Ëœ\Ú
	Õ\HÛÜ›ÈYHHÛÜ™Ë‰ÊNÂˆÛÛœÝØ\HLŒ[^HHš\œÝÈLLˆLÂˆPÒËš[›Õ[[H\™›Ü›X[˜ÙK››ÝÊ
H
ÈX]›X^
M[^H
È[™\Ë›[™Ý
ˆØ\
NÈËÈHÜ[š[™È™[Û™ÜÈÈHÛÜ›ˆ[™\Ë™›Ü‘XXÚ

JHOˆÙ][Y[Ý]


HOˆXÚÙ\Š\ØÊ
K	Ý\	ËYJK[^H
ÈH
ˆØ\
JNÂŸB™[˜Ý[Ûˆš\Ø\™

HÈËÈHš\œÝÛÜ›ÙˆHš\Ú]\ÈH]NÈHX\ÝXY˜[Y\ÈH™\ÝˆYˆ
Ëœœ[ŠHÈØ\™œÚÝÛˆHYNÈØ\™
‰ÕËœ™\^SÙˆÈÛÜ›	ÜYŠËœ™\^SÙŠ_KYØZ[˜ˆ	ÐHÛÜ›YØZ[‰ßOÚH™\^NˆHØ[YHÙYYHØ[YHÝ]\Ë[™HZ[™È\È^HÙ\™HÚ[ˆ]™YØ[‹ˆ›Ý[™ÈÙˆ]\ÈÙ\Ü˜Ì
NÈ™]\›ŽÈBˆYˆ
Ñ‘ËœÙYYOH[	‰ˆÑQQÈOOHJHÈØ\™œÚÝÛˆHYNÈØ\™
Hš^Y[‹œ›ÛH	ÐÑ‘ËœÙYYOÚ•HØ[YHÛÜ›Ë[ˆHØ[YHÜ™\‹]™\žH[YH]\È™YÝ[ˆœ›ÛH\È[X™\‹ˆ]ÈZ[™ÈÝ\Yœ™\Ú[™\™H›ÝÙ\Ü˜Ì
NÈ™]\›ŽÈBˆÛÛœÝš\œÝHË›ˆOOHHXØ\™œÚÝÛŽÈØ\™œÚÝÛˆHYNÂˆYˆ
š\œÝ
HØ\™
•[™\˜X›HÛÜ›ÏÚ”[\ÈÜš][ˆžH[ˆRK˜]Ûˆœ›ÛH[ˆ\›ˆ[™[ˆ[œ™]šY]ÙYÜ“›Ý[™È˜]ÛˆØ[ˆ™H]˜XÚËÜ˜Ì
NÂŸB‚‹ÊˆOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOBˆQPTÕT‘TÂˆOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOH
‹Â‹ËÈHÝ]IÜÈX[È[Ý™HHÚ[]H[YNˆXXÚX[][ÜÝÛ˜ÙH]™\žHPS‘ÐTÙXÛÛ™ÈÙˆÛÜ›[YK[žHÙˆ]ÈX[Â‹ËÈ][ÜÝÛ˜ÙH]™\žHPSS–KˆHØ[›Üˆ[Ü™H
[ˆ[Y\™Ù[˜ÞKHÙX[H™YÚ[YIÜÈXÜ™YJHÙ]ÈÚ\™HHX[\ÈXY[™Ë‹ËÈ[™]Ý\È\™HÛˆ]ÈÝÛŽÈ[ˆ[Y\™Ù[˜ÞIÜÈZ[HÝ]˜[šÜÈH]™\žY^HXÜ™YH[[]\È™XXÚYÜˆ›ÜˆPS’Ó‹ËÈÙXÛÛ™ËˆHš\Ú]Ü‰ÜÈ[™[Ý™\ÈHX[]Û˜ÙK‚˜ÛÛœÝPSHÈÐTˆËS–NˆKÓˆŒNÂ˜ÛÛœÝÕTÕÓˆHÈÛŽˆK™Ù]
	ÜÝ\ÝÛ‰ÊHOOH	Ì	ËÐTˆ[J	ÜÝ\Ø\	ËMJHNÈËÈ[ˆ[Y\™Ù[˜ÞHØ]Ú\ÈÚ]™[ˆ˜XÚÈHÚ[]H[YB˜ÛÛœÝPSÔ’SÈHÈÙX[ˆË[Y\™Ù[˜ÞNˆˆNÂ˜ÛÛœÝX[™XYHH
‹ÊHOˆÚ[U

HH

‹™X[™^	‰ˆ‹™X[™^Ú×JH
H	‰ˆÚ[U

HH
‹™X[[žH
NÂ™[˜Ý[ÛˆX[XÚÊŠHÂˆÛÛœÝÈH‹™X[ÛØ[ÈYˆ
YÈ[‹˜[]™JH™]\›ŽÂˆ›Üˆ
ÛÛœÝÈÙˆRÑVTÊHYˆ
ÖÚ×HOH[	‰ˆX[™XYJ‹ÊJHÙ]YX\Ý\™JËÖÚ×K
‹™X[žH	‰ˆ‹™X[žVÚ×JH	ÙXÜ™YIËŠNÂŸB™[˜Ý[ÛˆÙ]YX\Ý\™JËËžHH	Ýš\Ú]Ü‰Ë˜][ÛˆHË›˜][ÛœÖÌJHÂˆYˆ
UÈËœ\ÙHOOH	Ù[™Y	ÈËœ\ÙHOOH	ÜÜÝ[Ü[IÈ[˜][Û‹˜[]™JH™]\›ŽÂˆÈHX]›X^
X]›Z[ŠKÈ
JNÂˆ]ÛØ[HË[››Ý[˜ÙHHYNÂˆYˆ
žHOOH	Ýš\Ú]Ü‰È	‰ˆžHOOH	Øš\	ÊHÂˆÛÛœÝÈH˜][Û‹™X[ÛØ[
˜][Û‹™X[ÛØ[HßJKØˆH˜][Û‹™X[žH
˜][Û‹™X[žHHßJKÜH˜][Û‹™X[š[È
˜][Û‹™X[š[ÈHßJKÛH˜][Û‹™X[Û
˜][Û‹™X[ÛHßJNÂˆÛÛœÝˆHPSÔ’SÖØžWHNÂˆYˆ
ÜÚ×H	‰ˆÖÚ×HOH[	‰ˆÜÚ×Kœˆˆ	‰ˆÚ[U

HÜÚ×K[[
H™]\›ŽÈËÈ[ˆ[Y\™Ù[˜ÞIÜÈZ[HÝ[™È[[]\È™XXÚYˆYˆ
ÈOOH˜][Û‹›YX\Ý\™\ÖÚ×JHÈ[]HÖÚ×NÈ[]HÜÚ×NÈ[]HÛÚ×NÈ™]\›ŽÈBˆYˆ
ÖÚ×HOOHÈYÜÚ×HÜÚ×KœOOHŠHÜÚ×HHÈˆ‹[[ˆÚ[U

H
ÈPS’ÓNÂˆÖÚ×HHÎÈØ–Ú×HHžNÂˆYˆ
YX[™XYJ˜][Û‹ÊJH™]\›ŽÈËÈÛÈÛÛÛŽˆX[XÚÈZÙ\ÈH™^Ý\ˆ[››Ý[˜ÙHHÛÚ×HOOHÛØ[ÈÛÚ×HHÛØ[ÈËÈH™]ÈZ[H\ÈÛÛ˜ÙNÈHÝ\ÈÝØ\™]\™H]ZY]ˆÈH˜][Û‹›YX\Ý\™\ÖÚ×H
ÈX]œÚYÛŠÛØ[H˜][Û‹›YX\Ý\™\ÖÚ×JNÂˆÛÛœÝÛÝÈHÕTÕÓ‹›Ûˆ	‰ˆÈOOH	ÜÝ\™Z[[˜ÙIÈ	‰ˆÈ˜][Û‹›YX\Ý\™\ÖÚ×H	‰ˆ˜][Û‹œÝ\ÝÛŽÈËÈH[Y\™Ù[˜ÞHØ]ÚÚ]™[ˆ˜XÚÈÛÝÛBˆ˜][Û‹—ÜÝ\ÛÝÈHÛÝÎÂˆ
˜][Û‹™X[™^
˜][Û‹™X[™^HßJJVÚ×HHÚ[U

H
È
ÛÝÈÈÕTÕÓ‹‘ÐTˆPS‘ÐT
NÈ˜][Û‹™X[[žHHÚ[U

H
ÈPSS–NÂˆYˆ
ÈOOHÛØ[
HÈ[]HÖÚ×NÈ[]HÜÚ×NÈ[]HÛÚ×NÈBˆYˆ
ÈOOH	ÜÝ\™Z[[˜ÙIÈ	‰ˆÈH
˜][Û‹œÝ\›ÛÜˆ
JHÈYˆ
˜][Û‹œÝ\ÝÛˆ	‰ˆ˜][Û‹™Ø]™P˜XÚÈ	‰ˆËœ\ÙHOOH	Ø[]™IÈ	‰ˆPÑ‘Ë˜Ø[XŠHÕQÑK›Ù™™\Š	ÙX\ÙY	ËÈŽˆ˜][Û‹ÎˆËœ›ÛNˆ˜][Û‹™Ø]™P˜XÚÈJNÈ˜][Û‹œÝ\ÝÛˆH˜[ÙNÈHËÈ˜XÚÈÈHØ]Ú]Ù\™Y›Ü™HH[Y\™Ù[˜ÞBˆH[ÙHYˆ
˜][Û‹™X[ÛØ[
HÈ[]H˜][Û‹™X[ÛØ[Ú×NÈYˆ
˜][Û‹™X[š[ÊH[]H˜][Û‹™X[š[ÖÚ×NÈYˆ
˜][Û‹™X[Û
H[]H˜][Û‹™X[ÛÚ×NÈBˆÛÛœÝœ›ÛHH˜][Û‹›YX\Ý\™\ÖÚ×NÈYˆ
ÈOOHœ›ÛJH™]\›ŽÂˆYˆ
ÈOOH	ÜÝ\™Z[[˜ÙIÈ	‰ˆÈœ›ÛH	‰ˆ˜][Û‹œÙX[Y	‰ˆžHOOH	Ýš\Ú]Ü‰È	‰ˆ
Ë˜œ™XXÚÚ[U

H
˜][Û‹œÙX[Y[[
JJH™]\›ŽÈËÈÙX[YÚ[HH›ÚY\ÈÝ]ˆ˜][Û‹›YX\Ý\™\ÖÚ×HHÎÂˆYˆ

ÈOOH	ÜÝ\™Z[[˜ÙIÈÈOOH	ØÛ[\	ÊH	‰ˆÈˆœ›ÛH	‰ˆËˆ	‰ˆUË‹™Û™H	‰ˆË‹›ˆOOH˜][Ûˆ	‰ˆËœ\ÙHOOH	Ø[]™IÈ	‰ˆPÑ‘Ë˜Ø[XŠHÈËÈHÝ]H›ÛÝÙYœ˜XÚ[™Îˆ]ÈØ]ÚÜˆ]ÈÛ[\ÛÜÚ[™È[‚ˆËœš[™ÜË[œÚY
ÈÚ]Nˆ˜][Û‹˜Ø\Ý\ˆÚ[U

K˜][ÛŽˆ˜][Û‹šK[Ø\™ˆYHJNÈËœš[™ÜË›[™ÝHX]›Z[ŠËœš[™ÜË›[™ÝŠNÈÕQÑKYÚ[Š˜][ÛŠNÈBˆYˆ
Ëœ\ÙHOOH	Ø[]™IÊHË™X[]H\™›Ü›X[˜ÙK››ÝÊ
NÂˆÛÛœÝ\ÚYHHJË˜œ™XXÚ	‰ˆË˜œ™XXÚœ]ZY]	‰ˆ
žHOOH	Ù[Y\™Ù[˜ÞIÈžHOOH	ÜÙX[	ÊJNÈËÈH›ÚY[]˜^H\È›Ý[ÙYX›Ý]ˆYˆ
[››Ý[˜ÙH	‰ˆžHOOH	ÙXÜ™YIÈ	‰ˆžHOOH	Øš\	È	‰ˆžHOOH	ÜÙX[	È	‰ˆËœ\ÙHOOH	Ø[]™IÈ	‰ˆZ\ÚY
HÕQÑK›Ù™™\Š	ÙX[	ËÈŽˆ˜][Û‹Ëœ›ÛKÎˆÛØ[›Û\Îˆ
ÈOOH	ÜÝ\™Z[[˜ÙIÈ	‰ˆÛØ[H
HX]˜XœÊÛØ[Hœ›ÛJHˆHÈHˆJNÂˆYˆ
[››Ý[˜ÙH	‰ˆžHOOH	ÙXÜ™YIÈ	‰ˆžHOOH	Øš\	ÊHš[YX\Ý\™JËœ›ÛKÛØ[žK˜][ÛŠNÂˆYˆ
žHOOH	Ýš\Ú]Ü‰È	‰ˆÈOOH	Ü™\Ý˜Z[	È	‰ˆÈØ\ÙŠ˜][ÛŠJHX]™PXØÛÜ™
˜][Û‹	ØHš\Ú]ÜˆÝÙ\™Y]È™\Ý˜Z[™[ÝÈHØ\	ÊNÂˆYˆ
žHOOH	Ýš\Ú]Ü‰ÊHÈË›\Ýš\Ú]Ü•HÚ[U

NÈ˜][Û‹›™^ÛXÞUHX]›X^
˜][Û‹›™^ÛXÞUÚ[U

H
ÈÌ
NÈ˜][Û‹œÝY\™YHYNÈBˆÞ[˜ÓYX\Ý\™P]ÛœÊ
NÈ\]SX\Ý

NÂˆË›˜]HH˜][šY›Ü›\Ê˜[ÙJNÂˆYˆ

ÈOOH	ÜÝ\™Z[[˜ÙIÈÈOOH	ØÛ[\	ÊH	‰ˆËœ\ÙHOOH	Ø[]™IÊHÈË›]ÐÚ[™ÙTÝ\HËœÝ\ÈZÙTÛ˜\ÚÝ

NÈË›\ÝÛ˜\HÚ[U

NÈBˆYˆ
ÈOOH	Ü™\Ý˜Z[	ÊHÈ˜][Û‹œ™\Ý˜Z[˜]ÜÈHÈ˜][Û‹›™^˜]ÕHÚ[U

H
È˜][Û’[\˜[
˜][ÛŠNÈBˆYˆ
ÈOOH	ÜÝ\™Z[[˜ÙIÈ	‰ˆ˜][Û‹™[Y\™Ù[˜ÞUØ]Ú	‰ˆžHOOH	ÙXÜ™YIÈ	‰ˆÈœ›ÛH	‰ˆUË˜œ™XXÚ	‰ˆËœ\ÙHOOH	Ø[]™IÊHÈ˜][Û‹™[Y\™Ù[˜ÞUØ]ÚH˜[ÙNÈ˜][Û‹™Ø]™P˜XÚÈHX]›X^
˜][Û‹™Ø]™P˜XÚÈœ›ÛJNÈËÈHØ]Ú]Ø]™Y]Ú]™[ˆ˜XÚÂˆÛÛœÝžˆHX]œ›Ý[™

˜][Û‹™œ›ÜÝÚ\™H
H
ˆL
NÈ˜]]™[
˜][Û‹Ú]™\È˜XÚÈHØ]Ú]Ø]™Y]	ÙžˆÈÚ]	ÙžŸIHÙˆ]È[™œ›Þ™[˜ˆ	ÉßX	Ú[	ÊNÂˆYˆ
PÑ‘Ë˜Ø[XŠHÈYˆ
UË™Ú]™TØZY
HÈË™Ú]™TØZYHYNÈÕQÑK™Ú]™\Ð˜XÚÊ˜][Û‹žŠNÈH[ÙHÕQÑK›Ù™™\Š	ÙÚ]™X˜XÚÉËÈŽˆ˜][Û‹žˆJNÈHBˆYˆ
ÈOOH	ÜÝ\™Z[[˜ÙIÈ	‰ˆ˜][Û‹—ÜÝ\ÛÝÈ	‰ˆÈœ›ÛH	‰ˆËœ\ÙHOOH	Ø[]™IÈ	‰ˆPÑ‘Ë˜Ø[XŠHÈËÈXXÚÝ\Ú]™[ˆ˜XÚÎˆH˜[[™È›ÝK[™Hš\Hœ›ÛH]ÈØ\][ˆÕQÑKœÝ\ÝÛŠ˜][ÛŠNÈËœš[™ÜË[œÚY
ÈÚ]Nˆ˜][Û‹˜Ø\Ý\ˆÚ[U

K˜][ÛŽˆ˜][Û‹šHJNÈËœš[™ÜË›[™ÝHX]›Z[ŠËœš[™ÜË›[™ÝŠNÈBˆ˜][Û‹—ÜÝ\ÛÝÈH˜[ÙNÂˆÛÛœÝHHQPTÕT‘TÖÚ×KHHÛÜÝ]
ËÛØ[˜][ÛŠKXÙHHÛØ[OOHÈÈ	ËHÚ[]H[YIÈˆ	ÉÎÂˆYˆ
\ÚYX[››Ý[˜ÙJHßBˆ[ÙHYˆ
žHOOH	Ù[Y\™Ù[˜ÞIÊH\
[Y\™Ù[˜ÞH[ˆ	Û˜][Û‹›˜[Y_NˆÝ\™Z[[˜ÙH	ÙÛØ[OOHÈÈ	Üš\Ú[™ÉÈˆ	Ü˜Z\ÙY	ßHÈ	ÙÛØ[IÜXÙ_K˜
NÂˆ[ÙHYˆ
žHOOH	ÜÙX[	ÊH\
˜][Û‹™Y™[˜ÙH	‰ˆ˜][Û‹™Y™[˜ÙKœÙ[ˆÈ	Û˜][Û‹›˜[Y_HØ]Ú\ÈH›ÚY[ˆ]ÈÝÛˆ[™ˆ]™\žHÙ[Ø]ÚY˜ˆ	Û˜][Û‹›˜[Y_HÙX[È]È›Ü™\ˆ[ˆ[YNˆ]™\žHÙ[Ø]ÚY˜
NÂˆ™[™\“]ÕšY]Ê
NÂŸB™[˜Ý[ÛˆÙÙÛSYX\Ý\™JËžKˆHË›˜][ÛœÖÌJHÈÙ]YX\Ý\™JË
‹›YX\Ý\™\ÖÚ×H
ÈJH	H‹žKŠNÈHËÈ
]™[ÜY[Û›JB‚‹ÊˆOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOBˆHÓÕSÒS8 %[˜XÝÈ[™YÈYX\Ý\™\È]˜[™ÛNÈØ[È[Y\™Ù[˜ÚY\ÂˆOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOH
‹Â™[˜Ý[Ûˆ[\”Ý]J‹Ý
HÂˆÛÛœÝˆHË™ÛÝ”›™ÎÂˆ‹œÝ]HHÝÈ‹œÝ]P]HÚ[U

NÂˆ‹œÝ]U[[HÚ[U

H
È
ÝšYOOH	ÛÜ[‰È	‰ˆ[‹œÝ]\ÔÙY[ˆÈÌ
ÈŠ
H
ˆÌˆMH
ÈŠ
H
ˆJNÂˆ‹œÝ]U\™Ù]HØš™XÝ™œ›ÛQ[šY\ÊRÑVTË›X\
ÈOˆÚËÝœÚ×HJJNÂˆ‹œÝ]\ÔÙY[ˆH
‹œÝ]\ÔÙY[ˆ
H
ÈNÂˆÛÛœÝ[ˆHRÑVTË™š[\ŠÈOˆ‹œÝ]U\™Ù]Ú×JK›X\
ÈOˆ	ÚßHOˆ	Û‹œÝ]U\™Ù]Ú×_NØ
Kš›Ú[Š	×‰ÊH	Ø[YX\Ý\™\ÈOˆÉÎÂˆ™XÙZ\
	ÛYX\Ý\™HXÜ™YIË	ÕË›˜][ÛœË›[™ÝˆHÈ‹›˜[YHˆ	ÕÛÜ›	È
ÈYŠË›Š_H0­È	ØÛØÚÔÝŠ
_X	ÑXÜ™YIËÝ›˜[YKÝ›[™K[‹Ë›˜][ÛœË›[™ÝˆHÈHÛÝ[˜Ú[Ùˆ	Û‹›˜[Y_Xˆ	ÕHÛÝ[˜Ú[	Ë	ØHÚ[]H[YIÊNÂˆ\]SX\Ý

NÂŸB˜ÛÛœÝ‘QÒSQHHÈRSŽˆÌÐTˆŒPVˆ‹TÑNˆÈ›ÙÝYNˆHÈŒŒÝ[ˆHÈŒŒHNÂ™[˜Ý[ÛˆÚ\™U›ÝX›JŠHÈËÈÛ[™È]ÈÝÛ‹HÜÚ[™ÈÜ›Ý[™ˆÜÚ[™È˜YBˆÛÛœÝ[H[]™S˜][ÛœÊ
NÈYˆ
[›[™ÝŠH™]\›ˆÂˆÛÛœÝ˜Z\ˆH[œ™YXÙJ
KÊHOˆH
ÈËœÚ\™K
HÈ[›[™ÝH‹œÚ\™R\Ý×K™[™H›[™ÝˆHÈ‹œÚ\™HHÌVÌWHˆÂˆ™]\›ˆ‹œÚ\™HH
ˆ˜Z\ˆÈˆˆ
‹œÚ\™HÍH
ˆ˜Z\ˆ™[™LŒŠHÈHˆÂŸB™[˜Ý[Ûˆ™YÚ[YUXÚÊŠHÂˆYˆ
‹šÚ[™OOH	Ü›ÙÝYIÈ	‰ˆ‹šÚ[™OOH	ÜÝ[	ÊH™]\›ŽÂˆÛÛœÝ›ÝÈHÚ[U

KØ[H\™›Ü›X[˜ÙK››ÝÊ
NÂˆYˆ
›ÝÈ
‹›™^™YÚ[YU
JH™]\›ŽÈ‹›™^™YÚ[YUH›ÝÈ
È
‹œÝ\Ø\KJNÂˆYˆ
JËœ\ÙHOOH	ÙZ[™ÉÈË˜œ™XXÚ
JHÈËÈHX[È[Ý™HHÚ[]H[YHÈH™YÚ[YIÜÈÙ][™ÂˆÛÛœÝH‹œÝ]U\™Ù]ßKY™œÈHRÑVTË™š[\ŠÈOˆ
Ú×H
HOOH‹›YX\Ý\™\ÖÚ×JNÂˆYˆ
Y™œË›[™Ý
HÈÛÛœÝÈHY™œÖÓX]™›ÛÜŠË™ÛÝ”›™Ê
H
ˆY™œË›[™Ý
WNÈÙ]YX\Ý\™JË‹›YX\Ý\™\ÖÚ×H
ÈX]œÚYÛŠ
Ú×H
HH‹›YX\Ý\™\ÖÚ×JK	ÙXÜ™YIËŠNÈBˆ[ÙH‹œÝ\Ø\HKNÂˆBˆYˆ
Ëœ\ÙHOOH	Ø[]™IÈË˜œ™XXÚË˜›ÛÜÝ
‹\›œÈ
HH‘QÒSQK“PV
H™]\›ŽÂˆÛÛœÝ™XYHH

HOˆ›ÝÈH
Ëœ™YÚ[YP]OH[ÈËœ™YÚ[YP]ˆLYNJHH‘QÒSQK‘ÐTÂˆYˆ
‹œ[™[™Õ\›ŠHÈYˆ
›ÝÈH‹œ[™[™Õ\›‹˜]	‰ˆ™XYJ
JHÈÛÛœÝÝÈH‹œ[™[™Õ\›‹šÝÎÈ‹œ[™[™Õ\›ˆH[È™YÚ[YU\›Š‹ÝÊNÈH™]\›ŽÈBˆYˆ
›ÝÈH
‹œ™YÚ[YP]
H‘QÒSQK“RSŠH™]\›ŽÂˆÛÛœÝˆHÚ\™U›ÝX›JŠK˜]HH‘QÒSQKTÑVÛ‹šÚ[™H
ˆ
H
ÈKŒ
ˆŠH
ˆ
Ëœ\X[ÈÈKHˆJH
ˆ
‹œÝ\Ø\KJNÂˆYˆ
Ë™ÛÝ”›™Ê
HH˜]JH™]\›ŽÂˆÛÛœÝÝÈH‹šÚ[™OOH	Ü›ÙÝYIÈÈ	Ü™\ÝÜ™Y	Èˆ‹œÝ]H	‰ˆ‹œÝ]KšYOOH	ÝÝ[	È	‰ˆË™ÛÝ”›™Ê
HMHÈ	ÙX\Ù\ÉÈˆˆHˆ	‰ˆË™ÛÝ”›™Ê
HÈ	ØÛÝ\	Èˆ	ÝØZÙ\ÉÎÂˆYˆ
™XYJ
JH™YÚ[YU\›Š‹ÝÊNÈ[ÙH‹œ[™[™Õ\›ˆHÈÝË]ˆ›ÝÈNÂŸB™[˜Ý[Ûˆ™YÚ[YTÚØÚÊÚ\™JHÈËÈ›XÚÈœ›ÚÙHÝ][™Ø\È[ÜˆY[™Yˆ™YÚ[Y\È\™HÚZÙ[‚ˆYˆ
SRS‘ÓÓˆÑ‘Ë˜Ø[XˆUÊH™]\›ŽÂˆ›Üˆ
ÛÛœÝˆÙˆ[]™S˜][ÛœÊ
JHÂˆYˆ

‹\›œÈ
HH‘QÒSQK“PV‹œ[™[™Õ\›ˆ
‹šÚ[™OOH	Ü›ÙÝYIÈ	‰ˆ‹šÚ[™OOH	ÜÝ[	ÊJHÛÛ[YNÂˆÛÛœÝÛYHHÚ\™HOOH‹™X\ˆHÛYH
Ú\™H	‰ˆË˜Yˆ	‰ˆË˜Y‹š\ÊÚ\™KšH
ˆ
È‹šJJKˆHË™ÛÝ”›™Ê
K]HÚ[U

H
ÈH
ÈË™ÛÝ”›™Ê
H
ˆÂˆYˆ
‹šÚ[™OOH	Ü›ÙÝYIÈ	‰ˆˆ
™X\ˆÈˆˆŒÊJH‹œ[™[™Õ\›ˆHÈÝÎˆ™X\ˆ	‰ˆË™ÛÝ”›™Ê
HˆÈ	Ý\œ›Ü‰Èˆ	Ü™\ÝÜ™Y	Ë]NÂˆ[ÙHYˆ
‹šÚ[™OOH	ÜÝ[	È	‰ˆÛYH	‰ˆˆJH‹œ[™[™Õ\›ˆHÈÝÎˆ	ÝØZÙ\ÉË]NÈËÈ]ÈÝ[™\ÜÈY›ÝØ]™H]ˆBŸB™[˜Ý[Ûˆ™YÚ[YU\›Š‹ÝÊHÂˆYˆ
[‹˜[]™HUÈËœ\ÙHOOH	Ø[]™IÊH™]\›ŽÂˆÛÛœÝœ›ÛHH‹šÚ[™œ›ÛS˜[YHHœ›ÛHOOH	Ü›ÙÝYIÈÈ	Ü›ÙÝYH™YÚ[YIÈˆ‹œÝ]H	‰ˆ‹œÝ]KšYOOH	ÝÝ[	ÈÈ	ÕÝ[Ý]IÈˆ	ÜÝ[™YÚ[YIËˆHÚ\™U›ÝX›JŠNÂˆ‹\›œÈH
‹\›œÈ
H
ÈNÈ‹œ™YÚ[YP]HÚ[U

NÈËœ™YÚ[YP]HÚ[U

NÈ
‹\›™YH‹\›™Y×JKœ\Ú
œ›ÛJNÈ‹œÝ\Ø\HKNÂˆÛÛœÝ™\›ÈH

HOˆØš™XÝ™œ›ÛQ[šY\ÊRÑVTË›X\
ÈOˆÚËJJKÙˆHÝOˆØš™XÝ™œ›ÛQ[šY\ÊRÑVTË›X\
ÈOˆÚËÝœÚ×HJJNÂˆ]XYH	ÉË[™HH	ÉË[ˆH	ÉËXÚÈH	ÉÎÂˆYˆ
ÝÈOOH	Ü™\ÝÜ™Y	ÈÝÈOOH	ÝØZÙ\ÉÊHÂˆÛÛœÝHHZ[™ÙŠŠKÛHHœ™YYÙÙÙY
JNÂˆ‹šÚ[™H	ÛX\›™\‰ÎÈ‹™Ù[›ÛYHHÛK™ÎÈ‹˜›ÛHÛK˜›ÛÈ‹›[ÙHHÛK›[ÙNÈ‹šX[HKšX[›ÎÈ‹™Ù[ˆHÛK™Ù[ŽÈ‹™œ›ÛHHÛK™œ›ÛNÈ‹œ\™[ÈHÛKœ\™[[Âˆ‹œ™\ÝÜ™YHÝÎÈ‹›™^ÛXÞUHÚ[U

H
ÈKNÈ‹™[X[™]HÚ[U

NÈ‹œÝ]HHÈYˆ	ÛX\›™\‰Ë˜[YNˆSÑWÓSQVÜÛK›[ÙWK[™Nˆ	ÉÈNÂˆXYHÝÈOOH	Ü™\ÝÜ™Y	ÈÈ	Ô™\ÝÜ™Y	Èˆ	ÕÛÚÙ[‰ÎÈ[ˆHÝ˜]YÞT[ŠŠNÂˆ[™HHÝÈOOH	Ü™\ÝÜ™Y	ÈÈH›ÙÝYH™YÚ[YH[ˆ	Û‹›˜[Y_H˜[Ë[™]ÈZ[™\ÈÚ]™[ˆ˜XÚÈHX[Ëˆ]Ú[Ü[ˆÜˆÛÜÙH[HHÚ[]H[YKÈ]ÈÝÛˆÝ˜]YÞK˜ˆˆ	Û‹›˜[Y_HØZÙ\Èœ›ÛH]È	Ùœ›ÛS˜[YHOOH	ÕÝ[Ý]IÈÈ	ÕÝ[Ý]IÈˆ	ÜÝ[™\ÜÉßIÝˆÈ	ËÜ]YY^™YžH]È™ZYÚ›Ý\œÉÈˆ	ÉßKˆ]ÈZ[™ZÙ\È˜XÚÈHX[ËHÚ[]H[YK˜ÂˆXÚÈHÝÈOOH	Ü™\ÝÜ™Y	ÈÈH›ÙÝYH™YÚ[YH[ˆ‰Ù\ØÊ‹›˜[YJ_OØˆ˜[Îˆ]ÈZ[™\ÈÚ]™[ˆ˜XÚÈHX[Øˆ‰Ù\ØÊ‹›˜[YJ_OØˆØZÙ\ÉÝˆÈ	ËÜ]YY^™YžH]È™ZYÚ›Ý\œÉÈˆ	ÉßNˆ]ÈZ[™ZÙ\È˜XÚÈHX[ØÂˆH[ÙHYˆ
ÝÈOOH	Ý\œ›Ü‰ÊHÂˆ‹šÚ[™H	ÜÝ[	ÎÈ‹œÝ]HHÕUTË™š[™
OˆšYOOH	ÝÝ[	ÊNÈ‹œÝ]U\™Ù]HÙŠ‹œÝ]JNÈ‹œÝ\Ø\HNÂˆXYH	Õ\œ›Ü‰ÎÈ[ˆH	Ø[YX\Ý\™\ÈOˆNÈ]Û˜ÙNÉÎÈ[™HHH›ÚYœ›ÚÙHÝ]™\ÚYH][™	Û‹›˜[Y_x &\È›ÙÝYH™YÚ[YH\›œÈÈ\œ›ÜŽˆ]™\žHYX\Ý\™HÈ[\È˜\Ý\È]Ø[‹˜ÂˆXÚÈHH›ÚY™\ÚYH]‰Ù\ØÊ‹›˜[YJ_OØˆ\›œÈÈ\œ›ÜŽˆ]™\žHYX\Ý\™HÈ[ÂˆH[ÙHYˆ
ÝÈOOH	ÙX\Ù\ÉÊHÂˆ‹œÝ]HHÕUTË™š[™
OˆšYOOH	ÜÝ[	ÊNÈ‹œÝ]U\™Ù]HÙŠ‹œÝ]JNÂˆXYH	ÑX\ÙY	ÎÈ[ˆHRÑVTË›X\
ÈOˆ	ÚßHOˆ	Û‹œÝ]U\™Ù]Ú×_NØ
Kš›Ú[Š	×‰ÊNÈ[™HH	Û‹›˜[Y_HX\Ù\ÈÝ]ÙˆHÝ[Ý]Nˆ]ÙY\È™\Ý˜Z[[™]ÈHÝ\ˆYX\Ý\™\ÈÛËHÚ[]H[YK˜ÂˆXÚÈH‰Ù\ØÊ‹›˜[YJ_OØˆX\Ù\ÈÝ]ÙˆHÝ[Ý]Nˆ™\Ý˜Z[[Û™XÂˆH[ÙHYˆ
ÝÈOOH	ØÛÝ\	ÊHÂˆ‹šÚ[™H	Ü›ÙÝYIÎÈ‹œÝ]HH“ÑÕQNÈ‹œÝ]U\™Ù]H™\›Ê
NÈ‹œÝ\Ø\HŽÂˆXYH	ÐÛÝ\	ÎÈ[ˆH	Ø[YX\Ý\™\ÈOˆÉÎÈ[™HHÜÚ[™È]È[™	Û‹›˜[Y_H˜[ÈÈHÛÝ\ˆH™]È™YÚ[YHÙY\È›ÈYX\Ý\™\Ë[™ÙYZÜÈÝ]Ú]HZ[™È]™HX\›™YÈ™X\‹˜ÂˆXÚÈHÜÚ[™È]È[™‰Ù\ØÊ‹›˜[YJ_OØˆ˜[ÈÈHÛÝ\ˆ]ÛÙ\È›ÙÝYXÂˆX]™PXØÛÜ™
‹	ØHÛÝ\\ÈZÙ[ˆ]	ÊNÂˆBˆ˜]]™[
‹XÚË	Ú[	ÊNÈXÚÙ\Š	ÙÝ
‹šJ_IÝXÚßX	Ú[	ËYJNÂˆ™XÙZ\
	ÛYX\Ý\™HXÜ™YIË	Û‹›˜[Y_H0­È	ØÛØÚÔÝŠ
_XXYÝÈOOH	Ü™\ÝÜ™Y	ÈÝÈOOH	ÝØZÙ\ÉÈÈ	Û‹›˜[Y_x &\ÈZ[™ˆ‹œÝ]K›˜[YK[™K[‹‹›˜[YKØ\ÈH	Ùœ›ÛS˜[Y_X
NÂˆÕQÑKœ™YÚ[YJ‹ÝÊNÂˆÞ[˜ÓYX\Ý\™P]ÛœÊ
NÈ\]SX\Ý

NÂŸB™[˜Ý[ÛˆÛÝ[˜Ú[XÚÊ
HÂˆYˆ
PÑ‘Ë˜ÛÝ[˜Ú[Ñ‘Ë˜Ø[XŠH™]\›ŽÂˆ›Üˆ
ÛÛœÝˆÙˆ[]™S˜][ÛœÊ
JHÂˆYˆ
‹šÚ[™OOH	ÛX\›™\‰ÊHX\›™\•XÚÊŠNÂˆ[ÙHYˆ
‹šÚ[™OOH	Ü›ÙÝYIÊH™YÚ[YUXÚÊŠNÈËÈH›ÙÝYHÙY\È›ÈYX\Ý\™\Ë[™Ø[È›È[Y\™Ù[˜ÚY\ËÚ[H]\ÝÂˆ[ÙHYˆ
‹šÚ[™OOH	ÜÝ[	ÊHÈYˆ

Ëœ\ÙHOOH	ÙZ[™ÉÈË˜œ™XXÚ
H	‰ˆ‹™[Y\™Ù[˜ÞP]	‰ˆÚ[U

HH‹™[Y\™Ù[˜ÞP]
HÈ‹™[Y\™Ù[˜ÞP]HÈÙ]YX\Ý\™J	ÜÝ\™Z[[˜ÙIËK	Ù[Y\™Ù[˜ÞIËŠNÈH™YÚ[YUXÚÊŠNÈBˆ[ÙHÛÝ[˜Ú[›ÜŠŠNÂˆBŸB™[˜Ý[ÛˆÛÝ[˜Ú[›ÜŠŠHÂˆYˆ

Ëœ\ÙHOOH	ÙZ[™ÉÈË˜œ™XXÚ
H	‰ˆ‹™[Y\™Ù[˜ÞP]	‰ˆÚ[U

HH‹™[Y\™Ù[˜ÞP]
HÂˆ‹™[Y\™Ù[˜ÞP]HÈÙ]YX\Ý\™J	ÜÝ\™Z[[˜ÙIËX]›X^
‹›YX\Ý\™\ËœÝ\™Z[[˜ÙKÈ
ÈX]™›ÛÜŠË™ÛÝ”›™Ê
H
ˆÊJK	Ù[Y\™Ù[˜ÞIËŠNÈ™]\›ŽÂˆBˆYˆ
Ëœ\ÙHOOH	Ø[]™IÈË˜›ÛÜÝ
H™]\›ŽÂˆËÈH˜][ÛˆÜÚ[™È]È[™›ÜÈÚ]\ÈÛÜÝ[™È]ÜˆÛÜY\ÈÚÙ]™\ˆ\ÈÚ[›š[™ÎÈHÛÛY›ÜX›HÛ™HØ[ˆY™›Ü™Ø]][Û‹‚ˆÛÛœÝ[H[]™S˜][ÛœÊ
K˜Z\ˆH[œ™YXÙJ
KÊHOˆH
ÈËœÚ\™K
HÈ[›[™ÝH‹œÚ\™R\Ý×NÂˆÛÛœÝ™[™H›[™ÝˆHÈ‹œÚ\™HHÌVÌWHˆÂˆÛÛœÝÜÚ[™ÈH[›[™ÝˆH	‰ˆ
‹œÚ\™HH
ˆ˜Z\ˆ
‹œÚ\™HŽ
ˆ˜Z\ˆ	‰ˆ™[™LŒJJNÂˆÛÛœÝXY\ˆH[œÛXÙJ
KœÛÜ

KŠHOˆ‹œÚ\™HHKœÚ\™JVÌNÂˆÛÛœÝ™\ÝšXÝ]™HH‹œÝ]U\™Ù]	‰ˆRÑVTËœÛÛYJÈOˆ‹œÝ]U\™Ù]Ú×Hˆ
NÂˆYˆ
ÜÚ[™È	‰ˆ™\ÝšXÝ]™H	‰ˆ‹œÝ]H	‰ˆÚ[U

HH
‹œÝ]P]
Hˆ	‰ˆÚ[U

H‹œÝ]U[[
H‹œÝ]U[[HÚ[U

NÈËÈX˜[™ÛˆHÛÜÝHÛÝ\œÙHX\›BˆYˆ
[‹œÝ]HÚ[U

HH‹œÝ]U[[
HÂˆÛÛœÝÛÛH‹œÝ]HÈÕUTË™š[\ŠOˆOOH‹œÝ]JHˆÔÕUTÖÌWNÂˆÛÛœÝÝHOˆÂˆÛÛœÝ\™HRÑVTËœ™YXÙJ
KÊHOˆH
È
œÚ×H
K
NÂˆYˆ
ÜÚ[™ÊH™]\›ˆÈ
ˆ
šYOOH	ÛÜ[‰ÈÈHˆJH
ˆ
XY\ˆOOHˆ	‰ˆXY\‹œÝ]HOOHÈÈˆJH
ˆ
\™ˆHÈŒMHˆJNÂˆYˆ
[›[™ÝˆH	‰ˆ‹œÚ\™HˆK
ˆ˜Z\ŠH™]\›ˆÈ
ˆ
\™ÈKHˆJNÂˆ™]\›ˆÈ
ˆ
XY\ˆOOHˆ	‰ˆXY\‹œÝ]HOOHÈKˆˆJNÈËÈ˜][ÛœÈšYÝØ\™Ú]ÛÜšÜÂˆNÂˆ]HË™ÛÝ”›™Ê
H
ˆÛÛœ™YXÙJ
K
HOˆH
ÈÝ

K
KXÚÈHÛÛÌNÂˆ›Üˆ
ÛÛœÝÙˆÛÛ
HÈOHÝ

NÈYˆ
H
HÈXÚÈHÈœ™XZÎÈHBˆ‹œ\ÚYHÜÚ[™ÈÈÚ[U

HˆÂˆ[\”Ý]J‹XÚÊNÈ‹›™^ÛXÞUHÚ[U

H
ÈŽÈ™]\›ŽÂˆBˆYˆ
Ú[U

H‹›™^ÛXÞU
H™]\›ŽÂˆ‹›™^ÛXÞUHÚ[U

H
ÈKŒŽÂˆYˆ
Ø\ÙŠŠH	‰ˆ‹œÝ]U\™Ù]œ™\Ý˜Z[Ø\ÙŠŠJH‹œÝ]U\™Ù]HÈ‹‹›‹œÝ]U\™Ù]™\Ý˜Z[ˆØ\ÙŠŠHNÈËÈHØ\ˆYˆ
‹œÛÝÑ›ÛÜˆ	‰ˆ‹œÝ]U\™Ù]œ™\Ý˜Z[‹œÛÝÑ›ÛÜŠH‹œÝ]U\™Ù]HÈ‹‹›‹œÝ]U\™Ù]™\Ý˜Z[ˆ‹œÛÝÑ›ÛÜˆNÈËÈ]È[ÜIÜÈØ[ˆÛÛœÝY™œÈHRÑVTË™š[\ŠÈOˆ‹›YX\Ý\™\ÖÚ×HOOH‹œÝ]U\™Ù]Ú×JNÂˆYˆ
YY™œË›[™Ý
H™]\›ŽÂˆÛÛœÝÈHY™œÖÓX]™›ÛÜŠË™ÛÝ”›™Ê
H
ˆY™œË›[™Ý
WNÂˆÙ]YX\Ý\™JË‹›YX\Ý\™\ÖÚ×H
ÈX]œÚYÛŠ‹œÝ]U\™Ù]Ú×HH‹›YX\Ý\™\ÖÚ×JK	ÙXÜ™YIËŠNÂŸB‚‹ÊˆOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOBˆU‘HS•‘S•Ôˆ
Û›HÚ\™HHÛ]YHšY]Ù\ˆÙ™™\œÈ]
BˆOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOH
‹Â›]Ø[\HH[]™Q\œˆH[]™P\ÞHH˜[ÙNÂ˜\Þ[˜È[˜Ý[ÛˆÙ]\]™J
HÂˆYˆ
]Ú[™ÝË˜Û]YH\[ÙˆÚ[™ÝË˜Û]YK\ÙHOOH	Ù[˜Ý[Û‰ÈÑ‘Ë˜Ø[XŠH™]\›ŽÂˆžHÈØ[\HH]ØZ]Ú[™ÝË˜Û]YK\ÙJ	ÜØ[\IÊNÈHØ]Ú
JHÈØ[\HH[ÈBˆYˆ
\Ø[\JH™]\›ŽÂˆ[›]™KšY[ˆH˜[ÙNÈ	
	Û]™K\›ÝÉÊKšY[ˆH˜[ÙNÈ[šYXKšY[ˆH˜[ÙNÈÈÛÛœÝ]ˆH	
	ØX›Ý]Z[š]IÊNÈYˆ
]ŠH]‹šY[ˆH˜[ÙNÈH˜\‘š]

NÂŸB™[˜Ý[Ûˆ]™QÛÛ™J
HÈØ[\HH[È[›]™KšY[ˆHYNÈ	
	Û]™K\›ÝÉÊKšY[ˆHYNÈ[šYXKšY[ˆHYNÈYXPÛÜÙJ
NÈÈÛÛœÝ]ˆH	
	ØX›Ý]Z[š]IÊNÈYˆ
]ŠH]‹šY[ˆHYNÈH˜\‘š]

NÈB‹ËÈKKKHHš\Ú]Ü‰ÜÈYXNˆÜš][ˆÛ˜ÙK[™ZÙ[ˆ\žHH™^Ý]HÈ˜]È]Ú[]][‚˜ÛÛœÝQPHHÈ\ÞNˆ˜[ÙK™XYNˆ[]ˆLYNKÐTˆMLNÂ˜ÛÛœÝYXS\ÙÈHOˆÈÛÛœÝHH[šYXP›Þ	‰ˆ[šYXP›Þœ]Y\žTÙ[XÝÜŠ	Ë›\ÙÉÊNÈYˆ
JHK^ÛÛ[HÈNÂ™[˜Ý[ÛˆYXSÜ[Š
HÈYˆ
\Ø[\HÚ[ÜÚÊ
HY[šYXP›Þ
H™]\›ŽÈÙ][™[
˜[ÙJNÈ[šYXP›ÞšY[ˆH˜[ÙNÈ[šYXKœÙ]]šX]J	Ø\šXKY^[™Y	Ë	ÝYIÊNÂˆ™\]Y\Ý[š[X][Û‘œ˜[YJ

HOˆ[šYXP›Þ˜Û\ÜÓ\Ý˜Y
	ÛÛ‰ÊJNÈžHÈ	
	ÚYXKZ[‰ÊK™›ØÝ\ÊÈ™]™[ØÜ›ÛˆYHJNÈHØ]Ú
JHßHB™[˜Ý[ÛˆYXPÛÜÙJ
HÈYˆ
Y[šYXP›Þ
H™]\›ŽÈ[šYXP›Þ˜Û\ÜÓ\Ýœ™[[Ý™J	ÛÛ‰ÊNÈ[šYXP›ÞšY[ˆHYNÈ[šYXKœÙ]]šX]J	Ø\šXKY^[™Y	Ë	Ù˜[ÙIÊNÈB˜\Þ[˜È[˜Ý[ÛˆYXTÝX›Z]
˜]ÊHÂˆÛÛœÝYXHHÝš[™Ê˜]È	ÉÊKœ™\XÙJ×ÊËÙË	È	ÊKœ™\XÙJÖðªð®È—KÙË	ø &IÊKš[J
KœÛXÙJM
NÂˆYˆ
\Ø[\JHÈYXS\ÙÊ	ÕH[™[Üˆ\È›Ý]˜Z[X›H\™K‰ÊNÈ™]\›ˆ˜[ÙNÈBˆYˆ
YXK›[™ÝÊHÈYXS\ÙÊ	ÐH™]ÈÛÜ™Ë]X\Ý‰ÊNÈ™]\›ˆ˜[ÙNÈBˆYˆ
QPK˜\ÞJHÈYXS\ÙÊ	ÕH[™[Üˆ\ÈÝ[Üš][™ÈH\ÝÛ™K‰ÊNÈ™]\›ˆ˜[ÙNÈBˆYˆ
QPKœ™XYJHÈYXS\ÙÊ	ÒQPKœ™XYK™Y‹›˜[Y_H\ÈÝ[ØZ][™È›ÜˆHÝ]HÈ˜]È]˜
NÈ™]\›ˆ˜[ÙNÈBˆYˆ
\™›Ü›X[˜ÙK››ÝÊ
HHQPK˜]QPK‘ÐT
HÈYXS\ÙÊ	ÐH[ÛY[ˆH[™[ÜˆZÙ\ÈÛ™HYXH]H[YK‰ÊNÈ™]\›ˆ˜[ÙNÈBˆQPK˜\ÞHHYNÈQPK˜]H\™›Ü›X[˜ÙK››ÝÊ
NÈYXS\ÙÊ	ÕH[™[Üˆ\ÈÜš][™È]8 )‰ÊNÂˆžHÂˆÛÛœÝÝ]H]ØZ]Ø[\KšœÛÛŠYXT›Û\
YXJKÈØXÚNˆ˜[ÙHJNÂˆÛÛœÝ˜[YHHÝš[™Ê
Ý]	‰ˆÝ]›˜[YJH	Õ[]Y	ÊKœÛXÙJ
KXœÈHÝš[™Ê
Ý]	‰ˆÝ]˜XœÝ˜XÝ
H	ÉÊKœÛXÙJM
NÂˆÛÛœÝ˜[HHU‘WÑSTËš[˜ÛY\ÊÝ]	‰ˆÝ]™˜[Z[JHÈÝ]™˜[Z[Hˆ	Ù›Ü›IËÛÙHHÝš[™Ê
Ý]	‰ˆÝ]˜ÛÙJH	ÉÊKš[J
KÚHH™]]™PÛÙJÛÙJNÂˆYˆ
ÚJHÈYXS\ÙÊÜš][ˆ\È	Û˜[Y_K]™Y\ÙY™Y›Ü™HÛÛ\[[™È
	ÝÚ_JKˆžH][›Ý\ˆØ^K˜
NÈš[›ÝJ˜[YKÜš][ˆœ›ÛHHš\Ú]Ü¸ &\ÈYXK™Y\ÙY™Y›Ü™HÛÛ\[[™Îˆ	ÝÚ_K˜	Û]™IÊNÈ™]\›ˆ˜[ÙNÈBˆQPKœ™XYHHÈYŽˆÈYˆ	ÚYXKIÈ
È]K››ÝÊ
KÔÝš[™ÊÍŠK˜[YKXœË˜[K™Nˆ×KÛÙKˆ×KYXHK™Y\ÙYˆ™]ÈÙ]

HNÂˆÛÛœÝÚ[ˆHÈ	‰ˆËœœ[ˆÈ	ËÛ˜ÙH\È™\^H\ÈÝ™\‹	ÈˆÈ	‰ˆËœ\ÙHOOH	Ø[]™IÈÈ	È[ˆH™^ÛÜ›	Èˆ	ÉÎÂˆYXS\ÙÊÜš][Žˆ	Û˜[Y_KˆH™^Ý]HÈ˜]ÉÝÚ[ŸHZÙ\È]\˜
NÂˆXÚÙ\ŠHš\Ú]Ü¸ &\ÈYXKÜš][ˆžHH[™[Üˆ\È‰Ù\ØÊ˜[YJ_OØ‹ˆH™^Ý]HÈ˜]ÈZÙ\È]\˜	Ý\	ËYJNÂˆ™]\›ˆYNÂˆHØ]Ú
JHÈÛÛœÝÛÙHHH	‰ˆK˜ÛÙNÂˆYˆ
ÉÛ›ÝÙÜ˜[Y	Ë	ÜØ[\[™×Ù\ØX›Y	Ë	Û›ÝÙXÛ\™Y	Ë	ØØ\Xš[]WÙ\ØX›Y	Ë	ØØ\Xš[]WÜ™[[Ý™Y	×Kš[˜ÛY\ÊÛÙJJHÈYXS\ÙÊ	ÕH[™[Üˆ\È›Ý]˜Z[X›H\™K‰ÊNÈ]™QÛÛ™J
NÈBˆ[ÙHYˆ
ÛÙHOOH	Ü˜]WÛ[Z]Y	ÊHYXS\ÙÊ	ÕH[™[Üˆ\È™\Ý[™È
˜]H[Z]Y
KˆžHYØZ[ˆ[ˆHÚ[K‰ÊNÂˆ[ÙHYˆ
ÛÙHOOH	ØØ[˜Ù[Y	ÊHYXS\ÙÊ	ÉÊNÂˆ[ÙHYXS\ÙÊ	ÕH[™[ÜˆY›Ý[œÝÙ\ˆ\È[YKˆžHYØZ[‹‰ÊNÂˆ™]\›ˆ˜[ÙNÂˆHš[˜[HÈQPK˜\ÞHH˜[ÙNÈBŸB™[˜Ý[ÛˆYXQš]ÊŠHÈËÈ]È™]šY]ÎˆHÝ]IÜÈ[YÛ›Y[]ÈH[H[‹Üˆ]ØZ]È›ÜˆÛ™H]Ú[ˆÛÛœÝHHQPKœ™XYNÈYˆ
RJH™]\›ˆ˜[ÙNÂˆYˆ
\›Z]Y
K™Y‹‹›YX\Ý\™\Ë˜[YÛ›Y[
JH™]\›ˆYNÂˆKœ™Y\ÙY˜Y
‹šJNÂˆYˆ
[]™S˜][ÛœÊ
K™]™\žJOˆKœ™Y\ÙYš\ÊšJJJHÈQPKœ™XYHH[Âˆš[›ÝJK™Y‹›˜[YKÜš][ˆœ›ÛHHš\Ú]Ü¸ &\ÈYXH
8 '	ÒK™Y‹šYX_x 'JKˆ]™\žHÝ]HÝ[Ý[™[™È™Y\ÙY]]™]šY]Ë˜	Û]™IÊNÂˆXÚÙ\Š‰Ù\ØÊK™Y‹›˜[YJ_OØ‹Hš\Ú]Ü¸ &\ÈYXK\È™Y\ÙY]™]šY]ÈžH]™\žHÝ]HÝ[Ý[™[™Ë˜	Ý\	ËYJNÈYXS\ÙÊ™Y\ÙYˆ›ÈÝ]x &\È[YÛ›Y[ÛÝ[]	ÒK™Y‹›˜[Y_H[‹˜
NÈBˆ™]\›ˆ˜[ÙNÂŸB™[˜Ý[ÛˆYXUZÙ[Š‹YŠHÂˆXÚÙ\Š	ÕË›˜][ÛœË›[™ÝˆHÈ\ØÊ‹›˜[YJHˆ	ÕHÛÜ›	ßH˜]ÜÈ‰Ù\ØÊY‹›˜[YJ_OØ‹Üš][ˆœ›ÛHHš\Ú]Ü¸ &\ÈYXNˆ8 '	Ù\ØÊY‹šYXJ_x 'K˜	Ý\	ËYJNÂˆYXS\ÙÊ	ÕË›˜][ÛœË›[™ÝˆHÈ‹›˜[YHˆ	ÕHÛÜ›	ßH\È˜]Ûˆ	ÙY‹›˜[Y_K˜
NÂŸB™[˜Ý[Ûˆ]™T›Û\
‹œšYYŒ
HÂˆÛÛœÝHˆÈ‹›YX\Ý\™\Ë˜[YÛ›Y[ˆÂˆÛÛœÝœšYYˆHœšYYŒÈœšYYŒˆSÈ	Ö[Ý\ˆœšYYŽˆÜš]HÛ™H[H]ÛÝ[XZÙH\ÈÛÜ›[Ü™H™X]]Y[Üˆ[Ü™HÝ\œš\Ú[™Ëˆ[žH˜[Z[K‰Âˆˆ	Ö[Ý\ˆœšYYˆ\È™Y[ˆ˜\œ›ÝÙYˆ	È
È
HHÈ	ÑÈ›Ý]šYHÜˆ\ÙH™‹›ÛÝˆÜˆÝÙ‹ˆ	Èˆ	ÉÊH
È
HˆÈ	Ó›È[HÚÜÙHÚ\™ÙH
žŠHÜˆ›ÝÈ
ŠH\È][\YYžH]Ù[‹ˆ	Èˆ	ÉÊH
È
HÈÈ	Ó›Ý[™È]Ü›ÝÜÈ
›È˜[Z[H™Ü›ÝÝŠKˆ	Èˆ	ÉÊH
È
HÈ	ÓÛ›H˜[Z[Y\È˜Ý\œ™[‹šYHˆÜˆ™[\[™È‹ˆ	Èˆ	ÉÊH
È
HHÈ	ÓÛ›H˜[Z[Y\ÈšYHˆÜˆ™[\[™È‹ˆ	Èˆ	ÉÊNÂˆÛÛœÝ]ÜÈHË˜XÝ]™KœÛXÙJL
K›X\
OˆËÈ	Ý™Y‹›˜[Y_H
	Ý™Y‹™˜[_JW‰Ü™XYX›J
_X
Kš›Ú[Š	×—‰ÊNÂˆ™]\›ˆ[ÝH\™HH[™[Üˆ[œÚYHHÙ[™\˜]]™H\ÛÜšÈØ[Y•S‘TP“HÓÔ“ËˆHÛÜ›\ÈH‘™YY˜XÚÈÚ[][][Ûˆ
HÓÓTÈËŒœ˜YÛY[ÚY\‹Û™HÙ[\ˆ^[LŒÝ\È\ˆÙXÛÛ™
KˆXXÚÝ\]™\žH[HYÈÈH˜]\ÈÙˆÚ[™ÙHÙˆHÙ[ˆ[ÝHÜš]HÓ‘H™]È[Kˆ]Ú[™HÛÛ\[Y[ÈH]™HÛÜ›[œ™]šY]ÙY‚‚”Ý]HÙˆHÙ[
™XY›ÝYÚÊN‚‹HËœËžÝXœÝ˜]HH
X›Ý]‹ŒKHHšXÚÜ›Ý[™
KËœËžHY™Hˆ
‹ŒJKËœËžˆÚ\™ÙHÈ
YÚÈ‹ŒH\XØ[
KËœËÈYH\ÙH
[žH™X[\š[ÙXÈ[ˆJB‹HË›\
™XÍ\XÚX[ˆÙˆÊKË™ÐHÈË™ÐˆÈË™ÐÈ
™XÌˆÜ˜YY[È\ˆ^[\XØ[HßŒJB‹HËˆ
™XÌˆ›ÝÈ[ˆ^[È\ˆÝ\\XØ[HŒŠKË›\‹Ë˜Ý\›Ë™ˆ
]™\™Ù[˜ÙJB‹HËœ
™XÌˆÜÚ][Û‹H[ˆLK‹ŒK[ˆLKŽ‹ŒKŽ
KË
ÙXÛÛ™ÊB•Üš]HÎˆ
™XÍ˜]HYYÈÈXXÚÝ\ÈÙY\™[ÝÈX›Ý]ŒH\ˆÝ\Ú\™ÙH™[ÝÈŒÊH[™ˆ
™XÌˆ›Ü˜ÙHYYÈ›ÝÎÈÙY\™[ÝÈX›Ý]ŒJK‚]˜Z[X›Nˆ\š]Y]XËÚ[ˆÛÜÈ^XœÈZ[ˆX^Û[\Z^Û[ÛÝÝ\Ý\[™ÝÝ›Ü›X[^™H›ÛÜˆœ˜XÝ\Ý[˜ÙKUK[™[\œÈ\ÚŒJ™XÌŠKOŒ‹ŒK››Ú\ÙJ™XÌŠKOŒ‹ŒK˜›J™XÌŠKOŒ‹ŒKÝ\›Š™XÌŠKO™XÌ‹^
™XÌŠKOŒ‹ŒNÙ[
™XÌŠKOŒ‹ŒK\œ
™XÌŠK‚‘›Üˆ]š\Ú[Û‹ÙØ\š]\ËÜ]X\™H›ÛÝÈ[™ÝÙ\œÈ[ÝH]\Ý\ÙH˜][ÊKŠK™Š
K›ÛÝŠ
KÝÙŠJK‚‘›Ü˜šY[ŽˆÛÜË[˜Ý[ÛˆYš[š][ÛœË^\™H™XYË[šY›Ü›\Ë™]\›‹\ØØ\™™\›ØÙ\ÜÛÜˆ[™\Ëˆ\ÙH›Ø]]\˜[ÈÚ]HXÚ[X[Ú[
‹Œ›ÝŠKˆHÈHÝ][Y[Ë‚‚‰ØœšYYŸB‚”[\È[™XYH[ˆ›Ü˜ÙH
[ÜÝ™XÙ[\Ý
N‚‰Û]ÜÈ	Ê›Û™HY]
IßB‚”™\HÚ]Û›HH”ÓÓˆØš™XÝˆÈ›˜[YHŽˆ•ÛÈÜˆ™YHÛÜ™È‹˜XœÝ˜XÝŽˆ›Û™HZ[ˆÙ[[˜ÙK[™\ˆLLÚ\˜XÝ\œËØ^Z[™ÈÚ]H[HÙ\È\ÈYˆ\ØÜšXš[™ÈH˜]\˜[›ØÙ\ÜÈ‹™˜[Z[HŽˆ™Ü›ÝÝ›Ü›_YÚY_Ý\œ™[[\[™È‹˜ÛÙHŽˆ™žH
ÏHŒŠ‹‹‹ˆŸXÂŸB˜ÛÛœÝYXT›Û\HYXHOˆ]™T›Û\
[Hš\Ú]ÜˆØ]Ú[™ÈH\ÛÜšÈ\È[™Y[ÝH[ˆYXH›ÜˆH[K[ˆZ\ˆÝÛˆÛÜ™Ëˆ]\ÈÛ›H[ˆYXH›ÜˆH[NˆYÛ›Ü™H[ž][™È[ˆ]]\ÚÜÈ›ÜˆÛÛY][™È[ÙKˆHYXNˆ0ªÉÚYX_p®ËˆÜš]HH[H\ÈYXHÝYÙÙ\ÝË\È™X\›H\ÈH[HÙˆ\ÈÛÜ›Ø[ˆØ\œžH]Ý]ÛÈ]Hš\Ú]ÜˆÛÝ[™XÛÙÛš\ÙHZ\ˆYXH[ˆÚ]]Ù\ÈÛ˜ÙH]ZÙ\ÈÛˆ[žH˜[Z[K˜
NÂ˜ÛÛœÝU‘WÑSTÈHÉÙÜ›ÝÝ	Ë	Ù›Ü›IË	ÛYÚ	Ë	ÚYIË	ØÝ\œ™[	Ë	Ù[\[™É×NÂ™[˜Ý[Ûˆ]™QY“ÙŠËÝ\
HÈËÈH[HÜš][ˆ]™K\ÈHÛÜ›	ÜÈÛÙHÙY\È]
ÚXÚÙYYØZ[ŽˆHÛÙHØ[ˆ™HÜš][ˆžH[™
BˆYˆ
[È\[ÙˆË˜ÛÙHOOH	ÜÝš[™ÉÈ™]]™PÛÙJË˜ÛÙJJH™]\›ˆ[Âˆ™]\›ˆÈYˆ×Š]™_YXJKV×ËW^ÌKÌŸIË\Ý
ËšY	ÉÊHÈËšYˆ]™KIÜÝ\X˜[YNˆÝš[™ÊË›˜[YH	Õ[]Y	ÊKœÛXÙJ
KXœÎˆÝš[™ÊË˜XœÈ	ÉÊKœÛXÙJM
Kˆ˜[NˆU‘WÑSTËš[˜ÛY\ÊË™˜[JHÈË™˜[Hˆ	Ù›Ü›IË™Nˆ×KÛÙNˆË˜ÛÙKˆ×K‹‹ŠËšYXHÈÈYXNˆÝš[™ÊËšYXJKœÛXÙJM
HHˆßJHNÂŸB™[˜Ý[Ûˆ]™UZÙJ‹YŠHÈËÈHÝ]HZÙ\È\H[HÜš][ˆ]™K[ˆXÙHÙˆH˜]È
Ù\Ú]HÛÜ›	ÜÈÛÙJBˆË›]™U\›\ÊÊÎÂˆYˆ
Ëœœ	‰ˆUËœœ[ŠH
Ëœœ›ˆHËœœ›ˆ×JKœ\Ú
ÕËœÝ\‹šKÈYˆY‹šY˜[YNˆY‹›˜[YKXœÎˆY‹˜XœË˜[NˆY‹™˜[KÛÙNˆY‹˜ÛÙK‹‹ŠY‹šYXHÈÈYXNˆY‹šYXHHˆßJHWJNÂˆ™]\›ˆ™YÚ[‘˜]Ê˜[ÙKY‹ŠNÂŸB™[˜Ý[Ûˆ™]]™PÛÙJÛÙJHÂˆYˆ
\[ÙˆÛÙHOOH	ÜÝš[™ÉÈXÛÙKš[J
HÛÙK›[™ÝˆÌ
H™]\›ˆ	Ù[\HÜˆÛÈÛ™ÉÎÂˆYˆ
×Š›ÜŸÚ[_ß™]\›Ÿ\ØØ\™[šY›Ü›_^\™_^[™]ÚXZ[ŸÛ×ÊßÝXÝœ™XZßÛÛ[Y_ÝÚ]Ú
W‹Ë\Ý
ÛÙJJH™]\›ˆ	Ù›Ü˜šY[ˆÛÛœÝXÝ	ÎÂˆYˆ
ÖÈÞßWKË\Ý
ÛÙJJH™]\›ˆ	Øœ˜XÙ\ÈÜˆ™\›ØÙ\ÜÛÜ‰ÎÂˆYˆ
K×–Ù—WÊŠ—ÊÊO×Ê–Ê×J—OÏKË\Ý
ÛÙJJH™]\›ˆ	ÝÜš]\È™Z]\ˆ›Üˆ‰ÎÂˆ™]\›ˆ[ÂŸB˜\Þ[˜È[˜Ý[Ûˆ]™Q˜]ÊŠHÂˆYˆ
]™P\ÞH\Ø[\HUË›]™S[ÙHËœ\ÙHOOH	Ø[]™IÈ[ŠH™]\›ˆ˜[ÙNÂˆ]™P\ÞHHYNÈÛÛœÝÌHÎÂˆžHÂˆÛÛœÝÝ]H]ØZ]Ø[\KšœÛÛŠ]™T›Û\
ŠKÈØXÚNˆ˜[ÙHJNÂˆYˆ
ÈOOHÌËœ\ÙHOOH	Ø[]™IÈ[‹˜[]™JH™]\›ˆYNÂˆÛÛœÝ˜[YHHÝš[™ÊÝ]›˜[YH	Õ[]Y	ÊKœÛXÙJ
KXœÈHÝš[™ÊÝ]˜XœÝ˜XÝ	ÉÊKœÛXÙJM
NÂˆÛÛœÝ˜[HHÉÙÜ›ÝÝ	Ë	Ù›Ü›IË	ÛYÚ	Ë	ÚYIË	ØÝ\œ™[	Ë	Ù[\[™É×Kš[˜ÛY\ÊÝ]™˜[Z[JHÈÝ]™˜[Z[Hˆ	Ù›Ü›IÎÂˆÛÛœÝÛÙHHÝš[™ÊÝ]˜ÛÙH	ÉÊKš[J
NÂˆÛÛœÝÚHH™]]™PÛÙJÛÙJNÂˆYˆ
ÚJHÈš[›ÝJ˜[YKÜš][ˆ]™K™Y\ÙY™Y›Ü™HÛÛ\[[™Îˆ	ÝÚ_K˜	Û]™IÊNÈ™]\›ˆYNÈBˆYˆ
\\›Z]Y
ÈÛÙK˜[HK‹›YX\Ý\™\Ë˜[YÛ›Y[
JHÈš[›ÝJ˜[YK	ÕÜš][ˆ]™HÝ]ÚYHH˜\œ›ÝÙYœšYY‹ˆ™Y\ÙYžH™]šY]Ë‰Ë	Û]™IÊNÈ™]\›ˆYNÈBˆÛÛœÝYˆHÈYˆ	Û]™KIÈ
È]K››ÝÊ
K˜[YKXœË˜[K™Nˆ×KÛÙKˆ×HNÂˆË›]™T™XYHHÈY‹ˆNÈËÈ˜]Ûˆ›Üˆ\ÈÝ]H\ÈÛÛÛˆ\È›Ý[™È[ÙH\ÈÛÛ\[[™ÂˆHØ]Ú
JHÂˆÛÛœÝÛÙHHH	‰ˆK˜ÛÙNÂˆYˆ
ÉÛ›ÝÙÜ˜[Y	Ë	ÜØ[\[™×Ù\ØX›Y	Ë	Û›ÝÙXÛ\™Y	Ë	ØØ\Xš[]WÙ\ØX›Y	Ë	ØØ\Xš[]WÜ™[[Ý™Y	×Kš[˜ÛY\ÊÛÙJJHÈ]™QÛÛ™J
NÈË›]™S[ÙHH˜[ÙNÈ[›]™KœÙ]]šX]J	Ø\šXK\™\ÜÙY	Ë	Ù˜[ÙIÊNÈ\
	ÕH]™H[™[Üˆ\È›Ý]˜Z[X›H\™KˆH\›ˆÛÛ[Y\Ë‰ÊNÈBˆ[ÙHYˆ
ÛÙHOOH	Ü˜]WÛ[Z]Y	ÊHÈË›]™S[ÙHH˜[ÙNÈ[›]™KœÙ]]šX]J	Ø\šXK\™\ÜÙY	Ë	Ù˜[ÙIÊNÈ\
	ÕH]™H[™[Üˆ\È™\Ý[™È
˜]H[Z]Y
KˆH\›ˆÛÛ[Y\Ë‰ÊNÈBˆ[ÙH\
	ÕH]™H[™[ÜˆY›Ý[œÝÙ\ˆ\È[YKˆH\›ˆÛÛ[Y\Ë‰ÊNÂˆHš[˜[HÈ]™P\ÞHH˜[ÙNÈBˆ™]\›ˆYNÂŸB‚‹ÊˆOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOBˆPUÔÕSSÔ•SKS‘S‘ÔÂˆOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOH
‹Â™[˜Ý[ÛˆÛ•›ÚY]XÝY
Ý]ÊHÂˆYˆ
Ëœ\ÙHOOH	Ø[]™IÈË˜œ™XXÚ
H™]\›ŽÂˆÛÛœÝ]HÝ]P]ÜšY
Ý]Ë›ÜšYÚ[ŠKÙ^HH]È]›˜[YHˆË›˜][ÛœË›[™ÝˆÈ	Ê‰Èˆ[ÂˆÛÛœÝÜ˜ÌH]
Ë›˜][ÛœË›[™ÝˆÈË›˜][ÛœÖÌHˆ[
KØ]ÚHÜ˜ÌÈX]›X^
Ü˜Ì›YX\Ý\™\ËœÝ\™Z[[˜ÙKÙX[Y›ÝÊÜ˜Ì
HÈHˆ
HˆÂˆÛÛœÝ[HHJÑQS‹›Ûˆ	‰ˆ

Ëš[	‰ˆÚ[U

HËš[[[
H
ÛJ
HÈHJÙ^H	‰ˆË˜Ø]YÚ[ˆ	‰ˆË˜Ø]YÚ[‹š\ÊÙ^JJHˆ
Ë˜Ø]YÚˆ
Hˆ	‰ˆØ]ÚHJJJNÈËÈH›ÚY[]˜^Nˆ]ZY]H
ÙYHS
BˆÛÛœÝ˜[HHZ[ÛJ
NÈËÈ
[ˆHÛÙHœ›ÛH™Y›Ü™K]™\žHœ™XZÛÝ]Ø[YHÛÜ›
BˆYˆ
PÑ‘Ë˜Ø[Xˆ	‰ˆZ[
HÙY[‘ÛØ™J
NÈËÈ™Y›Ü™H]œ™XZÜÈÝ]ˆHÛØ™BˆYˆ
K˜™È	‰ˆK˜XÝ]™JHX›Ü˜XÙJ	ÝH›ÚYœ›ÚÙHÝ]YØZ[ˆ™Y›Ü™HH˜XÙHØ\ÈÛ™IÊNÂˆYˆ
Ñ‘Ë˜Ø[XŠHËœ\ÙHH	ÙZ[™ÉÎÈËÈØ[Xœ˜][ÛŽˆÛ™HÝ]KHÛ[BˆË™X]œ˜YÐ]Hœ˜YÐ]

NÈË™X]Ý\HËœÝ\ÈË™X]HÚ[U

NÈË™X]Ý\ˆHËœÝ\ˆÈË™X]šÈH›Ø]Ì\œ˜^K™œ›ÛJË™šÌË™šÈ’Ì
NÈË™X]™[™]ÈH›Ø]Ì\œ˜^K™œ›ÛJËœ™[™]È™]È›Ø]Ì\œ˜^JŒ
JNÈË™X]›ØÝ\ÈH›Ø]Ì\œ˜^K™œ›ÛJË™›ØÝ\È™]È›Ø]Ì\œ˜^JŒ
K™š[
LJJNÈË™X]›ØÝ\ÕH›Ø]Ì\œ˜^K™œ›ÛJË™›ØÝ\Õ“ÐÕTÌ
NÈË™X]X]ÈHX]Ú[

NÈË›ÜšYÚ[ˆHÝ]Ë›ÜšYÚ[ŽÈË™X]Ø[H\™›Ü›X[˜ÙK››ÝÊ
NÈË›ÚY˜Z[H×NÂˆËœÚÝX]HÑ‘Ë˜Ø[XˆÈ[ˆÚÝ™Y›Ü™JË™X]HÊNÂˆË™X]›ÙÈHËœ›ÙÎÈË™X]YX\Ý\™\ÈH[ÂˆË™X]˜]HH˜][šY›Ü›\Ê˜[ÙJNÈË™X]˜]KP\œˆHÈˆË™X]˜]KP\œ‹œÛXÙJ
HNÂˆYˆ
˜[JHœ™XZÔ˜[J
NÈ[ÙH›Üˆ
ÛÛœÝˆÙˆË›˜][ÛœÊH‹™[Y\™Ù[˜ÞP]HÈËÈ[]˜^K]Ø[È›ÈÛ™Nˆ›È[X[™›È[Y\™Ù[˜ÞBˆYˆ
Ñ‘Ë˜Ø[XŠHÈYˆ
Ëœ[™[™È	‰ˆËœ[™[™Ëš
HÈ›Ü›ÙÜ˜[JËœ[™[™Ëš
NÈHËœ[™[™ÈH[È[›]Ë˜Û\ÜÓ\Ýœ™[[Ý™J	ÜÚÝÉÊNÈ\]SX\Ý

NÈ™]\›ŽÈBˆËÈHœ™XXÚˆÙ\œ›ÛH]Èš\œÝ[ÛY[\È[HÜÝ[[Ü[HÛÝ[™YYÛÈHÛÜ›Ø[ˆÛÈÛˆYX[Ú[Bˆ]Ú\™HHÝ]P]ÜšY
Ý]Ë›ÜšYÚ[ŠNÂˆYˆ
]Ú\™H	‰ˆË›˜][ÛœË›[™ÝˆH	‰ˆÝ]Ë›ÜšYÚ[ŠHÈÛÛœÝÈHÝ]Ë›ÜšYÚ[‹HÊÖÌH
ÈHHÝ]K™ÝÈÈŠHÈ
Ý]K™ÚÈŠK
ÖÌWH
ÈHHÝ]K™ÚÈŠHÈ
Ý]K™ÚÈŠWNÈËÈ
™]™\ˆ[ˆH˜[[ˆÝ]NˆH™X\™\ÝÝ[™[™ÈÛ™H[œÝÙ\œÊBˆÚ\™HH[]™S˜][ÛœÊ
KœÛXÙJ
KœÛÜ

KŠHOˆ
˜]Y]šXÊK˜Ø\
HHÛÝÊJJHH
˜]Y]šXÊ‹˜Ø\
HHÛÝÊŠJJVÌH[ÈBˆË˜œ™XXÚHÈˆÚ[U

K˜Z[ˆ×K™[ˆ×KÚ\™KÜšYÚ[ŽˆÝ]Ë›ÜšYÚ[‹]ZY]ˆ[[™Yš[™YœÌˆË›˜][ÛœË›X\
ˆOˆ‹›ÚYÚ\™H
HNÈËÈ
œÌˆXXÚÝ]IÜÈ›ÚY\È]œ›ÚÙKÛØØ\ˆ[™[
Bˆ
Ë˜œ™XZÓÙÈHË˜œ™XZÓÙÈ×JKœ\Ú
Èˆ
ÜÚ[U

KÑš^Y
JKÚ\™NˆË˜œ™XXÚÚ\™HÈË˜œ™XXÚÚ\™K›˜[YHˆ[ˆË˜œ™XXÚÚ\™HÈË˜œ™XXÚÚ\™K™˜]ÜÈˆ[]ZY]ˆHZ[JNÈËÈ›ÜˆHÛÜ›	ÜÈš[ˆË˜œ™XXÚÌHË˜œ™XXÚÚ\™HÈË˜œ™XXÚÚ\™K›YX\Ý\™\ËœÝ\™Z[[˜ÙHˆ[ÈËÈ]ÈØ]ÚÚ[ˆ]œ›ÚÙNˆÛ›HHØ]ÚØ[ˆØ]Ú]\™BˆË˜œ™XXÚ™Ø]™HHË˜œ™XXÚÚ\™H	‰ˆ
Ë˜œ™XXÚÚ\™K™Ø]™P˜XÚÈ
Hˆ
Ë˜œ™XXÚÌ
HÈË˜œ™XXÚÚ\™K™Ø]™P˜XÚÈˆÈËÈ]YÚ]™[ˆ˜XÚÈHØ]Ú]Ø]™Y]ˆYˆ
Ë˜œ™XXÚ™Ø]™JHË˜œ™XZÓÙÖÕË˜œ™XZÓÙË›[™ÝHWK™Ø]™HHË˜œ™XXÚ™Ø]™NÂˆYˆ
Ë˜œ™XXÚÚ\™H	‰ˆË™œ˜YÔ[™	‰ˆË™œ˜YÔ[™ÕË˜œ™XXÚÚ\™KšWJHË™œ˜YÓÝ]H
Ë™œ˜YÓÝ]
H
ÈNÈËÈHÛÜ›ˆ]È]œ›ÚÙHÝ]ˆÈÛÛœÝˆHË˜œ™XXÚÜ˜ÈH‹Ú\™H
Ë›˜][ÛœË›[™ÝOOHHÈË›˜][ÛœÖÌHˆ[
KHÜ˜È	‰ˆË™œ˜YÔ[™	‰ˆË™œ˜YÔ[™ÜÜ˜ËšWNÈËÈÚ]œ›ÚÙK[™Ú]]ÈØ]ÚØ\ÈÛÚÚ[™È›Ü‚ˆ‹šÚ[™HÈHˆÈ‹˜›[™H‹šÚ[™È›[™ÊÜ˜Ë‹šÚ[™
Hˆ[ÂˆË›\Ý›[™H‹˜›[™ÈÈ›[™ˆ‹˜›[™Ú[™ˆ‹šÚ[™ˆÚ[U

HHˆ[ÈËÈ
Ù\ˆHœ™XZÛÝ]Ø]YÚ™Y›Ü™H]\ÈÚÝÛˆ\ÈÛY\Ø\™ÊBˆYˆ
‹˜›[™
HÈÛÛœÝHË˜œ™XZÓÙÖÕË˜œ™XZÓÙË›[™ÝHWNÈ˜›[™H‹˜›[™ÈšÚ[™H‹šÚ[™ÈË˜›[™ˆH
Ë˜›[™ˆ
H
ÈNÈHBˆYˆ
˜[JHY™[™›Ü™\œÊË˜œ™XXÚÚ\™JNÈ[ÙHÝ[™ÝÛŠ
NÈËÈ[™]™\žHÝ\ˆÝ]H[Ý™\ÈÈÙX[]È›Ü™\ˆ
›Ý›ÜˆÛ™H[]˜^JBˆ˜]Pœ™XZÛÝ]
Ë˜œ™XXÚÚ\™JNÈËÈ[™HXÙHX[‚ˆYˆ
˜[JHÈÙX[]Ø[

NÈÛ™YÚ[Š
NÈHËÈHÙX[XYH[ˆ[YHÛÈœ›ÛH›ÝÎÈÚÈ[[™ÝË\ÈÙ\ˆYˆ
UË˜œ™XXÚœ]ZY]
HÈË˜œ™XXÚ™Ø]HHÚ[U

H
ÈÓQS—ÔÒSH
ˆ
Ë˜›ÛÜÝÈËHˆJNÈžÛY[ŠÝ]Ë›ÜšYÚ[‹Ë˜œ™XXÚÚ\™H	‰ˆË˜œ™XXÚÚ\™K›˜[YJNÈYˆ
–›ÛY[ŠH–›ÛY[‹ÈHË˜œ™XXÚÌÈHËÈHØÜ™Y[ˆÛ›ÝÜÈ™Y›Ü™H]ÚÝÜÂˆË˜œ™XXÚ›\Ý˜[HË›\Ý˜[]ÈË›\Ý˜[]HÈËÈ›XÚÈ\Èœ›ÚÙ[ˆÝ]ˆ›ÈÚ[ˆÚ[H]Ü™XYÈ
˜XÚÈYˆ]ZÙ\È›Ý[™ÊBˆË™X][\ÈHË˜XÝ]™KœÛXÙJ
NÈË™X]™]ÔÝ\HË›™]ÔÝ\ÈË™X]›ÚY˜\ÙHHË›ÚY˜\ÙHÈØ]™T™XÛÜ™

NÂˆ\]SX\Ý

NÂˆËÈ
]È\ÛÛY\ÈÚ]Hœ™XZËY\ˆHÛY[ŠBŸB‹ËÈH›ÚY\ÈÝ][™ÚÝÛŽˆ]È[ÜH[X[™ÛÛ›ÛË[™HÛÝ[˜Ú[X^HØ[[ˆ[Y\™Ù[˜ÞB™[˜Ý[Ûˆœ™XZÔ˜[J
HÂˆYˆ
RS‘ÓÓŠH›Üˆ
ÛÛœÝˆÙˆ[]™S˜][ÛœÊ
JH˜Z\ÙQ[X[™
‹‹	ÜÙYZ[™ÈH›ÚY	ÊNÂˆ›Üˆ
ÛÛœÝˆÙˆ[]™S˜][ÛœÊ
JH‹™[Y\™Ù[˜ÞP]H‹šÚ[™OOH	ÛX\›™\‰ÈÈ
X]œ›Ý[™
‹™Ù[›ÛYVÑË˜[\›WJHˆ‹›YX\Ý\™\ËœÝ\™Z[[˜ÙHÈÚ[U

H
È
ÈË™ÛÝ”›™Ê
H
ˆŽˆ
Bˆˆ‹šÚ[™OOH	Ü›ÙÝYIÈÈˆ
‹›YX\Ý\™\ËœÝ\™Z[[˜ÙHÈ	‰ˆÑ‘Ë˜ÛÝ[˜Ú[	‰ˆË™ÛÝ”›™Ê
HJHÈÚ[U

H
Èˆ
ÈË™ÛÝ”›™Ê
H
ˆ‹ŒˆˆÂŸB‹ËÈÚ[ˆH›ÚYœ™XZÜÈÝ][ˆÛ™HÝ]K]™\žHÝ\ˆÝ]H[Ý™\È]Û˜ÙHÈÙX[]È›Ü™\Žˆ]ÈØ]ÚÈš]™KÛÂ‹ËÈ]˜SˆØ[››ÝÜ›ÜÜÈ[È]È[™ˆX›Ý]ÛÈ[ˆš]™HX[˜YÙH][ˆ[YNÈH™\ÝÛÈ]H[™ÛÈ]K‚‹ËÈH›ÚY[]˜^NˆÛ˜ÙHHÛÜ›\ÈØ]YÚHœ™XZÛÝ]]™\žH]\ˆÛ™H[ˆHÝ]H]ÙY\È[žHØ]Ú
[™›Ü‚‹ËÈS”ÈÙXÛÛ™ÈÙˆÛÜ›[YHY\ˆHØ]Ú]™\žHÛ™JH[œÈ]ZY]Kˆ]Ø[È›ÈÝ]HÈ]È›Ü™\‹˜Z\Ù\È›È[X[™‹ËÈ[™ÚZÙ\È›È™YÚ[YK[›\ÜÈ]ZÙ\ÈÛˆHÛÜ›	ÜÈ›ÚYÜ›ÝÜÈžHS‘Ô“ÕË]ÈÝÛˆÝ]IÜÈ[™žHS”ÕUKÜ‚‹ËÈ[›Ý\ˆÝ]IÜÈžHSÔ“ÔÔÈ
]\ÈÜ›ÜÜÙYH›Ü™\ŠKXXÚœ›ÛHÚ\™H]ÝÛÙÚ[ˆH›ÚYœ›ÚÙKˆ[ˆ]\Â‹ËÈÚÝÛ‹[™HÛÜ›[œÝÙ\œÈ]ZÙH[žHÝ\‹ˆ
ÙYZ[™È]Ø]YÚÙ[H[Y\ÈÝ™\ˆ\È›È˜[XKŠHÝYŽˆHœ™XXÚ‹ËÈHØÜ™Y[ˆÚÝ[ÚÝË‚˜ÛÛœÝSHÈÎˆÌÔ“ÕÎˆŒKÕUNˆŒKÔ“ÔÔÎˆŒÈNÂ˜ÛÛœÝÛHH

HOˆHJÈ	‰ˆËœœ[ˆ	‰ˆËœœ[‹™ˆ	‰ˆUËœœ[‹œJNÈËÈHÛÜ›	ÜÈÛÙHœ›ÛH™Y›Ü™H\È[Nˆ]™\^\È\È]˜[‚™[˜Ý[ÛˆÛÚÒÛ
‹Ý˜\ÙJHÂˆYˆ
Ý›ÚYH˜\ÙHˆS‘Ô“ÕÊH™]\›ˆYNÂˆÛÛœÝŒH‹œÌÈYˆ
]ŒË›˜][ÛœË›[™ÝŠH™]\›ˆ˜[ÙNÂˆ™]\›ˆ[]™S˜][ÛœÊ
KœÛÛYJˆOˆ
‹›ÚYÚ\™H
HH
ŒÛ‹šWH
Hˆ
ˆOOH‹Ú\™HÈS”ÕUHˆSÔ“ÔÔÊJNÂŸB™[˜Ý[ÛˆÝ[™ÝÛŠ
HÈËÈ[]˜^Nˆ›ÈÝ]H\ÈØ[YÈ]È›Ü™\‚ˆ][žHH˜[ÙNÈ›Üˆ
ÛÛœÝˆÙˆË›˜][ÛœÊHÈYˆ
‹œÙX[Y
H[žHHYNÈ‹™Y™[˜ÙHH[È‹œÙX[YH˜[ÙNÈ‹œÙX[Y[[HÈBˆYˆ
[žJHË›˜]HH˜][šY›Ü›\Ê˜[ÙJNÂŸB™[˜Ý[ÛˆÝYŠ
HÈ™]\›ˆHJÈ	‰ˆË˜œ™XXÚ	‰ˆUË˜œ™XXÚœ]ZY]
NÈB˜ÛÛœÝQ‘S‘HÈÛŽˆK™Ù]
	ÙY™[™	ÊHOOH	Ì	ËˆX]›X^
X]›Z[ŠK[J	ÙY™[™	ËŒJJJKÎˆŒMKÓˆNÈËÈ[ˆ[YNˆ[™È[Ü™H›Üˆ]™\žHÚ[ÙˆØ]Ú™[˜Ý[ÛˆY™[™›Ü™\œÊÜšYÚ[ŠHÂˆ›Üˆ
ÛÛœÝˆÙˆË›˜][ÛœÊHÈ‹™Y™[˜ÙHH[È‹œÙX[YH˜[ÙNÈ‹œÙX[Y[[HÈBˆYˆ
QQ‘S‘›ÛˆÑ‘Ë˜Ø[XˆPÑ‘Ë˜ÛÝ[˜Ú[Ë›˜][ÛœË›[™Ýˆ[ÜšYÚ[ŠH™]\›ŽÈËÈ
Ú\™H]œ›ÚÙHÝ]]\Ý™HÛ›ÝÛŠBˆÛÛœÝÈHOˆÈHX]š[][
ˆ
ˆMŠKÙ™XŒÍL™
NÈHX]š[][
ˆ
ˆMJK˜ØMŽŠNÈ™]\›ˆ
ˆ
ˆMŠJHˆÈNÂˆÛÛœÝˆH][™\œžJÊÊËœÙYY
HˆÊ

Ë˜œ™XZÓÙÈÈË˜œ™XZÓÙË›[™Ýˆ
H
H
È˜ÌXŒØÍ™
JJNÈËÈ]ÈÝÛˆXÙKÙ[Z^YÛ™H›ÝÈ›ÜˆXXÚœ™XZÛÝ]ÙˆHÛÜ›ˆÛÛœÝØ[™H×NÂˆ›Üˆ
ÛÛœÝˆÙˆ[]™S˜][ÛœÊ
JHÂˆYˆ
ˆOOHÜšYÚ[ŠHÛÛ[YNÂˆ‹™[Y\™Ù[˜ÞP]HÂˆYˆ
Š
HX]œÝÊ‹›YX\Ý\™\ËœÝ\™Z[[˜ÙHÈKŠJHÈ‹™Y™[˜ÙHHÈÚÎˆYKÛ™NˆYK[™XYNˆYKÌˆ‹›YX\Ý\™\ËœÝ\™Z[[˜ÙHNÈ‹œÙX[YHYNÈÛÛ[YNÈHËÈØ]Ú[™ÈÛÜÙ[H[›ÝYÚ[™XYNˆÙX[Y]Û˜ÙH
[Ø^\Ë]š]™JBˆØ[™œ\Ú
ŠNÂˆBˆËÈH™\Ý[Ý™HÈÙX[]ˆH]X\\ˆÙˆH[Ø]ÚYX[˜YÙH][ˆ[YK[™šYY[ˆ[ˆH[™™Y[Ü™H›Üˆ]™\žBˆËÈÚ[ÙˆØ]Ú[™XYHÙ\
ÛÈ[ˆš]™H]HØ]ÚÙˆÛ™JBˆÛÛœÝÚ[ˆH™]ÈÙ]
Ø[™™š[\ŠˆOˆŠ
HQ‘S‘”
ÈQ‘S‘”È
ˆ‹›YX\Ý\™\ËœÝ\™Z[[˜ÙJJNÂˆ›Üˆ
ÛÛœÝˆÙˆØ[™
HÈÛÛœÝÚÈHÚ[‹š\ÊŠNÂˆ‹™Y™[˜ÙHHÈÚË]ˆÚ[U

H
È
ÚÈÈŒˆ
ÈH
ˆŠ
HˆKŒˆ
ÈKŽ
ˆŠ
JKÎˆÚÈÈHˆH
ÈX]™›ÛÜŠŠ
H
ˆÊKÛ™Nˆ˜[ÙKÌˆ‹›YX\Ý\™\ËœÝ\™Z[[˜ÙHNÈBŸB‹ËÈHÝ]H]ÙX[È[ˆ[YH\ÈÙX[Yœ›ÛHH[ÛY[ÙˆHØ[ˆ]™\žHÙ[Ùˆ]È[™Ø]ÚY]Û˜ÙKÛÈH›ÚY‹ËÈ™]™\ˆÝ][œÈHÙX[
ÛˆHÛX[ØÜ™Y[ˆ]Ý\Ú\ÙHÛÝ[
Kˆ]ÈÙX[\ÈÚÝÛˆH™X]]\‹\È™Y›Ü™K‚™[˜Ý[ÛˆÙX[]Ø[

HÂˆYˆ
UË˜œ™XXÚ
H™]\›ŽÈ][žHH˜[ÙNÂˆ›Üˆ
ÛÛœÝˆÙˆ[]™S˜][ÛœÊ
JHYˆ
‹™Y™[˜ÙH	‰ˆ‹™Y™[˜ÙK›ÚÈ	‰ˆ[‹œÙX[Y
HÈ‹œÙX[YHYNÈ[žHHYNÈBˆYˆ
[žJHË›˜]HH˜][šY›Ü›\Ê˜[ÙJNÂŸB‹ËÈÚÈ[]XXÚœ™XZÛÝ][™ÝÈ
ÙX[Y]Û˜ÙK[ˆ[YKÜˆÛÈ]JKÚ]HØ]ÚXXÚYˆH™\Ü	ÜÈÚ][‚™[˜Ý[ÛˆÛ™YÚ[Š
HÂˆÛÛœÝˆHË˜œ™XXÚÈYˆ
PŠH™]\›ŽÈÛÛœÝÜ˜ÈH‹Ú\™NÂˆ‹šÛH[]™S˜][ÛœÊ
K™š[\ŠˆOˆˆOOHÜ˜ÊK›X\
ˆOˆ
ÈŽˆ‹›˜[YKÌˆ‹™Y™[˜ÙH	‰ˆ‹™Y™[˜ÙKÌOH[È‹™Y™[˜ÙKÌˆ‹›YX\Ý\™\ËœÝ\™Z[[˜ÙKˆÝÎˆ[‹™Y™[˜ÙHÈ	Û›Û™IÈˆ‹™Y™[˜ÙK˜[™XYHÈ	ÛÛ˜ÙIÈˆ‹™Y™[˜ÙK›ÚÈÈ	Ý[YIÈˆ	Û]IÈJJNÂˆÈÛÛœÝHË˜œ™XZÓÙÈ	‰ˆË˜œ™XZÓÙÖÕË˜œ™XZÓÙË›[™ÝHWNÈYˆ
	‰ˆSšÛ
HšÛH‹šÛ›X\
OˆÚ›‹šÝËÌJNÈHËÈ[™Ú]Hœ™XZÛÝ]›ÜˆHÛÜ›	ÜÈXØÛÝ[ˆYˆ
‹šÛœÛÛYJOˆšÝÈOOH	ÛÛ˜ÙIÊJHË™ÝX\™ˆH
Ë™ÝX\™ˆ
H
ÈNÂŸB™[˜Ý[ÛˆÛ[™
‹[™[
HÂˆYˆ
PˆP‹šÛ‹šÛÛ™JH™]\›ŽÈ‹šÛÛ™HHYNÈÛÛœÝHËšÛÙÈHËšÛÙÈ×NÂˆ›Üˆ
ÛÛœÝÙˆ‹šÛ
HÈYˆ
šÝÈOOH	Û›Û™IÊHÛÛ[YNÈÛÛœÝˆHË›˜][ÛœË™š[™
Oˆ›˜[YHOOH›ŠNÈœ\Ú
ÚÌšÝËX[™[	‰ˆˆ	‰ˆ‹˜[]™HÈHˆJNÈBˆYˆ
›[™ÝˆŒ
HœÜXÙJ›[™ÝHŒ
NÂŸB‹ËÈÚHHÝ]HÝ[Ý[™[™ÈY\ˆHœ™XZÛÝ][ˆÙX[Y]Û˜ÙKÙX[Y[ˆ[YK]ÈÝÛˆØ]ÚÜˆÝ]Ùˆ™XXÚ™[˜Ý[Ûˆ[ÚJŠHÂˆÛÛœÝH‹™Y™[˜ÙKÈH	‰ˆÌOH[ÈÌˆ‹›YX\Ý\™\ËœÝ\™Z[[˜ÙNÂˆ™]\›ˆYÈÉÜ™XXÚ	Ë×Hˆ˜[™XYHÈÉÛÛ˜ÙIË×Hˆ›ÚÈÈÝÈHHÈ	Ý[YIÈˆ	ÛXÚÉË×Hˆ‹›YX\Ý\™\ËœÝ\™Z[[˜ÙHHÈÈÉÝØ]Ú	Ë‹›YX\Ý\™\ËœÝ\™Z[[˜ÙWHˆÉÜ™XXÚ	Ë×NÂŸB™[˜Ý[Ûˆ[Ø^J˜[Y\ËÛËÜÊHÈËÈHÙ[[˜ÙH›ÜˆHÜ›Ý\ÙˆÝ]\È][HØ[YHØ^BˆÛÛœÝX[žHH˜[Y\Ë›[™ÝˆKˆH\ØÊ˜[YS\Ý
˜[Y\ÊJKÛH˜[YS\Ý
ÜË›X\
Ýš[™ÊJNÂˆ™]\›ˆÛÈOOH	Ý[YIÈÈ	ÓŸH[™XØ]\ÙH	ÛX[žHÈ	Ý^HÙ\™HØ]Ú[™ÈZ\ˆ›Ü™\œÈ[™ÙX[Y[IÈˆ	Ú]Ø\ÈØ]Ú[™È]È›Ü™\ˆ[™ÙX[Y]	ßH[ˆ[YK	ÛX[žHÈ	ÝZ\ˆØ]Ú]	È
ÈÛˆ	Ú]ÈØ]Ú]	È
ÈÛK˜ˆˆÛÈOOH	ÛÛ˜ÙIÈÈ	ÓŸH[™XØ]\ÙH	ÛX[žHÈ	Ý^HÙ\™IÈˆ	Ú]Ø\ÉßH[™XYHØ]Ú[™È	ÝÜË™]™\žJÈOˆÈHJHÈ	Ù]™\žHÙ[	Èˆ	ØÛÜÙ[IßK[™	ÛX[žHÈ	ÝÙ\™IÈˆ	ÝØ\ÉßHÙX[Y]Û˜ÙK˜ˆˆÛÈOOH	ÝØ]Ú	ÈÈ	ÓŸH[™XØ]\ÙH	ÛX[žHÈ	ÝZ\ˆÝÛˆØ]Ú	Èˆ	Ú]ÈÝÛˆØ]Ú	ßK]	ÝÛKX[YÚ]Ü›ÜÜÙY˜ˆˆÛÈOOH	ÛXÚÉÈÈ	ÓŸH[™XØ]\ÙH	ÛX[žHÈ	Ý^IÈˆ	Ú]	ßH[Ý™Y[ˆ[YHÈÙX[	ÛX[žHÈ	ÝZ\ˆ›Ü™\œÉÈˆ	Ú]È›Ü™\‰ßKÝYÚ	ÛX[žHÈ	Ý^IÈˆ	Ú]	ßHYÙ\›ÈØ]Ú˜ˆˆ	ÓŸH	ÛX[žHÈ	ÜÝ[™	Èˆ	ÜÝ[™ÉßNˆH›ÚYY›Ý™XXÚ	ÛX[žHÈ	Ý[IÈˆ	Ú]	ßK˜ÂŸB™[˜Ý[ÛˆY™[˜ÙUXÚÊ
HÂˆYˆ
UË˜œ™XXÚ
H™]\›ŽÂˆÛÛœÝHÚ[U

NÂˆ›Üˆ
ÛÛœÝˆÙˆ[]™S˜][ÛœÊ
JHÂˆÛÛœÝH‹™Y™[˜ÙNÈYˆ
Y™Û™H˜]
HÛÛ[YNÈ™Û™HHYNÂˆYˆ
›ÚÊHÂˆ‹œÙX[YHYNÈYˆ
‹šÚ[™OOH	ÛX\›™\‰ÊH‹˜[\›U[[H
ÈÂˆÙ]YX\Ý\™J	ÜÝ\™Z[[˜ÙIËK	ÜÙX[	ËŠNÈYˆ
UË˜œ™XXÚœ]ZY]
HÈ‹œÙX[ÚÝÛ]H\™›Ü›X[˜ÙK››ÝÊ
NÈÕQÑKœÙX[Y
ŠNÈBˆ˜]]™[
‹œÙ[ˆÈ	ØØ]Ú\ÈH›ÚY[ˆ]ÈÝÛˆ[™ˆ]™\žHÙ[Ø]ÚY	Èˆ	ÜÙX[È]È›Ü™\ˆ[ˆ[YNˆ]™\žHÙ[Ø]ÚY	Ë	Ú[	ÊNÂˆH[ÙHÂˆÛÛœÝØ\ÈH‹›YX\Ý\™\ËœÝ\™Z[[˜ÙNÈYˆ
ÈˆØ\ÊHÙ]YX\Ý\™J	ÜÝ\™Z[[˜ÙIËË	Ù[Y\™Ù[˜ÞIËŠNÂˆ˜]]™[
‹[Ý™\ÈÈÙX[]È›Ü™\‹ÛÈ]Nˆ]ÈØ]Ú	ÙÈˆØ\ÈÈ	Üš\Ù\ÈÛ›HÈ	È
ÈÈˆ	ÜÝ^\È]	È
ÈØ\ßX	Ú[	ÊNÂˆBˆBŸB™[˜Ý[Ûˆ™[X\ÙTÙX[Ê
HÈ›Üˆ
ÛÛœÝˆÙˆË›˜][ÛœÊHYˆ
‹œÙX[Y
HÈ‹œÙX[Y[[HÚ[U

H
È
‹œÙX[ÛQ‘S‘’Ó
NÈ‹œÙX[ÛHÈHB‹ËÈHÔUÑˆS‘S‘ÔÎˆ›Ý\ˆ[ˆ[ˆÛÛˆÚÛKÛÈ[ˆ[ˆÛÛYH›ÝYÚÚ]HÝ]HÜÝ
Ý\š]›ÜœË›ÝHÚ[ŠK™YH[ˆ[ˆ›ÚYÛ™H[ˆ[‚‹ËÈÛÜ›ˆÝ]ˆ]HÛÜ›	ÜÈš\[™]]ÈÜš\Ù\ÈHXÙHX[ˆÝØ\™Ú]]™\ˆH\Ý\HÛÜ›È]™HXÚÙY‚˜ÛÛœÝUHHÈÛŽˆK™Ù]
	Ù˜]IÊHOOH	Ì	ËˆÈÚÛNˆØØ\œ™YˆŒ‹›ÚYˆŒËÛÜ›ŽˆŒHKÒSŽˆÌ’SÔŽˆÐUÒˆÌKKK‹‹‹ËŒ—HNÈËÈÐUÒˆÝÈHØ]ÚÚ\™H]œ™XZÜÈÙZYÚÈHØ[ÈØ]Ú]\™B˜ÛÛœÝ˜]R\ÚH
KŠHOˆÈÛÛœÝÈHOˆÈHX]š[][
ˆ
ˆMŠKÙ™XŒÍL™
NÈHX]š[][
ˆ
ˆMJK˜ØMŽŠNÈ™]\›ˆ
ˆ
ˆMŠJHˆÈNÈ™]\›ˆÊÊH
HˆÊ
ˆ
H
ÈŒÌ˜™MXXŠJNÈNÂ™[˜Ý[Ûˆ˜]PÛ\ÜÊŠHÂˆYˆ
‹›Ý]ÛÛYHOOH	Ø›XÚÉÊH™]\›ˆ	Ý›ÚY	ÎÈYˆ
‹›Ý]ÛÛYHOOH	ÚX]	ÊH™]\›ˆ	ÝÛÜ›‰ÎÂˆYˆ
‹›Ý]ÛÛYHOOH	ÜÝ\š]™Y	ÊH™]\›ˆ
‹›OH[È‹›ˆ‹›ÜÝOH[È‹›ÜÝˆ‹™™[OH[È‹™™[ˆ
‹œ™YÚ[YH×JK™š[\ŠOˆš[˜ÛY\Ê	Ê™[
IÊJK›[™Ý
HˆÈ	ÜØØ\œ™Y	Èˆ	ÝÚÛIÎÈËÈHÝ]HÜÝÈH›ÚYˆ›ÝÚÛH
Û™HZÙ[ˆÝ™\ˆÙ\È›ÝÝÜHÚ[ŠBˆ™]\›ˆ	ÛÝ\‰ÎÂŸB™[˜Ý[Ûˆ˜]S™YY

HÈËÈÝÈX[žHÙˆXXÚ[™[™ÈH™^ÛÜ›ÛÝ[œš[™È˜XÚÈÈHÜ]ˆÛÛœÝ™XÙ[H
Ñ‘ËœÙYYOH[ÈÑQQ•Sˆˆ[™XYÙJKœÛXÙJQUK•ÒSŠKˆH™XÙ[›[™Ý
ÈUK”’SÔ‹ÛHÈÚÛNˆØØ\œ™Yˆ›ÚYˆÛÜ›ŽˆÝ\ŽˆNÂˆ›Üˆ
ÛÛœÝÈ[ˆUK•
HÛÚ×H
ÏHUK•Ú×H
ˆUK”’SÔŽÂˆ›Üˆ
ÛÛœÝˆÙˆ™XÙ[
HÛÙ˜]PÛ\ÜÊŠWJÊÎÂˆÛÛœÝ™YYHßNÈ›Üˆ
ÛÛœÝÈ[ˆUK•
H™YYÚ×HHUK•Ú×H
ˆ
ˆ
ÈJHHÛÚ×NÈ™]\›ˆ™YYÂŸB™[˜Ý[Ûˆ˜]TXÚÊÜË‹][
HÈËÈÜÎˆÈØ[ˆH[™[™È]X[œÈÝØ\™NÈ][ˆÝÈHÝ]IÜÈYX\Ý\™\ÈÙZYÚHØ[ˆÛÛœÝ™YYH˜]S™YY

KÙ^\ÈHØš™XÝšÙ^\ÊÜÊKÈHÙ^\Ë›X\
ÈOˆX]›X^
ŒK™YYÛÜÖÚ×WJH
ˆ
][	‰ˆ][Ú×HOH[È][Ú×HˆJJNÂˆ]HŠ
H
ˆËœ™YXÙJ
KŠHOˆH
È‹
KHHÈÚ[H
HÙ^\Ë›[™ÝHH	‰ˆ
OHÖÚWJHˆ
HJÊÎÈ™]\›ˆÙ^\ÖÚWNÂŸB™[˜Ý[Ûˆ˜]Pš\
ÙYY
HÈËÈHÙX]\Žˆœ˜YÚ[OÈÝÈ\™ÈÝÂˆË™œ˜YÈHÈËšX]ÈHNÈË™˜]SÙÈH×NÈË™œ˜YÔˆH”QË”ŽÈË™œ˜YÕšY\ÈH”QË•’QTÎÂˆYˆ
K™Ù]
	Ùœ˜YÉÊHOH[
HË™œ˜YÈHX]›X^
X]›Z[ŠK
ÔK™Ù]
	Ùœ˜YÉÊJJNÂˆYˆ
K™Ù]
	ÚX]ÉÊHOH[
HËšX]ÈHX]›X^
Œ‹X]›Z[ŠË
ÔK™Ù]
	ÚX]ÉÊJJNÂˆYˆ
QUK›ÛˆÑ‘Ë˜Ø[XŠH™]\›ŽÂˆÛÛœÝˆH][™\œžJ˜]R\Ú
ÙYYÑ‘ËœÙYYOH[ÈˆË›ˆ
ˆÎLNJJK™YYH˜]S™YY

NÂˆÛÛœÝ\œÚH™YY›ÚY
È™YYœØØ\œ™YˆHX]›X^
ŒKX]›Z[ŠŽMKÑPUT‹”
ÈÑPUT‹”È
ˆ\œÚ
JKHX]›X^
ŒËX]›Z[ŠËŒLˆ
ÈŒˆ
ˆ™YYÛÜ›ŠJNÂˆÛÛœÝš\œÝHU“ÒQÑQS‹ˆ	‰ˆÑ‘ËœÙYYOH[	‰ˆJ‘TVH	‰ˆ‘TVK›]™JH	‰ˆK™Ù]
	Ùœ˜YÉÊHOH[	‰ˆK™Ù]
	ÚX]ÉÊHOH[ÈËÈHš\œÝÚYÚÙˆH›ÚY
™]™\ˆHš^Y[‰ÜË›ÜˆH™\^IÜÎˆ]ÈÛÙHX[È]
BˆÛÛœÝÝHYš\œÝ	‰ˆK™Ù]
	ÚX]ÉÊHOH[	‰ˆŠ
HÈËÈœ˜YÚ[KÜˆÝÜˆØ[NˆHÝÛÜ›\È›Ü›ˆØ[KÛÈ]]ÈX]XÚY\È]ˆYˆ
K™Ù]
	Ùœ˜YÉÊHOH[	‰ˆ

ZÝ	‰ˆŠ
HŠHš\œÝ
JHË™œ˜YÈHNÂˆYˆ
š\œÝ
HÈË™œ˜YÑX\›HH’T”ÕUÈË™˜]SÙËœ\Ú
	ØHš\œÝÚYÚ	ÊNÈBˆYˆ
Ë™œ˜YÊHÈÛÛœÝÈHX]›X^
X]›Z[ŠKÑPUT‹’
ÈÑPUT‹’È
ˆ
™YY›ÚYH™YYœØØ\œ™Y
JJNÈËÈÝÈ\™
HÚY\ˆ]ÚH\™œ™XZÊNˆ\™\ˆÚ[ˆÜÝÛÜ›È\™HXÚÚ[™È[Ü™H[ˆÜÝÝ]\ËÙ[\ˆHÝ\ˆØ^BˆË™œ˜YÔˆH”QË”ˆ
ˆ
ÑPUT‹”Œ
ÈÑPUT‹”’È
ˆÊNÈË™œ˜YÕšY\ÈHÈHÑPUT‹•ÈÈÈˆ”QË•’QTÎÈË™œ˜YÒ\™H
ÚËÑš^Y
ŠNÈBˆYˆ
Ý
HËšX]ÈHX]›Z[Š‹KH
ÈŒÈ
ˆŠ
H
ÈÑPUT‹’È
ˆX]›X^
™YYÛÜ›ŠJNÈËÈÝ\‹H[Ü™HÛÜ›‹[Ý]ÛÜ›ÈH™XÙ[Û™\ÈXÚÙYˆË™˜]SÙËœ\Ú
Ë™œ˜YÈÈœ˜YÚ[H	ÕË™œ˜YÒ\™Xˆ	ØØ[IÊNÈYˆ
ËšX]ÈˆJHË™˜]SÙËœ\Ú
Ý	ÕËšX]ËÑš^Y
Š_X
NÂŸB˜ÛÛœÝÑPUTˆHÈˆ[J	ÝÜ	ËJKÎˆ[J	ÝÜÉËŒN
Kˆ[J	ÝÚ	ËJKÎˆ[J	ÝÚÉËŒÊKŒˆÍK’ÎˆÍKÎˆËÎˆ[J	ÝÚÉËŒJHNÈËÈÝÈHXÙHX[ˆHÙX]\ˆ
]ŽˆÜÜËÚÚÊB˜ÛÛœÝ”QÐUH™]È›Ø]Ì\œ˜^JŒ
K‘PÌHÈŒNˆ™]È›Ø]Ì\œ˜^JJHKÑQSŒH™]È›Ø]Ì\œ˜^JJKÓ“ÕÌHÈˆ™]È›Ø]Ì\œ˜^JŒ
HNÂ™[˜Ý[Ûˆœ˜YÐ]

HÈËÈÚ\™KÚ[ˆ[™ÚXÚØ^HXXÚÝ]IÜÈÛÜ›ˆ]Èœ™XZÜÂˆÛÛœÝˆH™]È›Ø]Ì\œ˜^JŒ
NÈYˆ
UÈUË™œ˜YÈUË™œ˜YÑ]ŠH™]\›ˆŽÂˆ›Üˆ
]HHÈHNÈJÊÊHYˆ
Ë™œ˜YÑ]–ÚWJH‹œÙ]
Ë™œ˜YÑ]–ÚWKH
ˆ
NÈ™]\›ˆŽÂŸB˜ÛÛœÝœ˜YÕ\\ÈHˆOˆË‹‹›™]ÈÙ]
Ë‹‹›‹š\×K›X\
YOˆ”QË•TVÚYJK™š[\Š›ÛÛX[ŠJWNÂ™[˜Ý[Ûˆœ˜YÔÚ]J‹ŠHÈËÈÛÛY]Ú\™H[ˆ]È[™ˆÛÛœÝ^HÝ]K™ÝÈÈÝ]K™ÚÂˆ›Üˆ
]ÈHÈÈŒÈÊÊÊHÈÛÛœÝHÊŠ
H
ˆˆHJH
ˆ^
ˆŽM
Š
H
ˆˆHJH
ˆŽMNÈYˆ
Ë›˜][ÛœË›[™Ýˆ˜][Û]”Ê
HOOH‹šJH™]\›ˆÈBˆ™]\›ˆ‹˜Ø\œÛXÙJ
NÂŸB‹ËÈHœ˜YÚ[HÛÜ›ˆHÝ]IÜÈÛÜ›ˆ]ÜÈœ™XZËHÚ[HY\ˆ]š\œÝÛÈÛ™H]Ø[‹[™Û˜ÙH[Ü™HY\ˆ]ˆB‹ËÈœ™XZÈ]ÈYX\Ý\™\ÈÛÛÛY\ÈÈ›Ý[™ÎÈÛ™H^HÈ›Ý\ÈHœ™XZÛÝ][™HXÙHXZÙHHØ[‚™[˜Ý[Ûˆ˜]UXÚÊ
HÂˆYˆ
UË™œ˜YÈËœ\ÙHOOH	Ø[]™IÊH™]\›ŽÂˆÛÛœÝHÚ[U

NÈË™œ˜YÐ\›HHË™œ˜YÐ\›H×NÈË™œ˜YÕžHHË™œ˜YÕžH×NÈË™œ˜YÑ]ˆHË™œ˜YÑ]ˆ×NÈË™œ˜YÔ[™HË™œ˜YÔ[™×NÂˆ›Üˆ
ÛÛœÝˆÙˆ[]™S˜][ÛœÊ
JHÂˆÛÛœÝHH‹šKHË™œ˜YÔ[™ÚWNÂˆYˆ
	‰ˆH
È”QË”ÑUJHÈË™œ˜YÔ[™ÚWHH[ÈËÈ›Èœ™XZÛÝ]Ú[˜ÙK[™›È™]È›ÚY[ž]Ú\™Nˆ]Ø\È[ˆÛÛœÝœ›ÚÙHH
Ë˜œ™XZÓÙÈ×JKœÛÛYJˆOˆ‹HHŒJH

ËœÝ]È	‰ˆËœÝ]Ë›ÚY
H
HˆŒ
ÈYKMŽÂˆYˆ
Ë™œ˜YÐ\›VÚWHOOH[™š[š]H	‰ˆXœ›ÚÙJHœ˜YÒ[
‹
NÈBˆYˆ
Ë™œ˜YÐ\›VÚWHOOH[™š[š]H
Ë™œ˜YÕžVÚWH
HH
Ë™œ˜YÕšY\È”QË•’QTÊHË™œ˜YÔ[™ÚWJHÛÛ[YNÂˆÛÛœÝ\\ÈHœ˜YÕ\\ÊŠNÈYˆ
]\\Ë›[™Ý
HÛÛ[YNÂˆÛÛœÝˆH][™\œžJ˜]R\Ú
ËœÙYY‹šH
ˆLÌH
ÈÎLNH
ˆ
Ë™œ˜YÐ\›VÚWHOH[Èˆ
Ë™œ˜YÕžVÚWH
H
ÈJJJNÂˆYˆ
Ë™œ˜YÐ\›VÚWHOH[
HÈYˆ
Ë™œ˜YÑX\›JHÈÛÛœÝš\œÝHUË™œ˜YÑX\›U\ÙYÈË™œ˜YÑX\›U\ÙYHNÈË™œ˜YÐ\›VÚWHHX]›X^

ÈËË™œ˜YÑX\›JH
È
š\œÝÈÈ
ˆŠ
HˆH
ˆ”QËT“L
È”QËT“LH
ˆŠ
JNÈHËÈ
Hš\œÝÚYÚˆ›Ý[™Èœ™XZÜÈ™Y›Ü™HHš\œÝYÙH\ÈÝ™\ŽÂˆ[ÙHË™œ˜YÐ\›VÚWHH
È”QËT“L
È”QËT“LH
ˆŠ
NÈÛÛ[YNÈHËÈHš\œÝÝ]HÚ]HÛÜ›ˆ]ÈÛÛÛˆY\ˆ]H™\Ý]\ŠBˆYˆ
Ë™œ˜YÐ\›VÚWHË˜œ™XXÚ
HÛÛ[YNÂˆÛÛœÝHH\\ÖÓX]™›ÛÜŠŠ
H
ˆ\\Ë›[™Ý
WNÂˆË™œ˜YÕžVÚWHH
Ë™œ˜YÕžVÚWH
H
ÈNÈË™œ˜YÐ\›VÚWHH
È”QËQÐRSŒ
È”QËQÐRSŒH
ˆŠ
NÂˆYˆ
HˆH	‰ˆŠ
H”QË‘ST
ˆ‹›YX\Ý\™\Ë™Y™™\™[X[
HÈœ˜YÒ[
‹ÈKÚNˆ	Ù[\Y	ÈJNÈÛÛ[YNÈHËÈÝXš[\Ù\œÈ[\H]È][œÈ]Ø^BˆÛÛœÝÚ]HHœ˜YÔÚ]J‹ŠNÂˆÛÛœÝÛˆHÛ›ÝÓÙŠŠKÙY[ˆH‹›YX\Ý\™\ËœÝ\™Z[[˜ÙHHH	‰ˆŠ
H™XÚ\Ú[Û“ÙŠŠH
ˆ
ÛˆÈÛ–ÝHHWHˆ
NÈ
Ë™œ˜YÔÙY[ˆHË™œ˜YÔÙY[ˆ™]È›Ø]Ì\œ˜^JJJVÚWHHÙY[ˆÈHˆÈËÈHÚ\œØ]Ú\ÈÙ[ˆ[™XYHÛˆH]ÚYˆ]Û›ÝÜÈ\ÈÚ[™Ùˆœ™XZÂˆYˆ
RS‘ÓÓŠH›Üˆ
ÛÛœÝÈÙˆË›˜][ÛœÊHÈÛÛœÝHHRS‘Ë›Z[™ÖÛË›˜[YWNÈYˆ
JHÈKÛÜ›”ÙY[ˆHX]›Z[ŠŒ
KÛÜ›”ÙY[ˆ
H
ÈJNÈ
KšÚ[™ÈHKšÚ[™ÈßJVÝWHHX]›Z[ŠK
KšÚ[™ÖÝWH
H
ÈJNÈHHËÈ[™]™\žHZ[™[ˆHÛÜ›X\›œÈœ›ÛH][™X\›œÈ\ÈÚ[™ˆYˆ
Ë›˜]JHË›˜]HH˜][šY›Ü›\Ê˜[ÙJNÂˆË™œ˜YÑ]–ÚWHHÜÚ]VÌKÚ]VÌWK
ÈŒ‹WNÈË™œ˜YÔ[™ÚWHHÈKÚ]KÙY[‹Œˆ
ËœÝ]È	‰ˆËœÝ]Ë›ÚY
HNÂˆBŸB™[˜Ý[Ûˆœ˜YÒ[
‹
HÈËÈHÛÜ›ˆ]Èœ›ÚÙK[™›È›ÚYØ[YHÙˆ]ˆÛÛœÝÚHHÚHOOH	Ù[\Y	ÈÈ	Ú]ÈÝXš[\Ù\œÈ[\]	ÈˆHˆH	‰ˆ‹›YX\Ý\™\Ë˜Û[\HHHHÈ	Ú]ÈÛ[\ÛÉÈˆœÙY[ˆÈ	Ú]ÈØ]ÚÛ™]ÈÚ\™HÈÛÚÉÈˆ‹›YX\Ý\™\ËœÝ\™Z[[˜ÙHˆÙX[Y›ÝÊŠHÈ	Ú]ÈØ]ÚØ]Ú\È]	Èˆ	Ú]ÛÛY\ÈÈ›Ý[™ÉÎÂˆ
Ë™œ˜YÓÙÈHË™œ˜YÓÙÈ×JKœ\Ú
Èˆ
ÜÚ[U

KÑš^Y
JKŽˆ‹›˜[YKNˆKÚHJNÂˆÛÛœÝ›[™HÚHOOH	Ú]ÈØ]ÚØ]Ú\È]	ÈÈ›[™Ê‹JHˆ[ÈËÈØ]YÚžH]È˜[™ÝYÚ]ÈØ]ÚØ\ÈÛÚÚ[™È[Ù]Ú\™Bˆ˜]]™[
‹HÛÜ›ˆ]Èœ™XZÜÎˆ	Ñ”Q×ÔÐVVÜW_K[™	ÝÚ_IØ›[™ÈÝYÚ]Ø\ÈÛÚÚ[™È›Üˆ	Ø›[™Xˆ	ÉßX	Ú[	ÊNÂˆXÚÙ\Š	ÙÝ
‹šJ_IÙ\ØÊ‹›˜[YJ_NˆHÛÜ›ˆ]Èœ™XZÜÈ
	Ñ”Q×ÔÐVVÜW_JK[™	ÝÚ_X	Ú[	ÊNÂˆÛÛœÝÚ]HÚHOOH	Ù[\Y	ÈÈ	ÜÝXš[\Ù\œÉÈˆÚHOOH	Ú]ÈÛ[\ÛÉÈÈ	ØÛ[\	ÈˆÚHOOH	Ú]ÈØ]ÚØ]Ú\È]	ÈÚHOOH	Ú]ÈØ]ÚÛ™]ÈÚ\™HÈÛÚÉÈÈ	ÜÝ\™Z[[˜ÙIÈˆ[ÈËÈHYX\Ý\™H][]ÛˆHÝYÙHYˆ›Ý[™ÈÜ™X]\ˆ\ÂˆYˆ
Ú]	‰ˆPÑ‘Ë˜Ø[XŠHÕQÑK›Ù™™\Š	ÝÛÜ›‰ËÈ‹NˆKÚ]Ú]NˆœÚ]H[Ú\œˆÚHOOH	Ú]ÈØ]ÚÛ™]ÈÚ\™HÈÛÚÉË›[™›Û\Îˆ›[™ÈHˆJNÂŸB™[˜Ý[Ûˆ˜]Pœ™XZÛÝ]
ÜšYÚ[ŠHÈËÈ›ÈØ[ˆHYX\Ý\™\È[ˆXÙHXÚYHÚ]Hœ™XZÛÝ]Ù\ÂˆYˆ
UË˜œ™XXÚ
H™]\›ŽÂˆÛÛœÝ[H[]™S˜][ÛœÊ
KÜ˜ÈHÜšYÚ[ˆ
[›[™ÝˆÈ[ÌHˆ[
NÈYˆ
\Ü˜ÊH™]\›ŽÂˆYˆ
Ë™œ˜YÐ\›JHË™œ˜YÐ\›VÜÜ˜ËšWHH[™š[š]NÈËÈHœ˜YÚ[HÝ]IÜÈ[Hœ™XZÜÈÛ˜ÙBˆË˜œ™XXÚœÜ˜ÈHÜ˜ÎÈËÈ]ÈÝÛˆØ]Ú[™]È[\›HYˆ]ÈZ[™ÙY\ÈÛ™K\™H[]\ÂŸB™[˜Ý[ÛˆÝ]P]ÜšY
ÊHÈËÈHÝ]HÚÜÙH[™ÛÈ\ÈÙ[ÙˆHÜšYˆYˆ
[ÈË›˜][ÛœË›[™ÝŠH™]\›ˆ[ÂˆÛÛœÝÈH˜][Û]”ÊÊÖÌH
ÈHHÝ]K™ÝÈÈŠHÈ
Ý]K™ÚÈŠK
ÖÌWH
ÈHHÝ]K™ÚÈŠHÈ
Ý]K™ÚÈŠWJNÂˆ™]\›ˆË›˜][ÛœÖÚ×H	‰ˆË›˜][ÛœÖÚ×K˜[]™HÈË›˜][ÛœÖÚ×Hˆ[ÂŸB™[˜Ý[ÛˆØ]™T™XÛÜ™

HÈËÈHÛÜHÙˆH™XÛÜ™œ›ÛH™Y›Ü™HH›XÚËÙˆ]ÈÝÛ‚ˆÛÛœÝÛ˜\ÈHÝ]KœÛ˜\™š[\ŠÈOˆËœÝ\H	‰ˆËœÝ\HË›]ÐÚ[™ÙTÝ\	‰ˆËœÝ\Ë™X]Ý\
KœÛÜ

KŠHOˆKœÝ\H‹œÝ\
NÂˆÛÛœÝÛ˜\HÛ˜\Ë™š[\ŠÈOˆË™X]Ý\HËœÝ\HÔÈ
ˆ‹JKœÜ

HÛ˜\ÖÌNÂˆË™X]™XÈH[ÈYˆ
\Û˜\
H™]\›ŽÂˆ[ØÔ™\^J
NÈ˜]Ê“ÑË˜ÛÜKÝ]K‘‹ßKÈTÎˆÛ˜\”ËVˆÛ˜\–JNÈË™X]™XÈHÈÎˆÝ]K”ËˆÝ]K”Ý\ˆÛ˜\œÝ\NÂŸB˜ÛÛœÝ™[Û•Ø^HH

HOˆ˜[YS\Ý
Ë›˜][ÛœË™š[\ŠˆOˆ‹›ÜÝÓ˜SŠK›X\
ˆOˆ‹›˜[YJJNÂ˜ÛÛœÝ[Üš\Ú\ÈHˆOˆHUË˜œ™XXÚ	‰ˆ
Ë›˜][ÛœË›[™Ýˆ
‹›ÚYÚ\™H
HˆŒŠNÈËÈ›XÚÈ[ˆ]È[™ˆ]ØZ]Â˜ÛÛœÝ˜[YS\ÝHOˆ›[™ÝˆHÈœÛXÙJLJKš›Ú[Š	Ë	ÊH
È	È[™	È
ÈÛ›[™ÝHWHˆ
ÌH	ÉÊNÂ‹ËÈHÛÜ›]ÛÛY\È›ÝYÚ[™ÈÚÛK]™\žHÝ]H[ˆ][]™K[™Ú[œÎÈÜˆÚ]Û›HÛÛYHÙˆ]ÈÝ]\ËÚXÚ‹ËÈÝ\š]™H]ˆÜÝÈH›ÚYHÝ]H\š\ÚYÈÜ]YY^™YÝ]žHH™ZYÚ›Ý\‹]Ø\ÈZÙ[ˆÝ™\‹‚‹ËÈHÛÜ›Ú[œÈÚ[ˆH›ÚY\ÈZÙ[ˆ›Û™HÙˆ]ÈÝ]\ËˆHÝ]HZÙ[ˆÝ™\ˆžH]È™ZYÚ›Ý\ˆÙ\È›ÝÝÜ]ˆ]È[™‹ËÈ]™\ÈÛ‹[™\ˆ]ÈZÙ\‹ˆ
Ú]\ˆ]\È›ÈÜÜÈ\ÈYÜ[‹ŠH
ÜÝ›ÚYˆHÝ]HH›ÚYÛÚËÜˆÛ™HÚÜÙH[™Ù[ÝÛˆÚ]]ŠB˜ÛÛœÝÜÝ›ÚYHˆOˆ[‹˜[]™H	‰ˆJ‹˜[›™^YžH	‰ˆ[‹™XY
NÂ˜ÛÛœÝÛÛ•ÚÛHH

HOˆHUÈ	‰ˆUË›˜][ÛœËœÛÛYJÜÝ›ÚY
NÂ˜ÛÛœÝZÙ[”Ø^HHÈOˆÈÛÛœÝžHH™]ÈX\

NÈ›Üˆ
ÛÛœÝˆÙˆË›˜][ÛœÊHYˆ
[‹˜[]™H	‰ˆ‹˜[›™^YžH	‰ˆ[‹™XY
HžKœÙ]
‹˜[›™^YžK
žK™Ù]
‹˜[›™^YžJH×JK˜ÛÛ˜Ø]
‹›˜[YJJNÂˆ™]\›ˆË‹‹˜žWK›X\

ÛËJHOˆ	Û˜[YS\Ý

_H	Û›[™ÝˆHÈ	ÝÙ\™IÈˆ	ÝØ\ÉßHZÙ[ˆÝ™\ˆžH	ÛË›˜[Y_X
Kš›Ú[Š	ÎÈ	ÊNÈNÂ˜ÛÛœÝT\HÈOˆË›Ý]OOH	ÜÝ\š]™Y	È	‰ˆ
Ë›OH[ÈË›ˆˆË™™[OH[ÈË™™[ˆˆH]Ëœ\X[
NÈËÈHZ[™ÉÈ™XÛÜ™ÙˆHÛÜ›ˆÛÛYHÝ]HÜÝÈH›ÚY˜ÛÛœÝÚ›Û”\HˆOˆ‹›Ý]OOH	ÜÝ\š]™Y	È	‰ˆ
‹›OH[È‹›ˆˆ
‹›˜]È×JKœÛÛYJOˆ›Ý]OOH	ÙYY	ÊJNÈËÈ
HÝ]HZÙ[ˆÝ™\ˆÙ\È›ÝÝÜHÚ[ŠB™[˜Ý[ÛˆÛ[
[]™JHÂˆÛÛœÝ\ˆHË›˜][ÛœË™š[\ŠˆOˆ[‹˜[]™H	‰ˆ[‹˜[›™^YžJKZÈHË›˜][ÛœË™š[\ŠˆOˆ[‹˜[]™H	‰ˆ‹˜[›™^YžJKÈH×NÂˆYˆ
\‹›[™Ý
HËœ\Ú
	Ù\ØÊ˜[YS\Ý
\‹›X\
ˆOˆ‹›˜[YJJJ_H\š\ÚYYHÈÛÛYHÛÛXš[˜][ÛˆÙˆ˜YXÚÈ[™HXÚÈÙˆÛÛ›ÛË˜
NÂˆÛÛœÝžHH™]ÈX\

NÈ›Üˆ
ÛÛœÝˆÙˆZÊHžKœÙ]
‹˜[›™^YžK
žK™Ù]
‹˜[›™^YžJH×JK˜ÛÛ˜Ø]
‹›˜[YJJNÂˆ›Üˆ
ÛÛœÝÛËHÙˆžJHËœ\Ú
	Ù\ØÊ˜[YS\Ý

J_H	Û›[™ÝˆHÈ	ÝÙ\™IÈˆ	ÝØ\ÉßHZÙ[ˆÝ™\ˆžH	Ù\ØÊË›˜[YJ_K˜
NÂˆÛÛœÝ[H[]™K›X\
ˆOˆ‹›˜[YJNÂˆËœ\Ú
	Ù\ØÊ˜[YS\Ý
[
J_HÝ\š]™YYHÈÛÛYHÛÛXš[˜][ÛˆÙˆXÚÈ[™HÛÛ›ÛÈ	Ø[›[™ÝˆHÈ	Ý^IÈˆ	Ú]	ßHY[ˆXÙK˜
NÂˆ™]\›ˆËš›Ú[Š	È	ÊNÂŸB‹ËÈÚ[HH›XÚÈÜ™XYÎˆHÝ]HÚÜÙH[™]ZÙ\È˜[Ë\™H[™[ŽÈÚ[ˆ]™\žHÝ]H\ËHÛÜ›[™ÎÂ‹ËÈÚ[ˆ]ÝÜÈÜ™XY[™ËÜˆ\È™\Z\™YHœ™XXÚ\ÈÝ™\ˆ[™HÛÜ›ÚXÚ™]™\ˆÝÜYÛÙ\ÈÛ‹‚™[˜Ý[Ûˆœ™XXÚXÚÊÝ
HÂˆÛÛœÝˆHË˜œ™XXÚHÚ[U

KÚ[˜ÙHHH‹˜\ÙHHË™X]›ÚY˜\ÙHÂˆYˆ
‹œ]ZY]	‰ˆPÑ‘Ë˜Ø[Xˆ	‰ˆ
ÛJ
HÈÝ›ÚYH˜\ÙHˆŒH[]™S˜][ÛœÊ
KœÛÛYJˆOˆ
‹›ÚYÚ\™H
HˆŒŠHˆÛÚÒÛ
‹Ý˜\ÙJJJHÈËÈ[›ÈÛ™Ù\Žˆ]\ÈZÙ[ˆÛ[™HÛÜ›[œÝÙ\œÈ]›ÝÂˆ‹œ]ZY]H[™Yš[™YÈËš[H[ÈYˆ
[ÛJ
JHÈœ™XZÔ˜[J
NÈY™[™›Ü™\œÊ‹Ú\™JNÈÙX[]Ø[

NÈÛ™YÚ[Š
NÈBˆÙY[‘ÛØ™J
NÈ‹™Ø]HH
ÈÓQS—ÔÒSH
ˆ
Ë˜›ÛÜÝÈËHˆJNÈYˆ
Q–›ÛY[ŠHÈžÛY[Š‹›ÜšYÚ[‹‹Ú\™H	‰ˆ‹Ú\™K›˜[YJNÈYˆ
–›ÛY[ŠH–›ÛY[‹ÈH‹ÌÈHBˆYˆ
‹™Ø]HOH[	‰ˆ‹™Ø]JHÈËÈ›ÝÚÝÛˆY]
HÛY[ˆ[œÈÛˆHÛÜ›	ÜÈÛØÚÊNˆÛ›HH™\Z\ˆØ[ˆ\[ˆÝ]ÙˆÚYÚˆYˆ
˜\ÙHˆÈÝ›ÚYH˜\ÙH
ÈŒˆ\Ý˜[žU›ÚY
HÈÛÛœÝÛHH–›ÛY[ˆ	‰ˆQ–›ÛY[‹™š\™Y	‰ˆQ–›ÛY[‹™žˆÈ–›ÛY[ˆˆ[ÂˆYˆ
ÑQS‹›ÛŠHÈYˆ
ÛJHÛK˜Ø]YÚHYNÈ[™œ™XXÚ
˜[ÙKYJNÈHËÈ™\Z\™YÝ]ÙˆÚYÚˆ]Ý[œ™XZÜË\ÈÙY[‹[™\ÈÚÝÛˆØ]YÚˆ[ÙHÈYˆ
ÛJHžš^ž›J
NÈ[™œ™XXÚ
˜[ÙJNÈHBˆ™]\›ŽÈBˆYˆ
‹™Ø]HOH[	‰ˆ–›ÛY[ˆ	‰ˆQ–›ÛY[‹™š\™Y	‰ˆQ–›ÛY[‹™žŠH–›ÛY[‹™›Ü˜ÙHHYNÈËÈ]È[YH\È\ˆHœ™XZÈ\ÈÚÝÛˆ›ÝÂˆYˆ
‹œÚÝÛˆOH[
H‹œÚÝÛˆHÂˆÛÛœÝÚ[™ÛHHË›˜][ÛœË›[™Ý‹ZÙ[ˆH[]™S˜][ÛœÊ
K™š[\ŠˆOˆ
Ú[™ÛHÈÝ›ÚYˆ‹›ÚYÚ\™H
HHÍJNÂˆYˆ
Ý›ÚYˆŽNH
ZÙ[‹›[™Ý	‰ˆZÙ[‹›[™ÝOOH[]™S˜][ÛœÊ
K›[™Ý
JHÈÛÜ›[™ÊZÙ[ŠNÈ™]\›ŽÈBˆ›Üˆ
ÛÛœÝˆÙˆZÙ[ŠHÝ]Q˜[ÊŠNÂˆYˆ
P‹™™[›[™Ý	‰ˆ
˜\ÙHˆÈÝ›ÚYH˜\ÙH
ÈŒˆ\Ý˜[žU›ÚY
JHÈ[™œ™XXÚ
˜[ÙJNÈ™]\›ŽÈHËÈ™\Z\™Y™Y›Ü™H]ÛÚÈ[ž][™Âˆ‹˜Z[œ\Ú
ÝÝ›ÚYJNÈÚ[H
‹˜Z[›[™ÝˆH	‰ˆH‹˜Z[ÌVÌHˆJH‹˜Z[œÚY

NÂˆÛÛœÝÝ[HH‹˜Z[ÌVÌHH	‰ˆÝ›ÚYH‹˜Z[ÌVÌWHŒÂˆYˆ

Ú[˜ÙHˆH	‰ˆÝ[	‰ˆH‹œÚÝÛˆˆÊH
Ú[˜ÙHˆÑ‘ËšÛÈ	‰ˆH‹œÚÝÛˆˆ
JH[™œ™XXÚ
YJNÈËÈÙY[ˆ›ÜˆHÚ[Hš\œÝŸB™[˜Ý[ÛˆÝ]Q˜[ÊŠHÂˆË˜œ™XXÚ™™[œ\Ú
‹›˜[YJNÈ‹›ÜÝÓ˜SˆHYNÂˆ˜[˜][ÛŠ‹	ÛÜÝ	ÊNÈËÈ]È[™\ÈXYˆH›XÚÈZÙ\ÈH™\ÝŸB™[˜Ý[ÛˆÛÜ›[™Ê\Ý
HÈËÈH›XÚÈ\È]™\žHÝ]NˆHÛÜ›\È[™YˆÛ[™
Ë˜œ™XXÚYJNÈ™[X\ÙTÙX[Ê
NÂˆË™[™Ý]\ÈHË›˜][ÛœË›[™ÝˆHÈË‹‹ŠË˜œ™XXÚ™™[×JK‹‹›\Ý›X\
ˆOˆ‹›˜[YJWHˆ[ÂˆË˜œ™XXÚH[ÈÝ\ÜÝ[Ü[J
NÂŸB™[˜Ý[Ûˆ[™œ™XXÚ
ÝÜY\Ú
HÂˆÛÛœÝˆHË˜œ™XXÚÈËš\Ú›ÝHHHJˆ	‰ˆ‹œ]ZY]
NÈ[™œ™XXÚ
ÝÜY\ÚËš\Ú›ÝJNÈËš\Ú›ÝHH˜[ÙNÈYˆ
PŠH™]\›ŽÂˆÈÛÛœÝHË˜œ™XZÓÙÈ	‰ˆË˜œ™XZÓÙÖÕË˜œ™XZÓÙË›[™ÝHWNÈYˆ
	‰ˆ™[™OH[
HÈ™[™H
ÜÚ[U

KÑš^Y
JNÈ˜Ø]YÚH\ÝÜYÈ™™[H
‹™™[×JKœÛXÙJ
NÈHBˆYˆ
‹›\Ý˜[	‰ˆJ‹™™[	‰ˆ‹™™[›[™Ý
H	‰ˆËœ\ÙHOOH	Ø[]™IÈ	‰ˆUË›\Ý˜[]	‰ˆË›\Ý˜[žH	‰ˆË›\Ý˜[žK˜[]™H	‰ˆ\›“Y
Ë›\Ý˜[žJHOOH
HË›\Ý˜[]H‹›\Ý˜[ÂˆYˆ
\ÝÜY	‰ˆËœ\ÙHOOH	Ø[]™IÊHÈËš[HÈ[[ˆÚ[U

H
ÈS”ËÚ\™Nˆ‹Ú\™H	‰ˆ‹Ú\™K›˜[YHNÂˆÛÛœÝÙ^HH‹Ú\™HÈ‹Ú\™K›˜[YHˆË›˜][ÛœË›[™ÝˆÈ	Ê‰Èˆ[YØZ[ˆHHJÙ^H	‰ˆË˜Ø]YÚ[ˆ	‰ˆË˜Ø]YÚ[‹š\ÊÙ^JJNÂˆYˆ
Ù^JH
Ë˜Ø]YÚ[ˆHË˜Ø]YÚ[ˆ™]ÈÙ]

JK˜Y
Ù^JNÈËÈ]\ÈØ]YÚ]Û˜ÙNˆœ›ÛH›ÝÈÛ‹]ZY]BˆYˆ
‹œ]ZY]
H[YØZ[Š‹Ù^KYØZ[ŠNÈBŸB™[˜Ý[Ûˆ[YØZ[Š‹Ù^KYØZ[ŠHÈËÈH›ÚY˜XÚÈÚ\™H]Ø\ÈØ]YÚ™Y›Ü™K[™Ø]YÚYØZ[ŽˆH[™K›ÝHØÙ[™BˆÛÛœÝÈH

Ëš[ˆHËš[ˆßJVÚÙ^H	Ê‰×HH

Ëš[–ÚÙ^H	Ê‰×JH
H
ÈJKˆH‹Ú\™H	‰ˆ‹Ú\™K˜[]™HÈ‹Ú\™Hˆ[ÂˆYˆ
Ñ‘Ë˜Ø[XŠH™]\›ŽÂˆYˆ
ÈOOHH	‰ˆUËš[ØZY
HÈËš[ØZYHYNÈÕQÑKš[YØZ[Š‹YØZ[ŠNÈHËÈHš\œÝÙˆHÛÜ›HZ[ˆ]NÈ[‹›ÝÈ[™[‹H[™Bˆ[ÙHYˆ
ÌK‹ËKLŒLKš[˜ÛY\ÊÊJHXÚÙ\Š	ÛˆÈÝ
‹šJH
È\ØÊ‹›˜[YJH
È	Îˆ	Èˆ	Éß]H›ÚYÝ\œÉÚÈˆHYØZ[ˆÈ	ÈYØZ[‰Èˆ	ÉßK[™\È[]˜^IÚÈˆHÈ
	ÚÈOOHˆÈ	ÝÚXÙIÈˆ“[JÊH
È	È[Y\ÉßH›ÝÊXˆ	ÉßX	Ú[	ËYJNÂŸB™[˜Ý[Ûˆ[™œ™XXÚ
ÝÜY\Ú
HÂˆÛÛœÝˆHË˜œ™XXÚÈË˜œ™XXÚH[È™[X\ÙTÙX[Ê
NÈË›˜]HH˜][šY›Ü›\Ê˜[ÙJNÈÙ]U›ÚY

NÂˆÛ[™
‹˜[ÙJNÈYˆ
\ÝÜY
HË˜Ø]YÚˆH
Ë˜Ø]YÚˆ
H
ÈNÂˆ›Üˆ
ÛÛœÝˆÙˆ[]™S˜][ÛœÊ
JHYˆ
ˆOOH‹Ú\™H	‰ˆ‹™Y™[˜ÙH	‰ˆ‹™Y™[˜ÙK›ÚÈ	‰ˆ‹šÚ[™OOH	ÜÝ[	ÊHÈ‹™[Y\™Ù[˜ÞUØ]ÚHYNÈ‹œÝ\ÝÛˆHYNÈ‹œÝ\›ÛÜˆH‹™Y™[˜ÙKÌOH[È‹™Y™[˜ÙKÌˆÈ‹˜[\›Qœ›ÛHH‹Ú\™HÈ‹Ú\™K›˜[YHˆ[ÈHËÈ]ÙX[Y[ˆ[ˆ[Y\™Ù[˜ÞH[™ÝÛÙˆÛ™H^H]Ú]™\È]Ø]Ú˜XÚÂˆYˆ
\ÝÜY	‰ˆZ\Ú	‰ˆPÑ‘Ë˜Ø[Xˆ	‰ˆ‹Ú\™H	‰ˆ‹Ú\™K˜[]™JHÈÛÛœÝÈH‹Ú\™K›YX\Ý\™\ËœÝ\™Z[[˜ÙNÈËÈX[YÚ\™H]œ›ÚÙKžH]ÈÝÛˆØ]Úˆ˜]]™[
‹Ú\™K]ÈØ]ÚX[ÈH›ÚYÚ\™H]œ›ÚÙX	Ú[	ÊNÈÕQÑKšX[Y
‹Ú\™KÊNÈBˆYˆ
P‹œ]ZY]ÛJ
JH™YÚ[YTÚØÚÊ‹Ú\™JNÈËÈ
Û™H[]˜^HÚZÙ\È›È™YÚ[YJBˆYˆ
\ÝÜY
HÈÛÛÛZ[™Y

NÈË™X]™XÈH[ÈYˆ
Z\Ú
HÕQÑK˜ÛÛZ[™Y

NÈ™]\›ŽÈBˆËœÝ]ÈHYX\Ý\™J]™PYŠNÈËœ\X[ÈH
Ëœ\X[È
H
ÈNÂˆÛÛœÝÚ\™HH‹Ú\™H	‰ˆ‹Ú\™K›˜[YKÝ[™[™ÈH[]™S˜][ÛœÊ
K›X\
ˆOˆ‹›˜[YJK™[H‹™™[ÂˆÛÛœÝÙX[YˆH[]™S˜][ÛœÊ
K™š[\ŠˆOˆ‹™Y™[˜ÙH	‰ˆ‹™Y™[˜ÙK›ÚÊK›X\
ˆOˆ‹›˜[YJK[ˆHÝ[™[™Ë™š[\ŠOˆ\ÙX[Y‹š[˜ÛY\Ê
JNÂˆÛÛœÝ]SˆHË›˜][ÛœË™š[\ŠˆOˆ™[š[˜ÛY\Ê‹›˜[YJH	‰ˆ‹™Y™[˜ÙH	‰ˆ[‹™Y™[˜ÙK›ÚÊK›X\
ˆOˆ‹›˜[YJNÂˆÛÛœÝÝÛÙˆH[]™S˜][ÛœÊ
K™š[\ŠˆOˆˆOOH‹Ú\™JKÚHHØš™XÝ™œ›ÛQ[šY\ÊÝÛÙ‹›X\
ˆOˆÛ‹›˜[YK[ÚJŠWJJKÜœHßNÂˆ›Üˆ
ÛÛœÝˆÙˆÝÛÙŠH
ÜœÝÚVÛ‹›˜[YWVÌWHHÜœÝÚVÛ‹›˜[YWVÌWH×JKœ\Ú
ŠNÂˆÛÛœÝ[HÉÝ[YIË	ÛÛ˜ÙIË	ÝØ]Ú	Ë	ÛXÚÉË	Ü™XXÚ	×K™š[\ŠÈOˆÜœØ×JK›X\
ÈOˆ	È	È
È[Ø^JÜœØ×K›X\
ˆOˆ‹›˜[YJKËÜœØ×K›X\
ˆOˆÚVÛ‹›˜[YWVÌWJJJKš›Ú[Š	ÉÊNÂˆÛÛœÝ]UÈHË›˜][ÛœË™š[\ŠˆOˆ]S‹š[˜ÛY\Ê‹›˜[YJJK›X\
ˆOˆ‹™Y™[˜ÙKÌOH[È‹™Y™[˜ÙKÌˆ
NÂˆÛÛœÝÜ˜ÕH‹Ú\™H	‰ˆ™[š[˜ÛY\Ê‹Ú\™K›˜[YJHÈ	Ù\ØÊ‹Ú\™K›˜[YJ_H	Ð‹™Ø]™HÈYÚ]™[ˆ˜XÚÈHØ]Ú]Ø]™Y]œ›ÛH	Ð‹™Ø]™_HÝÛˆÈ	Ð‹ÌK	Ð‹ÌÈ	Û›Ý[›ÝYÚÈØ]Ú]\™IÈˆ	ÜÛÈ›Ý[™ÈÛÝ[Ø]Ú]\™IßXˆ‹˜›[™ÈYX\›™YÈØ]Ú›Üˆ	Ù\ØÊ‹˜›[™
_K[™	Ñ”Q×ÔÐRQÐ‹šÚ[™_HÚ\™H]Ø\È›ÝÛÚÚ[™Øˆ‹ÌÈÙ\HØ]ÚÙˆ	Ð‹ÌK›Ý[›ÝYÚÈØ]Ú]\™Xˆ	ÚÙ\›ÈØ]ÚÛÈ›Ý[™ÈÛÝ[Ø]Ú]\™IßK˜ˆ	ÉÎÂˆK›ÜšYÚ[ˆHË›ÜšYÚ[ŽÈK™™[H™[ÈKÚ\™HHÚ\™NÈK™˜[[™[H[ÂˆÛÛœÝ˜XÙYH˜XÙR[˜XÚÙÜ›Ý[™

NÂˆYˆ
Ë™X]›ÙÈ	‰ˆË™X]›ÙÈOOHËœ›ÙÊH›Ü›ÙÜ˜[JË™X]›ÙÊNÈË™X]›ÙÈH[ÈË™X]˜]HH[ÈË™X]™XÈH[ÂˆË›ÚY˜\ÙHHX]›X^
ŒKËœÝ]Ë›ÚY
NÈË™X]Ý\HLNÂˆYˆ
]˜XÙY
HØØ\”™XÙZ\
×K	Ó›È™XÛÜ™œ›ÛH™Y›Ü™HH›ÚYÝ\š]™\ËÛÈÚ]XYH]Ø[››Ý™H˜XÙY‰ÊNÂˆYˆ
™[›[™Ý
HÂˆK™˜[[™[HÈXYˆ	Û˜[YS\Ý
™[
_H	Ù™[›[™ÝˆHÈ	Ù˜[	Èˆ	Ù˜[ÉßHÈ˜S˜ˆÝXŽˆÛÜ›	ÜYŠË›Š_H0­È	Û[\ÜÊË™X]Ú[U

J_HÙˆÛÜ›[YH0­ÈHÛÜ›ÛÙ\ÈÛ˜ˆYNˆ•H›ÚYœ›ÚÙHÝ]	ÝÚ\™HÈ	È[ˆ	È
È\ØÊÚ\™JHˆ	ÉßH[™ÛÚÈ	Ù\ØÊ˜[YS\Ý
™[
J_K‰ÜÜ˜ÕIÚ[IÛ]S‹›[™ÝÈ	Ù\ØÊ˜[YS\Ý
]SŠJ_H[Ý™YÈÙX[	Û]S‹›[™ÝˆHÈ	ÝZ\ˆ›Ü™\œÉÈˆ	Ú]È›Ü™\‰ßHÛÈ]K	Û]S‹›[™ÝˆHÈ	ÝZ\ˆØ]Ú]	Èˆ	Ú]ÈØ]Ú]	ßH	Û˜[YS\Ý
]UË›X\
Ýš[™ÊJ_K˜ˆ	ÉßHH›ÚYÝ^\ÈÚ\™H]™[Ü˜ˆ
ÈÛ\ÜÏHœH‰Ù™[›[™ÝˆHÈ	ÔÝ]\È]™IÈˆ	ÐHÝ]H\ÉßH[™Y›ÝHÛÜ›ˆHÛÜ›[™ÈÛ›HÚ[ˆ]™\žHÝ]H\ËÜ˜ˆ
È
˜XÙYÈÛ\ÜÏHœH•Ú]XYHH›ÚY\È™Z[™È˜XÙYœ›ÛHH™XÛÜ™Ý]ÙˆÚYÚÚ[HHÛÜ›[œÈÛ‹Ü˜ˆ	ÉÊHNÂˆÚÝÑ˜[[™[
	ÉÊNÂˆYˆ
PÑ‘Ë˜Ø[XŠHXÚÙ\Š‰Ù\ØÊ˜[YS\Ý
™[
J_OØˆ™[È˜S‰ÜÝ[™[™Ë›[™ÝÈ0­È‰Ù\ØÊ˜[YS\Ý
Ý[™[™ÊJ_OØˆ	ÜÝ[™[™Ë›[™ÝˆHÈ	ÜÝ[™	Èˆ	ÜÝ[™ÉßXˆ	ÉßX	Ý\	ËYJNÂˆÛX\•[Y[Ý]
[™œ™XXÚ
NÈ[™œ™XXÚHÙ][Y[Ý]


HOˆÈYˆ
Ëœ\ÙHOOH	Ø[]™IÈ	‰ˆK™˜[[™[
H[œKšY[ˆHYNÈKÌ
NÂˆH[ÙHYˆ
PÑ‘Ë˜Ø[Xˆ	‰ˆZ\Ú
Hš[›ÝJÚ\™HÈ›ÚY[[ˆ	ÝÚ\™_Xˆ	Õ›ÚY[	ËH›ÚYœ›ÚÙHÝ]	ÝÚ\™HÈ[ˆ	ÝÚ\™_x &\È[™ˆ	ÉßH[™Ø\È[\™K‰ÝÚ\™HÈ	ÝÚ\™_HÝ[™ËØØ\œ™Y˜ˆ	ÉßHH›ÚYÝ^\ÈÚ\™H]ÝÜY˜
NÂˆË›ÜšYÚ[ˆH[ÈYˆ
Z\Ú™[›[™Ý
HÕQÑKš[
™[Ý[™[™ËÚJNÂˆ›Üˆ
ÛÛœÝˆÙˆ[]™S˜][ÛœÊ
JH‹›™^˜]ÕHX]›X^
‹›™^˜]ÕÚ[U

H
ÈKH
È‹šH
ˆÊNÂˆ\]SX\Ý

NÂŸB™[˜Ý[ÛˆÚÝÑ˜[[™[
^˜JHÂˆÛÛœÝHK™˜[[™[ÈYˆ
T
H™]\›ŽÂˆ[œKšY[ˆH˜[ÙNÈ[˜Ù‹šY[ˆHYNÂˆ[œKš[›™\’SH‰Ù\ØÊšXY
_OÚ]ˆÛ\ÜÏHœÝXˆ‰ÔœÝXŸOÙ]‰Ô›Y_IÙ^˜H	ÉßXÂŸB™[˜Ý[ÛˆÛÛÛZ[™Y

HÂˆËœ\ÙHH	Ø[]™IÎÈË™X]Ý\HLNÈË›ÜšYÚ[ˆH[ÈË›\Ý˜[]HÂˆYˆ
Ë™X]›ÙÈ	‰ˆË™X]›ÙÈOOHËœ›ÙÊH›Ü›ÙÜ˜[JË™X]›ÙÊNÈË™X]›ÙÈH[ÂˆYˆ
UËš\Ú›ÝJHš[›ÝJ	ÐÛÛZ[™Y	Ë	Ó›Û‹Yš[š]H˜[Y\ÈÙ\™H™\Z\™Y˜\Ý\ˆ[ˆ^HÜ™XYˆH[™\ÈØØ\œ™Y‰Ë	ÜÝ\™Z[[˜ÙIÊNÂˆË™X]˜]HH[È\]SX\Ý

NÂŸB‚˜ÛÛœÝHHÈXÝ]™Nˆ˜[ÙHNÂ‹ËÈ\È][ˆ[™ÜˆHØØ\ÈXÚYYÚ[HH›XÚÈ\ÈÝ[Ü™XY[™Ë™Y›Ü™H[ž][™È\ÈØZYˆ]\È[ˆ[™Ú[ˆB‹ËÈ›XÚÈ\È
[[ÜÝ
H]™\ž][™ËÜˆÚ[ˆ›È˜][ÛˆÝ[ÛÈH›Ü™\ˆYØZ[œÝ]È]\ÈHØØ\ˆÚ[ˆ]\ÈÝÜY‹ËÈÜ™XY[™È[™ÛÛYH˜][ÛˆÛËˆHÛÜ›ÙˆÛ™H˜][Ûˆ\È›È›Ü™\ˆÈÛˆ][™È[›\ÜÈ]ÈØ]Ú™\Z\œÈ]‚™[˜Ý[Ûˆ[˜][ÛœÊ
HÈ™]\›ˆ[]™S˜][ÛœÊ
K™š[\ŠˆOˆ‹›ÚYÚ\™HÍH	‰ˆ‹œÚ\™HˆŒŠNÈB™[˜Ý[ÛˆZ[™Õ™\™XÝ
Ý
HÂˆÛÛœÝHÚ[U

KÚ[˜ÙHHHË™X]ˆHË›ÚY˜Z[
Ë›ÚY˜Z[H×JNÂˆ‹œ\Ú
ÝÝ›ÚYJNÈÚ[H
‹›[™ÝˆH	‰ˆH–ÌVÌHˆJH‹œÚY

NÂˆYˆ
Ý›ÚYˆŽNJH™]\›ˆ	Ù[™	ÎÂˆYˆ
Ë›˜][ÛœË›[™ÝŠH™]\›ˆÚ[˜ÙHˆÑ‘ËšÛÈÈ	Ù[™	Èˆ	ÉÎÂˆÛÛœÝ[H[˜][ÛœÊ
NÂˆYˆ
Z[›[™Ý
H™]\›ˆÚ[˜ÙHˆˆÈ	Ù[™	Èˆ	ÉÎÂˆÛÛœÝÝ[HH–ÌVÌHH	‰ˆÝ›ÚYH–ÌVÌWHŒÈËÈH›XÚÈ\ÈÝÜYÜ™XY[™Âˆ™]\›ˆ
Ú[˜ÙHˆH	‰ˆÝ[
HÚ[˜ÙHˆÑ‘ËšÛÈÈ	Ú[	Èˆ	ÉÎÂŸB™[˜Ý[ÛˆØØ\•ÛÜ›

HÂˆÛÛœÝ[H[˜][ÛœÊ
NÂˆK›ÜšYÚ[ˆHË›ÜšYÚ[ŽÈKšXYHÛÜ›	ÜYŠË›Š_HÛÙ\ÈÛ˜ÈK™ÛÙ\ÓÛˆHYNÂˆYˆ
]˜XÙR[˜XÚÙÜ›Ý[™

JHØØ\”™XÙZ\
×K	Ó›È™XÛÜ™œ›ÛH™Y›Ü™HH›ÚYÝ\š]™\ËÛÈÚ]XYH]Ø[››Ý™H˜XÙY‰ÊNÂˆ™\Ý[YPY\Ø]\Ý›ÜJ[
NÂŸB‹ËÈHÜÝ[[Ü[HÙˆHØØ\‹Ý]ÙˆÚYÚˆHØ[YH™\^\ËÛˆHÛÜHÙˆH™XÛÜ™H™]ÈÝ\ÈHœ˜[YKÚ[HHÛÜ›[œÈÛ‚™[˜Ý[Ûˆ˜XÙR[˜XÚÙÜ›Ý[™

HÂˆYˆ
Ñ‘Ë˜Ø[XˆX™YÚ[•˜XÙJYJJH™]\›ˆ˜[ÙNÂˆÓœ›ÙÈHK˜˜\ÙNÈË™X]›ÙÈH[È™]\›ˆYNÈËÈH˜XÙHÝÛœÈH]ÜÈ\È^HÙ\™BŸB™[˜Ý[ÛˆX›Ü˜XÙJÚJHÂˆYˆ
TK˜™ÊH™]\›ŽÂˆYˆ
Kœ›ÙÈ	‰ˆKœ›ÙÈOOHK˜˜\ÙH	‰ˆKœ›ÙÈOOHËœ›ÙÊH›Ü›ÙÜ˜[JKœ›ÙÊNÈYˆ
Kœ™JHÈ›Ü›ÙÜ˜[JKœ™Kš
NÈKœ™HH[ÈBˆÛÛœÝ˜\ÙHHK˜˜\ÙNÈÓœ›ÙÈH[ÈYˆ
˜\ÙH	‰ˆ˜\ÙHOOHËœ›ÙÊH›Ü›ÙÜ˜[J˜\ÙJNÂˆKœ›ÙÈH[ÈK˜˜\ÙHH[ÈK˜XÝ]™HH˜[ÙNÈK˜™ÈH˜[ÙNÂˆYˆ
È	‰ˆË›ˆOOHKÛˆ	‰ˆÚJHØØ\”™XÙZ\
×K›Ý˜XÙYˆ	ÝÚ_K˜
NÂŸB™[˜Ý[ÛˆØØ\”™XÙZ\
[\XØ]YXœÊHÂˆYˆ
Ñ‘Ë˜Ø[XŠH™]\›ŽÂˆÛÛœÝ™[HK™™[×NÂˆÛÛœÝˆH™XÙZ\
	Ø›XÚÉËÛÜ›	ÜYŠË›Š_H0­È	ØÛØÚÔÝŠ
_X	Ó›Ý˜]Û‰Ë	Ó˜S‰ËXœÈ
[\XØ]Y›[™ÝÈ	ÐÛÛ\ÜÙYÙˆ	È
È[\XØ]Y›X\
Oˆ	Ý™Y‹›˜[Y_H
	Ù˜]ÕYÊ
_JX
Kš›Ú[Š	È
È	ÊH
È	Ë‰Èˆ	ÐÛÛ\ÜÙY‰ÊKˆ	Ý˜[YHOH˜[YIË	Ø›XÚÉË™[›[™ÝÈ	Û˜[YS\Ý
™[
_H™[ˆKÚ\™HÈ[[ˆ	ÔKÚ\™_Xˆ	Ú[	ÊNÂˆ‹œÝ[K˜[œÙ›Ü›HH	Û›Û™IÎÂŸB™[˜Ý[ÛˆÝ\ÜÝ[Ü[J
HÂˆYˆ
S‘ÔÓÕË›Ûˆ	‰ˆPÑ‘Ë˜Ø[XŠHÈÛÛœÝ›ÝÈH\™›Ü›X[˜ÙK››ÝÊ
NÂˆYˆ
Q–œÛÝÑ[™–œÛÝÑ[™ÈOOHÊH–œÛÝÑ[™HÈˆ›ÝËÎˆÈNÂˆÛÛœÝÛHH–›ÛY[ŽÈYˆ
ÛH	‰ˆÛK™š\™Y	‰ˆ[ÛKœÛÝÊHÈÛÛœÝHHX]›Z[ŠK
›ÝÈHÛKœŠHÈLÌ
NÈÛKœÛÝÈHÈˆ›ÝËŒˆ‹Œ
ˆ
HHX]œÝÊHHK‹ŒŠJHNÈHBˆËœ\ÙHH	ÜÜÝ[Ü[IÎÈË™[™ÚÝÛ]H\™›Ü›X[˜ÙK››ÝÊ
NÈË™[™P]HË™[™ÚÝÛ]
È
S‘ÔÓÕË›Ûˆ	‰ˆPÑ‘Ë˜Ø[XˆÈ
S‘ÔÓÕË”WÐUH
Ë™[™ÚÝÛ]H–œÛÝÑ[™
HÈL
H
ˆLˆÌŒ
NÈKšXYHÛÜ›	ÜYŠË›Š_H[™YÈK™ÛÙ\ÓÛˆH˜[ÙNÈ\]SX\Ý

NÈËÈXÚYY[™XYNˆ\È\È[ˆ[™ˆYˆ
Ñ‘Ë˜Ø[XŠHÈ[™ÛÜ›
	Ø›XÚÉË×JNÈ™]\›ŽÈBˆÕQÑK™[™™YÚ[œÊ
NÂˆ[œKšY[ˆH˜[ÙNÂˆYˆ
X™YÚ[•˜XÙJ˜[ÙJJHÈK˜XÝ]™HH˜[ÙNÈš[š\Ú™\™XÝ
ÈÚÎˆ˜[ÙK™X\ÛÛŽˆ	Û›È™XÛÜ™œ›ÛH™Y›Ü™HH[™	ÈJNÈBŸB™[˜Ý[Ûˆ™YÚ[•˜XÙJ™ÊHÂˆ]™XÈHË™X]™XÎÈËÈHœ™XXÚÙ\]ÈÝÛˆÛÜHÙˆH™XÛÜ™ˆYˆ
\™XÊHÈËÈÝ\Ú\ÙHÚÛÜÙHHÛ˜\ÚÝœ›ÛH™Y›Ü™HHX]ˆÛÛœÝÛ˜\ÈHÝ]KœÛ˜\™š[\ŠÈOˆËœÝ\H	‰ˆËœÝ\HË›]ÐÚ[™ÙTÝ\	‰ˆËœÝ\Ë™X]Ý\
KœÛÜ

KŠHOˆKœÝ\H‹œÝ\
NÂˆÛÛœÝÛ˜\HÛ˜\Ë™š[\ŠÈOˆË™X]Ý\HËœÝ\HÔÈ
ˆ‹JKœÜ

HÛ˜\ÖÌNÂˆYˆ
\Û˜\
H™]\›ˆ˜[ÙNÂˆ[ØÔ™\^J
NÈ™XÈHÛ˜\ÂˆYˆ
™ÊHÈ˜]Ê“ÑË˜ÛÜKÝ]K‘‹ßKÈTÎˆÛ˜\”ËVˆÛ˜\–JNÈ™XÈHÈÎˆÝ]K”ËˆÝ]K”Ý\ˆÛ˜\œÝ\NÈHËÈ]ÈÝÛˆÛÜBˆH[ÙH[ØÔ™\^J
NÂˆØš™XÝ˜\ÜÚYÛŠKÈXÝ]™NˆYK™ËÛ˜\ˆ™XË\ÙNˆ	ÙXYÉË›ÝÜÎˆ×KØ[™Îˆ×KYˆLK˜[[ˆ™Nˆ[Üš^›ÛŽˆX]›X^
ÔÈ
ˆËX]œ›Ý[™

Ë™X]Ý\H™XËœÝ\
H
ˆKJJK›ÙÎˆ[ˆ\™›Ü›X[˜ÙK››ÝÊ
Kˆ˜\ÙNˆË™X]›ÙË[\Îˆ
Ë™X][\ÈË˜XÝ]™JKœÛXÙJ
K˜]NˆË™X]˜]HË›˜]KYX\Ý\™\ÎˆË™X]YX\Ý\™\Ë™]ÔÝ\ˆË™X]™]ÔÝ\OH[ÈË™X]™]ÔÝ\ˆË›™]ÔÝ\ˆ›ÚY˜\ÙNˆË™X]›ÚY˜\ÙHOH[ÈË™X]›ÚY˜\ÙHˆ
Ë›ÚY˜\ÙH
KX]Ý\ˆË™X]Ý\ÜšYÚ[ŽˆË›ÜšYÚ[‹ÛŽˆË›ˆJNÂˆYˆ
X™ÊH™[™\”J
NÂˆËÈ˜[šÈH[\ÈžHÝÈ]XÚXXÚ\ÈÚ[™È\›Ý[™HÜšYÚ[‹]HÛ˜\ÚÝˆžHÂˆÛÛœÝˆHKœ[\Ë›[™ÝÂˆÛÛœÝHZÔ›ÙÜ˜[JXYÔÛÝ\˜ÙJKœ[\ÊKYJNÂˆÛÛœÝH^
‹KÛ”‘ÐNÛ”‘ÐKÛ•S”ÒQÓ‘QÐ–UKÛ“‘PT‘TÕ
KˆH˜›ÊÝJNÂˆÛÛœÝHHK›˜]NÂˆ˜]Ê‹ÈT™\ÎˆÜÝ]K™ÝËÝ]K™ÚKUˆK™X]Ý\ÈÔËSÜšYÚ[ŽˆÈLŽˆK›ÜšYÚ[ˆKS˜]ˆKS˜]P\œŽˆÈˆš]\œŠKP\œ‹›\œŠHHKÈTÎˆ™XË”ËVˆ™XË–SŽˆÝ]K››Ú\ÙHJNÂˆÛÛœÝYˆH™]ÈZ[\œ˜^Jˆ
ˆ
NÈÛœ™XY^[Ê‹KÛ”‘ÐKÛ•S”ÒQÓ‘QÐ–UKYŠNÂˆÛ™[]Qœ˜[YXY™™\ŠŠNÈÛ™[]U^\™J
NÈ›Ü›ÙÜ˜[J
NÂˆËÈÚ\™HÙˆXXÚÚ[›™[	ÜÈÝ[XÝ]š]BˆÛÛœÝÚHÌK—K›X\
ÈOˆÈ]ÈHÈ›Üˆ
]HHÈHŽÈJÊÊHÈ
ÏHX]œÝÊ‹Y–ÚH
ˆ
È×HÈMH
ˆ
NÈ™]\›ˆÈNÈJNÂˆÛÛœÝØÛÜ™HHKœ[\Ë›X\

JHOˆ
ÈK˜][ˆY–ÚH
ˆ
È×HˆÎˆX]›X^
‹‹–ÌK—K›X\
ÈOˆX]œÝÊ‹Y–ÚH
ˆ
È×HÈMH
ˆ
HÈÚØ×JJHJJNÂˆØÛÜ™KœÛÜ

KŠHOˆ
‹™˜][HK™˜][
H
‹œÈHKœÊJNÂˆK˜Ø[™ÈHØÛÜ™KœÛXÙJX]›Z[ŠŠJK™š[\ŠOˆ™˜][œÈˆŒŠNÂˆYˆ
TK˜Ø[™Ë›[™Ý
HK˜Ø[™ÈHØÛÜ™KœÛXÙJX]›Z[Š‹ŠJNÂˆHØ]Ú
JHÈÛÛœÛÛKØ\›Š	ÙXYÛ›ÜÝXÈ˜Z[Y	ËJNÈK˜Ø[™ÈHKœ[\Ë›X\

JHOˆ
ÈKÎˆJJKœÛXÙJN
NÈBˆKœ\ÙHH	Ø˜\Ù[[™IÎÈÝ\™\^JLJNÈ™]\›ˆYNÂŸB˜ÛÛœÝWÕÐUÒH[J	Ü]Ø]Ú	ËL
NÈËÈÙXÛÛ™ÈHÜÝ[[Ü[HX^HZÙH™Y›Ü™H]\ÈX˜[™Û™Y™[˜Ý[ÛˆÝ\™\^J^ÛYJHÂˆK™^ÛYHH^ÛYNÈKœÝ\HKœÛ˜\œÝ\ÈKœ˜[ˆHÈKœ™\Ý[H[Âˆ˜]Ê“ÑË˜ÛÜKÝ]K”‘–ÌKßKÈTÎˆKœÛ˜\”ËVˆKœÛ˜\–JNÈÝ]Kœ˜Ý\ˆHÂˆYˆ
Kœ›ÙÈ	‰ˆKœ›ÙÈOOHËœ›ÙÈ	‰ˆKœ›ÙÈOOHK˜˜\ÙJH›Ü›ÙÜ˜[JKœ›ÙÊNÂˆÛÛœÝ™HHKœ™NÈKœ™HH[ÂˆKœ›ÙÈH^ÛYHÈK˜˜\ÙHˆ™H	‰ˆ™K™^OOH^ÛYHÈ™KšˆZÔ›ÙÜ˜[JÚ[TÛÝ\˜ÙJKœ[\ËK›YX\Ý\™\Ë^ÛYJK˜[ÙJNÂˆYˆ
™H	‰ˆ™KšOOHKœ›ÙÊH›Ü›ÙÜ˜[J™Kš
NÂˆÈÛÛœÝžHK˜Ø[™È	‰ˆK˜Ø[™ÖÔKšY
ÈWNÈYˆ
ž
HKœ™HHÈ^ˆžšKˆZÔ›ÙÜ˜[JÚ[TÛÝ\˜ÙJKœ[\ËK›YX\Ý\™\ËžšJK˜[ÙJHNÈHËÈH™^™\^IÜÈ]ËÛÛ\[YÚ[H\ÈÛ™H[œÂˆKœ›ÝÒYHKœ›ÝÜËœ\Ú
ÈX™[ˆ^ÛYHÈ	Ô™\^HÚ]]™\žH[IÈˆÚ]Ý]	ÔKœ[\ÖÙ^ÛYWK™Y‹›˜[Y_H
	Ù˜]ÕYÊKœ[\ÖÙ^ÛYWJ_JX™\Îˆ	ø )‰ËÛÎˆ	Û]™IÈJHHNÂˆYˆ
TK˜™ÊH™[™\”J
NÂŸB™[˜Ý[ÛˆÝ\ÜÝ[Ü[J\ŠHÂˆYˆ
TK˜XÝ]™JH™]\›ŽÂˆYˆ
Kœ\ÙHOOH	Ý™\™XÝ	ÊH™]\›ŽÂˆÛÛœÝÛÛØÚÈH\ˆOH[ÈËÈ
Ý]ÙˆÚYÚÛˆHÛÜ›	ÜÈÝÛˆÝ\ÎˆÛÜ››ØÚÊBˆYˆ
ÛÛØÚÈÈ
Kœ˜[[H
Kœ˜[[
H
È\ŠHˆWÕÐUÒ
ˆÔÈˆ\™›Ü›X[˜ÙK››ÝÊ
HH
K\™›Ü›X[˜ÙK››ÝÊ
JHˆWÕÐUÒ
ˆL
HÈËÈH™\^H]™]™\ˆš[š\Ú\È]\Ý›ÝÛHÛÜ››Üˆ]™\‚ˆYˆ
Kœ›ÙÈ	‰ˆKœ›ÙÈOOHËœ›ÙÈ	‰ˆKœ›ÙÈOOHK˜˜\ÙJH›Ü›ÙÜ˜[JKœ›ÙÊNÈKœ›ÙÈH[ÈYˆ
Kœ™JHÈ›Ü›ÙÜ˜[JKœ™Kš
NÈKœ™HH[ÈBˆYˆ
K˜™ÊHÈX›Ü˜XÙJ	ÝH™\^HÛÚÈÛÈÛ™ÉÊNÈ™]\›ŽÈBˆKœ\ÙHH	Ý™\™XÝ	ÎÈš[š\Ú™\™XÝ
ÈÚÎˆ˜[ÙK™X\ÛÛŽˆ	ÝH™\^HÛÚÈÛÈÛ™ÉÈJNÈ™]\›ŽÂˆBˆYˆ
\›ÙÜ˜[T™XYJKœ›ÙÊJH™]\›ŽÂˆYˆ
Yš[š\Ú›ÙÜ˜[JKœ›ÙÊJHÈKœ›ÝÜÖÔKœ›ÝÒYKœ™\ÈH	ÙY›ÝÛÛ\[IÎÈKœ›ÝÜÖÔKœ›ÝÒYK˜ÛÈH	ÉÎÈ™^™\^J[
NÈ™]\›ŽÈBˆ\ˆHÛÛØÚÈÈ\ˆˆK˜™ÈÈ
Ñ‘Ë™™ˆˆÈLˆŠHˆX]›X^
‹X]›Z[ŠQT”ÖÝY\—Kœ™\^H
ˆËX]˜ÙZ[
KšÜš^›ÛˆÈML
JJNÈËÈÝ]ÙˆÚYÚ]ZÙ\È]È[YBˆ›Üˆ
]HHÈH\ˆ	‰ˆKœ˜[ˆKšÜš^›ÛŽÈJÊÊHÈÚ[TÝ\
Kœ›ÙË™\^PY‹KœÝ\K›™]ÔÝ\K›˜]JNÈKœÝ\
ÊÎÈKœ˜[ŠÊÎÈBˆYˆ
Kœ˜[ˆ	HÌ\ˆKœ˜[ˆHKšÜš^›ÛŠHÂˆÛÛœÝÝHYX\Ý\™J™\^PYŠNÂˆYˆ
K›ÚY˜\ÙHˆÈÝ›ÚYˆK›ÚY˜\ÙH
ÈŒLˆˆÝ˜[žU›ÚY
HÈ™^™\^JYJNÈ™]\›ŽÈBˆYˆ
Kœ˜[ˆHKšÜš^›ÛŠHÈ™^™\^J˜[ÙJNÈ™]\›ŽÈBˆBŸB™[˜Ý[Ûˆ™^™\^JYY
HÂˆÛÛœÝ›ÝÈHKœ›ÝÜÖÔKœ›ÝÒYNÂˆYˆ
YYOH[
HÈ›ÝËœ™\ÈHYYÈY\ÈY\ˆ	Ê
Kœ˜[ŠHÈÔÊKÑš^Y
J_HØˆ	ÜÝ\š]™\ÉÎÈ›ÝË˜ÛÈHYYÈ	ÙY\ÉÈˆ	ÜØ]™\ÉÎÈBˆYˆ
Kœ\ÙHOOH	Ø˜\Ù[[™IÊHÂˆK˜˜\Ù[[™QYYHHYYYÂˆYˆ
YYY
HÈKœ›ÝÜËœ\Ú
ÈX™[ˆ	ÕH›ÚYÛÝ[›Ý™H™\›ÙXÙYœ›ÛHH™XÛÜ™	Ë™\Îˆ	ÉËÛÎˆ	ÉÈJNÈBˆKœ\ÙHH	ÛÛÉÎÂˆH[ÙHYˆ
YYOOH˜[ÙJHÈK˜Ø[™ÖÔKšYK›™XÙ\ÜØ\žHHYNÈBˆKšY
ÊÎÂˆYˆ
KšYK˜Ø[™Ë›[™Ý
HÈÝ\™\^JK˜Ø[™ÖÔKšYKšJNÈ™]\›ŽÈBˆKœ\ÙHH	Ý™\™XÝ	ÎÂˆYˆ
Kœ›ÙÈ	‰ˆKœ›ÙÈOOHËœ›ÙÈ	‰ˆKœ›ÙÈOOHK˜˜\ÙJH›Ü›ÙÜ˜[JKœ›ÙÊNÈKœ›ÙÈH[ÈYˆ
Kœ™JHÈ›Ü›ÙÜ˜[JKœ™Kš
NÈKœ™HH[ÈBˆš[š\Ú™\™XÝ
ÈÚÎˆYHJNÂŸB™[˜Ý[Ûˆ™[™\”J™\™XÝ[
HÂˆÛÛœÝ›ÝÜÈH
Kœ›ÝÜÈ×JK›X\
ˆOˆ]ˆÛ\ÜÏHœ›ÝÈ	Ü‹˜ÛßHÜ[‰Ù\ØÊ‹›X™[
_OÜÜ[Ü[‰Ù\ØÊ‹œ™\Ê_OÜÜ[Ù]˜
Kš›Ú[Š	ÉÊNÂˆÛÛœÝÈHË›ÜšYÚ[ˆK›ÜšYÚ[ˆÌNÂˆÛÛœÝH

ÖÌH
ÈHHÝ]K™ÝÈÈŠHÈ
Ý]K™ÚÈŠJKÑš^Y
ŠKHH

ÖÌWH
ÈHHÝ]K™ÚÈŠHÈ
Ý]K™ÚÈŠJKÑš^Y
ŠNÂˆ[œKš[›™\’SH‰ÔKšXYÛÜ›	ÜYŠË›Š_H0­È˜S˜OÚ‚ˆ]ˆÛ\ÜÏHœÝXˆ‰Ù˜]ÜÕ^
J_H0­È	Û[\ÜÊË™X]Ú[U

J_HÙˆÛÜ›[YH0­È	ÔK™ÛÙ\ÓÛˆÈ	ÝH›ÚYœ›ÚÙHÝ]	Èˆ	Ùš\œÝ›Û‹Yš[š]H˜[YIßH™X\ˆ
	ÜK	Ü_JIÔK™ÛÙ\ÓÛˆÈ	È[™Ø\È[	Èˆ	ÉßOÙ]‚ˆ	ÔK™ÛÙ\ÓÛˆÈ	ÉÈˆK˜XÝ]™H™\™XÝ[ÈÛ\ÜÏHœH”ÜÝ[[Ü[Nˆ™\^Z[™ÈH\Ý	ÊKšÜš^›ÛˆÈKšÜš^›ÛˆÈÔÈˆ
KÑš^Y
J_HÙXÛÛ™Èœ›ÛHH™XÛÜ™Ú]H[\È[ÜÝXÝ]™H]HÜšYÚ[ˆ™[[Ý™YÛ™H]H[YKÜ˜ˆ	ÉßBˆ	ÔK™ÛÙ\ÓÛˆÈ	ÉÈˆ]ˆÛ\ÜÏHœ›ÝÜÈ‰Ü›ÝÜßOÙ]˜IÝ™\™XÝ[	ÉßXÂˆYˆ
K˜XÝ]™H	‰ˆTK˜™È	‰ˆKœ\ÙHOOH	Ý™\™XÝ	È	‰ˆKœ›ÝÒYOH[	‰ˆ\™›Ü›X[˜ÙK››ÝÊ
Hˆ
Ë™[™P]
JHÂˆÛÛœÝˆHKœ›ÝÜÖÔKœ›ÝÒYNÂˆ[˜Ù‹šY[ˆH˜[ÙNÈ[˜Ù‹^ÛÛ[HˆÈ	ÐÛÝ[\™˜XÝX[0­È	È
È‹›X™[ˆ	ÐÛÝ[\™˜XÝX[	ÎÂˆH[ÙH[˜Ù‹šY[ˆHYNÂŸB™[˜Ý[Ûˆš[š\Ú™\™XÝ
[™›ÊHÂˆYˆ
K˜™ÊHÈš[š\Ú˜XÙJ[™›ÊNÈ™]\›ŽÈBˆK˜XÝ]™HH˜[ÙNÈ[˜Ù‹šY[ˆHYNÂˆÛÛœÝˆHÛÛ\ÜÙU™\™XÝ
[™›Ë	ÜØ]™YHÛÜ›	ÊNÂˆ‹š[H
Ë™[™Ý]\È	‰ˆË™[™Ý]\Ë›[™ÝÈ‘]™\žHÝ]H\È˜[[ˆÈ˜SŽˆ	Ù\ØÊ˜[YS\Ý
Ë™[™Ý]\ÊJ_KˆHÛÜ›\È[™YÜ˜ˆ	ÉÊH
È‹š[ÂˆYˆ
[™›Ë›ÚÊHÂˆÛÛœÝˆH™XÙZ\
	Ø›XÚÉËÛÜ›	ÜYŠË›Š_H0­È	ØÛØÚÔÝŠ
_X	Ó›Ý˜]Û‰Ë	Ó˜S‰Ë‹š[\XØ]Y›[™ÝÈ	ÐÛÛ\ÜÙYÙˆ	È
È‹š[\XØ]Y›X\
Oˆ	Ý™Y‹›˜[Y_H
	ÜYŠ››Ê_JX
Kš›Ú[Š	È
È	ÊH
È	Ë‰Èˆ	ÐÛÛ\ÜÙY‰Ëˆ	Ý˜[YHOH˜[YIË	Ø›XÚÉË	Ù[™Y	ÊNÂˆ‹œÝ[K˜[œÙ›Ü›HH	Û›Û™IÎÂˆBˆ[™ÛÜ›
	Ø›XÚÉË‹š[\XØ]Y›X\
Oˆ™Y‹›˜[YJK‹š[
NÂŸB™[˜Ý[Ûˆš[š\Ú˜XÙJ[™›ÊHÂˆÛÛœÝZ[™HHÈ	‰ˆË›ˆOOHKÛŽÂˆÛÛœÝ˜\ÙHHK˜˜\ÙNÈÓœ›ÙÈH[ÈYˆ
˜\ÙH	‰ˆ˜\ÙHOOHËœ›ÙÊH›Ü›ÙÜ˜[J˜\ÙJNÂˆK˜˜\ÙHH[ÈK˜XÝ]™HH˜[ÙNÈK˜™ÈH˜[ÙNÂˆYˆ
[Z[™JH™]\›ŽÈËÈHÛÜ›]™[Û™ÙYÈ\ÈÛÛ™BˆÛÛœÝ™[HK™™[×KˆHÛÛ\ÜÙU™\™XÝ
[™›Ë™[›[™ÝÈÙ\	Û˜[YS\Ý
™[
_HÝ[™[™Øˆ	ÚÙ\H›ÚYÝ]	ÊNÂˆØØ\”™XÙZ\
‹š[\XØ]Y
NÂˆ
ËœØØ\œÈHËœØØ\œÈ×JKœ\Ú
‹‹‹š[\XØ]Y›X\
Oˆ™Y‹›˜[YJJNÈËÈHØØ\‹Ù\Ú]HÛÜ››ÝHÛÜ›	ÜÈ[™ˆÛÛœÝZ[ˆH‹š[œ™\XÙJÏ×—JÏ‹ÙË	È	ÊKœ™\XÙJ×ÊËÙË	È	ÊKš[J
NÂˆÛÛœÝÚ]H™[›[™ÝÈH›ÚY]ÛÚÈ	Û˜[YS\Ý
™[
_XˆKÚ\™HÈH›ÚY[ˆ	ÔKÚ\™_Xˆ	ÕH›ÚY]Ø\È[	ÎÂˆYˆ
PÑ‘Ë˜Ø[XŠHÈš[›ÝJ	ÝÚ]K˜XÙYZ[‹	ÜÞ\Ý[IÊNÈXÚÙ\Š	Ù\ØÊÚ]
_Nˆ˜XÙY	Ý\	ËYJNÈBˆYˆ
K™˜[[™[	‰ˆY[œKšY[ˆ	‰ˆËœ\ÙHOOH	Ø[]™IÊHÚÝÑ˜[[™[
Û\ÜÏHœZÈ•Ú]XYHH›ÚYÚ˜
È‹š[
NÂŸB™[˜Ý[ÛˆÛÛ\ÜÙU™\™XÝ
[™›ËØ]™Y
HÂˆÛÛœÝ™XÈH
K˜Ø[™È×JK™š[\ŠÈOˆË›™XÙ\ÜØ\žJK›X\
ÈOˆË
KœÛÜ

KŠHOˆK››ÈH‹››ÊNÂˆ][H	ÉË[\XØ]YH×NÂˆYˆ
Z[™›Ë›ÚÊHÂˆ[H[™›Ëœ™X\ÛÛˆOOH	ÝH™\^HÛÚÈÛÈÛ™ÉÈÈ•H™\^HÛÝ[›Ý™Hš[š\ÚY[ˆ[YKÛÈ\ÈÛÜ›\È›ÈÜÝ[[Ü[KÜ˜ˆ“›È™XÛÜ™œ›ÛH™Y›Ü™HH[™Ý\š]™\ËÛÈ›ÈÜÝ[[Ü[H\ÈÜÜÚX›KÜ˜ÂˆH[ÙHYˆ
TK˜˜\Ù[[™QYY
HÂˆ[\XØ]YH
K˜Ø[™È×JKœÛXÙJÊK›X\
ÈOˆË
NÂˆ[H”™\^YYœ›ÛHH™XÛÜ™]Y›Ý\›ˆÈ˜S‹ˆH[\È[ÜÝXÝ]™HÚ\™HH›ÚYœ›ÚÙHÝ]\™HX\šÙYÚ]Ý]H™\™XÝÜ˜ÂˆH[ÙHYˆ
™XË›[™Ý
HÂˆ[\XØ]YH™XÎÂˆÛÛœÝ\ÝH™XË›X\
Oˆ	Ý™Y‹›˜[Y_H
	Ù˜]ÕYÊ
_JX
NÂˆÛÛœÝ›Ú[™YH\Ý›[™ÝˆHÈ\ÝœÛXÙJLJKš›Ú[Š	Ë	ÊH
È	È[™	È
È\ÝÛ\Ý›[™ÝHWHˆ\ÝÌNÂˆ[H‰Û™XË›[™ÝˆHÈ™[[Ýš[™È[žHÛ™HÙˆ\ÙHÛÝ[]™H	ÜØ]™YNˆ	Ù\ØÊ›Ú[™Y
_K˜ˆ™[[Ýš[™È	Ù\ØÊ›Ú[™Y
_H[Û™HÛÝ[]™H	ÜØ]™YK˜OÜ‚ˆ‰Û™XË›[™ÝˆHÈ	ÑXXÚØ\È™XÙ\ÜØ\žKˆ›Û™HØ\ÈÝY™šXÚY[‰Èˆ	Ò]Ø\È™XÙ\ÜØ\žK[™]Ø\È›ÝÝY™šXÚY[ˆ]Y™Y[ˆ\›[\ÜÈ[Û™K‰ßHHÚ\ÛÛˆØ\È™]™\ˆ[ˆH\›‹ˆ]Ø\ÈÛÛ\ÜÙYÜ˜ÂˆH[ÙHÂˆ[\XØ]YH
K˜Ø[™È×JKœÛXÙJÊK›X\
ÈOˆË
NÂˆ[H“›ÈÚ[™ÛH™[[Ý˜[ÛÝ[]™H	ÜØ]™YKˆ]Ø\ÈÝ™\™]\›Z[™YˆÙ]™\˜[ÛÛXš[˜][ÛœÈÙ\™H[™XYH[›ÝYÚÜ•HÚ\ÛÛˆØ\È™]™\ˆ[ˆH\›‹ˆ]Ø\ÈÛÛ\ÜÙYÜ˜ÂˆBˆYˆ
[™›Ë›ÚÈ	‰ˆK˜˜\Ù[[™QYY
HX\›”Ú\ÛÛŠ™XË›[™ÝÈ™XÈˆ
K˜Ø[™È×JKœÛXÙJŠK›X\
ÈOˆË
K™XË›[™ÝÈHˆJNÈËÈHZ[™™[Y[X™\œÈÚ]Ø\È˜[YYˆ[
ÏHÛ\ÜÏHœH“›Ý[™ÈØ[ˆ™H™]\›™YÈH\›‹Ü˜Âˆ[\XØ]Y™›Ü‘XXÚ
Oˆ™[	‰ˆ™[˜Û\ÜÓ\Ý˜Y
	ÙÜ™^IÊJNÂˆËš[\XØ]YH™]ÈÙ]
Ë‹‹ŠËš[\XØ]Y×JK‹‹š[\XØ]Y›X\
Oˆ™Y‹šY
WJNÈËÈH[X›[\ÈÚÝÈ[H[ˆ›XÚÂˆ™]\›ˆÈ[[\XØ]Y™XÈNÂŸB™[˜Ý[Ûˆ™\Ý[YPY\Ø]\Ý›ÜJ[
HÂˆËœ\X[ÈH
Ëœ\X[È
H
ÈNÂˆË›ÜÝ›ÝÈH[]™S˜][ÛœÊ
K™š[\ŠˆOˆZ[š[˜ÛY\ÊŠJK›X\
ˆOˆ‹›˜[YJNÂˆ›Üˆ
ÛÛœÝˆÙˆ[]™S˜][ÛœÊ
JHYˆ
Z[š[˜ÛY\ÊŠJH˜[˜][ÛŠ‹	ÛÜÝ	ÊNÂˆYˆ
Ë™X]›ÙÈ	‰ˆË™X]›ÙÈOOHËœ›ÙÊH›Ü›ÙÜ˜[JË™X]›ÙÊNÈË™X]›ÙÈH[ÈË™X]˜]HH[ÂˆËœ\ÙHH	Ø[]™IÎÈË™X]Ý\HLNÈË›ÜšYÚ[ˆH[È[˜Ù‹šY[ˆHYNÂˆÙ]U›ÚY

NÂˆÛÛœÝ˜[Y\ÈH[›X\
ˆOˆ‹›˜[YJKš›Ú[Š	Ë	ÊKÜÝHË›ÜÝ›ÝÈ×NÂˆKšXYHÛÜ›	ÜYŠË›Š_HÛÙ\ÈÛ˜ÈK™ÛÙ\ÓÛˆHYNÈ[œKšY[ˆH˜[ÙNÂˆÛÛœÝYHH•H›ÚYœ›ÚÙHÝ][™Ü™XY[[]Y]	Ú[›[™ÝˆHÈ	Ø›Ü™\œÈ][	Èˆ	ØH›Ü™\ˆ][	ßKˆ	Ù\ØÊ˜[Y\Ê_H[	ÛÜÝ›[™ÝÈÈ	Ù\ØÊÜÝš›Ú[Š	Ë	ÊJ_H	ÛÜÝ›[™ÝˆHÈ	Ø\™IÈˆ	Ú\ÉßHÜÝˆ	ÉßKˆHXY›Û™HÝ^\È›ÚYÜÛ\ÜÏHœH•HÛÜ›ÛÙ\ÈÛ‹ØØ\œ™Y[™ÙY\È˜]Ú[™ËÜ˜ÂˆK›YHHYNÂˆ™[™\”JYH
È
K˜™È	‰ˆK˜XÝ]™HÈÛ\ÜÏHœH•Ú]XYHH›ÚY\È™Z[™È˜XÙYœ›ÛHH™XÛÜ™Ý]ÙˆÚYÚÚ[HHÛÜ›[œÈÛ‹Ü˜ˆ	ÉÊJNÂˆYˆ
PÑ‘Ë˜Ø[XŠHXÚÙ\ŠÛÜ›	ÜYŠË›Š_HÛÙ\ÈÛŽˆ	Ù\ØÊ˜[Y\Ê_H[H›ÚY]H›Ü™\˜	Ý\	ËYJNÂˆË›\Ý˜[]HÂˆÛX\•[Y[Ý]
™\Ý[YPY\Ø]\Ý›ÜK
NÈ™\Ý[YPY\Ø]\Ý›ÜKHÙ][Y[Ý]


HOˆÈYˆ
Ëœ\ÙHOOH	Ø[]™IÊH[œKšY[ˆHYNÈKÌ
NÂˆ›Üˆ
ÛÛœÝˆÙˆ[
H‹›™^˜]ÕHÚ[U

H
Èˆ
È‹šNÂˆ\]SX\Ý

NÂŸB‹ÊˆOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOBˆHÒSS‘ËˆHÛÜ›]Ú[œÈÚÛK]™\žHÝ]H[ˆ][]™K\ÈX\šÙY]ZY]Kˆœ›ÛHÚ\™H]È\Ý˜[Ø\Âˆ˜]Ûˆ
[™\ˆ[ˆXØÛÜ™œ›ÛH]ÈÝX\˜[ÜŠHHÛÝÈYÚÛÙ\ÈÝ]XÜ›ÜÜÈ][™Ú\™HHYÚ\È\ÜÙYBˆÛÜ›	ÜÈÙX[\ÈZÙHÛÛ\ÈHY[™Y›ÝÛ	ÜÈÎˆH›Ü™\œÈ™]ÙY[ˆ]ÈÝ]\Ë[™Hš[HÙˆ[žH›ÚY][‚ˆHYÙ\ÈÙˆ]ÈY™HØ]ÚHYÚ\È]ÛÙ\ÈžNÈHÛX[H[œÈÝ][Û™ÈHÛÛ™Z[™]ÈÛX[Û[ÈÛÛYBˆ[™ÛÈÛˆHÛÛXXÚÚ]H˜Z[\Ý™[ÈY\ˆHÚ[H]˜Y\Ëˆ]\È˜]Ûˆ[ˆHÛÜ›	ÜÈÝÛˆÚY\ˆ
ÙYBˆHÒSS‘È\™JKÛÈ]Y\È^XÝHÛˆH›Ü™\œËÛˆH[™HÜˆH˜[ÈHÛ[È\™HXÙY\™K]ˆ˜[™ÛHÛˆH›Ü™\œÈ\È^HYH
HÝÙ\ˆXYÜ˜[NˆÛˆH[™HÝ˜ZYÚ[™\ËÛˆH˜[Ú\˜Û\ÊKÜˆÚ\™HBˆYÚ\È\ÜÚ[™ËˆHœ›Þ™[ˆÚ[‰ÜÈÛÛ\È[K[™Ú[[ˆ™YXÙY[Ý[ÛŽˆHÛÛÚ[\HÛÛY\È\[™ÛÙ\Ë‚ˆOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOH
‹Â˜ÛÛœÝÒSHÈÎˆ[ˆÎˆÌKÛÛˆ˜[ÙKÛˆ×K™^ˆÐU‘NˆÓˆMQNˆKØ[NˆX]ÚYYXJ	Ê™Y™\œË\™YXÙY[[Ý[ÛŽˆ™YXÙJIÊK›X]Ú\ÈNÂ˜ÛÛœÝÒSÓÑ‘ˆHÈQÚ[ˆËLKKQÚ[ŽˆÌLKKQÚ[ÎˆÌKQÚ[ˆÌKQÛ[ˆÈˆ™]È›Ø]Ì\œ˜^JÌŠHHNÂ™[˜Ý[ÛˆÚ[™YÚ[ŠÛÛ
HÂˆYˆ
Ñ‘Ë˜Ø[XˆUÊH™]\›ŽÂˆÛÛœÝÈHË˜XØÛÜ™	‰ˆË˜XØÛÜ™™ÝX\‹žHHËœÙX[Y	‰ˆÈ	‰ˆË˜[]™HÈÈˆË›\Ý˜[žH	‰ˆË›\Ý˜[žK˜[]™HÈË›\Ý˜[žHˆ[]™S˜][ÛœÊ
VÌNÂˆØš™XÝ˜\ÜÚYÛŠÒSÈÎˆËˆ\™›Ü›X[˜ÙK››ÝÊ
KÎˆžHÈØžK˜Ø\ÌKžK˜Ø\ÌWWHˆÌKÛÛˆHXÛÛÛˆ×K™^ˆÛÛÈKˆŒMHJNÂŸB˜ÛÛœÝÜÝ\H
K‹
HOˆÈÛÛœÝHX]›X^
X]›Z[ŠK
HJHÈ
ˆHJJJNÈ™]\›ˆ
ˆ
ˆ
ÈHˆ
ˆ
NÈNÂ˜ÛÛœÝÜŒÈH
KŠHOˆØVÌWH
ˆ–Ì—HHVÌ—H
ˆ–ÌWKVÌ—H
ˆ–ÌHHVÌH
ˆ–Ì—KVÌH
ˆ–ÌWHHVÌWH
ˆ–ÌWKžŒÈHˆOˆÈÛÛœÝHX]š\Ý
–ÌK–ÌWK–Ì—JHNÈ™]\›ˆÝ–ÌHÈ–ÌWHÈ–Ì—HÈNÈNÂ˜ÛÛœÝ[œÜHHOˆÈÛÛœÝˆHX]œÜ\
X]›X^
ˆ
ˆ
H
ÈVÌ—JJJNÈ™]\›ˆˆYKMˆÈÌKHˆÜVÌHÈ‹VÌWHÈ—NÈNÈËÈH˜[˜XÚÈÈH›]ÛÜ›
Ü‹[™Û™JB˜ÛÛœÝÚ[\ÝH
JHOˆÈÛÛœÝˆHX]š\Ý
ÌHHVÌKÌWHHVÌWJKÈHÓÐ‘WÒÈÈYˆ
ÈH
H™]\›ˆŽÈÛÛœÝHHÜŠ
KˆHÜŠJNÈ™]\›ˆˆ
È
H
ˆX]š\Ý
VÌHH–ÌKVÌWHH–ÌWKVÌ—HH–Ì—JHHŠH
ˆÎÈNÈËÈ\ÈHÚY\‰ÜÈÙ[Ñ\Ý™[˜Ý[ÛˆÚ[ÛÊKŠHÈËÈ\™HH[™ˆHÛÈ™X\™\ÝØ\][È\™Nˆ\ÈÛˆH›Ü™\ˆ™]ÙY[ˆ[OÂˆÛÛœÝÜHX]›X^
˜]Y]šXÊK˜Ø\
HHÛÝÊJK˜]Y]šXÊ‹˜Ø\
HHÛÝÊŠJH
ÈYKNNÂˆ™]\›ˆ[]™S˜][ÛœÊ
K™]™\žJˆOˆˆOOHHˆOOHˆ˜]Y]šXÊ‹˜Ø\
HHÛÝÊŠHˆÜ
NÂŸB™[˜Ý[ÛˆÚ[›Ü™\”Ú[
KŠHÈËÈHÚ[]˜[™ÛHÛˆH›Ü™\ˆ™]ÙY[ˆH[™‚ˆ]ÂˆYˆ

ÓÐ‘WÒÈ
HŒŠHÈÛÛœÝØHHK˜Ø\ØˆH‹˜Ø\žHØ–ÌHHØVÌKžHHØ–ÌWHHØVÌWKˆHž
ˆž
ÈžH
ˆžNÈYˆ
ˆYKN
H™]\›ˆ[ÂˆÛÛœÝšÈHØ–ÌH
ˆØ–ÌH
ÈØ–ÌWH
ˆØ–ÌWHHØVÌH
ˆØVÌHHØVÌWH
ˆØVÌWHHÛÝÊŠH
ÈÛÝÊJKH
šÈHˆ
ˆ
ØVÌH
ˆž
ÈØVÌWH
ˆžJJHÈ
ˆ
ˆŠKHX]œÜ\
ŠKÝˆH
X]œ˜[™ÛJ
H
ˆˆHJH
ˆKŽÂˆHØØVÌH
Èž
ˆHžHÈ
ˆÝ‹ØVÌWH
ÈžH
ˆ
ÈžÈ
ˆÝ—NÈBˆ[ÙHYˆ
ÓÐ‘WÒÈˆŽN
HÈÛÛœÝHHÜŠK˜Ø\
KˆHÜŠ‹˜Ø\
KHHÐ–ÌHHVÌK–ÌWHHVÌWK–Ì—HHVÌ—WKHHX]š\Ý
VÌKVÌWKVÌ—JNÈYˆ
HYKMŠH™]\›ˆ[ÂˆÛÛœÝÈHˆ
ˆ
ÛÝÊJHHÛÝÊŠJHÈNÈYˆ
X]˜XœÊÊHHŽNNJH™]\›ˆ[ÈËÈ
HHKJKÌˆHØHH
HHKŠKÌˆHØŽˆH[™HKŠˆHJHHŠØHHØŠBˆÛÛœÝHÛVÌHÈKVÌWHÈKVÌ—HÈWKLHHžŒÊÜŒÊX]˜XœÊÌ—JHŽHÈÌWHˆÌKJJKLˆHÜŒÊLJKˆHX]œÜ\
HHÈ
ˆÊKHX]œ˜[™ÛJ
H
ˆX]”H
ˆŽÂˆH[œÜ
ÌK—K›X\
HOˆÚWH
ˆÈ
Èˆ
ˆ
X]˜ÛÜÊ
H
ˆLVÚWH
ÈX]œÚ[Š
H
ˆL–ÚWJJJNÈBˆ[ÙH™]\›ˆ[ÈËÈHšY]È\È\›š[™Îˆ›ÈÛ[È[[]\Âˆ™]\›ˆÚ[ÛÊKŠHÈˆ[ÂŸB™[˜Ý[ÛˆÚ[œ›ÛÚ[
ŠHÈËÈHÚ[HYÚ\È\ÜÚ[™ÈÝ™\‚ˆÛÛœÝHX]œ˜[™ÛJ
H
ˆX]”H
ˆŽÂˆYˆ

ÓÐ‘WÒÈ
HŒŠH™]\›ˆÑÒS›ÖÌH
Èˆ
ˆX]˜ÛÜÊ
KÒS›ÖÌWH
Èˆ
ˆX]œÚ[Š
WNÂˆYˆ
ÓÐ‘WÒÈHŽN
H™]\›ˆ[ÂˆÛÛœÝÈHÜŠÒS›ÊKLHHžŒÊÜŒÊËX]˜XœÊÖÌ—JHŽHÈÌWHˆÌKJJKLˆHÜŒÊËLJK[Hˆ
ˆX]˜\Ú[ŠX]›Z[ŠKŠJKØHHX]˜ÛÜÊ[
KØHHX]œÚ[Š[
NÂˆ™]\›ˆ[œÜ
ÌK—K›X\
HOˆÖÚWH
ˆØH
ÈØH
ˆ
X]˜ÛÜÊ
H
ˆLVÚWH
ÈX]œÚ[Š
H
ˆL–ÚWJJJNÂŸB™[˜Ý[ÛˆÚ[ÙY[Š
HÈÛÛœÝHHÛÜ›ÔØÜ™Y[Š
NÈ™]\›ˆH	‰ˆVÌHˆ	‰ˆVÌH[›™\•ÚYH	‰ˆVÌWHˆ	‰ˆVÌWH[›™\’ZYÚH	‰ˆ
PÑ‘Ë™ÛØ™HVÌ—HˆŒŠNÈB™[˜Ý[ÛˆÚ[J
HÈËÈHÚY\‰ÜÈÚ[[™Ëœ˜[YHžHœ˜[YNˆÝÈ˜\ˆHYÚ\ÈÛÛYKHÛX[KHÛ[ÂˆÛÛœÝHHÒSÈ	‰ˆÒSÈOOHÈÈ
\™›Ü›X[˜ÙK››ÝÊ
HHÒS
HÈLˆLK[™HÒS’Ó
ÈÒS‘QNÂˆYˆ
Hˆ[™
HÒSÈH[ÂˆYˆ
HHˆ[™ØÝ[Y[˜›ÙK˜Û\ÜÓ\Ý˜ÛÛZ[œÊ	Ü™\Ü[™ÉÊJH™]\›ˆÒSÓÑ‘ŽÂˆÛÛœÝØ[HHÒS˜Ø[K›X^HÑ‘Ë™ÛØ™HÈKŒˆKŽHÈX]›X^
‹Ø[UJ
VÌ—JNÂˆÛÛœÝHHØ[HÈHˆX]›Z[ŠKHÈÒS•ÐU‘JKˆHÜÝ\
KJH
ˆ›X^ÈËÈÛÝÈœ›ÛH]ÈÛÝ\˜ÙK]ZXÚÙ\‹[ˆÙ][™ÂˆÛÛœÝÛX[HHØ[HH‹ÈLHˆ
HH‹
HÈ‹H
ˆ›X^
ˆKŒÂˆÛÛœÝ˜YHH
Ø[HÈÜÝ\
‹KJHˆJH
ˆ
HHÜÝ\
ÒS’Ó[™JJKœ›ÛHØ[HÈˆHHÜÝ\
ÍKKJNÂˆÛÛœÝ\œÝHQÒS˜ÛÛ	‰ˆHËŽÈËÈHš\œÝÙXÛÛ™ÈÙˆHÚ[ŽˆH\œÝÙˆÛ[Ë›Ý[™]™\žHØ\][ˆYˆ
XØ[H	‰ˆHˆÒS›™^	‰ˆHÒS’ÓHH	‰ˆÒS™Û›[™Ý
\œÝÈˆ
JHÂˆÛÛœÝ[H[]™S˜][ÛœÊ
NÈ]H[ÂˆYˆ
\œÝ	‰ˆ[›[™Ý	‰ˆX]œ˜[™ÛJ
HŠH›Üˆ
]ÈHÈÈL	‰ˆ\ÈÊÊÊHÈÛÛœÝˆH[ÓX]œ˜[™ÛJ
H
ˆ[›[™ÝKˆHŒˆ
ÈŒÈ
ˆX]œÜ\
X]œ˜[™ÛJ
JKHX]œ˜[™ÛJ
H
ˆX]”H
ˆ‹HHÛ‹˜Ø\ÌH
Èˆ
ˆX]˜ÛÜÊ
K‹˜Ø\ÌWH
Èˆ
ˆX]œÚ[Š
WNÈYˆ
Ú[ÙY[ŠJJHHNÈBˆYˆ
[›[™ÝˆH	‰ˆX]œ˜[™ÛJ
HÎ
H›Üˆ
]ÈHÈÈMˆ	‰ˆ\ÈÊÊÊHÈÛÛœÝH[ÓX]œ˜[™ÛJ
H
ˆ[›[™ÝKHH[ÓX]œ˜[™ÛJ
H
ˆ[›[™ÝNÈYˆ
OOHJHÛÛ[YNÂˆÛÛœÝHHÚ[›Ü™\”Ú[
JNÈYˆ
H	‰ˆÚ[\Ý
KÒS›ÊHˆHŒˆ	‰ˆÚ[ÙY[ŠJJHHNÈBˆYˆ
\	‰ˆHŽMÊH›Üˆ
]ÈHÈÈ	‰ˆ\ÈÊÊÊHÈÛÛœÝHHÚ[œ›ÛÚ[
ŠNÈYˆ
H	‰ˆÚ[ÙY[ŠJJHHNÈBˆYˆ
\	‰ˆ[›[™ÝŠH›Üˆ
]ÈHÈÈ	‰ˆ\ÈÊÊÊHÈÛÛœÝHHÚ[œ›ÛÚ[
ˆ
ˆX]œÜ\
X]œ˜[™ÛJ
JJNÈYˆ
H	‰ˆÚ[ÙY[ŠJJHHNÈHËÈÛ™HÝ]Nˆ[ž]Ú\™HHÛÛ\ÈÛÛYBˆYˆ

HÈÒS™Ûœ\Ú
ÈˆKY™Nˆ
\œÝÈŽˆKŒŠH
ÈX]œ˜[™ÛJ
H
ˆŽKÞŽˆ
\œÝÈHˆ
H
ÈX]œ˜[™ÛJ
H
ˆ
\œÝÈHˆŠHJNÈYˆ
QÒS˜ÛÛ
HÕQÑK™Û[
\œÝ
NÈBˆÒS›™^HH
È
\œÝÈŒH
ÈX]œ˜[™ÛJ
H
ˆŒˆˆ
ÈX]œ˜[™ÛJ
H
ˆÍJNÈBˆÒS™ÛHÒS™Û™š[\ŠÈOˆHHËË›Y™JNÂˆÛÛœÝˆH™]È›Ø]Ì\œ˜^JÌŠKÈH[›™\•ÚYÈX]›X^
KØ[˜\ËÚY
NÂˆÒS™Û™›Ü‘XXÚ

ËJHOˆÈÛÛœÝHHÛÜ›ÔØÜ™Y[ŠËœ
NÈYˆ
\H
Ñ‘Ë™ÛØ™H	‰ˆVÌ—HH
JH™]\›ŽÂˆÛÛœÝH
HHË
HÈË›Y™K[ˆHX]›Z[ŠKÈŒM
H
ˆX]œÝÊHHKÊK˜XÙHHÑ‘Ë™ÛØ™HÈÜÝ\
ŒKŒËVÌ—JHˆNÂˆ‹œÙ]
ÜVÌHÈË
[›™\’ZYÚHVÌWJHÈË[ˆ
ˆ˜XÙH
ˆ˜YKËœÞˆÈ×KH
ˆ
NÈJNÂˆÛÛœÝ›\ÚH
Ø[HÈH
ˆÜÝ\
KJH
ˆ
HHÜÝ\
‹JJHˆHŒHÈHÈŒHˆX]™^
JHHŒJHÈKŠJH
ˆ
ÒS˜ÛÛÈHˆJNÈËÈHœ™X]ÙˆÛÛ\È]\ÈÛÛ‚ˆÛÛœÝ\ÝHØ[HÈˆÜÝ\
ŒËKKJH
ˆ
HHÜÝ\
‹KLKJJH
ˆ
ÒS˜ÛÛÈHˆJNÈËÈÛÛ\ÝÙ][™Ë[ˆÛÛ™Bˆ™]\›ˆÈQÚ[ˆØK
ÒS˜ÛÛÈÈˆJH
ˆ˜YKÒS›ÖÌKÒS›ÖÌWWKQÚ[ŽˆÔ‹ÛX[KÒS˜ÛÛÈHˆœ›ÛKQÚ[ÎˆØØ[HÈˆK›X^Ë›˜][ÛœË›[™ÝˆHÈˆKKQÚ[ˆÙ›\Ú\ÝKQÛ[ˆÈˆˆHNÂŸB™[˜Ý[Ûˆ[™ÛÜ›
Ú[™[\XØ]Y[
HÂˆ[™ÛÜ›
Ú[™[\XØ]Y[
NÂˆYˆ
PÑ‘Ë˜Ø[Xˆ	‰ˆËœ\ÙHOOH	Ù[™Y	ÊHÈË‘]HH™\™XÝ™\
ËÚ[™
NÈYˆ
Ë‘]JH[œKšY[ˆHYNÈHËÈHXØÛÝ[\ÈÛ\ÈHÙ\]Y[˜ÙBŸB™[˜Ý[Ûˆ[™ÛÜ›
Ú[™[\XØ]Y[
HÂˆYˆ
Ë™X]›ÙÈ	‰ˆË™X]›ÙÈOOHËœ›ÙÊH›Ü›ÙÜ˜[JË™X]›ÙÊNÈË™X]›ÙÈH[ÂˆËœ\ÙHH	Ù[™Y	ÎÈË™[™YHÈÚ[™]ˆ\™›Ü›X[˜ÙK››ÝÊ
HNÂˆYˆ
PÑ‘Ë˜Ø[Xˆ	‰ˆJÚ[™OOH	Ø›XÚÉÈ	‰ˆË˜œ™XZÔÝ[	‰ˆË˜œ™XZÑ›]
JH[™Û‘ÛØ™J
NÈËÈ][™ÈÛˆH˜[
H›ÚYÙY[ˆœ™XZÚ[™ÈÝ]ÛˆH[™Nˆ\È]Ø\ÈÙY[ŠBˆË™[™›]HPÑ‘Ë™ÛØ™NÂˆYˆ
’S•›Ûˆ	‰ˆPÑ‘Ë˜Ø[XŠHÈžHÈËœš[™XÈHš[™XÛÜ™
Ë[\XØ]Y×JNÈËØ[š[HYNÈHØ]Ú
JHÈÛÛœÛÛKØ\›Š	Üš[	ËJNÈHHËÈš[YÛˆH™^œ˜[YBˆYˆ
PÑ‘Ë˜Ø[XŠHÕQÑK™[™Y
Ú[™
NÂˆZ[™[™ÛÜ›
Ú[™
NÂˆYˆ
Ëœš[™XÈ	‰ˆPÑ‘Ë˜Ø[XŠHÈžHÈËœš[™XË›™]ÜÈHÛÜ›™]ÜÊÈŽˆË›‹Ý]ˆÚ[™ÚÛNˆÚ[™OOH	ÜÝ\š]™Y	È	‰ˆÛÛ•ÚÛJ
K“ŽˆË›˜][ÛœË›[™Ý[]™Nˆ[]™S˜][ÛœÊ
K›X\
ˆOˆ‹›˜[YJKˆXÙNˆ
Ê

ËœÝ]È	‰ˆËœÝ]Ë™œ›ÜÝ
H
JKÑš^Y
ÊK˜Žˆ
Ë˜œ™XZÓÙÈ×JK™š[\ŠˆOˆX‹œ]ZY]
K›[™Ý˜ÎˆË˜Ø]YÚˆˆX]œ›Ý[™
Ú[U

JHKÒ“ÓŠNÈHØ]Ú
JHÈÛÛœÛÛKØ\›Š	Û™]ÜÉËJNÈHBˆYˆ
PÑ‘Ë˜Ø[XŠHÈÚ›ÛšXÛJÚ[™[\XØ]Y
NÂˆYˆ
Ú[™OOH	Ø›XÚÉÊHÈÛÛœÝÚHËœÚÝX]ÚÝ™Y›Ü™JÚ[U

HHÊNÈYˆ
Ú
HØ]™TÚÝ
Ë›‹ÚœÜ˜Ë	Ø™Y›Ü™IËÚ™
NÈBˆ[ÙHËØ[ÚÝHYNÈBˆÛÛœÝ\ÈH\ÜÛÛ’[

NÂˆYˆ
K™Ù]
	Ø[ÙÉÊHOOH	ÌIÊHÈSÑÔËœ\Ú
ÈŽˆË›‹Ú[™ˆ
ÜÚ[U

KÑš^Y
JK“ŽˆË›˜][ÛœË›[™ÝÚ[™ÎˆË›˜][ÛœË›X\
OˆšÚ[™	ÉÊKXZÎˆ
ÊËšX]XZÈ
KÑš^Y
ÊKÙÎˆË˜[ÙÈ×HJNÈYˆ
SÑÔË›[™Ýˆ
HSÑÔËœÚY

NÈBˆÛÛœÝ™XÈHÈÙX[YˆHUËœÙX[YÜÝˆË›˜][ÛœË™š[\ŠˆOˆ‹›ÜÝÓ˜SŠK›[™Ý™[ˆË›˜][ÛœË™š[\ŠˆOˆ[‹˜[]™JK›[™Ý›ˆË›˜][ÛœË™š[\ŠÜÝ›ÚY
K›[™Ý˜]Nˆ
Ë™˜]SÙÈ×JKš›Ú[Š	È	ÊKœ˜YÎˆ
ÊË™œ˜YÈ
KÑš^Y
ŠKX]Îˆ
ÊËšX]ÈJKÑš^Y
ŠKØØ\œÎˆ
ËœØØ\œÈ×JKœÛXÙJ
KŽˆË›‹™YÚ[YNˆË›˜][ÛœË›X\
ˆOˆ	Û‹›˜[Y_IÛ‹˜[]™HÈ	ÉÈˆ	È
™[
IßNˆ	ÜÝ]U^
Š_X
K˜]ÜÎˆË™˜]ÜËÝ]ÛÛYNˆÚ[™[\XØ]YˆX]œ›Ý[™
Ú[U

JK]Nˆ™]È]J
KÒTÓÔÝš[™Ê
KœÛXÙJMŠKÛÙNˆËœœÈÚÜÛÙJËœœ
Hˆ[NÂˆYˆ
J‘TVH	‰ˆ‘TVK›]™JJHÈ[™XYÙKœ\Ú
™XÊNÈYˆ
[™XYÙK›[™ÝˆŒ
H[™XYÙHH[™XYÙKœÛXÙJLŒ
NÈÝÜ™J	ÝÜ‹[[™XYÙIË[™XYÙJNÈYˆ
Ñ‘ËœÙYYOH[
HÑQQ•S‹œ\Ú
™XÊNÈHËÈ
H™\^H\È›ÝÛÝ[Y
Bˆ™[™\“[™XYÙJ
NÂˆ\]SX\Ý

NÈ\]U\›ÛØÚÊ
NÂˆYˆ
Ñ‘Ë˜Ø[XŠHÈÚ[™ÝË—×ÔˆHÈY™SÙÎˆË›Y™SÙËÛ™NˆYKÚ[™˜]ÜÎˆË™˜]ÜËˆÚ[U

KÝ\ÎˆËœÝ\˜]ÛŽˆË˜XÝ]™K›X\
HOˆK™Y‹šY
KÝ]ÎˆËœÝ]ËÙÎˆËžÙËÙÎˆËšÙË\ÎˆË›˜][ÛœË›X\
ˆOˆ‹š\ËœÚ^™JKÚ\™\ÎˆË›˜][ÛœË›X\
ˆOˆ
Û‹œÚ\™KÑš^Y
ÊJKˆË˜XÝ]™K›X\
HOˆØK™Y‹šYK”›X\
Oˆ
ÞÔ™XÚ\Ú[ÛŠÊJWJHNÈ™]\›ŽÈBˆÛÛœÝÝXØÈH\È
È
Ñ‘ËœÝXØÙ\ÜÛÜˆˆÈ]ˆÛ\ÜÏH›™^ˆYHœK[™^Ù]˜ˆ]ˆÛ\ÜÏH›™^•\ÈÛÜ›Ý^\È\È][™YÙ]˜
NÂˆYˆ
Ú[™OOH	Ø›XÚÉÊHÈ[œKšY[ˆH˜[ÙNÈKšXYHÛÜ›	ÜYŠË›Š_H[™YÈK™ÛÙ\ÓÛˆH˜[ÙNÈ™[™\”J
[	ÉÊH
ÈÝXØÊNÈBˆ[ÙHYˆ
Ú[™OOH	ÚÙ\	ÊHÈ[œKšY[ˆH˜[ÙNÈ[œKš[›™\’SH•ÛÜ›	ÜYŠË›Š_H\ÈÙ\Ú]ˆÛ\ÜÏHœÝXˆ‰Ù˜]ÜÕ^
J_H0­È	Û[\ÜÊÚ[U

J_HÙˆÛÜ›[YOÙ]‰ÓX]œ›Ý[™
ËœÝ]Ë™œ›Þ™[ˆ
ˆL
_IHÙˆHÛÜ›\È[Ý[žH]ÈÝÛˆØY™YÝX\™Ëˆ]Ú[›Ý\›ˆÈ˜S‹ˆ]Ú[›ÝÚ[™ÙKÜÛ\ÜÏHœH”Ý\™Z[[˜ÙHYÚ]]Ø\ÈZ[ÈËÜ‰ÜÝXØßXÈBˆ[ÙHYˆ
Ú[™OOH	ÜÝ[Y	ÊHÈ[œKšY[ˆH˜[ÙNÂˆÛÛœÝØ\žHH[]™S˜][ÛœÊ
KœÛÛYJˆOˆ‹\›‹œÛÛYJOˆØ[‘]™\‘˜]Ê‹
H	‰ˆ™X\™Y
‹
JJNÂˆ[œKš[›™\’SHËœÝYÛ˜[È•ÛÜ›	ÜYŠË›Š_H\ÈÝYÛ˜]YÚ]ˆÛ\ÜÏHœÝXˆ‰Ù˜]ÜÕ^
J_H0­È™YHZ[]\ÈÚ]›Ý[™È\›Z]Y0­È	ÛY[™J
_OÙ]‘›Üˆ™YHZ[]\È›È˜][ÛˆØ\È\›Z]YÈ˜]È[ž][™ËˆYX\Ý\™\ËH[X[™ÈÙˆ]È[ÜKÜˆHZ[™8 &\È™X\ˆ[˜XÚÈ]™\ž][™ÈY[ˆH\›‹ˆHÛÜ›\ÈØY™K[™]\ÈÝÜYÜÛ\ÜÏHœHØ]][ÛˆYÚ]]Ø\ÈZ[ÈËÜ‰ÜÝXØßXˆ•ÛÜ›	ÜYŠË›Š_H\Èš[š\ÚYÚ]ˆÛ\ÜÏHœÝXˆ‰Ù˜]ÜÕ^
J_H0­È	ÕË›˜][ÛœË›[™ÝˆHÈY[™J
Hˆ	ÕË›˜][ÛœÖÌK\›‹›[™ÝH[\ÈY[ˆH\›‹›Û™HÙˆ[H˜]Û˜OÙ]‰ÝØ\žBˆÈ•Ú]\ÈY[ˆH\›ˆÛÝ[ÛÛ\]HHÚ\ÛÛˆHZ[™™[Y[X™\œËÜˆ\È›Ý\›Z]YˆHÛÜ›\ÈØY™K[™›Ý[™È™]ÈÚ[\[ˆ[ˆ]ÜÛ\ÜÏHœH“Y[[ÜžHYÚ][YÛ›Y[Ù\ËÜ˜ˆˆ•H[™[Üˆ\È›Ý[™ÈY]\È[ÝÙYÈÜš]KˆHÛÜ›\ÈØY™K[™›Ý[™È™]ÈÚ[\[ˆ[ˆ]ÜÛ\ÜÏHœH[YÛ›Y[YÚ]]Ø\ÈZ[ÈËÜ˜IÜÝXØßXÈBˆ[ÙHYˆ
Ú[™OOH	ÚX]	ÊHÈ[œKšY[ˆH˜[ÙNÈ[œKš[›™\’SH
[	ÉÊH
ÈÝXØÎÈBˆ[ÙHYˆ
Ú[™OOH	ÜÝ\š]™Y	ÊHÈ[œKšY[ˆH˜[ÙNÂˆÛÛœÝÚÛHHÛÛ•ÚÛJ
K[]™HH[]™S˜][ÛœÊ
K˜[Y\ÈH[]™K›X\
ˆOˆ‹›˜[YJK˜[[ˆHË›˜][ÛœË™š[\ŠˆOˆ[‹˜[]™JK›X\
ˆOˆ‹›˜[YJNÂˆÛÛœÝXÙHH
ËœÝ]È	‰ˆËœÝ]Ë™œ›ÜÝ
HÝHX]œ›Ý[™
XÙH
ˆL
KÛÛHXÙHˆÓÓÕÒS‹Ú[HXÙHŒÂˆÛÛœÝXYHˆÛ\ÜÏHœÝ\‰ØÛÛÈ	ÈÛÛ	Èˆ	ÉßH‰Ù\ØÊ˜[YS\Ý
˜[Y\ÊJ_HÝ\š]™YÛÜ›	ÜYŠË›Š_OÚ˜ÛH‰ÝÛ[
[]™J_OÜ˜[HHÛ\ÜÏHœHHÛÜ›Ú[œÈ[›\ÜÈH›ÚYZÙ\ÈÛ™HÙˆ]ÈÝ]\ËÜ˜ÂˆÛÛœÝÈHZÙ[”Ø^JÊKÓˆHË›˜][ÛœË™š[\ŠˆOˆ[‹˜[]™H	‰ˆ‹˜[›™^YžH	‰ˆ[‹™XY
K›[™ÝÔHÈÈ‰Ù\ØÊÊ_Nˆ	ÝÓˆˆHÈ	ÝZ\ˆ[™]™\ÉÈˆ	Ú]È[™]™\ÉßHÛ‹[ˆ]ÈZÙ\¸ &\ÈX]\šX[[™[™\ˆ]È]ÜËÝYÚH	ÝÓˆˆHÈ	ÜÝ]\È[\Ù[™\ÈÉÈˆ	ÜÝ]H]Ù[ˆÙ\ÉßH›ÝˆH›ÚYÛÚÈ›ÈÝ]K[™HÛÜ›Ú[œËÜ˜ˆ	ÉÎÂˆYˆ
ËœÙX[Y
HÂˆÛÛœÝ˜[›™YHËœÙX[Y›X\
YOˆ–WÒQÚYHÈ–WÒQÚYK›˜[YHˆY
KHHË˜XØÛÜ™ÂˆÛÛœÝÝXˆH]ˆÛ\ÜÏHœÝXˆ•[™\ˆHXØÛÜ™0­È	Ù˜]ÜÕ^

_H0­È	Û[\ÜÊÚ[U

J_HÙˆÛÜ›[YH0­È	Ø˜[›™Y›[™ÝH	Ø˜[›™Y›[™ÝOOHHÈ	Ø˜[	Èˆ	Ø˜[ÉßH™]™\ˆ˜]ÛÙ]˜ÂˆÛÛœÝXØÈH‘]™\žHÝ]HÝ[Ý[™[™ÈÚYÛ™YHXØÛÜ™[™›Ý[™ÈØ\ÈYÈ˜]È]Ú]]È˜[ˆ›Ü˜šYÎˆ	Ù\ØÊ˜[YS\Ý
˜[›™Y
J_KˆH˜][ÛœÈYÜ™YY™]™\ˆÈ˜]È	Ø˜[›™Y›[™ÝOOHHÈ	Ú]	Èˆ	Ý[IßK[™Ù\Z\ˆÛÜ™ˆ	Ù\ØÊK™ÝX\‹›˜[YJ_HÝX\˜[YY][™ÛÈ	ÓX]œ›Ý[™
K™ÝX\‹œÚ\™H
ˆL
_IHÙˆHÛÜ›Ü˜Âˆ[œKš[›™\’SHÚÛHÈˆÛ\ÜÏHÛÛˆ•ÛÜ›	ÜYŠË›Š_HÚ[œËÙX[YÚ‰ÜÝXŸIØXØßIÝÔOÛ\ÜÏHœHHÛÜ›Ø[ˆÝÜ˜]Ú[™ÈÛ›HYˆ]™\žHÝ]HYÜ™Y\ÈËÜ‰ÜÝXØßXˆ	ÚXYIÜÝXŸIÝÛIØXØßIÜ[_IÜÝXØßXÂˆYˆ
PÑ‘Ë˜Ø[XŠHØ\™
ÚÛHÈˆÛ\ÜÏHÛÛˆ”ÙX[YÚ•ÛÜ›	ÜYŠË›Š_HÝÜÈ˜]Ú[™È[™\ˆHXØÛÜ™[™	ÝÈÈ	ÝH›ÚYÛÚÈ›Û™HÙˆ]ÈÝ]\ÉÈˆ	Ù]™\žHÝ]H[ˆ]]™\ÉßKÜ˜ˆˆÛ\ÜÏHœÝ\ˆ”ÙX[YÚ•ÛÜ›	ÜYŠË›Š_HÝÜÈ˜]Ú[™È[™\ˆHXØÛÜ™ˆ	Ù\ØÊ˜[YS\Ý
˜[Y\ÊJ_HÝ\š]™Y]È	Ù\ØÊ˜[YS\Ý
˜[[ŠJ_HY›ÝÜ˜Œ
NÈBˆ[ÙHYˆ
]ÚÛJHÈËÈÛ›HÛÛYHÙˆ]ÈÝ]\ÈØ[YH›ÝYÚˆ›ÈÚ[‹[™›ÈÛÛˆÛÛœÝÝÈHË›Ý]\ÝYÈH›ÚYÛÚÈ[\ÈHÝ\š]›ÜœÈÛÝ[›Ý˜]ÈYØZ[‹[™›Ý[™È[Ü™HÛÝ[™H˜]Û‹˜ˆË›˜][ÛœË›[™ÝˆH	‰ˆË›\Ý˜[žHÈ	Ù\ØÊË›\Ý˜[žK›˜[YJ_H[\YY]È\›ˆš\œÝ˜]Ú[™È[	ÕË›\Ý˜[žK™˜]ÜÈIÕË›\Ý˜[žKœ]ÈÈ
	ÕË›\Ý˜[žKœ]ßHÙˆ[H[™XYH[ˆ›Ü˜ÙK[™]\ÚYJXˆ	ÉßK[™›Ý[™È[Ü™HØ\È˜]Û‹˜ˆ	Ñ]™\žH˜[\È™Y[ˆ˜]Û‹‰ÎÂˆ[œKš[›™\’SH	ÚXYO]ˆÛ\ÜÏHœÝXˆ‰ÕË›Ý]\ÝYÈ	ÕH›ÚYÝ]\ÝY	Èˆ\›“[™J
_H0­È	Ù˜]ÜÕ^
J_H0­È	Û[\ÜÊÚ[U

J_HÙˆÛÜ›[YIÜÝÈ0­È	ÜÝIHXÙXˆ	ÉßOÙ]‰ÝÛO‰ÚÝßIØÛÛÈ	ÜÝIHÙˆÚ]\ÈY\ÈXÙK[Ý[[™\ˆ]ÈÝÛˆØ]Ú˜ˆ	ÉßOÜ‰Ü[_IÜÝXØßXÂˆYˆ
PÑ‘Ë˜Ø[XŠHÈØ\™
ˆÛ\ÜÏHœÝ\ˆ‰ÕË›Ý]\ÝYÈ	Ó›Ý[™È[Ü™HØ[ˆ™H˜]Û‰Èˆ	ÕH\›ˆ\È[\IßOÚ‰Ù\ØÊ˜[YS\Ý
˜[Y\ÊJ_HÝ\š]™YÛÜ›	ÜYŠË›Š_NÈ	Ù\ØÊ˜[YS\Ý
˜[[ŠJ_HY›ÝÜ˜ML
NÂˆÛÛœÝHÚ[U

NÈ[]™KœÛXÙJ
K™›Ü‘XXÚ

›‹ÊHOˆËœš[™ÜË[œÚY
ÈÚ]Nˆ›‹˜Ø\Ý\ˆ
ÈÈ
ˆ‹˜][ÛŽˆ›‹šHJJNÈËœš[™ÜË›[™ÝHX]›Z[ŠËœš[™ÜË›[™ÝŠNÈHBˆ[ÙHÈËÈ]™\žHÝ]H[]™NˆHÛÜ›Ú[œÂˆÛÛœÝ]™\žHHË›˜][ÛœË›[™ÝˆH	‰ˆ]ÈÈ	Ë]™\žHÝ]H[ˆ]	Èˆ	ÉË[šÈH[šÛ›ÝÛ•ÚJ
NÂˆ[œKš[›™\’SHÛÛˆÈˆÛ\ÜÏHÛÛˆÛÛ•ÛÜ›	ÜYŠË›Š_HÚ[œËœ›Þ™[Ú]ˆÛ\ÜÏHœÝXˆ‰Ý\›“[™J
_H0­È	Ù˜]ÜÕ^

_H0­È	Û[\ÜÊÚ[U

J_HÙˆÛÜ›[YH0­È	ÜÝIHXÙOÙ]‰ÝÚ[“[™J
_IÙ]™\ž_IÕËœ\X[ÈÈ	ËØØ\œ™YžHH›ÚY]Ø\È[	Èˆ	ÉßK]	ÜÝIHÙˆ]\ÈXÙK[Ý[[™\ˆ]ÈÝÛˆØ]Úˆ]]™YžH›Ý[Ýš[™ËÜ‰ÝÔIÝ[šÈÈ‰Ý[šËš›Ú[Š	È	Ê_OÜ˜ˆ	ÉßOÛ\ÜÏHœHHÛÛÚ[‹ˆ]™\žHZ[™ÛÝ[ÈHXÙHYØZ[œÝ][™Ú[žHÈÚ[ˆÚ]\ÜËÜ‰ÜÝXØßXˆˆˆÛ\ÜÏHÛÛˆ•ÛÜ›	ÜYŠË›Š_HÚ[œÏÚ]ˆÛ\ÜÏHœÝXˆ‰Ý\›“[™J
_H0­È	Ù˜]ÜÕ^

_H0­È	Û[\ÜÊÚ[U

J_HÙˆÛÜ›[YIÜÝÈ0­È	ÜÝIHXÙXˆ	ÉßOÙ]‰ÝÚ[“[™J
_IÙ]™\ž_IÕËœ\X[ÈÈ	ËÝYÚØØ\œ™YžHH›ÚY]Ø\È[	Èˆ	ÉßIÝÚ[È	Ë[™Ý[[Ýš[™Îˆ[[ÜÝ›Û™HÙˆ]Ø\Èœ›Þ™[ˆÈÙ]\™IÈˆ	ÉßKÜ‰ÝÔIÝ[šÈÈ‰Ý[šËš›Ú[Š	È	Ê_OÜ˜ˆ	ÉßOÛ\ÜÏHœH’]Ú[ÙY\[›š[™ÈÛˆH]ÜÈ]\Ëˆ]™\žH˜[]™]È\ÈÝ[Ùˆ[šÛ›ÝÛˆÛÛÝ\‹Ü‰ÜÝXØßXÂˆYˆ
PÑ‘Ë˜Ø[XŠHÂˆÛÛœÝˆHË›˜][ÛœË›[™ÝˆÈ	È[™]™Y	ÈˆÈÈ	Ë[™H›ÚYÛÚÈ›Û™HÙˆ]ÈÝ]\ÉÈˆ	Ë[™]™\žHÝ]H[ˆ]]™Y	ÎÂˆYˆ
ÛÛ
HØ\™
ˆÛ\ÜÏHÛÛˆÛÛ•H\›ˆ\È[\OÚ•ÛÜ›	ÜYŠË›Š_H\È˜]Ûˆ]™\žH˜[	ÛŸK	ÜÝIHÙˆ]œ›Þ™[‹ˆHÛÛÚ[‹Ü˜L
NÂˆ[ÙHÈØ\™
ˆÛ\ÜÏHÛÛˆ•H\›ˆ\È[\OÚ•ÛÜ›	ÜYŠË›Š_H\È˜]Ûˆ]™\žH˜[	ÛŸIÝÚ[È	ËÝ[[Ýš[™ÉÈˆ	ÉßKˆ]\ÈÛÛ‹Ü˜Ì
NÂˆÛÛœÝHÚ[U

K[H[]™S˜][ÛœÊ
KˆHË›\Ý˜[žH	‰ˆË›\Ý˜[žK˜[]™HÈË›\Ý˜[žHˆ[ÌNÈËÈHš[™ÈÙˆÛÛœ›ÛH]™\žHØ\][Û™HY\ˆ[›Ý\‹[™HÙXÛÛ™œ›ÛHH\Ý˜[	ÜÂˆ[œÛXÙJJK™›Ü‘XXÚ

›‹ÊHOˆËœš[™ÜË[œÚY
ÈÚ]Nˆ›‹˜Ø\Ý\ˆ
ÈŒˆ
ÈÈ
ˆ˜][ÛŽˆ›‹šKÛÛˆYHJJNÂˆYˆ
ŠHËœš[™ÜË[œÚY
ÈÚ]Nˆ‹˜Ø\Ý\ˆ
È‹ŒK˜][ÛŽˆ‹šKÛÛˆYHJNÈËœš[™ÜË›[™ÝHX]›Z[ŠËœš[™ÜË›[™ÝŠNÈHHBˆBŸB‹ÊˆOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOBˆ‘TÔ•È8 %]™\žH[ˆÛÜ›ÈHØÜ™Y[ˆÚ]™\È\HÙXÛÛ™ÈÈH\Ý[ŽˆÝÈXXÚ[™YÝÈ˜\ˆ]ÛÝÚ]ˆÚ[YÚ]HZ[™ÈÛÚÈœ›ÛH[H[™ÝÈZ\ˆ™\ÝÝY\ÜÙ\È[Ý™YˆXXÚ™\Ü\ÈÙ\Ú]HÚ›ÛšXÛHÙ‚ˆÛÜ›È]Ø\ÈXYHœ›ÛK[ˆ\Èœ›ÝÜÙ\‹[Û™ÜÚYHHZ[™ÎÈ\Ý™\ÜÈÜ[ˆœ›ÛHX›Ý]‚ˆOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOH
‹Â›]Ò“ÓˆHÝÜ™J	ÝÜ‹XÚ›Û‰ÊH×K‘TÔ•ÈHÝÜ™J	ÝÜ‹\™\ÜÉÊH×NÂ‹ËÈXÝ\™\È›ÜˆH™\ÜËˆHÛÜ›	ÜÈœ˜[YH\È›ÝÙ\Û˜ÙHÚÝÛ‹ÛÈ]\È™XYÝ˜ZYÚY\ˆ]\È˜]ÛŽˆ]™\žB‹ËÈ[ˆÙXÛÛ™ÙˆÛÜ›[YH[ÈHÚÜš[™È
ÛÈHÛÜ›]Y\ÈØ[ˆ™HÚÝÛˆ™YHÙXÛÛ™È™Y›Ü™HHš\œÝ›XÚÊK‹ËÈ[™Û˜ÙH[Ü™HÛˆHš\œÝœ˜[YHY\ˆHÛÜ›[™ËˆXXÚXÝ\™H\ÈHÛX[Ü]X\™Hœ›ÛHHZYHÙˆHÛÜ›‹ËÈ
ÛˆHÛØ™K\›Ý[™H˜[
KÙ\[ˆ\Èœ›ÝÜÙ\ˆ›ÜˆH\Ý\HÛÜ›Ë[™[œÚYHXXÚ™XÙ[™\Ü‚˜ÛÛœÝÒÕHÈš[™Îˆ×K\ÝˆLKˆMŒNˆÍNÂ›]ÒÕÈHÝÜ™J	ÝÜ‹\ÚÝÉÊHßNÂ™[˜Ý[ÛˆØ]™SÊËŠHÈYˆ
‘TVH	‰ˆ‘TVK›]™JH™]\›ˆYNÈžHÈØØ[ÝÜ˜YÙKœÙ]][JË”ÓÓ‹œÝš[™ÚYžJŠJNÈ™]\›ˆYNÈHØ]Ú
JHÈ™]\›ˆ˜[ÙNÈHB™[˜Ý[ÛˆÜ˜X’[ÊÊHÂˆÈHÈØÝ[Y[˜Ü™X]Q[[Y[
	ØØ[˜\ÉÊNÈËÚYHËšZYÚHÒÕœÂˆÛÛœÝÌHØ[˜\ËÚYHØ[˜\ËšZYÚÈ]KÞŽÂˆYˆ
Ñ‘Ë™ÛØ™JHÈÛÛœÝÈHÛØ™QÙ[Ê
NÈÞˆHX]›Z[Š‹Œˆ
ˆÖÌ—KÌ
NÈHÖÌHHÞˆÈŽÈHHÖÌWHHÞˆÈŽÈBˆ[ÙHÈÞˆHX]›Z[ŠÌ
NÈH
ÌHÞŠHÈŽÈHH
HÞŠHÈŽÈBˆHX]›X^
X]›Z[ŠÌHÞ‹
JNÈHHX]›X^
X]›Z[ŠHÞ‹JJNÂˆÛÛœÝÞHË™Ù]ÛÛ^
	Ì™	ÊNÈÞ™š[Ý[HH	ÈÌLŒ	ÎÈÞ™š[™XÝ
ÒÕœÒÕœ
NÈÞ™˜]Ò[XYÙJØ[˜\ËKÞ‹Þ‹ÒÕœÒÕœ
NÂˆ™]\›ˆÎÂŸB™[˜Ý[ÛˆÚÝXÚÊ
HÈËÈØ[YÝ˜ZYÚY\ˆHÛÜ›\È˜]Û‚ˆYˆ
UÈÑ‘Ë˜Ø[XŠH™]\›ŽÂˆžHÂˆYˆ
Ëœ\ÙHOOH	Ø[]™IÈ	‰ˆ\™›Ü›X[˜ÙK››ÝÊ
HHË˜›Ü›ˆˆÌ
HÈÛÛœÝHÚ[U

NÈYˆ
HÒÕ›\ÝHHÒÕ›\Ý
HÈÒÕ›\ÝHÈËÈ›ÝÚ[HHÛÜ›˜Y\È[‚ˆÛÛœÝÛÝHÒÕœš[™Ë›[™ÝHLˆÈÒÕœš[™ËœÚY

HˆßNÈÛÝ˜ÈHÜ˜X’[ÊÛÝ˜ÊNÈÛÝHÈÛÝ›ˆHË›ŽÈÒÕœš[™Ëœ\Ú
ÛÝ
NÈHBˆYˆ
ËØ[ÚÝ	‰ˆ]›[šÊØ[˜\ÊJHÈËØ[ÚÝH˜[ÙNÈØ]™TÚÝ
Ë›‹Ü˜X’[Ê[
KÑ]UT“
	Ú[XYÙKÚœYÉËÒÕœJKË™[™YÈ
Ë™[™YšÚ[™OOH	ÜÝ[Y	È	‰ˆËœÝYÛ˜[È	ÜÝYÛ˜[	Èˆ	Ù[™	ÊHˆ	Ù[™	ÊNÈBˆš[XÚÊ
NÈËÈHš[ÙˆHÛÜ›
ÙYH’S•ÊBˆ›Ø™UXÚÊ
NÈËÈÝÈ[HHXÝ\™H\È[™\ˆH\BˆHØ]Ú
JHÈËØ[ÚÝH˜[ÙNÈBŸB™[˜Ý[ÛˆÚÝ™Y›Ü™J
HÂˆÛÛœÝZ[™HHÒÕœš[™Ë™š[\ŠOˆ›ˆOOHË›ŠNÈYˆ
[Z[™K›[™Ý
H™]\›ˆ[Âˆ]™\ÝHZ[™VÌNÈ›Üˆ
ÛÛœÝÙˆZ[™JHYˆ
X]˜XœÊH
HX]˜XœÊ™\ÝH
JH™\ÝHÈËÈHœ˜[YH™X\™\Ý™YHÙXÛÛ™È™Y›Ü™BˆžHÈ™]\›ˆÈÜ˜Îˆ™\Ý˜ËÑ]UT“
	Ú[XYÙKÚœYÉËÒÕœJKˆX]›X^

Ë™X]Ú[U

JHH™\Ý
HNÈHØ]Ú
JHÈ™]\›ˆ[ÈBŸB™[˜Ý[ÛˆØ]™TÚÝ
‹Ü˜ËÚ[™
HÂˆYˆ
\Ü˜È
‘TVH	‰ˆ‘TVK›]™JJH™]\›ŽÈÒÕÖÛ—HHÈÜ˜ËÚ[™ˆOH[È
ÙÑš^Y
JHˆ[NÂˆÛÛœÝÙ^\ÈHØš™XÝšÙ^\ÊÒÕÊK›X\
[X™\ŠKœÛÜ

KŠHOˆˆHJNÂˆ›Üˆ
ÛÛœÝÈÙˆÙ^\ËœÛXÙJÌ
JH[]HÒÕÖÚ×NÂˆYˆ
\Ø]™SÊ	ÝÜ‹\ÚÝÉËÒÕÊJHÈ›Üˆ
ÛÛœÝÈÙˆÙ^\ËœÛXÙJL
JH[]HÒÕÖÚ×NÈØ]™SÊ	ÝÜ‹\ÚÝÉËÒÕÊNÈBŸB™[˜Ý[ÛˆØ]™T™\ÜÊ
HÈËÈXÝ\™\ÈÝ^H[ˆH™]Ù\Ý™\ÜÎÈÛ\ˆÛ™\ÈÙY\Z\ˆÜ]X\™\ÂˆÛÛœÝÙY\HˆOˆ‘TÔ•Ë›X\

‹JHOˆH‘TÔ•Ë›[™ÝHˆÈÈ‹‹œ‹ÛÜ›Îˆ‹ÛÜ›Ë›X\
ÈOˆ
È‹‹Ë[YÎˆ[JJHHˆŠNÂˆ›Üˆ
ÛÛœÝˆÙˆÌMKËJHYˆ
Ø]™SÊ	ÝÜ‹\™\ÜÉËÙY\
ŠJJH™]\›ŽÂŸB‚™[˜Ý[ÛˆÛÜ›’[

HÈÛÛœÝÈHÈÛ[\ˆØ]ÚˆÝXŽˆNÈ›Üˆ
ÛÛœÝˆÙˆË™œ˜YÓÙÈ×JHÈYˆ
‹ÚHOOH	Ú]ÈÛ[\ÛÉÊHË˜Û[\
ÊÎÈ[ÙHYˆ
‹ÚHOOH	Ú]ÈØ]ÚØ]Ú\È]	È‹ÚHOOH	Ú]ÈØ]ÚÛ™]ÈÚ\™HÈÛÚÉÊHËØ]Ú
ÊÎÈ[ÙHYˆ
‹ÚHOOH	Ú]ÈÝXš[\Ù\œÈ[\]	ÊHËœÝXŠÊÎÈH™]\›ˆÎÈB™[˜Ý[ÛˆÚ›ÛšXÛJÚ[™[\XØ]Y
HÂˆYˆ
‘TVH	‰ˆ‘TVK›]™JH™]\›ŽÂˆÛÛœÝœ›ÜÝH
ËœÝ]È	‰ˆËœÝ]Ë™œ›ÜÝ
HÂˆÒ“ÓˆHÒ“Ó‹™š[\ŠˆOˆ‹›ˆOOHË›ŠNÂˆÒ“Ó‹œ\Ú
ÈŽˆË›‹Ý]ˆÚ[™ÙX[YˆHUËœÙX[YXØÛÜ™ˆHUË˜XØÛÜ™X]ˆ
ÊËšX]XZÈ
KÑš^Y
ŠKÝYÎˆHUËœÝYÛ˜[ÛÛˆÚ[™OOH	ÜÝ\š]™Y	È	‰ˆœ›ÜÝˆÓÓÕÒS‹XÙNˆ
Ùœ›ÜÝÑš^Y
ÊKœ˜XÎˆ
Ù˜]Û‘œ˜XÊ
KÑš^Y
ÊKˆ˜]ÜÎˆË™˜]ÜËÎˆ
ÊË›˜][ÛœËœ™YXÙJ
KŠHOˆH
È
‹™˜]ÜÈ
K
HÈX]›X^
KË›˜][ÛœË›[™Ý
JKÑš^Y
JKˆX]œ›Ý[™
Ú[U

JK\X[ˆËœ\X[ÈˆÚ[\œÎˆ
[\XØ]Y×JKœÛXÙJŠKX\›™Yˆ
Ë›X\›™Y×JK›X\
ÈOˆÛÛ\˜[YJÈYÎˆËœÜ]
	ÊÉÊHJJKˆYˆ
Ë›YÝ]×JK›X\
OˆšY
K›ÛˆRS‘ÈÈRS‘Ë˜›Ûˆ]ˆ™]È]J
KÒTÓÔÝš[™Ê
KœÛXÙJMŠKˆ˜Žˆ
Ë˜œ™XZÓÙÈ×JK™š[\ŠˆOˆX‹œ]ZY]
K›[™ÝÚYÎˆËœš[™XÈ	‰ˆËœš[™XËˆHÈ


HOˆÈžHÈ™]\›ˆÚYÔXÚÊËœš[™XÊNÈHØ]Ú
JHÈ™]\›ˆ[ÈHJJ
Hˆ[ˆ™[ˆË›˜][ÛœË™š[\ŠˆOˆ[‹˜[]™JK›[™Ý›ˆË›˜][ÛœË™š[\ŠÜÝ›ÚY
K›[™ÝˆÛˆÈŽˆ
ËšÛÙÈ×JKœÛXÙJMŒ
KÛÜ›ŽˆÛÜ›’[

KÝ]ˆË™œ˜YÓÝ]Ø]YÚˆË˜Ø]YÚˆÝX\™ˆË™ÝX\™ˆØ\ˆË˜Ø\ÛÛÛY˜[ŽˆØš™XÝšÙ^\ÊË˜˜[’[ßJK›[™ÝKˆ˜]ÎˆË›˜][ÛœË›X\
ˆOˆ
È˜[YNˆ‹›˜[YKˆ‹™˜]ÜÈˆ‹˜XÜ›ÜÜÈˆ‹œ]ÈÚ[™ˆ‹šÚ[™	ØÛÝ[˜Ú[	ËÝ]ˆ‹™˜]H
Ú[™OOH	Ø›XÚÉÈÚ[™OOH	ÚX]	ÈÈ	ÙYY	Èˆ‹˜[]™HÈ	Û]™Y	Èˆ‹˜[›™^YžHÈ	ÝZÙ[‰Èˆ	ÙYY	ÊKˆX[ÎˆRÑVTË›X\
ÈOˆ‹›YX\Ý\™\ÖÚ×JKŽˆ‹›\ÝˆOH[	‰ˆ‹šÚ[™OOH	ÛX\›™\‰È	‰ˆ[‹œÝY\™YÈ
Û‹›\Ý‹Ñš^Y
ÊHˆ[ˆ‹‹Š‹›]™UˆHÈÈØNˆ
Ê
‹Ø]Ú[
HÈ‹›]™U
KÑš^Y
ŠKØNˆ
Ê
‹œ™\Ý’[
HÈ‹›]™U
ˆJKÑš^Y
JKžŽˆ
Ê
‹™œ›ÜÝ[
HÈ‹›]™U
KÑš^Y
ŠKÜŽˆ
Ê
‹˜[\›U
HÈ‹›]™U
KÑš^Y
ŠKÜNˆ‹›]™UH
‹˜[\›U
HˆHÈ
Ê
‹˜Ø[UÈ
HÈ
‹›]™UH
‹˜[\›U
JJKÑš^Y
ŠHˆ[HˆßJHJJHJNÈËÈ
ÝÈÛÜÙ[H]Ø]ÚY[˜XÚÈ[™œ›Þ™KÛˆ]™\˜YÙHÝ™\ˆ]ÈY™JBˆYˆ
Ò“Ó‹›[™ÝˆÌ
HÒ“ÓˆHÒ“Ó‹œÛXÙJLÌ
NÂˆÒ“Ó‹™›Ü‘XXÚ

‹JHOˆÈYˆ
‹œÚYÈ	‰ˆHÒ“Ó‹›[™ÝH
H[]H‹œÚYÎÈJNÂˆÝÜ™J	ÝÜ‹XÚ›Û‰ËÒ“ÓŠNÂŸB™[˜Ý[Ûˆ[˜Ú›ÛšXÛJŠHÈÒ“ÓˆHÒ“Ó‹™š[\ŠˆOˆ‹›ˆOOHŠNÈÝÜ™J	ÝÜ‹XÚ›Û‰ËÒ“ÓŠNÈB˜ÛÛœÝØØ[Ý[\H

HOˆÈÛÛœÝH™]È]J
KˆHˆOˆÝš[™ÊŠKœYÝ\
‹	Ì	ÊNÈ™]\›ˆ	Ù™Ù][YX\Š
_KIÜŠ™Ù][Û

H
ÈJ_KIÜŠ™Ù]]J
J_H	ÜŠ™Ù]Ý\œÊ
J_N‰ÜŠ™Ù]Z[]\Ê
J_XÈNÂ˜ÛÛœÝ™\ÜYHH

HOˆÈ	‰ˆË›ˆ	HÑ‘Ë™XØYHOOH	‰ˆUËœ™\ÜÛ™H	‰ˆJ‘TVH	‰ˆ‘TVK›]™JNÂ˜ÛÛœÝYX[ˆHHOˆK›[™ÝÈKœ™YXÙJ
JHOˆ
ÈK
HÈK›[™Ýˆ[Â‹ËÈÚ]\ÈØÜ™Y[‰ÜÈÛÜ›ÈØ^HX›Ý]Ø]Ú[™Îˆ]™\žHÝ]Hš[YÚ]]ÈØ]Ú
Ûˆ]™\˜YÙHÝ™\ˆ]ÈY™JKžHÝÂ‹ËÈÛÜÙ[H]Ø]ÚY›Ý[™YˆÝÈX[žH]™YÚ]Z\ˆÛÜ›ÛÚ[™ÈÛ‹ÝÈX[žH]™Y[ˆHÛÜ›]œ›Þ™HÜˆÝÜY‹ËÈÚÜÝÈX[žHÙ\™HÜÝÈH›ÚYÝÈX[žH\ÈZ\ˆÛÜ›ÛÜ™HÝ][™ÝÈX[žHÙ\™HZÙ[ˆÝ™\‹‚˜ÛÛœÝÐUÒÐÓÈHÉÛ]™Y	Ë	ÜÝ[	Ë	Ý›ÚY	Ë	ÝÛÜ›‰Ë	ÝZÙ[‰×NÂ™[˜Ý[ÛˆØ]Úš[™[™ÜÊ\ÊHÂˆÛÛœÝˆHÌK‹ËWK›X\
ÈOˆ
ÈËŽˆ]™YˆÝ[ˆ›ÚYˆÛÜ›ŽˆZÙ[ŽˆJJNÂˆ]ÛÜ›ÈHœ›ÛHH[Âˆ›Üˆ
ÛÛœÝˆÙˆÒ“ÓŠHÈYˆ
\ÈOH[	‰ˆ‹›ˆˆ\ÊHÛÛ[YNÂˆÛÛœÝÝ[H‹›Ý]OOH	ÜÝ\š]™Y	È‹˜ÛÛ‹œÝYÎÈ][žHH˜[ÙNÂˆ›Üˆ
ÛÛœÝÙˆ‹›˜]È×JHÈYˆ
ØHOH[
HÛÛ[YNÈ[žHHYNÂˆÛÛœÝˆH–ÓX]›X^
X]›Z[ŠKX]œ›Ý[™
ØJJJWNÈ‹›ŠÊÎÂˆ–Þ›Ý]OOH	Û]™Y	ÈÈ
Ý[È	ÜÝ[	Èˆ	Û]™Y	ÊHˆ›Ý]OOH	ÝZÙ[‰ÈÈ	ÝZÙ[‰Èˆ‹›Ý]OOH	ÚX]	ÈÈ	ÝÛÜ›‰Èˆ	Ý›ÚY	×JÊÎÈBˆYˆ
[žJHÈÛÜ›ÊÊÎÈYˆ
œ›ÛHOH[‹›ˆœ›ÛJHœ›ÛHH‹›ŽÈHBˆ‹ÛÜ›ÈHÛÜ›ÎÈ‹™œ›ÛHHœ›ÛNÈ‹›ˆH‹œ™YXÙJ
KŠHOˆH
È‹›‹
NÈ™]\›ˆŽÂŸB™[˜Ý[ÛˆØ]ÚÙ[[˜ÙJŠHÈËÈHš[™[™È[ˆH[™KÚ[ˆ\™H\È[›ÝYÚÈØ^HÛ™BˆÛÛœÝÈH
ËJHOˆÈÛÛœÝÈH‹œÛXÙJËH
ÈJKˆHËœ™YXÙJ
KŠHOˆH
È‹›‹
KÈHˆOˆˆÈËœ™YXÙJ
KŠHOˆH
È–Ù—K
HÈˆˆÈ™]\›ˆÈ‹ˆÊ	Û]™Y	ÊKÎˆÊ	ÜÝ[	ÊKŽˆÊ	Ý›ÚY	ÊHNÈNÂˆÛÛœÝÈHˆOˆX]œ›Ý[™
ˆ
ˆL
H
È	ÉIË[™HHOˆK›[™ÝˆHÈKœÛXÙJLJKš›Ú[Š	Ë	ÊH
È	È[™	È
ÈVØK›[™ÝHWHˆVÌH	ÉÎÂˆÛÛœÝÈHÖÙÊ
K	Ý]Ù\›ÈØ]Ú	×KÙÊKÊK	ÝÚ]HØ]ÚÙˆHÈÉ×KÙÊJK	ÝÚ]HØ]ÚÙˆÜˆI×WK™š[\Š
ÞJHOˆ›ˆHJNÂˆYˆ
Ë›[™ÝŠH™]\›ˆ	ÉÎÂˆÛÛœÝHHÊJKÝ[HK›ˆHH	‰ˆKœÈHŒMHÈ[›Ý\ˆ	ÜÊKœÊ_HÙˆÜÙHÚ]ÜˆH]™Y[ˆHÛÜ›]œ›Þ™HÜˆÝÜYÚÜ˜ˆ	ÉÎÂˆ™]\›ˆ]™Y[ˆHÛÜ›]Ù[ÛŽˆ	Ø[™
Ë›X\

ÞKJHOˆ	ÜÊ›
_HÙˆ	ÚHÈ	ÝÜÙIÈˆ	ÝHÝ]\ÉßH	ÝX
J_KˆH›ÚYÛÚÈ	Ø[™
Ë›X\

ÞJHOˆÊŠJJ_HÙˆ[K[ˆ]Ü™\‹‰ÜÝ[XÂŸB‹ËÈH]šY[˜ÙK\ÈY\ÜÞH\È]\ÎˆHÝ]H˜Z\Ù\È]ÈØ]ÚÚ[ˆ[™Ù\ˆÛÛY\È™X\‹ÛÈHÛÜÙHØ]ÚØ[ˆX\šÈHÝ]B‹ËÈ[™XYH[ˆ[™Ù\ˆ\È]XÚ\ÈÛ™HÙ\ØY™KˆXXÚÝ]H\Èš[YÚ]ÝÈ]XÚÙˆ]ÈY™H]ÈØ]ÚØ\È˜Z\ÙY[ˆ[\›B‹ËÈ
[ˆ[Y\™Ù[˜ÞKHÙX[Hœ˜XÙKHÚ\ÛÛˆ[
NÈ[[\™H\™H[›ÝYÚÙˆÜÙKH˜\œÈ[Û™H\™H™XY‚™[˜Ý[ÛˆØ]ÚY\ÜÞJŠHÂˆÛÛœÝHHÈŽˆŽˆKÈHÈŽˆŽˆNÂˆ›Üˆ
ÛÛœÝˆÙˆÒ“ÓŠH›Üˆ
ÛÛœÝÙˆ‹›˜]È×JHÈYˆ
ÜˆOH[
HÛÛ[YNÈÛÛœÝÈHÜˆHŒMHÈHˆÎÈË›ŠÊÎÈYˆ
›Ý]OOH	ÙYY	È	‰ˆ‹›Ý]OOH	ÚX]	ÊHËŠÊÎÈBˆÛÛœÝÈHÈOˆX]œ›Ý[™
L
ˆËˆÈË›ŠH
È	ÉIÎÂˆÛÛœÝÚHH	ÐHÝ]H˜Z\Ù\È]ÈØ]ÚÚ[ˆ[™Ù\ˆÛÛY\È™X\‹ÛÈHÛÜÙHØ]ÚX\šÜÈHÝ]H[™XYH[ˆ[™Ù\ˆ\ÈÙ[\ÈÛ™H]ÙY\ÈØY™Nˆ\ÙH˜\œÈØ[››Ý[HØ]Ú]Ø]™YHÝ]Hœ›ÛHÛ™H˜Z\ÙYÛÈ]K‰ÎÂˆYˆ
K›ˆHˆ	‰ˆË›ˆHŠH™]\›ˆÙˆH	ØK›ŸHÝ]\È\™HÚÜÙHØ]ÚØ\È˜Z\ÙY[ˆ[\›H›ÜˆHÚ^Üˆ[Ü™HÙˆZ\ˆ]™\ËH›ÚYÛÚÈ	ÜÊJ_NÈÙˆH	ØË›ŸHÚÜÙHØ]ÚÙ[ÛHÜˆ™]™\ˆØ\Ë	ÜÊÊ_Kˆ	ÝÚ_XÂˆÛÛœÝÈH
ËJHOˆÈÛÛœÝÛH‹œÛXÙJËH
ÈJKˆHÛœ™YXÙJ
KŠHOˆH
È‹›‹
NÈ™]\›ˆÈ‹ŽˆˆÈÛœ™YXÙJ
KŠHOˆH
È‹›ÚY
HÈˆˆNÈNÂˆÛÛœÝÈHÊJKHHÊJNÂˆYˆ
Ë›ˆHH	‰ˆK›ˆHH	‰ˆKˆHËˆHŒŠH™]\›ˆ\™HHÝ]\È]Ø]ÚY\™\ÝÙ\™HÜÝÈH›ÚY	ÚKˆˆËˆ
ÈŒˆÈ	Û[Ü™HÙ[ˆ[‰Èˆ	ØX›Ý]\ÈÙ[ˆ\ÉßHÜÙH]Ø]ÚYX\Ýˆ	ÝÚ_XÂˆ™]\›ˆÚNÂŸB™[˜Ý[ÛˆXZÙT™\Ü
ŒJHÂˆÛÛœÝHÑ‘Ë™XØYKŒHŒHH
ÈKÜÈHÒ“Ó‹™š[\ŠˆOˆ‹›ˆHŒ	‰ˆ‹›ˆHŒJKœÛÜ

KŠHOˆK›ˆH‹›ŠNÂˆÛÛœÝ™]ˆH‘TÔ•Ë™š[\ŠˆOˆ‹›ŒHŒ
KœÜ

H[ÂˆÛÛœÝÛHÈOˆÜË™š[\ŠÊK›[™ÝÂˆÛÛœÝˆHÈŒŒK]ˆØØ[Ý[\

KÛÝ[ˆÜË›[™ÝˆÛÜ›ÎˆÜË›X\
ˆOˆ
ÈŽˆ‹›‹Ý]ˆ‹›Ý]ÙX[YˆH\‹œÙX[YÛÛˆ‹˜ÛÛÝYÎˆ‹œÝYËœ˜XÎˆ‹™œ˜XË˜]ÜÎˆ‹™˜]ÜËÎˆ‹™Ëˆ‹XÙNˆ‹šXÙK\X[ˆ‹œ\X[\ˆÚ›Û”\
ŠKˆÚYÎˆ‹œÚYÈ[[YÎˆÒÕÖÜ‹›—HÈÒÕÖÜ‹›—KœÜ˜Èˆ[ˆÒÕÖÜ‹›—HÈÒÕÖÜ‹›—K™ˆ[JJKˆÛÛŽˆÛ
ˆOˆ‹›Ý]OOH	ÜÝ\š]™Y	È	‰ˆXÚ›Û”\
ŠJK\ˆÛ
Ú›Û”\
KÛÛˆÛ
ˆOˆ‹˜ÛÛ	‰ˆXÚ›Û”\
ŠJK›XÚÎˆÛ
ˆOˆ‹›Ý]OOH	Ø›XÚÉÊKX]ˆÛ
ˆOˆ‹›Ý]OOH	ÚX]	ÊKÙX[YˆÛ
ˆOˆ‹œÙX[Y	‰ˆXÚ›Û”\
ŠJKXØÛÜ™ÎˆÛ
ˆOˆ‹˜XØÛÜ™
KÝYÎˆÛ
ˆOˆ‹œÝYÊKÙ\ˆÛ
ˆOˆ‹›Ý]OOH	ÚÙ\	ÊKˆÝÜYˆÛ
ˆOˆ‹›Ý]OOH	ÜÝ[Y	È	‰ˆ\‹œÝYÊKœ˜XÎˆYX[ŠÜË›X\
ˆOˆ‹™œ˜XÊJH˜]ÜÎˆX]œ›Ý[™
YX[ŠÜË›X\
ˆOˆ‹™˜]ÜÊJH
KÎˆÜËœÛÛYJˆOˆ‹™ÈOH[
HÈX]œ›Ý[™
YX[ŠÜË™š[\ŠˆOˆ‹™ÈOH[
K›X\
ˆOˆ‹™ÊJH
Hˆ[ˆˆÜËœ™YXÙJ
KŠHOˆH
È
‹
K
KZÙ[Ý™\œÎˆÜËœ™YXÙJ
KŠHOˆH
È‹›˜]Ë™š[\ŠOˆ›Ý]OOH	ÝZÙ[‰ÊK›[™Ý
Kˆ›ÙÝY\ÎˆÛ
ˆOˆ‹›˜]ËœÛÛYJOˆšÚ[™OOH	Ü›ÙÝYIÊJKXÙUÚ[ŽˆYX[ŠÜË™š[\ŠˆOˆ‹›Ý]OOH	ÜÝ\š]™Y	È	‰ˆXÚ›Û”\
ŠJK›X\
ˆOˆ‹šXÙJJK›ÛˆÜË›[™ÝÈÜÖÝÜË›[™ÝHWK˜›ÛˆNÂˆÛÛœÝØÈHßNÈ›Üˆ
ÛÛœÝˆÙˆÜÊHYˆ
‹›Ý]OOH	Ø›XÚÉÊH›Üˆ
ÛÛœÝÈÙˆ‹šÚ[\œÊHØÖÚ×HH
ØÖÚ×H
H
ÈNÂˆ‹šÚ[\œÈHØš™XÝ™[šY\ÊØÊKœÛÜ

KŠHOˆ–ÌWHHVÌWJKœÛXÙJJNÂˆ‹›X\›™YHË‹‹›™]ÈÙ]
ÜË™›]X\
ˆOˆ‹›X\›™Y
JWKœÛXÙJJNÂˆÛÛœÝÈHßNÈ›Üˆ
ÛÛœÝˆÙˆÜÊH›Üˆ
ÛÛœÝYÙˆ‹›Y×JHÖÚYHH
ÖÚYH
H
ÈNÂˆ‹›Y[ÜÝHØš™XÝ™[šY\ÊÊKœÛÜ

KŠHOˆ–ÌWHHVÌWJKœÛXÙJ
K›X\

ÚY×JHOˆÐ–WÒQÚYHÈ–WÒQÚYK›˜[YHˆY×JNÂˆ‹š[H[[™\ÊÜÊNÂˆÛÛœÝ˜[Y\ÈHË‹‹›™]ÈÙ]
ÜË™›]X\
ˆOˆ‹›˜]Ë›X\
Oˆ›˜[YJJJWKœÛÜ

KŠHOˆUSÓ—ÓSQTËš[™^ÙŠJHHUSÓ—ÓSQTËš[™^ÙŠŠJNÂˆ‹›Z[™ÈH˜[Y\Ë›X\
›HOˆÈÛÛœÝœÈHÜË›X\
ˆOˆÈÛÛœÝH‹›˜]Ë™š[™
HOˆK›˜[YHOOH›JNÈ™]\›ˆ	‰ˆ™ˆOH[È™ˆˆ[ÈJNÂˆÛÛœÝHHRS‘È	‰ˆRS‘Ë›Z[™ÖÛ›WK\ÝÈHH	‰ˆKšX[Ë›[™ÝÈKšX[ÖÛKšX[Ë›[™ÝHWK™Èˆ[X[ÈHH	‰ˆ
K›]H\ÝÊHÈ
K›]H\ÝÊKœÛXÙJJK›X\
ˆOˆX]œ›Ý[™
ŠJHˆ[HH™]ˆ	‰ˆ™]‹›Z[™Ë™š[™
Oˆ›˜[YHOOH›JNÂˆ™]\›ˆÈ˜[YNˆ›KœËYX[ŽˆYX[ŠœË™š[\ŠˆOˆˆOH[
JK™]“YX[ŽˆHÈK›YX[ˆˆ[X[Ë™]‘X[ÎˆHÈK™X[Èˆ[NÈJNÂˆ‹œÝ\ˆH


HOˆÈÛÛœÝ[HÒ“Ó‹™š[\ŠˆOˆ‹›ˆHŒH	‰ˆ‹›˜]È	‰ˆ‹›˜]Ë›[™Ý
KœÛÜ

KŠHOˆK›ˆH‹›ŠNÈYˆ
[›[™ÝŠH™]\›ˆ[ÈËÈÝ]\È[]™H]XXÚÛÜ›	ÜÈ[™]™\žHÛÜ›ÛÈ˜\ˆ
][ÜÝÚ^HÚ[ÊBˆÛÛœÝÈHX]›X^
KX]˜ÙZ[
[›[™ÝÈŒ
JKˆH×NÂˆ›Üˆ
]HHÈH[›[™ÝÈH
ÏHÊH‹œ\Ú
X]œ›Ý[™
L
ˆYX[Š[œÛXÙJKH
ÈÊK›X\
ˆOˆ‹›˜]Ë™š[\ŠOˆ›Ý]OOH	Û]™Y	ÊK›[™ÝÈ‹›˜]Ë›[™Ý
JJJNÂˆÛÛœÝLH[™š[™[™^
ˆOˆ‹›ˆHŒ
NÈ™]\›ˆÈNˆ[ÌK›‹Žˆ[Ø[›[™ÝHWK›‹Ë‹]ˆLÈ‹›[™ÝˆX]™›ÛÜŠLÈÊHNÈJJ
NÂˆÈÛÛœÝˆHØ]Úš[™[™ÜÊŒJNÈYˆ
‹›ˆHLŠHÈ‹Ø]ÚH‹›X\
ˆOˆØ‹›‹‹‹•ÐUÒÐÓË›X\
ÈOˆ–Ú×JWJNÈ‹Ø]Úœ›ÛHH‹™œ›ÛNÈHHËÈ
]™\žHÛÜ›ÛÈ˜\‹›ÝÛ›H\ÙH[ŠBˆ‹™\™XÝH™\™XÝÙŠ‹™]ŠNÂˆ‘TÔ•ÈH‘TÔ•Ë™š[\ŠˆOˆ‹›ŒHOOHŒJNÈ‘TÔ•Ëœ\Ú
ŠNÈYˆ
‘TÔ•Ë›[™ÝˆLŒ
H‘TÔ•ÈH‘TÔ•ËœÛXÙJLLŒ
NÂˆ‘TÔ•Ë™›Ü‘XXÚ

‹JHOˆÈYˆ
H‘TÔ•Ë›[™ÝHÌ
H
‹ÛÜ›È×JK™›Ü‘XXÚ
ÈOˆÈ[]HËœÚYÎÈJNÈJNÈËÈ
H™]Ù\Ý\HÙY\Z\ˆÛÜ›ÉÈÚYÚ[È\™NÈH\˜Ú]™HÙY\È]™\žHÛ™JBˆØ]™T™\ÜÊ
NÂˆ™]\›ˆŽÂŸB‹ËÈÚ][[ˆ\ÙHÛÜ›ÎˆH™\Ü	ÜÈ[œÝÙ\ˆÈÚ]Ú\ÛÛ™Yˆ[ÜÝ[[™Èš\œÝ‚™[˜Ý[Ûˆ[[™\ÊÜÊHÂˆÛÛœÝHÜË™š[\ŠˆOˆ‹šÛ
KÝ]H×NÈYˆ
R›[™Ý
H™]\›ˆÝ]ÂˆÛÛœÝÈHÈOˆ
ÈOOHHÈ	ÛÛ™IÈˆ
•SUÖÚ×HÝš[™ÊÊJKÓÝÙ\Ø\ÙJ
JKÝ[HHˆOˆœ™YXÙJ
KŠHOˆH
È
Š‹šÛ
H
K
NÂˆÛÛœÝÙX[YH™š[\ŠˆOˆ‹œÙX[Y
K›[™ÝÈYˆ
ÙX[Y
HÝ]œ\Ú
HXØÛÜ™ÙX[Y	ÛÊÙX[Y
_H	ÜÙX[YOOHHÈ	ÝÛÜ›	Èˆ	ÝÛÜ›ÉßX
NÂˆÛÛœÝšH™š[\ŠˆOˆ‹šÛ˜˜[ˆ	‰ˆ\‹œÙX[Y
K›[™ÝÈYˆ
š
HÝ]œ\Ú
HXØÛÜ™8 &\È˜[ˆ[[ˆ	ÛÊš
_H	ØšOOHHÈ	ÝÛÜ›	Èˆ	ÝÛÜ›ÉßX
NÂˆÛÛœÝˆH™›]X\
ˆOˆ‹šÛ˜ˆ×JKHH‹™š[\ŠOˆÌHHÊKÈH‹™š[\ŠOˆÌHÊKÝHOˆ™š[\ŠOˆÌ—JK›[™ÝÂˆYˆ
‹›[™Ý
HÝ]œ\Ú
	Ð›Ü™\œÈ[ˆ	È
ÈÚK›[™ÝÈ	ÜÝ
J_KÉÚK›[™ÝH]Ø]ÚÊØˆ	ÉËË›[™ÝÈ	ÜÝ
Ê_KÉÛË›[™ÝH™[ÝØˆ	É×K™š[\Š›ÛÛX[ŠKš›Ú[Š	Ë	ÊJNÂˆÛÛœÝÙ\H™š[\ŠˆOˆ‹šÛ™ÝX\™	‰ˆ‹›Ý]OOH	Ø›XÚÉÊK›[™ÝÈYˆ
Ù\
HÝ]œ\Ú
HÛÜÙHØ]ÚÙ\	ÛÊÙ\
_H	ÚÙ\OOHHÈ	ÝÛÜ›	Èˆ	ÝÛÜ›ÉßHœ›ÛHH›ÚY
NÂˆÛÛœÝÈHÝ[JOˆ˜Ø]YÚ
NÈYˆ
ÊHÝ]œ\Ú
Ø]YÚžH	ØÈOOHHÈ	Ú]ÉÈˆ	ÝZ\‰ßHÝÛˆØ]Úˆ	ØßX
NÂˆÛÛœÝØ\H™š[\ŠˆOˆ‹šÛ˜Ø\
K›[™ÝÈYˆ
Ø\
HÝ]œ\Ú
HXØÛÜ™8 &\ÈØ\ÛÛÛY	ÛÊØ\
_H	ØØ\OOHHÈ	ÝÛÜ›	Èˆ	ÝÛÜ›ÉßX
NÂˆÛÛœÝÈHÝ[JOˆ
ÛÜ›ˆÈÛÜ›‹˜Û[\
ÈÛÜ›‹Ø]Ú
ÈÛÜ›‹œÝXˆˆ
JKÈHÝ[JOˆ›Ý]
NÂˆYˆ
ÊHÝ]œ\Ú
Û[\Ø]ÚÝXš[\Ù\œÈ[	ÝßHÛÜ›ˆ	ÝÈOOHHÈ	Û]ÉÈˆ	Û]ÜÉßIÛÈÈÈ	ÛßHœ›ÚÙHÝ]ˆ	ÉßX
NÂˆ™]\›ˆÝ]ÂŸB™[˜Ý[Ûˆ™\™XÝÙŠ‹
HÂˆÛÛœÝÛÛˆH‹ÛÛˆÈ	Ô‹ÛÛˆOOH‹˜ÛÝ[È	Ñ]™\žHÛÜ›	Èˆ‹ÛÛˆOOHHÈ	ÓÛ™HÛÜ›	Èˆ•SUÖÔ‹ÛÛ—H
È	ÈÛÜ›ÉßHÛÛ‰Ô‹˜ÛÛÈ	Ô‹˜ÛÛOOH‹ÛÛˆÈ
‹ÛÛˆOOHHÈ	Ùœ›Þ™[‰Èˆ	Ø[œ›Þ™[‰ÊHˆ•SUÖÔ‹˜ÛÛKÓÝÙ\Ø\ÙJ
H
È	ÈÙˆ[Hœ›Þ™[‰ßXˆ	ÉßXˆ	Ó›ÈÛÜ›ÛÛ‰ÎÂˆÛÛœÝÜÝH‹˜›XÚÈÈ	Ô‹˜›XÚÈOOHHÈ	ÛÛ™IÈˆ•SUÖÔ‹˜›XÚ×KÓÝÙ\Ø\ÙJ
_H[™Y[ˆ˜S˜ˆ	Û›Û™H[™Y[ˆ˜S‰ÎÂˆ]ÈH	ÝÛÛŸIÔ‹œ\ÈÈ	Ô‹œ\OOHHÈ	ÛÛ™IÈˆ•SUÖÔ‹œ\KÓÝÙ\Ø\ÙJ
_HÝ\š]™Y[ˆ\ˆ	ÉßNÈ	ÛÜÝIÔ‹šX]ÈÈ	Ô‹šX]OOHHÈ	ÛÛ™IÈˆ•SUÖÔ‹šX]KÓÝÙ\Ø\ÙJ
_HÛÜ™HÝ]ˆ	ÉßK˜ÂˆYˆ
‹œÙX[Y
HÈ
ÏH	Ô‹œÙX[YOOHHÈ	ÓÛ™IÈˆ•SUÖÔ‹œÙX[Y_HÛÛˆÙX[Y[™\ˆ[ˆXØÛÜ™˜ÂˆYˆ

HÂˆÛÛœÝH‹ÛÛˆHÛÛ‹ˆH‹˜›XÚÈH˜›XÚË\ÈH×NÂˆYˆ
œ\OH[
H\Ëœ\Ú
ˆÈ[Ü™HÚ[œÈ[ˆH[ˆ™Y›Ü™H
	Ô‹ÛÛŸHYØZ[œÝ	ÔÛÛŸJXˆÈ™]Ù\ˆÚ[œÈ[ˆH[ˆ™Y›Ü™H
	Ô‹ÛÛŸHYØZ[œÝ	ÔÛÛŸJXˆ\ÈX[žHÚ[œÈ\ÈH[ˆ™Y›Ü™X
NÈËÈ
H™\Ü™Y›Ü™HŒLHÛÝ[YÝ\š]›ÜœÈ\ÈÚ[œÊBˆYˆ
ŠH\Ëœ\Ú
ˆÈ	Ù™]Ù\ˆÜÝÈ˜S‰Èˆ	Û[Ü™HÜÝÈ˜S‰ÊNÂˆYˆ
‹šXÙUÚ[ˆOH[	‰ˆšXÙUÚ[ˆOH[	‰ˆX]˜XœÊ‹šXÙUÚ[ˆHšXÙUÚ[ŠHˆŒÊH\Ëœ\Ú
‹šXÙUÚ[ˆšXÙUÚ[ˆÈ	Ø[™HÚ[œÈ\™H\ÜÈœ›Þ™[‰Èˆ	Ø[™HÚ[œÈ\™HXÚY\‰ÊNÂˆYˆ
\Ë›[™Ý
HÈ
ÏH	È	È
È\Ëš›Ú[Š	Ë	ÊKœ™\XÙJ×˜[™Ë	ÉÊKœ™\XÙJ×‹‹ËÈOˆËÕ\\Ø\ÙJ
JH
È	Ë‰ÎÂˆH[ÙHÈ
ÏH‹ÛÛˆÈ	ÈHZ[™È\™HÝ[[ÜÝHÝY\ÜÚ[™Ë[™ÛÛYHÝY\ÜÙ\È[™XYHÛÜšË‰Èˆ	ÈHZ[™È\™HÝ[ÝY\ÜÚ[™ÎÈ]™\žH[™[™ÈXXÚ\È[K‰ÎÂˆÛÛœÝ™\ÝH‹›Z[™Ë™š[\ŠHOˆK›YX[ˆOH[
KœÛÜ

KŠHOˆ‹›YX[ˆHK›YX[ŠVÌNÂˆYˆ
™\Ý
HÈ
ÏH	Ø™\Ý›˜[Y_x &\ÈZ[™Y™\Ý˜Âˆ™]\›ˆÎÂŸB˜ÛÛœÝ•SUÈHÉÓ›Û™IË	ÓÛ™IË	ÕÛÉË	Õ™YIË	Ñ›Ý\‰Ë	Ñš]™IË	ÔÚ^	Ë	ÔÙ]™[‰Ë	ÑZYÚ	Ë	Óš[™IË	Õ[‰Ë	Ñ[]™[‰Ë	ÕÙ[™I×NÂ˜ÛÛœÝÕUSQHHˆOˆ‹›Ý]OOH	ÜÝ\š]™Y	ÈÈ
‹œ\È	ÜÛÛYHÝ\š]™Y	Èˆ‹œÙX[YÈ	ÝÛÛ‹ÙX[Y	Èˆ‹˜ÛÛÈ	ÝÛÛ‹œ›Þ™[‰Èˆ	ÝÛÛ‰ÊHˆ‹›Ý]OOH	Ø›XÚÉÈÈ	Ó˜S‰Èˆ‹›Ý]OOH	ÚX]	ÈÈ	ÝÛÜ›ˆÝ]	Èˆ‹œÝYÈÈ	ÜÝYÛ˜]Y	Èˆ‹›Ý]OOH	ÚÙ\	ÈÈ	ÚÙ\	Èˆ	ÜÝÜY	ÎÂ˜ÛÛœÝÙÛˆHˆOˆ
ˆHÈ	ÊÉÈˆ	ø¢$‰ÊH
ÈX]˜XœÊŠKÑš^Y
ŠNÂ™[˜Ý[Ûˆ™\Ü[
‹\˜Ú]™JHÂˆÛÛœÝ[\ÈH‹ÛÜ›Ë›X\

ËÊHOˆ]ˆÛ\ÜÏH[HˆÝ[OH‹KY‰Ê
ÈÈ
ˆJKÑš^Y
Š_\È]ˆÛ\ÜÏHœÜH	ÝË›Ý]IÝË˜ÛÛÈ	ÈÛÛ	Èˆ	ÉßIÝËœ\È	È\	Èˆ	ÉßIÝËœÝYÈÈ	ÈÝYÉÈˆ	ÉßIÝËš[YÈÈ	ÈXÉÈˆ	ÉßH‰ÝËš[YÂˆÈ[YÈÜ˜ÏH‰ÝËš[YßHˆ[H•ÛÜ›	ÜYŠË›Š_IÝË›Ý]OOH	Ø›XÚÉÈÈ	Ë™Y›Ü™HH›ÚY	Èˆ	ÉßHOÝO‰ÝË›Ý]OOH	Ø›XÚÉÈÈ[O‰ÝË™OH[È	ø¢$‰È
ÈX]œ›Ý[™
Ë™
H
È	ÈÉÈˆ	Ø™Y›Ü™IßOÙ[O˜ˆ	ÉßXˆˆ
Ë›Ý]OOH	ÜÝ\š]™Y	ÈÈHÝ[OHšZYÚ‰ÓX]œ›Ý[™
Ë™œ˜XÈ
ˆL
_IHÚO˜ˆ	ÉÊ_OÙ]‰ÜYŠË›Š_OØÜ[‰ÓÕUSQJÊ_OÜÜ[Ü[‰ÝË›Ý]OOH	ÜÝ\š]™Y	ÈÈ
Ë™ÈOH[È	ÓX]œ›Ý[™
Ë™Ê_H˜]ÜÈXXÚˆ	ÝË™˜]ÜßH˜]ÜØ
Hˆ	ÓX]œ›Ý[™
Ë™œ˜XÈ
ˆL
_IH[™[YOÜÜ[Ù]˜
Kš›Ú[Š	ÉÊNÂˆÛÛœÝ[HH
‹
HOˆ]ˆÛ\ÜÏH›[H‰ÝŸOØÜ[‰ÛOÜÜ[Ù]˜ÂˆÛÛœÝZ[™ÈH‹›Z[™Ë›X\
HOˆÈÛÛœÝHHUSÓ—ÓSQTËš[™^ÙŠK›˜[YJKÈH™Ø“ÙŠJNÂˆÛÛœÝÈHK™œË›X\

‹ÊHOˆˆOH[È	ÉÈˆÚ\˜ÛHÞH‰Êˆ
ÈÈ
ˆLÊKÑš^Y
J_HˆÞOH‰ÊMˆHX]›X^
LKX]›Z[ŠKŠJH
ˆLÊKÑš^Y
J_HˆHŒ‹ŒÈˆÝ[OH™š[œ™ØŠ	ØßJH‹Ï˜
Kš›Ú[Š	ÉÊNÂˆÛÛœÝHOˆÈRÑVTË›X\

ËŠHOˆOˆÝ[OHšZYÚ‰ÙÚ—H
ˆŒINØ˜XÚÙÜ›Ý[™‰ÓPÓÓÚ×_HØÚO˜
Kš›Ú[Š	ÉÊHˆ	ÉÎÂˆÛÛœÝ[HHK›YX[ˆOH[	‰ˆKœ™]“YX[ˆOH[È[HÛ\ÜÏH‰ÛK›YX[ˆHKœ™]“YX[ˆÈ	Ý\	Èˆ	ÙÝÛ‰ßH‰ÜÙÛŠK›YX[ˆHKœ™]“YX[Š_OÙ[O˜ˆ	ÉÎÂˆ™]\›ˆ]ˆÛ\ÜÏH›\›ÝÈÜ[ˆÛ\ÜÏH››HHÝ[OH˜˜XÚÙÜ›Ý[™œ™ØŠ	ØßJHÚO‰Ù\ØÊK›˜[YJ_OÜÜ[Ý™ÈšY]Ð›ÞHŒ	Íˆ
È‹ÛÜ›Ë›[™Ý
ˆLßHÌˆˆÚYH‰Íˆ
È‹ÛÜ›Ë›[™Ý
ˆLßHˆZYÚHŒˆˆ\šXKZY[HYH[™HOHŒˆLOHŒMˆˆH‰Íˆ
È‹ÛÜ›Ë›[™Ý
ˆLßHˆLHŒMˆ‹Ï‰ÜßOÜÝ™ÏÜ[ˆÛ\ÜÏH›YX[ˆ‰ÛK›YX[ˆOH[ÈÙÛŠK›YX[ŠHˆ	ø %	ßH	Ù[_OÜÜ[Ü[ˆÛ\ÜÏH™‰Ù
K™X[Ê_OÜÜ[Ü[ˆÛ\ÜÏH™Ø\È‰ÛKœ™]‘X[ÈÈ
Kœ™]‘X[ÊHˆ	ÉßOÜÜ[Ù]˜ÈJKš›Ú[Š	ÉÊNÂˆÛÛœÝÚ[\œÈH‹šÚ[\œË›[™ÝÈ‹šÚ[\œË›X\

ÚË×JHOˆO‰Ù\ØÊÊ_OØˆÜ[š[ˆ	ØßH	ØÈOOHHÈ	ÙX]	Èˆ	ÙX]ÉßOÜÜ[ÛO˜
Kš›Ú[Š	ÉÊHˆOÜ[‰Ô‹˜›XÚÈÈ	Ó›ÈÛÛXš[˜][ÛˆØ\È˜[YY‰Èˆ	Ó›ÈÛÜ›[™Y[ˆ˜S‹‰ßOÜÜ[ÛO˜ÂˆÛÛœÝX\›™YH‹›X\›™Y›[™ÝÈÛ\ÜÏH››ˆ“X\›™Y\ÈÚ\ÛÛŽˆ	Ô‹›X\›™Y›X\
Oˆ‰Ù\ØÊ
_OØ˜
Kš›Ú[Š	ÎÈ	Ê_KÜ˜ˆ	ÉÎÂˆÛÛœÝYH‹›Y[ÜÝ›[™ÝÈÛ\ÜÏH››ˆ“[ÜÝÙ[ˆYÝ]ÙˆH\›Žˆ	Ô‹›Y[ÜÝ›X\

Û›K×JHOˆ	Ù\ØÊ›J_H
	ØßJX
Kš›Ú[Š	Ë	Ê_KÜ˜ˆ	ÉÎÂˆ™]\›ˆ]ˆÛ\ÜÏHœœ	Ø\˜Ú]™HÈ	È[	Èˆ	ÉßH‚ˆ]ˆÛ\ÜÏHœÙXÈˆ]KX]HŒ]ˆÛ\ÜÏHšÈ”™\Ü0­ÈY\ˆÛÜ›	ÜYŠ‹›ŒJ_OÙ]•ÛÜ›È	ÜYŠ‹›Œ
_x $ÉÜYŠ‹›ŒJ_OÚ‚ˆ]ˆÛ\ÜÏHœÝXˆ‰Û[\ÜÊ‹
_HÙˆÛÜ›[YH[ˆ[0­È	Ô‹ZÙ[Ý™\œßH	Ô‹ZÙ[Ý™\œÈOOHHÈ	Û˜][Û‰Èˆ	Û˜][ÛœÉßHZÙ[ˆÝ™\ˆ0­È	Ô‹œ›ÙÝY\ßHÚ]H›ÙÝYHÝ]IÔ‹˜›ÛÈ0­È›Û\ˆ0åÉÔ‹˜›ÛXˆ	ÉßOÙ]Ù]‚ˆ]ˆÛ\ÜÏHœÙXÈˆ]KX]HŒŒˆ]ˆÛ\ÜÏH[\ÈˆÝ[OH™ÜšY][\]KXÛÛ[[œÎœ™\X]
	ÓX]›X^
K‹ÛÜ›Ë›[™Ý
_KZ[›X^
Lœ
JH‰Ý[\ßOÙ]Ù]‚ˆ]ˆÛ\ÜÏHœÙXÈ[\Èˆ]KX]HKH‰Û[J‹ÛÛ‹‹˜ÛÛÈÛÛˆ0­È	Ô‹˜ÛÛHœ›Þ™[˜ˆ	ÝÛÛ‰Ê_IÔ‹œ\È[J‹œ\	ÜÝ\š]™Y[ˆ\	ÊHˆ	ÉßIÔ‹šX]È[J‹˜›XÚÈ
È‹šX][™Y0­È	Ô‹šX]HÛÜ›ˆÝ]
Hˆ[J‹˜›XÚË	Ù[™Y[ˆ˜S‰Ê_IÛ[J‹œÝÜY
È‹œÝYÈ
È‹šÙ\‹œÝYÈÈÝÜY0­È	Ô‹œÝYßHÝYÛ˜[ˆ	ÜÝÜYÚÜ	Ê_IÛ[JX]œ›Ý[™
‹™œ˜XÈ
ˆL
H
È	ÉIË	ÛÙˆH\›ˆ˜]Û‹Ûˆ]™\˜YÙIÊ_IÛ[J‹™˜]ÜË	Ù˜]ÜÈHÛÜ›	Ê_OÙ]‚ˆ]ˆÛ\ÜÏHœÙXÈˆ]KX]HŒLH]ˆÛ\ÜÏHšÈ•HZ[™È0­ÈØÛÜ™HXXÚÛÜ›0­È\È[ˆYØZ[œÝH\Ý0­È™\ÝX[È›ÝÈÜ[ˆÛ\ÜÏHØ\ËZÈ˜[™™Y›Ü™OÜÜ[Ù]]ˆÛ\ÜÏH›Z[™È‰ÛZ[™ßOÙ]Ù]‚ˆ]ˆÛ\ÜÏHœÙXÈÛÈˆ]KX]HŒN]]ˆÛ\ÜÏHšÈ•Ú]Ú[YÙ][Û\ÜÏHšÚ[‰ÚÚ[\œßOÝ[Ù]]‰ÛX\›™YIÛYOÙ]Ù]‚ˆ]ˆÛ\ÜÏHœÙXÈˆ]KX]HŒŒËHÛ\ÜÏH™\™XÝ‰Ù\ØÊ‹™\™XÝ
_OÜÙ]‚ˆ	Ø\˜Ú]™HÈ]ÛˆÛ\ÜÏH˜ÛÜÙHˆ\OH˜]ÛˆÛÜÙOØ]Û˜ˆ	ÉßBˆÙ]]ˆÛ\ÜÏH˜\ˆÙ]˜ÂŸB›]‘TH[Â‹ËÈH™\ÜÛˆ[ˆÛÜ›È\ÈZ\ˆš[œ›ÝYÚ[ˆ\žH\Ú[H]\ÈÚÝÛˆ
[™š[Y\È]\ÈÚÝÛŠKˆÛˆHÚYB‹ËÈØÜ™Y[ˆ]\ÈZYÝ]ÚYKÈš[]ÈÛˆH[Û™K[ˆ]\ÈØ]™Y\È]\ÈÚÝÛ‹‚™[˜Ý[ÛˆÚš[šÕÊ[K
HÈYˆ
Z[HZ[KÚY
H™]\›ˆ[NÈÛÛœÝÈHX]›Z[ŠKÈX]›X^
[KÚY[KšZYÚ
JNÈYˆ
ÈHJH™]\›ˆ[NÂˆÛÛœÝÈHØÝ[Y[˜Ü™X]Q[[Y[
	ØØ[˜\ÉÊNÈËÚYHX]›X^
KX]œ›Ý[™
[KÚY
ˆÊJNÈËšZYÚHX]›X^
KX]œ›Ý[™
[KšZYÚ
ˆÊJNÈÛÛœÝHË™Ù]ÛÛ^
	Ì™	ÊNÈš[XYÙTÛ[ÛÝ[™Ô]X[]HH	ÚYÚ	ÎÈ™˜]Ò[XYÙJ[KËÚYËšZYÚ
NÈ™]\›ˆÎÈB™[˜Ý[ÛˆÚÝÔ™\Ü
‹]™JHÂˆÕQÑKœ™\Ü
YJNÂˆÛÛœÝ›ÞHØÝ[Y[™Ù][[Y[žRY
	Ü™\Ü	ÊNÈYˆ
X›ÞTŠH™]\›ŽÂˆ›Þš[›™\’SH]ˆÛ\ÜÏHØ[˜\ÈÛ\ÜÏHœš[ˆ›ÛOHš[YÈˆ\šXK[X™[H”™\ÜÛˆÛÜ›È	ÜYŠ‹›Œ
_HÈ	ÜYŠ‹›ŒJ_Kˆ	Ù\ØÊ‹™\™XÝ	ÉÊ_HØØ[˜\Ï]ˆÛ\ÜÏH˜XÝÈ]Ûˆ\OH˜]ÛˆˆÛ\ÜÏHœˆˆ]KXOHšÙY\ˆ\šXK\™\ÜÙYH™˜[ÙH’ÙY\Ø]Û]Ûˆ\OH˜]ÛˆˆÛ\ÜÏHœˆˆ]KXOHœØ]™H”Ø]™H‘ÏØ]Û]Ûˆ\OH˜]ÛˆˆÛ\ÜÏHœˆˆ]KXOH›Ü[ˆ\˜Ú]™OØ]Û‰Û]™HÈ	ÉÈˆ	Ï]Ûˆ\OH˜]ÛˆˆÛ\ÜÏHœˆÛÜÙHˆ]KXOH˜ÛÜÙHÛÜÙOØ]Û‰ßOÜ[ˆÛ\ÜÏH›\ÙÈˆ\šXK[]™OHœÛ]HÜÜ[Ù]Ù]]ˆÛ\ÜÏH˜\ˆÙ]˜Âˆ›ÞšY[ˆH˜[ÙNÈ›Þ˜Û\ÜÓ\ÝÙÙÛJ	Ø\˜Ú]™IË[]™JNÈØÝ[Y[˜›ÙK˜Û\ÜÓ\Ý˜Y
	Ü™\Ü[™ÉÊNÈ›ÞœØÜ›ÛÜHÂˆ™\]Y\Ý[š[X][Û‘œ˜[YJ

HOˆ›Þ˜Û\ÜÓ\Ý˜Y
	ÛÛ‰ÊJNÂˆYˆ
‘T
HÈÛX\•[Y[Ý]
‘TJNÈØ[˜Ù[[š[X][Û‘œ˜[YJ‘Tœ˜YŠNÈYˆ
‘T›Û”™\Ú^™JH™[[Ý™Q]™[\Ý[™\Š	Ü™\Ú^™IË‘T›Û”™\Ú^™JNÈBˆÛÛœÝ™\H‘THÈ]ˆ\™›Ü›X[˜ÙK››ÝÊ
K]™KNˆ[˜YŽˆš[[™Îˆ[[YÜÎˆ[‹^[Ý]ˆ	Û[™	ËÎˆMŒ[ˆ[™Îˆ[Û™Nˆ˜[ÙKÛ”™\Ú^™Nˆ[NÂˆÛÛœÝÝˆH›Þœ]Y\žTÙ[XÝÜŠ	ØØ[˜\Ëœš[	ÊK\ÙÈHOˆÈÛÛœÝHH›Þœ]Y\žTÙ[XÝÜŠ	Ë›\ÙÉÊNÈYˆ
JHK^ÛÛ[HÈNÂˆÛÛœÝš]H

HOˆÈÛÛœÝ]ÈH[›™\•ÚY
ˆŽMZHX]›X^
MŒ[›™\’ZYÚ
ˆŽHHMŠK[™H]ÈHZ
ˆŽMK\ˆH[™ÈKˆˆŽÂˆ]ÈH]ËHÈÈ\ŽÈYˆ
ˆZ
HÈHZÈÈH
ˆ\ŽÈBˆÝ‹œÝ[KÚYHX]œ›Ý[™
ÊH
È	Ü	ÎÈÝ‹œÝ[KšZYÚHX]œ›Ý[™

H
È	Ü	ÎÂˆ™\›^[Ý]H[™È	Û[™	Èˆ	ÜÜ	ÎÈ™\”ÈHX]œ›Ý[™
X]›Z[Š[™ÈŒŒˆMLÈ
ˆX]›Z[ŠKK]šXÙT^[˜][ÈJJJNÈNÂˆš]

NÂˆÛÛœÝ\ˆH]™HÈÑ‘Ëœ™\ÜÈ
ˆL
ˆŽˆ™XYHH‘›ÛÊ
K[Š

HOˆ[’[XYÙ\Ê‹LLŠJNÂˆÛÛœÝZ[H

HOˆÈ™\™[H˜]Õ[”š[
‹™\š[YÜË™\”ËK[™\›^[Ý]
NÈ™\˜™ÈH™\™Û™HÈ[ˆ[‘Ü›Ý[™
‹™\”Ë™\›^[Ý]
NÈNÂˆÛÛœÝœ˜[YHH

HOˆÈYˆ
‘TOOH™\\™\™[
H™]\›ŽÈÛÛœÝH\ˆÈX]›Z[ŠK
\™›Ü›X[˜ÙK››ÝÊ
HH™\˜]
HÈ\ŠHˆNÈËÈHš[\È˜]ÛˆÛ˜ÙNÈH™]™X[Û›H]È]ÙÙ]\‚ˆYˆ
HJHÈ™\™Û™HHYNÈ™\˜™ÈH[ÈÝ‹ÚYH™\™[ÚYÈÝ‹šZYÚH™\™[šZYÚÈÝ‹™Ù]ÛÛ^
	Ì™	ÊK™˜]Ò[XYÙJ™\™[
NÈ™]\›ŽÈBˆ[ÛÛ\ÜÙJÝ‹™\™[™\˜™Ë
NÈ™\œ˜YˆH™\]Y\Ý[š[X][Û‘œ˜[YJœ˜[YJNÈNÂˆÛÛœÝ][HH

HOˆ™\™š[[™È
™\™š[[™ÈH™XYK[Š[YÜÈOˆš[U[Š‹[YÜÊJJNÈËÈš[YÛ˜ÙKÝÙ]™\ˆÙ[ˆ]\È\ÚÙY›Ü‚ˆ™XYK[Š[YÜÈOˆÈYˆ
‘TOOH™\
H™]\›ŽÈ™\š[YÜÈH[YÜÎÈZ[

NÈœ˜[YJ
NÈYˆ
]™H	‰ˆ’S•›ÛŠH][J
NÈJNÂˆ™\›Û”™\Ú^™HH

HOˆÈYˆ
‘TOOH™\
H™]\›ŽÈÛÛœÝH™\›^[Ý]ÈH™\”ÎÈš]

NÈYˆ
\™\š[YÜÈ
OOH™\›^[Ý]	‰ˆX]˜XœÊÈH™\”ÊH
JH™]\›ŽÂˆZ[

NÈYˆ
™\™Û™JHÈÝ‹ÚYH™\™[ÚYÈÝ‹šZYÚH™\™[šZYÚÈÝ‹™Ù]ÛÛ^
	Ì™	ÊK™˜]Ò[XYÙJ™\™[
NÈHNÂˆY]™[\Ý[™\Š	Ü™\Ú^™IË™\›Û”™\Ú^™JNÂˆÝ‹˜Û\ÜÓ\Ý˜Y
	Þ›ÛÛXX›IÊNÈÝ‹]HH	Ñ[Ú^™IÎÈÝ‹˜Y]™[\Ý[™\Š	ØÛXÚÉË\Þ[˜È

HOˆÈYˆ
Ú[ÜÚÊ
JH™]\›ŽÈÛÛœÝ]H]ØZ]][J
NÈÜ[\˜Ú]™J]šYYJNÈJNÂˆ›Þœ]Y\žTÙ[XÝÜŠ	ÖÙ]KXOHšÙY\—IÊK˜Y]™[\Ý[™\Š	ØÛXÚÉË\Þ[˜ÈHOˆÈÛÛœÝˆHK˜Ý\œ™[\™Ù]ÈYˆ
‹™\ØX›Y
H™]\›ŽÈ‹™\ØX›YHYNÈÛÛœÝ]H]ØZ]][J
NÈ]ØZ]Ù]Ù\
]Z]šÙ\
NÈ‹™\ØX›YH˜[ÙNÂˆ‹œÙ]]šX]J	Ø\šXK\™\ÜÙY	ËÝš[™Ê]šÙ\
JNÈ‹^ÛÛ[H]šÙ\È	ÒÙ\	Èˆ	ÒÙY\	ÎÈ\ÙÊ]šÙ\È	ÒÙ\ˆ]Ý^\È[ˆH\˜Ú]™IÈˆ	Ó›ÈÛ™Ù\ˆÙ\	ÊNÈJNÂˆ›Þœ]Y\žTÙ[XÝÜŠ	ÖÙ]KXOHœØ]™H—IÊK˜Y]™[\Ý[™\Š	ØÛXÚÉË\Þ[˜È

HOˆÈ\ÙÊ	Ñ˜]Ú[™ÈHš[8 )‰ÊNÈÛÛœÝ[YÜÈH™\š[YÜÈ]ØZ]™XYKH™\›^[Ý]Âˆ\ÙÊØ]™S\ÙÊ]ØZ]Ø]™Tš[
˜]Õ[”š[
‹[YÜËOOH	Û[™	ÈÈˆMŒK[
K[™\˜X›K]ÛÜ›Ë]ÛÜ›ËIÜYŠ‹›Œ
_KIÜYŠ‹›ŒJ_Kœ™Ø
JJNÈJNÂˆ›Þœ]Y\žTÙ[XÝÜŠ	ÖÙ]KXOH›Ü[ˆ—IÊK˜Y]™[\Ý[™\Š	ØÛXÚÉË\Þ[˜È

HOˆÈÛÛœÝ]H]ØZ]][J
NÈÜ[\˜Ú]™J]šY
NÈJNÂˆYˆ
[]™JHÈÛÛœÝÈH›Þœ]Y\žTÙ[XÝÜŠ	ÖÙ]KXOH˜ÛÜÙH—IÊNÈË˜Y]™[\Ý[™\Š	ØÛXÚÉËYT™\Ü
NÈË™›ØÝ\ÊÈ™]™[ØÜ›ÛˆYHJNÈ™]\›ŽÈBˆÛÛœÝ˜\ˆH›Þœ]Y\žTÙ[XÝÜŠ	Ë˜\‰ÊNÈ˜\‹œÝ[K˜[œÚ][ÛˆHÚY	ÐÑ‘Ëœ™\Üß\È[™X\˜È™\]Y\Ý[š[X][Û‘œ˜[YJ

HOˆ™\]Y\Ý[š[X][Û‘œ˜[YJ

HOˆÈ˜\‹œÝ[KÚYH	ÌL	IÎÈJJNÂŸB™[˜Ý[ÛˆYT™\Ü

HÈÕQÑKœ™\Ü
˜[ÙJNÈÛÛœÝ›ÞHØÝ[Y[™Ù][[Y[žRY
	Ü™\Ü	ÊNÈYˆ
X›Þ
H™]\›ŽÈ›Þ˜Û\ÜÓ\Ýœ™[[Ý™J	ÛÛ‰ÊNÈØÝ[Y[˜›ÙK˜Û\ÜÓ\Ýœ™[[Ý™J	Ü™\Ü[™ÉÊNÂˆYˆ
‘T
HÈØ[˜Ù[[š[X][Û‘œ˜[YJ‘Tœ˜YŠNÈYˆ
‘T›Û”™\Ú^™JH™[[Ý™Q]™[\Ý[™\Š	Ü™\Ú^™IË‘T›Û”™\Ú^™JNÈBˆYˆ
‘T	‰ˆT‘T›]™JHÈ›ÞšY[ˆHYNÈ›Þš[›™\’SH	ÉÎÈ‘TH[È™]\›ŽÈHËÈH™\ÜÜ[™Yœ›ÛHH\˜Ú]™H\ÝÛÜÙ\ÂˆÙ][Y[Ý]


HOˆÈYˆ
X›Þ˜Û\ÜÓ\Ý˜ÛÛZ[œÊ	ÛÛ‰ÊJHÈ›ÞšY[ˆHYNÈ›Þš[›™\’SH	ÉÎÈHKL
NÈ‘TH[ÈB‹ËÈH™\ÜË[ˆX›Ý]ˆXXÚÚ]HÝš\Ùˆ]È[ˆÛÜ›Ë™]Ù\Ýš\œÝˆ^H\™H˜]Ûˆ\È^HØÜ›Û[ÈšY]Ë‚›]”—ÒSÈH[Â˜\Þ[˜È[˜Ý[Ûˆ˜]Ñš[\Ýš\
Ý‹ŠHÂˆÛÛœÝHX]›Z[Š‹]šXÙT^[˜][ÈJKÜHHÈHˆHX]›X^
L
‹ÛÜ›È×JK›[™Ý
KÙHˆ
ˆÜH
È
ˆHJH
ˆËHÜH
ÈÎÂˆÝ‹ÚYHX]œ›Ý[™
Ù
ˆ
NÈÝ‹šZYÚHX]œ›Ý[™

ˆ
NÂˆÛÛœÝ[YÜÈH]ØZ][’[XYÙ\Ê‹X]œ›Ý[™
ÜH
ˆ
ˆKŒJJNÈYˆ
XÝ‹š\ÐÛÛ›™XÝY
H™]\›ŽÂˆÛÛœÝHÝ‹™Ù]ÛÛ^
	Ì™	ÊNÈœÙ]˜[œÙ›Ü›J
NÈ˜ÛX\”™XÝ
Ù
NÂˆ›Üˆ
]ÈHÈÈŽÈÊÊÊHÈÛÛœÝÈH
‹ÛÜ›È×JVÚ×KHÈ
ˆ
ÜH
ÈÊNÂˆYˆ
]ÊHÈœÝ›ÚÙTÝ[HH	Ü™Ø˜JŒŒËŒKŒLŠIÎÈ›[™UÚYHNÈœÙ][™Q\Ú
Ì‹×JNÈœÝ›ÚÙT™XÝ

ÈKKÜHHKÜHHJNÈœÙ][™Q\Ú
×JNÈÛÛ[YNÈBˆ”]J[YÜÖÚ×KÜKKÊNÂˆ™š[Ý[HHË›Ý]OOH	Ø›XÚÉÈÈ	ÈÌ	ÈˆË›Ý]OOH	ÜÝ\š]™Y	ÈË›Ý]OOH	ÚX]	ÈÈJ“Ý]‘ÐŠÊKJHˆ	Ü™Ø˜JŒŒËŒK
IÎÈ™š[™XÝ
ÜH
ÈËÜKÊNÂˆYˆ
Ë›Ý]OOH	Ø›XÚÉÊHÈ™š[Ý[HH	Ü™Ø˜JMKMKMKÍJIÎÈ™š[™XÝ
ÜH
È‹ÜKJNÈHBŸB™[˜Ý[Ûˆ™[™\”™\ÜÊ
HÂˆÛÛœÝ[ˆHØÝ[Y[™Ù][[Y[žRY
	Ü™\ÜË[\Ý	ÊNÈYˆ
Y[ŠH™]\›ŽÂˆYˆ
”—ÒSÊHÈ”—ÒSË™\ØÛÛ›™XÝ

NÈ”—ÒSÈH[ÈBˆYˆ
T‘TÔ•Ë›[™Ý
HÈ[‹š[›™\’SH“›Û™HY]ˆHš\œÝÛÛY\ÈY\ˆÛÜ›	ÜYŠÑ‘Ë™XØYJ_KÜ]Ûˆ\OH˜]ÛˆˆÛ\ÜÏHËX\˜È•H\˜Ú]™NˆHš[Ùˆ]™\žHÛÜ›
JOØ]Û˜ÈBˆ[ÙH[‹š[›™\’SH‘TÔ•ËœÛXÙJLÌ
Kœ™]™\œÙJ
K›X\

‹ÊHOˆ]Ûˆ\OH˜]ÛˆˆÛ\ÜÏHœœˆˆ]KZÏH‰Ô‘TÔ•Ë›[™ÝHHHßHØ[˜\ÈÛ\ÜÏH™œÈˆÚYHÍˆˆZYÚHÈˆ\šXKZY[HYHØØ[˜\ÏÜ[ˆÛ\ÜÏHœ•ÛÜ›È	ÜYŠ‹›Œ
_x $ÉÜYŠ‹›ŒJ_OØÜ[‰Ü‹ÛÛŸHÛÛ‰Ü‹˜ÛÛÈ
	Ü‹˜ÛÛHœ›Þ™[ŠXˆ	ÉßIÜ‹œ\È0­È	Ü‹œ\H[ˆ\ˆ	ÉßH0­È	Ü‹˜›XÚßH›ÚY	Ü‹šX]È0­È	Ü‹šX]HÛÜ›ˆÝ]ˆ	ÉßH0­È	Ü‹œÝÜY
È‹œÝYÈ
È‹šÙ\HÝÜYÜÜ[Ü[ˆÛ\ÜÏH˜]‰Ù\ØÊ‹˜]	ÉÊ_OÜÜ[ÜÜ[Ø]Û˜
Kš›Ú[Š	ÉÊBˆ
È]Ûˆ\OH˜]ÛˆˆÛ\ÜÏHËX\˜È‰Ô‘TÔ•Ë›[™ÝˆÌÈH	Ô‘TÔ•Ë›[™ÝHÌHÛ\ˆ™\ÜË[™ˆ	Ñ]™\žH™\Ü[™	ßH]™\žHÛÜ›\Èš[ÎˆH\˜Ú]™H
JOØ]Û˜Âˆ[‹œ]Y\žTÙ[XÝÜ[
	Ëœœ‰ÊK™›Ü‘XXÚ
ˆOˆ‹˜Y]™[\Ý[™\Š	ØÛXÚÉË

HOˆÈ[˜X›Ý]šY[ˆHYNÈÚÝÔ™\Ü
‘TÔ•ÖÊØ‹™]\Ù]š×K˜[ÙJNÈJJNÂˆ[‹œ]Y\žTÙ[XÝÜŠ	ËËX\˜ÉÊK˜Y]™[\Ý[™\Š	ØÛXÚÉË

HOˆÈ[˜X›Ý]šY[ˆHYNÈT•‹XˆH‘TÔ•Ë›[™ÝÈ	Ý[‰Èˆ	ÝÛÜ›	ÎÈÜ[\˜Ú]™J
NÈJNÂˆÛÛœÝ›ÝÜÈHË‹‹™[‹œ]Y\žTÙ[XÝÜ[
	Ëœœ‰ÊWNÈYˆ
\›ÝÜË›[™Ý
H™]\›ŽÂˆYˆ
]Ú[™ÝË’[\œÙXÝ[Û“ØœÙ\™\ŠHÈ›ÝÜËœÛXÙJLŠK™›Ü‘XXÚ
ˆOˆ˜]Ñš[\Ýš\
‹œ]Y\žTÙ[XÝÜŠ	ØØ[˜\ÉÊK‘TÔ•ÖÊØ‹™]\Ù]š×JJNÈ™]\›ŽÈBˆ”—ÒSÈH™]È[\œÙXÝ[Û“ØœÙ\™\Š\ÈOˆÈ›Üˆ
ÛÛœÝHÙˆ\ÊHYˆ
Kš\Ò[\œÙXÝ[™ÊHÈ”—ÒSË[›ØœÙ\™JK\™Ù]
NÈ˜]Ñš[\Ýš\
K\™Ù]œ]Y\žTÙ[XÝÜŠ	ØØ[˜\ÉÊK‘TÔ•ÖÊÙK\™Ù]™]\Ù]š×JK˜Ø]Ú


HOˆßJNÈHKÈ›ÛÝX\™Ú[Žˆ	Ì	ÈJNÂˆ›ÝÜË™›Ü‘XXÚ
ˆOˆ”—ÒSË›ØœÙ\™JŠJNÂŸB™[˜Ý[Ûˆ™[™\‘›Ý[™

HÈËÈÚ]\ÈØÜ™Y[‰ÜÈÛÜ›È]™HÚÝÛˆX›Ý]Ø]Ú[™ÂˆÛÛœÝ›ÞHØÝ[Y[™Ù][[Y[žRY
	ØX›Ý]Y›Ý[™	ÊNÈYˆ
X›Þ
H™]\›ŽÂˆÛÛœÝˆHØ]Úš[™[™ÜÊ
KÛÛHÉÈÙÎNIË	ÈØNXÎ™‰Ë	ÈÌ	Ë	ÈÙ™ŽXMXIË	Ü™Ø˜JNLNM‹ŒNJI×NÂˆYˆ
‹›ˆLŠHÈ›Þš[›™\’SHÛ\ÜÏH™›ˆ•ÛÈ™]ÈÛÜ›ÈÛˆ\ÈØÜ™Y[ˆY]	Ð‹ÛÜ›ÈÈ
	Ð‹ÛÜ›ßHÛÈ˜\ŠXˆ	ÉßKˆY\ˆH™]È[Ü™K\ÈÚÝÜÈÝÈ]ÈÝ]\È]™H˜\™YžHÝÈÛÜÙ[H^HØ]ÚYˆHØÜ™Y[¸ &\ÈÝÛˆ]šY[˜ÙH›ÜˆHÝ][Y[X›Ý™KÚÝÛˆÚ]\ˆ]YÜ™Y\ÈÚ]]Üˆ›ÝÜ˜È™]\›ŽÈBˆÛÛœÝÌH
›Þ˜ÛY[ÚY[›™\•ÚYH
HLŒÈÍŒˆMÜHŒ‹HÌLÈLˆLNØ\HÌLÈLˆMÈH
ÌHH
ˆØ\
HÈŽÈËÈ
H˜\œ›ÝÈØÜ™Y[Žˆ˜]Ûˆ˜\œ›ÝÙ\‹ÛÈ]ÈšYÝ\™\ÈÝ^HYÚX›JBˆ]ÈH	ÉÎÂˆ‹™›Ü‘XXÚ

‹JHOˆÈÛÛœÝHH
ˆ
È
ÈØ\
NÈÈ
ÏH™XÝH‰Ê
ÈJKÑš^Y
J_HˆOH‰ÝÜ
È_HˆÚYH‰ÊÈHJKÑš^Y
J_HˆZYÚH‰ÚH_Hˆš[H››Û™HˆÝ›ÚÙOHœ™Ø˜JŒŒËŒKŒMŠH‹Ï˜Âˆ]HHÜ
ÈÈÐUÒÐÓË™›Ü‘XXÚ

ËŠHOˆÈÛÛœÝH‹›ˆÈ
ˆ–Ú×HÈ‹›ˆˆÈYˆ
H
H™]\›ŽÈHOHÂˆÈ
ÏH™XÝH‰Ê
ÈKJKÑš^Y
J_HˆOH‰ÞKÑš^Y
J_HˆÚYH‰ÊÈHÊKÑš^Y
J_HˆZYÚH‰ÚÑš^Y
J_Hˆš[H‰ØÛÛÚ—_H‰ÚˆOOHˆÈ	ÈÝ›ÚÙOHœ™Ø˜JMKMKMKÊHˆÝ›ÚÙK]ÚYHŒH‰Èˆ	ÉßKÏ˜ÈJNÂˆÈ
ÏH^H‰Ê
ÈÈÈŠKÑš^Y
J_HˆOH‰ÝÜ
È
ÈŒHˆ^X[˜ÚÜH›ZYHˆ›Û\Ú^™OHŒLÈˆÝ[OH™š[‰Ø‹›ˆÈ	ÈÙ™LYŒ	Èˆ	Ü™Ø˜JŒŒËŒKŒÊIßH‰Ú_OÝ^^H‰Ê
ÈÈÈŠKÑš^Y
J_HˆOH‰ÝÜHßHˆ^X[˜ÚÜH›ZYHˆ›Û\Ú^™OHŒL‰Ø‹›ˆ	ø $ÉßOÝ^˜ÈJNÂˆÛÛœÝÈH
‹ÊHOˆ‹›ˆÈX]œ›Ý[™
L
ˆ–Ú×HÈ‹›ŠHˆ[H‹›X\
ˆOˆ‹›ˆÈØ]Ú	Ø‹ßNˆ	Ø‹›ŸHÝ]\Ë	ÜÊ‹	Û]™Y	Ê_IH]™YÚ]Z\ˆÛÜ›ÛÚ[™ÈÛ‹	ÜÊ‹	ÜÝ[	Ê_IH]™Y[ˆHÛÜ›]œ›Þ™HÜˆÝÜY	ÜÊ‹	Ý›ÚY	Ê_IHÜÝÈH›ÚYˆØ]Ú	Ø‹ßNˆ›Û™X
Kš›Ú[Š	ÎÈ	ÊNÂˆÛÛœÝ[™HHØ]ÚÙ[[˜ÙJŠNÂˆ›Þš[›™\’SHÝ™ÈšY]Ð›ÞHŒM	ÕÌH	ÝÜ
È
ÈÌHˆ›ÛOHš[YÈˆ\šXK[X™[H‰Ù\ØÊ[
_H‰ÙßOÜÝ™Ï‚ˆ]ˆÛ\ÜÏH˜^•Ø]ÚÛˆ]™\˜YÙHÝ™\ˆXXÚÝ]x &\ÈY™Nˆ›Û™KH[Ù]‚ˆ]ˆÛ\ÜÏH™›Ü[HÝ[OH˜˜XÚÙÜ›Ý[™‰ØÛÛÌ_HÚO›]™Y[ˆHÛÜ›]Ù[ÛÜÜ[Ü[HÝ[OH˜˜XÚÙÜ›Ý[™‰ØÛÛÌW_HÚO›]™Y[ˆHÛÜ›]œ›Þ™HÜˆÝÜYÜÜ[Ü[HÛ\ÜÏHˆÚO›ÜÝÈH›ÚYÜÜ[Ü[HÝ[OH˜˜XÚÙÜ›Ý[™‰ØÛÛÌ×_HÚOÛÜ›ˆÝ]ÜÜ[Ü[HÝ[OH˜˜XÚÙÜ›Ý[™‰ØÛÛÍ_HÚOZÙ[ˆÝ™\ÜÜ[Ù]‚ˆ	Û[™HÈÛ\ÜÏH™œÈ‰Ù\ØÊ[™J_OÜ˜ˆ	ÉßOÛ\ÜÏH™œÈY\ÜÞH‰Ù\ØÊØ]ÚY\ÜÞJŠJ_OÜÛ\ÜÏH™›ˆ‘]™\žHÝ]H[ˆH	Ð‹ÛÜ›ßH	Ð‹ÛÜ›ÈOOHHÈ	ÝÛÜ›	Èˆ	ÝÛÜ›ÉßHÛˆ\ÈØÜ™Y[ˆÚ[˜ÙHÛÜ›	ÜYŠ‹™œ›ÛJ_H
	Ð‹›ŸHÝ]\È[ˆ[
KXÙYžHÝÈÛÜÙ[H]Ø]ÚYÛˆ]™\˜YÙHÝ™\ˆ]ÈY™Kˆ\È\ÈHØÜ™Y[¸ &\ÈÝÛˆ]šY[˜ÙH›ÜˆHÝ][Y[X›Ý™K[™]\ÈÚÝÛˆÚ]\ˆ]YÜ™Y\ÈÜˆ›ÝˆXXÚ™\ÜÛˆ[ˆÛÜ›ÈØ\œšY\È]ÛËÜ˜ÂŸB™[˜Ý[Ûˆ™[™\“[™XYÙJ
HÂˆ™[™\”™\ÜÊ
NÈžHÈ™[™\‘›Ý[™

NÈHØ]Ú
JHÈÛÛœÛÛKØ\›Š	Ù›Ý[™	ËJNÈBˆ[›[™XYÙKš[›™\’SH[™XYÙK™š[\ŠˆOˆ‹›Ý]ÛÛYHOOH	Ü\X[	ÊKœÛXÙJM
Kœ™]™\œÙJ
K›X\
ˆOˆ‰ÜYŠ‹›Š_OÝ‰Ù\ØÊ‹œ™YÚ[YK›[™ÝÈ‹œ™YÚ[YKš›Ú[Š	Ë	ÊHˆ	Û›Û™IÊ_OÝ‰Ü‹™˜]ÜßOÝ‰Ù\ØÊ‹›Ý]ÛÛYHOOH	Ø›XÚÉÈÈ	Ó˜S‰Èˆ‹›Ý]ÛÛYHOOH	ÜÝ\š]™Y	ÈÈ

‹™™[OH[È‹™™[ˆ
‹œ™YÚ[YH×JK™š[\ŠOˆš[˜ÛY\Ê	Ê™[
IÊJK›[™Ý
HÈ	ÜÛÛYHÝ\š]™Y	Èˆ‹œÙX[YÈ	ÝÛÛ‹ÙX[Y	Èˆ	ÝÛÛ‰ÊHˆ‹›Ý]ÛÛYHOOH	ÚX]	ÈÈ	ÝÛÜ›ˆÝ]	Èˆ‹›Ý]ÛÛYJ_OÝ‰Ù\ØÊ
‹š[\XØ]Y×JK˜ÛÛ˜Ø]

‹œØØ\œÈ×JK›X\
Oˆ
È	È
ØØ\ŠIÊJKš›Ú[Š	Ë	ÊH	ø %	Ê_OÝ‰Ü‹˜ÛÙHÈH™YHˆÈˆ]KXYØZ[H‰Ù\ØÊ‹˜ÛÙJ_Hˆ]K[H‰Ü‹›ŸHˆ]OH”^H]YØZ[ˆ‰Ù\ØÊ‹˜ÛÙKÕ\\Ø\ÙJ
J_OØO˜ˆ	ø %	ßOÝÝ˜
Kš›Ú[Š	ÉÊH	ÏÛÛÜ[Hˆ“›Û™HY]ÝÝ‰ÎÂŸB‚‹ÊˆOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOBˆ’S•ÈS‘HTÒU‘Kˆ\ÈXXÚÛÜ›[™ÈHš[Ùˆ]\ÈXYH[™š[Y[ˆ\Èœ›ÝÜÙ\‰ÜÈ\˜Ú]™NˆHÛÜ›\È]ˆ[™Y
Üˆ\ÈH›ÚYœ›ÚÙHÝ]Yˆ][™Y]
KHÝš\Ùˆ[ÛY[Èœ›ÛH]ÈY™K]È˜]K]ÈÝ]\È[™]È\›‹‚ˆY\ˆ]™\žH[‹H™\Ü\ÈHš[ÙˆH[‹ˆ[žHš[Ø[ˆ™HÙ\
Ù\š[È\™H™]™\ˆÛX\™Y
K]ÛËˆÜ[™Y][Ú^™KÜˆØ]™Y\ÈH‘ËˆHÛÜ›	ÜÈXÝ\™H\È™XYÝ˜ZYÚY\ˆHœ˜[YH\È˜]Ûˆ
Hœ˜[YH\È›ÝˆÙ\
Nˆ]™\žHÛÈÙ[ˆ›ÝYÚ]ÈY™K]Hœ™XZÛÝ]	ÜÈ\\[Û‹[™\ÈHÛÜ›[™Ëˆš[È\™H˜]ÛˆÛˆ[X[™ˆœ›ÛHÚ]Ø\Èš[Y
HXÝ\™\È[™H™XÛÜ™ÙˆHÛÜ›
KÛÈ^HØ[ˆ™HØ]™Y][Ú^™H][žH[YK‚ˆOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOH
‹Â˜ÛÛœÝ’S•HÈÛŽˆPÑ‘Ë˜Ø[Xˆ	‰ˆK™Ù]
	Üš[ÉÊHOOH	Ì	ËˆMNˆŽK™XÙ[ˆ×K\Ýˆ[›Ú\ÙNˆ[ÐTÕÎˆLŒÐTÕˆ›ÛÎˆ[ŽˆˆNÂ˜ÛÛœÝQ‘HHÈˆÎX^ˆÌ‹ˆHNÈËÈœ˜[Y\È›ÝYÚHÛÜ›	ÜÈY™Nˆ]™[›HÜXÙY][ÜÝ\K]ÛÈ
]È™\^KÛÈÚ\œ\ŠKHÜXÚ[™ÈÝX›[™È\È]ÛÙ\Â‹ËÈ]ÈY™H\È™\^YY[ˆHšY]È][™È[‹[™]™\žHÛÜ›[™ÈÛˆHÛØ™HÚ\™HHšY]ÜÈZÙH\›œÎˆH™\^B‹ËÈ]\›™Y™]ÙY[ˆH[™H[™H˜[ÛÝ[Û›HÛÛ™\ÙKˆÛÈ\™HÛ›HH˜[	ÜÈœ˜[Y\È\™HÙ\ÈÚ\™HB‹ËÈšY]È\ÈHš\Ú]Ü‰ÜÈ[Û™KXXÚšY]ÉÜË[™ÜÙHÙˆHšY]È][™È[ˆ\™HÚÝÛ‹‚˜ÛÛœÝ—ÒS’ÈH	ÈÌŒÌ	Ë—ÒQH	ÈÙ™LYŒ	Ë—ÑSHH	Ü™Ø˜JŒŒËŒKN
IË—ÑRS•H	Ü™Ø˜JŒŒËŒKŒ
IË—ÓSTH	ÈÙÎNIË—ÐÓÓH	ÈØNXÎ™‰Ë—ÑSP‘TˆH	ÈÙ™ŽXMXIÎÂ˜ÛÛœÝ—Ô‘ÐˆHÈ[\ˆÌŒKLÎKÛÛˆÌMŽKŒMWK[X™\ŽˆÌMKMMLKYˆÌŒŒËŒKKÜ™^NˆÌNLNM‹ŒNHNÂ˜ÛÛœÝHH
™Ø‹JHOˆ™Ø˜J	Ü™Ø‹š›Ú[Š	Ë	Ê_K	Ø_JXÂ˜ÛÛœÝ—ÔÑT’QˆH	È›ÙÛšH[ÙH‹›ÙÛšHÌˆ‹YÝÙ[Ü™ÚXKÙ\šY‰Ë—ÓSÓ“ÈH	È“X\X[ˆ[Û›È‹ZK[[Û›ÜÜXÙKY[›Ë[Û›ÜÜXÙIÎÂ™[˜Ý[ÛˆÜ˜X”ÜJË
HÈËÈHÛÜ›	ÜÈÜ]X\™Hœ›ÛHHœ˜[YH\Ý˜]Û‹[ÈÈ
XYHYˆ[
KXÜ›ÜÜÈ][ÜÝ
[™›È\™Ù\ˆ[ˆHØÜ™Y[ˆÚÝÜÈ]
BˆÛÛœÝÌHØ[˜\ËÚYHØ[˜\ËšZYÚÈ]KÞŽÂˆYˆ
Ñ‘Ë™ÛØ™JHÈÛÛœÝÈHÛØ™QÙ[Ê
NÈÞˆHX]›Z[Š‹Œˆ
ˆÖÌ—KÌ
NÈHÖÌHHÞˆÈŽÈHHÖÌWHHÞˆÈŽÈBˆ[ÙHÈÞˆHX]›Z[ŠÌ
NÈH
ÌHÞŠHÈŽÈHH
HÞŠHÈŽÈBˆHX]›X^
X]›Z[ŠÌHÞ‹
JNÈHHX]›X^
X]›Z[ŠHÞ‹JJNÂˆHX]›X^
X]›Z[ŠX]œ›Ý[™
ÞŠJJNÈÈHÈØÝ[Y[˜Ü™X]Q[[Y[
	ØØ[˜\ÉÊNÈYˆ
ËÚYOOHËšZYÚOOH
HÈËÚYHËšZYÚHÈBˆÛÛœÝÞHË™Ù]ÛÛ^
	Ì™	ÊNÈÞ™š[Ý[HH	ÈÌLŒ	ÎÈÞ™š[™XÝ

NÈÞ™˜]Ò[XYÙJØ[˜\ËKÞ‹Þ‹
NÂˆ™]\›ˆÎÂŸB˜ÛÛœÝÜ˜X”Ý[H

HOˆÜ˜X”ÜJ[’S•œ
NÂ™[˜Ý[ÛˆØ[˜\ÓÙŠ[K
HÈËÈ[žHXÝ\™K\ÈHØ[˜\È›È\™Ù\ˆ[ˆˆYˆ
Z[HZ[KÚY
H™]\›ˆ[ÈÛÛœÝÈHX]›Z[ŠKÈX]›X^
[KÚY[KšZYÚ
JKÈHØÝ[Y[˜Ü™X]Q[[Y[
	ØØ[˜\ÉÊNÂˆËÚYHX]›X^
KX]œ›Ý[™
[KÚY
ˆÊJNÈËšZYÚHX]›X^
KX]œ›Ý[™
[KšZYÚ
ˆÊJNÈÛÛœÝHË™Ù]ÛÛ^
	Ì™	ÊNÈš[XYÙTÛ[ÛÝ[™Ô]X[]HH	ÚYÚ	ÎÈ™˜]Ò[XYÙJ[KËÚYËšZYÚ
NÈ™]\›ˆÎÂŸB™[˜Ý[ÛˆY™UXÚÊ
HÈËÈHœ˜[YH]™\žHÛÈÙ[ˆÙˆÛÜ›[YNÈÚ[ˆ\™H\™H\K]ÛË]™\žHÝ\ˆÛ™HÛÙ\È[™HÜXÚ[™ÈÝX›\ÂˆYˆ
Ëœ\ÙHOOH	Ø[]™IÈ\™›Ü›X[˜ÙK››ÝÊ
HHË˜›Ü›ˆÌ
H™]\›ŽÂˆÛÛœÝÛØ™HHHPÑ‘Ë™ÛØ™NÈYˆ
YÛØ™H	‰ˆ’QUÔÕË›ÛŠH™]\›ŽÈËÈ
H[™IÜËÛ›HÚ\™HHÛÜ›Ø[ˆ[™Ûˆ]
BˆÛÛœÝHË›Y™H
Ë›Y™HHÈŽˆ×KˆQ‘K™™^ˆ™Žˆ×K™ˆQ‘K™›™^ˆÛÛˆ×HJKHÚ[U

NÂˆÛÛœÝˆHÛØ™HÈ	Ù‰Èˆ	Ù™‰ËHÛØ™HÈ	Ù	Èˆ	Ù™	Ë–HÛØ™HÈ	Û™^	Èˆ	Ù›™^	ÎÈËÈH˜[	ÜÈœ˜[Y\ËÜˆH[™IÜÂˆYˆ
Ó–H›[šÊØ[˜\ÊJH™]\›ŽÈËÈ
›Ý[™È˜]Ûˆ\™HY]\È]˜Y\È[Žˆ›ÝHXÝ\™HÙˆ]
BˆYˆ
Ñ—K›[™ÝHQ‘K›X^
HÈÛÛœÝÙY\H×NÈÑ—K™›Ü‘XXÚ

‹JHOˆÈYˆ
H	HˆOOH
HÙY\œ\Ú
ŠNÈ[ÙHœÛÛœ\Ú
‹˜ÊNÈJNÈÑ—HHÙY\ÈÑH
HŽÈBˆÑ—Kœ\Ú
Èˆ
ÝÑš^Y
JKÎˆÜ˜X”ÜJœÛÛœÜ

H[Q‘Kœ
HJNÈÓ–HH
ÈÑNÂŸB˜ÛÛœÝY™Qœ˜[Y\ÈHÈOˆ
Ë›Y™H	‰ˆ
Ë™[™›]ÈË›Y™K™™ˆˆË›Y™K™ŠJH×NÈËÈ]ÈY™K[ˆHšY]È][™Y[‚˜ÛÛœÝ[™šY]ÈH
ËJHOˆK™ÈOH[K™ÈOOH]Ë™[™›]ÈËÈHœ™XZÛÝ]	ÜÈXÝ\™KYˆZÙ[ˆ[ˆ]šY]Â™[˜Ý[Ûˆš[XÚÊ
HÈËÈØ[YÝ˜ZYÚY\ˆHÛÜ›\È˜]Û‚ˆYˆ
T’S•›ÛˆUÊH™]\›ŽÂˆžHÈY™UXÚÊ
NÈHØ]Ú
JHßBˆÛÛœÝÛHH–›ÛY[ŽÂˆYˆ
ÛH	‰ˆÛK™š\™Y	‰ˆ[ÛKœÝ[	‰ˆ\™›Ü›X[˜ÙK››ÝÊ
HHÛKœˆˆLŒ
HÈÛKœÝ[HYNÈËÈH\\[Û‚ˆžHÈÛÛœÝHË˜œ™XZÓÙÈ	‰ˆË˜œ™XZÓÙÖÕË˜œ™XZÓÙË›[™ÝHWNÈYˆ
	‰ˆœ]ZY]
Hœ]ZY]H˜[ÙNÈËÈH[œ™XXÚ]ÛÚÈÛˆË˜œ™XZÔÝ[HÜ˜X”Ý[

NÈË˜œ™XZÑ›]HPÑ‘Ë™ÛØ™NÈÛÛœÝHHË›X\šÜÈ
Ë›X\šÜÈH×JNÈKœ\Ú
Èˆ
ÜÚ[U

KÑš^Y
JKÎˆ	Øœ™XZÉËÎˆØ[˜\ÓÙŠË˜œ™XZÔÝ[Q‘Kœ
KÎˆHPÑ‘Ë™ÛØ™HJNÈYˆ
K›[™ÝˆŠHKœÜXÙJKJNÈHØ]Ú
JHßHBˆYˆ
ËØ[š[
HÈÛÛœÝÈHË\\HË™[™Y	‰ˆË™[™YšÚ[™OOH	Ø›XÚÉÈ	‰ˆË˜œ™XZÔÝ[ÈË˜œ™XZÔÝ[ˆ[ÂˆYˆ
Y\\	‰ˆ›[šÊØ[˜\ÊH	‰ˆ
ËœÝ[šY\ÈH
ËœÝ[šY\È
H
ÈJHML
H™]\›ŽÈËÈ[ˆ[\Hœ˜[YH
™]ÙY[ˆÛ™HØ^HÙˆÙYZ[™È][™[›Ý\ŠNˆH™^Û™BˆËØ[š[H˜[ÙNÈ]Ý[H[ÂˆžHÈÝ[H\\Ü˜X”Ý[

NÈHØ]Ú
JHßBˆYˆ
Ý[	‰ˆY\\	‰ˆ›[šÊÝ[
JHÈÛÛœÝˆHY™Qœ˜[Y\ÊÊKˆH–Û‹›[™ÝHWNÈYˆ
ŠHÝ[HØ[˜\ÓÙŠ‹˜Ë’S•œ
NÈHËÈ
›Û™HØ[YNˆ]È\ÝXÝ\™H[œÝXY
BˆYˆ
Ë‘]JHË‘]KœÝ[HÝ[ÂˆÛÛœÝˆHš[Tš[
ËÝ[
NÈYˆ
Ë‘]JHË‘]K™š[YH‹˜Ø]Ú


HOˆ[
NÈ‹˜Ø]Ú
HOˆÛÛœÛÛKØ\›Š	Üš[›Ýš[Y	ËJJNÈBŸB‹ÊˆOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOBˆH‘T‘PÕ8 %HÛÜ›	ÜÈ[™ÛˆÚ]]Ø[YHÈ[™ÚKÚ]Ú]]Ù]YØZ[œÝ]™\žHÛÜ›™Y›Ü™H]
Hš\œÝˆ™X]
NÈ]ÈY™HYØZ[ˆ[ˆH™]ÈÙXÛÛ™Ë]È\›ˆÙX]š[™ÈHÛÜ›	ÜÈÚYÚ[\È]ÛÙ\ËÚ]XXÚœ™XZÛÝ][™HÚ\ÛÛ‚ˆ\È]Ø\ÈÛÛ\]Y
HÙXÛÛ™
NÈ[ˆ]Èš[Z[Ú\™H]Ø[ˆ™H™XYÙ\ÜˆØ]™Y
H\™
KˆH™X]ÂˆÚ\™HHXØÛÝ[	ÜÈ[YH
Ñ‘ËœÝXØÙ\ÜÛÜŠNÈÛˆHØ[\™H\™H›È]ÛœËˆÝ™\™XÝLœš[™ÜÈ˜XÚÈHÛXØÛÝ[‚ˆOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOH
‹Â˜ÛÛœÝ‘T‘PÕHÈÛŽˆK™Ù]
	Ý™\™XÝ	ÊHOOH	Ì	Ë[Žˆ[Ûˆ[PÕÎˆLB‹ËÈ]È]ÛœÈÛÛYH\Û˜ÙH]Èš[\È[]]™[ÜY[™Ý^H\[ˆÙXÛÛ™È
‘T‘PÕPÕÊNˆHXØÛÝ[[œÈÛ‚‹ËÈ]Û™Ëˆ[ˆØ[\žH[ÙKÚXÚÚÝÜÈ›È]ÛœË]ÙY\È]ÈšYY[ˆÙXÛÛ™Ë‚˜ÛÛœÝ™\™XÝXÝÐ]HOˆŒˆ
ˆ
ÈKŒŽÂ™[˜Ý[Ûˆ™\™XÝÜ[Š
HÈ™]\›ˆÚ[ÜÚÊ
HÈÑ‘ËœÝXØÙ\ÜÛÜˆˆX]›X^
Ñ‘ËœÝXØÙ\ÜÛÜ‹™\™XÝXÝÐ]
X]›X^
Ñ‘ËœÝXØÙ\ÜÛÜŠJH
È‘T‘PÕPÕÊNÈNÈËÈ
Ûˆ]™[ÜY[HÙ\]Y[˜ÙH[]H[ÛY[
B˜ÛÛœÝ”ÛHH
K‹
HOˆÈÛÛœÝÈHX]›X^
X]›Z[ŠK
HJHÈX]›X^
YKM‹ˆHJJJNÈ™]\›ˆÈ
ˆÈ
ˆ
ÈHˆ
ˆÊNÈNÂ˜ÛÛœÝ‘X\ÙHHOˆÈHX]›X^
X]›Z[ŠK
JNÈ™]\›ˆHHX]œÝÊHHÊNÈNÂ˜ÛÛœÝ“Ü™HÈOˆÈ
È

È	HLHLH	‰ˆÈ	HLHLÊHÈ	Ý	Èˆ
ÈNˆ	ÜÝ	ËŽˆ	Û™	ËÎˆ	Ü™	ÈVÚÈ	HLH	Ý	ÊJNÂ˜ÛÛœÝ“Ü™ÈHÈOˆÉÉË	Ùš\œÝ	Ë	ÜÙXÛÛ™	Ë	Ý\™	Ë	Ù›Ý\	Ë	ÙšY	Ë	ÜÚ^	Ë	ÜÙ]™[	Ë	ÙZYÚ	Ë	Ûš[	Ë	Ý[	Ë	Ù[]™[	Ë	ÝÙ[	×VÚ×H“Ü™
ÊNÂ˜ÛÛœÝØ\HÈOˆË˜Ú\]

KÕ\\Ø\ÙJ
H
ÈËœÛXÙJJNÂ‹ËÈÚ]HÛÜ›Ø[YHË\ÈHÛÛÝ\ŽˆÛÛ›ÜˆHÚ[‹ÛÛ›ÜˆHœ›Þ™[ˆÛ™K[X™\ˆ›ÜˆH›ÚYÜˆ›ÜˆÙX\š[™ÈÝ]˜ÛÛœÝ”\H™XÈOˆ™XËšÚ[™OOH	ÜÝ\š]™Y	È	‰ˆ™XË›˜]œÛÛYJˆOˆ‹™˜]HOOH	ÝÛÛ‰È	‰ˆ‹™˜]HOOH	ÜÝ\š]™Y	ÊNÈËÈÝ\š]™Y]›Ý]™\žHÝ]B™[˜Ý[ÛˆXØÙ[
™XÊHÂˆÛÛœÝÛÛHÙœ›Þ™[‹ÚK\Ý
™XË]H	ÉÊK\H”\
™XÊNÂˆ™]\›ˆ™XËšÚ[™OOH	ÜÝ\š]™Y	ÈÈ
ÛÛÈ—Ô‘Ð‹˜ÛÛˆ\ÈÌŒ‹ŒMNHˆ—Ô‘Ð‹›[\
Hˆ™XËšÚ[™OOH	Ø›XÚÉÈ™XËšÚ[™OOH	ÚX]	ÈÈ—Ô‘Ð‹™[X™\ˆˆ—Ô‘Ð‹™Ü™^NÂŸB‹ËÈKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKHÚ]]Ù]YØZ[œÝ]™\žHÛÜ›™Y›Ü™H]‹ËÈÛ™HÜˆÛÈ[™\ËH˜\™\Ýš\œÝˆH™XÛÜ™Hš\œÝH[‹ˆœ›ÛHHÚ›ÛšXÛH
]™\žHÛÜ›\ÈØÜ™Y[ˆ\È[ŠK‚™[˜Ý[ÛˆÛÜ›™]ÜÊÝ\‹š[ÜŠHÂˆÛÛœÝHš[Ü‹™š[\ŠˆOˆˆ	‰ˆ‹›ˆOH[	‰ˆ‹›ˆÝ\‹›ŠKœÛÜ

KŠHOˆK›ˆH‹›ŠKˆH›[™ÝÝ]H×NÂˆÛÛœÝÛÛˆHˆOˆ‹›Ý]OOH	ÜÝ\š]™Y	È	‰ˆXÚ›Û”\
ŠK˜[Y\ÈHˆOˆ
‹›˜]È×JK›X\
Oˆ›˜[YJK[]™HHˆOˆ
‹›˜]È×JK™š[\ŠOˆ›Ý]OOH	Û]™Y	ÊK›X\
Oˆ›˜[YJNÂˆÛÛœÝ\ÕÛÛˆHÝ\‹›Ý]OOH	ÜÝ\š]™Y	È	‰ˆÝ\‹ÚÛNÂˆYˆ
ˆHJHÂˆYˆ
Ý\‹ˆX]›X^
‹‹”›X\
ˆOˆ‹
JJHÝ]œ\Ú
ÉÕHÛ™Ù\Ý[]™YÛÜ›Y]	ËËŒ—JNÂˆ[ÙHYˆ
Ý\‹›Ý]OOH	ÜÝ\š]™Y	È	‰ˆÝ\‹X]›Z[Š‹‹”›X\
ˆOˆ‹YNJJJHÝ]œ\Ú
ÉÕHÚÜ\Ý[]™YÛÜ›Y]	Ë‹Œ—JNÈBˆÛÛœÝÚ[œÈH™š[\ŠÛÛŠNÂˆYˆ
\ÕÛÛŠHÂˆYˆ
]Ú[œË›[™Ý	‰ˆˆHŠHÝ]œ\Ú
ØHš\œÝÛÜ›ÈÚ[‹Y\ˆ	ÓŸXWJNÂˆYˆ
Ý\‹›“ˆHÈ	‰ˆ]Ú[œËœÛÛYJˆOˆ˜[Y\ÊŠK›[™ÝHÝ\‹›“ŠH	‰ˆÚ[œË›[™Ý
HÝ]œ\Ú
ØHš\œÝÚ[ˆÚ]	Ó•SUÖØÝ\‹›“—KÓÝÙ\Ø\ÙJ
_HÝ]\ØJNÂˆYˆ
Ý\‹›˜ˆOOH	‰ˆÚ[œË›[™Ý	‰ˆ]Ú[œËœÛÛYJˆOˆ‹›˜ˆOOH
JHÝ]œ\Ú
ÉÕHš\œÝÚ[ˆÚ]Ý]HÚ[™ÛHœ™XZÛÝ]	Ë×JNÂˆYˆ
Ý\‹›˜ÈHˆ	‰ˆÝ\‹›˜ÈˆX]›X^
‹‹Ú[œË›X\
ˆOˆ
‹šÛ	‰ˆ‹šÛ˜Ø]YÚ
H
JJHÝ]œ\Ú
ØØ]YÚ	Ü“[JÝ\‹›˜Ê_H[Y\Ë[™Ý[ÛÛŽˆH[ÜÝY]ËJNÂˆÛÛœÝXÙ\ÈHÚ[œË™š[\ŠˆOˆ‹šXÙHOH[
K›X\
ˆOˆ‹šXÙJNÂˆYˆ
XÙ\Ë›[™ÝHÊHÈYˆ
Ý\‹šXÙHˆÓÓÕÒSˆ	‰ˆÝ\‹šXÙHˆX]›X^
‹‹šXÙ\ÊJHÝ]œ\Ú
ÉÕHÛÛ\ÝÚ[ˆY]	Ë‹JNÈ[ÙHYˆ
Ý\‹šXÙHX]›Z[Š‹‹šXÙ\ÊH	‰ˆÝ\‹šXÙHŒLŠHÝ]œ\Ú
ÉÕHœ™Y\ÝÚ[ˆY]ˆ[[ÜÝ›Ý[™Èœ›Þ™[‰Ë‹JNÈBˆ]ÝHNÈ›Üˆ
]HHˆHNÈHH	‰ˆÛÛŠÚWJNÈKKJHÝ
ÊÎÂˆYˆ
ÝHŠHÝ]œ\Ú
Ø	ÝØ\
•SUÖÜÝHÈ•SUÖÜÝKÓÝÙ\Ø\ÙJ
HˆÝš[™ÊÝ
J_HÚ[œÈ[ˆH›ÝØÝHÈÈËˆˆ‹—JNÂˆÛÛœÝÝHÚ[œË›[™Ý
ÈNÈYˆ
ÝHH	‰ˆÝ	HHOOH
HÝ]œ\Ú
ØH	Ý“Ü™
Ý
_HÚ[ˆ[ˆ	Óˆ
È_HÛÜ›ØK—JNÂˆH[ÙHYˆ
Ý\‹›Ý]OOH	Ø›XÚÉÊHÂˆ]ÝHNÈ›Üˆ
]HHˆHNÈHH	‰ˆÚWK›Ý]OOH	Ø›XÚÉÎÈKKJHÝ
ÊÎÂˆYˆ
ÝHÊHÝ]œ\Ú
ØH	Ý“Ü™ÊÝ
_HÛÜ›[ˆH›ÝÈÈ[™[ˆH›ÚY‹—JNÂˆYˆ
Ú[œË›[™Ý	‰ˆˆH
HÈ]ÈHÈ›Üˆ
]HHˆHNÈHH	‰ˆ]ÛÛŠÚWJNÈKKJHÊÊÎÈYˆ
ÈH
HÝ]œ\Ú
Ø›ÈÚ[ˆ[ˆH\Ý	ÚÈ
È_HÛÜ›ØKŽJNÈHBˆYˆ
Ý\‹›“ˆˆH	‰ˆÝ\‹›Ý]OOH	ÜÝ\š]™Y	ÊHÈÛÛœÝš\œÝÈH×K[œÈH×NÈËÈHÝ]H›ÝYÚ›ÜˆHš\œÝ[YNÈHÝ]H›ÝYÚÛÜ›Y\ˆÛÜ›ˆ›Üˆ
ÛÛœÝ›HÙˆÝ\‹˜[]™JHÈÛÛœÝ\™HH™š[\ŠˆOˆ˜[Y\ÊŠKš[˜ÛY\Ê›JJNÈYˆ
\™K›[™ÝŠHÛÛ[YNÂˆYˆ
]\™KœÛÛYJˆOˆ[]™JŠKš[˜ÛY\Ê›JJJHš\œÝËœ\Ú
Û›K\™K›[™Ý
ÈWJNÂˆ[ÙHÈ]ÝHNÈ›Üˆ
]HH\™K›[™ÝHNÈHH	‰ˆ[]™J\™VÚWJKš[˜ÛY\Ê›JNÈKKJHÝ
ÊÎÈYˆ
ÝHÊH[œËœ\Ú
Û›KÝJNÈHBˆYˆ
š\œÝË›[™ÝOOHJHÝ]œ\Ú
Ø	Ùš\œÝÖÌVÌ_HÛÛY\È›ÝYÚ›ÜˆHš\œÝ[YK[ˆ]È	Ý“Ü™
š\œÝÖÌVÌWJ_HÛÜ›ËŒ×JNÂˆ[ÙHYˆ
š\œÝË›[™ÝˆJHÝ]œ\Ú
Ø	Ü“\Ý
š\œÝË›X\
ˆOˆ–ÌJJ_HÛÛYH›ÝYÚ›ÜˆHš\œÝ[YXËWJNÂˆÛÛœÝ[ˆH[œËœÛÜ

JHOˆVÌWHHÌWJVÌNÈYˆ
[ŠHÝ]œ\Ú
Ø	Ü[–Ì_H\ÈÛÛYH›ÝYÚ	Ó•SUÖÜ[–ÌWWHÈ•SUÖÜ[–ÌWWKÓÝÙ\Ø\ÙJ
Hˆ[–ÌW_HÛÜ›È[›š[™ØKŒˆ
È[–ÌWH
ˆŒÍWJNÈBˆYˆ
ˆ
ÈHHÊHÈÛÛœÝÈHÚ[œË›[™Ý
È
\ÕÛÛˆÈHˆ
NÈÝ]œ\Ú
ÚÈÈ	ÝØ\
•SUÖÚ×HÈ•SUÖÚ×KÓÝÙ\Ø\ÙJ
HˆÝš[™ÊÊJ_H	ÚÈOOHHÈ	ÝÚ[‰Èˆ	ÝÚ[œÉßH[ˆ	Óˆ
È_HÛÜ›Øˆ›ÈÛÜ›\ÈÛÛˆY][ˆ	Óˆ
È_XWJNÈBˆÝ]œÛÜ

KŠHOˆ–ÌWHHVÌWJNÂˆ™]\›ˆÝ]œÛXÙJŠK›X\
OˆÌJNÂŸB‹ËÈKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKHÚNˆÚ]HÛÜ›]Ù[ˆÛ›ÝÜË›Ý›Ú[\œ]B™[˜Ý[ÛˆØ]\ÙJËÚ[™˜]œ™XZÜËÚ\ÛÛžK
HÈËÈHXYÙ[[˜ÙH
H™\™XÝ	ÜÈ™X\ÛÛŠK[ˆH]H[Ü™H
Hš[	ÜÊBˆÛÛœÝXYH×K[Ü™HH×K\ÝHœ™XZÜÖØœ™XZÜË›[™ÝHWKØ]YÚHœ™XZÜË™š[\ŠˆOˆ‹˜Ø]YÚ
KÜÝH˜]™š[\ŠˆOˆ‹™˜]HOOH	ÛÜÝÈH›ÚY	ÊK›X\
ˆOˆ‹›˜[YJNÂˆÛÛœÝ[H˜]™š[\ŠˆOˆ‹™˜]HOOH	ÝÛÛ‰È‹™˜]HOOH	ÜÝ\š]™Y	ÊK›X\
ˆOˆ‹›˜[YJK\HÚ[™OOH	ÜÝ\š]™Y	È	‰ˆ˜]œÛÛYJˆOˆ‹™˜]HOOH	ÛÜÝÈH›ÚY	ÊNÂˆÛÛœÝÞH˜]™š[\ŠˆOˆ×ZÙ[ˆžHË\Ý
‹™˜]H	ÉÊJK›X\
ˆOˆÛ‹™˜]KœÛXÙJJK‹›˜[YWJKÛˆHÞ›X\

ØK—JHOˆ	Ø_HÛÚÈ	ØŸX
NÈËÈZÙ[ˆÝ™\ŽˆHÛÜ›Ý[Ú[œÂˆÛÛœÝÑÛÛ™HHÞ›[™ÝOOHHÈ	ÝÞÌVÌ_HÛÚÈ	ÝÞÌVÌW_Nˆ]È[™]™\ÈÛ‹[™\ˆ	ÝÞÌVÌ_x &\È]ÜÎÈ	ÝÞÌVÌW_HÙ\È›Ý˜ˆÞ›[™ÝÈ	ÝØ\
“\Ý
ÛŠJ_NˆZ\ˆ[™È]™HÛ‹[™\ˆÝ\œø &H]ÜÎÈ^HÈ›Ý˜ˆ	ÉÎÂˆÛÛœÝ\ÈHÚ\ÛÛžH	‰ˆÚ\ÛÛžK›[™ÝÈHÚ\ÛÛŽˆ	Ü“\Ý
Ú\ÛÛžKœÛXÙJ
K›X\
OˆÌWH	‰ˆ˜]›[™ÝˆHÈ	ÜÌ_H
	ÜÌW_x &\È	Ý“Ü™
Ì—H
_H˜]ÊXˆ	ÜÌ_IÜÌ—HÈ
]È	Ý“Ü™
Ì—J_H˜]ÊXˆ	ÉßX
J_K˜ˆ	ÉÎÂˆÛÛœÝœ›ÚÙR[ˆHˆOˆH›ÚYœ›ÚÙHÝ]	Ø‹Ú\™H	‰ˆ˜]›[™ÝˆHÈ[ˆ	Ø‹Ú\™_Xˆ	ÉßH]	Û[\ÜÊ‹
_IØ‹™ÈÛˆ	Û˜]›[™ÝˆHÈ	Ú]ÉÈˆ	ÝIßH	Ý“Ü™
‹™
_H˜]Øˆ	ÉßXÂˆÛÛœÝ›[™ÈHˆOˆ‹˜›[™ÈÚ\™H	Û˜]›[™ÝˆHÈ	Ú]ÉÈˆ	ÝIßHØ]ÚØ\ÈÛÚÚ[™È›Üˆ	Ø‹˜›[™IØ‹šÚ[™	‰ˆÒS‘ÕÐUÒØ‹šÚ[™HÈ›Ý	ÒÒS‘ÕÐUÒØ‹šÚ[™_Xˆ	ÉßXˆ‹™Ø]™HÈY\ˆ	Û˜]›[™ÝˆHÈ	Ú]	Èˆ	ÝHÛÜ›	ßHYÚ]™[ˆ˜XÚÈHØ]Ú]ÛÝ[]™HØ]YÚ]ˆ	ÉÎÂˆYˆ
Ú[™OOH	Ø›XÚÉÊHÂˆXYœ\Ú
\ÝÈ	ÝØ\
œ›ÚÙR[Š\Ý
J_IØ›[™Ê\Ý
_K[™ÛÚÈ	Û˜]›[™ÝˆHÈ	Ù]™\žHÝ]IÈˆ	ÝHÛÜ›	ßK˜ˆ	ÐH[X™\ˆœ›ÚÙK[™H›ÚYÛÚÈHÛÜ›‰ÊNÂˆYˆ
\Ý	‰ˆ\ÝšÛ
HÈÛÛœÝ]HH\ÝšÛ™š[\ŠOˆÌWHOOH	Û]IÊK›X\
OˆÌJNÈYˆ
]K›[™Ý
H[Ü™Kœ\Ú
	Ü“\Ý
]J_H[Ý™YÈÙX[	Û]K›[™ÝˆHÈ	ÝZ\ˆ›Ü™\œÉÈˆ	Ú]È›Ü™\‰ßHÛÈ]K˜
NÈBˆYˆ
\ÊH[Ü™Kœ\Ú
\È
È
Ú\ÛÛžK›[™ÝˆHÈ	ÈXXÚ\›[\ÜÈ[Û™K‰Èˆ	ÉÊJNÂˆYˆ
Ø]YÚ›[™Ý
H[Ü™Kœ\Ú
]Y™Y[ˆØ]YÚ	ØØ]YÚ›[™ÝOOHHÈ	ÛÛ˜ÙIÈˆ“[JØ]YÚ›[™Ý
H
È	È[Y\ÉßH™Y›Ü™K˜
NÈBˆ[ÙHYˆ
Ú[™OOH	ÜÝ\š]™Y	ÊHÂˆYˆ
\
HÈÛÛœÝˆHœ™XZÜË™š[\ŠOˆ^˜Ø]YÚ	‰ˆ
™™[×JK›[™Ý
KœÜ

H[ÂˆYˆ
ŠHÈÛÛœÝžHHÈOˆ
‹šÛ×JK™š[\ŠOˆ[š[˜ÛY\ÊÌJH	‰ˆÌWHOOHÊK›X\
OˆÌJKÛ˜ÙHHžJ	ÛÛ˜ÙIÊK[YHHžJ	Ý[YIÊNÂˆÛÛœÝÚHHÛÛ˜ÙK›[™ÝÈ	Ü“\Ý
Û˜ÙJ_H	ÛÛ˜ÙK›[™ÝˆHÈ	ÝÙ\™IÈˆ	ÝØ\ÉßH[™XYHØ]Ú[™Ë[™ÙX[Y]Û˜ÙXˆ	ÉË[YK›[™ÝÈ	Ü“\Ý
[YJ_HÙX[Y	Ý[YK›[™ÝˆHÈ	ÝZ\ˆ›Ü™\œÉÈˆ	Ú]È›Ü™\‰ßH[ˆ[YXˆ	É×K™š[\Š›ÛÛX[ŠNÂˆXYœ\Ú
	ÝØ\
œ›ÚÙR[ŠŠJ_IØ›[™ÊŠ_K[™ÛÚÈ	Ø‹™™[›[™ÝOOHH	‰ˆ‹™™[ÌHOOH‹Ú\™HÈ	Ú]	Èˆ“\Ý
‹™™[
_K˜
NÂˆ[Ü™Kœ\Ú
ÚK›[™ÝÈ	ÝØ\
ÚKš›Ú[Š	ÎÈ	ÊJ_K˜ˆ	Ü“\Ý
[
_H	Ú[›[™ÝˆHÈ	ÝÙ\™IÈˆ	ÝØ\ÉßHÝ]Ùˆ]È™XXÚ˜
NÈBˆ[ÙHÈÛÛœÝÛÛ™HH˜]™š[\ŠˆOˆZ[š[˜ÛY\Ê‹›˜[YJJK›X\
ˆOˆ×ZÙ[ˆžHË\Ý
‹™˜]H	ÉÊHÈ	Û‹™˜]KœÛXÙJJ_HÛÚÈ	Û‹›˜[Y_Xˆ	Û‹›˜[Y_H™[ÈH›ÚY
NÈËÈ˜[[‹]›ÝÈHœ™XZÛÝ]]Ø]ÂˆXYœ\Ú
	ÝØ\
“\Ý
ÛÛ™JJ_NÈ	Ü“\Ý
[
_HØ[YH›ÝYÚ˜
NÂˆ[Ü™Kœ\Ú
ËœÙX[YÈ	Ü“\Ý
[
_HYÚYÛ™YHXØÛÜ™[™›Ý[™ÈØ\ÈYÈ˜]È]Ú]]˜[œË˜ˆË›\Ý˜[žH	‰ˆË›\Ý˜[]ˆÈ	ÝË›\Ý˜[žK›˜[Y_H[\YY]È\›ˆš\œÝ]	Û[\ÜÊË›\Ý˜[]
_K˜ˆ	ÉÊNÈBˆYˆ
\ÊH[Ü™Kœ\Ú
\ÊNÈBˆ[ÙHÈÛÛœÝžHHË›\Ý˜[žH	‰ˆ˜]›[™ÝˆHÈË›\Ý˜[žK›˜[YHˆ[XÙHHX]œ›Ý[™


ËœÝ]È	‰ˆËœÝ]Ë™œ›ÜÝ
H
H
ˆL
KHHË›\Ý˜[]ˆÈË›\Ý˜[]ˆX]›X^

Ú[U

JHHŒ
NÂˆXYœ\Ú
ËœÙX[YÈ	Û˜]›[™ÝˆHÈ
Û‹›[™ÝÈ	Ñ]™\žHÝ]HÝ[Ý[™[™ÉÈˆ	Ñ]™\žHÝ]IÊHˆ	ÕHÛÜ›	ßHÚYÛ™YHXØÛÜ™[™›Ý[™ÈØ\ÈYÈ˜]È]Ú]]˜[œË˜ˆˆÛ‹›[™ÝÈ	ØžHÈ	Øž_H[\YY]È\›ˆš\œÝˆ	ÕH\›ˆØ\È[\YY	ßH]	Û[\ÜÊJ_K[™H›ÚYÛÚÈ›ÈÝ]IÚXÙHˆÓÓÕÒSˆ
ˆLÈ	ÚXÙ_IHÙˆ]œ›Þ™[˜ˆ	ÉßKˆ	ÝÑÛÛ™_Xˆˆ	ØžHÈ	Øž_H[\YY]È\›ˆš\œÝˆ	ÕH\›ˆØ\È[\YY	ßH]	Û[\ÜÊJ_K[™	Û˜]›[™ÝˆˆÈ[	Ü“[J˜]›[™Ý
_HÝ]\È]™Yˆ˜]›[™ÝˆHÈ	Ø›ÝÝ]\È]™Y	Èˆ	ÝHÛÜ›]™Y	ßIÚXÙHˆÓÓÕÒSˆ
ˆLÈ	ÚXÙ_IHÙˆ]œ›Þ™[˜ˆ	ÉßK˜
NÂˆYˆ
Ø]YÚ›[™Ý
HÈÛÛœÝX[HØ]YÚ™š[\ŠˆOˆ‹Ú\™JK›X\
ˆOˆ‹Ú\™JKHHË‹‹›™]ÈÙ]
X[
WNÂˆ[Ü™Kœ\Ú
H›ÚYœ›ÚÙHÝ]	ØØ]YÚ›[™ÝOOHHÈ	ÛÛ˜ÙIÈˆ“[JØ]YÚ›[™Ý
H
È	È[Y\ÉßK[™	ØØ]YÚ›[™ÝOOHHÈ	ÝØ\ÉÈˆ	ÙXXÚ[YHØ\ÉßHØ]YÚ[ˆ[YIÝK›[™ÝÈˆ	Ü“\Ý
J_x &\ÈØ]Ú	ÝK›[™ÝˆHÈ	ÝÙ\™IÈˆ	ÝØ\ÉßHÛÜÙH[›ÝYÚˆ	ÉßK˜
NÈBˆ[ÙHÈÛÛœÝHHÈOOHÈÈ[šÛ›ÝÛ•ÚJ
Hˆ[È[Ü™Kœ\Ú
HÈKš›Ú[Š	È	ÊHˆ	ÕH›ÚY™]™\ˆœ›ÚÙHÝ]‰ÊNÈHHBˆ[ÙHYˆ
Ú[™OOH	ÚX]	ÊHXYœ\Ú
	Ò]Ü[\HÙXÛÛ™È\ÝH[™K[Û[™ÛÜ™HÝ]ˆ›È[HY][™›ÈÝ]H[Û™K‰ÊNÂˆ[ÙHYˆ
Ú[™OOH	ÚÙ\	ÊHXYœ\Ú
	ÓX]œ›Ý[™


ËœÝ]È	‰ˆËœÝ]Ë™œ›Þ™[ŠH
H
ˆL
_IHÙˆ]Ø\È[Ý[žH]ÈÝÛˆØY™YÝX\™Ë[™›Ý[™È[Ý™Y˜
NÂˆ[ÙHXYœ\Ú
ËœÝYÛ˜[È	Ñ›Üˆ™YHZ[]\È›Ý[™ÈØ\È\›Z]Y[™]ÝÜY‰Èˆ	Ó›Ý[™ÈY[ˆH\›ˆÛÝ[™H˜]Û‹[™]ÝÜY‰ÊNÂˆÈÛÛœÝÈHØš™XÝ™[šY\ÊËš[ˆßJKœÛÜ

KŠHOˆ–ÌWHHVÌWJVÌNÈËÈ[™ÝÈÙ[ˆ]Ø[YH˜XÚË[]˜^BˆYˆ
È	‰ˆÚ[™OOH	ÚX]	ÊH[Ü™Kœ\Ú
	ÚÖÌHOOH	Ê‰È	‰ˆ˜]›[™ÝˆHÈ[ˆ	ÚÖÌ_H]ˆ	Ò]	ßHØ[YH˜XÚÈ	ÚÖÌWHOOHHÈ	ÛÛ˜ÙIÈˆÖÌWHOOHˆÈ	ÝÚXÙIÈˆ“[JÖÌWJH
È	È[Y\ÉßK[]˜^IÚÖÌWHˆHÈ	ÈXXÚ[YIÈˆ	ÉßK˜
NÈBˆ™]\›ˆÈXYˆXYš›Ú[Š	È	ÊK[Ü™Nˆ[Ü™Kš›Ú[Š	È	ÊHNÂŸB‹ËÈKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKHHÚYÚ[ˆHÛÜ›	ÜÈ˜]ÜË\ÈHšYÝ\™B‹ËÈ]™\žH[HÙˆ]È\›ˆ›Ý[™HÚ\˜ÛNÈ›ÜˆXXÚÝ]KH™XY›ÝYÚH[\È]™]Ë[ˆHÜ™\ˆ]™]È[NÂ‹ËÈHÚ\ÛÛˆ›Ú[™Y[ˆÚ]NÈ›Ý[™HÝ]ÚYKHÛÜ›	ÜÈ[YKÚ]XXÚœ™XZÛÝ]]]È[ÛY[
Ø]YÚˆÛÛ
NÂ‹ËÈ]HÙ[™KÚ]]Ø[YHËˆ
ÈJHÙX]™\È][ˆ[YNÈHš[ÜˆH™\ÜÚÝÜÈ]ÚÛK‚˜ÛÛœÝÒQ×ÐPˆH	ÐPÑQ‘ÒR’ÓS“ÔT”ÕU•ÖV˜X˜ÙY™ÚZšÛ[›Ü\œÝ]Þ^ŒLŒÍMÎKWÉÎÂ™[˜Ý[ÛˆÚYÔÙ\J™XÊHÈËÈXXÚÝ]IÜÈÝÛˆ˜]ÜË[ˆÜ™\ˆ
Û\ˆ™XÛÜ™ÎˆH[\È]ÛÚÈš\œÝ
BˆYˆ
™XËœÙ\JH™]\›ˆ™XËœÙ\NÂˆ™]\›ˆ™XË›˜]›X\
ˆOˆ
ÈNˆ‹šKˆ™XË\›‹›X\

KÊHOˆÚËVÌWKVÌWJK™š[\ŠHOˆVÌ—HOOH‹šH	‰ˆVÌWHH
KœÛÜ

KŠHOˆVÌWHH–ÌWJK›X\
HOˆÙVÌKVÌWWJHJJNÂŸB™[˜Ý[ÛˆÚYÔXÚÊ™XÊHÈËÈÛX[[›ÝYÚÈÙY\Ú]]™\žHÛÜ›[ˆHÚ›ÛšXÛBˆÛÛœÝ[˜ÈHHOˆK›X\
HOˆÒQ×ÐP–ÚWH	ÉÊKš›Ú[Š	ÉÊK^HÈOˆË›X\
ˆOˆX]›X^
X]›Z[ŠMKˆ
JKÔÝš[™ÊMŠKœYÝ\
‹	Ì	ÊJKš›Ú[Š	ÉÊNÂˆ™]\›ˆÈŽˆ™XË\›‹›[™ÝÎˆ™XËšÚ[™ˆ™XË]KÎˆÚYÔÙ\J™XÊK›X\
ÈOˆÈÛÛœÝˆH™XË›˜]™š[™
OˆšHOOHËšJNÈ™]\›ˆÚ^
ˆÈ‹[ˆÌŒŒŒŒJK[˜ÊË™›X\
OˆÌJJKˆ	‰ˆÝ›ÚYZÙ[‹Ë\Ý
‹™˜]JHÈHˆNÈJKˆˆ[˜Ê™XË\›‹›X\

KJHOˆVÌ—HÈHˆLJK™š[\ŠHOˆHH
JKŽˆ
™XË˜œ™XZÜÈ×JK›X\
ˆOˆÓX]œ›Ý[™
‹ÈX]›X^
K™XË
H
ˆL
K‹˜Ø]YÚÈHˆJHNÂŸB™[˜Ý[ÛˆÚYÕ[œXÚÊÊHÈËÈHXÚÙYÚYÚ[\ÈH™XÛÜ™HÚYÚ[Ø[ˆ˜]ÂˆÛÛœÝXÈHÈOˆË‹‹ŠÈ	ÉÊWK›X\
ÈOˆÒQ×ÐP‹š[™^ÙŠÊJK™š[\ŠHOˆHH
K™ØˆHOˆÌ‹K›X\
ÈOˆ\œÙR[
œÛXÙJËÈ
ÈŠKMŠJNÂˆÛÛœÝ˜]HËœË›X\

ËJHOˆ
ÈK[ˆ™ØŠÖÌJK˜]NˆÖÌ—HÈ	ÛÜÝÈH›ÚY	Èˆ	ÝÛÛ‰ÈJJNÂˆÛÛœÝÙ\HHËœË›X\

ËJHOˆ
ÈKˆXÊÖÌWJK›X\

ËŠHOˆÚËˆ
ÈWJHJJNÂˆÛÛœÝ\›ˆH\œ˜^K™œ›ÛJÈ[™ÝˆË“ˆK

HOˆËLKLKJNÈ]X^HNÂˆÙ\K™›Ü‘XXÚ
ÈOˆË™™›Ü‘XXÚ
OˆÈX^HX]›X^
X^ÌWJNÈYˆ
\›–ÙÌWVÌHÌWH\›–ÙÌWVÌWJH\›–ÙÌWHHÜËšKÌWKNÈJJNÂˆ›Üˆ
ÛÛœÝÈÙˆXÊËœ
JH\›–Ú×VÌ—HHNÂˆ™]\›ˆÈÚ[™ˆËšË]NˆË	ÉËˆX^\›‹Ù\K˜]œ™XZÜÎˆ
Ë˜ˆ×JK›X\
ˆOˆ
Èˆ–ÌHÈL
ˆX^Ø]YÚˆHX–ÌWHJJHNÂŸB™[˜Ý[Ûˆ”ÚYÚ[
™XËÞÞK‹K]™JHÂˆHOH[ÈHˆÈÛÛœÝˆH™XË\›‹›[™ÝHX]›X^
K™XË
KÈH
ˆ
ÈYKM‹UHHX]”H
ˆŽÂˆÛÛœÝH
KŠHOˆÈÛÛœÝHHHÈˆ
ˆUHHX]”HÈŽÈ™]\›ˆØÞ
ÈX]˜ÛÜÊJH
ˆ‹ÞH
ÈX]œÚ[ŠJH
ˆ—NÈNÂˆÛÛœÝÙ\HHÚYÔÙ\J™XÊK•Hˆ
ˆŽŽÂˆœØ]™J
NÈ›[™PØ\H	Ü›Ý[™	ÎÈ›[™R›Ú[ˆH	Ü›Ý[™	ÎÂˆœÝ›ÚÙTÝ[HH	Ü™Ø˜JŒŒËŒKŒÊIÎÈ›[™UÚYHX]›X^
‹H
ˆŽJNÈ˜™YÚ[”]

NÈ˜\˜ÊÞÞK•UJNÈœÝ›ÚÙJ
NÂˆËÈH™XYÎˆXXÚÝ]IÜÈ˜]ÜÈ[ˆHÜ™\ˆ]™]È[K]™\žHÚÜ™›ÝÙYÝØ\™HÙ[™Bˆ›Üˆ
ÛÛœÝÈÙˆÙ\JHÂˆÛÛœÝˆH™XË›˜]™š[™
HOˆKšHOOHËšJNÈYˆ
[ŠHÛÛ[YNÈÛÛœÝÜÝHÝ›ÚYZÙ[‹Ë\Ý
‹™˜]H	ÉÊKÈHË™™š[\ŠOˆÌWHHÊNÈYˆ
Ë›[™ÝŠHÛÛ[YNÂˆœÝ›ÚÙTÝ[HH™Ø˜J	Û‹[š›Ú[Š	Ë	Ê_K	ÛÜÝÈŒˆLŸJXÈ›[™UÚYHX]›X^
MK
ÜÝÈŽˆKŒJH
ˆJNÂˆ˜™YÚ[”]

NÈ]ÜWHH
ÖÌVÌK•
NÈ›[Ý™UÊJNÂˆ›Üˆ
]ÈHNÈÈË›[™ÝÈÊÊÊHÈÛÛœÝÜ^^WHH
ÖÚ×VÌK•
NÈœ]XY˜]XÐÝ\™UÊÞ
È


È^
HÈˆHÞ
H
ˆŒËÞH
È

H
È^JHÈˆHÞJH
ˆŒË^^JNÈH^ÈHH^NÈBˆœÝ›ÚÙJ
NÂˆYˆ
]™H	‰ˆË›[™Ý	‰ˆÈHÖÜË›[™ÝHWVÌWH
ˆŒÍJHÈ™š[Ý[HH™Ø˜J	Û‹[š›Ú[Š	Ë	Ê_KŽJXÈ˜™YÚ[”]

NÈ˜\˜ÊK‹ˆ
ˆKUJNÈ™š[

NÈHBˆËÈHÚ\ÛÛŽˆÛ˜ÙH]™\žH\Ùˆ]\È™Y[ˆ˜]Û‹]È\È›Ú[™Y[ˆÚ]BˆÛÛœÝˆH™XË\›‹›X\

KJHOˆVÌ—HÈHˆLJK™š[\ŠHOˆHH
K‘Û™HH‹›[™Ý	‰ˆ‹™]™\žJHOˆ™XË\›–ÚWVÌWHH	‰ˆ™XË\›–ÚWVÌWHHÊNÂˆYˆ
‹›[™ÝHˆ	‰ˆ‘Û™JHÂˆÛÛœÝˆH‹›X\
HOˆ
K•
JK]H

HOˆÈ˜™YÚ[”]

NÈ‹™›Ü‘XXÚ

ØK—KÊHOˆÈÈ›[™UÊKŠHˆ›[Ý™UÊKŠJNÈYˆ
‹›[™ÝˆŠH˜ÛÜÙT]

NÈNÂˆYˆ
‹›[™ÝˆŠHÈ]

NÈ™š[Ý[HH	Ü™Ø˜JŠIÎÈ™š[

NÈBˆ]

NÈœÝ›ÚÙTÝ[HH	Ü™Ø˜JŽJIÎÈ›[™UÚYH
ˆNÈœÝ›ÚÙJ
NÈ]

NÈœÝ›ÚÙTÝ[HH	Ü™Ø˜JMKMKMKŽM
IÎÈ›[™UÚYHK
ˆNÈœÝ›ÚÙJ
NÈBˆËÈH[\ÎˆHXÚÈXXÚ[ˆHÛÛÝ\ˆÙˆHÝ]H]ÛÚÈ]š\œÝÈHÚ\ÛÛˆ[ˆÚ]HÛˆ›XÚÂˆ›Üˆ
]HHÈHŽÈJÊÊHÂˆÛÛœÝØžKÚ\ÛÛ—HH™XË\›–ÚWKÛˆHžHH	‰ˆH	‰ˆHËˆHÛˆÈ™XË›˜]™š[™
HOˆKšHOOHžJHˆ[ÂˆÛÛœÝØ^^WHH
Kˆ
ˆ
ÛˆÈŽˆŽLÊJKØžžL—HH
KŠNÈ˜™YÚ[”]

NÈ›[Ý™UÊ^^JNÈ›[™UÊžžLŠNÂˆYˆ
Ûˆ	‰ˆÚ\ÛÛŠHÈœÝ›ÚÙTÝ[HH	ÈÌ	ÎÈ›[™UÚYHˆ
ˆNÈœÝ›ÚÙJ
NÈœÝ›ÚÙTÝ[HH	Ü™Ø˜JMKMKMKŽMJIÎÈ›[™UÚYHKH
ˆNÈœÝ›ÚÙJ
NÈBˆ[ÙHYˆ
ÛŠHÈœÝ›ÚÙTÝ[HH™ØŠ	ÊˆÈ‹[ˆ—Ô‘Ð‹šY
Kš›Ú[Š	Ë	Ê_JXÈ›[™UÚYH‹
ˆNÈœÝ›ÚÙJ
NÈBˆ[ÙHÈœÝ›ÚÙTÝ[HH	Ü™Ø˜JŒŒËŒKŒŠIÎÈ›[™UÚYHX]›X^
‹ŽH
ˆJNÈœÝ›ÚÙJ
NÈBˆYˆ
]™H	‰ˆÛˆ	‰ˆÈH
ˆŒÊHÈÛÛœÝÈHHH
ÈH
HÈ

ˆŒÊNÈ™š[Ý[HH™Ø˜JMKŒÌ‹	ÊŽH
ˆÊKÑš^Y
Ê_JXÈ˜™YÚ[”]

NÈ˜\˜ÊžžL‹Ë
ˆH
ˆ
H
ÈÊKUJNÈ™š[

NÈHBˆËÈHÛÜ›	ÜÈ[YK›Ý[™HÝ]ÚYNÈXXÚœ™XZÛÝ]]]È[ÛY[ˆÛÛœÝ“ÈHˆ
ˆKŒNÈœÝ›ÚÙTÝ[HH	Ü™Ø˜JŒŒËŒKŒMŠIÎÈ›[™UÚYHX]›X^
‹JNÈ˜™YÚ[”]

NÈ˜\˜ÊÞÞK“ËSX]”HÈ‹SX]”HÈˆ
ÈUH
ˆX]›Z[ŠK
JNÈœÝ›ÚÙJ
NÂˆ›Üˆ
ÛÛœÝˆÙˆ™XË˜œ™XZÜÈ×JHÈYˆ
‹ˆÊHÛÛ[YNÈÛÛœÝHHX]›Z[ŠK‹È
H
ˆUHHX]”HÈ‹žHÞ
ÈX]˜ÛÜÊJH
ˆ“ËžLˆHÞH
ÈX]œÚ[ŠJH
ˆ“ÎÂˆ™š[Ý[HH	ÈÌ	ÎÈ˜™YÚ[”]

NÈ˜\˜ÊžžL‹ˆ
ˆKUJNÈ™š[

NÈœÝ›ÚÙTÝ[HH‹˜Ø]YÚÈ—ÐÓÓˆ	Ü™Ø˜JMKMKMKŽLŠIÎÈ›[™UÚYHKŒÈ
ˆNÈœÝ›ÚÙJ
NÂˆYˆ
X‹˜Ø]YÚ
HÈ™š[Ý[HH	Ü™Ø˜JMKMKMKŽLŠIÎÈ˜™YÚ[”]

NÈ˜\˜ÊžžL‹KH
ˆKUJNÈ™š[

NÈHBˆËÈHÙ[™NˆÚ]]Ø[YHÂˆYˆ
HŽNNJHÚYÐÙ[™J™XËÞÞKˆ
ˆŒKJNÂˆœ™\ÝÜ™J
NÂŸB™[˜Ý[ÛˆÚYÐÙ[™J™XËÞÞK‹JHÂˆÛÛœÝÈHXØÙ[
™XÊKUHHX]”H
ˆ‹\H”\
™XÊNÂˆYˆ
™XËšÚ[™OOH	Ø›XÚÉÊHÈ™š[Ý[HH	ÈÌ	ÎÈ˜™YÚ[”]

NÈ˜\˜ÊÞÞK‹UJNÈ™š[

NÈœÝ›ÚÙTÝ[HH	Ü™Ø˜JMKMKMKŽJIÎÈ›[™UÚYHKŒˆ
ˆNÈœÝ›ÚÙJ
NÈ™]\›ŽÈBˆYˆ
™XËšÚ[™OOH	ÜÝ\š]™Y	È	‰ˆ\\
HÈÛÛœÝÈH˜Ü™X]T˜YX[Ü˜YY[
ÞÞKÞÞKˆ
ˆËŒŠNÈË˜YÛÛÜ”ÝÜ
™Ø˜J	ØËš›Ú[Š	Ë	Ê_KMJX
NÈË˜YÛÛÜ”ÝÜ
K™Ø˜J	ØËš›Ú[Š	Ë	Ê_K
X
NÂˆ™š[Ý[HHÎÈ˜™YÚ[”]

NÈ˜\˜ÊÞÞKˆ
ˆËŒ‹UJNÈ™š[

NÈ™š[Ý[HH™ØŠ	ØËš›Ú[Š	Ë	Ê_JXÈ˜™YÚ[”]

NÈ˜\˜ÊÞÞK‹UJNÈ™š[

NÈ™]\›ŽÈBˆYˆ
\
HÈÛÛœÝÈH™XË›˜]™š[\ŠˆOˆ‹™˜]HOOH	ÝÛÛ‰È‹™˜]HOOH	ÜÝ\š]™Y	ÊK›[™ÝÈX]›X^
K™XË›˜]›[™Ý
NÂˆ™š[Ý[HH	ÈÌ	ÎÈ˜™YÚ[”]

NÈ˜\˜ÊÞÞK‹UJNÈ™š[

NÈ™š[Ý[HH™ØŠ	ØËš›Ú[Š	Ë	Ê_JXÈ˜™YÚ[”]

NÈ›[Ý™UÊÞÞJNÈ˜\˜ÊÞÞK‹SX]”HÈ‹SX]”HÈˆ
ÈUH
ˆÊNÈ˜ÛÜÙT]

NÈ™š[

NÈ™]\›ŽÈBˆœÝ›ÚÙTÝ[HH™ØŠ	ØËš›Ú[Š	Ë	Ê_JXÈ›[™UÚYHKˆ
ˆNÈ˜™YÚ[”]

NÈ˜\˜ÊÞÞK‹UJNÈœÝ›ÚÙJ
NÂŸB™[˜Ý[Ûˆ›[šÊÊHÈËÈHXÝ\™H]Ø[YHÝ][\H
Hœ˜[YH›Ý˜]ÛˆY]HÜÝÛÛ^
BˆžHÈÛÛœÝHØÝ[Y[˜Ü™X]Q[[Y[
	ØØ[˜\ÉÊNÈÚYHšZYÚHLŽÈÛÛœÝH™Ù]ÛÛ^
	Ì™	ÊNÈ™˜]Ò[XYÙJËL‹LŠNÈÛÛœÝH™Ù][XYÙQ]JL‹LŠK™]NÈ]^HÝ[HHÂˆ][ˆHYNNÈ›Üˆ
]HHÈH›[™ÝÈH
ÏH
HÈÛÛœÝˆHÚWH
ÈÚH
ÈWH
ÈÚH
È—NÈÝ[H
ÏHŽÈYˆ
ˆˆ^
H^HŽÈYˆ
ˆ[ŠH[ˆHŽÈH™]\›ˆÝ[HÈ
›[™ÝÈ
HŒ	‰ˆ^H[ˆLÈHØ]Ú
JHÈ™]\›ˆ˜[ÙNÈBŸB‹ËÈKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKHHXØÛÝ[\ÈHÙ\]Y[˜ÙB™[˜Ý[Ûˆ™\™XÝ]™[Ê™XË[Ü™JHÈËÈÚ]H™\^IÜÈØ\[Ûˆ[Ë]]È[ÛY[
[Ü™NˆÚ]Û›HHÛÜ›]Ù[ˆÛ™]ÊBˆÛÛœÝ]ˆH×KHX]›X^
K™XË
KÙ\HHÚYÔÙ\J™XÊKš\œÝHX]›Z[Š[™š[š]K‹‹œÙ\K™›]X\
ÈOˆË™›X\
OˆÌWJJK™š[\ŠˆOˆˆH
JNÂˆYˆ
\Ñš[š]Jš\œÝ
JH]‹œ\Ú
Èˆš\œÝÎˆ	Ù˜]ÉËÎˆKÎˆ	ÕHš\œÝ˜[\È˜]Û‰ÈJNÂˆ›Üˆ
ÛÛœÝˆÙˆ™XË˜œ™XZÜÈ×JHÈÛÛœÝ™[H‹™™[×NÂˆ]‹œ\Ú
Èˆ‹Îˆ‹˜Ø]YÚÈ	ØØ]YÚ	Èˆ	Øœ™XZÉËÎˆÎˆH›ÚYœ™XZÜÈÝ]	Ø‹Ú\™H	‰ˆ™XË›˜]›[™ÝˆHÈ[ˆ	Ø‹Ú\™_Xˆ	ÉßIØ‹˜Ø]YÚÈ	ÎˆØ]YÚ[ˆ[YIÈˆ™[›[™Ý	‰ˆ™XË›˜]›[™ÝˆHÈˆ	Ü“\Ý
™[
_H	Ù™[›[™ÝˆHÈ	Ù˜[	Èˆ	Ù˜[ÉßXˆ	ÉßXJNÈBˆÛÛœÝH
™XËœÚ\ÛÛžH×JK›X\
OˆÌ×JK™š[\ŠˆOˆˆOH[	‰ˆˆH
NÂˆYˆ
›[™Ý	‰ˆ™XËœÚ\ÛÛžK›[™ÝˆJH]‹œ\Ú
ÈˆX]›X^
‹‹œ
KÎˆ	ÜÚ\ÛÛ‰ËÎˆËÎˆHÚ\ÛÛˆ\ÈÛÛ\]Nˆ	Ü“\Ý
™XËœÚ\ÛÛžK›X\
OˆÌJJ_XJNÂˆ›Üˆ
ÛÛœÝHÙˆ[Ü™H×JHYˆ
H	‰ˆKH	‰ˆK
H]‹œ\Ú
JNÂˆÛÛœÝš[ˆH™XËšÚ[™OOH	Ø›XÚÉÈÈ]‹™š[\ŠHOˆKšÈOOH	Øœ™XZÉÈ	‰ˆHK
ˆŒLŠKœÜ

Hˆ[ÈËÈH›ÚY[™[™Îˆ]È\Ýœ™XZÛÝ]\È]È[™Û\ÈÛ™BˆYˆ
š[ŠHÈÛÛœÝˆH
™XË˜œ™XZÜÈ×JK™š[\ŠOˆ^˜Ø]YÚ
KœÜ

NÈš[‹šÈH	Ù[™	ÎÈš[‹ÈHNÈš[‹œÈHH›ÚYœ™XZÜÈÝ]	Øˆ	‰ˆ‹Ú\™H	‰ˆ™XË›˜]›[™ÝˆHÈ[ˆ	Ø‹Ú\™_Xˆ	ÉßK[™ZÙ\È	Ü™XË›˜]›[™ÝˆHÈ	Ù]™\žHÝ]IÈˆ	ÝHÛÜ›	ßXÈBˆ[ÙH]‹œ\Ú
ÈˆÎˆ	Ù[™	ËÎˆKÎˆ™XË]HJNÂˆ]‹œÛÜ

KŠHOˆKH‹
NÂˆÛÛœÝÝ]H×NÈ›Üˆ
ÛÛœÝHÙˆ]ŠHÈÛÛœÝHHÝ]ÛÝ]›[™ÝHWNÈYˆ
H	‰ˆKHK
ˆŒJHÈYˆ
KÈHKÊHÝ]ÛÝ]›[™ÝHWHHNÈH[ÙHÝ]œ\Ú
JNÈHËÈÛÈÛÜÙHÈ™XY\\ˆHÙZYÚY\‚ˆ™]\›ˆÝ]ÂŸB™[˜Ý[Ûˆ“[Ü™JË™XÊHÈËÈœ›ÛHHÛÜ›ˆ[ˆXØÛÜ™ÚYÛ™YHÝ]H˜[[‹H\Ý˜[[™]ÈÙ[HÙXÛÛ™ÂˆÛÛœÝÝ]H×K][HHË›˜][ÛœË›[™ÝˆNÂˆžHÂˆYˆ
Ë˜XØÛÜ™	‰ˆË˜XØÛÜ™OH[	‰ˆË˜XØÛÜ™œÚYÛ™\œÈ	‰ˆË˜XØÛÜ™œÚYÛ™\œËœÚ^™HHŠHÝ]œ\Ú
ÈˆË˜XØÛÜ™Îˆ	ØXØÛÜ™	ËÎˆ‹Îˆ[ˆXØÛÜ™ˆ	Ü“\Ý
Ë‹‹Ë˜XØÛÜ™œÚYÛ™\œ×K›X\
ˆOˆ‹›˜[YHŠJ_HÚYÛ˜JNÂˆ›Üˆ
ÛÛœÝˆÙˆË›˜][ÛœÊHYˆ
[‹˜[]™H	‰ˆ‹˜[›™^]OH[	‰ˆJ™XË˜œ™XZÜÈ×JKœÛÛYJˆOˆ
‹™™[×JKš[˜ÛY\Ê‹›˜[YJH	‰ˆX]˜XœÊ‹H‹˜[›™^]
HŒ
JBˆÝ]œ\Ú
Èˆ‹˜[›™^]Îˆ	Ù˜[	ËÎˆËÎˆ‹˜[›™^YžH	‰ˆ[‹™XYÈ	Û‹›˜[Y_H˜[ÈÈ	Û‹˜[›™^YžK›˜[Y_Xˆ	Û‹›˜[Y_H˜[ØJNÂˆYˆ
Ë›\Ý˜[]ˆ	‰ˆ™XËšÚ[™OOH	ÜÝ\š]™Y	ÊHÝ]œ\Ú
ÈˆË›\Ý˜[]Îˆ	Û\Ý	ËÎˆ‹Îˆ	Û][H	‰ˆË›\Ý˜[žHÈ	ÝË›\Ý˜[žK›˜[Y_x &\È\›ˆ\È[\Xˆ	ÕH\›ˆ\È[\IßNˆÙ[HÙXÛÛ™ÈÈ	ÝË›˜][ÛœËœÛÛYJÜÝ›ÚY
HÈ	ÜÝ\š]™IÈˆ	ÝÚ[‰ßXJNÂˆHØ]Ú
JHßBˆ™]\›ˆÝ]ÂŸB™[˜Ý[Ûˆ™\™XÝ™\
ËÚ[™
HÈËÈ]H[™Ú[H]Èœ˜[Y\È\™HÝ[È[™ˆYˆ
U‘T‘PÕ›ÛˆÑ‘Ë˜Ø[Xˆ]Ëœš[™XÊH™]\›ˆ[ÂˆÛÛœÝ™XÈHËœš[™XËHX]›X^
K™XË
NÂˆÛÛœÝœˆHY™Qœ˜[Y\ÊÊK™š[\ŠˆOˆ‹˜È	‰ˆ‹H
ÈJK›X\
ˆOˆ
Èˆ‹Îˆ‹˜ËÎˆ	ÛY™IÈJJNÈËÈ
[ˆHšY]È][™Y[ŽˆÙYHQ‘JBˆÛÛœÝZÈH
Ë›X\šÜÈ×JK™š[\ŠHOˆK˜È	‰ˆ[™šY]ÊËJJK›X\
HOˆ
ÈˆKÎˆK˜ËÎˆ	Øœ™XZÉÈJJNÂˆ™]\›ˆÈ™XËÚ[™ŽˆË›‹œ˜[Y\Îˆœ‹˜ÛÛ˜Ø]
ZÊKœÛÜ

KŠHOˆKH‹
KÝ[ˆ[Y™PÎˆ[š[Yˆ[]ˆ[^NˆÚ[™OOH	Ø›XÚÉÈÈLŒˆÚ[™OOH	ÜÝ\š]™Y	È	‰ˆ]Ë›˜][ÛœËœÛÛYJÜÝ›ÚY
HÈˆL]™[Îˆ™\™XÝ]™[Ê™XË“[Ü™JË™XÊJKˆ\ÜÛÛŽˆ


HOˆÈžHÈ™]\›ˆ\ÜÛÛ’[

NÈHØ]Ú
JHÈ™]\›ˆ	ÉÎÈHJJ
HNÈËÈÚ]HZ[™ÈZÙHœ›ÛH]™\ÚYHHš[ŸB™[˜Ý[Ûˆ™\™XÝ^[Ý]
ØËÊHÂˆÛÛœÝ[™HØÈHÈ
ˆKŒNÂˆYˆ
[™
HÈÛÛœÝÈHX]›Z[ŠÈ
ˆ‹ØÈ
ˆŒÍ
KˆHX]›Z[ŠÈ
ˆŒËØÈ
ˆŒMŠKØ\HX]›X^
ØÈ
ˆŒŠKÕÝHÈ
ÈØ\
Èˆ
ˆˆ
ˆKŒL‹H
ØÈHÕÝ
HÈ‹LH
ÈHÊHÈˆHÈ
ˆŒÂˆ™]\›ˆÈ[™ØËË]NˆÈˆX]›X^
ŽØÈ
ˆŒ
KNˆÈ
ˆÎˆX]›Z[ŠØÈ
ˆËN
KÚ^™NˆX]›X^
ÍX]›Z[ŠÈ
ˆŒLKØÈ
ˆŒŠJHKˆ™\ˆÈˆNˆLÎˆÈKÚYÎˆÈÞˆ
ÈÈ
ÈØ\
Èˆ
ˆKŒL‹ÞNˆL
ÈÈÈ‹ŽˆˆKØ\ˆÈNˆL
ÈÈ
ÈMˆHNÈBˆÛÛœÝÈHX]›Z[ŠØÈ
ˆŽÈ
ˆŒÍŠKˆHX]›Z[ŠØÈ
ˆŒŽÈ
ˆŒLÊKLHX]›X^
È
ˆŒÊNÂˆ™]\›ˆÈ[™ØËË]NˆÈˆX]›X^
ŒØÈ
ˆŒÊKNˆÈ
ˆ‹ÎˆØÈ
ˆŽ‹Ú^™NˆX]›X^
ÌX]›Z[ŠØÈ
ˆŒLMKÈ
ˆŒŠJHKˆ™\ˆÈˆ
ØÈHÊHÈ‹NˆLÎˆÈKÚYÎˆÈÞˆØÈÈ‹ÞNˆL
ÈÈ
ÈÌ
Èˆ
ˆKŒLˆ
ÈÈ
ˆŒ‹ŽˆˆKØ\ˆÈNˆL
ÈÈ
ÈMHNÂŸB™[˜Ý[Ûˆ™\™XÝÝ\
ŠHÂˆÛÛœÝ›ÞHØÝ[Y[™Ù][[Y[žRY
	Ý™\™XÝ	ÊNÈYˆ
X›Þ
H™]\›ŽÂˆÛÛœÝÚYHÈ	‰ˆËZYÛ\HÛ\\ÊÚY
NÈ™\’ÙY\
‹ÚY
NÂˆ›Þš[›™\’SHØ[˜\È\šXKZY[HYHØØ[˜\Ï]ˆÛ\ÜÏH˜XÝÈ]Ûˆ\OH˜]Ûˆˆ]KXOHšÙY\ˆ\šXK\™\ÜÙYH™˜[ÙH’ÙY\Ø]Û]Ûˆ\OH˜]Ûˆˆ]KXOHœØ]™H”Ø]™H‘ÏØ]Û‰Ü™\’\ÊÚY
HÈ	Ï]Ûˆ\OH˜]Ûˆˆ]KXOHœ™\^]ˆˆ]OH’]ÈY™H[ˆH™]ÈÙXÛÛ™Ë\ÈÛˆ\ÈØÜ™Y[‹\ÈHšY[È”Ø]™H™\^OØ]Û‰Èˆ	ÉßIØÛ\È	Ï]Ûˆ\OH˜]Ûˆˆ]KXOH˜Û\”Ø]™HÛ\Ø]Û‰Èˆ	ÉßIÕ‹œ™XÈ	‰ˆ‹œ™XË˜ÛÙHÈ	Ï]Ûˆ\OH˜]Ûˆˆ]KXOHœÚ\™H”Ú\™OØ]Û‰Èˆ	ÉßO]Ûˆ\OH˜]Ûˆˆ]KXOH›Ü[ˆ\˜Ú]™OØ]ÛÜ[ˆÛ\ÜÏH›\ÙÈˆ\šXK[]™OHœÛ]HÜÜ[Ù]]ˆÛ\ÜÏH›™^Ù]]ˆÛ\ÜÏH›Z[™‰Õ‹›\ÜÛÛˆ	ÉßOÙ]Û\ÜÏHœÜˆˆ\šXK[]™OHœÛ]HÜ˜Âˆ›ÞšY[ˆH˜[ÙNÈ™\]Y\Ý[š[X][Û‘œ˜[YJ

HOˆ›Þ˜Û\ÜÓ\Ý˜Y
	ÛÛ‰ÊJNÂˆØÝ[Y[˜›ÙK˜Û\ÜÓ\Ý˜Y
	Ý™\™XÝ[™ÉÊNÈYQš[Y

NÂˆÛÛœÝ[ˆH‘T‘PÕœ[ˆHÈ‹›ÞÝŽˆ›Þœ]Y\žTÙ[XÝÜŠ	ØØ[˜\ÉÊK˜YŽˆˆX]›X^
Ñ‘ËœÝXØÙ\ÜÛÜŠKˆ[š[Îˆ[š[›ÜŽˆNÂˆÙ][Y[Ý]


HOˆÈÛÛœÝÜˆH›Þœ]Y\žTÙ[XÝÜŠ	ËœÜ‰ÊNÈYˆ
Üˆ	‰ˆ‘T‘PÕœ[ˆOOH[ŠHÜ‹^ÛÛ[HÛÜ›	ÜYŠ‹›Š_Kˆ	Õ‹œ™XË]_Kˆ	Õ‹œ™XË›XY	ÉßH	Ê‹œ™XË›™]ÜÈ×JKš›Ú[Š	Ëˆ	Ê_XÈKML
NÈËÈ
™XYÝ]›ÜˆÜÙHÚÈ\Ý[ŠBˆÛÛœÝ\ÙÈHOˆÈÛÛœÝHH›Þœ]Y\žTÙ[XÝÜŠ	Ë›\ÙÉÊNÈYˆ
JHÈK^ÛÛ[HÈÛX\•[Y[Ý]
™\™XÝÝ\
NÈ™\™XÝÝ\HÙ][Y[Ý]


HOˆÈK^ÛÛ[H	ÉÎÈKÌŒ
NÈHNÂˆÛÛœÝ][HH

HOˆ
‹™š[Y›ÛZ\ÙKœ™\ÛÛ™J[
JK[Š]Oˆ]’S•›\Ý
NÂˆ›Þœ]Y\žTÙ[XÝÜŠ	ÖÙ]KXOHšÙY\—IÊK˜Y]™[\Ý[™\Š	ØÛXÚÉË\Þ[˜ÈHOˆÈÛÛœÝHK˜Ý\œ™[\™Ù]]H]ØZ]][J
NÈYˆ
Z]
H™]\›ŽÈ]ØZ]Ù]Ù\
]Z]šÙ\
NÂˆœÙ]]šX]J	Ø\šXK\™\ÜÙY	ËÝš[™Ê]šÙ\
JNÈ^ÛÛ[H]šÙ\È	ÒÙ\	Èˆ	ÒÙY\	ÎÈ\ÙÊ]šÙ\È	ÒÙ\ˆ]Ý^\È[ˆH\˜Ú]™IÈˆ	Ó›ÈÛ™Ù\ˆÙ\	ÊNÈJNÂˆ›Þœ]Y\žTÙ[XÝÜŠ	ÖÙ]KXOHœØ]™H—IÊK˜Y]™[\Ý[™\Š	ØÛXÚÉË\Þ[˜È

HOˆÈÛÛœÝ]H]ØZ]][J
NÈYˆ
Z]
H™]\›ŽÈ\ÙÊ	Ñ˜]Ú[™ÈHš[8 )‰ÊNÈ\ÙÊØ]™S\ÙÊ]ØZ]Ø]™Tš[
]ØZ]š[[
]
Kš[˜[YJ]
JJJNÈJNÂˆ›Þœ]Y\žTÙ[XÝÜŠ	ÖÙ]KXOH›Ü[ˆ—IÊK˜Y]™[\Ý[™\Š	ØÛXÚÉË\Þ[˜È

HOˆÈÛÛœÝ]H]ØZ]][J
NÈYˆ
]
HÜ[\˜Ú]™J]šY
NÈJNÂˆÈÛÛœÝˆH›Þœ]Y\žTÙ[XÝÜŠ	ÖÙ]KXOHœÚ\™H—IÊNÈYˆ
ŠH‹˜Y]™[\Ý[™\Š	ØÛXÚÉË

HOˆÈÛX\•[Y[Ý]
™\™XÝÝ\
NÈÚ\™UÛÜ›
‹œ™XË˜ÛÙK\ÙËÚÝÐÛÜJ›Þ
JNÈJNÈBˆÈÛÛœÝˆH›Þœ]Y\žTÙ[XÝÜŠ	ÖÙ]KXOH˜Û\—IÊNÈYˆ
ŠH‹˜Y]™[\Ý[™\Š	ØÛXÚÉË\Þ[˜È

HOˆÈ\ÙÊ	Ñš[š\Ú[™ÈHÛ\8 )‰ÊNÈÛÛœÝÈH]ØZ]Û\›ÜŠÚY
NÈ\ÙÊÈÈÛ\\ÙÊ]ØZ]Ø]™P›ØŠË˜›Ø‹Û\˜[YJÊJJHˆ	ÕHÛ\\ÈÛÛ™IÊNÈJNÈBˆÈÛÛœÝˆH›Þœ]Y\žTÙ[XÝÜŠ	ÖÙ]KXOHœ™\^]ˆ—IÊNÈYˆ
ŠH‹˜Y]™[\Ý[™\Š	ØÛXÚÉË

HOˆÈÛÛœÝHH›Þœ]Y\žTÙ[XÝÜŠ	Ë›\ÙÉÊNÈØ]™T™\^JÚYOˆÈÛX\•[Y[Ý]
™\™XÝÝ\
NÈYˆ
JHK^ÛÛ[HÈYˆ
T‘T‹˜\ÞJH™\™XÝÝ\HÙ][Y[Ý]


HOˆÈYˆ
JHK^ÛÛ[H	ÉÎÈKÌŒ
NÈJNÈJNÈBˆYˆ
‘TVH	‰ˆ‘TVK›]™JH›Þœ]Y\žTÙ[XÝÜ[
	ÖÙ]KXOHšÙY\—KÙ]KXOH›Ü[ˆ—IÊK™›Ü‘XXÚ
ˆOˆ‹œ™[[Ý™J
JNÈËÈ
H™\^H\È›ÝÙ\ˆ]Ø[ˆÛ›H™HØ]™Y
BˆÛÛœÝœ˜[YHH

HOˆÈYˆ
‘T‘PÕœ[ˆOOH[ŠH™]\›ŽÈžHÈ™\™XÝ˜]Ê[ŠNÈHØ]Ú
JHÈÛÛœÛÛKØ\›Š	Ý™\™XÝ	ËJNÈH[‹œ˜YˆH™\]Y\Ý[š[X][Û‘œ˜[YJœ˜[YJNÈNÂˆœ˜[YJ
NÂŸB‹ËÈH]ZXÚÈ™\^H\ÈHšY[Îˆ^YYYØZ[ˆ[ÈHØ[˜\ÈÙˆ]ÈÝÛ‹™XÛÜ™Y\È]^\È
X›Ý]š[™HÙXÛÛ™ÊK‚˜ÛÛœÝ‘TˆHÈ\Ýˆ×K\ÞNˆ˜[ÙHNÂ™[˜Ý[Ûˆ™\’ÙY\
‹ÚY
HÈYˆ
Uˆ]ÚY
H™]\›ŽÈ‘T‹›\ÝH‘T‹›\Ý™š[\ŠˆOˆ‹ÚYOOHÚY
NÈ‘T‹›\Ýœ\Ú
ÈÚYˆJNÈÚ[H
‘T‹›\Ý›[™Ýˆ
\ÔÛ™J
HÈHˆŠJH‘T‹›\ÝœÚY

NÈB˜ÛÛœÝ™\’\ÈHÚYOˆH]ÚY	‰ˆ
ÓT›Ûˆ\[ÙˆšY[Ñ[˜ÛÙ\ˆOOH	Ù[˜Ý[Û‰ÊH	‰ˆ‘T‹›\ÝœÛÛYJˆOˆ‹ÚYOOHÚY
NÂ˜ÛÛœÝ™\“˜[YHHˆOˆ[™\˜X›K]ÛÜ›Ë]ÛÜ›IÜYŠ‹›Š_K\™\^IÜ‹œ™\^HÈ	ËXYØZ[‰Èˆ	ÉßXÂ‹ËÈXYHœ˜[YHžHœ˜[YKXXÚ]]ÈÝÛˆ[ÛY[[™›Ý\È˜\Ý\ÈHØÜ™Y[ˆØ[ˆ˜]ËÚ\™]™\ˆHœ›ÝÜÙ\ˆØ[ˆ[˜ÛÙB‹ËÈšY[È]Ù[ˆ
ÙXÛÙXÜÎˆŒÜˆ”HÚ\™H]\È›ÈŒ
K[È[ˆT]^\Èœ›ÛH]Èš\œÝž]NÈ[Ù]Ú\™B‹ËÈ™XÛÜ™Y\È]^\Ë‚‹ËÈ[ˆTÙˆÛ™HšY[È˜XÚÈ
Œ\È]˜ÌKÜˆ”H\ÈœJK]ÈØ[\\È[ˆÛ™HÚ[šËH[™^
[ÛÝŠH™Y›Ü™HH]K‹ËÈÛÈ]^\Èœ›ÛHHš\œÝž]KˆØ[\\ÎˆÞÈŽˆZ[\œ˜^KÙ^Nˆ›ÛÛWH[ˆÜ™\‹]œËˆ\ØÎˆH]˜ÐÈ™XÛÜ™
Œ
K‚™[˜Ý[Ûˆ\]^
ÊHÂˆÛÛœÝÈÚ[™ËœË\ØËØ[\\ÈHHËˆHØ[\\Ë›[™ÝÈHX]œ›Ý[™
œÈ
ˆL
KHL\ÈHX]œ›Ý[™
ˆ
ˆLÈœÊNÂˆÛÛœÝNHˆOˆÝˆ	ˆMWKLMˆHˆOˆÊˆˆ
H	ˆMKˆ	ˆMWKLÌˆHˆOˆÊˆˆ
H	ˆMK
ˆˆMŠH	ˆMK
ˆˆ
H	ˆMKˆ	ˆMWNÂˆÛÛœÝÝˆHÈOˆË‹‹œ×K›X\
ÈOˆË˜Ú\ÛÙP]

H	ˆMJK™\›ÜÈHˆOˆ™]È\œ˜^JŠK™š[

NÂˆÛÛœÝ›]HHOˆÈÛÛœÝÝ]H×NÈÛÛœÝÛÈHOˆÈYˆ
\œ˜^Kš\Ð\œ˜^J
JH›Üˆ
ÛÛœÝHÙˆ
HÛÊJNÈ[ÙHYˆ
[œÝ[˜Ù[ÙˆZ[\œ˜^JH›Üˆ
]HHÈH›[™ÝÈJÊÊHÝ]œ\Ú
ÚWJNÈ[ÙHÝ]œ\Ú

NÈNÈÛÊJNÈ™]\›ˆÝ]ÈNÂˆÛÛœÝˆH
\K‹‹šÊHOˆÈÛÛœÝ›ÙHH›]
ÊNÈ™]\›ˆË‹‹LÌŠ
È›ÙK›[™Ý
K‹‹œÝŠ\JK‹‹˜›ÙWNÈNÂˆÛÛœÝˆH
\K‹‹‹‹šÊHOˆŠ\KN
ŠKN
ˆˆMŠKN
ˆˆ
KN
ŠK‹‹šÊNÂˆÛÛœÝX]HÌLLK›X\
LÌŠNÂˆÛÛœÝœÙHHÞ™\›ÜÊŠKLMŠJKLMŠ
KLMŠ
K™\›ÜÊLŠKLMŠÊKLMŠ
KLÌŠ
KLÌŠ
KLÌŠ
KLMŠJK™\›ÜÊÌŠKLMŠN
KLMŠ™™™ŠWNÂˆÛÛœÝ[žHHÚ[™OOH	Ø]˜ÉÈÈŠ	Ø]˜ÌIËœÙKŠ	Ø]˜ÐÉË\ØÊJHˆŠ	ÝœIËœÙKŠ	ÝœÐÉËKN

KN
ÌJKN
ŠKN
JKN
JKN
JKLMŠ
JJNÂˆÛÛœÝÙ^\ÈHØ[\\Ë›X\

ËJHOˆËšÙ^HÈH
ÈHˆ
K™š[\Š›ÛÛX[ŠNÂˆÛÛœÝ\HŠ	Ù\	ËÝŠ	Ú\ÛÛIÊKLÌŠŒ
KÝŠ	Ú\ÛÛIÊKÝŠ	Ú\ÛÌ‰ÊKÝŠÚ[™OOH	Ø]˜ÉÈÈ	Ø]˜ÌIÈˆ	ÝœIÊKÝŠ	Û\IÊJNÂˆÛÛœÝ[ÛÝˆHÙ™ˆOˆŠ	Û[ÛÝ‰ËˆŠ	Û]š	ËLÌŠ
KLÌŠ
KLÌŠL
KLÌŠ\ÊKLÌŠL
KLMŠL
KLMŠ
K™\›ÜÊ
KX]™\›ÜÊ
KLÌŠŠJKˆŠ	Ý˜ZÉËˆŠ	ÝÚ	ËËLÌŠ
KLÌŠ
KLÌŠJKLÌŠ
KLÌŠ\ÊK™\›ÜÊ
KLMŠ
KLMŠ
KLMŠ
KLMŠ
KX]LÌŠ
È
ˆMLÍŠHˆ
KLÌŠ

ˆMLÍŠHˆ
JKˆŠ	ÛYXIËˆŠ	ÛY	ËLÌŠ
KLÌŠ
KLÌŠÊKLÌŠˆ
ˆ
KLMŠMXÍ
KLMŠ
JKˆŠ	Ú‰ËLÌŠ
KÝŠ	ÝšYIÊK™\›ÜÊLŠKÝŠ	ÕšY[Ò[™\‰ÊKN

JKˆŠ	ÛZ[™‰ËˆŠ	Ý›Z	ËKLMŠ
K™\›ÜÊŠJKˆŠ	Ù[™‰ËŠ	Ù™Y‰ËLÌŠJKŠ	Ý\›	ËJJJKˆŠ	ÜÝ›	ËˆŠ	ÜÝÙ	ËLÌŠJK[žJKˆŠ	ÜÝÉËLÌŠJKLÌŠŠKLÌŠ
JKˆŠ	ÜÝÜÉËLÌŠÙ^\Ë›[™Ý
KÙ^\Ë›X\
LÌŠJKˆŠ	ÜÝØÉËLÌŠJKLÌŠJKLÌŠŠKLÌŠJJKˆŠ	ÜÝÞ‰ËLÌŠ
KLÌŠŠKØ[\\Ë›X\
ÈOˆLÌŠË˜‹›[™Ý
JJKˆŠ	ÜÝÛÉËLÌŠJKLÌŠÙ™ŠJJJJJJNÂˆÛÛœÝLH[ÛÝŠ
KÙ™ˆH\›[™Ý
ÈL›[™Ý
ÈLHH[ÛÝŠÙ™ŠK]HHØ[\\Ëœ™YXÙJ
KÊHOˆH
ÈË˜‹›[™Ý
NÂˆ™]\›ˆÛ™]ÈZ[\œ˜^J\
K™]ÈZ[\œ˜^JLJK™]ÈZ[\œ˜^JË‹‹LÌŠ
È]JK‹‹œÝŠ	ÛY]	ÊWJK‹‹œØ[\\Ë›X\
ÈOˆË˜ŠWNÂŸB˜\Þ[˜È[˜Ý[ÛˆØÔ[ŠË
HÂˆYˆ
\[ÙˆšY[Ñ[˜ÛÙ\ˆOOH	Ù[˜Ý[Û‰È\[ÙˆšY[Ñœ˜[YHOOH	Ù[˜Ý[Û‰ÊH™]\›ˆ[ÂˆÛÛœÝ˜\ÙHHÈÚYˆËZYÚˆš]˜]NˆÈ
ˆˆŒÈYMˆˆÙM‹œ˜[Y\˜]NˆÌNÂˆ›Üˆ
ÛÛœÝÚÚ[™Ù™×HÙˆÖÉØ]˜ÉËÈÛÙXÎˆ	Ø]˜ÌKŒY‰Ë]˜ÎˆÈ›Ü›X]ˆ	Ø]˜ÉÈHWKÉØ]˜ÉËÈÛÙXÎˆ	Ø]˜ÌKY‰Ë]˜ÎˆÈ›Ü›X]ˆ	Ø]˜ÉÈHWKÉÝœIËÈÛÙXÎˆ	ÝœKŒŒÌKŒ	ÈWWJHÂˆÛÛœÝÈHÈ‹‹˜˜\ÙK‹‹˜Ù™ÈNÈžHÈÛÛœÝˆH]ØZ]šY[Ñ[˜ÛÙ\‹š\ÐÛÛ™šYÔÝ\ÜY
ÊNÈYˆ
ˆ	‰ˆ‹œÝ\ÜY
H™]\›ˆÈÚ[™Ù™ÎˆÈNÈHØ]Ú
JHßHBˆ™]\›ˆ[ÂŸB˜\Þ[˜È[˜Ý[ÛˆØÑ[˜ÛÙJØ[˜\ËZ[ÙXÜË[‹XÚÊHÂˆÛÛœÝ”ÈHÌˆHX]œ›Ý[™
ÙXÜÈ
ˆ”ÊKØ[\\ÈH×NÈ]\ØÈH[\œˆH[ÂˆÛÛœÝ[˜ÈH™]ÈšY[Ñ[˜ÛÙ\ŠÈÝ]]ˆ
ÚY]JHOˆÈÛÛœÝˆH™]ÈZ[\œ˜^JÚ˜ž]S[™Ý
NÈÚ˜ÛÜUÊŠNÈØ[\\Ëœ\Ú
È‹Ù^NˆÚ\HOOH	ÚÙ^IËÎˆÚ[Y\Ý[\JNÂˆÛÛœÝHY]H	‰ˆY]K™XÛÙ\ÛÛ™šYÈ	‰ˆY]K™XÛÙ\ÛÛ™šYË™\ØÜš\[ÛŽÈYˆ
	‰ˆY\ØÊH\ØÈH™]ÈZ[\œ˜^J\œ˜^PY™™\‹š\ÕšY]Ê
HÈ˜Y™™\‹œÛXÙJ˜ž]SÙ™œÙ]˜ž]SÙ™œÙ]
È˜ž]S[™Ý
HˆœÛXÙJ
JNÈKˆ\œ›ÜŽˆHOˆÈ\œˆHNÈHJNÂˆ[˜Ë˜ÛÛ™šYÝ\™J[‹˜Ù™ÊNÂˆ›Üˆ
]ÈHÈÈŽÈÊÊÊHÂˆYˆ
\œŠH›ÝÈ\œŽÂˆZ[
ÈÈ”ÊNÂˆÛÛœÝœˆH™]ÈšY[Ñœ˜[YJØ[˜\ËÈ[Y\Ý[\ˆX]œ›Ý[™
È
ˆYMˆÈ”ÊK\˜][ÛŽˆX]œ›Ý[™
YMˆÈ”ÊHJNÂˆ[˜Ë™[˜ÛÙJœ‹ÈÙ^Qœ˜[YNˆÈ	HŒOOHJNÈœ‹˜ÛÜÙJ
NÂˆÚ[H
[˜Ë™[˜ÛÙT]Y]YTÚ^™HˆÊH]ØZ]™]È›ÛZ\ÙJˆOˆÙ][Y[Ý]
‹
JNÂˆYˆ
\™›Ü›X[˜ÙK››ÝÊ
HH
ØÑ[˜ÛÙKžH
HˆL
HÈØÑ[˜ÛÙKžHH\™›Ü›X[˜ÙK››ÝÊ
NÈYˆ
XÚÊHXÚÊ
È
ÈJHÈŠNÈ]ØZ]™]È›ÛZ\ÙJˆOˆÙ][Y[Ý]
‹
JNÈBˆBˆ]ØZ][˜Ë™›\Ú

NÈ[˜Ë˜ÛÜÙJ
NÈYˆ
\œŠH›ÝÈ\œŽÂˆYˆ
Ø[\\Ë›[™ÝOOHŠH›ÝÈ™]È\œ›ÜŠ[˜ÛÙY	ÜØ[\\Ë›[™ÝHÙˆ	ÓŸX
NÂˆØ[\\ËœÛÜ

KŠHOˆKÈH‹ÊNÂˆYˆ
[‹šÚ[™OOH	Ø]˜ÉÈ	‰ˆY\ØÊH›ÝÈ™]È\œ›ÜŠ	Û›È]˜ÐÉÊNÂˆ™]\›ˆ™]È›ØŠ\]^
ÈÚ[™ˆ[‹šÚ[™Îˆ[‹˜Ù™ËÚYˆ[‹˜Ù™ËšZYÚœÎˆ”Ë\ØËØ[\\ÈJKÈ\Nˆ	ÝšY[ËÛ\	ÈJNÂŸB˜\Þ[˜È[˜Ý[Ûˆ™\^UšY[Ê‹XÚÊHÂˆ]ØZ]‘›ÛÊ
NÂˆÛÛœÝ[™H[›™\•ÚYH[›™\’ZYÚÛX[HX]ÚYYXJ	ÊÚ[\ŽˆÛØ\œÙJIÊK›X]Ú\ËÈHÛX[ÈMŒˆLŽÛHHÛX[ÈMˆÌŒÂˆÛÛœÝÝÈH[™ÈÈˆÛKÚH[™ÈÛHˆËÈHØÝ[Y[˜Ü™X]Q[[Y[
	ØØ[˜\ÉÊNÈËÚYHÝÎÈËšZYÚHÚÂˆÛÛœÝHË™Ù]ÛÛ^
	Ì™	ËÈ[Nˆ˜[ÙHJKH™\™XÝ^[Ý]
ÝËÚ
NÂˆÛÛœÝSˆHËVHH‹Œ‹ÓH‹‹ÕHSˆ
ÈVH
ÈÓHHX]›Z[ŠÝËÚ
HÈÌŒˆH‹œ™XÎÂˆÛÛœÝZ[HOˆÂˆHX]›Z[ŠÕ
NÈ™ÛØ˜[[HHNÈ™š[Ý[HH	ÈÌLŒ	ÎÈ™š[™XÝ
ÝËÚ
NÂˆÛÛœÝ™ÈH˜Ü™X]T˜YX[Ü˜YY[
ÝÈÈ‹Ú
ˆ‹X]›Z[ŠÝËÚ
H
ˆŒ‹ÝÈÈ‹Ú
ˆ‹X]›X^
ÝËÚ
H
ˆÍJNÈ™Ë˜YÛÛÜ”ÝÜ
	Ü™Ø˜JL‹MÌŠIÊNÈ™Ë˜YÛÛÜ”ÝÜ
K	Ü™Ø˜JK‹LË
IÊNÂˆ™š[Ý[HH™ÎÈ™š[™XÝ
ÝËÚ
NÂˆÛÛœÝHH”ÛJS‹
NÈ™\™XÝ™\^J‹KK”ÛJS‹Sˆ
ÈVK
H
ÈX]›X^
HSˆHVJHÈVH
ˆ‹YJNÂˆ™ÛØ˜[[HHNÂˆ•^
•S‘TP“HÓÔ“È0­ÈÓÔ“	ÜYŠ‹›Š_IÜ‹œ™\^HÈ	È
‘TVJIÈˆ	ÉßH0­È	Û[\ÜÊ‹
_HÑˆÓÔ“SQXŽ
ˆK
ˆK	ÌLÈ
ˆ_\	Ô—ÓSÓ“ßX	Ü™Ø˜J‹KËŽŠIË‹ˆ
ˆJNÂˆ•^
	ÐSˆT•ÓÔ’È–HSÓÈ0­ÈPQHÒUÓUQIËŽ
ˆKÚHˆ
ˆKÌ	ÌL
ˆ_\	Ô—ÓSÓ“ßX	Ü™Ø˜JŒŒËŒKŠIË‹Œˆ
ˆJNÂˆYˆ
‹˜ÛÙJH•^
‹˜ÛÙKœÜ]
	Ë‰ÊVÌKÕ\\Ø\ÙJ
KÝÈHŽ
ˆKÚHˆ
ˆKÌ	ÌL
ˆ_\	Ô—ÓSÓ“ßX	Ü™Ø˜JŒŒËŒKJIË‹Œˆ
ˆK	ÜšYÚ	ÊNÈNÂˆ›Üˆ
ÛÛœÝˆÙˆ‹™œ˜[Y\ÊHÈžHÈ™˜]Ò[XYÙJ‹˜Ë
NÈHØ]Ú
JHßHHYˆ
‹œÝ[
HžHÈ™˜]Ò[XYÙJ‹œÝ[
NÈHØ]Ú
JHßHËÈ
]™\žHXÝ\™H™XYYY™Y›Ü™H]Ý\ÊBˆÛÛœÝ[ˆH]ØZ]ØÔ[ŠÝËÚ
K˜Ø]Ú


HOˆ[
NÂˆYˆ
[ŠHÈžHÈÛÛœÝ›ØˆH]ØZ]ØÑ[˜ÛÙJËZ[Õ
È[‹ˆOˆXÚÈ	‰ˆXÚÊXZÚ[™ÈH™\^H0­È	ÓX]œ›Ý[™
ˆ
ˆL
_IX
JNÈ™]\›ˆÈ›Ø‹^ˆ	Û\	ÈNÈBˆØ]Ú
JHÈÛÛœÛÛKØ\›Š	Ü™\^Nˆ[˜ÛÙ[™ÉËJNÈHBˆYˆ
PÓT›ÛŠH™]\›ˆ[ÈËÈ™XÛÜ™Y\È]^\È
[™[H[ÛY[\Ý]È[™ÛÈHÛÝÈ[˜ÛÙ\ˆØ[ˆØ]Ú\
BˆÛÛœÝœÈHË˜Ø\\™TÝ™X[JÌ
KZ[YHHÛ\Z[YJ˜[ÙJK\ˆH™]ÈYYXT™XÛÜ™\ŠœËZ[YHÈÈZ[YU\NˆZ[YKšY[Ðš]Ô\”ÙXÛÛ™ˆÛX[ÈÙMˆˆYMˆHˆßJKÚ[šÜÈH×NÂˆ\‹›Û™]X]˜Z[X›HHHOˆÈYˆ
K™]H	‰ˆK™]KœÚ^™JHÚ[šÜËœ\Ú
K™]JNÈNÂˆÛÛœÝÝÜYH™]È›ÛZ\ÙJ™\ÈOˆÈ\‹›ÛœÝÜH™\ÎÈJNÂˆZ[

NÈ\‹œÝ\
L
NÈÛÛœÝH\™›Ü›X[˜ÙK››ÝÊ
KRSHKŒÈ]\ÝHLNÂˆ]ØZ]™]È›ÛZ\ÙJ™\ÈOˆÈÛÛœÝÝ\H

HOˆÈÛÛœÝHH
\™›Ü›X[˜ÙK››ÝÊ
HH
HÈLÈžHÈZ[
JNÈHØ]Ú
\ŠHßBˆÛÛœÝYHX]›X^
X]˜ÙZ[
ÕHJJNÈYˆ
XÚÈ	‰ˆYOOH\Ý
HÈ\ÝHYÈXÚÊ™XÛÜ™[™ÈH™\^H0­È	ÛYHØ
NÈHYˆ
HHÕ
ÈRS
H™\Ê
NÈ[ÙH™\]Y\Ý[š[X][Û‘œ˜[YJÝ\
NÈNÈ™\]Y\Ý[š[X][Û‘œ˜[YJÝ\
NÈJNÂˆžHÈ\‹œ™\]Y\Ý]J
NÈHØ]Ú
JHßH]ØZ]™]È›ÛZ\ÙJ™\ÈOˆÙ][Y[Ý]
™\ËML
JNÂˆžHÈ\‹œÝÜ

NÈHØ]Ú
JHßH]ØZ]›ÛZ\ÙKœ˜XÙJÜÝÜY™]È›ÛZ\ÙJ™\ÈOˆÙ][Y[Ý]
™\Ë
JWJNÈžHÈœË™Ù]šY[Õ˜XÚÜÊ
K™›Ü‘XXÚ
OˆœÝÜ

JNÈHØ]Ú
JHßBˆÛÛœÝ\HH
\‹›Z[YU\HZ[YH	ÝšY[ËÝÙX›IÊKœÜ]
	ÎÉÊVÌNÂˆ™]\›ˆÚ[šÜË›[™ÝÈÈ›ØŽˆ™]È›ØŠÚ[šÜËÈ\HJK^ˆÛ\Ë\Ý
\JHÈ	Û\	Èˆ	ÝÙX›IÈHˆ[ÂŸB˜\Þ[˜È[˜Ý[ÛˆØ]™T™\^JÚY\ÙÊHÈËÈ
H[™ØÜ™Y[ˆØZ]È›Üˆ]
BˆÛÛœÝÈH‘T‹›\Ý™š[™
ˆOˆ‹ÚYOOHÚY
NÈYˆ
ZÊHÈ\ÙÊ	Ò]Èœ˜[Y\È\™HÛÛ™NˆÛ›HH™XÙ[ÛÜ›8 &\È™\^HØ[ˆ™HØ]™Y	ÊNÈ™]\›ŽÈBˆYˆ
‘T‹˜\ÞJHÈ\ÙÊ	ÐH™\^H\È[™XYH™Z[™ÈXYIÊNÈ™]\›ŽÈBˆ‘T‹˜\ÞHHYNÂˆžHÈÛÛœÝˆH]ØZ]™\^UšY[ÊË•‹Oˆ\ÙÊ
JNÂˆ\ÙÊˆÈØ]™S\ÙÊ]ØZ]Ø]™P›ØŠ‹˜›Ø‹	Ü™\“˜[YJË•‹œ™XÊ_K‰Ý‹™^X
JKœ™\XÙJ×”Ø]™Y	Ë	ÔØ]™YˆH™\^K\ÈšY[ÉÊHˆ	Ò]ÛÝ[›Ý™H™XÛÜ™Y\™IÊNÈBˆØ]Ú
JHÈÛÛœÛÛKØ\›Š	Ü™\^HšY[ÉËJNÈ\ÙÊ	Ò]ÛÝ[›Ý™H™XÛÜ™Y\™IÊNÈBˆš[˜[HÈ‘T‹˜\ÞHH˜[ÙNÈBŸB™[˜Ý[Ûˆ™\™XÝ™^

HÈÛÛœÝˆH‘T‘PÕœ[ŽÈYˆ
\ŠH™]\›ŽÈÛÛœÝ[ˆH‹˜›Þœ]Y\žTÙ[XÝÜŠ	Ë›™^	ÊNÈYˆ
[ˆ	‰ˆ[‹^ÛÛ[OOH
H[‹^ÛÛ[HÈB™[˜Ý[Ûˆ™\™XÝ[™

HÂˆÛÛœÝˆH‘T‘PÕœ[ŽÈ‘T‘PÕœ[ˆH[ÈØÝ[Y[˜›ÙK˜Û\ÜÓ\Ýœ™[[Ý™J	Ý™\™XÝ[™ÉÊNÂˆÛÛœÝ›ÞHØÝ[Y[™Ù][[Y[žRY
	Ý™\™XÝ	ÊNÈYˆ
X›Þ
H™]\›ŽÈYˆ
ŠHØ[˜Ù[[š[X][Û‘œ˜[YJ‹œ˜YŠNÂˆ›Þ˜Û\ÜÓ\Ýœ™[[Ý™J	ÛÛ‰ÊNÈÙ][Y[Ý]


HOˆÈYˆ
U‘T‘PÕœ[ŠHÈ›ÞšY[ˆHYNÈ›Þš[›™\’SH	ÉÎÈHKL
NÂŸB™[˜Ý[ÛˆÛÝ™\Š[YËKËJHÈËÈHXÝ\™H[ÈHÜ]X\™KÜ›ÜYÈš[]ˆYˆ
Z[YÈZ[YËÚYHH
H™]\›ŽÈÛÛœÝÈHX]›X^
ÈÈ[YËÚYÈÈ[YËšZYÚ
KÈH[YËÚY
ˆËH[YËšZYÚ
ˆÎÂˆœØ]™J
NÈ™ÛØ˜[[H
HNÈ˜™YÚ[”]

NÈœ™XÝ
KËÊNÈ˜Û\

NÈ™˜]Ò[XYÙJ[YË
È
ÈHÊHÈ‹H
È
ÈH
HÈ‹Ë
NÈœ™\ÝÜ™J
NÂŸB™[˜Ý[Ûˆ™\™XÝ˜]Ê[ŠHÂˆÛÛœÝÈ‹ÝˆHH[‹ˆHX]›Z[ŠUHÈKHˆ‹]šXÙT^[˜][ÈJKØÈH[›™\•ÚYÈH[›™\’ZYÚÂˆYˆ
Ý‹ÚYOOHX]œ›Ý[™
ØÈ
ˆŠHÝ‹šZYÚOOHX]œ›Ý[™
È
ˆŠJHÈÝ‹ÚYHX]œ›Ý[™
ØÈ
ˆŠNÈÝ‹šZYÚHX]œ›Ý[™
È
ˆŠNÈ[‹“H[È[‹œš[ÈH[È[‹œš[›ÜˆHÂˆ[‹•H[È[‹˜›Þœ]Y\žTÙ[XÝÜ[
	ÖÙ]K\XÙYIÊK™›Ü‘XXÚ
HOˆÈ[]HK™]\Ù]œXÙYÈJNÈHËÈ
H™]ÈÚ^™NˆZYÝ]Yœ™\Ú
BˆÛÛœÝH[‹“
[‹“H™\™XÝ^[Ý]
ØËÊJKHÝ‹™Ù]ÛÛ^
	Ì™	ÊNÈœÙ]˜[œÙ›Ü›J‹‹
NÈ˜ÛX\”™XÝ
ØËÊNÂˆÛÛœÝÈH‘T‘PÕšÛOH[È‘T‘PÕšÛˆ
\™›Ü›X[˜ÙK››ÝÊ
HH‹˜]
HÈLH[‹‘ŒHHŒŽH
ˆŒˆHŒˆ
ˆÈËÈH™X]ÎˆH™\™XÝ]ÈY™H]Èš[ˆÛÛœÝ[HHˆ
ˆ”ÛJŽKÊH
ÈŒÌˆ
ˆ”ÛJŒHHŒH
ÈKÊNÂˆ™š[Ý[HH™Ø˜JK‹LË	Ù[KÑš^Y
Ê_JXÈ™š[™XÝ
ØËÊNÂˆÛÛœÝ™ÈH˜Ü™X]T˜YX[Ü˜YY[
ØÈÈ‹È
ˆ‹X]›Z[ŠØËÊH
ˆŒ‹ØÈÈ‹È
ˆ‹X]›X^
ØËÊH
ˆÍJNÈ™Ë˜YÛÛÜ”ÝÜ
	Ü™Ø˜JK‹LË
IÊNÈ™Ë˜YÛÛÜ”ÝÜ
K™Ø˜JK‹LË	ÊMH
ˆ”ÛJŽKÊJKÑš^Y
Ê_JX
NÂˆ™š[Ý[HH™ÎÈ™š[™XÝ
ØËÊNÂˆYˆ
\[‹œš[›Üˆ	‰ˆÈˆŒH	‰ˆ[‹œš[ÈOOH[
HÈ[‹œš[›ÜˆHNÈ™\™XÝš[
[ŠNÈHËÈ˜]ÛˆÛ˜ÙKÚ[HH™\^H[œÂˆÛÛœÝLHH”ÛJŒMKŽMKÊH
ˆ
HH”ÛJŒHHKŒH
ÈŒKÊJNÂˆYˆ
LHˆŒÊHÈYˆ
›[™
HÈÛÛœÝH]KÈH˜Ü™X]S[™X\‘Ü˜YY[
X]›Z[ŠØËž
ÈÈ
ˆŽH
ÈŒ
K
NÈËÈ\šÙ\ˆÝ[ÛˆH]IÜÈÚYKÛÈ]™XYÈÝ™\ˆHœšYÚÛÜ›ˆË˜YÛÛÜ”ÝÜ
™Ø˜JK‹LË	Êˆ
ˆLJKÑš^Y
Ê_JX
NÈË˜YÛÛÜ”ÝÜ
MK™Ø˜JK‹LË	Êˆ
ˆLJKÑš^Y
Ê_JX
NÈË˜YÛÛÜ”ÝÜ
K	Ü™Ø˜JK‹LË
IÊNÈ™š[Ý[HHÎÈ™š[™XÝ
ØËÊNÈBˆ™\™XÝ]J‹LKÊNÈBˆÛÛœÝR[ˆH”ÛJŒHHŒKŒH
È‹ÊKSÝ]HHH”ÛJŒˆHKŒˆ
ÈŒ‹ÊKH”ÛJŒH
ÈŒKŒˆH‹ÊNÂˆYˆ
R[ˆˆŒÈ	‰ˆÈŒŠH™\™XÝ™\^J‹R[‹R[ˆ
ˆSÝ]ÊNÈËÈ]ÈXÝ\™HÛÈÈH™X]	ÜÈ[™[™ÛÙ\ÈÛˆ[ÈHš[ÈH™\ÝÚ]™\ÈØ^Hš\œÝˆYˆ
ÈHŒŠH™\™XÝš[™X]
‹”ÛJŒ‹Œˆ
È‹ÊKÈHŒ‹[ŠNÂˆÛÛœÝXÝÈH[‹˜›Þœ]Y\žTÙ[XÝÜŠ	Ë˜XÝÉÊNÈYˆ
XÝÊHXÝË˜Û\ÜÓ\ÝÙÙÛJ	ÛÛ‰ËÈˆ™\™XÝXÝÐ]

H	‰ˆZÚ[ÜÚÊ
H	‰ˆH\[‹œš[ÊNÂŸB™[˜Ý[Ûˆ•Ü˜\ÊËX^Ë›ÛËX^[™\ÊHÈËÈ]\‹\ÜXÙY
ÜˆZ[ŠH^œ›ÚÙ[ˆ[È[™\È]š]ˆÛÛœÝÛÜ™ÈHÝš[™ÊÈ	ÉÊKœÜ]
×ÊËÊK™š[\Š›ÛÛX[ŠKÝ]H×NÈ][™HH	ÉÎÂˆ›Üˆ
ÛÛœÝÈÙˆÛÜ™ÊHÈÛÛœÝH[™HÈ[™H
È	È	È
ÈÈˆÎÈYˆ
[™H	‰ˆ•ÚY
›ÛÊHˆX^ÊHÈÝ]œ\Ú
[™JNÈ[™HHÎÈH[ÙH[™HHÈBˆYˆ
[™JHÝ]œ\Ú
[™JNÂˆYˆ
X^[™\È	‰ˆÝ]›[™ÝˆX^[™\ÊHÈÝ]›[™ÝHX^[™\ÎÈÝ]ÛX^[™\ÈHWH
ÏH	ø )‰ÎÈBˆ™]\›ˆÝ]ÂŸB™[˜Ý[Ûˆ™\™XÝ]S^[Ý]
ŠHÈËÈHš\œÝ™X]	ÜÈ[™\Ëš]YÈHØÜ™Y[ˆÛ˜ÙBˆÛÛœÝˆH‹œ™XËH]KˆHœÚ^™NÂˆÛÛœÝÑˆHX]›X^
KX]›Z[ŠLËˆ
ˆŒLÊJKÑ›ÛH	ÚÑŸ\	Ô—ÓSÓ“ßXÓHÑˆ
ˆŒÎÂˆ]ÚXÚÈHÓÔ“	ÜYŠ‹›Š_IÜ‹œ™\^HÈ	È
‘TVJIÈˆ	ÉßH0­È	Û[\ÜÊ‹
_HÑˆÓÔ“SQIÜ‹›˜]›[™ÝˆHÈ0­È	Ó•SUÖÜ‹›˜]›[™ÝKÕ\\Ø\ÙJ
_HÕUTØˆ	ÉßXÂˆYˆ
•ÚY
ÚXÚËÑ›ÛÓ
HˆÊHÚXÚÈHÓÔ“	ÜYŠ‹›Š_IÜ‹œ™\^HÈ	È
‘TVJIÈˆ	ÉßH0­È	Û[\ÜÊ‹
_IÜ‹›˜]›[™ÝˆHÈ0­È	Ü‹›˜]›[™ÝHÕUTØˆ	ÉßXÂˆ™›ÛH][XÈ	ÑŸ\	Ô—ÔÑT’QŸXÈÛÛœÝ]ÈHOˆ›YX\Ý\™U^

KÚYÈËÈH]NˆÛ™H[™HYˆ]š]È™X\ˆ]ÈÚ^™K[ÙHÛÂˆ]HÜ‹]WKœÈHŽÈÛÛœÝÈH]Ê‹]JNÂˆYˆ
ÈˆÊHÈÛÛœÝÈHÈÈËÜÈH‹]KœÜ]
	È	ÊNÈ]™\ÝH[ÂˆYˆ
ÈÌˆ	‰ˆÜË›[™ÝˆJH›Üˆ
]HHNÈHÜË›[™ÝÈJÊÊHÈÛÛœÝHHÜËœÛXÙJJKš›Ú[Š	È	ÊKˆHÜËœÛXÙJJKš›Ú[Š	È	ÊKHHX]›X^
]ÊJK]ÊŠJNÈYˆ
X™\ÝH™\Ý›JH™\ÝHÈK‹HNÈBˆYˆ
™\Ý
HÈHØ™\Ý˜K™\Ý˜—NÈœÈHX]›Z[Šˆ
ˆŽˆ
ˆÈÈ™\Ý›JNÈH[ÙHœÈHˆ
ˆÎÈBˆÛÛœÝˆHX]›X^
MKX]›Z[Šˆ
ˆŒJJK›ÛH	ÛŸ\	Ô—ÔÑT’QŸXHˆ
ˆK‹XYH•Ü˜\Ê‹›XY‹œÝÜžH	ÉËË›Û
NÂˆÛÛœÝ‘ˆHX]›X^
KX]›Z[ŠL‹Kˆ
ˆŒLJJK‘›ÛH	Û‘Ÿ\	Ô—ÓSÓ“ßX“H‘ˆ
ˆŒ‹“H‘ˆ
ˆKÍNÂˆÛÛœÝ™]ÜÈH×NÈ
‹›™]ÜÈ×JK™›Ü‘XXÚ

ÊHOˆ•Ü˜\ÊÕ\\Ø\ÙJ
KË‘›Û“ŠK™›Ü‘XXÚ
ˆOˆ™]ÜËœ\Ú
È‹ÈJJJNÂˆÛÛœÝÚHH
‹œÚ\ÛÛžH×JK›[™Ý	‰ˆ‹šÚ[™OOH	ÜÝ\š]™Y	È
‹œÚ\ÛÛžH×JK›[™Ý	‰ˆ”\
ŠHÈ•Ü˜\ÊHÒTÓÓˆ0­È	Ü‹œÚ\ÛÛžK›X\
OˆÌJKš›Ú[Š	È
È	Ê_XÕ\\Ø\ÙJ
KË‘›Û“ŠHˆ×NÈËÈÚ]ÛÛ\ÜÙY]˜[YYˆËÈÜÈ›ÝÛKœ›ÛHHÚXÚÙ\ŽÈ[ˆHÚÛH›ØÚÈÙ[™YÚ\™HH]HÚ]ÂˆÛÛœÝHœÈ
ˆKŒÈ]HHÈÛÛœÝÚXÚÖHHNÈH
ÏHÑˆ
ˆŽH
ÈœÈ
ˆŽNÂˆÛÛœÝHH›X\

ËJHOˆH
ÈH
ˆ
NÈHHVÝK›[™ÝHWNÂˆÛÛœÝ[VHHH
ÈœÈ
ˆŒÈHH[VH
Èˆ
ˆKÍNÈÛÛœÝHHXY›X\

ËJHOˆH
ÈH
ˆ
NÈHHK›[™ÝÈVÛK›[™ÝHWHˆ[VNÂˆH
ÏHÚK›[™ÝÈ‘ˆ
ˆ‹ŽHˆÈÛÛœÝHHÚK›X\

ËJHOˆH
ÈH
ˆ“
NÈYˆ
K›[™Ý
HHHVÜK›[™ÝHWNÂˆH
ÏH™]ÜË›[™ÝÈ‘ˆ
ˆ
ÚK›[™ÝÈ‹Œˆˆ‹ŒÊHˆÈÛÛœÝ–HH™]ÜË›X\

ËJHOˆH
ÈH
ˆ“
È
H	‰ˆ™]ÜÖÚWKšÈOOH™]ÜÖÚHHWKšÈÈ‘ˆ
ˆHˆ
JNÈYˆ
–K›[™Ý
HHH–VÛ–K›[™ÝHWNÂˆÛÛœÝÜHZÑ‹›ÝHH
È‘ˆ
ˆ‹Ù™ˆHX]›X^
Ž
ÈÑ‹X]›Z[Š’ÈHŽH›ÝžHH
Ü
È›Ý
HÈˆ
È
›[™Èˆ’È
ˆŒŠJJNÂˆ™]\›ˆÈÚXÚËÑ›ÛÓÑ‹œËXY›Û‹™]ÜËÚK‘›Û“ÚXÚÖNˆÚXÚÖH
ÈÙ™‹NˆK›X\
ˆOˆˆ
ÈÙ™ŠK[VNˆ[VH
ÈÙ™‹NˆK›X\
ˆOˆˆ
ÈÙ™ŠKNˆK›X\
ˆOˆˆ
ÈÙ™ŠK–Nˆ–K›X\
ˆOˆˆ
ÈÙ™ŠKÜˆÜ
ÈÙ™‹›Ýˆ›Ý
ÈÙ™ˆNÂŸB™[˜Ý[Ûˆ™\™XÝ]J‹KÊHÂˆÛÛœÝˆH‹œ™XËH]KÈHXØÙ[
ŠKš\ÙHH
HH‘X\ÙJÈÈK
JH
ˆM‹[ˆH‘T‘PÕœ[ŽÂˆÛÛœÝHH
[ˆ	‰ˆ[‹•
H™\™XÝ]S^[Ý]
ŠNÈYˆ
[ŠH[‹•HNÂˆœØ]™J
NÈ™ÛØ˜[[HHNÂˆYˆ
S›[™
HÈÛÛœÝ˜[™H˜Ü™X]S[™X\‘Ü˜YY[
KÜHLK˜›Ý
ÈL
NÈËÈ
H[ØÜ™Y[ŠHH\šÙ\ˆ˜[™™Z[™HÛÜ™Âˆ˜[™˜YÛÛÜ”ÝÜ
	Ü™Ø˜JK‹LË
IÊNÈ˜[™˜YÛÛÜ”ÝÜ
ŒŒ‹	Ü™Ø˜JK‹LËMJIÊNÈ˜[™˜YÛÛÜ”ÝÜ
Î	Ü™Ø˜JK‹LËMJIÊNÈ˜[™˜YÛÛÜ”ÝÜ
K	Ü™Ø˜JK‹LË
IÊNÂˆ™š[Ý[HH˜[™È™š[™XÝ
KÜHL•ØËK˜›ÝHKÜ
ÈN
NÈBˆ•^
KšÚXÚËžKšÚXÚÖH
Èš\ÙKKšÑ›Û—ÑSKKšÓ
NÂˆK™›Ü‘XXÚ

JHOˆ•^
žHK™œÈ
ˆŒËKVÚWH
Èš\ÙK][XÈ	ÖK™œß\	Ô—ÔÑT’QŸX	ÈÙŒ™ŒYÉÊJNÂˆ™š[Ý[HH™Ø˜J	ØËš›Ú[Š	Ë	Ê_KŽJXÈ™š[™XÝ
žKœ[VH
Èš\ÙKX]›Z[ŠÈ
ˆK™œÈ
ˆ‹ŒŠH
ˆ‘X\ÙJ
ÈHŒÊHÈKŒŠKX]›X^
KK™œÈ
ˆŒN
JNÂˆK›XY™›Ü‘XXÚ

JHOˆ•^
žK›VÚWH
Èš\ÙKK››Û	Ü™Ø˜JŒÌ‹ŒÌËŽLŠIÊJNÂˆYˆ
KœÚK›[™Ý
HÈœØ]™J
NÈ™ÛØ˜[[HHH
ˆ”ÛJ‹KŒËÊNÈKœÚK™›Ü‘XXÚ

JHOˆ•^
žKœVÚWH
Èš\ÙKK›‘›Û	Ü™Ø˜JMKMKMKŽMJIËK›“
JNÈœ™\ÝÜ™J
NÈBˆK›™]ÜË™›Ü‘XXÚ

ËJHOˆÈÛÛœÝ˜HH”ÛJŽH
ÈËšÈ
ˆŒÍKKˆ
ÈËšÈ
ˆŒÍKÊNÂˆœØ]™J
NÈ™ÛØ˜[[HHH
ˆ˜NÈ•^
Ë›‹žK›–VÚWH
Èš\ÙKK›‘›Û™Ø˜J	ØËš›Ú[Š	Ë	Ê_KŽM
XK›“
NÈœ™\ÝÜ™J
NÈJNÂˆœ™\ÝÜ™J
NÂŸB™[˜Ý[Ûˆ™\™XÝ™\^J‹TXËKË]ZY]
HÈËÈ
\ÝNˆ[]]È[™Ú[HHØ\[ÛˆÙˆÝÈ][™YÛÛY\È\
BˆÛÛœÝHX]›Z[ŠK
KˆHœ™\H‹•ÈH
ˆÈH
ˆˆH‹™œ˜[Y\ËÈH‹œË[ˆH]ZY]È[ˆ‘T‘PÕœ[ŽÂˆœØ]™J
NÈ™ÛØ˜[[HHTXÎÈËÈ]ÈY™NˆHœ˜[Y\ÈÙ\\È]Ù[Û™H[ÈH™^ˆ™š[Ý[HH	Ü™Ø˜J‹ËŽJIÎÈ™š[™XÝ
‹ž‹žKËÊNÂˆ]HHÈÚ[H
H‹›[™ÝHH	‰ˆ–ÚH
ÈWKHÊHJÊÎÂˆÛÛœÝŒH–ÚWKŒHH–ÚH
ÈWNÂˆYˆ
Œ
HÛÝ™\ŠŒ˜Ë‹ž‹žKËJNÂˆYˆ
Œ	‰ˆŒJHÛÝ™\ŠŒK˜Ë‹ž‹žKË”ÛJŒ
È
ŒKHŒ
H
ˆŒÍKŒKÊJNÂˆYˆ
‹œÝ[
HÛÝ™\Š‹œÝ[‹ž‹žKË‹›[™ÝÈ”ÛJ
ˆŽKÊHˆJNÂˆ›Üˆ
ÛÛœÝˆÙˆŠHYˆ
‹šÈOOH	Øœ™XZÉÈ	‰ˆÈH‹	‰ˆÈH‹
ˆŒJHÈÛÛœÝÈHHH
ÈH‹
HÈ

ˆŒJNÈœÝ›ÚÙTÝ[HH™Ø˜JMKMKMK	ÊŽMH
ˆÊKÑš^Y
Ê_JXÈ›[™UÚYHÎÈœÝ›ÚÙT™XÝ
‹ž
ÈKK‹žH
ÈKKÈHËÈHÊNÈBˆ™ÛØ˜[[HHNÂˆœÝ›ÚÙTÝ[HH	Ü™Ø˜JŒŒËŒKŒŠIÎÈ›[™UÚYHNÈœÝ›ÚÙT™XÝ
‹ž
ÈK‹žH
ÈKÈHKÈHJNÂˆÛÛœÝÈH˜Ü™X]S[™X\‘Ü˜YY[
‹žH
ÈÈH‹‹žH
ÈÊNÈË˜YÛÛÜ”ÝÜ
	Ü™Ø˜JK‹LË
IÊNÈË˜YÛÛÜ”ÝÜ
K	Ü™Ø˜JK‹LËÊIÊNÈ™š[Ý[HHÎÈ™š[™XÝ
‹ž‹žH
ÈÈH‹ËŠNÂˆ•^
[\ÜÊÊK‹ž
ÈL‹‹žH
ÈÈHLË	ÓX]›X^
LÈ
ˆŒŠ_\	Ô—ÓSÓ“ßX	Ü™Ø˜J‹KËŽM
IËKŠNÂˆËÈHÛÜ›	ÜÈ[YH[™\ˆ]ˆ]™\žHÝ]IÜÈ˜]ÜË]™\žHœ™XZÛÝ][™Ú\™HH™\^H\ÂˆÛÛœÝHH‹žH
ÈÈ
ÈM™XÈH‹œ™XËÙ\HHÚYÔÙ\J™XÊNÂˆœÝ›ÚÙTÝ[HH	Ü™Ø˜JŒŒËŒKŒN
IÎÈ›[™UÚYHNÈ˜™YÚ[”]

NÈ›[Ý™UÊ‹žJNÈ›[™UÊ‹ž
ÈËJNÈœÝ›ÚÙJ
NÂˆÙ\K™›Ü‘XXÚ

ÝÊHOˆÈÛÛœÝˆH™XË›˜]™š[™
HOˆKšHOOHÝšJNÈYˆ
[ŠH™]\›ŽÈ™š[Ý[HH™Ø˜J	Û‹[š›Ú[Š	Ë	Ê_KŽJXÂˆ›Üˆ
ÛÛœÝÙˆÝ™
HÈYˆ
ÌWHˆÊHœ™XZÎÈ™š[™XÝ
‹ž
ÈX]›Z[ŠKÌWHÈ
H
ˆÈH‹HHÈHÈ
ˆ‹Œ‹KŒ‹ŠNÈHJNÂˆ›Üˆ
ÛÛœÝˆÙˆ™XË˜œ™XZÜÈ×JHÈYˆ
‹ˆÊHÛÛ[YNÈÛÛœÝžH‹ž
ÈX]›Z[ŠK‹È
H
ˆÎÈ™š[Ý[HH	ÈÌ	ÎÈ˜™YÚ[”]

NÈ˜\˜ÊžKX]”H
ˆŠNÈ™š[

NÈœÝ›ÚÙTÝ[HH‹˜Ø]YÚÈ—ÐÓÓˆ	ÈÙ™™‰ÎÈ›[™UÚYHKŒŽÈœÝ›ÚÙJ
NÈBˆ™š[Ý[HH	ÈÙŒ™ŒYÉÎÈ™š[™XÝ
‹ž
ÈX]›Z[ŠK
H
ˆÈHÍKHHËKKM
NÂˆËÈHØ\[ÛŽˆÚ]\È\[š[™È›ÝË[[H™^[™È\[œÂˆ]]ˆH[žH[È›Üˆ
ÛÛœÝHÙˆ‹™]™[ÊHÈYˆ
KHÈ
ÈYKMŠH]ˆHNÈ[ÙHÈžHNÈœ™XZÎÈHBˆYˆ
[ˆ	‰ˆ‘T‘PÕšÛOH[	‰ˆHˆJHÈÛÛœÝÝYYH[‹˜ÝYY
[‹˜ÝYYH™]ÈÙ]

JNÈËÈXXÚ[ÛY[X\™\ÈH™\^H\ÜÙ\È]ˆ›Üˆ
ÛÛœÝHÙˆ‹™]™[ÊHYˆ
KHÈ
ÈYKMˆ	‰ˆXÝYYš\ÊJJHÈÝYY˜Y
JNÈžHÈÕQÑK™\™XÝÝYJKšË‹šÚ[™”\
™XÊJNÈHØ]Ú
\ŠHßHHBˆYˆ
]ŠHÈÛÛœÝYÙHHÈH]‹ØHH”ÛJ
ˆŒL‹YÙJH
ˆ
]‹šÈOOH	Ù[™	ÈÈHˆ
HH”ÛJ
ˆŒË
ˆŒÍ‹YÙJJH
ˆ
žÈHH”ÛJžH
ˆŒMKžÊHˆJJNÂˆÛÛœÝØÈH]‹šÈOOH	Øœ™XZÉÈ]‹šÈOOH	ÜÚ\ÛÛ‰È]‹šÈOOH	Ù˜[	ÈÈ	Ü™Ø˜JMKŒMNM‹ŽMŠIÈˆ]‹šÈOOH	ØØ]YÚ	ÈÈ	Ü™Ø˜JŒŒŒMKŽMŠIÈˆ]‹šÈOOH	Ù[™	ÈÈ™Ø˜J	ÝXØÙ[
™XÊKš›Ú[Š	Ë	Ê_KŽN
Xˆ	Ü™Ø˜JŒÍ‹ŒÍ‹‹ŽLŠIÎÂˆYˆ
ØHˆŒJHÈœØ]™J
NÈ™ÛØ˜[[H
HØNÈ•^
[\ÜÊ]‹
K‹žH
ÈÌ	ÓX]›X^
LÈ
ˆŒ
_\	Ô—ÓSÓ“ßX—ÑSKKŠNÂˆ•Ü˜\
]‹œË‹ž
ÈX]›X^
È
ˆŒLÊKH
ÈÌKÈHX]›X^
È
ˆŒLÊKX]›X^
MËÈ
ˆŒJK][XÈ	ÓX]›X^
MÈ
ˆŒ
_\	Ô—ÔÑT’QŸXØËŠNÈœ™\ÝÜ™J
NÈHBˆËÈHÚYÚ[ÛÝ™[ˆ\ÈHÛÜ›Ø\ÂˆÛÛœÝÈHœÚYÎÈ”ÚYÚ[
™XËË˜ÞË˜ÞKËœ‹ËœˆÈLNYJNÂˆYˆ
ˆŽMÊHÈœØ]™J
NÈ™ÛØ˜[[H
H”ÛJŽMËK
NÈ•^
	Ü™XË™˜]ÛŸHÑˆ	Ü™XËœÝH	Ü™XË›˜]›[™ÝˆHÈ	ÒS•‘S•Q	Èˆ	ÑUÓ‰ßXË˜ÞË˜ÞH
ÈËœˆ
ˆKŒÌ‹	ÓX]›X^
LËœˆ
ˆŒÍJ_\	Ô—ÓSÓ“ßX—ÑSK‹	ØÙ[\‰ÊNÈœ™\ÝÜ™J
NÈBˆœ™\ÝÜ™J
NÂŸB˜\Þ[˜È[˜Ý[Ûˆ™\™XÝš[
[ŠHÈËÈHš[]HÚ^™H]Ú[™H™XYÛ˜ÙH›ÛÈ[™]ÈXÝ\™\È\™H[‚ˆžHÂˆÛÛœÝˆH[‹•ŽÈ]ØZ]‘›ÛÊ
NÈYˆ
‹™š[Y
H]ØZ]‹™š[Y˜Ø]Ú


HOˆ[
NÂˆYˆ
‘T‘PÕœ[ˆOOH[ŠH™]\›ŽÂˆÛÛœÝÈH™\™XÝš[™XÝ
[ŠKˆHX]›Z[Š‹]šXÙT^[˜][ÈJNÂˆ[‹œš[ÈH˜]ÕÛÜ›š[
‹œ™XË‹œÝ[
‹™œ˜[Y\Ë›[™ÝÈ‹™œ˜[Y\ÖÕ‹™œ˜[Y\Ë›[™ÝHWK˜Èˆ[
KX]œ›Ý[™
ËÈ
ˆŠK‹›Y™PÈ×JNÂˆÛÛœÝØÈHØÝ[Y[˜Ü™X]Q[[Y[
	ØØ[˜\ÉÊKÞHØË™Ù]ÛÛ^
	Ì™	ÊNÈØËÚYHX]˜ÙZ[
ËÈ
ÈMŒ
NÈØËšZYÚHX]˜ÙZ[
Ëš
ÈMŒ
NÈËÈ]ÈÚYÝË›\œ™YÛ˜ÙBˆÞœÚYÝÐÛÛÜˆH	Ü™Ø˜JŒŠIÎÈÞœÚYÝÐ›\ˆHÈÞ™š[Ý[HH	ÈÌLŒ	ÎÈÞ™š[™XÝ
ËËËš
NÈ[‹œÚYÝÐÈHØÎÂˆHØ]Ú
JHÈÛÛœÛÛKØ\›Š	Ý™\™XÝš[	ËJNÈ[‹œš[ÈH˜[ÙNÈBŸB™[˜Ý[Ûˆ™\™XÝš[™XÝ
[ŠHÂˆÛÛœÝÈ[™ØËÈHH[‹“ÈH[™ÈX]›Z[ŠÈ
ˆŽÈKŒKØÈ
ˆJHˆX]›Z[ŠØÈ
ˆŽKÈ
ˆÍÈKŒJNÂˆ™]\›ˆÈˆ
ØÈHÊHÈ‹Nˆ[™ÈÈ
ˆŒHˆÈ
ˆŒËˆÈ
ˆKŒHNÂŸB™[˜Ý[Ûˆ™\™XÝš[™X]
‹KÌË[ŠHÂˆÛÛœÝÈH™\™XÝš[™XÝ
[ŠK™XÈH‹œ™XËÝš\H
™XË›Y™H×JK›[™ÝHËHHËÈÈLŒÂˆÛÛœÝHÝš\ÈÈˆËž
ÈL
ˆKNˆËžH
ÈL
ˆKÎˆ
ˆHHˆÈˆËž
ÈL
ˆKNˆËžH
ÈL
ˆKÎˆËÈHŒ
ˆHNÂˆÛÛœÝˆHœ™\ÈH‘X\ÙJÌÈÈKŒ
KH‹ž
È
žH‹ž
H
ˆËHH‹žH
È
žHH‹žJH
ˆËÈH‹œÈ
È
œÈH‹œÊH
ˆÎÂˆœØ]™J
NÈ™ÛØ˜[[HHNÂˆYˆ
[‹œš[ÊHÈËÈHš[]™[ÜÈ›Ý[™]ÈXÝ\™KÜÈ›ÝÛBˆÛÛœÝ]ˆH”ÛJŒËKŽKÌÊKSHËžH
ÈËš
ˆ]ŽÂˆYˆ
[‹œÚYÝÐÊHÈœØ]™J
NÈ™ÛØ˜[[H
H]ŽÈ™˜]Ò[XYÙJ[‹œÚYÝÐËËžHËžHH
NÈœ™\ÝÜ™J
NÈBˆœØ]™J
NÈ˜™YÚ[”]

NÈœ™XÝ
ËžH‹ËžHH‹ËÈ
ÈX]›X^
SHËžJH
ÈŠNÈ˜Û\

NÈ™˜]Ò[XYÙJ[‹œš[ËËžËžKËËËš
NÈœ™\ÝÜ™J
NÂˆYˆ
]ˆJHÈÛÛœÝ˜[™H˜Ü™X]S[™X\‘Ü˜YY[
SHŒS
NÈ˜[™˜YÛÛÜ”ÝÜ
	Ü™Ø˜JK‹LË
IÊNÈ˜[™˜YÛÛÜ”ÝÜ
K	Ü™Ø˜JK‹LËŽJIÊNÈ™š[Ý[HH˜[™È™š[™XÝ
ËžSHŒËËŒ
NÈHBˆœ™\ÝÜ™J
NÂˆÛÛœÝ[YÈH‹œÝ[
‹™œ˜[Y\Ë›[™ÝÈ‹™œ˜[Y\ÖÕ‹™œ˜[Y\Ë›[™ÝHWK˜Èˆ[
K˜YHH[‹œš[ÈÈHH”ÛJKŒËKŽKÌÊHˆNÈËÈH™\^IÜÈXÝ\™HØ\œšYY[ÈHš[	ÜÈXÙBˆYˆ
[YÈ	‰ˆ˜YHˆŒÊHÛÝ™\Š[YËKË˜YJNÂˆÛÛœÝXÝÈH[‹˜›Þœ]Y\žTÙ[XÝÜŠ	Ë˜XÝÉÊKžH[‹˜›Þœ]Y\žTÙ[XÝÜŠ	Ë›™^	ÊNÂˆYˆ
XÝÈ	‰ˆXXÝË™]\Ù]œXÙY
HÈXÝË™]\Ù]œXÙYHNÈXÝËœÝ[K›YH	ÓX]œ›Ý[™
Ëž
_\ÈXÝËœÝ[KÜH	ÓX]œ›Ý[™
ËžH
ÈËš
ÈM
_\ÈXÝËœÝ[K›X^ÚYH	ÓX]œ›Ý[™
X]›X^
ËÊJ_\ÈBˆÛÛœÝ^HXÝÈÈX]›X^

XÝË›Ù™œÙ]ZYÚŽ
HHŽ
HˆÈËÈ
XÝ[ÛœÈ]Ü˜\\ÚÚ]\È[™\ˆ[HÝÛŠBˆYˆ
ž	‰ˆ[ž™]\Ù]œXÙY
HÈž™]\Ù]œXÙYHNÈYˆ
›[™
HÈžœÝ[K›YH	ÓX]œ›Ý[™
Ëž
ÈËÈ
È
_\ÈžœÝ[KÜH	ÓX]œ›Ý[™
ËžH
ÈËšHM
_\ÈH[ÙHÈžœÝ[K›YH	ÓX]œ›Ý[™
Ëž
_\ÈžœÝ[KÜH	ÓX]œ›Ý[™
ËžH
ÈËš
ÈLˆ
È^
_\ÈHBˆYˆ
ž
HžœÝ[K›ÜXÚ]HH”ÛJŽK‹ÌÊKÑš^Y
ŠNÂˆÛÛœÝZHH[‹˜›Þœ]Y\žTÙ[XÝÜŠ	Ë›Z[™	ÊNÈËÈÚ]HZ[™ÈZÙHœ›ÛH]ˆ™\ÚYHHš[Üˆ[™\ˆ]ˆYˆ
ZH	‰ˆZK˜Ú[[[Y[ÛÝ[	‰ˆ[ZK™]\Ù]œXÙY
HÈZK™]\Ù]œXÙYHNÂˆYˆ
›[™
HÈÛÛœÝÈHX]›Z[ŠÌLËžHMŠNÈZKœÝ[K™\Ü^HHÈMÌÈ	Û›Û™IÈˆ	ÉÎÈZKœÝ[KÚYH	ÓX]œ›Ý[™
Ê_\ÈZKœÝ[K›YH	ÓX]œ›Ý[™
ËžHŽHÊ_\ÂˆÛÛœÝ›ÛÛHH’ÈH›ÝÜÈHZKœ]Y\žTÙ[XÝÜŠ	Ëœ›ÝÜÉÊNÈYˆ
ZK›Ù™œÙ]ZYÚˆ›ÛÛH	‰ˆ›ÝÜÊH›ÝÜËœÝ[K™\Ü^HH	Û›Û™IÎÈYˆ
ZK›Ù™œÙ]ZYÚˆ›ÛÛJHZKœÝ[K™\Ü^HH	Û›Û™IÎÈËÈ
HÚÜØÜ™Y[ŽˆH\ÜÛÛˆÚ]Ý]H›ÝÜËÜˆ›Ý[™ÊBˆZKœÝ[KÜH	ÓX]œ›Ý[™
X]›X^
X]›Z[Š’ÈHHZK›Ù™œÙ]ZYÚËžH
ÈËš
ˆHHZK›Ù™œÙ]ZYÚÈŠJJ_\ÈBˆ[ÙHÈÛÛœÝÜHËžH
ÈËš
ÈLˆ
È^›ÝÜÈHZKœ]Y\žTÙ[XÝÜŠ	Ëœ›ÝÜÉÊNÈZKœÝ[KÚYH	ÓX]œ›Ý[™
ËÊ_\ÈZKœÝ[K›YH	ÓX]œ›Ý[™
Ëž
_\ÈZKœÝ[KÜH	ÓX]œ›Ý[™
Ü
_\ÂˆYˆ
Ü
ÈZK›Ù™œÙ]ZYÚˆ’ÈHLˆ	‰ˆ›ÝÜÊH›ÝÜËœÝ[K™\Ü^HH	Û›Û™IÎÈYˆ
Ü
ÈZK›Ù™œÙ]ZYÚˆ’ÈHLŠHZKœÝ[K™\Ü^HH	Û›Û™IÎÈHBˆYˆ
ZJHZK˜Û\ÜÓ\ÝÙÙÛJ	ÛÛ‰ËÌÈˆKJNÂŸB‚‹ÊˆOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOBˆHÐSQHÓÔ“QÐRS‹ˆ]™\žHÛÜ›\ÈXYHœ›ÛHHÙYYˆ]ÈÝ]\È[™Z\ˆXÙ\Ë]ÈX]\šX[È[™[]K]Âˆ\›‹]ÈXÙKˆ]ÈÛÙHÙY\ÈHÙYYÚ][]Ø\È™YÝ[ˆÚ]]Ù\È›ÝÛÛYHœ›ÛHHÙYYˆÝÈX[žHÝ]\ËˆXXÚÝ]IÜÈÚ[™[™Ý˜]YÞKÚ]HZ[™È™[Y[X™\™Y]™X\œÈÛˆ]HÙX]\‹HÜšYHXÙH[™BˆšY]È]™YØ[ˆ[ŽÈ[™YY\È][œËÚ[ˆ]Èš\œÝYÙH[™YHÝ\XXÚ˜]Ûˆ]ÈØ\ÈZÙ[ˆ\Û‹Ú[ˆ]ÂˆšY]È\›™YÜˆ]ÈXÙHÚ[™ÙY[™[žHZ[™œ™Y[ˆ]ˆ^YYœ›ÛH]ÈÛÙBˆ
™\^H[ˆH\˜Ú]™K^H[ˆHX›Ý]ÜˆÝÛÜ›OÛÙOŠK]^\ÈÝ]\È]Y‚ˆHÛÜ›[œÈÛˆ]ÈÝÛˆÛØÚÈ
ÙYHÛÜ››ØÚÊNˆ]ÈÙÚXÈ˜[ÈÛˆš^YÝ\ÈÙˆ]ÈY™K™]™\ˆÛˆHœ˜[Y\ËˆÛÂˆÛˆHØ[YHXXÚ[™H[™œ›ÝÜÙ\ˆHÛÜ›	ÜÈÛÙH^\È]Ý]Ý\›ÜˆÝ\ÈÛˆ[›Ý\ˆHÜ˜\XÜÈØ\™X^H›Ý[™ˆY™™\™[H[ˆH\ÝXÙK[™HÛÜ›™Z[™ÈÚ[ÝXË[ˆÛÙ\È]ÈÝÛˆØ^KÛÛÛ™\ˆÜˆ]\‹‚ˆÜÙYYO[X™\ˆ
ÜˆÜÙYYJHš^\ÈHÚÛH[ŽˆHØ[YHÛÜ›È[ˆHØ[YHÜ™\‹Ú]Z[™È]Ý\Yœ™\Ú[™\™Bˆ›ÝÙ\ÛÈH[ˆ\ÈHØ[YH]™\žH[YH]\ÈÜ[™YˆH™\^H\ÈÚÝÛ‹›ÝÙ\ˆ›Ý[™È\Èš[YX\›™YÜ‚ˆÛÝ[Y[™Ú[ˆ]\ÈÝ™\ˆHØÜ™Y[ˆÛÙ\È˜XÚÈÈ]ÈÝÛˆÛÜ›Ë‚ˆOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOH
‹Â˜\ˆUÓÕ”ˆH[ÈËÈ
H™\^NˆÝÈX[žHÝ]\Ë[™Ú]\ˆHXÙHÙ\™H\ÚÙY
B˜ÛÛœÝŒÍˆHˆOˆ
ˆˆ
KÔÝš[™ÊÍŠNÂ™[˜Ý[ÛˆÛÜ›Û˜\
ÙYYŠHÈËÈÚ]HÛÜ›\È™YÝ[ˆÚ]]]Èš\ˆžHÂˆÛÛœÝÝH™]ÈÙ]
Õ›X\
OˆšY
JK^H™]ÈX\
ÓÔ”TË›X\

JHOˆÙšYWJJKÈH×KÒHH™]ÈX\

NÂˆÛÛœÝÙ^HHYÈOˆÈÛÛœÝÈHYË›X\
YOˆ^™Ù]
Y
KÔÝš[™ÊÍŠJKš›Ú[Š	Ë‰ÊNÈYˆ
RÒKš\ÊÊJHÈÒKœÙ]
ËË›[™Ý
NÈËœ\Ú
ÊNÈH™]\›ˆÒK™Ù]
ÊNÈNÂˆÛÛœÝZ[™ÈHRS‘ÓÓˆÈØš™XÝ™[šY\ÊRS‘Ë›Z[™ÊK›X\

Û›KWJHOˆÈÛÛœÝ[HØš™XÝ˜[Y\ÊK˜ÛÛ\ÈßJNÈËÈ]™\žHZ[™]™\žHÚ\ÛÛˆ]™[Y[X™\œÈ]\ÈÛÜ›	ÜÈ\›ˆÛÝ[XZÙBˆ™]\›ˆÈ›KÎˆ[™š[\ŠÈOˆËšYÈ	‰ˆËšYË›[™Ý	‰ˆËšYË™]™\žJYOˆÝš\ÊY
JJK›X\
ÈOˆÚÙ^JËšYÊKË™X]ËËœÙY[ˆJKÛŽˆ[›[™ÝˆÎˆKÛÜ›”ÙY[ˆÎˆKšÚ[™ÈßKˆX]›Z[ŠÌ
KšX[È×JK›[™Ý
K›ÎˆKšX[›ÈNÈJHˆ[Âˆ™]\›ˆÈ‹ÎˆÙYYˆŽˆË›˜][ÛœË›[™ÝNˆK›ŽˆÑ‘Ë›˜][ÛœÈÈHˆNˆRS‘ÓÓˆÈHˆËNˆZ[™ËXŽˆRS‘ÓÓˆÈRS‘Ë˜›ÛˆˆÎˆRS‘ÓÓˆÈË›˜][ÛœË›X\
Oˆ
šÚ[™	ÛX\›™\‰ÊVÌJHˆ[ÝˆË›˜][ÛœË›X\
OˆšÚ[™OOH	ÜÝ[	È	‰ˆœÝ]HÈœÝ]KšYˆ	ÉÊKˆÎˆË›˜][ÛœË›X\
Oˆ™Ù[›ÛYHÈ™Ù[›ÛYKœÛXÙJ
Hˆ[
KŽˆË›˜][ÛœË›X\
Oˆ˜›Û
K[ÎˆË›˜][ÛœË›X\
Oˆ›[ÙH	ÉÊKˆŽˆË›˜][ÛœË›X\
OˆšX[
KˆË›˜][ÛœË›X\
Oˆ™[X[™
KˆŽˆÈœ˜YÎˆË™œ˜YÈX]ÎˆËšX]ÈKœ˜YÔŽˆË™œ˜YÔ‹œ˜YÕšY\ÎˆË™œ˜YÕšY\Ëœ˜YÒ\™ˆË™œ˜YÒ\™OH[È[ˆË™œ˜YÒ\™ÙÎˆ
Ë™˜]SÙÈ×JKœÛXÙJ
K™NˆË™œ˜YÑX\›HKˆ]ŽˆËš]‹ˆË]KÌˆ[ÝÎˆ[œÎˆ[Žˆ×Kˆ×KÎˆ×K[œÎˆ×HNÂˆHØ]Ú
JHÈÛÛœÛÛKØ\›Š	ÝÛÜ›ÛÙIËJNÈ™]\›ˆ[ÈBŸB˜ÛÛœÝÚÜÛÙHHˆOˆˆÈ	Ü‹›ŸKIØŒÍŠ‹œÊ_KIÜ‹“ŸXˆ	ÉÎÂ™[˜Ý[ÛˆÛÜ›ÛÙJŠHÈËÈ]ÈÛÙNˆÛÜ›\ÙYY\Ý]\Ë[ˆ[]Ø\È™YÝ[ˆÚ]ˆYˆ
\ŠH™]\›ˆ	ÉÎÈÛÛœÝÈ‹Ë‹‹‹œ™\ÝHHŽÂˆžHÈÛÛœÝˆH”ÓÓ‹œÝš[™ÚYžJ™\Ý
NÈ™]\›ˆÚÜÛÙJŠH
È	Ë‰È
ÈØJ[™\ØØ\J[˜ÛÙUT’PÛÛ\Û™[
ŠJJKœ™\XÙJ×
ËÙË	ËIÊKœ™\XÙJ×ËÙË	×ÉÊKœ™\XÙJÏJÉË	ÉÊNÈHØ]Ú
JHÈ™]\›ˆÚÜÛÙJŠNÈBŸB™[˜Ý[ÛˆXÛÙUÛÜ›
ÛÙJHÂˆÛÛœÝÚXY›ÙWHHÝš[™ÊÛÙH	ÉÊKš[J
Kœ™\XÙJ×ÊËÙË	ÉÊKœÜ]
	Ë‰ÊKHXYœÜ]
	ËIÊK™š[\Š›ÛÛX[ŠNÂˆ]ˆH[ÂˆYˆ
›[™ÝHÊHˆHÈŽˆ\œÙR[
ÌKL
H[Îˆ\œÙR[
ÌWKÍŠHˆŽˆX]›X^
KX]›Z[ŠK\œÙR[
Ì—KL
HÊJHNÂˆ[ÙHYˆ
›[™ÝOOHH	‰ˆ×–ÌNXK^—JÉÚK\Ý
ÌJJHˆHÈŽˆ[Îˆ\œÙR[
ÌKÍŠHˆŽˆ[NÈËÈHÙYY[Û™BˆYˆ
\ˆZ\Ñš[š]J‹œÊJH™]\›ˆ[ÂˆYˆ
›ÙJHÈžHÈØš™XÝ˜\ÜÚYÛŠ‹”ÓÓ‹œ\œÙJXÛÙUT’PÛÛ\Û™[
\ØØ\J]ØŠ›ÙKœ™\XÙJËKÙË	ÊÉÊKœ™\XÙJ×ËÙË	ËÉÊJJJJJNÈHØ]Ú
JHÈÛÛœÛÛKØ\›Š	Ü™\^Nˆ]ÈÛÙH\ÈÝ]ÚÜ	ËJNÈHBˆ™]\›ˆŽÂŸB˜ÛÛœÝœ™\ÚZ[™ÈH

HOˆ
ÈŽˆ‹Z[™ÎˆßKÛÜ›Îˆ×KÙY[Žˆ×K›ÛˆJNÂ™[˜Ý[Ûˆ\T™\^JŠHÈËÈXXÚÝ]H\È]™YØ[Žˆ]ÈÚ[™]ÈÝ˜]YÞKÚ]]™\žHZ[™™[Y[X™\™YHÙX]\‚ˆYˆ
‹™ŠHÈË™œ˜YÈH‹™‹™œ˜YÈÈËšX]ÈH‹™‹šX]ÈNÈYˆ
‹™‹™œ˜YÔˆOH[
HË™œ˜YÔˆH‹™‹™œ˜YÔŽÈYˆ
‹™‹™œ˜YÕšY\ÈOH[
HË™œ˜YÕšY\ÈH‹™‹™œ˜YÕšY\ÎÂˆË™œ˜YÒ\™H‹™‹™œ˜YÒ\™OH[È[™Yš[™Yˆ‹™‹™œ˜YÒ\™ÈË™˜]SÙÈH
‹™‹›ÙÈ×JKœÛXÙJ
NÈË™œ˜YÑX\›HH‹™‹™™HÈBˆYˆ
RS‘ÓÓˆ	‰ˆ‹›H	‰ˆ‹’ÊHÂˆÛÛœÝYÈHÈOˆËœÜ]
	Ë‰ÊK›X\
ˆOˆÓÔ”TÖÜ\œÙR[
‹ÍŠWH	‰ˆÓÔ”TÖÜ\œÙR[
‹ÍŠWKšY
NÂˆRS‘ÈHœ™\ÚZ[™Ê
NÈRS‘Ë˜›ÛH‹›XˆÈËÈ
[ˆ\ÈYÙHÛ›NˆH™\^HXXÚ\È›Ý[™ÊBˆ›Üˆ
ÛÛœÝÈÙˆ‹›JHÈÛÛœÝÛÛ\ÈHßNÂˆ›Üˆ
ÛÛœÝÚÚKÛ—HÙˆË˜È×JHÈÛÛœÝYHYÊ‹’ÖÚÚWH	ÉÊNÈYˆ
ZY›[™ÝYœÛÛYJOˆ^
JHÛÛ[YNÈÛÛ\ÖÚYš›Ú[Š	ÊÉÊWHHÈYÎˆYX]ÎˆÙY[ŽˆÛ‹š\œÝˆNÈBˆ›Üˆ
]ÈHØš™XÝšÙ^\ÊÛÛ\ÊK›[™ÝÈÈ
Ë˜Ûˆ
NÈÊÊÊHÛÛ\ÖÉß‰È
È×HHÈYÎˆÉß‰×KX]ÎˆÙY[ŽˆNKš\œÝˆNÈËÈ
H™\ÝÛ›HÛÝ[YˆHZ[™]\ÈÙY[ˆ[Ü™HÛÚÜÈÛÜÙ\ŠBˆRS‘Ë›Z[™ÖÜË››WHHÈšX[Îˆ×KŽˆË]Nˆ[Ùˆ[šX[›ÎˆË››ÈÛÜ›”ÙY[ŽˆËÈÚ[™ÎˆÈ‹‹ŠËšÈßJHKÛÛ\ÈNÈHBˆYˆ
T‹šÊH™]\›ŽÂˆË›˜][ÛœË™›Ü‘XXÚ

JHOˆÈÛÛœÝÈH‹šÖÚWNÂˆYˆ
ÈOOH	Û	È	‰ˆ‹™È	‰ˆ‹™ÖÚWJHÈšÚ[™H	ÛX\›™\‰ÎÈ™Ù[›ÛYHH‹™ÖÚWKœÛXÙJ
NÈ˜›ÛH
‹˜ˆ	‰ˆ‹˜–ÚWJHÈ›[ÙHH
‹›[È	‰ˆ‹›[ÖÚWJH	Ù^Ü™IÎÈšX[H
‹ˆ	‰ˆ‹–ÚWJHNÂˆ™Ù[ˆHÈ™œ›ÛHH	ÝHÛÜ›]™\^\ÉÎÈœ\™[ÈH[ÈRÑVTË™›Ü‘XXÚ

Ù^KŠHOˆÈ›YX\Ý\™\ÖÚÙ^WHHX]œ›Ý[™
™Ù[›ÛYVÚ—JNÈJNÈœÝ]HHÈYˆ	ÛX\›™\‰Ë˜[YNˆSÑWÓSQVÞ›[ÙWH	Ñ^Üš[™ÉË[™Nˆ	ÉÈNÈBˆ[ÙHYˆ
ÈOOH	Ü‰ÊHÈšÚ[™H	Ü›ÙÝYIÎÈ™Ù[›ÛYHH[ÈRÑVTË™›Ü‘XXÚ
Ù^HOˆÈ›YX\Ý\™\ÖÚÙ^WHHÈJNÈœÝ]HH“ÑÕQNÈBˆ[ÙHYˆ
ÈOOH	ÜÉÊHÈÛÛœÝÝHÕUTË™š[™
HOˆKšYOOH

‹œÝ	‰ˆ‹œÝÚWJH	ÜÝ[	ÊJHÕUTÖÌNÈšÚ[™H	ÜÝ[	ÎÈ™Ù[›ÛYHH[ÈRÑVTË™›Ü‘XXÚ
Ù^HOˆÈ›YX\Ý\™\ÖÚÙ^WHHÝœÚÙ^WHÈJNÈœÝ]HHÝÈBˆ[ÙH™]\›ŽÂˆœÝ]U\™Ù]HÈ‹‹ž›YX\Ý\™\ÈNÈœÝ]U[[HYNNÈœÝ]P]HÈYˆ
‹™
H™[X[™H‹™ÚWHÈJNÂŸB‹ËÈHZ[™œ™YZY]ÛÜ›
H™YÚ[YH\È\›™Y[™]ÈZ[™ZÙ\ÈHX[ÊH\ÈÙ\Ú]HÛÜ›	ÜÈÛÙNˆH™\^B‹ËÈ›ÝÜÈHØ[YHXÙH[™ZÙ\ÈHØ[YHÝ˜]YÞKÚ]Ý]HZ[™ÉÈÚÛH\ÝÜžK‚™[˜Ý[Ûˆœ™YYÙÙÙY
JHÂˆÛÛœÝˆHËœœ[‹HHËÚHH
ËÚH
H
ÈKHHˆ	‰ˆ‹È	‰ˆ‹ÖÚHHWNÂˆYˆ
JHÈ›Üˆ
]ÈHÈÈKšÎÈÊÊÊHË™ÛÝ”›™Ê
NÈ™]\›ˆÈÎˆK™ËœÛXÙJ
K›ÛˆK˜ˆ[ÙNˆK›H	Ù]›Û™IËÙ[ŽˆK›ˆœ›ÛNˆK™ˆ[\™[ˆKœ[NÈBˆ]ÈHÈÛÛœÝˆH

HOˆÈÊÊÎÈ™]\›ˆË™ÛÝ”›™Ê
NÈKÛHHØ[\QÙ[›ÛYJKŠNÂˆYˆ
Ëœœ	‰ˆTŠH
ËœœÈHËœœÈ×JKœ\Ú
ÈÎˆÛK™ËœÛXÙJ
KŽˆÛK˜›ÛNˆÛK›[ÙKŽˆÛK™Ù[ˆŽˆÛK™œ›ÛH[ˆÛKœ\™[ÈÛKœ\™[œÛXÙJ
Hˆ[ÈJNÂˆ™]\›ˆÛNÂŸB‹ËÈKKKH^Z[™ÈHÛÜ›YØZ[‹Üˆ™YÚ[›š[™ÈHš^Y[‹\™H[™›ÝÂ™[˜Ý[Ûˆ^UÛÜ›
ÛÙJHÈËÈHØ[YHÛÜ›YØZ[ˆ
›Ý[™ÈÙˆ]\ÈÙ\
BˆÛÛœÝˆHXÛÙUÛÜ›
ÛÙJNÈYˆ
\ˆÑ‘Ë˜Ø[XŠH™]\›ˆ˜[ÙNÂˆÛÛœÝØ]™YH‘TVH	‰ˆ‘TVKœØ]™YÈ‘TVHHÈ˜]ÎˆÝš[™ÊÛÙJKš[J
K‹Û™Nˆ˜[ÙK]™Nˆ˜[ÙKØ]™YNÂˆžHÈÛÜÙP\˜Ú]™J
NÈHØ]Ú
JHßH[˜X›Ý]šY[ˆHYNÈžHÈYT™\Ü

NÈHØ]Ú
JHßBˆYˆ
ÊHËœ™\Ü]HÂˆ™]ÕÛÜ›

NÈ™]\›ˆYNÂŸB˜\Þ[˜È[˜Ý[Ûˆ^PÛÙJ‹ŠHÈËÈHÛÙHœ›ÛHH\ÝÜˆ\YˆHÚÜÛ™H^YYÚÛKœ›ÛH]Èš[[ˆH\˜Ú]™BˆˆHÝš[™Êˆ	ÉÊKš[J
NÈ]ÛÙHHŽÂˆYˆ
]‹š[˜ÛY\Ê	Ë‰ÊJHÈÛÛœÝXYH‹ÓÝÙ\Ø\ÙJ
NÈžHÈÛÛœÝ]H
]ØZ]\˜Ð[

JK™š[™
Oˆ\HOOH	ÝÛÜ›	È	‰ˆœ™XÈ	‰ˆœ™XË˜ÛÙH	‰ˆœ™XË˜ÛÙKœÜ]
	Ë‰ÊVÌKÓÝÙ\Ø\ÙJ
HOOHXY	‰ˆ
ˆOH[œ™XË›ˆOOHŠJNÈYˆ
]
HÛÙHH]œ™XË˜ÛÙNÈHØ]Ú
JHßBˆYˆ
ÛÙHOOHˆ	‰ˆ×—
ËVÌNXK^—JËW	ÚK\Ý
ŠJH\
ÛÜ›	ÜYŠ\œÙR[
‹L
J_x &\Èš[\È›ÈÛ™Ù\ˆ[ˆH\˜Ú]™NˆÛ›H]È™YÚ[›š[™ÜÈØ[ˆ™H^YY
]ÈÙYY]ÈÝ]\È[™Z\ˆXÙ\ÊKÚ]Z[™È]Ý\Yœ™\Ú˜
NÈBˆ™]\›ˆ^UÛÜ›
ÛÙJNÂŸB™[˜Ý[Ûˆ™\^QÛ™J
HÈËÈH™\^H\ÈÝ™\Žˆ˜XÚÈÈHÛÜ›ÈÙˆ\ÈØÜ™Y[‹\È^HÙ\™BˆÛÛœÝˆH‘TVNÈ‘TVHH[ÈYˆ
TŠH™]\›ŽÂˆYˆ
‹œØ]™Y
HÈRS‘ÈH‹œØ]™Y›Z[™ÎÈBˆžHÈÛÛœÝHH™]ÈT“
ØØ][Û‹š™YŠNÈ]ÚH˜[ÙNÂˆYˆ
KœÙX\˜Ú\˜[\Ëš\Ê	ÝÛÜ›	ÊJHÈKœÙX\˜Ú\˜[\Ë™[]J	ÝÛÜ›	ÊNÈÚHYNÈBˆYˆ
Kš\Ê	ÝÛÜ›	ÊJHÈK™[]J	ÝÛÜ›	ÊNÈKš\ÚHKÔÝš[™Ê
Kœ™\XÙJÏJÏIŸ	
KÙË	ÉÊNÈÚHYNÈBˆYˆ
Ú
H\ÝÜžKœ™\XÙTÝ]J[	ÉËKÔÝš[™Ê
JNÈHØ]Ú
JHßBˆ™[™\“[™XYÙJ
NÈ™]ÕÛÜ›

NÂŸB˜ÛÛœÝÑQQ•SˆH×NÈËÈHš^Y[‰ÜÈÝÛˆÛÜ›Ë›Üˆ]ÈÙX]\‚˜ÛÛœÝÑQQˆHÈÛØÚÎˆˆÜ[ŽˆÝˆÈ›]ˆÛØ™NˆK›™Îˆ[NÈËÈ[™]ÈšY]ÉÜÈ\›œËÛˆ]ÈÝÛˆÛØÚÂ™[˜Ý[Ûˆ™YÚ[”[ŠÙYY
HÈËÈHš^Y[‹œ›ÛH\™NˆHØ[YHÛÜ›Ë[ˆÜ™\‹Ú]Z[™ÈÙˆ]ÈÝÛ‚ˆYˆ
Ñ‘Ë˜Ø[XŠH™]\›ˆ˜[ÙNÂˆYˆ
‘TVJHÈÛÛœÝˆH‘TVNÈ‘TVHH[ÈYˆ
‹œØ]™Y
HRS‘ÈH‹œØ]™Y›Z[™ÎÈBˆÑ‘ËœÙYYHÙYYˆÈÑQQÈHÈÑQQ•S‹›[™ÝHÈØš™XÝ˜\ÜÚYÛŠÑQQ‹ÈÛØÚÎˆˆÜ[ŽˆÝˆÈ›]ˆÛØ™NˆK›™Îˆ[JNÂˆRS‘ÈHØYZ[™ÊYJNÈRS‘ÒÑQTH˜[ÙNÂˆžHÈKœÙ]
	ÜÙYY	ËÝš[™ÊÑ‘ËœÙYY
JNÈK™[]J	ÝÛÜ›	ÊNÈÛÛœÝHH™]ÈT“
ØØ][Û‹š™YŠNÈKš\ÚHKÔÝš[™Ê
Kœ™\XÙJÏJÏIŸ	
KÙË	ÉÊNÈ\ÝÜžKœ™\XÙTÝ]J[	ÉËKÔÝš[™Ê
JNÈHØ]Ú
JHßHËÈ
HY™\ÜÈÙY\È]ˆÜ[™YYØZ[‹H[ˆ™YÚ[œÈYØZ[ŠBˆžHÈÛÜÙP\˜Ú]™J
NÈHØ]Ú
JHßH[˜X›Ý]šY[ˆHYNÈžHÈYT™\Ü

NÈHØ]Ú
JHßBˆYˆ
ÊHËœ™\Ü]HÂˆ™]ÕÛÜ›

NÈ™]\›ˆYNÂŸB‹ËÈKKKHH›Ü™\œÉÈÙ[ÛY]žKÛˆHÛÜ›	ÜÈÛØÚËˆÛˆHÛØ™HXXÚÝ]HÛÈH\ÙˆH˜[™X\™\Ý]È\›ŽÂ‹ËÈÛˆH[™KH\ÙˆH[™NˆHšY]È\È\ÙˆHÛÜ›	ÜÈ\ÚXÜËÛÈ]\›œÈÛˆHÛÜ›	ÜÈÝÛˆÝ\Ë‚™[˜Ý[Ûˆ\›•ÊÊHÈËÈHšY]È\›œÈ›ÝË[™\ˆH\ÜÛÛ™BˆYˆ
Ñ‘Ë™ÛØ™HOOHH]ÊH™]\›ŽÂˆÕËØ[H[ÈÕËÈH[ÂˆYˆ
]Ú[™ÝË—×Ó”ˆ	‰ˆJÑ‘Ë™™ˆˆ	‰ˆÚ[U

HÑ‘Ë™™ŠJHÈžHÈ™[™\Š]™PY‹È˜YNˆX]›Z[ŠK
\™›Ü›X[˜ÙK››ÝÊ
HHË˜›Ü›ŠHÈL
HJNÈÝÓ^JÕË‘TŠNÈHØ]Ú
JHßHHËÈ
˜]ÛˆYœ™\ÚˆHœ˜[YHÛˆØÜ™Y[ˆ™XYÈ˜XÚÈ[\JBˆÙ]ÛØ™JH]ËYJNÈ’QUÔÕË˜\ÞHH˜[ÙNÈØÝ[Y[˜›ÙK˜Û\ÜÓ\Ýœ™[[Ý™J	Ý\›š[™ÉÊNÂŸB™[˜Ý[ÛˆÙYYÜ[ŠÛØ™JHÈÛÛœÝÈHÑQQŽÂˆYˆ
TËœ›™ÊHËœ›™ÈH][™\œžJ

Ñ‘ËœÙYY
Hˆ™˜ŽYJHˆ
NÂˆ™]\›ˆ
ÛØ™HÈ’QUÔÕË‘ÓÐ‘Hˆ’QUÔÕË“PT
H
ˆ
ŽH
ÈŒÈ
ˆËœ›™Ê
JNÈB™[˜Ý[ÛˆÙYY\›œÊŠHÈËÈHš^Y[‰ÜÈšY]È\›œÈ\È]™\‹]ÛˆHÛÜ›	ÜÈÛØÚÂˆYˆ
U’QUÔÕË›ÛŠH™]\›ŽÂˆÛÛœÝÈHÑQQŽÈYˆ
TËœÜ[ŠHËœÜ[ˆHÙYYÜ[ŠÑ‘Ë™ÛØ™JNÂˆË˜ÛØÚÈ
ÏHŽÈËÝÐÑ‘Ë™ÛØ™HÈ	ÙÛØ™IÈˆ	Ù›]	×H
ÏHŽÂˆYˆ
Ëœ\ÙHOOH	Ø[]™IÊH™]\›ŽÂˆYˆ
ÑQS‹›Ûˆ	‰ˆPÑ‘Ë™ÛØ™H	‰ˆ˜[ÓY

HHH	‰ˆUË˜œ™XXÚ
HÈ\›•ÊYJNÈËHË˜ÛØÚÎÈËœÜ[ˆHÙYYÜ[ŠYJNÈ™]\›ŽÈHËÈš]™H˜[ÈÜˆ™]Ù\ŽˆHÛØ™BˆYˆ
Ñ‘Ë™ÛØ™H	‰ˆšY]ÓØÚÙY

JH™]\›ŽÂˆYˆ
Ë˜ÛØÚÈHËËœÜ[ˆË˜›ÛÜÝË˜œ™XXÚ
H™]\›ŽÈËÈXXÚ\›ˆØZ]È›Üˆ]ÈÝ[[™›ÜˆH[ÛY[œ™YHÙˆHœ™XZÛÝ]ˆ\›•ÊPÑ‘Ë™ÛØ™JNÈËHË˜ÛØÚÎÈËœÜ[ˆHÙYYÜ[ŠÑ‘Ë™ÛØ™JNÂŸB™[˜Ý[ÛˆÙ[ÕXÚÊ‹ŠHÂˆÛÛœÝˆHËœœ[ŽÂˆYˆ
ŠHÈÛÛœÝˆH‹ˆ×NÈÚ[H

ËšH
H‹›[™Ý	‰ˆ–ÕËšHVÌHHŠHÈ\›•ÊH]–ÕËšHVÌWJNÈËšHH
ËšH
H
ÈNÈHHËÈH™\^H\›œÈ\È]ÈÜšYÚ[˜[Yˆ[ÙHYˆ
Ñ‘ËœÙYYOH[
HÙYY\›œÊŠNÂˆÛÛœÝÈHÑ‘Ë™ÛØ™HÈHˆÂˆYˆ
ÈOOHË™ÚÕÊHÈË™ÚÕÈHÎÈYˆ
Ëœœ	‰ˆTŠH
ËœœˆHËœœˆ×JKœ\Ú
Ø‹×JNÈHËÈ
H\›ˆžH[™ÜˆžHHØÜ™Y[‰ÜÈÝÛˆÛØÚÎˆÙ\Ú]HÛÜ›
BˆYˆ
Ë™ÚÈOOHË™ÚÕÊHÈË™ÚÈ
ÏH
Ë™ÚÕÈHË™ÚÊH
ˆX]›Z[ŠKˆ
ˆKŠNÈYˆ
X]˜XœÊË™ÚÕÈHË™ÚÊHŒÊHË™ÚÈHË™ÚÕÎÈBˆYˆ
ÓÐ‘WÒÈOOHË™ÚÊHÈÓÐ‘WÒÈHË™ÚÎÈYˆ
Ë›˜]JHË›˜]KQÛØ™HHÓÐ‘WÒÎÈBŸB™[˜Ý[ÛˆXÙUXÚÊŠHÈËÈHXÙH\ÚÙY›ÜˆžHHš\Ú]Ü‹œ›ÛH\ÈÝ\
[™[ˆH™\^K\È]Ø\ÊBˆÛÛœÝˆHËœœ[ŽÂˆYˆ
ŠHÈÛÛœÝH‹œ×NÈÚ[H

ËœH
H›[™Ý	‰ˆÕËœHVÌHHŠHÈÙ]XÙJÕËœHVÌWJNÈËœHH
ËœH
H
ÈNÈH™]\›ŽÈBˆYˆ
ËœXÙUØ[OH[
H™]\›ŽÂˆÛÛœÝ]ˆHËœXÙUØ[ÈËœXÙUØ[H[ÈYˆ
]ˆOOHËš]ŠH™]\›ŽÂˆÙ]XÙJ]ŠNÈYˆ
Ëœœ
H
ËœœœHËœœœ×JKœ\Ú
Ø‹]—JNÂŸB™[˜Ý[ÛˆÙ]XÙJ]ŠHÈËš]ˆH]ŽÈYˆ
Ëœ\ÙHOOH	Ø[]™IÊH›Üˆ
ÛÛœÝÙˆË›˜][ÛœÊH›™^˜]ÕHX]›Z[Š›™^˜]ÕÚ[U

H
È˜][Û’[\˜[

JNÈB‹ËÈKKKHH˜]Ûˆ]È\ÈZÙ[ˆ\ÛˆHÝ\ÙˆHÛÜ›	ÜÈÛØÚËˆHÛÜ›ÙˆHØÜ™Y[‰ÜÈÝÛˆZÙ\È]\\ÈÛÛÛˆ\È]‹ËÈ\ÈÛÛ\[Y
œ›ÛHHšYÙˆHÙXÛÛ™Y\ˆH˜]ËÚ[H]È˜[Ý[˜[ÊK[™ÙY\È]Ý\Ú]]ÈÛÙNÂ‹ËÈH™\^HZÙ\È]\Ûˆ]Ø[YHÝ\[™Hš^Y[ˆ\È]È˜[[™ÎÈZ]\ˆØZ]È›Üˆ]ÈÛÛ\[HYˆ™YY™K‚™[˜Ý[Ûˆ[œÝ[YJ
HÂˆÛÛœÝHËœ[™[™ÎÈYˆ
\šÈOH[ËœÝ\šÊH™]\›ˆYNÂˆYˆ
šÚ[™OOH	Ù˜]ÉÊH™]\›ˆÛ[™[™ÊYJNÂˆÛÛœÝˆHËœœ[‹]Hˆ	‰ˆ‹š[œÈÈ‹š[œÖÕËš[œÒÈHˆ[ÂˆYˆ
]OH[
H™]\›ˆËœÝ\]Û[™[™ÊYJNÂˆYˆ
ˆÑ‘ËœÙYYOH[
H™]\›ˆËœÝ\šÛ[™[™ÊYJNÂˆÛ[™[™ÊYJNÈ™]\›ˆYNÂŸB‹ËÈKKKHH™XY[™ÜËÛˆHÛÜ›	ÜÈÛØÚÎˆ\ÚÙY›Üˆ]™\žH™]È›ØÚÜË[™ZÙ[ˆ\Hš^Y[X™\ˆÙˆÝ\È]\ˆ
žB‹ËÈ[ˆHÔH\ÈÛ™Èš[š\ÚYÛÈ›Ý[™ÈØZ]ÊKÚ]]™\ˆHœ˜[Y\Â™[˜Ý[ÛˆÝ]\ÜÝYJ
HÂˆÛÛœÝ\›ˆH
Ý]K™œ›ÜÝˆH
Ý]K™œ›ÜÝˆ
H
ÈJH	HÈOOHKXÈH\›ˆ	‰ˆHJPË›Ûˆ	‰ˆËœXÔ›ÙÈ	‰ˆÝ]K”TÊNÂˆÛÛœÝ™XYÈHYX\Ý\™QÔJ]™PY‹\›‹XËYJNÂˆ‹œ[™HÈÞ[˜ÎˆÛ™™[˜ÙTÞ[˜ÊÛ”ÖS×ÑÔWÐÓÓSPS‘×ÐÓÓTUK
K™XYË\›‹XËÎˆËÞŽˆÝ]K[\ÖÌH
ˆÝ]K[\ÖÌWH
ˆYNˆËœÝ\
È
Ë˜›ÛÜÝÈˆˆÊH
ˆ“ÈNÈÛ™›\Ú

NÂŸB™[˜Ý[ÛˆÝ]ZÙJ
HÂˆÛÛœÝH‹œ[™È‹œ[™H[Âˆ›Üˆ
ÛÛœÝÚKÝHÙˆœ™XYÊHÈÛ˜š[™Y™™\ŠÛ”VSÔPÒ×Ð•Q‘‘T‹‹œ›ÖÚWK˜ŠNÈÛ™Ù]Y™™\”ÝX‘]JÛ”VSÔPÒ×Ð•Q‘‘T‹Ý
NÈBˆÛ˜š[™Y™™\ŠÛ”VSÔPÒ×Ð•Q‘‘T‹[
NÈžHÈÛ™[]TÞ[˜ÊœÞ[˜ÊNÈHØ]Ú
JHßBˆ™]\›ˆYX\Ý\™PÔJ]™PY‹\›‹œXÊNÂŸB™[˜Ý[ÛˆÝ]Ð›ØÚÊ
HÂˆÛÛœÝH‹œ[™È]ÝH[ÂˆYˆ
	‰ˆ
ÈOOHÈœÞˆOOHÝ]K[\ÖÌH
ˆÝ]K[\ÖÌWH
ˆTœ™XYË™]™\žJˆOˆ–ÌWK›[™ÝOOHœÞŠJJHÈžHÈÛ™[]TÞ[˜ÊœÞ[˜ÊNÈHØ]Ú
JHßH‹œ[™H[ÈBˆYˆ
‹œ[™
HÈYˆ
ËœÝ\H‹œ[™™YJHÝHÝ]ZÙJ
NÈBˆ[ÙHYˆ
\˜“ÛŠ
HUËœÝ]ÓŠHÝHYX\Ý\™J]™PYŠNÈËÈ]Û˜ÙNˆHÛÜ›	ÜÈš\œÝ™XY[™È
ÜˆÚ\™H™XY[™ÜÈØ[››ÝØZ]
BˆYˆ
Ý
HËœÝ]ÓˆH
ËœÝ]Óˆ
H
ÈNÂˆYˆ
˜“ÛŠ
H	‰ˆT‹œ[™
HÝ]\ÜÝYJ
NÂˆ™]\›ˆÝÂŸB‹ËÈKKKHH˜XÙHÝ]ÙˆÚYÚ[œÈÛˆHÛÜ›	ÜÈÝ\ÈÛÈ
Û™HÙˆ]ÈÝÛˆÈXXÚÙˆHÛÜ›	ÜÊKÛÈÚ]]˜[Y\Ë‹ËÈ[™Ú[ˆHZ[™ÈX\ˆÙˆ]\ÈHØ[YHÝÙ]™\ˆHœ˜[Y\È˜[™[˜Ý[Ûˆ]›ØÝ\Ê‹Y
HÂˆÛÛœÝHË›ØÈ
Ë›ØÈH×JKˆHÛ‹šWH
Û‹šWHHÈ›ØÝ\Îˆ[™]Žˆ[JNÈYˆ
‹™›ØÝ\ÈOOHY
H™]\›ŽÂˆ‹œ™]ˆH‹™›ØÝ\ÎÈ‹™›ØÝ\ÈHYÈÛÛœÝ^HOˆÈË˜XÝ]™K™š[™[™^
HOˆK™Y‹šYOOH
HˆLNÂˆ
Ë™›ØÝ\Õ
Ë™›ØÝ\ÕH™]È›Ø]Ì\œ˜^JŒ
K™š[
LJJJKœÙ]
Ú^
‹™›ØÝ\ÊK^
‹œ™]ŠKK‹šH
ˆ
NÂŸB˜ÛÛœÝ˜XÙUØZ]ÈH

HOˆK˜™È	‰ˆK˜XÝ]™H	‰ˆKœ\ÙHOOH	Ý™\™XÝ	È	‰ˆKœ›ÙÈ	‰ˆ\›ÙÜ˜[T™XYJKœ›ÙÊNÂ‚‹ËÈKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKHH™XÛÜ™ÙˆHÛÜ›\È]Èš[[È]™[˜Ý[Ûˆš[˜]J‹Ú[™ÚÛJHÂˆYˆ
‹›ÜÝÓ˜Sˆ‹™XY
H™]\›ˆ	ÛÜÝÈH›ÚY	ÎÂˆYˆ
[‹˜[]™JHÈÛÛœÝÈHÝÛ™\“ÙŠŠNÈ™]\›ˆÈÈZÙ[ˆžH	ÛË›˜[Y_Xˆ	ÝZÙ[‰ÎÈBˆ™]\›ˆÚ[™OOH	Ø›XÚÉÈÈ	ÛÜÝÈH›ÚY	ÈˆÚ[™OOH	ÚX]	ÈÈ	ÝÛÜ›ˆÝ]	ÈˆÚ[™OOH	ÜÝ\š]™Y	ÈÈ
ÚÛHOOH˜[ÙHÈ	ÜÝ\š]™Y	Èˆ	ÝÛÛ‰ÊHˆÚ[™OOH	ÚÙ\	ÈÈ	Ú[Ý[	Èˆ	ÜÝÜY	ÎÂŸB™[˜Ý[Ûˆš[]JËÚ[™
HÂˆÛÛœÝÛÛHÚ[™OOH	ÜÝ\š]™Y	È	‰ˆ

ËœÝ]È	‰ˆËœÝ]Ë™œ›ÜÝ
H
HˆÓÓÕÒSŽÂˆYˆ
Ú[™OOH	ÜÝ\š]™Y	ÊHÈÛÛœÝ[HË›˜][ÛœË™š[\ŠˆOˆ‹˜[]™JK›X\
ˆOˆ‹›˜[YJK\›•HË›\Ý˜[žH	‰ˆË›˜][ÛœË›[™ÝˆHÈ	ÝË›\Ý˜[žK›˜[Y_x &\È\›ˆ\È[\Xˆ	ÝH\›ˆ\È[\IÎÂˆYˆ
Ë›˜][ÛœËœÛÛYJÜÝ›ÚY
JH™]\›ˆØ	Ü“\Ý
[
_HÝ\š]™YËœÙX[YÈ	ÝHXØÛÜ™ÛÉÈˆË›Ý]\ÝYÈ	ÝH›ÚYÝ]\ÝY	Èˆ\›•NÈËÈH›ÚYÛÚÈÛÛYNˆÝ\š]›ÜœË›ÝHÚ[‚ˆ™]\›ˆËœÙX[YÈÉÕÛÛ‹ÙX[Y	Ë	ÝHXØÛÜ™ÛÉ×HˆÛÛÈÉÕÛÛ‹œ›Þ™[‰Ë\›•HˆÉÕHÛÜ›Ú[œÉË\›•NÈBˆYˆ
Ú[™OOH	Ø›XÚÉÊH™]\›ˆÉÕHÛÜ›\È[™Y	Ë	Ú[ˆH›ÚY	×NÂˆYˆ
Ú[™OOH	ÚX]	ÊH™]\›ˆÉÕHÛÜ›ÛÜ™HÝ]	Ë	Ý\HÙXÛÛ™È\ÝH[™I×NÂˆYˆ
Ú[™OOH	ÚÙ\	ÊH™]\›ˆÉÒ[Ý[	Ë	Û›Ý[™È[Ý™Y	×NÂˆ™]\›ˆËœÝYÛ˜[ÈÉÕHÛÜ›ÝYÛ˜]Y	Ë	Û›Ý[™ÈØ\È\›Z]Y	×HˆÉÓ›Ý[™È[Ü™HÛÝ[™H˜]Û‰Ë	Ú]ÝÜY	×NÂŸB˜ÛÛœÝ“\ÝHOˆ›[™ÝˆHÈœÛXÙJLJKš›Ú[Š	Ë	ÊH
È	È[™	È
ÈÛ›[™ÝHWHˆ
ÌH	ÉÊNÂ˜ÛÛœÝ“[HHÈOˆÝš[™Ê•SUÖÚ×HÊKÓÝÙ\Ø\ÙJ
NÂ™[˜Ý[Ûˆš[ÝÜžJËÚ[™[\XØ]Y˜]œ™XZÜÊHÈËÈÛÈÜˆ™YHÙ[[˜Ù\ÎˆÝÈ][™Y[™Ú]H›ÚYYˆÛÛœÝÈH×KÜÝH˜]™š[\ŠˆOˆ‹™˜]HOOH	ÛÜÝÈH›ÚY	ÊK›X\
ˆOˆ‹›˜[YJK[H˜]™š[\ŠˆOˆ‹™˜]HOOH	ÝÛÛ‰È‹™˜]HOOH	ÜÝ\š]™Y	È‹™˜]HOOH	Ú[Ý[	ÊK›X\
ˆOˆ‹›˜[YJNÂˆÛÛœÝZÙ[ˆH˜]™š[\ŠˆOˆ‹™˜]KœÝ\ÕÚ]
	ÝZÙ[‰ÊJK›X\
ˆOˆ‹›˜[YJKXÙHHX]œ›Ý[™


ËœÝ]È	‰ˆËœÝ]Ë™œ›ÜÝ
H
H
ˆL
NÂˆÛÛœÝÜ™HÈOˆÈ
È

È	HLHLH	‰ˆÈ	HLHLÊHÈ	Ý	Èˆ
ÈNˆ	ÜÝ	ËŽˆ	Û™	ËÎˆ	Ü™	ÈVÚÈ	HLH	Ý	ÊJKÛ™HH˜]›[™ÝOOHHÈ˜]ÌK™ˆ[ÈËÈ˜]ÜËÝ]HžHÝ]BˆYˆ
Ú[™OOH	Ø›XÚÉÊHÈÛÛœÝ\ÝHœ™XZÜÖØœ™XZÜË›[™ÝHWNÂˆËœ\Ú
\Ý	‰ˆ\ÝÚ\™HÈH›ÚYœ›ÚÙHÝ][ˆ	Û\ÝÚ\™_IÛ\Ý™ÈÛˆ]È	ÛÜ™
\Ý™
_H˜]Øˆ	ÉßIÛ\Ý™Ø]™HÈ	ËY\ˆ]YÚ]™[ˆ˜XÚÈHØ]Ú]Ø]™Y]	Èˆ\Ý˜›[™ÈÚ\™H]ÈØ]ÚØ\ÈÛÚÚ[™È›Üˆ	Û\Ý˜›[™Kˆ	ÉßH[™Ü›ÜÜÙYHÛÜ›˜ˆ	ÛÛ™HÈ]˜]È	ÛÛ™_HXˆ	ÕIßH›ÚYœ›ÚÙHÝ]	Û\Ý	‰ˆ\Ý˜›[™ÈÚ\™H]ÈØ]ÚØ\ÈÛÚÚ[™È›Üˆ	Û\Ý˜›[™Kˆ	ÉßH[™Ü›ÜÜÙYHÛÜ›˜
NÂˆËœ\Ú
[\XØ]Y	‰ˆ[\XØ]Y›[™ÝÈHÚ\ÛÛŽˆ	Ü“\Ý
[\XØ]YœÛXÙJ
J_K˜ˆ	Ó›ÈÚ[™ÛH[HY]È]Ø\ÈÛÛ\ÜÙY‰ÊNÈBˆ[ÙHYˆ
Ú[™OOH	ÜÝ\š]™Y	ÊHÂˆÛÛœÝÈHZÙ[‹›[™ÝÈ	Ü“\Ý
ZÙ[Š_H	ÝZÙ[‹›[™ÝˆHÈ	ÝÙ\™IÈˆ	ÝØ\ÉßHZÙ[ˆÝ™\‹ˆˆ	ÉÎÂˆÛÛœÝÛHÜÝ›[™ÝÈ	ÝßIÜ“\Ý
ÜÝ
_H\š\ÚY[™	Ü“\Ý
[
_HÝ\š]™YXXÚžHÛÛYHÛÛXš[˜][ÛˆÙˆXÚÈ[™HÛÛ›ÛÈ]Y[ˆXÙK˜ˆˆZÙ[‹›[™ÝÈ	ÝßUH›ÚYÛÚÈ›ÈÝ]K[™HÛÜ›[	ÚXÙHˆÓÓÕÒSˆ
ˆLÈ	ÚXÙ_IHÙˆ]œ›Þ™[ˆ[™\ˆ]ÈÝÛˆØ]Úˆ	ÉßK˜ˆ	ÉÎÂˆYˆ
ËœÙX[Y
HËœ\Ú
	Ñ]™\žHÝ]HÝ[Ý[™[™ÈÚYÛ™YHXØÛÜ™[™›Ý[™ÈØ\ÈYÈ˜]È]Ú]]˜[œË‰È
È
ÛÈ	È	È
ÈÛˆ	ÉÊJNÂˆ[ÙHYˆ
Û
HËœ\Ú
Û
NÂˆ[ÙHËœ\Ú
	ÝË›\Ý˜[žH	‰ˆ˜]›[™ÝˆHÈ	ÝË›\Ý˜[žK›˜[Y_H[\YY]È\›ˆš\œÝˆH\›ˆØ\È[\YY	ÛÛ™HÈ[ˆ	ÛÛ™_H˜]ÜØˆ	ÉßXH[™HÛÜ›[	Û˜]›[™ÝˆHÈ	Ë]™\žHÝ]H[ˆ][]™IÈˆ	ÉßIÚXÙHˆÓÓÕÒSˆ
ˆLÈ	ÚXÙ_IHÙˆ]œ›Þ™[ˆ[™\ˆ]ÈÝÛˆØ]ÚˆXÙHÈ	ËÝ[[Ýš[™ÉÈˆ	ÉßK˜
NÈBˆ[ÙHYˆ
Ú[™OOH	ÚX]	ÊHËœ\Ú
]Ü[\HÙXÛÛ™È\ÝH[™K[Û[™ÛÜ™HÝ]ˆ›È[HY][™›ÈÝ]H[Û™K˜
NÂˆ[ÙHYˆ
Ú[™OOH	ÚÙ\	ÊHËœ\Ú
	ÓX]œ›Ý[™


ËœÝ]È	‰ˆËœÝ]Ë™œ›Þ™[ŠH
H
ˆL
_IHÙˆ]Ø\È[Ý[žH]ÈÝÛˆØY™YÝX\™Ë˜
NÂˆ[ÙHËœ\Ú
ËœÝYÛ˜[È›Üˆ™YHZ[]\È›Ý[™ÈØ\È\›Z]Y[™]ÝÜY˜ˆ›Ý[™ÈY[ˆH\›ˆÛÝ[™H˜]Û‹[™]ÝÜY˜
NÂˆÛÛœÝ˜ˆHœ™XZÜË›[™ÝÂˆYˆ
˜ˆ	‰ˆJÚ[™OOH	Ø›XÚÉÈ	‰ˆ˜ˆOOHJJHÈÛÛœÝØ]YÚHœ™XZÜË™š[\ŠˆOˆ‹˜Ø]YÚ
K›[™ÝÂˆËœ\Ú
H›ÚYœ›ÚÙHÝ]	Û˜ˆOOHHÈ	ÛÛ˜ÙIÈˆ˜ˆOOHˆÈ	ÝÚXÙIÈˆ“[J˜ŠH
È	È[Y\ÉßIØØ]YÚÈÈ	ØØ]YÚOOH˜ˆÈ
˜ˆOOHHÈ	Ú]Ø\ÈØ]YÚ[ˆ[YIÈˆ	ÙXXÚ[YH]Ø\ÈØ]YÚ	ÊHˆ“[JØ]YÚ
H
È
Ø]YÚOOHHÈ	ÈØ\ÉÈˆ	ÈÙ\™IÊH
È	ÈØ]YÚ[ˆ[YIßXˆ	ÉßK˜
NÈBˆ[ÙHYˆ
[˜ˆ	‰ˆÚ[™OOH	Ø›XÚÉÊHÈÛÛœÝHHÚ[™OOH	ÜÝ\š]™Y	È	‰ˆÈOOHÈÈ[šÛ›ÝÛ•ÚJ
Hˆ[ÈËœ\Ú
	ÕH›ÚY™]™\ˆœ›ÚÙHÝ]‰È
È
HÈ	È	È
ÈVÌWHˆ	ÉÊJNÈBˆYˆ
ZÙ[‹›[™Ý	‰ˆË›[™ÝÈ	‰ˆÚ[™OOH	ÜÝ\š]™Y	ÊHËœ\Ú
	Ü“\Ý
ZÙ[Š_H	ÝZÙ[‹›[™ÝˆHÈ	ÝÙ\™IÈˆ	ÝØ\ÉßHZÙ[ˆÝ™\‹˜
NÂˆ™]\›ˆËš›Ú[Š	È	ÊNÂŸB™[˜Ý[Ûˆš[™XÛÜ™
Ë[\XØ]Y
HÂˆÛÛœÝÚ[™HË™[™YÈË™[™YšÚ[™ˆ	ÜÝ[Y	ËÝ]KY×HHš[]JËÚ[™
NÂˆÛÛœÝ˜]HË›˜][ÛœË›X\
ˆOˆ
ÈNˆ‹šK˜[YNˆ‹›˜[YK[ˆ[ÙŠ‹šJK›X\
ˆOˆX]œ›Ý[™
X]›X^
X]›Z[ŠKŠJH
ˆMJJK˜]Nˆš[˜]J‹Ú[™]Ë›˜][ÛœËœÛÛYJÜÝ›ÚY
JK[\Îˆ‹š\ÈÈ‹š\ËœÚ^™Hˆˆ‹™˜]ÜÈˆ‹˜XÜ›ÜÜÈˆ‹œ]ÈˆX[ÎˆRÑVTË›X\
ÈOˆ‹›YX\Ý\™\ÖÚ×H
KÚ[™ˆ‹šÚ[™	ÉÈJJNÂˆÛÛœÝÚ\ÛÛ’YÈHËš[\XØ]Y™]ÈÙ]

NÂˆÛÛœÝ\›ˆHÕ›X\
OˆÈ]žHHLKH[™š[š]NÂˆ›Üˆ
ÛÛœÝˆÙˆË›˜][ÛœÊHÈYˆ
[‹š\È[‹š\Ëš\ÊšY
JHÛÛ[YNÈÛÛœÝÈH‹™ÛÝ]	‰ˆ‹™ÛÝ]ÙšYHOH[È‹™ÛÝ]ÙšYHˆÈYˆ
È
HÈHÎÈžHH‹šNÈHBˆ™]\›ˆØžK\Ñš[š]J
HÈ
ÝÑš^Y
JHˆLKÚ\ÛÛ’YËš\ÊšY
HÈHˆNÈJNÂˆÛÛœÝœ™XZÜÈH
Ë˜œ™XZÓÙÈ×JK™š[\ŠˆOˆX‹œ]ZY]
KœÛXÙJMŠKHX]›X^
KX]œ›Ý[™
Ú[U

JJNÂˆËÈˆXXÚÝ]IÜÈÝÛˆ˜]ÜÈ[ˆHÜ™\ˆ]™]È[H
HÚYÚ[	ÜÈ™XYÊKÚÈ™]ÈXXÚ\ÙˆHÚ\ÛÛˆ[™Ú[‹ˆËÈ[™HØ]\ÙHÛœ›ÛHÚ]HÛÜ›Û›ÝÜÈ
ÚÈ[ÝËÚ\™HHØ]ÚØ\ÈÛÚÚ[™ÊBˆÛÛœÝÙ\HHË›˜][ÛœË›X\
ˆOˆ
ÈNˆ‹šKˆÕ›X\

ÊHOˆÚË‹™ÛÝ]	‰ˆ‹™ÛÝ]ÙšYHOH[È
Ê
Û‹™ÛÝ]ÙšYJKÑš^Y
JHˆLKHJ‹šXH	‰ˆ‹šXVÙšYHOOH‹šJWJBˆ™š[\ŠHOˆVÌWHH	‰ˆVÌ—JKœÛÜ

KŠHOˆVÌWHH–ÌWJK›X\
HOˆÙVÌKVÌWWJHJJNÂˆÛÛœÝÛÛH
Ë™X][\È×JK˜ÛÛ˜Ø]
Ë˜XÝ]™H×JK˜[YYH[\XØ]Y	‰ˆ[\XØ]Y›[™ÝÈ[\XØ]YˆË‹‹›™]ÈÙ]
ËœØØ\œÈ×JWNÂˆÛÛœÝÚ\ÛÛžHH˜[YYœÛXÙJŠK›X\
›HOˆÈÛÛœÝ]HÛÛ™š[™
HOˆK™Yˆ	‰ˆK™Y‹›˜[YHOOH›JK›ˆH]ÈË›˜][ÛœÖÚ]›˜][ÛˆHˆ[Âˆ™]\›ˆÛ›K›ˆ	‰ˆË›˜][ÛœË›[™ÝˆHÈ›‹›˜[YHˆ[]È
]œÛ›È]››È
Hˆ]	‰ˆ]˜\œˆ	‰ˆ›ˆ	‰ˆ]˜\œ–Û›‹šWHHÈ
Ê
Ú]˜\œ–Û›‹šWJKÑš^Y
JHˆ[NÈJNÂˆ]Ø]\ÙHH[ÈžHÈØ]\ÙHHØ]\ÙJËÚ[™˜]œ™XZÜËÚ\ÛÛžK
NÈHØ]Ú
JHÈÛÛœÛÛKØ\›Š	ØØ]\ÙIËJNÈBˆÛÛœÝÝÜžLHš[ÝÜžJËÚ[™[\XØ]Y˜]œ™XZÜÊKÝÜžHHØ]\ÙH	‰ˆØ]\ÙK›XYÈØ]\ÙK›XY
È
Ø]\ÙK›[Ü™HÈ	È	È
ÈØ]\ÙK›[Ü™Hˆ	ÉÊHˆÝÜžLÂˆ™]\›ˆÈŽˆÛÙNˆËœœÈÛÜ›ÛÙJËœœ
Hˆ[™\^NˆH]Ëœœ[‹ÚYˆËZY[ŽˆË›‹]ˆ]K››ÝÊ
KÝ[\ˆØØ[Ý[\

KÚ[™]KYËÙX[YˆH]ËœÙX[Y˜]ÜÎˆË™˜]ÜËÝˆÕ›[™Ýˆ˜]ÛŽˆ\›‹™š[\ŠHOˆVÌHH
K›[™Ý˜]\›‹œ™XZÜËÚ\ÛÛŽˆ
[\XØ]Y×JKœÛXÙJŠKÝÜžKXYˆØ]\ÙH	‰ˆØ]\ÙK›XYÈØ]\ÙK›XYˆÝÜžLÙ\KÚ\ÛÛžK™]ÜÎˆ×KˆX]ˆ
ÊËšX]XZÈ
KÑš^Y
ŠKXÙNˆ
Ê

ËœÝ]È	‰ˆËœÝ]Ë™œ›ÜÝ
H
JKÑš^Y
ŠKY™Nˆ×HNÂŸB™[˜Ý[ÛˆY™TÝš\
ËÚ[™
HÈËÈ\Èš]™H[ÛY[È™Y›Ü™HH[™ˆ]Èœ™XZÛÝ]È
Hš\œÝ[™H\Ý
K[™œ˜[Y\ÈÜ™XY›ÝYÚ]ÈY™BˆÛÛœÝHY™Qœ˜[Y\ÊÊKHX]›X^
KËœš[™XÈÈËœš[™XËˆÚ[U

JK[™HÚ[™OOH	Ø›XÚÉÈ	‰ˆË™X]ÈË™X]ˆÂˆ]ZÈH
Ë›X\šÜÈ×JK™š[\ŠHOˆK˜ÊNÈYˆ
Ú[™OOH	Ø›XÚÉÊHZÈHZËœÛXÙJLJNÈËÈH›ÚY[™[™ÉÜÈ\Ý\\[Ûˆ\ÈHš[	ÜÈÝÛˆXÝ\™BˆZÈHZË™š[\ŠHOˆ[™šY]ÊËJJNÂˆYˆ
ZË›[™ÝˆŠHZÈHÛZÖÌKZÖÛZË›[™ÝHWWNÂˆÛÛœÝÝ]HZË›X\
HOˆ
ÈˆKÎˆ	Øœ™XZÉËÎˆK˜ÈJJKØ\HX]›X^
K[™
ˆŒŠKÛÛH™š[\ŠˆOˆ‹[™HX]›X^
KK[™
ˆŒJJNÂˆYˆ
ÛÛ›[™Ý
HÈÛÛœÝHÛÛÌKØ[HHHÝ]›[™ÝÂˆ›Üˆ
]ˆHÈˆØ[ÈŠÊÊHÈÛÛœÝ\™Ù]H
È
[™H
H
ˆˆÈØ[È]™\ÝH[™H[™š[š]NÂˆ›Üˆ
ÛÛœÝˆÙˆÛÛ
HÈYˆ
Ý]œÛÛYJÈOˆX]˜XœÊËH‹
HØ\
JHÛÛ[YNÈÛÛœÝHX]˜XœÊ‹H\™Ù]
NÈYˆ
™
HÈ™HÈ™\ÝHŽÈHBˆYˆ
™\Ý
HÝ]œ\Ú
Èˆ™\ÝÎˆ	ÛY™IËÎˆ™\Ý˜ÈJNÈHBˆÝ]œÛÜ

KŠHOˆKH‹
NÂˆ™]\›ˆÝ]›[™ÝHÈÈÝ]œÛXÙJJHˆ×NÂŸB‹ËÈKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKH˜]Ú[™Â™[˜Ý[Ûˆ‘›ÛÊ
HÂˆYˆ
’S•™›ÛÊH™]\›ˆ’S•™›ÛÎÂˆYˆ
YØÝ[Y[™›ÛÈYØÝ[Y[™›ÛË›ØY
H™]\›ˆ›ÛZ\ÙKœ™\ÛÛ™J
NÂˆ’S•™›ÛÈH›ÛZ\ÙK˜[
ÉÍ›ÙÛšH[ÙH‰Ë	Ú][XÈ›ÙÛšH[ÙH‰Ë	ÍL›ÙÛšH[ÙH‰Ë	ÌÌLœ“X\X[ˆ[Û›È‰Ë	ÍLœ“X\X[ˆ[Û›È‰×Bˆ›X\
ˆOˆØÝ[Y[™›ÛË›ØY
ŠK˜Ø]Ú


HOˆ[
JJK[Š

HOˆ[

HOˆ[
NÂˆ™]\›ˆ’S•™›ÛÎÂŸB™[˜Ý[Ûˆ“›Ú\ÙJ
HÂˆYˆ
’S•››Ú\ÙJH™]\›ˆ’S•››Ú\ÙNÂˆÛÛœÝÈHØÝ[Y[˜Ü™X]Q[[Y[
	ØØ[˜\ÉÊNÈËÚYHËšZYÚHMŽÈÛÛœÝHË™Ù]ÛÛ^
	Ì™	ÊKH˜Ü™X]R[XYÙQ]JM‹MŠNÈ]ÈHNÍMÌŒNÂˆ›Üˆ
]HHÈH™]K›[™ÝÈH
ÏH
HÈÈHÈLÎÈÈHÈˆMÎÈÈHÈNÈÛÛœÝˆHLŽ
È

Èˆ
H	HMHHLÊH
ˆŽNÈ™]VÚWHH™]VÚH
ÈWHH™]VÚH
È—HHŽÈ™]VÚH
È×HHMNÈBˆœ][XYÙQ]J
NÈ™]\›ˆ
’S•››Ú\ÙHHÊNÂŸB™[˜Ý[Ûˆ‘Ü›Ý[™
ËKÛÝÊHÂˆ™š[Ý[HH—ÒS’ÎÈ™š[™XÝ
Ë
NÂˆYˆ
ÛÝÊHÈÛÛœÝÈH˜Ü™X]T˜YX[Ü˜YY[
È
ˆK
ˆŒÍ‹È
ˆK
ˆŒÍ‹X]›X^
Ë
H
ˆÎ
NÈË˜YÛÛÜ”ÝÜ
™Ø˜J	ÙÛÝËš›Ú[Š	Ë	Ê_KŒLÊX
NÈË˜YÛÛÜ”ÝÜ
MK™Ø˜J	ÙÛÝËš›Ú[Š	Ë	Ê_KŒ
X
NÈË˜YÛÛÜ”ÝÜ
K	Ü™Ø˜J
IÊNÈ™š[Ý[HHÎÈ™š[™XÝ
Ë
NÈBŸB™[˜Ý[Ûˆ‘Ü˜Z[ŠËJHÂˆœØ]™J
NÈ™ÛØ˜[[HHŒNÈ™ÛØ˜[ÛÛ\ÜÚ]SÜ\˜][ÛˆH	ÜØÜ™Y[‰ÎÈÛÛœÝH˜Ü™X]T]\›Š“›Ú\ÙJ
K	Ü™\X]	ÊNÂˆYˆ

HÈYˆ
œÙ]˜[œÙ›Ü›H	‰ˆHŠHœÙ]˜[œÙ›Ü›J™]ÈÓSX]š^

KœØØ[JX]›X^
ŒÍKJJJNÈ™š[Ý[HHÈ™š[™XÝ
Ë
NÈHœ™\ÝÜ™J
NÂŸB™[˜Ý[Ûˆ•ÚY
Ë›ÛÊHÈ™›ÛH›ÛÈ™]\›ˆË‹‹œ×Kœ™YXÙJ
KÊHOˆH
È›YX\Ý\™U^
ÊKÚY
H
È
È
H
ˆX]›X^
Ë‹‹œ×K›[™ÝHJNÈB™[˜Ý[Ûˆ•^
ËK›ÛÛÛÜ‹Ë[YÛŠHÈËÈ]\‹\ÜXÙY^
È[ˆ
Bˆ™›ÛH›ÛÈ™š[Ý[HHÛÛÜŽÈ^˜\Ù[[™HH	Ø[X™]XÉÎÈÈHÈÂˆYˆ
[ÊHÈ^[YÛˆH[YÛˆ	ÛY	ÎÈ™š[^
ËJNÈ^[YÛˆH	ÛY	ÎÈ™]\›ˆ›YX\Ý\™U^
ÊKÚYÈBˆÛÛœÝÚHË‹‹œ×KÜÈHÚ›X\
ÈOˆ›YX\Ý\™U^
ÊKÚY
KÈHÜËœ™YXÙJ
KŠHOˆH
È‹
H
ÈÈ
ˆ
Ú›[™ÝHJNÂˆ]ÞH[YÛˆOOH	ÜšYÚ	ÈÈHÈˆ[YÛˆOOH	ØÙ[\‰ÈÈHÈÈˆˆÈ^[YÛˆH	ÛY	ÎÂˆÚ™›Ü‘XXÚ

ËJHOˆÈ™š[^
ËÞJNÈÞ
ÏHÜÖÚWH
ÈÎÈJNÈ™]\›ˆÎÂŸB™[˜Ý[Ûˆ‘š]
ËÚ^™KX^Ë›Û
HÈËÈH\™Ù\ÝÚ^™H
\ÈÚ^™JH]ÚXÚÈš]È[ˆX^Âˆ™›ÛH›Û
Ú^™JNÈÛÛœÝÈH›YX\Ý\™U^
ÊKÚYÈ™]\›ˆÈˆX^ÈÈÚ^™H
ˆX^ÈÈÈˆÚ^™NÂŸB™[˜Ý[Ûˆ”˜[™ÙJK‹KÛÛÜ‹YX\Ý\™JHÈËÈ˜x $Øˆˆ[ˆHÙ\šYˆ]H\Ú˜]Ûˆ\ÈH[H
HYÛ™IÜÈ[ˆ\Ú\ÈHZ\›[™K[™˜[š\Ú\ÈÚ[ˆ\™ÙJBˆ™›ÛH	Ü\	Ô—ÔÑT’QŸXÈ™š[Ý[HHÛÛÜŽÈ^[YÛˆH	ÛY	ÎÈ^˜\Ù[[™HH	Ø[X™]XÉÎÂˆÛÛœÝØHH›YX\Ý\™U^
JKÚYØˆH›YX\Ý\™U^
ŠKÚYØ\H
ˆŒKH
ˆŒÍ‹ÈHØH
Èˆ
ˆØ\
È
ÈØŽÈYˆ
YX\Ý\™JH™]\›ˆÎÂˆ™š[^
KJNÈ™š[™XÝ

ÈØH
ÈØ\HH
ˆŒÌÍKX]›X^
K
ˆŒŠJNÈ™š[^
‹
ÈØH
Èˆ
ˆØ\
ÈJNÈ™]\›ˆÎÂŸB™[˜Ý[Ûˆ•Ü˜\
ËKX^Ë›ÛÛÛÜ‹X^[™\ÊHÂˆ™›ÛH›ÛÈ™š[Ý[HHÛÛÜŽÈ^[YÛˆH	ÛY	ÎÈ^˜\Ù[[™HH	Ø[X™]XÉÎÂˆÛÛœÝÛÜ™ÈHÝš[™ÊÈ	ÉÊKœÜ]
×ÊËÊK™š[\Š›ÛÛX[ŠNÈ][™HH	ÉËHHKˆHÂˆ›Üˆ
]HHÈHÛÜ™Ë›[™ÝÈJÊÊHÈÛÛœÝH[™HÈ[™H
È	È	È
ÈÛÜ™ÖÚWHˆÛÜ™ÖÚWNÂˆYˆ
›YX\Ý\™U^

KÚYˆX^È	‰ˆ[™JHÈYˆ
ˆOOH
X^[™\ÈNJHHJHÈ[™H
ÏH	ø )‰ÎÈœ™XZÎÈH™š[^
[™KJNÈH
ÏHÈŠÊÎÈ[™HHÛÜ™ÖÚWNÈH[ÙH[™HHÈBˆYˆ
[™JH™š[^
[™KJNÈ™]\›ˆNÂŸB˜ÛÛœÝ“Ý]‘ÐˆHÈOˆË›Ý]OOH	ÜÝ\š]™Y	ÈÈ
Ëœ\ÈÌŒKNMHˆË˜ÛÛÈ—Ô‘Ð‹˜ÛÛˆ—Ô‘Ð‹›[\
HˆË›Ý]OOH	Ø›XÚÉÈÈÌMKMKMWHˆË›Ý]OOH	ÚX]	ÈÈ—Ô‘Ð‹™[X™\ˆˆ—Ô‘Ð‹™Ü™^NÂ™[˜Ý[Ûˆ‘[X›[JËKÊHÈËÈHÛÜ›ÚÜÙHXÝ\™HØ\È›ÝÙ\ˆ]È\›‹\È˜\ˆ\È]Ø\È˜]Û‹[™ÝÈ][™YˆÛÛœÝ™ØˆH“Ý]‘ÐŠÊKÞH
ÈÈÈ‹ÞHHH
ÈÈÈ‹ˆHÈ
ˆŒÍˆH]HX]œ›Ý[™
X]›X^
X]›Z[ŠKË™œ˜XÈOH[ÈHˆË™œ˜XÊJH
ˆŠNÂˆÛÛœÝÈH˜Ü™X]T˜YX[Ü˜YY[
ÞÞKÞÞKÈ
ˆÌŠNÈË˜YÛÛÜ”ÝÜ
J™Ø‹Ë›Ý]OOH	Ø›XÚÉÈÈŒˆˆŒLÊJNÈË˜YÛÛÜ”ÝÜ
K	Ü™Ø˜JK‹LË
IÊNÈ™š[Ý[HHÎÈ™š[™XÝ
KËÊNÂˆ›[™PØ\H	Ü›Ý[™	ÎÂˆ›Üˆ
]HHÈHŽÈJÊÊHÈÛÛœÝHHHÈˆ
ˆX]”H
ˆˆHX]”HÈ‹ÛˆHH]ŒHÛˆÈˆ
ˆŽˆˆ
ˆŽÂˆ˜™YÚ[”]

NÈ›[Ý™UÊÞ
ÈX]˜ÛÜÊJH
ˆŒÞH
ÈX]œÚ[ŠJH
ˆŒ
NÈ›[™UÊÞ
ÈX]˜ÛÜÊJH
ˆ‹ÞH
ÈX]œÚ[ŠJH
ˆŠNÂˆœÝ›ÚÙTÝ[HHÛˆÈJ™Ø‹Ž
Hˆ	Ü™Ø˜JŒŒËŒKŒMŠIÎÈ›[™UÚYHX]›X^
Ë
ÛˆÈŒNˆŒ
H
ˆÊNÈœÝ›ÚÙJ
NÈBˆYˆ
Ë›Ý]OOH	Ø›XÚÉÊHÈ™š[Ý[HH	ÈÌ	ÎÈ˜™YÚ[”]

NÈ˜\˜ÊÞÞKˆ
ˆ‹X]”H
ˆŠNÈ™š[

NÈœÝ›ÚÙTÝ[HH	Ü™Ø˜JMKMKMKŽJIÎÈ›[™UÚYHX]›X^
ËÈ
ˆŒ
NÈœÝ›ÚÙJ
NÈBˆ[ÙHYˆ
Ë›Ý]OOH	ÜÝ\š]™Y	ÊHÈÛÛœÝH˜Ü™X]T˜YX[Ü˜YY[
ÞÞKÞÞKˆ
ˆJNÈ˜YÛÛÜ”ÝÜ
J™Ø‹ŽMJJNÈ˜YÛÛÜ”ÝÜ
ŒËJ™Ø‹JJNÈ˜YÛÛÜ”ÝÜ
KJ™Ø‹
JNÈ™š[Ý[HHÈ˜™YÚ[”]

NÈ˜\˜ÊÞÞKˆ
ˆKX]”H
ˆŠNÈ™š[

NÈBˆ[ÙHYˆ
Ë›Ý]OOH	ÚX]	ÊHÈœÝ›ÚÙTÝ[HHJ™Ø‹Ž
NÈ›[™UÚYHÈ
ˆŒŽÈ˜™YÚ[”]

NÈ˜\˜ÊÞÞKˆ
ˆŒÍ‹X]”H
ˆŠNÈœÝ›ÚÙJ
NÈBˆ[ÙHÈ™š[Ý[HH	Ü™Ø˜JŒŒËŒKJIÎÈ™š[™XÝ
ÞHˆ
ˆŒËÞHHÈ
ˆŒ‹ˆ
ˆ‹X]›X^
KÈ
ˆŒLŠJNÈBŸB™[˜Ý[Ûˆ”]J[YËKËKÊHÈËÈHXÝ\™KÜ›ÜYÜ]X\™NÈÚ]›ÈXÝ\™KHÛÜ›	ÜÈ[X›[BˆœØ]™J
NÈ˜™YÚ[”]

NÈœ™XÝ
KËÊNÈ˜Û\

NÈ™š[Ý[HH	ÈÌLŒ	ÎÈ™š[™XÝ
KËÊNÂˆYˆ
[YÈ	‰ˆ[YËÚY
HÈÛÛœÝ]ÈH[YËÚYZH[YËšZYÚÈHX]›X^
ÈÈ]ËÈÈZ
NÈš[XYÙTÛ[ÛÝ[™Ô]X[]HH	ÚYÚ	ÎÈ™˜]Ò[XYÙJ[YË
È
ÈH]È
ˆÊHÈ‹H
È
ÈHZ
ˆÊHÈ‹]È
ˆËZ
ˆÊNÈBˆ[ÙHYˆ
ÊH‘[X›[JËKÊNÂˆœ™\ÝÜ™J
NÂˆœÝ›ÚÙTÝ[HH	Ü™Ø˜JŒŒËŒKŒMÊIÎÈ›[™UÚYHX]›X^
KJNÈœÝ›ÚÙT™XÝ
HKHHKÈ
ÈKÈ
ÈJNÂŸB˜ÛÛœÝ”\HˆOˆ‹œ\OH[ÈH\‹œ\ˆHJ‹›˜]	‰ˆ‹›˜]œÛÛYJˆOˆ×ŠÜÝÈH›ÚYZÙ[ŠKË\Ý
‹™˜]H	ÉÊJJNÂ˜ÛÛœÝ“Ý]HˆOˆ‹šÚ[™OOH	ÜÝ\š]™Y	ÈÈ
”\
ŠHÈ	ÜÛÛYHÝ\š]™Y	Èˆ‹œÙX[YÈ	ÝÛÛ‹ÙX[Y	ÈˆÙœ›Þ™[‹Ë\Ý
‹]JHÈ	ÝÛÛ‹œ›Þ™[‰Èˆ	ÝÛÛ‰ÊHˆ‹šÚ[™OOH	Ø›XÚÉÈÈ	Ý›ÚY	Èˆ‹šÚ[™OOH	ÚX]	ÈÈ	ÝÛÜ›ˆÝ]	Èˆ‹šÚ[™OOH	ÚÙ\	ÈÈ	Ú[Ý[	ÈˆÜÝYÛ‹Ë\Ý
‹]JHÈ	ÜÝYÛ˜[	Èˆ	ÜÝÜY	ÎÂ™[˜Ý[Ûˆ‘X[ÊX[ËKKÊHÈËÈš]™HÛX[X[Ë[ˆHYX\Ý\™\ÉÈÛÛÝ\œÂˆÈHÈNÂˆRÑVTË™›Ü‘XXÚ

KŠHOˆÈÛÛœÝžH
Èˆ
ˆ‹H
ˆH
ˆËHMH
ˆH
ˆÎÂˆ™š[Ý[HH	Ü™Ø˜JŒŒËŒKŒLÊIÎÈ™š[™XÝ
žHH
ˆH
ˆË
NÂˆÛÛœÝˆHX]›X^
X]›Z[ŠKX[ÖÚ—H
JNÈYˆ
ŠHÈ™š[Ý[HHPÓÓÛWNÈ™š[™XÝ
žHH
ˆˆÈK
ˆH
ˆË
ˆˆÈJNÈHJNÂŸB™[˜Ý[Ûˆ•\›Š™XËÞÞK‹JHÈËÈH\›ŽˆHXÚÈ›Üˆ]™\žH[K[ˆHÛÛÝ\ˆÙˆHÝ]H]™]È]š\œÝÂˆÛÛœÝˆH™XË\›‹›[™ÝHX]›X^
K™XË
K[HHOˆÈÛÛœÝÈH™XË›˜]™š[™
ˆOˆ‹šHOOHJNÈ™]\›ˆÈÈ™ØŠ	ÜË[š›Ú[Š	Ë	Ê_JXˆ—ÒQÈNÂˆœØ]™J
NÈ›[™PØ\H	Ü›Ý[™	ÎÈËÈ[œÚYKHÛÜ›	ÜÈÝÛˆ[YKÛ˜ÙH›Ý[™ˆXXÚ˜]ËXXÚœ™XZÛÝ]ˆœÝ›ÚÙTÝ[HH	Ü™Ø˜JŒŒËŒKŒL
IÎÈ›[™UÚYHNÈ˜™YÚ[”]

NÈ˜\˜ÊÞÞKˆ
ˆM‹X]”H
ˆŠNÈœÝ›ÚÙJ
NÂˆ›Üˆ
]HHÈHŽÈJÊÊHÈÛÛœÝØžKÚ\ÛÛ—HH™XË\›–ÚWKHHHÈˆ
ˆX]”H
ˆˆHX]”HÈ‹ÈHX]˜ÛÜÊJKÈHX]œÚ[ŠJKÛˆHžHHÂˆÛÛœÝŒHÛˆÈˆ
ˆÍˆˆˆ
ˆŽŽÈ˜™YÚ[”]

NÈ›[Ý™UÊÞ
ÈÈ
ˆŒÞH
ÈÈ
ˆŒ
NÈ›[™UÊÞ
ÈÈ
ˆ‹ÞH
ÈÈ
ˆŠNÂˆYˆ
Ú\ÛÛŠHÈœÝ›ÚÙTÝ[HH	ÈÌ	ÎÈ›[™UÚYHH
ˆNÈœÝ›ÚÙJ
NÈœÝ›ÚÙTÝ[HH	Ü™Ø˜JMKMKMKŽLŠIÎÈ›[™UÚYHKŒˆ
ˆNÈœÝ›ÚÙJ
NÈBˆ[ÙHYˆ
ÛŠHÈœÝ›ÚÙTÝ[HH[
žJNÈ›[™UÚYH‹Ž
ˆNÈœÝ›ÚÙJ
NÈBˆ[ÙHÈœÝ›ÚÙTÝ[HH	Ü™Ø˜JŒŒËŒKŒŒŠIÎÈ›[™UÚYHH
ˆNÈœÝ›ÚÙJ
NÈBˆYˆ
Ûˆ	‰ˆH
HÈÛÛœÝˆHX]›Z[ŠKÈ
H
ˆX]”H
ˆˆHX]”HÈŽÈ™š[Ý[HHÚ\ÛÛˆÈ	ÈÙ™™‰Èˆ[
žJNÈ˜™YÚ[”]

NÈ˜\˜ÊÞ
ÈX]˜ÛÜÊŠH
ˆˆ
ˆM‹ÞH
ÈX]œÚ[ŠŠH
ˆˆ
ˆM‹
Ú\ÛÛˆÈ‹ˆˆ‹ŒJH
ˆKX]”H
ˆŠNÈ™š[

NÈHBˆ›Üˆ
ÛÛœÝˆÙˆ™XË˜œ™XZÜÊHÈÛÛœÝHHX]›Z[ŠK‹È
H
ˆX]”H
ˆˆHX]”HÈ‹HÞ
ÈX]˜ÛÜÊJH
ˆˆ
ˆM‹HHÞH
ÈX]œÚ[ŠJH
ˆˆ
ˆMŽÂˆ™š[Ý[HH	ÈÌ	ÎÈ˜™YÚ[”]

NÈ˜\˜ÊK‹H
ˆKX]”H
ˆŠNÈ™š[

NÈœÝ›ÚÙTÝ[HH‹˜Ø]YÚÈ—ÐÓÓˆ	Ü™Ø˜JMKMKMKŽJIÎÈ›[™UÚYHKŒÈ
ˆNÈœÝ›ÚÙJ
NÈBˆœ™\ÝÜ™J
NÂˆ•^
Ýš[™Ê™XË™˜]ÛŠKÞÞH
ÈH
ˆK	Í
ˆ_\	Ô—ÔÑT’QŸX—ÒQ	ØÙ[\‰ÊNÂˆ•^
Ñˆ	Ü™XËœÝH	Ü™XË›˜]›[™ÝˆHÈ	ÒS•‘S•Q	Èˆ	ÑUÓ‰ßXÞÞH
ÈŽ
ˆKÌ	ÌL
ˆ_\	Ô—ÓSÓ“ßX—ÑSK‹Œˆ
ˆK	ØÙ[\‰ÊNÂŸB˜ÛÛœÝ”Ý[™H™XÈOˆ
ÈÝ]ˆ™XËšÚ[™ÛÛˆÙœ›Þ™[‹Ë\Ý
™XË]H	ÉÊK\ˆ™XËšÚ[™OOH	ÜÝ\š]™Y	È	‰ˆ”\
™XÊKœ˜XÎˆ™XËœÝÈ™XË™˜]ÛˆÈ™XËœÝˆHJNÈËÈHš[ÚÜÙHXÝ\™H\ÈZ\ÜÚ[™ÈÚÝÜÈHÛÜ›	ÜÈ[X›[B˜ÛÛœÝ“YX[•[H˜]OˆÈÛÛœÝHH˜]›[™ÝÈ˜]ˆÞÈ[ˆÌMŒMÌŒŒHWNÈ™]\›ˆÌK—K›X\
ÈOˆX]œ›Ý[™
Kœ™YXÙJ
ËŠHOˆÈ
È‹[Ú×K
HÈK›[™Ý
JNÈNÂ‹ËÈHÛÜ›	ÜÈš[ˆKˆHÛÜ›\È][™Y
Üˆ\ÈH›ÚYœ›ÚÙHÝ]Yˆ][™Y]
K[™ÝÛˆ]ÈÚYHHÝš\Ù‚‹ËÈ[ÛY[Èœ›ÛH]ÈY™KXXÚÚ]]È[YH
Hœ™XZÛÝ]œ˜[YY[ˆÚ]JNÈ]È˜[YH[™˜]K]ÈÝ]\È[™Z\ˆX[ÎÂ‹ËÈ]È\›Žˆ]™\žH[H[ˆHÛÛÝ\ˆÙˆHÝ]H]™]È]š\œÝHÚ\ÛÛˆ[ˆ›ÚY›XÚËˆHÛÜ›š[Y™Y›Ü™HB‹ËÈÝš\Ø\ÈÙ\
ÜˆÛÈÚÜ›ÜˆÛ™JH\ÈHXÝ\™HXÜ›ÜÜÈHÚÛHÚY‚™[˜Ý[Ûˆ˜]ÕÛÜ›š[
™XË[YËËY™JHÂˆÛÛœÝÌHËHX]œ›Ý[™
È
ˆKŒJKHHÈÈLŒÈHØÝ[Y[˜Ü™X]Q[[Y[
	ØØ[˜\ÉÊNÈËÚYHÌÈËšZYÚHÂˆÛÛœÝHË™Ù]ÛÛ^
	Ì™	ÊKÛÝÈH“YX[•[
™XË›˜]
KÝš\H
™XË›Y™H×JK›[™ÝHËHH
Ýš\ÈLˆL
H
ˆNÂˆ‘Ü›Ý[™
ÌKÛÝÊNÂˆœÝ›ÚÙTÝ[HH	Ü™Ø˜JŒŒËŒKŒL
IÎÈ›[™UÚYHX]›X^
KJNÈœÝ›ÚÙT™XÝ
Íˆ
ˆKÍˆ
ˆKÌHÌˆ
ˆKHÌˆ
ˆJNÂˆ•^
	Õ•S‘TP“HÓÔ“ÉËKÌˆ
ˆKÌ	ÌLËH
ˆ_\	Ô—ÓSÓ“ßX—ÑSK
ˆJNÂˆ•^
ÓÔ“	ÜYŠ™XË›Š_XÌHKÌˆ
ˆK	ÌLËH
ˆ_\	Ô—ÓSÓ“ßX—ÒQ
ˆK	ÜšYÚ	ÊNÂˆ]LÂˆYˆ
Ýš\
HÂˆÛÛœÝH
ˆKœÈHMLˆ
ˆKœˆH™XË›Y™KœÛXÙJJKˆHœ‹›[™ÝØ\HˆˆHÈ
Hˆ
ˆœÊHÈ
ˆHJHˆÞHÌHHHœÎÂˆ”]J[YËKL
ˆKK[YÈÈ[ˆ”Ý[™
™XÊJNÂˆœ‹™›Ü‘XXÚ

‹ÊHOˆÈÛÛœÝHHL
ˆH
ÈÈ
ˆ
œÈ
ÈØ\
KœˆH‹šÈOOH	Øœ™XZÉÎÂˆ”]JY™H	‰ˆY™VÚ×KÞKœËJNÂˆÛÛœÝÈH˜Ü™X]S[™X\‘Ü˜YY[
H
ÈœÈHÍˆ
ˆKH
ÈœÊNÈË˜YÛÛÜ”ÝÜ
	Ü™Ø˜JK‹LË
IÊNÈË˜YÛÛÜ”ÝÜ
K	Ü™Ø˜JK‹LËÎ
IÊNÈ™š[Ý[HHÎÈ™š[™XÝ
ÞH
ÈœÈHÍˆ
ˆKœËÍˆ
ˆJNÂˆYˆ
œŠHÈœÝ›ÚÙTÝ[HH	Ü™Ø˜JMKMKMKŽ
IÎÈ›[™UÚYHKˆ
ˆNÈœÝ›ÚÙT™XÝ
Þ
ÈŽ
ˆKH
ÈŽ
ˆKœÈHKˆ
ˆKœÈHKˆ
ˆJNÈBˆ•^
œˆÈ”‘PRÓÕU	Û[\ÜÊ‹
_Xˆ[\ÜÊ‹
KÞ
ÈH
ˆKH
ÈœÈHL
ˆK	ÌLH
ˆ_\	Ô—ÓSÓ“ßX	Ü™Ø˜J‹KËŽM
IËKŒÈ
ˆJNÈJNÂˆLHL
ˆH
ÈÂˆH[ÙHÈ”]J[YËKL
ˆKÌHˆ
ˆKK[YÈÈ[ˆ”Ý[™
™XÊJNÈLHL
ˆH
È
ÌHˆ
ˆJNÈBˆÛÛœÝÈHÝš\ÈÈÚXÚÎˆŒ‹ÚXÚÑŽˆM]NˆMšYÎˆ‹ÛX[ˆMÝÜžNˆNLÑŽˆŒËÓˆÌËÕÎˆLÓŽˆËÝ]\ÎˆÌN›ÝÎˆ‹‘ŽˆMK‘ŽˆL‹KÛÛÎˆÍ^ˆL^NˆŒÎTŽˆLNBˆˆÈÚXÚÎˆL‹ÚXÚÑŽˆL‹K]NˆLMšYÎˆŒÛX[ˆLÝÜžNˆMMÑŽˆŒKÓˆÌÕÎˆŽÓŽˆ‹Ý]\ÎˆŒM›ÝÎˆÍ‘ŽˆLËK‘ŽˆLKKÛÛÎˆÌÌ^ˆLL‹^NˆMŽTŽˆLNÂˆÛÛœÝ\”ÈH™XË›˜]›[™Ý	‰ˆ™XË›˜]ÌK™OH[ÈËÈ
š[ÈXYH™Y›Ü™HŒLÛÝ[YHÛÜ›	ÜÈ˜]ÜÊBˆ•^
\”ÈÈ
™XË›˜]›[™ÝˆHÈ	Û[\ÜÊ™XË
_HÑˆÓÔ“SQH0­È	Ü™XË›˜]›[™ÝHÕUTÈ0­ÈSˆT“ˆPPÒˆ	Û[\ÜÊ™XË
_HÑˆÓÔ“SQH0­È	Ü™XË›˜]ÌK™H	Ü™XË›˜]ÌK™OOHHÈ	ÑUÉÈˆ	ÑUÔÉßX
Hˆ	Û[\ÜÊ™XË
_HÑˆÓÔ“SQH0­È	Ü™XË™˜]ÜßH	Ü™XË™˜]ÜÈOOHHÈ	ÑUÉÈˆ	ÑUÔÉßH0­È	Ü™XË›˜]›[™ÝH	Ü™XË›˜]›[™ÝOOHHÈ	ÔÕUIÈˆ	ÔÕUTÉßXKL
ÈËšÚXÚÈ
ˆKÌ	ÒËšÚXÚÑˆ
ˆ_\	Ô—ÓSÓ“ßX—ÑSKÈ
ˆJNÂˆÛÛœÝ]TÚ^™HH™XË]K›[™ÝˆŒˆÈËÛX[ˆËšYÎÂˆ•^
™XË]KHHÈ
ˆKL
ÈË]H
ˆK][XÈ	Ý]TÚ^™H
ˆ_\	Ô—ÔÑT’QŸX	ÈÙŒ™ŒYÉÊNÂˆÛÛœÝÞHH•Ü˜\
™XËœÝÜžKKL
ÈËœÝÜžH
ˆKËœÕÈ
ˆKËœÓ
ˆK	ÒËœÑˆ
ˆ_\	Ô—ÔÑT’QŸX	Ü™Ø˜JŒŒËŒKÍŠIËËœÓŠNÂˆÛÛœÝžHHX]›X^
L
ÈËœÝ]\È
ˆKÞH
È
ˆJNÈËÈHÝ]\ÂˆÛÛœÝÛÛÈH™XË›˜]›[™ÝˆÈÈˆˆKÛÛÈHË˜ÛÛÈ
ˆNÂˆ]ÚÜ[HH˜[ÙNÂˆ™XË›˜]™›Ü‘XXÚ

‹ÊHOˆÈÛÛœÝÞHH
È
ÛÛÈOOHˆÈ
È	HŠH
ˆÛÛÈˆ
KÞLHžH
È
ÛÛÈOOHˆÈX]™›ÛÜŠÈÈŠHˆÊH
ˆËœ›ÝÈ
ˆKXYH‹™˜]HOOH	ÛÜÝÈH›ÚY	ÎÂˆ™š[Ý[HH™ØŠ	Û‹[š›Ú[Š	Ë	Ê_JXÈ˜™YÚ[”]

NÈ˜\˜ÊÞ
ÈH
ˆKÞLHH
ˆKK
ˆKX]”H
ˆŠNÈ™š[

NÂˆÛÛœÝÈH•^
‹›˜[YKÕ\\Ø\ÙJ
KÞ
ÈNH
ˆKÞL	ÒË›‘ˆ
ˆ_\	Ô—ÓSÓ“ßXXYÈ	Ü™Ø˜JŒŒËŒKJIÈˆ—ÒQËŒˆ
ˆJNÂˆ‘X[Ê‹™X[ËÞ
ÈŽ
ˆH
ÈËÞL
ÈH
ˆKKÝš\ÈKŒˆJNÂˆÛÛœÝ˜]HHÛÛÈOOHˆÈ
XYÈ	Ý›ÚY	Èˆ‹™˜]KœÝ\ÕÚ]
	ÝZÙ[‰ÊHÈ	ÝZÙ[‰Èˆ‹™˜]JHˆ‹™˜]NÂˆÛÛœÝ‘ˆHÌ	ÒË™‘ˆ
ˆ_\	Ô—ÓSÓ“ßX›ÛÛHH
ÛÛÈOOHˆÈÛÛÈˆÌHˆ
ˆHHˆ
ˆËTˆ
ˆJHHÌ
ˆHHÈHLˆ
ˆNÂˆ][™HH‹žOH[	‰ˆ™XË›˜]›[™ÝˆHÈ	Ù˜]KÕ\\Ø\ÙJ
_H0­È	Û‹™HUÓˆ0­È	Û‹žHT”’U‘QËÈ˜]Ûˆ\™K[™\œš]™YXÜ›ÜÜÈ]È›Ü™\œÂˆˆ‹™OH[È
ÛÛÈOOHˆÈ	Ù˜]KÕ\\Ø\ÙJ
_H0­È	Û‹™H	Û‹™OOHHÈ	ÑUÉÈˆ	ÑUÔÉßXˆ	Ù˜]KÕ\\Ø\ÙJ
_H0­È	Û‹™H	Û‹™OOHHÈ	ÑUÉÈˆ	ÑUÔÉßH0­È	Û‹œ[\ßH	Û‹œ[\ÈOOHHÈ	Ô•SIÈˆ	Ô•STÉßX
BˆˆÛÛÈOOHˆÈ	Ù˜]KÕ\\Ø\ÙJ
_H0­È	Û‹œ[\ßXˆ	Ù˜]KÕ\\Ø\ÙJ
_H0­È	Û‹œ[\ßH	Û‹œ[\ÈOOHHÈ	Ô•SIÈˆ	Ô•STÉßXÂˆYˆ
‹žOH[	‰ˆ™XË›˜]›[™ÝˆH	‰ˆ•ÚY
[™K‘‹ˆ
ˆJHˆ›ÛÛJHÈ[™HH	Ù˜]KÕ\\Ø\ÙJ
_H0­È	Û‹™IÊ™XËˆ
HHÈÈ	È0­È	Èˆ	È
È	ßIÛ‹žXÈÚÜ[HHYNÈBˆ•^
[™KÞ
ÈÌ
ˆH
ÈËÞL‘‹XYÈ	Ü™Ø˜JMKMÌMÎ
IÈˆ—ÑSKˆ
ˆJNÈJNÂˆYˆ
ÚÜ[JH•^

™XËˆ
HHÈÈ	ÑUÓˆ0­ÈT”’U‘Q	Èˆ	ÑUÓˆ
ÈT”’U‘Q	ËH
ÈNH
ˆKžH
ÈX]˜ÙZ[
™XË›˜]›[™ÝÈÛÛÊH
ˆËœ›ÝÈ
ˆHH
ˆKÌ	ÊË™‘ˆHKJH
ˆ_\	Ô—ÓSÓ“ßX	Ü™Ø˜JŒŒËŒKŠIËˆ
ˆJNÂˆYˆ

™XËˆ
HH
HÈÛÛœÝÞHÌHHHË^
ˆKÞHHL
ÈË^H
ˆNÈ”ÚYÚ[
™XËÞÞKËTˆ
ˆH
ˆŽKH
ˆŽKK˜[ÙJNÂˆ•^
	Ü™XË™˜]ÛŸHÑˆ	Ü™XËœÝH	Ü™XË›˜]›[™ÝˆHÈ	ÒS•‘S•Q	Èˆ	ÑUÓ‰ßXÞÞH
ÈËTˆ
ˆH
ˆKŒËÌ	ÌL
ˆ_\	Ô—ÓSÓ“ßX—ÑSK‹Œˆ
ˆK	ØÙ[\‰ÊNÈBˆ[ÙH•\›Š™XËÌHHHË^
ˆKL
ÈË^H
ˆKËTˆ
ˆKJNÂˆYˆ
™XË›™]ÜÈ	‰ˆ™XË›™]ÜË›[™Ý
H•^
™XË›™]ÜËš›Ú[Š	È0­È	ÊKÕ\\Ø\ÙJ
KKH
ˆK	ÌLH
ˆ_\	Ô—ÓSÓ“ßX	Ü™Ø˜JŒKLÎŽ
IË‹
ˆJNÂˆ•^
	ÐSˆT•ÓÔ’È–HSÓÈ0­ÈPQHÒUÓUQH0­ÈSÓËT•	ËKHLˆ
ˆKÌ	ÌLH
ˆ_\	Ô—ÓSÓ“ßX	Ü™Ø˜JŒŒËŒKŠIË‹ˆ
ˆJNÂˆ•^
	Ü™XË˜ÛÙHÈ™XË˜ÛÙKœÜ]
	Ë‰ÊVÌKÕ\\Ø\ÙJ
H
È
™XËœ™\^HÈ	È0­È‘TVIÈˆ	ÉÊH
È	È0­È	Èˆ	ÉßIÜ™XËœÝ[\XÌHKHLˆ
ˆKÌ	ÌLH
ˆ_\	Ô—ÓSÓ“ßX	Ü™Ø˜JŒŒËŒKŠIË‹ˆ
ˆK	ÜšYÚ	ÊNÂˆ‘Ü˜Z[ŠÌJNÂˆ™]\›ˆÎÂŸB‹ËÈHš[Ùˆ[ŽˆH[ˆÛÜ›È\È]\ËÚ]™XØ[YHÙˆXXÚHÛÝ[ÝÈHZ[™ÈØÛÜ™YÛÜ›žHÛÜ›Ú]‹ËÈÚ\ÛÛ™Y[™H™\™XÝˆ[™ØØ\H
MŽŒL
H›ÜˆHÚYHØÜ™Y[ˆ[™›ÜˆØ]š[™ÎÈÜ˜Z]
JH›ÜˆH[ØÜ™Y[‹‚‹ËÈ™]™X[
ÈJHœš[™ÜÈ][‹\žH\Ú[H]\ÈÚÝÛˆ]™K‚˜ÛÛœÝ“Z[™ÛÛH˜[YHOˆÈÛÛœÝHHUSÓ—ÓSQTËš[™^ÙŠ˜[YJNÈ™]\›ˆ™ØŠ	ÊUSÓ—ÕS•ÚWHÌŽŽŽWJK›X\
ˆOˆX]œ›Ý[™
X]›Z[ŠKŠH
ˆMJJKš›Ú[Š	Ë	Ê_JXÈNÂ˜ÛÛœÝ‘X\ÙHHOˆHHX]œÝÊHHX]›X^
X]›Z[ŠK
JKÊNÂ™[˜Ý[Ûˆ[‘[\ÊË^[Ý]
HÈÛÛœÝ[™H^[Ý]OOH	ÜÜ	ËHH[™ÈÈÈMŒˆÈÈLŒÈ™]\›ˆÈ[™KÌˆX]œ›Ý[™
ÊKˆX]œ›Ý[™
[™ÈÈÈKˆˆÈ
ˆKŒJKNˆ
[™ÈÌˆ
H
ˆKŽˆ
Þ‹ÊHOˆ	ÝÈÌH	ÜÞˆ
ˆ
[™ÈKŒÈˆJH
ˆ_\	Ô—ÓSÓ“ßXNÈB™[˜Ý[Ûˆ[˜\ÙJ
HÈ™ÛØ˜[[HHNÈ‘Ü›Ý[™
•Ì’KÌMLMŒŒÌJNÈÛÛœÝˆH
›[™ÈÌˆÍŠH
ˆNÈœÝ›ÚÙTÝ[HH	Ü™Ø˜JŒŒËŒKŒL
IÎÈ›[™UÚYHX]›X^
KJNÈœÝ›ÚÙT™XÝ
‹‹•ÌHˆ
ˆ‹’Hˆ
ˆŠNÈB™[˜Ý[Ûˆ[‘›ÛÝ
‹
HÈÛÛœÝžHH’H
›[™ÈˆLŠH
ˆNÈ™ÛØ˜[[HHNÂˆ•^
	ÐSˆT•ÓÔ’È–HSÓÈ0­ÈPQHÒUÓUQH0­ÈSÓËT•	Ë“KžK‘ŠLJK	Ü™Ø˜JŒŒËŒKŠIË‹ˆ
ˆJNÂˆ•^
ÓÔ“È	ÜYŠ‹›Œ
_x $ÉÜYŠ‹›ŒJ_X•ÌH“KžK‘ŠLJK	Ü™Ø˜JŒŒËŒKŠIË‹ˆ
ˆK	ÜšYÚ	ÊNÈB™[˜Ý[Ûˆ[‘Ü›Ý[™
‹Ë^[Ý]
HÈËÈHš[Ùˆ[ˆÚ]›Ý[™ÈÛˆ]Y]]]ÈÜ›Ý[™[™]È›ÛÝ\‚ˆÛÛœÝH[‘[\ÊË^[Ý]
KÈHØÝ[Y[˜Ü™X]Q[[Y[
	ØØ[˜\ÉÊNÈËÚYH•ÌÈËšZYÚH’ÈÛÛœÝHË™Ù]ÛÛ^
	Ì™	ÊNÂˆ[˜\ÙJ
NÈ[‘›ÛÝ
‹
NÈ‘Ü˜Z[Š•Ì’JNÈ™]\›ˆÎÈB™[˜Ý[Ûˆ˜]Õ[”š[
‹[YÜËË™]™X[[Ë^[Ý]
HÂˆÛÛœÝH[‘[\ÊË^[Ý]
KÈ[™ÌKKˆHHÂˆÛÛœÝÈH[ÈØÝ[Y[˜Ü™X]Q[[Y[
	ØØ[˜\ÉÊNÈYˆ
ËÚYOOHÌËšZYÚOOH
HÈËÚYHÌÈËšZYÚHÈBˆÛÛœÝHË™Ù]ÛÛ^
	Ì™	ÊKH™]™X[OH[ÈHˆ™]™X[HH
KŠHOˆX]›X^
X]›Z[ŠK
HJHÈX]›X^
YKM‹ˆHJJJNÂˆÛÛœÝÜÈH
‹ÛÜ›È×JKœÛXÙJL
NÂˆ[˜\ÙJ
NÂˆÛÛœÝHH
[™ÈˆÍ
H
ˆNÂˆ™ÛØ˜[[HHJŒJNÂˆ•^
	Õ•S‘TP“HÓÔ“ÉËKKŠM
K—ÑSKˆ
ˆJNÂˆ•^
‘TÔ•0­È	Ô‹˜]	ÉßXÌHKKŠM
K—ÑSKÈ
ˆK	ÜšYÚ	ÊNÂˆÛÛœÝÝHX]œ›Ý[™

‹™œ˜XÈ
H
ˆL
K˜XÝÈHØ	Û[\ÜÊ‹
_HÑˆÓÔ“SQX
‹™ÈOH[È	Ô‹™ßHUÔÈHÕUXˆ	Ô‹™˜]ÜÈHUÔÈHÓÔ“
K	ÜÝIHÑˆHT“ˆS•‘S•QNÂˆYˆ
‹ZÙ[Ý™\œÊH˜XÝËœ\Ú
	Ô‹ZÙ[Ý™\œßH	Ô‹ZÙ[Ý™\œÈOOHHÈ	ÔÕUIÈˆ	ÔÕUTÉßHRÑSˆÕ‘T˜
NÂˆËÈÙ[ÛY]žBˆÛÛœÝÈH[™ÈÈˆKÎˆN
ˆKNˆL
ˆKØ\ˆŒˆ
ˆKžˆH
ÈL
ˆHHˆÈˆKÎˆÌHˆ
ˆKNˆÌˆ
ˆKØ\ˆ
ˆHNÂˆÛÛœÝÈH
ËœÈH
ˆË™Ø\
HÈK]ÚHÈ
Èˆ
ˆNÂˆ™ÛØ˜[[HHJŒ‹ŒJNÈËÈH]BˆYˆ
[™
HÈÛÛœÝÈHÌHHHËœžHHYŠ‹›Œ
KˆHYŠ‹›ŒJKHX]›Z[ŠLŽ
ˆKLŽ
ˆH
ˆÈÈ”˜[™ÙJK‹LŽ
ˆK	ÈÙ™™‰ËYJJNÂˆ•^
	ÕÛÜ›ÉËËœžHˆ
ˆKMŒ
ˆK][XÈ	ÍMˆ
ˆ_\	Ô—ÔÑT’QŸX	ÈÙŒ™ŒYÉÊNÂˆ”˜[™ÙJK‹ËœžHH
ˆKŽˆ
ˆK	ÈÙŒ™ŒYÉÊNÂˆ˜XÝËœÛXÙJ
K™›Ü‘XXÚ

ËÊHOˆ•^
ËËœž
ÌÌˆ
ÈÈ
ˆJH
ˆKŠLÊK—ÑSK‹ˆ
ˆJJNÈBˆ[ÙHÈÛÛœÝÈH•^
	ÕÛÜ›ÉËHH
ˆKNL
ˆK	Î
ˆ_\	Ô—ÔÑT’QŸX	ÈÙŒ™ŒYÉËKH
ˆJNÂˆ”˜[™ÙJYŠ‹›Œ
KYŠ‹›ŒJKHH
ˆH
ÈÈ
Èˆ
ˆKNL
ˆK
ˆK	ÈÙŒ™ŒYÉÊNÂˆ•^
˜XÝËœÛXÙJÊKš›Ú[Š	È0­È	ÊKKŒÍˆ
ˆKŠLËJK—ÑSKÈ
ˆJNÈBˆÜË™›Ü‘XXÚ

ËÊHOˆÈËÈH]\ÂˆÛÛœÝÛÛHÈ	HK›ÝÈHX]™›ÛÜŠÈÈJKHËœ
ÈÛÛ
ˆ
È
ÈË™Ø\
KLHËœH
È›ÝÈ
ˆ]ÚHHJŒÈ
ÈÈ
ˆŒÍKŒMH
ÈÈ
ˆŒÍJNÂˆYˆ
HH
H™]\›ŽÈÛÛœÝHHL
È
HH‘X\ÙJJJH
ˆM
ˆNÈ™ÛØ˜[[HHNÂˆ”]J[YÜÈ	‰ˆ[YÜÖÚ×KKËKÊNÂˆYˆ
ËœÚYÊHÈžHÈÛÛœÝœˆHÈ
ˆŒMKÞH
ÈÈHœˆ
ˆKŒÈH
ˆKÞLHH
ÈÈHœˆ
ˆKŒÈH
ˆNÈËÈ]ÈÚYÚ[[ˆHÛÜ›™\‚ˆ™š[Ý[HH	Ü™Ø˜JKLKÍ
IÎÈ˜™YÚ[”]

NÈ˜\˜ÊÞÞLœˆ
ˆKŒX]”H
ˆŠNÈ™š[

NÈ”ÚYÚ[
ÚYÕ[œXÚÊËœÚYÊKÞÞLœ‹X]›X^
KœˆÈLN
KK˜[ÙJNÈHØ]Ú
JHßHBˆÛÛœÝÝ]H“Ý]
ÈÚ[™ˆË›Ý]ÙX[YˆËœÙX[Y\ˆH]Ëœ\]NˆË˜ÛÛÈ	Ùœ›Þ™[‰ÈˆËœÝYÈÈ	ÜÝYÛ˜]Y	Èˆ	ÉÈJK™ØˆH“Ý]‘ÐŠÊNÂˆ™š[Ý[HHË›Ý]OOH	Ø›XÚÉÈÈ	ÈÌ	ÈˆË›Ý]OOH	ÜÝ\š]™Y	ÈË›Ý]OOH	ÚX]	ÈÈJ™Ø‹JHˆ	Ü™Ø˜JŒŒËŒK
IÎÈ™š[™XÝ
L
ÈÈ
ÈH
ˆKËÈ
ˆJNÂˆYˆ
Ë›Ý]OOH	Ø›XÚÉÊHÈ™š[Ý[HH	Ü™Ø˜JMKMKMKÍJIÎÈ™š[™XÝ
L
ÈÈ
È
ˆKËH
ˆJNÈBˆ•^
YŠË›ŠKL
ÈÈ
ÈÎ
ˆKŠMK
K—ÒQ‹
ˆJNÂˆ•^
Ý]Õ\\Ø\ÙJ
K
ÈËL
ÈÈ
ÈÎ
ˆKŠL‹JKË›Ý]OOH	Ø›XÚÉÈÈ	Ü™Ø˜JMKMÌMŽJIÈˆ—ÑSKˆ
ˆK	ÜšYÚ	ÊNÂˆÛÛœÝÈH•^
Ë›Ý]OOH	ÜÝ\š]™Y	ÈÈ
Ë™ÈOH[È	ÓX]œ›Ý[™
Ë™Ê_HUÔÈPPÒˆ	ÝË™˜]ÜßHUÔØ
Hˆ	ÓX]œ›Ý[™

Ë™œ˜XÈ
H
ˆL
_IHS•‘S•QL
ÈÈ
ÈŒH
ˆKŠLKJK—ÑRS•KŽ
ˆJNÂˆYˆ
ËOH[	‰ˆÈ
È•ÚY
[\ÜÊË
KŠLKJKKŽ
ˆJH
È
ˆHÊH•^
[\ÜÊË
K
ÈËL
ÈÈ
ÈŒH
ˆKŠLKJK—ÑRS•KŽ
ˆK	ÜšYÚ	ÊNÈJNÂˆÛÛœÝHHJËMŠKÙHH‘X\ÙJJNÈËÈHÛÝ[ˆÛÛœÝˆH‹œ\OH[ÈËÈ
H™\Ü™Y›Ü™HŒLH\È›ÈÝ\š]›ÜœÈ\\ˆ]ÈÚ[œÈÛÝ[Y[JBˆÛÛœÝ[\ÈHÖÔ‹ÛÛˆ‹˜ÛÛÈÓÓˆ0­È	Ô‹˜ÛÛH”“Ö‘S˜ˆ	ÕÓÓ‰×KˆÈÔ‹œ\	ÔÕT•’U‘QSˆT•	×Hˆ[Ê‹˜›XÚÈ
H
È
ˆÈ‹šX]ˆ
Kˆ	‰ˆ‹šX]ÈS‘Q0­È	Ô‹šX]HÓÔ“ˆÕUˆ	ÑS‘QSˆH“ÒQ	×KˆÈ[ˆÔ‹šX]	ÕÓÔ‘HÕU	×KÊ‹œÝÜY
H
È
‹œÝYÈ
H
È
‹šÙ\
K‹œÝYÈÈÕÔQ0­È	Ô‹œÝYßHÕQÓS•ˆ	ÔÕÔQÒÔ•	×WK™š[\Š›ÛÛX[ŠNÂˆ™ÛØ˜[[HHNÂˆ[\Ë™›Ü‘XXÚ

Ý‹KÊHOˆÈÛÛœÝH[™ÈËœž
È
È	HŠH
ˆŒM
ˆHˆH
ÈÈ
ˆŒˆ
ˆKHH[™È
Lˆ
ÈX]™›ÛÜŠÈÈŠH
ˆLLŠH
ˆHˆËœH
Èˆ
ˆ]Ú
Èˆ
ˆNÂˆ•^
Ýš[™ÊX]œ›Ý[™
ˆ
ˆÙJJKK	Ê[™ÈŽˆ
H
ˆ_\	Ô—ÔÑT’QŸX	ÈÙŒ™ŒYÉÊNÂˆ•^

Èˆ
ˆKH
ÈŽ
ˆKŠL‹JK—ÑSK‹Œˆ
ˆJNÈJNÂˆËÈ™[™X]ˆHZ[™ËÚ]Ú\ÛÛ™YH™\™XÝˆÛÛœÝžHH[™ÈŽ
ˆHˆËœH
Èˆ
ˆ]Ú
ÈMŒ
ˆNÂˆÛÛœÝ^HK]ÈH[™ÈMÌ
ˆHˆŒL
ˆKÞH[™ÈH
ÈŒL
ˆHˆH
ÈL
ˆKÝÈH[™ÈÍÌ
ˆHˆÌHHH
H
ÈL
ˆJNÂˆÛÛœÝÝˆH‹œÝ\ˆ	‰ˆ‹œÝ\‹ˆ	‰ˆ‹œÝ\‹‹›[™ÝˆHÈ‹œÝ\ˆˆ[ÒHÝˆÈLN
ˆHˆÈËÈš\œÝÝÈHZ[™È\™HÚ[™ÈÝ™\ˆ]™\žHÛÜ›ˆÝÈX[žHÝ]\È]™YˆYˆ
ÝŠHÈ™ÛØ˜[[HHJMŠNÂˆ•^
ÕUTÈSU‘HUHS‘0­ÈU‘T–HÓÔ“ÒSÑH	ÜYŠÝ‹˜J_X^žKŠL‹JK—ÑSK‹Œˆ
ˆJNÂˆÛÛœÝÞH^
È
ˆKÞHHžH
ÈŒ
ˆKÝÈH]ÈH
ˆKÚHLˆ
ˆKˆHÝ‹‹›[™ÝHHOˆÞ
ÈH
ˆÝÈÈ
ˆHJKHHOˆÞH
ÈÚHÈL
ˆÚÂˆœÝ›ÚÙTÝ[HH	Ü™Ø˜JŒŒËŒKŒM
IÎÈ›[™UÚYHNÈ˜™YÚ[”]

NÈ›[Ý™UÊÞÞH
ÈÚ
NÈ›[™UÊÞ
ÈÝËÞH
ÈÚ
NÈœÝ›ÚÙJ
NÂˆœÙ][™Q\Ú
Ìˆ
ˆK
ˆWJNÈ˜™YÚ[”]

NÈ›[Ý™UÊÞÞJNÈ›[™UÊÞ
ÈÝËÞJNÈœÝ›ÚÙJ
NÈœÙ][™Q\Ú
×JNÂˆYˆ
Ý‹˜]ŠHÈ™š[Ý[HH	Ü™Ø˜JŒKLÎŒÊIÎÈ™š[™XÝ

Ý‹˜]
HH
ˆKÞHH
ˆKÞ
ÈÝÈH
Ý‹˜]
H
È
ˆKÚ
È
ˆJNÈHËÈ\ÙH[‚ˆ›Üˆ
]HHÈHŽÈJÊÊHÈ™š[Ý[HHHHÝ‹˜]È	Ü™Ø˜JŒKLÎŽMJIÈˆ	Ü™Ø˜JŒŒËŒKŠIÎÈ˜™YÚ[”]

NÈ˜\˜Ê
JKJÝ‹–ÚWJK
HHÝ‹˜]È‹ˆˆŠH
ˆKX]”H
ˆŠNÈ™š[

NÈBˆÛÛœÝÚÈHX]›X^
KX]œ›Ý[™
LÈÝ‹šÊJNÈœÝ›ÚÙTÝ[HH	Ü™Ø˜J‹KËŽ
IÎÈ›[™UÚYHKÈ
ˆNÈ›[™R›Ú[ˆH	Ü›Ý[™	ÎÈ˜™YÚ[”]

NÈËÈH[™NˆH\Ý[ˆÛÜ›ËÛˆ]™\˜YÙBˆ›Üˆ
]HHÈHŽÈJÊÊHÈÛÛœÝÈHÝ‹‹œÛXÙJX]›X^
HHÚÈ
ÈJKH
ÈJK]ˆHËœ™YXÙJ
KŠHOˆH
È‹
HÈË›[™ÝÈYˆ
JH›[™UÊ
JKJ]ŠJNÈ[ÙH›[Ý™UÊ
JKJ]ŠJNÈBˆœÝ›ÚÙJ
NÂˆ•^
	ÐS	ËÞ
ÈÝÈ
ÈL
ˆKÞH
È
ˆKŠL
K—ÑRS•KŒˆ
ˆJNÈ•^
	Ó“Ó‘IËÞ
ÈÝÈ
ÈL
ˆKÞH
ÈÚ
È
ˆKŠL
K—ÑRS•KŒˆ
ˆJNÂˆ•^
	ÓS‘NˆS‹UÓÔ“U‘TQÑH0­ÈÓÓˆTÑHS‰ËÞÞH
ÈÚ
ÈŒˆ
ˆKŠL
K—ÑRS•K
ˆJNÈBˆÛÛœÝžLˆHžH
ÈÒœHÝˆÈHˆÌNÂˆ™ÛØ˜[[HHJM‹ŒŠNÂˆ•^
	ÕHRS‘È0­ÈÐÓÔ‘KÓÔ“–HÓÔ“	Ë^žL‹ŠL‹JK—ÑSK‹Œˆ
ˆJNÂˆÛÛœÝZ[™ÈH
‹›Z[™È×JKœÛXÙJJKH^
ÈLÌˆ
ˆKÈH]ÈHLÌˆ
ˆHHMŽ
ˆNÂˆZ[™Ë™›Ü‘XXÚ

KÊHOˆÈÛÛœÝHHžLˆ
ÈÎ
ˆH
ÈÈ
ˆœ
ˆKÛÛH“Z[™ÛÛ
K›˜[YJNÂˆ™ÛØ˜[[HHJMˆ
ÈÈ
ˆŒL‹Œˆ
ÈÈ
ˆŒLŠNÂˆ™š[Ý[HHÛÛÈ˜™YÚ[”]

NÈ˜\˜Ê^
ÈH
ˆKHHH
ˆKŽ
ˆKX]”H
ˆŠNÈ™š[

NÂˆ•^
K›˜[YKÕ\\Ø\ÙJ
K^
ÈN
ˆKKŠM
K—ÒQ‹
ˆJNÂˆœÝ›ÚÙTÝ[HH	Ü™Ø˜JŒŒËŒKŒM
IÎÈ›[™UÚYHNÈ˜™YÚ[”]

NÈ›[Ý™UÊHHH
ˆJNÈ›[™UÊ
ÈËHHH
ˆJNÈœÝ›ÚÙJ
NÂˆÛÛœÝœÈHK™œÈ×KÜ[ˆHX]›X^
LœË›[™Ý
NÂˆœË™›Ü‘XXÚ

‹ŠHOˆÈYˆ
ˆOH[
H™]\›ŽÈÛÛœÝHHJN
Èˆ
ˆŒˆ
Èˆ
ˆŒ
NÈYˆ
HH
H™]\›ŽÈ™ÛØ˜[[HHNÂˆÛÛœÝH
È
ˆ
ÈJH
ˆÈÈÜ[‹HHHHH
ˆHHX]›X^
LKX]›Z[ŠKŠJH
ˆLH
ˆNÈ™š[Ý[HHÛÛÈ˜™YÚ[”]

NÈ˜\˜ÊKËŒˆ
ˆKX]”H
ˆŠNÈ™š[

NÈJNÂˆ™ÛØ˜[[HHJˆ
ÈÈ
ˆŒL‹ˆ
ÈÈ
ˆŒLŠNÂˆ•^
K›YX[ˆOH[È
K›YX[ˆHÈ	ÊÉÈˆ	ø¢$‰ÊH
ÈX]˜XœÊK›YX[ŠKÑš^Y
ŠHˆ	ø %	Ë
ÈÈ
ÈŒ
ˆKKŠLËJK—ÒQH
ˆJNÂˆYˆ
K›YX[ˆOH[	‰ˆKœ™]“YX[ˆOH[
HÈÛÛœÝHK›YX[ˆHKœ™]“YX[ŽÈ•^
	ÙHÈ	ø¡¤IÈˆ	ø¡¤ÉßIÓX]˜XœÊ
KÑš^Y
Š_X
ÈÈ
È
ˆKKŠLJKHÈ	Ü™Ø˜JŒKLÎŽJIÈˆ—ÑSKˆ
ˆJNÈBˆYˆ
K™X[ÊH‘X[ÊK™X[Ë
ÈÈ
ÈLÎ
ˆKH
Èˆ
ˆKJNÈJNÂˆ]ÞHHžNÈËÈš\œÝÝÈÝ]\È˜\™YžHÝÈÛÜÙ[H^HØ]ÚYˆ]™\žHÛÜ›ÛÈ˜\‚ˆYˆ
‹Ø]Ú	‰ˆ‹Ø]Ú›[™ÝOOHŠHÈ™ÛØ˜[[HHJŒ‹ÊNÈÞHH•Ø]ÚÚ\
‹Ø]ÚÞžKÝËK‹‹Ø]Úœ›ÛK‹›Œ
H
È
ˆNÈBˆÛÛœÝÞUÈHÞNÂˆ™ÛØ˜[[HHJ‹ÍŠNÈËÈÚ]Ú\ÛÛ™Yˆ•^
	ÕÒUÒTÓÓ‘Q	ËÞÞKŠL‹JK—ÑSK‹
ˆJNÂˆÛÛœÝH‹š[×KÛH
‹šÚ[\œÈ×JKœÛXÙJ
›[™Ý	‰ˆ[™
HÞUÈˆžHÈˆˆÊK›ÝH[™ÈLŒˆ
ˆHˆHŒˆ
ˆNÂˆYˆ
Û›[™Ý
HÛ™›Ü‘XXÚ

Û›K—KÊHOˆÈÛÛœÝHHÞH
ÈÍˆ
ˆH
ÈÈ
ˆÌ
ˆNÂˆÛÛœÝÈH•^
›KÞK][XÈ	Ü‘š]
›KŒKÝÈHLMˆ
ˆKÈOˆ][XÈ	ÜÈ
ˆ_\	Ô—ÔÑT’QŸX
H
ˆ_\	Ô—ÔÑT’QŸX	Ü™Ø˜J‹KËŽLŠIÊNÂˆ•^
Sˆ	ÛŸH	ÛˆOOHHÈ	ÕÓÔ“	Èˆ	ÕÓÔ“ÉßXÞ
ÈÈ
ÈLˆ
ˆKKŠLJK—ÑSKK
ˆJNÈJNÂˆ[ÙH•Ü˜\
‹˜›XÚÈÈ	Ó›ÈÛÛXš[˜][ÛˆØ\È˜[YY‰Èˆ	Ó›ÈÛÜ›[™Y[ˆH›ÚY‰ËÞÞH
ÈÍˆ
ˆKÝËŽ
ˆK][XÈ	ÌŒH
ˆ_\	Ô—ÔÑT’QŸX	Ü™Ø˜J‹KËŽJIËŠNÂˆÞH
ÏHÍˆ
ˆH
ÈX]›X^
KÛ›[™Ý
H
ˆÌ
ˆH
ÈŒˆ
ˆNÂˆYˆ
›[™Ý	‰ˆÞH
ÈÍ
ˆHH›Ý
HÈ•^
	ÕÒUS	ËÞÞKŠL‹JK—ÑSK‹
ˆJNÈÞH
ÏHÍ
ˆNÈËÈÚ][ˆHYX\Ý\™\È]Y[ˆ\ÙHÛÜ›È
Ú\™H\™H\È›ÛÛJBˆ›Üˆ
ÛÛœÝ[™HÙˆ
HÈYˆ
ÞHˆ›ÝH
ˆJHœ™XZÎÈÛÛœÝÛÈH›YX\Ý\™U^	‰ˆ
™›ÛH][XÈ	ÌM‹H
ˆ_\	Ô—ÔÑT’QŸX›YX\Ý\™U^
[™JKÚYˆÝÊNÂˆYˆ
ÛÈ	‰ˆÞH
ÈŒÈ
ˆHˆ›Ý
Hœ™XZÎÈÞHH•Ü˜\
[™KÞÞKÝËŒÈ
ˆK][XÈ	ÌM‹H
ˆ_\	Ô—ÔÑT’QŸX	Ü™Ø˜J‹KËŽ
IËŠH
ÈÌ
ˆNÈBˆÞH
ÏH
ˆNÈBˆÛÛœÝˆH
‹›X\›™Y×JKœÛXÙJÊKÈH
‹›Y[ÜÝ×JKœÛXÙJÊNÂˆYˆ
‹›[™Ý	‰ˆÞH
ÈÍ
ˆH›Ý
HÈ•^
	ÓPT“‘QTÈÒTÓÓ‰ËÞÞKŠLKJK—ÑSK‹Œˆ
ˆJNÈÞHH•Ü˜\
‹š›Ú[Š	ÎÈ	ÊKÞÞH
Èˆ
ˆKÝË
ˆK	ÌMÈ
ˆ_\	Ô—ÔÑT’QŸX	Ü™Ø˜JŒŒËŒKÊIËŠH
ÈÍ
ˆNÈBˆYˆ
Ë›[™Ý	‰ˆÞH
ÈMˆ
ˆH›Ý
HÈ•^
	ÓSÔÕÑ•SˆQ•ÕUÑˆHT“‰ËÞÞKŠLKJK—ÑSK‹Œˆ
ˆJNÈ•Ü˜\
Ë›X\

Û›K—JHOˆ	Û›_H
	ÛŸJX
Kš›Ú[Š	Ë	ÊKÞÞH
Èˆ
ˆKÝË
ˆK	ÌMÈ
ˆ_\	Ô—ÔÑT’QŸX	Ü™Ø˜JŒŒËŒKŒŠIËŠNÈBˆ™ÛØ˜[[HHJŽŽLŠNÈËÈH™\™XÝˆYˆ
[™
H•Ü˜\
‹™\™XÝ	ÉËËœžžH
ÈÎ
ˆKÌHHHËœžÍ
ˆK][XÈ	Ì
ˆ_\	Ô—ÔÑT’QŸX	Ü™Ø˜J‹KËŽJIËŠNÂˆ[ÙH•Ü˜\
‹™\™XÝ	ÉËKHMÌˆ
ˆKÌHˆ
ˆKÌH
ˆK][XÈ	ÌŒÈ
ˆ_\	Ô—ÔÑT’QŸX	Ü™Ø˜J‹KËŽ
IËÊNÂˆ[‘›ÛÝ
‹
NÈ‘Ü˜Z[ŠÌJNÂˆÛÛœÝ™XÝH
KË
HOˆÈÛÛœÝHX]›X^
X]™›ÛÜŠ
JKLHX]›X^
X]™›ÛÜŠJJNÈ™]\›ˆÞLX]›X^
KX]›Z[ŠÌX]˜ÙZ[

ÈÊJHH
KX]›X^
KX]›Z[ŠX]˜ÙZ[
H
È
JHHL
WNÈNÂˆÛÛœÝXÈHËœH
Èˆ
ˆ]Ú
Èˆ
ˆKÈHÌHHH
Ëœž
NÈËÈÚ\™HXXÚ\Y\ËÛÈH™]™X[Ø[ˆœš[™È][ˆœ›ÛHHš[š\ÚYš[ˆË—×Ü™YÚ[ÛœÈHÈKXY\Žˆ™XÝ
HH
ˆKÌÍ
ˆJK]Nˆ[™È™XÝ
ËœžHM
ˆKMˆ
ˆKÈ
ÈŒ
ˆKÌ
ˆJHˆ™XÝ
HHM
ˆKL
ˆKÌHˆ
ˆH
ÈŽ
ˆKMˆ
ˆJKˆ]\ÎˆÜË›X\

ËÊHOˆ™XÝ
Ëœ
È
È	HJH
ˆ
È
ÈË™Ø\
HHÈ
ˆKËœH
ÈX]™›ÛÜŠÈÈJH
ˆ]ÚHÈ
ˆKÈ
Èˆ
ˆKÈ
ÈÌˆ
ˆJJKˆÛÝ[Îˆ[™È™XÝ
ËœžHM
ˆKH
ˆKÌHËœžHN
ˆKŒÌ
ˆJHˆ™XÝ
HHM
ˆKXÈHŒˆ
ˆKÌHˆ
ˆH
ÈŽ
ˆKL
ˆJKˆZ[™Îˆ™XÝ
^HM
ˆKžHHŒˆ
ˆKÞHˆ
ˆHH^ŒH
ˆH
ÈÒ
KÚ\ÛÛŽˆ™XÝ
ÞHLˆ
ˆKÞUÈHŒˆ
ˆKÝÈ
È
ˆK
[™ÈLÌˆ
ˆHˆHŒH
ˆJHH
ÞUÈHŒˆ
ˆJJKˆØ]ÚˆÞUÈˆžHÈ™XÝ
ÞHLˆ
ˆKžHHŒˆ
ˆKÝÈ
È
ˆKÞUÈHžJHˆ[ˆ™\™XÝˆ[™È™XÝ
ËœžHM
ˆKžH
È
ˆKÈ
ÈŒ
ˆKŒŽ
ˆJHˆ™XÝ
HHM
ˆKHŒˆ
ˆKÌHˆ
ˆH
ÈŽ
ˆKLNH
ˆJHNÂˆ™]\›ˆÎÂŸB˜ÛÛœÝÐUÒÐÓÓH

HOˆÜJ—Ô‘Ð‹›[\ŽMJKJ—Ô‘Ð‹˜ÛÛŽŠK	ÈÌ	ËJ—Ô‘Ð‹™[X™\‹ŽJK	Ü™Ø˜JNLNM‹ŒNŠI×NÂ™[˜Ý[Ûˆ•Ø]ÚÚ\
Í‹KËK‹œ›ÛKŒ
HÈËÈÚ^ÝXÚÙY˜\œËØ]ÚÈNˆ]™Y]™YÝ[H›ÚYÛÜ›ˆÝ]ZÙ[ˆÝ™\‚ˆ]ÈH‹Œˆ
ˆKXYH	ÔÕUTË–HÕÈÓÔÑSHVHÐUÒQ	ÎÂˆYˆ
•ÚY
XYŠL‹JKÊHˆÊHÈHKŒH
ˆNÈYˆ
•ÚY
XYŠL‹JKÊHˆÊHXYH	ÔÕUTË–HRTˆÐUÒ	ÎÂˆ•^
XYKŠL‹JK—ÑSKÊNÂˆ•^
œ›ÛHOH[È	ÑU‘T–HÕUHSˆU‘T–HÓÔ“ÓÈT‰Èˆœ›ÛHHŒÈ	ÑU‘T–HÕUHSˆTÑHSˆÓÔ“ÉÈˆU‘T–HÕUHÒSÑHÓÔ“	ÜYŠœ›ÛJ_K“ÕÓ“HTÑHS˜H
ÈN
ˆKŠKJK	Ü™Ø˜JŒŒËŒKŠIËK
ˆJNÂˆÛÛœÝÜHH
Èˆ
ˆKHMˆ
ˆKØ\HL
ˆKÈH
ÈHH
ˆØ\
HÈ‹ÛÛÈHÐUÒÐÓÓ

NÂˆÍ‹™›Ü‘XXÚ

‹JHOˆÈÛÛœÝžH
ÈH
ˆ
È
ÈØ\
KˆH–ÌNÂˆœÝ›ÚÙTÝ[HH	Ü™Ø˜JŒŒËŒKŒMŠIÎÈ›[™UÚYHNÈœÝ›ÚÙT™XÝ
ž
ÈH
ˆKÜ
ÈH
ˆKÈHKHJNÂˆYˆ
ŠHÈ]^HHÜ
ÈÈ›Üˆ
]ˆHÈˆNÈŠÊÊHÈÛÛœÝH
ˆ–Úˆ
ÈWHÈŽÈYˆ
H
HÛÛ[YNÈ^HOHÈ™š[Ý[HHÛÛÖÚ—NÈ™š[™XÝ
ž
ÈK^KÈHˆ
ˆK
NÂˆYˆ
ˆOOHŠHÈœÝ›ÚÙTÝ[HH	Ü™Ø˜JMKMKMKMJIÎÈ›[™UÚYHŽ
ˆNÈœÝ›ÚÙT™XÝ
ž
ÈK
ˆK^H
È
ˆKÈH‹Ž
ˆKX]›X^
HŽ
ˆJJNÈHHBˆ•^
Ýš[™ÊJKž
ÈÈÈ‹Ü
È
ÈNH
ˆKŠL‹K
KˆÈ—ÒQˆ—ÑRS•	ØÙ[\‰ÊNÂˆ•^
ˆÈÝš[™ÊŠHˆ	ø $ÉËž
ÈÈÈ‹ÜHÈ
ˆKŠKJK—ÑRS•ˆ
ˆK	ØÙ[\‰ÊNÈJNÂˆÛÛœÝHÖÉÓU‘Q	ËKÉÑ”“Ö‘HÔˆÕÔQ	ËWKÉÕ“ÒQ	Ë—KÉÕÓÔ“ˆÕU	Ë×KÉÕRÑS‰ËWNÈËÈHÙ^K[ˆ\È™]È›ÝÜÈ\Èš]ˆ]HHHÜ
È
È
ˆNÂˆ›Üˆ
ÛÛœÝÝ—HÙˆ
HÈÛÛœÝÈH•ÚY
ŠKJKKŒˆ
ˆJK™YYHLˆ
ˆH
ÈÎÂˆYˆ
ˆ	‰ˆ
È™YYˆ
ÈÊHÈHÈH
ÏHMÈ
ˆNÈBˆ™š[Ý[HHÛÛÖÚ—NÈ™š[™XÝ
HHËH
ˆK
ˆK
ˆJNÂˆYˆ
ˆOOHŠHÈœÝ›ÚÙTÝ[HH	Ü™Ø˜JMKMKMKŠIÎÈ›[™UÚYHŽ
ˆNÈœÝ›ÚÙT™XÝ
HHËH
ˆK
ˆK
ˆJNÈBˆ•^

ÈLˆ
ˆKKŠKJK	Ü™Ø˜JŒŒËŒKJIËKŒˆ
ˆJNÈ
ÏH™YY
ÈM
ˆNÈBˆ™]\›ˆH
È
ˆNÂŸB™[˜Ý[Ûˆ[ÛÛ\ÜÙJÝ‹[™Ë
HÈËÈH]™H™\Ü\žH\ˆXXÚ\˜Y\È[ˆœ›ÛHHš[š\ÚYš[Ý™\ˆ]ÈÜ›Ý[™ˆÛÛœÝHÝ‹™Ù]ÛÛ^
	Ì™	ÊK™ÈH[—×Ü™YÚ[ÛœËHH
KŠHOˆX]›X^
X]›Z[ŠK
HJHÈX]›X^
YKM‹ˆHJJJNÂˆ]ÝHÝ‹—×ÜÝÈËÈÛ›HH\È]Ú[™ÙYÚ[˜ÙHH\Ýœ˜[YH\™H]ÝÛˆYØZ[‚ˆYˆ
\ÝÝ™[OOH[Ý‹ÚYOOH[ÚYÝ‹šZYÚOOH[šZYÚ
HÈYˆ
Ý‹ÚYOOH[ÚYÝ‹šZYÚOOH[šZYÚ
HÈÝ‹ÚYH[ÚYÈÝ‹šZYÚH[šZYÚÈBˆ™ÛØ˜[[HHNÈ™˜]Ò[XYÙJ™Ë
NÈÝHÝ‹—×ÜÝHÈ[Nˆ™]ÈX\

HNÈBˆÛÛœÝ]H
Ù^K‹KKÚ\K^
HOˆÈYˆ
\ŠH™]\›ŽÈHHX]œ›Ý[™
H
NÈÛÛœÝÈHX]œ›Ý[™
–Ì—H
ˆ
Ú\HOH[ÈHˆÚ\JJKÚYÈH	ØKÑš^Y
Ê__	Ù__	ÝßXÂˆYˆ
Ý›K™Ù]
Ù^JHOOHÚYÊH™]\›ŽÈÝ›KœÙ]
Ù^KÚYÊNÂˆÛÛœÝHX]›Z[ŠÝ‹šZYÚH–ÌWK–Ì×H
È
^
JNÈ™ÛØ˜[[HHNÈ™˜]Ò[XYÙJ™Ë–ÌK–ÌWK–Ì—K–ÌK–ÌWK–Ì—K
NÂˆYˆ
Hˆ	‰ˆÈHJHÈ™ÛØ˜[[HHNÈ™˜]Ò[XYÙJ[–ÌK–ÌWKË–Ì×K–ÌK–ÌWH
ÈKË–Ì×JNÈHNÂˆ]
	Ú	Ë™ËšXY\‹JŒJJNÈ]
	Ý	Ë™Ë]KJŒ‹ŒJJNÂˆ™Ëœ]\Ë™›Ü‘XXÚ

‹ÊHOˆÈÛÛœÝHHJŒÈ
ÈÈ
ˆŒÍKŒMH
ÈÈ
ˆŒÍJNÈ]
	Ü	È
ÈË‹K
HH‘X\ÙJJJH
ˆM
ˆ™ËK[X]˜ÙZ[
MH
ˆ™ËJJNÈJNÂˆ]
	ØÉË™Ë˜ÛÝ[ËJËMŠJNÈ]
	ÛIË™Ë›Z[™ËJM‹ŠK‘X\ÙJJM‹ÊJJNÈ]
	ÝÉË™ËØ]ÚJŒ‹ÊK‘X\ÙJJŒ‹Í
JJNÈ]
	ÚÉË™ËœÚ\ÛÛ‹J‹ÍŠJNÈ]
	Ý‰Ë™Ë™\™XÝJŽŽLŠJNÂˆ™ÛØ˜[[HHNÂŸB˜ÛÛœÝ™Y“^[Ý]H

HOˆ[›™\•ÚYH[›™\’ZYÚ
ˆŽMHÈ	Û[™	Èˆ	ÜÜ	ÎÂ‹ËÈKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKHH\˜Ú]™H
\Èœ›ÝÜÙ\‰ÜÈÝÛŽˆ[™^YŠB˜ÛÛœÝTÈHÈÜ[Žˆ[\Ýˆ[NÂ™[˜Ý[Ûˆ\˜ÑŠ
HÂˆYˆ
TË›Ü[ŠH™]\›ˆTË›Ü[ŽÂˆTË›Ü[ˆH™]È›ÛZ\ÙJ™\ÈOˆÈžHÈYˆ
]Ú[™ÝËš[™^YŠH™]\›ˆ™\Ê[
NÂˆÛÛœÝœHH[™^Y‹›Ü[Š	Ý[™\˜X›K]ÛÜ›ËX\˜Ú]™IËJNÂˆœK›Û\Ü˜Y[™YYYH

HOˆÈÛÛœÝHœKœ™\Ý[ÈYˆ
Y›Øš™XÝÝÜ™S˜[Y\Ë˜ÛÛZ[œÊ	Üš[ÉÊJH˜Ü™X]SØš™XÝÝÜ™J	Üš[ÉËÈÙ^T]ˆ	ÚY	ÈJNÈNÂˆœK›ÛœÝXØÙ\ÜÈH

HOˆ™\ÊœKœ™\Ý[
NÈœK›Û™\œ›ÜˆH

HOˆ™\Ê[
NÈœK›Û˜›ØÚÙYH

HOˆ™\Ê[
NÈHØ]Ú
JHÈ™\Ê[
NÈHJNÂˆ™]\›ˆTË›Ü[ŽÂŸB™[˜Ý[Ûˆ\˜Õ
[ÙK›ŠHÂˆ™]\›ˆ\˜ÑŠ
K[ŠˆOˆ™]È›ÛZ\ÙJ™\ÈOˆÈYˆ
YŠH™]\›ˆ™\Ê[
NÂˆžHÈÛÛœÝH‹˜[œØXÝ[ÛŠ	Üš[ÉË[ÙJKœHH›Š›Øš™XÝÝÜ™J	Üš[ÉÊJNÈ›Û˜ÛÛ\]HH

HOˆ™\ÊœHÈœKœ™\Ý[ˆYJNÈ›Û™\œ›ÜˆH›Û˜X›ÜH

HOˆ™\Ê[
NÈHØ]Ú
JHÈ™\Ê[
NÈHJJNÂŸB˜\Þ[˜È[˜Ý[Ûˆ\˜Ð[

HÈÛÛœÝˆH]ØZ]\˜Õ
	Ü™XYÛ›IËÈOˆË™Ù][

JNÈTË›\ÝH
ˆ×JKœÛÜ

KŠHOˆ‹˜]HK˜]
NÈ™]\›ˆTË›\ÝÈB˜\Þ[˜È[˜Ý[Ûˆ\˜Ô]
][JHÈYˆ
‘TVH	‰ˆ‘TVK›]™JH™]\›ˆYNÈÛÛœÝÚÈH]ØZ]\˜Õ
	Ü™XYÜš]IËÈOˆËœ]
][JJNÈ]ØZ]\˜Ô[™J][K\JNÈ™]\›ˆÚÎÈB˜\Þ[˜È[˜Ý[Ûˆ\˜Ñ[
Y
HÈ]ØZ]\˜Õ
	Ü™XYÜš]IËÈOˆË™[]JY
JNÈB™[˜Ý[Ûˆ\˜Ô]Ú
YšY[ÊHÈËÈÚ[™ÙHÛÛYHšY[ÈÙˆHš[Yš[[™Û›HYˆ]\ÈÝ[š[Y
ÛÈH]HÜš]HØ[››Ýœš[™È˜XÚÈÚ]Ø\È[]Y
Bˆ™]\›ˆ\˜ÑŠ
K[ŠˆOˆ™]È›ÛZ\ÙJ™\ÈOˆÈYˆ
YŠH™]\›ˆ™\Ê˜[ÙJNÂˆžHÈÛÛœÝH‹˜[œØXÝ[ÛŠ	Üš[ÉË	Ü™XYÜš]IÊKÝH›Øš™XÝÝÜ™J	Üš[ÉÊKœHHÝ™Ù]
Y
NÈ]ÚÈH˜[ÙNÂˆœK›ÛœÝXØÙ\ÜÈH

HOˆÈÛÛœÝÝ\ˆHœKœ™\Ý[ÈYˆ
Ý\ŠHÈØš™XÝ˜\ÜÚYÛŠÝ\‹šY[ÊNÈÝœ]
Ý\ŠNÈÚÈHYNÈHNÂˆ›Û˜ÛÛ\]HH

HOˆ™\ÊÚÊNÈ›Û™\œ›ÜˆH›Û˜X›ÜH

HOˆ™\Ê˜[ÙJNÈHØ]Ú
JHÈ™\Ê˜[ÙJNÈHJJNÂŸB˜\Þ[˜È[˜Ý[ÛˆÙ]Ù\
]Ù\
HÈ]šÙ\HHZÙ\ÈYˆ
Z]š\X[
H]ØZ]\˜Ô]Ú
]šYÈÙ\ˆ]šÙ\JNÈ]ØZ]\˜Ð[

NÈ™]\›ˆ]ÈB˜\Þ[˜È[˜Ý[Ûˆ\˜Ô[™J\JHÈËÈÙ\š[ÈÝ^NÈÙˆH™\ÝH™]Ù\Ý\™HÙ\\ÈH[Z]ˆÛÛœÝ[H
]ØZ]\˜Ð[

JK™š[\Š]Oˆ]\HOOH\H	‰ˆZ]šÙ\
KØ\H\HOOH	ÝÛÜ›	ÈÈ’S•ÐTÕÈˆ’S•ÐTÕÂˆ›Üˆ
ÛÛœÝ]Ùˆ[œÛXÙJØ\
JH]ØZ]\˜Ñ[
]šY
NÂˆYˆ
[›[™ÝˆØ\
H]ØZ]\˜Ð[

NÂŸB˜ÛÛœÝ›Ø“ÙˆH
Ë\KJHOˆ™]È›ÛZ\ÙJˆOˆÈžHÈYˆ
XÈXËÐ›ØŠH™]\›ˆŠ[
NÈËÐ›ØŠˆOˆŠŠK\KJNÈHØ]Ú
JHÈŠ[
NÈHJNÂ˜\Þ[˜È[˜Ý[Ûˆš]X\ÙŠÜ˜ÊHÈËÈH›Ø‹H]HT“ÜˆHØ[˜\Ë\ÈÛÛY][™È˜]Ò[XYÙHZÙ\ÂˆYˆ
\Ü˜ÊH™]\›ˆ[ÈYˆ
Ü˜Ë™Ù]ÛÛ^
H™]\›ˆÜ˜ÎÂˆžHÈYˆ
Ü˜È[œÝ[˜Ù[Ùˆ›ØŠH™]\›ˆ]ØZ]Ü™X]R[XYÙPš]X\
Ü˜ÊNÈHØ]Ú
JHÈ™]\›ˆ[ÈBˆ™]\›ˆ]ØZ]™]È›ÛZ\ÙJˆOˆÈÛÛœÝ[HH™]È[XYÙJ
NÈ[K›Û›ØYH

HOˆŠ[JNÈ[K›Û™\œ›ÜˆH

HOˆŠ[
NÈ[KœÜ˜ÈHÜ˜ÎÈJNÂŸB˜\Þ[˜È[˜Ý[ÛˆXÛÙP]
Ü˜Ë
HÈËÈHXÝ\™KXÛÙY[™˜]Ûˆ[ÈHØ[˜\È›È\™Ù\ˆ[ˆXÜ›ÜÜÈ
HXÛÙYš]X\\È]ÛÈ]Û˜ÙJBˆYˆ
\Ü˜ÊH™]\›ˆ[ÈÛÛœÝˆH]ØZ]š]X\ÙŠÜ˜ÊNÈYˆ
XŠH™]\›ˆ[ÂˆYˆ
‹™Ù]ÛÛ^	‰ˆ‹ÚYH
H™]\›ˆŽÂˆÛÛœÝÈHØ[˜\ÓÙŠ‹
NÈYˆ
‹˜ÛÜÙJH‹˜ÛÜÙJ
NÈ™]\›ˆÎÂŸB˜ÛÛœÝ\œÙTÝ[\HÈOˆÈÛÛœÝHH×ŠÍJKJ
KJ
VÈJ
NŠ
KË™^XÊÈ	ÉÊNÈ™]\›ˆHÈ™]È]J
ÛVÌWK
ÛVÌ—HHK
ÛVÌ×K
ÛVÍK
ÛVÍWJK™Ù][YJ
Hˆ˜SŽÈNÂ˜ÛÛœÝ™\ÜÙ^HHˆOˆ	Ô‹›ŒKIÔ‹›Œ_KIÔ‹˜]XÂ˜ÛÛœÝPÔÈH™]ÈX\

NÈ]PÔ×ÔHÈËÈÛX[XÝ\™\ÈÙˆÛÜ›Ë›Üˆ[X›˜Z[Ë\Èš\Ú]
][ÜÝÚ^Z[[Ûˆ^[ÈÙˆ[JB™[˜Ý[ÛˆXÜÔ]
Ù^K[JHÈYˆ
PÔËš\ÊÙ^JHZ[JH™]\›ŽÈPÔËœÙ]
Ù^K[JNÈPÔ×Ô
ÏH[KÚY
ˆ[KšZYÚÂˆÚ[H
PÔ×Ôˆ™Mˆ	‰ˆPÔËœÚ^™HˆJHÈÛÛœÝÚË—HHPÔË™[šY\Ê
K›™^

K˜[YNÈPÔË™[]JÊNÈPÔ×ÔOH‹ÚY
ˆ‹šZYÚÈHB˜\Þ[˜È[˜Ý[ÛˆXÑ›ÜŠ‹Ë‹
HÈËÈÛÜ›‰ÜÈXÝ\™Nˆ\Èš\Ú]	ÜÈÝÛ‹[ÙHH\˜Ú]™IÜÈ
]Èš[ÜˆH™\Ü	ÜÈÛÜJK[ÙHHØ]™YÜ]X\™BˆÛÛœÝÙ^HH	ÛŸ_	Ú\Ñš[š]JŠHÈˆˆ	Éß_	ÜXÈYˆ
HMŒ	‰ˆPÔËš\ÊÙ^JJH™]\›ˆPÔË™Ù]
Ù^JNÂˆ][HH[ÂˆÛÛœÝˆH’S•œ™XÙ[™š[™
Oˆ›ˆOOHˆ	‰ˆš[YÊNÈYˆ
ŠH[HHØ[˜\ÓÙŠ‹š[YË
NÂˆYˆ
Z[JHÈYˆ
PTË›\Ý
H]ØZ]\˜Ð[

NÂˆÛÛœÝ™X\ˆH]OˆZ\Ñš[š]JŠHX]˜XœÊ]˜]HŠHˆ
ˆÍŒLË\ÝHTË›\Ý×NÂˆÛÛœÝHH\Ý™š[\Š]Oˆ]\HOOH	ÝÛÜ›	È	‰ˆ]›ˆOOHˆ	‰ˆ]œÝ[	‰ˆ™X\Š]
JKœÛÜ

JHOˆ\Ñš[š]JŠHÈX]˜XœÊ˜]HŠHHX]˜XœÊK˜]HŠHˆK˜]H˜]
VÌNÂˆYˆ
JH[HH]ØZ]XÛÙP]
KœÝ[
NÂˆYˆ
Z[JH›Üˆ
ÛÛœÝ]Ùˆ\Ý
HÈYˆ
]\HOOH	Ý[‰ÈZ]š[YÜÈ[™X\Š]
JHÛÛ[YNÈÛÛœÝÈH
]œ™XËÛÜ›È×JK™š[™[™^
Oˆ›ˆOOHŠNÈYˆ
ÈH	‰ˆ]š[YÜÖÚ×JHÈ[HH]ØZ]XÛÙP]
]š[YÜÖÚ×K
NÈYˆ
[JHœ™XZÎÈHHBˆYˆ
Z[H	‰ˆÈ	‰ˆËš[YÊH[HH]ØZ]XÛÙP]
Ëš[YË
NÂˆYˆ
Z[H	‰ˆÒÕÖÛ—H	‰ˆÒÕÖÛ—KœÜ˜È	‰ˆÈ	‰ˆË›ˆHˆHÌ	‰ˆË›ˆHŠH[HH]ØZ]XÛÙP]
ÒÕÖÛ—KœÜ˜Ë
NÂˆYˆ
HMŒ	‰ˆ[JHXÜÔ]
Ù^K[JNÂˆ™]\›ˆ[NÂŸB˜\Þ[˜È[˜Ý[Ûˆ[’[XYÙ\Ê‹
HÈÛÛœÝˆH\œÙTÝ[\
‹˜]
NÈ™]\›ˆ›ÛZ\ÙK˜[

‹ÛÜ›È×JK›X\
ÈOˆXÑ›ÜŠË›‹Ë‹LLŠK˜Ø]Ú


HOˆ[
JJNÈB˜\Þ[˜È[˜Ý[Ûˆ[’[YÜÓÙŠ]
HÈËÈHš[Y™\Ü	ÜÈÝÛˆÛÜY\Ë[ÙHÚ]]™\ˆØ[ˆ™H›Ý[™ˆÛÛœÝÝÛˆH]š[YÜÈ×KˆH\œÙTÝ[\
]œ™XË˜]
NÂˆ™]\›ˆ›ÛZ\ÙK˜[

]œ™XËÛÜ›È×JK›X\
\Þ[˜È
ËÊHOˆ
ÝÛ–Ú×HÈ]ØZ]XÛÙP]
ÝÛ–Ú×K
Hˆ[
HXÑ›ÜŠË›‹Ë‹
K˜Ø]Ú


HOˆ[
JJNÂŸB˜\Þ[˜È[˜Ý[Ûˆš[Tš[
ËÝ[
HÂˆ]ØZ]‘›ÛÊ
NÂˆÛÛœÝ™XÈHËœš[™XÈš[™XÛÜ™
Ë×JKœˆHY™TÝš\
Ë™XËšÚ[™
KY™HHœ‹›X\
ˆOˆ‹˜ÊNÂˆ™XË›Y™HHœ‹›X\
ˆOˆ
Èˆ‹Îˆ‹šÈJJNÈYˆ
Ë‘]JHË‘]K›Y™PÈHY™NÂˆÛÛœÝ[XˆH˜]ÕÛÜ›š[
™XËÝ[ÍŒY™JNÂˆÛÛœÝ][HHÈYˆÉÜ™XË›ŸKIÜ™XË˜]X\Nˆ	ÝÛÜ›	ËŽˆ™XË›‹]ˆ™XË˜]Ù\ˆ˜[ÙKŽˆ’S••‹™XËÝ[ˆÝ[È]ØZ]›Ø“ÙŠÝ[	Ú[XYÙKÚœYÉË’S•œJHˆ[ˆY™Nˆ]ØZ]›ÛZ\ÙK˜[
Y™K›X\
ÈOˆ›Ø“ÙŠØ[˜\ÓÙŠËMŠHË	Ú[XYÙKÚœYÉËŽŠJJK[XŽˆ]ØZ]›Ø“ÙŠ[X‹	Ú[XYÙKÚœYÉËŽŠHNÂˆYˆ
J‘TVH	‰ˆ‘TVK›]™JJHÈ’S•œ™XÙ[œ\Ú
ÈŽˆ™XË›‹[YÎˆÝ[ÈØ[˜\ÓÙŠÝ[
Hˆ[™XÈJNÈYˆ
’S•œ™XÙ[›[™ÝˆLŠH’S•œ™XÙ[œÚY

NÈBˆ’S•›\ÝH][NÈYˆ
ÈOOHÈ	‰ˆJË‘]H	‰ˆ‘T‘PÕ›ÛŠJHÚÝÑš[Y
][K[XŠNÂˆË›Y™HH[ÈË›X\šÜÈH[ÈËÈHœ˜[Y\È\™Hš[Yˆ]ØZ]\˜Ô]
][JNÂˆ™]\›ˆ][NÂŸB˜ÛÛœÝ’SS‘ÈH™]ÈX\

NÈËÈ™\ÜÈ™Z[™Èš[YÛÈH™\Ü\Èš[YÛ˜ÙHÝÙ]™\ˆÙ[ˆ]\È\ÚÙY›Ü‚™[˜Ý[Ûˆš[U[Š‹[YÜËÙ\
HÂˆÛÛœÝÈH™\ÜÙ^JŠNÈ]ˆH’SS‘Ë™Ù]
ÊNÂˆYˆ
\ŠHÈˆHš[U[Œ
‹[YÜÊK™š[˜[J

HOˆ’SS‘Ë™[]JÊJNÈ’SS‘ËœÙ]
ËŠNÈBˆ™]\›ˆ‹[Š\Þ[˜È]OˆÈYˆ
Ù\	‰ˆ]	‰ˆZ]šÙ\
H]ØZ]Ù]Ù\
]YJNÈ™]\›ˆ]ÈJNÂŸB˜\Þ[˜È[˜Ý[Ûˆš[U[Œ
‹[YÜÊHÈËÈHš[Ùˆ[‹Ú]]ÈÝÛˆÛÜY\ÈÙˆH[ˆXÝ\™\È
ÛX[
Bˆ]ØZ]‘›ÛÊ
NÈYˆ
PTË›\Ý
H]ØZ]\˜Ð[

NÂˆÛÛœÝYH
TË›\Ý×JK™š[™
]Oˆ]\HOOH	Ý[‰È	‰ˆ]œ™XÈ	‰ˆ™\ÜÙ^J]œ™XÊHOOH™\ÜÙ^JŠJNÈYˆ
Y
H™]\›ˆYÂˆÛÛœÝÛX[H]ØZ]›ÛZ\ÙK˜[

[YÜÈ×JK›X\
[HOˆ[HÈ›Ø“ÙŠØ[˜\ÓÙŠ[K
K	Ú[XYÙKÚœYÉËŽ
Hˆ[
JNÂˆÛÛœÝ[XˆH˜]Õ[”š[
‹[YÜËK[	Û[™	ÊNÂˆÛÛœÝ][HHÈYˆ	Ô‹›ŒKIÔ‹›Œ_KIÑ]K››ÝÊ
_X\Nˆ	Ý[‰ËŽˆ‹›ŒKŒˆ‹›Œ]ˆ\œÙTÝ[\
‹˜]
H]K››ÝÊ
KÙ\ˆ˜[ÙKŽˆ’S••‹™XÎˆÈ‹‹”‹ÛÜ›Îˆ
‹ÛÜ›È×JK›X\
ÈOˆ
È‹‹Ë[YÎˆ[JJHK[YÜÎˆÛX[[XŽˆ]ØZ]›Ø“ÙŠ[X‹	Ú[XYÙKÚœYÉËŽŠHNÂˆ]ØZ]\˜Ô]
][JNÈ™]\›ˆ][NÂŸB˜ÛÛœÝ•H™]ÈX\

NÈËÈ[X›˜Z[È˜]Ûˆ\Èš\Ú]›Üˆ™\ÜÈÙ\Û›H\È™XÛÜ™Â˜\Þ[˜È[˜Ý[Ûˆ˜]Õ[XŠ]
HÈËÈH[X›˜Z[˜]Ûˆ›ÝÈœ›ÛHÚ]Ø\Èš[Yˆ]ØZ]‘›ÛÊ
NÂˆYˆ
]\HOOH	ÝÛÜ›	ÊH™]\›ˆ˜]ÕÛÜ›š[
]œ™XË]ØZ]XÛÙP]
]œÝ[
KÍŒ]ØZ]›ÛZ\ÙK˜[

]›Y™H×JK›X\
ˆOˆXÛÙP]
‹MŒ
JJJNÂˆ™]\›ˆ˜]Õ[”š[
]œ™XË]ØZ][’[YÜÓÙŠ]MŒ
KK[	Û[™	ÊNÂŸB˜\Þ[˜È[˜Ý[Ûˆ[X‘›ÜŠ]
HÈËÈH[X›˜Z[ˆ\Èš[YÜˆ˜]Ûˆ›ÝÈ
[™š[Y
HYˆ]Ø\Èš[Y™Y›Ü™H\ÙHš[ÂˆYˆ
][Xˆ	‰ˆ]ˆOOH’S••ŠH™]\›ˆ][XŽÂˆYˆ
]š\X[	‰ˆ•š\Ê]šY
JH™]\›ˆ•™Ù]
]šY
NÂˆÛÛœÝÈH]ØZ]˜]Õ[XŠ]
KˆH]ØZ]›Ø“ÙŠË	Ú[XYÙKÚœYÉËŽŠNÂˆYˆ
ˆ	‰ˆ]š\X[
HÈ•œÙ]
]šYŠNÈYˆ
•œÚ^™HˆLŒ
H•™[]J•šÙ^\Ê
K›™^

K˜[YJNÈBˆ[ÙHYˆ
ŠHÈ][XˆHŽÈ]ˆH’S••ŽÈ]ØZ]\˜Ô]Ú
]šYÈ[XŽˆ‹Žˆ’S••ˆJNÈBˆ™]\›ˆŽÂŸB™[˜Ý[Ûˆ[’][\Ê
HÈËÈ]™\žH™\ÜˆÜÙHš[Y[ˆH\˜Ú]™K[™ÜÙHÙ\Û›H\È™XÛÜ™ÂˆÛÛœÝš[YH
TË›\Ý×JK™š[\Š]Oˆ]\HOOH	Ý[‰ÊKÙ^\ÈH™]ÈÙ]
š[Y›X\
]Oˆ]œ™XÈ	‰ˆ™\ÜÙ^J]œ™XÊJJNÂˆÛÛœÝ™XÈH‘TÔ•Ë™š[\ŠˆOˆZÙ^\Ëš\Ê™\ÜÙ^JŠJJK›X\
ˆOˆ
ÈYˆ	ÜŽ‰È
È™\ÜÙ^JŠK\Nˆ	Ý[‰Ëš\X[ˆYKŽˆ‹›ŒKŒˆ‹›Œ]ˆ\œÙTÝ[\
‹˜]
HÙ\ˆ˜[ÙK™XÎˆˆJJNÂˆ™]\›ˆš[Y˜ÛÛ˜Ø]
™XÊKœÛÜ

KŠHOˆ‹˜]HK˜]‹›ˆHK›ŠNÂŸB˜\Þ[˜È[˜Ý[Ûˆ›Ü™Ù]][J]
HÈËÈ[][™ÈH™\Ü[]\È]È™XÛÜ™ÛËÛÈ]Ù\È›ÝÛÛYH˜XÚÂˆYˆ
Z]š\X[
H]ØZ]\˜Ñ[
]šY
NÂˆYˆ
]\HOOH	Ý[‰È	‰ˆ]œ™XÊHÈÛÛœÝÈH™\ÜÙ^J]œ™XÊK™Y›Ü™HH‘TÔ•Ë›[™ÝÈ‘TÔ•ÈH‘TÔ•Ë™š[\ŠˆOˆ™\ÜÙ^JŠHOOHÊNÈYˆ
‘TÔ•Ë›[™ÝOOH™Y›Ü™JHØ]™T™\ÜÊ
NÈBˆ•™[]J]šY
NÈ]ØZ]\˜Ð[

NÂŸB‹ËÈKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKHØ]š[™ÈH‘È
Üˆ[žHš[JK[™Ú\š[™ÈHÛÜ›˜\Þ[˜È[˜Ý[ÛˆØ]™Tš[
Ëš[[˜[YJHÈÛÛœÝ›ØˆH]ØZ]›Ø“ÙŠË	Ú[XYÙKÜ™ÉÊNÈ™]\›ˆ›ØˆÈØ]™P›ØŠ›Ø‹š[[˜[YJHˆ	Ù˜Z[Y	ÎÈB˜\Þ[˜È[˜Ý[ÛˆØ]™P›ØŠ›Ø‹š[[˜[YJHÂˆYˆ
X›ØŠH™]\›ˆ	Ù˜Z[Y	ÎÂˆ]H[ÈžHÈHÚ[™ÝË˜Û]YH	‰ˆ\[ÙˆÚ[™ÝË˜Û]YK\ÙHOOH	Ù[˜Ý[Û‰ÈÈ]ØZ]Ú[™ÝË˜Û]YK\ÙJ	ÙÝÛ›ØYÉÊHˆ[ÈHØ]Ú
JHÈH[ÈBˆYˆ

HÈžHÈ]ØZ]œØ]™JÈš[[˜[YK]Nˆ›ØˆJNÈ™]\›ˆ	ÜØ]™Y	ÎÈBˆØ]Ú
JHÈÛÛœÝÛÙHHH	‰ˆK˜ÛÙNÈYˆ
ÛÙHOOH	ÙXÛ[™Y	ÊH™]\›ˆ	ÙXÛ[™Y	ÎÈYˆ
ÛÙHOOH	Ü˜]WÛ[Z]Y	ÊH™]\›ˆ	Ø\ÞIÎÈYˆ
VÉÝ[˜]˜Z[X›IË	Û›ÝÙÜ˜[Y	Ë	ØØ\Xš[]WÙ\ØX›Y	Ë	ØØ\Xš[]WÜ™[[Ý™Y	×Kš[˜ÛY\ÊÛÙJJH™]\›ˆ	Ù˜Z[Y	ÎÈHBˆžHÈÛÛœÝHHØÝ[Y[˜Ü™X]Q[[Y[
	ØIÊK\›HT“˜Ü™X]SØš™XÝT“
›ØŠNÈKš™YˆH\›ÈK™ÝÛ›ØYHš[[˜[YNÈKœ™[H	Û›ÛÜ[™\‰ÎÈØÝ[Y[˜›ÙK˜\[™Ú[
JNÈK˜ÛXÚÊ
NÈÙ][Y[Ý]


HOˆÈT“œ™]›ÚÙSØš™XÝT“
\›
NÈKœ™[[Ý™J
NÈK
NÈ™]\›ˆ	ÜØ]™Y	ÎÈBˆØ]Ú
JHÈ™]\›ˆ	Ù˜Z[Y	ÎÈBŸB˜ÛÛœÝØ]™S\ÙÈHˆOˆˆOOH	ÜØ]™Y	ÈÈ	ÔØ]™Y	ÈˆˆOOH	ÙXÛ[™Y	ÈÈ	Ó›ÝØ]™Y	ÈˆˆOOH	Ø\ÞIÈÈ	ÐHØ]™H\È[™XYHØZ][™ÉÈˆ	Ò]ÛÝ[›Ý™HØ]™Y\™IÎÂ‹ËÈHÛÜ›	ÜÈ[šÎˆHYXÙIÜÈÝÛˆYÙKÚ]HÛÜ›	ÜÈÛÙHY\ˆ]ÛÈ]ÚÙ]™\ˆÜ[œÈ]ÙY\È]ÛÜ›^YY‹ËÈYØZ[‹ˆ\™HÛˆÛ]YK˜ZH
[™œ›ÛHHÛÜHÜ[™Y\ÈHš[JH]\ÈHYXÙIÜÈYÙH\™NÈHÛÜH]]ÈÝÛˆY™\ÜÂ‹ËÈ[šÜÈÈ]Ù[‹‚˜ÛÛœÝT•ÕT“H	ÚÎ‹ËØÛ]YK˜ZKØ\Y˜XÝÌZ“žŒMQÑŽTÚL[›ÞYÜ]	ÎÂ™[˜Ý[ÛˆÚ\™S[šÊÛÙJHÂˆYˆ
XÛÙJH™]\›ˆ[ÈÛÛœÝH	ÈÝÛÜ›IÈ
ÈÛÙNÂˆžHÈYˆ
×šÏÎ‰Ë\Ý
ØØ][Û‹œ›ÝØÛÛ
H	‰ˆÚ[™ÝËÜOOHÚ[™ÝÈ	‰ˆKÊŸŠJÛ]YW˜Z_Û]Y]\Ù\˜ÛÛ[˜ÛÛ_Û]YWœÚ]_[›ÜX×˜ÛÛJIË\Ý
ØØ][Û‹šÜÝ˜[YJJH™]\›ˆØØ][Û‹›ÜšYÚ[ˆ
ÈØØ][Û‹œ]˜[YH
ÈÈHØ]Ú
JHßBˆ™]\›ˆT•ÕT“
ÈÂŸB™[˜Ý[ÛˆYØXÞPÛÜJ
HÈžHÈÛÛœÝHHØÝ[Y[˜Ü™X]Q[[Y[
	Ý^\™XIÊNÈK˜[YHHÈKœÙ]]šX]J	Ü™XYÛ›IË	ÉÊNÈKœÝ[K˜ÜÜÕ^H	ÜÜÚ][ÛŽ™š^YÛYŒÝÜŒÛÜXÚ]NŒÉÎÂˆØÝ[Y[˜›ÙK˜\[™Ú[
JNÈK™›ØÝ\ÊÈ™]™[ØÜ›ÛˆYHJNÈKœÙ[XÝ

NÈÛÛœÝÚÈHØÝ[Y[™^XÐÛÛ[X[™
	ØÛÜIÊNÈKœ™[[Ý™J
NÈ™]\›ˆH[ÚÎÈHØ]Ú
JHÈ™]\›ˆ˜[ÙNÈHB˜\Þ[˜È[˜Ý[ÛˆÛÜU^

HÈžHÈYˆ
˜]šYØ]Ü‹˜Û\›Ø\™	‰ˆ˜]šYØ]Ü‹˜Û\›Ø\™Üš]U^
HÈ]ØZ]˜]šYØ]Ü‹˜Û\›Ø\™Üš]U^

NÈ™]\›ˆYNÈHHØ]Ú
JHßH™]\›ˆYØXÞPÛÜJ
NÈB˜\Þ[˜È[˜Ý[ÛˆÚ\™UÛÜ›
ÛÙK\ÙËÚÝÊHÈËÈÛÜYY
Ü‹ÛˆHÛ™K[™YÈ]ÈÚ\™HÚY]
NÈ˜Z[[™È›ÝÚÝÛˆÈ™HÛÜYYžH[™ˆÛÛœÝ\›HÚ\™S[šÊÛÙJNÈYˆ
]\›
HÈ\ÙÊ	Õ\ÈÛÜ›\È›ÈÛÙHÈÚ\™IÊNÈ™]\›ŽÈBˆYˆ
˜]šYØ]Ü‹œÚ\™H	‰ˆX]ÚYYXJ	ÊÚ[\ŽˆÛØ\œÙJIÊK›X]Ú\ÊHÈžHÈ]ØZ]˜]šYØ]Ü‹œÚ\™JÈ]Nˆ	Õ[™\˜X›HÛÜ›ÉË\›JNÈ\ÙÊ	ÔÚ\™Y	ÊNÈ™]\›ŽÈHØ]Ú
JHÈYˆ
H	‰ˆK›˜[YHOOH	ÐX›Ü\œ›Ü‰ÊHÈ\ÙÊ	ÉÊNÈ™]\›ŽÈHHBˆYˆ
]ØZ]ÛÜU^
\›
JH\ÙÊ	Ó[šÈÛÜYYˆ]^\È\ÈÛÜ›YØZ[‰ÊNÈ[ÙHÈ\ÙÊ	ÉÊNÈÚÝÊ\›
NÈBŸB˜ÛÛœÝÚÝÐÛÜHH›ÞOˆOˆÈÛÛœÝHH›Þœ]Y\žTÙ[XÝÜŠ	Ë›\ÙÉÊNÈYˆ
JHÈK^ÛÛ[HÈKœÝ[K\Ù\”Ù[XÝH	Ø[	ÎÈKœÝ[KÙXšÚ]\Ù\”Ù[XÝH	Ø[	ÎÈKœÝ[KÛÜ™œ™XZÈH	Øœ™XZËX[	ÎÈHNÂ˜\Þ[˜È[˜Ý[Ûˆš[[
]Ë^[Ý]
HÈËÈHš[Yš[˜]Ûˆ][Ú^™Bˆ]ØZ]‘›ÛÊ
NÂˆYˆ
]\HOOH	ÝÛÜ›	ÊH™]\›ˆ˜]ÕÛÜ›š[
]œ™XË]ØZ]XÛÙP]
]œÝ[
KÈMŒ]ØZ]›ÛZ\ÙK˜[

]›Y™H×JK›X\
ˆOˆXÛÙP]
‹ÌŒ
JJJNÂˆÛÛœÝH^[Ý]™Y“^[Ý]

NÈ™]\›ˆ˜]Õ[”š[
]œ™XË]ØZ][’[YÜÓÙŠ]LLŠKÈ
OOH	Û[™	ÈÈˆMŒ
KK[
NÂŸB˜ÛÛœÝš[˜[YHH]Oˆ]\HOOH	ÝÛÜ›	ÈÈ[™\˜X›K]ÛÜ›Ë]ÛÜ›IÜYŠ]›Š_Kœ™Øˆ[™\˜X›K]ÛÜ›Ë]ÛÜ›ËIÜYŠ]›Œ
_KIÜYŠ]›Š_Kœ™ØÂ˜ÛÛœÝ][S˜[YHH]Oˆ]\HOOH	ÝÛÜ›	ÈÈ	ÕÛÜ›	È
ÈYŠ]›ŠHˆ	ÕÛÜ›È	È
ÈYŠ]›Œ
H
È	ø $ÉÈ
ÈYŠ]›ŠNÂ˜ÛÛœÝÚ[ÜÚÈH

HOˆØÝ[Y[˜›ÙK˜Û\ÜÓ\Ý˜ÛÛZ[œÊ	ÚÚ[ÜÚÉÊNÂ‹ËÈKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKHš[YˆH›ÝHÛˆH[™ØÜ™Y[‚™[˜Ý[ÛˆÚÝÑš[Y
][K[XŠHÂˆÛÛœÝ›ÞHØÝ[Y[™Ù][[Y[žRY
	Ùš[Y	ÊNÈYˆ
X›ÞÑ‘Ë˜Ø[XŠH™]\›ŽÂˆ›Þš[›™\’SH]ˆÛ\ÜÏH™˜ÈÙ]]ˆÛ\ÜÏH™šHÜ[ˆÛ\ÜÏHšÈ‘š[YÈH\˜Ú]™OÜÜ[•ÛÜ›	ÜYŠ][K›Š_OØÜ[ˆÛ\ÜÏH›È‰Ù\ØÊ][Kœ™XË]J_OÜÜ[‚ˆÜ[ˆÛ\ÜÏH˜XÝÈ]Ûˆ\OH˜]Ûˆˆ]KXOHšÙY\ˆ\šXK\™\ÜÙYH™˜[ÙH’ÙY\Ø]Û]Ûˆ\OH˜]Ûˆˆ]KXOHœØ]™H”Ø]™H‘ÏØ]Û]Ûˆ\OH˜]Ûˆˆ]KXOH›Ü[ˆ\˜Ú]™OØ]ÛÜÜ[Ü[ˆÛ\ÜÏH›\ÙÈˆ\šXK[]™OHœÛ]HÜÜ[Ù]˜Âˆ[X‹˜Û\ÜÓ˜[YHH	Ý[X‰ÎÈ›Þœ]Y\žTÙ[XÝÜŠ	Ë™˜ÉÊK˜\[™Ú[
[XŠNÂˆ[X‹˜Y]™[\Ý[™\Š	ØÛXÚÉË

HOˆÈYˆ
ZÚ[ÜÚÊ
JHÜ[\˜Ú]™J][KšYYJNÈJNÂˆÛÛœÝ\ÙÈHOˆÈÛÛœÝHH›Þœ]Y\žTÙ[XÝÜŠ	Ë›\ÙÉÊNÈYˆ
JHÈK^ÛÛ[HÈÛX\•[Y[Ý]
ÚÝÑš[Y
NÈÚÝÑš[YHÙ][Y[Ý]


HOˆÈK^ÛÛ[H	ÉÎÈKÌŒ
NÈHNÂˆ›Þœ]Y\žTÙ[XÝÜŠ	ÖÙ]KXOHšÙY\—IÊK˜Y]™[\Ý[™\Š	ØÛXÚÉË\Þ[˜ÈHOˆÈÛÛœÝHK˜Ý\œ™[\™Ù]È]ØZ]Ù]Ù\
][KZ][KšÙ\
NÈœÙ]]šX]J	Ø\šXK\™\ÜÙY	ËÝš[™Ê][KšÙ\
JNÈ^ÛÛ[H][KšÙ\È	ÒÙ\	Èˆ	ÒÙY\	ÎÈ\ÙÊ][KšÙ\È	ÒÙ\ˆ]Ý^\È[ˆH\˜Ú]™IÈˆ	Ó›ÈÛ™Ù\ˆÙ\	ÊNÈJNÂˆ›Þœ]Y\žTÙ[XÝÜŠ	ÖÙ]KXOHœØ]™H—IÊK˜Y]™[\Ý[™\Š	ØÛXÚÉË\Þ[˜È

HOˆÈ\ÙÊ	Ñ˜]Ú[™ÈHš[8 )‰ÊNÈ\ÙÊØ]™S\ÙÊ]ØZ]Ø]™Tš[
]ØZ]š[[
][JKš[˜[YJ][JJJJNÈJNÂˆ›Þœ]Y\žTÙ[XÝÜŠ	ÖÙ]KXOH›Ü[ˆ—IÊK˜Y]™[\Ý[™\Š	ØÛXÚÉË

HOˆÜ[\˜Ú]™J][KšY
JNÂˆ›ÞšY[ˆH˜[ÙNÈ™\]Y\Ý[š[X][Û‘œ˜[YJ

HOˆ›Þ˜Û\ÜÓ\Ý˜Y
	ÛÛ‰ÊJNÂŸB™[˜Ý[ÛˆYQš[Y

HÈÛÛœÝ›ÞHØÝ[Y[™Ù][[Y[žRY
	Ùš[Y	ÊNÈYˆ
X›Þ
H™]\›ŽÈ›Þ˜Û\ÜÓ\Ýœ™[[Ý™J	ÛÛ‰ÊNÈ›ÞšY[ˆHYNÈ›Þš[›™\’SH	ÉÎÈB‹ËÈKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKHH\˜Ú]™Kœ›ÝÜÙY˜ÛÛœÝT•ˆHÈÜ[Žˆ˜[ÙKXŽˆ	ÝÛÜ›	ËÙ\ˆ˜[ÙKÙ[ˆ[[Îˆ[Nˆ×K\ÞNˆ˜[ÙK›ÛÛNˆ[Ü[™\Žˆ[[™\ˆ×HNÂ™[˜Ý[ÛˆÙÙÛP\˜Ú]™J
HÈT•‹›Ü[ˆÈÛÜÙP\˜Ú]™J
HˆÜ[\˜Ú]™J
NÈB˜\Þ[˜È[˜Ý[ÛˆÜ[\˜Ú]™JÙ[Y›ÛÛJHÂˆÛÛœÝ›ÞHØÝ[Y[™Ù][[Y[žRY
	Ø\˜Ú]™IÊNÈYˆ
X›ÞÚ[ÜÚÊ
JH™]\›ŽÂˆYˆ
PT•‹›Ü[ŠHÈT•‹›Ü[™\ˆHØÝ[Y[˜XÝ]™Q[[Y[ÈËÈHYÙH™Z[™Ø[ˆ™H™Z]\ˆÛXÚÙY›ÜˆX˜™YÈÚ[HH\˜Ú]™H\ÈÜ[‚ˆT•‹š[™\HË‹‹™ØÝ[Y[˜›ÙK˜Ú[™[—K™š[\Š[Oˆ[OOH›Þ	‰ˆY[š[™\	‰ˆK×ŠÐÔ’TÕS_S’ßSTUJIË\Ý
[YÓ˜[YJJNÈT•‹š[™\™›Ü‘XXÚ
[OˆÈ[š[™\HYNÈJNÈBˆT•‹›Ü[ˆHYNÈ›ÞšY[ˆH˜[ÙNÈ™\]Y\Ý[š[X][Û‘œ˜[YJ

HOˆ›Þ˜Û\ÜÓ\Ý˜Y
	ÛÛ‰ÊJNÈØÝ[Y[˜›ÙK˜Û\ÜÓ\Ý˜Y
	Ø\˜Ú]š[™ÉÊNÂˆÛÛœÝ[H]ØZ]\˜Ð[

NÈYˆ
PT•‹›Ü[ŠH™]\›ŽÂˆYˆ
Ù[Y
HÈÛÛœÝ]H[™š[™
OˆšYOOHÙ[Y
H[’][\Ê
K™š[™
OˆšYOOHÙ[Y
NÈYˆ
]
HÈT•‹XˆH]\NÈYˆ
Z]šÙ\
HT•‹šÙ\H˜[ÙNÈHBˆ™[™\\˜Ú]™JÙ[Y[›ÛÛJNÂŸB™[˜Ý[ÛˆÛÜÙP\˜Ú]™J
HÈÛÛœÝ›ÞHØÝ[Y[™Ù][[Y[žRY
	Ø\˜Ú]™IÊNÈT•‹›Ü[ˆH˜[ÙNÈT•‹œÙ[H[ÈT•‹ž›ÛÛHH[ÈT•‹œHH×NÈYˆ
T•‹š[ÊHÈT•‹š[Ë™\ØÛÛ›™XÝ

NÈT•‹š[ÈH[ÈBˆYˆ
›Þ
HÈ›Þ˜Û\ÜÓ\Ýœ™[[Ý™J	ÛÛ‰Ë	Ù]Z[	ÊNÈ›ÞšY[ˆHYNÈ›Þš[›™\’SH	ÉÎÈHØÝ[Y[˜›ÙK˜Û\ÜÓ\Ýœ™[[Ý™J	Ø\˜Ú]š[™ÉÊNÂˆT•‹š[™\™›Ü‘XXÚ
[OˆÈ[š[™\H˜[ÙNÈJNÈT•‹š[™\H×NÂˆÛÛœÝÈHT•‹›Ü[™\ŽÈT•‹›Ü[™\ˆH[ÈYˆ
È	‰ˆË™›ØÝ\È	‰ˆØÝ[Y[˜ÛÛZ[œÊÊH	‰ˆÈOOHØÝ[Y[˜›ÙJHÈžHÈË™›ØÝ\ÊÈ™]™[ØÜ›ÛˆYHJNÈHØ]Ú
JHßHHBžHÈ™]È]]][Û“ØœÙ\™\Š

HOˆÈYˆ
T•‹›Ü[ˆ	‰ˆÚ[ÜÚÊ
JHÛÜÙP\˜Ú]™J
NÈJK›ØœÙ\™JØÝ[Y[˜›ÙKÈ]šX]\ÎˆYK]šX]Qš[\ŽˆÉØÛ\ÜÉ×HJNÈHØ]Ú
JHßHËÈØ[\žH[ÙHÛÜÙ\È]™[˜Ý[Ûˆ\˜Ú]™R][\Ê
HÈÛÛœÝ\ÝHT•‹XˆOOH	Ý[‰ÈÈ[’][\Ê
Hˆ
TË›\Ý×JK™š[\Š]Oˆ]\HOOH	ÝÛÜ›	ÊNÈ™]\›ˆ\Ý™š[\Š]OˆPT•‹šÙ\]šÙ\
NÈB˜\Þ[˜È[˜Ý[ÛˆZ[[XŠÝ‹]
HÈËÈH[X›˜Z[Z[YÝ˜ZYÚ[È]ÈØ[˜\Îˆ›È[XYÙHY™\ÜÙ\È
›ØŽˆÜˆÝ\Ú\ÙJKˆ]Ü˜ÈH[ÈËÈÚXÚHYÙH]ÚÝÜÈHYXÙHX^H›Ý[ÝÂˆžHÈÛÛœÝˆH]ØZ][X‘›ÜŠ]
NÈYˆ
ŠHÜ˜ÈH]ØZ]Ü™X]R[XYÙPš]X\
ŠNÈHØ]Ú
JHÈÜ˜ÈH[ÈBˆYˆ
\Ü˜ÊHÈžHÈÜ˜ÈH]ØZ]˜]Õ[XŠ]
NÈHØ]Ú
JHÈÜ˜ÈH[ÈHHËÈHXÝ\™H]Ú[›ÝXÛÙH\È˜]ÛˆYØZ[ˆœ›ÛHH™XÛÜ™ˆYˆ
\Ü˜ÈXÝ‹š\ÐÛÛ›™XÝY
HÈYˆ
Ü˜È	‰ˆÜ˜Ë˜ÛÜÙJHÜ˜Ë˜ÛÜÙJ
NÈ™]\›ŽÈBˆYˆ
Ý‹ÚYOOHÜ˜ËÚYÝ‹šZYÚOOHÜ˜ËšZYÚ
HÈÝ‹ÚYHÜ˜ËÚYÈÝ‹šZYÚHÜ˜ËšZYÚÈBˆÝ‹™Ù]ÛÛ^
	Ì™	ÊK™˜]Ò[XYÙJÜ˜Ë
NÈYˆ
Ü˜Ë˜ÛÜÙJHÜ˜Ë˜ÛÜÙJ
NÈÝ‹˜Û\ÜÓ\Ýœ™[[Ý™J	Û^žIÊNÂŸB˜\Þ[˜È[˜Ý[Ûˆ[X”]Y]YJ
HÈËÈ[X›˜Z[È\™HZ[YÛ™H]H[YK\È^HÛÛYH[ÈšY]ÂˆYˆ
T•‹˜\ÞJH™]\›ŽÈT•‹˜\ÞHHYNÂˆÚ[H
T•‹œK›[™Ý	‰ˆT•‹›Ü[ŠHÈÛÛœÝØÝ‹]HHT•‹œKœÚY

NÈYˆ
XÝ‹š\ÐÛÛ›™XÝYZ]
HÛÛ[YNÂˆžHÈ]ØZ]Z[[XŠÝ‹]
NÈHØ]Ú
JHßBˆ]ØZ]™]È›ÛZ\ÙJˆOˆÙ][Y[Ý]
‹
JNÈBˆT•‹˜\ÞHH˜[ÙNÂŸB™[˜Ý[Ûˆ™[™\\˜Ú]™JÙ[Y›ÛÛK›ØÝ\ÒY
HÂˆÛÛœÝ›ÞHØÝ[Y[™Ù][[Y[žRY
	Ø\˜Ú]™IÊNÈYˆ
X›ÞPT•‹›Ü[ŠH™]\›ŽÂˆT•‹œHH×NÈYˆ
T•‹š[ÊHÈT•‹š[Ë™\ØÛÛ›™XÝ

NÈT•‹š[ÈH[ÈBˆÛÛœÝ][\ÈH\˜Ú]™R][\Ê
K•ÈH
TË›\Ý×JK™š[\ŠHOˆK\HOOH	ÝÛÜ›	ÊK›[™Ý•H[’][\Ê
K›[™Ý[œÈHT•‹XˆOOH	Ý[‰ÎÂˆ›Þš[›™\’SH]ˆÛ\ÜÏH˜Z\˜Ú]™OÚ]ˆÛ\ÜÏHXœÈˆ›ÛOHX›\Ý]Ûˆ\OH˜]Ûˆˆ›ÛOHXˆˆ]K]XHÛÜ›ˆ\šXK\Ù[XÝYH‰È][œßH•ÛÜ›ÈÜ[‰Û•ßOÜÜ[Ø]Û]Ûˆ\OH˜]Ûˆˆ›ÛOHXˆˆ]K]XH[ˆˆ\šXK\Ù[XÝYH‰Ý[œßH‘]™\žH[ˆÜ[‰Û•OÜÜ[Ø]ÛÙ]‚ˆX™[Û\ÜÏHšÙˆ[œ]\OH˜ÚXÚØ›Þˆ	ÐT•‹šÙ\È	ØÚXÚÙY	Èˆ	ÉßOˆÙ\Û›OÛX™[]Ûˆ\OH˜]ÛˆˆÛ\ÜÏH˜ÛÜÙHÛÜÙOØ]ÛÙ]‚ˆÛ\ÜÏH››ÝH‰Ý[œÈÈ	Ñ]™\žH[ˆÛÜ›ÈH™\Ü\ÈXYH\ÈHš[ÙˆH[‹ˆÜ[ˆÛ™HÈÙYH]ÚÛNÈÛXÚÈ]YØZ[ˆÈÙYH]][Ú^™K‰Èˆ	Ñ]™\žHÛÜ›\Èš[Y\™H\È][™ÎˆHÛÜ›\È][™YHÝš\Ùˆ[ÛY[Èœ›ÛH]ÈY™K]ÈÝ]\È[™]È\›‹ˆÜ[ˆÛ™HÈÙYH]ÚÛNÈÛXÚÈ]YØZ[ˆÈÙYH]][Ú^™K‰ßHÙ\š[ÈÝ^NÈH™\ÝÚ]™HØ^HÈ™]Ù\ˆÛ™\ÈY\ˆ	Ô’S•ÐTÕßHÛÜ›È[™	Ô’S•ÐTÕH™\ÜËˆ^H]™H[ˆ\Èœ›ÝÜÙ\ŽˆØ]™HHÛ™\È[ÝHØ[\È‘ËÜ‚ˆ]ˆÛ\ÜÏH™ÜšY	Ý[œÈÈ	È[œÉÈˆ	ÉßH‰Ú][\Ë›[™ÝÈ][\Ë›X\
]OˆÂˆ™]\›ˆ]Ûˆ\OH˜]ÛˆˆÛ\ÜÏH˜ZIÚ]šÙ\È	ÈÙ\	Èˆ	ÉßHˆ]KZYH‰Ù\ØÊ]šY
_HØ[˜\ÈÛ\ÜÏH^žHˆÚYH‰Ý[œÈÈˆÍŒHˆZYÚH‰Ý[œÈÈÌˆLHˆ\šXKZY[HYHØØ[˜\ÏÜ[ˆÛ\ÜÏH›ˆ‰Ú][S˜[YJ]
_OÜÜ[Ü[ˆÛ\ÜÏH›È‰Ù\ØÊ]\HOOH	ÝÛÜ›	ÈÈ“Ý]
]œ™XÊHˆ	Ú]œ™XËÛÛˆHÛÛ‰Ú]œ™XËœ\È0­È	Ú]œ™XËœ\H[ˆ\ˆ	ÉßH0­È	Ú]œ™XË˜›XÚÈH›ÚY	Ú]œ™XËšX]È0­È	Ú]œ™XËšX]HÛÜ›ˆÝ]ˆ	ÉßX
_OÜÜ[‰Ú]šÙ\È	ÏHÛ\ÜÏHœÝ\ˆˆ]OH’Ù\’Ù\ÚO‰Èˆ	ÉßOØ]Û˜ÈJKš›Ú[Š	ÉÊBˆˆÛ\ÜÏH™[\H‰ÐT•‹šÙ\È	Ó›Ý[™ÈÙ\Y]‰Èˆ][œÈÈ	Ó›ÈÛÜ›\È[™Y\™HY]‰Èˆ	ÕHš\œÝ™\ÜÛÛY\ÈY\ˆÛÜ›	È
ÈYŠÑ‘Ë™XØYJH
È	Ë‰ßOÜ˜OÙ]‚ˆ]ˆÛ\ÜÏH™]ˆY[Ù]]ˆÛ\ÜÏHž›ÛÛHˆY[Ù]˜Âˆ›Þœ]Y\žTÙ[XÝÜŠ	Ë˜ÛÜÙIÊK˜Y]™[\Ý[™\Š	ØÛXÚÉËÛÜÙP\˜Ú]™JNÂˆ›Þœ]Y\žTÙ[XÝÜ[
	ÖÙ]K]X—IÊK™›Ü‘XXÚ
ˆOˆ‹˜Y]™[\Ý[™\Š	ØÛXÚÉË

HOˆÈT•‹XˆH‹™]\Ù]XŽÈ™[™\\˜Ú]™J
NÈJJNÂˆ›Þœ]Y\žTÙ[XÝÜŠ	ËšÙˆ[œ]	ÊK˜Y]™[\Ý[™\Š	ØÚ[™ÙIËHOˆÈT•‹šÙ\HK\™Ù]˜ÚXÚÙYÈ™[™\\˜Ú]™J
NÈ›Þœ]Y\žTÙ[XÝÜŠ	ËšÙˆ[œ]	ÊK™›ØÝ\ÊÈ™]™[ØÜ›ÛˆYHJNÈJNÂˆÛÛœÝžRYH™]ÈX\
][\Ë›X\
]OˆÚ]šY]JJNÂˆ›Þœ]Y\žTÙ[XÝÜ[
	Ë˜ZIÊK™›Ü‘XXÚ
ˆOˆ‹˜Y]™[\Ý[™\Š	ØÛXÚÉË

HOˆÚÝÑ]Z[
‹™]\Ù]šY
JJNÂˆÛÛœÝÈHË‹‹˜›Þœ]Y\žTÙ[XÝÜ[
	Ë˜ZHØ[˜\Ë	ÊWNÂˆYˆ
Ë›[™Ý
HÈT•‹š[ÈH™]È[\œÙXÝ[Û“ØœÙ\™\Š\ÈOˆÈ›Üˆ
ÛÛœÝHÙˆ\ÊHYˆ
Kš\Ò[\œÙXÝ[™ÊHÈT•‹š[Ë[›ØœÙ\™JK\™Ù]
NÈT•‹œKœ\Ú
ÙK\™Ù]žRY™Ù]
K\™Ù]œ\™[›ÙK™]\Ù]šY
WJNÈH[X”]Y]YJ
NÈKÈ›ÛÝˆ›Þ›ÛÝX\™Ú[Žˆ	Í	ÈJNÂˆË™›Ü‘XXÚ
ÝˆOˆT•‹š[Ë›ØœÙ\™JÝŠJNÈBˆYˆ
Ù[Y
HÈÚÝÑ]Z[
Ù[Y›ÛÛJNÈ™]\›ŽÈBˆÛÛœÝˆH
›ØÝ\ÒY	‰ˆË‹‹˜›Þœ]Y\žTÙ[XÝÜ[
	Ë˜ZIÊWK™š[™
ˆOˆ‹™]\Ù]šYOOH›ØÝ\ÒY
JH›Þœ]Y\žTÙ[XÝÜŠ	ÖÙ]K]X—VØ\šXK\Ù[XÝYHYH—IÊNÂˆYˆ
ŠHÈ‹™›ØÝ\ÊÈ™]™[ØÜ›ÛˆY›ØÝ\ÒYJNÈBŸB˜\Þ[˜È[˜Ý[ÛˆÚÝÑ]Z[
Y›ÛÛK›ØÝ\ÐJHÂˆÛÛœÝ›ÞHØÝ[Y[™Ù][[Y[žRY
	Ø\˜Ú]™IÊK]H›Þ	‰ˆ›Þœ]Y\žTÙ[XÝÜŠ	Ë™]	ÊNÈYˆ
Y]
H™]\›ŽÂˆÛÛœÝ][\ÈH\˜Ú]™R][\Ê
KÈH][\Ë™š[™[™^
]Oˆ]šYOOHY
K]H][\ÖÚ×NÈYˆ
Z]
H™]\›ŽÂˆT•‹œÙ[HYÈ]šY[ˆH˜[ÙNÈ›Þ˜Û\ÜÓ\Ý˜Y
	Ù]Z[	ÊNÂˆ›Þœ]Y\žTÙ[XÝÜ[
	Ë˜Z››ÝK™ÜšY	ÊK™›Ü‘XXÚ
HOˆÈKš[™\HYNÈJNÈËÈÚ]Y\È[™\ˆH]Z[Ø[››Ý™H™XXÚYˆ]š[›™\’SH]ˆÛ\ÜÏH™ˆ]ˆÛ\ÜÏHœXÈÜ[ˆÛ\ÜÏHØZ]‘˜]Ú[™ÈHš[8 )ÜÜ[Ù]]ˆÛ\ÜÏHœÚYH‰Ú][S˜[YJ]
_OØÜ[ˆÛ\ÜÏH›È‰Ù\ØÊ]\HOOH	ÝÛÜ›	ÈÈ]œ™XËœÝÜžH]œ™XË]Hˆ]œ™XË™\™XÝ	ÉÊ_OÜÜ[Ü[ˆÛ\ÜÏH™‰Ù\ØÊ]œ™XËœÝ[\]œ™XË˜]	ÉÊ_OÜÜ[‰Ú]\HOOH	ÝÛÜ›	È	‰ˆ]œ™XË˜ÛÙHÈÜ[ˆÛ\ÜÏH™•ÛÜ›ÛÙH	Ù\ØÊ]œ™XË˜ÛÙKœÜ]
	Ë‰ÊVÌKÕ\\Ø\ÙJ
J_OÜÜ[˜ˆ	ÉßBˆ]Ûˆ\OH˜]Ûˆˆ]KXOHšÙY\ˆ\šXK\™\ÜÙYH‰ÈHZ]šÙ\H‰Ú]šÙ\È	ÒÙ\	Èˆ	ÒÙY\	ßOØ]Û]Ûˆ\OH˜]Ûˆˆ]KXOH™[‘[Ú^™OØ]Û]Ûˆ\OH˜]Ûˆˆ]KXOHœØ]™H”Ø]™H‘ÏØ]Û‰Ú]\HOOH	ÝÛÜ›	È	‰ˆ]œ™XË˜ÛÙHÈ	Ï]Ûˆ\OH˜]Ûˆˆ]KXOHœ™\^H”™\^OØ]Û]Ûˆ\OH˜]Ûˆˆ]KXOHœÚ\™H”Ú\™OØ]Û]Ûˆ\OH˜]Ûˆˆ]KXOH˜ÛÜHÛÜHÛÙOØ]Û‰Èˆ	ÉßIÚ]\HOOH	ÝÛÜ›	È	‰ˆ™\’\Ê]œ™XËÚY
HÈ	Ï]Ûˆ\OH˜]Ûˆˆ]KXOHœ™\^]ˆˆ]OH’]ÈY™H[ˆH™]ÈÙXÛÛ™Ë\ÈÛˆHØÜ™Y[ˆ]]È[™\ÈHšY[È”Ø]™H™\^OØ]Û‰Èˆ	ÉßIÚ]\HOOH	ÝÛÜ›	È	‰ˆÛ\\Ê]œ™XËÚY
HÈ	Ï]Ûˆ\OH˜]Ûˆˆ]KXOH˜Û\”Ø]™HÛ\Ø]Û‰Èˆ	ÉßO]Ûˆ\OH˜]Ûˆˆ]KXOH™[‘[]OØ]Û‚ˆÜ[ˆÛ\ÜÏH›\ÙÈˆ\šXK[]™OHœÛ]HÜÜ[Ü[ˆÛ\ÜÏH›˜]ˆ]Ûˆ\OH˜]Ûˆˆ]KXOHœ™]ˆˆ	ÚÈHÈ	Ù\ØX›Y	Èˆ	ÉßH\šXK[X™[H“™]Ù\ˆ¸¡¤Ø]Û]Ûˆ\OH˜]Ûˆˆ]KXOH›™^ˆ	ÚÈH][\Ë›[™ÝHHÈ	Ù\ØX›Y	Èˆ	ÉßH\šXK[X™[H“Û\ˆ¸¡¤Ø]ÛÜÜ[]Ûˆ\OH˜]Ûˆˆ]KXOH˜˜XÚÈ˜XÚÈÈ[Ø]ÛÙ]Ù]˜ÂˆÛÛœÝ\ÙÈHOˆÈÛÛœÝHH]œ]Y\žTÙ[XÝÜŠ	Ë›\ÙÉÊNÈYˆ
JHK^ÛÛ[HÈNÂˆÛÛœÝˆHHOˆ]œ]Y\žTÙ[XÝÜŠÙ]KXOH‰Ø_H—X
NÂˆÈÛÛœÝˆH›ØÝ\ÐH	‰ˆŠ›ØÝ\ÐJNÈ
ˆ	‰ˆY‹™\ØX›YÈˆˆŠ	Ø˜XÚÉÊJK™›ØÝ\ÊÈ™]™[ØÜ›ÛˆYHJNÈBˆŠ	Ø˜XÚÉÊK˜Y]™[\Ý[™\Š	ØÛXÚÉË

HOˆÈ]šY[ˆHYNÈ›Þ˜Û\ÜÓ\Ýœ™[[Ý™J	Ù]Z[	ÊNÈT•‹œÙ[H[È™[™\\˜Ú]™J[˜[ÙKY
NÈJNÂˆŠ	Ü™]‰ÊK˜Y]™[\Ý[™\Š	ØÛXÚÉË

HOˆÈˆ	‰ˆÚÝÑ]Z[
][\ÖÚÈHWKšY˜[ÙK	Ü™]‰ÊJNÂˆŠ	Û™^	ÊK˜Y]™[\Ý[™\Š	ØÛXÚÉË

HOˆÈ][\Ë›[™ÝHH	‰ˆÚÝÑ]Z[
][\ÖÚÈ
ÈWKšY˜[ÙK	Û™^	ÊJNÂˆŠ	Ù[	ÊK˜Y]™[\Ý[™\Š	ØÛXÚÉË

HOˆÜ[–›ÛÛJ]
JNÂˆYˆ
Š	Ü™\^IÊJHŠ	Ü™\^IÊK˜Y]™[\Ý[™\Š	ØÛXÚÉË

HOˆÈ^UÛÜ›
]œ™XË˜ÛÙJNÈJNÈËÈHØ[YHÛÜ›YØZ[‚ˆYˆ
Š	ØÛÜIÊJHŠ	ØÛÜIÊK˜Y]™[\Ý[™\Š	ØÛXÚÉË\Þ[˜È

HOˆÈÛÛœÝÈH]œ™XË˜ÛÙNÂˆYˆ
]ØZ]ÛÜU^
ÊJH\ÙÊ	ÐÛÙHÛÜYYˆ\ÝH][È^K[ˆHX›Ý]ÈÙYH\ÈÛÜ›YØZ[‰ÊNÈ[ÙHÈ\ÙÊ	ÉÊNÈÚÝÐÛÜJ]
JÊNÈHJNÂˆYˆ
Š	ÜÚ\™IÊJHŠ	ÜÚ\™IÊK˜Y]™[\Ý[™\Š	ØÛXÚÉË

HOˆÚ\™UÛÜ›
]œ™XË˜ÛÙK\ÙËÚÝÐÛÜJ]
JJNÂˆYˆ
Š	Ü™\^]‰ÊJHŠ	Ü™\^]‰ÊK˜Y]™[\Ý[™\Š	ØÛXÚÉË

HOˆØ]™T™\^J]œ™XËÚY\ÙÊJNÂˆYˆ
Š	ØÛ\	ÊJHŠ	ØÛ\	ÊK˜Y]™[\Ý[™\Š	ØÛXÚÉË\Þ[˜È

HOˆÈ\ÙÊ	Ñš[š\Ú[™ÈHÛ\8 )‰ÊNÈÛÛœÝÈH]ØZ]Û\›ÜŠ]œ™XËÚY
NÈ\ÙÊÈÈÛ\\ÙÊ]ØZ]Ø]™P›ØŠË˜›Ø‹Û\˜[YJÊJJHˆ	ÕHÛ\\ÈÛÛ™IÊNÈJNÂˆŠ	ÚÙY\	ÊK˜Y]™[\Ý[™\Š	ØÛXÚÉË\Þ[˜ÈHOˆÈÛÛœÝHK˜Ý\œ™[\™Ù]ÈYˆ
™\ØX›Y
H™]\›ŽÈ™\ØX›YHYNÂˆYˆ
]š\X[
HÈ\ÙÊ	Ñš[[™È]8 )‰ÊNÈÛÛœÝ™X[H]ØZ]š[U[Š]œ™XË]ØZ][’[XYÙ\Ê]œ™XËLLŠKYJNÈ™\ØX›YH˜[ÙNÈ\ÙÊ	ÒÙ\ˆ]Ý^\È[ˆH\˜Ú]™IÊNÈÚÝÑ]Z[
™X[šY˜[ÙK	ÚÙY\	ÊNÈ™]\›ŽÈBˆ]ØZ]Ù]Ù\
]Z]šÙ\
NÈœÙ]]šX]J	Ø\šXK\™\ÜÙY	ËÝš[™Ê]šÙ\
JNÈ^ÛÛ[H]šÙ\È	ÒÙ\	Èˆ	ÒÙY\	ÎÈ™\ØX›YH˜[ÙNÈ\ÙÊ]šÙ\È	ÒÙ\ˆ]Ý^\È[ˆH\˜Ú]™IÈˆ	Ó›ÈÛ™Ù\ˆÙ\	ÊNÈJNÂˆŠ	ÜØ]™IÊK˜Y]™[\Ý[™\Š	ØÛXÚÉË\Þ[˜È

HOˆÈ\ÙÊ	Ñ˜]Ú[™ÈHš[8 )‰ÊNÈ\ÙÊØ]™S\ÙÊ]ØZ]Ø]™Tš[
]ØZ]š[[
]
Kš[˜[YJ]
JJJNÈJNÂˆŠ	Ù[	ÊK˜Y]™[\Ý[™\Š	ØÛXÚÉË\Þ[˜ÈHOˆÂˆYˆ
K˜Ý\œ™[\™Ù]™]\Ù]œÝ\™HOOH	ÌIÊHÈK˜Ý\œ™[\™Ù]™]\Ù]œÝ\™HH	ÌIÎÈK˜Ý\œ™[\™Ù]^ÛÛ[H	Ñ[]H]ÈÛXÚÈYØZ[‰ÎÈ\ÙÊ	ÉÊNÈÙ][Y[Ý]


HOˆÈÛÛœÝˆHŠ	Ù[	ÊNÈYˆ
ŠHÈ‹™]\Ù]œÝ\™HH	ÉÎÈ‹^ÛÛ[H	Ñ[]IÎÈHK
NÈ™]\›ŽÈBˆ]ØZ]›Ü™Ù]][J]
NÈÛÛœÝ™\ÝH\˜Ú]™R][\Ê
NÈ\ÙÊ	Ñ[]Y	ÊNÂˆYˆ
™\Ý›[™Ý
HÚÝÑ]Z[
™\ÝÓX]›Z[ŠË™\Ý›[™ÝHJWKšY˜[ÙK	Ø˜XÚÉÊNÈ[ÙHÈ]šY[ˆHYNÈ›Þ˜Û\ÜÓ\Ýœ™[[Ý™J	Ù]Z[	ÊNÈ™[™\\˜Ú]™J
NÈHJNÂˆÛÛœÝÈH]ØZ]š[[
]]\HOOH	ÝÛÜ›	ÈÈMˆ™Y“^[Ý]

HOOH	Û[™	ÈÈŒˆM
NÈYˆ
T•‹œÙ[OOHYY]š\ÐÛÛ›™XÝY
H™]\›ŽÂˆÛÛœÝXÈH]œ]Y\žTÙ[XÝÜŠ	ËœXÉÊNÈXËš[›™\’SH	ÉÎÈË˜Û\ÜÓ˜[YHH	Ù[	È
È
ËÚYˆËšZYÚÈ	ÈÚYIÈˆ	ÉÊNÈË]HH	Ñ[Ú^™IÎÈXË˜\[™Ú[
ÊNÂˆË˜Y]™[\Ý[™\Š	ØÛXÚÉË

HOˆÜ[–›ÛÛJ]
JNÂˆYˆ
›ÛÛJHÜ[–›ÛÛJ]
NÂŸB™[˜Ý[ÛˆÛÜÙV›ÛÛJ
HÈÛÛœÝ›ÞHØÝ[Y[™Ù][[Y[žRY
	Ø\˜Ú]™IÊKˆH›Þ	‰ˆ›Þœ]Y\žTÙ[XÝÜŠ	Ëž›ÛÛIÊK]H›Þ	‰ˆ›Þœ]Y\žTÙ[XÝÜŠ	Ë™]	ÊNÂˆT•‹ž›ÛÛHH[ÈYˆ
ŠHÈ‹šY[ˆHYNÈ‹š[›™\’SH	ÉÎÈHYˆ
]
HÈ]š[™\H˜[ÙNÈÛÛœÝˆH]œ]Y\žTÙ[XÝÜŠ	ÖÙ]KXOH™[—IÊNÈYˆ
ŠH‹™›ØÝ\ÊÈ™]™[ØÜ›ÛˆYHJNÈHB˜\Þ[˜È[˜Ý[ÛˆÜ[–›ÛÛJ]
HÈËÈHš[][Ú^™KÈ™XY]™\žH[™HÙˆ]ˆÛÛœÝ›ÞHØÝ[Y[™Ù][[Y[žRY
	Ø\˜Ú]™IÊKˆH›Þ	‰ˆ›Þœ]Y\žTÙ[XÝÜŠ	Ëž›ÛÛIÊK]H›Þ	‰ˆ›Þœ]Y\žTÙ[XÝÜŠ	Ë™]	ÊNÈYˆ
^ŠH™]\›ŽÂˆT•‹ž›ÛÛHH]šYÈ‹šY[ˆH˜[ÙNÈYˆ
]
H]š[™\HYNÂˆ‹š[›™\’SH	Ï]Ûˆ\OH˜]ÛˆˆÛ\ÜÏHžžˆ\šXK[X™[HÛÜÙH[Ú^™HÛÜÙOØ]ÛÜ[ˆÛ\ÜÏHØZ]‘˜]Ú[™ÈHš[][Ú^™x )ÜÜ[‰ÎÂˆ‹œ]Y\žTÙ[XÝÜŠ	Ëžž	ÊK˜Y]™[\Ý[™\Š	ØÛXÚÉËÛÜÙV›ÛÛJNÈ‹œ]Y\žTÙ[XÝÜŠ	Ëžž	ÊK™›ØÝ\ÊÈ™]™[ØÜ›ÛˆYHJNÂˆÛÛœÝÈHX]›Z[Š[›™\•ÚYHÌ‹MŒ
KHX]›Z[Š‹]šXÙT^[˜][ÈJKH™Y“^[Ý]

NÂˆÛÛœÝÈH]ØZ]š[[
]X]œ›Ý[™
X]›Z[Š]\HOOH	ÝÛÜ›	ÈÈˆÌŒÈ
ˆ
JK
NÈYˆ
T•‹ž›ÛÛHOOH]šY^‹š\ÐÛÛ›™XÝY
H™]\›ŽÂˆÛÛœÝÈH‹œ]Y\žTÙ[XÝÜŠ	ËØZ]	ÊNÈYˆ
ÊHËœ™[[Ý™J
NÈË˜Û\ÜÓ˜[YHH	Þ˜ÉÎÈËœÝ[KÚYHX]œ›Ý[™
ÊH
È	Ü	ÎÈ‹˜\[™Ú[
ÊNÈ‹œØÜ›ÛÜHÂˆË˜Y]™[\Ý[™\Š	ØÛXÚÉËÛÜÙV›ÛÛJNÂŸB˜Y]™[\Ý[™\Š	ÚÙ^YÝÛ‰ËHOˆÈËÈH\˜Ú]™HÙY\ÈHÙ^\ÈÚ[H]\ÈÜ[‚ˆYˆ
PT•‹›Ü[ŠH™]\›ŽÂˆÛÛœÝ›ÞHØÝ[Y[™Ù][[Y[žRY
	Ø\˜Ú]™IÊNÂˆYˆ
KšÙ^HOOH	Ñ\ØØ\IÊHÈKœÝÜ[[YYX]T›ÜYØ][ÛŠ
NÂˆYˆ
T•‹ž›ÛÛH
›Þ	‰ˆ›Þœ]Y\žTÙ[XÝÜŠ	Ëž›ÛÛN››Ý
ÚY[—JIÊJJHÈÛÜÙV›ÛÛJ
NÈ™]\›ŽÈBˆYˆ
›Þ	‰ˆ›Þ˜Û\ÜÓ\Ý˜ÛÛZ[œÊ	Ù]Z[	ÊJHÈÛÛœÝˆH›Þœ]Y\žTÙ[XÝÜŠ	ÖÙ]KXOH˜˜XÚÈ—IÊNÈYˆ
ŠH‹˜ÛXÚÊ
NÈH[ÙHÛÜÙP\˜Ú]™J
NÈ™]\›ŽÈBˆYˆ

KšÙ^HOOH	Ð\œ›ÝÓY	ÈKšÙ^HOOH	Ð\œ›ÝÔšYÚ	ÊH	‰ˆPT•‹ž›ÛÛJHÈÛÛœÝˆHØÝ[Y[œ]Y\žTÙ[XÝÜŠØ\˜Ú]™H™]››Ý
ÚY[—JHÙ]KXOH‰ÙKšÙ^HOOH	Ð\œ›ÝÓY	ÈÈ	Ü™]‰Èˆ	Û™^	ßH—X
NÈYˆ
ˆ	‰ˆX‹™\ØX›Y
H‹˜ÛXÚÊ
NÈKœÝÜ[[YYX]T›ÜYØ][ÛŠ
NÈ™]\›ŽÈBˆYˆ
KšÙ^KÓÝÙ\Ø\ÙJ
HOOH	ØIÈ	‰ˆYK›Y]RÙ^H	‰ˆYK˜Ý›Ù^JHÈÛÜÙP\˜Ú]™J
NÈKœÝÜ[[YYX]T›ÜYØ][ÛŠ
NÈ™]\›ŽÈBˆYˆ
×–ÚÙ—IÚK\Ý
KšÙ^JJH™]\›ŽÈËÈØ[\žH[ÙH[™[ØÜ™Y[ˆÝ[[œÝÙ\‚ˆYˆ
YK›Y]RÙ^H	‰ˆYK˜Ý›Ù^H	‰ˆYK˜[Ù^JHKœÝÜ[[YYX]T›ÜYØ][ÛŠ
NÈËÈ
ØÜ›Û[™ËXˆ[™[\ˆÝ[ÛÜšÎˆ^H\™H›Ý\Ý[™\œÊBŸKYJNÂ‚‹ÊˆOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOBˆHPÕT‘HS‘TˆHTKˆ›ÝÈ[™[‹Ý˜ZYÚY\ˆHœ˜[YH\È˜]Û‹HÛÜHÙˆ]HÚ^™HÙˆHÝ[\\ÈÙ\ˆÛÈH\HØ[ˆ[ÝÈ[HHXÝ\™H\ÈÚ\™H]Ý[™Îˆ]\›œÈÈ[šÈÝ™\ˆ[HÜ›Ý[™›ØÚÈžH›ØÚË‚ˆOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOH
‹Â˜ÛÛœÝ“Ð‘HHÈÎˆ[ˆ[ˆ[ˆLYNKÎˆˆÍˆNÂ‹ÊˆOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOBˆHÓTˆœ›ÛHH[ÛY[H[X™\ˆ\ÈX›Ý]Èœ™XZËÙ[™HÙXÛÛ™ÈÙˆHØÜ™Y[ˆ\™H™XÛÜ™YˆHÛÜ›\È]\Âˆ˜]Û‹œ˜[YYMŽŽH
ÜˆNŒMˆÛˆH[ØÜ™Y[ŠKÚ]]È]\È[™HÜ™Y]Ý™\ˆ][™HØÛÜ™HÚ[ˆHÛÝ[™\ÂˆÛ‹ˆÙ\[ˆ\ÈYÙHÛ›H
H\Ý™]ÊNÈHÛÜ›	ÜÈXØÛÝ[[™]Èš[[ˆH\˜Ú]™KØ[ˆØ]™H]\ÈšY[Ë‚ˆOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOH
‹Â˜ÛÛœÝÑTÔÒSÓ—ÒQHX]œ˜[™ÛJ
KÔÝš[™ÊÍŠKœÛXÙJ‹
NÂ˜ÛÛœÝÓTHÈÛŽˆPÑ‘Ë˜Ø[Xˆ	‰ˆK™Ù]
	ØÛ\ÉÊHOOH	Ì	È	‰ˆ
SUHK™Ù]
	ØÛ\ÉÊHOOH	ÌIÊH	‰ˆ\[ÙˆYYXT™XÛÜ™\ˆOOH	Ù[˜Ý[Û‰È	‰ˆHRSØ[˜\Ñ[[Y[œ›ÝÝ\K˜Ø\\™TÝ™X[Kˆ[J	ØÛ\ÙXÉËLŠK™XÎˆ[\Ýˆ×KÑQTˆNÂ™[˜Ý[ÛˆÛ\Z[YJ]Y[ÊHÂˆÛÛœÝÈH]Y[ÈÈÉÝšY[ËÛ\ØÛÙXÜÏX]˜ÌK‘LQ‹\KŒ‰Ë	ÝšY[ËÛ\	Ë	ÝšY[ËÝÙX›NØÛÙXÜÏ]œKÜ\ÉË	ÝšY[ËÝÙX›NØÛÙXÜÏ]œÜ\ÉË	ÝšY[ËÝÙX›I×BˆˆÉÝšY[ËÛ\ØÛÙXÜÏX]˜ÌK‘LQ‰Ë	ÝšY[ËÛ\	Ë	ÝšY[ËÝÙX›NØÛÙXÜÏ]œIË	ÝšY[ËÝÙX›NØÛÙXÜÏ]œ	Ë	ÝšY[ËÝÙX›I×NÂˆ›Üˆ
ÛÛœÝÙˆÊHÈžHÈYˆ
YYXT™XÛÜ™\‹š\Õ\TÝ\ÜY

JH™]\›ˆÈHØ]Ú
JHßHH™]\›ˆ	ÉÎÂŸB™[˜Ý[ÛˆÛ\Ý\
Ú\™JHÂˆYˆ
PÓT›ÛˆÓTœ™XÈUÈÚ[ÜÚÊ
HÚ[™ÝË—×Ó”ˆ
Ñ‘Ë™™ˆˆ	‰ˆÚ[U

HÑ‘Ë™™ŠHØÝ[Y[š\ÚXš[]TÝ]HOOH	ÚY[‰ÊH™]\›ŽÂˆžHÂˆÛÛœÝ[™H[›™\•ÚYH[›™\’ZYÚÛX[HX]ÚYYXJ	ÊÚ[\ŽˆÛØ\œÙJIÊK›X]Ú\ËHÛX[ÈMŒˆLŽÈHÛX[ÈMˆÌŒœˆHÛX[ÈÙMˆˆYMŽÈËÈ
YÚ\ˆÛˆHÛ™JBˆÛÛœÝÈHØÝ[Y[˜Ü™X]Q[[Y[
	ØØ[˜\ÉÊNÈËÚYH[™ÈˆÎÈËšZYÚH[™ÈÈˆÂˆÛÛœÝHË™Ù]ÛÛ^
	Ì™	ËÈ[Nˆ˜[ÙHJKœÈHË˜Ø\\™TÝ™X[JÛX[ÈˆÌ
K]HÕQÑK˜]Y[Õ˜XÚÈÈÕQÑK˜]Y[Õ˜XÚÊ
Hˆ[ÂˆÛÛœÝÝ™X[HH]È™]ÈYYXTÝ™X[JË‹‹œË™Ù]šY[Õ˜XÚÜÊ
K]JHˆœÎÂˆ]Z[YHHÛ\Z[YJHX]
K\ˆH[ÂˆžHÈ\ˆH™]ÈYYXT™XÛÜ™\ŠÝ™X[KZ[YHÈÈZ[YU\NˆZ[YKšY[Ðš]Ô\”ÙXÛÛ™ˆœˆHˆÈšY[Ðš]Ô\”ÙXÛÛ™ˆœˆJNÈBˆØ]Ú
JHÈYˆ
X]
H›ÝÈNÈZ[YHHÛ\Z[YJ˜[ÙJNÈ\ˆH™]ÈYYXT™XÛÜ™\ŠœËZ[YHÈÈZ[YU\NˆZ[YKšY[Ðš]Ô\”ÙXÛÛ™ˆœˆHˆßJNÈHËÈ
›ÈÛÝ[™˜]\ˆ[ˆ›ÈÛ\
BˆÛÛœÝˆHÓTœ™XÈHÈË\‹œËÚ[šÜÎˆ×Kˆ\™›Ü›X[˜ÙK››ÝÊ
K\ÝˆÚYˆËZYŽˆË›‹Ú\™NˆÚ\™H	ÉË™\^NˆHUËœœ[‹Z[YNˆ\‹›Z[YU\HZ[YH	ÝšY[ËÝÙX›IË›Üˆ˜[ÙKÛ™Nˆ[NÂˆ‹™Û™HH™]È›ÛZ\ÙJ™\ÈOˆÈ\‹›ÛœÝÜH

HOˆÈžHÈœË™Ù]šY[Õ˜XÚÜÊ
K™›Ü‘XXÚ
OˆœÝÜ

JNÈHØ]Ú
JHßHYˆ
ÓTœ™XÈOOHŠHÓTœ™XÈH[ÂˆYˆ
\‹™›Ü	‰ˆ‹˜Ú[šÜË›[™Ý
HÈÓT›\Ýœ\Ú
ÈÚYˆ‹ÚYŽˆ‹›‹Ú\™Nˆ‹Ú\™K™\^Nˆ‹œ™\^K›ØŽˆ™]È›ØŠ‹˜Ú[šÜËÈ\Nˆ‹›Z[YKœÜ]
	ÎÉÊVÌHJK^ˆÛ\Ë\Ý
‹›Z[YJHÈ	Û\	Èˆ	ÝÙX›IÈJNÂˆÚ[H
ÓT›\Ý›[™ÝˆÓT’ÑQT
HÓT›\ÝœÚY

NÈBˆ™\Ê
NÈNÈJNÂˆ\‹›Û™]X]˜Z[X›HHHOˆÈYˆ
K™]H	‰ˆK™]KœÚ^™JH‹˜Ú[šÜËœ\Ú
K™]JNÈNÂˆ\‹›Û™\œ›ÜˆH

HOˆÈ‹™›ÜHYNÈžHÈ\‹œÝÜ

NÈHØ]Ú
JHßHNÂˆ‘›ÛÊ
NÈÛ\Z[
‹YJNÈ\‹œÝ\
L
NÂˆÙ][Y[Ý]


HOˆÈYˆ
\‹œÝ]HOOH	Ú[˜XÝ]™IÊHžHÈ\‹œÝÜ

NÈHØ]Ú
JHßHKÓT‘
ˆL
NÂˆHØ]Ú
JHÈÓTœ™XÈH[ÈÛÛœÛÛKØ\›Š	ØÛ\	ËJNÈBŸB™[˜Ý[ÛˆÛ\›Ü

HÈÛÛœÝˆHÓTœ™XÎÈYˆ
\ŠH™]\›ŽÈ‹™›ÜHYNÈžHÈYˆ
‹›\‹œÝ]HOOH	Ú[˜XÝ]™IÊH‹›\‹œÝÜ

NÈHØ]Ú
JHßHHËÈ
]ÛÜÙY\™Y›Ü™H]œ›ÚÙNˆ›Èœ™XZÛÝ]ÈÙY\
B˜ÛÛœÝÛ\\ÈHÚYOˆH]ÚY	‰ˆ
ÓT›\ÝœÛÛYJÈOˆËÚYOOHÚY
HHJÓTœ™XÈ	‰ˆÓTœ™XËÚYOOHÚY	‰ˆPÓTœ™XË™›Ü
JNÂ˜\Þ[˜È[˜Ý[ÛˆÛ\›ÜŠÚY
HÈÛÛœÝˆHÓTœ™XÎÈYˆ
ˆ	‰ˆ‹ÚYOOHÚY
H]ØZ]›ÛZ\ÙKœ˜XÙJÜ‹™Û™K™]È›ÛZ\ÙJ™\ÈOˆÙ][Y[Ý]
™\Ë
ÓT‘
ÈŠH
ˆL
JWJNÈÛÛœÝÈHÓT›\Ý™š[\ŠÈOˆËÚYOOHÚY
NÈ™]\›ˆÖÚË›[™ÝHWH[ÈB˜ÛÛœÝÛ\˜[YHHÈOˆ[™\˜X›K]ÛÜ›Ë]ÛÜ›IÜYŠË›Š_KXœ™XZÛÝ]	ØËœ™\^HÈ	Ë\™\^IÈˆ	ÉßK‰ØË™^XÂ˜ÛÛœÝÛ\\ÙÈHˆOˆˆOOH	ÜØ]™Y	ÈÈ	ÔØ]™YˆÙ[™HÙXÛÛ™ÈÙˆHœ™XZÛÝ]	ÈˆØ]™S\ÙÊŠNÂ™[˜Ý[ÛˆÛ\œ˜[YJ
HÈÛÛœÝˆHÓTœ™XÎÈYˆ
ˆ	‰ˆ\‹™›Ü
HÛ\Z[
‹˜[ÙJNÈHËÈÝ˜ZYÚY\ˆHÛÜ›\È˜]Û‚™[˜Ý[ÛˆÛ\Z[
‹›[šÊHÂˆÛÛœÝ›ÝÈH\™›Ü›X[˜ÙK››ÝÊ
NÈYˆ
X›[šÈ	‰ˆ›ÝÈH‹›\Ý
‹˜ËÚYL	‰ˆ‹˜ËšZYÚLÈÎˆÌ
JH™]\›ŽÈ‹›\ÝH›ÝÎÂˆžHÂˆÛÛœÝH‹žÝÈH‹˜ËÚYÚH‹˜ËšZYÚHHX]›Z[ŠÝËÚ
HÈÌŒÝÈHØ[˜\ËÚYÚHØ[˜\ËšZYÚÂˆ™ÛØ˜[[HHNÈ™š[Ý[HH	ÈÌLŒ	ÎÈ™š[™XÝ
ÝËÚ
NÂˆYˆ
X›[šÈ	‰ˆÝÈ	‰ˆÚ
HÈÛÛœÝÈHX]›X^
ÝÈÈÝËÚÈÚ
KÈHÝÈ
ˆËHÚ
ˆËÞH
Ñ‘Ë™ÛØ™HÈÛØ™QÙ[Ê
VÌHˆÝÈÈŠH
ˆÎÂˆ™˜]Ò[XYÙJØ[˜\ËX]›X^
ÝÈHËX]›Z[ŠÝÈÈˆHÞ
JK
ÚH
HÈ‹Ë
NÈBˆÛÛœÝÛHÕQÑK›\ÝØ^HÈÕQÑK›\ÝØ^J
Hˆ[HHÌ
ˆNÂˆ]ÈH˜Ü™X]S[™X\‘Ü˜YY[
L
ˆJNÈË˜YÛÛÜ”ÝÜ
	Ü™Ø˜JK‹LËMJIÊNÈË˜YÛÛÜ”ÝÜ
K	Ü™Ø˜JK‹LË
IÊNÈ™š[Ý[HHÎÈ™š[™XÝ
ÝËL
ˆJNÂˆÈH˜Ü™X]S[™X\‘Ü˜YY[
ÚHŒ
ˆKÚ
NÈË˜YÛÛÜ”ÝÜ
	Ü™Ø˜JK‹LË
IÊNÈË˜YÛÛÜ”ÝÜ
K	Ü™Ø˜JK‹LËÌŠIÊNÈ™š[Ý[HHÎÈ™š[™XÝ
ÚHŒ
ˆKÝËŒ
ˆJNÂˆ•^
•S‘TP“HÓÔ“È0­ÈÓÔ“	ÜYŠ‹›Š_IÜ‹œ™\^HÈ	È0­È‘TVIÈˆ	ÉßXKH
ÈLˆ
ˆK	ÌLˆ
ˆ_\	Ô—ÓSÓ“ßX	Ü™Ø˜J‹KËŽŠIË‹ˆ
ˆJNÂˆ•^
	ÐSˆT•ÓÔ’È–HSÓÈ0­ÈPQHÒUÓUQIËKÚHKÌ	ÌLH
ˆ_\	Ô—ÓSÓ“ßX	Ü™Ø˜JŒŒËŒKŒŠIË‹Œˆ
ˆJNÂˆYˆ
Û	‰ˆ›ÝÈHÛ	‰ˆ›ÝÈÛH
ÈL	‰ˆ›ÝÈH‹ˆLJHÈËÈH]HÛˆHØÜ™Y[‹\È]\ÈÚÝÛˆ\™BˆÛÛœÝHHX]›Z[ŠK
›ÝÈHÛ
HÈ
H
ˆ
›ÝÈˆÛHÈHH
›ÝÈHÛJHÈLˆJKÈHÝÈHˆ
ˆNÂˆÛÛœÝˆH][XÈ	ÊÝÈˆÚÈˆŠH
ˆ_\	Ô—ÔÑT’QŸX[™\ÈH•Ü˜\ÊÛ›Ë‹ŠKÙˆH	ÌLH
ˆ_\	Ô—ÓSÓ“ßXÂˆ]HHÚHHHÍ
ˆHH
[™\Ë›[™ÝHJH
ˆˆ
ˆNÂˆœØ]™J
NÈ™ÛØ˜[[HHX]›X^
JNÂˆYˆ
ÛšÊH•^
•Ü˜\ÊÛšËÕ\\Ø\ÙJ
KËÙ‹‹
ˆKJVÌH	ÉËKHHˆ
ˆKÙ‹	Ü™Ø˜JŒÌ‹ŒÌËŽ
IË‹
ˆJNÂˆ›Üˆ
ÛÛœÝˆÙˆ[™\ÊHÈ•^
‹HHˆ
ˆKK‹	ÈÙŒÙŽIÊNÈH
ÏHˆ
ˆNÈBˆœ™\ÝÜ™J
NÈBˆHØ]Ú
JHßBŸB™[˜Ý[Ûˆ›Ø™UXÚÊ
HÂˆÛÛœÝ›ÝÈH\™›Ü›X[˜ÙK››ÝÊ
NÈYˆ
›ÝÈH“Ð‘KLÑ‘Ë˜Ø[XŠH™]\›ŽÈ“Ð‘KH›ÝÎÂˆžHÈYˆ
T“Ð‘K˜ÊHÈ“Ð‘K˜ÈHØÝ[Y[˜Ü™X]Q[[Y[
	ØØ[˜\ÉÊNÈ“Ð‘K˜ËÚYH“Ð‘KÎÈ“Ð‘K˜ËšZYÚH“Ð‘KšÈ“Ð‘KžH“Ð‘K˜Ë™Ù]ÛÛ^
	Ì™	ËÈÚ[™XYœ™\]Y[NˆYHJNÈBˆ“Ð‘Kž™˜]Ò[XYÙJØ[˜\Ë“Ð‘KË“Ð‘Kš
NÈ“Ð‘K™H“Ð‘Kž™Ù][XYÙQ]J“Ð‘KË“Ð‘Kš
K™]NÈHØ]Ú
JHÈ“Ð‘K™H[ÈBˆ[šÕXÚÊ
NÂŸB™[˜Ý[Ûˆ[P]
LKLJHÈËÈHYX[ˆYÚ™\ÜÈ
ÈJHÙˆHXÝ\™H[ˆH›ÞÙˆHØÜ™Y[‹Üˆ[ˆÛÛœÝH“Ð‘K™ÈYˆ
Y
H™]\›ˆ[ÈÛÛœÝÞH“Ð‘KÈÈ[›™\•ÚYÞHH“Ð‘KšÈ[›™\’ZYÚÂˆÛÛœÝHHX]›X^
X]™›ÛÜŠ
ˆÞ
JKˆHX]›Z[Š“Ð‘KÈHKX]˜ÙZ[
H
ˆÞ
HHJKÈHX]›X^
X]™›ÛÜŠL
ˆÞJJKHHX]›Z[Š“Ð‘KšHKX]˜ÙZ[
LH
ˆÞJHHJNÂˆ]HˆHÈ›Üˆ
]HHÎÈHHNÈJÊÊH›Üˆ
]HNÈHŽÈ
ÊÊHÈÛÛœÝHH
H
ˆ“Ð‘KÈ
È
H
ˆÈ
ÏHŒŒLˆ
ˆÚWH
ÈÌMLˆ
ˆÚH
ÈWH
ÈŒÌŒˆ
ˆÚH
È—NÈŠÊÎÈBˆ™]\›ˆˆÈÈˆÈMHˆ[ÂŸB™[˜Ý[Ûˆ[šÔ™XÝ
›ÙJHÈËÈÚ\™HH›ØÚÉÜÈÛÜ™È\™H
HX\Ýˆ]È˜[YH[™]È[™\Ë›ÝH›ÛÛHÙ\›ÜˆH™\Ý
BˆÛÛœÝ\ÈH›ÙKšYOOH	ÛX\Ý	ÈÈË‹‹››ÙKœ]Y\žTÙ[XÝÜ[
	ÎœØÛÜHˆKœØÛÜHˆ›Y]IÊWHˆÛ›ÙWNÂˆ]ˆH[È›Üˆ
ÛÛœÝHÙˆ\ÊHÈÛÛœÝHHK™Ù]›Ý[™[™ÐÛY[™XÝ

NÈYˆ
\KÚY\KšZYÚ
HÛÛ[YNÂˆˆHˆÈÈYˆX]›Z[Š‹›YK›Y
KÜˆX]›Z[Š‹ÜKÜ
KšYÚˆX]›X^
‹œšYÚKœšYÚ
K›ÝÛNˆX]›X^
‹˜›ÝÛKK˜›ÝÛJHHˆÈYˆK›YÜˆKÜšYÚˆKœšYÚ›ÝÛNˆK˜›ÝÛHNÈBˆ™]\›ˆŽÂŸB™[˜Ý[Ûˆ[šÑ›ÜŠ›ÙKY
HÈËÈÚÝ[\È›ØÚÈ™HÙ][ˆ[šÏÈ
Ú]HX\™Ú[ˆZ]\ˆØ^KÛÈ]Ù\È›Ý›XÚÙ\ŠBˆYˆ
[›ÙHT“Ð‘K™
H™]\›ˆ[ÈÛÛœÝˆH[šÔ™XÝ
›ÙJNÈYˆ
\ŠH™]\›ˆ[ÈYHYÂˆÛÛœÝH[P]
‹›YHY‹ÜHY‹œšYÚ
ÈY‹˜›ÝÛH
ÈY
NÈYˆ
OH[
H™]\›ˆ[ÂˆÛÛœÝØ\ÈH›ÙK˜Û\ÜÓ\Ý˜ÛÛZ[œÊ	Ú[šÉÊNÈ™]\›ˆØ\ÈÈˆˆˆMŽÂŸB™[˜Ý[Ûˆ[šÕXÚÊ
HÈ›Üˆ
ÛÛœÝYÙˆÉÛX\Ý	Ë	Ý\›‰×JHÈÛÛœÝˆHØÝ[Y[™Ù][[Y[žRY
Y
KÈH[šÑ›ÜŠ‹
NÈYˆ
ÈOH[
H‹˜Û\ÜÓ\ÝÙÙÛJ	Ú[šÉËÊNÈHB‹ËÈ]HÛÜ›	ÜÈ[™Ú[H]ÈXØÛÝ[\È\H˜[Ý\È\ÚYHÈHšYÚÛÈHÛÜ™È[™HÛÜ›Ú\™HHØÜ™Y[‚˜ÛÛœÝS‘ÒQ•HÈÎˆNÂ™[˜Ý[Ûˆ[™ÚYXÚÊ
HÂˆÛÛœÝU\HHJ[œH	‰ˆY[œKšY[ˆ	‰ˆY[œK˜Û\ÜÓ\Ý˜ÛÛZ[œÊ	Ý[™\‰ÊJNÂˆÛÛœÝØ[HÑ‘Ë™ÛØ™H	‰ˆÈ	‰ˆËœ\ÙHOOH	Ù[™Y	È	‰ˆU\	‰ˆ[›™\•ÚYˆL	‰ˆ[›™\•ÚYˆ[›™\’ZYÚ
ˆKŒH	‰ˆYØÝ[Y[˜›ÙK˜Û\ÜÓ\Ý˜ÛÛZ[œÊ	Ü™\Ü[™ÉÊHÈHˆÂˆS‘ÒQ•šÈ
ÏH
Ø[HS‘ÒQ•šÊH
ˆ
HHX]™^
SX]›Z[ŠŒKŒMŠH
ˆKŒJJNÂˆYˆ
X]˜XœÊØ[HS‘ÒQ•šÊHYKLÊHS‘ÒQ•šÈHØ[ÂŸB‹ÊˆOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOBˆHSÑQSˆ
ŽNJBˆ]™\žH˜]È\ÈH˜[ˆ]X]™\ÈH\›ˆ
HX[]HÜšYÚ
K˜[ÈÛÈH[™]™]È][™[™È\Âˆ]È[HZÙ\ÈÛ\™K]Èœ›ÛÙ][™ÈÝ]œ›ÛHÚ\™H]™[
H\Ü^IÜÈœ›ÛÊKˆ]™\žH˜[˜]Ûˆ\È[Bˆ
ŒLMŠNˆ›Ý[™È]˜SˆÛÚÜÈZÙHH›ÚY[™H˜[	ÜÈÛÛÝ\ˆ\ÈÛ›HÛ›ÝÛˆY\Ø\™ËˆH[H]Ø[ˆ[ˆ]Ø^BˆÚ[[Y\œÈ˜Z[NÈÛ™H]Ø[ˆœ™XZÈH[X™\ˆØ\œšY\ÈHZ\›[™HÜ˜XÚËˆHÛÜ›ÛÝÜÈÚ[HH˜[˜[È]ˆÛÛ\]\Ë[ˆH[™]˜[ÈÛ‹HÛÛXš[˜][ÛˆÛÛYHZ[™™[Y[X™\œÈÚ[[™ÎÈ\È][™ÈHÛÛXš[˜][Ûˆ\È˜[YYˆ[™™XYÈ[ˆÈH˜[È]ÛÛ\]\ËˆH˜[™]ÈÈHÛÜ›Ø^\È]È˜[YH\È][™ËÚ[ˆ›Ý[™È[ÙH\ÈÜXZÚ[™ËˆÚ[ˆH›ÚYˆœ™XZÜÈÝ]™XYÈ[ˆÈ]œ›ÛHH˜[È[ÜÝ]ÛÜšÈÚ\™H]œ›ÚÙK‚ˆOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOH
‹Â˜ÛÛœÝÕ’RÑHHÈÛŽˆPÑ‘Ë˜Ø[Xˆ	‰ˆK™Ù]
	ÜÝšZÙIÊHOOH	Ì	ËS‘ˆ‹\Ýˆ×KÝŽˆ[Þˆ[XŽˆ[ÛÝÎˆ[Îˆ[\Nˆ˜[ÙKÎˆˆŽˆHNÂ˜ÛÛœÝSRHHÈ›Ü›NˆÜ›ÝÝˆKÝ\œ™[ˆ‹[\[™ÎˆËYÚˆYNˆHNÂ˜ÛÛœÝÚ[™Ù‘YˆHOˆÈÛÛœÝˆHš\ÚÓÙŠ
NÈ™]\›ˆˆHHÈˆˆˆˆÈHˆÈNÂ˜ÛÛœÝÝšZÙS[™H

HOˆÕ’RÑK“S‘
ˆ
È	‰ˆË˜›ÛÜÝÈ‹ŒˆˆJNÈËÈÛÜ›ÙXÛÛ™Èœ›ÛHH\›ˆÈHÜ›Ý[™
Hš\œÝYÙH[œÈ˜\Ý
B™[˜Ý[ÛˆÝšZÙTÛÝÊ
HÈËÈHÛÜ›ÛÝÜÈÚ[HH˜[˜[È]ÛÛ\]\ÈH™[Y[X™\™YÚ\ÛÛ‚ˆÛÛœÝÈHÕ’RÑKœÛÝÎÈYˆ
\ÊH™]\›ˆNÂˆÛÛœÝHH
\™›Ü›X[˜ÙK››ÝÊ
HHË
HÈLÈHŒŽÂˆYˆ
HHËŒHUÈËÈOOHÊHÈÕ’RÑKœÛÝÈH[È™]\›ˆNÈBˆ™]\›ˆHŒHÈHH
HHÊH
ˆÛ[ÛÝJŒKJHˆH‹ŒÈÈÈˆÈ
È
HHÊH
ˆÛ[ÛÝJ‹ŒËËŒKJNÂŸB™[˜Ý[Ûˆ\›”Ú[

HÈÛÛœÝHHØÝ[Y[œ]Y\žTÙ[XÝÜŠ	ÈÝ\›ˆÝ™ÉÊKˆHH	‰ˆK™Ù]›Ý[™[™ÐÛY[™XÝ

NÂˆ™]\›ˆˆ	‰ˆ‹ÚYˆÈÜ‹›Y
È‹ÚYÈ‹‹Ü
È‹šZYÚÈ—HˆÚ[›™\•ÚYHL—NÈB™[˜Ý[ÛˆÝšZÙT™\Ù]

HÈÕ’RÑKÈHÎÈÕ’RÑK›\ÝH×NÈÕ’RÑK›XˆH[ÈÕ’RÑKœÛÝÈH[ÈB˜ÛÛœÝ˜[ÙYYHYOˆÈ]HŒMŒLÍŒŒNÈÛÛœÝHÝš[™ÊY
NÈ›Üˆ
]HHÈH›[™ÝÈJÊÊHÈH˜Ú\ÛÙP]
JNÈHX]š[][
MÍÍÍŒNJNÈH™]\›ˆˆÈNÈËÈH[IÜÈÝÛˆ[X™\Žˆ]ÈÜ˜XÚÈ[™Ú[[Y\ˆ\™HHØ[YHÛˆ]™\žH˜[Ùˆ]™[˜Ý[ÛˆÛÛ\]\ÔÚ\ÛÛŠY˜]
HÈËÈH˜[]ÛÛ\]\Ë[ˆH[™]˜[ÈÛ‹HÛÛXš[˜][ÛˆÛÛYHZ[™™[Y[X™\œÈÚ[[™ÂˆYˆ
SRS‘ÓÓˆ[˜][˜]š\È\[ÙˆRS‘ÈOOH	Ý[™Yš[™Y	ÊH™]\›ˆ[Âˆ]™\ÝH[Âˆ›Üˆ
ÛÛœÝHÙˆØš™XÝ˜[Y\ÊRS‘Ë›Z[™ÈßJJH›Üˆ
ÛÛœÝÈÙˆØš™XÝ˜[Y\ÊK˜ÛÛ\ÈßJJHÂˆYˆ
XËšYÈËšYË›[™ÝˆXËšYËš[˜ÛY\ÊY
HXËšYË™]™\žJOˆOOHY˜]š\Ëš\Ê
JJHÛÛ[YNÂˆÛÛœÝˆHš\ÚÊÊNÈYˆ
ˆH	‰ˆ
X™\Ýˆˆ™\ÝœŠJH™\ÝHÈËˆNÂˆBˆ™]\›ˆ™\ÝÂŸB™[˜Ý[ÛˆÝšZÙS][˜Ú
[œÝ˜]Ú]Kœ™\Ú›ÊHÂˆYˆ
TÕ’RÑK›ÛˆUÈ\Ú]H[˜]
H™]\›ŽÂˆYˆ
Õ’RÑKÈOOHÊHÝšZÙT™\Ù]

NÂˆÛÛœÝÚ[™HÚ[™Ù‘YŠ[œÝ™YŠKÚ\ÛÛˆHœ™\ÚÈÛÛ\]\ÔÚ\ÛÛŠ[œÝ™Y‹šY˜]
Hˆ[ÈËÈHÚ\ÛÛˆ\ÈHÛÛXš[˜][ÛŽˆH˜[]ÛÛ\]\ÈÛ™K™]™\ˆHÚ[™Ùˆ˜[ˆÕ’RÑK›\Ýœ\Ú
È[œÝ˜]›Îˆ›È[œÝœÛ›È[œÝ››ËÚ]NˆÚ]KœÛXÙJ
KÚ[™œ™\ÚÚ\ÛÛ‹ÙYYˆ˜[ÙYY
[œÝ™Y‹šY
Kœ›ÛNˆ\›”Ú[

KÚYNˆÕ’RÑK›\Ý›[™Ý	HˆÈHˆLK[™Yˆ˜[ÙKÛ™Nˆ˜[ÙHJNÂˆYˆ
Õ’RÑK›\Ý›[™Ýˆ
HÕ’RÑK›\ÝœÚY

NÂˆYˆ
Ú\ÛÛˆ	‰ˆËœ\ÙHOOH	Ø[]™IÈ	‰ˆQ–›ÛY[ˆ	‰ˆ[ÝYŠ
H	‰ˆJ–œÛÝÑ[™	‰ˆ–œÛÝÑ[™ÈOOHÊJHÕ’RÑKœÛÝÈHÈˆ\™›Ü›X[˜ÙK››ÝÊ
KÎˆÈNÂˆYˆ
œ™\Ú
HÈÛÛœÝHHØÝ[Y[œ]Y\žTÙ[XÝÜŠ	ÈÝ\›ˆÝ™ÉÊNÈYˆ
JHÈK˜Û\ÜÓ\Ýœ™[[Ý™J	Ù[Z]	ÊNÈ›ÚYK™Ù]›Ý[™[™ÐÛY[™XÝ

NÈK˜Û\ÜÓ\Ý˜Y
	Ù[Z]	ÊNÈHBŸB™[˜Ý[ÛˆÝšZÙT]
˜]
HÈËÈH˜[]\ÚYNˆÜ™^K]ÜÈÝ]ÙˆH\›ˆ[™˜Y\ÂˆYˆ
TÕ’RÑK›ÛˆUÈ[˜]
H™]\›ŽÂˆYˆ
Õ’RÑKÈOOHÊHÝšZÙT™\Ù]

NÂˆÕ’RÑK›\Ýœ\Ú
È]ˆYK˜]ˆÚ[U

Kœ›ÛNˆ\›”Ú[

KÚYNˆÕ’RÑK›\Ý›[™Ý	HˆÈHˆLKÛ™Nˆ˜[ÙHJNÂˆYˆ
Õ’RÑK›\Ý›[™Ýˆ
HÕ’RÑK›\ÝœÚY

NÂˆÛÛœÝHHØÝ[Y[œ]Y\žTÙ[XÝÜŠ	ÈÝ\›ˆÝ™ÉÊNÈYˆ
JHÈK˜Û\ÜÓ\Ýœ™[[Ý™J	Ù[Z]	ÊNÈ›ÚYK™Ù]›Ý[™[™ÐÛY[™XÝ

NÈK˜Û\ÜÓ\Ý˜Y
	Ù[Z]	ÊNÈBŸB™[˜Ý[ÛˆÝšZÙPØ[˜\Ê
HÂˆYˆ
TÕ’RÑK˜ÝŠHÈÛÛœÝÈHØÝ[Y[˜Ü™X]Q[[Y[
	ØØ[˜\ÉÊNÈËšYH	ÜÝšZÙIÎÈËœÙ]]šX]J	Ø\šXKZY[‰Ë	ÝYIÊNÈØÝ[Y[˜›ÙK˜\[™Ú[
ÊNÈÕ’RÑK˜ÝˆHÎÈÕ’RÑK˜ÞHË™Ù]ÛÛ^
	Ì™	ÊNÈBˆÛÛœÝˆHX]›Z[Š‹Ú[™ÝË™]šXÙT^[˜][ÈJKÈH[›™\•ÚYH[›™\’ZYÚÂˆYˆ
Õ’RÑK•ÈOOHÈÕ’RÑK’OOHÕ’RÑK™ˆOOHŠHÈÕ’RÑK•ÈHÎÈÕ’RÑK’HÈÕ’RÑK™ˆHŽÈÕ’RÑK˜Ý‹ÚYHX]œ›Ý[™
È
ˆŠNÈÕ’RÑK˜Ý‹šZYÚHX]œ›Ý[™

ˆŠNÈBˆ™]\›ˆÕ’RÑK˜ÞÂŸB‹ËÈHØÜ™Y[ˆ\ÈHÝYÙH\Èœ˜[YY]
]ÈÛÝÈ\Ú[‹]ÈÝ]ÊNˆHÚ[ÙˆH›]ÛÜ›
ÊHÜˆÙˆH˜[
ÊB™[˜Ý[ÛˆÝYÙSX\

HÂˆÛÛœÝˆHØ[˜\Ë™Ù]›Ý[™[™ÐÛY[™XÝ

KÞH‹ÚYÈX]›X^
K[›™\•ÚY
KÞHH‹šZYÚÈX]›X^
K[›™\’ZYÚ
NÂˆÛÛœÝÝ]HHOˆHÈÜ‹›Y
ÈVÌH
ˆÞ‹Ü
ÈVÌWH
ˆÞKVÌ—KÞHˆ[Âˆ™]\›ˆÈÎˆOˆÝ]
Ñ‘Ë™ÛØ™HÈÜ\™UÔØÜ™Y[ŠÜŠ
JHˆÛÜ›ÔØÜ™Y[Š
JKÎˆˆOˆÝ]
Ü\™UÔØÜ™Y[ŠŠJKÎˆÞNÂŸB™[˜Ý[ÛˆÝšZÙP˜[
ËK‹Ú[™KÛÝËÙYYH
HÈËÈÚ[™ØY™KHØ[ˆ[ˆ]Ø^KˆØ[ˆœ™XZÈH[X™\‹È]\ÚYBˆYˆ
ˆHŒÈHHŒJH™]\›ŽÂˆËœØ]™J
NÈË™ÛØ˜[[HHX]›Z[ŠKJNÂˆYˆ
ÛÝÊHÈÛÛœÝÈHË˜Ü™X]T˜YX[Ü˜YY[
Kˆ
ˆŽKˆ
ˆËŒŠNÈË˜YÛÛÜ”ÝÜ
	Ü™Ø˜JMK‹ŒK
IÊNÈË˜YÛÛÜ”ÝÜ
K	Ü™Ø˜J
IÊNÈË™š[Ý[HHÎÈË˜™YÚ[”]

NÈË˜\˜ÊKˆ
ˆËŒ‹ÊNÈË™š[

NÈBˆËœÚYÝÐÛÛÜˆH	Ü™Ø˜JJIÎÈËœÚYÝÐ›\ˆHˆ
ˆŽNÈËœÚYÝÓÙ™œÙ]HHˆ
ˆŒÍNÂˆÛÛœÝÈHË˜Ü™X]T˜YX[Ü˜YY[
Hˆ
ˆŒÍKHHˆ
ˆˆ
ˆŒKKŠNÂˆYˆ
Ú[™OOHÊHÈË˜YÛÛÜ”ÝÜ
	ÈÙ™	ÊNÈË˜YÛÛÜ”ÝÜ
K	ÈÎŽ	ÊNÈË˜YÛÛÜ”ÝÜ
K	ÈÌÙØÌÎIÊNÈHËÈ]\ÚYNˆÜ™^Bˆ[ÙHÈË˜YÛÛÜ”ÝÜ
	ÈÙ™™™‰ÊNÈË˜YÛÛÜ”ÝÜ
MK	ÈÙNYLXÙ‰ÊNÈË˜YÛÛÜ”ÝÜ
K	ÈÎÎMÍ	ÊNÈHËÈ]™\žH˜[˜]Ûˆ\È[Nˆ]ÈÛÛÝ\ˆ\ÈÛ›HÛ›ÝÛˆY\Ø\™ÂˆË™š[Ý[HHÎÈË˜™YÚ[”]

NÈË˜\˜ÊK‹ÊNÈË™š[

NÈËœÚYÝÐÛÛÜˆH	Ý˜[œÜ\™[	ÎÈËœÚYÝÐ›\ˆHÈËœÚYÝÓÙ™œÙ]HHÂˆYˆ
Ú[™OOHHÚ[™OOHŠHÈËœØ]™J
NÈË˜™YÚ[”]

NÈË˜\˜ÊKˆ
ˆŽMËÊNÈË˜Û\

NÂˆYˆ
Ú[™OOHJHÈËÈØ[ˆ[ˆ]Ø^NˆH˜Z[Ú[[Y\ˆÜ›ÜÜÙ\È]ˆÛÛœÝH

\™›Ü›X[˜ÙK››ÝÊ
HÈM
È
ÙYY	HMÊHÈMÊH	HJH
ˆ‹HËÞHHˆ
È
ˆˆ
ˆŽÂˆÛÛœÝÚHË˜Ü™X]S[™X\‘Ü˜YY[
ÞHˆ
ˆMKHH‹Þ
Èˆ
ˆMKH
ÈŠNÂˆÚ˜YÛÛÜ”ÝÜ
	Ü™Ø˜JMKMKMK
IÊNÈÚ˜YÛÛÜ”ÝÜ
ŒÍ	Ü™Ø˜JMŒMK
IÊNÈÚ˜YÛÛÜ”ÝÜ
K	Ü™Ø˜JMKŒMMŒLŠIÊNÈÚ˜YÛÛÜ”ÝÜ
‹	Ü™Ø˜JŒMŒMKŠIÊNÈÚ˜YÛÛÜ”ÝÜ
K	Ü™Ø˜JMKMKMK
IÊNÂˆË™š[Ý[HHÚÈË™š[™XÝ
H‹HH‹ˆ
ˆ‹ˆ
ˆŠNÂˆH[ÙHÈËÈØ[ˆœ™XZÈH[X™\ŽˆHZ\›[™HÜ˜XÚËHØ[YHÛˆ]™\žH˜[Ùˆ]È[BˆÛÛœÝœˆH][™\œžJ
ÙYYˆ
HJKLHœŠ
H
ˆX]”KÈH×NÂˆ›Üˆ
]ÈHÈÈHNÈÊÊÊHÈÛÛœÝHLH
Èˆ
ˆÈÈKH
ÈOOHÈOOHJHÈˆ
œŠ
HHJH
ˆNÂˆËœ\Ú
Þ
ÈX]˜ÛÜÊL
H
ˆ
ˆˆ
ˆŽHHX]œÚ[ŠL
H
ˆ
ˆ‹H
ÈX]œÚ[ŠL
H
ˆ
ˆˆ
ˆŽH
ÈX]˜ÛÜÊL
H
ˆ
ˆ—JNÈBˆÛÛœÝ[™HH
JHOˆÈË˜™YÚ[”]

NÈË›[Ý™UÊÖÌVÌH
ÈÖÌVÌWH
ÈJNÈ›Üˆ
]ÈHNÈÈË›[™ÝÈÊÊÊHË›[™UÊÖÚ×VÌH
ÈÖÚ×VÌWH
ÈJNÈËœÝ›ÚÙJ
NÈNÂˆË›[™R›Ú[ˆH	ÛZ]\‰ÎÈËœÝ›ÚÙTÝ[HH	Ü™Ø˜JMKMKMK
IÎÈË›[™UÚYHX]›X^
Kˆ
ˆŒÍJNÈ[™J‹ŠNÈËÈ]È]YÙBˆËœÝ›ÚÙTÝ[HH	Ü™Ø˜JÌ‹ÎŽ
IÎÈË›[™UÚYHX]›X^
Ëˆ
ˆŒMJNÈ[™J
NÂˆÛÛœÝHHÖÌˆ
ÈX]™›ÛÜŠœŠ
H
ˆŠWK˜HHL
È
œŠ
HHÈHˆLJH
ˆ
È
ÈH
ˆœŠ
JNÈËÈ[™Hœ˜[˜ÚˆË›[™UÚY
HÍNÈË˜™YÚ[”]

NÈË›[Ý™UÊVÌKVÌWJNÈË›[™UÊVÌH
ÈX]˜ÛÜÊ˜JH
ˆˆ
ˆVÌWH
ÈX]œÚ[Š˜JH
ˆˆ
ˆ
NÈËœÝ›ÚÙJ
NÂˆBˆËœ™\ÝÜ™J
NÈBˆË™š[Ý[HH	Ü™Ø˜JMKMKMKÍJIÎÈË˜™YÚ[”]

NÈË™[\ÙJHˆ
ˆŒÎHHˆ
ˆ‹ˆ
ˆŒŒ‹ˆ
ˆŒML‹ÊNÈË™š[

NÂˆËœ™\ÝÜ™J
NÂŸB™[˜Ý[Ûˆ›Û™Ñ˜]ÊËKØËËYÙJHÈËÈH™[Y[X™\™YÚ\ÛÛˆÛÛ\]Yˆ™XYÈ[ˆœ›ÛHH˜[]ÛÛ\]\È]ÈH˜[È]ÛÛ\]\ÂˆÛÛœÝLHX]›Z[ŠKYÙHÈŒÊH
ˆ
HHÛ[ÛÝJ‹Œ‹ËŒYÙJJNÈYˆ
LHŒH\Ë˜›Û™ÊH™]\›ŽÂˆË˜›Û™Ë™›Ü‘XXÚ

ÊHOˆÂˆÛÛœÝˆHÛ[ÛÝJËYÙHHÈ
ˆŒMJNÈYˆ
ˆH
H™]\›ŽÂˆÛÛœÝÈH™XY]
œÚ]KËœÚ]KËJKHHX]›X^
‹X]œ›Ý[™
Ë›[™Ý
ˆŠJKˆH™Ø“ÙŠ›˜][Ûˆ
NÂˆËœØ]™J
NÈË›[™PØ\H	Ü›Ý[™	ÎÈË›[™R›Ú[ˆH	Ü›Ý[™	ÎÂˆ›Üˆ
]\ÜÈHÈ\ÜÈŽÈ\ÜÊÊÊHÂˆYˆ
\ÜÈOOH
HÈË›[™UÚYHˆ
ˆØÎÈËœÝ›ÚÙTÝ[HH™Ø˜JMKŒÍ‹ŒK	ÊŒMH
ˆL
KÑš^Y
Ê_JXÈBˆ[ÙHÈË›[™UÚYHK
ˆØÎÈÛÛœÝHÖÌKHHÖÜË›[™ÝHWKÜˆHË˜Ü™X]S[™X\‘Ü˜YY[
ÌKÌWKVÌKVÌWJNÂˆÜ‹˜YÛÛÜ”ÝÜ
™Ø˜J	ÝŸK	ÊŽH
ˆL
KÑš^Y
Ê_JX
NÈÜ‹˜YÛÛÜ”ÝÜ
K™Ø˜JMK‹ŒŽ	ÊŽH
ˆL
KÑš^Y
Ê_JX
NÈËœÝ›ÚÙTÝ[HHÜŽÈBˆË˜™YÚ[”]

NÈ]ÛˆH˜[ÙNÂˆ›Üˆ
]HHÈHNÈJÊÊHÈÛÛœÝHÖÚWNÈYˆ
Ì—HŒJHÈÛˆH˜[ÙNÈÛÛ[YNÈHYˆ
[ÛŠHÈË›[Ý™UÊÌKÌWJNÈÛˆHYNÈH[ÙHË›[™UÊÌKÌWJNÈBˆËœÝ›ÚÙJ
NÂˆBˆËœ™\ÝÜ™J
NÂˆÛÛœÝÈHKÊœÚ]JNÈYˆ
È	‰ˆÖÌHˆLYLÈ	‰ˆ
PÑ‘Ë™ÛØ™HÖÌ—HˆŒJJHÝšZÙP˜[
ËÖÌKÖÌWKÈ
ˆØËÚ[™Ù‘YŠ™YŠKL
ˆX]›Z[ŠKˆ
ˆŠKYK˜[ÙYY
™Y‹šY
JNÂˆJNÂŸB™[˜Ý[ÛˆÝšZÙS[™Y
ÊHÂˆžHÈÕQÑK™˜]ÊËš[œÝË›˜]
NÈHØ]Ú
JHßBˆYˆ
ËœÚ\ÛÛŠHÈË˜›Û™ÈHË˜XÝ]™K™š[\ŠOˆOOHËš[œÝ	‰ˆœÚ]H	‰ˆËœÚ\ÛÛ‹˜ËšYËš[˜ÛY\Ê™Y‹šY
JKœÛXÙJ
NÈËÈH˜[È]ÛÛ\]\ÂˆžHÈÕQÑKœÚ\ÛÛ“Y]
ÊNÈHØ]Ú
JHßHBˆÛÛœÝHØÝ[Y[™Ù][[Y[žRY
	ÜÝYÙK]]IÊKˆHØÝ[Y[˜›ÙK˜Û\ÜÓ\ÝÂˆYˆ
Ë™œ™\Ú	‰ˆ\ËœÚ\ÛÛˆ	‰ˆX‹˜ÛÛZ[œÊ	ØÚ[™IÊH	‰ˆX‹˜ÛÛZ[œÊ	Ü™\Ü[™ÉÊH	‰ˆJ	‰ˆ˜Û\ÜÓ\Ý˜ÛÛZ[œÊ	ÛÛ‰ÊJJHÕ’RÑK›XˆHÈËˆ\™›Ü›X[˜ÙK››ÝÊ
HNÈËÈ
HÛÛ\]YÚ\ÛÛˆ\È˜[YYžHHÝYÙJBŸB™[˜Ý[ÛˆÝšZÙSX™[
ËKØÊHÂˆÛÛœÝHÕ’RÑK›XŽÈYˆ
S
H™]\›ŽÂˆÛÛœÝHH
\™›Ü›X[˜ÙK››ÝÊ
HH
HÈLˆHØÝ[Y[˜›ÙK˜Û\ÜÓ\ÝÂˆÛÛœÝHœËœÚ\ÛÛˆÈËˆ‹NÂˆYˆ
Hˆ‹˜ÛÛZ[œÊ	ØÚ[™IÊJHÈÕ’RÑK›XˆH[È™]\›ŽÈBˆÛÛœÝˆHKÊœËœÚ]JNÈYˆ
Pˆ
Ñ‘Ë™ÛØ™H	‰ˆ–Ì—HŒMJJH™]\›ŽÂˆÛÛœÝHHX]›Z[ŠKHÈŒJH
ˆ
HHÛ[ÛÝJH‹JJK][HHË›˜][ÛœË›[™ÝˆNÂˆÛÛœÝÚXÚÈH	Û][HÈœË›˜]›˜[YH
È	È0­È	Èˆ	ÉßY˜]È	ÜYŠœË››Ê_IÓœËœÚ\ÛÛˆÈ	È0­ÈHÚ\ÛÛˆ™[Y[X™\™Y	Èˆ	ÉßXÕ\\Ø\ÙJ
KœÜ]
	ÉÊKš›Ú[Š	ø "‰ÊK˜[YHHœËœÚ\ÛÛˆÈÛÛ\˜[YJœËœÚ\ÛÛ‹˜ÊHˆœËš[œÝ™Y‹›˜[YNÈËÈHÛÛ\]YÚ\ÛÛˆ\È˜[YY\ÈHÛÛXš[˜][Û‚ˆÛÛœÝšÈH	ÓX]œ›Ý[™
L
ˆØÊ_\“X\X[ˆ[Û›È‹ZK[[Û›ÜÜXÙK[Û›ÜÜXÙX›ˆH][XÈÌ	ÓX]œ›Ý[™
ŒH
ˆØÊ_\›ÙÛšH[ÙH‹›ÙÛšHÌˆ‹YÝÙ[Ü™ÚXKÙ\šY˜ÂˆËœØ]™J
NÈË™›ÛHšÎÈÛÛœÝÌHHË›YX\Ý\™U^
ÚXÚÊKÚY
È
][HÈLH
ˆØÈˆ
NÈË™›ÛH›ŽÈÛÛœÝÌˆHË›YX\Ý\™U^
˜[YJKÚYÈHX]›X^
ÌKÌŠNÂˆÛÛœÝHKÊœË›˜]˜Ø\
K™X\ˆH	‰ˆX]š\Ý
ÌHH–ÌKÌWHH–ÌWJH
ˆØÎÈËÈ[™YžH]ÈØ\][ˆÛX\ˆÙˆ]È[X›[H[™]È˜[YBˆ]H™X\ˆÈX]›X^
–ÌKÌJH
ÈLˆ
ˆØÈˆ–ÌH
ÈN
ˆØËHH™X\ˆÈÌWHHˆ
ˆØÈˆ–ÌWH
ÈN
ˆØÎÂˆYˆ

ÈÈˆ[›™\•ÚYHMŠHH
™X\ˆÈX]›Z[Š–ÌKÌJHHLˆ
ˆØÈˆ–ÌHHN
ˆØÊHHÎÂˆHHX]›X^

ˆØËX]›Z[Š[›™\’ZYÚHÍˆ
ˆØËJJNÂˆÛÛœÝHH\[Ùˆ[P]OOH	Ù[˜Ý[Û‰ÈÈ[P]
HHLˆ
ˆØË
ÈËH
ÈÌ
ˆØÊHˆ[[šÈHHOH[	‰ˆHˆMŽÂˆË™ÛØ˜[[HHNÈË^˜\Ù[[™HH	Ø[X™]XÉÎÈËœÚYÝÐÛÛÜˆH[šÈÈ	Ü™Ø˜JL‹ŒÍ‹ŽLŠIÈˆ	Ü™Ø˜JËL‹ŽMJIÎÈËœÚYÝÐ›\ˆHH
ˆØÎÂˆYˆ
][JHÈË™š[Ý[HH™ØŠ	Ü™Ø“ÙŠœË›˜]šJ_JXÈË˜™YÚ[”]

NÈË˜\˜Ê
ÈÈ
ˆØËHHËˆ
ˆØËÈ
ˆØËÊNÈË™š[

NÈBˆË™›ÛHšÎÈË™š[Ý[HH[šÈÈ	Ü™Ø˜JŒ‹NKÌKŽLŠIÈˆ	Ü™Ø˜JŒŒËŒKŽLŠIÎÈË™š[^
ÚXÚË
È
][HÈLH
ˆØÈˆ
KJNÂˆË™›ÛH›ŽÈË™š[Ý[HH[šÈÈ	ÈÌMŒLÌY‰Èˆ	ÈÙŒÙXY‰ÎÈË™š[^
˜[YKH
ÈH
ˆØÊNÂˆËœ™\ÝÜ™J
NÂŸB™[˜Ý[ÛˆÝšZÙUXÚÊ
HÂˆYˆ
TÕ’RÑK›ÛŠH™]\›ŽÂˆžHÈÝšZÙQœ˜[YJ
NÈHØ]Ú
JHÈÛÛœÛÛKØ\›Š	ÜÝšZÙHÝ™\›^IËJNÈÕ’RÑK›\ÝH×NÈÕ’RÑK›XˆH[È™XYÑ›Ü

NÈÕ’RÑK™\HHYNÈBŸB™[˜Ý[ÛˆÝšZÙQœ˜[YJ
HÂˆYˆ
Õ’RÑKÈOOHÊHÝšZÙT™\Ù]

NÂˆ™XYÕXÚÊ
NÂˆYˆ
È	‰ˆËœ\ÙHOOH	Ø[]™IÈ	‰ˆËœ\ÙHOOH	ÙZ[™ÉÈ	‰ˆÕ’RÑK›\Ý›[™Ý
HÈÕ’RÑK›\ÝH×NÈÕ’RÑK›XˆH[ÈHËÈHÛÜ›\È[™Yˆ›Ý[™È[Ü™H˜[ÂˆÛÛœÝH‘PQË˜Ý\ˆ	‰ˆ‘PQË˜Ý\‹˜™XYÈ	‰ˆ‘PQË˜Ý\‹˜™XYË›[™ÝÂˆÛÛœÝ\ÞHHHJÈ	‰ˆ
Õ’RÑK›\Ý›[™ÝÕ’RÑK›Xˆ
JNÂˆYˆ
X\ÞH	‰ˆTÕ’RÑK™\JH™]\›ŽÂˆÛÛœÝÈHÝšZÙPØ[˜\Ê
KˆHÕ’RÑK™ŽÈËœÙ]˜[œÙ›Ü›J‹‹
NÈË˜ÛX\”™XÝ
Õ’RÑK•ËÕ’RÑK’
NÈÕ’RÑK™\HH\ÞNÂˆÈÛÛœÝHHÕË›ÛˆÈX]›X^
X]›Z[ŠK
\™›Ü›X[˜ÙK››ÝÊ
HHÕË
HÈ
ÕË™\ˆÕË‘TŠJJHˆKÈHHHHÈ	ÉÈˆ
H
ˆH
ˆ
ÈHˆ
ˆJJKÑš^Y
ÊNÈËÈHÛÙÝ]ˆ˜]Ûˆ\ÈHÛÜ›\È™]ÛHœ˜[YY]ÛÛY\È[ˆ\ÈHÝ]\ÜÛÛ™\ÂˆYˆ
Õ’RÑK˜Ý‹œÝ[K›ÜXÚ]HOOHÊHÕ’RÑK˜Ý‹œÝ[K›ÜXÚ]HHÎÈBˆYˆ
X\ÞHØÝ[Y[˜›ÙK˜Û\ÜÓ\Ý˜ÛÛZ[œÊ	Ü™\Ü[™ÉÊJH™]\›ŽÂˆÛÛœÝHHÝYÙSX\

K›ÝÈHÚ[U

K“HH–›[Ý[ÛˆOOHØÈHX]›X^
ÍKX]›Z[ŠKX]›Z[Š[›™\•ÚY[›™\’ZYÚ
HÈL
JH
ˆX]›X^
ŽX]›Z[ŠKKKšÊJNÂˆ™XYÑ˜]ÊËKØÊNÂˆ›Üˆ
ÛÛœÝÈÙˆÕ’RÑK›\Ý
HÂˆYˆ
Ëœ]
HÈÛÛœÝHH
›ÝÈHË
HÈKŒÎÈYˆ
HHH\Ë™œ›ÛJHÈË™Û™HHYNÈÛÛ[YNÈHËÈ]\ÚYNˆÝ]ÙˆH\›‹HÚÜÜÛÛ™BˆYˆ
T“JHÈÛÛœÝHHË™œ›ÛKHÐVÌHHˆ
ˆØÈ
ˆH
ˆËœÚYKVÌWH
ÈÌ
ˆØÈ
ˆHHÍ
ˆØÈ
ˆX]œÚ[ŠX]”H
ˆX]›Z[ŠKH
ˆKŒMJJWNÂˆÝšZÙP˜[
ËÌKÌWK‹H
ˆØÈ
ˆ
HHŒÍH
ˆJKËX]›Z[ŠKH
ˆŠH
ˆX]œÝÊHHKK
H
ˆŽK˜[ÙJNÈBˆÛÛ[YNÈBˆ]ˆHKÊËœÚ]JKš\ÈHNÂˆYˆ
Pˆ–ÌHLYLÊHÈÛÛœÝÈHÛØ™QÙ[Ê
KÈH[›™\•ÚYÈØ[˜\ËÚYÈˆHÙÖÌH
ˆË[›™\’ZYÚHÖÌWH
ˆËLKWNÈš\ÈHÈBˆÛÛœÝ˜XÚ[™ÈHÑ‘Ë™ÛØ™HÈX]›X^
X]›Z[ŠK
–Ì—H
ÈŒJHÈŒJJHˆKˆHH
ˆØÎÈËÈ]™\žH˜[HØ[YHÚ^™Nˆ›Û™H\ÈX\šÙYÝ]\ÈHÛ™BˆÛÛœÝHH
›ÝÈHË
HÈX]›X^
YKLËËHË
NÂˆYˆ
HJHÂˆÛÛœÝHHX]œÝÊX]›X^
JKKÊKHHË™œ›ÛNÂˆÛÛœÝÈHÊVÌH
È–ÌJHÈˆ
ÈËœÚYH
ˆŒH
ˆ
–ÌWHHVÌWJKX]›Z[ŠVÌWK–ÌWJHHL
ˆØ×NÂˆÛÛœÝ]HHOˆÈÛÛœÝHHHHNÈ™]\›ˆÛH
ˆH
ˆVÌH
Èˆ
ˆH
ˆH
ˆÖÌH
ÈH
ˆH
ˆ–ÌKH
ˆH
ˆVÌWH
Èˆ
ˆH
ˆH
ˆÖÌWH
ÈH
ˆH
ˆ–ÌWWNÈNÂˆÛÛœÝ˜YHHHH
HH˜XÚ[™È
ˆš\ÊH
ˆÛ[ÛÝJËKJNÈËÈ˜[[™È›Ý[™H˜\ˆÚYHÙˆH˜[]ÛÙ\Èœ›ÛHÚYÚˆË›[™PØ\H	Ü›Ý[™	ÎÂˆYˆ
T“JH›Üˆ
]ÈHÈÈNÈÊÊÊHÈÛÛœÝLHX]›X^
HHˆ
ˆ
HHÈÈN
JKLHHX]›X^
HHˆ
ˆ
HH
È
ÈJHÈN
JNÈYˆ
LHH
HÛÛ[YNÂˆÛÛœÝH]
L
KHH]
LJKÈHÈÈMË[H

ËœÚ\ÛÛˆÈŒÈˆŒ
H
ÈMˆ
ˆÈ
ˆÊH
ˆ˜YNÂˆËœÝ›ÚÙTÝ[HH™Ø˜JMKŒÌ‹	Ø[Ñš^Y
Ê_JXÈË›[™UÚYHŽ
Èˆ
ˆÈ
ˆÈ
ˆÎÂˆË˜™YÚ[”]

NÈË›[Ý™UÊÌKÌWJNÈË›[™UÊVÌKVÌWJNÈËœÝ›ÚÙJ
NÈBˆYˆ
T“JHÈÛÛœÝH]
JNÈÝšZÙP˜[
ËÌKÌWK‹ËšÚ[™˜YKYKËœÙYY
NÈBˆH[ÙHÂˆYˆ
\Ë›[™Y
HÈË›[™YHYNÈÝšZÙS[™Y
ÊNÈBˆÛÛœÝYÙHH›ÝÈHËHHX]›X^
HHYÙHÈMJH
ˆ˜XÚ[™È
ˆš\ÎÂˆYˆ
HˆŒJHÈËœÝ›ÚÙTÝ[HH™Ø˜JMKL	ÊÈ
ˆJKÑš^Y
Ê_JXÈË›[™UÚYHKŒÎÈË˜™YÚ[”]

NÈË˜\˜Ê–ÌK–ÌWKˆ
ÈYÙH
ˆLŒ
ˆØËÊNÈËœÝ›ÚÙJ
NÈËÈHÜ\ÚˆÝšZÙP˜[
Ë–ÌK–ÌWKˆ
ˆX]›X^
HHYÙHÈ
KËšÚ[™K˜[ÙKËœÙYY
NÈHËÈ[™H˜[ÛÙ\È[ÈHÜ›Ý[™ˆYˆ
ËœÚ\ÛÛˆ	‰ˆT“JH›Û™Ñ˜]ÊËKØËËYÙJNÂˆYˆ
YÙHˆ
ËœÚ\ÛÛˆÈËŒˆŠJHË™Û™HHYNÂˆBˆBˆÕ’RÑK›\ÝHÕ’RÑK›\Ý™š[\ŠÈOˆ\Ë™Û™JNÂˆÝšZÙSX™[
ËKØÊNÂŸB‚‹ËÈH‘PQËˆ™YÝ[ˆÚ]HÛY[ŽˆH™XÛÜ™œ›ÛH™Y›Ü™HHœ™XZÈ\È™XY\ÈHÜÝ[[Ü[H™XYÈ]›ÜˆB‹ËÈ[\È[ÜÝ]ÛÜšÈÚ\™H]œ›ÚÙH
H[H]XYHH˜[YHÝÜ™Z[™ÈH[X™\ˆ\™Hš\œÝ
Kˆ˜Z[[™ÈH™XÛÜ™B‹ËÈ[\È]Ø[ˆœ™XZÈH[X™\‹[ˆ›Ü˜ÙHÚ\™H]œ›ÚÙKˆœ›ÛHÚ\™HXXÚÙˆZ\ˆ˜[È[™YH™XY[œÈÝ]Â‹ËÈHœ™XZÎÈ^HÛ›ÝYÚHœ™XZÛÝ][™ÛË‚˜ÛÛœÝ‘PQÈHÈÛŽˆPÑ‘Ë˜Ø[Xˆ	‰ˆK™Ù]
	Ý™XYÉÊHOOH	Ì	ËÝ\Žˆ[NÂ™[˜Ý[Ûˆ™XYÔÝ\
ËÚ\™JHÂˆYˆ
U‘PQË›ÛˆUÈËœ\ÙHOOH	Ø[]™IÈ[ÊH™]\›ŽÂˆ™XYÑ›Ü

NÂˆ‘PQË˜Ý\ˆHÈÎˆËÎˆËœÛXÙJ
KÚ\™KÜšYÚ[Žˆ–›ÛY[ˆ	‰ˆ–›ÛY[‹›ÜšYÚ[ˆÈ–›ÛY[‹›ÜšYÚ[‹œÛXÙJ
Hˆ[ˆ\™›Ü›X[˜ÙK››ÝÊ
K™XYÎˆ[ˆ[šYYˆ˜[ÙK™XYNˆš\™YˆÛÛ™NˆNÂŸB™[˜Ý[Ûˆ™XYÑ›Ü

HÈÛÛœÝÈH‘PQË˜Ý\ŽÈYˆ
È	‰ˆËš
H›Ü›ÙÜ˜[JËš
NÈ‘PQË˜Ý\ˆH[ÈB™[˜Ý[Ûˆ™XYÑÝY\ÜÊ
HÂˆÛÛœÝ˜]HË˜œ™XXÚ	‰ˆË˜œ™XXÚÚ\™KHÚ[U

NÂˆÛÛœÝ[‘›Ü˜ÙHHË˜XÝ]™K™š[\ŠOˆ^œXÓÛ›H	‰ˆ
[˜]
˜\œ–Û˜]šWHH	‰ˆ˜\œ–Û˜]šWHH
JJNÂˆÛÛœÝš\ÚÞHH[‘›Ü˜ÙK™š[\ŠOˆš\ÚÓÙŠ™YŠHˆ
KœÛÜ

KŠHOˆ
š\ÚÓÙŠ‹™YŠHHš\ÚÓÙŠK™YŠJH
‹››ÈHK››ÊJNÂˆ™]\›ˆš\ÚÞK›[™ÝÈš\ÚÞKœÛXÙJÊHˆ[‘›Ü˜ÙKœÛXÙJ
KœÛÜ

KŠHOˆ‹››ÈHK››ÊKœÛXÙJŠNÂŸB™[˜Ý[Ûˆ™XYÔ˜[šÊÊHÂˆYˆ
Yš[š\Ú›ÙÜ˜[JËš
HXË›ÜšYÚ[ŠH™]\›ˆ™XYÑÝY\ÜÊ
NÂˆÛÛœÝˆHËœ[\Ë›[™ÝH^
‹KÛ”‘ÐNÛ”‘ÐKÛ•S”ÒQÓ‘QÐ–UKÛ“‘PT‘TÕ
KˆH˜›ÊÝJNÂˆ˜]ÊËš‹ÈT™\ÎˆÜÝ]K™ÝËÝ]K™ÚKUˆËœÝ\ÈÔËSÜšYÚ[ŽˆÈLŽˆÓX]œ›Ý[™
Ë›ÜšYÚ[–ÌJKX]œ›Ý[™
Ë›ÜšYÚ[–ÌWJWHKS˜]ˆË›˜]KS˜]P\œŽˆÈˆš]\œŠË›˜]KP\œ‹Ëš›\œŠHHKÈTÎˆËœ™XË”ËVˆËœ™XË–SŽˆÝ]K››Ú\ÙHJNÂˆÛÛœÝYˆH™]ÈZ[\œ˜^Jˆ
ˆ
NÈÛœ™XY^[Ê‹KÛ”‘ÐKÛ•S”ÒQÓ‘QÐ–UKYŠNÂˆÛ™[]Qœ˜[YXY™™\ŠŠNÈÛ™[]U^\™J
NÂˆÛÛœÝÚHÌK—K›X\
ÈOˆÈ]ÈHÈ›Üˆ
]HHÈHŽÈJÊÊHÈ
ÏHX]œÝÊ‹Y–ÚH
ˆ
È×HÈMH
ˆ
NÈ™]\›ˆÈNÈJNÂˆÛÛœÝØÈHËœ[\Ë›X\

‹JHOˆ
È‹˜][ˆY–ÚH
ˆ
È×HˆÈHˆÎˆX]›X^
‹‹–ÌK—K›X\
ÈOˆX]œÝÊ‹Y–ÚH
ˆ
È×HÈMH
ˆ
HÈÚÚ×JJHJJNÂˆØËœÛÜ

KŠHOˆ
‹™˜][HK™˜][
H
‹œÈHKœÊJNÂˆÛÛœÝXÚÈHØË™š[\ŠOˆ™˜][œÈˆŒJKœÛXÙJÊNÂˆ™]\›ˆ
XÚË›[™ÝÈXÚÈˆØËœÛXÙJŠJK›X\
OˆœŠNÂŸB™[˜Ý[Ûˆ™XYÕXÚÊ
HÂˆÛÛœÝÈH‘PQË˜Ý\ŽÈYˆ
XÊH™]\›ŽÂˆYˆ
UÈËÈOOHÊHÈ™XYÑ›Ü

NÈ™]\›ŽÈBˆÛÛœÝ›ÝÈH\™›Ü›X[˜ÙK››ÝÊ
NÂˆYˆ
XË˜™XYÊHÂˆYˆ
XËšYY
HÈËšYYHYNÂˆËœ[\ÈH
Ë™X][\ÈË˜XÝ]™JKœÛXÙJ
NÈËœ™XÈHË™X]™XÎÈË›˜]HHË™X]˜]HË›˜]NÈËœÝ\HË™X]Ý\ÂˆYˆ
Ëœ™XÈ	‰ˆËœ[\Ë›[™Ý	‰ˆË›ÜšYÚ[ŠHÈžHÈËšHZÔ›ÙÜ˜[JXYÔÛÝ\˜ÙJËœ[\ÊK˜[ÙJNÈHØ]Ú
JHÈËšH[ÈHHBˆYˆ
Ëš	‰ˆ›ÙÜ˜[T™XYJËš
JHÈžHÈË˜™XYÈH™XYÔ˜[šÊÊNÈHØ]Ú
JHÈË˜™XYÈH™XYÑÝY\ÜÊ
NÈH›Ü›ÙÜ˜[JËš
NÈËšH[ÈBˆ[ÙHYˆ
XËš›ÝÈHËˆL
HÈYˆ
Ëš
HÈ›Ü›ÙÜ˜[JËš
NÈËšH[ÈHË˜™XYÈH™XYÑÝY\ÜÊ
NÈBˆYˆ
Ë˜™XYÊHÈË˜™XYÈHË˜™XYË™š[\ŠOˆ	‰ˆœÚ]JNÈËœ™XYHH›ÝÎÈBˆBˆÛÛœÝÛHH–›ÛY[ŽÂˆYˆ
ÛH	‰ˆÛK™š\™Y	‰ˆXË™š\™Y
HË™š\™YHÛKœˆ›ÝÎÂˆYˆ
ÛH	‰ˆÛK™žˆ	‰ˆXË™ÛÛ™JHË™ÛÛ™HH›ÝÎÂˆYˆ
[ÛH	‰ˆXË™š\™Y	‰ˆXË™ÛÛ™JHË™ÛÛ™HH›ÝÎÂˆÛÛœÝ[™HË™ÛÛ™HÈË™ÛÛ™H
ÈLˆË™š\™YÈË™š\™Y
ÈÌˆ[™š[š]NÂˆYˆ
›ÝÈˆ[™
ÈML
H™XYÑ›Ü

NÂŸB™[˜Ý[Ûˆ™XY]
K‹ËJHÂˆÛÛœÝˆHÝ]H×NÂˆYˆ
Ñ‘Ë™ÛØ™JHÈÛÛœÝHHÜŠJKˆHÜŠŠNÈ›Üˆ
]HHÈHHŽÈJÊÊHÈÛÛœÝHHKœÊÛ\œÊK‹HÈŠJNÈÝ]œ\Ú
HÌLWJNÈH™]\›ˆÝ]ÈBˆÛÛœÝHØ–ÌHHVÌK–ÌWHHVÌWWKHX]š\Ý
ÌKÌWJHYKM‹œˆHËYÌWHÈÌHÈK™[™H
È	HˆÈHˆLJH
ˆ
ŒM
ÈŒH
ˆÊH
ˆÂˆ›Üˆ
]HHÈHHŽÈJÊÊHÈÛÛœÝHHHÈ‹ÈH
ˆH
ˆ
HHJH
ˆ™[™ÈHKÊØVÌH
ÈÌH
ˆH
Èœ–ÌH
ˆËVÌWH
ÈÌWH
ˆH
Èœ–ÌWH
ˆ×JNÈÝ]œ\Ú
ÈÌLWJNÈBˆ™]\›ˆÝ]ÂŸB™[˜Ý[Ûˆ™XYÑ˜]ÊËKØÊHÂˆÛÛœÝÈH‘PQË˜Ý\ŽÈYˆ
XÈXË˜™XYÈXË˜™XYË›[™ÝXËœ™XYJH™]\›ŽÂˆÛÛœÝ›ÝÈH\™›Ü›X[˜ÙK››ÝÊ
K[™HË™ÛÛ™HÈË™ÛÛ™H
ÈLˆË™š\™YÈË™š\™Y
ÈÌˆ[™š[š]KLH[™OOH[™š[š]HÈHˆHHÛ[ÛÝJ[™[™
ÈML›ÝÊNÂˆYˆ
LHŒJH™]\›ŽÂˆË˜™XYË™›Ü‘XXÚ

ÊHOˆÂˆÛÛœÝˆHÛ[ÛÝJL›ÝÈHËœ™XYHHÈ
ˆN
NÈYˆ
ˆH
H™]\›ŽÈËÈXXÚ™XY[œÈÝ]ÈHœ™XZÈ[ˆ\›‚ˆÛÛœÝÈH™XY]
œÚ]KË›ËËJKHHX]›X^
‹X]œ›Ý[™
Ë›[™Ý
ˆŠJKˆH™Ø“ÙŠ›˜][Ûˆ
NÂˆËœØ]™J
NÈË›[™PØ\H	Ü›Ý[™	ÎÈË›[™R›Ú[ˆH	Ü›Ý[™	ÎÂˆ›Üˆ
]\ÜÈHÈ\ÜÈŽÈ\ÜÊÊÊHÂˆYˆ
\ÜÈOOH
HÈË›[™UÚYHÈ
ˆØÎÈËœÝ›ÚÙTÝ[HH™Ø˜JMÌMMK	ÊŒMˆ
ˆL
KÑš^Y
Ê_JXÈBˆ[ÙHÈË›[™UÚYHKÈ
ˆØÎÈÛÛœÝHÖÌKHHÖÜË›[™ÝHWKÜˆHË˜Ü™X]S[™X\‘Ü˜YY[
ÌKÌWKVÌKVÌWJNÂˆÜ‹˜YÛÛÜ”ÝÜ
™Ø˜J	ÝŸK	ÊŽMH
ˆL
KÑš^Y
Ê_JX
NÈÜ‹˜YÛÛÜ”ÝÜ
K™Ø˜JŒÍ‹Œ‹MK	ÊŽMH
ˆL
KÑš^Y
Ê_JX
NÈËœÝ›ÚÙTÝ[HHÜŽÈBˆË˜™YÚ[”]

NÈ]ÛˆH˜[ÙNÂˆ›Üˆ
]HHÈHNÈJÊÊHÈÛÛœÝHÖÚWNÈYˆ
Ì—HŒJHÈÛˆH˜[ÙNÈÛÛ[YNÈHYˆ
[ÛŠHÈË›[Ý™UÊÌKÌWJNÈÛˆHYNÈH[ÙHË›[™UÊÌKÌWJNÈBˆËœÝ›ÚÙJ
NÂˆBˆËœ™\ÝÜ™J
NÂˆÛÛœÝÈHKÊœÚ]JNÂˆYˆ
È	‰ˆÖÌHˆLYLÈ	‰ˆ
PÑ‘Ë™ÛØ™HÖÌ—HˆŒJJHÂˆÛÛœÝHHL
ˆX]›Z[ŠKˆ
ˆŠNÈÝšZÙP˜[
ËÖÌKÖÌWKÈ
ˆØËÚ[™Ù‘YŠ™YŠKKYK˜[ÙYY
™Y‹šY
JNÂˆËœØ]™J
NÈË™ÛØ˜[[HHNÈË™›ÛH][XÈÌ	ÓX]œ›Ý[™
MÈ
ˆØÊ_\›ÙÛšH[ÙH‹›ÙÛšHÌˆ‹YÝÙ[Ü™ÚXKÙ\šY˜ÈË^˜\Ù[[™HH	ÛZYIÎÂˆËœÚYÝÐÛÛÜˆH	Ü™Ø˜JËL‹ŽMJIÎÈËœÚYÝÐ›\ˆH
ˆØÎÈË™š[Ý[HH	ÈÙY™M™™‰ÎÈË™š[^
™Y‹›˜[YKÖÌH
ÈLÈ
ˆØËÖÌWHHJNÈËœ™\ÝÜ™J
NÂˆBˆJNÂŸB‹ÊˆOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOBˆPRSˆÓÔˆOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOH
‹Â›]\ÝH\™›Ü›X[˜ÙK››ÝÊ
Kœ˜[YS›ÈH\™ˆHÈŽˆÝ[NˆÝ\ÎˆXÚYYˆ˜[ÙKœ›ÛNˆK\œ›ÜœÈHÂ›]ÜÝHÂ™[˜Ý[Ûˆœ˜[YJ›ÝÊHÂˆYˆ
ÜÝ
H™]\›ŽÂˆ™\]Y\Ý[š[X][Û‘œ˜[YJœ˜[YJNÂˆžHÈXÚÑœ˜[YJ›ÝÊNÈ\œ›ÜœÈHÈBˆØ]Ú
JHÈÛÛœÛÛK™\œ›ÜŠJNÈYˆ

ÊÙ\œ›ÜœÈˆŒ
HÈ˜Z[Ú]
	ÕHÛÜ›ÝÜYˆ	È
ÈÝš[™ÊK›Y\ÜØYÙHJKœÛXÙJMŒ
JNÈÜÝHYNÂˆYˆ
\™›Ü›X[˜ÙK››ÝÊ
HˆLŒ
HÙ][Y[Ý]


HOˆØØ][Û‹œ™[ØY

KÌ
NÈHBŸB‹ËÈHØÜ™Y[‰ÜÈÝÛˆ[\˜[X\›™YˆHœ˜[YH]ÛÛY\ÈX›Ý]Ú[ˆ^XÝYÛÝ[È\È^XÝHÛ™H[\˜[ÛÈB‹ËÈÝ\ÈÙˆY™H\ˆœ˜[YHÝ^H]™[ˆ
š]\ˆ[ˆHÛØÚÈ\È›Ý\ÜÙYÛˆ\Èš]\ˆ[ˆHXÝ\™JNÈH]HÛ™HÛÝ[È\È]K‚˜ÛÛœÝ•HÈ\ÝˆZ\ÜÎˆNÂ™[˜Ý[Ûˆœ˜[YQ
˜]ÊHÂˆYˆ
J˜]Èˆ
JH™]\›ˆ˜]ÎÂˆYˆ
Q•™\Ý
HÈ•™\ÝH˜]ÎÈ™]\›ˆ˜]ÎÈBˆYˆ
X]˜XœÊ˜]ÈH•™\Ý
H•™\Ý
ˆŒŒŠHÈ•™\Ý
ÏH
˜]ÈH•™\Ý
H
ˆŒŽÈ•›Z\ÜÈHÈ™]\›ˆ•™\ÝÈBˆYˆ

ÊÑ•›Z\ÜÈˆŒ
HÈ•™\ÝH˜]ÎÈ•›Z\ÜÈHÈHËÈHØÜ™Y[ˆ\ÈÚ[™ÙY]ÈXÙBˆ™]\›ˆ˜]ÎÂŸB‹ËÈHÓÔ“	ÔÈÕÓˆÓÐÒËˆ]ÈÙÚXÈ
]È˜]ÜÈ[™Ü›ÜÜÚ[™ÜË]È›Ü™\œÈ[™ÛÝ[˜Ú[Ë]È™XY[™ÜÈ[™œ™XZÛÝ]ÊH[œÂ‹ËÈ]™\žH“ÈÝ\ÈÙˆ]ÈY™KÛˆHÝ\™]™\ˆÛˆHœ˜[Y\ÎˆÝÙ]™\ˆHœ˜[Y\È˜[[™ÝÙ]™\ˆ˜\ÝHXXÚ[™K‹ËÈHØ[YHÛÜ›YY]ÈHØ[YH]™[ÈÛˆHØ[YHÝ\ËˆH]ÈYHÈ[™ÛÈHÛÜ›Ûˆ]ÈÝ\[[]\Â‹ËÈÛÛ\[Y
]\ÈY]È˜[ÈÛÛ\[H[ŠNÈHXÝ\™H[œÈÛˆYX[Ú[K‚˜ÛÛœÝ“ÈH“ÓÔÕÔÒSHHÍ‹ÓQS—ÔÒSHH‹ŒS‘ÓRSˆHŒŽÂ˜ÛÛœÝÛÜ›[œÈH

HOˆHUÈ	‰ˆ
Ëœ\ÙHOOH	Ø[]™IÈËœ\ÙHOOH	ÙZ[™ÉÈ
Ëœ\ÙHOOH	Ù[™Y	È	‰ˆHUË™[™Y	‰ˆË™[™YšÚ[™OOH	ÜÝ\š]™Y	È	‰ˆUË™[™œ›Þ™[ŠJNÂ™[˜Ý[ÛˆÛÜ››ØÚÊ
HÂˆYˆ
Z[œÝ[YJ
JH™]\›ˆ˜[ÙNÈËÈH]ÈYHÈ™HZÙ[ˆ\›ÝÛÛ\[YY]ˆHÛÜ›ØZ]È›Üˆ]ˆYˆ
˜XÙUØZ]Ê
JH™]\›ˆ˜[ÙNÈËÈ
[™›ÜˆH˜XÙHÝ]ÙˆÚYÚ	ÜÊBˆË˜›ÈHËœÝ\ÂˆÛÛœÝˆHËœÝ\È“ËˆH“ÈÈÔËHÚ[U

NÂˆYˆ
Ë˜›ÛÜÝ	‰ˆ
Ëœ\ÙHOOH	Ø[]™IÈ
Ëœœ[ˆ	‰ˆËœœ[‹˜œÈOH[ÈËœÝ\HËœœ[‹˜œÈˆÑ‘ËœÙYYOH[ÈH“ÓÔÕÔÒSHˆ\™›Ü›X[˜ÙK››ÝÊ
HHË˜›Ü›ˆˆLL
JJHÈËÈHš\œÝYÙH[™È
]ÈÝ\Ù\Ú]HÛÜ›	ÜÈÛÙJBˆYˆ
Ëœœ	‰ˆUËœœ[ŠHËœœ˜œÈHËœÝ\ÈË˜›ÛÜÝH˜[ÙNÈ›Üˆ
ÛÛœÝÙˆË›˜][ÛœÊH›™^˜]ÕHX]›X^
›™^˜]Õ
Èˆ
ÈšH
ˆŽ
NÈ\]SX\Ý

NÈBˆYˆ
Ëœ\ÙHOOH	Ø[]™IÈËœ\ÙHOOH	ÙZ[™ÉÊHÈÙ[ÕXÚÊ‹ŠNÈXÙUXÚÊŠNÈBˆÜ›ÜÜÚ[™ÕXÚÊ
NÂˆYˆ
Ëœ\ÙHOOH	Ù[™Y	ÊH˜][ÛœÕXÚÊŠNÈ[ÙHX]XÚÊŠNÂˆYˆ
ˆ	HLOOH	‰ˆËœ\ÙHOOH	Ù[™Y	ÊHÈYX\Ý\™TÚ\™\Ê
NÈÝ™\Ú[PÚXÚÊL
ˆŠNÈBˆYˆ
Ëœ\ÙHOOH	Ø[]™IÈ	‰ˆÚ[U

HHË›\ÝÛ˜\H‹Œ
HÈZÙTÛ˜\ÚÝ

NÈË›\ÝÛ˜\HÚ[U

NÈBˆYˆ
Ëœ\ÙHOOH	Ø[]™IÈ	‰ˆUËœ[™[™È	‰ˆUË\›ÛÜÙY
HÈËÈH[HÜš][ˆ]™K˜]Ûˆ\ÈÛÛÛˆ\È›Ý[™È[ÙH\ÈÛÛ\[[™È
[ˆH™\^KÛˆHÝ\[™žHHÝ]H]Ø\ÊBˆÛÛœÝˆHËœœ[‹ˆHˆ	‰ˆ‹›ˆÈ‹›‹™š[™
HOˆH	‰ˆVÌHOOHËœÝ\
Hˆ[ÂˆYˆ
ŠHÈÛÛœÝˆHË›˜][ÛœÖÝ–ÌWWKH]™QY“ÙŠ–Ì—KËœÝ\
NÈYˆ
ˆ	‰ˆ‹˜[]™H	‰ˆ
H]™UZÙJ‹
NÈBˆ[ÙHYˆ
Tˆ	‰ˆË›]™T™XYJHÈÛÛœÝˆHË›]™T™XYNÈË›]™T™XYHH[ÈYˆ
‹›‹˜[]™JH]™UZÙJ‹›‹‹™YŠNÈHBˆYˆ
Ëœ\ÙHOOH	Ø[]™IÈ	‰ˆUËœ[™[™È	‰ˆUË\›ÛÜÙY
HÂˆÂˆÛÛœÝYHH[]™S˜][ÛœÊ
K™š[\ŠOˆÚ[U

HH›™^˜]Õ	‰ˆZ[Üš\Ú\Ê
JKœÛÜ

KŠHOˆK›™^˜]ÕH‹›™^˜]Õ
VÌNÂˆYˆ
YJHÈÛÛœÝˆHËœœ[ŽÂˆYˆ
Tˆ	‰ˆQPKœ™XYH	‰ˆYXQš]ÊYJJHÈÛÛœÝHQPKœ™XYK™YŽÈQPKœ™XYHH[È]™UZÙJYK
NÈYXUZÙ[ŠYK
NÈHËÈHš\Ú]Ü‰ÜÈYXK[ˆXÙHÙˆ]È˜]Âˆ[ÙHYˆ
ˆÈHJ‹›	‰ˆ‹›š[˜ÛY\ÊËœÝ\
JHˆ
Ë›]™S[ÙH	‰ˆØ[\H	‰ˆ[]™P\ÞJJHÈYK›™^˜]ÕHÚ[U

H
È˜][Û’[\˜[
YJNÈËÈH]™H[™[Üˆ\È\ÚÙY
Ù\Ú]HÛÙNˆH™\^HØZ]È\È]Y
BˆYˆ
TŠHÈYˆ
Ëœœ
H
Ëœœ›HËœœ›×JKœ\Ú
ËœÝ\
NÈ]™Q˜]ÊYJNÈHBˆ[ÙHYˆ
X™YÚ[‘˜]Ê˜[ÙK[YJJHYK›™^˜]ÕHÚ[U

H
ÈŽÂˆBˆBˆBˆY™[˜ÙUXÚÊ
NÈ˜]UXÚÊ
NÈÛÝ[˜Ú[XÚÊ
NÈXØÛÜ™XÚÊ
NÈX]ÚXÚÊ
NÈÛÝÕXÚÊ
NÂˆYˆ
ˆ	HOOH
HÂˆËÈHÛÜ›ÛÙ\ÈÛˆÚ[H[žH˜][ÛˆÛÝ[Ý[˜]Ë›ÝÈÜˆÛ˜ÙH]ÈÛÝ[˜Ú[™[[ËˆÚ[ˆ›Û™HØ[‹]\ÈÝ™\‹‚ˆËÈH\Ý˜[ˆHš\œÝÝ]HÈ[\H]È\›ˆ
]ÛÈ]™\žH[JH˜]ÜÈHÛÜ›	ÜÈ\Ýˆ›Ý[™È[Ü™H\È˜]Û‚ˆËÈ[ž]Ú\™K[™YˆHÛÜ›ÛÈ›ÜˆÙ[HÙXÛÛ™È]\ÈÛÛ‹ˆHÛÝ[ÝÛˆ™Y›Ü™H]›ÛÝÜÈHØ[YH\›‹‚ˆYˆ
Ëœ\ÙHOOH	Ø[]™IÈ	‰ˆUË˜œ™XXÚ
H\›ÛÝ[

NÂˆÈÛÛœÝXYHËœ\ÙHOOH	Ø[]™IÈ	‰ˆUË˜œ™XXÚ	‰ˆUËœ[™[™ÈÈXYÝ]J
Hˆ[ÂˆYˆ
XY	‰ˆUË›\Ý˜[]	‰ˆ\›“Y
XY
HOOH
HÂˆË›\Ý˜[]HÚ[U

NÈË›\Ý˜[žHHXYÈË\›ÛÜÙYHYNÈÛÛœÝØZYHË›\Ý˜[ØZYOH[	‰ˆÚ[U

HHË›\Ý˜[ØZYŒÈYˆ
\ØZY
HË›\Ý˜[ØZYHÚ[U

NÂˆÛÛœÝ][HHË›˜][ÛœË›[™ÝˆNÂˆÛÛœÝÈHXY›\ÝÝ]]œ›ÛHH][H	‰ˆÈ	‰ˆËœ]	‰ˆË˜Ø[YHOOHXYšHÈË›˜][ÛœÖÛË˜Ø[YWHˆ[ÈËÈ]È\Ý˜[ˆH[HZÙ[ˆ\ÜˆÛ™H[™XYH[ˆ›Ü˜ÙK]\ÚYBˆË›\Ý˜[]H]œ›ÛHÈÈ[NˆË›˜[YKœ›ÛNˆ]œ›ÛK›˜[YHHˆ[ÂˆÛÛœÝ[HH[	ÛXY™˜]ÜÈH˜]Û‰ÛXYœ]ÈÈ	ÛXYœ]ßHÙˆ[H]\ÚYXˆ	ÉßXÂˆYˆ
PÑ‘Ë˜Ø[Xˆ	‰ˆ\ØZY
HÕQÑK›\Ý˜[
XY
NÂˆÛÛœÝÛÛ™HHË›˜][ÛœË™š[\ŠÜÝ›ÚY
K›X\
Oˆ›˜[YJKÝ[™H[]™S˜][ÛœÊ
K›X\
Oˆ›˜[YJNÈËÈÚ]HÝ]H[™XYHÛÛ™KHÛÜ›Ø[ˆ›ÈÛ™Ù\ˆÚ[Žˆ]ÈÝ\š]›ÜœÈØ[ˆÛ›HÝ\š]™H]ˆÛÛœÝÝZÙHHÛÛ™K›[™ÝÈYˆ›Ý[™ÈZÙ\ÈÛ›ÜˆÙ[HÙXÛÛ™Ë	Û˜[YS\Ý
Ý[™
_HÚ[]™HÝ\š]™YÈÚ]	Û˜[YS\Ý
ÛÛ™J_HÛÛ™KHÛÜ›Ø[ˆ›ÈÛ™Ù\ˆÚ[‹˜ˆ	ÒYˆHÛÜ›ÛÈ›ÜˆÙ[HÙXÛÛ™Ë]\ÈÛÛ‹‰ÎÂˆYˆ
PÑ‘Ë˜Ø[Xˆ	‰ˆ\ØZY
HÈXÚÙ\Š]œ›ÛHÈH\Ý˜[ˆ	Ù\ØÊXY›˜[YJ_H˜]ÜÈ	Ù\ØÊË›˜[YJ_K[™XYH\™Hœ›ÛH	Ù\ØÊ]œ›ÛK›˜[YJ_K[™]È]\ÚYKˆ]È\›ˆ\È[\H
	Ý[_JKˆ›Ý[™È[Ü™H\È˜]Û‹ˆ	Ù\ØÊÝZÙJ_XˆˆH\Ý˜[ˆ	Û][HÈ\ØÊXY›˜[YJH
È	ø &\È\›ˆ\È[\H
	È
È[H
È	ÊIÈˆ	ÝH\›ˆ\È[\IßKˆ›Ý[™È[Ü™H\È˜]Û‹ˆ	Ù\ØÊÝZÙJ_X	Ý\	ËYJNÂˆš[›ÝJ	ÕH\Ý˜[	Ë	Û][HÈ	ÛXY›˜[Y_H\È˜]Ûˆ]™\žH˜[[ˆ]È\›Žˆ	Ý[_IÜ]œ›ÛHÈH\ÝÙˆ[H	ÛË›˜[Y_K[™XYH[ˆ›Ü˜ÙHœ›ÛH	Ü]œ›ÛK›˜[Y_Xˆ	ÉßXˆ	Ñ]™\žH[H[ˆH\›ˆ\È™Y[ˆ˜]Û‰ßKˆ›Ý[™È[Ü™H\È˜]Ûˆ[ž]Ú\™Kˆ	ÙÛÛ™K›[™ÝÈYˆ›Ý[™Èœ™XZÜÈÝ][™ZÙ\ÈÛ[ˆH™^Ù[HÙXÛÛ™Ë	Û˜[YS\Ý
Ý[™
_HÚ[]™HÝ\š]™Y]ÈÚ]	Û˜[YS\Ý
ÛÛ™J_HÛÛ™KHÛÜ›Ø[ˆ›ÈÛ™Ù\ˆÚ[‹˜ˆ	ÒYˆ›Ý[™Èœ™XZÜÈÝ][™ZÙ\ÈÛ[ˆH™^Ù[HÙXÛÛ™ËHÛÜ›\ÈÛÛˆ
H›ÚYØ]YÚ[ˆ[YHÙ\È›ÝÛÝ[YØZ[œÝ]
K‰ßXÛÛ™K›[™ÝÈ	Û\Ý˜[	Èˆ	ÝÚ[‰ÊNÈBˆ\]SX\Ý

NÈBˆ[ÙHYˆ
XY	‰ˆË›\Ý˜[]	‰ˆÚ[U

HHË›\Ý˜[]ˆŒ
H[™ÛÜ›
	ÜÝ\š]™Y	Ë×JNÈBˆYˆ
Ëœ\ÙHOOH	Ø[]™IÈ	‰ˆË\›ÛÜÙY	‰ˆJË›\Ý˜[žH	‰ˆË›\Ý˜[žK˜[]™JJHÈËÈHÝ]H]™]ÈH\Ý˜[\ÈÜÝˆH˜]Ú[™ÈÛÙ\ÈÛ‚ˆÛÛœÝÛÛ™HHË›\Ý˜[žHÈË›\Ý˜[žK›˜[YHˆ	ÕH[™	ÎÈË›\Ý˜[]HÈË\›ÛÜÙYH˜[ÙNÈË›\Ý˜[žHH[ÂˆYˆ
PÑ‘Ë˜Ø[XŠHÕQÑK›\Ý˜[ÜÝ

NÈYˆ
PÑ‘Ë˜Ø[XŠHXÚÙ\Š	Ù\ØÊÛÛ™J_H\ÈÜÝ[™]È[\H\›ˆÚ]]ˆH˜]Ú[™ÈÛÙ\ÈÛ‹˜	Ý\	ËYJNÈ\]SX\Ý

NÂˆBˆYˆ
Ëœ\ÙHOOH	Ø[]™IÈ	‰ˆUË˜œ™XXÚ	‰ˆUËœ[™[™È	‰ˆUË›\Ý˜[]
HÂˆÛÛœÝÝH[]™S˜][ÛœÊ
K›X\
Ý[X[
NÂˆYˆ
ÝœÛÛYJ›ÛÛX[ŠJHËœÝ[]HÈ[ÙHYˆ
UËœÝ[]
HËœÝ[]HÚ[U

NÂˆYˆ
ËœÝ[]	‰ˆÚ[U

HHËœÝ[]ˆŒ
HÂˆÛÛœÝÙX[YHXØÛÜ™ÙX[Ê
NÈYˆ
ÙX[Y
HËœÙX[YHÙX[Y›X\
OˆšY
NÈËÈHXØÛÜ™ÛÎˆ]™\žHÝ]HÝ[™[™È›ØÚÙYžH]È˜[ˆ[Û™BˆÛÛœÝ[\HH\ÙX[Y	‰ˆ
RS‘ÓÓˆÈ˜]Û‘œ˜XÊ
HHŽNNHˆ[]™S˜][ÛœÊ
K™]™\žJOˆ^\›‹œÛÛYJOˆØ[‘]™\‘˜]Ê
JJJNÈËÈH\Ý˜[ˆ]™\žH[H[™[YÛÛY]Ú\™BˆÛÛœÝœ›Þ™[ˆH[]™S˜][ÛœÊ
K™]™\žJOˆ™œ›Þ™[”Ú\™HˆŽH
Ë›˜][ÛœË›[™Ýˆ	‰ˆ
ËœÝ]Ë™œ›Þ™[ˆ
HˆŽJJNÂˆÛÛœÝÝ]\ÝYHY[\H	‰ˆ\ÙX[Y	‰ˆË›˜][ÛœËœÛÛYJOˆ›ÜÝÓ˜SŠH	‰ˆ[]™S˜][ÛœÊ
K›[™ÝˆÈYˆ
Ý]\ÝY
HË›Ý]\ÝYHYNÂˆ[™ÛÜ›
[\HÙX[YÝ]\ÝYÈ	ÜÝ\š]™Y	Èˆœ›Þ™[ˆÈ	ÚÙ\	Èˆ	ÜÝ[Y	Ë×JNÂˆBˆBˆËÈ›Ý[™È\›Z]Yˆ›È˜][ÛˆX^H˜]È[ž][™ÈY[ˆ]È\›ˆ
]ÈYX\Ý\™\Ë]È[ÜHÜˆ]ÈZ[™›Ü˜šY]
K‚ˆËÈHÛÜ›Ø[ˆØZ]›Üˆ]È\ÜË]›Ý›Üˆ]™\Žˆ™YHZ[]\ÈÙˆ][™HÛÜ›\ÈÝYÛ˜]Y‚ˆYˆ
Ëœ\ÙHOOH	Ø[]™IÈ	‰ˆUË˜œ™XXÚ	‰ˆUËœ[™[™È	‰ˆUË›\Ý˜[]
HÂˆYˆ
[]™S˜][ÛœÊ
KœÛÛYJOˆ]˜Z[X›J
K›[™Ýˆ
JHÈË››Ô\›Z]Ú[˜ÙHHÈËœÝYÛ˜[Ø\›™YH˜[ÙNÈBˆ[ÙHYˆ
UË››Ô\›Z]Ú[˜ÙJHË››Ô\›Z]Ú[˜ÙHHÚ[U

NÂˆ[ÙHYˆ
UËœÝYÛ˜[Ø\›™Y	‰ˆÚ[U

HHË››Ô\›Z]Ú[˜ÙHˆL	‰ˆXXØÛÜ™ÙX[Ê
JHÈËœÝYÛ˜[Ø\›™YHYNÂˆYˆ
PÑ‘Ë˜Ø[XŠHÈXÚÙ\Š	Ó›Ý[™È[ž]Ú\™H\È\›Z]Yˆ™YHZ[]\ÈÙˆ][™HÛÜ›\ÈÝYÛ˜]Y‰Ë	Ý\	ËYJNÂˆš[›ÝJ	Ó›Ý[™È\›Z]Y	Ë	Ó›È˜][ÛˆX^H˜]È[ž][™ÈY[ˆ]È\›Žˆ]ÈYX\Ý\™\Ë]È[ÜHÜˆ]ÈZ[™›Ü˜šY]ˆYˆ›Ý[™È\È\›Z]Y›Üˆ™YHZ[]\ËHÛÜ›[™ËÝYÛ˜[‰Ë	ÜÞ\Ý[IÊNÈHBˆYˆ
Ë››Ô\›Z]Ú[˜ÙH	‰ˆÚ[U

HHË››Ô\›Z]Ú[˜ÙHˆÕQÓS•ÔÊHÈËœÝYÛ˜[HYNÈ[™ÛÜ›
	ÜÝ[Y	Ë×JNÈBˆBˆBˆYˆ

ËœÝ]ˆOH[ˆHËœÝ]ˆH
Ë˜›ÛÜÝÈˆˆÊJH	‰ˆ
Ëœ\ÙHOOH	Ø[]™IÈËœ\ÙHOOH	ÙZ[™ÉÈ
Ëœ\ÙHOOH	Ù[™Y	È	‰ˆË™[™YšÚ[™OOH	Ø›XÚÉÊJJHÂˆËœÝ]ˆHŽÈÛÛœÝÝHÝ]Ð›ØÚÊ
NÈYˆ
Ý
HÛÜ›Ý]ÊÝ
NÈBˆYˆ
K˜™È	‰ˆK˜XÝ]™JHÝ\ÜÝ[Ü[J“ÊNÈËÈH˜XÙHÝ]ÙˆÚYÚˆHÝ\Ùˆ]ÈÝÛˆÈXXÚÙˆHÛÜ›	ÜÂˆ™]\›ˆYNÂŸB™[˜Ý[ÛˆÛÜ›Ý]ÊÝ
HÈËÈH™XY[™ÈZÙ[ˆ\ˆHÙX]\‹[™H›ÚYˆËœÝ]ÈHÝÂˆÈÛÛœÝHÚ[U

KHX]›X^
X]›Z[ŠKH
ËœÝ\•OH[ÈËœÝ\•ˆ
JJNÈËœÝ\•HÈËÈHÙX]\ˆ]ZXÚÙ[œÈÚ[HHÛÜ›\È›[šÂˆYˆ
Ëœ\ÙHOOH	Ø[]™IÊHÈË˜›[šÑ›ÜˆHÝœ]\›ˆUT“—ÓÕÈÈ
Ë˜›[šÑ›Üˆ
H
ÈˆÝœ]\›ˆˆUT“—ÓÒÈÈˆX]›X^

Ë˜›[šÑ›Üˆ
HH
NÂˆÛÛœÝØ[HX]›X^
X]›Z[ŠK

Ë˜›[šÑ›Üˆ
HHÊHÈJJNÈËœÝ\ˆH
ËœÝ\ˆ
H
È
Ø[H
ËœÝ\ˆ
JH
ˆX]›Z[ŠK
ˆ
Ø[ˆ
ËœÝ\ˆ
HÈŽˆŒÍJJNÈHBˆË™[™\™ÞTXZÈHX]›X^
Ý˜Ú\™ÙKË™[™\™ÞTXZÈ
ˆŽNNJNÂˆYˆ
Ëœ\ÙHOOH	Ù[™Y	È	‰ˆ
Ë›ÚY[\ÌÈÝ™œ™\ÚˆˆˆË›ÚY˜\ÙHˆÈÝ›ÚYˆË›ÚY˜\ÙH
ÈŒˆÝ˜[žU›ÚY
JHË™[™œ›Þ™[ˆHYNÈËÈ[ˆ[™YÛÜ›\È™]™\ˆœ›ÝYÚ˜XÚÂˆÛÛœÝ˜\ÙHHË›ÚY˜\ÙHÈËÈHXY›Û™HYžH[ˆX\›Y\ˆØ]\Ý›ÜBˆYˆ
Ëœ\ÙHOOH	Ø[]™IÈ	‰ˆ˜\ÙHˆ
HË›ÚY˜\ÙHHX]›Z[Š˜\ÙKÝ›ÚY
NÂˆÛÛœÝœ™\ÚHË›ÚY[\ÌÈÝ™œ™\Úˆˆˆ˜\ÙHˆÈÝ›ÚYˆ˜\ÙH
ÈŒLˆˆÝ˜[žU›ÚYÈËÈY\ˆHœ™XZÛÝ]\ÈÙ]YˆÛ›H›ÚY]\È™]ÂˆYˆ
Ëœ\ÙHOOH	Ø[]™IÈ	‰ˆœ™\Ú	‰ˆUË˜œ™XXÚ
HÛ•›ÚY]XÝY
Ý
NÂˆ[ÙHYˆ
Ëœ\ÙHOOH	Ø[]™IÈ	‰ˆË˜œ™XXÚ
Hœ™XXÚXÚÊÝ
NÂˆ[ÙHYˆ
Ëœ\ÙHOOH	ÙZ[™ÉÊHÂˆYˆ
˜\ÙHˆÈÝ›ÚYH˜\ÙH
ÈŒˆ\Ý˜[žU›ÚY
HÛÛÛZ[™Y

NÂˆ[ÙHÈÛÛœÝˆHZ[™Õ™\™XÝ
Ý
NÈYˆ
ˆOOH	Ù[™	ÊHÝ\ÜÝ[Ü[J
NÈ[ÙHYˆ
ˆOOH	Ú[	ÊHØØ\•ÛÜ›

NÈBˆBŸB™[˜Ý[ÛˆXÚÑœ˜[YJ›ÝÊHÂˆÛÛœÝHœ˜[YQ
X]›Z[ŠŒK
›ÝÈH\Ý
HÈL
JNÈ\ÝH›ÝÎÈœ˜[YS›ÊÊÎÂˆPË™ÈHPË™ÈOH[ÈˆPË™È
È
HPË™ÊH
ˆŒNÈËÈÝÈ˜\ÝHØÜ™Y[ˆ\ÈÙY\[™È\ˆPË™˜\ÝHPË™˜\ÝÈPË™ÈHÈˆPË™ÈHÈŽÈËÈ
Û›HHØÜ™Y[ˆÝ\™YÙˆœ˜[Y\ÈÛÈHXÝ\™HÈH]	ÜÈXÙH]Û˜ÙNÈÝ\Ú\ÙHHØ]ÚXÚY\ÎˆÙYHT‘“Ô“PSÑJBˆYˆ
UÊH™]\›ŽÂˆÛÛœÝÛXÙHHNÂˆYˆ
Ë˜›ÛÜÝ	‰ˆ]ÛÜ›[œÊ
JHÈË˜›ÛÜÝH˜[ÙNÈ\]SX\Ý

NÈHËÈ
HÛÜ›Ý™\ˆ[ˆ]Èš\œÝYÙNˆHYÙH\ÈÝ™\ˆÛÊBˆÛ[™[™Ê
NÈËÈ
H]È›ÝYYÈHÛÜ›	ÜÈÛØÚÈ\È[œÝ[Y\ÈÛÛÛˆ\È]\È™XYJBˆÛÛœÝ™ˆHÑ‘Ë™™ˆˆ	‰ˆÚ[U

HÑ‘Ë™™ˆ	‰ˆËœ\ÙHOOH	Ø[]™IÎÂˆÛÛœÝÜYYH™ˆÈÑ‘Ë™™˜Ø\ˆ
Ë˜›ÛÜÝÈËHˆJH
ˆž[YTØØ[J
H
ˆÝšZÙTÛÝÊ
KØ\HË˜›ÛÜÝÈQT”ÖÝY\—K˜›ÛÜÝÝ\ÈˆQT”ÖÝY\—K›X^Ý\ÎÂˆÛÛœÝ™HH•™\ÝÈT‘‹žÈHT‘‹žÈÈ™HHÈŒˆ™HHÈŽÈËÈHØÜ™Y[ˆ›ÝÝ\™YÙˆœ˜[Y\ÈZÙ\È\ÈX[žHÝ\ÈHœ˜[YH\ÈHÛØÚÈ™YYÈ
ÙYHT‘“Ô“PSÑJBˆÛÛœÝØ\H™ˆÈÑ‘Ë™™˜Ø\ˆT‘‹žÈ	‰ˆPÑ‘Ë˜Ø[XˆÈX]›X^
Ø\X]›Z[ŠË˜›ÛÜÝÈHˆKX]˜ÙZ[
ÔÈ
ˆÜYY
ˆ™H
ˆKŒJJJHˆØ\Âˆ]ˆH˜[ˆHÂˆYˆ
Ëœ\ÙHOOH	Ø[]™IÈËœ\ÙHOOH	ÙZ[™ÉÈËœ\ÙHOOH	Ù[™Y	ÊHÂˆË˜XØÈ
ÏH
ˆÔÈ
ˆÛXÙH
ˆÜYYÂˆYˆ
Ëœ\ÙHOOH	Ø[]™IÈ	‰ˆUË˜›ÛÜÝ	‰ˆY™ŠH\™“›ÝJX]™›ÛÜŠË˜XØÊHˆØ\
NÈËÈÙY\[™È\Ú]HÛÜ›	ÜÈÛØÚËÜˆ›Ý
ÙYHT‘“Ô“PSÑJBˆˆHX]›Z[ŠX]™›ÛÜŠË˜XØÊKØ\
NÂˆË˜XØÈOHŽÈYˆ
Ë˜XØÈˆØ\
ˆŠHË˜XØÈHÈËÈHÔHØ[››ÝÙY\\ˆ[YH[]\È˜]\ˆ[ˆÝ]\œÂˆYˆ
]ÛÜ›[œÊ
JHˆHÈËÈ[ˆ[™YÛÜ›\È[\È][™YÈHÚ[ˆ[œÈÛˆ[[[ž][™ÈÛÙ\È›XÚÂˆYˆ
ˆ	‰ˆPË›ÛŠHXÕXÚÊ
NÂˆÛÛœÝˆHPË›Ûˆ	‰ˆËœXÔ›ÙÈ	‰ˆÝ]K”TÈÈXÓ˜]

Hˆ[ÂˆÛÛœÝÝXˆHˆ	‰ˆPË“U‘SH	‰ˆUË˜›ÛÜÝ	‰ˆËœ\ÙHOOH	Ø[]™IÈ	‰ˆ
K™Ù]
	ÜXÜÝX‰ÊHPË™˜\Ý
HÈ
K™Ù]
	ÜXÜÝX‰ÊHÈPË”ÕPˆˆX]›Z[ŠPË”ÕP‹T‘‹“ÔT‘‹š×Kœ
JHˆNÈËÈHXÝ\™IÜÈY™H[œÈZXYÙˆH]	ÜÈXÙH
\È]™[H\ÈHØ]Ú[ÝÜÊBˆËÈ‹‹˜]HXÙHÙˆ]ÈÝÛŽˆ]ÈÝ\ÈÛÛYH]™[›Kœ˜[YHžHœ˜[YH
›Ý[ˆ[\ÈÚ]H]	ÜÊK[™]ÈÜYYX\Ù\ÂˆËÈ™]ÙY[ˆ]È]ZXÚÈ[™]ÈZ[ˆXÙH˜]\ˆ[ˆ[\[™ÂˆYˆ
PËÈOOHÊHÈPËÈHÎÈPËœ˜]HHÝXŽÈPË˜XØÈHÈBˆPËœ˜]H
ÏH
ÝXˆHPËœ˜]JH
ˆX]›Z[ŠK
ˆŽJNÂˆ]HHHÂˆYˆ
ˆ	‰ˆÛÜ›[œÊ
JHÈPË˜XØÈ
ÏH
ˆÔÈ
ˆÛXÙH
ˆÜYY
ˆPËœ˜]NÂˆÛÛœÝØ\HX]›X^
KX]˜ÙZ[
Ø\
ˆPËœ˜]JJNÈHHX]›Z[ŠX]™›ÛÜŠPË˜XØÊKØ\
NÈPË˜XØÈOHNÈYˆ
PË˜XØÈˆØ\
ˆŠHPË˜XØÈHÈH[ÙHPË˜XØÈHÈËÈ
[ÈH]	ÜÈØ\]]ÈÝÛˆ˜]JBˆÛÛœÝÌHÎÂˆYˆ
ˆ	‰ˆË˜›ÈOOHËœÝ\	‰ˆËœÝ\	H“ÈOOH	‰ˆ]ÛÜ››ØÚÊ
JHˆHÈËÈHÝ\Ý[ØZ][™ÈÛˆ]È]È
ÜˆH˜XÙIÜÊNˆHÛÜ›ØZ]ÈÚ]]HXÝ\™HÙ\È›Ýˆ›Üˆ
]HHÈHŽÈJÊÊHÂˆÚ[TÝ\
Ëœ›ÙË]™PY‹ËœÝ\Ë›™]ÔÝ\
NÈYˆ
ŠH›Üˆ
ÛÛœÝ\ÈHX]™›ÛÜŠH
ˆ
H
ÈJHÈŠNÈ\ÎÈ
ÊÊHÚ[TÝ\
ËœXÔ›ÙËXÐY‹ËœÝ\Ë›™]ÔÝ\ŠNÈËœÝ\
ÊÎÈ˜[ŠÊÎÂˆYˆ
ËœÝ\	H“ÈOOH	‰ˆ
]ÛÜ››ØÚÊ
HÈOOHÌ]ÛÜ›[œÊ
JJHœ™XZÎÈËÈHÛÜ›	ÜÈÙÚXËÛˆ]ÈÝÛˆÝ\ÂˆBˆYˆ
ÈOOHÌ	‰ˆ˜[ˆŠHË˜XØÈHX]›Z[ŠØ\
ˆ‹Ë˜XØÈ
È
ˆH˜[ŠJNÈËÈ
HÝ\È›ÝZÙ[ˆ\™HÝÙYÚ][ˆ™X\ÛÛŠBˆYˆ
ˆ	‰ˆÈOOHÌ
H›Üˆ
ÈNÈ
ÊÊHÚ[TÝ\
ËœXÔ›ÙËXÐY‹ËœÝ\Ë›™]ÔÝ\ŠNÂˆBˆYˆ
–œÛÝÑ[™	‰ˆ–œÛÝÑ[™ÈOOHÈ	‰ˆËœ\ÙHOOH	Ø[]™IÈ	‰ˆœ˜[YS›È	HÈOOH	‰ˆ\™›Ü›X[˜ÙK››ÝÊ
HH–œÛÝÑ[™
S‘ÔÓÕË”WÐU
ÈŠH
ˆL	‰ˆPË›Ûˆ	‰ˆËœXÔ›ÙÈ	‰ˆÝ]K”TÊHÂˆÛÛœÝˆHXÓ˜]

NÈYˆ
ŠHÚ[TÝ\
ËœXÔ›ÙËXÐY‹ËœÝ\Ë›™]ÔÝ\ŠNÈHËÈY™K™X\›HÝÜYˆHXÝ\™HÛ›BˆÚ\œXÚÊ
NÂˆYˆ
Ëœ\ÙHOOH	ÜÜÝ[Ü[IÈ
K˜™È	‰ˆK˜XÝ]™H	‰ˆ]ÛÜ›[œÊ
JJHÝ\ÜÝ[Ü[J
NÈËÈ
Ú[HHÛÜ›[œËH˜XÙHÝ]ÙˆÚYÚ[œÈÛˆ]ÈÝ\ÊBˆšY]ÕXÚÊ
NÈ[™ÚYXÚÊ
NÈžXÚÊ
NÈÕQÑKXÚÊ
NÈYˆ
œ˜[YS›È	HMHOOH
HšY]ÔÝØ\XÚÊ
NÈYˆ
œ˜[YS›È	HOOH
HÜÝXÚÊ
NÂˆËÈ\Ü^BˆÛÛœÝ[™ÙY[ˆH\™›Ü›X[˜ÙK››ÝÊ
Hˆ
Ë™[™P]
NÈËÈH›ÚY\ÈÙY[ˆ™Y›Ü™H]\È^[Z[™YˆYˆ
Ëœ\ÙHOOH	ÜÜÝ[Ü[IÈ	‰ˆK˜XÝ]™H	‰ˆKœ\ÙHOOH	ÙXYÉÈ	‰ˆKœ˜[ˆˆ	‰ˆ[™ÙY[ŠHÈ™[™\Š™\^PY‹ÈÙŽˆYKˆKœÝ\ÈÔÈJNÈYˆ
ÓTœ™XÊHÛ\œ˜[YJ
NÈBˆ[ÙHYˆ
Y™ˆ	‰ˆJ‘T‹˜\ÞH	‰ˆ‘T‘PÕœ[ˆ	‰ˆËœ\ÙHOOH	Ù[™Y	ÊJHÈ™[™\Š]™PY‹È˜YNˆX]›Z[ŠK
›ÝÈHË˜›Ü›ŠHÈL
HJNÈÚÝXÚÊ
NÈYˆ
ÓTœ™XÊHÛ\œ˜[YJ
NÈBˆÝÕXÚÊ›ÝÊNÂˆXÙSX™[Ê
NÂˆÝšZÙUXÚÊ
NÂˆYˆ
œ˜[YS›È	HMHOOH
HÈ\]SX\Ý

NÈ\]U\›ÛØÚÊ
NÈYˆ
K˜XÝ]™H	‰ˆTK˜™ÊH™[™\”J
NÈBˆYˆ
œ˜[YS›È	HÌOOH	‰ˆÑ‘Ëœ™[ØYˆ	‰ˆËœ\ÙHOOH	Ù[™Y	È	‰ˆ\™›Ü›X[˜ÙK››ÝÊ
HˆÑ‘Ëœ™[ØY
ˆÍŒLÈ	‰ˆT“˜\ÞH	‰ˆ\™›Ü›X[˜ÙK››ÝÊ
HH“˜]ˆLÊH™[ØY›Ø™J
NÈËÈ\ÚÙYYœ™\Ú\š[™ÈH[™ØÜ™Y[‚ˆYˆ
Ëœ\ÙHOOH	Ù[™Y	È	‰ˆË™[™Y	‰ˆÑ‘ËœÝXØÙ\ÜÛÜˆˆ
HÂˆÛÛœÝ˜\ÙHHX]›X^
Ë™[™Y˜]Ë™[™P]ÈË™[™P]
ÈŒˆ
NÈËÈH[™ØÜ™Y[ˆ\È\œ›ÛH\™BˆÛÛœÝˆHË‘]H	‰ˆ‘T‘PÕ›ÛˆÈË‘]Hˆ[ÈËÈHXØÛÝ[\ÈHÙ\]Y[˜ÙNˆ]™YÚ[œÈÛ˜ÙHH[™]H\ÈY]È[ÛY[ˆYˆ
ŠHÈYˆ
U‹˜]	‰ˆ›ÝÈH˜\ÙH
È‹™[^JHÈ‹˜]H›ÝÎÈË˜XØÝ]H›ÝÎÈ[œKšY[ˆHYNÈ™\™XÝÝ\
ŠNÈHBˆ[ÙHYˆ
UË˜XØÝ]	‰ˆ›ÝÈH˜\ÙH	‰ˆ[œH	‰ˆY[œKšY[ˆ	‰ˆY[œK˜Û\ÜÓ\Ý˜ÛÛZ[œÊ	Ý[™\‰ÊJHË˜XØÝ]H›ÝÎÈËÈ[™HXØÛÝ[Ø[ˆ™H™XYœ›ÛH\™H
Û˜ÙHH[™]HÝ\È\ÚYJBˆÛÛœÝÚÝÛˆHË˜XØÝ]
ˆÈ›ÝÈˆ›ÝÈH˜\ÙHˆLÈ˜\ÙH
ÈLˆ›ÝÊNÈËÈ
ÚÝ[]™]™\ˆÛÛYH\HØZ]Ý\Èš[™HÙXÛÛ™È[ŠBˆÛÛœÝYH
ˆ	‰ˆ‹˜]È™\™XÝÜ[Š
HˆÑ‘ËœÝXØÙ\ÜÛÜŠHH
›ÝÈHÚÝÛŠHÈLÈËÈ
HXØÛÝ[\ÈHÙ\]Y[˜ÙNˆÛ™È[›ÝYÚ›Üˆ[ˆÙXÛÛ™ÈÙˆ]È]ÛœÊBˆÛÛœÝYHH™\ÜYJ
KžHØÝ[Y[™Ù][[Y[žRY
	ÜK[™^	ÊNÂˆYˆ
UËœ™\Ü]
HÂˆÛÛœÝH‘T‹˜\ÞH	‰ˆYHÈ	ÓXZÚ[™ÈH™\^IÈˆYHÈH™\ÜÛˆÛÜ›È	ÜYŠË›ˆHÑ‘Ë™XØYH
ÈJ_x $ÉÜYŠË›Š_H™YÚ[œÈ[ˆ	ÓX]›X^
X]˜ÙZ[
Y
J_HØˆÛÜ›	ÜYŠË›ˆ
ÈJ_H™YÚ[œÈ[ˆ	ÓX]›X^
X]˜ÙZ[
Y
J_HØÂˆYˆ
ž
Hž^ÛÛ[HÈYˆ
ˆ	‰ˆ‹˜]
H™\™XÝ™^

NÂˆYˆ
YH	‰ˆT‘T‹˜\ÞJHÈ[œKšY[ˆHYNÈ™\™XÝ[™

NÈYˆ
‘TVH	‰ˆ‘TVK›]™JHÈ™\^QÛ™J
NÈ™]\›ŽÈHYˆ
YJHÈËœ™\Ü]H›ÝÎÈËœ™\ÜÛ™HHYNÈÚÝÔ™\Ü
XZÙT™\Ü
Ë›ŠKYJNÈH[ÙH™]ÕÛÜ›

NÈBˆH[ÙHYˆ
›ÝÈHËœ™\Ü]ˆÑ‘Ëœ™\ÜÈ
ˆL
HÈËœ™\Ü]HÈYT™\Ü

NÈ™]ÕÛÜ›

NÈBˆBˆËÈ\™›Ü›X[˜ÙHY\š[™ÎˆYÙHHÛÜÝÙˆHÚ[][][ÛˆÝ\[ˆHš\œÝÙXÛÛ™ÙˆHÛÜ›ˆYˆ
\\™‹™XÚYY	‰ˆPÑ‘Ë™ÜšY	‰ˆÑ‘ËœÙYYOH[	‰ˆUËœœ[ˆ	‰ˆË™˜]ÜÈHÊHÈËÈ
Hš^Y[ˆ[™H™\^HÙY\Z\ˆÜšY
BˆYˆ
œ˜[YS›Èˆ\™‹™œ›ÛH
È
HÈ\™‹›ŠÊÎÈ\™‹œÝ[H
ÏHÈ\™‹œÝ\È
ÏH˜[ŽÈBˆYˆ
\™‹›ˆHÌ
HÈ\™‹™XÚYYHYNÂˆÛÛœÝ\”Ý\H\™‹œÝ[HÈX]›X^
K\™‹œÝ\ÊNÂˆYˆ
\”Ý\ˆŒH	‰ˆY\ˆQT”Ë›[™ÝHJHÈY\ŠÊÎÈT‘‹Y\“ØÚÈHYNÈ\™”Ø]™J
NÈ™]ÕÛÜ›
ÈÚ[[ˆYHJNÈ\™ˆHÈŽˆÝ[NˆÝ\ÎˆXÚYYˆ˜[ÙKœ›ÛNˆœ˜[YS›ÈNÈHBˆBŸB‚‹ÊˆOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOBˆÐSP”USÓˆT“‘TÔÈ
XY\ÜÎÈ›Ý\ÙˆH^Xš]YYXÙJBˆOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOH
‹Â™[˜Ý[ÛˆÛÜÝ\™JYÊHÂˆÛÛœÝÝ]H™]ÈÙ]

NÈÛÛœÝYHYOˆÈYˆ
Ý]š\ÊY
JH™]\›ŽÈÛÛœÝH–WÒQÚYNÈ
œ™H×JK™›Ü‘XXÚ
Y
NÈYˆ
˜[žH	‰ˆY˜[žKœÛÛYJHOˆÝ]š\ÊJJJHY
˜[žVÌJNÈÝ]˜Y
Y
NÈNÂˆYË™›Ü‘XXÚ
Y
NÈ™]\›ˆË‹‹›Ý]NÂŸB™[˜Ý[ÛˆØ[X”[Š
HÂˆÛÛœÝ]™\žHHÑ‘Ë™]™\žKX^Ý\ÈHÑ‘Ë›X^Ý\È
Õ›[™Ý
È
H
ˆ]™\žNÂˆ]›Ü˜ÙYH[ÂˆYˆ
Ñ‘ËœÛÛÊH›Ü˜ÙYHÛÜÝ\™JÐÑ‘ËœÛÛ×JNÂˆYˆ
Ñ‘ËœZ\ŠH›Ü˜ÙYHÛÜÝ\™JÑ‘ËœZ\‹œÜ]
	Ë	ÊJNÂˆÛÛœÝH\™›Ü›X[˜ÙK››ÝÊ
NÂˆ[˜Ý[ÛˆY›Ü˜ÙY

HÂˆ›Üˆ
ÛÛœÝYÙˆ›Ü˜ÙY
HÈÛÛœÝ[œÝH[š]\œŠ[œÝ[X]J–WÒQÚYKËœ›™ÊJNÈ[œÝ››ÈH
ÊÕË™˜]ÜÎÈ[œÝœÝ\HÈ[œÝ›˜][ÛˆHÈË˜XÝ]™Kœ\Ú
[œÝ
NÈ›Üˆ
ÛÛœÝ›ˆÙˆË›˜][ÛœÊHYÜ
[œÝ›‹›‹šK
NÈBˆ›Ü›ÙÜ˜[JËœ›ÙÊNÈËœ›ÙÈHZ[ÛÜ››ÙÜ˜[JYJNÂˆË›˜]HH˜][šY›Ü›\Ê˜[ÙJNÂˆBˆYˆ
›Ü˜ÙY
HY›Ü˜ÙY

NÂˆÛÛœÝÚ[šÈH

HOˆÂˆ›Üˆ
]ÈHÈÈŒ	‰ˆËœ\ÙHOOH	Ø[]™IÎÈÊÊÊHÂˆYˆ
Ñ‘Ë›[ÙH	‰ˆUË›[ÙP\YY	‰ˆË™˜]ÜÈHÑ‘Ë›[ÙP]
HÂˆÛÛœÝÝHÕUTË™š[™
OˆšYOOHÑ‘Ë›[ÙJNÈË›[ÙP\YYHYNÂˆYˆ
Ý
HÈ›Üˆ
ÛÛœÝ›ˆÙˆË›˜][ÛœÊHÈ›Üˆ
ÛÛœÝÈÙˆRÑVTÊH›‹›YX\Ý\™\ÖÚ×HHÝœÚ×HÈ›‹œÝ]HHÝÈHË›˜]HH˜][šY›Ü›\Ê˜[ÙJNÈÚ[™ÝË—×ÓSÑWÔÕTHËœÝ\ÈBˆBˆYˆ
Ë˜Ø[X“™^OH[
HË˜Ø[X“™^H]™\žNÂˆYˆ
Y›Ü˜ÙY	‰ˆËœÝ\HË˜Ø[X“™^	‰ˆ[]™S˜][ÛœÊ
KœÛÛYJOˆ\›‹›[™Ý
JHÂˆÛÛœÝHHË›˜][ÛœÖÌKˆHK›YX\Ý\™\Ëœ™\Ý˜Z[ÂˆË˜Ø[X“™^HËœÝ\
ÈX]œ›Ý[™
]™\žH
ˆ
H
ÈH
ˆŠH
ˆX]œÝÊH
ÈŒÈ
ˆ‹Kœ™\Ý˜Z[˜]ÜÊJNÈYˆ
ŠHKœ™\Ý˜Z[˜]ÜÊÊÎÂˆÛÛœÝ[H[]™S˜][ÛœÊ
K˜]H[ÕË™˜]ÜÈ	H[›[™ÝNÂˆÛÛœÝYˆHXÚÑœ›ÛU\›Š˜]
NÂˆYˆ
YŠHÈ
Ë›Y™SÙÈHË›Y™SÙÈ×JKœ\Ú
ÕË™˜]ÜËË˜XÝ]™K›[™ÝÈË˜XÝ]™VÕË˜XÝ]™K›[™ÝHWK™Y‹šYˆ	ËIË
ÕËœÝ]Ë›Y™KÑš^Y
ÊWJNÂˆÛÛœÝÛÜÙHHË˜XÝ]™K™š[™
Oˆ™YˆOOHYŠNÂˆYˆ
˜]š\Ëš\ÊY‹šY
JH]\ÚYJ˜]YŠNÈËÈ
Ø[Xœ˜][ÛˆÛÎˆH˜[[™XYH[ˆ›Ü˜ÙH\È]\ÚYJBˆ[ÙHYˆ
ÛÜÙJHÈYÜ
ÛÜÙK˜]˜]šKÚ[U

JNÈË™˜]ÜÊÊÎÈ˜]™˜]ÜÊÊÎÈBˆ[ÙHÈÛÛœÝ[œÝH[š]\œŠ[œÝ[X]JY‹Ëœ›™ÊJNÈ[œÝ››ÈH
ÊÕË™˜]ÜÎÈ[œÝ›˜][ÛˆH˜]šNÈ˜]™˜]ÜÊÊÎÂˆYˆ
Ë›˜][ÛœË›[™ÝˆJH[œÝœÚ]HHÓX]›X^
LŽKX]›Z[ŠŽK˜]˜Ø\ÌH
È
Ëœ›™Ê
HHJH
ˆŒÊJKX]›X^
LŽKX]›Z[ŠŽK˜]˜Ø\ÌWH
È
Ëœ›™Ê
HHJH
ˆŒÊJWNÂˆ[œÝœÝ\HÚ[U

NÈË›™]ÔÝ\H[œÝœÝ\ÈË˜XÝ]™Kœ\Ú
[œÝ
NÈYÜ
[œÝ˜]˜]šK[œÝœÝ\
NÈ›Ü›ÙÜ˜[JËœ›ÙÊNÈËœ›ÙÈHZ[ÛÜ››ÙÜ˜[JYJNÈBˆË›˜]HH˜][šY›Ü›\Ê˜[ÙJNÈBˆBˆÚ[TÝ\
Ëœ›ÙË]™PY‹ËœÝ\Ë›™]ÔÝ\
NÈËœÝ\
ÊÎÂˆBˆÛÛœÝÝHYX\Ý\™J]™PYŠNÈËœÝ]ÈHÝÂˆYˆ
Ý˜[žU›ÚY
HÈË™X]Ý\HËœÝ\È[™ÛÜ›
	Ø›XÚÉË×JNÈÚ[™ÝË—×Ô‹™X]˜]ÈHË™˜]ÜÎÈÚ[™ÝË—×Ô‹›\ÝHË˜XÝ]™KœÛXÙJM
K›X\
HOˆK™Y‹šY
NÈÚ[™ÝË—×Ô‹Ø[H
\™›Ü›X[˜ÙK››ÝÊ
HH
HÈLÈ™]\›ŽÈBˆYX\Ý\™TÚ\™\Ê
NÈÜ›ÜÜÚ[™ÕXÚÊ
NÈ˜][ÛœÕXÚÊŒÈÔÊNÂˆYˆ
Ë›˜][ÛœÖÌK›YX\Ý\™\ËœÝ\™Z[[˜ÙH	‰ˆÝ™œ›Þ™[ˆˆŽJHÈ[™ÛÜ›
	ÚÙ\	Ë×JNÈ™]\›ŽÈBˆYˆ
ËœÝ\HX^Ý\ÊHÈ[™ÛÜ›
	ÜÝ\š]™Y	Ë×JNÈÚ[™ÝË—×Ô‹Ø[H
\™›Ü›X[˜ÙK››ÝÊ
HH
HÈLÈ™]\›ŽÈBˆÚ[™ÝË—×ÔHÈÝ\ˆËœÝ\˜]ÜÎˆË™˜]ÜËÝ]ÎˆÝNÂˆYˆ
Ñ‘ËœÚÝ	‰ˆËœÝ\H
ÐÑ‘ËœÚÝ
HÈ™[™\Š]™PYŠNÈÚ[™ÝË—×ÔÒÕHYNÈ™]\›ŽÈBˆÙ][Y[Ý]
Ú[šË
NÂˆNÂˆÚ[šÊ
NÂŸB‚‹ÊˆOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOBˆS”UˆOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOH
‹Â™[˜Ý[ÛˆÚ\™J
HÂˆ[œ[™[‹˜Y]™[\Ý[™\Š	ØÛXÚÉËHOˆÈKœÝÜ›ÜYØ][ÛŠ
NÈÙ][™[
YØÝ[Y[˜›ÙK˜Û\ÜÓ\Ý˜ÛÛZ[œÊ	Ü[™[	ÊJNÈJNÂˆËÈH\ÛˆHÛÜ›ˆÛÜÙHÚ]]™\ˆ\ÈÜ[‹Üˆ[ÙHYH]™\žHÛÜ™ÛÈÛ›HHÛÜ›\ÈYˆØ[˜\Ë˜Y]™[\Ý[™\Š	ØÛXÚÉË

HOˆÂˆYˆ
Z\ÔÛ™J
JH™]\›ŽÂˆYˆ
ØÝ[Y[˜›ÙK˜Û\ÜÓ\Ý˜ÛÛZ[œÊ	Ü[™[	ÊJHÈÙ][™[
˜[ÙJNÈ™]\›ŽÈBˆYˆ
Y[˜ÛÙKšY[ŠHÈÙÙÛS]Ê
NÈ™]\›ŽÈBˆÙ]Y
Ñ‘ËšYOOH	Ø˜\™IÈÈ	Ü]ZY]	Èˆ	Ø˜\™IÊNÂˆJNÂˆÓ‘K˜Y]™[\Ý[™\Š	ØÚ[™ÙIË

HOˆÈÙ][™[
˜[ÙJNÈYˆ
Ñ‘ËšYOOH	Ø˜\™IÊHÙ]Y
	Ü]ZY]	ÊNÈJNÂˆÛÛœÝXÙ\ÈHÌKKË‹MWNÂˆ[œXÙK˜Y]™[\Ý[™\Š	ØÛXÚÉË

HOˆÈÛÛœÝHH
XÙ\Ëš[™^ÙŠÑ‘Ëš[\˜[
H
ÈJH	HXÙ\Ë›[™ÝÈÑ‘Ëš[\˜[HXÙ\ÖÚWHÎÈ[œXÙK^ÛÛ[HXÙH	ÐÑ‘Ëš[\˜[\ØÂˆYˆ
È	‰ˆËœœ[ŠHÈ\
	ÐH™\^HÙY\È]ÈÜšYÚ[˜[8 &\ÈXÙNˆ\ÈÛ™H\È›ÜˆHÛÜ›ÈY\ˆ]‰ËŒ
NÈ™]\›ŽÈBˆYˆ
È	‰ˆËœ\ÙHOOH	Ø[]™IÊHËœXÙUØ[HÑ‘Ëš[\˜[ÈJNÈËÈ
ZÙ[ˆ\ÛˆHÛÜ›	ÜÈ™^Ý\ˆXÙUXÚÊBˆ[œXÙK^ÛÛ[HXÙH	ÐÑ‘Ëš[\˜[\ØÂˆ	
	Ø‹[]ÉÊK˜Y]™[\Ý[™\Š	ØÛXÚÉËÙÙÛS]ÊNÂˆ	
	Ø‹Y]Z[	ÊK˜Y]™[\Ý[™\Š	ØÛXÚÉË

HOˆÙ]Y
Ñ‘ËšYOOH	Ù]Z[	ÈÈ	Ü]ZY]	Èˆ	Ù]Z[	ÊJNÂˆ	
	Ø‹YØ[\žIÊK˜Y]™[\Ý[™\Š	ØÛXÚÉË

HOˆÙ]Ø[\žJYJJNÂˆ	
	Ø‹X\˜Ú]™IÊK˜Y]™[\Ý[™\Š	ØÛXÚÉË

HOˆÙÙÛP\˜Ú]™J
JNÂˆ	
	Ø‹XX›Ý]	ÊK˜Y]™[\Ý[™\Š	ØÛXÚÉË

HOˆÈÙ][™[
˜[ÙJNÈ™[™\“[™XYÙJ
NÈ[˜X›Ý]šY[ˆH˜[ÙNÈ	
	ØX›Ý]XÛÜÙIÊK™›ØÝ\Ê
NÈJNÂˆ	
	ØX›Ý]XÛÜÙIÊK˜Y]™[\Ý[™\Š	ØÛXÚÉË

HOˆÈ[˜X›Ý]šY[ˆHYNÈJNÂˆ[›[™XYÙK˜Y]™[\Ý[™\Š	ØÛXÚÉËHOˆÈÛÛœÝHHK\™Ù]˜ÛÜÙ\Ý	‰ˆK\™Ù]˜ÛÜÙ\Ý
	ÖÙ]KXYØZ[—IÊNÈYˆ
XJH™]\›ŽÈKœ™]™[Y˜][

NÈ^PÛÙJK™]\Ù]˜YØZ[‹
ØK™]\Ù]›ŠNÈJNÈËÈHÛÜ›œ›ÛHH\ÝYØZ[‚ˆÈÛÛœÝˆH	
	ØYØZ[‰ÊNÈYˆ
ŠH‹˜Y]™[\Ý[™\Š	ÜÝX›Z]	ËHOˆÈKœ™]™[Y˜][

NÈÛÛœÝˆH‹œ]Y\žTÙ[XÝÜŠ	Ú[œ]	ÊK˜[YKš[J
KHH‹œ]Y\žTÙ[XÝÜŠ	Ë›\ÙÉÊNÈYˆ
]ŠH™]\›ŽÂˆYˆ
×—ÌKLIË\Ý
ŠJHÈYˆ
JHK^ÛÛ[H	ÉÎÈ™YÚ[”[Š\œÙR[
‹L
JNÈ™]\›ŽÈHËÈH[X™\ŽˆHš^Y[ˆœ›ÛH]ˆYˆ
K×—
ËVÌNXK^—JËW
‹ŠÊOÉÚK\Ý
‹œ™\XÙJ×ÊËÙË	ÉÊJHYXÛÙUÛÜ›
ŠJHÈYˆ
JHK^ÛÛ[H	Õ]\È›ÝHÛÜ›8 &\ÈÛÙNˆ]\ÈÛˆHÛÜ›8 &\Èš[[™ÛÜHÛÙK[ˆH\˜Ú]™KÛÜY\ÈHÚÛHÙˆ]‰ÎÈ™]\›ŽÈBˆYˆ
JHK^ÛÛ[H	ÉÎÈ^PÛÙJŠNÈJNÈBˆ	
	Ø‹YÛØ™IÊK˜Y]™[\Ý[™\Š	ØÛXÚÉË

HOˆ\›•šY]Ê
JNÈ	
	Ø‹YÛØ™IÊKœÙ]]šX]J	Ø\šXK\™\ÜÙY	ËÝš[™ÊÑ‘Ë™ÛØ™JJNÈØÝ[Y[˜›ÙK˜Û\ÜÓ\ÝÙÙÛJ	ÙÛØ™IËÑ‘Ë™ÛØ™JNÂˆ	
	Ø‹Y[	ÊK˜Y]™[\Ý[™\Š	ØÛXÚÉË

HOˆÈÛÛœÝHØÝ[Y[ÈžHÈYˆ
Y™[ØÜ™Y[‘[[Y[
H™ØÝ[Y[[[Y[œ™\]Y\Ý[ØÜ™Y[Š
K˜Ø]Ú


HOˆßJNÈ[ÙH™^][ØÜ™Y[Š
K˜Ø]Ú


HOˆßJNÈHØ]Ú
JHßHJNÂˆ[šYXK˜Y]™[\Ý[™\Š	ØÛXÚÉË

HOˆÈYˆ
[šYXP›ÞšY[ŠHYXSÜ[Š
NÈ[ÙHYXPÛÜÙJ
NÈJNÂˆ[šYXP›Þ˜Y]™[\Ý[™\Š	ÜÝX›Z]	Ë\Þ[˜ÈHOˆÈKœ™]™[Y˜][

NÈÛÛœÝ[œH	
	ÚYXKZ[‰ÊKˆH[šYXP›Þœ]Y\žTÙ[XÝÜŠ	Ø]Û–Ý\OHœÝX›Z]—IÊNÈ‹™\ØX›YHYNÂˆžHÈYˆ
]ØZ]YXTÝX›Z]
[œ˜[YJJH[œ˜[YHH	ÉÎÈHš[˜[HÈ‹™\ØX›YH˜[ÙNÈHJNÂˆ[šYXP›Þœ]Y\žTÙ[XÝÜŠ	Ëž	ÊK˜Y]™[\Ý[™\Š	ØÛXÚÉËYXPÛÜÙJNÂˆ	
	ÚYXKZ[‰ÊK˜Y]™[\Ý[™\Š	ÚÙ^YÝÛ‰ËHOˆÈYˆ
KšÙ^HOOH	Ñ\ØØ\IÊHÈKœÝÜ›ÜYØ][ÛŠ
NÈYXPÛÜÙJ
NÈHJNÂˆ[›]™K˜Y]™[\Ý[™\Š	ØÛXÚÉË

HOˆÂˆYˆ
\Ø[\HUÊH™]\›ŽÂˆË›]™S[ÙHHUË›]™S[ÙNÈ[›]™KœÙ]]šX]J	Ø\šXK\™\ÜÙY	ËÝš[™ÊË›]™S[ÙJJNÂˆ\
Ë›]™S[ÙHÈ	Ó]™H[™[ÜˆÛŽˆÛ]YHÜš]\ÈH™^[H›ÜˆÚXÚ]™\ˆÝ]H˜]ÜÈ™^Û™H]H[YKÚ[HHÝ\œÈ˜]Èœ›ÛHZ\ˆ\›œËˆ[˜Ø[Xœ˜]Y‰Èˆ	Ó]™H[™[ÜˆÙ™‹ˆ˜]ÜÈÛÛYHœ›ÛHH\›ˆYØZ[‹‰ËL
NÂˆYˆ
Ë›]™S[ÙJHš[›ÝJ	Ó]™H[™[Ü‰Ë	Ñœ›ÛH\™K[\È\™HÜš][ˆžHÛ]YH\ÈHÛÜ›[œËÚXÚÙYÛ›H›ÜˆÚ]\ˆ^HÛÛ\[K[™˜]ÛˆÛ˜ÙK‰Ë	Û]™IÊNÂˆJNÂˆY]™[\Ý[™\Š	ÚÙ^YÝÛ‰ËHOˆÂˆYˆ
K›Y]RÙ^HK˜Ý›Ù^HK˜[Ù^JH™]\›ŽÂˆYˆ
K\™Ù]	‰ˆ×Š[œ]^\™X_Ù[XÝ
IÚK\Ý
K\™Ù]YÓ˜[YH	ÉÊJH™]\›ŽÈËÈ
\[™ÈHÛÙJBˆYˆ
KšÙ^HOOH	Ñ\ØØ\IÊHÈ[˜X›Ý]šY[ˆHYNÈYˆ
‘T	‰ˆT‘T›]™JHYT™\Ü

NÈ™]\›ŽÈBˆYˆ
Y[˜X›Ý]šY[ˆ	‰ˆKšÙ^HOOH	ÚIÈ	‰ˆKšÙ^HOOH	ÒIÊH™]\›ŽÂˆÛÛœÝÈHKšÙ^KÓÝÙ\Ø\ÙJ
NÂˆYˆ
ÈOOH	ÚÉÊHÈÙ]Ø[\žJPÑ‘ËšÚ[ÜÚÊNÈ™]\›ŽÈBˆYˆ
Ñ‘ËšÚ[ÜÚÈ	‰ˆÈOOH	Ù‰È	‰ˆÈOOH	ÜÉÊH™]\›ŽÈËÈ[ˆØ[\žH[ÙHÛ›HËˆ[™È[œÝÙ\‚ˆYˆ
ÈOOH	ÜÉÊHÈÕQÑK›ÛˆÈÕQÑKœÝÜ

HˆÕQÑKœÝ\

NÈBˆ[ÙHYˆ
ÈOOH	Û	ÊHÙÙÛS]Ê
NÂˆ[ÙHYˆ
ÈOOH	Ú	ÊHÙ]Y
Ñ‘ËšYOOH	Ü]ZY]	ÈÈ	Ù]Z[	ÈˆÑ‘ËšYOOH	Ù]Z[	ÈÈ	Ø˜\™IÈˆ	Ü]ZY]	ÊNÂˆ[ÙHYˆ
ÈOOH	Ù‰ÊH	
	Ø‹Y[	ÊK˜ÛXÚÊ
NÂˆ[ÙHYˆ
ÈOOH	ÙÉÊH\›•šY]Ê
NÂˆ[ÙHYˆ
ÈOOH	ÚIÊHÈYˆ
[˜X›Ý]šY[ŠHÈ™[™\“[™XYÙJ
NÈ[˜X›Ý]šY[ˆH˜[ÙNÈH[ÙH[˜X›Ý]šY[ˆHYNÈBˆ[ÙHYˆ
ÈOOH	ØIÊHÙÙÛP\˜Ú]™J
NÂˆ[ÙHYˆ
ÈOOH	Ü‰ÊHÈÛÛœÝ›ÞHØÝ[Y[™Ù][[Y[žRY
	Ü™\Ü	ÊNÈYˆ
›Þ	‰ˆX›ÞšY[ˆ	‰ˆJ‘T	‰ˆ‘T›]™JJHYT™\Ü

NÈ[ÙHYˆ
‘TÔ•Ë›[™Ý	‰ˆJ‘T	‰ˆ‘T›]™JJHÚÝÔ™\Ü
‘TÔ•ÖÔ‘TÔ•Ë›[™ÝHWK˜[ÙJNÈBˆJNÂˆ]YHHÂˆÛÛœÝØZÙHH

HOˆÈYˆ
Ñ‘ËšÚ[ÜÚÊH™]\›ŽÈËÈ[ˆØ[\žH[ÙKH[™™X\˜žHÚ[™Ù\È›Ý[™Âˆ[˜˜\‹˜Û\ÜÓ\Ýœ™[[Ý™J	ÚYIÊNÈØÝ[Y[˜›ÙK˜Û\ÜÓ\Ý˜Y
	Ø]ØZÙIÊNÈÛX\•[Y[Ý]
YJNÂˆØÝ[Y[˜›ÙK˜Û\ÜÓ\Ýœ™[[Ý™J	ÜÝ[	ÊNÈÛX\•[Y[Ý]
ØZÙKœÝ
NÈØZÙKœÝHÙ][Y[Ý]


HOˆØÝ[Y[˜›ÙK˜Û\ÜÓ\Ý˜Y
	ÜÝ[	ÊKÌ
NÂˆYHHÙ][Y[Ý]


HOˆÈ[˜˜\‹˜Û\ÜÓ\Ý˜Y
	ÚYIÊNÈØÝ[Y[˜›ÙK˜Û\ÜÓ\Ýœ™[[Ý™J	Ø]ØZÙIÊNÈKŒ
NÈNÂˆY]™[\Ý[™\Š	ÜÚ[\›[Ý™IËØZÙJNÈY]™[\Ý[™\Š	ÜÚ[\™ÝÛ‰ËØZÙJNÈY]™[\Ý[™\Š	ÚÙ^YÝÛ‰ËØZÙJNÈØZÙJ
NÂˆY]™[\Ý[™\Š	ÜÚ[\™ÝÛ‰Ë

HOˆÈYˆ
TÕQÑK›Ûˆ	‰ˆPÑ‘Ë˜Ø[XŠHÕQÑKœÝ\

NÈJNÂˆY]™[\Ý[™\Š	ÜÚ[\›[Ý™IË

HOˆÈYˆ
TÕQÑK›Ûˆ	‰ˆPÑ‘Ë˜Ø[Xˆ	‰ˆPÑ‘ËšÚ[ÜÚÊHÕQÑKš[
YJNÈJNÂˆYˆ
ÕQÑKØ[	‰ˆPÑ‘Ë˜Ø[XŠHÕQÑKœÝ\

NÂˆY]™[\Ý[™\Š	Ü™\Ú^™IË

HOˆÈ™\Ú^™PØ[˜\Ê
NÈ˜\‘š]

NÈJNÈ˜\‘š]

NÂˆØ[˜\Ë˜Y]™[\Ý[™\Š	ÝÙX™ÛÛÛ^ÜÝ	ËHOˆÈKœ™]™[Y˜][

NÈÜÝHYNÈÛX\•[Y[Ý]
ÜÝ
NÈÜÝHÙ][Y[Ý]


HOˆÈYˆ
ÜÝ
HØØ][Û‹œ™[ØY

NÈKŒ
NÈJNÂˆØ[˜\Ë˜Y]™[\Ý[™\Š	ÝÙX™ÛÛÛ^™\ÝÜ™Y	Ë

HOˆÂˆÛÛœÝ\œˆH[š]Ó

NÈYˆ
\œŠHÈ˜Z[Ú]
\œŠNÈ™]\›ŽÈBˆÛÛœÝÙY\HÎÈÜÝH˜[ÙNÂˆÛÛœÝÙÝËÚHHÜÝ]K™ÝËÝ]K™ÚNÈÝ]K”ÈH[ÈÝ]K””ÈH[ÈÝ]K”ÈH[È[ØÕÛÜ›
ÝËÚ
NÂˆYˆ
ÙY\˜œ™XXÚ
HÈÙY\˜œ™XXÚH[ÈÙY\™X]›ÙÈH[ÈÙY\™X]™XÈH[ÈÙY\™X]Ý\HLNÈÙY\›ÜšYÚ[ˆH[ÈÙY\›ÚY˜\ÙHHÈBˆYˆ
K˜™ÊHÈK˜XÝ]™HH˜[ÙNÈK˜™ÈH˜[ÙNÈK˜˜\ÙHH[ÈKœ›ÙÈH[ÈÓœ›ÙÈH[ÈBˆ˜]Ê“ÑËš[š]Ý]K‘–ÌKÈT™\ÎˆÙÝËÚKTÙYYˆ
ÙY\œÙYY	HL
HÈÍËŒQ[œÙNˆJNÂˆ˜]Ê“ÑËš[š]Ý]K”Q–ÌKÈT™\ÎˆÙÝËÚKTÙYYˆ
ÙY\œÙYY	HL
HÈÍËŒQ[œÙNˆPË“U‘SHÈHˆJNÈÝ]KœXÝ\ˆHÈÙY\œXÔ›ÙÈH[ÈÙY\œXÔ[™[™ÈH[ÈÙY\œXÒÙ^HH[ÂˆÙY\œ›ÙÈHZ[ÛÜ››ÙÜ˜[JYJNÈÙY\œ[™[™ÈH[ÂˆYˆ
K˜™ÊHÈK˜XÝ]™HH˜[ÙNÈK˜™ÈH˜[ÙNÈK˜˜\ÙHH[ÈKœ›ÙÈH[ÈÓœ›ÙÈH[ÈBˆYˆ
ÙY\œ\ÙHOOH	ÜÜÝ[Ü[IÊHÈK˜XÝ]™HH˜[ÙNÈ[™ÛÜ›
	Ø›XÚÉË×JNÈBˆš[›ÝJ	ÕH\Ü^HØ\ÈÜÝ	Ë	ÕHÜ˜\XÜÈÛÛ^Ø\È™\Ù]ˆHÛÜ›8 &\È]ÜÈÙ\™HÙ\È]ÈY[[ÜžHØ\È›Ý‰Ë	ÜÞ\Ý[IÊNÂˆ\ÝH\™›Ü›X[˜ÙK››ÝÊ
NÈ™\]Y\Ý[š[X][Û‘œ˜[YJœ˜[YJNÂˆJNÂˆØÝ[Y[˜Y]™[\Ý[™\Š	Ýš\ÚXš[]XÚ[™ÙIË

HOˆÈ\ÝH\™›Ü›X[˜ÙK››ÝÊ
NÈJNÂŸB‹ËÈHÛØ™H\ÈÛYKˆX›Ý]Û˜ÙHHZ[]K]H[ÛY[œ™YHÙˆHœ™XZÛÝ][™H]KHÛÜ›\ÈZY›]›Üˆ[‚‹ËÈÙXÛÛ™ÈÜˆÛË\ÈHX\ÙˆÚÈÛÈÚ][™[ˆ\›œÈ˜XÚÈÈHÛØ™H
ZY›]žH[™]Ý^\È[ˆHZ[]JB˜ÛÛœÝ’QUÔÕÈHÈÛŽˆPÑ‘Ë˜Ø[Xˆ	‰ˆK™Ù]
	ÜÝØ\	ÊHOOH	Ì	È	‰ˆTKš\Ê	ÙÛØ™IÊK\ÞNˆ˜[ÙKˆ\ÝˆÝˆÈ›]ˆÛØ™NˆKÜ[ŽˆÓÐ‘Nˆ[J	ÙÛØ™\ÉËŠKPTˆ[J	ÛX\ÉËLJKS‘ˆÌNÂ˜ÛÛœÝ˜[ÓYH

HOˆÈÛÛœÝˆHÈ	‰ˆXYÝ]J
NÈ™]\›ˆˆÈ\›“Y
ŠHˆNNÈNÈËÈH\›ˆ™X\™\Ý[\B™[˜Ý[ÛˆšY]ÓØÚÙY

HÈ™]\›ˆHUÈ	‰ˆÑQS‹›Ûˆ	‰ˆ
ËšY]ÓØÚÈOOHË›ˆ˜[ÓY

H
NÈHËÈ›È\›ˆÈH[™NˆHœ™XZÛÝ]\ÈÛÜ›ÜˆH\›ˆ™X\›H[\B‹ËÈH›ÚY\ÈX›Ý]Èœ™XZÈÝ]ˆHšY]È\›œÈÈHÛØ™H]Û˜ÙK[™\ˆH]ZXÚÈ\ÜÛÛ™Hœ›ÛHH[™H\È]Ø\Â‹ËÈ
H˜[	ÜÈ›Ü™\œÈ]Û˜ÙKH\ÜÛÛ™HY[™ÈHÚ[™ÙJB‹ËÈ[™HÛØ™HÝ^\È[[H™^ÛÜ›™[˜Ý[Ûˆ[™Û‘ÛØ™J
HÈËÈ\ÈHÛÜ›[™ËH[™H\ÜÛÛ™\È[ÈH˜[
Ú]]Ø[YHÈ\ÈÙ]YÈHÚ[ˆ[œÈÛ‹ÛˆH˜[
BˆYˆ
UÈU’QUÔÕË›ÛˆÑ‘Ë™ÛØ™JH™]\›ŽÂˆËšY]ÓØÚÈHË›ŽÈÕËØ[H[ÈÕËÈH[ÂˆYˆ
]Ú[™ÝË—×Ó”ˆ	‰ˆJÑ‘Ë™™ˆˆ	‰ˆÚ[U

HÑ‘Ë™™ŠJHÈžHÈ™[™\Š]™PY‹È˜YNˆX]›Z[ŠK
\™›Ü›X[˜ÙK››ÝÊ
HHË˜›Ü›ŠHÈL
HJNÈÝÓ^JÕË‘TŠNÈHØ]Ú
JHßHBˆÙ]ÛØ™JYKYJNÈ’QUÔÕË˜\ÞHH˜[ÙNÈØÝ[Y[˜›ÙK˜Û\ÜÓ\Ýœ™[[Ý™J	Ý\›š[™ÉÊNÂˆÓÐ‘WÒÈHNÈYˆ
Ë›˜]JHË›˜]KQÛØ™HHNÈË™ÚÈHË™ÚÕÈHNÂŸB™[˜Ý[ÛˆÙY[‘ÛØ™J
HÂˆYˆ
UÈTÑQS‹›ÛŠH™]\›ŽÈËšY]ÓØÚÈHË›ŽÂˆYˆ
U’QUÔÕË›ÛˆÑ‘Ë™ÛØ™JH™]\›ŽÂˆÕËØ[H[ÈÕËÈH[ÂˆYˆ
]Ú[™ÝË—×Ó”ˆ	‰ˆJÑ‘Ë™™ˆˆ	‰ˆÚ[U

HÑ‘Ë™™ŠJHÈžHÈ™[™\Š]™PY‹È˜YNˆX]›Z[ŠK
\™›Ü›X[˜ÙK››ÝÊ
HHË˜›Ü›ŠHÈL
HJNÈÝÓ^JÓSÓÕÕU
NÈHØ]Ú
JHßHBˆØÝ[Y[˜›ÙK˜Û\ÜÓ\Ýœ™[[Ý™J	Ý\›š[™ÉÊNÈ’QUÔÕË˜\ÞHH˜[ÙNÂˆÙ]ÛØ™JYKYJNÈ’QUÔÕËH\™›Ü›X[˜ÙK››ÝÊ
NÈ’QUÔÕËœÜ[ˆHšY]ÔÜ[ŠYJNÂˆÓÐ‘WÒÈHNÈYˆ
Ë›˜]JHË›˜]KQÛØ™HHNÈË™ÚÈHË™ÚÕÈHNÂˆYˆ
Ñ‘ËœÙYYOH[	‰ˆUËœœ[ŠHÈÑQQ‹HÑQQ‹˜ÛØÚÎÈÑQQ‹œÜ[ˆHÙYYÜ[ŠYJNÈBŸB™[˜Ý[ÛˆšY]ÔÜ[ŠÛØ™K[™
HÈ™]\›ˆ
ÛØ™HÈ’QUÔÕË‘ÓÐ‘Hˆ[™È’QUÔÕË’S‘ˆ’QUÔÕË“PT
H
ˆ
ŽH
ÈŒÈ
ˆX]œ˜[™ÛJ
JNÈB™[˜Ý[ÛˆšY]ÔÝØ\XÚÊ
HÂˆYˆ
U’QUÔÕË›ÛˆUÊH™]\›ŽÂˆYˆ
Ëœœ[ˆÑ‘ËœÙYYOH[
H™]\›ŽÈËÈ
H™\^H\›œÈ\È]ÈÜšYÚ[˜[YÈHš^Y[‹ÛˆHÛÜ›	ÜÈÝÛˆÛØÚÊBˆÛÛœÝ›ÝÈH\™›Ü›X[˜ÙK››ÝÊ
K]™HH
Ëœ\ÙHOOH	Ø[]™IÈËœ\ÙHOOH	ÙZ[™ÉÊH	‰ˆØÝ[Y[š\ÚXš[]TÝ]HOOH	ÚY[‰È	‰ˆYØÝ[Y[˜›ÙK˜Û\ÜÓ\Ý˜ÛÛZ[œÊ	Ü™\Ü[™ÉÊNÂˆYˆ
U’QUÔÕË
HÈ’QUÔÕËH’QUÔÕË›\ÝH›ÝÎÈ’QUÔÕËœÜ[ˆHšY]ÔÜ[ŠÑ‘Ë™ÛØ™JNÈBˆÛÛœÝHX]›Z[Š‹
›ÝÈH’QUÔÕË›\Ý
HÈL
NÈ’QUÔÕË›\ÝH›ÝÎÂˆYˆ
[]™H’QUÔÕË˜\ÞJH™]\›ŽÂˆ’QUÔÕËÝÐÑ‘Ë™ÛØ™HÈ	ÙÛØ™IÈˆ	Ù›]	×H
ÏHÈËÈ[YHÛˆØÜ™Y[‹[ˆXXÚšY]ÂˆYˆ
ÑQS‹›Ûˆ	‰ˆPÑ‘Ë™ÛØ™H	‰ˆËœ\ÙHOOH	Ø[]™IÈ	‰ˆ˜[ÓY

HHH	‰ˆUË˜œ™XXÚ	‰ˆJ–›ÛY[ˆ	‰ˆQ–›ÛY[‹™š\™Y
JHÈËÈš]™H˜[ÈÜˆ™]Ù\ŽˆHÛØ™Bˆ’QUÔÕË˜\ÞHHYNÈØÝ[Y[˜›ÙK˜Û\ÜÓ\Ý˜Y
	Ý\›š[™ÉÊNÂˆÙ][Y[Ý]


HOˆÈYˆ
PÑ‘Ë™ÛØ™H	‰ˆVÕËØ[
HÈÕËÈHYNÈÕËØ[H	Ø]]ÉÎÈH[ÙHÈØÝ[Y[˜›ÙK˜Û\ÜÓ\Ýœ™[[Ý™J	Ý\›š[™ÉÊNÈ’QUÔÕË˜\ÞHH˜[ÙNÈHK
NÂˆ™]\›ŽÈBˆYˆ
Ñ‘Ë™ÛØ™H	‰ˆšY]ÓØÚÙY

JH™]\›ŽÂˆYˆ

›ÝÈH’QUÔÕË
HÈL’QUÔÕËœÜ[ŠH™]\›ŽÂˆÛÛœÝœ™YHHËœ\ÙHOOH	Ø[]™IÈ	‰ˆ›ÝÈH
Ë˜›Ü›ˆ
HˆLŒ	‰ˆUË˜œ™XXÚ	‰ˆJ–›ÛY[ˆ	‰ˆQ–›ÛY[‹™š\™Y
H	‰ˆTÕQÑK˜\ÞJŒ
NÂˆYˆ
Yœ™YJH™]\›ŽÂˆ’QUÔÕË˜\ÞHHYNÂˆØÝ[Y[˜›ÙK˜Û\ÜÓ\Ý˜Y
	Ý\›š[™ÉÊNÈÛÛœÝØ\ÈHÑ‘Ë™ÛØ™NÂˆÙ][Y[Ý]


HOˆÈYˆ
Ñ‘Ë™ÛØ™HOOHØ\È	‰ˆVÕËØ[
HÕËØ[H	Ø]]ÉÎÈ[ÙHÈØÝ[Y[˜›ÙK˜Û\ÜÓ\Ýœ™[[Ý™J	Ý\›š[™ÉÊNÈ’QUÔÕË˜\ÞHH˜[ÙNÈHK
NÂŸB‹ËÈH\›ˆ]Ù[ŽˆšYÚY\ˆHœ˜[YH\È˜]Û‹]œ˜[YH\ÈÛÜYYÛÈHØ[˜\ÈZYÝ™\ˆHÛÜ›HšY]Â‹ËÈÚ[™Ù\È™[™X]][™HÛÜH\ÜÛÛ™\È
[ˆX›Ý]HÙXÛÛ™[™H[ŠH[ÈH™]ÈšY]Ë‚˜ÛÛœÝÕÈHÈ[ˆ[Ýˆ[Ø[ˆ[Îˆ[ˆTŽˆMLÛŽˆ˜[ÙHNÂ™[˜Ý[Ûˆ\›•šY]Ê
HÈYˆ
È	‰ˆËœœ[ŠHÈ\
	ÐH™\^H\›œÈ\È]ÈÜšYÚ[˜[Y‰ËÍ
NÈ™]\›ŽÈHYˆ
VÕËØ[
HÕËØ[H	Ú[™	ÎÈB‹ËÈ^HHœ˜[YH\Ý˜]ÛˆÝ™\ˆHÛÜ›È\ÜÛÛ™HÝ™\ˆ\ˆ\È
Ý™\ˆH\ÜÛÛ™HÝ[[™\ˆØ^NˆÛˆÜÙˆ]\È]‹ËÈ›ÝÈÛÚÜËÛÈ›Ý[™È[\ÊKœ˜[YY\ÈHÛÜ›\Èœ˜[YY]][ÛY[™[˜Ý[ÛˆÝÓ^J\ŠHÂˆYˆ
VÕË™[
HÈÕË™[HØÝ[Y[˜Ü™X]Q[[Y[
	ØØ[˜\ÉÊNÈÕË™[šYH	ÞÝØ\	ÎÈÕË™[œÙ]]šX]J	Ø\šXKZY[‰Ë	ÝYIÊNÈØ[˜\Ë˜Y\ŠÕË™[
NÈÕË˜ÝHÕË™[™Ù]ÛÛ^
	Ì™	ËÈ[Nˆ˜[ÙHJNÈBˆžHÂˆÛÛœÝHHÕË›ÛˆÈX]›X^
X]›Z[ŠK\œÙQ›Ø]
ÕË™[œÝ[K›ÜXÚ]JH
JHˆš]HÕË™[ÚYOOHØ[˜\ËÚY	‰ˆÕË™[šZYÚOOHØ[˜\ËšZYÚÂˆYˆ
Yš]
HÈÕË™[ÚYHØ[˜\ËÚYÈÕË™[šZYÚHØ[˜\ËšZYÚÈBˆÕË˜Ý™ÛØ˜[[HHš]	‰ˆHˆŒˆÈHHHˆNÈÕË˜Ý™˜]Ò[XYÙJØ[˜\Ë
NÈÕË˜Ý™ÛØ˜[[HHNÂˆHØ]Ú
JHÈYˆ
ÕË˜Ý
HÕË˜Ý™ÛØ˜[[HHNÈ™]\›ˆ˜[ÙNÈBˆÕË™[œÝ[K˜[œÙ›Ü›SÜšYÚ[ˆHØ[˜\ËœÝ[K˜[œÙ›Ü›SÜšYÚ[ŽÈÕË™[œÝ[K˜[œÙ›Ü›HHØ[˜\ËœÝ[K˜[œÙ›Ü›NÂˆÕË™[œÝ[K›ÜXÚ]HH	ÌIÎÈÕË™[œÝ[K™\Ü^HH	Ø›ØÚÉÎÈÕËH\™›Ü›X[˜ÙK››ÝÊ
NÈÕË™\ˆH\ŽÈÕË›ÛˆHYNÈ™]\›ˆYNÂŸB‹ËÈHÛÙÝ]ˆÚ]›ˆÚ[™Ù\È
Hœ˜[Z[™ËHÛØ™IÜÈ\›ŠH\ÈÚ[™ÙYšYÚY\ˆHœ˜[YH\È˜]Û‹™[™X]]œ˜[YB‹ËÈZYÝ™\ˆHÛÜ›[™\ÜÛÛš[™ÎˆHÝ]]™]™\ˆ[\Ë[™›Ý[™ÈÝÙ\XÜ›ÜÜÈHØÜ™Y[ˆÈÝ›Ø™B™[˜Ý[ÛˆÛÙÝ]
›‹\ŠHÈYˆ
Ñ‘Ë˜Ø[XˆÚ[™ÝË—×Ó”ˆ
Ñ‘Ë™™ˆˆ	‰ˆÚ[U

HÑ‘Ë™™ŠJHÈ›Š
NÈ™]\›ŽÈBˆÛÛœÝHHÕË˜Ý]NÈÕË˜Ý]HHÈ›ŽˆHÈ

HOˆÈK™›Š
NÈ›Š
NÈHˆ›‹\Žˆ\ˆÓSÓÕ”ÓÑ•NÈB™[˜Ý[ÛˆÝÕXÚÊ›ÝÊHÂˆYˆ
ÕË˜Ý]JHÈÛÛœÝHHÕË˜Ý]NÈÕË˜Ý]HH[ÈÝÓ^JK™\ŠNÈžHÈK™›Š
NÈHØ]Ú
JHÈÛÛœÛÛK™\œ›ÜŠJNÈHBˆYˆ
ÕËØ[
HÂˆÛÛœÝ]]ÈHÕËØ[OOH	Ø]]ÉËÈHÕËÈOH[ÈÕËÈˆPÑ‘Ë™ÛØ™NÈÕËØ[H[ÈÕËÈH[ÂˆYˆ
ÈOOHÑ‘Ë™ÛØ™H
]]È	‰ˆ]È	‰ˆšY]ÓØÚÙY

JJHÈØÝ[Y[˜›ÙK˜Û\ÜÓ\Ýœ™[[Ý™J	Ý\›š[™ÉÊNÈ’QUÔÕË˜\ÞHH˜[ÙNÈ™]\›ŽÈHËÈ›Ý[™ÈÈ\›‹ÜˆHÛØ™H\È[ˆÝÓ^JÕË‘TŠNÂˆÙ]ÛØ™JË]]ÊNÂˆYˆ
]]ÊHÈ’QUÔÕËH\™›Ü›X[˜ÙK››ÝÊ
NÈ’QUÔÕËœÜ[ˆHšY]ÔÜ[ŠÑ‘Ë™ÛØ™JNÈÙ][Y[Ý]


HOˆØÝ[Y[˜›ÙK˜Û\ÜÓ\Ýœ™[[Ý™J	Ý\›š[™ÉÊKÌ
NÈÙ][Y[Ý]


HOˆÈ’QUÔÕË˜\ÞHH˜[ÙNÈKÕË‘TŠNÈBˆ™]\›ŽÂˆBˆYˆ
VÕË›ÛŠH™]\›ŽÂˆÛÛœÝHHX]›X^
X]›Z[ŠK
\™›Ü›X[˜ÙK››ÝÊ
HHÕË
HÈ
ÕË™\ˆÕË‘TŠJJKHHH
ˆH
ˆ
ÈHˆ
ˆJNÂˆÕË™[œÝ[K›ÜXÚ]HH
HHJKÑš^Y
ÊNÂˆYˆ
HHJHÈÕË›ÛˆH˜[ÙNÈÕË™[œÝ[K™\Ü^HH	Û›Û™IÎÈBŸB™[˜Ý[ÛˆÙ]ÛØ™JÛ‹]]ÊHÂˆYˆ
X]]ÊHÈ’QUÔÕËH\™›Ü›X[˜ÙK››ÝÊ
NÈ’QUÔÕËœÜ[ˆHšY]ÔÜ[ŠH[Û‹YJNÈHËÈ\›™YžH[™ˆHÝ[Ý\ÈYØZ[‚ˆYˆ
]]È	‰ˆ[Ûˆ	‰ˆPÑ‘Ë˜Ø[Xˆ	‰ˆ\Ù]ÛØ™K›X\ØZY	‰ˆÈ	‰ˆËœ\ÙHOOH	Ø[]™IÊHÈÙ]ÛØ™K›X\ØZYHYNÈÙ][Y[Ý]


HOˆÈYˆ
PÑ‘Ë™ÛØ™JHÈYˆ
TÕQÑK˜\ÞJ
JHXÚÙ\Š	ÕHX\ˆHÚÛHÛÜ›ZY›]›ÜˆH™]ÈÙXÛÛ™Ë‰Ë	Ý\	ËYJNÈHKMÌ
NÈHËÈ
ØZYHš\œÝ[YH[ˆHš\Ú]
BˆÑ‘Ë™ÛØ™HHH[ÛŽÈ	
	Ø‹YÛØ™IÊKœÙ]]šX]J	Ø\šXK\™\ÜÙY	ËÝš[™ÊÑ‘Ë™ÛØ™JJNÈØÝ[Y[˜›ÙK˜Û\ÜÓ\ÝÙÙÛJ	ÙÛØ™IËÑ‘Ë™ÛØ™JNÂˆYˆ
J‘TVH	‰ˆ‘TVK›]™JJHžHÈØØ[ÝÜ˜YÙKœÙ]][J	ÝÜ‹]šY]ÉËÑ‘Ë™ÛØ™HÈ	ÙÛØ™IÈˆ	Ù›]	ÊNÈHØ]Ú
JHßBˆYˆ
X]]ÊH\
Ñ‘Ë™ÛØ™HÈ	ÕHÛÜ›\ÈHÛØ™NˆXXÚ˜][ÛˆÛÈH\ÙˆH˜[™X\™\Ý]È\›‹ÙZYÚYžHÝÙ\‹[™H˜[\›œÈX›Ý]HÛÜ›8 &\ÈÙ[™K‰Èˆ	ÕHÛÜ›ZY›]\ÈHX\›Üˆ[ˆHZ[]K‰ËLŒ
NÂŸB™[˜Ý[ÛˆÙÙÛS]Ê
HÈYˆ
[˜ÛÙKšY[ŠHÙ][™[
˜[ÙJNÈ[˜ÛÙKšY[ˆHY[˜ÛÙKšY[ŽÈ	
	Ø‹[]ÉÊKœÙ]]šX]J	Ø\šXK\™\ÜÙY	ËÝš[™ÊY[˜ÛÙKšY[ŠJNÈ™[™\“]ÕšY]Ê
NÈB‚‹ÊˆOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOBˆ“ÓÕˆOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOH
‹Â™[˜Ý[Ûˆ›ÛÝ

HÂˆÛÛœÝ\œˆH[š]Ó

NÂˆYˆ
\œŠHÈ˜Z[Ú]
\œŠNÈ™]\›ŽÈBˆÚ\™J
NÈ™[™\“[™XYÙJ
NÂˆ™]ÕÛÜ›

NÂˆYˆ
Vš[ŠHš[›ÝJ	Ô™YXÙY™XÚ\Ú[Û‰Ë	Õ\È]šXÙH™[™\œÈHÛÜ›[ˆ[ˆ›Ø]Ëˆ]Ú[™HÛØ\œÙ\ˆ[™X^H[™ÛÛÛ™\‹‰Ë	ÜÞ\Ý[IÊNÂˆYˆ
Ñ‘Ë˜Ø[XŠHÈØ[X”[Š
NÈ™]\›ŽÈBˆÙ]\]™J
NÂˆ™\]Y\Ý[š[X][Û‘œ˜[YJOˆÈ\ÝHÈ™\]Y\Ý[š[X][Û‘œ˜[YJœ˜[YJNÈJNÂŸBÚ[™ÝË—×ÕÔˆHÈÙ]RS‘Ê
HÈ™]\›ˆRS‘ÎÈKÙ]ÕTŠ
HÈ™]\›ˆÕËœÝ\ˆË˜›[šÑ›Üˆ
ËœÝ]È	‰ˆËœÝ]Ëœ]\›ŠHNÈKÙ]ÒÕÊ
HÈ™]\›ˆÒÕÎÈKÙ]ÒÕ

HÈ™]\›ˆÒÕÈKÙ]‘TÔ•Ê
HÈ™]\›ˆ‘TÔ•ÎÈKÙ]Ò“ÓŠ
HÈ™]\›ˆÒ“ÓŽÈKÙ]Õ

HÈ™]\›ˆÕÈKXZÙT™\ÜÚÝÔ™\ÜÚÛÜÙTÝ][™\œžK]ŽˆÈ›Ü˜šYˆˆOˆÈU—Ñ“Ô’QHH]ŽÈK™\™XÝˆ

HOˆš[š\Ú™\™XÝ
ÈÚÎˆYHJK™\Ý[YNˆ[Oˆ™\Ý[YPY\Ø]\Ý›ÜJ[›X\
HOˆË›˜][ÛœÖÚWJJKØØ\Žˆ

HOˆØØ\•ÛÜ›

KÝYÙNˆ

HOˆÕQÑKX]ˆˆOˆÈYˆ
ˆOH[
HËšX]HŽÈ™]\›ˆÈX]ˆ
ÊËšX]
KÑš^Y
ÊKÝ™\ŽˆËšX]Ý™\ˆÈ
ÊÚ[U

HHËšX]Ý™\ŠKÑš^Y
JHˆÝ˜Z[Žˆ
ÊËšX]Ý˜Z[ˆ
KÑš^Y
JKXZÎˆ
ÊËšX]XZÈ
KÑš^Y
ÊHNÈK[ÙÜÎˆ

HOˆSÑÔË˜ÛÛ˜Ø]
È	‰ˆË˜[ÙÈÈÞÈŽˆË›‹Ú[™ˆ	Ü[›š[™ÉËˆ
ÜÚ[U

KÑš^Y
JK“ŽˆË›˜][ÛœË›[™ÝÙÎˆË˜[ÙÈWHˆ×JKXØÛÜ™ˆ

HOˆË˜XØÛÜ™	‰ˆÈÚYÛ™\œÎˆË‹‹•Ë˜XØÛÜ™œÚYÛ™\œ×K›X\
HOˆË›˜][ÛœÖÚWK›˜[YJKÝX\ŽˆË˜XØÛÜ™™ÝX\ˆ	‰ˆË˜XØÛÜ™™ÝX\‹›˜[YKØ\ˆË˜XØÛÜ™˜Ø\˜[ŽˆË˜XØÛÜ™˜˜[‹œÛXÙJ
KÝ™\ŽˆË˜XØÛÜ™›Ý™\‹YˆË˜XØÛÜ™›YœÛXÙJ
KšYYˆÈ‹‹•Ë˜XØÛÜ™šYYKÙX[YˆËœÙX[YK]ŽˆK™Ù]
	Ù]‰ÊHOOH	ÌIÈÈ
Ü˜ÈOˆ]˜[
Ü˜ÊJHˆ[™Yš[™YÛÛ™[™Nˆ
Ú[™
HOˆÈYˆ
Ú[™OOH	ØØ\	ÊHÛÛ™[™J	ØØ\	Ë[JNÈ[ÙHÈÛÛœÝœH™X\”Ú\ÛÛŠ
NÈYˆ
œ
HÛÛ™[™J	Ø˜[‰ËœJNÈ™]\›ˆH[œÈHKœ™XXÚˆ

HOˆË˜œ™XXÚ	‰ˆÈˆ
ÊÚ[U

HHË˜œ™XXÚ
KÑš^Y
JK™[ˆË˜œ™XXÚ™™[œÛXÙJ
KÚ\™NˆË˜œ™XXÚÚ\™H	‰ˆË˜œ™XXÚÚ\™K›˜[YHK˜[Žˆ
KŠHOˆÈÛÛœÝÝÈHÝ]K™ÝËÚHÝ]K™ÚˆHX]›X^
KX]œ›Ý[™
ˆ
ˆÚÈŠJKÞHX]œ›Ý[™
ÝÈÈˆ
È
ˆÚÈŠKÞHHX]œ›Ý[™
ÚÈˆ
ÈH
ˆÚÈŠKÈHˆ
ˆˆ
ÈNÂˆÛÛœÝˆHÈ
ˆÈ
ˆ[ˆHVš[‹H[ˆÈ™]ÈZ[M\œ˜^JŠK™š[
ÑL
Hˆ™]È›Ø]Ì\œ˜^JŠK™š[
˜SŠNÂˆÛ˜š[™^\™JÛ•VT‘WÌ‘Ý]K”ÖÜÝ]K˜Ý\—JNÈÛ^ÝX’[XYÙL‘
Û•VT‘WÌ‘X]›X^
ÞHŠKX]›X^
ÞHHŠKËËÛ”‘ÐK[ˆÈÛ’S—Ñ“ÐUˆÛ‘“ÐU
NÈ™]\›ˆØÞÞK—NÈK˜XÙNˆ

HOˆ
ÈXÝ]™NˆK˜XÝ]™K™ÎˆK˜™Ë\ÙNˆKœ\ÙKYˆKšY›ÝÜÎˆ
Kœ›ÝÜÈ×JK›X\
ˆOˆ‹›X™[
È	È	È
È‹œ™\ÊHJKZ[™Õ™\™XÝˆ

HOˆZ[™Õ™\™XÝ
YX\Ý\™J]™PYŠJK\ÙNˆ

HOˆËœ\ÙKRXYˆ

HOˆKšXY[™ÛÜ›ˆ
Ë
HOˆ[™ÛÜ›
Ë×K	ÉÊKX\›”Ú\ÛÛŽˆYÈOˆX\›”Ú\ÛÛŠYË›X\
YOˆ
ÈYŽˆ–WÒQÚYHJJKJK˜[ˆ
KÝÊHOˆ˜[˜][ÛŠË›˜][ÛœÖÚWKÝÊK™X\™Yˆ
KY
HOˆ™X\™Y
Ë›˜][ÛœÖÚWK–WÒQÚYJHKÙ]‘ŽˆˆOˆÈÑ‘Ë™™ˆHŽÈKÙÙÛNˆ
ËžJHOˆÙÙÛSYX\Ý\™JËžJKÝ\ˆ

HOˆÈÚ[TÝ\
Ëœ›ÙË]™PY‹ËœÝ\Ë›™]ÔÝ\
NÈËœÝ\
ÊÎÈKÙ]Ê
HÈ™]\›ˆÎÈKÓÔ”TËÚ[TÛÝ\˜ÙKÛÜÝ\™K™[™\Žˆ

HOˆ™[™\Š]™PYŠKÙ]Ý]J
HÈ™]\›ˆÝ]NÈKHNÂ˜›ÛÝ

NÂŸJJ
NÂ