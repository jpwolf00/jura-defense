// Wave economy contract test — verifies enemy reward and leak penalty
// behavior in the game controller and wave bridge integration.

import assert from 'node:assert/strict';
import { createGameController } from '../src/game/game-controller.js';
import { WaveBridge } from '../src/phaser/wave-bridge.js';
import { EVENT_TYPE } from '../src/game/game-events.js';

console.log('Wave economy contract tests:\n');

// Test 1: awardEnemyReward awards money from enemy.reward
console.log('1. awardEnemyReward awards money');
const ctrl1 = createGameController();
const enemy1 = { uid: 1, type: 'raptor', reward: 6 };
const event1 = ctrl1.awardEnemyReward(enemy1);
assert.equal(event1.type, EVENT_TYPE.MONEY_AWARDED);
assert.equal(event1.payload.amount, 6);
assert.equal(event1.payload.moneyAfter, 166);
assert.equal(ctrl1.getState().money, 166);
console.log('  ✓ Money awarded correctly');

// Test 2: awardEnemyReward validates enemy object
console.log('\n2. awardEnemyReward validation');
const ctrl2 = createGameController();
assert.throws(() => ctrl2.awardEnemyReward(null), /enemy must be an object/);
assert.throws(() => ctrl2.awardEnemyReward({}), /reward must be a positive integer/);
assert.throws(() => ctrl2.awardEnemyReward({ reward: 0 }), /reward must be a positive integer/);
assert.throws(() => ctrl2.awardEnemyReward({ reward: -5 }), /reward must be a positive integer/);
assert.throws(() => ctrl2.awardEnemyReward({ reward: 3.5 }), /reward must be a positive integer/);
console.log('  ✓ Validation works correctly');

// Test 3: applyLeakPenalty deducts lives
console.log('\n3. applyLeakPenalty deducts lives');
const ctrl3 = createGameController();
const enemy3 = { uid: 3, type: 'hadro' };
const event3 = ctrl3.applyLeakPenalty(enemy3, 1);
assert.equal(event3.type, EVENT_TYPE.LIVES_LOST);
assert.equal(event3.payload.count, 1);
assert.equal(event3.payload.livesAfter, 19);
assert.equal(ctrl3.getState().lives, 19);
console.log('  ✓ Lives deducted correctly');

// Test 4: applyLeakPenalty clamps lives at zero
console.log('\n4. applyLeakPenalty clamps at zero');
const ctrl4 = createGameController({ lives: 2 });
const enemy4 = { uid: 4, type: 'trice' };
ctrl4.applyLeakPenalty(enemy4, 5); // Try to deduct 5 from 2
assert.equal(ctrl4.getState().lives, 0, 'Lives clamped to 0, not negative');
console.log('  ✓ Lives clamped at zero');

// Test 5: applyLeakPenalty triggers DEFEAT at zero lives
console.log('\n5. applyLeakPenalty triggers DEFEAT');
const ctrl5 = createGameController({ lives: 1 });
ctrl5.start();
assert.equal(ctrl5.getState().phase, 'PLAYING');
const enemy5 = { uid: 5, type: 'anky' };
ctrl5.applyLeakPenalty(enemy5, 1);
assert.equal(ctrl5.getState().lives, 0);
assert.equal(ctrl5.getState().phase, 'DEFEAT');
const events5 = ctrl5.drainEvents();
const defeatEvent = events5.find(e => e.type === EVENT_TYPE.GAME_DEFEAT);
assert.ok(defeatEvent, 'DEFEAT event emitted');
assert.equal(defeatEvent.payload.reason, 'lives_depleted');
console.log('  ✓ DEFEAT triggered at zero lives');

// Test 6: WaveBridge rewards on dead && !reached
console.log('\n6. WaveBridge rewards killed enemies');
const bridge6 = new WaveBridge();
bridge6.controller.start();
const enemy6 = { uid: 101, type: 'raptor', reward: 6, dead: true, reached: false };
bridge6._aliveSet.add(enemy6.uid);
const moneyBefore = bridge6.controller.getState().money;
bridge6.reportEnemyGone(enemy6.uid, enemy6);
const moneyAfter = bridge6.controller.getState().money;
assert.equal(moneyAfter, moneyBefore + 6, 'Money increased by reward');
assert.equal(bridge6._aliveSet.has(enemy6.uid), false, 'Enemy removed from alive set');
console.log('  ✓ Reward awarded for killed enemy');

// Test 7: WaveBridge applies leak penalty on reached
console.log('\n7. WaveBridge penalizes leaked enemies');
const bridge7 = new WaveBridge();
bridge7.controller.start();
const enemy7 = { uid: 102, type: 'hadro', reward: 9, dead: true, reached: true };
bridge7._aliveSet.add(enemy7.uid);
const livesBefore = bridge7.controller.getState().lives;
bridge7.reportEnemyGone(enemy7.uid, enemy7);
const livesAfter = bridge7.controller.getState().lives;
assert.equal(livesAfter, livesBefore - 1, 'Lives decreased by 1');
assert.equal(bridge7._aliveSet.has(enemy7.uid), false, 'Enemy removed from alive set');
console.log('  ✓ Leak penalty applied for reached enemy');

// Test 8: WaveBridge does not reward if enemy has no reward property
console.log('\n8. WaveBridge handles missing reward gracefully');
const bridge8 = new WaveBridge();
bridge8.controller.start();
const enemy8 = { uid: 103, type: 'trice', reward: 22, dead: true, reached: false };
bridge8._aliveSet.add(enemy8.uid);
const moneyBefore8 = bridge8.controller.getState().money;
bridge8.reportEnemyGone(enemy8.uid, enemy8);
const moneyAfter8 = bridge8.controller.getState().money;
assert.equal(moneyAfter8, moneyBefore8 + 22, 'Money increased by reward');
console.log('  ✓ Reward awarded correctly');

// Test 9: Multiple leaks can trigger DEFEAT
console.log('\n9. Multiple leaks trigger DEFEAT');
const bridge9 = new WaveBridge({ controller: createGameController({ lives: 2 }) });
bridge9.controller.start();
const enemy9a = { uid: 201, type: 'raptor', reward: 6, dead: true, reached: true };
const enemy9b = { uid: 202, type: 'hadro', reward: 9, dead: true, reached: true };
bridge9._aliveSet.add(enemy9a.uid);
bridge9._aliveSet.add(enemy9b.uid);
bridge9.reportEnemyGone(enemy9a.uid, enemy9a);
assert.equal(bridge9.controller.getState().lives, 1);
assert.equal(bridge9.controller.getState().phase, 'PLAYING');
bridge9.reportEnemyGone(enemy9b.uid, enemy9b);
assert.equal(bridge9.controller.getState().lives, 0);
assert.equal(bridge9.controller.getState().phase, 'DEFEAT');
console.log('  ✓ DEFEAT triggered after multiple leaks');

// Test 10: reportEnemyGone is idempotent
console.log('\n10. reportEnemyGone is idempotent');
const bridge10 = new WaveBridge();
bridge10.controller.start();
const enemy10 = { uid: 301, type: 'raptor', reward: 6, dead: true, reached: false };
bridge10._aliveSet.add(enemy10.uid);
const moneyBefore10 = bridge10.controller.getState().money;
bridge10.reportEnemyGone(enemy10.uid, enemy10);
const moneyAfter10 = bridge10.controller.getState().money;
assert.equal(moneyAfter10, moneyBefore10 + 6);
// Call again - should be no-op
bridge10.reportEnemyGone(enemy10.uid, enemy10);
const moneyFinal10 = bridge10.controller.getState().money;
assert.equal(moneyFinal10, moneyAfter10, 'No double reward');
console.log('  ✓ Idempotent behavior confirmed');

console.log('\nAll wave economy contract tests passed');
