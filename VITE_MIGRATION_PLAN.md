# Vite Migration Plan

This document outlines the steps to safely transition the game from a single monolithic `index.html` file to a modern Vite-powered, modular JavaScript architecture. This migration should be performed when the codebase becomes too difficult to manage in its current state.

## 1. Setup the Environment
- Run `npm create vite@latest . --template vanilla` in the project root to generate the necessary configuration files (`package.json`, `vite.config.js`).
- Run `npm install` to install base dependencies.
- Install necessary game libraries via npm: `npm install three peerjs`.

## 2. Directory Restructuring
Create a `src/` directory to hold all code, and keep `public/` for all static 3D models and audio files.
```text
/src
  ├── main.js        # Entry point
  ├── engine.js      # Three.js setup, rendering loop, camera
  ├── audio.js       # AudioSynth and background music logic
  ├── network.js     # PeerJS host/join logic and data channels
  ├── combat.js      # Locomotion, attacks, hit detection
  ├── ui.js          # Menu transitions and DOM manipulation
  └── constants.js   # CHARACTERS, ATTACKS, and animation dictionaries
```

## 3. Code Extraction
Carefully move blocks of code from `index.html` into their respective files in the `src/` directory. 
- You will need to `export` variables and functions from one file and `import` them into another to ensure they can talk to each other.
- The CSS `<style>` block in `index.html` should be extracted into a `src/style.css` file and imported in `main.js`.

## 4. Update index.html
Strip `index.html` down to just the HTML tags (the menus, the HUD, and the canvas container).
Replace the massive `<script>` block with a single module import:
```html
<script type="module" src="/src/main.js"></script>
```

## 5. Testing and Building
- Use `npm run dev` to start the local development server and test that all modules are interacting correctly.
- Once verified, run `npm run build`. Vite will compress, optimize, and bundle your code into a highly efficient `dist/` folder READY for deployment.
