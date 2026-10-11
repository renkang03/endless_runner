// render.js — drawing ONLY. It reads the state but never changes it.

const Render = (function () {
  const C = Game.CONFIG;
  const FONT = '"Courier New", monospace';

  function setup(canvas) {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = C.WIDTH * dpr;
    canvas.height = C.HEIGHT * dpr;
    canvas.style.width = C.WIDTH + 'px';
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    return ctx;
  }

  // 83.4 seconds -> "1:23.4"
  function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds - m * 60;
    return m + ':' + (s < 10 ? '0' : '') + s.toFixed(1);
  }

  function text(ctx, str, x, y, size, align, color) {
    ctx.font = 'bold ' + size + 'px ' + FONT;
    ctx.textAlign = align;
    ctx.fillStyle = color || '#333';
    ctx.fillText(str, x, y);
  }

  // Dim the whole screen so overlay text is readable.
  function dim(ctx) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.fillRect(0, 0, C.WIDTH, C.HEIGHT);
  }

  // `ui` holds things that are about the app, not the game: { paused }.
  function draw(ctx, state, ui) {
    // 1. Clear.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, C.WIDTH, C.HEIGHT);

    // 2. Ground line + scrolling tick marks.
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, C.GROUND_Y);
    ctx.lineTo(C.WIDTH, C.GROUND_Y);
    ctx.stroke();

    ctx.beginPath();
    for (let x = -state.groundOffset; x < C.WIDTH; x += C.TICK_SPACING) {
      ctx.moveTo(x, C.GROUND_Y + 8);
      ctx.lineTo(x + 12, C.GROUND_Y + 8);
    }
    ctx.stroke();

    // 3. Obstacles: red on the ground, blue in the air.
    for (const o of state.obstacles) {
      ctx.fillStyle = o.type === 'air' ? '#3a6fb0' : '#b33';
      ctx.fillRect(o.x, o.y, o.w, o.h);
    }

    // 4. Player.
    const p = state.player;
    ctx.fillStyle = '#333';
    ctx.fillRect(p.x, p.y, p.w, p.h);

    // 5. HUD: score on the left, timer on the right, controls hint at the bottom.
    text(ctx, 'Score: ' + state.score, 16, 28, 20, 'left');
    text(ctx, 'Time: ' + formatTime(state.time), C.WIDTH - 16, 28, 20, 'right');
    text(ctx, 'Space/Up: jump (hold = higher)   Down: duck / fast-fall   P: pause',
         C.WIDTH / 2, C.HEIGHT - 12, 12, 'center', '#999');

    // 6. Overlays.
    if (state.gameOver) {
      dim(ctx);
      text(ctx, 'GAME OVER', C.WIDTH / 2, 110, 40, 'center');
      text(ctx, 'Score: ' + state.score + '    Time: ' + formatTime(state.time),
           C.WIDTH / 2, 150, 20, 'center');
      if (state.deadTime >= C.RESTART_DELAY) {
        text(ctx, 'Press Space to restart', C.WIDTH / 2, 190, 18, 'center', '#666');
      }
    } else if (ui && ui.paused) {
      dim(ctx);
      text(ctx, 'PAUSED', C.WIDTH / 2, 130, 40, 'center');
      text(ctx, 'Press P to resume', C.WIDTH / 2, 170, 18, 'center', '#666');
    }
  }

  return { setup, draw };
})();
