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

### Milestone 1 status: complete
Everything on the doc's milestone 1 checklist is in and working headless:
low-res setup, walk/run/crouch, torch + shadows + toggle, visibility rule,
is_lit with raycasts, boarded panel, tunnel, placeholder Wedged Thing,
narrator + typewriter, positional audio. The doc's own next step is
"play it with the lights off and get a mate to play it". That one's yours.

### Milestone 2 (my definition, see Decisions to check)
The doc defines no milestone 2, so I took the next content in the doc's own
order: Zone 1 spiders -> Act 0 shop + power cut -> CCTV figure -> Ceiling Arms.

#### M2.1: little spiders
- `scenes/creatures/spider.tscn/.gd`: Area2D on the creature layer with a
  Light Only material. A few pixels, crawls along the ceiling.
- Rule: lit -> runs away from the torch. If it runs out of room it disappears into a crack
  for 4-9 s. Harmless.
- First scatter in the game -> "they're only spiders" (new line in the JSON).
- Placed with `DECOR` "spiders" entries: 3 above the bottom of the stairs (with a new
  vent), 2 in the tight tunnel, 3 in the open room, 2 at the dead end.
- Verified headless: lighting a spider -> it flees, then hides, and the line plays.

#### M2.2: Act 0, the shop and the power cut
- New shop room left of the storeroom, joined by a doorway. Everything else moved
  26 columns right; `DECOR` was shifted to match.
- Start: lights on (bright, flat, greenish ambient), no torch. `Torch.available`
  is false until you pick it up.
- Jobs (hold E, `ShopTask`): stack the crisps (the box by the shelf), mop the spill,
  check the fridge. "the crisps go on the left" plays near the shelf.
- After 2 jobs: one stutter of the lights, "the lights do that sometimes".
- After 3 jobs (+5 s), or 150 s regardless: the power cut. Tubes flicker and die,
  the fridge hum and fluorescent buzz stop, the forecourt window goes dark, and the
  ambient snaps to dark blue. The battery EXIT sign stays lit.
- Then "torch is under the counter": hold E at the counter. The breaker in the
  storeroom clunks and does nothing ("the breaker won't help"). The boarded panel
  and the "fuse box downstairs" trigger only arm after the cut.
- New: `act0.gd` (director), `powered_prop.gd` (lights / hum / texture swap on
  power), `shop_task.gd`, plus scenes: shop_light, fridge, shop_window, counter
  (with CCTV monitor sprite), mop_bucket, breaker.
- New art in gen_tiles.py: fridge, counter + till, CCTV monitor, mop + bucket,
  window (on/off), breaker, crisp box. New sounds: fluorescent buzz loop, clunk.
- The storeroom is now zone 1 (repeatable doorway triggers `7` / `8`), so its
  long-dead lights stay dark even while the shop is lit.
- Fixed: after the ending reloads the scene, the level showed the old zone's
  darkness. Main now re-applies the zone after resetting.
- Verified headless: full route from the first job to the tunnel. Renders: shop
  lit, shop after the cut, EXIT sign.

#### M2.3: CCTV and the figure
- Hold E at the monitor on the counter (repeatable `ShopTask` "cctv") to open a
  full-screen view of 4 feeds: CAM1 shop floor, CAM2 till, CAM3 forecourt (through
  the window), CAM4 storeroom (the boarded panel).
- Each feed is a SubViewport sharing the game's World2D with a fixed Camera2D,
  through a grainy B/W shader (`cctv.gdshader`): gain, grain, scanlines, vignette.
  The feeds show the real shop live: lights, power cut, you.
- `CCTVFigure`: grey man-shaped silhouette on **visibility layer 2**. Main sets
  the root viewport to cull that layer, so he is never drawn in the shop, only on
  the feeds.
- Escalation in this slice: check 1 = empty shop, then "see" when you close it.
  Check 2+ = him in the far corner of CAM1, half out of frame. He only moves
  between checks.
- Closing: E (after releasing), Esc, A/D or click. The player is locked while viewing.
- "check the cameras" plays near the counter.
- Verified with renders: feeds show the live world, the figure is on camera on
  check 2, and he's absent from the real shop.

#### M2.4: Ceiling Arms
- `scenes/creatures/ceiling_arm.tscn/.gd`: lives in a vent. Long pale arm, 8
  joints, swaying, steering towards you, twitching fingers. Light Only on the
  creature layer.
- Rule: player near and arm in the dark -> scratching in the duct (1.3 s), then it
  reaches down. A grab at the tip = caught (same death/respawn as the Thing). Lit while
  scratching or reaching -> fast retract, then 3 s in the vent.
- "don't stand under it" on its first scratch.
- Teaching arm left of the stairs, over ground you never need to cross. The real
  one is in the passage before the crouch gap, on the chase route.
- `reset_creatures()` now resets every creature with a `reset()` method.
- Fixed: tile collision isn't in the physics space for a frame or two. The arm now
  retries its floor raycast, and the dormant Thing keeps re-measuring the tunnel,
  so it no longer reports a 128 px gap in a 48 px tunnel.
- Verified headless: grabbed in the dark (~2 s), retracts when lit.

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
- **Milestone 2 scope is my guess.** The doc only defines milestone 1. I used
  the doc's order: spiders, Act 0 + power cut, CCTV, Ceiling Arms.
- **Act 0 jobs:** stack crisps, mop, fridge. The fridge job does nothing visible
  (the doc gives no fridge payoff). The CCTV glance is M2.3.
- **Power cut timing:** after all 3 jobs, or 150 s, whichever is first.
- **The panel is locked until the power cut**, so you can't skip Act 0.
- **Lines from the doc I didn't use:** "nobody comes in after two" (needs a
  look-at-the-door trigger; skipped), "it's fine" (still on the first board).
- **CCTV keeps working after the power cut** (on backup, like the EXIT sign),
  because the doc has you checking it on return trips.
- **Figure stages:** only "empty" and "far corner" exist. The others need the
  return trips upstairs, which the slice doesn't have.
- **"see" bends the 20 s rule** (`min_gap` 6) so it lands right after the check.
- **Spiders live in the tunnel**, not a separate Zone 1 cellar. The slice has
  no cellar section, and adding one is level design you should own.
- **Boarded panel art = two textures** (hole + one plank) instead of one image,
  because boards come off one at a time.
- **Narrator 20 s rule bent for two lines** (`min_gap` in the JSON): "it can see
  you" (8 s) and "further than that" (4 s).
