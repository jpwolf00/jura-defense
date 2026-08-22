// Economy and end-state bridge contract test — verifies the Phaser wave
// bridge exposes money/lives/victory/defeat/restart without changing
// the Canvas entrypoint or inventing new gameplay rules.

import assert from 'node:assert/strict';
import { WaveBridge, installWaveBridgeContract } from '../src/phaser/wave-bridge.js';
import { EVENT_TYPE } from '../src/game/game-events.js';

console.log('Economy and end-state bridge contract tests:\n');

// Test 1: Contract exposes money and lives
console.log('1. Money and lives exposure');
const bridge1 = new WaveBridge();
const contract1 = installWaveBridgeContract(bridge1);
assert.equal(typeof contract1.money, 'number', 'money is a number');
assert.equal(typeof contract1.lives, 'number', 'lives is a number');
assert.equal(contract1.money, 160, 'Initial money is 160');
assert.equal(contract1.lives, 20, 'Initial lives is 20');
console.log('  ✓ Money and lives exposed on contract');

// Test 2: Contract exposes phase
console.log('\n2. Phase exposure');
assert.equal(typeof contract1.phase, 'string', 'phase is a string');
assert.equal(contract1.phase, 'INTRO', 'Initial phase is INTRO');
console.log('  ✓ Phase exposed on contract');

// Test 3: Contract exposes victory/defeat/restart actions
console.log('\n3. End-state actions');
assert.equal(typeof contract1.victory, 'function', 'victory is a function');
assert.equal(typeof contract1.defeat, 'function', 'defeat is a function');
assert.equal(typeof contract1.restart, 'function', 'restart is a function');
console.log('  ✓ victory/defeat/restart exposed on contract');

// Test 4: Victory transitions phase
console.log('\n4. Victory transitions');
const bridge2 = new WaveBridge();
const contract2 = installWaveBridgeContract(bridge2);
contract2.start();
assert.equal(contract2.phase, 'PLAYING', 'Phase is PLAYING after start');
const victoryResult = contract2.victory();
assert.equal(contract2.phase, 'VICTORY', 'Phase is VICTORY after victory()');
assert.ok(victoryResult !== null, 'victory() returned an event');
assert.equal(victoryResult.type, EVENT_TYPE.GAME_VICTORY, 'Event type is GAME_VICTORY');
console.log('  ✓ victory() transitions to VICTORY');

// Test 5: Defeat transitions phase
console.log('\n5. Defeat transitions');
const bridge3 = new WaveBridge();
const contract3 = installWaveBridgeContract(bridge3);
contract3.start();
const defeatResult = contract3.defeat();
assert.equal(contract3.phase, 'DEFEAT', 'Phase is DEFEAT after defeat()');
assert.ok(defeatResult !== null, 'defeat() returned an event');
assert.equal(defeatResult.type, EVENT_TYPE.GAME_DEFEAT, 'Event type is GAME_DEFEAT');
console.log('  ✓ defeat() transitions to DEFEAT');

// Test 6: Restart resets to INTRO
console.log('\n6. Restart resets');
const bridge4 = new WaveBridge();
const contract4 = installWaveBridgeContract(bridge4);
contract4.start();
contract4.victory();
assert.equal(contract4.phase, 'VICTORY', 'Phase is VICTORY before restart');
const restartResult = contract4.restart();
assert.equal(contract4.phase, 'INTRO', 'Phase is INTRO after restart');
assert.equal(contract4.money, 160, 'Money reset to 160');
assert.equal(contract4.lives, 20, 'Lives reset to 20');
assert.ok(restartResult !== null, 'restart() returned an event');
assert.equal(restartResult.type, EVENT_TYPE.GAME_RESTARTED, 'Event type is GAME_RESTARTED');
console.log('  ✓ restart() resets to INTRO with initial money/lives');

// Test 7: Victory/defeat are no-ops outside PLAYING/PAUSED
console.log('\n7. End-state guards');
const bridge5 = new WaveBridge();
const contract5 = installWaveBridgeContract(bridge5);
assert.equal(contract5.phase, 'INTRO', 'Phase is INTRO');
const introVictory = contract5.victory();
assert.equal(introVictory, null, 'victory() returns null in INTRO');
assert.equal(contract5.phase, 'INTRO', 'Phase unchanged after invalid victory()');
const introDefeat = contract5.defeat();
assert.equal(introDefeat, null, 'defeat() returns null in INTRO');
assert.equal(contract5.phase, 'INTRO', 'Phase unchanged after invalid defeat()');
console.log('  ✓ victory/defeat are no-ops outside PLAYING/PAUSED');

// Test 8: state() includes money and lives
console.log('\n8. state() includes economy');
const bridge6 = new WaveBridge();
const state6 = bridge6.state();
assert.equal(typeof state6.money, 'number', 'state().money is a number');
assert.equal(typeof state6.lives, 'number', 'state().lives is a number');
assert.equal(state6.money, 160, 'state().money is 160');
assert.equal(state6.lives, 20, 'state().lives is 20');
console.log('  ✓ state() includes money and lives');

console.log('\nAll economy/end-state bridge contract tests passed');
