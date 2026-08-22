# Jura Defense Phaser + Commercial-Quality Backlog

> **For Hermes:** Execute one story at a time through the configured local coding agents. Hermes is the orchestrator/reviewer: inspect every diff, resolve integration issues only when necessary, run the validation gates, and deploy only after verification.

**Goal:** Migrate Jura Defense from the current Canvas renderer to Phaser in controlled stages, then bring its authored maps, assets, UI, gameplay feedback, audio, and QA to a commercially credible 2D tower-defense standard.

**Architecture:** Keep gameplay rules independent from rendering and migrate behind adapters rather than rewriting everything at once. The current deterministic path, tower slots, wave/economy rules, enemy state, abilities, and rewind semantics are the behavioral source of truth. Phaser becomes the presentation/runtime layer only after a spike proves asset loading, scaling, input, and scene lifecycle.

**Tech Stack:** Phaser 3, ES modules, JavaScript initially, Vite only if required by Phaser asset/module loading, Playwright for browser QA, existing generated art plus curated CC0 assets, ComfyUI for missing art where useful.

---

## Current code review

### Repository state

- Source workspace: `/Users/jasonwolf/jura-defense`
- Deployment Git repository: `/tmp/jura-deploy`
- Current deployed revision: `aba7ecb Story 13: seeded terrain layout metadata`
- Source workspace itself currently has no `.git` directory; do not assume commits can be made there.
- Current app has no `package.json`, Phaser dependency, Phaser import, scene class, or build pipeline.

### Current strengths

- Core loop is playable: path, towers, enemies, waves, economy, victory/defeat.
- Existing modules are already separable: `main.js`, `path.js`, `enemy.js`, `tower.js`, `wave.js`, `meteor.js`, `chrono.js`, `fx.js`, `sfx.js`, `terrain.js`.
- Virtual game space is defined as `1280x720` in `src/js/path.js`.
- Tower slots and the S-curve are deterministic and readable.
- Current live validation has passed 10 waves, victory, mobile overflow checks, and basic combat captures.
- Existing UI has explicit pause, fast-forward, meteor, chrono, shop, tower inspection, and end-screen controls.
- Current terrain rendering is cached and the generated `src/assets/terrain_bg.png` is a stronger visual foundation than the original procedural wash.

### Current weaknesses / migration risks

- `src/js/main.js` owns DOM setup, state, input, loop, drawing orchestration, and UI synchronization; it is the main migration hotspot.
- `src/js/terrain.js` still owns a custom Canvas renderer. The active generated terrain plate short-circuits the procedural fallback, so the new seeded `src/js/map-layout.js` metadata does not yet create visible map variation on the live plate.
- Enemy and tower visuals remain mostly single-frame assets with custom Canvas transforms and fallback drawing.
- `src/js/sprites.js` contains large embedded sprite data; it should not be copied into a Phaser scene or rewritten casually.
- There is no formal asset manifest, atlas pipeline, map authoring format, or build-time asset validation.
- Full interaction validation is still incomplete for pause/fast-forward/chrono/meteor/restart edge cases.
- The current responsive layout is a Canvas letterbox plus DOM sidebar; Phaser must preserve the established landscape-first behavior.
- A full rewrite would risk regressions in chrono rewind, wave completion guards, tower targeting, economy, and coordinate conversion.

### Commercial-quality target

Use Bloons TD 6 as the readability benchmark, not as an art-copy target. The release bar requires:

- Terrain with authored regions, landmarks, and route readability.
- Distinct silhouettes and roles for every enemy and tower.
- Clear target, range, damage, status, upgrade, and ability feedback.
- Consistent art direction and lighting across terrain, sprites, UI, and effects.
- Responsive landscape mobile presentation with deliberate portrait fallback.
- Reliable pause, speed, rewind, abilities, victory, defeat, and restart behavior.
- No runtime errors, broken assets, visible placeholder art, severe aliasing, or interaction dead ends.

---

## Operating rules for local-agent implementation

1. Dispatch exactly one implementation story at a time.
2. Local agents write code; Hermes reviews and applies only accepted output.
3. Use the configured local Qwen agents for implementation proposals and code. Keep routine coding at LOW/OFF thinking; never use xhigh.
4. Give the agent exact current file contents or a precise contract. Do not ask an agent to explore indefinitely.
5. Every accepted story must include:
   - `node --check` or the appropriate build check;
   - targeted unit/contract tests;
   - Playwright/E2E browser validation;
   - console/runtime error inspection;
   - visual screenshots at desktop and relevant mobile sizes.
6. No deployment until the story passes its acceptance gates.
7. Do not remove the Canvas implementation until Phaser has parity for the validated gameplay loop and a rollback path exists.
8. Hermes may manually resolve invalid/truncated agent output, but must disclose the exception in the story log.

---

# Phase 0 — Baseline and migration safety

## P0-01 — Freeze current behavior as a regression contract

**Objective:** Capture the current Canvas game behavior before introducing Phaser.

**Likely files:**
- Create: `tests/regression_baseline.mjs`
- Create: `tests/interaction_contract.mjs`
- Reference: `src/js/main.js`, `src/js/wave.js`, `src/js/chrono.js`, `src/js/meteor.js`

**Acceptance:**
- Boot, start wave, place tower, target enemy, pause/resume, fast-forward, meteor, chrono, victory, defeat, and restart each have explicit assertions where supported by the current UI.
- Baseline records no console errors and saves screenshots.
- Existing 10-wave victory strategy remains green.

## P0-02 — Extract renderer-independent game contracts

**Objective:** Define plain state/event interfaces so Phaser does not depend on Canvas internals.

**Likely files:**
- Create: `src/game/game-state.js`
- Create: `src/game/game-events.js`
- Modify: `src/js/main.js` only where state access is normalized
- Test: `tests/game_state_contract.mjs`

**Acceptance:**
- Rules remain deterministic and testable without a browser canvas.
- No behavior changes to path distance, tower targeting, wave progression, economy, meteor, or chrono.

## P0-03 — Establish a real package/build/test shell

**Objective:** Add the smallest build system required by Phaser without breaking the current static build.

**Likely files:**
- Create: `package.json`
- Create: `vite.config.js`
- Create: `src/main.js` or equivalent entry only if required
- Modify: `src/index.html`
- Create: `tests/phaser_boot_contract.mjs`

**Acceptance:**
- `npm install` and `npm run build` succeed.
- Existing static/live capture still works during the transition.
- Build output has no missing asset warnings.

---

# Phase 1 — Phaser proof of value

## P1-01 — Phaser boot and responsive scale spike

**Objective:** Prove Phaser can render the existing `1280x720` world with the current landscape and portrait behavior.

**Likely files:**
- Create: `src/phaser/game-config.js`
- Create: `src/phaser/scenes/BootScene.js`
- Create: `src/phaser/scenes/PreloadScene.js`
- Create: `src/phaser/scenes/PlaygroundScene.js`
- Modify: `src/index.html`

**Acceptance:**
- Phaser boots in the browser.
- Scale mode preserves the virtual world and does not distort the path.
- Pointer coordinates map correctly under desktop, 800x480 landscape, and 390x844 portrait.
- Existing Canvas entry remains available behind a feature flag or separate route.

## P1-02 — Phaser asset manifest and atlas spike

**Objective:** Prove generated sprites and selected curated assets load predictably through Phaser.

**Likely files:**
- Create: `src/assets/manifest.js`
- Create: `src/assets/atlas/` output or manifest metadata
- Create: `tests/asset_manifest_contract.mjs`
- Modify: `src/phaser/scenes/PreloadScene.js`

**Acceptance:**
- Portal, hero background, all current tower sprites, and all current enemy sprites load.
- Missing or malformed assets fail with a readable diagnostic rather than a silent blank.
- Asset dimensions and anchor metadata are explicit.
- The large embedded `src/js/sprites.js` payload is not duplicated unnecessarily.

## P1-03 — Phaser/Canvas parity decision gate

**Objective:** Decide whether Phaser provides enough benefit to continue before porting gameplay.

**Review criteria:**
- Startup and first interaction remain responsive.
- Coordinate conversion is simpler or more reliable.
- Asset loading/animation is materially better.
- Mobile scaling is no worse.
- No unacceptable bundle or deployment complexity.

**Gate:** Hermes records `CONTINUE_PHASER` or `ROLLBACK_CANVAS` with evidence. No broad port proceeds without `CONTINUE_PHASER`.

---

# Phase 2 — Port the playable loop behind adapters

## P2-01 — Port deterministic path and slot map

**Files:** `src/phaser/world/path-layer.js`, `src/phaser/world/slot-layer.js`, `src/js/path.js`

**Acceptance:** Same waypoints, route width, spawn/end positions, and tower-slot coordinates as Canvas. Visual route remains more prominent than terrain.

## P2-02 — Port terrain/map composition

**Files:** `src/phaser/world/TerrainLayer.js`, `src/js/map-layout.js`, `src/assets/maps/map-01.json`

**Acceptance:**
- Authoritative gameplay route is never generated by AI art.
- At least two authored map layouts use the same rules with different terrain regions, clearings, and landmarks.
- Seeded variation is visible in the active renderer rather than only in an unreachable fallback.
- Map layout is cached and does not recompose every frame.

## P2-03 — Port enemies and movement

**Files:** `src/phaser/entities/EnemySprite.js`, `src/phaser/systems/EnemySystem.js`, `src/js/enemy.js`

**Acceptance:**
- Enemy rules remain data-compatible with current species, armor, slow, death, leak, and facing behavior.
- Sprite flipping and optional multi-frame animation work.
- Enemy movement matches the deterministic path contract.

## P2-04 — Port towers, targeting, projectiles, and upgrades

**Files:** `src/phaser/entities/TowerSprite.js`, `src/phaser/systems/TargetingSystem.js`, `src/phaser/entities/ProjectileSprite.js`, `src/js/tower.js`

**Acceptance:**
- All tower types preserve cost, range, rate, damage, targeting, upgrade, sell, and live inspection behavior.
- Tower silhouettes and target lines/readability survive mobile scaling.
- No duplicate barrels or incorrect sprite rotation return.

## P2-05 — Port wave/economy/end-state scenes

**Files:** `src/phaser/scenes/PlayScene.js`, `src/phaser/scenes/UIScene.js`, `src/phaser/scenes/EndScene.js`, `src/js/wave.js`

**Acceptance:**
- Wave preview, clearing guard, rewards, victory, defeat, and restart all pass the baseline contract.
- Pause freezes simulation and preserves UI state.
- Fast-forward changes simulation speed without breaking cooldowns or rewind history.

## P2-06 — Port meteor and chrono rewind

**Files:** `src/phaser/systems/MeteorSystem.js`, `src/phaser/systems/ChronoSystem.js`, `src/js/meteor.js`, `src/js/chrono.js`

**Acceptance:**
- Meteor telegraph, impact, damage, knockback, scorch, shake, charges, and cooldown match baseline.
- Chrono rewind visibly rewinds valid enemy history without corrupting wave state, money, tower state, or victory/defeat transitions.
- Direct interaction harness passes with no console errors.

---

# Phase 3 — Commercial-quality art, UI, and game feel

## P3-01 — Authored terrain kit and map atlas

**Files:** `src/assets/terrain/`, `src/assets/props/`, `src/assets/maps/`, `src/assets/manifest.js`, `src/phaser/world/TerrainLayer.js`

**Objective:** Replace the single static plate as the primary visual foundation.

**Acceptance:**
- Terrain tiles/patches, cliffs, rocks, vegetation, water/mud regions, rig landmarks, and route shoulders share one art direction.
- Kenney CC0 assets are used only where restyled/consistent enough; raw mismatched assets are rejected.
- At least two maps are visibly distinct but equally readable.
- No path branching, accidental tower-slot obstruction, or decorative clutter near the route.

## P3-02 — Enemy and tower silhouette/readability pass

**Files:** `src/assets/`, `src/phaser/entities/`, `src/phaser/ui/`

**Acceptance:**
- Each enemy species reads at gameplay scale in under one second.
- Each tower role has a distinct silhouette, color accent, firing signature, and upgrade feedback.
- Art anchors, shadows, hit points, and facing are consistent.

## P3-03 — Animation pass

**Files:** `src/assets/atlases/`, `src/phaser/animation/`, entity classes

**Acceptance:**
- Raptor, hadro, triceratops, anky, trex, and pterano have stable movement/death states where art supports it.
- No perspective drift or video-derived frame artifacts.
- Single-frame fallback remains available for assets without trustworthy animation.

## P3-04 — UI/HUD and onboarding pass

**Files:** `src/phaser/ui/`, `src/index.html`, `src/assets/ui/`

**Acceptance:**
- First-time player understands build, start wave, pause, fast-forward, meteor, chrono, upgrade, and sell without reading source text.
- Selected-tower card communicates live target, stats, upgrade cost, and sell value.
- Desktop and landscape mobile are production layouts; portrait is deliberately contained rather than merely letterboxed.

## P3-05 — FX/audio mix pass

**Files:** `src/phaser/systems/FXSystem.js`, `src/phaser/systems/AudioSystem.js`, `src/js/fx.js`, `src/js/sfx.js`

**Acceptance:**
- Hits, kills, slows, armor, tower fire, meteor, chrono, wave start, victory, and defeat have distinct feedback.
- Effects never obscure route or enemy identity.
- Audio starts only after interaction, supports mute, and has balanced volume priorities.

## P3-06 — Accessibility and usability pass

**Files:** `src/phaser/ui/`, `src/index.html`, `src/styles/`

**Acceptance:**
- Color is not the only status indicator.
- Text remains readable at target mobile sizes.
- Buttons have clear active/disabled states and usable touch targets.
- Pause and mute are reliable and discoverable.

---

# Phase 4 — Production gates and release

## P4-01 — Automated regression suite

**Files:** `tests/`

**Acceptance:**
- Deterministic game-state tests.
- Asset manifest tests.
- Map route/slot clearance tests.
- Playwright desktop, landscape, and portrait tests.
- Full 10-wave victory run.
- Defeat/restart run.
- Pause/fast-forward/meteor/chrono interaction run.
- Zero console errors and failed network asset requests.

## P4-02 — Performance and device pass

**Acceptance:**
- Cached terrain and atlases remain within acceptable memory.
- No frame-rate collapse from particles or many enemies.
- Test at desktop and target mobile dimensions.
- Asset loading has a visible preload state and no flash of broken imagery.

## P4-03 — Visual QA and release candidate

**Acceptance:**
- Hermes reviews screenshots/video for desktop, landscape, portrait, and live deployment.
- No placeholder/procedural-looking hero art remains where authored art is expected.
- Route, towers, enemies, HUD, and effects remain legible during maximum combat density.
- Release candidate is deployed only from a clean, verified deployment repository.

## P4-04 — Remove Canvas fallback only after parity

**Acceptance:**
- Phaser passes all baseline and production gates for two consecutive validation runs.
- Rollback path is documented.
- Old Canvas code is removed only after a final tagged backup/release artifact exists.

---

## Dispatch order

Dispatch in this exact order:

1. P0-01 baseline interaction contract
2. P0-02 renderer-independent contracts
3. P0-03 package/build shell
4. P1-01 Phaser boot/scale spike
5. P1-02 asset manifest/atlas spike
6. P1-03 parity decision gate
7. P2-01 through P2-06 gameplay port, one at a time
8. P3-01 terrain atlas and authored maps
9. P3-02 through P3-06 commercial polish
10. P4-01 through P4-05 release gates, with P4-05 as the final review-readiness decision

Do not dispatch P2 or P3 implementation stories until P1-03 is explicitly approved.

## P4-05 — Final design and visual quality-control review

**Objective:** Compare the release candidate against two commercial tower-defense references and determine whether it is ready for Jason’s hands-on review.

**Commercial references:**

1. **Bloons TD 6** — systems and readability benchmark:
   - Immediate tower/enemy recognition
   - Clear path and placement affordances
   - Legible range, targeting, status, damage, and upgrade feedback
   - Understandable economy and progression
   - Strong wave communication and difficulty ramp
   - Effects that communicate impact without obscuring play
   - Reliable pause, speed, ability, victory, defeat, and restart UX

2. **Kingdom Rush: Vengeance** — authored presentation benchmark:
   - Distinct map identity and memorable landmarks
   - Strong terrain composition and visual hierarchy
   - Consistent illustrated art direction
   - Readable enemy silhouettes and faction identity
   - Visually satisfying tower upgrades and attacks
   - Clear hero/ability feedback and polished transitions
   - Coherent UI, typography, iconography, and color language

**Important comparison rule:** Jura Defense does not need the same number of towers, enemies, maps, or meta-progression systems as either reference. The comparison is against the quality of the shipped experience for the feature set Jura Defense actually claims to provide.

**Files/artifacts:**
- Create: `docs/quality/commercial-reference-matrix.md`
- Create: `docs/quality/review-checklist.md`
- Create: `tests/commercial_quality_gate.mjs`
- Capture: `docs/quality/captures/desktop/`, `docs/quality/captures/landscape/`, `docs/quality/captures/portrait/`, `docs/quality/captures/live/`
- Review: all Phaser scenes, terrain/map assets, enemy/tower assets, UI, FX, audio, and onboarding

**Step 1: Build the comparison matrix**

Score Jura Defense from 0–5 in each category, with screenshots or test evidence:

| Category | Weight | Reference standard |
|---|---:|---|
| Board/path readability | 15% | BTD6-level immediate route and placement clarity |
| Tower/enemy identity | 15% | BTD6/KR-level silhouette and role recognition |
| Terrain/map composition | 15% | KR-level authored regions, landmarks, and visual hierarchy |
| Combat feedback and effects | 10% | BTD6-level impact/status readability without clutter |
| Economy/wave/progression UX | 10% | BTD6-level decision clarity and difficulty communication |
| Interaction quality | 10% | Reliable pause, speed, abilities, upgrade, sell, restart |
| UI/typography/onboarding | 10% | Commercially coherent information hierarchy and first-run guidance |
| Animation/audio/game feel | 5% | Consistent motion, sound priority, and response to actions |
| Mobile/responsive quality | 5% | Deliberate landscape and acceptable portrait experience |
| Stability/performance | 5% | No runtime errors, broken assets, or severe frame drops |

**Step 2: Perform the review at maximum gameplay density**

Capture and inspect:

- Intro/onboarding
- Quiet build phase
- Mid-wave combat with several towers and enemy types
- Armored and slowed enemies
- Meteor telegraph and impact
- Chrono rewind
- Upgrade/sell inspection state
- Final/boss wave
- Victory and defeat/restart
- Desktop, landscape mobile, portrait mobile, and live deployment

**Step 3: Apply hard gates**

The candidate is **not ready for Jason’s review** if any of the following are true:

- Any P0/P1 gameplay regression remains.
- Any console error, failed asset request, broken button, or unrecoverable restart path occurs.
- The route, enemies, towers, or critical HUD values become unclear during dense combat.
- Terrain art conflicts with the authoritative path or obstructs tower placement.
- The active map system still claims seeded variation but visibly renders only one unvaried plate.
- Critical art remains visibly placeholder-quality or inconsistent with the locked semi-realistic prehistoric direction.
- Pause, fast-forward, meteor, chrono, victory, defeat, or restart is not directly validated.

**Step 4: Set the review threshold**

Ready for Jason’s review requires:

- Overall weighted score of **4.0/5 or higher**.
- Every category scored at least **3.5/5**.
- Board/path readability, tower/enemy identity, terrain/map composition, interaction quality, and stability each score at least **4.0/5**.
- All hard gates pass.
- Two consecutive clean release-candidate runs.
- The checklist, matrix, screenshots, test output, and known tradeoffs are attached to the candidate.

A score below the threshold creates follow-up stories; it is not presented as production-ready merely because the game is playable.

**Definition of done:**

- `docs/quality/commercial-reference-matrix.md` records the BTD6 and Kingdom Rush comparison, evidence, scores, and gaps.
- `docs/quality/review-checklist.md` is fully checked with links to captures and test runs.
- `tests/commercial_quality_gate.mjs` passes all automated hard gates.
- Hermes records one of:
  - `READY_FOR_JASON_REVIEW` — threshold and hard gates passed;
  - `NOT_READY` — scored gaps become the next local-agent stories.
- Hermes sends Jason the review package and asks for the hands-on acceptance decision. No production-ready claim is made before that review.

## Definition of commercial-quality equivalent

The game is ready to call commercially credible only when all of the following are true:

- Two or more authored maps are visually distinct and route-safe.
- Phaser runtime passes parity with the current gameplay loop.
- No severe visual regression versus the current Canvas build.
- Every enemy/tower role is readable at gameplay scale.
- All core interactions have direct automated coverage.
- Desktop, landscape mobile, portrait mobile, and live deployment pass visual QA.
- No known runtime errors, broken asset requests, placeholder critical art, or restart/pause/rewind failures remain.
