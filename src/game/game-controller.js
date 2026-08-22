import { createInitialGameState, cloneGameState, transitionGamePhase, assertGameState } from './game-state.js';
import { EVENT_TYPE, createGameEvent, createEventBuffer } from './game-events.js';

export function createGameController(overrides = {}) {
  const initialOverrides = cloneGameState(overrides);
  let state = createInitialGameState(initialOverrides);
  const listeners = new Set();
  const eventBuffer = createEventBuffer();

  const notify = (event) => {
    const snapshot = cloneGameState(state);
    listeners.forEach((listener) => {
      try { listener(snapshot, event); } catch { /* listener isolation */ }
    });
  };

  const emit = (type, payload = {}) => {
    const event = createGameEvent(type, payload);
    eventBuffer.push(event);
    notify(event);
    return event;
  };

  const start = () => {
    assertGameState(state);
    if (state.phase !== 'INTRO') return null;
    state = transitionGamePhase(state, 'PLAYING');
    return emit(EVENT_TYPE.GAME_STARTED, { phase: state.phase });
  };

  const pauseToggle = () => {
    assertGameState(state);
    if (state.phase === 'PLAYING') {
      state = transitionGamePhase(state, 'PAUSED');
      return emit(EVENT_TYPE.GAME_PAUSED, { phase: state.phase });
    }
    if (state.phase === 'PAUSED') {
      state = transitionGamePhase(state, 'PLAYING');
      return emit(EVENT_TYPE.GAME_RESUMED, { phase: state.phase });
    }
    return null;
  };

  const setSpeed = (speed) => {
    if (speed !== 1 && speed !== 2) throw new Error('Speed must be 1 or 2');
    state = { ...state, timeScale: speed };
    assertGameState(state);
    return emit(EVENT_TYPE.SPEED_CHANGED, { speed });
  };

  const setWave = (wave) => {
    if (!Number.isInteger(wave) || wave < 1) throw new Error('Wave must be a positive integer');
    state = { ...state, wave };
    assertGameState(state);
    return emit(EVENT_TYPE.WAVE_STARTED, { wave });
  };

  const victory = () => {
    assertGameState(state);
    if (state.phase !== 'PLAYING' && state.phase !== 'PAUSED') return null;
    state = transitionGamePhase(state, 'VICTORY');
    return emit(EVENT_TYPE.GAME_VICTORY, { phase: state.phase });
  };

  const defeat = () => {
    assertGameState(state);
    if (state.phase !== 'PLAYING' && state.phase !== 'PAUSED') return null;
    state = transitionGamePhase(state, 'DEFEAT');
    return emit(EVENT_TYPE.GAME_DEFEAT, { phase: state.phase });
  };

  const restart = () => {
    state = createInitialGameState(initialOverrides);
    assertGameState(state);
    return emit(EVENT_TYPE.GAME_RESTARTED, { phase: state.phase });
  };

  const spendMoney = (amount, description = '') => {
    assertGameState(state);
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new Error('spendMoney: amount must be a positive integer');
    }
    if (state.money < amount) {
      throw new Error(`spendMoney: insufficient funds (have ${state.money}, need ${amount})`);
    }
    state = { ...state, money: state.money - amount };
    assertGameState(state);
    return emit(EVENT_TYPE.MONEY_SPENT, { amount, description, moneyAfter: state.money });
  };

  const refundMoney = (amount, description = '') => {
    assertGameState(state);
    if (!Number.isInteger(amount) || amount >= 0) {
      throw new Error('refundMoney: amount must be a negative integer');
    }
    const refund = -amount;
    state = { ...state, money: state.money + refund };
    assertGameState(state);
    return emit(EVENT_TYPE.MONEY_REFUNDED, { amount, description, moneyAfter: state.money });
  };

  const awardMoney = (amount, description = '') => {
    assertGameState(state);
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new Error('awardMoney: amount must be a positive integer');
    }
    state = { ...state, money: state.money + amount };
    assertGameState(state);
    return emit(EVENT_TYPE.MONEY_AWARDED, { amount, description, moneyAfter: state.money });
  };

  const deductLives = (count, reason = '') => {
    assertGameState(state);
    if (!Number.isInteger(count) || count <= 0) {
      throw new Error('deductLives: count must be a positive integer');
    }
    state = { ...state, lives: state.lives - count };
    assertGameState(state);
    return emit(EVENT_TYPE.LIVES_LOST, { count, reason, livesAfter: state.lives });
  };

  const awardEnemyReward = (enemy) => {
    assertGameState(state);
    if (!enemy || typeof enemy !== 'object') {
      throw new Error('awardEnemyReward: enemy must be an object');
    }
    const reward = enemy.reward;
    if (!Number.isInteger(reward) || reward <= 0) {
      throw new Error(`awardEnemyReward: enemy.reward must be a positive integer, got ${reward}`);
    }
    state = { ...state, money: state.money + reward };
    assertGameState(state);
    return emit(EVENT_TYPE.MONEY_AWARDED, {
      amount: reward,
      description: `enemy:${enemy.type || 'unknown'}`,
      moneyAfter: state.money,
      enemyUid: enemy.uid,
    });
  };

  const applyLeakPenalty = (enemy, penalty = 1) => {
    assertGameState(state);
    if (!enemy || typeof enemy !== 'object') {
      throw new Error('applyLeakPenalty: enemy must be an object');
    }
    if (!Number.isInteger(penalty) || penalty <= 0) {
      throw new Error('applyLeakPenalty: penalty must be a positive integer');
    }
    // Clamp lives at zero, never allow negative
    const newLives = Math.max(0, state.lives - penalty);
    state = { ...state, lives: newLives };
    assertGameState(state);
    const event = emit(EVENT_TYPE.LIVES_LOST, {
      count: penalty,
      reason: `leak:${enemy.type || 'unknown'}`,
      livesAfter: state.lives,
      enemyUid: enemy.uid,
    });
    // Transition to DEFEAT if lives reach zero
    if (state.lives === 0 && state.phase === 'PLAYING') {
      state = transitionGamePhase(state, 'DEFEAT');
      emit(EVENT_TYPE.GAME_DEFEAT, { phase: state.phase, reason: 'lives_depleted' });
    }
    return event;
  };

  return {
    getState: () => cloneGameState(state),
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    start,
    pauseToggle,
    setSpeed,
    setWave,
    victory,
    defeat,
    restart,
    spendMoney,
    refundMoney,
    awardMoney,
    deductLives,
    awardEnemyReward,
    applyLeakPenalty,
    emit,
    drainEvents: () => eventBuffer.drain(),
  };
}
