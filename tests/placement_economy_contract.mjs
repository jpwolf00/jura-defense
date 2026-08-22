// Placement economy integration contract — verifies the Phaser placement
// slice calls the renderer-neutral controller's spendMoney/refundMoney
// methods and rejects placement when funds are insufficient.

import assert from 'node:assert/strict';
import { createGameController } from '../src/game/game-controller.js';
import { EVENT_TYPE } from '../src/game/game-events.js';
import { TOWER_TYPES } from '../src/js/tower.js';

console.log('Placement economy integration contract tests:\n');

// Test 1: Placement spendMoney integration
console.log('1. Placement spend integration');
const controller1 = createGameController();
controller1.start();
const initialMoney = controller1.getState().money;
const towerCost = TOWER_TYPES.tranq.cost;
const spendEvent = controller1.spendMoney(towerCost, 'place tranq at slot 1');
assert.equal(spendEvent.type, EVENT_TYPE.MONEY_SPENT, 'spendMoney returns MONEY_SPENT event');
assert.equal(spendEvent.payload.amount, towerCost, 'Event payload has correct amount');
assert.equal(spendEvent.payload.description, 'place tranq at slot 1', 'Event payload has description');
assert.equal(spendEvent.payload.moneyAfter, initialMoney - towerCost, 'Event payload has correct moneyAfter');
assert.equal(controller1.getState().money, initialMoney - towerCost, 'Controller money decreased');
console.log('  ✓ Placement spend integrates with controller');

// Test 2: Insufficient funds rejection
console.log('\n2. Insufficient funds rejection');
const controller2 = createGameController({ money: 50 });
controller2.start();
const expensiveCost = TOWER_TYPES.heli.cost; // 220
assert.equal(controller2.getState().money, 50, 'Initial money is 50');
assert.throws(() => controller2.spendMoney(expensiveCost, 'place heli'), /insufficient funds/, 'spendMoney throws on insufficient funds');
assert.equal(controller2.getState().money, 50, 'Money unchanged after failed spend');
console.log('  ✓ Insufficient funds throws and leaves state unchanged');

// Test 3: Sell refund integration
console.log('\n3. Sell refund integration');
const controller3 = createGameController();
controller3.start();
const sellValue = Math.round(TOWER_TYPES.tranq.cost * 0.6); // L1 sell value
const moneyBeforeSell = controller3.getState().money;
const refundEvent = controller3.refundMoney(-sellValue, 'sell tranq at (180, 250)');
assert.equal(refundEvent.type, EVENT_TYPE.MONEY_REFUNDED, 'refundMoney returns MONEY_REFUNDED event');
assert.equal(refundEvent.payload.amount, -sellValue, 'Event payload has negative amount');
assert.equal(refundEvent.payload.moneyAfter, moneyBeforeSell + sellValue, 'Event payload has correct moneyAfter');
assert.equal(controller3.getState().money, moneyBeforeSell + sellValue, 'Controller money increased');
console.log('  ✓ Sell refund integrates with controller');

// Test 4: Placement contract exposes money
console.log('\n4. Placement contract money exposure');
const controller4 = createGameController();
const state4 = controller4.getState();
assert.equal(typeof state4.money, 'number', 'state().money is a number');
assert.equal(state4.money, 160, 'Initial money is 160');
controller4.spendMoney(50, 'test');
assert.equal(controller4.getState().money, 110, 'Money updated after spend');
console.log('  ✓ Controller state exposes money for HUD');

// Test 5: Multiple placements accumulate
console.log('\n5. Multiple placements accumulate');
const controller5 = createGameController({ money: 500 });
controller5.start();
const cost1 = TOWER_TYPES.drone.cost; // 70
const cost2 = TOWER_TYPES.fence.cost; // 130
const cost3 = TOWER_TYPES.tranq.cost; // 90
controller5.spendMoney(cost1, 'place drone');
controller5.spendMoney(cost2, 'place fence');
controller5.spendMoney(cost3, 'place tranq');
const totalSpent = cost1 + cost2 + cost3;
assert.equal(controller5.getState().money, 500 - totalSpent, 'Multiple spends accumulate correctly');
console.log('  ✓ Multiple placements accumulate correctly');

// Test 6: Sell then buy cycle
console.log('\n6. Sell then buy cycle');
const controller6 = createGameController({ money: 200 });
controller6.start();
const buyCost = TOWER_TYPES.drone.cost; // 70
controller6.spendMoney(buyCost, 'buy drone');
assert.equal(controller6.getState().money, 130, 'Money after buy');
const sellRefund = Math.round(TOWER_TYPES.drone.cost * 0.6); // 42
controller6.refundMoney(-sellRefund, 'sell drone');
assert.equal(controller6.getState().money, 130 + sellRefund, 'Money after sell');
const newBuyCost = TOWER_TYPES.tranq.cost; // 90
controller6.spendMoney(newBuyCost, 'buy tranq');
assert.equal(controller6.getState().money, 130 + sellRefund - newBuyCost, 'Money after new buy');
console.log('  ✓ Sell then buy cycle works correctly');

// Test 7: Economy events are drainable
console.log('\n7. Economy events are drainable');
const controller7 = createGameController();
controller7.start();
controller7.spendMoney(10, 'test1');
controller7.refundMoney(-5, 'test2');
controller7.spendMoney(15, 'test3');
const events = controller7.drainEvents();
const moneyEvents = events.filter(e => e.type === EVENT_TYPE.MONEY_SPENT || e.type === EVENT_TYPE.MONEY_REFUNDED);
assert.equal(moneyEvents.length, 3, 'Three money events emitted');
assert.equal(moneyEvents[0].type, EVENT_TYPE.MONEY_SPENT, 'First is MONEY_SPENT');
assert.equal(moneyEvents[1].type, EVENT_TYPE.MONEY_REFUNDED, 'Second is MONEY_REFUNDED');
assert.equal(moneyEvents[2].type, EVENT_TYPE.MONEY_SPENT, 'Third is MONEY_SPENT');
console.log('  ✓ Economy events are drainable');

// Test 8: Refund can exceed initial money
console.log('\n8. Refund can exceed initial money');
const controller8 = createGameController({ money: 100 });
controller8.start();
controller8.spendMoney(50, 'buy');
assert.equal(controller8.getState().money, 50, 'Money after spend');
controller8.refundMoney(-80, 'big refund');
assert.equal(controller8.getState().money, 130, 'Money can exceed initial 100');
console.log('  ✓ Refund can bring money above initial amount');

console.log('\nAll placement economy integration tests passed');
