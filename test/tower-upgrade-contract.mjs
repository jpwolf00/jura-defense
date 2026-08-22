// Contract test for Tower.upgrade() (P2-08 slice).
// Validates level progression, damage/range growth, max-level guard,
// and invalid upgrade behavior — without touching Canvas or Phaser.

import { Tower, TOWER_TYPES } from '../src/js/tower.js';

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

function testLevelProgression() {
  console.log('\n--- Level Progression ---');
  const tower = new Tower('tranq', 100, 100);
  assert(tower.level === 1, 'Initial level is 1');

  const r1 = tower.upgrade();
  assert(r1.success === true, 'First upgrade returns success');
  assert(r1.level === 2, 'Level incremented to 2');

  const r2 = tower.upgrade();
  assert(r2.level === 3, 'Level incremented to 3 after second upgrade');

  const r3 = tower.upgrade();
  assert(r3.level === 4, 'Level incremented to 4 after third upgrade');

  const r4 = tower.upgrade();
  assert(r4.level === 5, 'Level incremented to 5 after fourth upgrade (max)');
}

function testMaxLevelGuard() {
  console.log('\n--- Max Level Guard ---');
  const tower = new Tower('drone', 200, 200);

  // Upgrade to max
  tower.upgrade(); // 2
  tower.upgrade(); // 3
  tower.upgrade(); // 4
  tower.upgrade(); // 5
  assert(tower.level === 5, 'Level is 5 (MAX_LEVEL)');

  // Attempting beyond max should fail
  const r = tower.upgrade();
  assert(r.success === false, 'Upgrade at max returns success: false');
  assert(r.reason === 'max level', 'Reason is "max level"');
  assert(r.level === 5, 'Level unchanged after max upgrade attempt');

  // CanUpgrade must now be false
  assert(tower.canUpgrade() === false, 'canUpgrade() is false at max');
}

function testDamageRangeGrowth() {
  console.log('\n--- Damage / Range Growth ---');
  const tower = new Tower('tranq', 0, 0); // base dmg=16, range=170
  const baseDmg = 16;
  const baseRange = 170;

  assert(tower.dmg === baseDmg, 'Base damage is 16');
  assert(tower.range === baseRange, 'Base range is 170');

  const d2 = tower.dmg;
  tower.upgrade();
  assert(Math.round(tower.dmg) === Math.round(baseDmg * 1.5), 'Damage x1.5 at level 2');
  assert(tower.range === baseRange + 14, 'Range +14 at level 2');

  const d3 = tower.dmg;
  tower.upgrade();
  assert(Math.round(tower.dmg) === Math.round(baseDmg * 1.5 * 1.5), 'Damage x2.25 at level 3');
  assert(tower.range === baseRange + 28, 'Range +28 at level 3');

  // Verify growth is monotonic — damage always increases
  const lvlBefore = tower.dmg;
  tower.upgrade(); // level 4
  const lvlAfter = tower.dmg;
  assert(lvlAfter > lvlBefore, 'Damage strictly increases with level');
}

function testInvalidUpgrade() {
  console.log('\n--- Invalid Upgrade Behavior ---');
  // Upgrade from a level-1 tower without upgrading
  const r = (new Tower('heli', 0, 0)).upgrade();
  assert(r.success === true, 'Valid upgrade succeeds');

  // Call upgrade on a fresh max-level tower (simulate by creating at max)
  const maxTower = new Tower('chrono', 0, 0);
  // Force max level to test canUpgrade guard
  maxTower.level = 5;
  const r2 = maxTower.upgrade();
  assert(r2.success === false, 'Cannot upgrade already-max tower');
  assert(r2.level === 5, 'Level preserved after failed upgrade');
}

function testMultipleTypes() {
  console.log('\n--- Multiple Tower Types ---');
  for (const type of Object.keys(TOWER_TYPES)) {
    const tower = new Tower(type, 0, 0);
    const origLevel = tower.level;
    const result = tower.upgrade();
    assert(result.success === true && tower.level === 2, `Type "${type}" upgrades to level 2`);
  }
}

// Run all tests
try {
  testLevelProgression();
  testMaxLevelGuard();
  testDamageRangeGrowth();
  testInvalidUpgrade();
  testMultipleTypes();

  console.log(`\n${'='.repeat(50)}`);
  console.log(`Tests: ${passed} passed, ${failed} failed`);
  console.log('='.repeat(50));

  if (failed > 0) process.exit(1);
} catch (error) {
  console.error('\nTest suite error:', error);
  process.exit(1);
}
