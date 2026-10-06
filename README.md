# Bean & Bloom: a tiny 3D café tycoon

A cosy diorama-style café tycoon that runs entirely from one `index.html`.
Open the file in a modern browser (Chrome, Edge, Firefox, Safari) and it plays: no build step, no npm, no asset files.
Three.js and its addons load from jsDelivr via an import map, and fonts load from Google Fonts, so the first load needs a connection.

## How to play

1. Guests arrive alone or in pairs, take a table and show an order bubble. The ring around the bubble is their patience. If every table is taken they queue by the door, and they won't wait forever.
2. Click the espresso machine (or press `1`) to brew. Finished drinks wait on the counter.
3. Click a guest's table to serve them. How happy they are depends on **speed** (how fast it arrived) and **value** (how fair the price felt), and happiness drives tips and reputation.
4. When guests leave, their tip sits on the table. Click the dirty table to bank it and free the seat, or hire a server to bus tables for you.
5. Open **Manage** (`B` for the overview, `U` for upgrades) to run the business:
   - **Overview:** today's profit (wages and rent are counted up front because they're due at closing), takings, costs, guest happiness, lost guests, today's guest mix, recent reviews, a 7-day profit chart with a table, and per-item margins.
   - **Menu:** set your own prices. Every item costs ingredients to make. Guests judge prices against what feels fair *in your café*, and that rises with reputation, furniture and decor. Cheap prices pull in more guests, pricey ones scare them off (some walk straight out), and the sweet spot moves: charge more when you're packed, less when seats sit empty.
   - **Staff:** hire a barista, a tea master, a baker and up to two servers. Brewers keep their station stocked (and make it faster); servers carry orders to tables and bus dirty ones. Everyone draws a daily wage paid at closing, and training makes them quicker. Over-hire and the wages eat your profit.
   - **Upgrades:** more tables, a faster machine, nicer furniture, a matcha bar (`2`), a pastry case (`3`), cosy decor, a sidewalk sign and a café cat.
   - **Goals:** today's goals and every milestone you've unlocked or have left to chase.
6. Each day ends with a wrap-up showing profit, costs, happiness, goals, reviews, your best streak and a couple of tips from your numbers.

### Guests

| Type | What they're like |
| --- | --- |
| Regular | The baseline: average patience, prices and tips. |
| Student | Hunts bargains and loves matcha. Often has a backpack, often brings a friend. |
| Commuter | In a hurry and barely notices prices, but tips well. Suit and tie. |
| Tourist | Loves pastries, takes photos of the order (and sometimes posts them, which helps your reputation). Sun hat and camera. |
| Food critic | Rare, in a beret and scarf, scribbling notes. Their verdict counts four times and makes the papers. |

While they wait, guests scroll their phones, read, chat with whoever they came with, or cross their arms and glare at the counter when service drags.

### Each day

- **Weather:** sunny days bring crowds and tourists, cloudy days are steady, and rainy days bring fewer guests who linger and forgive slow service. On rainy days guests carry umbrellas and the light turns grey and soft.
- **Events:** some mornings bring a critic in town, market day, exam week, a coffee festival or new offices nearby, each shifting who turns up and what they order. The morning card tells you what's coming.
- **Goals:** three small goals each morning pay a cash bonus on the spot.
- **Streak:** serve guests quickly back to back to build a streak worth up to +25% tips.
- **Milestones:** seventeen long-term achievements, each with a reward.

### The café cat

Adopt one from Upgrades. It naps on the bench, wanders the room and goes to sit with guests, who love it (and say so in their reviews). Click it for a scratch: it purrs, and everyone waiting calms down a little. Rename it and pick its coat in the customise panel.

### Make it yours

Press `C` or the palette button (also on the title screen) to name your café and pick a theme, or set the walls, trim, counter, upholstery, rug and floor yourself. The name shows up on the HUD and the chalkboard menu, and the buttons pick up your counter colour. Your style is saved separately from your progress.

### Controls

Drag to orbit (limited), scroll or pinch to zoom.

| Key | Action |
| --- | --- |
| `1` `2` `3` | Brew latte / matcha / pastry |
| `P` | Pause |
| `F` | Game speed (1× / 1.5× / 2×) |
| `U` / `B` | Upgrades / business overview |
| `C` | Customise |
| `M` | Mute |
| `O` | Settings |
| `H` | How to play |

Progress saves between days.

## Settings

The gear button (`O`) opens settings: music and effects volume, graphics quality, game speed, camera push-ins (off by default if your system asks for reduced motion) and starting a new café. The clock stops while settings or help are open.

## Graphics

Pick Auto / High / Medium / Low in settings or on the title screen. Auto starts at High on desktop (Medium on touch or low-core devices) and steps down if the frame rate sags.

| Tier | Pixel ratio | Shadows | Post |
| --- | --- | --- | --- |
| High | up to 2 | 2048 VSM | GTAO (half-res on hi-DPI), bloom, tilt-shift DOF, vignette, glass transmission |
| Medium | up to 1.5 | 2048 VSM | bloom, tilt-shift DOF, vignette |
| Low | 1 | 1024 VSM | none |
