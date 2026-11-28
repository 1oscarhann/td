# Night Shift: progress log

## Test this first: Round 2, Phase 3 (the level is a network now)

F3 on helps: its SECTION line says where you are and where each door goes.

1. **Back-wall doors:** stand in front of one, a small W appears, press W.
   - A quick fade, a creak, a clunk, and you're at the door it leads to.
   - Doors that won't open rattle.
2. **The basement landing (B1) is the hub.** It has two doors:
   - a wooden one to the crisps store
   - a boarded, chained one that rattles: that's the way deeper
3. **Zone 1:** B2, the crisps store (stacked to the ceiling, a safe room) ->
   B3, the boiler corridor:
   - crouch through the low bit
   - walk down into the dip and back up out of it (new: you can walk up
     one-tile steps)
   - the boarded panel at the end
4. **Zone 2:**
   - Z2-1 is the tunnel mouth, with the teaching arm. Climb the ladder (W)
     to the staff room: kettle, mugs, the rota.
   - Then Z2-3 (the long low tunnel, the eye) -> Z2-4 (the junction, the
     silhouette).
   - Z2-6: the passage door is SHUT. Back to Z2-4, into the pump room (Z2-5):
     pull the lever (the Cables wake), see the cut-open cage.
   - Back to Z2-6 and up the stairs. **Does the backtrack feel natural or
     annoying?**
5. **Return trips:** after the shop, the stairs bring you back to B1, and B1 has
   changed.
   - The chair has turned (trip 1), is gone (trip 2), there are two (trip 3).
   - The bucket moves.
   - The boarded door now stands ajar: W takes you to the next zone. The
     door you come out of won't open behind you.
6. **Zone 3a:** A1 -> A2 (wet dip, floor arm) -> A3, the Thing's room. Up its
   ladder is A4, the sleeping alcove: a sleeping bag, a torch like yours,
   batteries. Then A5, the choice.
7. **Zone 3b:** C1 (the leg) -> C2 (monitor, the real arm) -> C3 (the Thing) ->
   C4 (timed door).
8. **Zone 4:** D1 -> D2 (the third Lure, with its tell) -> D3: the climax, and
   it comes through the door BEHIND you. Run for the far door -> D4, the
   squeeze, the end.
9. **Every room should look different:** ceiling heights, a crouch bit, a dip,
   two ladders, doorways into dark rooms and grates in the back wall, and one
   or two landmarks each (a trolley, a boiler, a cone, a radio, a stopped
   clock, a boot, a pallet, a shop mannequin facing the wall, lockers).
10. **Foreground:** pipes, girders and cables slide past in front of you,
    faster than the room, and partly hide things.
11. **How long did it take you?** The bot takes 7.7-8.1 min flat out (it knows
    the way and never stops to look), so I'd guess 11-14 min for a person.

## Previous checklist: Round 2, Phase 2 (tuning)

F4 on for all of this.
1. **False alarms are rare now:** one every 25-60 s of quiet (was 6-13).
   - They're quieter.
   - Never the same sound twice in a row (the far-off calls never repeat
     back to back either).
   - Does each one make you stop, instead of fading into noise?
2. **The encounter gate.** F4's `ENCOUNTER GATE` line says shut (with seconds
   left) or open.
   - Zones 1-2: after every real encounter, the next scripted one (arm, eye,
     silhouette, Cable, Lure, the leg) waits a random 40-110 s.
   - Zone 3: at least 30 s, and the Thing's own moments count.
   - Walk past an arm's vent while the gate is shut: it stays in. Come back
     once it's open: it comes out.
3. **Zone 3, the Thing respects the gap too.** While the gate is shut:
   - its director nudge towards you waits (F3 NEXT says "held by the pacing
     gate")
   - it wanders away from you instead of into you
   - Once the gate opens, it can come for you again.
4. **The third Lure (zone 4) has a tell.** About 3 s before you reach it, the
   cord jerks and the light flickers once, red. Then it bites (so you still die
   there once, but you could see it coming).
5. **The checkpoint before the third Lure** is now ~10 s of walking before it
   (was ~30 s).
6. **Silence before the Thing (zone 3+).** The moment it notices you, everything
   ambient drops out for 3-5 s: the hum, the drips, the false alarms, the drone.
   - All you hear is it coming. Then the sound creeps back.
   - F4 shows "paused (silence, x s)".

## Previous checklist: Round 2, Phase 1 (debug tools)

Start a new game, get down to zone 3 (or anywhere with creatures), then:

**F3: the Thing overlay (top left)**
1. `THING:` says what it's doing in plain words: Asleep / Patrolling / Noticed
   you / Chasing / Searching / Frozen (lit) / Enraged (chasing after being lit
   twice or more).
2. `KNOWS WHERE YOU ARE:` is coloured:
   - **green** NO
   - **yellow** LAST SEEN `<s>` ago at `<x, y>` (it lost track, or it's
     searching)
   - **red** YES
3. `WHY:` says what gave you away:
   - heard footsteps / heard running / heard switch / heard the boards /
     heard you on the stairs
   - saw torch / light held on it / walked into you / none
   - While it chases, WHY follows what it's tracking you by right now.
4. `CAN SEE YOU` / `CAN HEAR YOU` / `DISTANCE`. Walk, run, crouch and stand
   still near it and watch CAN HEAR flip.
5. `NEXT:` tells you what it's about to do:
   - "listening, moving on in 2.3 s"
   - "director nudging patrol towards you in 34 s"
   - "charging in 0.4 s"
   - "giving up in 2.1 s"
   - "searching your hiding spot, giving up in 3.0 s"
   - "lurching free in 0.6 s"
6. One grey line for the nearest Ceiling Arm (idle / scratching / reaching /
   retracting), Cable (disguised / slithering / grabbing / retreating) and Lure
   (waiting / revealed), with distances.
7. **World gizmos while F3 is on:**
   - **cyan circle** round the Thing: how far it can hear you as you're moving
     right now. It shrinks to nothing when you crouch still, and gets big when
     you run.
   - **yellow circle** at its eye: how far it can see you (torch on = 420; in
     the dark only while it hunts = 48).
   - **red line** from its eye to you while it can see you.
   - **orange X** "last known" where it last had you.
8. **Check that the overlay never lies.** If it says NO and the Thing comes
   straight at you, or says CAN HEAR: no and it notices your footsteps, tell
   me the moment.

**F4: the pacing overlay (top right)**
9. `TENSION` (with a bar, green -> yellow -> red), `SINCE LAST ENCOUNTER`,
   `NEXT FALSE ALARM` (a countdown, or why it's paused: safe room / silence /
   just after an encounter / the Thing within 320 px / the shop), `ZONE`.

**Also new since your last build: creatures visible in the dark + the Thing
re-animated** (your "torch system isn't great" ask, committed just before this
phase):
10. **Torch OFF in zone 3: you can see the Thing.** It's a black silhouette with
    cold edges and a pale eye. Torch on it: the real skin, ribs and gut fade in.
    Same for the Ceiling Arms, spiders and the leg in the vent.
11. **Watch the Thing move:**
    - The legs keep their length (the knees fold up in low tunnels) and step in
      two alternating groups, placing each foot.
    - It stops: the body settles with weight, then it LISTENS with its head
      tilted, usually your way.
    - It hears you: a jolt upright, then it coils and rears back, blades lifting
      (the wind-up), then it charges.
    - Hunting, the head hangs dead still in the air while the body bobs under
      it.
    - Lit, it strains on the spot in stop-motion jerks, then lurches out of the
      freeze.
    - Searching, it sniffs in quick jerks.
    - Do the blades swing and drag? Does anything look like rubber?

## Previous checklist: Phase 5, one full playthrough with headphones

Headphones on, lights off, volume where a whisper is audible. Play start to
finish in one go. My bot took 11.5-13.3 min walking flat out; you'll take
longer, which is fine. The times in brackets are roughly when the bot got
there, so you can tell if something's missing.

**The shop (0:00-1:30)**
1. Fridge hum, tube buzz, the shop feels safe. Do the three jobs.
2. The power cut: flicker, clunk, the hum dies. Silence should feel LOUD.
3. Torch under the counter. Turn it on and look at the beam:
   - a hot centre, a soft dirty spill round it, a darker ring, smudges in it
   - dust drifting in the light
   - it lags your mouse very slightly and shakes a little
   - every 5-14 s it browns out for a blink (more often deeper down)
   - Does it feel weak and cheap, like a torch you'd find under a counter? Good.

**The basement and zone 2 (1:30-5:50)**
4. Spiders on the stairs scatter when lit (1:30).
5. The boards come off, one at a time, loud.
6. The teaching arm (2:30): you hear scratching in a vent first. In the dark
   it reaches down until its hand hangs right over your head. Look up: a
   BLACK hand, long fingers, wet glints where your light hits it.
   - It freezes in the beam for a heartbeat, then whips back into the duct.
   - This one can't hurt you.
7. Real scares come about once a minute here (every 59-62 s for the bot), with
   fake ones in between: a tap right behind you, knocking in the pipes, a vent
   rattle, a sign flickering, something calling far away. Each fake one should
   make you stop for a second, then nothing. Tell me if they get annoying.
8. Silence before every scripted scare: the hum drops out for a few seconds and
   the torch stutters. Does the silence make you expect something?
9. The eye down the tunnel (3:30): point the torch ahead, a warm pixel answers
   far away and pulls back. The silhouette crossing a lit room (4:30).
10. The safe rooms (worklight on): tension drops, ambience softens. Relief?

**Zone 3 (6:00-9:40): the Thing**
11. You hear it before you see it: wet breathing, legs tapping.
12. When it's close and you can't see it, the screen edges pulse like a heartbeat.
13. Torch off, crouch, stay still: it walks right over you. That's the scariest
    moment in the game. You can flash the light on its back for a second
    as it goes; hold it longer and it notices.
14. If it notices: the head snaps to you, a sting, it comes fast. Light it:
    it freezes, then lurches. Run, then go dark and still.
15. The floor grate arm in 3a, the real arm in 3b (this one grabs). The 3b arm
    sits in the Thing's patrol: don't hide under it.
16. The Lure: three of them, one honest. The timed door + the Cable that grabs
    your ankle (hold the light on its head to get free).

**Zone 4 and the ending (9:40-12:00)**
17. The third Lure bites. You WILL die the first time (see Decisions). Death =
    instant black, the sting, then two full seconds of nothing at all.
18. The climax: it wakes hunting behind you. Freeze it with the light once,
    then run through the squeeze. The ending.

**Tell me:** where you got bored, where you jumped, whether any fake scare made
you laugh instead, and how long it took you.

## Previous checklist: Phase 4 (the Thing's movement, death, visual tension)

Headphones on. Zone 3a is where the Thing lives.

1. **Taller and thinner.** In an open room it stands free: 150 px, 3.4x you.
   In normal tunnels it's crammed in, bent forward: shoulders pressed up
   into the ceiling, and its head hanging DOWN in front of its chest with
   the eye at chest height, looking at you.
2. **Dust:** as it scrapes along a low ceiling, dust falls. You can see the
   dust even when you can't see the Thing.
3. **Legs:**
   - knuckles at every joint, angled like something broken
   - each leg steps on its own timing, with a hesitation
   - now and then a foot tests the floor first: tap... tap... then it commits
4. **Still is still.**
   - Patrolling, when it stops, it STOPS: no sway, only the ribcage breathing.
   - Then one or two legs twitch, suddenly, for no reason.
5. **It notices you:**
   - the head snaps round to you in two frames, no easing
   - the body follows slower
   - when it hunts, the legs go fast and messy and the body bobs, but the
     head stays dead still, locked on you
6. **Lit:**
   - everything freezes except the tips of its legs and blades trembling
     (the head doesn't turn any more)
   - out of the freeze it lurches: a jolt forward and a scramble of legs
7. **The screen pulses:** when it's close and NOT in your light, the edges of
   the screen pulse faintly, like a heartbeat. Light it and the pulse stops.
8. **The torch flickers:**
   - briefly, inside the silence just before every scripted encounter
   - from zone 3 on, also now and then for no reason at all (a false alarm)
9. **Death:** caught = an instant cut to black and the caught sting, then two
   full seconds of nothing at all. Every sound stops: creatures, hum, drone.
   Then you're back.
10. **The eye glint** is a bit brighter: a pixel with a faint cross and a halo,
    so it survives the vignette at the screen edge.

## Previous checklist: the other creatures, redesigned

Headphones on, torch in hand. Look at each one properly (and then try not to).

1. **Spiders** (bottom of the basement stairs, and in vents):
   - eight legs and a gait
   - they move in bursts and stop dead, and a leg twitches
   - now and then one lowers itself on a thread and climbs back up
   - lit, they run in jerky dash-stop-dash bursts
2. **The teaching arm** (zone 2, the small room after the boards), and the
   real one (zone 3b):
   - Too many crooked joints, corpse-pale, with a long thin hand.
   - Watch it come out: one joint jackknifes open with a click, a pause,
     another... then the last few joints and the hand come all at once.
   - Fully out, its fingertips drag across the floor and tap one after
     another.
   - Light it: it snaps back up violently, much faster than it came down.
   - The floor-grate one (zone 3a) does the same, upwards.
3. **The Cables** (the lever room in zone 2, and zone 3b):
   - Hanging, they're identical to the real ones (only the tell).
   - Moving, they come along the floor in S-curves with the front end reared
     up like a snake's head, swaying.
   - The head is the cut end: the rubber split back, copper strands opening
     and closing, sparks, arcs jumping between the strands.
   - If one gets you, it coils round your ankle and the rest goes taut and
     trembles.
4. **The Lure** (zone 3a, twice; zone 4 once): shine the torch UP the cord.
   - A pale, bloated thing upside-down on the ceiling, holding on with six
     long jointed limbs.
   - An eyeless head hangs from it: a long skull with pits where the eyes
     should be, split by a vertical mouth of needle teeth.
   - The tube hangs from a fleshy, segmented stalk growing out of its jaw,
     and it rises and falls as the thing breathes.
   - Pick the wrong light (zone 3a): the stalk snaps taut, the jaw splits
     open on a red throat, then it scuttles off along the ceiling into the
     dark, dragging the tube after it.
   - Zone 4: the head drops on its neck and bites.
5. **The leg in the vent** (zone 3b):
   - At first it looks like a spider that twitches wrong, with one leg too long.
   - Hold the light on it: a long knuckled leg in the Thing's colours jerks out,
     taps the air, and pulls back slowly.
6. **The Tunnel** (zone 4): stand still and look up.
   - The flesh coming down has swollen lobes that pulse on a double heartbeat,
     veins, pale ridges like gums along its edge, and mucus strands that
     stretch and drip as it lowers.

## Phase 3 checklist (pacing), if you haven't done it yet

Headphones on. Play it straight through from the start and don't rush: the point
of this phase is the long, empty stretches.

1. **Length:** the underground is ~5x longer than before. Does the walking ever
   feel like a walking sim, or does the dread carry it?
2. **Order and spacing of real encounters:**
   - zone 1: spiders by the basement stairs
   - zone 2: the teaching arm, then the eye far down the tight tunnel, then the
     silhouette crossing a work light, then the lever and the Cables
   - each about 60 s of walking apart
3. **Silence before each one:** the hum, drips and drone all drop out for 4-8 s
   right before every scripted encounter. Do you start dreading the silence
   itself?
4. **False alarms** (there are 4x more of these than real scares):
   - a creature calling far away (muffled, off to one side)
   - a tap right behind you
   - knocking in the pipes
   - something scrabbling in a vent
   - a FUSE BOX sign flickering under a dying tube
   They come more often as tension builds. Too many? Too few?
5. **Tension** (on screen and in the drone): the longer nothing happens, the
   more the grain and vignette tighten and the deeper the drone gets. A scare
   spikes it, then it settles. The Thing nearby pushes it up.
6. **Safe rooms**, one per zone (zone 1, zone 2, zone 3a behind the crawl-under
   collapse, zone 4): a working light, the hum softens, no false alarms, tension
   drains. Do they feel like relief?
7. **The teaching arm** (zone 2, in a small room after the boards): it reaches
   down and feels around but CAN'T grab you. Light it and it snaps back. The real
   one is in zone 3b and does grab.
8. **The leg in the vent** moved to zone 3b, just after you arrive there.
9. **Stairs fix:** let go of S just before the bottom of a staircase. You can now
   walk off. Before, you got stuck hovering there.

## Phase 2 checklist (the Thing is a threat), if you haven't done it yet

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

### "Make it scary" Phase 3: pacing
**Length:**
- 10 generated "quiet stretches" went into the map, in two passes. The map is
  372 -> 1623 columns: the underground is ~5x the old route.
- What they're made of:
  - flat floors with the ceiling rising and falling (3-8 tiles)
  - tall chambers and the odd crawl-under gap
  - pipes, sagging cables, junction boxes, dead strip lights and vents
  - stock boxes in the basement, water in zone 3
  - FUSE BOX signs every ~70 columns (wrong ones from zone 3)
- The stone -> flesh blend in zone 4 continues through its stretches.
- The tool that did this is a one-off script; the MAP / DECOR in
  `test_level.gd` are still the source of truth, and the new decor is marked
  `# ---- quiet stretch`.

**Encounter order** (the one you asked for):
- spiders -> teaching arm -> the eye -> the silhouette -> the lever and Cables
  -> zone 3, where the Thing hunts
- Moved to make room:
  - the leg in the vent: zone 2 -> zone 3b
  - the real Ceiling Arm: zone 2 passage -> zone 3b
  - the silhouette and its work light: open room -> a junction of its own
  - the teaching arm: basement -> zone 2
- Removed: a second spider group right after the lever (back-to-back with the
  Cable).

**Pacing node** (`scenes/levels/pacing.gd`, a child of the level):
- **Tension 0..1:**
  - builds over ~2 min without a real encounter, spikes for ~8 s after one
  - the awake Thing within 520 px pushes it up
  - the torch off or a deeper zone adds a little
  - in a safe room it drops to 0.05
  - it drives the drone (Phase 1), the film grain (+0.06) and the vignette
    (+0.20)
- **False alarms:**
  - one every 6-13 s at tension 0, down to 60% of that at tension 1
  - never in a safe room, during a silence, within 6 s of a real encounter, or
    with the Thing within 320 px
  - types are weighted per zone: far-away creature calls (the Phase 1 one-shots
    now live here), a tap behind you, pipe knocks (new synth sound), a vent
    rattle (`creature_taps_1..3`, at the nearest vent), and a FUSE BOX sign
    flicker (a dying light sputters on it for half a second)
- **Silence:** "hush" decor fires `Pacing.hush(4-8 s)` just before every
  scripted encounter. The hum bed, drips, false alarms and the drone all drop
  out.
- **Safe rooms:** zones 1, 2, 3 (in 3a, behind the collapse the Thing can't
  get through) and 4. Each has a working light, the bed 6 dB softer, no false
  alarms, and tension draining away.
- **The pacing log:** `GameState.mark_encounter(kind)` is called by spiders
  (first scatter per group), arms (reaching), Cables (moving), the leg, the
  glimpses, the Thing (noticing you, first time lit), Lures and the Tunnel.
  The same creature counts once per scare. `GameState.false_alarms` counts the
  rest. Phase 5 uses both.

**Other:**
- **Teaching arm:** `CeilingArm.harmless`. It reaches and feels around, but
  can't grab.
- **Stairs:** you could get stuck hovering one pixel above the bottom of a
  staircase if you let go of S early. Walking off now works near the bottom.

**Verified:**
- **New pacing test:** walks the shift, the basement and zone 2 at full walking
  speed, never stopping.
  - Real encounters at 0 / 61 / 62 / 59 / 61 s apart: spiders, teaching arm,
    eye, silhouette, Cables.
  - 22 false alarms against 5 real encounters (4.4x) in 254 s underground.
- **Descent test:** all 3 trips, every arrival, zone 4, the last stretch and
  the ending all work on the new map.
- **Regressions:** death and respawn (zone 3a), Cable grab/release, the leg
  (now 3b), the real arm (grabs, and retracts when you light its hand).
- **New check:** the teaching arm reaches all the way down over you and never
  grabs.
- **Renders:** the new stretches, all four safe rooms, a sign flicker.
- **No decor ended up inside rock.**
- **Cost:** the level loads in ~1.1 s instead of ~0.6 s; frame time is the same.

### The other creatures, redesigned (scary phase 4, creatures)
All behaviour rules are unchanged; this is how they look and move.
- **`CreatureDraw`** (`scenes/creatures/creature_draw.gd`): shared drawing for
  tapering limbs rim-lit on the torch side, knuckles, shaded lumps, beziers. It's
  the same technique that made the Wedged Thing read in the beam.
- **Ceiling Arms:**
  - 4-14 bones of irregular length, each bending the other way (a broken
    insect leg), scaled so the hand still reaches the floor.
  - Knuckles at every joint, extra bumps on long bones, veins.
  - A narrow hand, five 3-joint fingers 1.0-1.35x too long, dark nails.
  - Unfolding:
    - each bone takes 0.18-0.4 s, swinging open from folded with an
      overshoot, then a click and a 0.12-0.55 s pause
    - the last 3 bones take ~0.06 s each
  - Fully out: the hand sweeps side to side and the fingertips drag and tap
    the floor one by one, with quiet taps.
  - Lit: it snaps back at 1.8x the retract speed (a twitch and a crack); when
    it just gives up, it pulls back slowly instead.
  - It grabs the same way. It takes longer to get halfway out now
    (4.0 s vs 2.5 s in the test).
- **Spiders:**
  - Drawn with 8 legs (a 2-joint gait, front legs reaching forward), a pale
    mark on the abdomen, eyes that catch the light, and some size variation.
  - Crawling: bursts at 35-80 px/s, dead stops of 0.6-2.4 s, leg twitches,
    and 10% drop on a silk thread.
  - Fleeing: 0.08-0.22 s dashes and 0.04-0.16 s stops.
  - `Spider.draw_spider()` is shared with the leg.
- **The leg in the vent:**
  - While waiting, it's a spider that twitches instead of moving, with one leg
    too long.
  - Revealed: four knuckled bones in the Wedged Thing's palette, jerking out to
    30 px, the hooked tip tapping, then 3.5 s back in.
- **The Lure:**
  - The body is rebuilt: a ribbed, bloated sac on the ceiling and six limbs of
    differing reach, with elbows hanging and fingers dug into the ceiling.
  - Its head is an eyeless split skull lined with needle teeth.
  - The lure is a fat, segmented stalk in an S-curve from the jaw to the tube.
  - The tube rises and falls with its breathing (the tell).
  - The reveal (stalk taut, jaw splitting on a red throat, scuttling off
    sideways into the dark with the tube dragged up after it) replaces "sinks
    into the ceiling".
- **The Cables:**
  - The slither is an S-wave travelling from the head down the body, the front
    end reared ~9-12 px off the floor and swaying, with a faint sheen along the
    body so the shape reads.
  - Head:
    - a split rubber sheath and 7 copper strands that open and close and
      twitch
    - arcs jump between strands (unshaded, so they glow)
    - sparks and the spark light follow the head
  - Grab: two coils squeezing round your ankle (drawn in front of you), the
    rest of it taut and trembling.
- **The Tunnel:**
  - The underside is two rows of irregular lobes with creases and wet glints,
    swelling on a double heartbeat (every 1.4 s).
  - Branching veins that darken on the beat, pale gum-like ridges along its
    edge.
  - Mucus strands that stretch as it comes down and drip.
- **Fixed:** a tap/knock false alarm or a sign flicker still running when the
  scene changed (the ending) threw an error.

**Verified:**
- **Gallery renders** (before/after, floodlit and through the real torch) of
  every state:
  - the arm reaching, unfolding, and from the floor
  - the Cable slithering and grabbing
  - the Lure hanging, revealed and biting
  - the spiders, the leg, the Tunnel
- **Regressions pass:**
  - arm (grabs, and retracts when lit)
  - teaching arm (never grabs)
  - Cable (grab/release/return)
  - leg
  - death and respawn
  - the full descent to the ending
  - pacing (unchanged: encounters 61/62/59/61 s apart, 21 false alarms)

### Phase 4: the Thing's movement, death, visual tension
- **Proportions:**
  - natural height 132 -> 150 (it almost never fits)
  - thinner shoulders, torso, arms, legs and head-stalk
- **Bent forward when crammed** (`fwd` 0..1 from how squashed it is): shoulders
  go up against the ceiling, the head-stalk swings down to hang in front of
  the chest (it's leaning towards you), knees lift harder towards the ceiling.
- **Dust:** particles where the shoulders scrape the ceiling, drawn like the
  environment (visible out of the beam), only while moving crammed.
- **Legs:**
  - The smooth curve is replaced by five bones, each kinked the other way,
    with a knuckle at every joint.
  - 35% of patrol steps test the floor 1-2 times before committing (short
    lifts, each with a tap).
  - Chase steps land randomly off-target and lift higher (messy).
  - A lurch out of a freeze lets up to 6 legs step at once.
- **Idle:**
  - no sway when it isn't moving (only breathing)
  - every 1.8-6 s one or two legs twitch up and slap back down
- **Head:**
  - On notice, it snaps to you over two frames.
  - The body's lean eases after it at 5 px/s.
  - While hunting, the head-stalk is anchored to the un-bobbed shoulder line,
    so it stays dead still and locked on you while the body bobs and lurches
    under it.
  - Frozen, the head no longer turns towards the light.
- **Lurch:** an 8 px kick (was 5) plus the leg scramble.
- **Eye glint:** brighter (a cross and a halo).
- **Visual tension (Pacing / PostFX):**
  - the vignette pulses on a double heartbeat, scaled by how close the awake
    Thing is (300 px), only while it isn't lit
  - every hush schedules a 0.25-0.45 s torch flicker 1-2.5 s into the silence
  - new zone 3-4 false alarm "torch": a 0.15-0.4 s flicker
- **Death:** `AudioDirector.set_world_silent()` mutes the World and Distant buses
  and the drone. The caught sting (UI) plays out, then 2 s of silence, then
  the respawn and the sound comes back.
- **Fixed:** particles with no texture draw nothing in Godot. The Thing's dust and
  the Cables' sparks now have a 1 px texture, so the Cables' sparks finally show.
- **Fixed:** a false-alarm tap/knock or a sign flicker still running at a scene
  change threw an error.

**Verified:**
- **Rebuilt behaviour test (it got lost earlier, now kept outside the repo):**
  all 18 checks pass with the new movement:
  - hearing at 31 / 90 / 213 px
  - the 0.80 s notice freeze
  - chase at 68 px/s in a 64 px corridor
  - the 1.00 s light freeze, then it keeps coming
  - loses you after 3.0 s, searches and gives up while you're crouched right
    there
  - walks over you, and finds you standing
  - the director nudge, and patrolling on its own
- **New systems test:**
  - the torch flickers 1.0-1.2 s into a silence
  - the vignette pulses at 0.53-0.70 with the Thing 90 px away and unseen, and
    drops to 0 once you light it
  - death is black with the world muted for the whole 4.2 s, and the sound and
    controls come back afterwards
- **Renders:** open room (patrol and chase), corridor (crammed, bent forward,
  head hanging), walking with dust, through the real torch.
- **Regressions:** arm, teaching arm, Cable, leg, death, the full descent to the
  ending.

### Phase 5: the full run (plus the black arm and the scarier torch)

**Black arm** (`ceiling_arm.gd`, both the ceiling and floor-grate arms):
- near-black skin (0.05) with a dark edge
- an oily sheen on the edge facing your torch, and a highlight down each bone,
  so it still reads against dark brick
- thicker bones (6 px at the root, 3.2 at the wrist), a wider palm and
  fingers; yellowed nails
- **Caught in the light:**
  - Lit, it now freezes for 0.35 s (fingers splayed, trembling), THEN whips
    back.
  - Before, it vanished in 2 frames, so a black arm was basically never seen.
  - It can't grab during the freeze.

**Scarier torch** (`torch.gd`, `light_textures.gd`). The gameplay cone is
unchanged (40 degrees, 120 px):
- a new beam texture: a tight hot centre (24 degrees) with a faint ring at its edge,
  a dim dirty spill around it, smudges and two dark streaks (lens dirt)
- warmer, dirtier colour; brighter centre (energy 2.7) so the edges fall off
  harder
- the aim lags your mouse a hair and shakes more as tension rises
- brownouts: a 0.04-0.12 s dip to 55% every 5-14 s, more often per zone
- dust motes drifting in the beam
- the glow round the player is dimmer (0.45 -> 0.3), so the beam is the only
  real light

**Full headless run** (`_smoketest/full_run.gd`, a bot that plays the whole game
from the shift to the ending):
- **How it plays:**
  - uses real inputs to move, crouch, run, climb stairs and hold E
  - the torch is aimed by script, as a player would: ahead, at arms, at spiders
  - torch off when the Thing is within 450 px; creeps when it's within 300
  - hides under it (dark, still, crouched) and stays down until it's 110 px past
  - if it's spotted: light the Thing to freeze it, run, go dark
  - after 4 deaths in one section it would turn the Thing harmless there and
    log it (it never needed to)

| | seed 29 | seed 11 |
|---|---|---|
| Time to the ending | **11.5 min** | 13.3 min |
| Real encounters | 15 | 18 |
| **Average gap between encounters** | **42 s** | 40 s |
| Longest gap | 62 s | 62 s |
| False alarms | 51 (3.4x real) | 57 (3.2x real) |
| Deaths | 1 (the Lure bite) | 3 (Lure bite + 2 in zone 3b) |

**Timeline (seed 29):**

| Time | What happened |
|---|---|
| 1:04 | power cut |
| 1:16 | torch |
| 1:31 | basement |
| 2:22 | tunnels |
| 5:49 | trip 1 |
| 5:59 | zone 3a |
| 7:58 | trip 2 |
| 8:12 | zone 3b |
| 9:38 | trip 3 |
| 9:57 | zone 4 |
| 10:28 | Lure bite |
| 11:19 | climax |
| 11:31 | ending |

**Gaps by zone:**
- **Zones 1-2:** 61 / 62 / 59 / 60 s, the same on both seeds (all scripted).
- **Zone 3:** 61 / 19 / 44 / 44 / 1 / 25 / 18 / 23 s.
  - It gets denser: the Thing adds its own moments on top of the scripted ones.
  - The "1 s" is the leg hiding among spiders, so it's really one moment.
- **Zone 4:** 60 / 51 s, then the climax.

**What I changed because of the run:**
- The Thing walking right over you now counts as an encounter for pacing
  (`thing_pass`).
  - Before, the scariest moment in the game didn't reset the pacing clock.
  - So false alarms could start right after it, and zone 3 looked like it had
    96-128 s dead gaps when it didn't.

**Regressions, all pass:**
- AI 17/17 and the Phase 4 systems test 5/5
  - These two time themselves on the wall clock: run them without `--fixed-fps`.
- arm, teaching arm, Cable, leg, death
- the full descent to the ending

**Clips:** recorded with Godot's movie writer through the same bot, captioned,
and brightened for phone screens (the real game is darker).

### Visible in the dark + the Thing re-animated (your "torch system isn't great" ask)

**The rule now: darkness hides DETAIL, not existence.** Every creature is drawn
twice (`CreatureDraw.add_night_pass`):
- **The night pass** is always visible: a black silhouette, darker than the
  walls, with a cold edge where faint light catches it, and a pale eye on the
  Thing.
  - Arms, spiders and the leg get it through a shader
    (`shaders/creature_night.gdshader`). It turns their own drawing into night
    tones.
  - The Thing draws its own night colours.
- **The torch pass** is the old drawing on top. Your beam (and a few worklights)
  fades in the real skin, bone, ribs and gut.
- **The Lure is the one exception** while it waits: it IS the light, and what
  holds it is the secret. When it shows itself (the choice reveal, the bite)
  the body is drawn unshaded, so you see it torch or not.
- **Cables were already always visible** (they're disguised as scenery).

**Animation toolkit (`scripts/anim/`):**
- `Dyn`: second-order springs with a personality: speed, damping, and a
  response that can anticipate. Gives overshoot, settling and follow-through.
- `VerletChain`: limbs with inertia that swing, trail and drag, pulled towards
  a posed shape.
- `IK.two_bone`: hip -> knee -> foot with fixed bone lengths.

**The Thing, rebuilt on it.** Behaviour, senses and speeds are unchanged; this
is only how it moves.
- **Legs:**
  - IK, so the bones keep their length: knees fold up towards the ceiling
    instead of legs stretching like rubber.
  - Feet planted in the world, stepping in two alternating groups (a wave gait).
  - Wandering, it PLACES each foot (up, a hang, set down) after a beat of
    hesitation, sometimes testing the floor first.
  - Hunting, it throws its legs forward and slams them down.
- **Body:**
  - The pelvis and chest are springs in world space, so it has weight: starts
    lag, stops overshoot and settle, and the chest whips after the pelvis.
  - Every footfall jolts up through it, and lifted legs make it sag.
- **Head:**
  - Glances and holds while it wanders, with anticipation (it dips the wrong way
    for a beat first).
  - Stopped, it listens, usually tilted your way.
  - Searching, it sniffs in quick jerks.
  - Noticing you, it snaps round in 2 frames and wobbles.
  - Hunting, it hangs dead still in the air, locked on you, while the body bobs
    under it.
- **Arms:** verlet chains: the blades hang to the floor and drag, swing when it
  stops, trail when it lurches.
- **Acting:**
  - Asleep, it's hunched.
  - The wind-up when it notices you: a jolt upright, then it coils, rears back
    and the blades lift.
  - Hunting, it's pitched forward and low.
  - Frozen in your light, it strains on the spot, updating on threes like
    stop-motion.
  - A lurch out of the freeze shoves the whole body.

**Verified:**
- AI test 17/17, systems test 5/5
- arm, teaching arm, leg, Cable, death
- the full descent to the ending
- renders of the Thing and the other creatures with no light at all, and in the
  torch

### Round 2, Phase 1: debug tools

- **F3:** a Thing section at the top in plain words (`WedgedThing.debug_info()`)
  plus a line for the nearest arm, Cable and Lure. The old one-line state dump
  stays underneath in grey.
- **F3 world gizmos** (`scenes/ui/debug_gizmos.gd`, unshaded, drawn over
  everything):
  - hearing circle
  - sight circle
  - a line to you while it sees you
  - the last-known X
- **F4:** a pacing overlay (`main.gd _pacing_text()`). The false-alarm timer
  mirrors `Pacing._alarm_tick`'s rules, so its pause reason is the real one.
- **Supporting changes (behaviour unchanged):**
  - `GameState.make_noise()` now records what made the noise ("footsteps",
    "running", "climbing", "switch", "boards").
  - The Thing keeps `notice_why` (plain words) and how long ago it last had
    you.
  - The overlays are RichTextLabels in `ui.gd`.

### Round 2, Phase 2: tuning

- `pacing.gd`:
  - `alarm_interval` 25-60 s
  - false alarms 3-4 dB quieter
  - `_last_sound` means no sound plays twice in a row
- **The encounter gate** (`Pacing.encounter_ready()`, `GameState.encounter_ready()`):
  - Zones 1-2: a fresh random gap in 40-110 s after every encounter. Zone 3: a
    30 s minimum. Zone 4: none.
  - Gated: Ceiling Arms (come out), the leg (reveal), the eye glimpse (it only
    takes its place out of view), the crossing silhouette, Cables (a switch
    heard while shut is remembered, and it comes when the gate opens if you're
    near), Lures, and the Thing's director nudge.
  - Spiders still scatter (that's just spiders), but only count as an encounter
    with the gate open.
  - The Thing: while the gate is shut, its patrol picks points that don't
    cross within 200 px of you, and it turns away if it's heading your way.
    Hearing, sight and light still work exactly as before (the rules you learn
    never lie).
- **Lure 3:** `_told`, a 0.4 s cord jerk and a 0.14 s red flicker (buzz pitch
  drops) when you're 3 s of walking away at your current speed. New
  `checkpoint` decor ~10 s before it.
- **The Thing noticing you in zone 3+** calls `pacing.hush(3-5 s)` (no torch
  flicker). The hum, drips, false alarms and drone drop out and creep back.
- **Overlays:** F4 shows the gate; F3's Lure line shows the tell; F3 NEXT shows
  when the nudge is held.

**Measured (full bot run, 2 seeds, old long layout):**

| | seed 11 | seed 29 |
|---|---|---|
| Time | 11.6 min | 11.9 min |
| Average gap | 56 s | 54 s |
| Zone 3 gaps | 31-65 s | 31-65 s |
| False alarms | 12 | 12 |

- **Zone 3:** every gap is at least 30 s. The one 29 s gap is the zone 4
  climax, which isn't gated.
- **False alarms** were 51-57 before.
- **Zones 1-2 are still ~60 s apart**, because the long corridors space them
  anyway. The gate starts doing the work once Phase 3 makes the layout denser.
- **Seed 29 "ghosted" zone 3a.** The bot waited to be walked over by a Thing
  that kept turning away from it (the gate). A player would follow it; my bot
  just waits.

### Round 2, Phase 3: level structure (a network of short sections)

- **The map is generated** (`tools/gen_network.py`, run from the project folder; it writes
  `MAP`, `DECOR` and `SECTIONS` in `test_level.gd`).
  - The shop, storeroom, stairwell and the B1 landing are unchanged.
  - Everything below is 21 sections of 14-32 tiles, each in its own pocket of
    rock (22-column separators, so the camera never shows the next one).
  - The map went from 1623 to 942 columns.
  - Two sections are stacked over others, reached by ladders: the staff room
    over Z2-1, the sleeping alcove over A3.
- **The route** is the one in the header of `test_level.gd`. Every encounter is
  still there, redistributed:
  - zone 1: spiders
  - zone 2: teaching arm, eye, silhouette, lever + Cables
  - zone 3a: Lure 1, floor arm, spiders, the Thing, Lure 2 / the honest light
  - zone 3b: leg, real arm, the Thing, timed door + Cable
  - zone 4: Lure 3, the climax, the squeeze
- **New props:**
  - `BackDoor` (W, fade, creak/clunk, rattle when locked; looks: metal, wood,
    sealed, ajar, arrival). The level keeps the door map: `_back_doors`,
    `use_door()`.
  - `Landmark` (12 kinds, with return-trip changes: turned / missing /
    double / move).
  - `StoryProp` (crisps stacks, kettle table, rota, stock cage, sleeping bag).
  - `BackDetail` (doorways into dark rooms, grates).
  - `foreground.gd`, the parallax layer: 1-2 items per section, 1.35x.
- **Return trips:** `Descent._on_main_bottom` no longer teleports. The stairs
  always come down to B1. The sealed "deeper" door (`go_deeper()`) opens after
  each trip onto that trip's arrival door. `apply_shop_changes` also changes
  the landmarks.
- **Player:** walks up one-tile steps (`_step_up`), and the camera doesn't
  jump.
- **The climax** now puts the Thing at most 260 px behind you, but never
  outside the section: it comes through the door behind you. The trigger
  moved earlier in D3 so the chase has room.
- **Fixed for the network:**
  - The crossing silhouette needed only "you're past this x". Now it needs you
    in its room; before, it fired from zone 3.
  - The eye glimpse only takes its place while you're on your way to it, and
    stands down if the gate shuts again first.
- **F3:** a SECTION line with where each door goes.
- **Tests:**
  - The AI test (18/18) now runs in a hidden test arena at the far end of the
    map (no doors, never visited in play), because its distances need long
    corridors.
  - Systems 5/5; arm, teaching arm, Cable, leg, death all pass.
  - `descent_test.gd` is retired. The full bot now covers all three return
    trips, B1's changes and the deeper door.

**Full bot run on the network (2 seeds):**

| | seed 11 | seed 29 |
|---|---|---|
| Time to the ending | **7.7 min** | 8.1 min |
| Real encounters | 9 | 10 |
| **Average gap** | **40 s** | 43 s |
| False alarms | 6 | 6 |
| Deaths | 1 (Lure 3) | 1 (Lure 3) |
| Section changes | 29 | 29 |

- **The old long layout** took 11.6-11.9 min. The bot walks flat out and
  never explores, so a person should land around 11-14 min.
- **Zones 1-2 only fire 1-2 encounters for the bot.** It's through zone 2 in
  ~60-70 s, and the 40-110 s gate holds the rest (eye, silhouette, Cables).
  They're there for anyone slower, or on the backtrack. Options in Decisions.
- **Zone 3:** everything gated is 30+ s apart. The Thing noticing you is never
  delayed (the rules have to stay honest), so a "thing" can land soon after
  something else (11 s once).
- **The bot gave up hiding in 3a on seed 29.** With the gate shut, the Thing
  won't walk over you, and in a 30-tile room it hovers. A person would edge
  past it. The bot just waits.

## Untested
- Audio, by ear (no sound card here).
- Real input feel: mouse aiming, camera lean, crouch timing.
- How dark it looks on a real monitor. My renders are software-rendered PNGs.

## Known bugs / rough edges
- The Cable's coils round your ankle are subtle (a dark rubber cable on dark
  trousers). The drag and the taut, trembling line sell the grab more than the
  coils do.
- **The Thing's "bent forward" is my take on your "spine pressed against the
  ceiling":** the game sees it from the front (like your concept art), so
  leaning forward shows as the head hanging down in front of the chest. Say if
  you meant something else.
- **Zone 3b's real arm sits inside the Thing's patrol.**
  - On one seed the bot hid from the Thing right under it: the arm grabbed it.
  - The next attempt, the Thing caught it while it was busy lighting the arm.
  - It's a nasty combo but fair (the scratching warns you). Say if it's too
    mean.
- **The bot can't judge sound.** The 3.4x false-alarm ratio is a count, not a
  feeling. Whether they read as "alive" or as noise is your call with
  headphones.
- Silences only come before SCRIPTED encounters. The Thing in zone 3 is
  dynamic: its approach drops the hum within 240 px (Phase 1), but there's no
  4-8 s silence before it finds you.
- In 64 px corridors the Thing's head is bent nearly sideways by the ceiling, so
  the one-eyed head reads less than in open rooms. It's meant to look crammed;
  tell me if it reads wrong.
- Zone 2's three Thing moments (eye, leg, silhouette) are close together. Phase 3
  spreads them out.
- The pipe texture repeats its bracket and rust spots every 16 px. Fine for now.

## Decisions to check
- **Phase 3 vs Phase 2:** the dense network plus the 40-110 s gate means a fast
  player sees only 1-2 of zone 2's five encounters. Options:
  - (a) keep it (rarer = scarier, and slower players get more)
  - (b) gate zones 1-2 at 25-70 s
  - (c) more backtracking in zone 2

  Your call.
- **The "deeper" door on the B1 landing** is how return trips reach the next
  zone now. It keeps your zone order, and it gives the landing's changes a
  reason to exist.
- **Back-wall doors are an escape:** the Thing can't follow you through one.
  That's how the climax ends (you make the far door, it stops). Elsewhere a
  door mid-chase also loses it. Say if you want it to follow you through.
- **The hidden test arena** at the end of the map is test-only (no doors). Delete
  the TEST section in `tools/gen_network.py` if you'd rather not have it.
- **Round 2 Phase 8 vs "visible without the torch":** two of the Phase 8 ideas
  assume the Thing is invisible outside the beam:
  - "closer when you look back"
  - "edge of the light: a leg tip at the beam's edge"

  Now it's a silhouette in the dark, so you'd SEE it creep closer, and the edge
  of the beam reveals detail, not existence. Options when we get there:
  - (a) it only creeps while it's off-screen or behind you
  - (b) it creeps in the dark, but in stop-motion jumps only while your beam is
    off it (you see the result, never the motion)
  - (c) bring back torch-only visibility for the Thing alone

  My pick is (b). Say before Phase 8.
- **"The hand thing" = the Ceiling Arm** (and the floor-grate arm, same
  creature). Black with an oily sheen, so it reads in your beam instead of
  vanishing into the brick. Pure flat black was unreadable on my renders.
  - In the beam it's a black silhouette against lit brick. That works, but
    only if you get to see it, hence the 0.35 s freeze.
  - Under a floodlight (not something the game has) it's nearly invisible on
    dark brick.
- **The scarier torch keeps the same gameplay cone** (40 degrees, 120 px). Only
  the look changed: a hotter, smaller centre, a dirty spill, brownouts, lag,
  motes. A smaller real cone would have changed every creature's balance.
- **The third Lure (zone 4) is a guaranteed death the first time.**
  - Both bot runs died there. By then you've learned "lights lie", so the
    honest-looking one baits you.
  - It doesn't come back after the bite, and the checkpoint is ~30 s back.
  - If that feels cheap, give it a tell (the cord twitching) or move the
    checkpoint closer.
- **The Thing passing over you counts as an encounter** (pacing only: it
  doesn't know you're there).
- **Length vs spacing:**
  - Your two targets fight each other. 3-4x the route can't hold ~10
    encounters each 60-90 s apart at walking speed; that needs ~8x.
  - I kept your 60 s minimum for the build-up (zones 1-2, measured at full walking
    speed). The underground ended up ~5x, not 3-4x. A real player who stops,
    listens and crouches will take longer per gap, so 60-90 s in practice.
  - If it drags, the stretches are easy to shorten.
- **The teaching arm can't grab** (the doc: "taught safely first, then used for
  real"). The real one waits in zone 3b.
- **Zone 3 has one safe room** (in 3a), zone 3b doesn't, so it's one per zone.
- **False alarm rate:** one every ~6-13 s of quiet. That's what 3x needed. They're
  quiet sounds, so I hope it reads as "the tunnels are alive", not noise. Tune
  `alarm_interval` in `pacing.gd`.
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
