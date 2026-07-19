Original prompt: Implement a new Story Mode architecture within our existing index.html file that processes FBX-formatted enemies.

- Replaced Story Mode enemy templates with FBX files under public/characters/story_enemies/.
- Added StoryEnemyManager to preload FBX templates, track activeEnemies, give each spawn its own mixer, remove defeated enemies from the active set, and update enemy mixers in the frame loop.
- `npm run build` passed. Browser testing reached Story Mode's first FBX encounter (`thug1`, 95 HP) with no JavaScript errors; retained defeated meshes are cleaned before the next wave.
- Fixed Story Mode enemy rigs inheriting large absolute Mixamo root offsets: clips now pin root translation to each target skeleton rest pose. Added a Story AI spacing guard to prevent enemy/player overlap.
- Browser validation: the first FBX enemy remains visible and grounded; it can damage the player, and four standard player kicks reduced its health from 95 to 85 with no JavaScript errors.
