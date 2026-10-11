// render.js — drawing ONLY. It reads the state but never changes it.
//
// Key idea: the game world is a fixed 800x300 "logical" space, and the physics
// only ever sees those numbers. Here we decide how that space is shown on the
// actual window. A 4K monitor and a phone run the exact same game; the world
// is just scaled up or down. That's what makes it safe to go fullscreen.

const Render = (function () {
  const C = Game.CONFIG;
  const FONT = '"Courier New", monospace';

  let canvas = null;
  let dpr = 1;

  // How the logical world maps onto the window (all recomputed in resize()).
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

    // Real pixel size = CSS size * dpr, so it stays sharp on high-DPI screens.
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
    // Centre the world; any spare room becomes extra sky above and ground below.
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
    ctx.fillStyle = color || '#333';
    ctx.fillText(str, x, y);
  }

  // `ui` holds things that are about the app, not the game:
  //   { paused, highScore, newRecord }
  function draw(ctx, state, ui) {
    ui = ui || {};
    const s = view.scale * dpr;

    // 1. Clear the whole window (screen space).
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, view.cssW, view.cssH);

    // 2. Switch to WORLD space: from here on, coordinates are game units.
    ctx.setTransform(s, 0, 0, s, view.offsetX * view.scale * dpr, view.offsetY * view.scale * dpr);

    // The visible part of the world, in game units (wider than 0..800 only
    // when the window is very wide and short).
    const left = -view.offsetX;
    const right = view.viewW - view.offsetX;

    // Ground line + scrolling tick marks span the whole visible width.
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(left, C.GROUND_Y);
    ctx.lineTo(right, C.GROUND_Y);
    ctx.stroke();

    ctx.beginPath();
    const startX = -state.groundOffset - Math.ceil(view.offsetX / C.TICK_SPACING) * C.TICK_SPACING;
    for (let x = startX; x < right; x += C.TICK_SPACING) {
      ctx.moveTo(x, C.GROUND_Y + 8);
      ctx.lineTo(x + 12, C.GROUND_Y + 8);
    }
    ctx.stroke();

    // 3. Obstacles and player, clipped to the playfield so that obstacles
    //    slide in from its edge instead of popping into existence.
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, -view.offsetY, C.WIDTH, view.viewH);
    ctx.clip();

    for (const o of state.obstacles) {
      ctx.fillStyle = o.type === 'air' ? '#3a6fb0' : '#b33';
      ctx.fillRect(o.x, o.y, o.w, o.h);
    }

    const p = state.player;
    ctx.fillStyle = '#333';
    ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.restore();

    // 4. Back to SCREEN space for the HUD and overlays, so text stays crisp
    //    and sits in the screen corners no matter how the world is scaled.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const hud = clamp(Math.round(20 * view.scale), 14, 32);
    const pad = Math.round(hud * 0.8);
    const hi = Math.max(ui.highScore || 0, state.score); // ticks up once you pass your record
    text(ctx, 'Score: ' + pad5(state.score) + '  HI: ' + pad5(hi), pad, pad + hud, hud, 'left');
    text(ctx, 'Time: ' + formatTime(state.time), view.cssW - pad, pad + hud, hud, 'right');

    if (view.cssW >= 640) {
      const hint = clamp(Math.round(12 * view.scale), 12, 18);
      text(ctx, 'Space/Up: jump (hold = higher)   Down: duck / fast-fall   P: pause   F: fullscreen',
           view.cssW / 2, view.cssH - hint, hint, 'center', '#999');
    }

    // 5. Overlays.
    const u = clamp(view.scale, 0.7, 2.2); // overlay text scale
    const cx = view.cssW / 2;
    const cy = view.cssH / 2;

    if (state.gameOver || ui.paused) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.78)';
      ctx.fillRect(0, 0, view.cssW, view.cssH);
    }

    if (state.gameOver) {
      text(ctx, 'GAME OVER', cx, cy - 50 * u, 40 * u, 'center');
      text(ctx, 'Score: ' + state.score + '    Time: ' + formatTime(state.time),
           cx, cy - 5 * u, 20 * u, 'center');
      if (ui.newRecord) {
        text(ctx, 'NEW HIGH SCORE!', cx, cy + 28 * u, 20 * u, 'center', '#b33');
      } else {
        text(ctx, 'High score: ' + (ui.highScore || 0), cx, cy + 28 * u, 20 * u, 'center', '#666');
      }
      if (state.deadTime >= C.RESTART_DELAY) {
        text(ctx, 'Press Space to restart', cx, cy + 65 * u, 18 * u, 'center', '#666');
      }
    } else if (ui.paused) {
      text(ctx, 'PAUSED', cx, cy - 10 * u, 40 * u, 'center');
      text(ctx, 'Press P to resume', cx, cy + 30 * u, 18 * u, 'center', '#666');
    }
  }

  return { setup, draw };
})();
