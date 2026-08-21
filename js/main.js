import { VIEW_W, VIEW_H, WAYPOINTS, pointAt, SLOTS } from './path.js';
import { Enemy, spawnOffset } from './enemy.js';
import { Tower, TOWER_TYPES, roundRect } from './tower.js';
import { buildWaves, WaveManager } from './wave.js';
import { MeteorCall, METEOR } from './meteor.js';
import { ChronoCharge } from './chrono.js';
import { FX } from './fx.js';
import * as sfx from './sfx.js';
import { renderTerrainBackground, renderGamePath, renderDashedSlots, renderFogOverlay } from './terrain.js';
import { spriteImage, SPRITES } from './sprites.js';

// ---------------------------------------------------------------- canvas
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// Generated art (hero backdrop + time-rig portal), loaded eagerly so the
// action background and the rig swap from placeholder to real art.
const heroBgImg = spriteImage('hero_bg');
const portalImg = spriteImage('portal');
let scale = 1, offX = 0, offY = 0;

function resize() {
  const wrap = canvas.parentElement;
  const cw = wrap.clientWidth, ch = wrap.clientHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = cw * dpr;
  canvas.height = ch * dpr;
  // fit 1280x720 into canvas (letterbox)
  scale = Math.min(cw / VIEW_W, ch / VIEW_H);
  offX = (cw - VIEW_W * scale) / 2;
  offY = (ch - VIEW_H * scale) / 2;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', resize);
resize();

function toVirtual(clientX, clientY) {
  const r = canvas.getBoundingClientRect();
  return {
    x: (clientX - r.left - offX) / scale,
    y: (clientY - r.top - offY) / scale,
  };
}

// ---------------------------------------------------------------- state
let state;
function freshState() {
  return {
    money: 160,
    lives: 20,
    waveMgr: new WaveManager(buildWaves()),
    enemies: [],
    spawnOrder: 0,       // ordering guard when a browser tick bursts spawns
    towers: [],
    projectiles: [],
    fx: new FX(),
    meteor: new MeteorCall(),
    chrono: new ChronoCharge(),
    paused: false,
    over: false,
    victory: false,
    buildType: null,       // tower type being placed
    selectedTower: null,   // tower selected for upgrade/sell
    meteorTargeting: false,
    timeScale: 1,
    slotTaken: new Set(),  // index of occupied SLOTS
    mouse: null,
    started: true,         // false while intro screen is up
  };
}
state = freshState();
state.started = false;

// ---------------------------------------------------------------- DOM
const $money = document.getElementById('uiMoney');
const $lives = document.getElementById('uiLives');
const $wave = document.getElementById('uiWave');
const $waveMax = document.getElementById('uiWaveMax');
const $meteor = document.getElementById('uiMeteor');
const $startWave = document.getElementById('startWaveBtn');
const $meteorBtn = document.getElementById('meteorBtn');
const $pauseBtn = document.getElementById('pauseBtn');
const $ffwdBtn = document.getElementById('ffwdBtn');
const $muteBtn = document.getElementById('muteBtn');
const $shop = document.getElementById('towerShop');
const $info = document.getElementById('info');
const $banner = document.getElementById('waveBanner');
const $overlay = document.getElementById('overlay');
const $intro = document.getElementById('introScreen');
const $endScreen = document.getElementById('endScreen');
const $endEmoji = document.getElementById('endEmoji');
const $overlayTitle = document.getElementById('overlayTitle');
const $overlayMsg = document.getElementById('overlayMsg');
const $overlayBtn = document.getElementById('overlayBtn');
const $startGameBtn = document.getElementById('startGameBtn');
const $pauseBadge = document.getElementById('pauseBadge');
const $era = document.getElementById('uiTime');
const $chronoMeter = document.getElementById('uiChrono');
const $chronoBtn = document.getElementById('chronoBtn');

// build shop cards
for (const [id, t] of Object.entries(TOWER_TYPES)) {
  const card = document.createElement('div');
  card.className = 'shopCard';
  card.dataset.id = id;
  card.innerHTML = `<div class="name">${t.name}</div>
    <div class="cost">💰 ${t.cost}</div>
    <div class="desc">${t.desc}</div>`;
  // Tower artwork thumbnail from the embedded sprite (or emoji fallback).
  const icon = document.createElement('img');
  icon.className = 'icon';
  icon.alt = t.name;
  if (t.sprite) {
    const im = spriteImage(t.sprite);
    if (im) icon.src = im.src;
  } else if (t.emoji) {
    // No raster sprite — use an emoji rendered as a data-URI SVG.
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'><text y='36' font-size='36' text-anchor='middle' x='24'>${t.emoji}</text></svg>`;
    icon.src = 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
  }
  if (icon.src) card.prepend(icon);
  card.addEventListener('click', () => selectBuild(id));
  $shop.appendChild(card);
}

function refreshShop() {
  for (const card of $shop.children) {
    const id = card.dataset.id;
    card.classList.toggle('selected', state.buildType === id);
    card.classList.toggle('cantAfford', state.money < TOWER_TYPES[id].cost);
  }
}

function selectBuild(id) {
  if (state.money < TOWER_TYPES[id].cost) return;
  state.buildType = state.buildType === id ? null : id;
  state.selectedTower = null;
  state.meteorTargeting = false;
  refreshShop();
  updateInfo();
}

function updateInfo() {
  const tw = state.selectedTower;
  if (tw) {
    const upCost = tw.upgradeCost();
    const rateLine = tw.t.rate ? `<div class="row"><span>Rate</span><b>${tw.t.rate}s</b></div>` : '';
    const targetName = (tw.target && !tw.target.dead) ? tw.target.t.name : 'No target in range';
    $info.innerHTML = `
      <div class="card">
        <div class="head"><b>${tw.t.name}</b><span>Lv ${tw.level}</span></div>
        <div class="desc">${tw.t.desc}</div>
        <div class="row"><span>Damage</span><b>${Math.round(tw.dmg)}</b></div>
        <div class="row"><span>Range</span><b>${tw.range}</b></div>
        ${rateLine}
        <div class="row"><span>Target</span><b>${targetName}</b></div>
        <div class="row"><span>Upgrade</span><b>${tw.canUpgrade() ? upCost : 'Max Level'}</b></div>
        <div class="actions">
          <button id="upBtn" ${tw.canUpgrade() ? '' : 'disabled'}>⬆ Upgrade (${upCost})</button>
          <button id="sellBtn">Sell (+${tw.sellValue()})</button>
        </div>
      </div>`;
    const up = document.getElementById('upBtn');
    const sell = document.getElementById('sellBtn');
    up.addEventListener('click', () => {
      if (tw.canUpgrade() && state.money >= upCost) {
        state.money -= upCost;
        tw.level++;
        sfx.upgrade();
        updateInfo();
        syncHud();
      } else if (!tw.canUpgrade() || state.money < upCost) sfx.error();
    });
    sell.addEventListener('click', () => {
      state.money += tw.sellValue();
      state.slotTaken.delete(tw._slotIdx);
      state.towers = state.towers.filter(x => x !== tw);
      state.selectedTower = null;
      sfx.sell();
      updateInfo();
      syncHud();
    });
  } else {
    $info.innerHTML = state.buildType
      ? `Placing <b>${TOWER_TYPES[state.buildType].name}</b>. Click a glowing slot.`
      : `Click a tower card, then a <b>glowing slot</b> to build.<br/>Click a placed tower to <b>upgrade</b> or <b>sell</b>.<br/><br/>
         <span class="key">Space</span> pause · <span class="key">M</span> meteor · <span class="key">F</span> fast-forward`;
  }
}

// Lightweight cache so the selected tower card only rebuilds when the
// selected tower identity or its live target identity/dead-state changes.
let infoCache = { tower: null, target: null, dead: null };

function infoCacheKey() {
  const tw = state.selectedTower;
  if (!tw) return null;
  const tg = tw.target;
  return { tower: tw, target: tg, dead: tg ? tg.dead : null };
}

// A wave is clearing once spawning has finished but living enemies remain.
function waveClearing() {
  return !state.waveMgr.active && state.enemies.length > 0;
}

// ---------------------------------------------------------------- HUD
function syncHud() {
  $money.textContent = Math.floor(state.money);
  $lives.textContent = state.lives;
  $wave.textContent = state.waveMgr.currentWave;
  $waveMax.textContent = state.waveMgr.totalWaves;
  $meteor.textContent = state.meteor.charges;
  $meteorBtn.classList.toggle('ready', state.meteor.ready);
  $meteorBtn.classList.toggle('targeting', state.meteorTargeting);
  const clearing = waveClearing();
  $startWave.disabled = state.waveMgr.active || state.waveMgr.done || clearing;
  $startWave.textContent = state.waveMgr.done ? '✓ Done'
    : (state.waveMgr.active ? '▶ Running'
      : (clearing ? 'Clearing…' : '▶ Start'));
  $ffwdBtn.classList.toggle('active', state.timeScale === 2);
  $ffwdBtn.textContent = state.timeScale === 2 ? '2×' : '1×';
  $pauseBtn.textContent = state.paused ? '▶' : '⏸';
  $pauseBadge.classList.toggle('show', state.paused);
  $era.textContent = state.enemies.length ? `🦖 ×${state.enemies.length}` : 'Cretaceous';
  // Chrono Charge meter
  $chronoMeter.style.width = `${Math.round(state.chrono.pct * 100)}%`;
  $chronoBtn.classList.toggle('ready', state.chrono.ready);
  refreshShop();

  // Refresh the selected tower card only when its target changed.
  const key = infoCacheKey();
  if (!key) {
    if (infoCache.tower !== null) infoCache = { tower: null, target: null, dead: null };
  } else if (key.tower !== infoCache.tower || key.target !== infoCache.target || key.dead !== infoCache.dead) {
    infoCache = key;
    updateInfo();
  }
}

// ---------------------------------------------------------------- actions
$startWave.addEventListener('click', () => {
  if (state.over || state.started === false) return;
  if (state.waveMgr.active || state.waveMgr.done || waveClearing()) return;
  state.spawnOrder = 0;
  state.waveMgr.startNext();
  sfx.waveStart();
  state.fx.shake(0.3);
  flashBanner(`Wave ${state.waveMgr.currentWave} — ${state.waveMgr.currentHint}`);
  syncHud();
});

$meteorBtn.addEventListener('click', () => {
  if (!state.meteor.ready) { sfx.error(); return; }
  state.meteorTargeting = !state.meteorTargeting;
  state.buildType = null;
  state.selectedTower = null;
  refreshShop();
  updateInfo();
  if (state.meteorTargeting) {
    $info.innerHTML = `☄️ <b>Meteor Call</b> — click anywhere to drop the rock.<br/><i>(M to cancel)</i>`;
  }
  syncHud();
});

function togglePause() {
  if (state.over || !state.started) return;
  state.paused = !state.paused;
  syncHud();
}
$pauseBtn.addEventListener('click', togglePause);

$ffwdBtn.addEventListener('click', () => {
  state.timeScale = state.timeScale === 1 ? 2 : 1;
  syncHud();
});

$muteBtn.addEventListener('click', () => {
  const m = !sfx.isMuted();
  sfx.setMuted(m);
  $muteBtn.textContent = m ? '🔇' : '🔊';
});

$overlayBtn.addEventListener('click', () => {
  state = freshState();
  state.started = false;
  showIntro();
  updateInfo();
  syncHud();
});

// Onboarding: start screen gates the first wave.
$startGameBtn.addEventListener('click', () => {
  sfx.resumeAudio();
  $overlay.classList.remove('show');
  $intro.style.display = 'none';
  state.started = true;
  flashBanner('Prepare defenses');
  syncHud();
});

function showIntro() {
  $intro.style.display = 'flex';
  $endScreen.style.display = 'none';
  $overlay.classList.add('show');
}

function flashBanner(text) {
  $banner.querySelector('span').textContent = text;
  $banner.classList.add('show');
  setTimeout(() => $banner.classList.remove('show'), 1200);
}

function doRewind() {
  if (state.over || !state.started || state.paused) return;
  if (!state.chrono.ready) { sfx.error(); return; }
  if (state.chrono.activate(state.enemies, state.towers, state.fx, state.projectiles)) {
    sfx.rewind();
  } else {
    sfx.error();
  }
  syncHud();
}
$chronoBtn.addEventListener('click', doRewind);

function onWaveComplete(n) {
  const bonus = 20 + n * 6;
  state.money += bonus;
  sfx.waveClear();
  sfx.coin();
  flashBanner(`Wave ${n} cleared · +${bonus}💰`);
}

function endGame(victory) {
  state.over = true;
  state.victory = victory;
  state.paused = false;
  if (victory) sfx.win(); else sfx.lose();
  $intro.style.display = 'none';
  $endScreen.style.display = 'flex';
  $endEmoji.textContent = victory ? '🏕️' : '💀';
  $overlayTitle.textContent = victory ? 'Site Secured' : 'Rig Destroyed';
  $overlayMsg.textContent = victory
    ? `You held the line for all ${state.waveMgr.totalWaves} waves. The rift is sealed.`
    : `The Cretaceous got through on wave ${state.waveMgr.currentWave}. The field is lost.`;
  $overlay.classList.add('show');
  syncHud();
}

// ---------------------------------------------------------------- input
// Unified pointer events: cover mouse, touch, and pen. pointerdown fires
// immediately on tap (no iOS click delay); pointermove keeps the reticle
// following a finger during meteor targeting / slot hover.
canvas.addEventListener('pointermove', (e) => {
  const p = toVirtual(e.clientX, e.clientY);
  state.mouse = p;
  if (e.pointerType === 'mouse') {
    if (state.meteorTargeting) canvas.style.cursor = 'crosshair';
    else if (state.buildType) canvas.style.cursor = 'pointer';
    else canvas.style.cursor = 'default';
  }
});

function handlePointerDown(e) {
  if (state.over || !state.started) return;
  const p = toVirtual(e.clientX, e.clientY);
  state.mouse = p;

  // meteor targeting
  if (state.meteorTargeting) {
    if (state.meteor.fire(p.x, p.y)) {
      state.meteorTargeting = false;
      state.buildType = null;
      updateInfo();
      syncHud();
    }
    return;
  }

  // try to build on a slot
  if (state.buildType) {
    const idx = nearestFreeSlot(p);
    if (idx >= 0 && state.money >= TOWER_TYPES[state.buildType].cost) {
      placeTower(state.buildType, idx);
      return;
    }
    if (idx >= 0) sfx.error(); // slot there, but broke
    // tapped empty space: keep build mode
    return;
  }

  // select an existing tower
  let picked = null;
  for (const t of state.towers) {
    if (Math.hypot(t.x - p.x, t.y - p.y) <= 30) picked = t;
  }
  state.selectedTower = picked;
  updateInfo();
  syncHud();
}

canvas.addEventListener('pointerdown', handlePointerDown);

// Prevent the canvas from hijacking gestures (double-tap zoom, scroll).
canvas.addEventListener('touchstart', (e) => { e.preventDefault(); }, { passive: false });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

function nearestFreeSlot(p) {
  let best = -1, bestD = 60; // snap radius
  for (let i = 0; i < SLOTS.length; i++) {
    if (state.slotTaken.has(i)) continue;
    const d = Math.hypot(SLOTS[i].x - p.x, SLOTS[i].y - p.y);
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

function placeTower(type, slotIdx) {
  state.money -= TOWER_TYPES[type].cost;
  const t = new Tower(type, SLOTS[slotIdx].x, SLOTS[slotIdx].y);
  t._slotIdx = slotIdx;
  // Point the idle barrel toward the nearest path point so it reads as "guarding".
  let bestD = Infinity;
  for (const wp of WAYPOINTS) {
    const d = Math.hypot(wp.x - t.x, wp.y - t.y);
    if (d < bestD) { bestD = d; t.restAngle = Math.atan2(wp.y - t.y, wp.x - t.x); }
  }
  state.towers.push(t);
  state.slotTaken.add(slotIdx);
  sfx.place();
  // keep build mode if still affordable, else drop it
  if (state.money < TOWER_TYPES[state.buildType].cost) state.buildType = null;
  syncHud();
}

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (e.key === ' ') {
    e.preventDefault();
    togglePause();
  } else if (e.key === 'm' || e.key === 'M') {
    if (state.started && !state.over) $meteorBtn.click();
  } else if (e.key === 'f' || e.key === 'F') {
    if (state.started && !state.over) $ffwdBtn.click();
  } else if (e.key === 'r' || e.key === 'R') {
    if (state.started && !state.over) doRewind();
  } else if (e.key === 's' || e.key === 'S') {
    $muteBtn.click();
  } else if (e.key === 'Escape') {
    state.buildType = null;
    state.meteorTargeting = false;
    state.selectedTower = null;
    refreshShop();
    updateInfo();
    syncHud();
  }
});

// ---------------------------------------------------------------- loop
let last = performance.now();
let acc = 0;
const STEP = 1 / 60;

function spawn(type, scaleMult, order, spacing) {
  const e = new Enemy(type, scaleMult);
  // Queue followers off-path. This survives rAF throttling / same-tick bursts
  // and produces a readable marching column rather than a stacked pile.
  let offset;
  if (order !== undefined) {
    // Wave manager provides explicit per-group order → use it (negative = behind spawn).
    offset = -order * (spacing || 50);
  } else {
    // Legacy: use the global counter for one-off spawns.
    offset = -state.spawnOrder * (spacing || 50);
    state.spawnOrder++;
  }
  e.dist = offset;
  e.animT = Math.random() * 100;
  e._sync();
  e.reward = Math.round(e.reward * (1 + 0.08 * (state.waveMgr.currentWave - 1)));
  state.enemies.push(e);
}

function update(dt) {
  const s = state;
  s.waveMgr.update(dt, spawn, onWaveComplete);
  const meteorFalling = !!s.meteor.target;
  s.meteor.update(dt, s.enemies, s.fx, s);
  if (meteorFalling && !s.meteor.target) sfx.meteor(); // it just impacted

  for (const e of s.enemies) e.update(dt, performance.now());
  for (const t of s.towers) t.update(dt, s.enemies, performance.now(), s.projectiles, s.fx);
  // play fire sfx for anything that just fired
  for (const t of s.towers) {
    if (t.lastFireSfx) { sfx.fire(t.lastFireSfx); t.lastFireSfx = null; }
  }
  updateProjectiles(dt);
  s.fx.update(dt);
  s.chrono.tick(dt, s.enemies, s.towers);

  // reap
  for (const e of s.enemies) {
    if (e.dead) {
      if (e.reached) {
        s.lives--;
        s.chrono.onLeak(e);
        s.fx.floater(e.x, e.y - 20, '−1 ❤️', '#d0563f');
        sfx.leak();
      } else {
        // Death burst + reward
        s.fx.death(e.x, e.y, e.t.color, e.radius);
        s.fx.floater(e.x, e.y - 20, `+${e.reward}`, '#6fbf73');
        s.fx.hit(e.x, e.y, e.t.color);
        sfx.kill();
        s.money += e.reward;
      }
    }
  }
  s.enemies = s.enemies.filter(e => !e.dead);

  // win / lose
  if (s.lives <= 0 && !s.over) { endGame(false); }
  if (s.waveMgr.done && s.enemies.length === 0 && !s.over) { endGame(true); }

  syncHud();
}

function updateProjectiles(dt) {
  const s = state;
  for (const p of s.projectiles) {
    p.life -= dt;
    if (p.target && !p.target.dead) {
      p.tx = p.target.x; p.ty = p.target.y;
    }
    if (p.tx === undefined) { p.life = 0; continue; }
    const dx = p.tx - p.x, dy = p.ty - p.y;
    const d = Math.hypot(dx, dy);
    const step = p.speed * dt;
    if (d <= step) {
      // impact
      if (p.target && !p.target.dead) {
        const killed = p.target.damage(p.dmg);
        if (p.slow < 1) p.target.applySlow(p.slow, p.slowDur);
        s.fx.hit(p.target.x, p.target.y, p.color);
        if (killed) { /* reward handled on reap */ }
      }
      p.life = 0;
    } else {
      p.px = p.x; p.py = p.y;
      p.x += dx / d * step;
      p.y += dy / d * step;
      // spark trail behind the projectile
      if (Math.random() < 0.6) {
        s.fx.particles.push({
          x: p.x, y: p.y,
          vx: (Math.random() - 0.5) * 30, vy: (Math.random() - 0.5) * 30,
          t: 0, dur: 0.2, size: 1.5 + Math.random() * 2,
          color: p.color, grav: 0, glow: true,
        });
      }
    }
  }
  s.projectiles = s.projectiles.filter(p => p.life > 0);
}

function draw() {
  const s = state;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  ctx.clearRect(0, 0, w, h);

  ctx.save();
  // letterbox transform + screen shake
  const shake = s.fx.shakeOffset();
  ctx.translate(offX + shake.x * scale, offY + shake.y * scale);
  ctx.scale(scale, scale);

  drawBackground();
  drawPath();
  drawSlots();
  drawBase();

  for (const t of s.towers) t.draw(ctx, t === s.selectedTower);
  for (const e of s.enemies) e.draw(ctx);
  drawProjectiles();
  s.fx.draw(ctx);
  s.meteor.draw(ctx);

  // meteor targeting reticle following mouse
  if (s.meteorTargeting && s.mouse) {
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = '#e0a458';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(s.mouse.x, s.mouse.y, METEOR.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  ctx.restore();
}

function drawBackground() {
  // Terrain-first battlefield backdrop.
  renderTerrainBackground(ctx, VIEW_W, VIEW_H);
  renderFogOverlay(ctx, VIEW_W, VIEW_H);
  return;
}

function drawPath() {
  renderGamePath(ctx, WAYPOINTS);

  // spawn marker
  const sp = pointAt(1);
  ctx.save();
  ctx.fillStyle = 'rgba(208,86,63,0.25)';
  ctx.beginPath();
  ctx.arc(sp.x + 40, sp.y, 34, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#d0563f';
  ctx.font = 'bold 22px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('☢', sp.x + 40, sp.y + 8);
  ctx.restore();
}

function pathStroke() {
  ctx.beginPath();
  ctx.moveTo(WAYPOINTS[0][0], WAYPOINTS[0][1]);
  for (let i = 1; i < WAYPOINTS.length; i++) ctx.lineTo(WAYPOINTS[i][0], WAYPOINTS[i][1]);
  ctx.stroke();
}

function drawSlots() {
  const s = state;
  for (let i = 0; i < SLOTS.length; i++) {
    if (s.slotTaken.has(i)) continue;
    const sl = SLOTS[i];
    const hover = s.mouse && s.buildType && Math.hypot(s.mouse.x - sl.x, s.mouse.y - sl.y) < 40;
    ctx.save();
    ctx.globalAlpha = s.buildType ? (hover ? 0.9 : 0.4) : 0.12;
    ctx.strokeStyle = s.buildType ? '#6fbf73' : '#8fa093';
    ctx.lineWidth = hover ? 3 : 2;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.arc(sl.x, sl.y, 26, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(sl.x - 8, sl.y); ctx.lineTo(sl.x + 8, sl.y);
    ctx.moveTo(sl.x, sl.y - 8); ctx.lineTo(sl.x, sl.y + 8);
    ctx.stroke();
    ctx.restore();
  }
}

function drawBase() {
  const end = pointAt(99999);
  ctx.save();
  ctx.translate(end.x - 40, end.y - 40);
  // time rig: generated portal art (pulses via slight scale)
  if (portalImg.complete && portalImg.naturalWidth) {
    const pulse = 1 + Math.sin(performance.now() / 300) * 0.05;
    const targetH = 100 * pulse;
    const targetW = targetH * (75 / 84);
    ctx.drawImage(portalImg, 10, 6, 75, 84, -targetW / 2, -targetH / 2, targetW, targetH);
  } else {
    // glowing portal ring (placeholder while the art loads)
    const pulse = 0.6 + 0.4 * Math.sin(performance.now() / 300);
    ctx.strokeStyle = `rgba(120,200,255,${0.5 + 0.3 * pulse})`;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(40, 40, 34, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = `rgba(120,200,255,${0.15 + 0.1 * pulse})`;
    ctx.beginPath();
    ctx.arc(40, 40, 30, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#8fd4ff';
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('⏳', 40, 47);
  }
  ctx.restore();
}

function drawProjectiles() {
  const s = state;
  for (const p of s.projectiles) {
    // trailing glow
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = p.color;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(p.px ?? p.x, p.py ?? p.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    ctx.restore();

    // bright core
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // colored halo
    ctx.save();
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  dt = Math.min(dt, 0.05) * state.timeScale;
  if (!state.paused && !state.over) {
    acc += dt;
    while (acc >= STEP) {
      update(STEP);
      acc -= STEP;
    }
  }
  draw();
}
requestAnimationFrame(frame);

syncHud();
updateInfo();
showIntro();
