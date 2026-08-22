# Pre-Polish Defect Inventory

**Baseline captured:** 2026-08-22  
**Viewports tested:** 1340x800, 1024x600, 390x844  
**Game states captured:** intro, quiet-build, mid-wave-combat, meteor-telegraph, meteor-impact, tower-inspect, tower-upgrade  
**Console errors:** 0  

---

## P0 — Critical (game-breaking or severely impacts playability)

### 1. HUD text overlap makes stats unreadable
**Severity:** P0  
**Location:** `src/phaser/playground-scene.js` — `waveHudText` (line 265-270) and `pointerText` (line 440-444)  
**Issue:** The debug pointer coordinates and wave HUD text overlap in the top-left corner, making critical game state (Spawned/Alive counts, Money, Lives) illegible. The waveHudText is positioned at `y=120*uiScale` but the pointer text at `y=60` and title at `y=20` create a dense, overlapping block.  
**Fix direction:** Move debug pointer text to a dedicated debug overlay (hidden in production) or reposition waveHudText below all title/debug elements with proper spacing.

### 2. Meteor targeting reticle not visible
**Severity:** P0  
**Location:** `src/phaser/ability-bridge.js` — `updateMeteorReticle()` and `src/phaser/playground-scene.js` — pointer input handler (line 254-262)  
**Issue:** When meteor targeting is active, the HUD shows "[TARGETING]" text but there is no visible crosshair, reticle, or aiming indicator on the map. Players cannot see where the meteor will land. The reticle should follow the mouse cursor but is either not rendering or is obscured.  
**Fix direction:** Ensure the reticle sprite is added to the scene with appropriate depth (above terrain, below UI) and is visible against the dark green background. Add a range circle or impact preview.

---

## P1 — High (significantly impacts UX)

### 3. Debug text visible in production build
**Severity:** P1  
**Location:** `src/phaser/playground-scene.js` — `pointerText` (line 440), tower stats `towerHud` (line 179-186, 945-963)  
**Issue:** Raw debug information is displayed to players: "Pointer: (x, y)" coordinates, "pos: (180, 250)" tower position, and unformatted tower stats ("dmg: 1", "rate: 0.9s", "color: #..."). This breaks immersion and confuses new players.  
**Fix direction:** Gate debug text behind a `?debug=true` URL parameter or remove entirely. Format tower stats into a proper inspect panel with icons and labels.

### 4. Tower stats text overlaps action buttons
**Severity:** P1  
**Location:** `src/phaser/playground-scene.js` — `towerHud` positioning (line 179) and button layout (line 278-302)  
**Issue:** The tower inspection text block in the bottom-left corner renders directly over the "Start Waves" button and instruction text, making both partially illegible. The towerHud is positioned at `y=(560+70)*uiScale` which overlaps the button row at `y=scale.height*0.9`.  
**Fix direction:** Reposition towerHud above the instruction bar or to the right side. Ensure no UI element overlaps interactive buttons.

### 5. Onboarding panel obscures gameplay area
**Severity:** P1  
**Location:** `src/phaser/playground-scene.js` — `_createOnboardingPanel()` (line 481-643)  
**Issue:** The "First Run — Quick Guide" panel is positioned at (20, 160) with dimensions 320x250 on desktop, covering the path entrance and first several tower slots. On portrait viewports it's even larger relative to the screen. New players cannot see where to place their first tower.  
**Fix direction:** Reduce panel size, make it collapsible, or position it in a non-critical area (e.g., right side, or as a slide-out drawer). Add a "skip tutorial" option.

### 6. Money count discrepancy between HUD elements
**Severity:** P1  
**Location:** `src/phaser/playground-scene.js` — `_towerTypeLabel()` (line 731-738) and `waveHudText` update (line 708-719)  
**Issue:** The top-left wave HUD shows one money value (e.g., "Money: 172") while the top-right tower type selector shows a different value (e.g., "Money: 160"). This creates confusion about actual resources. The discrepancy appears to be a timing issue where the two text elements update at different frames.  
**Fix direction:** Ensure both HUD elements read from the same controller state snapshot. Update both in the same frame tick.

### 7. No visual differentiation between tower types
**Severity:** P1  
**Location:** `src/phaser/entities/tower-sprite.js` (not in current file list — needs creation)  
**Issue:** All tower types (Tranq, Cannon, Frost, Sniper) render as identical green circles. Players cannot distinguish tower types at a glance, making it impossible to assess coverage or plan upgrades. The only indicator is the text tooltip when hovering.  
**Fix direction:** Create distinct sprites or color-coding for each tower type. Add a visual legend or tower shelf UI showing available types with icons.

---

## P2 — Medium (polish issues)

### 8. Meteor icon resembles traffic cone
**Severity:** P2  
**Location:** `src/phaser/playground-scene.js` — meteor button text (line 343)  
**Issue:** The meteor button uses the emoji "☄️" which renders as an orange triangle/cone on some systems, resembling a traffic cone rather than a meteor. This creates visual confusion about the ability's function.  
**Fix direction:** Replace with a custom meteor sprite or use a more universally recognized meteor icon. Alternatively, add a tooltip on hover explaining the ability.

### 9. Tower type selection relies on keyboard-only cycling
**Severity:** P2  
**Location:** `src/phaser/playground-scene.js` — keyboard handler (line 170)  
**Issue:** Players must press 'T' to cycle through tower types (Tranq → Cannon → Frost → Sniper) with no visual preview of what each type looks like or costs. This is archaic compared to BTD6's visual shop sidebar. New players cannot discover tower types without reading the onboarding text.  
**Fix direction:** Add a tower shelf/sidebar UI with clickable icons for each type, showing cost, range preview, and a small sprite preview.

### 10. Title "Phaser Scale Spike" is confusing
**Severity:** P2  
**Location:** `src/phaser/playground-scene.js` — title text (line 439)  
**Issue:** The title "Jura Defense Phaser Scale Spike" reads like a debug label or feature list rather than a game name. New players may think "Phaser Scale Spike" are game modes or enemy types.  
**Fix direction:** Simplify to "Jura Defense" or "Jura Defense: Tower Defense". Move technical labels to a debug overlay.

### 11. Input box at top-right serves no clear purpose
**Severity:** P2  
**Location:** `src/phaser/playground-scene.js` — (needs investigation, not in current code)  
**Issue:** A black input box with a blinking cursor appears at the top-right of the screen in all captures. It has no label or visible function, confusing players who may think it's a chat box or cheat console.  
**Fix direction:** Remove if unused, or add a label ("Enter cheat code") if it's a debug feature. Gate behind a debug flag.

### 12. Portrait viewport has severe text truncation
**Severity:** P2  
**Location:** `src/phaser/playground-scene.js` — responsive layout logic (line 29-51) and all text elements  
**Issue:** At 390x844 (iPhone portrait), the title is cut off ("Jura Defense Phaser Sc..."), instruction text is truncated ("Ho..."), and tower stats overflow the screen width. The uiScale factor (line 30) shrinks text but doesn't handle wrapping or reflow.  
**Fix direction:** Implement text wrapping for long strings, reduce font sizes further on narrow viewports, or switch to a portrait-specific layout with stacked UI elements.

### 13. No currency icon
**Severity:** P2  
**Location:** `src/phaser/playground-scene.js` — all money display text  
**Issue:** Money is displayed as plain text "Money: 172" with no visual icon (coin, gem, etc.). This makes it less instantly recognizable than BTD6's prominent coin icon.  
**Fix direction:** Add a coin/gem sprite next to the money display. Use consistent iconography across all resource displays.

### 14. Tower stats display as raw debug strings
**Severity:** P2  
**Location:** `src/phaser/playground-scene.js` — `_updateTowerHud()` (line 945-963)  
**Issue:** Tower stats are displayed as unformatted text: "dmg: 1", "rate: 0.9s", "color: #00ff00". This looks like developer output rather than a player-facing UI. The "color:" field is particularly confusing — players don't need to know the hex code.  
**Fix direction:** Create a formatted inspect panel with labeled fields, icons for damage/range/rate, and remove internal data like color hex codes.

---

## Terrain & Environment

- **Path visibility:** Good — thick white line on dark green background provides excellent contrast.
- **Tower slot visibility:** Acceptable — light blue circles are visible but don't "glow" as described in the onboarding text.
- **Terrain decorations:** Rocks/bushes are subtle and don't interfere with gameplay, but some overlap the path making it unclear if enemies walk on or around them.

## Entities (Enemies & Towers)

- **Enemy visibility:** Good — green circles with health bars are visible on the path, though they lack species differentiation (all look identical regardless of type).
- **Tower targeting:** Poor — no visible projectiles or targeting lines. Towers appear to damage enemies instantly with no visual feedback.
- **Health bars:** Acceptable — thin green bars above enemies, but could be thicker for better visibility.

## FX (Effects)

- **Meteor impact:** Minimal — large yellow circle represents blast radius, grey ovals represent smoke. No fire, sparks, or particle effects. Functional but lacks polish.
- **Tower placement:** No visible confirmation effect (should be a green flash or build animation).
- **Enemy death:** No visible death animation (enemies simply disappear).

## Onboarding

- **Panel readability:** Poor on desktop (too large, obscures gameplay), acceptable on narrow viewports (smaller relative size).
- **Dismissibility:** Good — "Got it ✕" button is visible and functional.
- **Content coverage:** Complete — covers all required action keys (slot selection, tower cycling, upgrade, sell, start, pause, speed, meteor, chrono).

## Responsive Layout

- **1340x800 (desktop):** Acceptable — all UI elements visible, though some overlap issues.
- **1024x600 (netbook):** Good — layout scales well, minor crowding at bottom-left.
- **390x844 (portrait mobile):** Poor — severe text truncation, overlapping elements, cut-off titles. Needs a dedicated portrait layout.

---

## Summary

**Total defects:** 14  
**P0 (critical):** 2  
**P1 (high):** 5  
**P2 (medium):** 7  

**Top priorities for polish:**
1. Fix HUD text overlap (P0-1) — affects all gameplay
2. Add meteor targeting reticle (P0-2) — core ability unusable
3. Remove debug text from production (P1-3) — breaks immersion
4. Create distinct tower type visuals (P1-7) — essential for strategy
5. Implement portrait-specific layout (P2-12) — mobile usability

**Console errors:** 0 — all captures ran cleanly.  
**Source files modified:** 0 — this is a read-only baseline capture.
