class_name TileSetBuilder
extends RefCounted
## Builds the level TileSet in code from the generated pixel-art atlas
## (art/tiles/tiles.tres: a CanvasTexture = tiles.png diffuse + tiles_n.png
## normal map, both made by tools/gen_tiles.py).
##
## Atlas layout: columns are tile TYPES (constants below), rows are VARIANTS
## (0 plain, 1 damage, 2 stain). The level picks a variant per cell.
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
## Built in code rather than as a .tres so the polygons can't drift out of sync
## with the atlas when the art is regenerated.

const TILE := 16
const ATLAS_PATH := "res://art/tiles/tiles.tres"
## Which winding gets culled. Flip to CULL_COUNTER_CLOCKWISE if faces go dark.
const OCCLUDER_CULL := OccluderPolygon2D.CULL_CLOCKWISE

## Atlas column for each tile type (see tools/art/tiles.py). Solid tiles are
## picked by the level from their neighbours and the material of the room they
## face, so floor, ceiling, side walls and rock never blend together.
const ROCK := 0
const WALL_SHOP := 1
const WALL_CONCRETE := 2
const WALL_BRICK := 3
const FLOOR_SHOP := 4
const FLOOR_CONCRETE := 5
const FLOOR_TUNNEL := 6
const CEIL_CONCRETE := 7
const CEIL_BRICK := 8
const SIDE_CONCRETE := 9
const SIDE_BRICK := 10
# Zone 3 stone, zone 4 flesh.
const WALL_STONE := 17
const FLOOR_STONE := 18
const CEIL_STONE := 19
const SIDE_STONE := 20
const WALL_FLESH := 23
const FLOOR_FLESH := 24
const CEIL_FLESH := 25
const SIDE_FLESH := 26
## Per back-wall material: [floor, ceiling, side, wall LOW edge, wall HIGH edge].
const MATERIALS := {
	WALL_SHOP: [FLOOR_SHOP, CEIL_CONCRETE, SIDE_CONCRETE, 11, 14],
	WALL_CONCRETE: [FLOOR_CONCRETE, CEIL_CONCRETE, SIDE_CONCRETE, 12, 15],
	WALL_BRICK: [FLOOR_TUNNEL, CEIL_BRICK, SIDE_BRICK, 13, 16],
	WALL_STONE: [FLOOR_STONE, CEIL_STONE, SIDE_STONE, 21, 22],
	WALL_FLESH: [FLOOR_FLESH, CEIL_FLESH, SIDE_FLESH, 27, 28],
}
const SOLID_TILES := [ROCK, FLOOR_SHOP, FLOOR_CONCRETE, FLOOR_TUNNEL, CEIL_CONCRETE,
		CEIL_BRICK, SIDE_CONCRETE, SIDE_BRICK, FLOOR_STONE, CEIL_STONE, SIDE_STONE,
		FLOOR_FLESH, CEIL_FLESH, SIDE_FLESH]
## Footstep surface per floor tile (TileSet custom data "surface").
const SURFACES := {FLOOR_SHOP: "lino", FLOOR_CONCRETE: "concrete", FLOOR_TUNNEL: "wet",
		FLOOR_STONE: "water", FLOOR_FLESH: "flesh"}


static func build() -> TileSet:
	var ts := TileSet.new()
	ts.tile_size = Vector2i(TILE, TILE)
	ts.add_physics_layer()
	ts.set_physics_layer_collision_layer(0, GameState.LAYER_WORLD)
	ts.set_physics_layer_collision_mask(0, 0)
	ts.add_occlusion_layer()
	ts.set_occlusion_layer_light_mask(0, GameState.LIGHT_ENV)
	ts.add_custom_data_layer()
	ts.set_custom_data_layer_name(0, "surface")
	ts.set_custom_data_layer_type(0, TYPE_STRING)

	var tex: Texture2D = load(ATLAS_PATH)
	var src := TileSetAtlasSource.new()
	src.texture = tex
	src.texture_region_size = Vector2i(TILE, TILE)
	ts.add_source(src, 0)
	var grid := Vector2i(tex.get_width() / TILE, tex.get_height() / TILE)
	for y in grid.y:
		for x in grid.x:
			src.create_tile(Vector2i(x, y))

	var h := TILE * 0.5
	var square := PackedVector2Array([Vector2(-h, -h), Vector2(h, -h), Vector2(h, h), Vector2(-h, h)])
	for variant in grid.y:
		for solid: int in SOLID_TILES:
			var td := src.get_tile_data(Vector2i(solid, variant), 0)
			td.add_collision_polygon(0)
			td.set_collision_polygon_points(0, 0, square)
			var occ := OccluderPolygon2D.new()
			occ.polygon = square
			occ.cull_mode = OCCLUDER_CULL
			_set_occluder(td, occ)
			td.set_custom_data("surface", SURFACES.get(solid, "concrete"))
	return ts


## Number of variant rows in a TileSet made by build().
static func variant_count(ts: TileSet) -> int:
	var src := ts.get_source(0) as TileSetAtlasSource
	return src.get_atlas_grid_size().y


## Godot 4.4 moved to multiple occluder polygons per tile; 4.3 has a single one.
static func _set_occluder(td: TileData, occ: OccluderPolygon2D) -> void:
	if td.has_method("add_occluder_polygon") and td.has_method("set_occluder_polygon"):
		td.call("add_occluder_polygon", 0)
		td.call("set_occluder_polygon", 0, 0, occ)
	else:
		td.call("set_occluder", 0, occ)
