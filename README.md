# 3DFight (FAMILY FIGHTER)

A browser-based 3D fighting game prototype built with **Three.js** and **PeerJS**. 

## Features
- **Fluid 3D Combat:** Block, punch, and kick your way to victory with branching combo systems and hit reactions.
- **Multiple Game Modes:** 
  - *Single Player:* Fight against a built-in computer AI that tracks distance and occasionally retreats.
  - *Local Multiplayer:* Play on a single keyboard (WASD vs Arrow Keys).
  - *Online Multiplayer:* Host and join matches remotely using WebRTC (PeerJS) join codes without the need for a dedicated backend server.
- **Dynamic Camera System:** The camera actively tracks the action, shakes on impact, and provides cinematic angles for intros and victories.
- **Audio Synthesizer:** Built-in Web Audio API synthesizer for procedurally generated sound effects (swings, hits, blocks, selections).

## Setup & Running Locally
Because the game uses WebRTC and local asset loading (FBX files), it needs to be served via a local web server (opening `index.html` directly from the file system will trigger CORS errors).

1. Clone or download the repository.
2. Open a terminal in the project root.
3. Run a local development server. For example:
   - `python3 -m http.server 8000`
   - `npx serve`
   - `php -S localhost:8000`
4. Open your browser and navigate to `http://localhost:8000`.

## Directory Structure
- `index.html`: The core engine, rendering loop, and UI.
- `public/`: Directory containing all 3D assets (`.fbx`, `.glb`) and stage templates.
  - `public/animations/`: FBX motion capture animations.
  - `public/characters/`: FBX character models.
  - `public/stages/`: Stage layout and collision data.
- `ASSET_PIPELINE_GUIDE.md`: Rules and constraints for importing Mixamo assets and stages.

## Adding New Characters & Animations
Please refer to the `ASSET_PIPELINE_GUIDE.md` for specific rules regarding bone hierarchy, model facing, and naming conventions.
