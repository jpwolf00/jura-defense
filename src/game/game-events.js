export const EVENT_TYPE = Object.freeze({
  GAME_STARTED: 'GAME_STARTED',
  WAVE_STARTED: 'WAVE_STARTED',
  WAVE_CLEARED: 'WAVE_CLEARED',
  ENEMY_SPAWNED: 'ENEMY_SPAWNED',
  ENEMY_DAMAGED: 'ENEMY_DAMAGED',
  ENEMY_DIED: 'ENEMY_DIED',
  ENEMY_LEAKED: 'ENEMY_LEAKED',
  TOWER_PLACED: 'TOWER_PLACED',
  TOWER_UPGRADED: 'TOWER_UPGRADED',
  TOWER_SOLD: 'TOWER_SOLD',
  METEOR_TARGETED: 'METEOR_TARGETED',
  METEOR_IMPACTED: 'METEOR_IMPACTED',
  CHRONO_REWOUND: 'CHRONO_REWOUND',
  GAME_PAUSED: 'GAME_PAUSED',
  GAME_RESUMED: 'GAME_RESUMED',
  SPEED_CHANGED: 'SPEED_CHANGED',
  MONEY_SPENT: 'MONEY_SPENT',
  MONEY_REFUNDED: 'MONEY_REFUNDED',
  MONEY_AWARDED: 'MONEY_AWARDED',
  LIVES_LOST: 'LIVES_LOST',
  GAME_VICTORY: 'GAME_VICTORY',
  GAME_DEFEAT: 'GAME_DEFEAT',
  GAME_RESTARTED: 'GAME_RESTARTED',
});

export function createGameEvent(type, payload = {}, at = 0) {
  return { type, payload, at };
}

export function isGameEvent(value) {
  return Boolean(value && typeof value === 'object'
    && typeof value.type === 'string'
    && value.payload && typeof value.payload === 'object'
    && typeof value.at === 'number' && Number.isFinite(value.at));
}

export function createEventBuffer() {
  const buffer = [];
  return {
    push(event) {
      if (!isGameEvent(event)) throw new Error('Invalid game event');
      buffer.push(event);
    },
    drain() { return buffer.splice(0, buffer.length); },
    peek() { return buffer[0] || null; },
    clear() { buffer.length = 0; },
    size() { return buffer.length; },
  };
}
