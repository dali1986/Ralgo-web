# Overgrowth preview recovery

`sketch.js` is the original Overgrowth generator supplied by Ralgo on 8 September 2026, with whitespace and formatting normalized. Its random calls, formulae and stop condition are preserved. `editions.json` records the 100 edition hashes and the 90 available feature sets from the official fxhash project 19030 metadata.

Verify all recorded traits without installing a rendering dependency:

```sh
node tools/overgrowth/render.cjs --verify-traits
```

To render edition #5 from its hash:

```sh
npm install --prefix tools/overgrowth
node tools/overgrowth/render.cjs --edition 5 --size 2400 --out /tmp/overgrowth
```

The renderer executes the supplied sketch in a Node VM with the original fxhash v1 PRNG and p5's seeded linear congruential generator. It runs all 179 frames until `fxpreview()` and exports the artwork buffer rather than the display buffer. No random replacement seed or generated substitute artwork is used.

The CPU drawing adapter uses 25-sided ellipses and separate fill/stroke layers. These reproduce p5 WEBGL's ellipse geometry and its foreground stroke depth for this planar sketch. Native Skia edge coverage, curve tessellation and stroke joins differ from the historical WebGL renderer. The recovery preserves the seeded composition, but is **not a pixel-identical original capture**. The installed p5 version in the inaccessible original IPFS package could not be independently established; p5 1.4.1 source was used to check the relevant historical behavior.

References:

- [Original fxhash v1 snippet preserved in a contemporary project](https://github.com/gre/gre/blob/2328ed2c3277a5562e5326e94a4c10138383d32b/doodles/plottable-thousands/index.html)
- [p5 1.4.1 seeded random](https://github.com/processing/p5.js/blob/v1.4.1/src/math/random.js)
- [p5 1.4.1 ellipse geometry](https://github.com/processing/p5.js/blob/v1.4.1/src/webgl/3d_primitives.js)
- [p5 1.4.1 stroke depth](https://github.com/processing/p5.js/blob/v1.4.1/src/webgl/shaders/line.vert)

See `../overgrowth-recovery.json` for the published asset provenance and comparison results. Existing verified previews are retained. The CPU recovery tool is not part of the normal Pages build.
