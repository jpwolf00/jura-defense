# Ten-Wave Run Harness Summary

## What Was Built

A deterministic browser-compatible test harness that exercises the Phaser WaveBridge/CombatBridge contract using existing Canvas Enemy/Tower/WaveManager rules. The harness validates spawning, kill rewards, leak/lives accounting, wave-clear gating, and final victory/defeat without inventing gameplay values.

## Files Created

- `tests/ten_wave_run_harness.mjs` — 14KB harness with 4 test scenarios

## Test Scenarios

### 1. Victory Run (Towers Kill All Enemies)
- **Setup**: 7 high-damage towers (heli + chrono) placed at strategic slots
- **Result**: 
  - 123 enemies spawned across 10 waves
  - 121 killed, 2 leaked (pteranodons with freeFly bypass some towers)
  - All 10 waves cleared
  - Final phase: VICTORY
  - Money: 1605 (160 initial + 1445 from kill rewards)
  - Lives: 18 (20 initial - 2 leaks)
  - Simulation time: 313.63s

### 2. Defeat Run (No Towers, All Enemies Leak)
- **Setup**: No towers placed
- **Result**:
  - 31 enemies spawned across 3 waves (game ends when lives = 0)
  - 0 killed, 20 leaked
  - Final phase: DEFEAT
  - Money: 160 (no kill rewards)
  - Lives: 0
  - Simulation time: 102.87s

### 3. Wave-Clear Gating
- **Setup**: No towers, tracks wave completion
- **Result**:
  - Wave 1 spawning completes at 0.00s
  - 6 enemies alive when spawning completes
  - All wave 1 enemies gone at 28.58s
  - Confirms wave doesn't advance until all spawned enemies are gone

### 4. Mixed Scenario (Some Killed, Some Leaked)
- **Setup**: 1 drone tower (low damage)
- **Result**:
  - 31 enemies spawned across 3 waves
  - 10 killed, 20 leaked
  - Final phase: DEFEAT
  - Money: 226 (160 initial + 66 from kill rewards)
  - Lives: 0 (20 initial - 20 leaks)

## Validation Results

**All 24 assertions passed:**
- ✓ Spawning works correctly
- ✓ Kill rewards applied (money increases by enemy.reward)
- ✓ Leak accounting works (lives decrease by 1 per leak)
- ✓ Wave-clear gating enforced (wave doesn't advance until all enemies gone)
- ✓ Victory/defeat transitions work
- ✓ Money and lives accounting matches expected values

## Existing Tests Still Pass

- `tests/wave_bridge_contract.mjs`: 28 passed, 0 failed
- `tests/economy_endstate_contract.mjs`: All passed

## Build Status

- Syntax checks: ✓ All source files pass
- npm build: ✓ Successful (2.46s)
- No runtime bugs found in Phaser/bridge code

## Key Findings

1. **Pteranodon freeFly behavior**: Pteranodons with `freeFly: true` take a different path that may bypass some towers. This is correct game behavior, not a bug.

2. **Wave-clear gating works correctly**: The WaveBridge waits for all spawned enemies to be gone (killed or leaked) before advancing to the next wave.

3. **Economy accounting is deterministic**: Kill rewards and leak penalties are applied correctly, matching the existing Canvas rules.

4. **No bridge bugs**: The Phaser WaveBridge and CombatBridge correctly implement the existing Canvas Enemy/Tower/WaveManager rules without inventing new gameplay values.

## Usage

```bash
# Run the harness
node tests/ten_wave_run_harness.mjs

# Run existing tests
node tests/wave_bridge_contract.mjs
node tests/economy_endstate_contract.mjs

# Build
npm run build
```

## Browser Compatibility

The harness is browser-compatible and uses:
- Existing Canvas Enemy/Tower/WaveManager rules (no duplication)
- Mock performance.now() for determinism
- Minimal Phaser scene stub for sprite creation
- No external dependencies beyond the existing codebase

## Conclusion

The ten-wave run harness successfully validates the Phaser WaveBridge/CombatBridge contract. It exercises all critical paths (spawning, rewards, leaks, wave-clear, victory/defeat) using existing Canvas rules, proving the Phaser implementation is a faithful parity slice without invented gameplay values.
