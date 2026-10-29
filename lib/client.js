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
  const SCENE_SECONDS = 26;
  const FADE_SECONDS = 1.15;
  const TARGET_FPS = 30;
  const reduceQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

  const clamp = (value, min, max) => value < min ? min : value > max ? max : value;
  const lerp = (a, b, t) => a + (b - a) * t;

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

  function hexToRgb(hex) {
    const value = hex.replace("#", "");
    const full = value.length === 3 ? value.split("").map(c => c + c).join("") : value;
    return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)];
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

  function plot(context, view, gx, gy, character) {
    context.fillText(character, (gx + .5) * view.cw, (gy + .5) * view.ch);
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
  /* Scene one: Cloud Drift                                                  */
  /* ----------------------------------------------------------------------- */

  class CloudDrift {
    constructor() {
      this.title = "Cloud Drift";
      this.tag = "Weather · Dusk";
      this.caption = "A slow drift through dusk, drawn one character at a time.";
      this.accent = "#e8b48e";
    }

    init(view) {
      this.view = view;
      const context = stageContext;
      const rng = mulberry32(0xC10D);
      const background = context.createLinearGradient(0, 0, 0, view.h);
      background.addColorStop(0, "#03060d");
      background.addColorStop(.3, "#0b1726");
      background.addColorStop(.55, "#243646");
      background.addColorStop(.69, "#56525c");
      background.addColorStop(.8, "#8f6f67");
      background.addColorStop(.9, "#b98a72");
      background.addColorStop(1, "#1d181b");
      this.background = background;

      this.sun = {
        x: view.w * .765,
        y: view.h * .455,
        radius: Math.min(view.w, view.h) * .145
      };

      this.stars = Array.from({ length: Math.max(34, Math.round(view.cols * .58)) }, () => ({
        x: Math.floor(rng() * view.cols),
        y: Math.floor(rng() * view.rows * .53),
        phase: rng() * TAU,
        speed: .24 + rng() * .8,
        weight: rng()
      }));

      this.layers = [
        this.makeLayer(view, rng, {
          count: 5,
          speed: .38,
          alpha: .27,
          width: [.12, .23],
          ratio: [.34, .5],
          y: [.27, .41],
          colors: ["#6f8597", "#b2a09e"],
          chars: ".:-=+*"
        }),
        this.makeLayer(view, rng, {
          count: 4,
          speed: .82,
          alpha: .5,
          width: [.17, .31],
          ratio: [.32, .48],
          y: [.45, .59],
          colors: ["#8998a4", "#d7b5a5"],
          chars: ".:-=+*#"
        }),
        this.makeLayer(view, rng, {
          count: 3,
          speed: 1.55,
          alpha: .8,
          width: [.22, .37],
          ratio: [.3, .45],
          y: [.61, .75],
          colors: ["#bcbab6", "#efc39f"],
          chars: ":-=+*#"
        })
      ];

      this.birds = Array.from({ length: 3 }, () => ({
        x: rng(),
        y: .25 + rng() * .22,
        speed: .006 + rng() * .008,
        phase: rng() * TAU
      }));
    }

    makeLayer(view, rng, options) {
      const margin = view.cols * .42;
      const wrap = view.cols + margin * 2;
      const clusters = [];

      const portraitLift = view.h > view.w ? 1.5 : 1;
      const widthLift = view.w < 760 ? 1.16 : 1;
      for (let i = 0; i < options.count; i++) {
        const width = lerp(options.width[0], options.width[1], rng()) * view.cols * widthLift;
        const height = Math.max(2.8, width * (view.cw / view.ch) * lerp(options.ratio[0], options.ratio[1], rng()) * portraitLift);
        const pokeCount = 3 + Math.floor(rng() * 3);
        const puffs = [];
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

        for (let p = 0; p < pokeCount; p++) {
          const dx = (rng() - .5) * width * .74;
          const dy = (rng() - .5) * height * .62;
          const rx = width * (.18 + .24 * rng());
          const ry = height * (.28 + .37 * rng());
          puffs.push({ dx, dy, rx, ry });
          minX = Math.min(minX, dx - rx);
          maxX = Math.max(maxX, dx + rx);
          minY = Math.min(minY, dy - ry);
          maxY = Math.max(maxY, dy + ry);
        }

        clusters.push({
          baseX: rng() * wrap,
          baseY: view.rows * lerp(options.y[0], options.y[1], rng()),
          puffs,
          minX,
          maxX,
          minY,
          maxY,
          seed: rng() * 80
        });
      }

      const gradient = stageContext.createLinearGradient(0, view.h * options.y[0], 0, view.h * (options.y[1] + .12));
      gradient.addColorStop(0, options.colors[0]);
      gradient.addColorStop(1, options.colors[1]);

      return { ...options, gradient, clusters, margin, wrap };
    }

    draw(context, view, time) {
      context.fillStyle = this.background;
      context.fillRect(0, 0, view.w, view.h);

      context.save();
      for (let i = 0; i < this.stars.length; i++) {
        const star = this.stars[i];
        const shimmer = Math.sin(time * star.speed + star.phase) * .5 + .5;
        const character = shimmer > .78 ? (star.weight > .75 ? "+" : "*") : shimmer > .36 ? "." : "'";
        context.fillStyle = star.weight > .8 ? "rgba(247, 233, 207, .85)" : "rgba(225, 223, 211, .48)";
        plot(context, view, star.x, star.y, character);
      }
      context.restore();

      this.drawLayer(context, view, time, this.layers[0]);

      drawGlow(context, "#efb184", this.sun.x, this.sun.y, this.sun.radius, .52);
      context.save();
      context.fillStyle = "rgba(255, 237, 207, .94)";
      const sunX = Math.round(this.sun.x / view.cw);
      const sunY = Math.round(this.sun.y / view.ch);
      const sunPattern = [".", "*", ".", "*", "@", "*", ".", "*", "."];
      for (let y = -1; y <= 1; y++) {
        for (let x = -1; x <= 1; x++) {
          plot(context, view, sunX + x, sunY + y, sunPattern[(y + 1) * 3 + (x + 1)]);
        }
      }
      context.restore();

      this.drawLayer(context, view, time, this.layers[1]);
      this.drawLayer(context, view, time, this.layers[2]);

      drawGlow(context, "#f4bd90", this.sun.x, this.sun.y, this.sun.radius * 1.1, .26);

      context.save();
      context.fillStyle = "rgba(19, 23, 28, .7)";
      for (const bird of this.birds) {
        const x = (bird.x * view.w + time * 6 + Math.sin(time * .18 + bird.phase) * 18) % (view.w + 44) - 22;
        const y = bird.y * view.h + Math.sin(time * .42 + bird.phase) * 4;
        plot(context, view, Math.floor(x / view.cw), Math.floor(y / view.ch), (Math.sin(time * 1.2 + bird.phase) > 0) ? "v" : "~");
      }
      context.restore();
    }

    drawLayer(context, view, time, layer) {
      context.save();
      context.globalAlpha = layer.alpha;
      context.fillStyle = layer.gradient;
      context.font = view.font;

      for (const cluster of layer.clusters) {
        let cx = cluster.baseX + time * layer.speed;
        cx = ((cx % layer.wrap) + layer.wrap) % layer.wrap - layer.margin;
        const cy = cluster.baseY + Math.sin(time * .13 + cluster.seed) * .35;
        const x0 = Math.max(0, Math.floor(cx + cluster.minX));
        const x1 = Math.min(view.cols - 1, Math.ceil(cx + cluster.maxX));
        const y0 = Math.max(0, Math.floor(cy + cluster.minY));
        const y1 = Math.min(view.rows - 1, Math.ceil(cy + cluster.maxY));
        if (x1 < x0 || y1 < y0) continue;

        for (let y = y0; y <= y1; y++) {
          for (let x = x0; x <= x1; x++) {
            let density = 0;
            for (let p = 0; p < cluster.puffs.length; p++) {
              const puff = cluster.puffs[p];
              const nx = (x - cx - puff.dx) / puff.rx;
              const ny = (y - cy - puff.dy) / puff.ry;
              const q = 1 - nx * nx - ny * ny;
              if (q > density) density = q;
            }
            if (density <= .065) continue;

            const texture = Math.sin((x + cluster.seed) * .71 + y * 1.13 + time * .44) * .06
              + Math.sin(x * .18 - y * .63 - time * .18) * .04;
            const body = Math.sqrt(density) + texture;

            if (body < .21 && ((x * 7 + y * 11 + cluster.seed * 13) | 0) % 4 !== 0) continue;
            if (body < .33 && ((x * 5 + y * 3 + cluster.seed * 9) | 0) % 3 !== 0) continue;

            const normalized = clamp((body - .1) / .78, 0, 1);
            const index = Math.floor(normalized * layer.chars.length);
            const underlight = y > cy + cluster.maxY * .42 && body > .38 ? 1 : 0;
            const character = layer.chars[clamp(index + underlight, 0, layer.chars.length - 1)];
            plot(context, view, x, y, character);
          }
        }
      }
      context.restore();
    }
  }

  /* ----------------------------------------------------------------------- */
  /* Scene two: Koi Pond                                                     */
  /* ----------------------------------------------------------------------- */

  class KoiPond {
    constructor() {
      this.title = "Koi Pond";
      this.tag = "Water · Still";
      this.caption = "Beneath a skin of light, three koi turn in long, unhurried circles.";
      this.accent = "#94d4b0";
    }

    init(view) {
      this.view = view;
      const context = stageContext;
      const rng = mulberry32(0x40A1);

      const background = context.createLinearGradient(0, 0, 0, view.h);
      background.addColorStop(0, "#0c2b23");
      background.addColorStop(.48, "#081d19");
      background.addColorStop(1, "#020a08");
      this.background = background;

      this.light = context.createRadialGradient(view.w * .28, view.h * .1, 0, view.w * .35, view.h * .3, Math.max(view.w, view.h) * .82);
      this.light.addColorStop(0, "rgba(124, 207, 170, .21)");
      this.light.addColorStop(.45, "rgba(44, 113, 96, .08)");
      this.light.addColorStop(1, "rgba(0, 0, 0, 0)");

      this.ripples = Array.from({ length: 6 }, () => ({
        x: .12 + rng() * .76,
        y: .15 + rng() * .7,
        offset: rng(),
        speed: .055 + rng() * .05,
        radius: .1 + rng() * .26
      }));

      this.petals = Array.from({ length: 9 }, () => ({
        x: rng(),
        y: .05 + rng() * .82,
        speed: .004 + rng() * .009,
        sway: .01 + rng() * .02,
        phase: rng() * TAU,
        character: rng() > .5 ? "'" : ","
      }));

      const padSpecs = [
        { x: .14, y: .22, size: .075, notch: -1.35, flower: false, fill: "rgba(76, 131, 91, .95)", rim: "rgba(151, 195, 146, .72)" },
        { x: .84, y: .34, size: .107, notch: 2.15, flower: true, fill: "rgba(92, 148, 102, .95)", rim: "rgba(175, 210, 162, .78)" },
        { x: .71, y: .78, size: .074, notch: .72, flower: false, fill: "rgba(67, 121, 82, .94)", rim: "rgba(134, 178, 132, .62)" },
        { x: .25, y: .69, size: .052, notch: 2.8, flower: false, fill: "rgba(86, 140, 97, .9)", rim: "rgba(157, 194, 147, .58)" }
      ];
      this.pads = padSpecs.map(spec => ({
        ...spec,
        phase: rng() * TAU,
        bob: 2 + rng() * 3,
        radiusPx: Math.min(view.w, view.h) * spec.size
      }));

      const fishSpecs = [
        {
          cx: .49, cy: .51, ax: .255, ay: .19, phase: .4, speed: .115,
          length: .18, width: .205, color: "#ffa063", patch: "#ffe4c4", fin: "#ffc893", eye: "#2a1107"
        },
        {
          cx: .42, cy: .43, ax: .22, ay: .155, phase: 2.7, speed: .138,
          length: .148, width: .195, color: "#f4dfb9", patch: "#df7548", fin: "#ffd4a7", eye: "#2c160a"
        },
        {
          cx: .58, cy: .55, ax: .29, ay: .225, phase: 4.5, speed: .092,
          length: .215, width: .2, color: "#ec7f4d", patch: "#f8ddb7", fin: "#ffb17d", eye: "#2c1007"
        }
      ];

      this.fish = fishSpecs.map((spec, index) => ({
        ...spec,
        lengthPx: clamp(Math.min(view.w, view.h) * spec.length, 82, 205),
        phase: spec.phase + index * .6
      }));
    }

    draw(context, view, time) {
      context.fillStyle = this.background;
      context.fillRect(0, 0, view.w, view.h);
      context.fillStyle = this.light;
      context.fillRect(0, 0, view.w, view.h);

      this.drawCaustics(context, view, time);
      this.drawRipples(context, view, time);

      for (const fish of this.fish) this.drawKoi(context, view, time, fish);

      for (const pad of this.pads) this.drawPad(context, view, time, pad);

      context.save();
      context.fillStyle = "rgba(232, 190, 190, .5)";
      for (const petal of this.petals) {
        let x = (petal.x + time * petal.speed) % 1;
        if (x < 0) x += 1;
        const y = petal.y + Math.sin(time * .18 + petal.phase) * petal.sway;
        plot(context, view, Math.floor(x * view.cols), Math.floor(y * view.rows), petal.character);
      }
      context.restore();
    }

    drawCaustics(context, view, time) {
      context.save();
      context.fillStyle = "rgba(139, 216, 177, .125)";
      for (let y = 1; y < view.rows - 1; y++) {
        for (let x = 1; x < view.cols - 1; x++) {
          const wave = Math.sin(x * .18 + time * .23 + Math.sin(y * .33 - time * .16) * 1.7)
            + Math.sin(y * .37 - time * .3 + Math.cos(x * .14 + time * .1) * 1.55)
            + Math.sin((x * .58 + y * .92) - time * .22);
          if (wave > 2.04) {
            const character = wave > 2.4 ? "~" : wave > 2.22 ? "-" : ".";
            plot(context, view, x, y, character);
          }
        }
      }
      context.restore();
    }

    drawRipples(context, view, time) {
      context.save();
      for (const ripple of this.ripples) {
        const age = (ripple.offset + time * ripple.speed) % 1;
        const radius = age * ripple.radius * Math.min(view.w, view.h);
        if (radius < 3) continue;
        const alpha = Math.sin(age * Math.PI) * .17;
        context.fillStyle = "rgba(151, 222, 187, " + alpha.toFixed(3) + ")";
        const steps = Math.min(150, Math.max(18, Math.ceil(TAU * radius / (view.cw * 1.35))));
        const cx = ripple.x * view.w;
        const cy = ripple.y * view.h;
        for (let i = 0; i < steps; i++) {
          const angle = i / steps * TAU;
          const x = cx + Math.cos(angle) * radius;
          const y = cy + Math.sin(angle) * radius * .48;
          const character = Math.abs(Math.sin(angle)) > .8 ? "|" : Math.abs(Math.cos(angle)) > .8 ? "-" : ".";
          plot(context, view, Math.floor(x / view.cw), Math.floor(y / view.ch), character);
        }
      }
      context.restore();
    }

    drawKoi(context, view, time, fish) {
      const a = time * fish.speed + fish.phase;
      const a2 = a * 2.7 + fish.phase * .7;
      const x = fish.cx * view.w + Math.cos(a) * fish.ax * view.w + Math.cos(a2) * fish.ax * view.w * .09;
      const y = fish.cy * view.h + Math.sin(a) * fish.ay * view.h + Math.sin(a2 * .82) * fish.ay * view.h * .08;
      const vx = -Math.sin(a) * fish.ax * view.w * fish.speed - Math.sin(a2) * fish.ax * view.w * .09 * fish.speed * 2.7;
      const vy = Math.cos(a) * fish.ay * view.h * fish.speed + Math.cos(a2 * .82) * fish.ay * view.h * .08 * fish.speed * 2.7 * .82;
      const speed = Math.hypot(vx, vy);
      if (speed < .001) return;
      const dirX = vx / speed;
      const dirY = vy / speed;
      const perpX = -dirY;
      const perpY = dirX;
      const length = fish.lengthPx;
      const halfWidth = length * fish.width;
      const bodyAt = (s) => {
        const bend = Math.sin(s * 4.2 + time * 2.0 + fish.phase) * length * .016 * s * s;
        return {
          x: x - dirX * length * s + perpX * bend,
          y: y - dirY * length * s + perpY * bend
        };
      };
      const tail = bodyAt(1);
      const tailCurve = Math.sin(4.2 + time * 2.0 + fish.phase) * length * .016;

      drawGlow(context, fish.fin, x - dirX * length * .44, y - dirY * length * .44, length * .6, .05);

      context.save();

      context.globalAlpha = .92;
      context.fillStyle = fish.fin;
      const tailLength = length * .3;
      const tx0 = Math.max(0, Math.floor((tail.x - length * .28) / view.cw));
      const tx1 = Math.min(view.cols - 1, Math.ceil((tail.x + length * .28) / view.cw));
      const ty0 = Math.max(0, Math.floor((tail.y - length * .28) / view.ch));
      const ty1 = Math.min(view.rows - 1, Math.ceil((tail.y + length * .28) / view.ch));
      for (let gy = ty0; gy <= ty1; gy++) {
        for (let gx = tx0; gx <= tx1; gx++) {
          const dx = (gx + .5) * view.cw - tail.x;
          const dy = (gy + .5) * view.ch - tail.y;
          const back = -(dx * dirX + dy * dirY);
          if (back < -length * .03 || back > tailLength) continue;
          const lateral = dx * perpX + dy * perpY - tailCurve;
          const spread = halfWidth * (.16 + (back / tailLength) * 1.24);
          const side = lateral < 0 ? -1 : 1;
          if (Math.abs(lateral) > spread || Math.abs(lateral) < spread * .11) continue;
          const finCharacter = back > tailLength * .7 ? (side > 0 ? "'" : ",") : (back > tailLength * .4 ? "," : ":");
          plot(context, view, gx, gy, finCharacter);
        }
      }

      context.globalAlpha = .88;
      for (let side = -1; side <= 1; side += 2) {
        for (let ray = 0; ray < 5; ray++) {
          const spread = .32 + ray * .2;
          for (let q = .18; q <= 1; q += .1) {
            const px = tail.x - dirX * length * .17 * q + perpX * side * halfWidth * spread * q;
            const py = tail.y - dirY * length * .17 * q + perpY * side * halfWidth * spread * q;
            plot(context, view, Math.floor(px / view.cw), Math.floor(py / view.ch), q > .78 ? "'" : ",");
          }
        }
      }

      context.globalAlpha = 1;
      context.fillStyle = fish.color;
      const radius = length * 1.14 + halfWidth;
      const bx0 = Math.max(0, Math.floor((x - radius) / view.cw));
      const bx1 = Math.min(view.cols - 1, Math.ceil((x + radius) / view.cw));
      const by0 = Math.max(0, Math.floor((y - radius) / view.ch));
      const by1 = Math.min(view.rows - 1, Math.ceil((y + radius) / view.ch));
      const cells = [];

      for (let gy = by0; gy <= by1; gy++) {
        for (let gx = bx0; gx <= bx1; gx++) {
          const px = (gx + .5) * view.cw;
          const py = (gy + .5) * view.ch;
          const dx = px - x;
          const dy = py - y;
          const back = -(dx * dirX + dy * dirY);
          if (back < -length * .065 || back > length) continue;
          let s = back / length;
          let half;
          let bend = 0;
          if (s < 0) {
            const cap = clamp(-s / .065, 0, 1);
            half = halfWidth * .78 * Math.sqrt(Math.max(0, 1 - cap * cap));
          } else {
            s = clamp(s, 0, 1);
            bend = Math.sin(s * 4.2 + time * 2.0 + fish.phase) * length * .016 * s * s;
            half = halfWidth
              * (0.8 + .28 * Math.sin(Math.PI * clamp(s * 1.12, 0, 1)))
              * (1 - .38 * s * s)
              * (1 - Math.pow(s, 10));
          }
          if (half < 1) continue;
          const lateral = dx * perpX + dy * perpY - bend;
          const edge = Math.abs(lateral) / half;
          if (edge > 1) continue;
          const character = edge > .84 ? "." : edge > .58 ? "*" : s < .16 ? "@" : "#";
          plot(context, view, gx, gy, character);
          const patch = s > .14 && s < .84
            && ((Math.sin(s * 10.5 + fish.phase * 1.7) + Math.sin(s * 3.4 - lateral * .08 + fish.phase)) * .5 > .34);
          cells.push(gx, gy, patch ? 1 : 0, Math.abs(lateral));
        }
      }

      context.fillStyle = fish.patch;
      for (let i = 0; i < cells.length; i += 4) {
        if (!cells[i + 2]) continue;
        plot(context, view, cells[i], cells[i + 1], (cells[i + 3] > halfWidth * .48) ? ":" : "*");
      }

      context.fillStyle = fish.fin;
      for (let side = -1; side <= 1; side += 2) {
        const finBase = bodyAt(.27 + (side + 1) * .012);
        for (let i = 1; i <= 6; i++) {
          const q = i / 6;
          const px = finBase.x + perpX * side * halfWidth * (.35 + q * 1.05) - dirX * length * .075 * q;
          const py = finBase.y + perpY * side * halfWidth * (.35 + q * 1.05) - dirY * length * .075 * q;
          plot(context, view, Math.floor(px / view.cw), Math.floor(py / view.ch), q > .68 ? "'" : ",");
        }
      }

      context.fillStyle = fish.eye;
      const eye = bodyAt(.065);
      for (let side = -1; side <= 1; side += 2) {
        const eyeX = eye.x + perpX * side * halfWidth * .43 + dirX * 1.5;
        const eyeY = eye.y + perpY * side * halfWidth * .43 + dirY * 1.5;
        plot(context, view, Math.floor(eyeX / view.cw), Math.floor(eyeY / view.ch), "o");
      }
      context.restore();
    }

    drawPad(context, view, time, pad) {
      const cx = pad.x * view.w + Math.sin(time * .21 + pad.phase) * pad.bob;
      const cy = pad.y * view.h + Math.cos(time * .17 + pad.phase) * pad.bob * .5;
      const rx = pad.radiusPx;
      const ry = rx * .72;
      const x0 = Math.max(0, Math.floor((cx - rx) / view.cw));
      const x1 = Math.min(view.cols - 1, Math.ceil((cx + rx) / view.cw));
      const y0 = Math.max(0, Math.floor((cy - ry) / view.ch));
      const y1 = Math.min(view.rows - 1, Math.ceil((cy + ry) / view.ch));
      context.save();

      context.fillStyle = pad.fill;
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const px = (x + .5) * view.cw;
          const py = (y + .5) * view.ch;
          const dx = (px - cx) / rx;
          const dy = (py - cy) / ry;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d > .93) continue;
          const angle = Math.atan2(dy, dx);
          const delta = Math.atan2(Math.sin(angle - pad.notch), Math.cos(angle - pad.notch));
          if (d > .14 && Math.abs(delta) < .3) continue;
          let character;
          if (d > .76) character = "*";
          else if (d > .44) character = ((x * 7 + y * 11) % 4 === 0) ? "." : ":";
          else character = ((x + y) % 4 === 0) ? "." : "*";
          if (Math.abs(delta) < .48 && d > .35) character = ".";
          plot(context, view, x, y, character);
        }
      }

      context.fillStyle = pad.rim;
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const px = (x + .5) * view.cw;
          const py = (y + .5) * view.ch;
          const dx = (px - cx) / rx;
          const dy = (py - cy) / ry;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < .85 || d > 1) continue;
          const angle = Math.atan2(dy, dx);
          const delta = Math.atan2(Math.sin(angle - pad.notch), Math.cos(angle - pad.notch));
          if (Math.abs(delta) < .3) continue;
          plot(context, view, x, y, "o");
        }
      }

      context.fillStyle = "rgba(171, 207, 158, .34)";
      for (let i = 0; i < 5; i++) {
        const angle = i / 5 * TAU + pad.phase;
        for (let d = .22; d < .78; d += .16) {
          const px = cx + Math.cos(angle) * rx * d;
          const py = cy + Math.sin(angle) * ry * d;
          plot(context, view, Math.floor(px / view.cw), Math.floor(py / view.ch), "-");
        }
      }

      if (pad.flower) {
        const fx = cx + rx * .03;
        const fy = cy - ry * .04;
        drawGlow(context, "#f4cdd2", fx, fy, rx * .75, .16);
        context.fillStyle = "rgba(248, 224, 222, .96)";
        for (let i = 0; i < 7; i++) {
          const angle = i / 7 * TAU + .25;
          const px = fx + Math.cos(angle) * rx * .27;
          const py = fy + Math.sin(angle) * ry * .32;
          plot(context, view, Math.floor(px / view.cw), Math.floor(py / view.ch), "*");
        }
        context.fillStyle = "rgba(246, 187, 151, .98)";
        plot(context, view, Math.floor(fx / view.cw), Math.floor(fy / view.ch), "@");
      }
      context.restore();
    }
  }

  /* ----------------------------------------------------------------------- */
  /* Scene three: Jellyfish                                                  */
  /* ----------------------------------------------------------------------- */

  class Jellyfish {
    constructor() {
      this.title = "Jellyfish";
      this.tag = "Depth · Bioluminescent";
      this.caption = "Soft architectures of the deep, pulsing against the dark.";
      this.accent = "#8eeae0";
    }

    init(view) {
      this.view = view;
      const context = stageContext;
      const rng = mulberry32(0x3E11);

      const background = context.createLinearGradient(0, 0, 0, view.h);
      background.addColorStop(0, "#071824");
      background.addColorStop(.42, "#040f19");
      background.addColorStop(1, "#010305");
      this.background = background;

      this.ambient = context.createRadialGradient(view.w * .55, -view.h * .1, 0, view.w * .55, -view.h * .1, Math.max(view.w, view.h) * .98);
      this.ambient.addColorStop(0, "rgba(74, 152, 168, .15)");
      this.ambient.addColorStop(.42, "rgba(28, 82, 110, .07)");
      this.ambient.addColorStop(1, "rgba(0, 0, 0, 0)");

      this.snow = Array.from({ length: Math.max(54, Math.round(view.cols * .85)) }, () => ({
        x: rng(),
        y: rng(),
        speed: .006 + rng() * .021,
        drift: .2 + rng() * .8,
        phase: rng() * TAU,
        depth: rng()
      }));

      const palettes = [
        { bright: "#f5ffff", body: "#78efe6", edge: "#56a7e9", tentacle: "rgba(142, 239, 231, .72)" },
        { bright: "#fff2ff", body: "#dfadf8", edge: "#8e83ee", tentacle: "rgba(219, 168, 246, .66)" },
        { bright: "#eeffff", body: "#76e3ef", edge: "#578fdc", tentacle: "rgba(119, 221, 232, .58)" }
      ];

      const specs = [
        { x: .66, y: .515, scale: 1.16, rise: .012, drift: .032, phase: .9, palette: 0, alpha: .98 },
        { x: .28, y: .305, scale: .82, rise: .008, drift: .021, phase: 2.5, palette: 1, alpha: .79 },
        { x: .81, y: .765, scale: .62, rise: .011, drift: .015, phase: 4.6, palette: 2, alpha: .56 },
        { x: .145, y: .69, scale: .4, rise: .007, drift: .011, phase: 5.8, palette: 0, alpha: .34 },
        { x: .46, y: .095, scale: .3, rise: .006, drift: .008, phase: 1.7, palette: 1, alpha: .22 }
      ];

      this.jellies = specs.map(spec => {
        const palette = palettes[spec.palette];
        const tentacles = Array.from({ length: 9 }, (_, index) => ({
          offset: -.82 + index * .205 + (rng() - .5) * .07,
          length: 2.1 + rng() * 3.3,
          phase: rng() * TAU,
          speed: .58 + rng() * .75,
          color: rng() > .45 ? palette.body : palette.tentacle
        }));
        return {
          ...spec,
          ...palette,
          tentacles,
          base: clamp(Math.min(view.w, view.h) * .122, 50, 126) * spec.scale
        };
      });
    }

    draw(context, view, time) {
      context.fillStyle = this.background;
      context.fillRect(0, 0, view.w, view.h);
      context.fillStyle = this.ambient;
      context.fillRect(0, 0, view.w, view.h);

      this.drawSnow(context, view, time, false);

      for (const jelly of this.jellies) {
        this.drawJelly(context, view, time, jelly);
      }

      this.drawSnow(context, view, time, true);
    }

    drawSnow(context, view, time, foreground) {
      context.save();
      context.fillStyle = foreground ? "rgba(184, 231, 232, .34)" : "rgba(141, 191, 200, .24)";
      for (let i = 0; i < this.snow.length; i++) {
        const speck = this.snow[i];
        if ((speck.depth > .62) !== foreground) continue;
        let y = (speck.y - time * speck.speed) % 1;
        if (y < 0) y += 1;
        const x = speck.x + Math.sin(time * .09 + speck.phase) * .008 * speck.drift;
        const character = speck.depth > .72 ? "." : speck.depth > .35 ? "'" : ",";
        plot(context, view, Math.floor(x * view.cols), Math.floor(y * view.rows), character);
      }
      context.restore();
    }

    drawJelly(context, view, time, jelly) {
      let yNorm = (jelly.y - time * jelly.rise) % 1.16;
      if (yNorm < 0) yNorm += 1.16;
      const cx = jelly.x * view.w + Math.sin(time * .17 + jelly.phase) * jelly.drift * view.w;
      const cy = yNorm * view.h - view.h * .08;
      const breath = 1 + Math.sin(time * .95 + jelly.phase) * .065;
      const rx = jelly.base * breath;
      const ry = jelly.base * .72 * (1 - Math.sin(time * .95 + jelly.phase) * .048);
      const alpha = jelly.alpha;

      drawGlow(context, jelly.body, cx, cy - ry * .32, rx * 2.8, .16 + alpha * .24);
      drawGlow(context, jelly.bright, cx, cy - ry * .4, rx * .92, alpha * .2);

      context.save();
      context.globalAlpha = alpha * .72;
      for (const tentacle of jelly.tentacles) {
        context.fillStyle = tentacle.color;
        const steps = Math.max(6, Math.round(ry * tentacle.length / (view.ch * .78)));
        const startX = cx + tentacle.offset * rx * .82;
        const startY = cy + ry * .1;
        let prevX = startX;
        for (let step = 1; step <= steps; step++) {
          const q = step / steps;
          const px = startX
            + Math.sin(q * 4.5 + time * tentacle.speed + tentacle.phase) * rx * .34 * q
            + Math.sin(q * 2.1 - time * .6 + tentacle.phase) * rx * .11
            + Math.sin(time * .24 + jelly.phase) * rx * .08
            + Math.sin(q * 7.2 - time * .9 + tentacle.phase) * rx * .045 * q;
          const py = startY + q * ry * tentacle.length;
          const dx = px - prevX;
          const character = dx > view.cw * .22 ? "\\" : dx < -view.cw * .22 ? "/" : (q > .66 && step % 2 === 0) ? "'" : "|";
          plot(context, view, Math.floor(px / view.cw), Math.floor(py / view.ch), character);
          prevX = px;
        }
      }

      context.globalAlpha = alpha * .88;
      for (let i = -1; i <= 1; i++) {
        context.fillStyle = i === 0 ? jelly.bright : jelly.body;
        const startX = cx + i * rx * .17;
        const startY = cy + ry * .1;
        const steps = Math.round(ry * 3.3 / (view.ch * .78));
        for (let step = 1; step < steps; step++) {
          const q = step / steps;
          const px = startX + Math.sin(q * 3.2 + time * .8 + i * 1.4) * rx * .18 * q + Math.sin(q * 6 - time * .6) * rx * .05;
          const py = startY + q * ry * 3.4;
          plot(context, view, Math.floor(px / view.cw), Math.floor(py / view.ch), q > .7 ? "." : "|");
        }
      }
      context.restore();

      context.save();
      context.globalAlpha = alpha;
      const bellGradient = context.createRadialGradient(cx, cy - ry * .52, 0, cx, cy, rx * 1.06);
      bellGradient.addColorStop(0, jelly.bright);
      bellGradient.addColorStop(.38, jelly.body);
      bellGradient.addColorStop(.8, jelly.body);
      bellGradient.addColorStop(1, jelly.edge);
      context.fillStyle = bellGradient;

      const x0 = Math.max(0, Math.floor((cx - rx) / view.cw));
      const x1 = Math.min(view.cols - 1, Math.ceil((cx + rx) / view.cw));
      const y0 = Math.max(0, Math.floor((cy - ry) / view.ch));
      const y1 = Math.min(view.rows - 1, Math.ceil((cy + ry * .4) / view.ch));

      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const nx = ((x + .5) * view.cw - cx) / rx;
          const ny = ((y + .5) * view.ch - cy) / ry;
          let inside;
          if (ny <= 0) {
            inside = nx * nx + ny * ny <= 1;
          } else {
            const rim = .075 + .13 * Math.abs(Math.sin(nx * 5.3 + time * .45 + jelly.phase));
            inside = Math.abs(nx) <= .94 && ny <= rim;
          }
          if (!inside) continue;
          const d = Math.sqrt(nx * nx + Math.min(0, ny) * Math.min(0, ny));
          const texture = Math.sin(x * 1.4 + y * 2.2 + time * .75 + jelly.phase) * .5 + .5;
          let character;
          if (d > .9) character = texture > .48 ? ":" : ".";
          else if (d > .74) character = texture > .44 ? "=" : ":";
          else if (d > .53) character = texture > .55 ? "+" : "=";
          else if (d > .3) character = texture > .48 ? "*" : "+";
          else character = texture > .6 ? "#" : "*";
          if (ny > .03 && (x + y) % 3 === 0) character = "'";
          plot(context, view, x, y, character);
        }
      }

      context.globalAlpha = alpha * .8;
      context.fillStyle = jelly.body;
      const fringeY = Math.floor((cy + ry * .12) / view.ch);
      for (let x = x0; x <= x1; x++) {
        if ((x * 7 + Math.floor(time * 2)) % 5 === 0) continue;
        plot(context, view, x, fringeY, x % 3 === 0 ? "'" : ",");
      }
      context.restore();
    }
  }

  /* ----------------------------------------------------------------------- */
  /* Scene four: Fireflies                                                   */
  /* ----------------------------------------------------------------------- */

  class Fireflies {
    constructor() {
      this.title = "Fireflies";
      this.tag = "Meadow · After rain";
      this.caption = "A meadow after rain, keeping time in small bursts of light.";
      this.accent = "#d9e18b";
    }

    init(view) {
      this.view = view;
      const context = stageContext;
      const rng = mulberry32(0xF1E5);

      const background = context.createLinearGradient(0, 0, 0, view.h);
      background.addColorStop(0, "#030a08");
      background.addColorStop(.4, "#07150f");
      background.addColorStop(.68, "#0b2016");
      background.addColorStop(.84, "#07150e");
      background.addColorStop(1, "#020604");
      this.background = background;

      this.haze = context.createRadialGradient(view.w * .54, view.h * .67, 0, view.w * .54, view.h * .68, view.w * .62);
      this.haze.addColorStop(0, "rgba(83, 116, 70, .14)");
      this.haze.addColorStop(.55, "rgba(38, 66, 39, .055)");
      this.haze.addColorStop(1, "rgba(0, 0, 0, 0)");

      this.stars = Array.from({ length: Math.max(24, Math.round(view.cols * .36)) }, () => ({
        x: rng(),
        y: rng() * .56,
        phase: rng() * TAU,
        speed: .3 + rng() * .9,
        weight: rng()
      }));

      this.farRidge = this.makeRidge(view, rng, .61, .038, 4.7);
      this.nearRidge = this.makeRidge(view, rng, .675, .03, 8.2);

      this.backBlades = this.makeBlades(view, rng, Math.round(view.cols * .46), 4, 12, 7, 23, false);
      this.frontBlades = this.makeBlades(view, rng, Math.round(view.cols * .7), 9, 22, 8, 38, true);

      this.trees = Array.from({ length: Math.max(9, Math.round(view.cols * .1)) }, () => {
        const x = Math.floor(rng() * view.cols);
        const base = this.nearRidge[clamp(x, 0, view.cols - 1)] - 1;
        const height = rng() > .5 ? 2 : 3;
        const width = rng() > .6 ? 2 : 1;
        return { x, base, height, width, phase: rng() * TAU };
      });
      this.reeds = Array.from({ length: 18 }, (_, index) => {
        const left = index < 9;
        return {
          x: left ? rng() * .17 * view.w : view.w - rng() * .16 * view.w,
          height: 14 + rng() * 17,
          phase: rng() * TAU,
          speed: .36 + rng() * .48,
          sway: 4 + rng() * 10,
          lean: (left ? 1 : -1) * (3 + rng() * 12),
          head: rng() > .55 ? (rng() > .5 ? "*" : "'") : ""
        };
      });

      this.fireflies = Array.from({ length: 54 }, (_, index) => ({
        x: .05 + rng() * .9,
        y: .36 + rng() * .46,
        ax: .026 + rng() * .075,
        ay: .012 + rng() * .05,
        speed: .2 + rng() * .5,
        phase: rng() * TAU,
        blink: .3 + rng() * .34,
        size: index < 9 ? 12 + rng() * 8 : 5 + rng() * 8,
        color: index % 6 === 0 ? "#f3e8a1" : index % 4 === 0 ? "#d3e48c" : "#e1ea91"
      }));
    }

    makeRidge(view, rng, base, amplitude, frequency) {
      const s1 = rng() * 10;
      const s2 = rng() * 10;
      return Array.from({ length: view.cols }, (_, x) => {
        const n = Math.sin(x * .047 + s1) * amplitude
          + Math.sin(x * .19 + s2) * amplitude * .38
          + Math.sin(x * .41 + s1 * 2) * amplitude * .12;
        return Math.max(2, Math.floor((base + n) * view.rows));
      });
    }

    makeBlades(view, rng, count, minHeight, maxHeight, swayMin, swayMax, heads) {
      return Array.from({ length: count }, () => ({
        x: rng() * view.w,
        height: lerp(minHeight, maxHeight, rng()),
        phase: rng() * TAU,
        speed: .45 + rng() * .8,
        sway: lerp(swayMin, swayMax, rng()),
        lean: (rng() - .5) * view.cw * 4,
        head: heads && rng() > .64 ? (rng() > .5 ? "*" : "'") : ""
      }));
    }

    draw(context, view, time) {
      context.fillStyle = this.background;
      context.fillRect(0, 0, view.w, view.h);
      context.fillStyle = this.haze;
      context.fillRect(0, 0, view.w, view.h);

      context.save();
      for (const star of this.stars) {
        const glow = Math.sin(time * star.speed + star.phase) * .5 + .5;
        context.fillStyle = star.weight > .7 ? "rgba(224, 230, 190, .56)" : "rgba(185, 204, 178, .26)";
        plot(context, view, Math.floor(star.x * view.cols), Math.floor(star.y * view.rows), glow > .6 ? "." : "'");
      }
      context.restore();

      this.drawHills(context, view, this.farRidge, "rgba(7, 20, 13, .82)", "rgba(120, 153, 108, .32)", .6);
      this.drawHills(context, view, this.nearRidge, "rgba(4, 12, 8, .9)", "rgba(122, 158, 111, .36)", .66);

      context.save();
      context.fillStyle = "rgba(3, 10, 6, .94)";
      for (const tree of this.trees) {
        const sway = Math.sin(time * .22 + tree.phase) > 0 ? 0 : 1;
        plot(context, view, tree.x, tree.base - tree.height + 1, sway ? "^" : "*");
        if (tree.height > 2) plot(context, view, tree.x, tree.base - tree.height, "'");
        if (tree.width > 1) {
          plot(context, view, tree.x - 1, tree.base - tree.height + 1, "/");
          plot(context, view, tree.x + 1, tree.base - tree.height + 1, "\\");
        }
        plot(context, view, tree.x, tree.base, "|");
      }
      context.restore();

      context.save();
      context.fillStyle = "rgba(145, 165, 126, .13)";
      for (let i = 0; i < 5; i++) {
        const y = Math.floor(view.rows * (.63 + i * .013));
        const travel = Math.floor(((time * (.7 + i * .16) + i * 37) % view.cols));
        for (let x = 0; x < view.cols; x += 5) {
          const px = (x + travel) % view.cols;
          if ((px + i) % 11 < 5) plot(context, view, px, y, i % 2 ? "-" : ".");
        }
      }
      context.restore();

      context.save();
      context.fillStyle = "rgba(60, 94, 61, .72)";
      for (const blade of this.backBlades) bladeCharacter(context, view, blade, time);
      context.restore();

      context.save();
      context.globalCompositeOperation = "lighter";
      for (const firefly of this.fireflies) {
        const px = firefly.x * view.w
          + Math.sin(time * firefly.speed * .72 + firefly.phase) * firefly.ax * view.w
          + Math.sin(time * firefly.speed * .27 + firefly.phase * 2.3) * firefly.ax * view.w * .35;
        const py = firefly.y * view.h
          + Math.cos(time * firefly.speed * .54 + firefly.phase * 1.4) * firefly.ay * view.h
          + Math.sin(time * firefly.speed * .91 + firefly.phase * .8) * firefly.ay * view.h * .45;
        const pulse = clamp(Math.pow(Math.max(0, Math.sin(time * firefly.blink + firefly.phase * 2.4)), 2.7) * 1.15, 0, 1);
        context.globalAlpha = .035 + pulse * .3;
        const sprite = glowSprite(firefly.color);
        const radius = firefly.size * (.65 + pulse * .75);
        context.drawImage(sprite, px - radius, py - radius, radius * 2, radius * 2);
        firefly._px = px;
        firefly._py = py;
        firefly._pulse = pulse;
      }
      context.restore();

      context.save();
      for (const firefly of this.fireflies) {
        const pulse = firefly._pulse || 0;
        const character = pulse > .78 ? "*" : pulse > .43 ? "+" : ".";
        const gx = Math.floor(firefly._px / view.cw);
        const gy = Math.floor(firefly._py / view.ch);
        context.fillStyle = firefly.color;
        context.globalAlpha = .22 + pulse * .78;
        plot(context, view, gx, gy, character);
        if (pulse > .9 && firefly.size > 11) {
          context.globalAlpha = .24;
          plot(context, view, gx - 1, gy, ".");
          plot(context, view, gx + 1, gy, ".");
          plot(context, view, gx, gy - 1, "'");
          plot(context, view, gx, gy + 1, "'");
        }
      }
      context.restore();

      context.save();
      context.fillStyle = "rgba(13, 36, 22, .96)";
      for (const blade of this.frontBlades) bladeCharacter(context, view, blade, time);
      context.restore();

      context.save();
      context.fillStyle = "rgba(8, 24, 15, .98)";
      for (const reed of this.reeds) bladeCharacter(context, view, reed, time);
      context.restore();

      context.save();
      context.fillStyle = "rgba(172, 190, 119, .3)";
      for (let i = 0; i < 4; i++) {
        const x = ((time * (.002 + i * .0007) + i * .22) % 1) * view.w;
        const y = view.h * (.52 + i * .035) + Math.sin(time * .18 + i) * 2;
        plot(context, view, Math.floor(x / view.cw), Math.floor(y / view.ch), "~");
      }
      context.restore();
    }

    drawHills(context, view, ridge, fill, edge, alpha) {
      context.save();
      context.fillStyle = fill;
      context.beginPath();
      context.moveTo(-view.cw, view.h + view.ch);
      for (let x = 0; x < view.cols; x++) {
        context.lineTo((x + .5) * view.cw, (ridge[x] + .5) * view.ch);
      }
      context.lineTo(view.w + view.cw, view.h + view.ch);
      context.closePath();
      context.fill();

      context.globalAlpha = alpha;
      context.fillStyle = edge;
      for (let x = 0; x < view.cols; x++) {
        const y = ridge[x];
        plot(context, view, x, y, x % 9 === 0 ? "#" : x % 3 === 0 ? "^" : "-");
        if (x % 8 === 0 && y + 2 < view.rows) plot(context, view, x, y + 2, ".");
      }
      context.restore();
    }
  }

  /* ----------------------------------------------------------------------- */
  /* Scene five: Moonlit                                                     */
  /* ----------------------------------------------------------------------- */

  class Moonlit {
    constructor() {
      this.title = "Moonlit";
      this.tag = "Night · Water";
      this.caption = "The lake keeps a second moon. Neither of them is still.";
      this.accent = "#c4dcdf";
    }

    init(view) {
      this.view = view;
      const context = stageContext;
      const rng = mulberry32(0xA10A);

      const horizon = view.rows * .685;
      this.horizon = horizon;
      this.moon = {
        x: view.w * .70,
        y: view.h * .265,
        radius: clamp(Math.min(view.w, view.h) * .155, 55, 168)
      };

      const sky = context.createLinearGradient(0, 0, 0, horizon * view.ch);
      sky.addColorStop(0, "#02060b");
      sky.addColorStop(.55, "#07131e");
      sky.addColorStop(1, "#0e222d");
      this.sky = sky;

      const lake = context.createLinearGradient(0, horizon * view.ch, 0, view.h);
      lake.addColorStop(0, "#0d222b");
      lake.addColorStop(.3, "#08161f");
      lake.addColorStop(1, "#02070b");
      this.lake = lake;

      this.farFill = context.createLinearGradient(0, view.h * .48, 0, horizon * view.ch);
      this.farFill.addColorStop(0, "#0c1d27");
      this.farFill.addColorStop(1, "#06121a");
      this.nearFill = context.createLinearGradient(0, view.h * .55, 0, horizon * view.ch);
      this.nearFill.addColorStop(0, "#08151e");
      this.nearFill.addColorStop(1, "#02080c");

      this.stars = Array.from({ length: Math.max(44, Math.round(view.cols * .72)) }, () => ({
        x: rng() * .98,
        y: rng() * .58,
        phase: rng() * TAU,
        speed: .2 + rng() * .7,
        weight: rng()
      }));

      this.dust = Array.from({ length: Math.round(view.cols * .22) }, () => {
        const n = rng();
        return {
          x: .06 + n * .68 + (rng() - .5) * .22,
          y: .02 + n * .46 + (rng() - .5) * .14,
          phase: rng() * TAU
        };
      });

      this.craters = Array.from({ length: 12 }, () => ({
        x: (rng() - .5) * 1.5,
        y: (rng() - .5) * 1.5,
        r: .065 + rng() * .2
      }));

      this.farRidge = this.makeRidge(view, rng, .586, .058, 3.1);
      this.nearRidge = this.makeRidge(view, rng, .642, .041, 5.6);

      this.wisps = Array.from({ length: 4 }, () => ({
        x: rng(),
        y: .165 + rng() * .21,
        width: .2 + rng() * .36,
        speed: .0015 + rng() * .003,
        phase: rng() * TAU,
        alpha: .1 + rng() * .08
      }));

      this.birds = Array.from({ length: 3 }, () => ({
        x: rng(),
        y: .17 + rng() * .13,
        speed: .0014 + rng() * .002,
        phase: rng() * TAU
      }));

      this.mist = Array.from({ length: 5 }, () => ({
        x: rng(),
        y: .65 + rng() * .06,
        width: .18 + rng() * .3,
        speed: .002 + rng() * .005,
        phase: rng() * TAU
      }));

      this.reeds = Array.from({ length: 20 }, (_, index) => {
        const side = index < 10 ? 0 : 1;
        return {
          x: side === 0 ? rng() * .2 * view.w : view.w - rng() * .21 * view.w,
          height: 10 + rng() * 22,
          phase: rng() * TAU,
          speed: .3 + rng() * .5,
          sway: 3 + rng() * 11,
          lean: (side === 0 ? 1 : -1) * rng() * 22,
          head: rng() > .45 ? (rng() > .5 ? "*" : "o") : ""
        };
      });

      this.reflectionSeed = 2.7;
      this.boat = { x: .465, y: .785, phase: rng() * TAU };
    }

    makeRidge(view, rng, base, amplitude, frequency) {
      const s1 = rng() * 10;
      const s2 = rng() * 10;
      const peakA = .28 + rng() * .18;
      const peakB = .62 + rng() * .22;
      return Array.from({ length: view.cols }, (_, x) => {
        const nx = x / view.cols;
        const broad = Math.sin(x * .037 + s1) * amplitude
          + Math.sin(x * .014 + s2) * amplitude * .82;
        const crag = Math.sin(x * .111 + s2) * amplitude * .25
          + Math.sin(x * .253 + s1 * 1.6) * amplitude * .08;
        const peaks = Math.exp(-Math.pow((nx - peakA) / .15, 2)) * amplitude * 1.6
          + Math.exp(-Math.pow((nx - peakB) / .1, 2)) * amplitude * 1.15;
        return Math.max(2, Math.floor((base + broad + crag - peaks) * view.rows));
      });
    }

    draw(context, view, time) {
      context.fillStyle = this.sky;
      context.fillRect(0, 0, view.w, this.horizon * view.ch);
      context.fillStyle = this.lake;
      context.fillRect(0, this.horizon * view.ch, view.w, view.h - this.horizon * view.ch);

      this.drawStars(context, view, time);
      this.drawMoon(context, view, time);
      this.drawWisps(context, view, time);

      drawMountainSilhouette(context, view, this.farRidge, this.horizon, this.farFill, "rgba(128, 153, 165, .24)", .6);
      drawMountainSilhouette(context, view, this.nearRidge, this.horizon, this.nearFill, "rgba(134, 160, 170, .3)", .62);
      this.drawMist(context, view, time);

      this.drawWater(context, view, time);
      this.drawReflection(context, view, time);
      this.drawBoat(context, view, time);
      this.drawBirds(context, view, time);

      context.save();
      context.fillStyle = "rgba(7, 15, 18, .96)";
      for (const reed of this.reeds) bladeCharacter(context, view, reed, time);
      context.restore();
    }

    drawStars(context, view, time) {
      context.save();
      for (const star of this.stars) {
        const shimmer = Math.sin(time * star.speed + star.phase) * .5 + .5;
        context.fillStyle = star.weight > .72 ? "rgba(231, 234, 221, .62)" : "rgba(183, 205, 213, .25)";
        const character = shimmer > .74 ? "+" : shimmer > .34 ? "." : "'";
        plot(context, view, Math.floor(star.x * view.cols), Math.floor(star.y * view.rows), character);
      }
      context.fillStyle = "rgba(170, 197, 207, .17)";
      for (const speck of this.dust) {
        const shimmer = Math.sin(time * .3 + speck.phase) * .5 + .5;
        if (shimmer < .25) continue;
        plot(context, view, Math.floor(speck.x * view.cols), Math.floor(speck.y * view.rows), shimmer > .65 ? "." : ",");
      }
      context.restore();
    }

    drawMoon(context, view, time) {
      const { x: cx, y: cy, radius } = this.moon;
      drawGlow(context, "#d9e3dc", cx, cy, radius * 2.75, .52 + Math.sin(time * .15) * .035);
      drawGlow(context, "#f0eddb", cx, cy, radius * 1.25, .2);

      context.save();
      const x0 = Math.max(0, Math.floor((cx - radius) / view.cw));
      const x1 = Math.min(view.cols - 1, Math.ceil((cx + radius) / view.cw));
      const y0 = Math.max(0, Math.floor((cy - radius) / view.ch));
      const y1 = Math.min(view.rows - 1, Math.ceil((cy + radius) / view.ch));

      context.fillStyle = "rgba(242, 240, 223, .94)";
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const px = (x + .5) * view.cw;
          const py = (y + .5) * view.ch;
          const dx = (px - cx) / radius;
          const dy = (py - cy) / radius;
          const d2 = dx * dx + dy * dy;
          if (d2 > 1) continue;
          let dim = 0;
          for (const crater of this.craters) {
            const crx = dx - crater.x;
            const cry = dy - crater.y;
            const dist = Math.sqrt(crx * crx + cry * cry) / crater.r;
            if (dist < 1) dim = Math.max(dim, Math.pow(1 - dist, 1.1) * .62);
          }
          const mottling = Math.sin(dx * 12 + dy * 5) * .035 + Math.sin(dx * 26 - dy * 17) * .022;
          let luminance = .93 - Math.sqrt(d2) * .28 - dim + (hash2(x, y) - .5) * .09 + mottling;
          let character;
          if (d2 > .965) character = ":";
          else if (luminance > .79) character = "@";
          else if (luminance > .69) character = "#";
          else if (luminance > .59) character = "*";
          else if (luminance > .49) character = "+";
          else if (luminance > .4) character = "=";
          else if (luminance > .31) character = ":";
          else if (luminance > .22) character = ".";
          else character = " ";
          plot(context, view, x, y, character);
        }
      }

      context.globalAlpha = .25;
      context.fillStyle = "rgba(221, 232, 227, .8)";
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const px = (x + .5) * view.cw;
          const py = (y + .5) * view.ch;
          const dx = (px - cx) / radius;
          const dy = (py - cy) / radius;
          const d2 = dx * dx + dy * dy;
          if (d2 <= 1 || d2 > 1.18) continue;
          if (hash2(x, y, 4.1) < .42) continue;
          plot(context, view, x, y, d2 > 1.1 ? "'" : ".");
        }
      }
      context.restore();
    }

    drawMist(context, view, time) {
      context.save();
      context.fillStyle = "rgba(145, 168, 169, .16)";
      for (const layer of this.mist) {
        const center = ((layer.x + time * layer.speed) % 1.2 - .1) * view.w;
        const width = layer.width * view.w;
        const x0 = Math.max(0, Math.floor((center - width * .5) / view.cw));
        const x1 = Math.min(view.cols - 1, Math.ceil((center + width * .5) / view.cw));
        const row = Math.floor(Math.min(view.rows - 2, (layer.y + Math.sin(time * .1 + layer.phase) * .008) * view.rows));
        for (let x = x0; x <= x1; x++) {
          const local = (x * view.cw - (center - width * .5)) / width;
          const strength = Math.sin(local * Math.PI);
          if (strength < .35 || hash2(x, row, layer.phase) < .45) continue;
          plot(context, view, x, row, strength > .7 ? "~" : "-");
        }
      }
      context.restore();
    }

    drawWisps(context, view, time) {
      context.save();
      for (const wisp of this.wisps) {
        const progress = ((wisp.x + time * wisp.speed) % 1.2) - .1;
        const start = progress * view.w - wisp.width * view.w * .5;
        const end = start + wisp.width * view.w;
        const x0 = Math.max(0, Math.floor(start / view.cw));
        const x1 = Math.min(view.cols - 1, Math.ceil(end / view.cw));
        const row = Math.floor((wisp.y + Math.sin(time * .11 + wisp.phase) * .01) * view.rows);
        context.fillStyle = "rgba(176, 198, 208, " + wisp.alpha.toFixed(3) + ")";
        for (let x = x0; x <= x1; x++) {
          const local = (x * view.cw - start) / (end - start);
          const strength = Math.sin(local * Math.PI) * (0.55 + 0.45 * Math.sin(x * .7 + time * .3 + wisp.phase));
          if (strength < .2) continue;
          plot(context, view, x, row + ((x % 9 === 0) ? 1 : 0), strength > .62 ? "=" : strength > .38 ? "-" : ".");
        }
      }
      context.restore();
    }

    drawWater(context, view, time) {
      context.save();
      for (let y = Math.ceil(this.horizon) + 1; y < view.rows; y += 2) {
        const depth = (y - this.horizon) / (view.rows - this.horizon);
        context.fillStyle = depth < .3
          ? "rgba(149, 174, 183, .23)"
          : depth < .68
            ? "rgba(119, 150, 162, .18)"
            : "rgba(102, 131, 142, .13)";
        const speed = .08 + depth * .8;
        const offset = Math.floor((time * speed + y * .7) % 7);
        const gap = 5 + Math.floor(depth * 9);
        for (let x = -offset; x < view.cols; x += gap) {
          if (hash2(x, y, 2.2) < .25) continue;
          const count = 1 + Math.floor(hash2(x, y, 7.1) * 4);
          for (let k = 0; k < count && x + k < view.cols; k++) {
            const character = depth > .65 ? (hash2(x + k, y) > .72 ? "~" : ".") : hash2(x + k, y) > .52 ? "~" : "-";
            plot(context, view, x + k, y, character);
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
        context.fillStyle = "rgba(240, 243, 229, " + alpha.toFixed(3) + ")";
        const drift = Math.sin(time * .8 + y * .63) * (1.4 + depth * 5) + Math.sin(time * .27 + y * .19) * 2.4;
        const width = 1.6 + depth * 13;
        const center = moonX + drift;
        const centerCharacter = depth < .16 ? "=" : depth < .55 ? "-" : "~";
        plot(context, view, Math.round(center), y, centerCharacter);
        const segments = 3 + Math.floor(depth * 6);
        for (let segment = 0; segment < segments; segment++) {
          const n = hash2(y, segment, this.reflectionSeed);
          if (n < .12) continue;
          const offset = (n - .5) * width * 2;
          const x = Math.round(center + offset);
          if (x < 0 || x >= view.cols) continue;
          const character = depth < .16 ? "=" : depth < .46 ? "-" : depth < .74 ? "~" : ".";
          const run = 1 + Math.floor(n * 4);
          for (let k = 0; k < run && x + k < view.cols; k++) plot(context, view, x + k, y, character);
        }
      }
      context.restore();
    }

    drawBoat(context, view, time) {
      const bx = Math.floor((this.boat.x * view.w + Math.sin(time * .18 + this.boat.phase) * 10) / view.cw);
      const by = Math.floor((this.boat.y * view.h + Math.sin(time * .8 + this.boat.phase) * 2) / view.ch);
      context.save();
      context.fillStyle = "rgba(1, 5, 7, .97)";
      plot(context, view, bx - 3, by + 1, "\\");
      for (let x = -2; x <= 2; x++) plot(context, view, bx + x, by + 1, "_");
      plot(context, view, bx + 3, by + 1, "/");
      plot(context, view, bx - 2, by, "_");
      plot(context, view, bx + 2, by, "_");
      plot(context, view, bx, by - 1, "|");
      context.fillStyle = "rgba(150, 171, 174, .16)";
      plot(context, view, bx - 3, by + 1, "\\");
      plot(context, view, bx + 3, by + 1, "/");
      drawGlow(context, "#e6b378", (bx + .5) * view.cw, (by - 2.2) * view.ch, Math.min(view.w, view.h) * .044, .36);
      context.fillStyle = "rgba(247, 203, 139, .98)";
      plot(context, view, bx, by - 2, "*");
      context.fillStyle = "rgba(219, 179, 121, .28)";
      for (let i = 1; i <= 3; i++) {
        plot(context, view, bx - 1, by + 1 + i, i === 1 ? "~" : ".");
        plot(context, view, bx + 1, by + 1 + i, i === 2 ? "~" : ".");
      }
      context.restore();
    }

    drawBirds(context, view, time) {
      context.save();
      context.fillStyle = "rgba(4, 10, 14, .86)";
      for (const bird of this.birds) {
        const x = ((bird.x + time * bird.speed) % 1.15) * view.w - view.w * .08;
        const y = bird.y * view.h + Math.sin(time * .25 + bird.phase) * 5;
        const wing = Math.sin(time * .9 + bird.phase) > 0 ? "v" : "~";
        plot(context, view, Math.floor(x / view.cw), Math.floor(y / view.ch), wing);
      }
      context.restore();
    }
  }

    /* --------------------------------------------------------------------- */
    /* DSH browser half                                                       */
    /* --------------------------------------------------------------------- */

    const WALLPAPER_SECONDS = 32;
    const WALLPAPER_FADE = 1.35;
    const API_KEY = "nocturneWallpaper";

    const NOCTURNE_CSS = [
      "html.nocturne-html { background-color: #040506 !important; }",
      "html.nocturne-html body { background: transparent !important; }",
      "body[data-nocturne='on'] { background: transparent !important; --nocturne-app-tint: rgba(5, 8, 11, .34); --dsw-alias-bg-base: transparent !important; --dsw-specific-input-major: rgba(35, 37, 43, .9) !important; --dsw-specific-input-major: color-mix(in srgb, var(--dsw-static-neutral-bluish-850, #25272d) 90%, transparent) !important; --dsw-specific-bubble: rgba(35, 37, 43, .86) !important; --dsw-specific-bubble: color-mix(in srgb, var(--dsw-static-neutral-bluish-850, #25272d) 86%, transparent) !important; }",
      "body[data-nocturne='on']:not([data-ds-dark-theme]) { --nocturne-app-tint: rgba(250, 247, 239, .72); --dsw-specific-input-major: rgba(255, 255, 255, .94) !important; --dsw-specific-input-major: color-mix(in srgb, var(--dsw-static-neutral-bluish-00, #ffffff) 94%, transparent) !important; --dsw-specific-bubble: rgba(255, 255, 255, .91) !important; --dsw-specific-bubble: color-mix(in srgb, var(--dsw-static-neutral-bluish-00, #ffffff) 91%, transparent) !important; }",
      "body[data-nocturne='on'] #root, body[data-nocturne='on'] #app, body[data-nocturne='on'] .dsh-app, body[data-nocturne='on'] [data-dsh-app], body[data-nocturne='on'] [data-dsh-root] { background: var(--nocturne-app-tint) !important; }",
      "#nocturne-canvas, #nocturne-wash { position: fixed; inset: 0; width: 100%; height: 100%; pointer-events: none; }",
      "#nocturne-canvas { z-index: -5; display: block; background: #040506; }",
      "#nocturne-wash { z-index: -4; background: radial-gradient(ellipse at 50% 40%, rgba(2, 4, 6, .06) 0%, rgba(2, 4, 6, .18) 100%), linear-gradient(180deg, rgba(2, 4, 6, .32) 0%, rgba(2, 4, 6, .02) 15%, rgba(2, 4, 6, .02) 70%, rgba(2, 4, 6, .34) 100%); }",
      "body:not([data-ds-dark-theme]) #nocturne-wash { background: radial-gradient(ellipse at 50% 38%, rgba(250, 247, 239, .42) 0%, rgba(250, 247, 239, .58) 100%), linear-gradient(180deg, rgba(250, 247, 239, .8) 0%, rgba(250, 247, 239, .5) 16%, rgba(250, 247, 239, .48) 100%); }",
      "@media print { #nocturne-canvas, #nocturne-wash { display: none !important; } }"
    ].join("\n");

    function mountNocturne() {
      if (!document.body) return function () {};

      // A plugin reload should never leave a second wallpaper stacked behind
      // the first. The previous effect normally cleans up before this runs.
      for (const staleId of ["nocturne-canvas", "nocturne-wash", "nocturne-style"]) {
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
      let scenes = [];
      let currentIndex = 0;
      let view = null;
      let sceneTime = 0;
      let autoTime = 0;
      let fade = 0;
      let paused = false;
      let auto = !reduceQuery.matches;
      let motionScale = reduceQuery.matches ? .34 : 1;
      let raf = null;
      let lastDraw = 0;
      let resizeTimer = null;
      let disposed = false;
      let api = null;

      stageContext = canvas.getContext("2d", { alpha: false, desynchronized: true });
      if (!stageContext) return function () {};

      document.head.appendChild(style);
      document.body.prepend(wash);
      document.body.prepend(canvas);
      document.documentElement.classList.add("nocturne-html");
      document.body.setAttribute("data-nocturne", "on");

      scenes = [
        new CloudDrift(),
        new KoiPond(),
        new Jellyfish(),
        new Fireflies(),
        new Moonlit()
      ];

      function sceneName(index) {
        const scene = scenes[index];
        return scene === undefined ? "" : scene.title;
      }

      function currentState() {
        return {
          index: currentIndex,
          name: sceneName(currentIndex),
          paused: paused,
          auto: auto
        };
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
            return scene.title.toLowerCase().replace(/[^a-z0-9]/g, "") === slug;
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

        const cellWidth = clamp(width / 150, 7.6, 11.4);
        const cellHeight = cellWidth * 1.64;
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
          dpr: dpr,
          font: "400 " + (ch * .92).toFixed(2) + 'px "SFMono-Regular", "SF Mono", Menlo, Consolas, "Liberation Mono", monospace'
        };

        stageContext.setTransform(dpr, 0, 0, dpr, 0, 0);
        stageContext.textAlign = "center";
        stageContext.textBaseline = "middle";
        stageContext.font = view.font;
        stageContext.imageSmoothingEnabled = true;

        for (const scene of scenes) scene.init(view);
        fade = 0;
      }

      function render() {
        if (disposed || view === null) return;
        stageContext.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
        stageContext.globalAlpha = 1;
        stageContext.globalCompositeOperation = "source-over";
        stageContext.font = view.font;
        stageContext.textAlign = "center";
        stageContext.textBaseline = "middle";

        scenes[currentIndex].draw(stageContext, view, sceneTime);

        if (fade > 0 && snapshot.width > 0 && snapshot.height > 0) {
          stageContext.save();
          stageContext.setTransform(1, 0, 0, 1, 0, 0);
          stageContext.globalAlpha = fade * fade;
          stageContext.drawImage(snapshot, 0, 0);
          stageContext.restore();
        }
      }

      function capture() {
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

        if (!instant) capture();
        currentIndex = nextIndex;
        sceneTime = 0;
        autoTime = 0;
        fade = instant ? 0 : 1;

        if (paused) {
          fade = 0;
          render();
        } else if (raf === null) {
          start();
        }
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
        if (next === paused) return;
        paused = next;
        if (paused) stop();
        else start();
      }

      function setAuto(value) {
        auto = Boolean(value);
        autoTime = 0;
      }

      function start() {
        if (disposed || paused || document.hidden || raf !== null) return;
        lastDraw = performance.now();
        raf = requestAnimationFrame(tick);
      }

      function stop() {
        if (raf !== null) cancelAnimationFrame(raf);
        raf = null;
      }

      function tick(now) {
        if (disposed || paused || document.hidden) {
          raf = null;
          return;
        }
        raf = requestAnimationFrame(tick);

        if (lastDraw === 0) lastDraw = now;
        const elapsed = now - lastDraw;
        if (elapsed < 1000 / TARGET_FPS) return;

        // Drive rotation and the crossfade with wall time, but keep the scene
        // clock capped so throttled/background frames cannot make the art jump.
        const wallDt = Math.min(elapsed / 1000, 2);
        const sceneDt = Math.min(wallDt, .12);
        lastDraw = now;
        sceneTime += sceneDt * motionScale;
        if (auto) autoTime += wallDt;
        if (fade > 0) fade = Math.max(0, fade - wallDt / WALLPAPER_FADE);
        render();

        if (auto && autoTime >= WALLPAPER_SECONDS) nextScene();
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
        else if (!paused) start();
      }

      function isEditable(target) {
        if (target === null || target === undefined) return false;
        const tag = target.tagName;
        return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable === true;
      }

      function onKeyDown(event) {
        if (!event.altKey || event.metaKey || event.ctrlKey) return;
        if (isEditable(event.target)) return;
        const code = event.code;

        if (/^Digit[1-5]$/.test(code)) {
          event.preventDefault();
          showScene(Number(code.slice(5)) - 1);
          return;
        }
        if (code === "Digit0") {
          event.preventDefault();
          setPaused(!paused);
          return;
        }
        if (code === "KeyA") {
          event.preventDefault();
          setAuto(!auto);
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
        if (event.matches) auto = false;
      }

      api = {
        get scenes() {
          return scenes.map(function (scene) { return scene.title; });
        },
        status: function () {
          return currentState();
        },
        show: function (value) {
          showScene(value);
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
          setPaused(!paused);
          return currentState();
        },
        setAuto: function (value) {
          setAuto(value);
          return auto;
        },
        toggleAuto: function () {
          setAuto(!auto);
          return auto;
        }
      };

      function dispose() {
        if (disposed) return;
        disposed = true;
        stop();
        if (resizeTimer !== null) {
          clearTimeout(resizeTimer);
          resizeTimer = null;
        }
        window.removeEventListener("resize", scheduleResize);
        window.removeEventListener("orientationchange", scheduleResize);
        document.removeEventListener("visibilitychange", onVisibilityChange);
        window.removeEventListener("keydown", onKeyDown);
        if (reduceQuery.removeEventListener) reduceQuery.removeEventListener("change", onMotionPreferenceChange);
        if (window[API_KEY] === api) {
          try { delete window[API_KEY]; } catch (error) {}
        }
        document.body.removeAttribute("data-nocturne");
        document.documentElement.classList.remove("nocturne-html");
        style.remove();
        canvas.remove();
        wash.remove();
        stageContext = null;
        scenes = [];
        view = null;
      }

      window.addEventListener("resize", scheduleResize, { passive: true });
      window.addEventListener("orientationchange", scheduleResize, { passive: true });
      document.addEventListener("visibilitychange", onVisibilityChange);
      window.addEventListener("keydown", onKeyDown);
      if (reduceQuery.addEventListener) reduceQuery.addEventListener("change", onMotionPreferenceChange);

      window[API_KEY] = api;
      measure();
      render();
      start();

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
    }

    exports.name = "nocturne-wallpaper";
    exports.apply = apply;
    return module.exports;
  }
});
