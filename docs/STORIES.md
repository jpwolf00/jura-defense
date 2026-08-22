# Jura Defense — Story Backlog (dispatch-ready)

> **Model:** local MTPLX Qwen3.8-27B Optimized-Speed-FP16 (`127.0.0.1:8000`, turbo) and/or LAN `.50` Qwen3.8-27B (`192.168.85.50:8080`).
> **Thinking level:** LOW or OFF for all stories (mechanical code edits). NEVER `xhigh` — it reasons for tens of thousands of tokens and is infeasible for these tasks.
> **Reviewer:** Hermes (assistant) — visual + `node --check` + Playwright capture gate on every story.
> **Dispatch:** one story at a time. Each story is self-contained and verifiable in isolation.

**Completed:** terrain-first board, all enemy/tower types, meteor call, chrono rewind, mobile layout, dino facing, turret rotation, FX boost, tower card art, Story 2 audio variety, Story 3 reward/preview, Story 4 status feedback, Story 5 meteor VFX, Story 6 optional spritesheet plumbing.

**Deferred:** multi-frame dinosaur art generation; current 2D motion profiles remain active for today's single-frame assets.

---

## Story 2 — Audio SFX pass (synthesized variety + game feel)

**Objective:** Distinct, satisfying synthesized sounds per action; no asset files needed.

**Files:** `src/js/sfx.js` (only).

**Steps**
1. Extend the existing WebAudio oscillator helper with reusable synth voices:
   - `shoot()` per tower kind (different pitch/decay: tranq=soft thock, drone=high tick, heli=low boom)
   - `impact()` for projectile hit (short noise burst)
   - `explosion()` for meteor (sub-bass rumble + noise)
   - `waveStart()` horn/rising sweep
   - `place()` / `sell()` UI blips
   - `victory()` / `defeat()` stingers
2. Keep the lazy AudioContext (already there) — no audio until first user gesture.
3. Wire tower `fire()` and enemy death paths to call the right voices (see `main.js` `sfx.*` call sites — map existing calls to richer voices, don't add new call sites unless needed).

**Definition of done:** `node --check` passes; launching a wave + placing a tower + a kill
produces audibly distinct sounds; no console errors; no audio before first click.

---

## Story 3 — Wave/difficulty curve + reward balance

**Objective:** A legible difficulty ramp and satisfying economy.

**Files:** `src/js/wave.js`, `src/js/enemy.js` (types), `src/js/main.js` (reward on reap).

**Steps**
1. In `wave.js`, make per-wave composition a small pure function of wave number:
   - waves 1–3: raptors/hadros only, low count
   - waves 4–6: introduce triceratops + ankylosaurus
   - waves 7–9: introduce pteranodon + trex
   - wave 10: "boss" wave (heavy trex/anky mix)
2. HP/damage scaling: replace any flat multiplier with a gentle curve (e.g. `1 + 0.18*(wave-1)` HP, smaller dmg growth) so late waves are survivable but tense.
3. Reward: ensure `+reward` on kill scales slightly per wave so the economy keeps pace with tower costs (verify a mid-game player can still afford upgrades).
4. Add a `waveMgr` "wave preview" string in the HUD (e.g. "Wave 5 — armored incoming") if trivial.

**Definition of done:** `node --check` passes; a full 10-wave auto-run (headless, speed x8) completes
without the economy stalling or a wave being trivially easy; no crashes.

---

## Story 4 — Enemy status feedback (slow debuff + armor legibility)

**Objective:** The player can *see* what's happening to each enemy.

**Files:** `src/js/enemy.js` (draw), `src/js/main.js` (slow application).

**Steps**
1. When `slowFactor < 1` (slowed), tint the enemy sprite cyan/blue (e.g. `ctx.filter = 'hue-rotate(-40deg) brightness(1.2)'` or overlay a translucent cyan circle) for the slow duration.
2. Draw a small shield/padlock icon or a distinct grey HP-bar border on armored enemies (`armor > 0`) so armor reads at a glance.
3. Ensure both indicators clear when the effect ends.
4. Add a tiny "slowed" floater text on first application only (optional).

**Definition of done:** `node --check` passes; a capture with a tranq tower firing shows the
target visibly tinted while slowed and reverting after; armored enemies are visually distinct.

---

## Story 5 — Meteor telegraph + impact VFX upgrade

**Objective:** The meteor (the "funny one") should feel inevitable and heavy.

**Files:** `src/js/meteor.js`, `src/js/fx.js`.

**Steps**
1. During the telegraph phase, draw a growing warning ring at the target point and an
   expanding shadow ellipse (already started — make the shadow scale up smoothly and darken).
2. On impact, fire the existing `fx.explosion()` plus a short ground-shake and a scorch mark
   that lingers ~2s (draw a fading dark ellipse).
3. Add a brief slow-motion feel on impact (e.g. `state.timeScale` dip for 0.15s) if it doesn't
   break the fixed timestep.

**Definition of done:** `node --check` passes; a meteor-targeting capture shows telegraph ring →
shadow growth → explosion + scorch + shake; no errors.

---

## Story 6 — Spritesheet animation plumbing (prep for multi-frame walk cycles)

**Objective:** Make `enemy.js` consume multi-frame spritesheets when they arrive, while keeping
the current single-frame + 2D-motion-profile behavior as the fallback.

**Files:** `src/js/enemy.js`, `src/js/sprites.js` (metadata only if needed).

**Steps**
1. Read `meta` for a new optional field (e.g. `meta.frames` = horizontal frame count, `meta.frameW`).
2. If `meta.frames` exists, split the source image into frames and cycle them on a per-species
   `rate` (reuse `MOTION_PROFILES[x].rate`); otherwise keep the existing single-frame path.
3. Preserve the current flip/facing logic (from the last story) — a spritesheet walking LEFT must
   also mirror correctly.
4. Do NOT generate or modify any art; only write the code path and document the expected metadata shape.

**Definition of done:** `node --check` passes; game runs unchanged with today's single-frame
sprites; a synthetic 4-frame test sprite (drawn at runtime, not committed) cycles correctly
and mirrors when moving left.

---

## Notes / constraints for the model
- Vanilla JS + Canvas, no build step, `file://` must still work.
- Do not touch `src/js/sprites.js` weight data (2.3 MB base64) except to add metadata fields.
- Every story ends with `node --check src/js/*.js` (must be exit 0) and "no console errors."
- Thinking stays LOW or OFF for routine mechanical work; NEVER xhigh. One story per dispatch.
