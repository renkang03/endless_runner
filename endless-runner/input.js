// input.js — turns keyboard/touch events into a simple input object.
//
// The game's update() never listens for events. It is handed a plain snapshot:
//   { jumpHeld: boolean, duckHeld: boolean }
// An AI agent will later produce the same kind of object.

const Input = (function () {
  const JUMP_KEYS = new Set(['Space', 'ArrowUp']);

  // `target` is the element that receives touch/mouse presses (the canvas).
  function create(target) {
    const input = {
      jumpHeld: false,
      duckHeld: false,   // wired up now, used in Milestone 6
      consume: consume,
    };

    let keyJump = false;     // is a jump key physically down?
    let pointerJump = false; // is a finger/mouse physically down?
    let tapPending = false;  // a press happened that no update() has seen yet

    // jumpHeld = "down right now" OR "pressed and not yet seen by the game".
    // Why the second part? A very quick tap (down+up in under 16 ms) could
    // otherwise happen entirely BETWEEN two update steps and be missed.
    function refresh() {
      input.jumpHeld = keyJump || pointerJump || tapPending;
    }

    // Called by the game loop after each update(): the game has now seen the press.
    function consume() {
      tapPending = false;
      refresh();
    }

    window.addEventListener('keydown', function (e) {
      if (JUMP_KEYS.has(e.code)) {
        e.preventDefault(); // stop Space/Up from scrolling the page
        if (!keyJump) tapPending = true; // ignore OS key-repeat events
        keyJump = true;
        refresh();
      } else if (e.code === 'ArrowDown') {
        e.preventDefault();
        input.duckHeld = true;
      }
    });

    window.addEventListener('keyup', function (e) {
      if (JUMP_KEYS.has(e.code)) {
        keyJump = false;
        refresh();
      } else if (e.code === 'ArrowDown') {
        input.duckHeld = false;
      }
    });

    // Touch / mouse: pressing the canvas = jump, releasing = let go.
    target.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      pointerJump = true;
      tapPending = true;
      refresh();
    });
    window.addEventListener('pointerup', function () { pointerJump = false; refresh(); });
    window.addEventListener('pointercancel', function () { pointerJump = false; refresh(); });

    // If the window loses focus while a key is down, we'd never get the keyup.
    window.addEventListener('blur', function () {
      keyJump = false; pointerJump = false; tapPending = false;
      input.duckHeld = false;
      refresh();
    });

    return input;
  }

  return { create };
})();
