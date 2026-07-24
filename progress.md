Original prompt: Implement a new Story Mode architecture within our existing index.html file that processes FBX-formatted enemies.

- Replaced Story Mode enemy templates with FBX files under public/characters/story_enemies/.
- Added StoryEnemyManager to preload FBX templates, track activeEnemies, give each spawn its own mixer, remove defeated enemies from the active set, and update enemy mixers in the frame loop.
- `npm run build` passed. Browser testing reached Story Mode's first FBX encounter (`thug1`, 95 HP) with no JavaScript errors; retained defeated meshes are cleaned before the next wave.
- Fixed Story Mode enemy rigs inheriting large absolute Mixamo root offsets: clips now pin root translation to each target skeleton rest pose. Added a Story AI spacing guard to prevent enemy/player overlap.
- Browser validation: the first FBX enemy remains visible and grounded; it can damage the player, and four standard player kicks reduced its health from 95 to 85 with no JavaScript errors.

- Combat Flow Refactor: added authored 60 FPS move data, a fighter state machine, frame-buffered attacks, bone-following hit/hurt boxes with `H` diagnostics, throws, meter, and fixed-step combat hooks. `npm run build` passes; follow-up browser validation should wait through the cinematic entrance before asserting `gameActive`.
- Validation: `npm run build` passes. The Playwright game client rendered the main menu and returned a clean `render_game_to_text` payload; a direct state-machine timing check confirmed punch startup transitions into ACTIVE and then RECOVERY at the authored frame boundaries.
