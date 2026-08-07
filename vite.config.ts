import { defineConfig } from 'vite';

export default defineConfig({
  base: '/weapon-report/',
  build: {
    target: 'es2020',
    assetsInlineLimit: 0,
    reportCompressedSize: true
  }
});
