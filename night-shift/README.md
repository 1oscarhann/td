# Night Shift: vertical slice (milestone 1)

Working title. A dark 2D semi-horror side-scroller in **Godot 4.4 (GDScript)**.
This is the milestone-1 slice from the design doc: the smallest scary thing.
It has one storeroom, one boarded panel, one stairwell, one tunnel and one creature.

**Run it:** open `night-shift/project.godot` in Godot 4.4+, press F5. Play with
the lights off and headphones on.

Art is generated pixel art in `art/` (made by `python3 tools/gen_tiles.py`) plus
creatures drawn in code. Audio is real recordings in `audio/engine/` and
`audio/creature/`. Any sound name without a file falls back to one synthesised at
startup (the UI click, the fridge hum, the sub-bass drone, and so on).

## Controls

| Input | Action |
| --- | --- |
| A / D (or arrows) | Walk |
| Shift (hold) | Run: loud, drains stamina (~5 s, no bar) |
| Ctrl (hold) | Crouch: quiet, slow, fits under the 1-tile gap |
| W / S | Climb the stairwell |
| Mouse | Aim the torch (360°, independent of facing) |
| Left click | Torch on / off |
| E (hold) | Pull boards off the panel (torch is forced at the floor) |
| F3 | Debug overlay (Thing state, lit time, stamina, narrator cooldown) |

> Current status, what's untested, known bugs and decisions to check: see
> [PROGRESS.md](PROGRESS.md). Since this README was written, the slice gained
> an Act 0 shop + power cut, CCTV, spiders, Ceiling Arms and generated pixel art.

## What's in the slice

The route is storeroom (power's out, red EXIT sign), then the boarded panel (3 boards, hold E), then the
stairs down, then the tunnel. The tunnel has a left dead end where the Thing sleeps next
to a familiar shelf of crisps, then a **tight** 2-tile tunnel, an **open** 8-tile room,
a 1-tile **crouch gap**, and a dead end where the FUSE BOX sign points into the wall.

- **Low-res pipeline:** 640x360 viewport, stretch mode `viewport`, aspect `keep`,
  integer scaling, nearest filtering, 2D transform/vertex pixel snapping.
  Art comes from `tools/gen_tiles.py` (re-run it after editing; Godot reimports).
- **Torch:** `PointLight2D` with a procedurally generated, banded cone texture
  (40°, 120 px). Shadows are on, and tiles cast them through TileSet occlusion polygons.
  A dim, shadowless glow keeps the player from vanishing.
- **Visibility rule:** the Wedged Thing uses a `CanvasItemMaterial` with
  Light Mode = **Light Only** on light-mask bit 2. Only the torch's
  `range_item_cull_mask` includes bit 2. The glow and the EXIT light don't. So it exists
  only inside the beam, and only the parts the beam touches.
- **is_lit:** the torch's cone `Area2D` is a broadphase. Each creature inside it
  gets raycasts to its probe points (`get_light_probe_points()`) against the world layer.
  The checks are exposed as `GameState.is_lit(node)` / `get_lit_time(node)`, and the
  torch calls `on_torch_lit_changed(lit)` on the creature.
- **Wedged Thing (placeholder):** wakes when you reach the tunnel and stalks towards you.
  It hunts noises (`GameState.noise_made`) and notices a beam pointed its way from 230 px.
  Lit, it **freezes for 2 s** with its legs twitching, then comes **faster** for 3.5 s and ignores the
  light. Each freeze makes it angrier. Its speed scales with tunnel height: slow
  and loud when squeezed, fast in the open room. It can't fit under the crouch gap.
  It has procedural two-bone IK legs stepping on floor *and* ceiling, a scrape loop and leg taps.
- **Narrator:** autoload `say(line_id)`. Lines are in `data/narrator_lines.json`.
  There's a 20 s global cooldown, no repeats, and a priority queue where low-priority lines drop.
  The typewriter has uneven delays, pauses, a static hiss, a 2-4 s hold, a 1 s fade and a rare linger.
  Glitch swaps are wired up for zones 3-4.
- **Audio:** positional `AudioStreamPlayer2D` for everything in the world. The "World" bus
  has a reverb that grows per zone. There's a tunnel hum and random drips.
- **Death:** cut to black, low boom, respawn at the last checkpoint, creatures reset.

## Project layout

```
tools/         gen_tiles.py + art/ (procedural pixel art -> art/)
art/           generated PNGs, normal maps, CanvasTextures
autoload/      GameState (noise, light queries, checkpoint, zone)
               AudioDirector (sound variants, play_at / play_distant, World + Distant buses, drone)
               Narrator (say(), cooldown, queue, no repeats)
data/          narrator_lines.json
scripts/       light_textures.gd (cone + radial light textures)
scenes/
  main.tscn    Main: Level + Player + UI, death/respawn + ending
  player/      player.tscn (+ torch.gd, player_visual.gd, interact_prompt.gd)
  levels/      test_level.tscn (ASCII map -> TileMapLayers + markers),
               tileset_builder.gd (atlas, normal map, collision, occluders)
  creatures/   wedged_thing.tscn
  props/       boarded_panel, stairs, level_trigger, shelf, fuse_sign, shop_door
  ui/          ui.tscn (BottomText, fade, title card, debug)
```

### Editing the level

The layout is the `MAP` array in `scenes/levels/test_level.gd`. Each character is one 16x16
tile. `#`/`%` are solid concrete/brick, `.`/`,` are open space. Letters and digits are markers:
player start, panel, stairs, Thing, shelf, signs, door, and triggers `1`-`9`
(configured in `TRIGGERS`). The legend is at the top of the file.

The TileSet is generated in code (`tileset_builder.gd`) so the slice needs no image
files. When real art arrives, build a TileSet resource in the editor with the same
physics and occlusion layers and paint the level by hand.

### Physics layers / light masks

| Physics layer | Use |
| --- | --- |
| 1 world | tiles, panel blocker |
| 2 player | player body |
| 3 stair_platform | one-way platform over the stairwell |
| 4 creatures | creature areas (what the torch cone looks for) |
| 5 interactables | hold-E zones |
| 6 climbable | stairwell climb areas |

Light mask bit 1 is the environment (everything). Bit 2 is creatures, and only the torch includes it.

## Tuning knobs

- Player speeds, stamina, noise radii: `@export`s on `Player`.
- Torch angle, length, energy, banding: `@export`s on `Torch`.
- Thing speeds, gap scaling, freeze/enrage times, senses: `@export`s on `WedgedThing`.
- Darkness per zone, hum volume, reverb: constants at the top of `test_level.gd`.
- Narrator cooldown: `Narrator.global_cooldown`. Per-line `priority`, `min_gap` and
  `max_wait` go in the JSON.
  - Two lines bend the 20 s rule on purpose. "it can see you" has `min_gap: 8` so
    a throwaway idle line can't block it, and the final line has `min_gap: 4`. Delete those
    keys if you want the rule strict.

## Answers this slice gives to the doc's open questions (all provisional)

- **Wedged Thing light rule:** freeze 2 s, then enrage (faster, ignores light). Test it.
- **Death:** checkpoint restart.
- Cable grabs, the ending, the return trips and the final title are untouched.

## Notes

- Exporting: add `*.json` to the export preset's non-resource filter so
  `data/narrator_lines.json` is included.
- The font is Godot's default with antialiasing off. Swap in a real pixel font
  (theme override on `UI/BottomText`) when you have one.
- Normal maps are on the tiles (brick catches the torch). If you replace the light
  textures, keep `height` on the lights above 0, or normal-mapped tiles go flat-dark.
