import assert from 'node:assert/strict';
import { EVENT_TYPE, createGameEvent, isGameEvent, createEventBuffer } from '../src/game/game-events.js';

const started = createGameEvent(EVENT_TYPE.GAME_STARTED, { seed: 42 }, 12.5);
assert.equal(isGameEvent(started), true);
assert.equal(isGameEvent({ type: EVENT_TYPE.GAME_STARTED, payload: {}, at: Infinity }), false);
assert.equal(isGameEvent({ type: 1, payload: {}, at: 0 }), false);

const events = createEventBuffer();
assert.equal(events.size(), 0);
events.push(started);
events.push(createGameEvent(EVENT_TYPE.WAVE_STARTED, { wave: 1 }, 13));
assert.equal(events.size(), 2);
assert.deepEqual(events.peek(), started);
assert.deepEqual(events.drain(), [started, { type: EVENT_TYPE.WAVE_STARTED, payload: { wave: 1 }, at: 13 }]);
assert.equal(events.size(), 0);
assert.throws(() => events.push({}), /Invalid game event/);
events.push(started);
events.clear();
assert.equal(events.peek(), null);
console.log('game-events contract passed');
