// input.js — turns keyboard/touch events into a simple input object.
//
// The game's update() never listens for events. It is handed a plain snapshot:
//   { jumpHeld: boolean, duckHeld: boolean }
// An AI agent will later produce the same kind of object.
//
// Two kinds of input live here:
//   - HELD state (jumpHeld, duckHeld): "is the key down right now?"
//   - ONE-SHOT events (takePress, takePause): "was it pressed since I last
//     asked?" Used for things like pause and restart, which are not part of
//     the game simulation itself.

const Input = (function () {
  const JUMP_KEYS = new Set(['Space', 'ArrowUp']);
  const PRESS_KEYS = new Set(['Space', 'ArrowUp', 'Enter']); // also restart the game
  const PAUSE_KEYS = new Set(['KeyP', 'Escape']);

  function create(target) {
    const input = {
      jumpHeld: false,
      duckHeld: false,
      consume: consume,
      takePress: takePress,
      takePause: takePause,
    };

    let keyJump = false;      // is a jump key physically down?
    let pointerJump = false;  // is a finger/mouse physically down?
    let tapPending = false;   // a press happened that no update() has seen yet
    let pressPending = false; // one-shot: "a press happened" (for restart)
    let pausePending = false; // one-shot: "pause was pressed"

    // jumpHeld = "down right now" OR "pressed and not yet seen by the game".
    // A very quick tap could otherwise start and end between two update steps.
    function refresh() {
      input.jumpHeld = keyJump || pointerJump || tapPending;
    }

    function consume() {
      tapPending = false;
      refresh();
    }

    // Return true once per press, then reset.
    function takePress() { const v = pressPending; pressPending = false; return v; }
    function takePause() { const v = pausePending; pausePending = false; return v; }

    window.addEventListener('keydown', function (e) {
      if (JUMP_KEYS.has(e.code)) {
        e.preventDefault(); // stop Space/Up from scrolling the page
        if (!keyJump) tapPending = true;
        keyJump = true;
        refresh();
      } else if (e.code === 'ArrowDown') {
        e.preventDefault();
        input.duckHeld = true;
      }
      if (!e.repeat) { // ignore the OS repeating a held key
        if (PRESS_KEYS.has(e.code)) pressPending = true;
        if (PAUSE_KEYS.has(e.code)) pausePending = true;
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
      pressPending = true;
      refresh();
    });
    window.addEventListener('pointerup', function () { pointerJump = false; refresh(); });
    window.addEventListener('pointercancel', function () { pointerJump = false; refresh(); });

    // If the window loses focus while a key is down we'd never get the keyup.
    window.addEventListener('blur', function () {
      keyJump = false; pointerJump = false; tapPending = false;
      input.duckHeld = false;
      refresh();
    });

    return input;
  }

  return { create };
})();
