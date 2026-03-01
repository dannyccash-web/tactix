import { defineConfig } from 'vite';
import legacy from '@vitejs/plugin-legacy';

// Goal: maximize browser/device compatibility (including older iOS Safari).
export default defineConfig({
  plugins: [
    legacy({
      // iOS Safari is usually the strictest target for web games.
      targets: [
        'defaults',
        'ios >= 12',
        'safari >= 12',
        'chrome >= 60',
        'firefox >= 60',
        'edge >= 79'
      ],
      // Add polyfills for features like async/await when needed.
      modernPolyfills: true,
      renderLegacyChunks: true
    })
  ],
  build: {
    // Keep assets as separate files (good for caching on Netlify/CDNs).
    assetsInlineLimit: 0
  }
});
