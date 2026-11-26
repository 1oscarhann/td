class_name CCTVView
extends CanvasLayer
## Full-screen CCTV: four grainy black-and-white feeds. You can only look.
##
## Each live feed is a SubViewport that shares the game's World2D and has its
## own fixed Camera2D, so it shows the real shop (lights, darkness, you).
## The figure (CCTVFigure) is on visibility layer 2. The main viewport culls that
## layer, the feeds don't: he exists only on camera. Never in the shop.
##
## Feeds only render while the view is open.

signal closed(check_count: int)

const FEED_SIZE := Vector2i(192, 108)
const SHADER := preload("res://scenes/ui/cctv.gdshader")

var is_open := false
var check_count := 0

var _viewports: Array = []
var _root: Control
var _opened_at := 0.0
var _released := false


func _ready() -> void:
	add_to_group("cctv_view")
	layer = 15
	visible = false


## feeds: [{"label": String, "pos": Vector2, "zoom": float}] for live cameras, or
##        [{"label": String, "texture": Texture2D}] for a still picture.
func setup(feeds: Array) -> void:
	_root = Control.new()
	_root.set_anchors_preset(Control.PRESET_FULL_RECT)
	_root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_root)
	var bg := ColorRect.new()
	bg.color = Color(0, 0, 0, 1)
	bg.set_anchors_preset(Control.PRESET_FULL_RECT)
	bg.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_root.add_child(bg)
	var mat := ShaderMaterial.new()
	mat.shader = SHADER
	for i in mini(feeds.size(), 4):
		var feed: Dictionary = feeds[i]
		var rect := TextureRect.new()
		rect.position = Vector2((i % 2) * FEED_SIZE.x, (i / 2) * FEED_SIZE.y)
		rect.size = Vector2(FEED_SIZE) - Vector2(1, 1)   # 1 px black gutter
		rect.stretch_mode = TextureRect.STRETCH_SCALE
		rect.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		rect.material = mat
		rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
		if feed.has("texture"):
			rect.texture = feed.texture
		else:
			var vp := SubViewport.new()
			vp.size = FEED_SIZE
			vp.world_2d = get_viewport().world_2d
			vp.render_target_update_mode = SubViewport.UPDATE_DISABLED
			vp.canvas_item_default_texture_filter = Viewport.DEFAULT_CANVAS_ITEM_TEXTURE_FILTER_NEAREST
			var cam := Camera2D.new()
			cam.position = feed.pos
			cam.zoom = Vector2.ONE * float(feed.get("zoom", 1.0))
			vp.add_child(cam)
			add_child(vp)
			_viewports.append(vp)
			rect.texture = vp.get_texture()
		_root.add_child(rect)
		var label := Label.new()
		label.text = "%s\n02:%02d" % [feed.label, 14 + i * 3]
		label.position = rect.position + Vector2(4, 3)
		label.add_theme_font_size_override("font_size", 8)
		label.add_theme_color_override("font_color", Color(0.85, 0.95, 0.88, 0.8))
		label.mouse_filter = Control.MOUSE_FILTER_IGNORE
		_root.add_child(label)


func open() -> void:
	if is_open:
		return
	is_open = true
	check_count += 1
	for f in get_tree().get_nodes_in_group("cctv_figure"):
		f.on_check(check_count)
	for vp: SubViewport in _viewports:
		vp.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	visible = true
	_opened_at = Time.get_ticks_msec() / 1000.0
	_released = false
	if GameState.player != null:
		GameState.player.input_locked = true


func close() -> void:
	if not is_open:
		return
	is_open = false
	visible = false
	for vp: SubViewport in _viewports:
		vp.render_target_update_mode = SubViewport.UPDATE_DISABLED
	if GameState.player != null:
		GameState.player.input_locked = false
	closed.emit(check_count)


func _process(_delta: float) -> void:
	if not is_open:
		return
	# E opened it while held: wait for a release, then any press closes it.
	if not Input.is_action_pressed("interact"):
		_released = true
	if Time.get_ticks_msec() / 1000.0 - _opened_at < 0.4:
		return
	var wants_out := (_released and Input.is_action_just_pressed("interact")) \
			or Input.is_action_just_pressed("ui_cancel") \
			or Input.is_action_just_pressed("move_left") \
			or Input.is_action_just_pressed("move_right") \
			or Input.is_action_just_pressed("torch_toggle")
	if wants_out:
		close()
