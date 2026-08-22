// Wave bridge contract test — verifies the Phaser wave bridge exposes
// a small runtime contract for tests without duplicating wave rules.

import { WaveBridge, installWaveBridgeContract } from '../src/phaser/wave-bridge.js';
import { EVENT_TYPE } from '../src/game/game-events.js';

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.error(`  ✗ ${msg}`); }
}

console.log('Wave bridge contract tests:\n');

// Test 1: WaveBridge can be instantiated
console.log('1. Instantiation');
const bridge = new WaveBridge();
assert(bridge !== null, 'WaveBridge created');
assert(bridge.controller !== null, 'Controller attached');
assert(bridge.waveMgr !== null, 'WaveManager attached');
assert(bridge.waveMgr.totalWaves === 10, 'WaveManager has 10 waves');

// Test 2: State contract
console.log('\n2. State contract');
const state = bridge.state();
assert(typeof state === 'object', 'state() returns object');
assert(state.phase === 'INTRO', 'Initial phase is INTRO');
assert(state.waveNumber === 1, 'Initial wave is 1');
assert(state.totalWaves === 10, 'Total waves is 10');
assert(state.active === false, 'Not active initially');
assert(state.done === false, 'Not done initially');
assert(state.enemiesSpawned === 0, 'No enemies spawned initially');
assert(state.enemiesAlive === 0, 'No enemies alive initially');
assert(state.timeScale === 1, 'Time scale is 1');
assert(state.paused === false, 'Not paused initially');

// Test 3: Start transitions to PLAYING
console.log('\n3. Start game');
bridge.controller.start();
const stateAfterStart = bridge.state();
assert(stateAfterStart.phase === 'PLAYING', 'Phase is PLAYING after start');
assert(stateAfterStart.active === true, 'WaveManager is active after start');

// Test 4: Spawn callback is invoked
console.log('\n4. Spawn callback');
let spawnedCount = 0;
const spawnBridge = new WaveBridge({
  spawnEnemy: (enemy) => { spawnedCount++; },
});
spawnBridge.controller.start();
// Simulate a few frames to trigger spawns
for (let i = 0; i < 120; i++) spawnBridge.update(16.67);
assert(spawnedCount > 0, `Spawn callback invoked (${spawnedCount} times)`);

// Test 5: Pause/resume
console.log('\n5. Pause/resume');
const pauseBridge = new WaveBridge();
pauseBridge.controller.start();
pauseBridge.controller.pauseToggle();
assert(pauseBridge.state().paused === true, 'Paused after pauseToggle');
pauseBridge.controller.pauseToggle();
assert(pauseBridge.state().paused === false, 'Resumed after second pauseToggle');

// Test 6: Speed change
console.log('\n6. Speed change');
const speedBridge = new WaveBridge();
speedBridge.controller.setSpeed(2);
assert(speedBridge.state().timeScale === 2, 'Time scale is 2');
speedBridge.controller.setSpeed(1);
assert(speedBridge.state().timeScale === 1, 'Time scale back to 1');

// Test 7: Global contract installation
console.log('\n7. Global contract');
const contractBridge = new WaveBridge();
const contract = installWaveBridgeContract(contractBridge);
assert(globalThis.__juraWaveBridge === contract, 'Contract installed on globalThis');
assert(typeof contract.state === 'function', 'Contract has state()');
assert(typeof contract.start === 'function', 'Contract has start()');
assert(typeof contract.pauseToggle === 'function', 'Contract has pauseToggle()');
assert(typeof contract.setSpeed === 'function', 'Contract has setSpeed()');
assert(typeof contract.reset === 'function', 'Contract has reset()');

// Test 8: Dispose
console.log('\n8. Dispose');
const disposeBridge = new WaveBridge();
disposeBridge.dispose();
assert(disposeBridge._unsubscribe === null, 'Unsubscribe cleared after dispose');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
