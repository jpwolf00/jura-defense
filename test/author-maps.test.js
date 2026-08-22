// P3-01: Tests for authored map definitions.
// Runs in Node (no browser/Phaser required).
//
// Usage:
//   node test/author-maps.test.js

import {
  MAP_DEFS,
  resolveMap,
  validateMap,
  validateMapNumber,
  isMapValid,
  expandMap,
} from '../src/js/maps/author-maps.js';
import { WAYPOINTS, SLOTS } from '../src/js/path.js';
import { distanceToPath, distanceToSlots } from '../src/js/map-layout.js';

// ── test harness ───────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures = [];

function assert(cond, label) {
  if (cond) { passed++; return; }
  failed++;
  failures.push(label || `assertion failed (no label)`);
  console.log(`  FAIL: ${label || 'assertion failed'}`);
}

function eq(a, b, label) {
  if (a === b) { passed++; return; }
  failed++;
  failures.push(`${label || 'eq'}: expected ${a}, got ${b}`);
  console.log(`  FAIL: ${label || 'eq'}: expected ${a}, got ${b}`);
}

function near(a, b, tol, label) {
  if (Math.abs(a - b) <= tol) { passed++; return; }
  failed++;
  failures.push(`${label || 'near'}: expected ~${a}, got ${b} (tol ${tol})`);
  console.log(`  FAIL: ${label || 'near'}: expected ~${a}, got ${b} (tol ${tol})`);
}

// ── suite: MAP_DEFS shape ──────────────────────────────────────────────

console.log('\n[ P3-01 — author-maps ]');

console.log('  MAP_DEFS shape');

eq(MAP_DEFS.length, 2, 'exactly 2 maps');
eq(MAP_DEFS[0].num, 1, 'first map is #1');
eq(MAP_DEFS[1].num, 2, 'second map is #2');
eq(typeof MAP_DEFS[0].name, 'string', 'map 1 has name');
eq(typeof MAP_DEFS[0].description, 'string', 'map 1 has description');
eq(typeof MAP_DEFS[0].seed, 'number', 'map 1 has seed');
eq(Array.isArray(MAP_DEFS[0].regions), true, 'map 1 has regions array');
eq(Array.isArray(MAP_DEFS[0].landmarks), true, 'map 1 has landmarks array');

// Verify maps are genuinely distinct
const names = MAP_DEFS.map((m) => m.name);
assert(names[0] !== names[1], 'maps have distinct names');
const seeds = MAP_DEFS.map((m) => m.seed);
assert(seeds[0] !== seeds[1], 'maps have distinct seeds');

// ── suite: resolveMap ──────────────────────────────────────────────────

console.log('  resolveMap');
assert(resolveMap(1) !== null, 'resolveMap(1) returns map 1');
assert(resolveMap(2) !== null, 'resolveMap(2) returns map 2');
assert(resolveMap(3) === null, 'resolveMap(3) returns null');
assert(resolveMap(0) === null, 'resolveMap(0) returns null');

// ── suite: validateMap ─────────────────────────────────────────────────

console.log('  validateMap');

for (const map of MAP_DEFS) {
  const errs = validateMap(map);
  eq(errs.length, 0, `validateMap(map ${map.num}) — no clearance errors`);
}

// ── suite: validateMapNumber ───────────────────────────────────────────

console.log('  validateMapNumber');

const [valid1, def1, err1] = validateMapNumber(1);
eq(valid1, true, 'validateMapNumber(1) is valid');
eq(def1 !== null, true, 'validateMapNumber(1) returns def');
eq(err1.length, 0, 'validateMapNumber(1) has no errors');

const [valid2, def2, err2] = validateMapNumber(2);
eq(valid2, true, 'validateMapNumber(2) is valid');
eq(def2 !== null, true, 'validateMapNumber(2) returns def');
eq(err2.length, 0, 'validateMapNumber(2) has no errors');

const [valid3, def3, err3] = validateMapNumber(3);
eq(valid3, false, 'validateMapNumber(3) is invalid');
eq(def3, null, 'validateMapNumber(3) returns null def');
assert(err3.length > 0, 'validateMapNumber(3) has errors');

// ── suite: isMapValid ──────────────────────────────────────────────────

console.log('  isMapValid');
assert(isMapValid(MAP_DEFS[0]), 'isMapValid(map 1)');
assert(isMapValid(MAP_DEFS[1]), 'isMapValid(map 2)');

// ── suite: expandMap ───────────────────────────────────────────────────

console.log('  expandMap');

for (const map of MAP_DEFS) {
  const exp = expandMap(map);

  eq(exp.seed, map.seed, `expandMap(${map.num}) seed`);
  eq(exp.mapNum, map.num, `expandMap(${map.num}) mapNum`);
  eq(exp.regionCount, map.regions.length, `expandMap(${map.num}) regionCount`);
  eq(exp.landmarkCount, map.landmarks.length, `expandMap(${map.num}) landmarkCount`);
  assert(exp.ground.length > 0, `expandMap(${map.num}) has ground`);
  assert(exp.decorations.length > 0, `expandMap(${map.num}) has decorations`);
  assert(exp.landmarks.length > 0, `expandMap(${map.num}) has landmarks`);

  // Verify landmarks have _landmark flag
  for (const lm of exp.landmarks) {
    eq(lm._landmark, true, `expandMap(${map.num}) landmark ${lm.id} has _landmark=true`);
  }

  // Verify regions have _regionId
  for (const d of exp.decorations) {
    assert(d._regionId !== undefined, `expandMap(${map.num}) decoration has _regionId`);
  }

  // Verify clearance on expanded items
  for (const d of [...exp.decorations, ...exp.landmarks]) {
    const pd = distanceToPath(d.x, d.y, WAYPOINTS);
    assert(pd >= 52, `expandMap(${map.num}) ${d.id || 'deco'} path dist ${Math.round(pd)} >= 52`);
    const minSlot = Math.min(...SLOTS.map((s) => Math.hypot(d.x - s.x, d.y - s.y)));
    assert(minSlot >= 46, `expandMap(${map.num}) ${d.id || 'deco'} slot dist ${Math.round(minSlot)} >= 46`);
  }
}

// ── suite: region distinctness ─────────────────────────────────────────

console.log('  region distinctness');

// Map 1 should have fern/log/cycad regions (Jungle)
const map1KindSet = new Set(MAP_DEFS[0].regions.map((r) => r.kind));
assert(map1KindSet.has('fern'), 'map 1 has fern regions');
assert(map1KindSet.has('cycad'), 'map 1 has cycad regions');
assert(map1KindSet.has('log'), 'map 1 has log regions');

// Map 2 should have stone/rock/mud/puddle regions (Obsidian)
const map2KindSet = new Set(MAP_DEFS[1].regions.map((r) => r.kind));
assert(map2KindSet.has('stone'), 'map 2 has stone regions');
assert(map2KindSet.has('puddle'), 'map 2 has puddle regions');
assert(map2KindSet.has('rock'), 'map 2 has rock regions');

// Verify no overlap in palette between maps
assert(map1KindSet.size > 0, 'map 1 has region kinds');
assert(map2KindSet.size > 0, 'map 2 has region kinds');
const overlap = [...map1KindSet].filter((k) => map2KindSet.has(k));
// It's ok if some overlap exists (both use 'stone' and 'mud' for ground),
// but the primary palettes should differ significantly
const map1Primary = new Set(['fern', 'cycad', 'log']);
const map2Primary = new Set(['stone', 'rock', 'puddle']);
assert(
  map2Primary.size - overlap.length >= 2,
  'map 2 has distinct primary palette vs map 1'
);

// ── suite: landmark scale ──────────────────────────────────────────────

console.log('  landmark scale');

for (const map of MAP_DEFS) {
  for (const lm of map.landmarks) {
    assert(lm.scale >= 1.2, `map ${map.num} landmark ${lm.id} scale >= 1.2`);
    assert(lm.scale <= 2.0, `map ${map.num} landmark ${lm.id} scale <= 2.0`);
  }
}

// ── suite: map number round-trip ───────────────────────────────────────

console.log('  map number round-trip');

for (const map of MAP_DEFS) {
  const resolved = resolveMap(map.num);
  assert(resolved !== null, `resolveMap(${map.num}) found`);
  eq(resolved.name, map.name, `resolveMap(${map.num}) name matches`);
  eq(resolved.seed, map.seed, `resolveMap(${map.num}) seed matches`);
}

// ── summary ────────────────────────────────────────────────────────────

console.log('');
console.log(`  Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);

if (failures.length > 0) {
  console.log('\n  Failures:');
  for (const f of failures) console.log(`    - ${f}`);
}

process.exit(failed > 0 ? 1 : 0);
