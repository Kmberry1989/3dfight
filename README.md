# 3DFight (FAMILY FIGHTER)

A browser-based 3D fighting game prototype built with **Three.js** and **PeerJS**. 

## Features
- **Fluid 3D Combat:** Block, punch, and kick your way to victory with branching combo systems and hit reactions.
- **Multiple Game Modes:** 
  - *Single Player:* Fight against a built-in computer AI that tracks distance and occasionally retreats.
  - *Local Multiplayer:* Play on a single keyboard (WASD vs Arrow Keys).
  - *Online Multiplayer:* Host and join matches remotely using WebRTC (PeerJS) join codes through the included lobby/signaling server.
- **Dynamic Camera System:** The camera actively tracks the action, shakes on impact, and provides cinematic angles for intros and victories.
- **Audio Synthesizer:** Built-in Web Audio API synthesizer for procedurally generated sound effects (swings, hits, blocks, selections).

## Setup & Running Locally
Because the game uses WebRTC and local asset loading (FBX files), it needs to be served via a local web server (opening `index.html` directly from the file system will trigger CORS errors).

1. Clone or download the repository.
2. Open a terminal in the project root.
3. Install dependencies with `npm install`.
4. For normal local play, run `npm run dev`.
5. For online multiplayer locally, run the lobby server in a second terminal with `npm run lobby`.
6. Open your browser and navigate to the Vite URL shown in the terminal.

## Hosted Lobby Server
To run multiplayer without your local machine staying online, deploy the included lobby server to a public Node host such as Render.

1. Deploy this repo as a web service using [render.yaml](/Users/kyleberry/3dfight/render.yaml).
2. Point your production frontend at that lobby host by creating a production env file from [.env.production.example](/Users/kyleberry/3dfight/.env.production.example).
3. Rebuild and deploy the frontend with those `VITE_PEER_*` values so browsers connect to the hosted signaling server instead of localhost.

## Directory Structure
- `index.html`: The core engine, rendering loop, and UI.
- `public/`: Directory containing all 3D assets (`.fbx`, `.glb`) and stage templates.
  - `public/animations/`: FBX motion capture animations.
  - `public/characters/`: FBX character models.
  - `public/stages/`: Stage layout and collision data.
- `ASSET_PIPELINE_GUIDE.md`: Rules and constraints for importing Mixamo assets and stages.

## Adding New Characters & Animations
Please refer to the `ASSET_PIPELINE_GUIDE.md` for specific rules regarding bone hierarchy, model facing, and naming conventions.
