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
    let keyDuck = false;      // is the Down key physically down?
    // Every finger/mouse button currently down, by pointerId -> 'jump' | 'duck'.
    // A map (not one flag) so two thumbs can jump and duck at the same time.
    const pointers = new Map();
    let tapPending = false;   // a press happened that no update() has seen yet
    let pressPending = false; // one-shot: "a press happened" (for restart)
    let pausePending = false; // one-shot: "pause was pressed"

    function pointersDoing(action) {
      for (const a of pointers.values()) if (a === action) return true;
      return false;
    }

    // jumpHeld = "down right now" OR "pressed and not yet seen by the game".
    // A very quick tap could otherwise start and end between two update steps.
    function refresh() {
      input.jumpHeld = keyJump || pointersDoing('jump') || tapPending;
      input.duckHeld = keyDuck || pointersDoing('duck');
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
        keyDuck = true;
        refresh();
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
        keyDuck = false;
        refresh();
      }
    });

    // Touch: left half of the screen = jump, right half = duck (hold it).
    // Mouse: a click anywhere = jump, since a mouse player has the keyboard too.
    // Any press also counts as a one-shot press (start, resume, restart).
    target.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      const isTouch = e.pointerType === 'touch' || e.pointerType === 'pen';
      const action = isTouch && e.clientX >= window.innerWidth / 2 ? 'duck' : 'jump';
      pointers.set(e.pointerId, action);
      if (action === 'jump') tapPending = true;
      pressPending = true;
      refresh();
    });
    function release(e) { pointers.delete(e.pointerId); refresh(); }
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);

    // If the window loses focus while a key is down we'd never get the keyup.
    window.addEventListener('blur', function () {
      keyJump = false; keyDuck = false; tapPending = false;
      pointers.clear();
      refresh();
    });

    return input;
  }

  return { create };
})();
