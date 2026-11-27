extends Node2D
## The CCTV monitor, switched on, in a tunnel, showing the empty shop
## (design doc, zones 3-4). Its camera culls the CCTV man's layer, so the shop
## is empty: no one in it at all. Somehow that's worse.
## Root sits on the floor; the monitor stands on a crate.

const SHADER := preload("res://scenes/ui/cctv.gdshader")
const CCTV_TEX := preload("res://art/props/cctv.tres")
const BOX_TEX := preload("res://art/props/box.tres")

var shop_view_pos := Vector2.ZERO
var _vp: SubViewport
var _screen: Sprite2D


func _ready() -> void:
	_vp = SubViewport.new()
	_vp.size = Vector2i(96, 54)
	_vp.world_2d = get_viewport().world_2d
	_vp.canvas_cull_mask = 1          # never the figure (layer 2)
	_vp.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	var cam := Camera2D.new()
	cam.position = shop_view_pos
	cam.zoom = Vector2(0.6, 0.6)
	_vp.add_child(cam)
	add_child(_vp)
	var crate := Sprite2D.new()
	crate.texture = BOX_TEX
	crate.scale = Vector2(2, 2)
	crate.position = Vector2(0, -9)
	add_child(crate)
	var body := Sprite2D.new()
	body.texture = CCTV_TEX
	body.scale = Vector2(2, 2)
	body.position = Vector2(0, -29)
	add_child(body)
	_screen = Sprite2D.new()
	_screen.texture = _vp.get_texture()
	_screen.scale = Vector2(20.0 / 96.0, 10.0 / 54.0)
	_screen.position = Vector2(0, -31)
	var mat := ShaderMaterial.new()
	mat.shader = SHADER
	mat.set_shader_parameter("resolution", Vector2(96, 54))
	_screen.material = mat
	add_child(_screen)
	var glow := PointLight2D.new()
	glow.texture = LightTextures.radial(128)
	glow.color = Color(0.7, 0.85, 0.8)
	glow.energy = 0.5
	glow.range_item_cull_mask = GameState.LIGHT_ENV
	glow.position = Vector2(0, -30)
	add_child(glow)
	var hum := AudioStreamPlayer2D.new()
	hum.stream = AudioDirector.get_stream("hiss")
	hum.volume_db = -24.0
	hum.max_distance = 300.0
	hum.bus = AudioDirector.WORLD_BUS
	add_child(hum)
	hum.play()
