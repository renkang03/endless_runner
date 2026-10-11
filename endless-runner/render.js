// render.js — drawing ONLY. It reads the state but never changes it.
//
// Two big ideas live here:
//
// 1. LOGICAL vs SCREEN size. The game world is a fixed 800x300 space and the
//    physics only ever sees those numbers. Here we decide how that space is
//    shown on the actual window, so a 4K monitor and a phone play the same game.
//
// 2. PIXEL ART FROM TEXT. Every character and enemy is a small grid of letters
//    (one letter = one coloured pixel) turned into a tiny canvas once, then
//    stretched up with smoothing OFF so the pixels stay sharp. No image files.
//    Each sprite is drawn exactly into its HITBOX rectangle, so what you see is
//    what can hurt you.

const Render = (function () {
  const C = Game.CONFIG;
  const FONT = '"Courier New", monospace';

  // ---- Day / night -----------------------------------------------------------
  // The look flips between day and night every CYCLE_POINTS points, fading over
  // RAMP_POINTS points. It's a pure function of the score, so there is no extra
  // animation state to keep in sync.
  const CYCLE_POINTS = 500;
  const RAMP_POINTS = 40;

  const DAY = {
    bg: '#a5d8f3', fg: '#2b2b2b', sub: '#44596a', hint: '#587084', accent: '#c0392b',
  };
  const NIGHT = {
    bg: '#0d1020', fg: '#e8e8e8', sub: '#a0a0a8', hint: '#6e6e78', accent: '#ff7a7a',
  };

  // 0 = full day, 1 = full night, with smooth fades in between.
  function nightAmount(score) {
    const block = Math.floor(score / CYCLE_POINTS);
    if (block === 0) return 0;                         // the game starts in daylight
    const ramp = Math.min(1, (score - block * CYCLE_POINTS) / RAMP_POINTS);
    const eased = ramp * ramp * (3 - 2 * ramp);        // "smoothstep": gentle start and end
    return block % 2 === 1 ? eased : 1 - eased;        // odd blocks fade to night, even to day
  }

  function hexToRgb(h) {
    return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  }

  // Blend two hex colours: t = 0 gives a, t = 1 gives b ("linear interpolation").
  function mix(a, b, t) {
    const A = hexToRgb(a), B = hexToRgb(b);
    return 'rgb(' + A.map(function (v, i) { return Math.round(v + (B[i] - v) * t); }).join(',') + ')';
  }

  function paletteFor(night) {
    const pal = {};
    for (const key in DAY) pal[key] = mix(DAY[key], NIGHT[key], night);
    return pal;
  }

  // ---- Sprite art ------------------------------------------------------------
  // '.' is transparent; every other letter is looked up in that sprite's palette.

  // The adventurer faces right. 8 x 10 art pixels -> 40 x 50 game units (5 each).
  const PLAYER_PAL = {
    h: '#5b3a1e', H: '#8a5a2b',   // hat: dark brim, lighter crown
    s: '#f1c27d', e: '#222222',   // skin, eye
    r: '#c0392b',                 // red scarf
    t: '#2e7d32', b: '#6d4c2b',   // green tunic, brown belt
    k: '#7a5230',                 // backpack
    p: '#3d4a6b', B: '#3e2a14',   // trousers, boots
  };
  const PLAYER_TOP = [
    '..hhhh..',
    '.hHHHHh.',
    'hhhhhhhh',
    '..ssse..',
    '.rrrrrr.',
    'kttttts.',
    'kttbbtt.',
    '.pppppp.',
  ];
  const PLAYER = {
    runA: PLAYER_TOP.concat(['.pp..pp.', '.BB..BB.']),   // legs apart
    runB: PLAYER_TOP.concat(['..pppp..', '..BBBB..']),   // legs together
    jump: PLAYER_TOP.concat(['.ppp.pp.', '.BBB.BB.']),   // legs tucked
    duck: [                                              // 8 x 5 -> 40 x 25
      '.hHHHHh.',
      'hhhhhhhh',
      'krssse..',
      'kttttbt.',
      'BBppppBB',
    ],
  };

  // The bird faces left. 8 x 6 art pixels -> 48 x 36 game units (6 each).
  const BIRD_PAL = {
    d: '#4a3f3a', w: '#8a776a', f: '#e8d9c0', y: '#ffb300', E: '#ffffff',
  };
  const BIRD = {
    up: [
      '....ww..',
      '...wwww.',
      'yEdddddd',
      '.dfffddd',
      '..ffffd.',
      '......dd',
    ],
    down: [
      '........',
      '........',
      'yEdddddd',
      '.dfffddd',
      '..wwwww.',
      '...wwww.',
    ],
  };

  // The dragon flies in profile, facing left, in the colours of a sky-blue plush:
  // blue body, white wing/snout/ears, small rainbow spines along the back.
  // 12 x 19 art pixels -> 96 x 152 game units (8 each). Two wing frames.
  const DRAGON_PAL = {
    B: '#7ec8ee', b: '#4f9fcf', s: '#c9e8f8',   // body, shade, light belly
    W: '#ffffff', e: '#1b2430',                 // wing/snout/ears, eye
    o: '#f28c28', y: '#f7d23c', g: '#4caf50', r: '#e53935',  // rainbow spines
  };
  const DRAGON = {
    up: [
      '.W.W....W.W.',
      '.BBBBo..WWW.',
      'WWBeBBy.WWW.',
      'WWBBBBg.WW..',
      '.BBBBBr.WW..',
      '..BBBBoWW...',
      '..BBBByW....',
      '..BBBBBg....',
      '..BBBBBBr...',
      '.BBBBBBBBo..',
      '.BsBBBBBBBy.',
      '.BsssBBBBBBg',
      '.BsssBBBBBr.',
      '..BBBBBBBo..',
      '..bB..bBBBy.',
      '..WW..WW.BBB',
      '.........BBB',
      '..........BB',
      '...........B',
    ],
    down: [
      '.W.W........',
      '.BBBBo......',
      'WWBeBBy.....',
      'WWBBBBg.....',
      '.BBBBBr.....',
      '..BBBBo.....',
      '..BBBBy.....',
      '..BBBBBg....',
      '..BBBBBBrW..',
      '.BBBBBBBBoWW',
      '.BsBBBBBBBWW',
      '.BsssBBBBBWW',
      '.BsssBBBBWWW',
      '..BBBBBBBWW.',
      '..bB..bBBWWy',
      '..WW..WW.WBB',
      '.........BBB',
      '..........BB',
      '...........B',
    ],
  };
  const WING_NOTE = 'wings are part of the DRAGON frames now';

  const CLOUD_PAL = { w: '#ffffff' };
  const CLOUD = [
    '...wwww.....',
    '.wwwwwwwww..',
    'wwwwwwwwwwww',
    '.wwwwwwwwww.',
  ];

  // ---- Textures (Minecraft-style blocks) ---------------------------------------
  // Each block texture is 10 x 10 art pixels, shown at 20 x 20 game units, built
  // from noise using a tiny seeded generator (the renderer's own, so it never
  // touches the game's random numbers).
  function lcg(seed) {
    let s = seed >>> 0;
    return function () { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  }

  const STONE_SHADES = ['#7f7f7f', '#8a8a8a', '#757575', '#939393', '#6c6c6c'];
  const DIRT_SHADES = ['#8a5a2c', '#7b4e24', '#996433', '#6d4520', '#a36d38'];
  const GRASS_SHADES = ['#5fae2e', '#52a026', '#6bbb36', '#4a9422'];

  function pick(rnd, list) { return list[Math.floor(rnd() * list.length)]; }

  function makeCanvas(w, h) {
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    return cv;
  }

  function makeTexture(kind, variant) {
    const cv = makeCanvas(10, 10);
    const g = cv.getContext('2d');
    const rnd = lcg({ stone: 11, dirt: 23, grass: 37 }[kind] * 1000 + variant * 131);
    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 10; x++) {
        let shades = kind === 'stone' ? STONE_SHADES : DIRT_SHADES;
        if (kind === 'grass') {
          // Grass on the top rows with a ragged lower edge, dirt below.
          const grassy = y < 3 || (y === 3 && rnd() < 0.5);
          shades = grassy ? GRASS_SHADES : DIRT_SHADES;
        }
        g.fillStyle = pick(rnd, shades);
        g.fillRect(x, y, 1, 1);
      }
    }
    // A faint bevel so neighbouring blocks read as separate cubes.
    g.fillStyle = 'rgba(255,255,255,0.10)';
    g.fillRect(0, 0, 10, 1);
    g.fillRect(0, 0, 1, 10);
    g.fillStyle = 'rgba(0,0,0,0.22)';
    g.fillRect(0, 9, 10, 1);
    g.fillRect(9, 0, 1, 10);
    return cv;
  }

  function makeSprite(rows, pal) {
    const cv = makeCanvas(rows[0].length, rows.length);
    const g = cv.getContext('2d');
    for (let y = 0; y < rows.length; y++) {
      for (let x = 0; x < rows[y].length; x++) {
        const ch = rows[y][x];
        if (ch === '.') continue;
        g.fillStyle = pal[ch];
        g.fillRect(x, y, 1, 1);
      }
    }
    return cv;
  }

  // Built the first time we draw (they need a browser to make canvases).
  let assets = null;
  function buildAssets() {
    const a = { stone: [], dirt: [], grass: [], player: {}, bird: {} };
    for (let v = 0; v < 3; v++) {
      a.stone.push(makeTexture('stone', v));
      a.dirt.push(makeTexture('dirt', v));
      a.grass.push(makeTexture('grass', v));
    }
    for (const k in PLAYER) a.player[k] = makeSprite(PLAYER[k], PLAYER_PAL);
    for (const k in BIRD) a.bird[k] = makeSprite(BIRD[k], BIRD_PAL);
    a.dragon = {};
    for (const k in DRAGON) a.dragon[k] = makeSprite(DRAGON[k], DRAGON_PAL);
    a.cloud = makeSprite(CLOUD, CLOUD_PAL);
    return a;
  }

  // Fixed star and cloud positions, as fractions of the sky.
  const stars = (function () {
    const rnd = lcg(7);
    const list = [];
    for (let i = 0; i < 60; i++) list.push({ u: rnd(), v: rnd(), size: 1 + Math.floor(rnd() * 3), glow: 0.4 + rnd() * 0.6 });
    return list;
  })();
  const clouds = [
    { u: 0.05, v: 0.15, k: 1.0 }, { u: 0.30, v: 0.42, k: 0.7 }, { u: 0.52, v: 0.10, k: 1.2 },
    { u: 0.72, v: 0.35, k: 0.9 }, { u: 0.90, v: 0.20, k: 0.8 },
  ];

  // ---- View: how the logical world maps onto the window -----------------------
  let canvas = null;
  let dpr = 1;

  const view = {
    cssW: C.WIDTH, cssH: C.HEIGHT, // window size in CSS pixels
    scale: 1,                      // CSS pixels per game unit
    viewW: C.WIDTH, viewH: C.HEIGHT, // visible area in GAME units
    offsetX: 0, offsetY: 0,        // where the world's top-left sits, in game units
  };

  function resize() {
    dpr = window.devicePixelRatio || 1;
    const cssW = window.innerWidth;
    const cssH = window.innerHeight;

    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';

    // Scale so the world fills the window WIDTH. If the window is so short that
    // the world wouldn't fit vertically, scale to fit the HEIGHT instead.
    let scale = cssW / C.WIDTH;
    if (cssH / scale < C.HEIGHT) scale = cssH / C.HEIGHT;

    view.cssW = cssW;
    view.cssH = cssH;
    view.scale = scale;
    view.viewW = cssW / scale;
    view.viewH = cssH / scale;
    view.offsetX = (view.viewW - C.WIDTH) / 2;
    view.offsetY = (view.viewH - C.HEIGHT) / 2;
  }

  function setup(c) {
    canvas = c;
    const ctx = canvas.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
    return ctx;
  }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  // 83.4 seconds -> "1:23.4"
  function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds - m * 60;
    return m + ':' + (s < 10 ? '0' : '') + s.toFixed(1);
  }

  function pad5(n) { return String(n).padStart(5, '0'); }

  // Text in SCREEN pixels (size is in CSS px).
  function text(ctx, str, x, y, size, align, color) {
    ctx.font = 'bold ' + size + 'px ' + FONT;
    ctx.textAlign = align;
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
  }

  // A cheap, repeatable "random" number from two whole numbers, so every ground
  // column gets its own texture that stays put as the ground scrolls past.
  function hash2(a, b) {
    let h = Math.imul(a, 374761393) ^ Math.imul(b, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return (h ^ (h >>> 16)) >>> 0;
  }

  // ---- The ground: rows of Minecraft blocks that scroll with the distance run ----
  function drawGround(ctx, state, night) {
    const B = C.BLOCK;
    const left = -view.offsetX;
    const right = view.viewW - view.offsetX;
    const bottom = view.viewH - view.offsetY; // world y at the bottom of the window

    // Columns slide left by exactly the distance travelled. `idx` is the column's
    // number in the endless world, used to give it a stable texture.
    const shift = Math.ceil(view.offsetX / B);
    let x = Math.round(-(state.distance % B)) - shift * B;
    let idx = Math.floor(state.distance / B) - shift;

    for (; x < right; x += B, idx++) {
      for (let k = 0, y = C.GROUND_Y; y < bottom; k++, y += B) {
        const v = hash2(idx, k) % 3;
        const tex = k === 0 ? assets.grass[v] : (k <= 2 ? assets.dirt[v] : assets.stone[v]);
        // +0.6 makes each block overlap its neighbour slightly: no hairline gaps.
        ctx.drawImage(tex, x, y, B + 0.6, B + 0.6);
      }
    }

    if (night > 0.01) {
      ctx.fillStyle = 'rgba(6, 10, 40, ' + (0.5 * night).toFixed(3) + ')';
      ctx.fillRect(left, C.GROUND_Y, right - left, bottom - C.GROUND_Y + 1);
    }
  }

  function drawObstacle(ctx, o, state, night) {
    const x = Math.round(o.x), y = Math.round(o.y);

    if (o.type === 'stone') {
      const B = C.BLOCK;
      for (let ry = 0; ry < o.h / B; ry++) {
        for (let cx = 0; cx < o.w / B; cx++) {
          const tex = assets.stone[(o.variant + cx * 2 + ry) % 3];
          ctx.drawImage(tex, x + cx * B, y + ry * B, B + 0.6, B + 0.6);
        }
      }
      if (night > 0.01) {
        ctx.fillStyle = 'rgba(6, 10, 40, ' + (0.35 * night).toFixed(3) + ')';
        ctx.fillRect(x, y, o.w, o.h);
      }
    } else if (o.type === 'bird') {
      const flap = Math.floor(state.time * 7) % 2 === 0 ? assets.bird.up : assets.bird.down;
      ctx.drawImage(flap, x, y, o.w, o.h);
    } else if (o.type === 'dragon') {
      const f = Math.floor(state.time * 5) % 2 === 0 ? assets.dragon.up : assets.dragon.down;
      ctx.drawImage(f, x, y, o.w, o.h);
    }
  }

  // `ui` holds things that are about the app, not the game:
  //   { paused, highScore, newRecord, muted, debug }
  function draw(ctx, state, ui) {
    ui = ui || {};
    if (!assets) assets = buildAssets();

    const s = view.scale * dpr;
    const night = nightAmount(state.score);
    const pal = paletteFor(night);

    // 1. Sky: fill the whole window (screen space). Smoothing off keeps the
    //    pixel art crisp when it is scaled up.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = pal.bg;
    ctx.fillRect(0, 0, view.cssW, view.cssH);

    const groundScreenY = (view.offsetY + C.GROUND_Y) * view.scale;
    const celestial = Math.round(clamp(view.scale * 26, 18, 60)); // sun / moon size

    // Clouds and sun by day; stars and moon by night. They drift slowly as you
    // run: far-away things move slower than the ground ("parallax").
    if (night < 0.99) {
      ctx.globalAlpha = 1 - night;
      const px = clamp(Math.round(view.scale * 3), 2, 9);
      const cw = CLOUD[0].length * px;
      for (const cl of clouds) {
        const span = view.cssW + 2 * cw * 1.2;
        const x = (((cl.u * span - state.distance * 0.03 * view.scale) % span) + span) % span - cw * 1.2;
        const y = 20 + cl.v * Math.max(10, groundScreenY - 120);
        ctx.drawImage(assets.cloud, Math.round(x), Math.round(y), cw * cl.k, CLOUD.length * px * cl.k);
      }
      ctx.fillStyle = '#ffe45c';
      ctx.fillRect(view.cssW * 0.12, groundScreenY * 0.12, celestial, celestial);
      ctx.fillStyle = '#fff6b0';
      ctx.fillRect(view.cssW * 0.12 + celestial * 0.2, groundScreenY * 0.12 + celestial * 0.2,
                   celestial * 0.6, celestial * 0.6);
      ctx.globalAlpha = 1;
    }
    if (night > 0.01) {
      const drift = state.distance * 0.02 * view.scale;
      ctx.fillStyle = '#ffffff';
      for (const st of stars) {
        const x = (((st.u * view.cssW - drift) % view.cssW) + view.cssW) % view.cssW;
        ctx.globalAlpha = night * st.glow;
        ctx.fillRect(x, st.v * (groundScreenY - 40), st.size, st.size);
      }
      ctx.globalAlpha = night * 0.9;
      ctx.fillStyle = '#e8e4cc';
      ctx.fillRect(view.cssW * 0.8, groundScreenY * 0.18, celestial, celestial);
      ctx.globalAlpha = 1;
    }

    // 2. Switch to WORLD space: from here on, coordinates are game units.
    ctx.setTransform(s, 0, 0, s, view.offsetX * view.scale * dpr, view.offsetY * view.scale * dpr);
    ctx.imageSmoothingEnabled = false;

    drawGround(ctx, state, night);

    // 3. Obstacles and player, clipped to the playfield so that obstacles slide
    //    in from its edge instead of popping into existence.
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, -view.offsetY, C.WIDTH, view.viewH);
    ctx.clip();

    for (const o of state.obstacles) drawObstacle(ctx, o, state, night);

    const p = state.player;
    let sprite;
    if (p.ducking) sprite = assets.player.duck;
    else if (!p.onGround) sprite = assets.player.jump;
    else sprite = Math.floor(state.distance / 28) % 2 === 0 ? assets.player.runA : assets.player.runB;
    ctx.drawImage(sprite, Math.round(p.x), Math.round(p.y), p.w, p.h);

    // Debug view (press H): the REAL rectangles the collision code uses.
    if (ui.debug) {
      ctx.lineWidth = 1;
      ctx.strokeStyle = '#ff2bd6';
      for (const o of state.obstacles) ctx.strokeRect(o.x + 0.5, o.y + 0.5, o.w - 1, o.h - 1);
      const hb = Game.playerHitbox(p);
      ctx.strokeStyle = '#00e0ff';
      ctx.strokeRect(hb.x + 0.5, hb.y + 0.5, hb.w - 1, hb.h - 1);
    }
    ctx.restore();

    // 4. Back to SCREEN space for the HUD and overlays.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const hud = clamp(Math.round(20 * view.scale), 14, 32);
    const pad = Math.round(hud * 0.8);
    const hi = Math.max(ui.highScore || 0, state.score);
    text(ctx, 'Score: ' + pad5(state.score) + '  HI: ' + pad5(hi), pad, pad + hud, hud, 'left', pal.fg);
    text(ctx, 'Time: ' + formatTime(state.time), view.cssW - pad, pad + hud, hud, 'right', pal.fg);

    if (view.cssW >= 780) {
      // White text with a dark drop shadow: readable over grass, dirt and stone.
      const hint = clamp(Math.round(12 * view.scale), 12, 18);
      const hintText = 'Space/Up: jump (hold = higher)  Down: duck  P: pause  F: fullscreen  M: sound ' +
        (ui.muted ? 'OFF' : 'ON') + '  H: hitboxes';
      text(ctx, hintText, view.cssW / 2 + 1, view.cssH - hint + 1, hint, 'center', 'rgba(0,0,0,0.6)');
      text(ctx, hintText, view.cssW / 2, view.cssH - hint, hint, 'center', '#ffffff');
    }

    // 5. Overlays.
    const u = clamp(view.scale, 0.7, 2.2);
    const cx = view.cssW / 2;
    const cy = view.cssH / 2;

    if (state.gameOver || ui.paused || ui.start) {
      ctx.globalAlpha = 0.78;
      ctx.fillStyle = pal.bg;
      ctx.fillRect(0, 0, view.cssW, view.cssH);
      ctx.globalAlpha = 1;
    }

    if (state.gameOver) {
      text(ctx, 'GAME OVER', cx, cy - 50 * u, 40 * u, 'center', pal.fg);
      text(ctx, 'Score: ' + state.score + '    Time: ' + formatTime(state.time),
           cx, cy - 5 * u, 20 * u, 'center', pal.fg);
      if (ui.newRecord) {
        text(ctx, 'NEW HIGH SCORE!', cx, cy + 28 * u, 20 * u, 'center', pal.accent);
      } else {
        text(ctx, 'High score: ' + (ui.highScore || 0), cx, cy + 28 * u, 20 * u, 'center', pal.sub);
      }
      if (state.deadTime >= C.RESTART_DELAY) {
        text(ctx, 'Press Space to restart', cx, cy + 65 * u, 18 * u, 'center', pal.sub);
      }
    } else if (ui.paused) {
      text(ctx, 'PAUSED', cx, cy - 10 * u, 40 * u, 'center', pal.fg);
      text(ctx, 'Press P to resume', cx, cy + 30 * u, 18 * u, 'center', pal.sub);
    } else if (ui.start) {
      text(ctx, 'ENDLESS RUNNER', cx, cy - 25 * u, 40 * u, 'center', pal.fg);
      text(ctx, 'Press Space or tap to start', cx, cy + 15 * u, 20 * u, 'center', pal.sub);
      text(ctx, 'Jump stone blocks. Duck birds and dragons.', cx, cy + 45 * u, 14 * u, 'center', pal.sub);
    }
  }

  // `art` is exported so the sprite grids can be checked by a test.
  const art = {
    player: PLAYER, bird: BIRD, dragon: DRAGON, cloud: CLOUD,
    palettes: { player: PLAYER_PAL, bird: BIRD_PAL, dragon: DRAGON_PAL, cloud: CLOUD_PAL },
  };

  return { setup, draw, nightAmount, paletteFor, art };
})();

// Lets Node load this file too, so the day/night maths and sprite grids can be
// unit tested. (Game must exist first, as it does in the browser.)
if (typeof module !== 'undefined') module.exports = Render;
