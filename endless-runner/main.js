// main.js — wires everything together and runs the game loop.

const canvas = document.getElementById('game');
const ctx = Render.setup(canvas);

const input = Input.create(canvas);
let state = Game.createState();

// ---- Fixed timestep loop (explained in Milestone 1) -----------------------
// Real elapsed time goes into an accumulator; we spend it in fixed STEP slices.

const STEP = Game.CONFIG.STEP;
const MAX_FRAME_TIME = 0.25; // seconds; avoids the "spiral of death"

let accumulator = 0;
let lastTime = performance.now();

function frame(now) {
  let frameTime = (now - lastTime) / 1000;
  lastTime = now;
  if (frameTime > MAX_FRAME_TIME) frameTime = MAX_FRAME_TIME;

  accumulator += frameTime;
  while (accumulator >= STEP) {
    Game.update(state, input, STEP);
    input.consume(); // the game has now seen any pending tap
    accumulator -= STEP;
  }

  Render.draw(ctx, state);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
