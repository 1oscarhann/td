# Night Shift: progress log

## Test this first: "make it scary" Phase 2 (the Thing is a threat)

Headphones on. Press **F3** for the debug overlay: it shows the Thing's state and
WHY it noticed you ("heard", "light", "noise", "touch").

**The basement (your layout fix):**
1. After the power cut, go through the storeroom and take the stairs down (S).
   You're now in the gas station's basement. The FUSE BOX sign at the bottom
   points right ("just follow the signs").
   - It's a concrete cellar: shelves of stock, the mop ("that wasn't there before"),
     the red door, a dead strip light, spiders in the vent by the stairs.
   - At the far right end the tunnels are **boarded up**: hold E, 3 boards, loud.
   - The panel isn't in the storeroom any more.

**Zone 2 (the Thing is only ever SEEN here):**
2. **The eye:** right after the boards, point the torch straight down the tight
   tunnel. Far away, ONE warm pixel looks back ("it can see you"). Keep the light
   on it or walk towards it: it's gone. Did you even see it?
3. **The leg:** further in, the "spider" in the vent that doesn't run.
4. **The silhouette:** walk into the open room. High on the far right there's a
   working light (relief). A black shape crosses in front of it into the passage.
   Go there: nothing.
5. Nothing hunts you in zone 2. The Thing is asleep until zone 3.

**Zone 3a (after your first trip back up and down again):** it lives in the tall
room after the crouch gap. The crouch gap is safe: it can't fit through.
6. **Hide:** torch off, crouch, DON'T MOVE, right in its path. It walks over you:
   the breathing, the taps, its legs around you. Then it carries on.
   Any movement under it and it notices. Standing up: it notices.
7. **Hearing:** it hears you by how you move.
   - crouch-walk: 2 tiles
   - walk: 6 tiles
   - run: ~14 tiles
   - standing still: almost touching
   - crouched still: nothing at all
8. **Noticed:**
   - it freezes for 0.8 s
   - the sting plays
   - the screen jolts
   - its head SNAPS round to you
   - then it comes, faster than you walk and slower than you run (in normal
     corridors)
9. **Light:**
   - Unaware: the torch on it makes it hold still. Keep it on it 1.5 s and it
     notices you.
   - Hunting: the light freezes it 1 s, then it lurches and keeps coming through
     the light for ~2.5 s.
10. **Lose it:** run until you're well clear (~13 tiles in a corridor, more in
    open rooms), torch off, crouch still.
    - After 3 s it gives up.
    - It goes to where it lost you and sniffs about for 6 s, maybe right over
      you. Then it wanders off.
11. **The director:** stay out of its way and every 1-2 minutes it drifts towards
    roughly where you are. Never exactly.
12. **Height still matters:** in tight tunnels it's slow and there's no room to
    hide under it. In open rooms it's faster than you can run.

**The look:** does it read like your concept now?
- tall head-stalk with one eye
- spiked shoulders
- ribs and gut
- long blade arms
- the leg skirt

In normal corridors it's crammed in, head bent against the ceiling.

## Phase 1 checklist (real audio), if you haven't done it yet

Headphones ON. That's not optional: the drone sits at 45-52 Hz and laptop
speakers won't play it at all.

1. **Shop (Act 0):** there should be no tunnel hum in the shop. The fridge still has
   its own synth hum, and the tubes still buzz.
2. **Down the stairs:** the tunnel bed (`hum.ogg`) fades in quietly. Drips come from
   around you, 8 different ones, never the same one twice in a row. Does the bed
   feel like a bed, or does it drown things out?
3. **Footsteps:** quieter than before. Running should still be clearly louder
   than walking, and crouching almost silent.
4. **The Wedged Thing (tunnel past the stairs):** stand still in the dark and let
   it come.
   - The drag loop (`creature_drag.ogg`) should be clearly positional: left or right.
   - Inside ~200 px the **breathing** fades in. Shine the torch on it and the
     breathing fades out. Torch off and it comes back.
   - A quiet **gurgle** every 4-10 s while it moves.
   - When it wakes or hears you: the **notice sting** (`wail_notice_sting.ogg`).
   - When it gets close, the hum and drips drop out. The **drone** rises the closer
     it is.
5. **Ceiling Arm:** the scratching in the duct before it drops is
   `creature_scrape_soft.ogg` now.
6. **Distant sounds:** from zone 2 on, roughly every 35-80 s, a far-away moan,
   wail, growl or call, muffled and with a long tail, off to the left or right.
   Do they sound FAR, or just quiet?
7. **Caught:** the caught sting is `caught.ogg`.
8. **Climax (zone 4, "we're nearly there"):** the drone cuts to silence for 3 s
   just before the Thing appears behind you.

**Tell me:** anything too loud or too quiet. The level knobs are listed in "Mix knobs" below.

**Mix knobs** (one line each):
- tunnel bed: `ZONE_HUM_DB` in `scenes/levels/test_level.gd`
- footsteps: `_footstep()` in `scenes/player/player.gd`
- drone min/max: `DRONE_MIN_DB` / `DRONE_MAX_DB` in `autoload/audio_director.gd`
- breathing: `breath_db` in `wedged_thing.gd::_update_audio`
- distant calls: `play_distant(..., -8.0)` in `test_level.gd`

## Older checklist (everything before the "make it scary" phases)
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
`art/`. The code lives in `tools/art/`. Godot reimports on focus.

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

### Art revamp + scare pass
**Scare (only what the spec asks for):**
- **Post effects** (`scenes/ui/post_fx.*`, a CanvasLayer under the UI): film grain
  (stronger in shadows), vignette and desaturation, eased per zone. Chromatic
  aberration exists but stays 0 until zone 3 ("very slight, later zones").
- **Darker grading** per the doc's palette table: the shop after the cut is
  near-black blue with the red EXIT, the storeroom warm grey, the tunnels cold
  blue-grey. Still readable, never pure black. Torch energy 1.2 -> 1.45 for contrast.
- **The eye glint:** point the torch at the Wedged Thing's eye from up to 340 px
  (nearly 3x the beam's reach) with line of sight, and one warm pixel answers back,
  drawn unshaded so it shows in the dark. Works while it sleeps ("the eye far down
  a tunnel"). Torch-coloured, not red: the ending-A seed.
- **Silence before key moments:** the tunnel hum and drips drop out when an
  active Thing is within 240 px, then creep back.

**Art (generator rewritten as `tools/art/`: core, palette, tiles, props, player):**
- Real RGB with the doc's per-zone ramps: shop = fluorescent greens and dirty
  yellows, storeroom = concrete greys with dirty yellow, tunnels = cold blue-grey
  mortar and brick browns. Normal maps come from real height maps (raised brick
  faces, recessed mortar and grout, tie holes), not just brightness.
- Tiles (17 columns x 3 variants):
  - back walls: ceramic shop tiles, formwork concrete with tie holes, bevelled brick
  - floors: lino-over-slab, concrete, wet tunnel concrete with puddle glints
  - concrete and brick ceilings and sides, rock with stones
  - LOW and HIGH edge versions: rising damp, a dirty-yellow tide line, salt bloom
    on brick, soot and nicotine
- Floors and ceilings follow the room's material (map char `:` = shop).
- Every prop redrawn. New ones from the spec: coffee machine (on the counter),
  stock boxes (storeroom), junction boxes (tunnel walls). New `DECOR` type "sprite".
- **Player:** posed skeleton with IK legs, 3-tone shading, selective dark outline,
  hair, face, polo, stripe, badge, belt, trousers, shoes. 16 frames: idle 4,
  walk 6, crouch 2, crouch-walk 4.
- **Wedged Thing:** 8 legs (was 6), tapered with knobbed knees and needle tips, a
  shaded ribcage body with ribs and spine, an elongated skull with a dark socket
  around the warm eye. Behaviour untouched.
- **Ceiling Arm:** tapered, knuckled, long two-jointed curling fingers.
  **Spiders:** body, abdomen, eight legs.
- Fixed: the CCTV monitor moved to make room for the coffee machine and its
  zone overlapped the torch pickup. The player now uses the *nearest* usable
  interactable, not the first.
- Verified: renders of every area; headless full route, death/respawn, Cable
  grab/escape, leg-tip payoff.

### The full design doc: creatures redesigned, zones 3-4, return trips, ending
**Creatures (scary redesigns, behaviour rules unchanged):**
- **Wedged Thing**, rebuilt from your concept art: original design, not traced, as
  the doc asks.
  - Body: charcoal skin with bone catching the light, a gaunt breathing ribcage, a stringy gut.
  - Limbs: a skirt of six curved sickle legs from the pelvis, two blade-arms with
    scythes hooked into the ceiling, two shoulder spurs.
  - Head: a long neck-stalk to an elongated skull with ONE warm eye whose pupil
    follows you, and a mouth-slit that opens with teeth when it's enraged.
  - Movement: the head snaps sideways now and then, and turns slowly towards the
    light while frozen.
- **Ceiling Arms:**
  - Knuckled, too many joints.
  - A long hand whose four nailed fingers tap and feel when fully out.
  - **Floor-grate version** (doc: "holes above and below") that reaches up
    for your shins.
- **Cables:** spark particles (doc), and the tip frays into copper strands that
  open and close, sniffing for you.
- **Lure (new):**
  - The look: a flickering tube on a stalk that grows from an eyeless thing
    gripping the ceiling, its head one vertical mouth of needle teeth. Its light
    is environment-only (it never reveals itself); only your torch shows the body.
  - Tell: the cord sways.
  - All 3 appearances: vanish (zone 3a corridor), choice (next to an honest
    light), bite (zone 4).

**Zones 3 and 4 (new art + level):**
- New tiles:
  - zone 3: wet rubble stone with black seep and lichen, flooded floor
  - zone 4: lumpy veined flesh
- The changes are gradual (organic blobs, not a line), as the doc wants.
- Zone 4 tiles sit on separate layers with a **breathing vertex shader**.
- New props: floor grate, open till drawer, pump nozzle hanging from a stone
  ceiling, the red door (zone 2, then again in 3b where it shouldn't be), valve
  wheel, standing water.
- A **CCTV monitor in a tunnel** showing the live shop with no one in it at all
  (its camera culls the man's layer).
- Grading and audio: zone 3 dark green-grey with a big echo, zone 4 muted
  browns/sick red with a low drone. Chromatic aberration switches on in zone 3.
- Footsteps get a TileSet "surface" custom data layer (lino / concrete / wet / water / flesh).

**Return trips (Descent director):**
- Zone 2 ends in an up-stair, and so do the middle and end of zone 3. Climbing one
  takes you to the top of the storeroom stairs.
- Each trip the shop is slightly different:
  1. door ajar ("you left the door open"), crisps back in the box
  2. the mop is gone (it's downstairs) and the spill is back
  3. the fridge hums and glows with no power
- The CCTV man follows the doc's escalation: corner -> by the crisps -> by the
  counter where you stand -> the storeroom feed next to the open panel, facing it
  -> facing the camera.
- The main stairs get longer every trip (they loop you back a flight, quietly).
  At the bottom they open onto the NEXT section, not where you were. "how many
  stairs were there".

**Zone 4 and the ending (C, "full send"):**
- "it's warm down here", Lure 3 bites.
- The Tunnel: stand still and a mass of flesh sags from the ceiling, the camera
  creeps in, the thrum rises; if it comes all the way down it crushes you.
- The climax: the Thing comes from behind ("we're nearly there", "it's closer
  than last time").
- The last stretch:
  - it simply stops chasing you
  - you get slower, and your torch hand goes grey with too many fingers
- The last sign points back at you ("there isn't a fuse box" ... "there never was").
- The dead end: "you're alone tonight", the first line as the last. Black.
- Ending scene:
  - You ARE the Wedged Thing, your eye a torch cone.
  - A new worker in the same uniform runs from you, shining his torch back:
    "it can see you". Standing still, the tunnel squeezes you on.
  - Catch him: black, then the Act 0 CCTV feed. A new worker at the till, a
    leg poking out of the storeroom vent. "night shift". Back to the start.

**Other doc items:**
- Timed door + lights-out lever (zone 3b), boards pushed from the inside (zone 3a).
- "look up sometimes", "mind the step", "nobody comes in after two",
  "it can see you" on the first eye glint, the zone 3 lies ("you're alone" with
  the Thing right there, "it can see you" with nothing there), "don't go back".
- Bottom-text jitter in later zones.

**Fixed along the way:**
- A duplicate variable in the timed door.
- A stale stairs latch after teleports, which slammed you sideways. Climbing now
  also caps sideways speed.
- A narrator stuck "busy" after a scene change, which would have silenced the
  ending's line.

**Verified:** a scripted run of the whole descent: 3 trips, stairs taking 11.5 s /
16.3 s / 21.1 s down, every arrival, zone 4, the last stretch, the ending scene and
the return to the start. Plus the older regressions (route, death, Cable, leg tip)
and renders of every new area.

### "Make it scary" Phase 1: real audio
- **AudioDirector:**
  - Every sound name is a LIST of variants. Each play picks one at random,
    never the same one twice running.
  - Names with no files keep the old synth sound as a fallback.
- **Recordings** (`audio/engine/`, `audio/creature/`):

  | Sound name | File(s) | Used for |
  |---|---|---|
  | `hum` (loops) | `hum.ogg` | tunnel bed |
  | `drip` | `drip_1..8` | random drips |
  | `tap` | `tap_1..6` | leg / finger / cable taps |
  | `caught` | `caught.ogg` | caught sting |
  | `scrape` (loops) | `creature_drag.ogg` | Thing body |
  | `thing_breath` (loops) | `creature_breath_loop.ogg` | Thing breathing |
  | `scrape_soft` (loops) | `creature_scrape_soft.ogg` | Arm in the duct |
  | `notice` | `wail_notice_sting.ogg` | notice sting |
  | `gurgle` | `creature_gurgle_1..3` | Thing body while moving |
  | `moan_distant`, `wail_distant`, `growl` (1..3), `call` | matching files | distant one-shots |

  The four loops are flagged `loop=true` in their `.import` files, and set again
  in code as a safety net.
- **Buses:**
  - "World": as before.
  - New "Distant": 700 Hz lowpass + a big wet reverb. `play_distant()` puts the
    sound 260-420 px off to one side, so it's directional but far.
- **The Thing:**
  - Breath loop: fades in under 200 px when not lit, out when lit or far.
  - Gurgle: every 4-10 s while moving.
  - Notice sting: when it wakes, or switches from stalking to hunting on a
    noise (10 s cooldown). Phase 2 gives "noticed" its own state.
- **Drone:**
  - Synthesised 45 + 52 Hz beating sines, with a quiet 90 Hz octave.
  - Level follows `AudioDirector.tension`, from -42 dB at 0 to -10 dB at 1.
    It cuts out fast and swells back slowly.
  - `hush_drone(s)` silences it, for now only before the zone 4 climax.
  - **Tension is a stand-in until Phase 3:** 0.12 underground, rising as the
    Thing gets within 600 px.
- **Distant one-shots:** every 35-80 s from zone 2 (Phase 3 ties this to tension).
- **Mix changes:**
  - footsteps 5-7 dB quieter
  - drips slightly louder (the recordings are quieter than the synth was)
  - tunnel bed levels re-set for the real file
  - squeeze thrum louder (same reason as the drips)
  - fridge keeps a synth hum (`fridge_hum`), so the tunnel hum isn't coming out of a fridge
- **Verified:**
  - All 13 names load their variants (OGG, loops on), and the synth fallbacks
    still exist.
  - 400 drip plays: 0 immediate repeats.
  - The drone swells and hushes at the expected rates.
  - Recorded 16 s of the tunnel with Godot's movie writer and measured it.
    The drone, breathing and drag come in as the Thing approaches, the bed drops
    out under 240 px, and peaks stay around -10 dBFS (no clipping).
  - Full regression suite unchanged: route, death, Cable, leg tip, arm, and the
    whole descent to the ending.
- **Known:**
  - `creature_breath_loop.ogg` and `creature_scrape_soft.ogg` fade to silence at
    the end but start loud, so each time they loop the sound kicks back in
    suddenly (the hum and drag loop cleanly). Fix in the files with a short
    fade-in, or tell me to crossfade in code.
  - The unused files are copied in for later phases: `creature_breath_fast`,
    `creature_taps_1..3`, `creature_wheeze`, `wail_deep_slow`,
    `wail_through_wall`.

### "Make it scary" Phase 2: the Wedged Thing is a threat
**The basement (your instruction):** the tunnel entrance is now in the gas
station's basement.
- Storeroom: the stairs down are open; the boarded panel is gone from there.
- Basement (zone 1): a concrete cellar at the bottom of the stairs. Stock,
  shelves, the mop, the red door, a dead strip light.
- The boarded-up way into the tunnels is at its far end. Through it is zone 2.
- Triggers:
  - "follow the signs" plus a checkpoint at the bottom of the stairs
  - zone 2 plus a checkpoint just past the boards
- The CCTV storeroom feed is re-aimed at the top of the basement stairs. The
  man's "next to the open panel" stage now stands there, facing them.

**Behaviour** (`scenes/creatures/wedged_thing.gd`, rewritten):
- **States:** DORMANT -> PATROL -> NOTICED -> CHASE -> (FROZEN) -> SEARCH ->
  PATROL.
- **The old senses are gone:** the always-knows-within-90-px sense, the constant
  stalking and the ENRAGED state.
- **DORMANT until zone 3:** zone 2 never wakes it.
- **PATROL:**
  - Wanders between random points in the stretch it can reach (it finds that
    stretch itself, stopping at walls and gaps it can't fit).
  - Pauses 1.5-4.5 s at each point.
  - Doesn't know where you are.
- **Hearing** (`Player.hearing_radius()`, also used for footstep noise events):
  - crouch 32 px, walk 96, run 220
  - standing still 18, crouched and still 0
  - measured along the floor
- **Other ways it notices:** noise events (boards, levers), and the torch on it
  (or pointed at it from up to 230 px) for 1.5 s. While lit and unaware it holds
  still.
- **NOTICED:** 0.8 s freeze, the sting (with a hush in the drone), the head snaps
  round in one frame, and a small screen shake.
- **CHASE:**
  - Speed: 75 px/s x the gap rule.
  - It tracks you while it can hear you or see you (48 px in the dark, 420 px with
    your torch on).
  - Lit: FROZEN 1 s, then it lurches (1.7x for 0.45 s) and can't be frozen for
    2.5 s. Each freeze makes it 6% faster, up to 4 freezes.
- **Losing it:** 3 s without hearing or seeing you -> SEARCH. It goes to where it
  lost you and sniffs about for 6 s (by sound only), then back to PATROL.
- **Director:** every 60-120 s of patrolling, its next point is 120-300 px from
  where you are.
- **Catching:** while patrolling or searching only its torso counts, so you can
  be underneath it. While hunting it reaches down to the floor. Touching it
  while it's unaware just makes it notice you.
- **Zone 4 climax:** `relocate(..., chase=true)`: it wakes already hunting.
- **The ending:** still you-as-the-Thing (puppet mode).

**The look** (redrawn to your concept image, original drawing):
- A front-on silhouette:
  - one tall head-stalk with a single eye and a seam of a mouth that splits
    open with teeth when it hunts
  - spiked bony shoulders
  - a broad ribcage tapering to a waist far too thin
  - a hollow gut with something coiled in it
  - two long arms splayed out, ending in hooked blades by the floor
  - a skirt of TEN curved, irregular legs from a lumpy hip ring (4 darker
    ones behind)
- It's 132 px tall when free (3x you). In tunnels it's crammed in: shorter,
  slightly narrower, legs splayed wider, the head bent against the ceiling,
  shoulder spikes scraping it.
- Limbs are tapering quad strips with a rim light on the side facing the torch.
- The palette is brighter than "charcoal" on paper: through the real torch it was
  invisible past ~90 px. Now it reads as a pale half-lit shape at the edge of the
  beam.
- **Animation:**
  - each leg steps on its own timing, with a beat of hesitation while unaware
    and fast, messy steps while hunting
  - tips tremble while frozen
  - the head sways slowly while patrolling, snaps round when it notices you,
    and stays locked on you while it hunts
  - arms swing; the body bobs and leans while hunting
  - it lurches out of a freeze
- More of this comes in Phase 4.

**Zone 2 glimpses** (`scenes/creatures/thing_glimpse.gd`): harmless puppets using
the same body.
- **"eye":** at the far end of the tight tunnel. It glints back at your torch from
  up to 340 px. After 1.2 s of being seen, or when you come within 170 px, it
  pulls back and is gone.
- **"cross":** a black silhouette (Light Only, drawn black, against a worklight
  that touches the creature layer). It crosses the open room into the passage
  when you walk in.
- A working light in the open room (relief, and the backdrop for that).

**Fixed along the way:**
- **Worklights downstairs died in the Act 0 power cut.** So the zone 3b
  "lights out" lever had nothing to switch off. They're on their own supply now.
- **"Pushed from inside" panels** (zone 3a) start broken open: one board
  hanging off a bent nail, the rest splintered on your side. Before, that panel
  was 3 boards right at the exit of the Thing's room. Ripping them meant certain
  death at 135 px/s.

**Verified:**
- **A new behaviour test (18 checks, all pass):**
  - dormant at start
  - notices at 31 / 94 / 208 px for crouch / walk / run
  - the 0.80 s notice freeze
  - chase at 68 px/s in a 64 px corridor (walk 55, run 100)
  - a 1.00 s light freeze, then it keeps coming through the light
  - lost after 3.0 s, searched, and gave up without finding me while I was
    crouched right where it searched
  - a brief light doesn't make it notice, a held one does
  - noise makes it notice and head for the sound
  - walks over a crouched, still player
  - finds a standing one
  - the director nudge
  - patrols on its own
- **Regression suite:**
  - the scripted playtest walks the whole new route (basement, panel, zone 2, the
    lever, the end) with the Thing dormant throughout
  - death and respawn
  - Cable
  - leg tip
  - arm
  - the full descent (3 trips, zone 4, the ending)
- **Renders:**
  - the Thing in an open room, in corridors and in tight tunnels, under a
    floodlight and through the real torch
  - the eye glint down the tunnel
  - the silhouette crossing and then gone
  - a scripted notice / chase / freeze / lurch sequence
  - the ending

## Untested
- Audio, by ear (no sound card here).
- Real input feel: mouse aiming, camera lean, crouch timing.
- How dark it looks on a real monitor. My renders are software-rendered PNGs.

## Known bugs / rough edges
- In 64 px corridors the Thing's head is bent nearly sideways by the ceiling, so
  the one-eyed head reads less than in open rooms. It's meant to look crammed;
  tell me if it reads wrong.
- Zone 2's three Thing moments (eye, leg, silhouette) are close together. Phase 3
  spreads them out.
- The pipe texture repeats its bracket and rust spots every 16 px. Fine for now.

## Decisions to check
- **Basement layout:** the doc puts the panel behind the storeroom shelving. I
  followed you: the stairs lead down to the gas station's basement, and the
  boarded-up entrance to the tunnels is down there.
- **The teaching Ceiling Arm is still in the basement** (left end), and the doc
  says arms are zone 2. I'll move it into the tunnels when Phase 3 re-paces the
  route.
- **Zone 2 glimpse order:** eye (right through the boards), then leg, then
  silhouette. The doc says leg first, then eye. The eye down the tunnel works
  best right as you open the boards. Phase 3 may reorder.
- **The light while it's unaware** holds it still (the light rule stays
  consistent), and 1.5 s of it means it notices. The old "notices a beam pointed
  its way from 230 px" counts as light on it.
- **Losing it** = 3 s with it neither hearing nor seeing you, which is your
  rule in practice: get clear, torch off, crouch still. It goes to where it last
  had you. If it gets there while still hunting, it finds you. If it's already
  searching, it can walk right over you.
- **Sight:** 48 px in the dark while it hunts, 420 px if your torch is on (your
  light gives you away), none while searching in the dark.
- **normal_gap 72** (was 84), so "75 px/s at normal gap" lands in normal
  corridors:
  - tight 48 px: ~50 px/s
  - corridors 64-96: 67-100 px/s
  - open rooms: 130+ px/s
- **Hiding under it** is my addition. It's the doc's "hiding = darkness, stillness
  and knowing the rules", and it makes the patrol passable in 1-D tunnels (you
  can't walk round it).
- **Pushed-from-inside panels are already broken open.** See "Fixed along the
  way" above.
- **"tap" = tap_1..6 for every tap** (Thing legs, Arm fingers, Cable tip), as
  asked. `creature_taps_1..3` aren't used yet. They might suit the Thing's
  "testing the floor" taps in Phase 4.
- **The notice sting already plays** before Phase 2 exists: on waking and on
  stalk->hunt. Phase 2 moves it into the NOTICED state.
- **Ending C** (A + B), the doc's "strongest". Kept self-contained in
  `scenes/ending/` so A-only is easy to cut back to.
- **3 return trips** (open question 2/3/4). The man's 4 "return" stages fit into
  3 trips: the third trip shows the storeroom stage on the first check and
  "facing the camera" on the next.
- **Sections connect through the stairs, not corridors.** Zones 3a, 3b and 4
  are separate pieces of map reached by return trips. It's the doc's "endless is a
  feeling" (the stairs never lead back where you came from).
- **Lure 2 "choice":** the honest light hangs over the up-stair (the way on), the
  Lure over a dead-end alcove. "not that one" plays on entry and could mean either.
- **Lure 3 bites = death** (checkpoint). It doesn't come back after that.
- **Resolution stays 640x360 / 44 px player.** The doc says 384x216 or 480x270
  and a 24-32 px player, but you asked for 640x360 and 44 px later. Say if the doc
  should win.
- **Cable escape = hold the beam on it for 1 s** (doc open question: mash E /
  light it / no escape). It fits pillar 1. Being held next to the Thing is the real
  danger; a Cable alone can't kill you.
- **The passage door is new progression I added** (doc: switches open doors).
  It makes the open room more dangerous (you must pull a loud lever there).
  Remove the two "switch"/"door" lines in `DECOR` to undo it.
- **Per-zone palettes replace the single 12-colour palette** you asked for in
  phase 2. The spec's palette table (and "look like a Steam game") needed it.
  Each zone still uses a small set of ramps.
- **Readability vs scary:** the ambient is tuned so walls stay readable on my
  software renders. On a real monitor it may want ±10%: `ZONE_DARKNESS` in
  `test_level.gd`, and grain/vignette in `post_fx.gd`.
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
