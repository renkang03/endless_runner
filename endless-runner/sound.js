// sound.js — sound effects, generated with the Web Audio API (no audio files).
//
// Each effect is a short "beep" from an oscillator: a pitch that glides from
// one frequency to another while its volume fades out. Square waves sound
// 8-bit, triangle waves are soft, sawtooth waves are buzzy.
//
// This file knows nothing about the game. main.js reads events from the game
// state ('jump', 'land', 'die', 'milestone') and calls Sound.play(name).

const Sound = (function () {
  const MUTE_KEY = 'endlessRunner.muted';

  let audioCtx = null;
  let muted = loadMuted();

  function loadMuted() {
    try { return localStorage.getItem(MUTE_KEY) === '1'; } catch (e) { return false; }
  }

  function saveMuted() {
    try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch (e) { /* ignore */ }
  }

  // Browsers refuse to make sound until the user has pressed a key or clicked.
  // main.js calls unlock() from those events, which creates (or wakes up) the
  // audio context. Everything else just returns quietly until then.
  function unlock() {
    if (audioCtx && audioCtx.state === 'running') return;
    try {
      if (!audioCtx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        audioCtx = new AC();
      }
      if (audioCtx.state === 'suspended') audioCtx.resume();
    } catch (e) { /* no audio available: the game just stays silent */ }
  }

  // Play one beep.
  //   from / to : starting and ending pitch in Hz (the glide)
  //   duration  : seconds
  //   type      : 'square' | 'triangle' | 'sawtooth' | 'sine'
  //   volume    : 0..1 (keep it low, these are harsh sounds)
  //   delay     : seconds from now, so several beeps can form a little tune
  function tone(from, to, duration, type, volume, delay) {
    if (muted || !audioCtx || audioCtx.state !== 'running') return;
    const t0 = audioCtx.currentTime + (delay || 0);

    const osc = audioCtx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t0);
    osc.frequency.exponentialRampToValueAtTime(to, t0 + duration); // pitch glide

    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(volume, t0);
    // Fade to (almost) silence. Without the fade you'd hear a click when the
    // oscillator stops abruptly. (Exponential ramps can't reach exactly 0.)
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  const effects = {
    jump:      function () { tone(300, 640, 0.12, 'square', 0.06); },       // quick rising blip
    land:      function () { tone(140, 60, 0.07, 'triangle', 0.12); },      // soft low thud
    die:       function () { tone(320, 40, 0.5, 'sawtooth', 0.10); },       // long falling buzz
    milestone: function () {                                                // two-note chime
      tone(660, 660, 0.08, 'square', 0.05);
      tone(880, 880, 0.14, 'square', 0.05, 0.09);
    },
  };

  function play(name) {
    const effect = effects[name];
    if (effect) effect();
  }

  function toggleMute() {
    muted = !muted;
    saveMuted();
    return muted;
  }

  function isMuted() { return muted; }

  return { unlock, play, toggleMute, isMuted };
})();
