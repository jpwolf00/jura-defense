export default class CombatBridge {
  constructor({ towers = [], enemies = [], towerSprites = [], enemySprites = [], fx = {}, onEnemyGone, audio = null, fxSystem = null, towerFireCB = null, hitCB = null, killCB = null, slowCB = null, timeNow = null } = {}) {
    this.towers = towers;
    this.enemies = enemies;
    this.towerSprites = towerSprites;
    this.enemySprites = enemySprites;
    this.projectiles = [];
    this.fx = { pulse() {}, ...fx };
    this.onEnemyGone = typeof onEnemyGone === 'function' ? onEnemyGone : onEnemyGone;
    this.now = globalThis.performance?.now?.() ?? 0;
    this._audio = audio || null;
    this._fxSystem = fxSystem || null;
    this._towerFireCB = towerFireCB || null;
    this._hitCB = hitCB || null;
    this._killCB = killCB || null;
    this._slowCB = slowCB || null;
    // FX throttle: track recent effects to avoid duplicates
    this._fxThrottle = new Map();
    this._now = timeNow || (() => performance.now());

    // S06: Track projectile graphics for rendering
    this._projectileGraphics = new Map();

    // P3-05: Delegate audio/FX entirely to Phaser scene callbacks.
    // Direct calls here would double-fire alongside the callbacks that
    // the playground scene wires up (towerFireCB, hitCB, etc.).
  }

  step(dt) {
    this.now += dt * 1000;
    for (const enemy of this.enemies) if (!enemy.dead) enemy.update(dt, this.now);
    for (const tower of this.towers) tower.update(dt, this.enemies, this.now, this.projectiles, this.fx);
    this.updateProjectiles(dt);
    this.towerSprites.forEach((sprite) => sprite.syncFromTower());
    this.enemySprites.forEach((sprite) => sprite.syncFromEnemy());
    for (const enemy of this.enemies) {
      if (enemy.dead) this.onEnemyGone?.(enemy.uid, enemy);
    }
    this.enemies = this.enemies.filter((enemy) => !enemy.dead);

    // Clean up enemy sprites that have gone (dead or reached).
    for (let i = this.enemySprites.length - 1; i >= 0; i--) {
      const sprite = this.enemySprites[i];
      if (sprite._destroyed) { this.enemySprites.splice(i, 1); continue; }
      const uid = sprite.getEnemyUid();
      const cbEnemy = this.enemies.find((e) => e.uid === uid);
      if (!cbEnemy || (cbEnemy.dead && cbEnemy.reached)) {
        sprite.destroy();
        this.enemySprites.splice(i, 1);
      }
    }

    // S06: Render projectile trails
    this._renderProjectiles();
  }

  updateProjectiles(dt) {
    for (let i = this.projectiles.length - 1; i >= 0; i -= 1) {
      const projectile = this.projectiles[i];
      const target = projectile.target;
      if (!target || target.dead) { this.projectiles.splice(i, 1); continue; }
      const dx = target.x - projectile.x;
      const dy = target.y - projectile.y;
      const distance = Math.hypot(dx, dy);
      const travel = projectile.speed * dt;
      if (distance <= travel || projectile.life <= 0) {
        // Fire hit FX with damage for scaling feedback
        const status = target.slowFactor < 1 ? 'slow' : 'normal';
        this._emitHit(target.x, target.y, status, projectile.dmg);
        // Apply damage
        target.damage(projectile.dmg);
        if (projectile.slow < 1) target.applySlow(projectile.slow, projectile.slowDur);
        this.projectiles.splice(i, 1);
        continue;
      }
      projectile.x += (dx / distance) * travel;
      projectile.y += (dy / distance) * travel;
      projectile.life -= dt;
    }
  }

  // S06: Render projectile trails with tower-color coding
  _renderProjectiles() {
    if (!this._fxSystem) return;

    // Clean up graphics for projectiles that no longer exist
    for (const [proj, gfx] of this._projectileGraphics) {
      if (!this.projectiles.includes(proj)) {
        gfx.destroy();
        this._projectileGraphics.delete(proj);
      }
    }

    // Render/update graphics for active projectiles
    for (const projectile of this.projectiles) {
      let gfx = this._projectileGraphics.get(projectile);
      if (!gfx) {
        gfx = this._fxSystem.drawProjectileTrail(projectile, projectile.towerType);
        this._projectileGraphics.set(projectile, gfx);
      } else {
        // Update position
        gfx.clear();
        const color = this._getTowerColor(projectile.towerType);
        gfx.fillStyle(color, 0.8);
        gfx.fillCircle(projectile.x, projectile.y, 4);
        gfx.fillStyle(color, 0.3);
        gfx.fillCircle(projectile.x, projectile.y, 7);
      }
    }
  }

  _getTowerColor(towerType) {
    // Match FXSystem.TOWER_COLORS for consistency
    const colors = {
      tranq: 0x66bb6a,
      fence: 0xffeb3b,
      drone: 0x42a5f5,
      heli: 0xef5350,
      chrono: 0xab47bc,
    };
    return colors[towerType] || 0xffffff;
  }

  /* ── FX emission helpers (renderer-neutral via callbacks) ───────── */

  /** Called when a tower fires a projectile. */
  fireTower(towerType, x, y) {
    const id = `${towerType}-${Math.floor(x / 10)}-${Math.floor(y / 10)}`;
    if (this._fxThrottle.has(id)) return;
    this._fxThrottle.set(id, this._now());
    this._fxThrottle.forEach((t, k) => { if (this._now() - t > 150) this._fxThrottle.delete(k); });

    // P3-05: FX + audio delegated to Phaser scene callbacks (avoid double-fire)
    this._towerFireCB?.(towerType, x, y);
  }

  /** Called when a projectile hits an enemy. */
  _emitHit(x, y, status, damage) {
    const key = `${status}-${Math.floor(x / 10)}-${Math.floor(y / 10)}`;
    if (this._fxThrottle.has(key)) return;
    this._fxThrottle.set(key, this._now());
    this._fxThrottle.forEach((t, k) => { if (this._now() - t > 300) this._fxThrottle.delete(k); });

    // P3-05: FX + audio delegated to Phaser scene callbacks (avoid double-fire)
    this._hitCB?.(x, y, status, damage);
  }

  /** Called when an enemy dies. */
  emitKill(x, y, species) {
    // P3-05: FX + audio delegated to Phaser scene callbacks (avoid double-fire)
    this._killCB?.(x, y, species);
  }

  /** Called when an enemy is slowed. */
  emitSlow(x, y) {
    // P3-05: FX + audio delegated to Phaser scene callbacks (avoid double-fire)
    this._slowCB?.(x, y);
  }

  getState() {
    return {
      enemies: this.enemies.length,
      liveEnemies: this.enemies.filter((enemy) => !enemy.dead).length,
      projectiles: this.projectiles.length,
      towers: this.towers.length,
    };
  }
}
