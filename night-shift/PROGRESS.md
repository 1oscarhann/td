# Night Shift: progress log

## Test this first

Open `night-shift/project.godot` in Godot 4.4+, F5, headphones on.

1. **Look:** 640x360, finer art, the 44 px worker. Is zoom 1 too wide? (see
   Decisions to check: one line to change)
2. **Act 0:** start in the lit shop with no torch. Do the 3 jobs (hold E at the
   crisp box, the spill, the fridge). The lights stutter after 2. The power dies
   after 3. Do the lights, fridge hum and forecourt die, with only EXIT left lit?
3. **CCTV:** hold E at the monitor on the counter. Check once ("see"), close, check
   again. Is the man at the left edge of CAM1? Then walk to that corner: he must
   not be there.
4. **Torch pickup:** "torch is under the counter". Hold E at the till end, then
   click to toggle. Try the breaker in the storeroom.
5. **Panel:** 3 boards, torch forced at the floor while you pull.
6. **Spiders:** at the bottom of the stairs, light the ceiling vent. Tiny things
   scatter ("they're only spiders").
7. **Ceiling Arms:** aim left from the bottom of the stairs and wait. An arm
   reaches down; light it and it snaps back. The real one is in the passage
   before the crouch gap: walk under it in the dark and it grabs you.
8. **Wedged Thing:** unchanged rules. Check it still feels the same at the new
   scale: slow in the tight tunnel, fast in the open room, can't pass the
   crouch gap (hold Ctrl).
9. **Lever + Cables:** in the open room, pull the lever on the left (hold E,
   torch forced down, loud). The door in the passage grinds open. Stay by the
   lever: the low cable to its left (droops slightly more) slithers over and grabs
   your leg. Hold the beam on it to make it let go.
10. **Upstairs, down here:** go left from the bottom of the stairs into the dead
   end. The mop and bucket are next to the crisps shelf ("that wasn't there before").
11. **The spider that isn't:** in the tight tunnel, hold the beam on the vent.
   One "spider" doesn't run.
12. **Sound:** none of it has been heard by a human yet. Fluorescent buzz,
   fridge hum, clunk, scrape, taps, drips, hiss.

## How to run the art generator
`python3 tools/gen_tiles.py` (standard library only) rewrites everything in
`art/`. Godot reimports on focus.

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

### Visual pass (your request while I worked): resolution, art, player
- **640x360 internal resolution**, integer scaling (window 1280x720), camera
  zoom 1 (the 2x zoom is gone).
- **Subtler tiles:** small, low-contrast noise on 2-3 step ramps. No grime across
  the middle of walls. Grime only where it collects: new LOW/HIGH edge tiles where
  the wall meets the floor or ceiling, plus a dithered `grime` decal under the shelf,
  fridge, counter and mop. Cracks are one shade darker, not black.
- **Floor is clearly darker than the wall**, with a crisp lighter top edge so the
  floor line reads.
- **New player sprite, ~44 px:** hair, simple face (eye, brow, nose, mouth, ear),
  work polo with collar, a small dulled hi-vis stripe, name badge, belt, trousers,
  shoes, and the far arm. Frames: 2 idle (breathing), 4 walk, 2 crouch (still / creeping),
  in `art/player/player.png` (8 frames of 32x48). The torch arm is drawn in code
  (sleeve, forearm, hand, torch) so it points at the mouse whichever way he faces.
- **Door** is now generated art with a frame, wired glass pane, push bar, handle,
  lock and kick plate. The EXIT sign sits above it.
- Re-checked at the new resolution (renders + headless):
  - torch beam, spill and occluder shadows line up
  - bottom text is bigger and higher (font 14)
  - CCTV feeds are 320x180 each, filling the screen 2x2, with the same framing
  - debug overlay is wider
- **To fit a 44 px player I had to make the rooms taller** (see Decisions to check):
  - shop/storeroom 5 -> 7 tiles, tunnel 3 -> 4, tight tunnel 2 -> 3 (48 px)
  - open room 8 -> 11, crouch gap 1 -> 2 tiles (32 px), panel opening 2 -> 3 tiles
  - collider 28 -> 42 (crouch 14 -> 24)
  - the Thing's height-based numbers scaled by the same 1.5x
    (`normal_gap` 84, `min_squeeze` 40, `max_gap` 176), so its slow-in-tight /
    fast-in-open behaviour and the crouch-gap escape work as before
  - horizontal layout, speeds, timings and every rule are unchanged
- Verified headless: the full route from Act 0 to the ending, and death/respawn.

#### M2.5: switches and a heavy door (progression)
- `lever_switch.tscn/.gd`: a heavy lever on a junction box. Hold E 1.6 s with two
  hands, so the torch is forced at the floor. It has the doc's switch costs:
  - **noise:** a clunk with a 320 px radius, so the Thing comes
  - **electricity:** emits the new `GameState.switch_flipped(origin)`, which the Cables use
  - Lines: "the switch is loud" (in reach), "they heard that" (2 s after).
- `heavy_door.tscn/.gd`: fills the tunnel floor-to-ceiling and blocks movement and
  light. Powered, it grinds up into the ceiling and stays open.
- Placed by `DECOR` "switch"/"door" with a shared id: a lever on the left of the
  open room opens a door in the passage before the crouch gap. You now have to
  work a loud switch in the room where the Thing is fastest.
- New art (lever off/on, heavy door) and a looping electrical crackle sound.
- Verified headless: the door blocks the passage, the lever opens it, the full route
  reaches the ending.

#### M2.6: the Cables
- `cable_creature.tscn`: an inherited scene of the real `cable.tscn` (same art,
  same environment layer, always visible), with `cable_creature.gd`
  (extends WallCable).
- Rule: drawn to electricity. On `switch_flipped` within 420 px it drops off its
  fixing and slithers along the floor towards the switch, then towards you.
  Electrical crackle loop, plus a flickering spark light at the tip
  (environment mask, so it never reveals creatures).
- Grab: the tip at your feet wraps your leg. You can't walk and get dragged
  towards its fixing at 16 px/s, but you can still aim. **Hold the beam on it
  for 1 s to make it let go**; it retreats back onto the wall. It gives up after 14 s.
- Tell: 3 px more droop than real cables, and it twitches if lit for 2 s while hanging.
- Placed left of the lever, among real cables. First encounter is safe if you move
  on; dawdle at the switch and it gets you.
- An invisible Area2D on the creature layer lets the torch's is_lit see it. The
  player got a small `held` / `pull_speed` state (reset on respawn).
- Verified headless: lever -> slither -> grab -> lit 1 s -> released -> back
  on the wall. The full route still reaches the ending.

#### M2.7: things from upstairs
- The shop's mop and bucket appear in the tunnel's dead end beside the identical
  crisps shelf (where the Thing sleeps). The mop is also still upstairs. Never explained.
- "that wasn't there before" via a new `DECOR` "line" trigger. `DECOR` also gained "mop".
- Verified headless: two mops in the level, and the line plays.

#### M2.8: the spider that isn't
- `leg_tip.tscn/.gd`: in the tight-tunnel vent, among real spiders, a speck that
  looks like one. Hold the beam on it for 0.6 s: it doesn't scatter. It slides out
  as a long jointed leg (the Wedged Thing's colour), then pulls back slowly into
  the vent and is gone for good.
- The voice repeats "they're only spiders" (`only_spiders_lie`), now a lie. It's
  the one sanctioned repeat in the doc.
- Verified headless: wait -> reveal -> slow retract -> removed.

## Untested
- Audio, by ear (no sound card here).
- Real input feel: mouse aiming, camera lean, crouch timing.
- How dark it looks on a real monitor. My renders are software-rendered PNGs.

## Known bugs / rough edges
- The pipe texture repeats its bracket and rust spots every 16 px. Fine for now.

## Decisions to check
- **Cable escape = hold the beam on it for 1 s** (doc open question: mash E /
  light it / no escape). It fits pillar 1. Being held next to the Thing is the real
  danger; a Cable alone can't kill you.
- **The passage door is new progression I added** (doc: switches open doors).
  It makes the open room more dangerous (you must pull a loud lever there).
  Remove the two "switch"/"door" lines in `DECOR` to undo it.
- **Zoom 1 at 640x360 brings back the rock bands.** The camera now shows ~40x22
  tiles, so a 7-tile room fills about a third of the screen height. That's the
  direct result of "zoom 1" and contradicts the earlier "rooms fill the screen"
  ask. Pick one:
  - (a) keep it (more context, smaller pixels)
  - (b) taller rooms
  - (c) `zoom = Vector2(2, 2)` on the player Camera2D (crisper than before,
    since the art is now finer)
- **Rooms got taller to fit the 44 px player** (numbers above). The alternative,
  a 44 px sprite on a 28 px collider, would have drawn your head through every
  tunnel ceiling.
- **The player uses 4 extra colours** (skin, skin shadow, hair, dulled hi-vis),
  indices 12-15. The environment still uses only the 12-colour palette.
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
