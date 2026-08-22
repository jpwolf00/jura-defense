# Jura Defense — Tower Defense (design spec)

Theme: **time-travel Jurassic field-defense.** You're a paleo field crew yanked into
the Late Cretaceous by a malfunctioning time rig. Defend the **Time Rig** from
waves of dinosaurs using anachronistic tech.

## Core loop
- Single path (S-curve) from spawn to the Time Rig (your base, 20 HP).
- Build towers on pre-placed slots adjacent to the path.
- Survive escalating waves. Leak = lose rig HP. Rig at 0 = game over.
- Win a stage by surviving N waves; then a harder stage.

## Enemy types (generated sprites)
| id | species | trait |
|----|---------|-------|
| raptor | Velociraptor | fast, low HP |
| triceratops | Triceratops | slow, armored (flat dmg) |
| trex | Tyrannosaurus rex | slow, very high HP, heavy |
| pterano | Pteranodon | flies — ignores terrain, slightly faster |
| anky | Ankylosaurus | slow, very armored |
| hadro | Hadrosaur | mid speed, mid HP (swarm) |

Wave = weighted mix, HP/damage scaled per wave.

## Towers (generated sprites)
| id | name | behavior |
|----|------|----------|
| tranq | Tranq Cannon | single-target, slows 40% 2s |
| fence | Volt Fence | AoE pulse to all in short radius |
| drone | Drone Swarm | fast-fire, cheap, low dmg |
| heli | Heli Gunner | long range, high single dmg |
| chrono | Chrono Turret | fires slowing pulse + small dmg |

Each has cost, range, fire rate, damage, and a projectile VFX.

## Super weapon — **METEOR CALL** (the funny one)
- Button (or hotkey **M**) in the HUD.
- Limited uses per stage (start: **3**).
- Target: click anywhere → 1.5s telegraph (falling rock + shadow grows) →
  impact: large radial blast, massive damage, knockback, dust + fire ring VFX.
- Cooldown between uses (e.g. 20s) AND finite charges.
- Flavor: a small asteroid (the "meteor") is yanked down from orbit.

## Chrono Charge (the time-travel hook)
- Meter fills when enemies leak past (you're "losing time").
- Spend it to **rewind** the last 4 seconds of enemy positions (not a full
  undo — enemies retrace). Optional/secondary; ship after core loop.

## Controls
- Mouse: click slot → tower menu; click tower → upgrade/sell.
- Keys: `Space` pause, `1/2/3` fast-wave skip (dev), `M` meteor, `F` fast-forward.
- No keyboard-only requirement; mouse-first.

## Tech
- **vanilla JS + HTML5 Canvas**, no engine, no build step (easiest for a coding
  model to reason about & verify).
- One `requestAnimationFrame` loop. Fixed-timestep update, interpolated draw.
- Path = array of waypoints; enemies lerp along it.
- Towers keep a target (nearest in range) + cooldown timer.
- Meteor = special effect object with telegraph → impact phases.

## Asset plan
- **Curated (Kenney, CC0):** terrain/path tiles, base (time rig) props, UI/HUD
  buttons & panels, VFX particles (explosions, muzzle flash), audio SFX.
- **Generated (ComfyUI, semi-realistic, one consistent style):** dino enemies
  (6, w/ walk frames), towers (5), meteor + impact, time-portal hero background,
  logo. All on transparent/solid grid, cut + normalized to a `sprites.json`.

## Art direction (locked: **semi-realistic prehistoric**)
Reference: Jurassic Park poster energy. Photographic skin texture, dramatic
rim light, 3/4 low camera, moody Cretaceous dusk palette (olive / amber /
teal). One consistent lighting + palette across ALL generated sprites so the
set reads as one game.

## File layout
```
src/
  index.html
  js/game.js, path.js, enemy.js, tower.js, wave.js, meteor.js, hud.js, main.js
  data/enemies.json, towers.json, waves.json
assets/
  curated/   kenney packs
  generated/ raw outputs
  sprites/   cut + normalized pngs + sprites.json
```

## Build order
1. Core loop (path, one enemy, one tower, HUD, win/lose) — playable with boxes.
2. Add all enemy + tower types (still placeholders).
3. Meteor Call super weapon.
4. Wire in curated assets (terrain, UI, VFX).
5. Wire in generated dino/tower sprites + animation.
6. Polish: wave scaling, chrono hook, audio.
