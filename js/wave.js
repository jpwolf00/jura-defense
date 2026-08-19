import { ENEMY_TYPES } from './enemy.js';

// Wave definitions. `scale` multiplies enemy HP; `groups` spawn in sequence.
// A group: { type, count, gap, spacing } — gap = seconds between spawns,
// spacing = meters along path for burst-spawned followers (default 55).
export function buildWaves() {
  const W = [];
  const push = (wave) => W.push(wave);

  push({ scale: 1.0,  groups: [{ type: 'raptor', count: 6, gap: 1.1, spacing: 50 }] });
  push({ scale: 1.1,  groups: [{ type: 'raptor', count: 8, gap: 0.9, spacing: 48 }, { type: 'hadro', count: 3, gap: 1.4, spacing: 55 }] });
  push({ scale: 1.25, groups: [{ type: 'hadro', count: 8, gap: 1.0, spacing: 52 }, { type: 'raptor', count: 6, gap: 0.7, spacing: 44 }] });
  push({ scale: 1.4,  groups: [{ type: 'trice', count: 3, gap: 2.0, spacing: 60 }, { type: 'raptor', count: 8, gap: 0.7, spacing: 44 }] });
  push({ scale: 1.6,  groups: [{ type: 'pterano', count: 6, gap: 0.8, spacing: 46 }, { type: 'hadro', count: 6, gap: 1.0, spacing: 52 }] });
  push({ scale: 1.8,  groups: [{ type: 'anky', count: 3, gap: 2.2, spacing: 62 }, { type: 'raptor', count: 10, gap: 0.6, spacing: 42 }] });
  push({ scale: 2.1,  groups: [{ type: 'trice', count: 5, gap: 1.6, spacing: 60 }, { type: 'pterano', count: 8, gap: 0.7, spacing: 46 }] });
  push({ scale: 2.4,  groups: [{ type: 'anky', count: 4, gap: 1.8, spacing: 62 }, { type: 'hadro', count: 10, gap: 0.7, spacing: 52 }] });
  push({ scale: 2.8,  groups: [{ type: 'trex', count: 1, gap: 1, spacing: 70 }, { type: 'raptor', count: 12, gap: 0.5, spacing: 40 }] });
  push({ scale: 3.2,  groups: [{ type: 'trex', count: 2, gap: 6, spacing: 70 }, { type: 'trice', count: 6, gap: 1.4, spacing: 60 }, { type: 'pterano', count: 8, gap: 0.6, spacing: 46 }] });

  return W;
}

export class WaveManager {
  constructor(waves) {
    this.waves = waves;
    this.index = 0;
    this.active = false;
    this.between = true;    // waiting for player to start next wave
    this.groupCursor = 0;
    this.inGroup = 0;
    this.spawnTimer2 = 0;
  }

  get totalWaves() { return this.waves.length; }
  get currentWave() { return this.index + 1; }
  get done() { return this.index >= this.waves.length && !this.active; }

  startNext() {
    if (this.done || this.active) return;
    this.active = true;
    this.between = false;
    this.groupCursor = 0;
    this.inGroup = 0;
    this.spawnTimer2 = 0;
  }

  // update(dt, spawnFn, onWaveComplete)
  update(dt, spawnFn, onWaveComplete) {
    if (!this.active) return;
    const wave = this.waves[this.index];
    const groups = wave.groups;

    // advance through groups
    while (this.groupCursor < groups.length) {
      const g = groups[this.groupCursor];
      if (this.inGroup < g.count) {
        this.spawnTimer2 += dt;
        if (this.spawnTimer2 >= g.gap) {
          this.spawnTimer2 -= g.gap;
          // Pass the order index (0-based within this group) so enemies
          // can space themselves along the path using spawnOffset().
          spawnFn(g.type, wave.scale, this.inGroup, g.spacing || 55);
          this.inGroup++;
        }
      } else {
        this.groupCursor++;
        this.inGroup = 0;
        this.spawnTimer2 = 0;
      }
    }

    // wave complete?
    const allSpawned = this.groupCursor >= groups.length;
    if (allSpawned) {
      this.active = false;
      this.index++;
      this.between = true;
      if (this.index >= this.waves.length) this.done = true;
      if (onWaveComplete) onWaveComplete(this.index);
    }
  }
}
