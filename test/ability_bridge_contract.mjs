// Contract test for the Phaser ability bridge (P2-06 slice).
// Validates that the bridge correctly wraps MeteorCall and ChronoCharge,
// exposes a runtime contract, and integrates with the game controller.

import { AbilityBridge, installAbilityBridgeContract } from '../src/phaser/ability-bridge.js';
import { createGameController } from '../src/game/game-controller.js';
import { EVENT_TYPE } from '../src/game/game-events.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`✓ ${message}`);
  } else {
    failed++;
    console.error(`✗ ${message}`);
  }
}

function testMeteorTargeting() {
  console.log('\n--- Meteor Targeting ---');
  const controller = createGameController();
  const enemies = [];
  const towers = [];
  const projectiles = [];
  const fx = { explosion() {}, shake() {}, scorch() {} };

  const bridge = new AbilityBridge({
    controller,
    scene: null,
    enemies,
    towers,
    projectiles,
    fx,
  });

  // Initial state
  const initial = bridge.state();
  assert(initial.meteor.charges === 3, 'Meteor starts with 3 charges');
  assert(initial.meteor.ready === true, 'Meteor is ready initially');
  assert(initial.meteor.targeting === false, 'Not targeting initially');

  // Start targeting
  const started = bridge.startMeteorTargeting();
  assert(started === true, 'startMeteorTargeting returns true when ready');
  assert(bridge.meteorTargeting === true, 'meteorTargeting flag is set');

  // Fire meteor
  const fired = bridge.fireMeteor(500, 400);
  assert(fired === true, 'fireMeteor returns true when targeting');
  assert(bridge.meteorTargeting === false, 'targeting cleared after fire');
  assert(bridge.meteor.charges === 2, 'charges decremented');

  // Cannot fire again while targeting is off
  const firedAgain = bridge.fireMeteor(600, 500);
  assert(firedAgain === false, 'Cannot fire without targeting');

  // Cannot start targeting when on cooldown
  const startedAgain = bridge.startMeteorTargeting();
  assert(startedAgain === false, 'Cannot start targeting while on cooldown');

  // Update to advance cooldown (not enough to fully cool, but enough to test)
  bridge.update(1.0);
  assert(bridge.meteor.cooling > 0, 'Cooldown is active');

  bridge.dispose();
}

function testChronoAvailability() {
  console.log('\n--- Chrono Availability ---');
  const controller = createGameController();
  const enemies = [];
  const towers = [];
  const projectiles = [];
  const fx = { rewindFlash() {} };

  const bridge = new AbilityBridge({
    controller,
    scene: null,
    enemies,
    towers,
    projectiles,
    fx,
  });

  // Initial state
  const initial = bridge.state();
  assert(initial.chrono.charge === 0, 'Chrono starts at 0 charge');
  assert(initial.chrono.ready === false, 'Chrono not ready initially');

  // Simulate enemy leaks to charge chrono
  const mockEnemy = { type: 'raptor' };
  bridge.onEnemyLeak(mockEnemy);
  assert(bridge.chrono.charge > 0, 'Charge increased after leak');

  // Charge to full
  for (let i = 0; i < 10; i++) {
    bridge.onEnemyLeak({ type: 'trex' }); // 100 charge each
  }
  for (let i = 0; i < 30; i++) bridge.update(0.1);
  assert(bridge.chrono.ready === true, 'Chrono ready when fully charged');

  // Activate chrono
  const activated = bridge.activateChrono();
  assert(activated === false, 'Cannot activate with no enemies');

  // Add a mock enemy
  const liveEnemy = {
    uid: 'e1',
    dead: false,
    dist: 500,
    hp: 100,
    _sync() {},
    slowUntil: 0,
    slowFactor: 1,
  };
  enemies.push(liveEnemy);
  bridge.chrono.frames = [];

  // Charge again
  for (let i = 0; i < 10; i++) {
    bridge.onEnemyLeak({ type: 'trex' });
  }
  for (let i = 0; i < 30; i++) bridge.update(0.1);

  // Now activate
  const activated2 = bridge.activateChrono();
  assert(activated2 === true, 'Chrono activates with enemies present');
  assert(bridge.chrono.charge === 0, 'Charge reset after activation');
  assert(bridge.chrono.cooldown > 0, 'Cooldown active after activation');

  bridge.dispose();
}

function testControllerIntegration() {
  console.log('\n--- Controller Integration ---');
  const controller = createGameController();
  const enemies = [];
  const towers = [];
  const projectiles = [];
  const fx = { explosion() {}, shake() {}, scorch() {} };

  const bridge = new AbilityBridge({
    controller,
    scene: null,
    enemies,
    towers,
    projectiles,
    fx,
  });

  // Track events
  const events = [];
  controller.subscribe((state, event) => {
    if (event) events.push(event.type);
  });

  // Fire meteor
  bridge.startMeteorTargeting();
  bridge.fireMeteor(500, 400);
  assert(events.includes(EVENT_TYPE.METEOR_TARGETED), 'METEOR_TARGETED event emitted');

  // Update to trigger impact
  bridge.update(2.0); // past telegraph time
  assert(events.includes(EVENT_TYPE.METEOR_IMPACTED), 'METEOR_IMPACTED event emitted');

  bridge.dispose();
}

function testRuntimeContract() {
  console.log('\n--- Runtime Contract ---');
  const controller = createGameController();
  const enemies = [];
  const towers = [];
  const projectiles = [];
  const fx = { explosion() {}, shake() {}, scorch() {} };

  const bridge = new AbilityBridge({
    controller,
    scene: null,
    enemies,
    towers,
    projectiles,
    fx,
  });

  const contract = installAbilityBridgeContract(bridge);

  assert(typeof contract.meteorCharges === 'number', 'Contract exposes meteorCharges');
  assert(typeof contract.meteorReady === 'boolean', 'Contract exposes meteorReady');
  assert(typeof contract.chronoPct === 'number', 'Contract exposes chronoPct');
  assert(typeof contract.chronoReady === 'boolean', 'Contract exposes chronoReady');
  assert(typeof contract.state === 'function', 'Contract exposes state()');
  assert(typeof contract.startMeteorTargeting === 'function', 'Contract exposes startMeteorTargeting()');
  assert(typeof contract.fireMeteor === 'function', 'Contract exposes fireMeteor()');
  assert(typeof contract.activateChrono === 'function', 'Contract exposes activateChrono()');

  // Verify global handle
  assert(globalThis.__juraAbilityBridge === contract, 'Global contract handle installed');

  bridge.dispose();
}

// Run all tests
try {
  testMeteorTargeting();
  testChronoAvailability();
  testControllerIntegration();
  testRuntimeContract();

  console.log(`\n${'='.repeat(50)}`);
  console.log(`Tests: ${passed} passed, ${failed} failed`);
  console.log('='.repeat(50));

  if (failed > 0) {
    process.exit(1);
  }
} catch (error) {
  console.error('\nTest suite error:', error);
  process.exit(1);
}
