# Bean & Bloom: a tiny 3D café tycoon

A cosy diorama-style café tycoon that runs entirely from one `index.html`.
Open the file in a modern browser (Chrome, Edge, Firefox, Safari) and it plays: no build step, no npm, no asset files.
Three.js and its addons load from jsDelivr via an import map, and fonts load from Google Fonts, so the first load needs a connection.

## How to play

1. Guests walk in, grab a free table and show an order bubble. The ring around the bubble is their patience.
2. Click the espresso machine (or press `1`) to brew. Finished drinks wait on the counter.
3. Click a guest's table to serve them. Faster service means bigger tips and more reputation.
4. Spend money in **Upgrades**: more tables, a faster machine, nicer furniture, a matcha bar (`2`), a pastry case (`3`), a barista who brews and serves on their own, cosy decor and a sidewalk sign.
5. Reputation brings in more guests who spend more. Each day runs from morning gold to lamp-lit evening and ends with a wrap-up screen.

Drag to orbit (limited), scroll or pinch to zoom, `P` pauses, `M` mutes, `U` opens the shop. Progress saves between days.

## Graphics

The quality button cycles Auto / High / Medium / Low. Auto starts at High on desktop (Medium on touch or low-core devices) and steps down if the frame rate sags.

| Tier | Pixel ratio | Shadows | Post |
| --- | --- | --- | --- |
| High | up to 2 | 2048 VSM | GTAO (half-res on hi-DPI), bloom, tilt-shift DOF, vignette, glass transmission |
| Medium | up to 1.5 | 2048 VSM | bloom, tilt-shift DOF, vignette |
| Low | 1 | 1024 VSM | none |
