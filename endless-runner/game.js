// game.js — game STATE and UPDATE LOGIC only.
// Rule for this file: it must never touch the canvas, the DOM, or the clock.
// That's what lets an AI agent (or a Node test) run the game headlessly later.

const Game = (function () {
  // All tunable numbers live in one place so they're easy to experiment with.
  // Units: pixels and seconds. y grows DOWNWARD, so "up" is negative velocity.
  const CONFIG = {
    WIDTH: 800,
    HEIGHT: 300,
    GROUND_Y: 240,
    STEP: 1 / 60,
    START_SPEED: 300,
    TICK_SPACING: 40,

    PLAYER_X: 80,
    PLAYER_W: 40,
    PLAYER_H: 50,
    DUCK_H: 26,          // shorter hitbox while ducking
    HITBOX_INSET: 3,     // player's hitbox is this many px smaller on each side

    GRAVITY: 1800,
    JUMP_SPEED: 760,
    CUT_GRAVITY_MULT: 3, // released jump early -> stronger gravity while rising
    FAST_FALL_MULT: 3,   // holding Down in the air -> stronger gravity

    // Obstacles
    OBSTACLE_MIN_W: 20,
    OBSTACLE_MAX_W: 40,
    OBSTACLE_MIN_H: 30,
    OBSTACLE_MAX_H: 50,
    FIRST_SPAWN_DELAY: 1.5,
    SPAWN_MIN: 0.9,
    SPAWN_MAX: 1.8,

    // Flying obstacles. Their BOTTOM edge is AIR_BOTTOM_OFFSET px above the
    // ground: that's lower than a standing player's head (50 px) but higher
    // than a ducking player's head (26 px), so you must duck (or jump very high).
    AIR_CHANCE: 0.3,         // probability that a spawn is a flying obstacle
    AIR_MIN_W: 34,
    AIR_MAX_W: 50,
    AIR_H: 60,
    AIR_BOTTOM_OFFSET: 34,

    RESTART_DELAY: 0.5,      // seconds after death before restart is allowed
  };

  // ---- Seeded random numbers (mulberry32) ----------------------------------
  function random(state) {
    state.rng = (state.rng + 0x6D2B79F5) | 0;
    let t = state.rng;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  function randomRange(state, min, max) {
    return min + random(state) * (max - min);
  }

  function createState(seed) {
    return {
      rng: seed === undefined ? 12345 : seed | 0,
      time: 0,                 // seconds survived (stops when you die)
      speed: CONFIG.START_SPEED,
      groundOffset: 0,
      player: {
        x: CONFIG.PLAYER_X,
        y: CONFIG.GROUND_Y - CONFIG.PLAYER_H,
        w: CONFIG.PLAYER_W,
        h: CONFIG.PLAYER_H,
        vy: 0,
        onGround: true,
        ducking: false,
      },
      prevJumpHeld: false,
      obstacles: [],           // each: { x, y, w, h, type, passed }
      spawnTimer: CONFIG.FIRST_SPAWN_DELAY,
      spawnedCount: 0,
      score: 0,                // obstacles successfully passed
      gameOver: false,
      deadTime: 0,             // seconds since dying
    };
  }

  function spawnObstacle(state) {
    const C = CONFIG;
    const isAir = random(state) < C.AIR_CHANCE;
    let w, h, y;
    if (isAir) {
      w = randomRange(state, C.AIR_MIN_W, C.AIR_MAX_W);
      h = C.AIR_H;
      y = C.GROUND_Y - C.AIR_BOTTOM_OFFSET - h; // y is the TOP edge
    } else {
      w = randomRange(state, C.OBSTACLE_MIN_W, C.OBSTACLE_MAX_W);
      h = randomRange(state, C.OBSTACLE_MIN_H, C.OBSTACLE_MAX_H);
      y = C.GROUND_Y - h;
    }
    state.obstacles.push({
      x: C.WIDTH, y: y, w: w, h: h,
      type: isAir ? 'air' : 'ground',
      passed: false,
    });
    state.spawnedCount++;
  }

  // ---- AABB collision -------------------------------------------------------
  // Two axis-aligned rectangles overlap only if they overlap on BOTH axes.
  // Easiest to think of it the other way round: they do NOT overlap if one is
  // completely left of, right of, above, or below the other.
  function overlaps(a, b) {
    return a.x < b.x + b.w &&
           a.x + a.w > b.x &&
           a.y < b.y + b.h &&
           a.y + a.h > b.y;
  }

  // The player's hitbox is slightly smaller than the drawn rectangle so that
  // near-misses feel fair rather than "I didn't even touch it!".
  function playerHitbox(p) {
    const i = CONFIG.HITBOX_INSET;
    return { x: p.x + i, y: p.y + i, w: p.w - 2 * i, h: p.h - 2 * i };
  }

  // input = { jumpHeld: boolean, duckHeld: boolean }
  function update(state, input, dt) {
    const C = CONFIG;
    const p = state.player;

    // Dead: freeze the world, just count how long we've been dead.
    if (state.gameOver) {
      state.deadTime += dt;
      return;
    }

    state.time += dt;
    state.groundOffset = (state.groundOffset + state.speed * dt) % C.TICK_SPACING;

    // ---- Jump start (edge detection) --------------------------------------
    const jumpPressed = input.jumpHeld && !state.prevJumpHeld;
    state.prevJumpHeld = input.jumpHeld;
    if (jumpPressed && p.onGround) {
      p.vy = -C.JUMP_SPEED;
      p.onGround = false;
    }

    // ---- Ducking ----------------------------------------------------------
    // You can only duck while standing on the ground. Ducking just means a
    // shorter hitbox. We keep the player's FEET fixed (bottom = y + h) and
    // change the height, so the top edge drops.
    p.ducking = p.onGround && input.duckHeld;
    const bottom = p.y + p.h;
    p.h = p.ducking ? C.DUCK_H : C.PLAYER_H;
    p.y = bottom - p.h;

    // ---- Gravity ----------------------------------------------------------
    // Normally C.GRAVITY. Two things can strengthen it:
    //   - released jump key while still rising (shorter jump)
    //   - Down held in the air (fast-fall)
    // If both apply we take the larger one rather than multiplying them.
    let mult = 1;
    if (p.vy < 0 && !input.jumpHeld) mult = C.CUT_GRAVITY_MULT;
    if (!p.onGround && input.duckHeld) mult = Math.max(mult, C.FAST_FALL_MULT);

    p.vy += C.GRAVITY * mult * dt;
    p.y += p.vy * dt;

    const standingY = C.GROUND_Y - p.h;
    if (p.y >= standingY) {
      p.y = standingY;
      p.vy = 0;
      p.onGround = true;
    }

    // ---- Spawn ------------------------------------------------------------
    state.spawnTimer -= dt;
    if (state.spawnTimer <= 0) {
      spawnObstacle(state);
      state.spawnTimer += randomRange(state, C.SPAWN_MIN, C.SPAWN_MAX);
    }

    // ---- Move obstacles, score, remove ------------------------------------
    for (let i = state.obstacles.length - 1; i >= 0; i--) {
      const o = state.obstacles[i];
      o.x -= state.speed * dt;

      // Score: +1 the moment an obstacle is completely behind the player.
      // The `passed` flag makes sure each obstacle only counts once.
      if (!o.passed && o.x + o.w < p.x) {
        o.passed = true;
        state.score++;
      }

      if (o.x + o.w < 0) state.obstacles.splice(i, 1);
    }

    // ---- Collision --------------------------------------------------------
    const hit = playerHitbox(p);
    for (const o of state.obstacles) {
      if (overlaps(hit, o)) {
        state.gameOver = true;
        state.deadTime = 0;
        break;
      }
    }
  }

  return { CONFIG, createState, update, overlaps, playerHitbox };
})();

if (typeof module !== 'undefined') module.exports = Game;
