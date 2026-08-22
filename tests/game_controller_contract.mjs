import assert from 'node:assert/strict';
import { createGameController } from '../src/game/game-controller.js';
import { EVENT_TYPE } from '../src/game/game-events.js';

// ── Basic lifecycle (existing) ─────────────────────────────────────────
const controller = createGameController();
const seen = [];
const unsubscribe = controller.subscribe((state, event) => seen.push({ state, event }));
assert.equal(controller.getState().phase, 'INTRO');
controller.start();
assert.equal(controller.getState().phase, 'PLAYING');
controller.pauseToggle();
assert.equal(controller.getState().phase, 'PAUSED');
controller.pauseToggle();
assert.equal(controller.getState().phase, 'PLAYING');
controller.setSpeed(2);
assert.equal(controller.getState().timeScale, 2);
controller.setWave(3);
assert.equal(controller.getState().wave, 3);
assert.deepEqual(controller.drainEvents().map((event) => event.type), [
  EVENT_TYPE.GAME_STARTED, EVENT_TYPE.GAME_PAUSED, EVENT_TYPE.GAME_RESUMED,
  EVENT_TYPE.SPEED_CHANGED, EVENT_TYPE.WAVE_STARTED,
]);
assert.equal(seen.length, 5);
unsubscribe();
controller.start();
assert.equal(seen.length, 5);
assert.throws(() => controller.setSpeed(3));
controller.victory();
assert.equal(controller.getState().phase, 'VICTORY');
controller.restart();
assert.equal(controller.getState().phase, 'INTRO');
controller.start();
controller.defeat();
assert.equal(controller.getState().phase, 'DEFEAT');
assert.equal(controller.victory(), null);

// ── Economy contract ────────────────────────────────────────────────────
const eco = createGameController();
assert.equal(eco.getState().money, 160);
assert.equal(eco.getState().lives, 20);

// Spending is allowed in INTRO and PLAYING
const spent = eco.spendMoney(20, 'tower');
assert.equal(spent.type, EVENT_TYPE.MONEY_SPENT);
assert.equal(spent.payload.amount, 20);
assert.equal(spent.payload.description, 'tower');
assert.equal(spent.payload.moneyAfter, 140);
assert.equal(eco.getState().money, 140);

// Multiple spends accumulate correctly
eco.spendMoney(40, 'ammo');
assert.equal(eco.getState().money, 100);

// Insufficient funds throws
assert.throws(() => eco.spendMoney(200), /insufficient funds/);

// Negative / zero / non-integer amounts throw
assert.throws(() => eco.spendMoney(0), /positive integer/);
assert.throws(() => eco.spendMoney(-5), /positive integer/);
assert.throws(() => eco.spendMoney(3.5), /positive integer/);

// Refund works (amount must be a negative integer)
const refunded = eco.refundMoney(-20, 'ammo');
assert.equal(refunded.type, EVENT_TYPE.MONEY_REFUNDED);
assert.equal(refunded.payload.amount, -20);
assert.equal(refunded.payload.moneyAfter, 120);
assert.equal(eco.getState().money, 120);

// Refunding with positive amount throws
assert.throws(() => eco.refundMoney(10), /negative integer/);
assert.throws(() => eco.refundMoney(0), /negative integer/);

// Refund can bring money back above the initial 160
eco.spendMoney(100, 'big');
assert.equal(eco.getState().money, 20);
eco.refundMoney(-100, 'refund');
assert.equal(eco.getState().money, 120);

// ── Economy events are emitted and drainable ─────────────────────────────
const events = eco.drainEvents();
const spentTypes = events.map((e) => e.type);
assert.ok(spentTypes.includes(EVENT_TYPE.MONEY_SPENT));
assert.ok(spentTypes.includes(EVENT_TYPE.MONEY_REFUNDED));

// ── Listener receives money snapshots ────────────────────────────────────
const moneySnapshots = [];
const u = eco.subscribe((state, event) => {
  if (event.type === EVENT_TYPE.MONEY_SPENT || event.type === EVENT_TYPE.MONEY_REFUNDED) {
    moneySnapshots.push({ state: { money: state.money, wave: state.wave }, event });
  }
});
eco.spendMoney(5);
assert.equal(moneySnapshots.length, 1);
assert.equal(moneySnapshots[0].state.money, 115);
u();
eco.spendMoney(5); // unsubscribed, should not appear
assert.equal(moneySnapshots.length, 1);

// ── Economy in non-PLAYING/INTRO is still allowed (controller state is neutral) ──
// Spend during INTRO is valid
const intro = createGameController();
intro.spendMoney(10, 'prep');
assert.equal(intro.getState().money, 150);

// Spend during PLAYING
intro.start();
intro.spendMoney(10, 'after-start');
assert.equal(intro.getState().money, 140);

// ── Overridden initial money ─────────────────────────────────────────────
const small = createGameController({ money: 50 });
assert.equal(small.getState().money, 50);
small.spendMoney(25);
assert.equal(small.getState().money, 25);
small.refundMoney(-15);
assert.equal(small.getState().money, 40);

// ── Post-defeat / post-victory economy still works ───────────────────────
const post = createGameController();
post.start();
post.defeat();
assert.equal(post.getState().phase, 'DEFEAT');
post.spendMoney(1, 'post-mortem');
assert.equal(post.getState().money, 159);

// ── restart resets money ─────────────────────────────────────────────────
post.restart();
assert.equal(post.getState().money, 160);

console.log('game-controller contract passed');
