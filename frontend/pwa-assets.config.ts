import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

// Ikone PWA iz public/icon.svg (design.md 12): 64, 192, 512, maskable 512, apple-touch 180.
export default defineConfig({
  preset: minimal2023Preset,
  images: ['public/icon.svg'],
});
