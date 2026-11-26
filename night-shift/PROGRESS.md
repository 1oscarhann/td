# Night Shift: progress log

(The "Test this first" checklist goes here at the end of the overnight run.)

## How I verified things (all phases)

Godot 4.4.1 (official build, SHA-512 checked) runs in this container:
- `--headless --editor --quit` imports the project and reports script/scene errors
- a throwaway headless playtest script drives inputs through the whole route
- renders under Xvfb + software Vulkan, so I can look at real frames

None of this replaces playing it. No real mouse or keyboard was used, and the
container has no sound card, so **no sound has ever been heard**.

## Phases

### Milestone 1 base (earlier)
Torch, visibility rule, is_lit, boarded panel, stairs, tunnel, Wedged Thing,
narrator, synthesised audio. See README.md.

### Phase 1: look of the scene (commit "phase 1")
- Camera at integer 2x zoom, framed on the room's floor-to-ceiling midpoint
- Solid tiles split into floor / ceiling / side wall / rock, each a distinct shade
- Torch cone fades fully to transparent. A floor spill light sits in front of the player
- Fixed light leaking between tiles (back-face culled full-tile occluders)

### Phase 2: procedural pixel art
- `tools/gen_tiles.py` (standard library only) writes every PNG from one
  12-colour palette: a 10-step dark teal/grey ramp plus 2 dirty accents
  (ochre, rust).
- Everything is noise + grime + cracks, quantised with 4x4 Bayer dithering.
  Each texture also gets a normal map from brightness and a CanvasTexture `.tres`.
- Tiles: rock, concrete wall, brick wall, concrete floor, ceiling, side wall.
  Each comes in 3 variants (plain / cracked / grimy) and the level picks one per cell.
- Props: metal shelf, ceiling vent, wall pipe, cable, boarded panel (hole + plank),
  dead fluorescent tube.
- In Godot: the TileSet is built from `art/tiles/tiles.tres`. The shelf is now a
  Sprite2D. The panel draws the hole and plank textures, and fallen planks are sprites.
  The sign and door are recoloured to the palette.
- Removed the old in-code tile painter and `shelf.gd`.

### Phase 3: dress the scene
- New prop scenes: `vent.tscn`, `tube.tscn`, `pipe.tscn` (Sprite2D, repeating
  region), and `cable.tscn` + `cable.gd` (Line2D with a parabolic sag, cable texture tiled).
- `DECOR` list in `test_level.gd` places them. Ceiling and floor heights come from
  the map, so entries just name a cell inside the room. The storeroom gets dead strip
  lights, 2 vents, a pipe and a cable. The tunnel gets pipe runs, cables, dead tubes,
  a vent right over your head in the tight tunnel, high stuff in the open room you
  only find by looking up, and a vent and tube at the dead end.
- Cables are plain scenery (environment layer, always visible). No creature logic.
- Fixed the known Phase 1 bug: `camera_lead` 28 -> 48, so with the mouse at the
  screen edge the camera leans far enough to show the 120 px beam tip.

## Untested
- Audio, by ear (no sound card here).
- Real input feel: mouse aiming, camera lean, crouch timing.
- How dark it looks on a real monitor. My renders are software-rendered PNGs.

## Known bugs / rough edges
- The pipe texture repeats its bracket and rust spots every 16 px. Fine for now.

## Decisions to check
- **Palette has 2 non-teal accents** (ochre, rust) inside the 12 colours, for
  wood, crisp packets and signs. Without them, boards and packets read as grey mush.
- **Extra tile types:** rock and side wall, on top of the 4 you listed. The level
  needs something for solid rock and the side faces of walls.
- **Boarded panel art = two textures** (hole + one plank) instead of one image,
  because boards come off one at a time.
- **Narrator 20 s rule bent for two lines** (`min_gap` in the JSON): "it can see
  you" (8 s) and "further than that" (4 s).
