import Phaser from 'phaser';
import { createGameController } from '../game/game-controller.js';

export default class ControllerPlaygroundScene extends Phaser.Scene {
  constructor() { super('ControllerPlaygroundScene'); }

  create() {
    this.controller = createGameController();
    this.add.rectangle(640, 360, 1280, 720, 0x17231d);
    this.add.text(40, 34, 'Jura Defense Controller Bridge', { fontSize: '32px', color: '#f2b75b' });
    this.add.text(40, 82, 'Renderer-neutral state/events consumed by Phaser', { fontSize: '18px', color: '#b7c5ba' });
    this.stateText = this.add.text(40, 170, '', { fontSize: '26px', color: '#ffffff', lineSpacing: 12 });
    this.eventText = this.add.text(40, 330, 'Last event: —', { fontSize: '20px', color: '#6fe3c1' });
    this.makeButton(180, 520, 'Start', () => this.controller.start());
    this.makeButton(500, 520, 'Pause / Resume', () => this.controller.pauseToggle());
    this.makeButton(820, 520, '1× / 2×', () => this.controller.setSpeed(this.controller.getState().timeScale === 1 ? 2 : 1));
    this.makeButton(180, 620, 'Victory', () => this.controller.victory());
    this.makeButton(500, 620, 'Defeat', () => this.controller.defeat());
    this.makeButton(820, 620, 'Restart', () => this.controller.restart());
    this.syncState(this.controller.getState(), null);
    this.unsubscribe = this.controller.subscribe((state, event) => this.syncState(state, event));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.unsubscribe?.();
      this.unsubscribe = null;
    });
  }

  syncState(state, event) {
    globalThis.__juraControllerState = { ...state };
    if (event) globalThis.__juraControllerEvent = event.type;
    this.stateText.setText(`Phase: ${state.phase}\\nWave: ${state.wave}\\nMoney: ${state.money}\\nLives: ${state.lives}\\nTime scale: ${state.timeScale}×`);
    if (event) this.eventText.setText(`Last event: ${event.type}`);
  }

  makeButton(x, y, label, action) {
    const bg = this.add.rectangle(x, y, 250, 74, 0x263a30).setStrokeStyle(2, 0x6fe3c1).setInteractive({ useHandCursor: true });
    this.add.text(x, y, label, { fontSize: '22px', color: '#ffffff' }).setOrigin(0.5);
    bg.on('pointerdown', action);
    bg.on('pointerover', () => bg.setFillStyle(0x315144));
    bg.on('pointerout', () => bg.setFillStyle(0x263a30));
  }
}
