# Tactix (Phaser) - Netlify/Vite build

This repo packages your existing Phaser game for **maximum browser/device compatibility**:
- Phaser is installed locally (no CDN dependency)
- The build is bundled + transpiled using Vite + `@vitejs/plugin-legacy`
- Works better on older iOS/Safari because optional chaining / nullish coalescing / async-await are transpiled

## Local dev

1. Install dependencies

```bash
npm install
```

2. Run the dev server

```bash
npm run dev
```

Vite will print a local URL (usually `http://localhost:5173`).

## Build for production

```bash
npm run build
```

The production site is output to the `dist/` folder.

## Deploy on Netlify

### Option A (recommended): drag-and-drop deploy

1. Run `npm run build`
2. In Netlify, use **Deploys → Manual deploy → Drag and drop**
3. Drag the entire `dist/` folder into Netlify.

### Option B: connect a Git repo

1. Push this project to GitHub/GitLab
2. In Netlify: **Add new site → Import from Git**
3. Build settings:
   - Build command: `npm run build`
   - Publish directory: `dist`

These are also included in `netlify.toml`.

## Where the game code lives

- `src/main.js` is your original `main.js` with one change: `import Phaser from 'phaser'`.
- Static assets are in `public/` (served at the site root).

