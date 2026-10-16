// test.js — headless checks for the game rules. Run with:  node test.js
//
// No test framework: each check prints PASS/FAIL and the script exits with
// code 1 if anything failed. game.js has no DOM, so it runs as-is in Node.

const Game = require('./game.js');
global.Game = Game;                 // render.js expects Game as a global
const Render = require('./render.js');
const C = Game.CONFIG;

let failures = 0;
function check(name, ok) {
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name);
  if (!ok) failures++;
}

// ---- Obstacle builders (same shapes spawnObstacle makes) --------------------
function stone(cols, rows) {
  return { type: 'stone', w: cols * C.BLOCK, h: rows * C.BLOCK, y: C.GROUND_Y - rows * C.BLOCK, variant: 0 };
}
function bird() {
  return { type: 'bird', w: C.BIRD_W, h: C.BIRD_H, y: C.GROUND_Y - C.AIR_BOTTOM_OFFSET - C.BIRD_H };
}
function dragon() {
  return { type: 'dragon', w: C.DRAGON_W, h: C.DRAGON_H, y: C.GROUND_Y - C.AIR_BOTTOM_OFFSET - C.DRAGON_H };
}

const KINDS = { bird: bird(), dragon: dragon() };
for (let c = 1; c <= C.GROUND_MAX_COLS; c++) {
  for (let r = 1; r <= C.GROUND_MAX_ROWS; r++) KINDS['stone' + c + 'x' + r] = stone(c, r);
}

// A course at top speed with the given obstacles placed `gap` px apart
// (leading edge to leading edge), and no random spawning.
function course(list, gap) {
  const s = Game.createState(1);
  s.speed = C.MAX_SPEED;
  s.spawnTimer = Infinity;
  let x = C.PLAYER_X + 250;
  for (const o of list) {
    s.obstacles.push(Object.assign({}, o, { x: x }));
    x += gap;
  }
  return s;
}

function cleared(s) {
  return s.obstacles.every(function (o) { return o.x + o.w < C.PLAYER_X - 10; });
}

// ---- Planner ------------------------------------------------------------------
// Depth-first search over inputs: every DECIDE steps, pick jump / nothing /
// duck. States already seen (same step, position, speed) are skipped, so the
// search stays small. Returns true if ANY input sequence survives the course.
const DECIDE = 2;
function survivable(start, actions) {
  const seen = new Set();
  function go(s, step) {
    if (s.gameOver) return false;
    if (cleared(s)) return true;
    if (step > 600) return false;
    const p = s.player;
    const key = step + ':' + Math.round(p.y) + ':' + Math.round(p.vy / 20) + ':' + p.onGround + ':' + s.prevJumpHeld;
    if (seen.has(key)) return false;
    seen.add(key);
    for (const a of actions) {
      const next = structuredClone(s);
      for (let i = 0; i < DECIDE && !next.gameOver; i++) Game.update(next, a, C.STEP);
      if (go(next, step + DECIDE)) return true;
    }
    return false;
  }
  return go(start, 0);
}

const JUMP = { jumpHeld: true, duckHeld: false };
const IDLE = { jumpHeld: false, duckHeld: false };
const DUCK = { jumpHeld: false, duckHeld: true };
const ALL = [JUMP, IDLE, DUCK];

function holdFor(s, input, steps) {
  for (let i = 0; i < steps && !s.gameOver; i++) Game.update(s, input, C.STEP);
  return s;
}

// ---- 1. Every pair is survivable at max speed and the minimum gap -------------
const minGapPx = C.MIN_GAP * C.MAX_SPEED;
const names = Object.keys(KINDS);
const stuck = [];
for (const a of names) {
  for (const b of names) {
    if (!survivable(course([KINDS[a], KINDS[b]], minGapPx), ALL)) stuck.push(a + ' -> ' + b);
  }
}
check('all ' + names.length * names.length + ' obstacle pairs survivable at ' + C.MAX_SPEED +
      ' px/s with a ' + Math.round(minGapPx) + ' px gap' + (stuck.length ? ' (stuck: ' + stuck.join(', ') + ')' : ''),
      stuck.length === 0);

// ---- 2. Dragons can't be jumped, only ducked ---------------------------------
check('dragon cannot be passed with jumping alone', !survivable(course([dragon()], 0), [JUMP, IDLE]));
check('holding duck passes a dragon', !holdFor(course([dragon()], 0), DUCK, 300).gameOver);
check('standing still under a dragon dies (its tail)', holdFor(course([dragon()], 0), IDLE, 300).gameOver);

// ---- 3. Birds: duck under or jump over, but don't stand there -----------------
check('holding duck passes a bird', !holdFor(course([bird()], 0), DUCK, 300).gameOver);
check('a bird can be jumped', survivable(course([bird()], 0), [JUMP, IDLE]));
check('standing still into a bird dies', holdFor(course([bird()], 0), IDLE, 300).gameOver);

// ---- 4. Hitboxes match the art ------------------------------------------------
// Every painted dragon pixel (both wing frames) must sit inside a hitbox, so
// nothing you can see is harmless. And the dragon must keep at least the 24 px
// of clear air under its feet that this hitbox change exists to respect.
const d = Object.assign(dragon(), { x: 0, y: 0 });
const boxes = Game.obstacleHitboxes(d);
const px = d.h / Render.art.dragon.up.length;
let uncovered = 0;
for (const frame of ['up', 'down']) {
  Render.art.dragon[frame].forEach(function (row, ry) {
    for (let cx = 0; cx < row.length; cx++) {
      if (row[cx] === '.') continue;
      const mx = cx * px + px / 2, my = ry * px + px / 2;
      if (!boxes.some(function (b) { return mx > b.x && mx < b.x + b.w && my > b.y && my < b.y + b.h; })) uncovered++;
    }
  });
}
check('every painted dragon pixel is inside a dragon hitbox', uncovered === 0);
const body = boxes[0];
check('dragon body hitbox stops 24 px above the sprite bottom', d.y + d.h - (body.y + body.h) === 24);

// The bird's hitbox must be the solid body rows: fully painted in BOTH frames.
const bb = Game.obstacleHitboxes(Object.assign(bird(), { x: 0, y: 0 }))[0];
const bpx = C.BIRD_H / Render.art.bird.up.length;
const firstRow = bb.y / bpx, lastRow = (bb.y + bb.h) / bpx - 1;
let bodyPainted = true;
for (const frame of ['up', 'down']) {
  for (let r = firstRow; r <= lastRow; r++) {
    if (!/[^.]/.test(Render.art.bird[frame][r])) bodyPainted = false;
  }
}
check('bird hitbox only spans rows painted in both wing frames', bodyPainted);

console.log(failures ? '\n' + failures + ' check(s) failed' : '\nAll checks passed');
process.exit(failures ? 1 : 0);
