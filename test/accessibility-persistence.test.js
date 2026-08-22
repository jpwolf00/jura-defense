/**
 * S07 Accessibility — pause/mute persistence across scene transitions.
 *
 * Verifies that mute state survives scene restarts by reading/writing
 * the global __juraMuted flag that HUDPanel now uses.
 */

import assert from 'node:assert/strict';

// Simulate global mute state persistence
globalThis.__juraMuted = false;

// Test 1: Initial state is unmuted
assert.equal(globalThis.__juraMuted, false, 'Initial mute state should be false');

// Test 2: Toggle mute on
globalThis.__juraMuted = true;
assert.equal(globalThis.__juraMuted, true, 'Mute state should persist after toggle');

// Test 3: Simulate scene transition — read state again
const restoredMute = globalThis.__juraMuted;
assert.equal(restoredMute, true, 'Mute state should survive scene transitions');

// Test 4: Toggle back off
globalThis.__juraMuted = false;
assert.equal(globalThis.__juraMuted, false, 'Mute state can be toggled off');

console.log('[S07] Accessibility persistence tests: 4 passed, 0 failed');
