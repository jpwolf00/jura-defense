import Phaser from 'phaser';
import PreloadScene from './phaser/preload-scene.js';
import PlaygroundScene from './phaser/playground-scene.js';
import ControllerPlaygroundScene from './phaser/controller-playground-scene.js';

// ── Responsive contract ──────────────────────────────────────────────────
//
// When the browser viewport is narrower than 900px or shorter than 600px,
// switch from FIT (fixed virtual canvas) to RESIZE (canvas = viewport).
// This keeps all HUD elements, onboarding panels, and buttons readable on
// portrait phones and small landscape tablets.
//
// Portrait / narrow safe-area layout (canvas coords):
//   • Title + pointer text: y=20..80 (top-left)
//   • Wave HUD: top-left at y=120×uiScale
//   • Tower-type selector: top-right at y=120×uiScale
//   • Onboarding panel: left-side compact 2-column, y=90, h=160, w≤260
//     — does NOT overlap title, pointer, wave HUD, or tower-type selector
//     — does NOT overlap bottom action buttons (y=height×0.9)
//   • Action buttons (Start Waves / Meteor / Chrono): y=height×0.9
//
// Exposed as a browser-compatible contract for tests / external inspectors:
//   window.__juraResponsiveContract → { mode, w, h, ratio, isPortrait }
//   window.__juraResponsiveContract.onResize → subscribe to viewport changes
// ──────────────────────────────────────────────────────────────────────────

function _responsiveConfig() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const ratio = vw / vh;

  // If viewport is portrait or too narrow → RESIZE so virtual coords = CSS px
  // Otherwise keep FIT so the game renders at the canonical 1280x720.
  const isPortrait = ratio < 1;
  const isNarrow = vw < 900;
  const isShort = vh < 600;

  if (isPortrait || isNarrow || isShort) {
    return {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_NONE,
      w: vw,
      h: vh,
      isPortrait,
    };
  }
  return {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    w: 1280,
    h: 720,
    isPortrait: false,
  };
}

const rc = _responsiveConfig();
const config = {
  type: Phaser.AUTO,
  parent: 'phaser-game',
  width: rc.w,
  height: rc.h,
  backgroundColor: '#17231d',
  scale: {
    mode: rc.mode,
    autoCenter: rc.autoCenter,
  },
  scene: [PreloadScene, PlaygroundScene, ControllerPlaygroundScene],
  render: { antialias: true },
};

// Expose the responsive contract on the global object.
globalThis.__juraResponsiveContract = {
  mode: rc.mode === Phaser.Scale.RESIZE ? 'RESIZE' : 'FIT',
  w: rc.w,
  h: rc.h,
  ratio: rc.w / rc.h,
  isPortrait: rc.isPortrait,
};

const game = new Phaser.Game(config);

// Expose a resize subscriber for external HUD / test code.
globalThis.__juraResponsiveContract.onResize = (cb) => {
  const handler = () => {
    const r = _responsiveConfig();
    globalThis.__juraResponsiveContract.mode = r.mode === Phaser.Scale.RESIZE ? 'RESIZE' : 'FIT';
    globalThis.__juraResponsiveContract.w = r.w;
    globalThis.__juraResponsiveContract.h = r.h;
    globalThis.__juraResponsiveContract.ratio = r.w / r.h;
    globalThis.__juraResponsiveContract.isPortrait = r.isPortrait;
    if (typeof cb === 'function') cb(r);
  };
  window.addEventListener('resize', handler, { passive: true });
  // Fire immediately so callers get current state.
  handler();
};
