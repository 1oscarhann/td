#!/usr/bin/env python3
"""Procedural art for Night Shift. Run from anywhere:

    python3 tools/gen_tiles.py

Writes every texture into art/: a PNG, a normal map (_n.png) and a Godot
CanvasTexture (.tres) for each. Standard library only; deterministic.

  tools/art/core.py     canvas + height channel, dithering, noise, writer
  tools/art/palette.py  colour ramps per zone (design doc palette table)
  tools/art/tiles.py    16x16 tiles: walls, floors, ceilings, edges, rock
  tools/art/props.py    props (shop, storeroom, tunnels)
  tools/art/player.py   the night-shift worker (16-frame sheet)
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from art import core, tiles, props, player  # noqa: E402


def main():
    core.save(tiles.build(), "tiles/tiles", wrap=core.T)
    props.build_all()
    player.build()


if __name__ == "__main__":
    main()
