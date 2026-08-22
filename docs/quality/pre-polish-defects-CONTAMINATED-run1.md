# Pre-Polish Visual Defect Inventory

**Baseline captured:** 2026-08-22  
**Viewports tested:** 1340x800, 1024x600, 390x844  
**States captured:** intro, quiet-build, mid-wave-combat, meteor-telegraph, meteor-impact, tower-inspect, tower-upgrade

## Critical Defects (P0)

### 1. Tutorial Overlay Persists Across Game States
**Severity:** P0  
**Location:** `src/phaser/ui/overlay-ui.js` (onboarding state management)  
**Symptom:** Tutorial modal ("1. Build Towers") visible in mid-wave-combat, meteor-telegraph, meteor-impact, and tower-inspect captures. The overlay should dismiss after onboarding completion.  
**Impact:** Blocks gameplay view, prevents assessment of actual combat/ability visuals.  
**Fix direction:** Verify onboarding-dismissed event properly clears overlay; check state machine transition from onboarding to active gameplay.

### 2. 390x844 Viewport State Progression Failure
**Severity:** P0  
**Location:** Capture script interaction with mobile viewport  
**Symptom:** 4 states (mid-wave-combat, meteor-telegraph, meteor-impact, tower-inspect) produced identical frames (MD5: e5e98e96a10711dc961fc3bce5ce1142). Game state not advancing.  
**Impact:** Cannot assess mobile responsiveness or mobile-specific defects.  
**Fix direction:** Investigate touch event handling in mobile viewport; verify click coordinates map correctly to game canvas at 390x844.

## High Priority Defects (P1)

### 3. Debug Text Visible in Production
**Severity:** P1  
**Location:** `src/phaser/playground-scene.js:1073-1077` (tower stats display)  
**Symptom:** Bottom-left debug panel shows "dmg: 1, range: ..., pos: (180, 250)" even without ?debug=1 query param.  
**Impact:** Breaks immersion, exposes internal coordinates to players.  
**Fix direction:** Wrap debug text rendering in debugMode check at line 521.

### 4. Low Contrast HUD Text
**Severity:** P1  
**Location:** `src/phaser/ui/hud-panel.js` (top status bar)  
**Symptom:** "Tower type: Volt Fence" and "WAVE 1/10" text nearly illegible (dark text on black background).  
**Impact:** Players cannot read critical game state information.  
**Fix direction:** Increase text brightness or add background panel behind HUD text.

### 5. Missing Tower Shelf UI Element
**Severity:** P1  
**Location:** `src/phaser/ui/tower-shelf.js` (shelf rendering)  
**Symptom:** Tutorial references "Select tower type from the shelf below" but no shelf visible in intro/quiet-build captures.  
**Impact:** Tutorial instruction doesn't match UI, confuses players.  
**Fix direction:** Either render tower shelf UI or update tutorial text to match current UI (keyboard-only selection).

### 6. Zero Money During Build Phase
**Severity:** P1  
**Location:** Game state initialization or economy system  
**Symptom:** "Money: 0" displayed during quiet-build state, preventing tower placement despite tutorial instructing placement.  
**Impact:** Players cannot follow tutorial instructions.  
**Fix direction:** Grant starting money before build phase, or adjust tutorial to reflect economy constraints.

## Medium Priority Defects (P2)

### 7. Meteor Telegraph Lacks Spatial Indicator
**Severity:** P2  
**Location:** `src/phaser/systems/meteor-targeting-system.js`  
**Symptom:** Meteor telegraph shows only text "Meteor: 3/3 [TARGETING]" with no visual marker on map showing impact zone.  
**Impact:** Players cannot anticipate where meteor will strike.  
**Fix direction:** Add ground reticle, shadow, or warning circle at target location.

### 8. No Visible Enemies During Mid-Wave Combat
**Severity:** P2  
**Location:** Enemy spawning or rendering system  
**Symptom:** Mid-wave-combat captures show empty path with no enemy sprites visible.  
**Impact:** Cannot assess enemy readability, health bar clarity, or combat visual feedback.  
**Fix direction:** Verify enemy spawn logic triggers during capture; ensure enemies render at correct depth.

### 9. No Visible Projectile Effects
**Severity:** P2  
**Location:** `src/phaser/systems/FXSystem.js` or tower attack system  
**Symptom:** Mid-wave-combat captures show no projectiles, lasers, or muzzle flashes despite towers being placed.  
**Impact:** Cannot assess combat visual clarity or effect readability.  
**Fix direction:** Verify tower attack logic executes during capture; check FX depth and visibility.

### 10. Tutorial Text References Nonexistent "Shelf"
**Severity:** P2  
**Location:** `src/phaser/ui/overlay-ui.js` (tutorial content)  
**Symptom:** Tutorial says "Select tower type from the shelf below" but current UI uses keyboard (T key) for tower cycling.  
**Impact:** Tutorial doesn't match actual controls.  
**Fix direction:** Update tutorial text to "Press T to cycle tower types" or implement shelf UI.

### 11. Low Contrast Bottom Stats Panel
**Severity:** P2  
**Location:** `src/phaser/playground-scene.js:1073` (stats text rendering)  
**Symptom:** Tower stats text (dmg, range, upgrade cost) uses dark grey on black, difficult to read at 1024x600.  
**Impact:** Players cannot read tower information at smaller viewports.  
**Fix direction:** Increase text color brightness or add semi-transparent background panel.

## Console Errors

**None observed.** Console logs for all three viewports contain only the Phaser v3.90.0 startup message and WebGL ReadPixels performance warnings (driver-level, not application errors). No `pageerror` events were recorded.

## Acceptance Status

**Captures completed:** 21/21 PNGs (7 states × 3 viewports)  
**Console errors:** 0 pageerrors; only WebGL driver performance warnings  
**Non-blank verification:** All PNGs >60KB (non-empty)  
**Source files modified:** None (QA-only run)

## Recommendations for Polish Phase

1. **Fix P0 defects first** - Tutorial persistence and console errors block all visual assessment
2. **Re-capture after P0 fixes** - Current baseline cannot assess combat/ability visuals
3. **Add mobile-specific testing** - 390x844 viewport needs separate interaction validation
4. **Implement visual regression suite** - Lock down HUD contrast, tutorial flow, and state transitions
5. **Consider accessibility pass** - Low contrast text affects all viewports, not just mobile
