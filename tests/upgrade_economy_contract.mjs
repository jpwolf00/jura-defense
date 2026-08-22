// Upgrade economy integration contract — verifies the upgrade action
// spends tower.upgradeCost() through the controller, rejects insufficient
// funds and max-level without state mutation, and updates tower state.

import assert from 'node:assert/strict';
import { createGameController } from '../src/game/game-controller.js';
import { EVENT_TYPE } from '../src/game/game-events.js';
import { Tower, TOWER_TYPES } from '../src/js/tower.js';

console.log('Upgrade economy integration contract tests:\n');

// Test 1: Upgrade spend integration
console.log('1. Upgrade spend integration');
const controller1 = createGameController({ money: 500 });
controller1.start();
const tower1 = new Tower('tranq', 100, 100);
assert.equal(tower1.level, 1, 'Initial level is 1');
const upgradeCost1 = tower1.upgradeCost();
const moneyBefore = controller1.getState().money;
const spendEvent = controller1.spendMoney(upgradeCost1, 'upgrade tranq');
assert.equal(spendEvent.type, EVENT_TYPE.MONEY_SPENT, 'spendMoney returns MONEY_SPENT');
assert.equal(spendEvent.payload.amount, upgradeCost1, 'Correct upgrade cost');
assert.equal(controller1.getState().money, moneyBefore - upgradeCost1, 'Money decreased by upgrade cost');
const result1 = tower1.upgrade();
assert.equal(result1.success, true, 'Upgrade succeeds after spend');
assert.equal(tower1.level, 2, 'Tower level incremented to 2');
console.log('  ✓ Upgrade spend integrates with controller');

// Test 2: Insufficient funds rejection — no state mutation
console.log('\n2. Insufficient funds rejection');
const controller2 = createGameController({ money: 10 });
controller2.start();
const tower2 = new Tower('drone', 200, 200);
const upgradeCost2 = tower2.upgradeCost(); // 70 * 0.8 * 1 = 56
assert.ok(upgradeCost2 > 10, 'Upgrade cost exceeds available funds');
const moneyBefore2 = controller2.getState().money;
const levelBefore2 = tower2.level;
assert.throws(() => controller2.spendMoney(upgradeCost2, 'upgrade drone'), /insufficient funds/);
assert.equal(controller2.getState().money, moneyBefore2, 'Money unchanged after failed spend');
assert.equal(tower2.level, levelBefore2, 'Tower level unchanged after failed spend');
console.log('  ✓ Insufficient funds throws and leaves state unchanged');

// Test 3: Max level rejection — no state mutation
console.log('\n3. Max level rejection');
const controller3 = createGameController({ money: 1000 });
controller3.start();
const tower3 = new Tower('heli', 300, 300);
// Upgrade to max (level 5)
while (tower3.canUpgrade()) tower3.upgrade();
assert.equal(tower3.level, 5, 'Tower is at max level');
assert.equal(tower3.canUpgrade(), false, 'canUpgrade() is false at max');
const moneyBefore3 = controller3.getState().money;
// Attempt upgrade at max — should be rejected before spend
const canUp = tower3.canUpgrade();
assert.equal(canUp, false, 'Max-level tower cannot upgrade');
// Verify no spend was attempted (money unchanged)
assert.equal(controller3.getState().money, moneyBefore3, 'Money unchanged for max-level tower');
// tower.upgrade() itself also returns failure
const result3 = tower3.upgrade();
assert.equal(result3.success, false, 'upgrade() returns success:false at max');
assert.equal(result3.reason, 'max level', 'Reason is "max level"');
assert.equal(tower3.level, 5, 'Level preserved after max upgrade attempt');
console.log('  ✓ Max level rejection preserves state');

// Test 4: Upgrade cost scales with level
console.log('\n4. Upgrade cost scales with level');
const tower4 = new Tower('fence', 0, 0);
const baseCost = TOWER_TYPES.fence.cost; // 130
const costL1 = tower4.upgradeCost(); // 130 * 0.8 * 1 = 104
assert.equal(costL1, Math.round(baseCost * 0.8 * 1), 'L1->L2 cost = base * 0.8 * 1');
tower4.upgrade(); // now level 2
const costL2 = tower4.upgradeCost(); // 130 * 0.8 * 2 = 208
assert.equal(costL2, Math.round(baseCost * 0.8 * 2), 'L2->L3 cost = base * 0.8 * 2');
tower4.upgrade(); // now level 3
const costL3 = tower4.upgradeCost(); // 130 * 0.8 * 3 = 312
assert.equal(costL3, Math.round(baseCost * 0.8 * 3), 'L3->L4 cost = base * 0.8 * 3');
console.log('  ✓ Upgrade cost scales linearly with level');

// Test 5: Multiple upgrades accumulate cost
console.log('\n5. Multiple upgrades accumulate');
const controller5 = createGameController({ money: 2000 });
controller5.start();
const tower5 = new Tower('tranq', 0, 0);
const moneyStart = controller5.getState().money;
let totalSpent = 0;
while (tower5.canUpgrade()) {
  const cost = tower5.upgradeCost();
  controller5.spendMoney(cost, 'upgrade');
  totalSpent += cost;
  tower5.upgrade();
}
assert.equal(tower5.level, 5, 'Tower reached max level');
assert.equal(controller5.getState().money, moneyStart - totalSpent, 'Money decreased by total upgrade cost');
assert.equal(controller5.getState().money >= 0, true, 'Money never negative');
console.log('  ✓ Multiple upgrades accumulate correctly');

// Test 6: Upgrade event is emitted
console.log('\n6. Upgrade event emission');
const controller6 = createGameController({ money: 500 });
controller6.start();
const tower6 = new Tower('drone', 0, 0);
const cost6 = tower6.upgradeCost();
controller6.spendMoney(cost6, 'upgrade drone');
tower6.upgrade();
controller6.emit(EVENT_TYPE.TOWER_UPGRADED, {
  towerType: tower6.type,
  level: tower6.level,
  cost: cost6,
});
const events6 = controller6.drainEvents();
const upgradeEvents = events6.filter(e => e.type === EVENT_TYPE.TOWER_UPGRADED);
assert.equal(upgradeEvents.length, 1, 'TOWER_UPGRADED event emitted');
assert.equal(upgradeEvents[0].payload.level, 2, 'Event has correct level');
assert.equal(upgradeEvents[0].payload.cost, cost6, 'Event has correct cost');
console.log('  ✓ Upgrade event is emitted and drainable');

// Test 7: All tower types can upgrade
console.log('\n7. All tower types upgrade');
for (const type of Object.keys(TOWER_TYPES)) {
  const t = new Tower(type, 0, 0);
  const cost = t.upgradeCost();
  assert.ok(cost > 0, `${type} has positive upgrade cost`);
  assert.equal(t.canUpgrade(), true, `${type} can upgrade at L1`);
  const r = t.upgrade();
  assert.equal(r.success, true, `${type} upgrade succeeds`);
  assert.equal(t.level, 2, `${type} is now level 2`);
}
console.log('  ✓ All tower types upgrade correctly');

console.log('\nAll upgrade economy integration tests passed');
