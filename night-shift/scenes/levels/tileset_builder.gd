class_name TileSetBuilder
extends RefCounted
## Builds the placeholder TileSet in code: a 96x16 atlas of six 16x16 tiles,
## generated pixel by pixel, with a normal map, a physics layer and an
## occlusion layer.
##
## Solid tiles get:
##   - a full-square collision polygon (physics layer 0 -> world layer)
##   - a full-tile occluder polygon (occlusion layer 0, light mask = environment)
##     so the torch casts real shadows. It's back-face culled: only the edges
##     facing AWAY from the light cast, so the first solid tile the beam hits is
##     lit (you see the floor / wall face) and everything behind it is in shadow.
##     (Insetting occluders instead leaves gaps between tiles that light leaks
##     through.)
## Background tiles have neither.
##
## To move to hand-painted art: make a TileSet resource in the editor with the
## same atlas coords, add the same physics/occlusion layers, and assign it to the
## TileMapLayers in test_level.tscn instead of calling build().

const TILE := 16
## Which winding gets culled. Flip to CULL_COUNTER_CLOCKWISE if faces go dark.
const OCCLUDER_CULL := OccluderPolygon2D.CULL_CLOCKWISE

## Atlas column for each tile type. Solid tiles are picked by the level from
## their neighbours, so floor, ceiling, side walls and rock never blend together:
## floor = lightest (a surface you walk on), back wall = mid, ceiling = darker
## and cooler, rock fill = darkest.
const ROCK := 0
const BACK_CONCRETE := 1
const BACK_BRICK := 2
const FLOOR := 3
const CEILING := 4
const SIDE := 5
const TILE_COUNT := 6
const SOLID_TILES := [ROCK, FLOOR, CEILING, SIDE]


static func build() -> TileSet:
	var ts := TileSet.new()
	ts.tile_size = Vector2i(TILE, TILE)
	ts.add_physics_layer()
	ts.set_physics_layer_collision_layer(0, GameState.LAYER_WORLD)
	ts.set_physics_layer_collision_mask(0, 0)
	ts.add_occlusion_layer()
	ts.set_occlusion_layer_light_mask(0, GameState.LIGHT_ENV)

	var src := TileSetAtlasSource.new()
	src.texture = _make_atlas()
	src.texture_region_size = Vector2i(TILE, TILE)
	ts.add_source(src, 0)
	for i in TILE_COUNT:
		src.create_tile(Vector2i(i, 0))

	var h := TILE * 0.5
	var square := PackedVector2Array([Vector2(-h, -h), Vector2(h, -h), Vector2(h, h), Vector2(-h, h)])
	for solid in SOLID_TILES:
		var td := src.get_tile_data(Vector2i(solid, 0), 0)
		td.add_collision_polygon(0)
		td.set_collision_polygon_points(0, 0, square)
		var occ := OccluderPolygon2D.new()
		occ.polygon = square
		occ.cull_mode = OCCLUDER_CULL
		_set_occluder(td, occ)
	return ts


## Godot 4.4 moved to multiple occluder polygons per tile; 4.3 has a single one.
static func _set_occluder(td: TileData, occ: OccluderPolygon2D) -> void:
	if td.has_method("add_occluder_polygon") and td.has_method("set_occluder_polygon"):
		td.call("add_occluder_polygon", 0)
		td.call("set_occluder_polygon", 0, 0, occ)
	else:
		td.call("set_occluder", 0, occ)


# --------------------------------------------------------------------- the atlas

static func _make_atlas() -> CanvasTexture:
	var w := TILE * TILE_COUNT
	var diffuse := Image.create(w, TILE, false, Image.FORMAT_RGBA8)
	var height := Image.create(w, TILE, false, Image.FORMAT_RGBA8)
	var rng := RandomNumberGenerator.new()
	rng.seed = 7
	_paint_concrete(diffuse, height, ROCK, Color(0.17, 0.18, 0.20), rng, EDGE_NONE)
	_paint_concrete(diffuse, height, BACK_CONCRETE, Color(0.36, 0.37, 0.39), rng, EDGE_SEAM)
	_paint_brick(diffuse, height, BACK_BRICK, Color(0.36, 0.30, 0.28), Color(0.22, 0.22, 0.24), rng)
	_paint_concrete(diffuse, height, FLOOR, Color(0.56, 0.55, 0.51), rng, EDGE_TOP)
	_paint_concrete(diffuse, height, CEILING, Color(0.27, 0.29, 0.33), rng, EDGE_BOTTOM)
	_paint_concrete(diffuse, height, SIDE, Color(0.40, 0.41, 0.43), rng, EDGE_NONE)

	var tex := CanvasTexture.new()
	tex.diffuse_texture = ImageTexture.create_from_image(diffuse)
	tex.normal_texture = ImageTexture.create_from_image(_height_to_normal(height))
	return tex


const EDGE_NONE := 0
const EDGE_TOP := 1     # floor: worn, lighter walking surface on the top rows
const EDGE_BOTTOM := 2  # ceiling: dark lip on the bottom row
const EDGE_SEAM := 3    # back-wall concrete panels: vertical seam


static func _paint_concrete(img: Image, hmap: Image, col: int, base: Color,
		rng: RandomNumberGenerator, edge: int) -> void:
	for y in TILE:
		for x in TILE:
			var n := rng.randf_range(-0.04, 0.04)
			var c := Color(base.r + n, base.g + n, base.b + n)
			var hv := 0.6 + n * 3.0
			if edge == EDGE_SEAM and x == 0:
				c = c.darkened(0.25)
				hv = 0.3
			elif edge == EDGE_TOP and y == 0:
				c = c.lightened(0.22)
				hv = 0.9
			elif edge == EDGE_TOP and y == 1:
				c = c.lightened(0.1)
			elif edge == EDGE_BOTTOM and y == TILE - 1:
				c = c.darkened(0.4)
				hv = 0.3
			img.set_pixel(col * TILE + x, y, c)
			hmap.set_pixel(col * TILE + x, y, Color(hv, hv, hv))


static func _paint_brick(img: Image, hmap: Image, col: int, brick: Color, mortar: Color,
		rng: RandomNumberGenerator) -> void:
	for y in TILE:
		var row := y / 4
		var offset := 4 if row % 2 == 1 else 0
		for x in TILE:
			var is_mortar := y % 4 == 3 or (x + offset) % 8 == 7
			var n := rng.randf_range(-0.035, 0.035)
			var c := mortar if is_mortar else Color(brick.r + n, brick.g + n * 0.8, brick.b + n * 0.6)
			var hv := 0.15 if is_mortar else 0.8 + n * 2.0
			img.set_pixel(col * TILE + x, y, c)
			hmap.set_pixel(col * TILE + x, y, Color(hv, hv, hv))


## Height map -> tangent-space normal map (Y up), so bricks catch the torch.
static func _height_to_normal(hmap: Image) -> Image:
	var w := hmap.get_width()
	var h := hmap.get_height()
	var out := Image.create(w, h, false, Image.FORMAT_RGBA8)
	for y in h:
		for x in w:
			var tile_x := (x / TILE) * TILE
			var l := hmap.get_pixel(tile_x + posmod(x - 1 - tile_x, TILE), y).r
			var r := hmap.get_pixel(tile_x + posmod(x + 1 - tile_x, TILE), y).r
			var u := hmap.get_pixel(x, posmod(y - 1, h)).r
			var d := hmap.get_pixel(x, posmod(y + 1, h)).r
			var n := Vector3((l - r) * 1.5, (d - u) * 1.5, 1.0).normalized()
			out.set_pixel(x, y, Color(n.x * 0.5 + 0.5, n.y * 0.5 + 0.5, n.z * 0.5 + 0.5))
	return out
