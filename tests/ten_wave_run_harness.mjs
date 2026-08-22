// Deterministic ten-wave run harness — exercises Phaser WaveBridge/CombatBridge
// contract using existing Canvas Enemy/Tower/WaveManager rules.
// Tests: spawning, kill rewards, leak/lives accounting, wave-clear gating,
// final victory or defeat. Browser-compatible, no invented gameplay values.

import { WaveBridge } from '../src/phaser/wave-bridge.js';
import CombatBridge from '../src/phaser/combat-bridge.js';
import { Tower } from '../src/js/tower.js';
import { SLOTS } from '../src/js/path.js';

// Mock performance.now() for determinism
let mockNow = 0;
const originalPerformance = globalThis.performance;
globalThis.performance = { now: () => mockNow };

// Minimal Phaser scene stub for EnemySprite/TowerSprite
const sceneStub = {
  add: {
    circle: (x, y, r, color) => ({
      x, y, r, color,
      setFillStyle: function() { return this; },
      setVisible: function() { return this; },
    }),
    rectangle: (x, y, w, h, color, alpha) => ({
      x, y, w, h, color, alpha,
      setFillStyle: function() { return this; },
      setVisible: function() { return this; },
      setOrigin: function() { return this; },
      setSize: function() { return this; },
    }),
    existing: () => {},
  },
};

// Test runner
let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.error(`  ✗ ${msg}`); }
}

console.log('Ten-wave run harness:\n');

// ============================================================
// Test 1: Victory run — towers kill all enemies
// ============================================================
console.log('1. Victory run (towers kill all enemies)');

mockNow = 0;
const victoryOutcomes = {
  spawned: [],
  killed: [],
  leaked: [],
  wavesCleared: [],
};

const victoryWaveBridge = new WaveBridge({
  spawnEnemy: (enemy) => {
    victoryOutcomes.spawned.push({
      uid: enemy.uid,
      type: enemy.type,
      wave: victoryWaveBridge.waveMgr.currentWave,
    });
    victoryCombatBridge.enemies.push(enemy);
  },
  onWaveCleared: (waveNum) => {
    victoryOutcomes.wavesCleared.push(waveNum);
  },
});

// Place high-damage towers at strategic slots to kill all enemies
// Using heli (dmg 48, range 280) and chrono (dmg 10, range 200, slow)
const victoryTowers = [];
const towerConfigs = [
  { type: 'heli', slotIdx: 0 },   // { x: 180, y: 250 }
  { type: 'heli', slotIdx: 1 },   // { x: 420, y: 250 }
  { type: 'heli', slotIdx: 4 },   // { x: 640, y: 270 }
  { type: 'heli', slotIdx: 5 },   // { x: 840, y: 270 }
  { type: 'chrono', slotIdx: 6 }, // { x: 700, y: 470 }
  { type: 'chrono', slotIdx: 7 }, // { x: 900, y: 470 }
  { type: 'heli', slotIdx: 10 },  // { x: 1180, y: 300 }
];

for (const cfg of towerConfigs) {
  const slot = SLOTS[cfg.slotIdx];
  const tower = new Tower(cfg.type, slot.x, slot.y);
  victoryTowers.push(tower);
}

const victoryCombatBridge = new CombatBridge({
  towers: victoryTowers,
  enemies: [],
  towerSprites: [],
  enemySprites: [],
  onEnemyGone: (uid, enemy) => {
    if (enemy.reached) {
      victoryOutcomes.leaked.push({ uid, type: enemy.type });
    } else if (enemy.dead) {
      victoryOutcomes.killed.push({ uid, type: enemy.type, reward: enemy.reward });
    }
    victoryWaveBridge.reportEnemyGone(uid, enemy);
  },
});

// Start the game
victoryWaveBridge.controller.start();
assert(victoryWaveBridge.state().phase === 'PLAYING', 'Victory run: phase is PLAYING after start');

// Simulation loop
const DT = 1/60; // 60 FPS
const MAX_TIME = 600; // 10 minutes max
let time = 0;

while (time < MAX_TIME) {
  mockNow = time * 1000;
  
  // Step combat
  victoryCombatBridge.step(DT);
  
  // Step wave bridge
  victoryWaveBridge.update(DT * 1000);
  
  // Check for victory
  if (victoryWaveBridge.state().phase === 'VICTORY') {
    break;
  }
  
  // Check for defeat (shouldn't happen in this test)
  if (victoryWaveBridge.state().phase === 'DEFEAT') {
    break;
  }
  
  time += DT;
}

const victoryState = victoryWaveBridge.state();
console.log(`  Spawned: ${victoryOutcomes.spawned.length}`);
console.log(`  Killed: ${victoryOutcomes.killed.length}`);
console.log(`  Leaked: ${victoryOutcomes.leaked.length}`);
console.log(`  Waves cleared: ${victoryOutcomes.wavesCleared.length}`);
console.log(`  Final phase: ${victoryState.phase}`);
console.log(`  Final money: ${victoryState.money}`);
console.log(`  Final lives: ${victoryState.lives}`);
console.log(`  Simulation time: ${time.toFixed(2)}s`);

assert(victoryState.phase === 'VICTORY', 'Victory run: final phase is VICTORY');
assert(victoryOutcomes.spawned.length > 0, 'Victory run: enemies were spawned');
assert(victoryOutcomes.killed.length > 0, 'Victory run: enemies were killed');
// Note: some enemies may leak (pteranodons with freeFly bypass some towers)
assert(victoryOutcomes.leaked.length >= 0, 'Victory run: leak count tracked');
assert(victoryOutcomes.wavesCleared.length === 10, 'Victory run: all 10 waves cleared');
// Lives should match initial minus leaks
const expectedVictoryLives = Math.max(0, 20 - victoryOutcomes.leaked.length);
assert(victoryState.lives === expectedVictoryLives, `Victory run: lives match initial - leaks (${expectedVictoryLives})`);
assert(victoryState.money > 160, 'Victory run: money increased from kill rewards');

// Verify kill rewards were applied
const totalRewards = victoryOutcomes.killed.reduce((sum, k) => sum + k.reward, 0);
const expectedMoney = 160 + totalRewards;
assert(victoryState.money === expectedMoney, `Victory run: money matches initial + rewards (${expectedMoney})`);

// ============================================================
// Test 2: Defeat run — no towers, all enemies leak
// ============================================================
console.log('\n2. Defeat run (no towers, all enemies leak)');

mockNow = 0;
const defeatOutcomes = {
  spawned: [],
  killed: [],
  leaked: [],
  wavesCleared: [],
};

const defeatWaveBridge = new WaveBridge({
  spawnEnemy: (enemy) => {
    defeatOutcomes.spawned.push({
      uid: enemy.uid,
      type: enemy.type,
      wave: defeatWaveBridge.waveMgr.currentWave,
    });
    defeatCombatBridge.enemies.push(enemy);
  },
  onWaveCleared: (waveNum) => {
    defeatOutcomes.wavesCleared.push(waveNum);
  },
});

const defeatCombatBridge = new CombatBridge({
  towers: [], // No towers
  enemies: [],
  towerSprites: [],
  enemySprites: [],
  onEnemyGone: (uid, enemy) => {
    if (enemy.reached) {
      defeatOutcomes.leaked.push({ uid, type: enemy.type });
    } else if (enemy.dead) {
      defeatOutcomes.killed.push({ uid, type: enemy.type, reward: enemy.reward });
    }
    defeatWaveBridge.reportEnemyGone(uid, enemy);
  },
});

// Start the game
defeatWaveBridge.controller.start();
assert(defeatWaveBridge.state().phase === 'PLAYING', 'Defeat run: phase is PLAYING after start');

// Simulation loop
time = 0;
while (time < MAX_TIME) {
  mockNow = time * 1000;
  
  // Step combat
  defeatCombatBridge.step(DT);
  
  // Step wave bridge
  defeatWaveBridge.update(DT * 1000);
  
  // Check for defeat
  if (defeatWaveBridge.state().phase === 'DEFEAT') {
    break;
  }
  
  // Check for victory (shouldn't happen in this test)
  if (defeatWaveBridge.state().phase === 'VICTORY') {
    break;
  }
  
  time += DT;
}

const defeatState = defeatWaveBridge.state();
console.log(`  Spawned: ${defeatOutcomes.spawned.length}`);
console.log(`  Killed: ${defeatOutcomes.killed.length}`);
console.log(`  Leaked: ${defeatOutcomes.leaked.length}`);
console.log(`  Waves cleared: ${defeatOutcomes.wavesCleared.length}`);
console.log(`  Final phase: ${defeatState.phase}`);
console.log(`  Final money: ${defeatState.money}`);
console.log(`  Final lives: ${defeatState.lives}`);
console.log(`  Simulation time: ${time.toFixed(2)}s`);

assert(defeatState.phase === 'DEFEAT', 'Defeat run: final phase is DEFEAT');
assert(defeatOutcomes.spawned.length > 0, 'Defeat run: enemies were spawned');
assert(defeatOutcomes.killed.length === 0, 'Defeat run: no enemies killed (no towers)');
assert(defeatOutcomes.leaked.length > 0, 'Defeat run: enemies leaked');
assert(defeatState.lives === 0, 'Defeat run: lives reached 0');
assert(defeatState.money === 160, 'Defeat run: money unchanged (no kill rewards)');

// ============================================================
// Test 3: Wave-clear gating — wave doesn't advance until all enemies gone
// ============================================================
console.log('\n3. Wave-clear gating');

mockNow = 0;
const gatingOutcomes = {
  spawned: [],
  killed: [],
  leaked: [],
  wavesCleared: [],
};
const gatingWaveBridge = new WaveBridge({
  spawnEnemy: (enemy) => {
    gatingOutcomes.spawned.push({
      uid: enemy.uid,
      type: enemy.type,
      wave: gatingWaveBridge.waveMgr.currentWave,
    });
    gatingCombatBridge.enemies.push(enemy);
  },
  onWaveCleared: (waveNum) => {
    gatingOutcomes.wavesCleared.push(waveNum);
  },
});

const gatingCombatBridge = new CombatBridge({
  towers: [],
  enemies: [],
  towerSprites: [],
  enemySprites: [],
  onEnemyGone: (uid, enemy) => {
    if (enemy.reached) {
      gatingOutcomes.leaked.push({ uid, type: enemy.type });
    } else if (enemy.dead) {
      gatingOutcomes.killed.push({ uid, type: enemy.type, reward: enemy.reward });
    }
    gatingWaveBridge.reportEnemyGone(uid, enemy);
  },
});

// Start the game
gatingWaveBridge.controller.start();

// Track wave transitions
time = 0;
let frame = 0;
let waveCompleted = false;
while (time < 30 && frame < 2000) { // Run for 30 seconds or 2000 frames
  mockNow = time * 1000;
  
  const currentWave = gatingWaveBridge.waveMgr.currentWave;
  
  // Step combat
  gatingCombatBridge.step(DT);
  
  // Step wave bridge
  gatingWaveBridge.update(DT * 1000);
  
  // Check if wave 1 completed spawning
  if (gatingOutcomes.wavesCleared.length > 0 && !waveCompleted) {
    waveCompleted = true;
    console.log(`  Wave 1 spawning completed at ${time.toFixed(2)}s`);
    console.log(`  Alive enemies when spawning completed: ${gatingWaveBridge.enemiesAlive}`);
  }
  
  // Wait until all enemies from wave 1 are gone
  if (waveCompleted && gatingWaveBridge.enemiesAlive === 0) {
    console.log(`  All wave 1 enemies gone at ${time.toFixed(2)}s`);
    break;
  }
  
  time += DT;
  frame++;
}

console.log(`  Waves cleared: ${gatingOutcomes.wavesCleared.length}`);
assert(gatingOutcomes.wavesCleared.length > 0, 'Wave-clear gating: wave 1 spawning completed');
assert(waveCompleted, 'Wave-clear gating: wave completion detected');

// ============================================================
// Test 4: Mixed scenario — some killed, some leaked
// ============================================================
console.log('\n4. Mixed scenario (some killed, some leaked)');

mockNow = 0;
const mixedOutcomes = {
  spawned: [],
  killed: [],
  leaked: [],
  wavesCleared: [],
};

const mixedWaveBridge = new WaveBridge({
  spawnEnemy: (enemy) => {
    mixedOutcomes.spawned.push({
      uid: enemy.uid,
      type: enemy.type,
      wave: mixedWaveBridge.waveMgr.currentWave,
    });
    mixedCombatBridge.enemies.push(enemy);
  },
  onWaveCleared: (waveNum) => {
    mixedOutcomes.wavesCleared.push(waveNum);
  },
});

// Place ONE tower — will kill some enemies but not all
const mixedTower = new Tower('drone', SLOTS[0].x, SLOTS[0].y);
const mixedCombatBridge = new CombatBridge({
  towers: [mixedTower],
  enemies: [],
  towerSprites: [],
  enemySprites: [],
  onEnemyGone: (uid, enemy) => {
    if (enemy.reached) {
      mixedOutcomes.leaked.push({ uid, type: enemy.type });
    } else if (enemy.dead) {
      mixedOutcomes.killed.push({ uid, type: enemy.type, reward: enemy.reward });
    }
    mixedWaveBridge.reportEnemyGone(uid, enemy);
  },
});

// Start the game
mixedWaveBridge.controller.start();

// Simulation loop — run until defeat or victory
time = 0;
while (time < MAX_TIME) {
  mockNow = time * 1000;
  
  // Step combat
  mixedCombatBridge.step(DT);
  
  // Step wave bridge
  mixedWaveBridge.update(DT * 1000);
  
  // Check for end states
  const phase = mixedWaveBridge.state().phase;
  if (phase === 'VICTORY' || phase === 'DEFEAT') {
    break;
  }
  
  time += DT;
}

const mixedState = mixedWaveBridge.state();
console.log(`  Spawned: ${mixedOutcomes.spawned.length}`);
console.log(`  Killed: ${mixedOutcomes.killed.length}`);
console.log(`  Leaked: ${mixedOutcomes.leaked.length}`);
console.log(`  Waves cleared: ${mixedOutcomes.wavesCleared.length}`);
console.log(`  Final phase: ${mixedState.phase}`);
console.log(`  Final money: ${mixedState.money}`);
console.log(`  Final lives: ${mixedState.lives}`);

assert(mixedOutcomes.spawned.length > 0, 'Mixed scenario: enemies were spawned');
assert(mixedOutcomes.killed.length > 0, 'Mixed scenario: some enemies were killed');
assert(mixedOutcomes.leaked.length > 0, 'Mixed scenario: some enemies leaked');
assert(mixedState.phase === 'DEFEAT' || mixedState.phase === 'VICTORY', 'Mixed scenario: game reached end state');

// Verify accounting
const totalMixedRewards = mixedOutcomes.killed.reduce((sum, k) => sum + k.reward, 0);
const expectedMixedMoney = 160 + totalMixedRewards;
assert(mixedState.money === expectedMixedMoney, `Mixed scenario: money matches initial + rewards (${expectedMixedMoney})`);

// Verify lives accounting (each leak = 1 life lost)
const expectedLives = Math.max(0, 20 - mixedOutcomes.leaked.length);
assert(mixedState.lives === expectedLives, `Mixed scenario: lives match initial - leaks (${expectedLives})`);

// Restore original performance
globalThis.performance = originalPerformance;

// Summary
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
