window.__ModuleLoader__.load({
  id: "dsh-nocturne-wallpaper",
  factory: function (require) {
    "use strict";
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    // Assigned when the wallpaper mounts. Scene initialisers use this context
    // to build their cached gradients when the canvas is created.
    let stageContext = null;

  const TAU = Math.PI * 2;
  const TARGET_FPS = 30;
  const MONO = '"SFMono-Regular", "SF Mono", Menlo, Consolas, "Liberation Mono", monospace';
  const reduceQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

  const clamp = (value, min, max) => value < min ? min : value > max ? max : value;
  const lerp = (a, b, t) => a + (b - a) * t;
  const smoothstep = (edge0, edge1, value) => {
    const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
  };

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function random() {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hash2(x, y, seed = 0) {
    const n = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453123;
    return n - Math.floor(n);
  }

  /* ----------------------------------------------------------------------- */
  /* Colour                                                                  */
  /* ----------------------------------------------------------------------- */

  function hexToRgb(hex) {
    const value = hex.replace("#", "");
    const full = value.length === 3 ? value.split("").map(c => c + c).join("") : value;
    return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)];
  }

  function mixRgb(a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  }

  function rgba(rgb, alpha) {
    return "rgba(" + Math.round(rgb[0]) + ", " + Math.round(rgb[1]) + ", " + Math.round(rgb[2]) + ", " + alpha + ")";
  }

  function verticalGradient(view, stops) {
    const gradient = stageContext.createLinearGradient(0, 0, 0, view.h);
    for (const stop of stops) gradient.addColorStop(stop[0], stop[1]);
    return gradient;
  }

  function radialLight(view, x, y, radius, inner, outer) {
    const gradient = stageContext.createRadialGradient(view.w * x, view.h * y, 0, view.w * x, view.h * y, Math.max(view.w, view.h) * radius);
    gradient.addColorStop(0, inner);
    gradient.addColorStop(.5, outer);
    gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
    return gradient;
  }

  const glowCache = new Map();
  function glowSprite(hex) {
    if (glowCache.has(hex)) return glowCache.get(hex);
    const size = 128;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");
    const [r, g, b] = hexToRgb(hex);
    const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, "rgba(" + r + "," + g + "," + b + ",.9)");
    gradient.addColorStop(.16, "rgba(" + r + "," + g + "," + b + ",.56)");
    gradient.addColorStop(.42, "rgba(" + r + "," + g + "," + b + ",.2)");
    gradient.addColorStop(.72, "rgba(" + r + "," + g + "," + b + ",.045)");
    gradient.addColorStop(1, "rgba(" + r + "," + g + "," + b + ",0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
    glowCache.set(hex, canvas);
    return canvas;
  }

  function drawGlow(context, color, x, y, radius, alpha) {
    const sprite = glowSprite(color);
    context.save();
    context.globalCompositeOperation = "lighter";
    context.globalAlpha = alpha;
    context.drawImage(sprite, x - radius, y - radius, radius * 2, radius * 2);
    context.restore();
  }

  /* ----------------------------------------------------------------------- */
  /* Grid, glyphs, and tiles                                                 */
  /* ----------------------------------------------------------------------- */

  function plot(context, view, gx, gy, character) {
    context.fillText(character, (gx + .5) * view.cw, (gy + .54) * view.ch);
  }

  function roundRectPath(context, x, y, w, h, r) {
    context.beginPath();
    context.moveTo(x + r, y);
    context.arcTo(x + w, y, x + w, y + h, r);
    context.arcTo(x + w, y + h, x, y + h, r);
    context.arcTo(x, y + h, x, y, r);
    context.arcTo(x, y, x + w, y, r);
    context.closePath();
  }

  // Glyph tiles are the signature look: each cell of a subject is a small
  // rounded key with a glyph pressed into it, so shapes read as a soft
  // mosaic instead of loose characters. Sprites are cached per colour.
  const tileCache = new Map();

  function tileFor(view, rgb) {
    const r = clamp(Math.round(rgb[0] / 6) * 6, 0, 255);
    const g = clamp(Math.round(rgb[1] / 6) * 6, 0, 255);
    const b = clamp(Math.round(rgb[2] / 6) * 6, 0, 255);
    const key = (r << 16) | (g << 8) | b;
    let entry = tileCache.get(key);
    if (entry !== undefined) return entry;

    const w = Math.max(2, Math.round(view.tileW * view.dpr));
    const h = Math.max(2, Math.round(view.tileH * view.dpr));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const context = canvas.getContext("2d");
    const base = [r, g, b];
    const fill = context.createLinearGradient(0, 0, 0, h);
    fill.addColorStop(0, rgba(mixRgb(base, [255, 255, 255], .12), 1));
    fill.addColorStop(1, rgba(mixRgb(base, [0, 0, 0], .1), 1));
    roundRectPath(context, 0, 0, w, h, Math.min(w, h) * .24);
    context.fillStyle = fill;
    context.fill();
    context.save();
    context.clip();
    context.fillStyle = "rgba(255, 255, 255, .22)";
    context.fillRect(0, 0, w, Math.max(1, Math.round(view.dpr)));
    context.restore();

    const luminance = (.2126 * r + .7152 * g + .0722 * b) / 255;
    const ink = luminance > .5 ? mixRgb(base, [10, 12, 18], .64) : mixRgb(base, [255, 255, 255], .66);
    entry = { canvas, ink: rgba(ink, .9) };
    if (tileCache.size > 1200) tileCache.clear();
    tileCache.set(key, entry);
    return entry;
  }

  function tile(context, view, gx, gy, rgb, glyph) {
    if (gx < 0 || gy < 0 || gx >= view.cols || gy >= view.rows) return;
    const entry = tileFor(view, rgb);
    context.drawImage(entry.canvas, gx * view.cw + view.tileX, gy * view.ch + view.tileY, view.tileW, view.tileH);
    if (glyph) {
      context.fillStyle = entry.ink;
      context.fillText(glyph, (gx + .5) * view.cw, (gy + .54) * view.ch);
    }
  }

  // Glyphs pressed into tiles, from light to dense. A few cells take an
  // alternate so large shapes never look stamped.
  const GLYPH_STEPS = [".", ":", "t", "%", "S"];
  const GLYPH_ALTS = [",", ";", "x", "&", "$"];
  function densityGlyph(value, x, y) {
    const index = clamp(Math.floor(value * GLYPH_STEPS.length), 0, GLYPH_STEPS.length - 1);
    return hash2(x, y, 9.7) > .86 ? GLYPH_ALTS[index] : GLYPH_STEPS[index];
  }

  // Half-width, in pixels, of the column the conversation usually occupies.
  function chatHalfWidth(view) {
    return clamp(430 / view.w, .22, .4) * view.w;
  }

  // A soft centre-weighted field: 0 at the edges, ~1 behind the chat column,
  // slightly lower toward the top so the upper half keeps more detail. Scenes
  // read it to thin glyphs where text sits, without a hard mask edge.
  function buildQuietField(view) {
    const field = new Float32Array(view.cols * view.rows);
    const halfColumn = chatHalfWidth(view);
    for (let y = 0; y < view.rows; y++) {
      const ny = ((y + .5) * view.ch - view.h * .56) / (view.h * .72);
      for (let x = 0; x < view.cols; x++) {
        const nx = ((x + .5) * view.cw - view.w * .5) / halfColumn;
        field[y * view.cols + x] = 1 - smoothstep(.22, 1.08, Math.sqrt(nx * nx + ny * ny));
      }
    }
    return field;
  }

  function quietAt(view, gx, gy) {
    if (view.quiet === undefined || gx < 0 || gy < 0 || gx >= view.cols || gy >= view.rows) return 0;
    return view.quiet[gy * view.cols + gx];
  }

  // One faint rounded cell, repeated as a pattern behind every scene.
  function buildGridCell(view) {
    const w = Math.max(4, Math.round(view.cw * view.dpr));
    const h = Math.max(4, Math.round(view.ch * view.dpr));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const context = canvas.getContext("2d");
    const line = Math.max(1, view.dpr * .8);
    context.strokeStyle = "#ffffff";
    context.lineWidth = line;
    roundRectPath(context, w * .07 + line / 2, h * .07 + line / 2, w * .86 - line, h * .86 - line, Math.min(w, h) * .22);
    context.stroke();
    return canvas;
  }

  function paintGrid(context, view, alpha) {
    if (!(alpha > 0) || view.gridCell === undefined) return;
    let pattern = view.gridPatterns.get(context);
    if (pattern === undefined) {
      pattern = context.createPattern(view.gridCell, "repeat");
      if (pattern !== null && typeof pattern.setTransform === "function" && typeof DOMMatrix === "function") {
        pattern.setTransform(new DOMMatrix([view.cw / view.gridCell.width, 0, 0, view.ch / view.gridCell.height, 0, 0]));
      }
      view.gridPatterns.set(context, pattern);
    }
    if (pattern === null) return;
    context.save();
    context.globalAlpha = alpha;
    context.fillStyle = pattern;
    context.fillRect(0, 0, view.w, view.h);
    context.restore();
  }

  // Called by the renderer after every resize, before scenes initialise.
  function prepareView(view) {
    view.font = "500 " + (view.ch * .62).toFixed(2) + "px " + MONO;
    const gapX = Math.max(1, view.cw * .13);
    const gapY = Math.max(1, view.ch * .13);
    view.tileW = view.cw - gapX;
    view.tileH = view.ch - gapY;
    view.tileX = gapX / 2;
    view.tileY = gapY / 2;
    view.px = 0;
    view.py = 0;
    view.quiet = buildQuietField(view);
    view.gridCell = buildGridCell(view);
    view.gridPatterns = new WeakMap();
    tileCache.clear();
  }

  // Layered pointer parallax in pixels. depth 1 moves with the stage; deeper
  // layers (< 1) lag behind it and nearer ones (> 1) lead.
  function parallaxX(view, depth) {
    return (view.px || 0) * (depth - 1);
  }

  function parallaxY(view, depth) {
    return (view.py || 0) * (depth - 1);
  }

  /* ----------------------------------------------------------------------- */
  /* Shared scene elements                                                   */
  /* ----------------------------------------------------------------------- */

  function makeStars(rng, count, top) {
    return Array.from({ length: count }, () => ({
      x: rng(),
      y: rng() * top,
      phase: rng() * TAU,
      speed: .25 + rng() * .8,
      weight: rng()
    }));
  }

  function drawStars(context, view, time, stars, bright, dim) {
    context.save();
    for (const star of stars) {
      const gx = Math.floor(star.x * view.cols);
      const gy = Math.floor(star.y * view.rows);
      if (star.weight < quietAt(view, gx, gy) * .85) continue;
      const shimmer = Math.sin(time * star.speed + star.phase) * .5 + .5;
      context.fillStyle = star.weight > .76 ? bright : dim;
      context.globalAlpha = .4 + shimmer * .6;
      plot(context, view, gx, gy, star.weight > .9 && shimmer > .62 ? "+" : shimmer > .4 ? "." : "'");
    }
    context.restore();
  }

  // Marine snow, plankton, and bubbles: specks that rise and sway.
  function makeDrift(rng, count, speedMin, speedRange) {
    return Array.from({ length: count }, () => ({
      x: rng(),
      y: rng(),
      speed: speedMin + rng() * speedRange,
      sway: .003 + rng() * .01,
      phase: rng() * TAU,
      depth: rng()
    }));
  }

  function drawDrift(context, view, time, specks, color, glyphs) {
    context.save();
    context.fillStyle = color;
    for (const speck of specks) {
      let y = (speck.y - time * speck.speed) % 1;
      if (y < 0) y += 1;
      const x = speck.x + Math.sin(time * .12 + speck.phase) * speck.sway + parallaxX(view, .4 + speck.depth) / view.w;
      const gx = Math.floor(x * view.cols);
      const gy = Math.floor(y * view.rows);
      if (speck.depth < quietAt(view, gx, gy) * .6) continue;
      plot(context, view, gx, gy, glyphs[Math.min(glyphs.length - 1, Math.floor(speck.depth * glyphs.length))]);
    }
    context.restore();
  }

  function drawCaustics(context, view, time, color, threshold) {
    context.save();
    context.fillStyle = color;
    for (let y = 1; y < view.rows; y += 2) {
      for (let x = 1; x < view.cols - 1; x++) {
        const wave = Math.sin(x * .2 + time * .19 + Math.sin(y * .3 + time * .15) * 1.4)
          + Math.sin(y * .38 - time * .25 + Math.cos(x * .15 + time * .1) * 1.2);
        if (wave > threshold + quietAt(view, x, y) * .5) plot(context, view, x, y, wave > threshold + .3 ? "~" : wave > threshold + .15 ? "-" : ".");
      }
    }
    context.restore();
  }

  function makeRipples(rng, count, yMin, yRange, radiusMin, radiusRange) {
    return Array.from({ length: count }, () => ({
      x: .08 + rng() * .84,
      y: yMin + rng() * yRange,
      offset: rng(),
      speed: .045 + rng() * .05,
      radius: radiusMin + rng() * radiusRange
    }));
  }

  function drawRipples(context, view, time, ripples, rgb, maxAlpha, squash) {
    context.save();
    for (const ripple of ripples) {
      const age = (ripple.offset + time * ripple.speed) % 1;
      const radius = age * ripple.radius * Math.min(view.w, view.h);
      if (radius < 4) continue;
      context.fillStyle = rgba(rgb, (Math.sin(age * Math.PI) * maxAlpha).toFixed(3));
      const steps = Math.min(120, Math.max(14, Math.ceil(TAU * radius / (view.cw * 1.4))));
      const cx = ripple.x * view.w;
      const cy = ripple.y * view.h;
      for (let i = 0; i < steps; i++) {
        const angle = i / steps * TAU;
        const px = cx + Math.cos(angle) * radius;
        const py = cy + Math.sin(angle) * radius * squash;
        plot(context, view, Math.floor(px / view.cw), Math.floor(py / view.ch), Math.abs(Math.sin(angle)) > .75 ? "-" : ".");
      }
    }
    context.restore();
  }

  // Soft, slowly swaying shafts of light from the surface.
  function makeShafts(rng, count, alpha) {
    return Array.from({ length: count }, (_, index) => ({
      x: (index + .3 + rng() * .4) / count,
      width: .05 + rng() * .07,
      phase: rng() * TAU,
      speed: .05 + rng() * .06,
      alpha: alpha * (.6 + rng() * .4)
    }));
  }

  function drawShafts(context, view, time, shafts, rgb) {
    context.save();
    context.globalCompositeOperation = "lighter";
    for (const shaft of shafts) {
      const cx = (shaft.x + Math.sin(time * shaft.speed + shaft.phase) * .025) * view.w;
      const half = shaft.width * view.w;
      const breath = .75 + .25 * Math.sin(time * shaft.speed * 3 + shaft.phase);
      const gradient = context.createLinearGradient(cx - half, 0, cx + half, 0);
      gradient.addColorStop(0, rgba(rgb, 0));
      gradient.addColorStop(.5, rgba(rgb, (shaft.alpha * breath).toFixed(4)));
      gradient.addColorStop(1, rgba(rgb, 0));
      context.save();
      context.transform(1, 0, -.18, 1, view.h * .09, 0);
      context.fillStyle = gradient;
      context.fillRect(cx - half, 0, half * 2, view.h);
      context.restore();
    }
    context.restore();
  }

  function makeRidge(view, rng, base, amplitude, peaks) {
    const s1 = rng() * 10;
    const s2 = rng() * 10;
    const peakA = .28 + rng() * .18;
    const peakB = .62 + rng() * .22;
    return Array.from({ length: view.cols }, (_, x) => {
      const nx = x / view.cols;
      let n = Math.sin(x * .05 + s1) * amplitude
        + Math.sin(x * .019 + s2) * amplitude * .82
        + Math.sin(x * .15 + s2) * amplitude * .25
        + Math.sin(x * .34 + s1 * 1.6) * amplitude * .08;
      if (peaks) {
        n -= Math.exp(-Math.pow((nx - peakA) / .15, 2)) * amplitude * 1.6
          + Math.exp(-Math.pow((nx - peakB) / .1, 2)) * amplitude * 1.15;
      }
      return Math.max(2, Math.floor((base + n) * view.rows));
    });
  }

  function makeBirds(rng, count, top, range) {
    return Array.from({ length: count }, () => ({
      x: rng(),
      y: top + rng() * range,
      speed: .0016 + rng() * .003,
      phase: rng() * TAU
    }));
  }

  function drawBirds(context, view, time, birds, color) {
    context.save();
    context.fillStyle = color;
    for (const bird of birds) {
      const x = ((bird.x + time * bird.speed) % 1.15) * view.w - view.w * .08;
      const y = bird.y * view.h + Math.sin(time * .3 + bird.phase) * 5;
      plot(context, view, Math.floor(x / view.cw), Math.floor(y / view.ch), Math.sin(time * 1.1 + bird.phase) > 0 ? "v" : "~");
    }
    context.restore();
  }

  // Tile clouds. Each cluster is a union of soft ellipses; its core becomes
  // tiles shaded top-to-bottom, and its fringe dissolves into loose glyphs.
  function makeCloudLayer(view, rng, options) {
    const margin = view.cols * .45;
    const wrap = view.cols + margin * 2;
    const portraitLift = view.h > view.w ? 1.4 : 1;
    const clusters = [];
    for (let i = 0; i < options.count; i++) {
      const width = lerp(options.width[0], options.width[1], rng()) * view.cols;
      const height = Math.max(2.6, width * (view.cw / view.ch) * lerp(options.ratio[0], options.ratio[1], rng()) * portraitLift);
      const puffs = [];
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      const count = 3 + Math.floor(rng() * 3);
      for (let p = 0; p < count; p++) {
        const dx = (rng() - .5) * width * .72;
        const dy = (rng() - .35) * height * .5;
        const rx = width * (.2 + .22 * rng());
        const ry = height * (.32 + .3 * rng());
        puffs.push({ dx, dy, rx, ry });
        minX = Math.min(minX, dx - rx);
        maxX = Math.max(maxX, dx + rx);
        minY = Math.min(minY, dy - ry);
        maxY = Math.max(maxY, dy + ry);
      }
      clusters.push({
        baseX: (i + .25 + rng() * .5) / options.count * wrap,
        baseY: view.rows * lerp(options.y[0], options.y[1], rng()),
        bobSpeed: .09 + rng() * .08,
        puffs, minX, maxX, minY, maxY,
        seed: rng() * 80
      });
    }
    return { ...options, clusters, margin, wrap, edgeStyle: rgba(options.top, .5) };
  }

  function drawCloudLayer(context, view, time, layer) {
    context.save();
    context.globalAlpha = layer.alpha;
    for (const cluster of layer.clusters) {
      let cx = cluster.baseX + time * layer.speed + parallaxX(view, layer.depth) / view.cw;
      cx = ((cx % layer.wrap) + layer.wrap) % layer.wrap - layer.margin;
      const cy = cluster.baseY
        + Math.sin(time * cluster.bobSpeed + cluster.seed) * layer.bob
        + Math.sin(time * cluster.bobSpeed * 2.3 + cluster.seed * 1.7) * layer.bob * .3
        + parallaxY(view, layer.depth) / view.ch;
      const x0 = Math.max(0, Math.floor(cx + cluster.minX));
      const x1 = Math.min(view.cols - 1, Math.ceil(cx + cluster.maxX));
      const y0 = Math.max(0, Math.floor(cy + cluster.minY));
      const y1 = Math.min(view.rows - 1, Math.ceil(cy + cluster.maxY));
      const anchorX = Math.round(cx);
      const anchorY = Math.round(cy);
      for (let y = y0; y <= y1; y++) {
        const vertical = clamp((y - cy - cluster.minY) / (cluster.maxY - cluster.minY), 0, 1);
        for (let x = x0; x <= x1; x++) {
          let density = 0;
          for (const puff of cluster.puffs) {
            const nx = (x - cx - puff.dx) / puff.rx;
            const ny = (y - cy - puff.dy) / puff.ry;
            const q = 1 - nx * nx - ny * ny;
            if (q > density) density = q;
          }
          if (density <= .04) continue;
          const lx = x - anchorX;
          const ly = y - anchorY;
          const texture = Math.sin((lx + cluster.seed) * .71 + ly * 1.13 + time * .3) * .05;
          const body = Math.sqrt(density) * (1 - quietAt(view, x, y) * .3) + texture;
          if (body < .32) {
            if (body < .16 || hash2(lx, ly, cluster.seed) < .6) continue;
            context.fillStyle = layer.edgeStyle;
            plot(context, view, x, y, body > .25 ? ":" : ".");
            continue;
          }
          const shade = clamp(vertical * .85 + (1 - body) * .25, 0, 1);
          tile(context, view, x, y, mixRgb(layer.top, layer.bottom, shade), densityGlyph(clamp((body - .32) / .62, 0, 1) * .82, lx, ly));
        }
      }
    }
    context.restore();
  }

  /* ----------------------------------------------------------------------- */
  /* Mote — the small resident creature                                      */
  /* ----------------------------------------------------------------------- */

  // b body, h highlight, s shade, c cheek, l leaf. Eyes and feet are drawn
  // separately so they can blink, look, and step.
  const MOTE_SPRITE = [
    ".....l....",
    "....ll....",
    "..hhbbbb..",
    ".hbbbbbbb.",
    "bbbbbbbbbb",
    "bbbbbbbbbb",
    "bbbbbbbbbb",
    "cbbbbbbbbc",
    ".ssssssss."
  ];

  class Mote {
    constructor() {
      this.x = -1;
      this.target = -1;
      this.facing = -1;
      this.mode = "idle";
      this.timer = 1.5;
      this.walk = 0;
      this.hop = 0;
      this.blink = 0;
      this.nextBlink = 2.4;
      this.time = 0;
    }

    // The creature lives on a ledge in the lower-right margin, beside the
    // composer and just above the Nocturne pill.
    bounds(view) {
      const min = Math.max(view.w * .8, view.w - 210);
      return [min, Math.max(min + 24, view.w - 34)];
    }

    update(dt, view, speed) {
      const [min, max] = this.bounds(view);
      if (this.x < 0 || this.x < min - 40 || this.x > max + 40) {
        this.x = lerp(min, max, .65);
        this.target = this.x;
      }
      this.time += dt;
      this.nextBlink -= dt;
      if (this.blink > 0) this.blink = Math.max(0, this.blink - dt);
      if (this.nextBlink <= 0) {
        this.blink = .15;
        this.nextBlink = 2.2 + Math.random() * 4.2;
      }
      if (this.hop > 0) this.hop = Math.max(0, this.hop - dt / .46);

      if (this.mode === "walk") {
        const step = 15 * speed * dt;
        const delta = this.target - this.x;
        this.facing = delta < 0 ? -1 : 1;
        this.walk += dt * 7.5 * speed;
        if (Math.abs(delta) <= step) {
          this.x = this.target;
          this.mode = "idle";
          this.timer = 2.4 + Math.random() * 5;
        } else {
          this.x += Math.sign(delta) * step;
        }
      } else {
        this.timer -= dt * speed;
        if (this.timer <= 0) {
          if (Math.random() < .28) {
            this.hop = 1;
            this.timer = 1.2 + Math.random() * 2;
          } else {
            this.target = lerp(min, max, Math.random());
            this.mode = Math.abs(this.target - this.x) > 6 ? "walk" : "idle";
            this.timer = 1.5;
          }
        }
      }
    }

    draw(context, view, dark) {
      if (this.x < 0) return;
      const pixel = clamp(Math.round(view.w / 480), 2, 4);
      const width = MOTE_SPRITE[0].length * pixel;
      const height = (MOTE_SPRITE.length + 1) * pixel;
      const hopLift = Math.sin(this.hop * Math.PI) * pixel * 3.2;
      const breathe = this.mode === "idle" && this.hop === 0 && Math.sin(this.time * 2.1) > .55 ? pixel : 0;
      const left = Math.round(this.x - width / 2);
      const floor = Math.round(view.h - 62);
      const top = Math.round(floor - height - hopLift) + breathe;
      const palette = dark
        ? { b: "#ff8c9c", h: "#ffd7dd", s: "#e06a80", c: "#ffb3be", l: "#9fe8b4", eye: "#2b1219", foot: "#d85d74" }
        : { b: "#e45d73", h: "#ffb0bc", s: "#b23f57", c: "#f88a9b", l: "#5aa874", eye: "#2b1219", foot: "#a23c52" };

      context.save();
      context.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
      context.globalCompositeOperation = "source-over";
      if (dark) drawGlow(context, "#ff8c9c", left + width / 2, top + height * .55, width * 1.7, .16);
      context.globalAlpha = dark ? .28 : .16;
      context.fillStyle = "#000000";
      const shadow = Math.round(width * (.8 - hopLift / (pixel * 16)));
      context.fillRect(left + Math.round((width - shadow) / 2), floor + pixel, shadow, pixel);
      context.globalAlpha = 1;

      for (let row = 0; row < MOTE_SPRITE.length; row++) {
        const line = MOTE_SPRITE[row];
        for (let col = 0; col < line.length; col++) {
          const key = line[col];
          if (key === ".") continue;
          context.fillStyle = palette[key];
          context.fillRect(left + col * pixel, top + row * pixel, pixel, pixel);
        }
      }

      context.fillStyle = palette.eye;
      const look = this.facing > 0 ? 1 : 0;
      const eyeRows = this.blink > 0 ? [6] : [5, 6];
      for (const row of eyeRows) {
        context.fillRect(left + (2 + look) * pixel, top + row * pixel, pixel, pixel);
        context.fillRect(left + (6 + look) * pixel, top + row * pixel, pixel, pixel);
      }

      context.fillStyle = palette.foot;
      const stride = this.mode === "walk" && Math.sin(this.walk) > 0 ? 1 : 0;
      const footY = top + MOTE_SPRITE.length * pixel;
      context.fillRect(left + (2 + stride) * pixel, footY, pixel, pixel);
      context.fillRect(left + (7 - stride) * pixel, footY, pixel, pixel);
      context.restore();
    }
  }

  function bladeCharacter(context, view, blade, time) {
    const steps = Math.max(3, Math.round(blade.height));
    for (let step = 0; step <= steps; step++) {
      const q = step / steps;
      const x = blade.x + Math.sin(time * blade.speed + blade.phase + q * 2.8) * blade.sway * Math.pow(q, 1.7) + blade.lean * q;
      const y = view.h - q * blade.height * view.ch;
      if (y < -view.ch || x < -view.cw || x > view.w + view.cw) continue;
      const q2 = Math.min(1, q + .08);
      const x2 = blade.x + Math.sin(time * blade.speed + blade.phase + q2 * 2.8) * blade.sway * Math.pow(q2, 1.7) + blade.lean * q2;
      const dx = x2 - x;
      const character = dx > view.cw * .2 ? "/" : dx < -view.cw * .2 ? "\\" : "|";
      const gx = Math.floor(x / view.cw);
      const gy = Math.floor(y / view.ch);
      plot(context, view, gx, gy, character);
    }
    if (blade.head) {
      const x = blade.x + Math.sin(time * blade.speed + blade.phase + 2.8) * blade.sway + blade.lean;
      const y = view.h - blade.height * view.ch;
      plot(context, view, Math.floor(x / view.cw), Math.floor(y / view.ch), blade.head);
    }
  }

  function drawMountainSilhouette(context, view, ridge, baseRow, fill, edge, edgeAlpha) {
    context.save();
    context.fillStyle = fill;
    context.beginPath();
    context.moveTo(-view.cw, baseRow * view.ch);
    for (let x = 0; x < view.cols; x++) {
      context.lineTo((x + .5) * view.cw, (ridge[x] + .5) * view.ch);
    }
    context.lineTo(view.w + view.cw, baseRow * view.ch);
    context.closePath();
    context.fill();
    context.restore();

    context.save();
    context.globalAlpha = edgeAlpha * .2;
    context.fillStyle = edge;
    for (let x = 2; x < view.cols; x += 5) {
      const y = ridge[x];
      for (let k = 1; k <= 3; k++) {
        if (hash2(x, k, 8.4) < .42) continue;
        const ty = y + k * 2;
        if (ty >= baseRow) break;
        plot(context, view, x, ty, k === 1 ? ":" : ".");
      }
    }
    context.restore();

    context.save();
    context.globalAlpha = edgeAlpha;
    context.fillStyle = edge;
    for (let x = 0; x < view.cols; x++) {
      const y = Math.round(ridge[x]);
      const slope = ridge[Math.min(view.cols - 1, x + 1)] - ridge[Math.max(0, x - 1)];
      if (Math.abs(slope) < .55 && hash2(x, 1, 9.1) < .52) continue;
      const character = slope < -1 ? "^" : slope > 1 ? "." : (x % 9 === 0 ? "#" : "-");
      plot(context, view, x, y, character);
      if (x % 13 === 0 && y + 2 < baseRow) plot(context, view, x, y + 2, ".");
      if (x % 23 === 0 && y + 4 < baseRow) plot(context, view, x, y + 4, "'");
    }
    context.globalAlpha = edgeAlpha * .34;
    for (let x = 1; x < view.cols; x += 3) {
      const top = ridge[x];
      for (let y = top + 2; y < baseRow; y += 3) {
        if (hash2(x, y, 6.2) < .48) continue;
        plot(context, view, x, y, hash2(x, y, 3.3) > .6 ? ":" : ".");
      }
    }
    context.restore();
  }

  /* ----------------------------------------------------------------------- */
  /* Cloud Drift                                                             */
  /* ----------------------------------------------------------------------- */

  const CLOUD_LAYERS = [
    { count: 4, speed: .26, depth: .55, bob: .35, width: [.16, .26], ratio: [.22, .32], y: [.07, .21], haze: .45 },
    { count: 3, speed: .55, depth: 1, bob: .5, width: [.22, .34], ratio: [.2, .3], y: [.24, .4], haze: .2 },
    { count: 3, speed: 1, depth: 1.6, bob: .7, width: [.28, .42], ratio: [.18, .27], y: [.62, .8], haze: 0 }
  ];

  class CloudDrift {
    constructor(preset) {
      this.preset = preset;
      this.id = preset.id;
      this.group = preset.group;
      this.title = preset.title;
      this.tag = preset.tag;
      this.caption = preset.caption;
      this.accent = preset.accent;
      this.gridAlpha = preset.grid;
    }

    init(view) {
      const preset = this.preset;
      const rng = mulberry32(preset.seed);
      this.background = verticalGradient(view, preset.sky);
      const sun = preset.sun;
      this.sun = {
        x: view.w * sun.x,
        y: view.h * sun.y,
        radius: Math.min(view.w, view.h) * sun.radius,
        glow: sun.glow,
        core: hexToRgb(sun.core),
        rim: hexToRgb(sun.rim)
      };
      this.stars = makeStars(rng, Math.round(view.cols * preset.stars), preset.starTop);
      const light = hexToRgb(preset.cloud.light);
      const shade = hexToRgb(preset.cloud.shade);
      const haze = hexToRgb(preset.cloud.haze);
      this.layers = CLOUD_LAYERS.map((spec, index) => makeCloudLayer(view, rng, {
        ...spec,
        alpha: preset.cloud.alpha[index],
        top: mixRgb(light, haze, spec.haze),
        bottom: mixRgb(shade, haze, spec.haze)
      }));
      this.birds = makeBirds(rng, preset.birds, .2, .18);
    }

    // Background fills only. Also used to build the centre quiet plate.
    paintBase(context, view) {
      context.fillStyle = this.background;
      context.fillRect(0, 0, view.w, view.h);
      paintGrid(context, view, this.gridAlpha);
    }

    draw(context, view, time) {
      this.paintBase(context, view);
      if (this.stars.length > 0) drawStars(context, view, time, this.stars, this.preset.starBright, this.preset.starDim);
      drawCloudLayer(context, view, time, this.layers[0]);
      this.drawSun(context, view, time);
      drawCloudLayer(context, view, time, this.layers[1]);
      drawCloudLayer(context, view, time, this.layers[2]);
      drawBirds(context, view, time, this.birds, this.preset.birdColor);
    }

    drawSun(context, view, time) {
      const sun = this.sun;
      const breath = 1 + Math.sin(time * .42) * .07 + Math.sin(time * 1.13) * .025;
      drawGlow(context, sun.glow, sun.x, sun.y, sun.radius * 3.6 * breath, .16);
      drawGlow(context, sun.glow, sun.x, sun.y, sun.radius * 1.6 * breath, .42);
      const radius = sun.radius * .5;
      const x0 = Math.max(0, Math.floor((sun.x - radius) / view.cw));
      const x1 = Math.min(view.cols - 1, Math.ceil((sun.x + radius) / view.cw));
      const y0 = Math.max(0, Math.floor((sun.y - radius) / view.ch));
      const y1 = Math.min(view.rows - 1, Math.ceil((sun.y + radius) / view.ch));
      context.save();
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const dx = ((x + .5) * view.cw - sun.x) / radius;
          const dy = ((y + .5) * view.ch - sun.y) / radius;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d > 1) continue;
          tile(context, view, x, y, mixRgb(sun.core, sun.rim, d * d), d < .4 ? "@" : d < .75 ? "%" : ":");
        }
      }
      context.restore();
    }
  }

  const SKY = { name: "sky", label: "Sky" };

  const CLOUD_VARIANTS = [
    {
      id: "cloud-sunrise",
      group: SKY,
      title: "Cloud Drift · Sunrise",
      tag: "Weather · Sunrise",
      caption: "The sky wakes slowly, one character at a time.",
      accent: "#efb38f",
      seed: 0xC101,
      grid: .03,
      sky: [[0, "#0d1734"], [.3, "#26395e"], [.56, "#6d6688"], [.75, "#d48b77"], [.9, "#f4bb8c"], [1, "#3c2531"]],
      sun: { x: .76, y: .64, radius: .1, glow: "#ffb48a", core: "#fff1dc", rim: "#ffb98e" },
      stars: .18,
      starTop: .42,
      starBright: "rgba(250, 236, 214, .75)",
      starDim: "rgba(228, 224, 214, .36)",
      cloud: { light: "#ffeadc", shade: "#d9a1a0", haze: "#5d5f86", alpha: [.5, .74, .94] },
      birds: 3,
      birdColor: "rgba(30, 28, 40, .62)"
    },
    {
      id: "cloud-afternoon",
      group: SKY,
      title: "Cloud Drift · Afternoon",
      tag: "Weather · Afternoon",
      caption: "A wide, quiet sky in the middle of the day.",
      accent: "#d8c59d",
      seed: 0xC202,
      grid: .045,
      sky: [[0, "#2b6c9d"], [.42, "#5a9cc9"], [.78, "#a3cde6"], [1, "#d3e7f1"]],
      sun: { x: .82, y: .18, radius: .08, glow: "#fff1c8", core: "#fffdf2", rim: "#ffe9b4" },
      stars: 0,
      starTop: .3,
      starBright: "rgba(255, 255, 255, .5)",
      starDim: "rgba(255, 255, 255, .2)",
      cloud: { light: "#ffffff", shade: "#d3e1ec", haze: "#86b8d9", alpha: [.62, .84, .97] },
      birds: 4,
      birdColor: "rgba(28, 52, 74, .55)"
    },
    {
      id: "cloud-dusk",
      group: SKY,
      title: "Cloud Drift · Dusk",
      tag: "Weather · Dusk",
      caption: "A slow drift through the last warm light.",
      accent: "#e8b48e",
      seed: 0xC10D,
      grid: .03,
      sky: [[0, "#0a1126"], [.3, "#1e2d4c"], [.55, "#4f4d6e"], [.72, "#a36a7c"], [.86, "#e39c7d"], [1, "#2d1d27"]],
      sun: { x: .76, y: .5, radius: .12, glow: "#f6a77e", core: "#ffe6cc", rim: "#f8a983" },
      stars: .4,
      starTop: .48,
      starBright: "rgba(248, 234, 210, .8)",
      starDim: "rgba(226, 222, 212, .4)",
      cloud: { light: "#fad6c6", shade: "#b5839a", haze: "#4b4d70", alpha: [.52, .76, .94] },
      birds: 3,
      birdColor: "rgba(20, 22, 32, .66)"
    },
    {
      id: "cloud-evening",
      group: SKY,
      title: "Cloud Drift · Evening",
      tag: "Weather · Evening",
      caption: "Long shadows, cooling air, clouds in no hurry.",
      accent: "#c7a4b9",
      seed: 0xC303,
      grid: .035,
      sky: [[0, "#070a1d"], [.34, "#161d3e"], [.62, "#34305c"], [.8, "#6c4c74"], [.92, "#9e6479"], [1, "#1b1426"]],
      sun: { x: .72, y: .44, radius: .075, glow: "#dda8c2", core: "#fff0f4", rim: "#e8b2c8" },
      stars: .5,
      starTop: .55,
      starBright: "rgba(242, 232, 238, .74)",
      starDim: "rgba(200, 200, 220, .36)",
      cloud: { light: "#dccbee", shade: "#7e6ca0", haze: "#2f315a", alpha: [.5, .74, .92] },
      birds: 2,
      birdColor: "rgba(12, 14, 26, .7)"
    },
    {
      id: "cloud-night",
      group: SKY,
      title: "Cloud Drift · Night",
      tag: "Weather · Night",
      caption: "A field of stars behind slow silver weather.",
      accent: "#abc7d7",
      seed: 0xC404,
      grid: .045,
      sky: [[0, "#040819"], [.4, "#0c1736"], [.76, "#1b2c56"], [1, "#0a1022"]],
      sun: { x: .72, y: .22, radius: .06, glow: "#cfe0f0", core: "#f6f6ee", rim: "#c8d6e6" },
      stars: .85,
      starTop: .62,
      starBright: "rgba(232, 242, 248, .82)",
      starDim: "rgba(170, 196, 220, .4)",
      cloud: { light: "#97a5e6", shade: "#4b5aa8", haze: "#1b2549", alpha: [.46, .7, .88] },
      birds: 1,
      birdColor: "rgba(4, 8, 16, .8)"
    }
  ];

  /* ----------------------------------------------------------------------- */
  /* Fireflies                                                               */
  /* ----------------------------------------------------------------------- */

  class Fireflies {
    constructor() {
      this.id = "fireflies";
      this.group = { name: "night", label: "Night" };
      this.title = "Fireflies";
      this.tag = "Meadow · After rain";
      this.caption = "A meadow after rain, keeping time in small bursts of light.";
      this.accent = "#d9e18b";
      this.gridAlpha = .028;
    }

    init(view) {
      const rng = mulberry32(0xF1E5);
      this.background = verticalGradient(view, [[0, "#040b0a"], [.42, "#0a1a14"], [.7, "#10291d"], [.86, "#0a1c13"], [1, "#030806"]]);
      this.haze = radialLight(view, .5, .7, .62, "rgba(98, 138, 80, .16)", "rgba(40, 70, 40, .05)");
      this.stars = makeStars(rng, Math.max(24, Math.round(view.cols * .4)), .52);
      this.farRidge = makeRidge(view, rng, .62, .035, false);
      this.nearRidge = makeRidge(view, rng, .69, .028, false);
      const blades = (count, minHeight, maxHeight, swayMin, swayMax, heads) => Array.from({ length: count }, () => ({
        x: rng() * view.w,
        height: lerp(minHeight, maxHeight, rng()),
        phase: rng() * TAU,
        speed: .45 + rng() * .8,
        sway: lerp(swayMin, swayMax, rng()),
        lean: (rng() - .5) * view.cw * 4,
        head: heads && rng() > .64 ? (rng() > .5 ? "*" : "'") : ""
      }));
      this.backBlades = blades(Math.round(view.cols * .5), 4, 11, 7, 22, false);
      this.frontBlades = blades(Math.round(view.cols * .75), 7, 18, 8, 34, true);
      this.reeds = Array.from({ length: 18 }, (_, index) => {
        const left = index < 9;
        return {
          x: left ? rng() * .17 * view.w : view.w - rng() * .16 * view.w,
          height: 12 + rng() * 15,
          phase: rng() * TAU,
          speed: .36 + rng() * .48,
          sway: 4 + rng() * 10,
          lean: (left ? 1 : -1) * (3 + rng() * 12),
          head: rng() > .55 ? (rng() > .5 ? "*" : "'") : ""
        };
      });
      const dim = hexToRgb("#7c7d3c");
      const warm = hexToRgb("#f6eb98");
      const lime = hexToRgb("#dcef8e");
      // Most of the swarm keeps to the edges of the meadow.
      this.fireflies = Array.from({ length: 60 }, (_, index) => ({
        x: index % 5 === 0 ? .1 + rng() * .8 : (rng() < .5 ? .03 + rng() * .3 : .67 + rng() * .3),
        y: .28 + rng() * .52,
        ax: .026 + rng() * .075,
        ay: .012 + rng() * .05,
        speed: .2 + rng() * .5,
        phase: rng() * TAU,
        blink: .3 + rng() * .34,
        size: index < 9 ? 12 + rng() * 8 : 5 + rng() * 8,
        glow: index % 4 === 0 ? "#dcef8e" : "#f3e8a1",
        dim,
        bright: index % 4 === 0 ? lime : warm
      }));
    }

    // Background fills only. Also used to build the centre quiet plate.
    paintBase(context, view) {
      context.fillStyle = this.background;
      context.fillRect(0, 0, view.w, view.h);
      context.fillStyle = this.haze;
      context.fillRect(0, 0, view.w, view.h);
      paintGrid(context, view, this.gridAlpha);
    }

    draw(context, view, time) {
      this.paintBase(context, view);
      drawStars(context, view, time, this.stars, "rgba(226, 232, 192, .58)", "rgba(185, 204, 178, .26)");

      context.save();
      context.translate(parallaxX(view, .6), parallaxY(view, .6));
      drawMountainSilhouette(context, view, this.farRidge, view.rows + 1, "rgba(7, 20, 13, .82)", "rgba(120, 153, 108, .3)", .6);
      context.translate(parallaxX(view, .85) - parallaxX(view, .6), parallaxY(view, .85) - parallaxY(view, .6));
      drawMountainSilhouette(context, view, this.nearRidge, view.rows + 1, "rgba(4, 12, 8, .92)", "rgba(122, 158, 111, .34)", .62);
      context.restore();

      context.save();
      context.fillStyle = "rgba(150, 172, 128, .12)";
      for (let i = 0; i < 4; i++) {
        const y = Math.floor(view.rows * (.64 + i * .014));
        const travel = Math.floor(time * (.7 + i * .16) + i * 37) % view.cols;
        for (let x = 0; x < view.cols; x += 4) {
          const px = (x + travel) % view.cols;
          if ((px + i) % 11 < 5) plot(context, view, px, y, i % 2 ? "-" : ".");
        }
      }
      context.fillStyle = "rgba(46, 86, 54, .72)";
      for (const blade of this.backBlades) bladeCharacter(context, view, blade, time);
      context.restore();

      this.drawSwarm(context, view, time);

      context.save();
      context.translate(parallaxX(view, 1.6), parallaxY(view, 1.4));
      context.fillStyle = "rgba(30, 70, 40, .96)";
      for (const blade of this.frontBlades) bladeCharacter(context, view, blade, time);
      context.fillStyle = "rgba(12, 32, 20, .98)";
      for (const reed of this.reeds) bladeCharacter(context, view, reed, time);
      context.restore();
    }

    drawSwarm(context, view, time) {
      for (const firefly of this.fireflies) {
        firefly._x = firefly.x * view.w
          + Math.sin(time * firefly.speed * .72 + firefly.phase) * firefly.ax * view.w
          + Math.sin(time * firefly.speed * .27 + firefly.phase * 2.3) * firefly.ax * view.w * .35;
        firefly._y = firefly.y * view.h
          + Math.cos(time * firefly.speed * .54 + firefly.phase * 1.4) * firefly.ay * view.h
          + Math.sin(time * firefly.speed * .91 + firefly.phase * .8) * firefly.ay * view.h * .45;
        // Soft bell-shaped breath instead of a hard blink.
        const wave = Math.sin(time * firefly.blink + firefly.phase * 2.4) * .5 + .5;
        const quiet = quietAt(view, Math.floor(firefly._x / view.cw), Math.floor(firefly._y / view.ch));
        firefly._pulse = Math.pow(smoothstep(.28, 1, wave), 1.4) * (1 - quiet * .5);
      }

      context.save();
      context.globalCompositeOperation = "lighter";
      for (const firefly of this.fireflies) {
        const pulse = firefly._pulse;
        const sprite = glowSprite(firefly.glow);
        const halo = firefly.size * (1.6 + pulse * 1.8);
        context.globalAlpha = pulse * .11;
        context.drawImage(sprite, firefly._x - halo, firefly._y - halo, halo * 2, halo * 2);
        const radius = firefly.size * (.7 + pulse * .8);
        context.globalAlpha = .04 + pulse * .34;
        context.drawImage(sprite, firefly._x - radius, firefly._y - radius, radius * 2, radius * 2);
      }
      context.restore();

      context.save();
      for (const firefly of this.fireflies) {
        const pulse = firefly._pulse;
        const gx = Math.floor(firefly._x / view.cw);
        const gy = Math.floor(firefly._y / view.ch);
        if (pulse > .4) {
          context.globalAlpha = .45 + pulse * .55;
          tile(context, view, gx, gy, mixRgb(firefly.dim, firefly.bright, pulse), pulse > .8 ? "*" : "+");
        } else {
          context.globalAlpha = .25 + pulse;
          context.fillStyle = rgba(firefly.bright, .8);
          plot(context, view, gx, gy, ".");
        }
      }
      context.restore();
    }
  }

  /* ----------------------------------------------------------------------- */
  /* Moonlit                                                                 */
  /* ----------------------------------------------------------------------- */

  class Moonlit {
    constructor() {
      this.id = "moonlit";
      this.group = { name: "night", label: "Night" };
      this.title = "Moonlit";
      this.tag = "Night · Water";
      this.caption = "The lake keeps a second moon. Neither of them is still.";
      this.accent = "#c4dcdf";
      this.gridAlpha = .045;
    }

    init(view) {
      const context = stageContext;
      const rng = mulberry32(0xA10A);
      const horizon = view.rows * .7;
      this.horizon = horizon;
      this.moon = { x: view.w * .8, y: view.h * .2, radius: clamp(Math.min(view.w, view.h) * .16, 58, 180) };
      this.moonLight = hexToRgb("#f3eed8");
      this.moonDark = hexToRgb("#8f8d7e");

      const sky = context.createLinearGradient(0, 0, 0, horizon * view.ch);
      sky.addColorStop(0, "#050b20");
      sky.addColorStop(.55, "#0d1a3c");
      sky.addColorStop(1, "#1d3056");
      this.sky = sky;
      const lake = context.createLinearGradient(0, horizon * view.ch, 0, view.h);
      lake.addColorStop(0, "#172a4a");
      lake.addColorStop(.3, "#0c1830");
      lake.addColorStop(1, "#030814");
      this.lake = lake;
      this.farFill = context.createLinearGradient(0, view.h * .48, 0, horizon * view.ch);
      this.farFill.addColorStop(0, "#132342");
      this.farFill.addColorStop(1, "#0a1630");
      this.nearFill = context.createLinearGradient(0, view.h * .55, 0, horizon * view.ch);
      this.nearFill.addColorStop(0, "#0b1730");
      this.nearFill.addColorStop(1, "#040a18");

      this.stars = makeStars(rng, Math.max(44, Math.round(view.cols * .75)), .6);
      this.craters = Array.from({ length: 12 }, () => ({ x: (rng() - .5) * 1.5, y: (rng() - .5) * 1.5, r: .065 + rng() * .2 }));
      this.farRidge = makeRidge(view, rng, .6, .058, true);
      this.nearRidge = makeRidge(view, rng, .655, .041, true);
      this.clouds = makeCloudLayer(view, rng, {
        count: 3, speed: .32, depth: .8, bob: .3, alpha: .8,
        width: [.18, .3], ratio: [.1, .16], y: [.1, .44],
        top: hexToRgb("#929fe2"), bottom: hexToRgb("#4b58a6")
      });
      this.mist = Array.from({ length: 5 }, () => ({
        x: rng(), y: .68 + rng() * .05, width: .18 + rng() * .3, speed: .002 + rng() * .005, phase: rng() * TAU
      }));
      this.reeds = Array.from({ length: 20 }, (_, index) => {
        const left = index < 10;
        return {
          x: left ? rng() * .2 * view.w : view.w - rng() * .21 * view.w,
          height: 9 + rng() * 18,
          phase: rng() * TAU,
          speed: .3 + rng() * .5,
          sway: 3 + rng() * 11,
          lean: (left ? 1 : -1) * rng() * 22,
          head: rng() > .45 ? (rng() > .5 ? "*" : "o") : ""
        };
      });
      this.birds = makeBirds(rng, 3, .17, .13);
      this.boat = { x: .3, y: .8, phase: rng() * TAU };
      this.lantern = hexToRgb("#f6cc8a");
    }

    // Background fills only. Also used to build the centre quiet plate.
    paintBase(context, view) {
      context.fillStyle = this.sky;
      context.fillRect(0, 0, view.w, this.horizon * view.ch);
      context.fillStyle = this.lake;
      context.fillRect(0, this.horizon * view.ch, view.w, view.h - this.horizon * view.ch);
      paintGrid(context, view, this.gridAlpha);
    }

    draw(context, view, time) {
      this.paintBase(context, view);
      drawStars(context, view, time, this.stars, "rgba(238, 240, 228, .7)", "rgba(178, 200, 226, .3)");
      this.drawMoon(context, view, time);
      drawCloudLayer(context, view, time, this.clouds);

      context.save();
      context.translate(parallaxX(view, .7), 0);
      drawMountainSilhouette(context, view, this.farRidge, this.horizon, this.farFill, "rgba(140, 162, 196, .24)", .6);
      context.translate(parallaxX(view, .88) - parallaxX(view, .7), 0);
      drawMountainSilhouette(context, view, this.nearRidge, this.horizon, this.nearFill, "rgba(146, 168, 200, .3)", .62);
      context.restore();

      this.drawMist(context, view, time);
      this.drawWater(context, view, time);
      this.drawReflection(context, view, time);
      this.drawBoat(context, view, time);
      drawBirds(context, view, time, this.birds, "rgba(4, 10, 20, .86)");

      context.save();
      context.fillStyle = "rgba(6, 12, 22, .96)";
      for (const reed of this.reeds) bladeCharacter(context, view, reed, time);
      context.restore();
    }

    drawMoon(context, view, time) {
      const { x: cx, y: cy, radius } = this.moon;
      const breath = Math.sin(time * .21) * .5 + .5;
      drawGlow(context, "#c9dbe0", cx, cy, radius * 4.2, .14 + breath * .04);
      drawGlow(context, "#e6ecdf", cx, cy, radius * 2.2, .3 + breath * .06);
      const x0 = Math.max(0, Math.floor((cx - radius) / view.cw));
      const x1 = Math.min(view.cols - 1, Math.ceil((cx + radius) / view.cw));
      const y0 = Math.max(0, Math.floor((cy - radius) / view.ch));
      const y1 = Math.min(view.rows - 1, Math.ceil((cy + radius) / view.ch));
      context.save();
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const dx = ((x + .5) * view.cw - cx) / radius;
          const dy = ((y + .5) * view.ch - cy) / radius;
          const d2 = dx * dx + dy * dy;
          if (d2 > 1) continue;
          let dim = 0;
          for (const crater of this.craters) {
            const dist = Math.hypot(dx - crater.x, dy - crater.y) / crater.r;
            if (dist < 1) dim = Math.max(dim, Math.pow(1 - dist, 1.1) * .55);
          }
          const mottling = Math.sin(dx * 12 + dy * 5) * .035 + Math.sin(dx * 26 - dy * 17) * .022;
          const light = clamp(.96 - Math.sqrt(d2) * .26 - dim + (hash2(x, y) - .5) * .06 + mottling, 0, 1);
          tile(context, view, x, y, mixRgb(this.moonDark, this.moonLight, light), d2 > .88 ? ":" : densityGlyph(light, x, y));
        }
      }
      context.restore();
    }

    drawMist(context, view, time) {
      context.save();
      context.fillStyle = "rgba(150, 170, 196, .16)";
      for (const layer of this.mist) {
        const center = ((layer.x + time * layer.speed) % 1.2 - .1) * view.w;
        const width = layer.width * view.w;
        const x0 = Math.max(0, Math.floor((center - width * .5) / view.cw));
        const x1 = Math.min(view.cols - 1, Math.ceil((center + width * .5) / view.cw));
        const row = Math.floor(Math.min(view.rows - 2, (layer.y + Math.sin(time * .1 + layer.phase) * .008) * view.rows));
        for (let x = x0; x <= x1; x++) {
          const strength = Math.sin((x * view.cw - (center - width * .5)) / width * Math.PI);
          if (strength < .35 || hash2(x, row, layer.phase) < .45) continue;
          plot(context, view, x, row, strength > .7 ? "~" : "-");
        }
      }
      context.restore();
    }

    drawWater(context, view, time) {
      context.save();
      for (let y = Math.ceil(this.horizon) + 1; y < view.rows; y += 2) {
        const depth = (y - this.horizon) / (view.rows - this.horizon);
        context.fillStyle = depth < .3 ? "rgba(150, 176, 206, .22)" : depth < .68 ? "rgba(120, 150, 186, .17)" : "rgba(102, 131, 166, .12)";
        const offset = Math.floor((time * (.08 + depth * .8) + y * .7) % 7);
        const gap = 5 + Math.floor(depth * 8);
        for (let x = -offset; x < view.cols; x += gap) {
          if (hash2(x, y, 2.2) < .25 + quietAt(view, x, y) * .55) continue;
          const count = 1 + Math.floor(hash2(x, y, 7.1) * 4);
          for (let k = 0; k < count && x + k < view.cols; k++) {
            plot(context, view, x + k, y, depth > .65 ? (hash2(x + k, y) > .72 ? "~" : ".") : hash2(x + k, y) > .52 ? "~" : "-");
          }
        }
      }
      context.restore();
    }

    drawReflection(context, view, time) {
      const moonX = this.moon.x / view.cw;
      const start = Math.ceil(this.horizon) + 1;
      context.save();
      for (let y = start; y < view.rows; y++) {
        const depth = (y - start) / (view.rows - start);
        if (depth > .96) break;
        const alpha = (1 - depth * .62) * (.46 + .54 * Math.abs(Math.sin(time * .65 + y * .78)));
        context.fillStyle = "rgba(242, 240, 222, " + alpha.toFixed(3) + ")";
        const drift = Math.sin(time * .8 + y * .63) * (1.2 + depth * 4) + Math.sin(time * .27 + y * .19) * 2;
        const width = 1.4 + depth * 10;
        const center = moonX + drift;
        plot(context, view, Math.round(center), y, depth < .16 ? "=" : depth < .55 ? "-" : "~");
        const segments = 3 + Math.floor(depth * 5);
        for (let segment = 0; segment < segments; segment++) {
          const n = hash2(y, segment, 2.7);
          if (n < .12) continue;
          const x = Math.round(center + (n - .5) * width * 2);
          if (x < 0 || x >= view.cols) continue;
          const character = depth < .16 ? "=" : depth < .46 ? "-" : depth < .74 ? "~" : ".";
          const run = 1 + Math.floor(n * 3);
          for (let k = 0; k < run && x + k < view.cols; k++) plot(context, view, x + k, y, character);
        }
      }
      context.restore();
    }

    drawBoat(context, view, time) {
      const bx = Math.floor((this.boat.x * view.w + Math.sin(time * .18 + this.boat.phase) * 10) / view.cw);
      const by = Math.floor((this.boat.y * view.h + Math.sin(time * .8 + this.boat.phase) * 2) / view.ch);
      context.save();
      context.fillStyle = "rgba(2, 6, 12, .97)";
      plot(context, view, bx - 3, by + 1, "\\");
      for (let x = -2; x <= 2; x++) plot(context, view, bx + x, by + 1, "_");
      plot(context, view, bx + 3, by + 1, "/");
      plot(context, view, bx - 2, by, "_");
      plot(context, view, bx + 2, by, "_");
      plot(context, view, bx, by - 1, "|");
      const pulse = Math.sin(time * .9 + this.boat.phase) * .5 + .5;
      drawGlow(context, "#e6b378", (bx + .5) * view.cw, (by - 1.5) * view.ch, Math.min(view.w, view.h) * .05, .3 + pulse * .12);
      tile(context, view, bx, by - 2, this.lantern, "*");
      context.fillStyle = "rgba(219, 179, 121, .28)";
      for (let i = 1; i <= 3; i++) {
        plot(context, view, bx - 1, by + 1 + i, i === 1 ? "~" : ".");
        plot(context, view, bx + 1, by + 1 + i, i === 2 ? "~" : ".");
      }
      context.restore();
    }
  }

  // Small fish that cross the scene in loose schools.
  function makeSchool(rng, count, top, range) {
    return Array.from({ length: count }, () => ({
      x: rng(),
      y: top + rng() * range,
      speed: .002 + rng() * .006,
      phase: rng() * TAU,
      big: rng() > .45
    }));
  }

  function drawSchool(context, view, time, school, color) {
    context.save();
    context.fillStyle = color;
    for (const fish of school) {
      let x = (fish.x + time * fish.speed) % 1;
      if (x < 0) x += 1;
      const gx = Math.floor(x * view.cols);
      const gy = Math.floor((fish.y + Math.sin(time * .22 + fish.phase) * .015) * view.rows);
      if (quietAt(view, gx, gy) > .55) continue;
      plot(context, view, gx, gy, fish.big ? ">" : "'");
      if (fish.big) plot(context, view, gx - 1, gy, "-");
    }
    context.restore();
  }

  const WATER = { name: "water", label: "Water" };
  const DEEP = { name: "deep", label: "Deep" };

  /* ----------------------------------------------------------------------- */
  /* Koi Pond                                                                */
  /* ----------------------------------------------------------------------- */

  class KoiPond {
    constructor() {
      this.id = "koi-pond";
      this.group = WATER;
      this.title = "Koi Pond";
      this.tag = "Water · Still";
      this.caption = "Beneath a skin of light, three koi turn in long, unhurried circles.";
      this.accent = "#94d4b0";
      this.gridAlpha = .035;
    }

    init(view) {
      const rng = mulberry32(0x40A1);
      this.background = verticalGradient(view, [[0, "#3f8072"], [.5, "#286055"], [1, "#0f3631"]]);
      this.light = radialLight(view, .28, .05, .85, "rgba(200, 245, 215, .22)", "rgba(80, 160, 130, .07)");
      this.shafts = makeShafts(rng, 3, .035);
      this.ripples = makeRipples(rng, 6, .15, .7, .1, .26);
      this.petalColor = hexToRgb("#f6c4d0");
      this.petals = Array.from({ length: 10 }, () => ({
        x: rng(), y: .05 + rng() * .85, speed: .004 + rng() * .008, sway: .01 + rng() * .02, phase: rng() * TAU
      }));
      const padA = hexToRgb("#6f9f5b");
      const padB = hexToRgb("#88b46a");
      const rim = hexToRgb("#4f7e45");
      this.pads = [
        { x: .12, y: .2, size: .095, notch: -1.35, flower: false },
        { x: .86, y: .3, size: .13, notch: 2.15, flower: true },
        { x: .8, y: .76, size: .09, notch: .72, flower: false },
        { x: .15, y: .66, size: .066, notch: 2.8, flower: false }
      ].map(spec => ({ ...spec, padA, padB, rim, phase: rng() * TAU, bob: 2 + rng() * 3, radiusPx: Math.min(view.w, view.h) * spec.size }));
      this.flower = { petal: hexToRgb("#f7c8d2"), heart: hexToRgb("#ffd98c") };

      // Wide, slow orbits linger at the sides and pass the centre quickly.
      this.fish = [
        { cx: .5, cy: .44, ax: .34, ay: .21, phase: .4, speed: .1, length: .24, body: "#ef8748", patch: "#f8ead2", accent: "#d4523a" },
        { cx: .46, cy: .36, ax: .31, ay: .17, phase: 3.3, speed: .12, length: .19, body: "#f6e6c8", patch: "#e5793f", accent: "#c94a34" },
        { cx: .54, cy: .5, ax: .37, ay: .24, phase: 5.7, speed: .082, length: .27, body: "#e9733f", patch: "#fbe9cf", accent: "#2d2a2a" }
      ].map(spec => ({
        ...spec,
        body: hexToRgb(spec.body),
        patch: hexToRgb(spec.patch),
        accent: hexToRgb(spec.accent),
        finStyle: rgba(mixRgb(hexToRgb(spec.body), [255, 230, 200], .4), .72),
        lengthPx: clamp(Math.min(view.w, view.h) * spec.length, 96, 260)
      }));
    }

    // Background fills only. Also used to build the centre quiet plate.
    paintBase(context, view) {
      context.fillStyle = this.background;
      context.fillRect(0, 0, view.w, view.h);
      context.fillStyle = this.light;
      context.fillRect(0, 0, view.w, view.h);
      paintGrid(context, view, this.gridAlpha);
    }

    draw(context, view, time) {
      this.paintBase(context, view);
      drawShafts(context, view, time, this.shafts, [200, 255, 225]);
      drawCaustics(context, view, time, "rgba(200, 245, 222, .1)", 1.78);
      drawRipples(context, view, time, this.ripples, [200, 240, 220], .14, .48);
      for (const fish of this.fish) this.drawKoi(context, view, time, fish);
      for (const pad of this.pads) this.drawPad(context, view, time, pad);
      context.save();
      for (const petal of this.petals) {
        let x = (petal.x + time * petal.speed) % 1;
        if (x < 0) x += 1;
        const gx = Math.floor(x * view.cols);
        const gy = Math.floor((petal.y + Math.sin(time * .18 + petal.phase) * petal.sway) * view.rows);
        if (quietAt(view, gx, gy) > .6) continue;
        tile(context, view, gx, gy, this.petalColor, "t");
      }
      context.restore();
    }

    drawKoi(context, view, time, fish) {
      const a = time * fish.speed + fish.phase;
      const x = (fish.cx + Math.cos(a) * fish.ax) * view.w;
      const y = (fish.cy + Math.sin(a) * fish.ay) * view.h;
      const vx = -Math.sin(a) * fish.ax * view.w;
      const vy = Math.cos(a) * fish.ay * view.h;
      const speed = Math.hypot(vx, vy) || 1;
      const dirX = vx / speed;
      const dirY = vy / speed;
      const perpX = -dirY;
      const perpY = dirX;
      const length = fish.lengthPx;
      const half = length * .19;
      const wag = time * 2.2 + fish.phase;

      drawGlow(context, "#ffc893", x - dirX * length * .4, y - dirY * length * .4, length * .8, .07);

      const eyes = [-1, 1].map(side => {
        const ex = x - dirX * length * .06 + perpX * side * half * .5;
        const ey = y - dirY * length * .06 + perpY * side * half * .5;
        return Math.floor(ex / view.cw) * 10000 + Math.floor(ey / view.ch);
      });

      const reach = length * 1.15;
      const x0 = Math.max(0, Math.floor((x - reach) / view.cw));
      const x1 = Math.min(view.cols - 1, Math.ceil((x + reach) / view.cw));
      const y0 = Math.max(0, Math.floor((y - reach) / view.ch));
      const y1 = Math.min(view.rows - 1, Math.ceil((y + reach) / view.ch));
      context.save();
      for (let gy = y0; gy <= y1; gy++) {
        for (let gx = x0; gx <= x1; gx++) {
          const dx = (gx + .5) * view.cw - x;
          const dy = (gy + .5) * view.ch - y;
          const s = -(dx * dirX + dy * dirY) / length;
          if (s < -.07 || s > 1.05) continue;
          const sc = clamp(s, 0, 1);
          const lateral = dx * perpX + dy * perpY - Math.sin(sc * 3.6 - wag) * length * .05 * sc * sc;
          if (s > .74) {
            const spread = half * (.2 + (s - .74) / .31 * 1.25);
            const side = Math.abs(lateral);
            if (side > spread || (s > .92 && side < spread * .28)) continue;
            context.fillStyle = fish.finStyle;
            plot(context, view, gx, gy, s > .92 ? (lateral > 0 ? "'" : ",") : ":");
            continue;
          }
          const width = s < 0
            ? half * .82 * Math.sqrt(Math.max(0, 1 - Math.pow(s / .07, 2)))
            : half * (.82 + .3 * Math.sin(Math.PI * clamp(s * 1.25, 0, 1))) * (1 - .55 * Math.pow(s / .74, 2));
          const edge = Math.abs(lateral) / Math.max(1, width);
          if (edge > 1) continue;
          const key = gx * 10000 + gy;
          if (key === eyes[0] || key === eyes[1]) {
            tile(context, view, gx, gy, fish.patch, "o");
            continue;
          }
          const pattern = (Math.sin(s * 9.5 + fish.phase * 1.7) + Math.sin(s * 3.1 - lateral / half * 1.3 + fish.phase)) * .5;
          const fill = pattern > .36 ? fish.patch : pattern < -.62 ? fish.accent : fish.body;
          tile(context, view, gx, gy, fill, edge > .72 ? ":" : densityGlyph(1 - edge, gx, gy));
        }
      }

      context.fillStyle = fish.finStyle;
      for (let side = -1; side <= 1; side += 2) {
        const bx = x - dirX * length * .26;
        const by = y - dirY * length * .26;
        for (let i = 1; i <= 5; i++) {
          const q = i / 5;
          const px = bx + perpX * side * half * (.9 + q * .9) - dirX * length * .08 * q;
          const py = by + perpY * side * half * (.9 + q * .9) - dirY * length * .08 * q;
          plot(context, view, Math.floor(px / view.cw), Math.floor(py / view.ch), q > .6 ? "'" : ",");
        }
      }
      context.restore();
    }

    drawPad(context, view, time, pad) {
      const cx = pad.x * view.w + Math.sin(time * .21 + pad.phase) * pad.bob;
      const cy = pad.y * view.h + Math.cos(time * .17 + pad.phase) * pad.bob * .5;
      const rx = pad.radiusPx;
      const ry = rx * .74;
      const x0 = Math.max(0, Math.floor((cx - rx) / view.cw));
      const x1 = Math.min(view.cols - 1, Math.ceil((cx + rx) / view.cw));
      const y0 = Math.max(0, Math.floor((cy - ry) / view.ch));
      const y1 = Math.min(view.rows - 1, Math.ceil((cy + ry) / view.ch));
      context.save();
      context.globalAlpha = .96;
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const dx = ((x + .5) * view.cw - cx) / rx;
          const dy = ((y + .5) * view.ch - cy) / ry;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d > 1) continue;
          const angle = Math.atan2(dy, dx);
          const delta = Math.atan2(Math.sin(angle - pad.notch), Math.cos(angle - pad.notch));
          if (d > .12 && Math.abs(delta) < .32) continue;
          const vein = Math.abs(Math.sin((angle - pad.phase) * 2.5)) < .16 && d > .2;
          const fill = d > .84 ? pad.rim : hash2(x, y, pad.phase) > .55 ? pad.padB : pad.padA;
          tile(context, view, x, y, fill, vein ? "-" : d > .84 ? "o" : densityGlyph(.35 + (1 - d) * .5, x, y));
        }
      }
      if (pad.flower) {
        const fx = Math.floor(cx / view.cw);
        const fy = Math.floor(cy / view.ch);
        drawGlow(context, "#f4cdd2", (fx + .5) * view.cw, (fy + .5) * view.ch, rx * .8, .18 + Math.sin(time * .6 + pad.phase) * .04);
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            if (Math.abs(dx) === 2 && dy !== 0) continue;
            const heart = dx === 0 && dy === 0;
            tile(context, view, fx + dx, fy + dy, heart ? this.flower.heart : this.flower.petal, heart ? "@" : "*");
          }
        }
      }
      context.restore();
    }
  }

  /* ----------------------------------------------------------------------- */
  /* Honu Lagoon                                                             */
  /* ----------------------------------------------------------------------- */

  class HonuLagoon {
    constructor() {
      this.id = "honu-lagoon";
      this.group = WATER;
      this.title = "Honu Lagoon";
      this.tag = "Water · Lagoon";
      this.caption = "A green sea turtle traces slow circles through sunlit water.";
      this.accent = "#83d9c4";
      this.gridAlpha = .035;
    }

    init(view) {
      const rng = mulberry32(0x40A7);
      this.background = verticalGradient(view, [[0, "#2c8d90"], [.38, "#1a6c75"], [.78, "#0c4350"], [1, "#05262f"]]);
      this.light = radialLight(view, .48, -.1, .9, "rgba(170, 245, 225, .24)", "rgba(60, 170, 160, .07)");
      this.shafts = makeShafts(rng, 4, .05);
      const rx = clamp(Math.min(view.w, view.h) * .13, 70, 150);
      this.turtle = {
        rx,
        ry: rx * .74,
        shell: hexToRgb("#b98c42"),
        shellLight: hexToRgb("#e0c07a"),
        rim: hexToRgb("#7a5a2a"),
        skin: hexToRgb("#6e9f70"),
        skinLight: hexToRgb("#a7cf98"),
        eye: hexToRgb("#16322a")
      };
      this.bubbles = makeDrift(rng, 20, .008, .02);
      this.school = makeSchool(rng, 8, .25, .5);
      const grassCount = Math.max(10, Math.round(view.cols * .12));
      this.grass = Array.from({ length: grassCount }, (_, index) => ({
        x: index < grassCount / 2 ? rng() * .2 * view.w : view.w - rng() * .22 * view.w,
        height: 5 + rng() * 10,
        phase: rng() * TAU,
        speed: .35 + rng() * .4,
        sway: 3 + rng() * 8,
        lean: (rng() > .5 ? 1 : -1) * 4
      }));
    }

    // Background fills only. Also used to build the centre quiet plate.
    paintBase(context, view) {
      context.fillStyle = this.background;
      context.fillRect(0, 0, view.w, view.h);
      context.fillStyle = this.light;
      context.fillRect(0, 0, view.w, view.h);
      paintGrid(context, view, this.gridAlpha);
    }

    draw(context, view, time) {
      this.paintBase(context, view);
      drawShafts(context, view, time, this.shafts, [190, 255, 235]);
      drawCaustics(context, view, time, "rgba(170, 240, 215, .12)", 1.72);
      drawSchool(context, view, time, this.school, "rgba(150, 220, 200, .3)");
      context.save();
      context.fillStyle = "rgba(60, 130, 100, .7)";
      for (const blade of this.grass) bladeCharacter(context, view, blade, time);
      context.restore();
      this.drawTurtle(context, view, time);
      drawDrift(context, view, time, this.bubbles, "rgba(196, 238, 224, .42)", [".", "o", "o"]);
    }

    drawTurtle(context, view, time) {
      const turtle = this.turtle;
      // A wide figure-of-eight: the turtle lingers at either side of the
      // chat and glides through the middle quickly, bobbing as it swims.
      const phase = time * .055 + .4;
      const cx = view.w * .5 + Math.sin(phase) * view.w * .31 + parallaxX(view, 1.2);
      const cy = view.h * .4 + Math.sin(phase * 2 + .6) * view.h * .1 + Math.sin(time * .52) * view.h * .008;
      const angle = Math.atan2(Math.cos(phase * 2 + .6) * .2 * (view.h / view.w), Math.cos(phase) * .31);
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const { rx, ry } = turtle;

      const flippers = [
        { x: rx * .32, y: -ry * .86, angle: -1.05, length: rx * 1.15, width: ry * .3, swing: .3, beat: 0 },
        { x: rx * .32, y: ry * .86, angle: 1.05, length: rx * 1.15, width: ry * .3, swing: .3, beat: 0 },
        { x: -rx * .6, y: -ry * .72, angle: -2.45, length: rx * .68, width: ry * .22, swing: .12, beat: 1.4 },
        { x: -rx * .6, y: ry * .72, angle: 2.45, length: rx * .68, width: ry * .22, swing: .12, beat: 1.4 }
      ].map(flipper => {
        const side = flipper.y < 0 ? -1 : 1;
        const a = flipper.angle + side * Math.sin(time * 1.2 + flipper.beat) * flipper.swing;
        return { x: flipper.x, y: flipper.y, dx: Math.cos(a) * flipper.length, dy: Math.sin(a) * flipper.length, width: flipper.width };
      });
      const headX = rx * 1.2;
      const headRx = rx * .4;
      const headRy = ry * .44;
      const eyes = [-1, 1].map(side => {
        const lx = headX + headRx * .3;
        const ly = side * headRy * .48;
        return Math.floor((cx + lx * cos - ly * sin) / view.cw) * 10000 + Math.floor((cy + lx * sin + ly * cos) / view.ch);
      });

      drawGlow(context, "#7fe0c4", cx, cy, rx * 3, .07);
      const reach = rx * 2.4;
      const x0 = Math.max(0, Math.floor((cx - reach) / view.cw));
      const x1 = Math.min(view.cols - 1, Math.ceil((cx + reach) / view.cw));
      const y0 = Math.max(0, Math.floor((cy - reach) / view.ch));
      const y1 = Math.min(view.rows - 1, Math.ceil((cy + reach) / view.ch));
      context.save();
      for (let gy = y0; gy <= y1; gy++) {
        for (let gx = x0; gx <= x1; gx++) {
          const dx = (gx + .5) * view.cw - cx;
          const dy = (gy + .5) * view.ch - cy;
          const lx = dx * cos + dy * sin;
          const ly = -dx * sin + dy * cos;
          const sx = lx / rx;
          const sy = ly / ry;
          const d = Math.sqrt(sx * sx + sy * sy);

          if (d <= 1) {
            // Carapace: six scute sectors around a central ring.
            const theta = Math.atan2(sy, sx);
            const seam = Math.abs((((theta / (Math.PI / 3)) % 1) + 1) % 1 - .5) > .4 && d > .22;
            const ring = Math.abs(d - .52) < .07;
            if (d > .86) tile(context, view, gx, gy, turtle.rim, "o");
            else tile(context, view, gx, gy, mixRgb(turtle.shellLight, turtle.shell, d), seam || ring ? ":" : d < .24 ? "S" : "%");
            continue;
          }

          const hx = (lx - headX) / headRx;
          const hy = ly / headRy;
          if (hx * hx + hy * hy <= 1) {
            const key = gx * 10000 + gy;
            if (key === eyes[0] || key === eyes[1]) tile(context, view, gx, gy, turtle.eye, "o");
            else tile(context, view, gx, gy, mixRgb(turtle.skinLight, turtle.skin, Math.sqrt(hx * hx + hy * hy)), "t");
            continue;
          }
          if (lx > rx * .8 && lx < headX && Math.abs(ly) < ry * .26) {
            tile(context, view, gx, gy, turtle.skin, ":");
            continue;
          }

          for (const flipper of flippers) {
            const px = lx - flipper.x;
            const py = ly - flipper.y;
            const lengthSq = flipper.dx * flipper.dx + flipper.dy * flipper.dy;
            const t = clamp((px * flipper.dx + py * flipper.dy) / lengthSq, 0, 1);
            const dist = Math.hypot(px - flipper.dx * t, py - flipper.dy * t);
            if (dist <= flipper.width * (1 - t * .7) + view.cw * .2) {
              tile(context, view, gx, gy, mixRgb(turtle.skinLight, turtle.skin, t), t > .7 ? ":" : "t");
              break;
            }
          }
        }
      }
      context.restore();
    }
  }

  /* ----------------------------------------------------------------------- */
  /* Jellyfish                                                               */
  /* ----------------------------------------------------------------------- */

  class Jellyfish {
    constructor() {
      this.id = "jellyfish";
      this.group = DEEP;
      this.title = "Jellyfish";
      this.tag = "Depth · Bioluminescent";
      this.caption = "Soft architectures of the deep, pulsing against the dark.";
      this.accent = "#8eeae0";
      this.gridAlpha = .04;
    }

    init(view) {
      const rng = mulberry32(0x3E11);
      this.background = verticalGradient(view, [[0, "#285890"], [.45, "#163a69"], [1, "#071733"]]);
      this.ambient = radialLight(view, .55, -.1, .95, "rgba(140, 200, 255, .16)", "rgba(50, 100, 170, .06)");
      this.shafts = makeShafts(rng, 3, .035);
      this.snow = makeDrift(rng, Math.max(50, Math.round(view.cols * .7)), .006, .02);
      const palettes = [
        { bell: "#a790c8", rim: "#7a68a6", light: "#e4d6f5", glow: "#b49ae0" },
        { bell: "#efb18f", rim: "#c98466", light: "#ffe5d3", glow: "#ffb38e" },
        { bell: "#eea9cb", rim: "#c27aa2", light: "#ffdaec", glow: "#ff9fd0" }
      ].map(palette => ({ bell: hexToRgb(palette.bell), rim: hexToRgb(palette.rim), light: hexToRgb(palette.light), glow: palette.glow }));
      this.jellies = [
        { x: .78, y: .42, scale: 1.15, rise: .011, drift: .03, phase: .9, palette: 1, alpha: 1 },
        { x: .24, y: .28, scale: .9, rise: .008, drift: .021, phase: 2.5, palette: 0, alpha: .92 },
        { x: .9, y: .8, scale: .55, rise: .011, drift: .015, phase: 4.6, palette: 2, alpha: .72 },
        { x: .1, y: .7, scale: .5, rise: .007, drift: .011, phase: 5.8, palette: 2, alpha: .6 },
        { x: .58, y: .08, scale: .3, rise: .006, drift: .008, phase: 1.7, palette: 0, alpha: .36 }
      ].sort((a, b) => a.scale - b.scale).map(spec => ({
        ...spec,
        ...palettes[spec.palette],
        base: clamp(Math.min(view.w, view.h) * .12, 48, 130) * spec.scale,
        tentacles: Array.from({ length: 7 }, (_, index) => ({
          offset: -.78 + index * .26 + (rng() - .5) * .06,
          length: 2.2 + rng() * 2.8,
          phase: rng() * TAU,
          speed: .58 + rng() * .7
        }))
      }));
    }

    // Background fills only. Also used to build the centre quiet plate.
    paintBase(context, view) {
      context.fillStyle = this.background;
      context.fillRect(0, 0, view.w, view.h);
      context.fillStyle = this.ambient;
      context.fillRect(0, 0, view.w, view.h);
      paintGrid(context, view, this.gridAlpha);
    }

    draw(context, view, time) {
      this.paintBase(context, view);
      drawShafts(context, view, time, this.shafts, [170, 210, 255]);
      drawDrift(context, view, time, this.snow, "rgba(170, 214, 240, .3)", ["'", ".", "."]);
      for (const jelly of this.jellies) this.drawJelly(context, view, time, jelly);
    }

    drawJelly(context, view, time, jelly) {
      let yNorm = (jelly.y - time * jelly.rise) % 1.2;
      if (yNorm < 0) yNorm += 1.2;
      const cx = jelly.x * view.w + Math.sin(time * .17 + jelly.phase) * jelly.drift * view.w;
      const cy = yNorm * view.h - view.h * .1;
      const beat = Math.sin(time * .95 + jelly.phase);
      const rx = jelly.base * (1 + beat * .065);
      const ry = jelly.base * .72 * (1 - beat * .05);

      // The bell's light swells a beat after each contraction.
      const glowPulse = .82 + .3 * (Math.sin(time * .95 + jelly.phase - .7) * .5 + .5);
      drawGlow(context, jelly.glow, cx, cy - ry * .3, rx * 3, (.1 + jelly.alpha * .18) * glowPulse);
      drawGlow(context, "#ffffff", cx, cy - ry * .4, rx * .9, jelly.alpha * .08 * glowPulse);

      context.save();
      context.globalAlpha = jelly.alpha;
      for (const tentacle of jelly.tentacles) {
        const steps = Math.max(4, Math.round(ry * tentacle.length / view.ch));
        const startX = cx + tentacle.offset * rx * .8;
        let lastKey = -1;
        for (let step = 1; step <= steps; step++) {
          const q = step / steps;
          const px = startX
            + Math.sin(q * 4.5 + time * tentacle.speed + tentacle.phase) * rx * .3 * q
            + Math.sin(q * 2.1 - time * .6 + tentacle.phase) * rx * .1;
          const gx = Math.floor(px / view.cw);
          const gy = Math.floor((cy + ry * .12 + q * ry * tentacle.length) / view.ch);
          const key = gx * 10000 + gy;
          if (key === lastKey) continue;
          lastKey = key;
          if (q < .6) {
            tile(context, view, gx, gy, mixRgb(jelly.bell, jelly.rim, q), q < .3 ? ":" : "|");
          } else {
            context.fillStyle = rgba(jelly.bell, (.75 * (1.2 - q)).toFixed(3));
            plot(context, view, gx, gy, q > .85 ? "." : "'");
          }
        }
      }
      for (let arm = -1; arm <= 1; arm++) {
        const steps = Math.max(3, Math.round(ry * 2.2 / view.ch));
        for (let step = 1; step <= steps; step++) {
          const q = step / steps;
          const px = cx + arm * rx * .16 + Math.sin(q * 3.2 + time * .8 + arm * 1.4) * rx * .16 * q;
          tile(context, view, Math.floor(px / view.cw), Math.floor((cy + ry * .12 + q * ry * 2.2) / view.ch), mixRgb(jelly.light, jelly.bell, q), "t");
        }
      }

      const x0 = Math.max(0, Math.floor((cx - rx) / view.cw));
      const x1 = Math.min(view.cols - 1, Math.ceil((cx + rx) / view.cw));
      const y0 = Math.max(0, Math.floor((cy - ry) / view.ch));
      const y1 = Math.min(view.rows - 1, Math.ceil((cy + ry * .3) / view.ch));
      const anchorX = Math.round(cx / view.cw);
      const anchorY = Math.round(cy / view.ch);
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const nx = ((x + .5) * view.cw - cx) / rx;
          const ny = ((y + .5) * view.ch - cy) / ry;
          const skirt = .1 + .12 * Math.abs(Math.sin(nx * 5.3 + time * .45 + jelly.phase));
          if (ny <= 0 ? nx * nx + ny * ny > 1 : (Math.abs(nx) > .94 || ny > skirt)) continue;
          const d = Math.sqrt(nx * nx + Math.min(0, ny) * Math.min(0, ny));
          const fill = d > .86 || ny > 0 ? jelly.rim : mixRgb(jelly.light, jelly.bell, smoothstep(.1, .85, d));
          tile(context, view, x, y, fill, ny > 0 ? "'" : densityGlyph(1 - d, x - anchorX, y - anchorY));
        }
      }
      context.restore();
    }
  }

  /* ----------------------------------------------------------------------- */
  /* DeepSeek — blue whale                                                   */
  /* ----------------------------------------------------------------------- */

  class DeepSeekWhale {
    constructor() {
      this.id = "deepseek";
      this.group = DEEP;
      this.title = "DeepSeek";
      this.tag = "Depth · Blue whale";
      this.caption = "A blue whale crosses the quiet dark above the conversation.";
      this.accent = "#7c9cff";
      this.gridAlpha = .04;
    }

    init(view) {
      const rng = mulberry32(0xD33C);
      this.background = verticalGradient(view, [[0, "#0e2c61"], [.4, "#0a2149"], [.75, "#05122e"], [1, "#020816"]]);
      this.surfaceGlow = radialLight(view, .46, -.08, 1, "rgba(90, 150, 255, .2)", "rgba(30, 80, 180, .07)");
      this.shafts = makeShafts(rng, 3, .03);
      this.particles = makeDrift(rng, Math.max(55, Math.round(view.cols * .8)), .002, .008);
      this.school = makeSchool(rng, 9, .3, .5);
      this.whale = {
        phase: .6,
        length: clamp(Math.min(view.w, view.h * 1.3) * .72, 340, 1000),
        back: hexToRgb("#2a4ea8"),
        front: hexToRgb("#7aa6f5"),
        belly: hexToRgb("#bcd1f8"),
        fin: hexToRgb("#4b7bdc"),
        eye: hexToRgb("#0c1c3c")
      };
    }

    // Background fills only. Also used to build the centre quiet plate.
    paintBase(context, view) {
      context.fillStyle = this.background;
      context.fillRect(0, 0, view.w, view.h);
      context.fillStyle = this.surfaceGlow;
      context.fillRect(0, 0, view.w, view.h);
      paintGrid(context, view, this.gridAlpha);
    }

    draw(context, view, time) {
      this.paintBase(context, view);
      drawShafts(context, view, time, this.shafts, [140, 180, 255]);
      drawDrift(context, view, time, this.particles, "rgba(130, 172, 220, .22)", ["'", ".", "+"]);
      drawSchool(context, view, time, this.school, "rgba(130, 170, 230, .26)");
      this.drawWhale(context, view, time);
    }

    drawWhale(context, view, time) {
      const whale = this.whale;
      const length = whale.length;
      const bodyHeight = length * .14;
      const cx = view.w * .52 + Math.sin(time * .09 + whale.phase) * view.w * .05 + parallaxX(view, 1.25);
      const cy = view.h * .36 + Math.sin(time * .15 + whale.phase) * view.h * .024 + Math.sin(time * .41 + whale.phase * 2) * view.h * .006;
      const startX = cx - length * .41;
      const endX = cx + length * .45;
      const bodyLength = endX - startX;
      const tailWave = Math.sin(time * .7 + whale.phase) * bodyHeight * .08;

      const topAt = (u) => {
        if (u < .12) return bodyHeight * (.08 + .38 * (u / .12));
        if (u < .4) return bodyHeight * (.46 + .54 * Math.sin((u - .12) / .28 * Math.PI / 2));
        if (u < .68) return bodyHeight * (1 - .08 * (u - .4) / .28);
        if (u < .86) return bodyHeight * (.92 - .35 * Math.pow((u - .68) / .18, 1.4));
        if (u < .97) return bodyHeight * (.57 - .42 * Math.pow((u - .86) / .11, 1.2));
        return bodyHeight * .15;
      };
      const bottomAt = (u) => {
        if (u < .1) return bodyHeight * (.1 + .3 * (u / .1));
        if (u < .3) return bodyHeight * (.4 + .32 * Math.sin((u - .1) / .2 * Math.PI / 2));
        if (u < .7) return bodyHeight * (.72 + .26 * Math.sin((u - .3) / .4 * Math.PI / 2));
        if (u < .9) return bodyHeight * (.96 - .28 * (u - .7) / .2);
        if (u < .98) return bodyHeight * (.7 - .62 * (u - .9) / .08);
        return bodyHeight * .08;
      };

      drawGlow(context, "#3568ff", cx, cy, length * .75, .08 + (Math.sin(time * .3) * .5 + .5) * .04);
      const eyeX = Math.floor((startX + bodyLength * .84) / view.cw);
      const eyeY = Math.floor((cy - bodyHeight * .2) / view.ch);

      context.save();
      // Flukes.
      const tailBaseX = startX - view.cw * .4;
      const tx0 = Math.max(0, Math.floor((tailBaseX - length * .18) / view.cw));
      const tx1 = Math.min(view.cols - 1, Math.ceil(tailBaseX / view.cw));
      const ty0 = Math.max(0, Math.floor((cy - bodyHeight * 1.4) / view.ch));
      const ty1 = Math.min(view.rows - 1, Math.ceil((cy + bodyHeight * 1.4) / view.ch));
      for (let gy = ty0; gy <= ty1; gy++) {
        for (let gx = tx0; gx <= tx1; gx++) {
          const back = (tailBaseX - (gx + .5) * view.cw) / (length * .18);
          if (back < 0 || back > 1) continue;
          const spread = bodyHeight * (.12 + back * 1.08);
          const lateral = Math.abs((gy + .5) * view.ch - cy - tailWave);
          if (lateral > spread || lateral < spread * .22) continue;
          tile(context, view, gx, gy, whale.back, lateral / spread > .78 ? ":" : "t");
        }
      }

      // Body.
      const x0 = Math.max(0, Math.floor(startX / view.cw) - 1);
      const x1 = Math.min(view.cols - 1, Math.ceil(endX / view.cw) + 1);
      const y0 = Math.max(0, Math.floor((cy - bodyHeight * 1.3) / view.ch));
      const y1 = Math.min(view.rows - 1, Math.ceil((cy + bodyHeight * 1.3) / view.ch));
      for (let gy = y0; gy <= y1; gy++) {
        for (let gx = x0; gx <= x1; gx++) {
          const u = clamp(((gx + .5) * view.cw - startX) / bodyLength, 0, 1);
          const centerY = cy + Math.sin(u * 3.4 + time * .55 + whale.phase) * bodyHeight * .035;
          const topY = centerY - topAt(u);
          const bottomY = centerY + bottomAt(u);
          const py = (gy + .5) * view.ch;
          if (py < topY || py > bottomY) continue;
          if (gx === eyeX && gy === eyeY) {
            tile(context, view, gx, gy, whale.eye, "o");
            continue;
          }
          const depth = (py - topY) / Math.max(1, bottomY - topY);
          let fill = mixRgb(whale.back, whale.front, u);
          if (depth > .66) fill = mixRgb(fill, whale.belly, (depth - .66) / .34 * .75);
          const glyph = depth < .14 ? ":" : depth > .7 ? (gy % 2 ? "=" : "-") : densityGlyph(.45 + .5 * u, gx, gy);
          tile(context, view, gx, gy, fill, glyph);
        }
      }

      // Pectoral fin.
      const finX = startX + bodyLength * .6;
      const finY = cy + bodyHeight * .82;
      let lastKey = -1;
      for (let q = 0; q <= 1; q += .08) {
        const gx = Math.floor((finX - q * bodyHeight * .95) / view.cw);
        const gy = Math.floor((finY + q * bodyHeight * .55) / view.ch);
        if (gx * 10000 + gy === lastKey) continue;
        lastKey = gx * 10000 + gy;
        tile(context, view, gx, gy, whale.fin, q > .7 ? "." : ":");
        tile(context, view, gx + 1, gy, whale.fin, ":");
      }

      context.fillStyle = "rgba(150, 190, 255, .45)";
      for (let i = 0; i < 3; i++) {
        const bx = endX + bodyHeight * (.12 + i * .18);
        const by = cy - bodyHeight * (.4 + i * .14) + Math.sin(time * .6 + i) * 2;
        plot(context, view, Math.floor(bx / view.cw), Math.floor(by / view.ch), i === 0 ? "o" : ".");
      }
      context.restore();
    }
  }

  /* ----------------------------------------------------------------------- */
  /* Paper Boats                                                             */
  /* ----------------------------------------------------------------------- */

  // s sail, h hull, k keel. Glyphs are chosen from position, so the folds
  // read as slopes.
  const BOAT_PATTERNS = {
    small: ["..s..", ".sss.", "hhhhh", ".kkk."],
    large: ["....s....", "...sss...", "..sssss..", ".sssssss.", "hhhhhhhhh", ".hhhhhhh.", "..kkkkk.."],
    xl: [".....s.....", "....sss....", "...sssss...", "..sssssss..", ".sssssssss.", "hhhhhhhhhhh", ".hhhhhhhhh.", "..kkkkkkk.."]
  };

  class PaperBoats {
    constructor() {
      this.id = "paper-boats";
      this.group = WATER;
      this.title = "Paper Boats";
      this.tag = "Water · Paper lanterns";
      this.caption = "Small folded boats carrying little lights across the dark.";
      this.accent = "#e8c792";
      this.gridAlpha = .035;
    }

    init(view) {
      const rng = mulberry32(0xBA07);
      this.background = verticalGradient(view, [[0, "#245a62"], [.42, "#17414b"], [.72, "#0d2a33"], [1, "#061418"]]);
      this.skyLight = radialLight(view, .56, .05, .75, "rgba(150, 210, 215, .16)", "rgba(60, 120, 130, .05)");
      this.stars = makeStars(rng, Math.max(30, Math.round(view.cols * .4)), .4);
      this.ripples = makeRipples(rng, 5, .5, .4, .04, .1);
      this.colors = {
        sail: hexToRgb("#f7f4ec"),
        sailShade: hexToRgb("#d9d2c4"),
        hull: hexToRgb("#ece4d4"),
        keel: hexToRgb("#b9ae9b"),
        lantern: hexToRgb("#f6cc8a")
      };
      this.boats = [
        { x: .1, y: .28, speed: .0028, phase: .4, bob: 2, alpha: .62, pattern: "small", lantern: false },
        { x: .66, y: .36, speed: .0038, phase: 2.1, bob: 3, alpha: .76, pattern: "large", lantern: true },
        { x: .3, y: .52, speed: .005, phase: 4.2, bob: 4, alpha: .8, pattern: "large", lantern: false },
        { x: .86, y: .58, speed: .0062, phase: 1.2, bob: 6, alpha: .94, pattern: "xl", lantern: true },
        { x: .5, y: .72, speed: .0056, phase: 3.7, bob: 5, alpha: .86, pattern: "large", lantern: false },
        { x: .08, y: .82, speed: .0072, phase: 5.1, bob: 7, alpha: 1, pattern: "xl", lantern: true }
      ];
      this.candles = Array.from({ length: 5 }, () => ({
        x: rng(), y: .36 + rng() * .5, speed: .0016 + rng() * .0028, phase: rng() * TAU
      }));
    }

    // Background fills only. Also used to build the centre quiet plate.
    paintBase(context, view) {
      context.fillStyle = this.background;
      context.fillRect(0, 0, view.w, view.h);
      context.fillStyle = this.skyLight;
      context.fillRect(0, 0, view.w, view.h);
      paintGrid(context, view, this.gridAlpha);
    }

    draw(context, view, time) {
      this.paintBase(context, view);
      drawStars(context, view, time, this.stars, "rgba(230, 236, 220, .62)", "rgba(176, 204, 204, .26)");

      context.save();
      context.fillStyle = "rgba(150, 200, 204, .16)";
      for (let y = Math.floor(view.rows * .46); y < view.rows; y += 2) {
        const depth = y / view.rows;
        const gap = 5 + Math.floor(depth * 8);
        const offset = Math.floor((time * (.22 + depth * .6) + y * .7) % gap);
        for (let x = -offset; x < view.cols; x += gap) {
          if (hash2(x, y, 4.4) < .35 + quietAt(view, x, y) * .5) continue;
          plot(context, view, x, y, hash2(x, y) > .6 ? "~" : ".");
        }
      }
      context.restore();
      drawRipples(context, view, time, this.ripples, [170, 215, 215], .12, .32);

      for (const boat of this.boats) {
        let x = boat.x + time * boat.speed;
        x = ((x % 1.16) + 1.16) % 1.16 - .08;
        const y = boat.y + (Math.sin(time * .38 + boat.phase) + Math.sin(time * .83 + boat.phase * 1.9) * .3) * boat.bob / view.h;
        this.drawBoat(context, view, time, boat, x * view.w + parallaxX(view, .6 + boat.y * .9), y * view.h);
      }

      context.save();
      for (const candle of this.candles) {
        let x = candle.x + time * candle.speed;
        x = ((x % 1.16) + 1.16) % 1.16 - .08;
        const px = x * view.w;
        const py = (candle.y + Math.sin(time * .5 + candle.phase) * .004) * view.h;
        const pulse = .62 + .38 * (Math.sin(time * .9 + candle.phase) * .7 + Math.sin(time * 2.3 + candle.phase * 3) * .3);
        drawGlow(context, "#e9bd7f", px, py, 44 + pulse * 14, .07 * pulse);
        drawGlow(context, "#f2c88a", px, py, 22 + pulse * 8, .16 * pulse);
        context.globalAlpha = .5 + pulse * .4;
        tile(context, view, Math.floor(px / view.cw), Math.floor(py / view.ch), this.colors.lantern, "*");
      }
      context.restore();
    }

    drawBoat(context, view, time, boat, px, py) {
      const pattern = BOAT_PATTERNS[boat.pattern];
      const width = pattern[0].length;
      const center = Math.floor(width / 2);
      const baseX = Math.floor(px / view.cw) - center;
      const baseY = Math.floor(py / view.ch) - pattern.length + 1;
      const colors = this.colors;
      context.save();
      context.globalAlpha = boat.alpha;
      if (boat.lantern) {
        const pulse = .6 + .4 * Math.sin(time * 1.1 + boat.phase);
        const lx = (baseX + center + .5) * view.cw;
        const ly = (baseY - .5) * view.ch;
        drawGlow(context, "#e8b36f", lx, ly, 60 + pulse * 24, .09 * pulse);
        drawGlow(context, "#f4c789", lx, ly, 28 + pulse * 16, .28 * pulse);
        tile(context, view, baseX + center, baseY - 1, colors.lantern, "*");
      }
      for (let row = 0; row < pattern.length; row++) {
        for (let col = 0; col < width; col++) {
          const key = pattern[row][col];
          if (key === ".") continue;
          if (key === "s") {
            const slope = col < center ? "/" : col > center ? "\\" : "|";
            tile(context, view, baseX + col, baseY + row, col <= center ? colors.sail : colors.sailShade, slope);
          } else if (key === "h") {
            tile(context, view, baseX + col, baseY + row, colors.hull, row === pattern.length - 3 ? "=" : "t");
          } else {
            tile(context, view, baseX + col, baseY + row, colors.keel, ":");
          }
        }
      }
      context.fillStyle = "rgba(193, 218, 213, .22)";
      for (let i = 1; i <= 2; i++) {
        for (let dx = -i - 1; dx <= i + 1; dx += 2) {
          if (hash2(baseX + dx, baseY + i, boat.phase) < .35) continue;
          plot(context, view, baseX + center + dx, baseY + pattern.length + i - 1, i === 1 ? "~" : ".");
        }
      }
      context.restore();
    }
  }



  /* ----------------------------------------------------------------------- */
  /* Clawd — the pixel companion                                             */
  /* ----------------------------------------------------------------------- */


  /* Unofficial Clawd fan art, inspired by alwinecor/clawd-stickers (MIT).
     Character rights belong to Anthropic; see NOTICE.md. */
  class ClawdDesk {
    constructor() {
      this.id = "clawd";
      this.group = { name: "mascot", label: "Mascot" };
      this.title = "Clawd";
      this.tag = "Mascot · Dev life";
      this.caption = "A small pixel companion, keeping the terminal warm.";
      this.accent = "#e08a68";
    }

    init(view) {
      this.view = view;
      const context = stageContext;
      const rng = mulberry32(0xC1A2D);

      const background = context.createLinearGradient(0, 0, 0, view.h);
      background.addColorStop(0, "#081b27");
      background.addColorStop(.48, "#0d2d3a");
      background.addColorStop(.76, "#211711");
      background.addColorStop(1, "#0b0807");
      this.background = background;

      this.stars = Array.from({ length: Math.max(34, Math.round(view.cols * .48)) }, () => ({
        x: rng(),
        y: rng() * .62,
        phase: rng() * TAU,
        speed: .25 + rng() * .8,
        weight: rng()
      }));

      this.glyphs = Array.from({ length: 10 }, () => ({
        x: .06 + rng() * .88,
        y: .16 + rng() * .46,
        drift: .003 + rng() * .009,
        phase: rng() * TAU,
        character: ["{", "}", "<", ">", "/", ";", "(", ")", "=", "+"][Math.floor(rng() * 10)]
      }));

      this.sparkles = Array.from({ length: 9 }, () => ({
        x: .26 + rng() * .52,
        y: .3 + rng() * .45,
        phase: rng() * TAU,
        size: .7 + rng() * 1.4
      }));

      this.unit = clamp(Math.min(view.w, view.h) * .021, 6.2, 18.5);
      this.groundY = view.h * .72;
      this.panel = {
        x: view.w * .665,
        y: view.h * .35,
        w: view.w * .255,
        h: view.h * .17
      };
      this.mug = {
        x: view.w * .315,
        y: this.groundY - view.h * .062,
        size: Math.min(view.w, view.h) * .09
      };
      this.lines = [
        "$ npm run dev",
        "  ready in 392 ms",
        "  ✓ compiled",
        "  ▲ localhost:3000",
        "  > _"
      ];
      this.bubbleWords = ["hi!", "coffee?", "ship it", "// TODO"];
    }

    draw(context, view, time) {
      context.fillStyle = this.background;
      context.fillRect(0, 0, view.w, view.h);

      const halo = context.createRadialGradient(view.w * .46, view.h * .56, 0, view.w * .46, view.h * .56, view.w * .38);
      halo.addColorStop(0, "rgba(255, 164, 114, .26)");
      halo.addColorStop(.5, "rgba(255, 164, 114, .08)");
      halo.addColorStop(1, "rgba(255, 164, 114, 0)");
      context.fillStyle = halo;
      context.fillRect(0, 0, view.w, view.h);

      this.drawStars(context, view, time);
      this.drawPlatform(context, view, time);
      this.drawPanel(context, view, time);
      this.drawGlyphs(context, view, time);
      this.drawMug(context, view, time);
      this.drawClawd(context, view, time);
      this.drawSparkles(context, view, time);
    }

    drawStars(context, view, time) {
      context.save();
      for (const star of this.stars) {
        const shimmer = Math.sin(time * star.speed + star.phase) * .5 + .5;
        context.fillStyle = star.weight > .76 ? "rgba(235, 247, 230, .82)" : "rgba(184, 222, 218, .38)";
        context.globalAlpha = .45 + shimmer * .55;
        plot(context, view, Math.floor(star.x * view.cols), Math.floor(star.y * view.rows), shimmer > .7 ? "+" : star.weight > .58 ? "*" : ".");
      }
      context.restore();
    }

    drawPlatform(context, view, time) {
      const y = this.groundY;
      const left = view.w * .25;
      const right = view.w * .68;
      context.save();
      context.fillStyle = "rgba(3, 8, 10, .4)";
      context.beginPath();
      context.ellipse(view.w * .46, y + view.h * .018, view.w * .27, view.h * .035, 0, 0, TAU);
      context.fill();

      context.fillStyle = "#2b6468";
      context.fillRect(left, y, right - left, view.h * .026);
      context.fillStyle = "#164046";
      context.fillRect(left + view.w * .012, y + view.h * .026, right - left - view.w * .024, view.h * .032);
      context.fillStyle = "#3c8584";
      context.fillRect(left, y, right - left, view.h * .006);
      context.fillStyle = "rgba(255, 164, 120, .72)";
      context.fillRect(left, y, right - left, 2);

      context.fillStyle = "rgba(167, 218, 200, .14)";
      for (let i = 0; i < 9; i++) {
        context.fillRect(left + view.w * .02 + i * view.w * .047, y + view.h * .01, view.w * .02, 1);
      }
      context.restore();
    }

    drawPanel(context, view, time) {
      const p = this.panel;
      const frame = 3;
      context.save();
      drawGlow(context, "#57b6ad", p.x + p.w * .5, p.y + p.h * .5, p.w * .68, .14);
      context.fillStyle = "#071012";
      context.fillRect(p.x - frame, p.y - frame, p.w + frame * 2, p.h + frame * 2);
      context.fillStyle = "#122e34";
      context.fillRect(p.x, p.y, p.w, p.h);
      context.fillStyle = "#07171b";
      context.fillRect(p.x + 5, p.y + 5, p.w - 10, p.h - 10);

      const sx = p.x + 12;
      const sy = p.y + 12;
      const lineH = Math.max(12, p.h * .16);
      context.save();
      context.beginPath();
      context.rect(p.x + 5, p.y + 5, p.w - 10, p.h - 10);
      context.clip();
      for (let i = 0; i < this.lines.length; i++) {
        const line = this.lines[i];
        context.font = "400 " + Math.max(10, lineH * .72).toFixed(1) + 'px "SFMono-Regular", Menlo, Consolas, monospace';
        context.textAlign = "left";
        context.textBaseline = "top";
        context.fillStyle = i === 0 ? "rgba(255, 170, 124, .95)" : i === this.lines.length - 1 ? "rgba(224, 245, 226, .9)" : "rgba(153, 204, 198, .6)";
        context.fillText(line, sx, sy + i * lineH);
      }
      context.restore();

      context.fillStyle = "rgba(227, 139, 100, .28)";
      context.fillRect(p.x + 5, p.y + p.h - 8, p.w - 10, 2);
      context.strokeStyle = "rgba(201, 226, 211, .16)";
      context.lineWidth = 1;
      context.strokeRect(p.x + .5, p.y + .5, p.w - 1, p.h - 1);
      context.fillStyle = "#0b0d0e";
      context.fillRect(p.x + p.w * .46, p.y + p.h + frame, p.w * .08, view.h * .045);
      context.fillRect(p.x + p.w * .35, p.y + p.h + view.h * .04, p.w * .3, 3);
      context.restore();
    }

    drawGlyphs(context, view, time) {
      context.save();
      context.font = "400 " + Math.max(9, view.ch * .9).toFixed(1) + 'px "SFMono-Regular", Menlo, Consolas, monospace';
      context.textAlign = "center";
      context.textBaseline = "middle";
      for (const glyph of this.glyphs) {
        const x = glyph.x * view.w + Math.sin(time * .13 + glyph.phase) * 12;
        const y = glyph.y * view.h - (time * glyph.drift * view.h) % (view.h * .38);
        context.fillStyle = glyph.phase > 3 ? "rgba(241, 165, 127, .26)" : "rgba(178, 218, 208, .2)";
        context.fillText(glyph.character, x, y);
      }
      context.restore();
    }

    drawMug(context, view, time) {
      const mug = this.mug;
      const u = Math.max(3, mug.size * .065);
      const x = mug.x;
      const y = mug.y;
      const w = u * 3.4;
      const h = u * 3.8;
      context.save();
      context.fillStyle = "rgba(2, 6, 8, .35)";
      context.fillRect(x + w * .05, y + h * .95, w * .9, u * .35);
      context.fillStyle = "rgba(240, 238, 222, .95)";
      context.fillRect(x, y, w, h);
      context.fillStyle = "rgba(85, 130, 169, .95)";
      context.fillRect(x, y + h * .48, w, h * .17);
      context.strokeStyle = "rgba(240, 238, 222, .95)";
      context.lineWidth = Math.max(1, u * .45);
      context.beginPath();
      context.arc(x + w + u * .12, y + h * .5, u * .8, -Math.PI * .45, Math.PI * .45);
      context.stroke();
      context.fillStyle = "rgba(255, 242, 220, .9)";
      context.fillRect(x + w * .18, y - u * .22, w * .64, u * .2);
      context.restore();

      context.save();
      context.fillStyle = "rgba(255, 223, 183, .32)";
      for (let i = 0; i < 4; i++) {
        const sx = x + w * .35 + Math.sin(time * .7 + i * 1.4) * 5;
        const sy = y - u * (1 + i * .7) + Math.sin(time * .8 + i) * 3;
        plot(context, view, Math.floor(sx / view.cw), Math.floor(sy / view.ch), i % 2 ? "." : "~");
      }
      context.restore();
    }

    drawClawd(context, view, time) {
      const u = this.unit;
      const ground = this.groundY;
      const cx = view.w * .455 + Math.sin(time * .22) * u * .45;
      const bodyLeft = cx - u * 5.5;
      const bodyTop = ground - u * 9.3;
      const bodyW = u * 11;
      const bodyH = u * 6.7;
      const bodyRight = bodyLeft + bodyW;
      const bodyBottom = bodyTop + bodyH;

      context.save();
      context.fillStyle = "rgba(2, 6, 8, .35)";
      context.beginPath();
      context.ellipse(cx, ground + u * .2, u * 6.2, u * .8, 0, 0, TAU);
      context.fill();

      context.fillStyle = "#e27953";
      for (const leg of [-3.9, -1.6, 1.6, 3.9]) {
        context.fillRect(cx + leg * u - u * .32, bodyBottom - u * .2, u * .64, u * 2.2);
      }

      drawGlow(context, "#ff9b72", cx, bodyTop + bodyH * .5, u * 11, .12);
      context.fillStyle = "rgba(54, 24, 16, .92)";
      context.fillRect(bodyLeft - u * .2, bodyTop - u * .2, bodyW + u * .4, bodyH + u * .4);
      context.fillRect(bodyLeft - u * 2.2, bodyTop + u * 2.95, u * 2.4, u * 1.8);
      context.fillRect(bodyRight - u * .2, bodyTop + u * 2.95, u * 2.4, u * 1.8);
      context.fillStyle = "#ffa47e";
      context.fillRect(bodyLeft, bodyTop, bodyW, bodyH);
      context.fillRect(bodyLeft - u * 2, bodyTop + u * 3.1, u * 2, u * 1.5);
      context.fillRect(bodyRight, bodyTop + u * 3.1, u * 2, u * 1.5);
      context.fillStyle = "rgba(255, 219, 189, .72)";
      context.fillRect(bodyLeft + u * .65, bodyTop + u * .5, bodyW - u * 1.3, u * .4);
      context.fillStyle = "rgba(255, 188, 145, .3)";
      context.fillRect(bodyRight - u * .5, bodyTop + u * .8, u * .4, bodyH - u * 1.2);

      const stemX = cx;
      const stemY = bodyTop - u * .2;
      context.fillStyle = "#5c9c73";
      context.fillRect(stemX - u * .12, stemY - u * .7, u * .24, u * .7);
      context.fillStyle = "#77b98a";
      context.fillRect(stemX - u * .7, stemY - u * .8, u * .6, u * .22);
      context.fillRect(stemX + u * .1, stemY - u * .62, u * .55, u * .22);

      const blink = (time % 4.8) > 4.62 || ((time % 10) > 5.1 && (time % 10) < 5.2);
      const eyeH = blink ? u * .18 : u * 1.65;
      const eyeY = bodyTop + u * 2.2;
      const look = Math.sin(time * .36) * u * .15;
      context.fillStyle = "#171717";
      context.fillRect(bodyLeft + u * 3.15 + look, eyeY, u * .78, eyeH);
      context.fillRect(bodyLeft + u * 7.07 + look, eyeY, u * .78, eyeH);
      context.restore();

      this.drawSpeech(context, view, time, cx, bodyTop, u);
    }

    drawSpeech(context, view, time, cx, bodyTop, u) {
      const phase = time % 11;
      if (phase < .7 || phase > 4.7) return;
      const alpha = Math.min(1, (phase - .7) * 3.4, (4.7 - phase) * 2.2);
      const word = this.bubbleWords[Math.floor(time / 11) % this.bubbleWords.length];
      const bx = cx + u * 7.2;
      const by = bodyTop - u * 4.8;
      const bw = u * 8.6;
      const bh = u * 3.5;
      context.save();
      context.globalAlpha = alpha;
      context.fillStyle = "rgba(8, 14, 16, .94)";
      context.fillRect(bx, by, bw, bh);
      context.strokeStyle = "rgba(235, 147, 108, .65)";
      context.lineWidth = 1;
      context.strokeRect(bx + .5, by + .5, bw - 1, bh - 1);
      context.fillStyle = "rgba(250, 242, 228, .94)";
      context.font = "400 " + (u * 1.6).toFixed(1) + 'px "SFMono-Regular", Menlo, Consolas, monospace';
      context.textAlign = "left";
      context.textBaseline = "middle";
      context.fillText(word, bx + u * 1.1, by + bh * .5);
      context.fillStyle = "rgba(235, 147, 108, .7)";
      context.fillRect(bx + u * 1.3, by + bh, u * .65, u * .65);
      context.restore();
    }

    drawSparkles(context, view, time) {
      context.save();
      for (const sparkle of this.sparkles) {
        const vibe = Math.sin(time * 1.15 + sparkle.phase) * .5 + .5;
        if (vibe < .22) continue;
        const x = sparkle.x * view.w;
        const y = sparkle.y * view.h;
        const s = Math.max(2.4, this.unit * .2 * sparkle.size);
        context.fillStyle = "rgba(247, 216, 173, " + (.18 + vibe * .6).toFixed(3) + ")";
        context.fillRect(x - s * .18, y - s, s * .36, s * 2);
        context.fillRect(x - s, y - s * .18, s * 2, s * .36);
      }
      context.restore();
    }
  }



    /* --------------------------------------------------------------------- */
    /* DSH browser half                                                       */
    /* --------------------------------------------------------------------- */

    const WALLPAPER_SECONDS = 32;
    const WALLPAPER_FADE = 1.05;
    const TRANSITION_STRIPS = 44;
    const API_KEY = "nocturneWallpaper";
    const STORAGE_KEY = "dsh-nocturne-wallpaper:v1";
    const UI_HOST_ID = "nocturne-controls-host";
    const PANEL_ID = "nocturne-appearance-panel";

    const NOCTURNE_CSS = [
      "html.nocturne-html { background-color: var(--nocturne-underlay, #040506) !important; }",
      "html.nocturne-html body { background: transparent !important; }",
      "body[data-nocturne='on'] { background: transparent !important; --dsw-alias-bg-base: transparent !important; --dsw-specific-input-major: rgba(35, 37, 43, .9) !important; --dsw-specific-input-major: color-mix(in srgb, var(--dsw-static-neutral-bluish-850, #25272d) 90%, transparent) !important; --dsw-specific-bubble: rgba(35, 37, 43, .86) !important; --dsw-specific-bubble: color-mix(in srgb, var(--dsw-static-neutral-bluish-850, #25272d) 86%, transparent) !important; }",
      "body[data-nocturne='on']:not([data-ds-dark-theme]) { --dsw-specific-input-major: rgba(255, 255, 255, .94) !important; --dsw-specific-input-major: color-mix(in srgb, var(--dsw-static-neutral-bluish-00, #ffffff) 94%, transparent) !important; --dsw-specific-bubble: rgba(255, 255, 255, .91) !important; --dsw-specific-bubble: color-mix(in srgb, var(--dsw-static-neutral-bluish-00, #ffffff) 91%, transparent) !important; }",
      "body[data-nocturne='on'] #root, body[data-nocturne='on'] #app, body[data-nocturne='on'] .dsh-app, body[data-nocturne='on'] [data-dsh-app], body[data-nocturne='on'] [data-dsh-root] { background: var(--nocturne-app-tint) !important; }",
      "#nocturne-canvas, #nocturne-wash { position: fixed; inset: 0; width: 100%; height: 100%; pointer-events: none; }",
      "#nocturne-canvas { z-index: -5; display: block; background: #040506; }",
      "#nocturne-wash { z-index: -4; opacity: var(--nocturne-wash-opacity, 1); transition: opacity .28s ease; background: radial-gradient(ellipse 36% 66% at 50% 55%, rgba(3, 5, 8, .5) 0%, rgba(3, 5, 8, .45) 18%, rgba(3, 5, 8, .34) 38%, rgba(3, 5, 8, .2) 58%, rgba(3, 5, 8, .08) 78%, rgba(3, 5, 8, 0) 100%), linear-gradient(90deg, rgba(3, 5, 8, 0) 6%, rgba(3, 5, 8, .1) 30%, rgba(3, 5, 8, .16) 50%, rgba(3, 5, 8, .1) 70%, rgba(3, 5, 8, 0) 94%), radial-gradient(ellipse 85% 95% at 50% 46%, rgba(2, 3, 5, 0) 58%, rgba(2, 3, 5, .2) 100%), linear-gradient(180deg, rgba(2, 4, 6, .3) 0%, rgba(2, 4, 6, 0) 14%, rgba(2, 4, 6, 0) 74%, rgba(2, 4, 6, .38) 100%); }",
      "body:not([data-ds-dark-theme]) #nocturne-canvas { filter: brightness(1.16) saturate(1.24) contrast(.9) sepia(.06); }",
      "body:not([data-ds-dark-theme]) #nocturne-wash { background: radial-gradient(ellipse 38% 68% at 50% 52%, rgba(252, 249, 241, .84) 0%, rgba(252, 249, 241, .78) 16%, rgba(251, 247, 238, .64) 36%, rgba(250, 245, 234, .42) 56%, rgba(249, 243, 230, .2) 76%, rgba(249, 243, 230, .06) 90%, rgba(249, 243, 230, 0) 100%), linear-gradient(90deg, rgba(250, 246, 237, .04) 0%, rgba(250, 246, 237, .22) 26%, rgba(250, 246, 237, .32) 50%, rgba(250, 246, 237, .22) 74%, rgba(250, 246, 237, .04) 100%), linear-gradient(180deg, rgba(253, 250, 244, .26) 0%, rgba(253, 250, 244, 0) 20%, rgba(244, 236, 221, 0) 74%, rgba(244, 236, 221, .3) 100%); }",
      "@media print { #nocturne-canvas, #nocturne-wash { display: none !important; } }"
    ].join("\n");

    const CONTROLS_CSS = [
      ":host { all: initial; position: fixed; right: max(14px, env(safe-area-inset-right, 0px)); bottom: max(16px, env(safe-area-inset-bottom, 0px)); z-index: 2147483647; display: block; pointer-events: none; color-scheme: dark; --ui-bg: rgba(9, 11, 14, .94); --ui-ink: #f3f0e6; --ui-dim: rgba(243, 240, 230, .56); --ui-faint: rgba(243, 240, 230, .32); --ui-line: rgba(255, 255, 255, .11); --ui-hover: rgba(255, 255, 255, .07); --ui-accent: #c4dcdf; --ui-serif: 'Iowan Old Style', 'Palatino Linotype', 'Book Antiqua', Palatino, Georgia, serif; --ui-sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; --ui-mono: 'SFMono-Regular', 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace; }",
      ":host([data-theme='light']) { color-scheme: light; --ui-bg: rgba(250, 247, 241, .97); --ui-ink: #1b1c1e; --ui-dim: rgba(27, 28, 30, .58); --ui-faint: rgba(27, 28, 30, .34); --ui-line: rgba(0, 0, 0, .12); --ui-hover: rgba(0, 0, 0, .05); }",
      "*, *::before, *::after { box-sizing: border-box; }",
      "button { font: inherit; color: inherit; }",
      ".trigger { pointer-events: auto; position: relative; display: flex; align-items: center; gap: 8px; height: 34px; padding: 0 11px 0 9px; border: 1px solid var(--ui-line); border-radius: 999px; background: var(--ui-bg); color: var(--ui-ink); box-shadow: 0 8px 28px rgba(0, 0, 0, .2); -webkit-backdrop-filter: blur(16px); backdrop-filter: blur(16px); cursor: pointer; opacity: .72; transition: opacity .2s ease, border-color .2s ease, background-color .2s ease; }",
      ".trigger:hover, .trigger:focus-visible, :host(.is-open) .trigger { opacity: 1; border-color: color-mix(in srgb, var(--ui-accent) 48%, var(--ui-line)); }",
      ".trigger:focus-visible { outline: 1px solid var(--ui-accent); outline-offset: 3px; }",
      ".trigger-label { font-family: var(--ui-mono); font-size: 7px; line-height: 1; letter-spacing: .16em; text-transform: uppercase; color: var(--ui-dim); }",
      ".mark { display: grid; grid-template-columns: repeat(3, 2.5px); grid-template-rows: repeat(3, 2.5px); gap: 1.5px; width: 10.5px; height: 10.5px; flex: none; }",
      ".mark i { display: block; border-radius: .5px; background: var(--ui-faint); }",
      ".mark i:nth-child(2), .mark i:nth-child(4), .mark i:nth-child(6), .mark i:nth-child(8) { background: var(--ui-dim); }",
      ".mark i:nth-child(5) { background: var(--ui-accent); }",
      ".panel { pointer-events: auto; position: absolute; right: 0; bottom: calc(100% + 9px); width: min(308px, calc(100vw - 24px)); max-height: min(680px, calc(100vh - 96px)); overflow-y: auto; overscroll-behavior: contain; padding: 0; border: 1px solid var(--ui-line); border-radius: 14px; background: var(--ui-bg); color: var(--ui-ink); box-shadow: 0 22px 70px rgba(0, 0, 0, .38); -webkit-backdrop-filter: blur(22px); backdrop-filter: blur(22px); outline: none; animation: panel-in .18s cubic-bezier(.22, .61, .36, 1) both; scrollbar-width: thin; scrollbar-color: var(--ui-line) transparent; }",
      ".panel[hidden] { display: none; }",
      ".panel::-webkit-scrollbar { width: 5px; }",
      ".panel::-webkit-scrollbar-thumb { background: var(--ui-line); border-radius: 99px; }",
      ".head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 15px 16px 13px; border-bottom: 1px solid var(--ui-line); background: linear-gradient(135deg, color-mix(in srgb, var(--ui-accent) 8%, transparent), transparent 64%); }",
      ".head-copy { display: flex; flex-direction: column; gap: 6px; }",
      ".eyebrow { font-family: var(--ui-mono); font-size: 6.5px; line-height: 1; letter-spacing: .2em; text-transform: uppercase; color: var(--ui-dim); }",
      ".title { margin: 0; font-family: var(--ui-serif); font-size: 21px; font-style: italic; font-weight: 400; line-height: .9; letter-spacing: -.035em; color: var(--ui-ink); }",
      ".close { display: grid; place-items: center; width: 27px; height: 27px; flex: none; padding: 0; border: 1px solid transparent; border-radius: 50%; background: transparent; color: var(--ui-faint); font-family: var(--ui-mono); font-size: 14px; line-height: 1; cursor: pointer; }",
      ".close:hover, .close:focus-visible { border-color: var(--ui-line); background: var(--ui-hover); color: var(--ui-ink); }",
      ".close:focus-visible { outline: 1px solid var(--ui-accent); outline-offset: 3px; }",
      ".body { padding: 12px 16px 4px; }",
      ".setting { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 9px 0; }",
      ".setting.primary { border-bottom: 1px solid var(--ui-line); padding-bottom: 13px; }",
      ".setting-copy { display: flex; flex-direction: column; gap: 4px; min-width: 0; }",
      ".setting-title { font-family: var(--ui-sans); font-size: 12px; line-height: 1; letter-spacing: -.005em; color: var(--ui-ink); }",
      ".setting-note { font-family: var(--ui-mono); font-size: 6.5px; line-height: 1.2; letter-spacing: .08em; text-transform: uppercase; color: var(--ui-faint); }",
      ".switch { position: relative; width: 34px; height: 19px; flex: none; padding: 0; border: 1px solid var(--ui-line); border-radius: 99px; background: var(--ui-hover); cursor: pointer; transition: background-color .2s ease, border-color .2s ease; }",
      ".switch::after { content: ''; position: absolute; top: 2px; left: 2px; width: 13px; height: 13px; border-radius: 50%; background: var(--ui-ink); opacity: .55; transition: transform .2s ease, background-color .2s ease, opacity .2s ease; }",
      ".switch[aria-checked='true'] { border-color: color-mix(in srgb, var(--ui-accent) 55%, var(--ui-line)); background: color-mix(in srgb, var(--ui-accent) 28%, transparent); }",
      ".switch[aria-checked='true']::after { transform: translateX(15px); background: var(--ui-accent); opacity: 1; }",
      ".switch:focus-visible { outline: 1px solid var(--ui-accent); outline-offset: 3px; }",
      ".section-label { margin: 15px 0 7px; font-family: var(--ui-mono); font-size: 6.5px; line-height: 1; letter-spacing: .18em; text-transform: uppercase; color: var(--ui-faint); }",
      ".scenes { max-height: 220px; overflow-y: auto; overscroll-behavior: contain; border-top: 1px solid var(--ui-line); scrollbar-width: thin; scrollbar-color: var(--ui-line) transparent; }",
      ".scenes::-webkit-scrollbar { width: 5px; }",
      ".scenes::-webkit-scrollbar-thumb { background: var(--ui-line); border-radius: 99px; }",
      ".scene-group-label { position: sticky; top: 0; z-index: 1; padding: 9px 2px 6px; background: var(--ui-bg); font-family: var(--ui-mono); font-size: 6px; line-height: 1; letter-spacing: .18em; text-transform: uppercase; color: var(--ui-faint); }",
      ".scene { display: grid; grid-template-columns: 22px 1fr 10px; align-items: center; gap: 8px; width: 100%; padding: 8px 2px; border: 0; border-bottom: 1px solid var(--ui-line); background: transparent; color: var(--ui-dim); text-align: left; cursor: pointer; transition: color .18s ease, padding-left .18s ease; }",
      ".scene:hover, .scene:focus-visible { padding-left: 4px; color: var(--ui-ink); }",
      ".scene:focus-visible { outline: 1px solid var(--ui-accent); outline-offset: -1px; }",
      ".scene-no { font-family: var(--ui-mono); font-size: 6.5px; line-height: 1; color: var(--ui-faint); }",
      ".scene-name { font-size: 11.5px; line-height: 1.2; letter-spacing: .005em; }",
      ".scene-dot { justify-self: end; width: 4px; height: 4px; border-radius: 50%; background: transparent; box-shadow: inset 0 0 0 1px var(--ui-line); }",
      ".scene.is-active { color: var(--ui-ink); }",
      ".scene.is-active .scene-no { color: var(--ui-accent); }",
      ".scene.is-active .scene-dot { background: var(--ui-accent); box-shadow: 0 0 9px color-mix(in srgb, var(--ui-accent) 60%, transparent); }",
      ".motion-block { padding-top: 1px; }",
      ".slider-wrap { padding: 13px 0 11px; border-top: 1px solid var(--ui-line); margin-top: 6px; }",
      ".slider-head { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; margin-bottom: 8px; }",
      ".slider-label { font-family: var(--ui-sans); font-size: 11.5px; line-height: 1; color: var(--ui-ink); }",
      ".slider-value { font-family: var(--ui-mono); font-size: 7px; letter-spacing: .08em; color: var(--ui-accent); }",
      ".slider-note { margin-top: 5px; font-family: var(--ui-mono); font-size: 6.5px; line-height: 1.3; letter-spacing: .07em; text-transform: uppercase; color: var(--ui-faint); }",
      ".liveliness { margin-top: 10px; padding: 11px 0 2px; border-top: 1px solid var(--ui-line); }",
      ".liveliness .slider-head { margin-bottom: 8px; }",
      "input[type='range'] { -webkit-appearance: none; appearance: none; display: block; width: 100%; height: 18px; margin: 0; padding: 0; background: transparent; cursor: pointer; }",
      "input[type='range']::-webkit-slider-runnable-track { height: 2px; border-radius: 99px; background: linear-gradient(to right, var(--ui-accent) 0%, var(--ui-accent) calc(var(--value, 50) * 1%), var(--ui-line) calc(var(--value, 50) * 1%), var(--ui-line) 100%); }",
      "input[type='range']::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 12px; height: 12px; margin-top: -5px; border: 2px solid var(--ui-bg); border-radius: 50%; background: var(--ui-accent); box-shadow: 0 0 0 1px var(--ui-line), 0 2px 8px rgba(0, 0, 0, .25); }",
      "input[type='range']::-moz-range-track { height: 2px; border-radius: 99px; background: var(--ui-line); }",
      "input[type='range']::-moz-range-progress { height: 2px; border-radius: 99px; background: var(--ui-accent); }",
      "input[type='range']::-moz-range-thumb { width: 9px; height: 9px; border: 2px solid var(--ui-bg); border-radius: 50%; background: var(--ui-accent); }",
      "input[type='range']:focus-visible { outline: 1px solid var(--ui-accent); outline-offset: 3px; border-radius: 99px; }",
      ".foot { display: flex; justify-content: space-between; gap: 12px; padding: 10px 16px 11px; border-top: 1px solid var(--ui-line); font-family: var(--ui-mono); font-size: 6.2px; line-height: 1; letter-spacing: .1em; text-transform: uppercase; color: var(--ui-faint); }",
      ":host([data-enabled='false']) .trigger { opacity: .46; }",
      ":host([data-enabled='false']) .trigger:hover, :host([data-enabled='false']) .trigger:focus-visible { opacity: .9; }",
      ":host([data-enabled='false']) .mark i:nth-child(5) { background: var(--ui-faint); }",
      "@keyframes panel-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }",
      "@media (max-width: 680px) { :host { right: max(12px, env(safe-area-inset-right, 0px)); bottom: max(92px, calc(env(safe-area-inset-bottom, 0px) + 78px)); } .panel { width: min(300px, calc(100vw - 24px)); max-height: min(680px, calc(100vh - 156px)); } }",
      "@media (prefers-reduced-motion: reduce) { .panel { animation: none; } }"
    ].join("\n");

    function isDarkTheme() {
      return document.body !== null && document.body.hasAttribute("data-ds-dark-theme");
    }

    function loadPreferences() {
      const defaults = {
        scene: 0,
        auto: !reduceQuery.matches,
        paused: false,
        enabled: true,
        visibility: 50,
        liveliness: 75
      };
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return defaults;
        const stored = JSON.parse(raw);
        if (stored === null || typeof stored !== "object") return defaults;
        const scene = Number.isInteger(stored.scene) ? stored.scene : defaults.scene;
        const visibility = typeof stored.visibility === "number" && Number.isFinite(stored.visibility)
          ? clamp(stored.visibility, 0, 100)
          : defaults.visibility;
        const liveliness = typeof stored.liveliness === "number" && Number.isFinite(stored.liveliness)
          ? clamp(stored.liveliness, 0, 100)
          : defaults.liveliness;
        return {
          scene: scene,
          auto: typeof stored.auto === "boolean" ? stored.auto : defaults.auto,
          paused: typeof stored.paused === "boolean" ? stored.paused : defaults.paused,
          enabled: typeof stored.enabled === "boolean" ? stored.enabled : defaults.enabled,
          visibility: visibility,
          liveliness: liveliness
        };
      } catch (error) {
        return defaults;
      }
    }

    function makeNode(tag, className, text) {
      const node = document.createElement(tag);
      if (className) node.className = className;
      if (text !== undefined) node.textContent = text;
      return node;
    }

    function mountNocturne() {
      if (!document.body) return function () {};

      for (const staleId of ["nocturne-canvas", "nocturne-wash", "nocturne-style", UI_HOST_ID]) {
        const stale = document.getElementById(staleId);
        if (stale !== null) stale.remove();
      }

      const canvas = document.createElement("canvas");
      canvas.id = "nocturne-canvas";
      canvas.setAttribute("aria-hidden", "true");

      const wash = document.createElement("div");
      wash.id = "nocturne-wash";
      wash.setAttribute("aria-hidden", "true");

      const style = document.createElement("style");
      style.id = "nocturne-style";
      style.dataset.plugin = "dsh-nocturne-wallpaper";
      style.textContent = NOCTURNE_CSS;

      const snapshot = document.createElement("canvas");
      // A quarter-resolution copy of the scene's background, masked to a soft
      // ellipse. Drawn over the glyphs each frame, it lowers their contrast
      // behind the chat column without flattening the sky gradient.
      const plate = document.createElement("canvas");
      const mote = new Mote();
      const uiHost = document.createElement("div");
      uiHost.id = UI_HOST_ID;
      const shadow = uiHost.attachShadow({ mode: "open" });
      const state = loadPreferences();

      let scenes = [];
      let currentIndex = 0;
      let view = null;
      let sceneTime = 0;
      let autoTime = 0;
      let fade = 0;
      let motionScale = reduceQuery.matches ? .34 : 1;
      let raf = null;
      let lastDraw = 0;
      let resizeTimer = null;
      let disposed = false;
      let controls = null;
      let themeObserver = null;
      let pointerTargetX = 0;
      let pointerTargetY = 0;
      let pointerX = 0;
      let pointerY = 0;
      let plateDirty = true;

      stageContext = canvas.getContext("2d", { alpha: false, desynchronized: true });
      if (!stageContext) return function () {};

      document.head.appendChild(style);
      document.body.prepend(wash);
      document.body.prepend(canvas);
      document.body.appendChild(uiHost);

      scenes = [
        new CloudDrift(CLOUD_VARIANTS[0]),
        new CloudDrift(CLOUD_VARIANTS[1]),
        new CloudDrift(CLOUD_VARIANTS[2]),
        new CloudDrift(CLOUD_VARIANTS[3]),
        new CloudDrift(CLOUD_VARIANTS[4]),
        new PaperBoats(),
        new HonuLagoon(),
        new KoiPond(),
        new DeepSeekWhale(),
        new Jellyfish(),
        new Fireflies(),
        new Moonlit(),
        new ClawdDesk()
      ];
      currentIndex = ((state.scene % scenes.length) + scenes.length) % scenes.length;

      function currentScene() {
        return scenes[currentIndex];
      }

      function currentState() {
        const scene = currentScene();
        return {
          index: currentIndex,
          id: scene === undefined ? "" : (scene.id || ""),
          name: scene === undefined ? "" : scene.title,
          group: scene === undefined ? null : scene.group,
          paused: state.paused,
          auto: state.auto,
          enabled: state.enabled,
          visibility: state.visibility,
          liveliness: state.liveliness
        };
      }

      function savePreferences() {
        try {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
            scene: currentIndex,
            auto: state.auto,
            paused: state.paused,
            enabled: state.enabled,
            visibility: state.visibility,
            liveliness: state.liveliness
          }));
        } catch (error) {}
      }

      function applyTint() {
        if (!state.enabled) {
          document.body.style.removeProperty("--nocturne-app-tint");
          return;
        }
        const v = clamp(state.visibility, 0, 100) / 100;
        const dark = isDarkTheme();
        const alpha = dark ? .56 - .44 * v : .2 - .16 * v;
        const rgb = dark ? "5, 8, 11" : "250, 247, 239";
        document.body.style.setProperty("--nocturne-app-tint", "rgba(" + rgb + ", " + alpha.toFixed(3) + ")");
        document.documentElement.style.setProperty("--nocturne-underlay", dark ? "#040506" : "#f4f0e6");
        const washOpacity = dark ? 1 - .22 * v : .96 - .36 * v;
        wash.style.opacity = washOpacity.toFixed(3);
        plateDirty = true;
      }

      function syncTheme() {
        if (controls === null) return;
        uiHost.dataset.theme = isDarkTheme() ? "dark" : "light";
        applyTint();
      }

      function syncControls() {
        if (controls === null) return;
        controls.enabledSwitch.setAttribute("aria-checked", String(state.enabled));
        controls.autoSwitch.setAttribute("aria-checked", String(state.auto));
        controls.animationSwitch.setAttribute("aria-checked", String(!state.paused));
        controls.visibility.value = String(Math.round(state.visibility));
        controls.visibility.style.setProperty("--value", String(state.visibility));
        controls.visibilityValue.textContent = Math.round(state.visibility) + "%";
        controls.liveliness.value = String(Math.round(state.liveliness));
        controls.liveliness.style.setProperty("--value", String(state.liveliness));
        controls.livelinessValue.textContent = Math.round(state.liveliness) + "%";
        controls.sceneButtons.forEach(function (button, index) {
          const active = index === currentIndex;
          button.classList.toggle("is-active", active);
          button.setAttribute("aria-pressed", String(active));
        });
        uiHost.dataset.enabled = String(state.enabled);
        const scene = currentScene();
        const accent = scene && scene.accent ? scene.accent : "#c4dcdf";
        const name = scene && scene.title ? scene.title : "Nocturne";
        uiHost.style.setProperty("--ui-accent", accent);
        controls.trigger.title = "Nocturne appearance: " + name;
        controls.trigger.setAttribute("aria-label", "Open Nocturne appearance. Current scene: " + name);
      }

      function syncAll() {
        syncTheme();
        syncControls();
      }

      function resolveScene(value) {
        if (scenes.length === 0) return -1;
        if (typeof value === "number" && Number.isFinite(value)) {
          const index = Math.trunc(value);
          return ((index % scenes.length) + scenes.length) % scenes.length;
        }
        if (typeof value === "string") {
          const slug = value.toLowerCase().replace(/[^a-z0-9]/g, "");
          return scenes.findIndex(function (scene) {
            const id = scene.id ? scene.id.toLowerCase().replace(/[^a-z0-9]/g, "") : "";
            const title = scene.title.toLowerCase().replace(/[^a-z0-9]/g, "");
            return id === slug || title === slug;
          });
        }
        return -1;
      }

      function measure() {
        if (disposed) return;
        const width = Math.max(1, window.innerWidth);
        const height = Math.max(1, window.innerHeight);
        const pixelBudget = 8500000;
        const budgetDpr = Math.sqrt(pixelBudget / Math.max(1, width * height));
        const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 1.6, budgetDpr));

        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);

        // Chunky, near-square cells so tiles read as a mosaic.
        const cellWidth = clamp(width / 112, 10, 15);
        const cellHeight = cellWidth * 1.28;
        const cols = Math.max(24, Math.ceil(width / cellWidth));
        const rows = Math.max(24, Math.ceil(height / cellHeight));
        const cw = width / cols;
        const ch = height / rows;

        view = {
          w: width,
          h: height,
          cols: cols,
          rows: rows,
          cw: cw,
          ch: ch,
          dpr: dpr
        };
        prepareView(view);

        stageContext.setTransform(dpr, 0, 0, dpr, 0, 0);
        stageContext.textAlign = "center";
        stageContext.textBaseline = "middle";
        stageContext.font = view.font;
        stageContext.imageSmoothingEnabled = true;

        for (const scene of scenes) scene.init(view);
        fade = 0;
        plateDirty = true;
      }

      function buildPlate() {
        plateDirty = false;
        const scene = currentScene();
        if (view === null || scene === undefined || typeof scene.paintBase !== "function") {
          plate.width = 0;
          return;
        }
        const pw = Math.max(48, Math.round(view.w / 4));
        const ph = Math.max(32, Math.round(view.h / 4));
        if (plate.width !== pw) plate.width = pw;
        if (plate.height !== ph) plate.height = ph;
        const plateContext = plate.getContext("2d");
        plateContext.setTransform(1, 0, 0, 1, 0, 0);
        plateContext.globalCompositeOperation = "source-over";
        plateContext.globalAlpha = 1;
        plateContext.clearRect(0, 0, pw, ph);
        plateContext.setTransform(pw / view.w, 0, 0, ph / view.h, 0, 0);
        scene.paintBase(plateContext, view);

        const v = clamp(state.visibility, 0, 100) / 100;
        const strength = isDarkTheme() ? .56 - .16 * v : .42 - .14 * v;
        plateContext.globalCompositeOperation = "destination-in";
        plateContext.setTransform(pw / view.w * chatHalfWidth(view) * 1.18, 0, 0, ph * .76, pw * .5, ph * .56);
        const mask = plateContext.createRadialGradient(0, 0, 0, 0, 0, 1);
        for (let i = 0; i <= 12; i++) {
          const t = i / 12;
          mask.addColorStop(t, "rgba(0, 0, 0, " + (strength * Math.pow(1 - t * t, 2.2)).toFixed(4) + ")");
        }
        plateContext.fillStyle = mask;
        plateContext.fillRect(-2, -2, 4, 4);
        plateContext.globalCompositeOperation = "source-over";
        plateContext.setTransform(1, 0, 0, 1, 0, 0);
      }

      function render(withMote) {
        if (disposed || view === null || !state.enabled) return;
        const live = clamp(state.liveliness, 0, 100) / 100;
        const liveFactor = live * (reduceQuery.matches ? .35 : 1);
        const maxShiftX = Math.min(8, view.w * .016) * liveFactor;
        const maxShiftY = Math.min(6, view.h * .011) * liveFactor;
        const driftX = Math.sin(sceneTime * .17) * .14;
        const driftY = Math.cos(sceneTime * .12) * .1;
        // Half of the shift moves the whole stage; scenes spend the rest on
        // per-layer depth, so near layers lead and far layers lag.
        const shiftX = (pointerX + driftX) * maxShiftX * .55;
        const shiftY = (pointerY + driftY) * maxShiftY * .55;
        view.px = (pointerX + driftX) * maxShiftX * .9;
        view.py = (pointerY + driftY) * maxShiftY * .9;
        const scale = 1 + Math.max((maxShiftX * 2.4 + 8) / view.w, (maxShiftY * 2.4 + 8) / view.h);
        const offsetX = view.w * (1 - scale) / 2 + shiftX;
        const offsetY = view.h * (1 - scale) / 2 + shiftY;
        stageContext.setTransform(view.dpr * scale, 0, 0, view.dpr * scale, view.dpr * offsetX, view.dpr * offsetY);
        stageContext.globalAlpha = 1;
        stageContext.globalCompositeOperation = "source-over";
        stageContext.font = view.font;
        stageContext.textAlign = "center";
        stageContext.textBaseline = "middle";

        scenes[currentIndex].draw(stageContext, view, sceneTime);

        if (plateDirty) buildPlate();
        if (plate.width > 0) {
          stageContext.save();
          stageContext.globalAlpha = 1;
          stageContext.globalCompositeOperation = "source-over";
          stageContext.imageSmoothingEnabled = true;
          stageContext.drawImage(plate, 0, 0, view.w, view.h);
          stageContext.restore();
        }

        if (fade > 0 && snapshot.width > 0 && snapshot.height > 0) {
          const progress = clamp(1 - fade, 0, 1);
          // 44 strips sweep left to right. Each clears with a long eased
          // overlap and a little jitter, so neighbouring strips stay close in
          // tone and the background blends instead of stepping.
          const strips = TRANSITION_STRIPS;
          const stripWidth = snapshot.width / strips;
          stageContext.save();
          stageContext.setTransform(1, 0, 0, 1, 0, 0);
          for (let i = 0; i < strips; i++) {
            const start = i / strips * .3 + (hash2(i, 3, 1.7) - .5) * .035;
            const local = clamp((progress - start) / .68, 0, 1);
            const alpha = 1 - local * local * local * (local * (local * 6 - 15) + 10);
            if (alpha <= .008) continue;
            const x = Math.floor(i * stripWidth);
            const width = Math.min(snapshot.width, Math.ceil((i + 1) * stripWidth)) - x;
            stageContext.globalAlpha = alpha;
            stageContext.drawImage(snapshot, x, 0, width, snapshot.height, x, 0, width, snapshot.height);
          }
          stageContext.restore();

          // A thin accent seam of characters rides the half-cleared edge.
          const scene = currentScene();
          const accent = scene && scene.accent ? scene.accent : "#c4dcdf";
          const envelope = Math.pow(Math.sin(progress * Math.PI), 1.2);
          const seamX = (progress - .34) / .3 * view.w;
          const gx = Math.floor(seamX / view.cw);
          if (envelope > .01 && gx >= -1 && gx <= view.cols) {
            const band = view.cw * 6;
            const rgb = hexToRgb(accent).join(", ");
            const glow = stageContext.createLinearGradient(seamX - band, 0, seamX + band, 0);
            glow.addColorStop(0, "rgba(" + rgb + ", 0)");
            glow.addColorStop(.5, "rgba(" + rgb + ", " + (.045 * envelope).toFixed(4) + ")");
            glow.addColorStop(1, "rgba(" + rgb + ", 0)");
            stageContext.save();
            stageContext.globalCompositeOperation = "lighter";
            stageContext.fillStyle = glow;
            stageContext.fillRect(seamX - band, 0, band * 2, view.h);
            stageContext.globalCompositeOperation = "source-over";
            stageContext.fillStyle = accent;
            const flicker = Math.floor(progress * 14);
            for (let y = 0; y < view.rows; y++) {
              const n = hash2(y, flicker, 2.9);
              if (n < .3) continue;
              stageContext.globalAlpha = envelope * (.22 + n * .3) * (1 - quietAt(view, gx, y) * .55);
              plot(stageContext, view, gx, y, n > .86 ? "o" : n > .6 ? ":" : ".");
            }
            stageContext.restore();
          }
        }

        if (withMote !== false) mote.draw(stageContext, view, isDarkTheme());
      }

      function capture() {
        // Re-render the outgoing frame without the creature, so the
        // resident does not ghost while the old scene dissolves.
        if (fade === 0) render(false);
        snapshot.width = canvas.width;
        snapshot.height = canvas.height;
        const snapshotContext = snapshot.getContext("2d");
        snapshotContext.setTransform(1, 0, 0, 1, 0, 0);
        snapshotContext.clearRect(0, 0, snapshot.width, snapshot.height);
        snapshotContext.drawImage(canvas, 0, 0);
      }

      function showScene(value, options) {
        if (disposed) return;
        const nextIndex = resolveScene(value);
        if (nextIndex < 0) return;
        const instant = Boolean(options && options.instant);

        if (nextIndex === currentIndex && !instant) {
          sceneTime = 0;
          autoTime = 0;
          return;
        }

        if (!instant && state.enabled) capture();
        currentIndex = nextIndex;
        plateDirty = true;
        sceneTime = 0;
        autoTime = 0;
        fade = instant ? 0 : 1;

        if (!state.enabled || state.paused) {
          fade = 0;
          if (state.enabled) render();
        } else if (raf === null) {
          start();
        }
        syncControls();
        savePreferences();
      }

      function nextScene() {
        showScene(currentIndex + 1);
      }

      function previousScene() {
        showScene(currentIndex - 1);
      }

      function setPaused(value) {
        if (disposed) return;
        const next = Boolean(value);
        if (next === state.paused) return;
        state.paused = next;
        if (state.paused) stop();
        else if (state.enabled) start();
        syncControls();
        savePreferences();
      }

      function setAuto(value) {
        state.auto = Boolean(value);
        autoTime = 0;
        syncControls();
        savePreferences();
      }

      function setVisibility(value) {
        const next = clamp(Math.round(Number(value) || 0), 0, 100);
        if (next === state.visibility) return;
        state.visibility = next;
        applyTint();
        syncControls();
        savePreferences();
      }

      function setLiveliness(value) {
        const next = clamp(Math.round(Number(value) || 0), 0, 100);
        if (next === state.liveliness) return;
        state.liveliness = next;
        syncControls();
        savePreferences();
      }

      function setEnabled(value, force) {
        if (disposed) return;
        const next = Boolean(value);
        if (next === state.enabled && force !== true) return;
        state.enabled = next;

        if (state.enabled) {
          document.body.setAttribute("data-nocturne", "on");
          document.documentElement.classList.add("nocturne-html");
          canvas.style.display = "block";
          wash.style.display = "block";
          applyTint();
          if (view === null) measure();
          render();
          if (!state.paused) start();
        } else {
          stop();
          fade = 0;
          document.body.removeAttribute("data-nocturne");
          document.documentElement.classList.remove("nocturne-html");
          document.body.style.removeProperty("--nocturne-app-tint");
          canvas.style.display = "none";
          wash.style.display = "none";
        }
        syncControls();
        savePreferences();
      }

      function start() {
        if (disposed || !state.enabled || state.paused || document.hidden || raf !== null) return;
        lastDraw = performance.now();
        raf = requestAnimationFrame(tick);
      }

      function stop() {
        if (raf !== null) cancelAnimationFrame(raf);
        raf = null;
      }

      function tick(now) {
        if (disposed || !state.enabled || state.paused || document.hidden) {
          raf = null;
          return;
        }
        raf = requestAnimationFrame(tick);

        if (lastDraw === 0) lastDraw = now;
        const elapsed = now - lastDraw;
        if (elapsed < 1000 / TARGET_FPS) return;

        const wallDt = Math.min(elapsed / 1000, 2);
        const sceneDt = Math.min(wallDt, .12);
        lastDraw = now;
        const livelySpeed = .7 + .7 * (state.liveliness / 100);
        sceneTime += sceneDt * motionScale * livelySpeed;
        const pointerFollow = Math.min(1, sceneDt * 3.4);
        pointerX += (pointerTargetX - pointerX) * pointerFollow;
        pointerY += (pointerTargetY - pointerY) * pointerFollow;
        if (state.auto) autoTime += wallDt;
        // Capped so a dropped frame slows the dissolve instead of skipping it.
        if (fade > 0) fade = Math.max(0, fade - Math.min(wallDt, .1) / WALLPAPER_FADE);
        if (view !== null) mote.update(sceneDt, view, (reduceQuery.matches ? .5 : 1) * (.8 + .4 * (state.liveliness / 100)));
        render();

        if (state.auto && autoTime >= WALLPAPER_SECONDS) nextScene();
      }

      function scheduleResize() {
        if (disposed) return;
        if (resizeTimer !== null) clearTimeout(resizeTimer);
        resizeTimer = window.setTimeout(function () {
          resizeTimer = null;
          if (disposed) return;
          measure();
          render();
        }, 120);
      }

      function onVisibilityChange() {
        if (document.hidden) stop();
        else if (!state.paused && state.enabled) start();
      }

      function onPointerMove(event) {
        if (event.pointerType === "touch") return;
        pointerTargetX = clamp((event.clientX / Math.max(1, window.innerWidth)) * 2 - 1, -1, 1);
        pointerTargetY = clamp((event.clientY / Math.max(1, window.innerHeight)) * 2 - 1, -1, 1);
      }

      function resetPointer() {
        pointerTargetX = 0;
        pointerTargetY = 0;
      }

      function isEditable(target) {
        if (target === null || target === undefined) return false;
        const tag = target.tagName;
        return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable === true;
      }

      function openPanel() {
        if (controls === null || !controls.panel.hidden) return;
        controls.panel.hidden = false;
        controls.trigger.setAttribute("aria-expanded", "true");
        uiHost.classList.add("is-open");
        controls.panel.focus({ preventScroll: true });
      }

      function closePanel(returnFocus) {
        if (controls === null || controls.panel.hidden) return;
        controls.panel.hidden = true;
        controls.trigger.setAttribute("aria-expanded", "false");
        uiHost.classList.remove("is-open");
        if (returnFocus === true) controls.trigger.focus({ preventScroll: true });
        else if (shadow.activeElement !== null && controls.panel.contains(shadow.activeElement)) {
          controls.trigger.focus({ preventScroll: true });
        }
      }

      function onDocumentPointerDown(event) {
        if (controls === null || controls.panel.hidden) return;
        const path = typeof event.composedPath === "function" ? event.composedPath() : [];
        if (path.indexOf(uiHost) !== -1) return;
        closePanel(false);
      }

      function onKeyDown(event) {
        if (event.key === "Escape" && controls !== null && !controls.panel.hidden) {
          event.preventDefault();
          closePanel(true);
          return;
        }
        if (!event.altKey || event.metaKey || event.ctrlKey) return;
        if (isEditable(event.target)) return;
        if (typeof event.composedPath === "function" && event.composedPath().indexOf(uiHost) !== -1) return;
        const code = event.code;

        if (/^Digit[1-9]$/.test(code)) {
          event.preventDefault();
          showScene(Number(code.slice(5)) - 1);
          return;
        }
        if (code === "Digit0") {
          event.preventDefault();
          setPaused(!state.paused);
          return;
        }
        if (code === "KeyA") {
          event.preventDefault();
          setAuto(!state.auto);
          return;
        }
        if (code === "ArrowRight") {
          event.preventDefault();
          nextScene();
          return;
        }
        if (code === "ArrowLeft") {
          event.preventDefault();
          previousScene();
        }
      }

      function onMotionPreferenceChange(event) {
        motionScale = event.matches ? .34 : 1;
        if (event.matches) {
          state.auto = false;
          syncControls();
          savePreferences();
        }
      }

      function makeSwitch(label, checked) {
        const button = makeNode("button", "switch");
        button.type = "button";
        button.setAttribute("role", "switch");
        button.setAttribute("aria-label", label);
        button.setAttribute("aria-checked", checked ? "true" : "false");
        return button;
      }

      function makeSetting(title, note, control) {
        const row = makeNode("div", "setting");
        const copy = makeNode("div", "setting-copy");
        copy.appendChild(makeNode("span", "setting-title", title));
        copy.appendChild(makeNode("span", "setting-note", note));
        row.appendChild(copy);
        row.appendChild(control);
        return row;
      }

      function buildControls() {
        const uiStyle = document.createElement("style");
        uiStyle.textContent = CONTROLS_CSS;
        shadow.appendChild(uiStyle);

        const trigger = makeNode("button", "trigger");
        trigger.type = "button";
        trigger.setAttribute("aria-controls", PANEL_ID);
        trigger.setAttribute("aria-expanded", "false");

        const mark = makeNode("span", "mark");
        mark.setAttribute("aria-hidden", "true");
        for (let i = 0; i < 9; i++) mark.appendChild(document.createElement("i"));
        trigger.appendChild(mark);
        trigger.appendChild(makeNode("span", "trigger-label", "Nocturne"));

        const panel = makeNode("section", "panel");
        panel.id = PANEL_ID;
        panel.hidden = true;
        panel.tabIndex = -1;
        panel.setAttribute("role", "dialog");
        panel.setAttribute("aria-modal", "false");
        panel.setAttribute("aria-label", "Nocturne appearance");

        const head = makeNode("div", "head");
        const headCopy = makeNode("div", "head-copy");
        headCopy.appendChild(makeNode("span", "eyebrow", "Nocturne"));
        headCopy.appendChild(makeNode("h2", "title", "Appearance"));
        const close = makeNode("button", "close", "\u00d7");
        close.type = "button";
        close.setAttribute("aria-label", "Close Nocturne appearance");
        head.appendChild(headCopy);
        head.appendChild(close);

        const body = makeNode("div", "body");
        const enabledSwitch = makeSwitch("Show Nocturne wallpaper", state.enabled);
        const enabledRow = makeSetting("Wallpaper", "Canvas layer", enabledSwitch);
        enabledRow.classList.add("primary");
        body.appendChild(enabledRow);

        body.appendChild(makeNode("div", "section-label", "Scenes"));

        const sceneList = makeNode("div", "scenes");
        const sceneButtons = [];
        let lastGroup = "";
        scenes.forEach(function (scene, index) {
          const group = scene.group && scene.group.label ? scene.group : { name: "other", label: "Other" };
          if (group.name !== lastGroup) {
            sceneList.appendChild(makeNode("div", "scene-group-label", group.label));
            lastGroup = group.name;
          }
          const button = makeNode("button", "scene");
          button.type = "button";
          button.dataset.scene = String(index);
          button.setAttribute("aria-pressed", "false");
          button.setAttribute("aria-label", "Show " + scene.title);
          button.appendChild(makeNode("span", "scene-no", String(index + 1).padStart(2, "0")));
          button.appendChild(makeNode("span", "scene-name", scene.title));
          button.appendChild(makeNode("span", "scene-dot"));
          sceneList.appendChild(button);
          sceneButtons.push(button);
        });
        body.appendChild(sceneList);

        body.appendChild(makeNode("div", "section-label", "Motion"));

        const motion = makeNode("div", "motion-block");
        const autoSwitch = makeSwitch("Automatic scene rotation", state.auto);
        motion.appendChild(makeSetting("Auto cycle", "A new scene every 32 seconds", autoSwitch));
        const animationSwitch = makeSwitch("Animate wallpaper", !state.paused);
        motion.appendChild(makeSetting("Animation", "Pause the character grid", animationSwitch));

        const livelinessHead = makeNode("div", "slider-head");
        const livelinessLabel = makeNode("label", "slider-label", "Liveliness");
        livelinessLabel.setAttribute("for", "nocturne-liveliness");
        const livelinessValue = makeNode("output", "slider-value", "75%");
        livelinessValue.setAttribute("for", "nocturne-liveliness");
        livelinessHead.appendChild(livelinessLabel);
        livelinessHead.appendChild(livelinessValue);
        const liveliness = document.createElement("input");
        liveliness.id = "nocturne-liveliness";
        liveliness.type = "range";
        liveliness.min = "0";
        liveliness.max = "100";
        liveliness.step = "1";
        liveliness.value = "75";
        const livelinessBlock = makeNode("div", "liveliness");
        livelinessBlock.appendChild(livelinessHead);
        livelinessBlock.appendChild(liveliness);
        motion.appendChild(livelinessBlock);
        body.appendChild(motion);

        const sliderWrap = makeNode("div", "slider-wrap");
        const sliderHead = makeNode("div", "slider-head");
        const sliderLabel = makeNode("label", "slider-label", "Wallpaper visibility");
        sliderLabel.setAttribute("for", "nocturne-visibility");
        const sliderValue = makeNode("output", "slider-value", "50%");
        sliderValue.setAttribute("for", "nocturne-visibility");
        sliderHead.appendChild(sliderLabel);
        sliderHead.appendChild(sliderValue);
        const visibility = document.createElement("input");
        visibility.id = "nocturne-visibility";
        visibility.type = "range";
        visibility.min = "0";
        visibility.max = "100";
        visibility.step = "1";
        visibility.value = "50";
        const sliderNote = makeNode("div", "slider-note", "Tint beneath the conversation. Lower values make the wallpaper quieter.");
        sliderWrap.appendChild(sliderHead);
        sliderWrap.appendChild(visibility);
        sliderWrap.appendChild(sliderNote);
        body.appendChild(sliderWrap);

        const foot = makeNode("div", "foot");
        foot.appendChild(makeNode("span", "", "30 fps \u00b7 thirteen studies"));
        foot.appendChild(makeNode("span", "", "/theme \u00b7 alt + \u2190\u2192"));
        panel.appendChild(head);
        panel.appendChild(body);
        panel.appendChild(foot);

        shadow.appendChild(trigger);
        shadow.appendChild(panel);

        return {
          trigger: trigger,
          panel: panel,
          close: close,
          enabledSwitch: enabledSwitch,
          autoSwitch: autoSwitch,
          animationSwitch: animationSwitch,
          visibility: visibility,
          visibilityValue: sliderValue,
          liveliness: liveliness,
          livelinessValue: livelinessValue,
          sceneButtons: sceneButtons
        };
      }

      controls = buildControls();

      controls.trigger.addEventListener("click", function () {
        if (controls.panel.hidden) openPanel();
        else closePanel(true);
      });
      controls.close.addEventListener("click", function () {
        closePanel(true);
      });
      controls.enabledSwitch.addEventListener("click", function () {
        setEnabled(!state.enabled);
      });
      controls.autoSwitch.addEventListener("click", function () {
        setAuto(!state.auto);
      });
      controls.animationSwitch.addEventListener("click", function () {
        setPaused(!state.paused);
      });
      controls.visibility.addEventListener("input", function () {
        setVisibility(controls.visibility.value);
      });
      controls.liveliness.addEventListener("input", function () {
        setLiveliness(controls.liveliness.value);
      });
      controls.sceneButtons.forEach(function (button, index) {
        button.addEventListener("click", function () {
          showScene(index);
        });
      });

      document.addEventListener("pointerdown", onDocumentPointerDown, true);
      window.addEventListener("resize", scheduleResize, { passive: true });
      window.addEventListener("orientationchange", scheduleResize, { passive: true });
      document.addEventListener("visibilitychange", onVisibilityChange);
      window.addEventListener("pointermove", onPointerMove, { passive: true });
      document.addEventListener("mouseleave", resetPointer);
      window.addEventListener("keydown", onKeyDown);
      if (reduceQuery.addEventListener) reduceQuery.addEventListener("change", onMotionPreferenceChange);

      themeObserver = new MutationObserver(syncTheme);
      themeObserver.observe(document.body, { attributes: true, attributeFilter: ["data-ds-dark-theme"] });

      syncAll();
      measure();
      setEnabled(state.enabled, true);

      const api = {
        get scenes() {
          return scenes.map(function (scene) { return scene.title; });
        },
        catalog: function () {
          return scenes.map(function (scene, index) {
            return {
              id: scene.id,
              title: scene.title,
              tag: scene.tag,
              group: scene.group,
              index: index,
              active: index === currentIndex
            };
          });
        },
        status: function () {
          return currentState();
        },
        show: function (value, options) {
          showScene(value, options);
          return currentState();
        },
        next: function () {
          nextScene();
          return currentState();
        },
        previous: function () {
          previousScene();
          return currentState();
        },
        pause: function () {
          setPaused(true);
          return currentState();
        },
        resume: function () {
          setPaused(false);
          return currentState();
        },
        togglePause: function () {
          setPaused(!state.paused);
          return currentState();
        },
        setAuto: function (value) {
          setAuto(value);
          return state.auto;
        },
        toggleAuto: function () {
          setAuto(!state.auto);
          return state.auto;
        },
        setVisibility: function (value) {
          setVisibility(value);
          return state.visibility;
        },
        setLiveliness: function (value) {
          setLiveliness(value);
          return state.liveliness;
        },
        enable: function () {
          setEnabled(true);
          return currentState();
        },
        disable: function () {
          setEnabled(false);
          return currentState();
        },
        toggleEnabled: function () {
          setEnabled(!state.enabled);
          return currentState();
        },
        openPanel: function () {
          openPanel();
        },
        closePanel: function () {
          closePanel(true);
        }
      };

      window[API_KEY] = api;

      function dispose() {
        if (disposed) return;
        disposed = true;
        stop();
        if (resizeTimer !== null) {
          clearTimeout(resizeTimer);
          resizeTimer = null;
        }
        if (themeObserver !== null) {
          themeObserver.disconnect();
          themeObserver = null;
        }
        document.removeEventListener("pointerdown", onDocumentPointerDown, true);
        window.removeEventListener("resize", scheduleResize);
        window.removeEventListener("orientationchange", scheduleResize);
        document.removeEventListener("visibilitychange", onVisibilityChange);
        window.removeEventListener("pointermove", onPointerMove);
        document.removeEventListener("mouseleave", resetPointer);
        window.removeEventListener("keydown", onKeyDown);
        if (reduceQuery.removeEventListener) reduceQuery.removeEventListener("change", onMotionPreferenceChange);
        if (window[API_KEY] === api) {
          try { delete window[API_KEY]; } catch (error) {}
        }
        document.body.removeAttribute("data-nocturne");
        document.documentElement.classList.remove("nocturne-html");
        document.body.style.removeProperty("--nocturne-app-tint");
        document.documentElement.style.removeProperty("--nocturne-underlay");
        style.remove();
        canvas.remove();
        wash.remove();
        uiHost.remove();
        stageContext = null;
        scenes = [];
        view = null;
        controls = null;
      }

      return dispose;
    }

    function apply(ctx) {
      ctx.effect(function () {
        let dispose = null;
        try {
          dispose = mountNocturne();
        } catch (error) {
          if (typeof console !== "undefined" && console.warn) {
            console.warn("[dsh-nocturne-wallpaper] failed to mount", error);
          }
          return function () {};
        }
        return function () {
          if (typeof dispose === "function") dispose();
        };
      }, "nocturne-wallpaper: canvas background");

      if (typeof ctx.inject === "function") {
        ctx.inject(["commandUi"], function (scope) {
          scope.effect(function () {
            let unregister = null;
            try {
              unregister = scope.commandUi.register({
                name: "theme",
                label: function () { return "Theme"; },
                description: function () { return "Choose a Nocturne wallpaper scene."; },
                available: function () { return true; },
                ui: {
                  kind: "popupSelect",
                  searchMode: "fuzzy-label",
                  searchLabels: function () {
                    return {
                      placeholder: "Search Nocturne scenes",
                      empty: "No scenes available",
                      noResults: "No matching scenes"
                    };
                  },
                  options: async function () {
                    const api = window[API_KEY];
                    if (!api || typeof api.catalog !== "function") return [];
                    return api.catalog().map(function (scene) {
                      return {
                        id: scene.id,
                        label: scene.title,
                        detail: scene.tag,
                        badge: String(scene.index + 1).padStart(2, "0"),
                        active: scene.active,
                        group: scene.group
                      };
                    });
                  },
                  onSelect: function (option) {
                    const api = window[API_KEY];
                    if (api) api.show(option.id);
                  }
                }
              });
            } catch (error) {
              if (typeof console !== "undefined" && console.warn) {
                console.warn("[dsh-nocturne-wallpaper] /theme registration failed", error);
              }
              return function () {};
            }
            return function () {
              if (typeof unregister === "function") unregister();
            };
          }, "nocturne-wallpaper: /theme command");
        });
      }
    }

    exports.name = "nocturne-wallpaper";
    exports.apply = apply;
    return module.exports;
  }
});