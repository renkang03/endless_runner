// main.js — wires everything together and runs the game loop.
// Anything that touches the browser (storage, fullscreen, focus) lives here,
// so game.js stays pure.

const canvas = document.getElementById('game');
const ctx = Render.setup(canvas);
const input = Input.create(canvas);

// The clock/randomness lives HERE, not in game.js: we pick a random seed and
// hand it in. Pass a fixed number (e.g. 42) to get the same course every time.
function newSeed() { return (Math.random() * 4294967296) >>> 0; }

let state = Game.createState(newSeed());

// ---- High score (saved in the browser's localStorage) ---------------------
// localStorage only stores strings, and it can throw (private mode, blocked
// site data) or hold junk, so every access is wrapped and validated.
const HIGH_SCORE_KEY = 'endlessRunner.highScore';

function loadHighScore() {
  try {
    const n = parseInt(localStorage.getItem(HIGH_SCORE_KEY), 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch (e) {
    return 0;
  }
}

function saveHighScore(n) {
  try { localStorage.setItem(HIGH_SCORE_KEY, String(n)); } catch (e) { /* ignore */ }
}

let highScore = loadHighScore();
let newRecord = false;     // did the run that just ended beat the record?
let deathHandled = false;  // make sure we record each death only once

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
  newRecord = false;
  deathHandled = false;
}

// Auto-pause if the tab/window loses focus, so you don't die in the background.
window.addEventListener('blur', function () { if (!state.gameOver) paused = true; });
document.addEventListener('visibilitychange', function () {
  if (document.hidden && !state.gameOver) paused = true;
});

// F toggles real browser fullscreen. (The game already fills the window; this
// also hides the browser's own toolbars.) The browser only allows this in
// response to a key press, and may refuse, so failures are ignored.
function toggleFullscreen() {
  try {
    const result = document.fullscreenElement
      ? document.exitFullscreen()
      : document.documentElement.requestFullscreen();
    if (result && result.catch) result.catch(function () {});
  } catch (e) { /* ignore */ }
}
window.addEventListener('keydown', function (e) {
  if (e.code === 'KeyF' && !e.repeat) toggleFullscreen();
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

  // The moment the game ends, check for a new record and save it.
  if (state.gameOver && !deathHandled) {
    deathHandled = true;
    if (state.score > highScore) {
      highScore = state.score;
      newRecord = true;
      saveHighScore(highScore);
    }
  }

  Render.draw(ctx, state, { paused: paused, highScore: highScore, newRecord: newRecord });
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
