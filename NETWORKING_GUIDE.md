# Networking & Multiplayer Guide

This project uses **PeerJS** to facilitate peer-to-peer (P2P) online multiplayer with a self-hosted lobby/signaling server.

## How It Works
1. **Lobby / Signaling Server:** When a player opens the Online Multiplayer lobby, the game connects to the included PeerJS signaling server (`npm run lobby` locally or `npm start` on a hosted Node service). This server's only job is to help two browsers find each other; it does not host the game logic.
2. **Hosting:** When a player clicks "Host Game", PeerJS assigns them a unique ID string. This acts as the "Join Code".
3. **Joining:** The second player enters the Join Code. The browsers negotiate a WebRTC Data Channel connection.
4. **State Syncing:** Once connected, the host sends a `start` signal. During combat, raw input events (`keydown` and `keyup` for specific action keys) are transmitted over the data channel.
5. **Deterministic Lockstep:** Because both browsers run the exact same `Three.js` engine and `animate()` loop, applying the exact same inputs at roughly the same time keeps the game state synchronized.

## Current Limitations & Future Improvements
- **Desyncs:** Because this relies on basic delay-based syncing, if one player drops frames or experiences lag spikes, the two browsers can drift out of sync over time.
- **No Rollback:** There is currently no Rollback netcode implementation. High latency connections will feel sluggish or missed inputs may occur.
- **Cheat Prevention:** P2P architecture means both clients are authoritative over their own state. There is no server to validate if a client modifies their local health variable.

## Troubleshooting
- **Lobby server not reachable:** Make sure `npm run lobby` is running. By default it listens on port `9000` and path `/peerjs`.
- **Hosted deployment:** Use a public Node host and set frontend `VITE_PEER_HOST`, `VITE_PEER_PORT`, `VITE_PEER_PATH`, and `VITE_PEER_SECURE` values to that server. A Render starter config is included in [render.yaml](/Users/kyleberry/3dfight/render.yaml).
- **Cannot Connect:** Ensure both players are on a stable connection. Some corporate or school firewalls block WebRTC STUN/TURN servers.
- **Double Inputs:** Ensure you are not running multiple tabs of the game at once, as the keyboard event listeners might get confused if focus changes.
- **Different Speeds:** Ensure both players have hardware acceleration enabled in their browser so the `requestAnimationFrame` loop maintains a consistent 60 FPS.
