import Phaser from 'phaser';
import { ASSET_MANIFEST } from '../asset-manifest.js';

export default class PreloadScene extends Phaser.Scene {
  constructor() { super({ key: 'PreloadScene' }); }

  preload() {
    globalThis.__juraAssetErrors = [];
    this.load.on('loaderror', (file) => {
      globalThis.__juraAssetErrors.push(file.key);
    });
    
    // Create progress bar UI
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;
    
    const barWidth = 400;
    const barHeight = 20;
    const barX = (width - barWidth) / 2;
    const barY = height / 2;
    
    // Background
    this.progressBarBg = this.add.rectangle(barX, barY, barWidth, barHeight, 0x222222)
      .setOrigin(0, 0.5);
    
    // Fill
    this.progressBarFill = this.add.rectangle(barX, barY, 0, barHeight, 0x6fe3c1)
      .setOrigin(0, 0.5);
    
    // Text
    this.progressText = this.add.text(width / 2, barY - 40, 'Loading...', {
      fontSize: '24px',
      color: '#ffffff',
    }).setOrigin(0.5);
    
    // Track progress
    this.load.on('progress', (value) => {
      this.progressBarFill.width = barWidth * value;
      this.progressText.setText(`Loading... ${Math.floor(value * 100)}%`);
    });
    
    this.load.on('complete', () => {
      this.progressText.setText('Ready!');
    });
    
    for (const [key, url] of Object.entries(ASSET_MANIFEST)) {
      if (key === 'raptorWalk') this.load.spritesheet(key, url, { frameWidth: 96, frameHeight: 96 });
      else this.load.image(key, url);
    }
  }

  create() {
    this.scene.start(new URLSearchParams(globalThis.location.search).has('controller')
      ? 'ControllerPlaygroundScene'
      : 'PlaygroundScene');
  }
}
