let seed = 0; //seed Hash

function setup() {
   seed=int(fxrand() * 100000000); // FXHASH seed rand
   randomSeed(seed);

   gg = min(windowWidth, windowHeight);
  mywidth = gg;
  myheight = gg;
  createCanvas(gg, gg, WEBGL);
  scaler = 2400;
  pg = createGraphics(scaler, scaler, WEBGL);
  pg3 = createGraphics(scaler, scaler, WEBGL);
  pixelDensity(1);
  pg.pixelDensity(1);
  pg3.pixelDensity(1);
  colorMode(RGB, 255);

  if (random() > 0.5) {
    xc = color(32, 32, 32);
    bg = "Black";
  } else {
    xc = color(240, 240, 240);
    bg = "White";
  }
  pg.fill(xc);
  pg.rect(-scaler/2, -scaler/2, scaler, scaler);
  loopy2 = 0;
  loopy = 0;
  pg.noFill();
  pg.strokeWeight(0);
  myr = 255;
  myg = 255;
  myb = 255;
  x2 = random() * 400 - 200;
  y2 = random() * 400 - 200;
  x3 = random() * 400 - 200;
  y3 = random() * 400 - 200;
  x4 = random() * 400 - 200;
  y4 = random() * 400 - 200;
  for (h = 1; h < 1; h++) {
    x1 = x2;
    x2 = x3;
    x3 = x4;
    x4 = random() * 200 - 100 + x3;
    if (x4 > 1080) { x4 = 1080; }
    if (x4 < -1080) { x4 = -1080; }
    y1 = y2;
    y2 = y3;
    y3 = y4;
    y4 = random() * 200 - 99 + y3;
    if (y4 > 800) { y4 = 1080; }
    if (y4 < 0) { y4 = -1080; }
    if ((y4 - 400) * (y4 - 400) + (x4 - 400) * (x4 - 400) > 90000) {}
    pg.noFill();
    pg.bezier(x1, y1, x2, y2, x3, y3, x4, y4);
    myr = 255;
    myg = 255;
    myb = 255;
    c = color(myr, myg, myb);
    pg.fill(c);
    loopy = 0;
    pg.blendMode(BLEND);
  }
  c = color(32, 32, 32);
  pg.stroke(c);
  pg.strokeWeight(1);
  for (a = 0; a < 1600; a += 30) {
    //  line(random()*1600-1200, a-800,random()*1200, a-800);
  }
  iter = (Math.floor(random() * 3) + Math.floor(random() * 3)) * 10 + 70;
  swwhite = ((Math.floor(random() * 3) + Math.floor(random() * 3)) * 4 + 12)/10;
  swblack = ((Math.floor(random() * 3) + Math.floor(random() * 3)) * 4 + 12)/10;
  tintername = "None";
  tinter = 3;
  // FX Features
  window.$fxhashFeatures = {
    "Background": bg,
    "Iterations": iter,
    "White Stroke Width": swwhite,
    "Black Stroke Width": swblack,
  };
}

function draw() {
  loopy = loopy + 1;
  for (h = 1; h < iter/10; h++) {
    x1 = x2;
    x2 = x3;
    x3 = x4;
    if (loopy < 178) {
      x4 = random() * 320*(scaler+loopy*10)/2300 - 160*(scaler+loopy*10)/2300 + x3 / 1.01;
    }
    if (x4 > scaler/2) { x4 = scaler/2; }
    if (x4 < (-scaler/2 + scaler/20)) { x4 = -scaler/2 + scaler/20; }
    y1 = y2;
    y2 = y3;
    y3 = y4;
    if (loopy < 178) {
      y4 = random() * 320*(scaler+loopy*10)/2300 - 160*(scaler+loopy*10)/2300 + (y3 / 1.01);
    }
    if (y4 > scaler/2) { y4 = scaler/2; }
    if (y4 < (-scaler/2 + scaler/20)) { y4 = -scaler/2 + scaler/20; }
    pg.noFill();
    pg.bezier(x1, y1, x2, y2, x3, y3, x4, y4);
    pg.fill(c);
    for (g = 1; g < 2; g++) {
      steps = 400;
      for (let i = 0; i <= steps; i++) {
        let t = i / steps;
        let x = bezierPoint(x1 + g * 10, x2 + g * 10, x3 + g * 10, x4 + g * 10, t);
        let y = bezierPoint(y1, y2, y3, y4, t);
        c = color(20, 20, 20);
        pg.stroke(c);
        pg.strokeWeight(swblack);
        pg.fill(c);
        mypow = (28 - (loopy/10) * 1.3)* scaler/2160;
        gr1 = random() * mypow*mypow;
        gr2 = random() * mypow*mypow;
        pg.ellipse(x - gr1 / 1.9, y + gr2 / 1.9, gr1, gr2);
        c = color(myr, myg, myb, 255);
        pg.fill(c);
        pg.stroke(c);
        if (tinter>2) { c = color(240, 240, 240, 255); }
        // ellipse(x-gr1/2, y-gr2/2, gr1,gr2);
        if (loopy < 9) {
          //   c= color(200,200,200,255);
        } else {
          // c= color(200+loopy*2, 200+loopy*2, 200+loopy*2,255)
        }
        pg.fill(c);
        pg.stroke(c);
        pg.strokeWeight(swwhite);
        pg.ellipse(x - gr1 / 2, y, gr1, gr2);
      }
    }
  }
  if (loopy > 178) {
    loopy2 = loopy2 + 1;
    loopy = 178;
  }
  pg3.height = scaler;
  pg3.width = scaler;
  pg3.image(pg, -scaler/2, -scaler/2);
  pg3.height = gg;
  pg3.width = gg;
  image(pg3, -gg / 2, -gg / 2);
  if (loopy2 == 1) {
    fxpreview();
    noLoop();
  }
}

function keyTyped() {
  if (key == "s") {
    pgs = createGraphics(scaler, scaler, WEBGL);
    pgs.image(pg, -scaler/2, -scaler/2);
    saveCanvas(pgs, "Overgrowth", "jpg");
  }
}
