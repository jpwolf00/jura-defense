/**
 * Phaser plugin: AudioSystem
 *
 * Web Audio API synthesizer with priority-based channel mixing.
 * AudioContext is lazy-initialised on first user interaction.
 * Supports global mute, per-channel volume control.
 */
import Phaser from 'phaser';

// Channel volumes (0–1)
const CHANNELS = {
  tower: 0.6,
  combat: 0.5,
  fx: 0.5,
  ui: 0.8,
};

export default class AudioSystem extends Phaser.Plugins.BasePlugin {
  constructor(scene) {
    super(scene);
    this._ctx = null;
    this._muted = false;
    this._throttleMs = 40;
    this._lastPlay = -Infinity;
  }

  /* ── AudioContext bootstrap ─────────────────────────────────────── */

  _getContext() {
    if (!this._ctx) {
      this._ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this._ctx.state === 'suspended') {
      this._ctx.resume();
    }
    return this._ctx;
  }

  /** Play a synthesized sound by key. */
  play(key, _volume) {
    if (this._muted) return;
    const now = performance.now();
    if (now - this._lastPlay < this._throttleMs) {
      return; // throttle similar sounds
    }
    this._lastPlay = now;

    const ctx = this._getContext();
    const nowC = ctx.currentTime;
    const channel = this._channel(key);
    const vol = (channel ? CHANNELS[channel] : 0.5) * (this._muted ? 0 : 1);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, nowC);
    gain.connect(ctx.destination);

    this._synthesize(ctx, gain, key, nowC);
  }

  _channel(key) {
    if (!key) return null;
    if (key.startsWith('tower-')) return 'tower';
    if (key.startsWith('combat-')) return 'combat';
    if (key.startsWith('fx-')) return 'fx';
    if (key.startsWith('ui-')) return 'ui';
    return 'ui';
  }

  /* ── Synthesis engine ───────────────────────────────────────────── */

  _synthesize(ctx, gain, key, now) {
    switch (key) {
      case 'tower-tranq': {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(180, now);
        osc.frequency.exponentialRampToValueAtTime(100, now + 0.12);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);
        osc.connect(gain);
        osc.start(now);
        osc.stop(now + 0.13);
        break;
      }
      case 'tower-drone': {
        const osc = ctx.createOscillator();
        osc.type = 'square';
        osc.frequency.setValueAtTime(900, now);
        osc.frequency.exponentialRampToValueAtTime(400, now + 0.06);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.06);
        osc.connect(gain);
        osc.start(now);
        osc.stop(now + 0.07);
        break;
      }
      case 'tower-heli': {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(90, now);
        osc.frequency.exponentialRampToValueAtTime(40, now + 0.2);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
        osc.connect(gain);
        osc.start(now);
        osc.stop(now + 0.21);
        break;
      }
      case 'tower-fence': {
        const buf = ctx.createBuffer(1, ctx.sampleRate * 0.08, ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.015));
        const src = ctx.createBufferSource();
        src.buffer = buf;
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
        src.connect(gain);
        src.start(now);
        break;
      }
      case 'tower-chrono': {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1100, now);
        osc.frequency.exponentialRampToValueAtTime(600, now + 0.1);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
        osc.connect(gain);
        osc.start(now);
        osc.stop(now + 0.11);
        break;
      }
      case 'combat-hit': {
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(320, now);
        osc.frequency.exponentialRampToValueAtTime(150, now + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
        osc.connect(gain);
        osc.start(now);
        osc.stop(now + 0.06);
        break;
      }
      case 'combat-slow': {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(700, now);
        osc.frequency.linearRampToValueAtTime(400, now + 0.18);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.18);
        osc.connect(gain);
        osc.start(now);
        osc.stop(now + 0.19);
        break;
      }
      case 'combat-kill': {
        const osc = ctx.createOscillator();
        osc.type = 'square';
        osc.frequency.setValueAtTime(500, now);
        osc.frequency.exponentialRampToValueAtTime(80, now + 0.18);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.18);
        osc.connect(gain);
        osc.start(now);
        osc.stop(now + 0.19);
        break;
      }
      case 'combat-armorBreak': {
        const buf = ctx.createBuffer(1, ctx.sampleRate * 0.12, ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.04));
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 1200;
        src.connect(bp);
        bp.connect(gain);
        src.start(now);
        break;
      }
      case 'fx-meteorTelegraph': {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(200, now);
        osc.frequency.linearRampToValueAtTime(800, now + 1.5);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.linearRampToValueAtTime(0.25, now + 1.4);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 1.5);
        osc.connect(gain);
        osc.start(now);
        osc.stop(now + 1.51);
        break;
      }
      case 'fx-meteorImpact': {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(40, now);
        osc.frequency.exponentialRampToValueAtTime(10, now + 0.7);
        gain.gain.setValueAtTime(0.7, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.7);
        osc.connect(gain);
        osc.start(now);
        osc.stop(now + 0.71);
        const buf = ctx.createBuffer(1, ctx.sampleRate * 0.4, ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.08));
        const noise = ctx.createBufferSource();
        noise.buffer = buf;
        const ng = ctx.createGain();
        ng.gain.setValueAtTime(0.5, now);
        ng.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
        noise.connect(ng);
        ng.connect(ctx.destination);
        noise.start(now);
        break;
      }
      case 'fx-chronoActivate': {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1000, now);
        osc.frequency.exponentialRampToValueAtTime(200, now + 0.5);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
        osc.connect(gain);
        osc.start(now);
        osc.stop(now + 0.51);
        break;
      }
      case 'ui-waveStart': {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.linearRampToValueAtTime(900, now + 0.5);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
        osc.connect(gain);
        osc.start(now);
        osc.stop(now + 0.51);
        break;
      }
      case 'ui-victory': {
        const notes = [523, 659, 784, 1047];
        notes.forEach((f, i) => {
          const o = ctx.createOscillator();
          o.type = 'sine';
          o.frequency.value = f;
          const g = ctx.createGain();
          g.gain.setValueAtTime(0, now + i * 0.12);
          g.gain.linearRampToValueAtTime(0.25, now + i * 0.12 + 0.03);
          g.gain.exponentialRampToValueAtTime(0.01, now + i * 0.12 + 0.25);
          o.connect(g);
          g.connect(ctx.destination);
          o.start(now + i * 0.12);
          o.stop(now + i * 0.12 + 0.26);
        });
        break;
      }
      case 'ui-defeat': {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(380, now);
        osc.frequency.linearRampToValueAtTime(100, now + 0.6);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.6);
        osc.connect(gain);
        osc.start(now);
        osc.stop(now + 0.61);
        break;
      }
      case 'ui-place': {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = 880;
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.06);
        osc.connect(gain);
        osc.start(now);
        osc.stop(now + 0.07);
        break;
      }
      case 'ui-sell': {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(660, now);
        osc.frequency.exponentialRampToValueAtTime(440, now + 0.08);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
        osc.connect(gain);
        osc.start(now);
        osc.stop(now + 0.09);
        break;
      }
      case 'ui-meteorReady': {
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.12);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
        osc.connect(gain);
        osc.start(now);
        osc.stop(now + 0.16);
        break;
      }
      default: {
        // Generic UI click
        const buf = ctx.createBuffer(1, ctx.sampleRate * 0.04, ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.008));
        const src = ctx.createBufferSource();
        src.buffer = buf;
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.04);
        src.connect(gain);
        src.start(now);
      }
    }
  }

  /* ── Global controls ────────────────────────────────────────────── */

  setGlobalMute(muted) {
    this._muted = muted;
  }

  isMuted() {
    return this._muted;
  }

  setChannelVolume(channel, volume) {
    if (CHANNELS[channel] !== undefined) {
      CHANNELS[channel] = Math.max(0, Math.min(1, volume));
    }
  }

  destroy() {
    if (this._ctx && this._ctx.state !== 'closed') {
      this._ctx.close();
      this._ctx = null;
    }
  }
}

/** Add AudioSystem plugin to a scene (idempotent). */
export function addAudioSystem(scene) {
  const audio = new AudioSystem(scene);
  audio.scene = scene;
  return audio;
}
