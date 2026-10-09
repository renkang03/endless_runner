// game.js — game STATE and UPDATE LOGIC only.
// Rule for this file: it must never touch the canvas, the DOM, or the clock.
// That's what lets an AI agent (or a Node test) run the game headlessly later.

const Game = (function () {
  // All tunable numbers live in one place so they're easy to experiment with.
  // Units: pixels and seconds. y grows DOWNWARD, so "up" is negative velocity.
  const CONFIG = {
    WIDTH: 800,
    HEIGHT: 300,
    GROUND_Y: 240,       // y-coordinate of the ground line
    STEP: 1 / 60,        // fixed timestep in seconds
    START_SPEED: 300,    // world scroll speed, pixels per second
    TICK_SPACING: 40,    // distance between the little marks on the ground

    PLAYER_X: 80,
    PLAYER_W: 40,
    PLAYER_H: 50,

    GRAVITY: 1800,       // px/s^2, pulls the player down
    JUMP_SPEED: 760,     // px/s, initial upward speed at takeoff
    CUT_GRAVITY_MULT: 3, // gravity multiplier when you let go while still rising
  };

  function createState() {
    return {
      time: 0,
      speed: CONFIG.START_SPEED,
      groundOffset: 0,
      player: {
        x: CONFIG.PLAYER_X,
        y: CONFIG.GROUND_Y - CONFIG.PLAYER_H, // y of the player's TOP edge
        w: CONFIG.PLAYER_W,
        h: CONFIG.PLAYER_H,
        vy: 0,           // vertical velocity, px/s (negative = moving up)
        onGround: true,
      },
      prevJumpHeld: false, // last step's jump input, used to detect a fresh press
    };
  }

  // Advance the game by exactly `dt` seconds.
  //   input = { jumpHeld: boolean, duckHeld: boolean }
  function update(state, input, dt) {
    const C = CONFIG;
    const p = state.player;

    state.time += dt;
    state.groundOffset = (state.groundOffset + state.speed * dt) % C.TICK_SPACING;

    // ---- Jump start -------------------------------------------------------
    // A jump begins on the step where the key goes from NOT held to held
    // (an "edge"). Without this, holding Space would re-jump the instant you
    // land. Only allowed while standing on the ground (no double jumps).
    const jumpPressed = input.jumpHeld && !state.prevJumpHeld;
    state.prevJumpHeld = input.jumpHeld;

    if (jumpPressed && p.onGround) {
      p.vy = -C.JUMP_SPEED;
      p.onGround = false;
    }

    // ---- Variable jump height ---------------------------------------------
    // While rising, if the player has let go of the key, pull gravity harder.
    // The upward speed bleeds off faster, so the jump peaks lower.
    // Holding the key keeps normal gravity -> higher jump.
    let gravity = C.GRAVITY;
    if (p.vy < 0 && !input.jumpHeld) gravity *= C.CUT_GRAVITY_MULT;

    // ---- Integrate motion (semi-implicit Euler) ---------------------------
    // Update velocity FIRST, then position using the new velocity.
    // acceleration -> velocity -> position, each multiplied by dt.
    p.vy += gravity * dt;
    p.y += p.vy * dt;

    // ---- Ground collision -------------------------------------------------
    const standingY = C.GROUND_Y - p.h;
    if (p.y >= standingY) {
      p.y = standingY; // snap exactly onto the ground (no sinking in)
      p.vy = 0;
      p.onGround = true;
    }
  }

  return { CONFIG, createState, update };
})();

if (typeof module !== 'undefined') module.exports = Game;
