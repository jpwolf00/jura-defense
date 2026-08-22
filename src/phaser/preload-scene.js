import Phaser from 'phaser';
import { ASSET_MANIFEST } from '../asset-manifest.js';

export default class PreloadScene extends Phaser.Scene {
  constructor() { super({ key: 'PreloadScene' }); }

  preload() {
    globalThis.__juraAssetErrors = [];
    this.load.on('loaderror', (file) => {
      globalThis.__juraAssetErrors.push(file.key);
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
