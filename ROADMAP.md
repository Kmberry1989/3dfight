# 3DFight Development Roadmap

This document outlines potential future features, refactors, and enhancements for the FAMILY FIGHTER engine.

## Near-Term Goals (Quality of Life)
- **Controller Support:** Implement the HTML5 Gamepad API so players can use Xbox/PlayStation controllers for both local and online play.
- **Improved AI:** Expand the Single Player AI to include multiple difficulty tiers (e.g., Easy, Normal, Hard). Harder difficulties could read the player's inputs to perfectly block or counter-attack.
- **Stage Swapping:** Currently the game spawns on a generic procedural grid. Integrate the new `public/stages/` template system to load 3D environments, complete with collision boundaries and stage-specific background music.

## Medium-Term Goals (Gameplay Mechanics)
- **Special Moves & Projectiles:** Add complex input buffers (e.g., Quarter-Circle Forward + Punch) to trigger particle-based projectiles (like a Hadouken).
- **Jumping & Crouching:** Add verticality to the combat. This requires implementing jump arcs, gravity, and mid-air attack/reaction animations.
- **Grapples & Throws:** Implement close-range unblockable throws that trigger synchronous animations between both characters.
- **Health/Stamina Systems:** Introduce chip damage on blocks, and a stamina bar that limits infinite dodging or spamming heavy attacks.

## Long-Term Architecture Enhancements
- **Code Refactoring:** Break down the monolithic `index.html` into a modular JavaScript project (using ES Modules, Vite, or Webpack) with separate files for Networking, Engine, AI, Input, and Rendering.
- **Rollback Netcode:** Upgrade the current delay-based WebRTC networking to a GGPO-style rollback netcode to handle higher ping matches seamlessly.
- **Asset Bundling:** Pre-compile or compress the FBX models to reduce initial loading times. Use GLTF/GLB formats across the board instead of FBX for better web optimization.
