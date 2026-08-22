export const GAME_PHASE = Object.freeze({
  INTRO: 'INTRO',
  PLAYING: 'PLAYING',
  PAUSED: 'PAUSED',
  VICTORY: 'VICTORY',
  DEFEAT: 'DEFEAT',
});

export function createInitialGameState(overrides = {}) {
  const base = {
    phase: GAME_PHASE.INTRO,
    money: 200,
    lives: 20,
    wave: 1,
    totalWaves: 10,
    paused: false,
    over: false,
    victory: false,
    timeScale: 1,
    meteorTargeting: false,
    selectedTowerId: null,
    buildType: null,
  };
  return { ...base, ...overrides };
}

export function cloneGameState(state) {
  if (state === null || typeof state !== 'object') return state;
  if (Array.isArray(state)) return state.map(cloneGameState);
  const clone = {};
  for (const key of Object.keys(state)) clone[key] = cloneGameState(state[key]);
  return clone;
}

export function transitionGamePhase(state, phase) {
  const next = cloneGameState(state);
  next.phase = phase;
  switch (phase) {
    case GAME_PHASE.INTRO:
    case GAME_PHASE.PLAYING:
      next.paused = false; next.over = false; next.victory = false; break;
    case GAME_PHASE.PAUSED:
      next.paused = true; next.over = false; next.victory = false; break;
    case GAME_PHASE.VICTORY:
      next.paused = false; next.over = true; next.victory = true; break;
    case GAME_PHASE.DEFEAT:
      next.paused = false; next.over = true; next.victory = false; break;
    default: throw new Error(`Unknown game phase: ${phase}`);
  }
  return next;
}

export function assertGameState(state) {
  if (state === null || typeof state !== 'object') throw new Error('Invalid game state: expected an object');
  if (typeof state.money !== 'number' || !Number.isFinite(state.money) || state.money < 0) throw new Error(`Invalid money: ${state.money}`);
  if (typeof state.lives !== 'number' || !Number.isFinite(state.lives) || state.lives < 0) throw new Error(`Invalid lives: ${state.lives}`);
  if (typeof state.wave !== 'number' || !Number.isFinite(state.wave) || state.wave < 1) throw new Error(`Invalid wave: ${state.wave}`);
  if (typeof state.timeScale !== 'number' || !Number.isFinite(state.timeScale) || state.timeScale <= 0) throw new Error(`Invalid timeScale: ${state.timeScale}`);
  if (!Object.values(GAME_PHASE).includes(state.phase)) throw new Error(`Invalid phase: ${state.phase}`);
}
