import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    assetsInlineLimit: 0,
    rollupOptions: {
      input: {
        index: 'src/index.html',
        phaser: 'src/phaser.html',
      },
    },
  },
  server: {
    port: 4173,
  },
});
