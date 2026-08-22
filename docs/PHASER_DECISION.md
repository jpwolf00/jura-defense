# Phaser parity decision

Date: 2026-08-21

## Decision

**Proceed with a controlled Phaser migration behind adapters. Do not replace the Canvas game in one broad rewrite.**

## Evidence

| Gate | Result | Evidence |
|---|---|---|
| Build integration | Pass | `npm run build`; Vite emits `dist/phaser.html` and Phaser chunk |
| Responsive scale | Pass | 1280x720, 800x480, and 390x844 browser captures; virtual center maps to approximately `(640,360)` |
| Input coordinate handling | Pass | Pointer mapping remains in virtual 1280x720 coordinates at all tested sizes |
| Asset loading | Pass | 13 manifest entries load with `__juraAssetErrors: []` |
| Spritesheet animation | Pass | 576x96 six-frame raptor sheet loads as 96x96 frames; two captures differ after 250ms |
| Scene lifecycle | Pass | PreloadScene completes and starts PlaygroundScene with no page or console errors |
| Canvas regression | Pass | Interaction, state, and event contracts remain green; existing combat/full-run harnesses remain green |
| Performance warning | Observe | Phaser production chunk is approximately 1.2MB minified; optimize before release |

## Migration boundary

1. Keep the current Canvas game as the default entry point.
2. Port renderer-independent state/events first.
3. Port one gameplay slice at a time behind an adapter.
4. Run the interaction contract and full-run capture after every slice.
5. Do not delete the Canvas renderer until feature and visual parity gates pass.
6. Stop the migration and retain Canvas if any slice regresses gameplay reliability or mobile usability.

## Why Phaser earns the next phase

The proof-of-value demonstrated measurable value in the four required areas: asset loading, spritesheet animation, responsive scaling/input coordinates, and scene lifecycle. It did not yet prove that Phaser improves Jura's commercial visual quality by itself; art direction, authored maps, balance, and UX remain separate P3 work.
