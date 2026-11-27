"""Colour ramps, dark -> light, following the design doc's palette table.
Each zone keeps a small set (8-16 colours) so the palette tells the depth."""
from .core import Ramp

# Shop (lights on): fluorescent greens, dirty yellows, white tubes.
SHOP_TILE = Ramp((38, 44, 38), (56, 64, 54), (78, 88, 74), (102, 112, 94), (128, 136, 112), (152, 158, 130))
SHOP_GROUT = Ramp((58, 56, 40), (84, 80, 52), (106, 100, 64))
LINO = Ramp((30, 33, 29), (42, 47, 40), (56, 62, 52), (72, 78, 62))
# Storeroom / Zone 1: concrete greys, dirty yellow. Warmest underground.
CONCRETE = Ramp((30, 30, 28), (42, 41, 38), (56, 55, 50), (72, 70, 63), (90, 87, 76), (110, 105, 90))
STAIN = Ramp((60, 54, 34), (88, 78, 46), (112, 98, 56))
# Zone 2: cold blue-greys, brick browns.
BRICK = Ramp((36, 27, 26), (50, 37, 34), (64, 47, 42), (79, 59, 51), (95, 72, 61), (110, 86, 73))
MORTAR = Ramp((26, 29, 34), (36, 41, 48), (50, 56, 65))
TUNNEL_FLOOR = Ramp((18, 21, 26), (27, 31, 38), (38, 43, 52), (52, 59, 70), (78, 90, 104))
SALT = Ramp((96, 100, 104), (128, 132, 132))
ROCK = Ramp((9, 10, 12), (14, 15, 18), (20, 22, 26), (28, 30, 35))
# Props.
METAL = Ramp((20, 23, 27), (32, 37, 43), (48, 54, 62), (68, 76, 85), (94, 102, 110), (130, 138, 142))
WOOD = Ramp((36, 24, 17), (54, 37, 25), (76, 53, 34), (100, 72, 46), (124, 94, 62))
CARD = Ramp((58, 42, 26), (82, 61, 37), (108, 82, 52), (132, 106, 70))
PAPER = Ramp((150, 150, 136), (182, 182, 166), (206, 204, 186))
GLASS = Ramp((10, 14, 16), (18, 24, 28), (30, 38, 44), (52, 62, 68))
HAZARD = Ramp((110, 92, 30), (150, 126, 44))
RED = Ramp((96, 26, 24), (150, 40, 34), (196, 64, 52))
PACKETS = [(124, 46, 42), (46, 66, 110), (150, 124, 52), (58, 98, 62), (140, 140, 132)]
BOTTLES = [(70, 30, 28), (40, 80, 50), (120, 100, 40), (60, 70, 100), (130, 132, 126)]

# Zone 3: dark green-greys, black water. Wet, low contrast.
STONE = Ramp((20, 25, 23), (28, 35, 32), (38, 46, 42), (50, 60, 55), (64, 75, 69))
WATER = Ramp((4, 6, 7), (9, 12, 14), (18, 24, 27), (44, 56, 60))
# Zone 4: muted browns, sick reds (the only saturated colour in the game).
FLESH = Ramp((34, 21, 19), (50, 30, 27), (68, 42, 37), (88, 56, 48), (108, 72, 62))
SICK_RED = Ramp((70, 14, 16), (112, 26, 28), (150, 40, 40))
