// Phaser wave bridge (P2 slice).
//
// Consumes the renderer-neutral game controller and the existing Canvas
// wave/enemy simulation without duplicating wave rules. The WaveManager
// and Enemy class live in src/js/wave.js and src/js/enemy.js and are
// shared with the Canvas entrypoint; this module only drives them from
// Phaser and publishes a small runtime contract for tests.

import { buildWaves, WaveManager } from '../js/wave.js';
import { Enemy } from '../js/enemy.js';
import { createGameController } from '../game/game-controller.js';
import { EVENT_TYPE } from '../game/game-events.js';

export class WaveBridge {
  // options:
  //   controller: optional pre-built controller (else one is created)
  //   spawnEnemy: (enemy) => void — called when the WaveManager spawns one
  //   onWaveCleared: (nextWaveNumber) => void — optional hook
  //   audio: AudioSystem — for game event sounds
  //   fxSystem: FXSystem — for game event VFX
  constructor(options = {}) {
    this.controller = options.controller || createGameController();
    this.spawnEnemy = typeof options.spawnEnemy === 'function' ? options.spawnEnemy : () => {};
    this.onWaveCleared = typeof options.onWaveCleared === 'function' ? options.onWaveCleared : null;
    this._audio = options.audio || null;
    this._fxSystem = options.fxSystem || null;

    this.waveMgr = new WaveManager(buildWaves());
    this.timeScale = 1;
    this.paused = false;
    this.enemiesSpawned = 0;
    this.enemiesAlive = 0;
    this._aliveSet = new Set();
    this._started = false;
    this._awaitingClear = false;
    this._lastWavePlayed = -1;
    this._lastDefeatPlayed = -1;

    this._unsubscribe = this.controller.subscribe((state, event) => this._onEvent(state, event));
  }

  _onEvent(state, event) {
    if (!event) return;
    switch (event.type) {
      case EVENT_TYPE.GAME_STARTED:
        this._started = true;
        this.paused = false;
        if (!this.waveMgr.active && !this.waveMgr.done) this.waveMgr.startNext();
        break;
      case EVENT_TYPE.GAME_PAUSED:
        this.paused = true;
        break;
      case EVENT_TYPE.GAME_RESUMED:
        this.paused = false;
        break;
      case EVENT_TYPE.SPEED_CHANGED:
        this.timeScale = Number(event.payload?.speed) || 1;
        break;
      case EVENT_TYPE.WAVE_STARTED:
        this._lastWavePlayed = this.waveMgr.currentWave;
        this._audio?.play('ui-waveStart');
        this._fxSystem?.waveStartFlash();
        break;
      case EVENT_TYPE.GAME_VICTORY:
        this._onVictory();
        break;
      case EVENT_TYPE.GAME_DEFEAT:
        this._onDefeat();
        break;
      case EVENT_TYPE.GAME_RESTARTED:
        this.waveMgr = new WaveManager(buildWaves());
        this.enemiesSpawned = 0;
        this.enemiesAlive = 0;
        this._aliveSet.clear();
        this._started = false;
        this._awaitingClear = false;
        this.paused = false;
        this.timeScale = state.timeScale || 1;
        this._lastWavePlayed = -1;
        this._lastDefeatPlayed = -1;
        break;
      default:
        break;
    }
  }

  // Emit victory / defeat sounds once
  _onVictory() {
    if (this._lastDefeatPlayed !== 'victory') {
      this._audio?.play('ui-victory');
      this._lastDefeatPlayed = 'victory';
    }
  }
  _onDefeat() {
    if (this._lastDefeatPlayed !== 'defeat') {
      this._audio?.play('ui-defeat');
      this._lastDefeatPlayed = 'defeat';
    }
  }

  // Phaser scene calls this every frame with raw delta ms.
  update(deltaMs) {
    if (this.paused || !this._started) return;
    if (this._awaitingClear) {
      if (this._aliveSet.size > 0) return;
      this._awaitingClear = false;
      this._finishWave();
      return;
    }
    const dt = Math.min(deltaMs / 1000, 0.05) * this.timeScale;
    if (dt <= 0) return;

    this.waveMgr.update(dt, (type, scale, order, spacing) => {
      const enemy = new Enemy(type, scale);
      // Apply spawn offset so burst followers queue behind the leader.
      if (order > 0) enemy.dist = -(order * (spacing || 55));
      this.enemiesSpawned += 1;
      this._aliveSet.add(enemy.uid);
      this.enemiesAlive = this._aliveSet.size;
      this.spawnEnemy(enemy);
    }, () => {
      // WaveManager has finished spawning this wave. Do not advance until
      // every spawned enemy has died or leaked through the bridge.
      this.enemiesAlive = this._aliveSet.size;
      this._awaitingClear = true;
      if (this.onWaveCleared) this.onWaveCleared(this.waveMgr.currentWave);
      if (this._aliveSet.size === 0) {
        this._awaitingClear = false;
        this._finishWave();
      }
    });

    this.enemiesAlive = this._aliveSet.size;
  }

  _finishWave() {
    if (!this.waveMgr.done) {
      this.controller.setWave(this.waveMgr.currentWave);
      this.waveMgr.startNext();
    } else {
      this.controller.victory();
    }
  }

  // Phaser/combat integration calls this when an enemy dies or leaks.
  // Reward only when dead && !reached, leak only when reached.
  reportEnemyGone(uid, enemy) {
    if (!this._aliveSet.has(uid)) return;
    
    // Determine outcome: reward if killed mid-path, leak if reached end
    if (enemy && enemy.reached) {
      // Leaked: apply penalty
      this.controller.applyLeakPenalty(enemy, 1);
    } else if (enemy && enemy.dead && !enemy.reached) {
      // Killed: award reward
      this.controller.awardEnemyReward(enemy);
    }
    
    // Remove from alive set regardless
    this._aliveSet.delete(uid);
    this.enemiesAlive = this._aliveSet.size;
  }

  dispose() {
    if (this._unsubscribe) { this._unsubscribe(); this._unsubscribe = null; }
  }

  // Small runtime contract for tests and HUDs.
  state() {
    const controllerState = this.controller.getState();
    return {
      phase: controllerState.phase,
      waveNumber: this.waveMgr.currentWave,
      totalWaves: this.waveMgr.totalWaves,
      active: this.waveMgr.active,
      done: this.waveMgr.done,
      hint: this.waveMgr.currentHint,
      enemiesSpawned: this.enemiesSpawned,
      enemiesAlive: this.enemiesAlive,
      timeScale: this.timeScale,
      paused: this.paused,
      money: controllerState.money,
      lives: controllerState.lives,
    };
  }
}

// Install a global runtime contract handle so tests and HUDs can read it
// without importing the module. Matches the project's existing
// __jura*Contract pattern used by the playground scene.
export function installWaveBridgeContract(bridge) {
  const controller = bridge.controller;
  const contract = {
    get waveNumber() { return bridge.waveMgr.currentWave; },
    get totalWaves() { return bridge.waveMgr.totalWaves; },
    get active() { return bridge.waveMgr.active; },
    get done() { return bridge.waveMgr.done; },
    get enemiesSpawned() { return bridge.enemiesSpawned; },
    get enemiesAlive() { return bridge.enemiesAlive; },
    get timeScale() { return bridge.timeScale; },
    get paused() { return bridge.paused; },
    get money() { return controller.getState().money; },
    get lives() { return controller.getState().lives; },
    get phase() { return controller.getState().phase; },
    state: () => bridge.state(),
    reset: () => bridge.controller.restart(),
    start: () => bridge.controller.start(),
    pauseToggle: () => bridge.controller.pauseToggle(),
    setSpeed: (s) => bridge.controller.setSpeed(s),
    victory: () => bridge.controller.victory(),
    defeat: () => bridge.controller.defeat(),
    restart: () => bridge.controller.restart(),
  };
  globalThis.__juraWaveBridge = contract;
  return contract;
}
