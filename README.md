# Bean & Bloom: a tiny 3D café tycoon

A cosy diorama-style café tycoon that runs entirely from one `index.html`.
Open the file in a modern browser (Chrome, Edge, Firefox, Safari) and it plays: no build step, no npm, no asset files.
Three.js and its addons load from jsDelivr via an import map, and fonts load from Google Fonts, so the first load needs a connection.

## How to play

1. Guests walk in, grab a free table and show an order bubble. The ring around the bubble is their patience.
2. Click the espresso machine (or press `1`) to brew. Finished drinks wait on the counter.
3. Click a guest's table to serve them. How happy they are depends on **speed** (how fast it arrived) and **value** (how fair the price felt), and happiness drives tips and reputation.
4. Open **Manage** (`B` for the overview, `U` for upgrades) to run the business:
   - **Overview:** today's profit (wages and rent are counted up front because they're due at closing), takings, costs, guest happiness, lost guests, a 7-day profit chart with a table, and per-item margins.
   - **Menu:** set your own prices. Every item costs ingredients to make. Guests judge prices against what feels fair *in your café*, and that rises with reputation, furniture and decor. Cheap prices pull in more guests, pricey ones scare them off (some walk straight out), and the sweet spot moves: charge more when you're packed, less when seats sit empty.
   - **Staff:** hire a barista, a tea master, a baker and up to two servers. Brewers keep their station stocked (and make it faster); servers carry orders to tables. Everyone draws a daily wage paid at closing, and training makes them quicker. Over-hire and the wages eat your profit.
   - **Upgrades:** more tables, a faster machine, nicer furniture, a matcha bar (`2`), a pastry case (`3`), cosy decor and a sidewalk sign.
5. Each day ends with a wrap-up showing profit, costs, happiness and a couple of tips from your numbers.

**Make it yours** (`C` or the palette button, also on the title screen): name your café and pick a theme, or set the walls, trim, counter, upholstery, rug and floor yourself. The name shows up on the HUD and the chalkboard menu, and the buttons pick up your counter colour. Your style is saved separately from your progress.

Drag to orbit (limited), scroll or pinch to zoom, `P` pauses, `M` mutes. Progress saves between days.

## Graphics

The quality button cycles Auto / High / Medium / Low. Auto starts at High on desktop (Medium on touch or low-core devices) and steps down if the frame rate sags.

| Tier | Pixel ratio | Shadows | Post |
| --- | --- | --- | --- |
| High | up to 2 | 2048 VSM | GTAO (half-res on hi-DPI), bloom, tilt-shift DOF, vignette, glass transmission |
| Medium | up to 1.5 | 2048 VSM | bloom, tilt-shift DOF, vignette |
| Low | 1 | 1024 VSM | none |
