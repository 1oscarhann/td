# Neon Bastion

A fast, juicy, "one more wave" tower defence game in a **single self-contained HTML file**: vanilla JS, canvas rendering, Web Audio synth sounds, no assets or libraries.

**Play:** open `index.html` in any modern browser.

## Features
- 3 hand-designed maps × 30 waves, with a boss every 10 waves
- 5 towers (Gunner, Cannon, Frost, Tesla, Sniper), each with 3 tiers, a branching tier-4 specialisation, and First/Last/Strong/Close targeting
- 8 enemy types: grunt, runner, armored tank, swarm, medic (healer), drone (flying), splitter, boss
- Call waves early for bonus gold, 1x/2x/3x speed, pause
- Juice: screen shake, hit flashes, damage numbers, particles, coins that fly into the gold counter, a combo multiplier, a low-lives heartbeat and vignette
- Meta progression: stars and gems, a persistent upgrade tree, locked specialisations, and 21 achievements (saved in localStorage)
- Endless mode with a local leaderboard, plus a seeded Daily Challenge with a random modifier

## Controls
| Key | Action |
| --- | --- |
| 1–5 | Pick a tower to build (Shift-click to place several) |
| Space | Start / call next wave early |
| U / S | Upgrade / sell selected tower |
| T | Cycle targeting mode |
| F | Cycle speed |
| P / Esc | Pause / cancel |

## Tweaking balance
Every balance value (costs, damage, HP, HP scaling, wave composition, meta upgrades, daily modifiers) lives in the `CONFIG` object at the top of the script in `index.html`. Waves use a compact syntax: `'tank*6@1.3, &healer*3@2.4+1'` spawns 6 tanks 1.3s apart, plus 3 healers that start at the same time (`&`) after a 1s delay (`+1`).
