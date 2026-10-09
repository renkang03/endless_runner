// render.js — drawing ONLY. It reads the state but never changes it.

const Render = (function () {
  const C = Game.CONFIG;

  // Make the canvas crisp on high-DPI screens: fixed logical size (800x300),
  // more real pixels when devicePixelRatio > 1, and scale the context to match.
  function setup(canvas) {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = C.WIDTH * dpr;
    canvas.height = C.HEIGHT * dpr;
    canvas.style.width = C.WIDTH + 'px';
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    return ctx;
  }

  function draw(ctx, state) {
    // 1. Clear the previous frame.
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

    // 3. The player: just a rectangle at the position the state says.
    const p = state.player;
    ctx.fillStyle = '#333';
    ctx.fillRect(p.x, p.y, p.w, p.h);
  }

  return { setup, draw };
})();
