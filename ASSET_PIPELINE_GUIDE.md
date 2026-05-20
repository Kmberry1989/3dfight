# Asset Pipeline Guide

## Character Animation Pack Contract

Use the existing fighter rig format as the baseline:

- Export character models as `.fbx` with the same skeleton layout used by the current fighters.
- Keep bone names Mixamo-compatible when possible, especially `mixamorig` naming.
- Keep the character centered on the world origin in DCC before export.
- Keep the character feet resting on `Y=0` in the source scene.
- Face the character consistently in the same forward direction for every clip in the pack.
- Do not bake extra scene cameras, helpers, or lights into the final FBX unless they are intentional.

### Per-character folder layout

Put unique fighter clips in:

`public/animations/<fighter>/`

Preferred naming:

- `<Name> Idle.fbx`
- `<Name> Standing Pose.fbx`
- `<Name> Jumping Down.fbx`
- `<Name> Taunt.fbx`
- `<Name> Win.fbx`
- `<Name> Short Step Forward.fbx`
- `<Name> Long Step Forward.fbx`
- `<Name> Step Backward.fbx`
- `<Name> Punch Light.fbx`
- `<Name> Punch Medium.fbx`
- `<Name> Punch Heavy.fbx`
- `<Name> Kick Light.fbx`
- `<Name> Kick Medium.fbx`
- `<Name> Kick Heavy.fbx`
- `<Name> Hit Light.fbx`
- `<Name> Hit Medium.fbx`
- `<Name> Hit Heavy.fbx`
- `<Name> Death A.fbx`
- `<Name> Death B.fbx`

### Export rules

- One animation per FBX file.
- 30 FPS or 60 FPS is fine, but keep it consistent within a pack.
- Trim dead frames at the start and end.
- Root motion is optional; if you do include it, keep it deliberate and readable.
- Keep contact frames clear for attacks and landings.
- Heavy attacks should include readable anticipation.

## Stage Environment Contract

For stages, prefer `.glb` over `.fbx`.

Recommended layout:

`public/stages/<stage-id>/scene.glb`
`public/stages/<stage-id>/collision.glb`
`public/stages/<stage-id>/manifest.json`
`public/stages/<stage-id>/preview.jpg`

### World scale

- `1 unit = 1 meter`
- Playable floor centered around world origin
- Floor top surface at `Y=0`
- Keep the current arena lane in mind:
  - width: about `22`
  - depth: about `7`
- Put Player 1 spawn near `X=-3.5`
- Put Player 2 spawn near `X=3.5`

### Useful scene node names

- `stage_floor`
- `stage_backdrop`
- `stage_wall_left`
- `stage_wall_right`
- `collider_floor`
- `collider_wall_left`
- `collider_wall_right`
- `spawn_p1`
- `spawn_p2`
- `camera_focus`
- `fx_anchor_left`
- `fx_anchor_right`

### Modeling and material rules

- Keep the gameplay floor flat and readable.
- Separate collision from visual meshes when possible.
- Use PBR textures and keep them reasonably sized.
- Prefer `2K` textures for hero surfaces and `1K` for secondary props.
- Avoid one giant merged mesh if the stage has major independent props.
- Keep emissive materials isolated for neon signs, billboards, holograms, and accent strips.

### Manifest fields

Suggested `manifest.json` shape:

```json
{
  "id": "rooftop_night",
  "name": "Rooftop Night",
  "scene": "scene.glb",
  "collision": "collision.glb",
  "music": "rooftop-loop.ogg",
  "spawnP1": [-3.5, 0, 0],
  "spawnP2": [3.5, 0, 0],
  "cameraFocus": [0, 1.2, 0],
  "notes": "Neon rooftop with shallow playable depth"
}
```

## Good Next Move Packs

### Kyle

- Step-in straight with a sharp shoulder feint
- Rising anti-air uppercut
- Spinning backfist heavy ender
- Knee strike from close range

### Jonah

- Long overhand punch
- Forward body blow with extra recoil
- Heavy stomp kick
- Shoulder check combo ender

### Rochelle

- Fast low sweep opener
- Hook kick middle chain
- Cartwheel or spinning heel heavy
- Ducking counter punch

### Vickie

- Sharp jab-cross opener
- Pivot side kick
- High roundhouse heavy
- Stylish backstep counter strike

### Donald

- Big boot opener
- Charging body check
- Wide hook heavy
- Dramatic stomp finish

## Best Animation Additions To Build Next

- One overhead attack per fighter
- One sweep/low knockdown per fighter
- One launcher or anti-air per fighter
- One unique heavy punch ender per fighter
- One unique heavy kick ender per fighter
- Two extra victory variants per fighter
- Two death variants per fighter
- One hurt-stagger variant for blocked heavy hits
