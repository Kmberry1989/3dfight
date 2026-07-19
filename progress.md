Original prompt: Implement a new Story Mode architecture within our existing index.html file that processes FBX-formatted enemies.

- Replaced Story Mode enemy templates with FBX files under public/characters/story_enemies/.
- Added StoryEnemyManager to preload FBX templates, track activeEnemies, give each spawn its own mixer, remove defeated enemies from the active set, and update enemy mixers in the frame loop.
- `npm run build` passed. Browser testing reached Story Mode's first FBX encounter (`thug1`, 95 HP) with no JavaScript errors; retained defeated meshes are cleaned before the next wave.
