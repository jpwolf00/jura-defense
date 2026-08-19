// Synthesized SFX via Web Audio — no external files, works offline.
// Lazily creates the AudioContext on first user gesture (required by browsers).

let actx = null;
let master = null;
let muted = false;

function ensure() {
  if (actx) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  actx = new AC();
  master = actx.createGain();
  master.gain.value = 0.35;
  master.connect(actx.destination);
}

export function resumeAudio() {
  ensure();
  if (actx && actx.state === 'suspended') actx.resume();
}

export function setMuted(m) { muted = m; }
export function isMuted() { return muted; }

// One-shot oscillator/impulse helper.
function tone({ freq = 440, end = freq, type = 'sine', dur = 0.1, gain = 0.5,
                slide = 0, delay = 0 }) {
  if (!actx || muted) return;
  const t0 = actx.currentTime + delay;
  const osc = actx.createOscillator();
  const g = actx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slide > 0) osc.frequency.linearRampToValueAtTime(end, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g);
  g.connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function noise({ dur = 0.3, gain = 0.4, delay = 0, lowpass = 1200 }) {
  if (!actx || muted) return;
  const t0 = actx.currentTime + delay;
  const n = actx.createBufferSource();
  const frames = Math.floor(actx.sampleRate * dur);
  const buf = actx.createBuffer(1, frames, actx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < frames; i++) d[i] = Math.random() * 2 - 1;
  n.buffer = buf;
  const f = actx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = lowpass;
  const g = actx.createGain();
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  n.connect(f); f.connect(g); g.connect(master);
  n.start(t0);
  n.stop(t0 + dur);
}

export function fire(kind) {
  if (kind === 'aoe') { tone({ freq: 180, end: 90, type: 'square', dur: 0.12, gain: 0.25 }); return; }
  tone({ freq: 520, end: 320, type: 'triangle', dur: 0.08, gain: 0.18 });
}
export function hit() { tone({ freq: 220, end: 140, type: 'sawtooth', dur: 0.05, gain: 0.1 }); }
export function kill() { tone({ freq: 340, end: 620, type: 'square', dur: 0.14, gain: 0.16 }); }
export function coin() { tone({ freq: 880, type: 'square', dur: 0.06, gain: 0.14 }); tone({ freq: 1320, type: 'square', dur: 0.08, gain: 0.12, delay: 0.05 }); }
export function leak() { tone({ freq: 160, end: 70, type: 'sawtooth', dur: 0.35, gain: 0.3 }); }
export function place() { tone({ freq: 240, end: 360, type: 'triangle', dur: 0.1, gain: 0.2 }); }
export function upgrade() { tone({ freq: 440, type: 'square', dur: 0.06, gain: 0.18 }); tone({ freq: 660, type: 'square', dur: 0.08, gain: 0.16, delay: 0.06 }); }
export function sell() { tone({ freq: 400, end: 200, type: 'triangle', dur: 0.15, gain: 0.2 }); }
export function waveStart() { tone({ freq: 200, end: 320, type: 'sawtooth', dur: 0.25, gain: 0.22 }); }
export function waveClear() { [523, 659, 784].forEach((f, i) => tone({ freq: f, type: 'triangle', dur: 0.16, gain: 0.18, delay: i * 0.1 })); }
export function meteor() { noise({ dur: 0.6, gain: 0.5, lowpass: 700 }); tone({ freq: 90, end: 40, type: 'sawtooth', dur: 0.6, gain: 0.35 }); }
export function rewind() {
  // whooshing time-reversal: rising shimmer + descending ring
  tone({ freq: 180, end: 900, type: 'sine', dur: 0.5, gain: 0.22 });
  tone({ freq: 1400, end: 300, type: 'triangle', dur: 0.7, gain: 0.16, delay: 0.05 });
  noise({ dur: 0.7, gain: 0.12, lowpass: 2400 });
}
export function error() { tone({ freq: 140, type: 'square', dur: 0.12, gain: 0.2 }); }
export function win() { [523, 659, 784, 1046].forEach((f, i) => tone({ freq: f, type: 'triangle', dur: 0.2, gain: 0.2, delay: i * 0.12 })); }
export function lose() { [330, 262, 196, 131].forEach((f, i) => tone({ freq: f, type: 'sawtooth', dur: 0.25, gain: 0.22, delay: i * 0.14 })); }
