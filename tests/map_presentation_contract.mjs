import assert from 'node:assert/strict';
import { resolveMap, validateMapDefinition, map1, map2 } from '../src/phaser/world/map-definitions.js';

// ── Browser-compatible map contract ──────────────────────────────────────
// Tests the map-definitions module in isolation (no Phaser required).
// Verifies palette structure, landmark geometry, and validation contract.

// ── Palette structure ────────────────────────────────────────────────────

for (const def of [map1, map2]) {
  assert.ok(def.palette, `${def.id} has palette`);
  assert.ok(def.palette.colours, `${def.id} palette has colours`);
  assert.ok(def.palette.ground, `${def.id} palette has ground`);
  assert.ok(def.palette.decorations, `${def.id} palette has decorations`);
  assert.ok(def.palette.dominant, `${def.id} palette has dominant`);
  
  // Verify colours are 0xRRGGBB numbers
  for (const [key, val] of Object.entries(def.palette.colours)) {
    assert.equal(typeof val, 'number', `${def.id} palette.${key} is number`);
    assert.ok(val >= 0 && val <= 0xffffff, `${def.id} palette.${key} is valid hex`);
  }
  
  // Verify dominant is in colours
  assert.ok(
    def.palette.colours[def.palette.dominant] !== undefined,
    `${def.id} dominant "${def.palette.dominant}" exists in colours`
  );
}

// ── Landmark geometry ────────────────────────────────────────────────────

for (const def of [map1, map2]) {
  assert.ok(Array.isArray(def.landmarks), `${def.id} has landmarks array`);
  assert.ok(def.landmarks.length >= 4, `${def.id} has >= 4 landmarks`);
  
  for (const lm of def.landmarks) {
    assert.ok(lm.id, `${def.id} landmark has id`);
    assert.ok(lm.type === 'rectangle' || lm.type === 'point', `${def.id} landmark ${lm.id} has valid type`);
    assert.equal(typeof lm.x, 'number', `${def.id} landmark ${lm.id} has x`);
    assert.equal(typeof lm.y, 'number', `${def.id} landmark ${lm.id} has y`);
    assert.equal(typeof lm.scale, 'number', `${def.id} landmark ${lm.id} has scale`);
    
    if (lm.type === 'rectangle') {
      assert.equal(typeof lm.w, 'number', `${def.id} landmark ${lm.id} has w`);
      assert.equal(typeof lm.h, 'number', `${def.id} landmark ${lm.id} has h`);
      assert.ok(lm.w > 0, `${def.id} landmark ${lm.id} w > 0`);
      assert.ok(lm.h > 0, `${def.id} landmark ${lm.id} h > 0`);
    }
  }
}

// ── Validation contract ──────────────────────────────────────────────────

for (const def of [map1, map2]) {
  const result = validateMapDefinition(def);
  assert.equal(result.valid, true, `${def.id} passes validation: ${result.errors.join('; ')}`);
  assert.deepEqual(result.errors, [], `${def.id} has no validation errors`);
}

// ── Palette distinctness ─────────────────────────────────────────────────

assert.notDeepEqual(map1.palette.colours, map2.palette.colours, 'map1 and map2 have distinct palettes');
assert.notEqual(map1.palette.dominant, map2.palette.dominant, 'map1 and map2 have distinct dominant colours');

// ── Landmark distinctness ────────────────────────────────────────────────

const map1Ids = new Set(map1.landmarks.map((l) => l.id));
const map2Ids = new Set(map2.landmarks.map((l) => l.id));
const overlap = [...map1Ids].filter((id) => map2Ids.has(id));
assert.equal(overlap.length, 0, 'map1 and map2 landmarks have distinct ids');

console.log('map presentation contract passed');
