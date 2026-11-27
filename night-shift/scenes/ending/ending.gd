extends Node2D
## Ending C (design doc, "full send": A + B).
##   A: controls return and you are the Wedged Thing, your eye a torch cone. A
##      new worker in uniform, torch in hand, runs from you, walking away while
##      shining back at you. "it can see you". Standing still squeezes you on.
##   C: when you reach him: black. Then the Act 0 CCTV feed: a new worker at the
##      till hasn't seen anything, and a leg pokes out of the storeroom vent.
## Every eye glint all game was a torch.

const TILE := 16
const UI_SCENE := preload("res://scenes/ui/ui.tscn")
const FX_SCENE := preload("res://scenes/ui/post_fx.tscn")
const THING_SCENE := preload("res://scenes/creatures/wedged_thing.tscn")
const PLAYABLE := preload("res://scenes/ending/playable_thing.gd")
const SHEET := preload("res://art/player/player.tres")
const COUNTER_SCENE := preload("res://scenes/props/counter.tscn")
const SHELF_SCENE := preload("res://scenes/props/shelf.tscn")
const VENT_SCENE := preload("res://scenes/props/vent.tscn")
const CCTV_SHADER := preload("res://scenes/ui/cctv.gdshader")

# A long stone tunnel (you, then him), and far off, the shop for the last shot.
const MAP := [
	"################################################################################################################",
	"################################################################################################################",
	"#######################################################################################::::::::::::::::::::::::#",
	"#######################################################################################::::::::::::::::::::::::#",
	"#;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;###::::::::::::::::::::::::#",
	"#;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;###::::::::::::::::::::::::#",
	"#;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;###::::::::::::::::::::::::#",
	"#;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;###::::::::::::::::::::::::#",
	"#;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;###::::::::::::::::::::::::#",
	"################################################################################################################",
	"################################################################################################################",
]
const SHOP_X := 87      # first open shop column
const FLOOR_ROW := 9

var thing
var worker: Node2D
var worker_torch: PointLight2D
var _worker_sprite: Sprite2D
var _t := 0.0
var _done := false
var ui


func _ready() -> void:
	AudioDirector.tension = 0.35
	GameState.reset_run()
	GameState.set_zone(4)
	var dark := CanvasModulate.new()
	dark.color = Color(0.30, 0.32, 0.42)
	add_child(dark)
	_build_map()
	ui = UI_SCENE.instantiate()
	add_child(FX_SCENE.instantiate())
	add_child(ui)
	ui.fade_rect.color.a = 1.0

	thing = THING_SCENE.instantiate()
	thing.set_script(PLAYABLE)
	thing.position = Vector2(6 * TILE, FLOOR_ROW * TILE)
	add_child(thing)
	var cam := Camera2D.new()
	cam.position = Vector2(60, -60)
	cam.limit_left = 0
	cam.limit_right = (SHOP_X - 3) * TILE
	cam.position_smoothing_enabled = true
	thing.add_child(cam)

	worker = _make_worker(Vector2(24 * TILE, FLOOR_ROW * TILE), true)
	GameState.player = worker       # the Thing's systems look for "the player": him now
	ui.fade_to(0.0, 2.5)
	await get_tree().create_timer(2.0).timeout
	Narrator.say("it_can_see_you_end")


func _make_worker(pos: Vector2, with_torch: bool) -> Node2D:
	var w := Node2D.new()
	w.position = pos
	w.z_index = 5
	var spr := Sprite2D.new()
	spr.texture = SHEET
	spr.hframes = 16
	spr.offset = Vector2(0, -24)
	w.add_child(spr)
	if with_torch:
		_worker_sprite = spr
		worker_torch = PointLight2D.new()
		worker_torch.texture = LightTextures.cone(120.0, 40.0, 0)
		worker_torch.color = Color(1.0, 0.9, 0.72)
		worker_torch.energy = 1.4
		worker_torch.range_item_cull_mask = GameState.LIGHT_ENV | GameState.LIGHT_CREATURES
		worker_torch.shadow_enabled = true
		worker_torch.position = Vector2(-7, -27)
		w.add_child(worker_torch)
	add_child(w)
	return w


func _process(delta: float) -> void:
	_t += delta
	if _done or worker == null:
		return
	# He runs from you, walking away while shining his torch back at you.
	var gap: float = worker.global_position.x - thing.global_position.x
	var speed := 70.0 if gap < 170.0 else 28.0
	worker.position.x = minf(worker.position.x + speed * delta, (SHOP_X - 6) * TILE)
	_worker_sprite.flip_h = false
	_worker_sprite.frame = 4 + int(_t * (12.0 if speed > 40.0 else 6.0)) % 6
	var to_you: Vector2 = thing.global_position + Vector2(0, -50) - (worker.global_position + Vector2(-7, -27))
	worker_torch.rotation = to_you.angle()
	if randf() < 0.01:
		worker_torch.energy = 0.2              # his hands are shaking
	else:
		worker_torch.energy = 1.4
	if gap < 26.0:
		_caught_him()


func _caught_him() -> void:
	_done = true
	ui.cut_to_black()
	AudioDirector.play_ui("caught", 0.0)
	await get_tree().create_timer(2.5).timeout
	_show_cctv()


## The last shot: the Act 0 CCTV feed. A new worker at the till. A leg in the vent.
func _show_cctv() -> void:
	var shop_floor := Vector2((SHOP_X + 12) * TILE, FLOOR_ROW * TILE)
	_make_worker(shop_floor + Vector2(40, 0), false)                 # at the till, oblivious
	var counter: Node2D = COUNTER_SCENE.instantiate()
	counter.position = shop_floor + Vector2(30, 0)
	add_child(counter)
	var shelf: Node2D = SHELF_SCENE.instantiate()
	shelf.position = shop_floor + Vector2(-90, 0)
	add_child(shelf)
	var vent: Node2D = VENT_SCENE.instantiate()
	vent.position = Vector2(shop_floor.x - 40, 2 * TILE)
	add_child(vent)
	var leg := Node2D.new()                                          # poking out of the vent
	leg.position = vent.position + Vector2(-3, 7)
	leg.draw.connect(func():
		leg.draw_line(Vector2(0, 0), Vector2(-3, 9), Color(0.30, 0.29, 0.28), 2.0)
		leg.draw_line(Vector2(-3, 9), Vector2(1, 18), Color(0.30, 0.29, 0.28), 1.0)
		leg.draw_line(Vector2(1, 18), Vector2(3, 17), Color(0.55, 0.53, 0.5), 1.0))
	add_child(leg)
	var light := PointLight2D.new()
	light.texture = LightTextures.radial(512)
	light.energy = 1.2
	light.color = Color(0.85, 1.0, 0.9)
	light.position = shop_floor + Vector2(0, -60)
	add_child(light)

	var vp := SubViewport.new()
	vp.size = Vector2i(320, 180)
	vp.world_2d = get_viewport().world_2d
	vp.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	var cam := Camera2D.new()
	cam.position = shop_floor + Vector2(-20, -54)
	cam.zoom = Vector2(5.0 / 3.0, 5.0 / 3.0)
	vp.add_child(cam)
	add_child(vp)
	var layer := CanvasLayer.new()
	layer.layer = 20
	var rect := TextureRect.new()
	rect.texture = vp.get_texture()
	rect.set_anchors_preset(Control.PRESET_FULL_RECT)
	rect.stretch_mode = TextureRect.STRETCH_SCALE
	rect.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	var mat := ShaderMaterial.new()
	mat.shader = CCTV_SHADER
	mat.set_shader_parameter("resolution", Vector2(320, 180))
	rect.material = mat
	layer.add_child(rect)
	var label := Label.new()
	label.text = "CAM1 SHOP FLOOR\n02:14"
	label.position = Vector2(8, 6)
	label.add_theme_font_size_override("font_size", 14)
	label.add_theme_color_override("font_color", Color(0.85, 0.95, 0.88, 0.8))
	layer.add_child(label)
	add_child(layer)
	await get_tree().create_timer(9.0).timeout
	ui.cut_to_black()
	layer.visible = false
	ui.show_card("night shift")
	await get_tree().create_timer(6.0).timeout
	Narrator.reset()
	get_tree().change_scene_to_file("res://scenes/main.tscn")


func _build_map() -> void:
	var ts := TileSetBuilder.build()
	var back := TileMapLayer.new()
	back.tile_set = ts
	back.z_index = -10
	var walls := TileMapLayer.new()
	walls.tile_set = ts
	add_child(back)
	add_child(walls)
	for y in MAP.size():
		var row: String = MAP[y]
		for x in row.length():
			var ch := row[x]
			var cell := Vector2i(x, y)
			if ch == "#":
				var t := TileSetBuilder.ROCK
				if _open(x, y - 1):
					t = TileSetBuilder.MATERIALS[_mat(x, y - 1)][0]
				elif _open(x, y + 1):
					t = TileSetBuilder.MATERIALS[_mat(x, y + 1)][1]
				elif _open(x - 1, y) or _open(x + 1, y):
					t = TileSetBuilder.MATERIALS[_mat(x - 1 if _open(x - 1, y) else x + 1, y)][2]
				walls.set_cell(cell, 0, Vector2i(t, 0))
			else:
				back.set_cell(cell, 0, Vector2i(_mat(x, y), 0))


func _open(x: int, y: int) -> bool:
	if y < 0 or y >= MAP.size():
		return false
	var row: String = MAP[y]
	return x >= 0 and x < row.length() and row[x] != "#"


func _mat(x: int, y: int) -> int:
	var row: String = MAP[y]
	return TileSetBuilder.WALL_SHOP if row[x] == ":" else TileSetBuilder.WALL_STONE
