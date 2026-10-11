// main.js — wires everything together and runs the game loop.

const canvas = document.getElementById('game');
const ctx = Render.setup(canvas);
const input = Input.create(canvas);

// The clock/randomness lives HERE, not in game.js: we pick a random seed and
// hand it in. Pass a fixed number (e.g. 42) to get the same course every time.
function newSeed() { return (Math.random() * 4294967296) >>> 0; }

let state = Game.createState(newSeed());

// Pause is an APP concern, not a game rule, so it lives here, not in state.
// While paused we simply stop calling update(). (A headless AI never pauses.)
let paused = false;

function restart() {
  input.consume();
  state = Game.createState(newSeed());
  // If the player is still holding the key they used to restart, don't count
  // that as a fresh press: they must release and press again to jump.
  state.prevJumpHeld = input.jumpHeld;
  paused = false;
}

// Auto-pause if the tab/window loses focus, so you don't die in the background.
window.addEventListener('blur', function () { if (!state.gameOver) paused = true; });
document.addEventListener('visibilitychange', function () {
  if (document.hidden && !state.gameOver) paused = true;
});

// ---- Fixed timestep loop (explained in Milestone 1) -----------------------
const STEP = Game.CONFIG.STEP;
const MAX_FRAME_TIME = 0.25;

let accumulator = 0;
let lastTime = performance.now();

function frame(now) {
  let frameTime = (now - lastTime) / 1000;
  lastTime = now; // updated even while paused, so unpausing causes no time jump
  if (frameTime > MAX_FRAME_TIME) frameTime = MAX_FRAME_TIME;

  // One-shot events. Read both every frame so stale presses never pile up.
  const pressed = input.takePress();
  if (input.takePause() && !state.gameOver) paused = !paused;

  if (state.gameOver && state.deadTime >= Game.CONFIG.RESTART_DELAY && pressed) {
    restart();
  }

  if (paused) {
    input.consume(); // presses made while paused shouldn't fire on resume
  } else {
    accumulator += frameTime;
    while (accumulator >= STEP) {
      Game.update(state, input, STEP);
      input.consume();
      accumulator -= STEP;
    }
  }

  Render.draw(ctx, state, { paused: paused });
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
