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
    START_SPEED: 300,    // world scroll speed at the start, px/s
    MAX_SPEED: 700,      // speed stops increasing here
    ACCELERATION: 6,     // px/s gained every second (300 -> 700 takes ~67 s)
    PX_PER_POINT: 30,    // distance needed for 1 score point (300 px/s = 10 pts/s)
    TICK_SPACING: 40,

    PLAYER_X: 80,
    PLAYER_W: 40,
    PLAYER_H: 50,
    DUCK_H: 25,          // shorter hitbox while ducking
    HITBOX_INSET: 3,     // player's hitbox is this many px smaller on each side

    GRAVITY: 1800,
    JUMP_SPEED: 760,
    CUT_GRAVITY_MULT: 3, // released jump early -> stronger gravity while rising
    FAST_FALL_MULT: 3,   // holding Down in the air -> stronger gravity

    // ---- Obstacles -----------------------------------------------------------
    FIRST_SPAWN_DELAY: 1.5,
    SPAWN_MIN: 0.9,
    SPAWN_MAX: 1.8,
    OFFSCREEN_MARGIN: 60,    // obstacles are removed this far past the left edge
                             // (so wings and such are fully gone before deletion)

    // Stone blocks: stacks of BLOCK x BLOCK squares, like Minecraft.
    BLOCK: 20,
    GROUND_MAX_COLS: 2,      // 1-2 blocks wide
    GROUND_MAX_ROWS: 3,      // 1-3 blocks tall (20, 40 or 60 px)

    // Flying obstacles. Their BOTTOM edge is AIR_BOTTOM_OFFSET px above the
    // ground: lower than a standing player's head (50 px) but higher than a
    // ducking player's head (25 px), so you must duck.
    AIR_BOTTOM_OFFSET: 34,

    // Bird: small, so a full-height jump can clear it (but ducking is easier).
    AIR_CHANCE: 0.28,        // probability that a spawn is a bird
    BIRD_W: 48,
    BIRD_H: 36,

    // Dragon: so tall that no jump can clear it, and its bottom is at the same
    // height as the bird's. The ONLY way past is to duck.
    // (The tallest jump lifts your feet 154 px; the dragon's top is 184 px up.)
    DRAGON_CHANCE: 0.14,
    DRAGON_W: 60,            // the hitbox; the wings are drawn wider, for show
    DRAGON_H: 150,
    DRAGON_MIN_SCORE: 150,   // dragons only appear once you've warmed up
    DRAGON_SPAWN_PAD: 48,    // spawn this far off-screen so the wings slide in

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
      obstacles: [],           // each: { type: 'stone'|'bird'|'dragon', x, y, w, h }
      spawnTimer: CONFIG.FIRST_SPAWN_DELAY,
      spawnedCount: 0,
      distance: 0,             // total pixels travelled
      score: 0,                // derived from distance (whole points)
      gameOver: false,
      deadTime: 0,             // seconds since dying

      // Things that happened during the most recent update() step, as plain
      // strings: 'jump', 'land', 'die', 'milestone'. update() empties this at
      // the start of every step, so read it after each step. The game never
      // plays sounds itself; main.js reads these and decides what to do.
      events: [],
    };
  }

  function spawnObstacle(state) {
    const C = CONFIG;
    // One random number picks the kind. The ranges are stacked:
    //   [0, AIR_CHANCE)                       -> bird
    //   [AIR_CHANCE, AIR+DRAGON_CHANCE)       -> dragon (if unlocked)
    //   everything else                       -> stone blocks
    const roll = random(state);
    let obstacle;

    if (roll < C.AIR_CHANCE) {
      obstacle = {
        type: 'bird',
        x: C.WIDTH,
        w: C.BIRD_W,
        h: C.BIRD_H,
        y: C.GROUND_Y - C.AIR_BOTTOM_OFFSET - C.BIRD_H, // y is the TOP edge
      };
    } else if (roll < C.AIR_CHANCE + C.DRAGON_CHANCE && state.score >= C.DRAGON_MIN_SCORE) {
      obstacle = {
        type: 'dragon',
        x: C.WIDTH + C.DRAGON_SPAWN_PAD,
        w: C.DRAGON_W,
        h: C.DRAGON_H,
        y: C.GROUND_Y - C.AIR_BOTTOM_OFFSET - C.DRAGON_H,
      };
    } else {
      // A wall of 1-2 x 1-3 stone blocks. `variant` picks which texture each
      // block uses (the renderer's business, but chosen here so it's stable).
      const cols = 1 + Math.floor(random(state) * C.GROUND_MAX_COLS);
      const rows = 1 + Math.floor(random(state) * C.GROUND_MAX_ROWS);
      obstacle = {
        type: 'stone',
        x: C.WIDTH,
        w: cols * C.BLOCK,
        h: rows * C.BLOCK,
        y: C.GROUND_Y - rows * C.BLOCK,
        variant: Math.floor(random(state) * 3),
      };
    }

    state.obstacles.push(obstacle);
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

    state.events = []; // forget last step's events

    // Dead: freeze the world, just count how long we've been dead.
    if (state.gameOver) {
      state.deadTime += dt;
      return;
    }

    state.time += dt;

    // ---- Speed ramp, distance and score ------------------------------------
    // Speed grows by a constant amount per second (a constant acceleration)
    // until it hits MAX_SPEED. Distance is speed accumulated over time
    // (distance += speed * dt), and score is just distance in bigger units.
    // So the faster you go, the faster your score climbs.
    const prevScore = state.score;
    state.speed = Math.min(C.MAX_SPEED, state.speed + C.ACCELERATION * dt);
    state.distance += state.speed * dt;
    state.score = Math.floor(state.distance / C.PX_PER_POINT);

    // Every 100 points: tell the outside world (it plays a little chime).
    if (Math.floor(state.score / 100) > Math.floor(prevScore / 100)) {
      state.events.push('milestone');
    }

    state.groundOffset = (state.groundOffset + state.speed * dt) % C.TICK_SPACING;

    // ---- Jump start (edge detection) --------------------------------------
    const wasAirborne = !p.onGround; // remembered so we can detect landing below
    const jumpPressed = input.jumpHeld && !state.prevJumpHeld;
    state.prevJumpHeld = input.jumpHeld;
    if (jumpPressed && p.onGround) {
      p.vy = -C.JUMP_SPEED;
      p.onGround = false;
      state.events.push('jump');
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
      if (wasAirborne) state.events.push('land'); // was in the air, now isn't
    }

    // ---- Spawn ------------------------------------------------------------
    state.spawnTimer -= dt;
    if (state.spawnTimer <= 0) {
      spawnObstacle(state);
      state.spawnTimer += randomRange(state, C.SPAWN_MIN, C.SPAWN_MAX);
    }

    // ---- Move obstacles, remove the ones that left the screen --------------
    for (let i = state.obstacles.length - 1; i >= 0; i--) {
      const o = state.obstacles[i];
      o.x -= state.speed * dt;
      if (o.x + o.w < -C.OFFSCREEN_MARGIN) state.obstacles.splice(i, 1);
    }

    // ---- Collision --------------------------------------------------------
    const hit = playerHitbox(p);
    for (const o of state.obstacles) {
      if (overlaps(hit, o)) {
        state.gameOver = true;
        state.deadTime = 0;
        state.events.push('die');
        break;
      }
    }
  }

  return { CONFIG, createState, update, overlaps, playerHitbox };
})();

if (typeof module !== 'undefined') module.exports = Game;
