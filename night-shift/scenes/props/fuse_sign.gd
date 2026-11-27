extends Node2D
## The FUSE BOX sign. A cheap printed sign taped to the wall, always pointing deeper.
## `wrong` signs are older, handwritten, lowercase, and point somewhere they
## shouldn't (into walls, back the way you came). The fuse box is never reached.

@export var text := "FUSE BOX >"
@export var wrong := false
@export var font_size := 8


var _flick: PointLight2D


## False alarm (Pacing): a dead tube somewhere above sputters for a moment and
## the sign jumps out of the dark. Then nothing.
func flicker() -> void:
	if _flick != null:
		return
	_flick = PointLight2D.new()
	_flick.texture = LightTextures.radial(96)
	_flick.color = Color(0.85, 1.0, 0.92)
	_flick.range_item_cull_mask = GameState.LIGHT_ENV   # never reveals creatures
	_flick.energy = 0.0
	_flick.position = Vector2(0, -10)
	add_child(_flick)
	AudioDirector.play_at("crackle", global_position, -14.0, 0.1, 300.0)
	var seq := [0.9, 0.0, 0.0, 1.1, 0.0, 0.6, 0.0, 0.0, 0.0, 0.8, 0.0]
	for e: float in seq:
		_flick.energy = e
		await get_tree().create_timer(randf_range(0.04, 0.12)).timeout
	_flick.queue_free()
	_flick = null


func _ready() -> void:
	if wrong:
		text = text.to_lower()
		rotation = 0.07
	queue_redraw()


func _draw() -> void:
	var font := ThemeDB.fallback_font
	var w := font.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size).x + 5.0
	# Palette colours (tools/gen_tiles.py): pale paper, or old ochre for wrong signs.
	var paper := Color8(107, 90, 58) if wrong else Color8(180, 194, 184)
	draw_rect(Rect2(-w * 0.5, -6, w, 12), paper)
	# Tape at the top.
	draw_rect(Rect2(-4, -7, 8, 2), Color8(142, 161, 155, 190))
	var ink := Color8(19, 28, 32) if wrong else Color8(11, 16, 19)
	draw_string(font, Vector2(-w * 0.5 + 2.5, 3), text, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size, ink)
