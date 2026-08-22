import assert from 'node:assert/strict';
import {
  GAME_PHASE,
  createInitialGameState,
  cloneGameState,
  transitionGamePhase,
  assertGameState,
} from '../src/game/game-state.js';

const initial = createInitialGameState();
assert.equal(initial.phase, GAME_PHASE.INTRO);
assert.equal(initial.money, 160);
assert.equal(initial.lives, 20);
assertGameState(initial);

const copy = cloneGameState({ ...initial, nested: { value: 1 } });
copy.nested.value = 2;
assert.equal(initial.nested, undefined);

const playing = transitionGamePhase(initial, GAME_PHASE.PLAYING);
assert.equal(playing.paused, false);
assert.equal(playing.over, false);
const paused = transitionGamePhase(playing, GAME_PHASE.PAUSED);
assert.equal(paused.paused, true);
const victory = transitionGamePhase(playing, GAME_PHASE.VICTORY);
assert.equal(victory.over, true);
assert.equal(victory.victory, true);
const defeat = transitionGamePhase(playing, GAME_PHASE.DEFEAT);
assert.equal(defeat.over, true);
assert.equal(defeat.victory, false);

assert.throws(() => assertGameState({ ...initial, money: -1 }), /Invalid money/);
assert.throws(() => assertGameState({ ...initial, phase: 'BROKEN' }), /Invalid phase/);
console.log('game-state contract passed');
