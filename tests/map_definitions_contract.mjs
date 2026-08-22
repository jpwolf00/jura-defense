import assert from 'node:assert/strict';
import { MAP_DEFS, map1, map2, resolveMap, validateMapDefinition } from '../src/phaser/world/map-definitions.js';

assert.equal(MAP_DEFS.length, 2);
assert.equal(resolveMap(1), map1);
assert.equal(resolveMap(2), map2);
assert.equal(resolveMap(99), null);
assert.notEqual(map1.id, map2.id);
assert.notEqual(map1.seed, map2.seed);
assert.notEqual(map1.name, map2.name);
assert.ok(map1.landmarks.length >= 4);
assert.ok(map2.landmarks.length >= 4);
assert.notDeepEqual(map1.palette, map2.palette);

for (const definition of MAP_DEFS) {
  const result = validateMapDefinition(definition);
  assert.equal(result.valid, true, `${definition.id}: ${result.errors.join('; ')}`);
  assert.deepEqual(result.errors, []);
}

const invalid = {
  landmarks: [{ id: 'bad', type: 'point', x: 0, y: 140 }],
};
const invalidResult = validateMapDefinition(invalid);
assert.equal(invalidResult.valid, false);
assert.ok(invalidResult.errors.length > 0);

console.log('map definitions contract passed');
